from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# importar modelos para crear tablas
from src.modelos.partida_modelo import Partida
from src.modelos.jugador_modelo import Jugador
from src.modelos.carta_modelo import Carta
from src.modelos.secretos_modelo import Secreto
from src.modelos.set_modelo import Set

from src.database import reset_tables

app = FastAPI(title="Death on the Cards API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)

reset_tables()

# importar routers DESPUÉS de crear app
from src.routers.partidas import router as PartidasRouter
from src.routers.jugadores import router as JugadoresRouter
from src.routers.set import router as SetsRouter
from src.websocket.simple_lobby import router as WSLobbyRouter

# montar
app.include_router(PartidasRouter, prefix="/api", tags=["partidas"])
app.include_router(JugadoresRouter, prefix="/api", tags=["jugadores"])
app.include_router(SetsRouter, prefix="/api", tags=["sets"])
app.include_router(WSLobbyRouter)   # /ws/lobby (solo partida_creada)

@app.get("/")
def read_root():
    return {"message": "Hello World"}