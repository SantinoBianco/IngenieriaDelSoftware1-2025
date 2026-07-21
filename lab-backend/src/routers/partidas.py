from datetime import date
from uuid import uuid4
from fastapi import APIRouter, status, HTTPException, Depends
from typing import Any, Optional
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session
from src.database import get_db

from src.websocket.simple_lobby import lobby_broadcast
from src.crud.partida_crud import PartidaCRUD
from src.crud.jugador_crud import JugadorCRUD
from src.crud.carta_crud import CartaCRUD
from src.crud.secreto_crud import SecretoCRUD
from src.crud.set_crud import SetCRUD

from src.modelos.jugador_modelo import Jugador
from src.modelos.carta_modelo import Carta
from src.modelos.secretos_modelo import Secreto
from src.modelos.set_modelo import Set

router = APIRouter()

# Manejo partida
class PartidaCreate(BaseModel):
    nombre: str
    maxJugadores: int
    nombreUsuario: str
    fechaNacimiento: str #? date
    privada: bool = False
    password: Optional[str] = None

    model_config=ConfigDict(from_attributes=True)

class PartidaPublic(BaseModel):
    id: str
    nombre: str
    cantidad_jugadores: int
    maxJugadores: int
    host: int | None = None
    estado: str
    turno_actual: int | None = None
    privada: bool

    model_config=ConfigDict(from_attributes=True)

class PartidaStartIn(BaseModel):
    jugadorId: int
    model_config = ConfigDict(from_attributes=True)

# Manejo cartas
class CartaPublic(BaseModel):
    carta_id: int
    nombre: str
    ubicacion: str
    orden: int | None = None
    partida_id: str
    jugador_id: int | None

    model_config = ConfigDict(from_attributes=True)

class RobarCartasIn(BaseModel):
    jugadorId: int
    cantidad: int

class DescartarCartasIn(BaseModel):
    jugadorId: int # agg jugador id para saber que jugador actua
    cartasIds: list[int]

class DraftPickIn(BaseModel):
    cartaId: int
    jugadorId: int

# Evento Cards Of The Table
class JugarCardsOffTableIn(BaseModel):
    jugadorId: int
    cartaEventoId: int
    jugadorObjetivoId: int

    model_config = ConfigDict(from_attributes=True)

# Evento Early Train to Paddington
class EarlyTrainIn(BaseModel):
    jugadorId: int
    cartaEventoId: int
    model_config = ConfigDict(from_attributes=True)
# Evento Delay The Murder Escape
class DelayTheMurdererIn(BaseModel):
    jugadorId: int
    cartaEventoId: int

    model_config = ConfigDict(from_attributes=True)
    
  # Evento Card Trade
class CardTradeIn(BaseModel):
    jugadorId: int
    cartaEventoId: int
    jugadorObjetivoId: int
    cartaOfrecidaId: int
    cartaElegidaId: int
    secretosARevelarIds: list[int] | None = None
    model_config = ConfigDict(from_attributes=True)


class CardTradeSocialFauxRevealIn(BaseModel):
    jugadorId: int
    secretoId: int

    model_config = ConfigDict(from_attributes=True)  
    
class LookIntoTheAshesIn(BaseModel):
    jugadorId: int
    cartaEventoId: int
    cartaSeleccionadaId: int

    model_config = ConfigDict(from_attributes=True)

class RobarSetRequest(BaseModel):
    jugador_ladron_id: int
    jugador_objetivo_id: int  
    set_id: int
    evento_id: int
    model_config = ConfigDict(from_attributes=True)

class OneMoreIn(BaseModel):
    jugadorId: int
    cartaEventoId: int
    # secreto a ocultar, nuevo owner
    secretoRevelado: int
    nuevoOwner: int

class ActivarPYS(BaseModel):
    jugadorId: int
    cartaEventoId: int

class PointYourSuspicionIn(BaseModel):
    targetId: int
    secretoId: int

class RandomDiscardIn(BaseModel):
    jugadorId: int

      # Evento Dead Card Folly
class SocialFauxRevealIn(BaseModel):
    jugadorId: int
    secretoId: int

    model_config = ConfigDict(from_attributes=True)

# Evento Dead Card Folly
class DeadCardFollyIn(BaseModel):
    jugadorId: int
    cartaEventoId: int
    direccion: str  # "derecha" | "izquierda"
    selecciones: dict[int, int]  # { jugadorId: cartaId }
    model_config = ConfigDict(from_attributes=True)

class NotSoFastIn(BaseModel):
    jugadorId: int
    cartaEventoId: int
    eventoaCancelarId: int | None = None
    cartasSetId: list[int] | None = None

    model_config = ConfigDict(from_attributes=True)

      
