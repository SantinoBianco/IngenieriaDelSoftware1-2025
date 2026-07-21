from collections import defaultdict
from random import shuffle
from typing import Any, Iterable

from sqlalchemy.orm import Session
from src.database import session

from src.modelos.secretos_modelo import Secreto
from src.modelos.jugador_modelo import Jugador


SECRETOS = [
    "Soy el asesino", "Enjoy", "Enjoy",
    "Enjoy", "Enjoy", "Enjoy",
    "Enjoy", "Enjoy", "Enjoy",
    "Enjoy", "Enjoy", "Enjoy",
    "Enjoy", "Enjoy", "Enjoy",
    "Enjoy", "Enjoy", "Enjoy",
]

class SecretoCRUD:
    def __init__(self, db: Session):
        self.db = db

    def crear_secretos(self, partida_id: str) -> None:
        descripcion = SECRETOS.copy()
        #shuffle(descripcion)
        secretos_list = []
        for descripcion in descripcion:
            secreto = Secreto(
                descripcion=descripcion,
                revelado=False,
                partida_id=partida_id,
                jugador_id=None,
            )
            secretos_list.append(secreto)
        try:
            self.db.add_all(secretos_list)
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise

    def repartir_secretos(self, partida_id: str, jugadores: Iterable[Any]) -> None:
        secretos = self.db.query(Secreto).filter(Secreto.partida_id == partida_id, Secreto.jugador_id == None).all()
        if len(secretos) < len(jugadores) * 3:
            raise ValueError("No hay suficientes secretos para repartir")
        shuffle(secretos)

        #? Seguro se puede hacer más eficiente, pero bueno

        # busco el secreto "Soy el asesino"
        asesino_secreto = next((s for s in secretos if s.descripcion == "Soy el asesino"), None)
        if asesino_secreto is None:
            raise ValueError('No se encontró el secreto "Soy el asesino"')

        # Se lo doy a un jugador aleatorio
        jugadores_list = list(jugadores)
        shuffle(jugadores_list)
        jugador_asesino = jugadores_list[0]
        asesino_secreto.jugador_id = jugador_asesino.jugador_id

        # Quitar el secreto y repartir el resto normalmente
        secretos.remove(asesino_secreto)
        i = 0
        for jugador in jugadores_list:
            secretos_a_repartir = 3
            # Si es el asesino -> le faltan 2
            if jugador.jugador_id == jugador_asesino.jugador_id:
                secretos_a_repartir = 2
            for _ in range(secretos_a_repartir):
                secretos[i].jugador_id = jugador.jugador_id
                i += 1
        try:
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise

    def obtener_secretos_por_jugador(self, partida_id: str) -> dict[str, Any]:
        secretos = (
            self.db.query(Secreto)
            .filter(
                Secreto.partida_id == partida_id,
                Secreto.jugador_id != None,
            )
            .all()
        )
        secretos_por_jugador = defaultdict(list)
        for secreto in secretos:
            secretos_por_jugador[secreto.jugador_id].append(secreto.to_dict())
        return {
            "partidaId": partida_id,
            "secretos": secretos_por_jugador,
        }
    
    def revelar_secreto(self, secreto_id: int) -> Secreto:
        secreto = self.db.query(Secreto).filter(Secreto.secreto_id == secreto_id).first()
        if not secreto:
            raise ValueError("No se encontró el secreto")
        if secreto.revelado:
            raise ValueError("El secreto ya está revelado")
        secreto.revelado = True
        try:
            self.db.flush()
            if secreto.jugador_id and secreto.partida_id:
                self._actualizar_desgracia_jugador(secreto.jugador_id, secreto.partida_id)

            self.db.commit()
        except Exception:
            self.db.rollback()
            raise
        return secreto
    
    def ocultar_secreto(self, secreto_id: int) -> Secreto:
        secreto = self.db.query(Secreto).filter(Secreto.secreto_id == secreto_id).first()
        if not secreto:
            raise ValueError("No se encontró el secreto")
        if not secreto.revelado:
            raise ValueError("El secreto ya está oculto")
        secreto.revelado = False
        try:
            self.db.flush()
            if secreto.jugador_id and secreto.partida_id:
                self._actualizar_desgracia_jugador(secreto.jugador_id, secreto.partida_id)
            
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise
        return secreto
    
    def robar_secreto(self, jugador_id: int, secreto_id: int) -> Secreto:
        secreto = self.db.query(Secreto).filter(Secreto.secreto_id == secreto_id).first()
        if not secreto:
            raise ValueError("No se encontró el secreto")
        if secreto.jugador_id == jugador_id:
            raise ValueError("El secreto ya pertenece a este jugador")
        secreto.jugador_id = jugador_id
        try:
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise
        return secreto
    
    def obtener_asesino(self, partida_id: str) -> Any:
        asesino_secreto = (
            self.db.query(Secreto)
            .filter(
                Secreto.partida_id == partida_id,
                Secreto.descripcion == "Soy el asesino",
            )
            .first()
        )
        if not asesino_secreto:
            raise ValueError('No se encontró el secreto "Soy el asesino"')
        return asesino_secreto.jugador_id
    
   #funciones adicionales 

    def obtener_secreto_por_id(self, secreto_id: int) -> Secreto | None:
        return self.db.query(Secreto).filter(Secreto.secreto_id == secreto_id).first()
    
    def _revelar_secreto_en_sesion(self, secreto_id: int) -> Secreto:
        secreto = self.obtener_secreto_por_id(secreto_id)
        if not secreto: 
            raise ValueError("No se encontró el secreto")
        if secreto.revelado: 
            raise ValueError("El secreto ya está revelado")
        secreto.revelado = True
        if secreto.jugador_id and secreto.partida_id:
                self._actualizar_desgracia_jugador(secreto.jugador_id, secreto.partida_id)
        return secreto

    def _ocultar_secreto_en_sesion(self, secreto_id: int) -> Secreto:
        secreto = self.obtener_secreto_por_id(secreto_id)
        if not secreto: 
            raise ValueError("No se encontró el secreto")
        if not secreto.revelado: 
            raise ValueError("El secreto ya está oculto")
        secreto.revelado = False
        if secreto.jugador_id and secreto.partida_id:
                self._actualizar_desgracia_jugador(secreto.jugador_id, secreto.partida_id)
        return secreto
    
    def _actualizar_desgracia_jugador(self, jugador_id: int, partida_id: str) -> None:
        
        # Obtener todos los secretos del jugador en la partida
        secretos = (
            self.db.query(Secreto)
            .filter(
                Secreto.partida_id == partida_id,
                Secreto.jugador_id == jugador_id,
            )
            .all()
        )
        # Todos deben estar revelados para estar en desgracia
        debe_estar_en_desgracia =  all(s.revelado for s in secretos)

        jugador = self.db.query(Jugador).filter(Jugador.jugador_id == jugador_id).first()
        if not jugador:
            return
        if jugador.en_desgracia != debe_estar_en_desgracia:
            jugador.en_desgracia = debe_estar_en_desgracia
        return secretos
    
    def and_then_there_was_one_more(self, secreto_id: int, nuevo_owner_id: int) -> Secreto:
        try:
            secreto = self.obtener_secreto_por_id(secreto_id)
            secreto.jugador_id = nuevo_owner_id
            secreto = self._ocultar_secreto_en_sesion(secreto_id)
            self.db.commit()
            return secreto
        except Exception as e:
            self.db.rollback()
            raise e
