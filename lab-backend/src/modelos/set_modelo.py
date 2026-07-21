from sqlalchemy import Table, Column, String, Integer, ForeignKey
from src.database import Base
from sqlalchemy.orm import relationship


# 1. La tabla de asociación vive aquí.
set_cartas_association_table = Table(
    "set_cartas_association",
    Base.metadata,
    Column("set_id", Integer, ForeignKey("sets.set_id", ondelete="CASCADE"), primary_key=True),
    Column("carta_id", Integer, ForeignKey("cartas.carta_id", ondelete="CASCADE"), primary_key=True),
    
)

class Set(Base):
    __tablename__ = "sets"

    set_id = Column(Integer, primary_key=True, autoincrement=True)
    nombre = Column(String, nullable=False)
    ## que partida pertenece el set
    partida_id = Column(String, ForeignKey('partidas.id', ondelete="CASCADE"))
    # A quien pertenece el set 
    owner_id = Column(Integer, ForeignKey('jugadores.jugador_id'), nullable=True)
    # Estado del set con respecto a la accion(esperando, completo)
    status = Column(String, nullable=False, default="completo")

    # Relaciones
    partida = relationship("Partida", back_populates="sets", foreign_keys=[partida_id])
    owner = relationship("Jugador", back_populates="sets")  
    

    cartas = relationship("Carta", secondary=set_cartas_association_table, back_populates="sets", lazy="joined")

    def to_dict(self):
        return {
            "set_id": self.set_id,
            "nombre": self.nombre,
            "partida_id": self.partida_id,
            "owner_id": self.owner_id,
            "status": self.status,
            "cartas": [carta.to_dict() for carta in self.cartas]
        }