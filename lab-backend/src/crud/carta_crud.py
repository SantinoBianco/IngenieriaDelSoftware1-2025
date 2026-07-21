from collections import defaultdict
from random import shuffle
from typing import Any, Iterable

from sqlalchemy import func
from sqlalchemy.orm import Session


from src.database import session
from src.modelos.carta_modelo import Carta
from src.modelos.jugador_modelo import Jugador

CARTAS_BASE = [
    # DETECTIVE CARDS (25 cartas)
    # Hercule Poirot (set de 3)
    "Hercule Poirot", "Hercule Poirot", "Hercule Poirot",
    
    # Miss Marple (set de 3)
    "Miss Marple", "Miss Marple", "Miss Marple",
    
    # Mr Satterthwaite (set de 3)
    "Mr Satterthwaite", "Mr Satterthwaite", "Mr Satterthwaite",
    
    # Parker Pyne (set de 3)
    "Parker Pyne", "Parker Pyne", "Parker Pyne",
    
    # Lady Eileen 'Bundle' Brent (set de 3)
    "Lady Eileen 'Bundle' Brent", "Lady Eileen 'Bundle' Brent", "Lady Eileen 'Bundle' Brent",
    
    # Tommy Beresford (set de 3)
    "Tommy Beresford", "Tommy Beresford", "Tommy Beresford",
    
    # Tuppence Beresford (set de 3)
    "Tuppence Beresford", "Tuppence Beresford", "Tuppence Beresford",
    
    # Harley Quin Wildcard (3 cartas)
    "Harley Quin Wildcard", "Harley Quin Wildcard", "Harley Quin Wildcard",
    
    # Ariadne Oliver (1 carta - se añade a sets existentes)
    "Ariadne Oliver",
    
    # EVENT CARDS (22 cartas)
    "Card Trade", "Card Trade", "Dead Card Folly", "Dead Card Folly", "And then there was one more...", 
    "Point Your Suspicious", "Point Your Suspicious", "Point Your Suspicious",
    "Cards off the table", "Another victim", "Another victim", "Look into the Ashes", "Delay the Murderer scape", 
    "Early train to paddington", 
    "Card Trade", "Dead Card Folly", "And then there was one more...",
    "Cards off the table", "Another victim", "Look into the Ashes", "Delay the Murderer scape", "Early train to paddington", 
    
    # devius
    "Social Faux Pas", "Social Faux Pas", "Blackmailed", "Blackmailed",
    
    # not so fast
    "Not so Fast...", "Not so Fast...", "Not so Fast...", "Not so Fast...", "Not so Fast...",
    "Not so Fast...", "Not so Fast...", "Not so Fast...", "Not so Fast...", "Not so Fast..."
]
DRAFT_SIZE = 3

