from uuid import uuid4
from fastapi import APIRouter, status, Depends
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session 
from src.database import get_db

from src.websocket.simple_lobby import lobby_broadcast
from src.crud.jugador_crud import JugadorCRUD
from src.crud.partida_crud import PartidaCRUD
from src.modelos.jugador_modelo import Jugador

router = APIRouter()

class PlayerIn(BaseModel):
    username: str
    cumpleaños: str
    model_config=ConfigDict(from_attributes=True)

class PlayerOut(BaseModel):
    username: str
    cumpleaños: str
    jugador_id: int
    partida_id: str | None = None
    model_config=ConfigDict(from_attributes=True)

class UnirJugadorIn(BaseModel):
    nombreUsuario: str
    fechaNacimiento: str
    contraseña: str | None = None
    model_config = ConfigDict(from_attributes=True)

@router.post("/players/", response_model=PlayerOut, status_code=status.HTTP_201_CREATED)
async def crear_jugador(payload: PlayerIn, db: Session = Depends(get_db)):
    repo = JugadorCRUD(db)
    nuevo_jugador = repo.crear_jugador(
        username=payload.username, 
        cumpleaños=payload.cumpleaños
    )
    jugador_dict = nuevo_jugador.to_dict()

    await lobby_broadcast("jugador_creado", jugador_dict)
    return nuevo_jugador

@router.post("/partidas/{partida_id}/join", response_model=PlayerOut, status_code=status.HTTP_201_CREATED)
async def unir_jugador(partida_id: str, payload: UnirJugadorIn, db: Session = Depends(get_db)):
    repo = JugadorCRUD(db)
    nuevo_jugador = repo.crear_y_unir_jugador(
        username=payload.nombreUsuario,
        cumpleaños=payload.fechaNacimiento,
        partida_id=partida_id,
        contraseña=payload.contraseña
    )

    await lobby_broadcast(
        "jugador_unido",
        {
            "partidaId": partida_id,
            "jugador": {
                "id": nuevo_jugador.jugador_id,
                "nombre": nuevo_jugador.username
            }
        }
    )

    partida_crud = PartidaCRUD(db)
    partida = partida_crud.get_partida(partida_id)
    if partida:
        jugadores = repo.db.query(Jugador).filter(Jugador.partida_id == partida_id).all()
        players_payload = []
        for jugador in jugadores:
            player_info = {
                "id": jugador.jugador_id,
                "nombre": jugador.username,
                "isOwner": (jugador.jugador_id == partida.host),
            }
            players_payload.append(player_info)


        await lobby_broadcast(
            "estado_lobby",
            {
                "id": partida_id,
                "nombre": partida.nombre,
                "maxJugadores": partida.maxJugadores,
                "owner": partida.host,
                "players": players_payload
            }
        )
    # uno notifica la entrada específica y el otro sincroniza el estado completo por si algún cliente no tenía la info actualizada.
    return nuevo_jugador

@router.delete("/partidas/{partida_id}/jugadores/{jugador_id}", status_code=status.HTTP_204_NO_CONTENT)
async def eliminar_jugador_de_partida(partida_id: str, jugador_id: int, db: Session = Depends(get_db)):
    repo = JugadorCRUD(db)
    repo.eliminar_jugador_de_partida(jugador_id, partida_id)

    # Obtener información actualizada del lobby después de la eliminación
    partida_crud = PartidaCRUD(db)
    partida = partida_crud.get_partida(partida_id)
    
    if partida:
        jugadores_restantes = repo.db.query(Jugador).filter(Jugador.partida_id == partida_id).all()
        players_payload = [
            {
                "id": jugador.jugador_id,
                "nombre": jugador.username,
                "isOwner": jugador.jugador_id == partida.host
            }
            for jugador in jugadores_restantes
        ]

        # Enviar estado actualizado completo
        await lobby_broadcast(
            "estado_lobby",
            {
                "id": partida_id,
                "nombre": partida.nombre,
                "maxJugadores": partida.maxJugadores,
                "owner": partida.host,
                "players": players_payload
            }
        )

    # También enviar evento específico de jugador desconectado
    await lobby_broadcast(
        "jugador_desconectado",
        {
            "partidaId": partida_id,
            "jugadorId": jugador_id
        }
    )