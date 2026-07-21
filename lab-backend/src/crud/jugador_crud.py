from fastapi import HTTPException
from sqlite3 import IntegrityError
from uuid import uuid4
from sqlalchemy.orm import Session
from src.modelos.jugador_modelo import Jugador
from src.modelos.partida_modelo import Partida
from src.database import session
from passlib.hash import pbkdf2_sha256

#operaciones base de datos jugador
class JugadorCRUD:
    def __init__(self, db: Session):
        self.db = db

    def crear_jugador(self, username: str, cumpleaños: str) -> Jugador:
        nuevo_jugador = Jugador(
            username=username,
            cumpleaños=cumpleaños
        )
        try:
            self.db.add(nuevo_jugador)
            self.db.commit()
            self.db.refresh(nuevo_jugador)
            return nuevo_jugador
        except Exception as e:
            self.db.rollback()
            raise e

    def obtener_jugador(self, jugador_id: int) -> Jugador:
        try:
            jugador = self.db.get(Jugador, jugador_id)
            if not jugador:
                raise HTTPException(status_code=404, detail="Player not found.")
            return jugador
        except Exception as e:
            self.db.rollback()
            raise e
        
    
    def crear_y_unir_jugador(self, username: str, cumpleaños: str, partida_id: str, contraseña: str | None = None) -> Jugador:
        
        partida = self.db.get(Partida, partida_id)
        if not partida:
            raise HTTPException(status_code=404, detail="Partida no encontrada")

        if partida.privada:
            if not contraseña:
                raise HTTPException(status_code=400, detail="Se requiere contraseña para unirse a esta partida privada.")
            if not pbkdf2_sha256.verify(contraseña, partida.contraseña):
                raise HTTPException(status_code=403, detail="Contraseña incorrecta para la partida privada.")

        nuevo_jugador = Jugador(
            username=username,
            cumpleaños=cumpleaños,
            partida_id=partida_id
        )
        try:
            self.db.add(nuevo_jugador)
            partida.cantidad_jugadores += 1
            self.db.commit()
            self.db.refresh(nuevo_jugador)

            return nuevo_jugador
        
        except Exception as e:
            self.db.rollback()
            raise e

    def eliminar_jugador_de_partida(self, jugador_id: int, partida_id: str):
        jugador = self.db.get(Jugador, jugador_id)
        if not jugador or jugador.partida_id != partida_id:
            raise HTTPException(status_code=404, detail="Jugador no encontrado en la partida especificada.")
        try:
            partida = self.db.get(Partida, partida_id)
            if partida and partida.cantidad_jugadores > 0:
                partida.cantidad_jugadores -= 1
            self.db.delete(jugador)
            self.db.commit()
        except Exception as e:
            self.db.rollback()
            raise e