class CartaCRUD:
    def __init__(self, db: Session):
        self.db = db

    def crear_cartas_iniciales(self, partida_id: str) -> None:
        nombres = CARTAS_BASE.copy()
        shuffle(nombres)
        cartas = []
        for idx, nombre in enumerate(nombres):
            if idx < DRAFT_SIZE:
                ubicacion = "draft"
                orden = idx            
            else:
                ubicacion = "robo"
                orden = idx - DRAFT_SIZE            

            cartas.append(Carta(
                nombre=nombre,
                ubicacion=ubicacion,
                orden=orden,
                partida_id=partida_id,
                jugador_id=None,
            ))

        try:
            self.db.add_all(cartas)
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise

    def robar_cartas(self, partida_id: str, jugador_id: int, cantidad: int) -> list[Carta]:
        cartas = (
            self.db.query(Carta)
            .filter(
                Carta.partida_id == partida_id,
                Carta.ubicacion == "robo",
            )
            .order_by(Carta.orden.asc())
            .limit(cantidad)
            .all()
        )
        if len(cartas) < cantidad:
            raise ValueError("El mazo no tiene cartas suficientes")

        try:
            for carta in cartas:
                carta.ubicacion = "mano"
                carta.jugador_id = jugador_id
                carta.orden = None
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise

        return cartas
    
    def repartir_NotSoFast(self, partida_id: str, jugador_id: int, nombre_carta: str) -> Carta:
        # agarro el not so fast
        carta = (
            self.db.query(Carta)
            .filter(
                Carta.partida_id == partida_id,
                Carta.ubicacion == "robo",
                Carta.nombre == nombre_carta,
            )
            .order_by(Carta.orden.asc())
            .first()
        )
        if carta is None:
            raise ValueError(f"No hay cartas '{nombre_carta}' disponibles en el mazo de robo")
        # se lo doy al jugador
        try:
            carta.ubicacion = "mano"
            carta.jugador_id = jugador_id
            carta.orden = None
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise

        return carta

    # jugador_id puede venir con un entero (si la carta está en mano) o con None (si está en el mazo o en el descarte). 
    def descartar_cartas(self, cartas_ids: Iterable[int], jugador_id: int | None = None) -> list[Carta]:
        cartas = (
            self.db.query(Carta)
            .filter(Carta.carta_id.in_(list(cartas_ids)))
            .all()
        )
        if not cartas:
            raise ValueError("No se encontraron cartas para descartar")

        # valida que las cartas las tenga el jugador antes de enviar al descarte
        if jugador_id is not None:
            invalid = [carta.carta_id for carta in cartas if carta.jugador_id != jugador_id]
            if invalid:
                raise ValueError("Las cartas seleccionadas no pertenecen al jugador")

        top_descarte = (
            self.db.query(Carta.orden)
            .filter(Carta.ubicacion == "descarte")
            .order_by(Carta.orden.desc())
            .first()
        )
        next_order = (top_descarte[0] + 1) if top_descarte else 0

        try:
            for offset, carta in enumerate(cartas):
                carta.ubicacion = "descarte"
                carta.jugador_id = None
                carta.orden = next_order + offset
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise

        return cartas
    
    def descartar_carta_aleatoria(self, partida_id: str, jugador_id: int) -> Carta:
        
        # obtener carta aleatoria en mano del jugador
        carta = (
            self.db.query(Carta)
            .filter(
                Carta.partida_id == partida_id,
                Carta.jugador_id == jugador_id,
                Carta.ubicacion == "mano",
            )
            .order_by(func.random())
            .first()
        )
        if carta is None:
            raise ValueError("El jugador no tiene cartas en mano para descartar")
        
        # descartar la carta
        carta_descartada = self.descartar_cartas([carta.carta_id], jugador_id=jugador_id)[0]

        return carta_descartada
        
    def ver_mazo_descarte(self, partida_id: str) -> list[Carta]:
        cartas = (
            self.db.query(Carta)
            .filter(
                Carta.partida_id == partida_id,
                Carta.ubicacion == "descarte",
            )
            .order_by(Carta.orden.desc())
            .limit(5)
            .all()
        )
        return cartas

    def obtener_cartas_por_jugador(self, partida_id: str) -> dict[str, Any]:
        """Devuelve las cartas en mano agrupadas por jugador."""
        cartas = (
            self.db.query(Carta)
            .filter(
                Carta.partida_id == partida_id,
                Carta.ubicacion == "mano",
            )
            .all()
        )
        manos: dict[int, list[dict[str, Any]]] = defaultdict(list)
        for carta in cartas:
            if carta.jugador_id is None:
                continue
            manos[carta.jugador_id].append(carta.to_dict())
        return {
            "partidaId": partida_id,
            "hands": manos,
        }

    def obtener_estado_mazos(self, partida_id: str) -> dict[str, Any]:
        robo = (
            self.db.query(Carta)
            .filter(
                Carta.partida_id == partida_id,
                Carta.ubicacion == "robo",
            )
            .order_by(Carta.orden.asc())
            .all()
        )
        descarte = (
            self.db.query(Carta)
            .filter(
                Carta.partida_id == partida_id,
                Carta.ubicacion == "descarte",
            )
            .order_by(Carta.orden.asc())
            .all()
        )
        draft = (
            self.db.query(Carta)
            .filter(Carta.partida_id == partida_id, Carta.ubicacion == "draft")
            .order_by(Carta.orden.asc())
            .all()
        )
        return {
            "partidaId": partida_id,
            "mazoRobo": [c.to_dict() for c in robo],
            "mazoDescarte": [c.to_dict() for c in descarte],
            "mazoDraft": [c.to_dict() for c in draft],
        }

