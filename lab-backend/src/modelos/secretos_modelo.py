from sqlalchemy import Column, String, Integer, Boolean, ForeignKey
from src.database import Base
from sqlalchemy.orm import relationship
from typing import Any

class Secreto(Base):
    __tablename__ = "secretos" 

    secreto_id = Column(Integer, primary_key=True, autoincrement=True)
    descripcion = Column(String, nullable=True) # por ahora nullable
    revelado = Column(Boolean, default=False)

    # A que partida pertenece el secreto
    partida_id = Column(String, ForeignKey('partidas.id'))

    # De que jugador es el secreto
    jugador_id = Column(Integer, ForeignKey('jugadores.jugador_id'), nullable=True) # por ahora nullable

    # Relaciones 
    partida = relationship("Partida", back_populates="secretos")
    jugador = relationship("Jugador", back_populates="secretos")

    def to_dict(self) -> dict[str, Any]:
        return {
            "secreto_id": self.secreto_id,
            "descripcion": self.descripcion,
            "revelado": self.revelado,
            "partida_id": self.partida_id,
            "jugador_id": self.jugador_id,
        }