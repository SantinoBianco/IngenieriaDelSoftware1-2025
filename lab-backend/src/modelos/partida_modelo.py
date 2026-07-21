from sqlalchemy import Column, String, Integer, ForeignKey, Boolean
from src.database import Base
from src.modelos.set_modelo import Set

from sqlalchemy.orm import relationship

# modelos sqlachemy, estructura de la base
class Partida(Base):
    __tablename__ = "partidas"

    id = Column(String, primary_key=True)
    nombre = Column(String(50), nullable=False)
    estado = Column(String(20), default="lobby")
    maxJugadores = Column(Integer, nullable=False)
    host = Column(Integer, nullable=True) # jugador_id del host
    jugadores = Column(Integer, default=0)
    cantidad_jugadores = Column(Integer, default=0)

    turno_actual = Column(Integer, nullable=True) # jugador_id del turno actual

    privada = Column(Boolean, default=False, nullable=False)
    contraseña = Column(String, nullable=True) 
    
    jugadores = relationship("Jugador", back_populates="partida")
    cartas = relationship("Carta", back_populates="partida")
    secretos = relationship("Secreto", back_populates="partida")
    sets = relationship("Set", back_populates="partida", foreign_keys="[Set.partida_id]") # Es buena práctica ser explícito aquí también

    def to_dict(self):
        return {
            "id": self.id,
            "nombre": self.nombre,
            "estado": self.estado,
            "maxJugadores": self.maxJugadores,
            "host": self.host,
            "cantidad_jugadores": self.cantidad_jugadores,
            "privada": self.privada,
        }
    

