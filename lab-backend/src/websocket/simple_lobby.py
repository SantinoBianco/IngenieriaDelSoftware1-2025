import json
from typing import Dict, Any, Set
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter(tags=["ws"])
_clients: Set[WebSocket] = set()

@router.websocket("/ws/lobby")
async def lobby_ws(ws: WebSocket):
    await ws.accept()
    _clients.add(ws)
    try:
        while True:
            message = await ws.receive_text()
            try:
                data = json.loads(message)
                event = data.get("event")
                if not event:
                    continue

                payload = data.get("data", {})

                if event == "jugador_manual_salida":
                    await lobby_broadcast(
                        "jugador_desconectado",
                        {
                            "partidaId": payload.get("partidaId"),
                            "jugadorId": payload.get("jugadorId")
                        }
                    )
                elif event in {
                    "pedir_revelar_secreto",
                    "respuesta_revelar_secreto",
                    "point_suspicions_started",
                    "point_suspicions_vote",
                    "point_suspicions_complete",
                    "point_suspicions_secret_selected",
                    "evento_cancelado",
                    }:
                    await lobby_broadcast(event, payload)
            except json.JSONDecodeError:
                pass  
                
    except WebSocketDisconnect:
        _clients.discard(ws)

async def lobby_broadcast(event: str, data: Dict[str, Any]) -> None:
    dead = []
    for ws in list(_clients):
        try:
            await ws.send_json({"event": event, "data": data})
        except Exception:
            dead.append(ws)
    for ws in dead:
        _clients.discard(ws)
