import pytest
import sys
import os

# hace falta, algo de src
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from src.main import app
from src.database import reset_tables, delete_database_file, get_session
from src.modelos.partida_modelo import Partida
from src.modelos.jugador_modelo import Jugador
from src.modelos.carta_modelo import Carta
from src.modelos.set_modelo import Set
from src.modelos.secretos_modelo import Secreto
from fastapi.testclient import TestClient

@pytest.fixture(autouse=True)
def db_session():
    delete_database_file()
    reset_tables()
    yield

@pytest.fixture
def client():
    return TestClient(app)

@pytest.fixture
def partida_con_jugadores():
    db = next(get_session())
    
    # Crear partida en estado lobby
    partida = Partida(
        id="test-partida-id",
        nombre="Partida de Test",
        estado="lobby",
        maxJugadores=4,
        host=1,
        cantidad_jugadores=2,
        turno_actual=None
    )
    
    try:
        db.add(partida)
        db.commit()
        
        # Crear jugadores
        jugador1 = Jugador(
            jugador_id=1,
            username="Jugador1",
            cumpleaños="1990-01-01",
            partida_id="test-partida-id"
        )
        
        jugador2 = Jugador(
            jugador_id=2,
            username="Jugador2", 
            cumpleaños="1992-02-02",
            partida_id="test-partida-id"
        )
        
        db.add(jugador1)
        db.add(jugador2)
        db.commit()
        
        # Crear cartas para el mazo
        from src.crud.carta_crud import CARTAS_BASE
        from random import shuffle
        
        nombres = CARTAS_BASE.copy()
        shuffle(nombres)
        cartas = [
            Carta(
                nombre=nombre,
                ubicacion="robo",
                orden=idx,
                partida_id="test-partida-id",
                jugador_id=None,
            )
            for idx, nombre in enumerate(nombres)
        ]
        db.add_all(cartas)
        
        from src.crud.secreto_crud import SECRETOS
        from src.modelos.secretos_modelo import Secreto
        
        secretos = [
            Secreto(
                descripcion=descripcion,
                revelado=False,
                partida_id="test-partida-id",
                jugador_id=None,
            )
            for descripcion in SECRETOS
        ]
        db.add_all(secretos)
        
        db.commit()
        
        yield {
            "partida": partida,
            "jugadores": [jugador1, jugador2]
        }
    finally:
        db.close()