@router.post("/partidas", response_model=PartidaPublic, status_code=status.HTTP_201_CREATED)
async def crear_partida(payload: PartidaCreate, db: Session = Depends(get_db)):

    if payload.privada and not payload.password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La contraseña es obligatoria para partidas privadas",
        )
    
    # creo jugador
    jugador_crud = JugadorCRUD(db)
    nuevo_jugador = jugador_crud.crear_jugador(
        username=payload.nombreUsuario,
        cumpleaños=payload.fechaNacimiento
    )
    jugador = jugador_crud.obtener_jugador(nuevo_jugador.jugador_id)

    # creo partida y le asigno el host
    partida_crud = PartidaCRUD(db)
    nueva_partida = partida_crud.crear_partida(
        nombre=payload.nombre,
        maxJugadores=payload.maxJugadores,
        host=jugador.jugador_id,
        privada=payload.privada,
        password=payload.password
    )

    # Asignar la partida al jugador
    jugador.partida_id = nueva_partida.id
    nueva_partida.cantidad_jugadores += 1

    jugador_crud.db.commit()
    partida_crud.db.commit()

    partida_dict = nueva_partida.to_dict()

    # Notificamos a TODOS
    await lobby_broadcast("partida_creada", partida_dict)
    return nueva_partida

@router.get("/partidas", response_model=list[PartidaPublic])
def listar_partidas(db: Session = Depends(get_db)):
    crud = PartidaCRUD(db)
    return crud.listar_partidas()

@router.post("/partidas/{partida_id}/start", response_model=PartidaPublic)
async def iniciar_partida(partida_id: str, payload: PartidaStartIn, db: Session = Depends(get_db)):
    partida_crud = PartidaCRUD(db)
    partida = partida_crud.iniciar_partida(partida_id, payload.jugadorId)

    jugador_crud = JugadorCRUD(db)
    jugadores = (jugador_crud.db.query(Jugador).filter(Jugador.partida_id == partida_id).all())
    
    # PRIMERO enviar el estado del lobby y juego iniciado
    players_payload = []
    for jugador in jugadores:
        player_info = {
            "id": jugador.jugador_id,
            "nombre": jugador.username,
            "isOwner": jugador.jugador_id == partida.host
        }
        players_payload.append(player_info)

    await lobby_broadcast(
        "estado_lobby",
        {
            "id": partida.id,
            "nombre": partida.nombre,
            "maxJugadores": partida.maxJugadores,
            "owner": partida.host,
            "estado": partida.estado,
            "players": players_payload,
            "turno_actual": partida.turno_actual
        }
    )
    await lobby_broadcast(
        "juego_iniciado",
        {
            "partidaId": partida.id,
            "nombre": partida.nombre,
            "owner": partida.host
        }
    )

    # ESPERAR un momento para asegurar que todos los clientes estén listos
    import asyncio
    await asyncio.sleep(1)

    # LUEGO repartir y enviar cartas y secretos
    cartas_crud = CartaCRUD(db)
    manos = cartas_crud.obtener_cartas_por_jugador(partida.id)
    await lobby_broadcast("cartas_repartidas", manos)

    estado_mazos = cartas_crud.obtener_estado_mazos(partida.id)
    await lobby_broadcast("estado_mazos", estado_mazos)
    
    secretos_crud = SecretoCRUD(db)
    secretos = secretos_crud.obtener_secretos_por_jugador(partida.id)
    
    await lobby_broadcast("secretos_repartidos", secretos)

    await lobby_broadcast("partida_actualizada", partida.to_dict())
    return partida

@router.post("/partidas/{partida_id}/cartas/robar", response_model=list[CartaPublic])
async def robar_cartas(partida_id: str, payload: RobarCartasIn, db: Session = Depends(get_db)):
    partida_crud = PartidaCRUD(db)
    partida = partida_crud.get_partida(partida_id)

    if not partida:
        raise HTTPException(status_code=404, detail="Partida no encontrada")
    if partida.turno_actual != payload.jugadorId:
        raise HTTPException(status_code=403, detail="No es tu turno") 

    cartas_crud = CartaCRUD(db)
    try:
        cartas = cartas_crud.robar_cartas(partida_id, payload.jugadorId, payload.cantidad)
    except ValueError as exc:
        if str(exc) == "El mazo no tiene cartas suficientes":
            # devolver partida finalizada y jugador con el secreto de asesino
            partida.estado = "finalizada"
            secreto_crud = SecretoCRUD(db)
            asesino = secreto_crud.obtener_asesino(partida_id)
            await lobby_broadcast("partida_finalizada", {
                "partidaId": partida_id,
                "motivo": "mazo_agotado",
                "asesino": asesino
            })
            raise HTTPException(
                status_code=410,
                detail="La partida terminó porque no quedan cartas en el mazo",
            )
        raise HTTPException(status_code=400, detail=str(exc))

    await lobby_broadcast("cartas_robadas", {
        "partidaId": partida_id,
        "jugadorId": payload.jugadorId,
        "cartas": [c.to_dict() for c in cartas],
    })
    await lobby_broadcast("estado_mazos", cartas_crud.obtener_estado_mazos(partida_id))
    return cartas

