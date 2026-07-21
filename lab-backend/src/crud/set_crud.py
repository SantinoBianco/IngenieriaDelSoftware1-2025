from typing import Any
from collections import defaultdict

from sqlalchemy.orm import Session, object_session

from src.database import session
from src.modelos.set_modelo import Set
from src.modelos.carta_modelo import Carta

from src.crud.partida_crud import PartidaCRUD
from src.crud.carta_crud import CartaCRUD
from src.crud.jugador_crud import JugadorCRUD
from src.crud.secreto_crud import SecretoCRUD

SET_CARD_REQUIREMENTS = {
    "Set de Hercule Poirot": 3,
    "Set de Miss Marple": 3,
    "Set de Mr Satterthwaite": 2,
    "Set de Parker Pyne": 2,
    "Set de Lady Eileen 'Bundle' Brent": 2, 
    "Set de Tommy Beresford": 2,
    "Set de Tuppence Beresford": 2,
    "Set de Beresford": 2, 
}

class SetCRUD:
    def __init__(self, db: Session):
        self.db = db 

    def crear_set(self, nombre: str, partida_id: str, owner_id: int | None = None) -> Set:
        nuevo_set = Set(nombre=nombre, partida_id=partida_id, owner_id=owner_id)
        try:
            self.db.add(nuevo_set)
        except Exception as exc:
            self.db.rollback()
            raise exc
        return nuevo_set

    def obtener_set(self, set_id: int) -> Set | None:
        return self.db.query(Set).filter(Set.set_id == set_id).first()

    def sets_de_owner(self, owner_id: int) -> list[Set]:
        return self.db.query(Set).filter(Set.owner_id == owner_id).all()

    def agregar_carta_a_set(self, set_obj: Set, card_obj: Carta) -> Set:
        if object_session(set_obj) is None:
            set_obj = self.db.merge(set_obj)
        set_obj.cartas.append(card_obj)
        return set_obj

    def _determinar_nombre_del_set(self, cartas: list[Carta]) -> str:
        """Calcula el nombre del set basandose en cartas no comodin."""
        cartas_base = [
            carta
            for carta in cartas
            if "Wildcard" not in carta.nombre and carta.nombre != "Ariadne Oliver"
        ]
        if not cartas_base:
            raise ValueError("No se puede crear un set utilizando unicamente comodines.")

        nombres_detective = {carta.nombre for carta in cartas_base}
    
        beresford_set = {"Tommy Beresford", "Tuppence Beresford"}
    
        if nombres_detective == beresford_set:
            return "Set de Beresford"  

        nombres_detective = {carta.nombre for carta in cartas_base}
        if len(nombres_detective) > 1:
            raise ValueError("Las cartas seleccionadas pertenecen a detectives distintos.")

        return f"Set de {cartas_base[0].nombre}"

    def play_and_resolve_set_action(self, jugador_id: int, cartas_ids: list[int], partida_id: str, nombre_set: str, 
        jugador_id_objetivo: int | None,
        secreto_id_objetivo: int | None
    ) -> Set:
        
        if not cartas_ids:
            raise ValueError("Debe seleccionar cartas para jugar un set.")
        
        crud_partida = PartidaCRUD(self.db)
        crud_jugador = JugadorCRUD(self.db)
        crud_carta = CartaCRUD(self.db)
        crud_secreto = SecretoCRUD(self.db)
        
        try:
            partida = crud_partida.get_partida(partida_id)
            if not partida:
                raise ValueError("La partida especificada no existe.")
            
            cartas_a_jugar = crud_carta.get_cartas_by_ids(cartas_ids)
            if len(cartas_a_jugar) != len(cartas_ids):
                raise ValueError("Algunas cartas seleccionadas no existen.")
            
            for carta in cartas_a_jugar:
                if carta.partida_id != partida_id:
                    raise ValueError("Las cartas seleccionadas no pertenecen a la partida indicada.")
                if carta.jugador_id != jugador_id or carta.ubicacion != "mano":
                    raise ValueError("Las cartas seleccionadas no estan en la mano del jugador.")
            
            nombre_del_set = self._determinar_nombre_del_set(cartas_a_jugar)
            if nombre_set != nombre_del_set:
                raise ValueError(f"Jugada invalida: las cartas jugadas no forman un '{nombre_set}'.")
            
            required_count = SET_CARD_REQUIREMENTS.get(nombre_del_set)
            if required_count is None:
                raise ValueError("El set que intentas jugar no es válido.")
            if len(cartas_a_jugar) != required_count:
                raise ValueError(f"Un {nombre_del_set} requiere {required_count} cartas.")

            nuevo_set = self.crear_set(nombre_del_set, partida_id, jugador_id)
            
            for carta in cartas_a_jugar:
                self.agregar_carta_a_set(nuevo_set, carta)
                crud_carta.update_carta_jugador_y_ubicacion(carta.carta_id, jugador_id, "set")

            # LÓGICA DE RESOLUCIÓN DE ACCIÓN DEL SET
            if secreto_id_objetivo is not None:
                
                # Caso especial: para Parker Pyne
                if "Parker Pyne" in nuevo_set.nombre:
                    secreto_objetivo = crud_secreto.obtener_secreto_por_id(secreto_id_objetivo)
                    if not secreto_objetivo:
                        raise ValueError("El secreto objetivo no existe.")
                    
                    if secreto_objetivo.revelado:
                        # Si está revelado, lo ocultamos usando la función interna
                        crud_secreto._ocultar_secreto_en_sesion(secreto_id_objetivo)
                
                # Caso estándar: solo revelamos
                else:
                    crud_secreto._revelar_secreto_en_sesion(secreto_id_objetivo)

            nuevo_set.status = "completo"
            partida.set_accion_pendiente_id = None

            self.db.commit()
            self.db.refresh(nuevo_set)
            self.db.refresh(partida)
            
            return nuevo_set
            
        except Exception as e:
            self.db.rollback()
            raise e
         
    def cambiar_owner_set(self, set_id: int, new_owner_id: int) -> Set:
        set_a_actualizar = self.obtener_set(set_id)
        if not set_a_actualizar:
            raise ValueError("El set especificado no existe.")

        crud_carta = CartaCRUD(self.db)

        set_a_actualizar.owner_id = new_owner_id

        for carta in set_a_actualizar.cartas:
            crud_carta.update_carta_jugador_y_ubicacion(
            carta_id=carta.carta_id, 
            nuevo_jugador_id=new_owner_id,
            nueva_ubicacion="set"  
        )
            
        try:
            self.db.commit()
            self.db.refresh(set_a_actualizar)
        except Exception as exc:
            self.db.rollback()
            raise exc
        return set_a_actualizar

    def agregar_carta_a_set_existente_y_resolver( self, carta_id: int, set_id: int, partida_id: str, owner_id: int,
        jugador_id_objetivo: int | None = None,
        secreto_id_objetivo: int | None = None
    ) -> Set:
        crud_carta = CartaCRUD(self.db)
        crud_secreto = SecretoCRUD(self.db)

        try:
            set_existente = self.obtener_set(set_id)
            if not set_existente:
                raise ValueError("El set especificado no existe.")

            if set_existente.partida_id != partida_id:
                raise ValueError("El set no pertenece a la partida indicada.")

            carta_a_agregar = crud_carta.obtener_carta_por_id(carta_id)
            if not carta_a_agregar:
                raise ValueError("La carta especificada no existe.")

            if carta_a_agregar.partida_id != partida_id:
                raise ValueError("La carta no pertenece a la partida indicada.")

            if carta_a_agregar.jugador_id != owner_id or carta_a_agregar.ubicacion != "mano":
                raise ValueError("La carta no está en la mano del jugador.")

            nombre_carta = carta_a_agregar.nombre
            nombre_set = set_existente.nombre
            es_ariadne = nombre_carta == "Ariadne Oliver"

            if es_ariadne:
                owner_del_set = set_existente.owner_id
                if secreto_id_objetivo is not None:
                    secreto_objetivo = crud_secreto.obtener_secreto_por_id(secreto_id_objetivo)
                    if not secreto_objetivo:
                        raise ValueError("El secreto objetivo no existe.")

                    if secreto_objetivo.jugador_id != owner_del_set:
                        raise ValueError("El secreto objetivo debe pertenecer al dueño del set.")
            else:
                if set_existente.owner_id != owner_id:
                    raise ValueError("Solo puedes agregar cartas a tus propios sets (excepto Ariadne Oliver).")

                es_comodin = "Wildcard" in nombre_carta

                if not es_comodin:
                    if nombre_set == "Set de Beresford":
                        if nombre_carta not in ["Tommy Beresford", "Tuppence Beresford"]:
                            raise ValueError(f"La carta '{nombre_carta}' no es compatible con '{nombre_set}'.")
                    else:
                        nombre_detective_del_set = nombre_set.replace("Set de ", "")
                        if nombre_carta != nombre_detective_del_set:
                            raise ValueError(f"La carta '{nombre_carta}' no es compatible con '{nombre_set}'.")

            self.agregar_carta_a_set(set_existente, carta_a_agregar)

            nuevo_owner = set_existente.owner_id if es_ariadne else owner_id
            crud_carta.update_carta_jugador_y_ubicacion(carta_id, nuevo_owner, "set")

            if secreto_id_objetivo is not None:

                if "Parker Pyne" in nombre_set:
                    secreto_objetivo = crud_secreto.obtener_secreto_por_id(secreto_id_objetivo)
                    if not secreto_objetivo:
                        raise ValueError("El secreto objetivo no existe.")

                    if secreto_objetivo.revelado:
                        crud_secreto._ocultar_secreto_en_sesion(secreto_id_objetivo)

                else:
                    crud_secreto._revelar_secreto_en_sesion(secreto_id_objetivo)

            self.db.commit()
            self.db.refresh(set_existente)

            return set_existente

        except Exception as e:
            self.db.rollback()
            raise e
    
    def obtener_sets_organizados_por_jugador(self, partida_id: str) -> dict[int, Any]:
        sets_en_partida = self.db.query(Set).filter(Set.partida_id == partida_id).all()
    
        sets_por_jugador = defaultdict(lambda: {"sets": []})
    
        for set_obj in sets_en_partida:
            cartas_info = [carta.to_dict() for carta in set_obj.cartas]
        
            set_info = {
                "id": set_obj.set_id,
                "nombre": set_obj.nombre,
                "cartas": cartas_info
            }
        
            if set_obj.owner_id is not None:
                sets_por_jugador[set_obj.owner_id]["sets"].append(set_info)
    
        return dict(sets_por_jugador)


