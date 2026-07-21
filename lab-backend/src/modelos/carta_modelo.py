from sqlalchemy import Column, String, Integer, ForeignKey
from src.database import Base
from sqlalchemy.orm import relationship
from typing import Any

from src.modelos.set_modelo import set_cartas_association_table

class Carta(Base):
    __tablename__ = "cartas" 

    carta_id = Column(Integer, primary_key=True, autoincrement=True)
    nombre = Column(String, nullable=False)

    ubicacion = Column(String, default="robo") # mano, mesa, robo, descarte, draft
    orden = Column(Integer, nullable=True)      # posición relativa dentro de cada mazo
    
    #partida pertenece la carta
    partida_id = Column(String, ForeignKey('partidas.id'))

    # que jugador tiene la carta, nullable si esta en el mazo
    jugador_id = Column(Integer, ForeignKey('jugadores.jugador_id'), nullable=True)

    # Relaciones 
    partida = relationship("Partida", back_populates="cartas")
    jugador = relationship("Jugador", back_populates="cartas")

     # Relación muchos a muchos con Set
    sets = relationship("Set", secondary=set_cartas_association_table, back_populates="cartas")

    def to_dict(self) -> dict[str, Any]:
        return {
            "carta_id": self.carta_id,
            "nombre": self.nombre,
            "ubicacion": self.ubicacion,
            "orden": self.orden,
            "partida_id": self.partida_id,
            "jugador_id": self.jugador_id,
        }