# Draft
    def obtener_draft(self, partida_id: str) -> list[Carta]:
        return (self.db.query(Carta)
                .filter(
                    Carta.partida_id == partida_id,
                    Carta.ubicacion == "draft")
                    .order_by(Carta.orden.asc())
                    .all())
     
    def compactar_draft(self, partida_id: str) -> None:
        draft = self.obtener_draft(partida_id)
        for indx, carta in enumerate(draft):
            carta.orden = indx

    def rellenar_draft(self, partida_id: str) -> list[Carta]:
        draft = self.obtener_draft(partida_id)
        faltantes = DRAFT_SIZE - len(draft)
        if faltantes <= 0:
            return []

        nuevas = (self.db.query(Carta)
                .filter(Carta.partida_id == partida_id, Carta.ubicacion == "robo")
                .order_by(Carta.orden.asc())
                .limit(faltantes)
                .all())
        base = len(draft)
        for offset, carta in enumerate(nuevas):
            carta.ubicacion = "draft"
            carta.jugador_id = None
            carta.orden = base + offset
        return nuevas
    
    def tomar_carta_draft(self, partida_id: str, carta_id: int, jugador_id: int) -> Carta:
        carta = (self.db.query(Carta)
                .filter(Carta.partida_id == partida_id, Carta.carta_id == carta_id)
                .one_or_none())
        if carta is None or carta.ubicacion != "draft":
            raise ValueError("La carta no está disponible en el draft")

        carta.ubicacion = "mano"
        carta.jugador_id = jugador_id
        carta.orden = None

        try:
            self.db.flush()
            self.rellenar_draft(partida_id)
            self.compactar_draft(partida_id)          
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise

        return carta
    
    # funciones nuevas para usar en el crud de set 

    def obtener_carta_por_id(self, carta_id: int) -> Carta | None:
        
        return self.db.query(Carta).filter(Carta.carta_id == carta_id).first()
    
    def get_cartas_by_ids(self, cartas_ids: list[int]) -> list[Carta]:
        
        if not cartas_ids:
            return []
        return self.db.query(Carta).filter(Carta.carta_id.in_(cartas_ids)).all()
    
    def update_carta_jugador_y_ubicacion(self, carta_id: int, nuevo_jugador_id: int | None, nueva_ubicacion: str) -> Carta | None:
       
        carta_a_actualizar = self.obtener_carta_por_id(carta_id)
        if carta_a_actualizar:
            carta_a_actualizar.jugador_id = nuevo_jugador_id
            carta_a_actualizar.ubicacion = nueva_ubicacion
        
        return carta_a_actualizar

    def jugar_cards_off_the_table(self, partida_id: str, jugador_evento_id: int, carta_evento_id: int, jugador_objetivo_id: int) -> list[Carta]:

        carta_evento = self.obtener_carta_por_id(carta_evento_id)
        
        if carta_evento is None:
            raise ValueError("La carta de evento no existe")
        if carta_evento.partida_id != partida_id:
            raise ValueError("La carta de evento no pertenece a la partida")
        if carta_evento.nombre != "Cards off the table":
            raise ValueError("La carta indicada no es 'Cards off the table'")
        if carta_evento.jugador_id != jugador_evento_id or carta_evento.ubicacion != "mano":
            raise ValueError("La carta de evento no está en la mano del jugador")

        
        jugador_objetivo = (
            self.db.query(Jugador)
            .filter(Jugador.jugador_id == jugador_objetivo_id)
            .one_or_none()
        )
        if jugador_objetivo is None:
            raise ValueError("El jugador objetivo no existe")
        if jugador_objetivo.partida_id != partida_id:
            raise ValueError("El jugador objetivo no pertenece a la partida")

        cartas_objetivo = (
            self.db.query(Carta)
            .filter(
                Carta.partida_id == partida_id,
                Carta.jugador_id == jugador_objetivo_id,
                Carta.ubicacion == "mano",
            )
            .all()
        )
        if not cartas_objetivo:
            raise ValueError("El jugador objetivo no tiene cartas en mano")
        
        descartadas: list[Carta] = []
        cartas_not_so_fast = [
            carta for carta in cartas_objetivo if carta.nombre == "Not so Fast..."
        ]

        if cartas_not_so_fast:
            descartadas.extend(
                self.descartar_cartas(
                    [carta.carta_id for carta in cartas_not_so_fast],
                    jugador_id=jugador_objetivo_id,
                )
            )
        
        descartadas.extend(
            self.descartar_cartas(
                [carta_evento_id],
                jugador_id=jugador_evento_id,
            )
        )
        return descartadas

    def jugar_early_train_to_paddington(self,partida_id: str,jugador_evento_id: int,carta_evento_id: int) -> tuple[list[Carta], dict[str, Any]]:
            carta_evento = self.obtener_carta_por_id(carta_evento_id)

            if carta_evento is None:
                raise ValueError("La carta de evento no existe")
            if carta_evento.partida_id != partida_id:
                raise ValueError("La carta de evento no pertenece a la partida")
            if carta_evento.nombre != "Early train to paddington":
                raise ValueError("La carta indicada no es 'Early train to paddington'")
            if carta_evento.jugador_id != jugador_evento_id or carta_evento.ubicacion != "mano":
                raise ValueError("La carta de evento no está en la mano del jugador")

            jugador_evento = (
                self.db.query(Jugador)
                .filter(Jugador.jugador_id == jugador_evento_id)
                .one_or_none()
            )
            if jugador_evento is None or jugador_evento.partida_id != partida_id:
                raise ValueError("El jugador no pertenece a la partida")

            
            cartas_a_mover = (
                self.db.query(Carta)
                .filter(
                    Carta.partida_id == partida_id,
                    Carta.ubicacion == "robo",
                )
                .order_by(Carta.orden.asc())
                .limit(6)
                .all()
            )

            
            top_descarte = (
                self.db.query(Carta.orden)
                .filter(
                    Carta.partida_id == partida_id,
                    Carta.ubicacion == "descarte",
                )
                .order_by(Carta.orden.desc())
                .first()
            )
            next_order = (top_descarte[0] + 1) if top_descarte else 0

            try:
                # Mover al descarte
                for idx, carta in enumerate(cartas_a_mover):
                    carta.ubicacion = "descarte"
                    carta.jugador_id = None
                    carta.orden = next_order + idx

                # mazo de robo restante
                restantes_robo = (
                    self.db.query(Carta)
                    .filter(
                        Carta.partida_id == partida_id,
                        Carta.ubicacion == "robo",
                    )
                    .order_by(Carta.orden.asc())
                    .all()
                )
                for idx, carta in enumerate(restantes_robo):
                    carta.orden = idx

                
                carta_evento.ubicacion = "removida"
                carta_evento.jugador_id = None
                carta_evento.orden = None

                self.db.flush()
                estado = self.obtener_estado_mazos(partida_id)
                self.db.commit()
                return cartas_a_mover, estado
            except Exception:
                self.db.rollback()
                raise
            
    def jugar_delay_the_murderer(self,partida_id: str,jugador_evento_id: int,carta_evento_id: int,) -> tuple[list[Carta], dict[str, Any]]:
        
        carta_evento = self.obtener_carta_por_id(carta_evento_id)
        
        if carta_evento is None:
            raise ValueError("La carta de evento no existe")
        if carta_evento.partida_id != partida_id:
            raise ValueError("La carta de evento no pertenece a la partida")
        if carta_evento.nombre != "Delay the Murderer scape":
            raise ValueError("La carta indicada no es 'Delay the Murderer scape'")
        if carta_evento.jugador_id != jugador_evento_id or carta_evento.ubicacion != "mano":
            raise ValueError("La carta de evento no está en la mano del jugador")

        jugador_evento = (
            self.db.query(Jugador)
            .filter(Jugador.jugador_id == jugador_evento_id)
            .one_or_none()
        
        )
        if jugador_evento is None or jugador_evento.partida_id != partida_id:
            raise ValueError("El jugador no pertenece a la partida")

        descarte = (
            self.db.query(Carta)
            .filter(
                Carta.partida_id == partida_id,
                Carta.ubicacion == "descarte",
            )
            .order_by(Carta.orden.desc())
            .all()
        )

        if not descarte:
            raise ValueError("No hay cartas en el descarte")

        cartas_a_mover = descarte[:5]
        shuffle(cartas_a_mover)

        mazo_robo = (
            self.db.query(Carta)
            .filter(
                Carta.partida_id == partida_id,
                Carta.ubicacion == "robo",
            )
            .order_by(Carta.orden.asc())
            .all()
        )

        try:
            for idx, carta in enumerate(cartas_a_mover):
                carta.ubicacion = "robo"
                carta.jugador_id = None
                carta.orden = idx

            for offset, carta in enumerate(mazo_robo, start=len(cartas_a_mover)):
                carta.orden = offset

            for idx, carta in enumerate(
                carta for carta in descarte if carta not in cartas_a_mover
            ):
                carta.orden = idx

            carta_evento.ubicacion = "removida"
            carta_evento.jugador_id = None

            self.db.flush()
            estado = self.obtener_estado_mazos(partida_id)
            self.db.commit()
            return cartas_a_mover, estado
        except Exception:
            self.db.rollback()
            raise

    def look_into_the_ashes(self, partida_id: str, jugador_id: int, carta_id: int) -> Carta:
        carta = (
            self.db.query(Carta)
            .filter(
                Carta.partida_id == partida_id,
                Carta.carta_id == carta_id,
            )
            .one_or_none()
        )
        if carta is None:
            raise ValueError("La carta no existe")
        if carta.ubicacion != "descarte":
            raise ValueError("La carta no está en el descarte")
        
        try:
            carta.ubicacion = "mano"
            carta.orden = None
            carta.jugador_id = jugador_id
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise
        return carta

    def jugar_card_trade(self,partida_id: str,jugador_evento_id: int,carta_evento_id: int,jugador_objetivo_id: int,carta_ofrecida_id: int,carta_elegida_id: int,) -> dict[str, Any]:
    
        # Validaciones de existencia y pertenencia
        carta_evento = self.obtener_carta_por_id(carta_evento_id)
        if carta_evento is None:
            raise ValueError("La carta de evento no existe")
        if carta_evento.partida_id != partida_id:
            raise ValueError("La carta de evento no pertenece a la partida")
        if carta_evento.nombre != "Card Trade":
            raise ValueError("La carta indicada no es 'Card Trade'")
        if carta_evento.jugador_id != jugador_evento_id or carta_evento.ubicacion != "mano":
            raise ValueError("La carta de evento no está en la mano del jugador")

        # Jugadores
        jugador_objetivo = (
            self.db.query(Jugador)
            .filter(Jugador.jugador_id == jugador_objetivo_id)
            .one_or_none()
        )
        if jugador_objetivo is None:
            raise ValueError("El jugador objetivo no existe")
        if jugador_objetivo.partida_id != partida_id:
            raise ValueError("El jugador objetivo no pertenece a la partida")
        if jugador_evento_id == jugador_objetivo_id:
            raise ValueError("No puedes intercambiar cartas contigo mismo")

        # Cartas a intercambiar
        carta_ofrecida = self.obtener_carta_por_id(carta_ofrecida_id)
        if carta_ofrecida is None:
            raise ValueError("La carta ofrecida no existe")
        if carta_ofrecida.partida_id != partida_id:
            raise ValueError("La carta ofrecida no pertenece a la partida")
        if carta_ofrecida.jugador_id != jugador_evento_id or carta_ofrecida.ubicacion != "mano":
            raise ValueError("La carta ofrecida no está en la mano del jugador")
        if carta_ofrecida.carta_id == carta_evento.carta_id:
            raise ValueError("La carta ofrecida no puede ser la carta de evento")

        carta_elegida = self.obtener_carta_por_id(carta_elegida_id)
        if carta_elegida is None:
            raise ValueError("La carta elegida no existe")
        if carta_elegida.partida_id != partida_id:
            raise ValueError("La carta elegida no pertenece a la partida")
        if carta_elegida.jugador_id != jugador_objetivo_id or carta_elegida.ubicacion != "mano":
            raise ValueError("La carta elegida no está en la mano del jugador objetivo")
        if carta_elegida.carta_id == carta_ofrecida.carta_id:
            raise ValueError("Las cartas a intercambiar deben ser distintas")

        # Efectos especiales detectados por nombres
        nombre_blackmailed = "Blackmailed"
        nombre_social_faux = "Social Faux Pas"
        mueve_blackmailed = (
            carta_ofrecida.nombre in (nombre_blackmailed, "Blackmailed!")
            or carta_elegida.nombre in (nombre_blackmailed, "Blackmailed!")
        )
        mueve_social_faux = (
            carta_ofrecida.nombre == nombre_social_faux
            or carta_elegida.nombre == nombre_social_faux
        )

        # Preparar descarte del evento (tope)
        top_descarte = (
            self.db.query(Carta.orden)
            .filter(Carta.partida_id == partida_id, Carta.ubicacion == "descarte")
            .order_by(Carta.orden.desc())
            .first()
        )
        next_order = (top_descarte[0] + 1) if top_descarte else 0

        try:
            # Swap de dueños manteniendo ubicacion="mano" y orden=None
            carta_ofrecida.jugador_id = jugador_objetivo_id
            carta_ofrecida.ubicacion = "mano"
            carta_ofrecida.orden = None

            carta_elegida.jugador_id = jugador_evento_id
            carta_elegida.ubicacion = "mano"
            carta_elegida.orden = None

            # Descartar carta de evento
            carta_evento.ubicacion = "descarte"
            carta_evento.jugador_id = None
            carta_evento.orden = next_order

            # Flush + commit único para atomicidad
            self.db.flush()
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise

        efectos: dict[str, Any] = {}

        def _append_efecto(nombre: str, data: dict[str, Any]) -> None:
            if nombre not in efectos:
                efectos[nombre] = []
            efectos[nombre].append(data)

        if mueve_blackmailed:
            # El jugador que la pasó elige un Secreto del receptor para verlo.
            # Esta implementación solo señala el trigger; la selección ocurre fuera.
            if carta_ofrecida.nombre in (nombre_blackmailed, "Blackmailed!"):
                _append_efecto(
                    "blackmailed",
                    {
                        "pasadorId": jugador_evento_id,
                        "receptorId": jugador_objetivo_id,
                    },
                )
            if carta_elegida.nombre in (nombre_blackmailed, "Blackmailed!"):
                _append_efecto(
                    "blackmailed",
                    {
                        "pasadorId": jugador_objetivo_id,
                        "receptorId": jugador_evento_id,
                    },
                )
        if mueve_social_faux:
            # El receptor elige qué secreto propio revelar (y vuelve a ocultarse).
            if carta_ofrecida.nombre == nombre_social_faux:
                _append_efecto(
                    "socialFauxPas",
                    {"receptorId": jugador_objetivo_id},
                )
            if carta_elegida.nombre == nombre_social_faux:
                _append_efecto(
                    "socialFauxPas",
                    {"receptorId": jugador_evento_id},
                )

        return {
            "partidaId": partida_id,
            "jugadorId": jugador_evento_id,
            "jugadorObjetivoId": jugador_objetivo_id,
            "cartaEvento": carta_evento.to_dict(),
            "intercambio": {
                "cartaOfrecida": carta_ofrecida.to_dict(),
                "cartaElegida": carta_elegida.to_dict(),
            },
            "efectos": efectos,
        }
    
    def jugar_not_so_fast(self, 
                          partida_id: str, 
                          jugador_evento_id: int, 
                          carta_evento_id: int,
                          eventoa_cancelar_id: int | None = None, 
                          cartas_set_id: list[int] | None = None) -> dict[str, Any]:
        # Validar carta de evento
        carta_evento = self.obtener_carta_por_id(carta_evento_id)
        if carta_evento is None:
            raise ValueError("La carta de evento no existe")
        if carta_evento.partida_id != partida_id:
            raise ValueError("La carta de evento no pertenece a la partida")
        if carta_evento.nombre != "Not so Fast...":
            raise ValueError("La carta indicada no es 'Not so Fast...'")
    
        # Descartar carta evento (siempre del jugador que juega el evento)
        evento_descartado = self.descartar_cartas([carta_evento_id], jugador_id=jugador_evento_id)[0]
        cartas_descartadas: list[Carta] = [evento_descartado]
    
        # Si se cancela una carta individual, descartarla
        if eventoa_cancelar_id is not None:
            carta_cancelada = self.obtener_carta_por_id(eventoa_cancelar_id)
            if carta_cancelada is None:
                raise ValueError("La carta cancelada no existe")
            if carta_cancelada.partida_id != partida_id:
                raise ValueError("La carta cancelada no pertenece a la partida")
            if carta_cancelada.jugador_id is None or carta_cancelada.ubicacion != "mano":
                raise ValueError("La carta cancelada no está en la mano de ningún jugador")
    
            # Descartar usando el jugador_id de la carta cancelada
            cartas_descartadas.extend(
                self.descartar_cartas([eventoa_cancelar_id], jugador_id=carta_cancelada.jugador_id)
            )
    
        # Si se cancela un set, descartar todas las cartas del set
        if cartas_set_id is not None:
            cartas_set = self.get_cartas_by_ids(cartas_set_id)
            if len(cartas_set) != len(cartas_set_id):
                raise ValueError("Alguna carta del set no existe")
            
            # Verificar que todas las cartas del set pertenezcan al mismo jugador
            jugadores_set = set(carta.jugador_id for carta in cartas_set)
            if len(jugadores_set) != 1:
                raise ValueError("Las cartas del set deben pertenecer al mismo jugador")
            
            jugador_del_set = next(iter(jugadores_set))
            if jugador_del_set is None:
                raise ValueError("Las cartas del set no están en la mano de ningún jugador")
    
            for carta in cartas_set:
                if carta.partida_id != partida_id:
                    raise ValueError("Alguna carta del set no pertenece a la partida")
                if carta.ubicacion != "mano":
                    raise ValueError("Alguna carta del set no está en la mano")
    
            # Descartar usando el jugador_id común del set
            cartas_descartadas.extend(
                self.descartar_cartas(cartas_set_id, jugador_id=jugador_del_set)
            )
    
        return cartas_descartadas
    
    def jugar_dead_card_folly(self,partida_id: str,jugador_evento_id: int,carta_evento_id: int,direccion: str,selecciones: dict[int, int],) -> dict[str, Any]:

        # Validar carta de evento
        carta_evento = self.obtener_carta_por_id(carta_evento_id)
        if carta_evento is None:
            raise ValueError("La carta de evento no existe")
        if carta_evento.partida_id != partida_id:
            raise ValueError("La carta de evento no pertenece a la partida")
        if carta_evento.nombre != "Dead Card Folly":
            raise ValueError("La carta indicada no es 'Dead Card Folly'")
        if carta_evento.jugador_id != jugador_evento_id or carta_evento.ubicacion != "mano":
            raise ValueError("La carta de evento no está en la mano del jugador")

        if direccion not in ("derecha", "izquierda"):
            raise ValueError("Dirección inválida")

        # Jugadores en orden
        jugadores = (
            self.db.query(Jugador)
            .filter(Jugador.partida_id == partida_id)
            .order_by(Jugador.jugador_id.asc())
            .all()
        )
        if not jugadores:
            raise ValueError("No hay jugadores en la partida")
        jugador_ids = [j.jugador_id for j in jugadores]

        # Validar que todos los jugadores tengan selección y al menos una carta en mano
        if set(selecciones.keys()) != set(jugador_ids):
            raise ValueError("Faltan selecciones o hay selecciones de jugadores inválidos")

        # Verificar que cada jugador tenga cartas en mano
        for j_id in jugador_ids:
            tiene = (
                self.db.query(Carta)
                .filter(
                    Carta.partida_id == partida_id,
                    Carta.jugador_id == j_id,
                    Carta.ubicacion == "mano",
                )
                .first()
            )
            if tiene is None:
                raise ValueError("Un jugador no tiene cartas")

        # Traer todas las cartas seleccionadas
        cartas_ids = list(selecciones.values())
        cartas_sel = self.get_cartas_by_ids(cartas_ids)
        if len(cartas_sel) != len(cartas_ids):
            raise ValueError("Alguna carta seleccionada no existe")
        cartas_por_id = {c.carta_id: c for c in cartas_sel}

        # Validaciones de pertenencia y ubicación
        for j_id, c_id in selecciones.items():
            if c_id not in cartas_por_id:
                raise ValueError("Alguna carta seleccionada no existe")
            carta = cartas_por_id[c_id]
            if carta.partida_id != partida_id:
                raise ValueError("Cartas de otra partida")
            if carta.jugador_id != j_id or carta.ubicacion != "mano":
                raise ValueError("La selección no pertenece al jugador o no está en mano")

        # Calcular vecino según dirección
        idx_por_jugador = {j_id: idx for idx, j_id in enumerate(jugador_ids)}
        def vecino_de(j_id: int) -> int:
            i = idx_por_jugador[j_id]
            if direccion == "derecha":
                return jugador_ids[(i + 1) % len(jugador_ids)]
            else:
                return jugador_ids[(i - 1) % len(jugador_ids)]

        # Identificar efectos especiales antes de mover
        efectos: list[dict[str, Any]] = []
        efectos_por_tipo: dict[str, list[dict[str, Any]]] = defaultdict(list)

        def registrar_efecto(tipo: str, datos: dict[str, Any]) -> None:
            efecto = {"tipo": tipo, **datos}
            efectos.append(efecto)
            clave = (
                "blackmailed"
                if tipo == "blackmailed"
                else "socialFauxPas"
                if tipo == "social_faux_pas"
                else tipo
            )
            efectos_por_tipo[clave].append(dict(datos))
        for j_id, c_id in selecciones.items():
            carta = cartas_por_id[c_id]
            nombre = carta.nombre
            # Normalizar posibles signos en nombre segun mazo base
            if nombre == "Blackmailed" or nombre == "Blackmailed!":
                registrar_efecto("blackmailed", {
                    "pasadorId": j_id,
                    "receptorId": vecino_de(j_id),
                })
            elif nombre == "Social Faux Pas":
                registrar_efecto("social_faux_pas", {
                    "pasadorId": j_id,
                    "receptorId": vecino_de(j_id),
                })

        # Aplicar movimiento y descartar evento 
        try:
            # Mover cartas seleccionadas al vecino
            for j_id, c_id in selecciones.items():
                carta = cartas_por_id[c_id]
                carta.jugador_id = vecino_de(j_id)
                carta.ubicacion = "mano"
                carta.orden = None

            # Calcular tope de descarte y descartar el evento
            top_descarte = (
                self.db.query(Carta.orden)
                .filter(
                    Carta.partida_id == partida_id,
                    Carta.ubicacion == "descarte",
                )
                .order_by(Carta.orden.desc())
                .first()
            )
            next_order = (top_descarte[0] + 1) if top_descarte else 0
            carta_evento.ubicacion = "descarte"
            carta_evento.jugador_id = None
            carta_evento.orden = next_order

            self.db.commit()
        except Exception:
            self.db.rollback()
            raise

        return {
            "evento": carta_evento,
            "efectos": efectos,
            "efectos_por_tipo": dict(efectos_por_tipo),
        }
    
    def agrupar_efectos_por_tipo(self, efectos: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
        if not efectos:
            return {}
        agrupados: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for efecto in efectos:
            tipo = efecto.get("tipo")
            clave = (
                "blackmailed"
                if tipo == "blackmailed"
                else "socialFauxPas"
                if tipo == "social_faux_pas"
                else tipo or "otros"
            )
            datos = {k: v for k, v in efecto.items() if k != "tipo"}
            agrupados[clave].append(datos)
        return dict(agrupados)
    