@router.post("/partidas/{partida_id}/cartas/descarte", response_model=list[CartaPublic])
async def descartar_cartas(partida_id: str, payload: DescartarCartasIn, db: Session = Depends(get_db)):
    partida_crud = PartidaCRUD(db)
    partida = partida_crud.get_partida(partida_id)
    if not partida:
        raise HTTPException(status_code=404, detail="Partida no encontrada")
    if partida.turno_actual != payload.jugadorId:
        raise HTTPException(status_code=403, detail="No es tu turno") 

    cartas_crud = CartaCRUD(db)
    try:
        cartas = cartas_crud.descartar_cartas(payload.cartasIds, payload.jugadorId)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    await lobby_broadcast("cartas_descartadas", {
        "partidaId": partida_id,
        "cartas": [c.to_dict() for c in cartas],
    })
    await lobby_broadcast("estado_mazos", cartas_crud.obtener_estado_mazos(partida_id))
    return cartas

@router.put("/partidas/{partida_id}/siguiente_turno", response_model=PartidaPublic)
async def siguiente_turno(partida_id: str, db: Session = Depends(get_db)):
    partida_crud = PartidaCRUD(db)
    try:
        partida = partida_crud.siguiente_turno(partida_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    await lobby_broadcast(
        "turno_cambiado", 
        {
            "partida_id": partida.id,
            "turno_actual": partida.turno_actual
        }
    )
    return partida

@router.get("/partidas/{partida_id}/cartas/estado")
def obtener_estado_cartas(partida_id: str, db: Session = Depends(get_db)):
    cartas_crud = CartaCRUD(db)
    manos = cartas_crud.obtener_cartas_por_jugador(partida_id)
    mazos = cartas_crud.obtener_estado_mazos(partida_id)

    # El draft y los mazos pueden tardar en propagarse por WebSocket; exponemos aquí el estado para consultas HTTP.
    combined = {**manos}
    for clave, valor in mazos.items():
        if clave == "partidaId":
            continue
        combined[clave] = valor
    return combined

@router.get("/partidas/{partida_id}/secretos")
def obtener_secretos(partida_id: str, db: Session = Depends(get_db)):
    secretos_crud = SecretoCRUD(db)
    return secretos_crud.obtener_secretos_por_jugador(partida_id)

@router.delete("/partidas/{partida_id}", status_code=status.HTTP_204_NO_CONTENT)
async def eliminar_partida(partida_id: str, db: Session = Depends(get_db)):
    partida_CRUD = PartidaCRUD(db)
    partida = partida_CRUD.get_partida(partida_id)
    
    if not partida:
        raise HTTPException(status_code=404, detail="Partida no encontrada")
    partida_CRUD.eliminar_partida(partida_id)
    await lobby_broadcast("partida_eliminada", {"partidaId": partida_id})
    return None

@router.post("/partidas/{partida_id}/draft/pick", response_model=CartaPublic)
async def tomar_carta_draft(partida_id: str, payload: DraftPickIn, db: Session = Depends(get_db)):
    cartas_crud = CartaCRUD(db)
    try:
        carta = cartas_crud.tomar_carta_draft(
            partida_id,
            payload.cartaId,
            payload.jugadorId,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    await lobby_broadcast("draft_actualizado",
        cartas_crud.obtener_estado_mazos(partida_id) | {
            "partidaId": partida_id,
        })
    return carta

# visualizar primeras 5 cartas del mazo de descarte
@router.get("/partidas/{partida_id}/mazo/descarte/ver", response_model=list[CartaPublic])
async def ver_mazo_descarte(partida_id: str, db: Session = Depends(get_db)):
    cartas_crud = CartaCRUD(db)
    primeras_descarte = cartas_crud.ver_mazo_descarte(partida_id)
    await lobby_broadcast("mazo_descarte_visto", {
        "partidaId": partida_id,
        "cartas": [c.to_dict() for c in primeras_descarte],
    })
    return primeras_descarte

# EVENTOS

@router.post("/partidas/{partida_id}/eventos/cards-off-the-table",response_model=list[CartaPublic],)
async def jugar_cards_off_the_table(
    partida_id: str,
    payload: JugarCardsOffTableIn,
    db: Session = Depends(get_db),
):
    partida_crud = PartidaCRUD(db)
    partida = partida_crud.get_partida(partida_id)
    if not partida:
        raise HTTPException(status_code=404, detail="Partida no encontrada")
    if partida.turno_actual != payload.jugadorId:
        raise HTTPException(status_code=403, detail="No es tu turno")

    cartas_crud = CartaCRUD(db)
    try:
        descartadas = cartas_crud.jugar_cards_off_the_table(
            partida_id=partida_id,
            jugador_evento_id=payload.jugadorId,
            carta_evento_id=payload.cartaEventoId,
            jugador_objetivo_id=payload.jugadorObjetivoId,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    cartas_descartadas = [carta.to_dict() for carta in descartadas]

    await lobby_broadcast("cartas_descartadas", {
        "partidaId": partida_id,
        "cartas": cartas_descartadas,
    })
    await lobby_broadcast("estado_mazos", cartas_crud.obtener_estado_mazos(partida_id))
    await lobby_broadcast("evento_jugado", {
        "partidaId": partida_id,
        "nombre": "Cards off the table",
        "jugadorId": payload.jugadorId,
        "jugadorObjetivoId": payload.jugadorObjetivoId,
    })

    return descartadas
@router.post("/partidas/{partida_id}/eventos/delay-the-murderer",response_model=dict[str, Any],)
async def jugar_delay_the_murderer(
    partida_id: str,
    payload: DelayTheMurdererIn,
    db: Session = Depends(get_db),
):
    partida_crud = PartidaCRUD(db)
    partida = partida_crud.get_partida(partida_id)
    
    if not partida:
        raise HTTPException(status_code=404, detail="Partida no encontrada")
    if partida.turno_actual != payload.jugadorId:
        raise HTTPException(status_code=403, detail="No es tu turno")

    cartas_crud = CartaCRUD(db)
    
    try:
        cartas_movidas, estado = cartas_crud.jugar_delay_the_murderer(
            partida_id=partida_id,
            jugador_evento_id=payload.jugadorId,
            carta_evento_id=payload.cartaEventoId,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    cartas_movidas_payload = [carta.to_dict() for carta in cartas_movidas]

    await lobby_broadcast("mazo_reordenado", {
        "partidaId": partida_id,
        "cartasMovidas": cartas_movidas_payload,
    })
    await lobby_broadcast("estado_mazos", estado)
    await lobby_broadcast("evento_jugado", {
        "partidaId": partida_id,
        "nombre": "Delay the Murderer scape",
        "jugadorId": payload.jugadorId,
        "cartasMovidas": cartas_movidas_payload,
    })

    return estado

# Endpoints para evento robar set
# Obtiene todos los sets de una partida organizados por jugador.   
@router.get("/partidas/{partida_id}/sets") 
async def obtener_sets_partida(partida_id: str, db: Session = Depends(get_db)):
    try:
        crud = SetCRUD(db)
        return crud.obtener_sets_organizados_por_jugador(partida_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener sets: {str(e)}")

@router.post("/partidas/{partida_id}/eventos/another-victim")
async def robar_set(partida_id: str, request: RobarSetRequest, db: Session = Depends(get_db)):
    try:
        # Validar que la partida existe
        partida_crud = PartidaCRUD(db)
        partida = partida_crud.get_partida(partida_id)
        if not partida:
            raise HTTPException(status_code=404, detail="Partida no encontrada")
        
        # Validar que es el turno del jugador ladrón
        if partida.turno_actual != request.jugador_ladron_id:
            raise HTTPException(status_code=403, detail="No es tu turno")
        
        if request.jugador_ladron_id == request.jugador_objetivo_id:
            raise HTTPException(status_code=400, detail="No puedes robarte un set a ti mismo")
        
        # Validar jugadores
        jugador_crud = JugadorCRUD(db)
        jugador_ladron = jugador_crud.obtener_jugador(request.jugador_ladron_id)
        jugador_objetivo = jugador_crud.obtener_jugador(request.jugador_objetivo_id)
        
        # Validar que el set existe y pertenece al jugador objetivo
        set_crud = SetCRUD(db)
        set_a_robar = set_crud.obtener_set(request.set_id)
        if not set_a_robar or set_a_robar.owner_id != request.jugador_objetivo_id:
            raise HTTPException(status_code=400, detail="Set no válido para robar")
        
        # Transferir el set
        set_robado = set_crud.cambiar_owner_set(request.set_id, request.jugador_ladron_id)
        
        # Descartar la carta evento
        carta_crud = CartaCRUD(db)
        cartas_descartadas = carta_crud.descartar_cartas([request.evento_id], request.jugador_ladron_id)
        
        # Preparar datos para respuesta
        resultado = {
            "set_robado": {
                "set_id": set_robado.set_id,
                "nombre": set_robado.nombre
            },
            "jugador_ladron": request.jugador_ladron_id,
            "jugador_objetivo": request.jugador_objetivo_id,
            "mensaje": f"'{set_robado.nombre}' robado exitosamente"
        }
        
        # Notificar via WebSocket - evento principal
        await lobby_broadcast("another_victim_jugado", {
            "partidaId": partida_id,
            "jugadorLadronId": request.jugador_ladron_id,
            "jugadorObjetivoId": request.jugador_objetivo_id,
            "setRobado": {
                "set_id": set_robado.set_id,
                "nombre": set_robado.nombre
            }
        })
        
        # Notificar cartas descartadas
        await lobby_broadcast("cartas_descartadas", {
            "partidaId": partida_id,
            "cartas": [carta.to_dict() for carta in cartas_descartadas]
        })
        
        # Notificar estado actualizado de mazos
        await lobby_broadcast("estado_mazos", carta_crud.obtener_estado_mazos(partida_id))
        
        # Notificar cartas en mano actualizadas
        await lobby_broadcast("cartas_en_mano", carta_crud.obtener_cartas_por_jugador(partida_id))
        
        # Notificar sets actualizados
        await lobby_broadcast("sets_actualizados", {
            "partidaId": partida_id,
            "sets": set_crud.obtener_sets_organizados_por_jugador(partida_id)
        })
        
        return resultado
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al robar set: {str(e)}")

# evento: And then there was one more
@router.post("/partidas/{partida_id}/eventos/and-then-there-was-one-more")
async def jugar_and_then_there_was_one_more(partida_id: str, payload: OneMoreIn, db: Session = Depends(get_db)):
    try:
        # Validar que la partida existe
        partida_crud = PartidaCRUD(db)
        partida = partida_crud.get_partida(partida_id)
        if not partida:
            raise HTTPException(status_code=404, detail="Partida no encontrada")
        
        # Validar que es el turno del jugador
        if partida.turno_actual != payload.jugadorId:
            raise HTTPException(status_code=403, detail="No es tu turno")
        
        # Lógica para revelar el secreto y cambiar su dueño
        secreto_crud = SecretoCRUD(db)
        secreto = secreto_crud.obtener_secreto_por_id(payload.secretoRevelado)
        if not secreto or secreto.revelado != True:
            raise HTTPException(status_code=400, detail="Secreto no válido para revelar")
        
        # Ocultar el secreto y cambiar dueño
        secreto_ocultado = secreto_crud.and_then_there_was_one_more(
            secreto_id=payload.secretoRevelado,
            nuevo_owner_id=payload.nuevoOwner
        )
        
        # Descartar la carta evento
        carta_crud = CartaCRUD(db)
        cartas_descartadas = carta_crud.descartar_cartas([payload.cartaEventoId], payload.jugadorId)
        
        # Notificar via WebSocket
        await lobby_broadcast("and_then_there_was_one_more_jugado", {
            "partidaId": partida_id,
            "jugadorId": payload.jugadorId,
            "secretoRevelado": secreto_ocultado.to_dict(),
            "nuevoOwner": payload.nuevoOwner
        })
        
        await lobby_broadcast("cartas_descartadas", {
            "partidaId": partida_id,
            "cartas": [carta.to_dict() for carta in cartas_descartadas]
        })
        
        return secreto
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al jugar el evento: {str(e)}")
       
@router.post("/partidas/{partida_id}/eventos/early-train",response_model=dict[str, Any],)
async def jugar_early_train_to_paddington(
    partida_id: str,
    payload: EarlyTrainIn,
    db: Session = Depends(get_db),
):
    partida_crud = PartidaCRUD(db)
    partida = partida_crud.get_partida(partida_id)

    if not partida:
        raise HTTPException(status_code=404, detail="Partida no encontrada")
    if partida.turno_actual != payload.jugadorId:
        raise HTTPException(status_code=403, detail="No es tu turno")

    cartas_crud = CartaCRUD(db)

    try:
        cartas_movidas, estado = cartas_crud.jugar_early_train_to_paddington(
            partida_id=partida_id,
            jugador_evento_id=payload.jugadorId,
            carta_evento_id=payload.cartaEventoId,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    cartas_movidas_payload = [carta.to_dict() for carta in cartas_movidas]

    await lobby_broadcast("mazo_reordenado", {
        "partidaId": partida_id,
        "cartasMovidas": cartas_movidas_payload,
    })
    await lobby_broadcast("estado_mazos", estado)
    await lobby_broadcast("evento_jugado", {
        "partidaId": partida_id,
        "nombre": "Early train to paddington",
        "jugadorId": payload.jugadorId,
        "cartasMovidas": cartas_movidas_payload,
    })

    return estado
  
  # endpoint de "Look into the Ashes"
@router.post("/partidas/{partida_id}/eventos/look-into-the-ashes", response_model=CartaPublic)
async def look_into_the_ashes(partida_id: str, payload: LookIntoTheAshesIn, db: Session = Depends(get_db)):
    partida_crud = PartidaCRUD(db)
    partida = partida_crud.get_partida(partida_id)
    if not partida:
        raise HTTPException(status_code=404, detail="Partida no encontrada")
    if partida.turno_actual != payload.jugadorId:
        raise HTTPException(status_code=403, detail="No es tu turno")

    cartas_crud = CartaCRUD(db)
    carta_robada = cartas_crud.look_into_the_ashes(partida_id, payload.jugadorId, payload.cartaSeleccionadaId)
    
    await lobby_broadcast("evento_jugado", {
        "partidaId": partida_id,
        "nombre": "Look into the Ashes",
        "jugadorId": payload.jugadorId,
        "cartaRobada": carta_robada.to_dict(),
    })
    
    await lobby_broadcast("estado_mazos", cartas_crud.obtener_estado_mazos(partida_id))

    return carta_robada

@router.post("/partidas/{partida_id}/eventos/point-your-suspicion/activar", response_model=dict[str, Any])
async def activar_point_your_suspicion(partida_id: str, payload: ActivarPYS, db: Session = Depends(get_db)):
    partida_crud = PartidaCRUD(db)
    partida = partida_crud.get_partida(partida_id)
    if not partida:
        raise HTTPException(status_code=404, detail="Partida no encontrada")
    if partida.turno_actual != payload.jugadorId:
        raise HTTPException(status_code=403, detail="No es tu turno")

    # descartar carta y luego notificar
    cartas_crud = CartaCRUD(db)
    try:
        cartas_descartadas = cartas_crud.descartar_cartas([payload.cartaEventoId], payload.jugadorId)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    await lobby_broadcast("cartas_descartadas", {
            "partidaId": partida_id,
            "cartas": [carta.to_dict() for carta in cartas_descartadas]
        })

    await lobby_broadcast("estado_mazos", cartas_crud.obtener_estado_mazos(partida_id))

    await lobby_broadcast("point_suspicions_started", {
        "partidaId": partida_id,
        "jugadorId": payload.jugadorId,
    })

    return {"mensaje": "Point Your Suspicion activado exitosamente"}

@router.post("/partidas/{partida_id}/eventos/point-your-suspicion", response_model=dict[str, Any])
async def point_your_suspicion(partida_id: str, payload: PointYourSuspicionIn, db: Session = Depends(get_db)):
    partida_crud = PartidaCRUD(db)
    partida = partida_crud.get_partida(partida_id)
    if not partida:
        raise HTTPException(status_code=404, detail="Partida no encontrada")
    
    # revelar secreto del target y notificar
    secreto_crud = SecretoCRUD(db)
    try:
        secreto_revelado = secreto_crud.revelar_secreto(secreto_id=payload.secretoId)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    
    await lobby_broadcast("secreto_revelado", {
        "partidaId": partida_id,
        "secreto": secreto_revelado.to_dict(),
    })

    return secreto_revelado.to_dict()

# endpoint para descarte aleatorio de una carta
@router.post("/partidas/{partida_id}/cartas/random-discard", response_model=CartaPublic)
async def random_discard(partida_id: str, payload: RandomDiscardIn, db: Session = Depends(get_db)):
    partida_crud = PartidaCRUD(db)
    partida = partida_crud.get_partida(partida_id)
    if not partida:
        raise HTTPException(status_code=404, detail="Partida no encontrada")
    if partida.turno_actual != payload.jugadorId:
        raise HTTPException(status_code=403, detail="No es tu turno")

    cartas_crud = CartaCRUD(db)
    carta_descartada = cartas_crud.descartar_carta_aleatoria(partida_id, payload.jugadorId)

    await lobby_broadcast("cartas_descartadas", {
            "partidaId": partida_id,
            "cartaDescartada": carta_descartada.to_dict(),
        })

    await lobby_broadcast("estado_mazos", cartas_crud.obtener_estado_mazos(partida_id))

    return carta_descartada
  
  # Evento Card Trade
@router.post("/partidas/{partida_id}/eventos/card-trade", response_model=dict[str, Any])
async def jugar_card_trade(
    partida_id: str,
    payload: CardTradeIn,
    db: Session = Depends(get_db),
):
    partida_crud = PartidaCRUD(db)
    partida = partida_crud.get_partida(partida_id)
    if not partida:
        raise HTTPException(status_code=404, detail="Partida no encontrada")
    if partida.turno_actual != payload.jugadorId:
        raise HTTPException(status_code=403, detail="No es tu turno")

    cartas_crud = CartaCRUD(db)
   
    try:
        resultado = cartas_crud.jugar_card_trade(
            partida_id=partida_id,
            jugador_evento_id=payload.jugadorId,
            carta_evento_id=payload.cartaEventoId,
            jugador_objetivo_id=payload.jugadorObjetivoId,
            carta_ofrecida_id=payload.cartaOfrecidaId,
            carta_elegida_id=payload.cartaElegidaId,
        )
    except ValueError as exc:
        msg = str(exc)
        # Mapear errores de no encontrado a 404
        if "no existe" in msg.lower():
            raise HTTPException(status_code=404, detail=msg)
        raise HTTPException(status_code=400, detail=msg)

    secretos_revelados: list[dict[str, Any]] = []
    secretos_a_revelar = payload.secretosARevelarIds or []
    if secretos_a_revelar:
        secreto_crud = SecretoCRUD(db)
        ids_unicos = list(dict.fromkeys(secretos_a_revelar))
        for secreto_id in ids_unicos:
            try:
                secreto = secreto_crud.revelar_secreto(secreto_id)
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc))
            secretos_revelados.append(secreto.to_dict())

    if secretos_revelados:
        resultado["secretosRevelados"] = secretos_revelados

    # Broadcasts 
    await lobby_broadcast("cartas_en_mano", cartas_crud.obtener_cartas_por_jugador(partida_id))
    await lobby_broadcast("cartas_descartadas", {
        "partidaId": partida_id,
        "cartas": [resultado["cartaEvento"]],
    })
    await lobby_broadcast("estado_mazos", cartas_crud.obtener_estado_mazos(partida_id))
    await lobby_broadcast("evento_jugado", {
        "partidaId": partida_id,
        "nombre": "Card Trade",
        "jugadorId": payload.jugadorId,
        "jugadorObjetivoId": payload.jugadorObjetivoId,
        "efectos": resultado["efectos"],  # efectos especiales
        "secretosRevelados": secretos_revelados,
    })

    for secreto in secretos_revelados:
        await lobby_broadcast("secreto_revelado", {
            "partidaId": partida_id,
            "origen": "card_trade",
            "secreto": secreto,
        })

    return resultado


@router.post("/partidas/{partida_id}/eventos/card-trade/social-faux", response_model=dict[str, Any])
async def resolver_card_trade_social_faux(
    partida_id: str,
    payload: CardTradeSocialFauxRevealIn,
    db: Session = Depends(get_db),
):
    partida_crud = PartidaCRUD(db)
    partida = partida_crud.get_partida(partida_id)
    if not partida:
        raise HTTPException(status_code=404, detail="Partida no encontrada")

    jugador_crud = JugadorCRUD(db)
    jugador = jugador_crud.obtener_jugador(payload.jugadorId)
    if jugador is None:
        raise HTTPException(status_code=404, detail="Jugador no encontrado")
    if jugador.partida_id != partida_id:
        raise HTTPException(status_code=403, detail="El jugador no pertenece a la partida")

    secreto_crud = SecretoCRUD(db)
    secreto = secreto_crud.obtener_secreto_por_id(payload.secretoId)
    if secreto is None:
        raise HTTPException(status_code=404, detail="El secreto no existe")
    if secreto.partida_id != partida_id:
        raise HTTPException(status_code=400, detail="El secreto no pertenece a la partida")
    if secreto.jugador_id != payload.jugadorId:
        raise HTTPException(status_code=403, detail="El secreto no pertenece al jugador indicado")
    if secreto.revelado:
        raise HTTPException(status_code=400, detail="El secreto ya está revelado")

    try:
        secreto_actualizado = secreto_crud.revelar_secreto(payload.secretoId)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    secreto_dict = secreto_actualizado.to_dict()

    await lobby_broadcast(
        "secreto_revelado",
        {
            "partidaId": partida_id,
            "origen": "card_trade_social_faux",
            "secreto": secreto_dict,
        },
    )

    return {"secreto": secreto_dict}


@router.post("/partidas/{partida_id}/eventos/dead-card-folly/social-faux", response_model=dict[str, Any])
async def resolver_dead_card_folly_social_faux(
    partida_id: str,
    payload: SocialFauxRevealIn,
    db: Session = Depends(get_db),
):
    partida_crud = PartidaCRUD(db)
    partida = partida_crud.get_partida(partida_id)
    if not partida:
        raise HTTPException(status_code=404, detail="Partida no encontrada")

    jugador_crud = JugadorCRUD(db)
    jugador = jugador_crud.obtener_jugador(payload.jugadorId)
    if jugador is None:
        raise HTTPException(status_code=404, detail="Jugador no encontrado")
    if jugador.partida_id != partida_id:
        raise HTTPException(status_code=403, detail="El jugador no pertenece a la partida")

    secreto_crud = SecretoCRUD(db)
    secreto = secreto_crud.obtener_secreto_por_id(payload.secretoId)
    if secreto is None:
        raise HTTPException(status_code=404, detail="El secreto no existe")
    if secreto.partida_id != partida_id:
        raise HTTPException(status_code=400, detail="El secreto no pertenece a la partida")
    if secreto.jugador_id != payload.jugadorId:
        raise HTTPException(status_code=403, detail="El secreto no pertenece al jugador indicado")
    if secreto.revelado:
        raise HTTPException(status_code=400, detail="El secreto ya está revelado")

    try:
        secreto_actualizado = secreto_crud.revelar_secreto(payload.secretoId)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    secreto_dict = secreto_actualizado.to_dict()

    await lobby_broadcast(
        "secreto_revelado",
        {
            "partidaId": partida_id,
            "origen": "dead_card_folly_social_faux",
            "secreto": secreto_dict,
        },
    )

    return {"secreto": secreto_dict}
  
@router.post("/partidas/{partida_id}/eventos/dead-card-folly", response_model=dict[str, Any])
async def jugar_dead_card_folly(partida_id: str, payload: DeadCardFollyIn, db: Session = Depends(get_db)):
    partida_crud = PartidaCRUD(db)
    partida = partida_crud.get_partida(partida_id)
    if not partida:
        raise HTTPException(status_code=404, detail="Partida no encontrada")
    if partida.turno_actual != payload.jugadorId:
        raise HTTPException(status_code=403, detail="No es tu turno")

    cartas_crud = CartaCRUD(db)
    try:
        resultado = cartas_crud.jugar_dead_card_folly(
            partida_id=partida_id,
            jugador_evento_id=payload.jugadorId,
            carta_evento_id=payload.cartaEventoId,
            direccion=payload.direccion,
            selecciones=payload.selecciones,
        )
    except ValueError as exc:
        msg = str(exc)
        if "no existe" in msg:
            raise HTTPException(status_code=404, detail=msg)
        raise HTTPException(status_code=400, detail=msg)

    efectos_list = resultado.get("efectos", [])

    efectos_por_tipo = resultado.get("efectos_por_tipo") or CartaCRUD.agrupar_efectos_por_tipo(efectos_list)

    # Broadcasts 
    await lobby_broadcast("evento_jugado", {
        "partidaId": partida_id,
        "nombre": "Dead Card Folly",
        "jugadorId": payload.jugadorId,
        "direccion": payload.direccion,
        "efectos": efectos_por_tipo,
    })

    # Estado de manos
    manos = cartas_crud.obtener_cartas_por_jugador(partida_id)
    await lobby_broadcast("cartas_en_mano", manos)

    # Solo descartar la carta de evento
    carta_evento = resultado.get("evento")
    await lobby_broadcast("cartas_descartadas", {
        "partidaId": partida_id,
        "cartas": [carta_evento.to_dict()] if carta_evento else [],
    })

    # Estado de mazos
    await lobby_broadcast("estado_mazos", cartas_crud.obtener_estado_mazos(partida_id))

    # Efectos especiales detectados (no revelamos cartas pasadas)
    efectos = efectos_list
    if efectos:
        await lobby_broadcast("dead_card_folly_efectos_pendientes", {
            "partidaId": partida_id,
            "efectos": efectos,
            "efectosPorTipo": efectos_por_tipo,
        })

    # Emitir señal de finalización para liberar la UI del evento
    await lobby_broadcast("dead_card_folly_completed", {
        "partidaId": partida_id,
        "jugadorId": payload.jugadorId,
        "efectos": efectos,
        "efectosPorTipo": efectos_por_tipo,
    })

    return {
        "ok": True,
        "efectos": efectos_por_tipo,
        "efectosPendientes": efectos,
    }

@router.get("/partidas/{partida_id}/estado-jugador-evento", response_model=dict[str, Any])
async def obtener_estado_jugador(partida_id: str, jugador_id: int, cartaEventoId: int, db: Session = Depends(get_db)):
    partida_crud = PartidaCRUD(db)
    partida = partida_crud.get_partida(partida_id)
    if not partida:
        raise HTTPException(status_code=404, detail="Partida no encontrada")
    if partida.turno_actual != jugador_id:
        raise HTTPException(status_code=403, detail="No es tu turno")

    carta_crud = CartaCRUD(db)
    carta = carta_crud.obtener_carta_por_id(cartaEventoId)

    jugador_crud = JugadorCRUD(db)
    jugador = jugador_crud.obtener_jugador(jugador_id)
    jugador.accion_jugada = carta.nombre

    await lobby_broadcast("evento_en_curso", {
       "jugadorId": jugador_id,
       "jugador": jugador.to_dict(),
       "evento": carta.nombre,
    })

    return carta.to_dict()
  
# Evento Not So Fast: solamente descartar la carta de evento y notificar
@router.post("/partidas/{partida_id}/eventos/not-so-fast", response_model=dict[str, Any],)
async def jugar_not_so_fast(partida_id: str, payload: NotSoFastIn, db: Session = Depends(get_db)):
    partida_crud = PartidaCRUD(db)
    partida = partida_crud.get_partida(partida_id)
    if not partida:
        raise HTTPException(status_code=404, detail="Partida no encontrada")

    cartas_crud = CartaCRUD(db)
    try:
        cartas_descartadas = cartas_crud.jugar_not_so_fast(
            partida_id=partida_id,
            jugador_evento_id=payload.jugadorId,
            carta_evento_id=payload.cartaEventoId,
            eventoa_cancelar_id=payload.eventoaCancelarId,
            cartas_set_id=payload.cartasSetId,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    await lobby_broadcast("cartas_descartadas", {
        "partidaId": partida_id,
        "cartas": [carta.to_dict() for carta in cartas_descartadas]
    })
    await lobby_broadcast("estado_mazos", cartas_crud.obtener_estado_mazos(partida_id))
    await lobby_broadcast("not_so_fast", {
        "partidaId": partida_id,
        "jugadorId": payload.jugadorId,
        "cartaEventoId": payload.cartaEventoId, 
        "cartasSetId": payload.cartasSetId, 
        "eventoaCancelarId": payload.eventoaCancelarId
    })

    return {"ok": True}
