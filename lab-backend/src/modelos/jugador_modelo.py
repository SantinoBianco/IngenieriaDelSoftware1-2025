from sqlalchemy import Column, String, Integer, Boolean
from src.database import Base

# para conectar con partidas y cartas
from sqlalchemy import ForeignKey  
from sqlalchemy.orm import relationship

class Jugador(Base):
    __tablename__ = "jugadores"

    jugador_id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String, nullable=False)
    cumpleaños = Column(String, nullable=False)
    partida_id = Column(String, ForeignKey('partidas.id'))
    en_desgracia = Column(Boolean, default=False, nullable=False)
    accion_jugada = Column(String, nullable=True)

    partida = relationship("Partida", back_populates="jugadores")
    cartas = relationship("Carta", back_populates="jugador")
    secretos = relationship("Secreto", back_populates="jugador")
    sets = relationship("Set", back_populates="owner")


    def to_dict(self):
        return {
            "jugador_id": self.jugador_id,
            "username": self.username,
            "cumpleaños": self.cumpleaños,
            "partida_id": self.partida_id,
            "en_desgracia": self.en_desgracia
        }