def test_crear_partida(client):
    payload = {
        "nombre": "Test Partida",
        "maxJugadores": 4,
        "nombreUsuario": "Jugador1",
        "fechaNacimiento": "1990-01-01"
    }
    
    response = client.post("/api/partidas", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["nombre"] == "Test Partida"
    assert data["estado"] == "lobby"
    assert data["cantidad_jugadores"] == 1

def test_listar_partidas(client):
    db = next(get_session())
    partida = Partida(
        id="test-id",
        nombre="Partida Test",
        estado="lobby", 
        maxJugadores=4,
        host=1,
        cantidad_jugadores=1
    )
    db.add(partida)
    db.commit()
    db.close()
    
    response = client.get("/api/partidas")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["nombre"] == "Partida Test"

def test_iniciar_partida(client, partida_con_jugadores):
    partida_id = partida_con_jugadores["partida"].id
    
    payload_start = {"jugadorId": 1}
    response = client.post(f"/api/partidas/{partida_id}/start", json=payload_start)
    
    print(f"Response status: {response.status_code}")
    if response.status_code != 200:
        print(f"Error response: {response.text}")
    
    assert response.status_code == 200, f"Expected 200, got {response.status_code}. Response: {response.text}"
    
    data = response.json()
    
    # Verificar estado de partida
    assert data["estado"] == "en_curso"
    assert data["turno_actual"] == 1
    assert data["id"] == partida_id
    
    # Verificar en la base de datos si cambio
    db = next(get_session())
    try:
        partida_db = db.query(Partida).filter(Partida.id == partida_id).first()
        assert partida_db.estado == "en_curso"
        assert partida_db.turno_actual == 1
    finally:
        db.close()

def test_robar_cartas(client, partida_con_jugadores):
    partida_id = partida_con_jugadores["partida"].id
    
    # Primero iniciar la partida y verificar que se inicio correctamente
    start_response = client.post(f"/api/partidas/{partida_id}/start", json={"jugadorId": 1})
    assert start_response.status_code == 200, f"Failed to start game: {start_response.text}"
    
    # Verificar el estado de la partida despues de iniciar
    partida_state = start_response.json()
    print(f"Partida state after start: {partida_state}")
    
    # Robar cartas
    payload_robar = {"jugadorId": 1, "cantidad": 2}
    response = client.post(f"/api/partidas/{partida_id}/cartas/robar", json=payload_robar)

    print(f"Robar cartas response: {response.status_code}")
    if response.status_code != 200:
        print(f"Error response: {response.text}")
    
    assert response.status_code == 200, f"Expected 200, got {response.status_code}. Response: {response.text}"
    
    data = response.json()
    assert len(data) == 2
    for carta in data:
        assert carta["ubicacion"] == "mano"
        assert carta["jugador_id"] == 1

def test_eliminar_partida(client, partida_con_jugadores):
    partida_id = partida_con_jugadores["partida"].id
    
    response = client.delete(f"/api/partidas/{partida_id}")
    assert response.status_code == 204
    
    # Verificar que la partida ya no existe
    response_get = client.get("/api/partidas")
    partidas = [p for p in response_get.json() if p["id"] == partida_id]
    assert len(partidas) == 0

def test_robar_cartas_sin_turno(client, partida_con_jugadores):
    partida_id = partida_con_jugadores["partida"].id
    
    # Iniciar partida
    start_response = client.post(f"/api/partidas/{partida_id}/start", json={"jugadorId": 1})
    assert start_response.status_code == 200
    
    # Jugador 2 intenta robar fuera de turno
    payload_robar = {"jugadorId": 2, "cantidad": 2}
    response = client.post(f"/api/partidas/{partida_id}/cartas/robar", json=payload_robar)
    
    assert response.status_code == 403
    assert "No es tu turno" in response.json()["detail"]

def test_tomar_carta_draft(client, partida_con_jugadores):
    partida_id = partida_con_jugadores["partida"].id

    # preparar una carta en draft
    db = next(get_session())
    carta = Carta(
        nombre="Carta draft",
        ubicacion="draft",
        orden=0,
        partida_id=partida_id,
        jugador_id=None,
    )
    db.add(carta)
    db.commit()
    carta_id = carta.carta_id
    db.close()

    # iniciar la partida para habilitar el pick
    assert client.post(f"/api/partidas/{partida_id}/start", json={"jugadorId": 1}).status_code == 200

    # probar el endpoint
    resp = client.post(
        f"/api/partidas/{partida_id}/draft/pick",
        json={"cartaId": carta_id, "jugadorId": 1},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["carta_id"] == carta_id
    assert data["ubicacion"] == "mano"
    assert data["jugador_id"] == 1

def test_ver_mazo_descarte(client, partida_con_jugadores):
    """Test para ver las primeras cartas del mazo de descarte"""
    partida_id = partida_con_jugadores["partida"].id
    
    # Primero iniciar la partida
    start_response = client.post(f"/api/partidas/{partida_id}/start", json={"jugadorId": 1})
    assert start_response.status_code == 200
    
    # Preparar algunas cartas en el mazo de descarte
    db = next(get_session())
    try:
        # Crear cartas en el mazo de descarte con diferentes órdenes
        cartas_descarte = [
            Carta(
                nombre=f"Carta Descarte {i}",
                ubicacion="descarte",
                orden=i,
                partida_id=partida_id,
                jugador_id=None,
            )
            for i in range(5, 0, -1)  # Órdenes: 5, 4, 3, 2, 1
        ]
        db.add_all(cartas_descarte)
        db.commit()
        
        # Obtener los IDs para verificación
        carta_ids = [c.carta_id for c in cartas_descarte]
    finally:
        db.close()
    
    # Llamar al endpoint
    response = client.get(f"/api/partidas/{partida_id}/mazo/descarte/ver")
    
    print(f"Response status: {response.status_code}")
    if response.status_code != 200:
        print(f"Error response: {response.text}")
    
    assert response.status_code == 200, f"Expected 200, got {response.status_code}. Response: {response.text}"
    
    data = response.json()
    
    # Verificaciones
    assert len(data) == 5  # Debería devolver las 5 cartas
    assert all(carta["ubicacion"] == "descarte" for carta in data)
    assert all(carta["partida_id"] == partida_id for carta in data)
    assert all(carta["jugador_id"] is None for carta in data)
    
    # Verificar que las cartas están ordenadas por orden descendente (más recientes primero)
    # Las cartas con orden más alto deberían aparecer primero
    ordenes = [carta["orden"] for carta in data]
    assert ordenes == [5, 4, 3, 2, 1]  # Verificar orden descendente

def test_ver_mazo_descarte_vacio(client, partida_con_jugadores):
    """Test para ver el mazo de descarte cuando está vacío"""
    partida_id = partida_con_jugadores["partida"].id
    
    # Iniciar la partida
    start_response = client.post(f"/api/partidas/{partida_id}/start", json={"jugadorId": 1})
    assert start_response.status_code == 200
    
    # Llamar al endpoint
    response = client.get(f"/api/partidas/{partida_id}/mazo/descarte/ver")
    
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 0  # Debería devolver lista vacía

def preparar_cards_off_entorno(
    partida_id: str,
    jugador_evento: int,
    jugador_objetivo: int,
    incluir_not_so_fast: bool = True,
):
    db = next(get_session())
    try:
        max_descarte_row = (
            db.query(Carta.orden)
            .filter(
                Carta.partida_id == partida_id,
                Carta.ubicacion == "descarte",
            )
            .order_by(Carta.orden.desc())
            .first()
        )
        max_descarte = (
            max_descarte_row[0]
            if max_descarte_row and max_descarte_row[0] is not None
            else -1
        )

        cartas_en_mano = db.query(Carta).filter(
            Carta.partida_id == partida_id,
            Carta.jugador_id.in_([jugador_evento, jugador_objetivo]),
            Carta.ubicacion == "mano",
        ).all()
        for offset, carta in enumerate(cartas_en_mano):
            carta.ubicacion = "descarte"
            carta.jugador_id = None
            carta.orden = max_descarte + 1 + offset

        carta_evento = Carta(
            nombre="Cards off the table",
            ubicacion="mano",
            orden=None,
            partida_id=partida_id,
            jugador_id=jugador_evento,
        )
        db.add(carta_evento)

        if incluir_not_so_fast:
            not_so_fast = Carta(
                nombre="Not so Fast...",
                ubicacion="mano",
                orden=None,
                partida_id=partida_id,
                jugador_id=jugador_objetivo,
            )
            db.add(not_so_fast)

        db.commit()
        return carta_evento.carta_id
    finally:
        db.close()

def test_cards_off_the_table_exito(client, partida_con_jugadores):
    partida_id = partida_con_jugadores["partida"].id
    assert client.post(f"/api/partidas/{partida_id}/start", json={"jugadorId": 1}).status_code == 200
    carta_evento_id = preparar_cards_off_entorno(partida_id, jugador_evento=1, jugador_objetivo=2)

    resp = client.post(
        f"/api/partidas/{partida_id}/eventos/cards-off-the-table",
        json={
            "jugadorId": 1,
            "cartaEventoId": carta_evento_id,
            "jugadorObjetivoId": 2,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    assert {carta["nombre"] for carta in data} == {"Cards off the table", "Not so Fast..."}

    db = next(get_session())
    try:
        mano_objetivo = db.query(Carta).filter(
            Carta.partida_id == partida_id,
            Carta.jugador_id == 2,
            Carta.ubicacion == "mano",
        ).all()
        assert all(c.nombre != "Not so Fast..." for c in mano_objetivo)

        descarte = db.query(Carta).filter(
            Carta.partida_id == partida_id,
            Carta.ubicacion == "descarte",
        ).all()
        assert any(c.nombre == "Cards off the table" for c in descarte)
        assert any(c.nombre == "Not so Fast..." for c in descarte)
    finally:
        db.close()

def test_cards_off_the_table_objetivo_sin_cartas(client, partida_con_jugadores):
    partida_id = partida_con_jugadores["partida"].id
    assert client.post(f"/api/partidas/{partida_id}/start", json={"jugadorId": 1}).status_code == 200
    carta_evento_id = preparar_cards_off_entorno(
        partida_id,
        jugador_evento=1,
        jugador_objetivo=2,
        incluir_not_so_fast=False,
    )

    resp = client.post(
        f"/api/partidas/{partida_id}/eventos/cards-off-the-table",
        json={
            "jugadorId": 1,
            "cartaEventoId": carta_evento_id,
            "jugadorObjetivoId": 2,
        },
    )
    assert resp.status_code == 400
    assert resp.json()["detail"] == "El jugador objetivo no tiene cartas en mano"


    db = next(get_session())
    try:
        carta_evento = db.get(Carta, carta_evento_id)
        assert carta_evento.ubicacion == "mano"
        assert carta_evento.jugador_id == 1
    finally:
        db.close()

@pytest.fixture
def partida_con_sets_y_secretos():
    """
    Crea un estado de juego complejo para probar la lógica de sets
    """
    db = next(get_session())
    try:
        # 1. Crear Partida y Jugadores
        partida = Partida(
            id="test-game-sets", 
            nombre="Partida de Sets", 
            estado="en_curso",  # Cambiado de "iniciada" a "en_curso"
            maxJugadores=4, 
            host=1, 
            cantidad_jugadores=2, 
            turno_actual=1
        )
        jugador1 = Jugador(jugador_id=1, username="Atacante", cumpleaños="27-10-2004", partida_id="test-game-sets")
        jugador2 = Jugador(jugador_id=2, username="Víctima", cumpleaños="06-09-2018", partida_id="test-game-sets")
        db.add_all([partida, jugador1, jugador2])
        db.flush()  # Para obtener los IDs

        # 2. Crear Cartas
        c1 = Carta(nombre="Parker Pyne", partida_id="test-game-sets", jugador_id=1, ubicacion="mano")
        c2 = Carta(nombre="Parker Pyne", partida_id="test-game-sets", jugador_id=1, ubicacion="mano")
        c3 = Carta(nombre="Miss Marple", partida_id="test-game-sets", jugador_id=2, ubicacion="set")
        c4 = Carta(nombre="Miss Marple", partida_id="test-game-sets", jugador_id=2, ubicacion="set")
        c5 = Carta(nombre="Miss Marple", partida_id="test-game-sets", jugador_id=2, ubicacion="set")
        db.add_all([c1, c2, c3, c4, c5])
        db.flush()

        # 3. Crear Secretos
        s1 = Secreto(descripcion="Secreto Atacante", revelado=False, partida_id="test-game-sets", jugador_id=1)
        s2 = Secreto(descripcion="Secreto Víctima", revelado=False, partida_id="test-game-sets", jugador_id=2)
        db.add_all([s1, s2])
        db.flush()

        # 4. Crear el Set y asignar cartas
        set_existente = Set(nombre="Set de Miss Marple", partida_id="test-game-sets", owner_id=2)
        db.add(set_existente)
        db.flush()
        
        # Asignar cartas al set
        set_existente.cartas.extend([c3, c4, c5])
        
        db.commit()
        
        return {
            "partida_id": partida.id,
            "atacante_id": jugador1.jugador_id,
            "victima_id": jugador2.jugador_id,
            "cartas_atacante_ids": [c1.carta_id, c2.carta_id],
            "secreto_victima_id": s2.secreto_id,
            "set_victima_id": set_existente.set_id
        }
    finally:
        db.close()

def test_obtener_sets_partida(client, partida_con_sets_y_secretos):
    """Prueba que el endpoint GET /partidas/{id}/sets devuelva los sets organizados."""
    partida_id = partida_con_sets_y_secretos["partida_id"]
    victima_id = partida_con_sets_y_secretos["victima_id"]

    response = client.get(f"/api/partidas/{partida_id}/sets")
    
    assert response.status_code == 200
    data = response.json()
    
    # Verificamos que la respuesta esté organizada por el ID del jugador
    assert str(victima_id) in data
    # Verificamos que el set de la víctima esté presente
    assert len(data[str(victima_id)]["sets"]) == 1
    assert data[str(victima_id)]["sets"][0]["nombre"] == "Set de Miss Marple"
    assert len(data[str(victima_id)]["sets"][0]["cartas"]) == 3

def test_robar_set_con_evento_another_victim(client, partida_con_sets_y_secretos):
    """Prueba que el evento 'another-victim' robe un set y cambie el dueño de las cartas."""
    datos = partida_con_sets_y_secretos
    
    payload = {
        "jugador_ladron_id": datos["atacante_id"],
        "jugador_objetivo_id": datos["victima_id"],
        "set_id": datos["set_victima_id"],
        "evento_id": 1
    }

    response = client.post(f"/api/partidas/{datos['partida_id']}/eventos/another-victim", json=payload)

    assert response.status_code == 200
    assert "'Set de Miss Marple' robado exitosamente" in response.json()["mensaje"]
    
    # Verificamos que el dueño del set y de sus cartas haya cambiado
    db = next(get_session())
    set_robado = db.query(Set).filter(Set.set_id == datos["set_victima_id"]).one()
    assert set_robado.owner_id == datos["atacante_id"]
    
    # Verificamos que el dueño de CADA carta del set también haya cambiado
    for carta in set_robado.cartas:
        assert carta.jugador_id == datos["atacante_id"]
    db.close()


def test_robar_set_a_si_mismo_falla(client, partida_con_sets_y_secretos):
    """Prueba la validación que impide que un jugador se robe un set a sí mismo."""
    datos = partida_con_sets_y_secretos
    
    payload = {
        "jugador_ladron_id": datos["atacante_id"],
        "jugador_objetivo_id": datos["atacante_id"],  # Ladrón y objetivo son el mismo
        "set_id": datos["set_victima_id"],  # Aunque el set no sea suyo, la validación debe saltar antes
        "evento_id": 1
    }

    response = client.post(f"/api/partidas/{datos['partida_id']}/eventos/another-victim", json=payload)
    
    assert response.status_code == 400
    assert "No puedes robarte un set a ti mismo" in response.json()["detail"]

def preparar_delay_the_murderer(
    partida_id: str,
    jugador_evento: int,
) -> tuple[int, list[int]]:
    """Coloca el evento en mano del jugador y prepara un descarte conocido."""
    db = next(get_session())
    try:
        # Limpiar cualquier carta en mano del jugador
        db.query(Carta).filter(
            Carta.partida_id == partida_id,
            Carta.jugador_id == jugador_evento,
            Carta.ubicacion == "mano",
        ).delete(synchronize_session=False)

        # Crear carta evento en mano
        carta_evento = Carta(
            nombre="Delay the Murderer scape",
            ubicacion="mano",
            orden=None,
            partida_id=partida_id,
            jugador_id=jugador_evento,
        )
        db.add(carta_evento)

        # Preparar descarte con cartas conocidas
        cartas_descarte_ids = []
        nombres_descarte = [
            "Not so Fast...",
            "Dead Card Folly",
            "Harley Quin Wildcard",
            "Tommy Beresford",
            "Parker Pyne",
            "Lady Eileen 'Bundle' Brent",
        ]
        for idx, nombre in enumerate(nombres_descarte):
            carta = Carta(
                nombre=nombre,
                ubicacion="descarte",
                orden=idx,
                partida_id=partida_id,
                jugador_id=None,
            )
            db.add(carta)
            db.flush()
            cartas_descarte_ids.append(carta.carta_id)

        db.commit()
        return carta_evento.carta_id, cartas_descarte_ids
    finally:
        db.close()

def test_delay_the_murderer_exito(client, partida_con_jugadores):
    partida_id = partida_con_jugadores["partida"].id
    assert client.post(f"/api/partidas/{partida_id}/start", json={"jugadorId": 1}).status_code == 200
    carta_evento_id, descarte_ids = preparar_delay_the_murderer(partida_id, jugador_evento=1)

    resp = client.post(
        f"/api/partidas/{partida_id}/eventos/delay-the-murderer",
        json={"jugadorId": 1, "cartaEventoId": carta_evento_id},
    )
    assert resp.status_code == 200
    estado = resp.json()

    # Las cinco primeras cartas del descarte ahora son las primeras del mazo de robo (en orden aleatorio)
    mazo_robo_ids = [c["carta_id"] for c in estado["mazoRobo"][:5]]
    assert set(mazo_robo_ids) == set(descarte_ids[-5:])  # se movieron 5 cartas del tope

    # El descarte debe haber perdido esas cartas
    descarte_ids_restantes = [c["carta_id"] for c in estado["mazoDescarte"]]
    assert set(descarte_ids_restantes).issubset(set(descarte_ids))

    # La carta de evento quedó removida
    db = next(get_session())
    try:
        carta_evento = db.get(Carta, carta_evento_id)
        assert carta_evento.ubicacion == "removida"
        assert carta_evento.jugador_id is None
    finally:
        db.close()

def test_delay_the_murderer_sin_descarte(client, partida_con_jugadores):
    partida_id = partida_con_jugadores["partida"].id
    assert client.post(f"/api/partidas/{partida_id}/start", json={"jugadorId": 1}).status_code == 200

    db = next(get_session())
    try:
        carta_evento = Carta(
            nombre="Delay the Murderer scape",
            ubicacion="mano",
            orden=None,
            partida_id=partida_id,
            jugador_id=1,
        )
        db.add(carta_evento)
        db.commit()
        carta_evento_id = carta_evento.carta_id
    finally:
        db.close()

    resp = client.post(
        f"/api/partidas/{partida_id}/eventos/delay-the-murderer",
        json={"jugadorId": 1, "cartaEventoId": carta_evento_id},
    )
    assert resp.status_code == 400
    assert resp.json()["detail"] == "No hay cartas en el descarte"

    db = next(get_session())
    try:
        carta_evento = db.get(Carta, carta_evento_id)
        assert carta_evento.ubicacion == "mano"
        assert carta_evento.jugador_id == 1
    finally:
        db.close()

def test_and_then_there_was_one_more_exito(client, partida_con_sets_y_secretos):
    """Test exitoso para el evento and-then-there-was-one-more"""
    datos = partida_con_sets_y_secretos
    partida_id = datos["partida_id"]
    
    # Revelar primero el secreto de la víctima (requisito para el evento)
    db = next(get_session())
    try:
        secreto_victima = db.query(Secreto).filter(
            Secreto.secreto_id == datos["secreto_victima_id"]
        ).first()
        secreto_victima.revelado = True
        db.commit()
    finally:
        db.close()
    
    # Preparar carta evento en mano del atacante
    db = next(get_session())
    try:
        carta_evento = Carta(
            nombre="And Then There Was One More",
            ubicacion="mano",
            orden=None,
            partida_id=partida_id,
            jugador_id=datos["atacante_id"],
        )
        db.add(carta_evento)
        db.commit()
        carta_evento_id = carta_evento.carta_id
    finally:
        db.close()
    
    # Ejecutar el evento
    payload = {
        "jugadorId": datos["atacante_id"],
        "cartaEventoId": carta_evento_id,
        "secretoRevelado": datos["secreto_victima_id"],
        "nuevoOwner": datos["atacante_id"]
    }
    
    response = client.post(
        f"/api/partidas/{partida_id}/eventos/and-then-there-was-one-more",
        json=payload
    )
    
    print(f"Response status: {response.status_code}")
    if response.status_code != 200:
        print(f"Error response: {response.text}")
    
    assert response.status_code == 200, f"Expected 200, got {response.status_code}. Response: {response.text}"
    
    data = response.json()
    assert data["secreto_id"] == datos["secreto_victima_id"]
    assert data["revelado"] == False  # Debería estar oculto nuevamente
    assert data["jugador_id"] == datos["atacante_id"]  # Nuevo dueño
    
    # Verificar que la carta evento fue descartada
    db = next(get_session())
    try:
        carta_evento_db = db.query(Carta).filter(Carta.carta_id == carta_evento_id).first()
        assert carta_evento_db.ubicacion == "descarte"
        assert carta_evento_db.jugador_id is None
    finally:
        db.close()
       
def preparar_early_train_entorno(partida_id: str, jugador_evento: int):
    db = next(get_session())
    try:
        db.query(Carta).filter(Carta.partida_id == partida_id).delete(synchronize_session=False)
        db.commit()

        descarte_base = Carta(
            nombre="Carta en descarte",
            ubicacion="descarte",
            orden=4,
            partida_id=partida_id,
            jugador_id=None,
        )
        db.add(descarte_base)
        db.flush()

        cartas_a_mover_ids: list[int] = []
        for idx in range(6):
            carta = Carta(
                nombre=f"Carta Robo {idx}",
                ubicacion="robo",
                orden=idx,
                partida_id=partida_id,
                jugador_id=None,
            )
            db.add(carta)
            db.flush()
            cartas_a_mover_ids.append(carta.carta_id)

        restantes_info: list[tuple[int, int]] = []
        for idx in range(2):
            carta = Carta(
                nombre=f"Carta Resto {idx}",
                ubicacion="robo",
                orden=6 + idx,
                partida_id=partida_id,
                jugador_id=None,
            )
            db.add(carta)
            db.flush()
            restantes_info.append((carta.carta_id, carta.orden))

        carta_evento = Carta(
            nombre="Early train to paddington",
            ubicacion="mano",
            orden=None,
            partida_id=partida_id,
            jugador_id=jugador_evento,
        )
        db.add(carta_evento)
        db.flush()

        db.commit()
        return {
            "evento_id": carta_evento.carta_id,
            "cartas_a_mover_ids": cartas_a_mover_ids,
            "restantes_ids": [cid for cid, _ in restantes_info],
            "restantes_ordenes": [orden for _, orden in restantes_info],
        }
    finally:
        db.close()


def test_evento_early_train_to_paddington(client, partida_con_jugadores):
    partida_id = partida_con_jugadores["partida"].id
    assert client.post(f"/api/partidas/{partida_id}/start", json={"jugadorId": 1}).status_code == 200

    entorno = preparar_early_train_entorno(partida_id, jugador_evento=1)

    resp = client.post(
        f"/api/partidas/{partida_id}/eventos/early-train",
        json={"jugadorId": 1, "cartaEventoId": entorno["evento_id"]},
    )
    assert resp.status_code == 200

    estado = resp.json()
    assert estado["partidaId"] == partida_id
    assert len(estado["mazoRobo"]) == len(entorno["restantes_ids"])
    assert {c["carta_id"] for c in estado["mazoRobo"]} == set(entorno["restantes_ids"])


    db = next(get_session())
    try:
        cartas_mover = (
            db.query(Carta)
            .filter(Carta.carta_id.in_(entorno["cartas_a_mover_ids"]))
            .order_by(Carta.orden.asc())
            .all()
        )
        assert all(c.ubicacion == "descarte" for c in cartas_mover)
        ordenes = [c.orden for c in cartas_mover]
        assert ordenes == list(range(len(cartas_mover)))


        carta_evento = db.get(Carta, entorno["evento_id"])
        assert carta_evento.ubicacion == "removida"
        assert carta_evento.jugador_id is None

        restantes = (
            db.query(Carta)
            .filter(Carta.carta_id.in_(entorno["restantes_ids"]))
            .order_by(Carta.orden.asc())
            .all()
        )
        assert [c.carta_id for c in restantes] == entorno["restantes_ids"]
        assert [c.orden for c in restantes] == entorno["restantes_ordenes"]
    finally:
        db.close()
        
def test_look_into_the_ashes_exito(client, partida_con_jugadores):
    """Test exitoso para el evento look-into-the-ashes"""
    partida_id = partida_con_jugadores["partida"].id
    
    # Iniciar partida
    start_response = client.post(f"/api/partidas/{partida_id}/start", json={"jugadorId": 1})
    assert start_response.status_code == 200
    
    # Preparar cartas
    db = next(get_session())
    try:
        # Carta evento "Look into the Ashes" en mano del jugador
        carta_evento = Carta(
            nombre="Look into the Ashes",
            ubicacion="mano",
            orden=None,
            partida_id=partida_id,
            jugador_id=1,
        )
        db.add(carta_evento)
        
        # Carta en el descarte para robar
        carta_descarte = Carta(
            nombre="Carta Test",
            ubicacion="descarte",
            orden=1,
            partida_id=partida_id,
            jugador_id=None,
        )
        db.add(carta_descarte)
        db.commit()
        carta_evento_id = carta_evento.carta_id
        carta_seleccionada_id = carta_descarte.carta_id
    finally:
        db.close()
    
    # Ejecutar el evento
    payload = {
        "jugadorId": 1,
        "cartaEventoId": carta_evento_id,
        "cartaSeleccionadaId": carta_seleccionada_id
    }
    
    response = client.post(
        f"/api/partidas/{partida_id}/eventos/look-into-the-ashes",
        json=payload
    )
    
    print(f"Response status: {response.status_code}")
    if response.status_code != 200:
        print(f"Error response: {response.text}")
    
    assert response.status_code == 200, f"Expected 200, got {response.status_code}. Response: {response.text}"
    
    data = response.json()
    assert data["carta_id"] == carta_seleccionada_id
    assert data["ubicacion"] == "mano"
    assert data["jugador_id"] == 1
    
    # Verificar en la base de datos
    db = next(get_session())
    try:
        # La carta del descarte ahora está en mano
        carta_robada_db = db.query(Carta).filter(Carta.carta_id == carta_seleccionada_id).first()
        assert carta_robada_db.ubicacion == "mano"
        assert carta_robada_db.jugador_id == 1
        assert carta_robada_db.orden is None
        
        # La carta evento PERMANECE en mano (se descarta desde frontend)
        carta_evento_db = db.query(Carta).filter(Carta.carta_id == carta_evento_id).first()
        assert carta_evento_db.ubicacion == "mano"
        assert carta_evento_db.jugador_id == 1
        assert carta_evento_db.orden is None
    finally:
        db.close()

def test_flow_completo_point_your_suspicion(client, partida_con_sets_y_secretos):
    datos = partida_con_sets_y_secretos
    partida_id = datos["partida_id"]
    
    # point-your-suspicion-activar
    db = next(get_session())
    try:
        carta_evento = Carta(
            nombre="Point Your Suspicion",
            ubicacion="mano",
            orden=None,
            partida_id=partida_id,
            jugador_id=datos["atacante_id"],
        )
        db.add(carta_evento)
        db.commit()
        carta_evento_id = carta_evento.carta_id
    finally:
        db.close()
    
    payload_activar = {
        "jugadorId": datos["atacante_id"],
        "cartaEventoId": carta_evento_id
    }
    
    response_activar = client.post(
        f"/api/partidas/{partida_id}/eventos/point-your-suspicion/activar",
        json=payload_activar
    )
    
    assert response_activar.status_code == 200
    
    # point-your-suspicion
    payload_revelar = {
        "targetId": datos["victima_id"],
        "secretoId": datos["secreto_victima_id"]
    }
    
    response_revelar = client.post(
        f"/api/partidas/{partida_id}/eventos/point-your-suspicion",
        json=payload_revelar
    )
    
    assert response_revelar.status_code == 200
    
    data = response_revelar.json()
    assert data["revelado"] == True
    assert data["secreto_id"] == datos["secreto_victima_id"]
    
    # Verificar base de datos
    db = next(get_session())
    try:
        # evento descartado
        carta_evento_db = db.query(Carta).filter(Carta.carta_id == carta_evento_id).first()
        assert carta_evento_db.ubicacion == "descarte"
        
        # secreto revelado
        secreto_db = db.query(Secreto).filter(Secreto.secreto_id == datos["secreto_victima_id"]).first()
        assert secreto_db.revelado == True
    finally:
        db.close()

def test_activar_point_your_suspicion_fuera_de_turno(client, partida_con_jugadores):
    partida_id = partida_con_jugadores["partida"].id
    
    # Iniciar partida (turno del jugador 1)
    start_response = client.post(f"/api/partidas/{partida_id}/start", json={"jugadorId": 1})
    assert start_response.status_code == 200
    
    # evento lo tiene jugador 2
    db = next(get_session())
    try:
        carta_evento = Carta(
            nombre="Point Your Suspicion",
            ubicacion="mano",
            orden=None,
            partida_id=partida_id,
            jugador_id=2,
        )
        db.add(carta_evento)
        db.commit()
        carta_evento_id = carta_evento.carta_id
    finally:
        db.close()
    
    # Jugador 2 trata de jugarlo fuera de turno
    payload = {
        "jugadorId": 2,
        "cartaEventoId": carta_evento_id
    }
    
    response = client.post(
        f"/api/partidas/{partida_id}/eventos/point-your-suspicion/activar",
        json=payload
    )
    
    assert response.status_code == 403
    assert "No es tu turno" in response.json()["detail"]
    
    # Verificar que no se descarto
    db = next(get_session())
    try:
        carta_evento_db = db.query(Carta).filter(Carta.carta_id == carta_evento_id).first()
        assert carta_evento_db.ubicacion == "mano"
        assert carta_evento_db.jugador_id == 2
    finally:
        db.close()

def test_point_your_suspicion_partida_no_encontrada(client, partida_con_sets_y_secretos):
    datos = partida_con_sets_y_secretos
    partida_id_inexistente = "partida-inexistente"
    
    payload = {
        "targetId": datos["victima_id"],
        "secretoId": datos["secreto_victima_id"]
    }
    
    response = client.post(
        f"/api/partidas/{partida_id_inexistente}/eventos/point-your-suspicion",
        json=payload
    )
    
    assert response.status_code == 404
    assert "Partida no encontrada" in response.json()["detail"]
    
def test_crear_partida_privada_exito(client):
    payload = {
        "nombre": "Partida Privada Test",
        "maxJugadores": 4,
        "nombreUsuario": "HostPrivado",
        "fechaNacimiento": "1990-01-01",
        "privada": True,
        "password": "mi_contraseña_segura"
    }

    response = client.post("/api/partidas", json=payload)
    assert response.status_code == 201, f"Expected 201, got {response.status_code}. Response: {response.text}"
    data = response.json()
    assert data["privada"] is True

    # Verificar en la DB que la contraseña existe y está hasheada (no es igual al plaintext)
    db = next(get_session())
    try:
        partida_db = db.query(Partida).filter(Partida.id == data["id"]).first()
        assert partida_db is not None
        assert partida_db.contraseña is not None
        assert partida_db.contraseña != "mi_contraseña_segura"
    finally:
        db.close()


def test_crear_partida_privada_falla_sin_contraseña(client):
    payload = {
        "nombre": "Partida Privada Sin Pw",
        "maxJugadores": 4,
        "nombreUsuario": "HostPrivado",
        "fechaNacimiento": "1990-01-01",
        "privada": True
        # no password
    }

    response = client.post("/api/partidas", json=payload)
    assert response.status_code == 400
    assert "contraseña es obligatoria" in response.json()["detail"].lower()
    
def test_random_discard_exito(client, partida_con_jugadores):
    partida_id = partida_con_jugadores["partida"].id
    
    # Iniciar partida
    start_response = client.post(f"/api/partidas/{partida_id}/start", json={"jugadorId": 1})
    assert start_response.status_code == 200
    
    # Obtener las cartas iniciales que ya están en mano del jugador
    db = next(get_session())
    try:
        cartas_iniciales = db.query(Carta).filter(
            Carta.partida_id == partida_id,
            Carta.jugador_id == 1,
            Carta.ubicacion == "mano"
        ).all()
        
        cartas_iniciales_count = len(cartas_iniciales)
        carta_ids_iniciales = [c.carta_id for c in cartas_iniciales]
    finally:
        db.close()
    
    # Ejecutar descarte aleatorio
    payload = {
        "jugadorId": 1
    }
    
    response = client.post(f"/api/partidas/{partida_id}/cartas/random-discard",json=payload)
    
    assert response.status_code == 200
    
    data = response.json()
    assert data["ubicacion"] == "descarte"
    assert data["jugador_id"] is None
    assert data["partida_id"] == partida_id
    assert data["carta_id"] in carta_ids_iniciales  # La carta descartada debe ser una de las que estaban en mano
    
    db = next(get_session())
    try:
        # Verificar que este en el descarte
        carta_descartada_db = db.query(Carta).filter(Carta.carta_id == data["carta_id"]).first()
        assert carta_descartada_db.ubicacion == "descarte"
        assert carta_descartada_db.jugador_id is None
        assert carta_descartada_db.orden is not None
        
        # Verificar que las cartas en mano son las iniciales menos 1
        cartas_restantes = db.query(Carta).filter(
            Carta.partida_id == partida_id,
            Carta.jugador_id == 1,
            Carta.ubicacion == "mano"
        ).all()
        assert len(cartas_restantes) == cartas_iniciales_count - 1
    finally:
        db.close()

def test_random_discard_partida_no_encontrada(client, partida_con_jugadores):
    partida_id_inexistente = "no esxiste"
    
    payload = {
        "jugadorId": 1
    }
    
    response = client.post(f"/api/partidas/{partida_id_inexistente}/cartas/random-discard",json=payload)
    
    assert response.status_code == 404
    assert "Partida no encontrada" in response.json()["detail"]
@pytest.fixture
def card_trade_context():
    db = next(get_session())
    try:
        partida = Partida(
            id="partida-card-trade",
            nombre="Card Trade Test",
            estado="en_curso",
            maxJugadores=4,
            host=1,
            cantidad_jugadores=2,
            turno_actual=1,
        )
        jugador_evento = Jugador(
            jugador_id=1,
            username="Jugador Evento",
            cumpleaños="1990-01-01",
            partida_id=partida.id,
        )
        jugador_objetivo = Jugador(
            jugador_id=2,
            username="Jugador Objetivo",
            cumpleaños="1991-02-02",
            partida_id=partida.id,
        )

        carta_evento = Carta(
            nombre="Card Trade",
            ubicacion="mano",
            orden=None,
            partida_id=partida.id,
            jugador_id=jugador_evento.jugador_id,
        )
        carta_ofrecida = Carta(
            nombre="Hercule Poirot",
            ubicacion="mano",
            orden=None,
            partida_id=partida.id,
            jugador_id=jugador_evento.jugador_id,
        )
        carta_elegida = Carta(
            nombre="Miss Marple",
            ubicacion="mano",
            orden=None,
            partida_id=partida.id,
            jugador_id=jugador_objetivo.jugador_id,
        )

        secreto_evento = Secreto(
            descripcion="Secreto jugador evento",
            revelado=False,
            partida_id=partida.id,
            jugador_id=jugador_evento.jugador_id,
        )
        secreto_objetivo = Secreto(
            descripcion="Secreto jugador objetivo",
            revelado=False,
            partida_id=partida.id,
            jugador_id=jugador_objetivo.jugador_id,
        )

        db.add(partida)
        db.add_all([jugador_evento, jugador_objetivo])
        db.add_all([carta_evento, carta_ofrecida, carta_elegida])
        db.add_all([secreto_evento, secreto_objetivo])
        db.commit()

        return {
            "partida_id": partida.id,
            "jugador_evento_id": jugador_evento.jugador_id,
            "jugador_objetivo_id": jugador_objetivo.jugador_id,
            "cartas": {
                "evento": carta_evento.carta_id,
                "ofrecida": carta_ofrecida.carta_id,
                "elegida": carta_elegida.carta_id,
            },
            "secretos": {
                "evento": secreto_evento.secreto_id,
                "objetivo": secreto_objetivo.secreto_id,
            },
        }
    finally:
        db.close()


def test_jugar_card_trade_intercambia_cartas_y_revela_secreto(client, card_trade_context):
    ctx = card_trade_context
    payload = {
        "jugadorId": ctx["jugador_evento_id"],
        "cartaEventoId": ctx["cartas"]["evento"],
        "jugadorObjetivoId": ctx["jugador_objetivo_id"],
        "cartaOfrecidaId": ctx["cartas"]["ofrecida"],
        "cartaElegidaId": ctx["cartas"]["elegida"],
        "secretosARevelarIds": [ctx["secretos"]["objetivo"]],
    }

    response = client.post(
        f"/api/partidas/{ctx['partida_id']}/eventos/card-trade",
        json=payload,
    )
    assert response.status_code == 200, response.text
    data = response.json()

    assert data["jugadorId"] == ctx["jugador_evento_id"]
    assert data["jugadorObjetivoId"] == ctx["jugador_objetivo_id"]
    assert data["efectos"] == {}
    assert len(data["secretosRevelados"]) == 1
    assert data["secretosRevelados"][0]["secreto_id"] == ctx["secretos"]["objetivo"]

    db = next(get_session())
    try:
        carta_evento = db.query(Carta).filter(Carta.carta_id == ctx["cartas"]["evento"]).one()
        carta_ofrecida = db.query(Carta).filter(Carta.carta_id == ctx["cartas"]["ofrecida"]).one()
        carta_elegida = db.query(Carta).filter(Carta.carta_id == ctx["cartas"]["elegida"]).one()
        secreto_objetivo = db.query(Secreto).filter(Secreto.secreto_id == ctx["secretos"]["objetivo"]).one()

        assert carta_evento.ubicacion == "descarte"
        assert carta_evento.jugador_id is None
        assert carta_ofrecida.jugador_id == ctx["jugador_objetivo_id"]
        assert carta_elegida.jugador_id == ctx["jugador_evento_id"]
        assert secreto_objetivo.revelado is True
    finally:
        db.close()


def test_resolver_card_trade_social_faux_revela_secreto(client, card_trade_context):
    ctx = card_trade_context
    payload = {
        "jugadorId": ctx["jugador_evento_id"],
        "secretoId": ctx["secretos"]["evento"],
    }

    response = client.post(
        f"/api/partidas/{ctx['partida_id']}/eventos/card-trade/social-faux",
        json=payload,
    )
    assert response.status_code == 200, response.text
    data = response.json()

    assert data["secreto"]["secreto_id"] == ctx["secretos"]["evento"]
    assert data["secreto"]["jugador_id"] == ctx["jugador_evento_id"]
    assert data["secreto"]["revelado"] is True

    db = next(get_session())
    try:
        secreto = db.query(Secreto).filter(Secreto.secreto_id == ctx["secretos"]["evento"]).one()
        assert secreto.revelado is True
    finally:
        db.close()
    
def test_evento_dead_card_folly_intercambia_cartas(client, partida_con_jugadores):
    partida_id = partida_con_jugadores["partida"].id

    start_response = client.post(f"/api/partidas/{partida_id}/start", json={"jugadorId": 1})
    assert start_response.status_code == 200, start_response.text

    db = next(get_session())
    try:
        carta_evento = Carta(
            nombre="Dead Card Folly",
            ubicacion="mano",
            partida_id=partida_id,
            jugador_id=1,
            orden=None,
        )
        db.add(carta_evento)
        db.commit()
        db.refresh(carta_evento)

        primera_carta_j1 = (
            db.query(Carta)
            .filter(
                Carta.partida_id == partida_id,
                Carta.jugador_id == 1,
                Carta.ubicacion == "mano",
                Carta.carta_id != carta_evento.carta_id,
            )
            .first()
        )
        primera_carta_j2 = (
            db.query(Carta)
            .filter(
                Carta.partida_id == partida_id,
                Carta.jugador_id == 2,
                Carta.ubicacion == "mano",
            )
            .first()
        )
        assert primera_carta_j1 is not None
        assert primera_carta_j2 is not None

        primera_carta_j1.nombre = "Blackmailed"
        primera_carta_j2.nombre = "Social Faux Pas"
        db.commit()

        # Guardamos todos los IDs antes de cerrar la sesión
        carta_evento_id = carta_evento.carta_id
        carta_j1_id = primera_carta_j1.carta_id
        carta_j2_id = primera_carta_j2.carta_id
        selecciones = {
            1: carta_j1_id,
            2: carta_j2_id,
        }
    finally:
        db.close()

    payload = {
        "jugadorId": 1,
        "cartaEventoId": carta_evento_id,
        "direccion": "derecha",
        "selecciones": selecciones,
    }

    response = client.post(f"/api/partidas/{partida_id}/eventos/dead-card-folly", json=payload)
    assert response.status_code == 200, response.text

    data = response.json()
    assert data["ok"] is True
    assert "blackmailed" in data["efectos"]
    assert "socialFauxPas" in data["efectos"]
    assert any(e["tipo"] == "blackmailed" for e in data["efectosPendientes"])
    assert any(e["tipo"] == "social_faux_pas" for e in data["efectosPendientes"])

    db = next(get_session())
    try:
        carta_1 = db.query(Carta).filter(Carta.carta_id == carta_j1_id).first()
        carta_2 = db.query(Carta).filter(Carta.carta_id == carta_j2_id).first()
        carta_evento_db = db.query(Carta).filter(Carta.carta_id == carta_evento_id).first()
    finally:
        db.close()

    assert carta_1.jugador_id == 2
    assert carta_2.jugador_id == 1
    assert carta_evento_db.ubicacion == "descarte"
    assert carta_evento_db.jugador_id is None

def test_dead_card_folly_social_faux_revela_secreto(client, partida_con_jugadores):
    partida_id = partida_con_jugadores["partida"].id

    start_response = client.post(f"/api/partidas/{partida_id}/start", json={"jugadorId": 1})
    assert start_response.status_code == 200, start_response.text

    db = next(get_session())
    try:
        secreto = (
            db.query(Secreto)
            .filter(
                Secreto.partida_id == partida_id,
                Secreto.jugador_id == 1,
                Secreto.revelado == False,
            )
            .first()
        )
        assert secreto is not None
        secreto_id = secreto.secreto_id
    finally:
        db.close()

    payload = {
        "jugadorId": 1,
        "secretoId": secreto_id,
    }

    response = client.post(
        f"/api/partidas/{partida_id}/eventos/dead-card-folly/social-faux",
        json=payload,
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["secreto"]["secreto_id"] == secreto_id
    assert data["secreto"]["revelado"] is True

    db = next(get_session())
    try:
        secreto_db = db.query(Secreto).filter(Secreto.secreto_id == secreto_id).one()
    finally:
        db.close()
    assert secreto_db.revelado is True

def test_jugar_not_so_fast_cancela_carta_individual(client, partida_con_jugadores):
    """Test para cancelar una carta individual con Not so Fast..."""
    partida_id = partida_con_jugadores["partida"].id
    
    # Iniciar partida
    start_response = client.post(f"/api/partidas/{partida_id}/start", json={"jugadorId": 1})
    assert start_response.status_code == 200
    
    # Preparar cartas
    db = next(get_session())
    try:
        # Carta evento Not so Fast en mano del jugador 1
        carta_evento = Carta(
            nombre="Not so Fast...",
            ubicacion="mano",
            orden=None,
            partida_id=partida_id,
            jugador_id=1,
        )
        db.add(carta_evento)
        
        # Carta a cancelar en mano del jugador 2
        carta_a_cancelar = Carta(
            nombre="Cards off the table",
            ubicacion="mano",
            orden=None,
            partida_id=partida_id,
            jugador_id=2,
        )
        db.add(carta_a_cancelar)
        db.commit()
        
        carta_evento_id = carta_evento.carta_id
        carta_cancelar_id = carta_a_cancelar.carta_id
    finally:
        db.close()
    
    # Ejecutar el evento
    payload = {
        "jugadorId": 1,
        "cartaEventoId": carta_evento_id,
        "eventoaCancelarId": carta_cancelar_id
    }
    
    response = client.post(
        f"/api/partidas/{partida_id}/eventos/not-so-fast",
        json=payload
    )
    
    print(f"Response status: {response.status_code}")
    if response.status_code != 200:
        print(f"Error response: {response.text}")
    
    assert response.status_code == 200, f"Expected 200, got {response.status_code}. Response: {response.text}"
    
    data = response.json()
    assert data["ok"] is True
    
    # Verificar en la base de datos
    db = next(get_session())
    try:
        # Ambas cartas deberían estar en el descarte
        carta_evento_db = db.query(Carta).filter(Carta.carta_id == carta_evento_id).first()
        carta_cancelada_db = db.query(Carta).filter(Carta.carta_id == carta_cancelar_id).first()
        
        assert carta_evento_db.ubicacion == "descarte"
        assert carta_evento_db.jugador_id is None
        assert carta_cancelada_db.ubicacion == "descarte"
        assert carta_cancelada_db.jugador_id is None
    finally:
        db.close()

def test_jugar_not_so_fast_cancela_set_de_cartas(client, partida_con_sets_y_secretos):
    """Test para cancelar un set de cartas con Not so Fast..."""
    datos = partida_con_sets_y_secretos
    partida_id = datos["partida_id"]
    
    # Preparar cartas
    db = next(get_session())
    try:
        # Carta evento Not so Fast en mano del jugador 1
        carta_evento = Carta(
            nombre="Not so Fast...",
            ubicacion="mano",
            orden=None,
            partida_id=partida_id,
            jugador_id=datos["atacante_id"],
        )
        db.add(carta_evento)
        
        # Crear cartas en mano del jugador objetivo (víctima) para el set
        cartas_set_ids = []
        for i in range(3):
            carta = Carta(
                nombre=f"Miss Marple",  # Mismo nombre para formar set
                ubicacion="mano",  # ¡IMPORTANTE: en mano, no en set!
                orden=None,
                partida_id=partida_id,
                jugador_id=datos["victima_id"],  # Todas del mismo jugador
            )
            db.add(carta)
            db.flush()
            cartas_set_ids.append(carta.carta_id)
        
        db.commit()
        carta_evento_id = carta_evento.carta_id
    finally:
        db.close()
    
    # Ejecutar el evento
    payload = {
        "jugadorId": datos["atacante_id"],
        "cartaEventoId": carta_evento_id,
        "cartasSetId": cartas_set_ids
    }
    
    response = client.post(
        f"/api/partidas/{partida_id}/eventos/not-so-fast",
        json=payload
    )
    
    print(f"Response status: {response.status_code}")
    if response.status_code != 200:
        print(f"Error response: {response.text}")
    
    assert response.status_code == 200, f"Expected 200, got {response.status_code}. Response: {response.text}"
    
    data = response.json()
    assert data["ok"] is True
    
    # Verificar en la base de datos
    db = next(get_session())
    try:
        # Todas las cartas del set deberían estar en el descarte
        for carta_id in cartas_set_ids:
            carta_db = db.query(Carta).filter(Carta.carta_id == carta_id).first()
            assert carta_db.ubicacion == "descarte"
            assert carta_db.jugador_id is None
        
        # La carta evento también debería estar en el descarte
        carta_evento_db = db.query(Carta).filter(Carta.carta_id == carta_evento_id).first()
        assert carta_evento_db.ubicacion == "descarte"
        assert carta_evento_db.jugador_id is None
    finally:
        db.close()

def test_jugar_not_so_fast_solo_descarta_evento(client, partida_con_jugadores):
    """Test cuando solo se descarta el evento sin cancelar nada más"""
    partida_id = partida_con_jugadores["partida"].id
    
    # Iniciar partida
    start_response = client.post(f"/api/partidas/{partida_id}/start", json={"jugadorId": 1})
    assert start_response.status_code == 200
    
    # Preparar carta evento
    db = next(get_session())
    try:
        carta_evento = Carta(
            nombre="Not so Fast...",
            ubicacion="mano",
            orden=None,
            partida_id=partida_id,
            jugador_id=1,
        )
        db.add(carta_evento)
        db.commit()
        carta_evento_id = carta_evento.carta_id
    finally:
        db.close()
    
    # Ejecutar el evento sin carta individual ni set
    payload = {
        "jugadorId": 1,
        "cartaEventoId": carta_evento_id
    }
    
    response = client.post(
        f"/api/partidas/{partida_id}/eventos/not-so-fast",
        json=payload
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    
    # Verificar en la base de datos
    db = next(get_session())
    try:
        carta_evento_db = db.query(Carta).filter(Carta.carta_id == carta_evento_id).first()
        assert carta_evento_db.ubicacion == "descarte"
        assert carta_evento_db.jugador_id is None
    finally:
        db.close()