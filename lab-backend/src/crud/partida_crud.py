from uuid import uuid4
from fastapi import HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import delete
from src.database import session
from src.modelos.partida_modelo import Partida
from src.modelos.jugador_modelo import Jugador
from src.modelos.carta_modelo import Carta
from src.modelos.secretos_modelo import Secreto
from src.modelos.set_modelo import Set, set_cartas_association_table
from typing import Optional

from src.crud.carta_crud import CartaCRUD
from src.crud.secreto_crud import SecretoCRUD

from typing import Optional
from passlib.context import CryptContext
from passlib.hash import pbkdf2_sha256
import hashlib


pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

def get_password_hash(password: str) -> str:
    
    if password is None:
        raise ValueError("Password no puede ser None")
    return pbkdf2_sha256.hash(password)


class PartidaCRUD:
    def __init__(self, db: Session):
        self.db = db 

    def crear_partida(self, nombre: str, maxJugadores: int, host: int, privada: bool = False, password: Optional[str] = None) -> Partida:
        
        if privada and not password:
            raise ValueError("La contraseña es obligatoria para partidas privadas")

        
        stored_password = get_password_hash(password) if privada else None

        nueva_partida = Partida(
            id=str(uuid4()),
            nombre=nombre,
            estado="lobby",
            maxJugadores=maxJugadores,
            host=host,
            cantidad_jugadores=0,
            privada=privada,
            contraseña=stored_password,
        )
        try:
            self.db.add(nueva_partida)
            self.db.commit()
            self.db.refresh(nueva_partida)
            CartaCRUD(self.db).crear_cartas_iniciales(nueva_partida.id)
            SecretoCRUD(self.db).crear_secretos(nueva_partida.id)
            return nueva_partida
        except Exception as e:
            self.db.rollback()
            raise e

    def listar_partidas(self) -> list[Partida]:
        return self.db.query(Partida).all()

    def get_partida(self, partida_id: str) -> Partida:
        return self.db.query(Partida).filter(Partida.id == partida_id).first()

    def iniciar_partida(self, partida_id: str, jugador_id: int) -> Partida:
        partida = self.get_partida(partida_id)
        if not partida:
            raise HTTPException(status_code=404, detail="Partida no encontrada")
        if partida.estado != "lobby":
            raise HTTPException(status_code=400, detail="La partida ya fue iniciada")
        
        try:
            jugadores = (
                self.db.query(Jugador)
                .filter(Jugador.partida_id == partida_id)
                .all()
            )

            secreto_crud = SecretoCRUD(self.db)
            secreto_crud.repartir_secretos(partida_id, jugadores)

            # para repartir cartas hacemos que cada jugador robe 5 cartas y luego debemos repartir 
            # un "Not so Fast..." a cada jugador
            carta_crud = CartaCRUD(self.db)
            for jugador in jugadores:
                try:
                    carta_crud.robar_cartas(partida_id, jugador.jugador_id, 5)
                    carta_crud.repartir_NotSoFast(partida_id, jugador.jugador_id, "Not so Fast...")
                except ValueError as exc:
                    raise HTTPException(status_code=400, detail=str(exc))

            partida.estado = "en_curso"
            # primer jugador como turno inicial 
            partida.turno_actual = jugadores[0].jugador_id if jugadores else None
            self.db.commit()
            self.db.refresh(partida)
            return partida
        except Exception:
            self.db.rollback()
            raise

    def siguiente_turno(self, partida_id: str) -> Partida:
        partida = self.get_partida(partida_id)
        if not partida:
            raise HTTPException(status_code=404, detail="Partida no encontrada")
        if partida.estado != "en_curso":
            raise HTTPException(status_code=400, detail="La partida no está en curso")

        jugadores = (
            self.db.query(Jugador)
            .filter(Jugador.partida_id == partida_id)
            .order_by(Jugador.jugador_id)
            .all()
        )
        if not jugadores:
            raise HTTPException(status_code=400, detail="No hay jugadores en la partida")

        jugador_ids = [jugador.jugador_id for jugador in jugadores]
        if partida.turno_actual not in jugador_ids:
            raise HTTPException(status_code=400, detail="Turno inválido")

        current_index = jugador_ids.index(partida.turno_actual) # indice del jugador actual
        next_index = (current_index + 1) % len(jugador_ids) # indice del siguiente jugador
        partida.turno_actual = jugador_ids[next_index] # actualizar turno actual

        try:
            self.db.commit()
            self.db.refresh(partida)
            return partida
        except Exception:
            self.db.rollback()
            raise

    # aqui se elimina la partida, las cartas y los jugadores asociados
    def eliminar_partida(self, partida_id: str):
        partida = self.get_partida(partida_id)
        if not partida:
            raise HTTPException(status_code=404, detail="Partida no encontrada")
        try:
            # Eliminar filas de asociación para los sets de esta partida
            self.db.execute(
                delete(set_cartas_association_table).where(
                    set_cartas_association_table.c.set_id.in_(
                        self.db.query(Set.set_id).filter_by(partida_id=partida_id)
                    )
                )
            )
            self.db.query(Set).filter_by(partida_id=partida_id).delete()
            self.db.query(Secreto).filter_by(partida_id=partida_id).delete()
            self.db.query(Carta).filter_by(partida_id=partida_id).delete()
            self.db.query(Jugador).filter_by(partida_id=partida_id).delete()
            self.db.delete(partida)
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise

    def _verificar_fin_por_desgracia_social(self, partida_id: str) -> bool:
        jugadores = (
            self.db.query(Jugador)
            .filter(Jugador.partida_id == partida_id)
            .all()
        )
        # si no hay jugadores en desgracia
        if not jugadores:
            return False

        asesino = SecretoCRUD(self.db).obtener_asesino(partida_id)

        # verificar si todos los jugadores excepto el asesino están en desgracia social
        # capaz está de mas chequear que no sea el asesino pero no viene mal
        for jugador in jugadores:
            if jugador.jugador_id != asesino and not jugador.en_desgracia:
                return False

        return True

    def __del__(self):
        self.db.close()