from fastapi import APIRouter, status, HTTPException, Depends
from pydantic import BaseModel, ConfigDict
from typing import List
from sqlalchemy.orm import Session
from src.database import get_db

from src.websocket.simple_lobby import lobby_broadcast
from src.crud.set_crud import SetCRUD
from src.crud.partida_crud import PartidaCRUD
from src.crud.secreto_crud import SecretoCRUD

class PlayAndResolveSetRequest(BaseModel):

    jugador_id: int
    cartas_ids: List[int]
    nombre_set: str

    jugador_id_objetivo: int | None = None
    secreto_id_objetivo: int | None = None
    
    model_config = ConfigDict(from_attributes=True)

class AgregarCartaASetRequest(BaseModel):

    carta_id: int
    set_id: int
    owner_id: int  # Quien juega la carta

    jugador_id_objetivo: int | None = None
    secreto_id_objetivo: int | None = None

    model_config = ConfigDict(from_attributes=True)

router = APIRouter()

@router.post("/partidas/{partida_id}/jugar-y-resolver-set", status_code=status.HTTP_201_CREATED)
async def jugar_y_resolver_set(partida_id: str, payload: PlayAndResolveSetRequest, db: Session = Depends(get_db)):
    """
    Endpoint único que crea un set y resuelve su acción inmediatamente.
    """
    try:
        crud = SetCRUD(db)
        partida = PartidaCRUD(db)

        nuevo_set = crud.play_and_resolve_set_action(
            jugador_id=payload.jugador_id,
            cartas_ids=payload.cartas_ids,
            partida_id=partida_id,
            nombre_set=payload.nombre_set,
            jugador_id_objetivo=payload.jugador_id_objetivo,
            secreto_id_objetivo=payload.secreto_id_objetivo
        )
        
        partida_actualizada = PartidaCRUD(db).get_partida(partida_id)

        # Obtener el secreto después de aplicar el efecto del set
        secreto_actualizado = SecretoCRUD(db).obtener_secreto_por_id(payload.secreto_id_objetivo)
        
        if partida._verificar_fin_por_desgracia_social(partida_id):
            await lobby_broadcast("partida_finalizada_por_DS", {
                "partidaId": partida_id,
                "asesinoId": SecretoCRUD(db).obtener_asesino(partida_id)
            })
            return nuevo_set.to_dict()

        # Enviar evento del set jugado y resuelto (actualiza mano y sets)
        await lobby_broadcast("set_jugado_y_resuelto", {
            "partidaId": partida_id,
            "set": nuevo_set.to_dict()
        })

        # Si hay un secreto objetivo, manejar su estado; si no se encuentra, devolver error
        if secreto_actualizado:
            if secreto_actualizado.revelado:
                # El secreto fue revelado (sets normales)
                await lobby_broadcast("secreto_revelado", {
                    "partidaId": partida_id,
                    "secreto": secreto_actualizado.to_dict(),
                    "set": nuevo_set.to_dict()
                })
            else:
                # El secreto fue ocultado (Parker Pyne)
                await lobby_broadcast("secreto_ocultado", {
                    "partidaId": partida_id,
                    "secreto": secreto_actualizado.to_dict(),
                    "set": nuevo_set.to_dict()
                })
        else:
            raise HTTPException(status_code=400, detail=f"Secreto objetivo con id {payload.secreto_id_objetivo} no encontrado")
        
        await lobby_broadcast("estado_partida_actualizado", {
            "partida": partida_actualizada.to_dict()
        })
        
        return nuevo_set.to_dict()
        
    except ValueError as e:
        
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        
        raise HTTPException(status_code=500, detail=f"Error interno del servidor: {e}")
    
    
@router.post("/partidas/{partida_id}/agregar-carta-a-set", status_code=status.HTTP_200_OK)
async def agregar_carta_a_set_existente(partida_id: str, payload: AgregarCartaASetRequest, db: Session = Depends(get_db)):
    try:
        crud = SetCRUD(db)

        set_actualizado = crud.agregar_carta_a_set_existente_y_resolver(
            carta_id=payload.carta_id,
            set_id=payload.set_id,
            partida_id=partida_id,
            owner_id=payload.owner_id,
            jugador_id_objetivo=payload.jugador_id_objetivo,
            secreto_id_objetivo=payload.secreto_id_objetivo
        )

        partida_actualizada = PartidaCRUD(db).get_partida(partida_id)

        # Enviar evento del set actualizado
        await lobby_broadcast("carta_agregada_a_set", {
            "partidaId": partida_id,
            "set": set_actualizado.to_dict(),
            "jugadorQueJugo": payload.owner_id
        })

        if payload.secreto_id_objetivo is not None:
            secreto_actualizado = SecretoCRUD(db).obtener_secreto_por_id(payload.secreto_id_objetivo)

            if secreto_actualizado:
                if secreto_actualizado.revelado:
                    await lobby_broadcast("secreto_revelado", {
                        "partidaId": partida_id,
                        "secreto": secreto_actualizado.to_dict(),
                        "set": set_actualizado.to_dict()
                    })
                else:
                    await lobby_broadcast("secreto_ocultado", {
                        "partidaId": partida_id,
                        "secreto": secreto_actualizado.to_dict(),
                        "set": set_actualizado.to_dict()
                    })
            else:
                raise HTTPException(status_code=400, detail=f"Secreto objetivo con id {payload.secreto_id_objetivo} no encontrado")

        await lobby_broadcast("estado_partida_actualizado", {
            "partida": partida_actualizada.to_dict()
        })

        return set_actualizado.to_dict()

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error interno del servidor: {e}")
