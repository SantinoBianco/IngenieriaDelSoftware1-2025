import pytest
import sys
import os

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
def partida_con_jugadores_y_cartas():
    db = next(get_session())
    
    
    partida = Partida(
        id="test-partida-id",
        nombre="Partida de Test",
        estado="en_curso",
        maxJugadores=4,
        host=1,
        cantidad_jugadores=2,
        turno_actual=1
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
        
        # Crear cartas específicas para formar sets
        cartas_data = [
            
            {"nombre": "Tommy Beresford", "ubicacion": "mano", "jugador_id": 1},
            {"nombre": "Tuppence Beresford", "ubicacion": "mano", "jugador_id": 1},
             
            {"nombre": "Hercule Poirot", "ubicacion": "mano", "jugador_id": 1},
            {"nombre": "Hercule Poirot", "ubicacion": "mano", "jugador_id": 1},
            {"nombre": "Hercule Poirot", "ubicacion": "mano", "jugador_id": 1},
            
            {"nombre": "Miss Marple", "ubicacion": "mano", "jugador_id": 2},
            {"nombre": "Wildcard", "ubicacion": "robo", "jugador_id": None},
        ]
        
        cartas = []
        for idx, carta_data in enumerate(cartas_data):
            carta = Carta(
                nombre=carta_data["nombre"],
                ubicacion=carta_data["ubicacion"],
                orden=idx,
                partida_id="test-partida-id",
                jugador_id=carta_data["jugador_id"],
            )
            cartas.append(carta)
        
        db.add_all(cartas)
        db.commit()
        
        # Crear secretos
        from src.crud.secreto_crud import SECRETOS
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
        
        carta_ids = {f"{carta.nombre}_{idx}": carta.carta_id for idx, carta in enumerate(cartas)}
        
        yield {
            "partida": partida,
            "jugadores": [jugador1, jugador2],
            "cartas": cartas,
            "carta_ids": carta_ids
        }
    finally:
        db.close()

def test_jugar_y_resolver_set_beresford(client, partida_con_jugadores_y_cartas):
    """Test para jugar un set de Beresford exitosamente - revela un secreto"""
    partida_id = partida_con_jugadores_y_cartas["partida"].id
    carta_ids = partida_con_jugadores_y_cartas["carta_ids"]
    
    # Todos los sets revelan un secreto (excepto Parker Pyne que lo oculta)
    db = next(get_session())
    secreto = db.query(Secreto).filter(Secreto.partida_id == partida_id).first()
    secreto_id = secreto.secreto_id
    db.close()
    
    payload = {
        "jugador_id": 1,
        "cartas_ids": [
            carta_ids["Tommy Beresford_0"],
            carta_ids["Tuppence Beresford_1"]
        ],
        "nombre_set": "Set de Beresford",
        "jugador_id_objetivo": None,
        "secreto_id_objetivo": secreto_id  # Todos los sets revelan secreto
    }
    
    response = client.post(f"/api/partidas/{partida_id}/jugar-y-resolver-set", json=payload)
    
    print(f"Response status: {response.status_code}")
    if response.status_code != 201:
        print(f"Error response: {response.text}")
    
    assert response.status_code == 201, f"Expected 201, got {response.status_code}. Response: {response.text}"
    
    data = response.json()
    assert data["nombre"] == "Set de Beresford"
    assert data["owner_id"] == 1
    assert data["status"] == "completo"
    assert len(data["cartas"]) == 2

def test_jugar_y_resolver_set_poirot(client, partida_con_jugadores_y_cartas):
    """Test para jugar un set de Hercule Poirot exitosamente - revela un secreto"""
    partida_id = partida_con_jugadores_y_cartas["partida"].id
    carta_ids = partida_con_jugadores_y_cartas["carta_ids"]
    
    db = next(get_session())
    cartas_poirot = db.query(Carta).filter(
        Carta.partida_id == partida_id,
        Carta.jugador_id == 1,
        Carta.nombre == "Hercule Poirot"
    ).all()
    
    # Todos los sets revelan un secreto (excepto Parker Pyne que lo oculta)
    secreto = db.query(Secreto).filter(Secreto.partida_id == partida_id).first()
    secreto_id = secreto.secreto_id
    db.close()
    
    assert len(cartas_poirot) >= 3, f"Solo hay {len(cartas_poirot)} cartas de Hercule Poirot, se necesitan 3"
    
    payload = {
        "jugador_id": 1,
        "cartas_ids": [
            cartas_poirot[0].carta_id,
            cartas_poirot[1].carta_id,
            cartas_poirot[2].carta_id
        ],
        "nombre_set": "Set de Hercule Poirot",
        "jugador_id_objetivo": None,
        "secreto_id_objetivo": secreto_id  # Todos los sets revelan secreto
    }
    
    response = client.post(f"/api/partidas/{partida_id}/jugar-y-resolver-set", json=payload)
    
    assert response.status_code == 201, f"Expected 201, got {response.status_code}. Response: {response.text}"
    
    data = response.json()
    assert data["nombre"] == "Set de Hercule Poirot"
    assert data["owner_id"] == 1
    assert len(data["cartas"]) == 3

def test_jugar_y_resolver_set_nombre_incorrecto(client, partida_con_jugadores_y_cartas):
    """Test para cuando el nombre del set no coincide con las cartas"""
    partida_id = partida_con_jugadores_y_cartas["partida"].id
    carta_ids = partida_con_jugadores_y_cartas["carta_ids"]
    
    # Obtener un secreto válido
    db = next(get_session())
    secreto = db.query(Secreto).filter(Secreto.partida_id == partida_id).first()
    secreto_id = secreto.secreto_id
    db.close()
    
    payload = {
        "jugador_id": 1,
        "cartas_ids": [
            carta_ids["Tommy Beresford_0"],
            carta_ids["Tuppence Beresford_1"]
        ],
        "nombre_set": "Set de Hercule Poirot",  # Nombre incorrecto
        "jugador_id_objetivo": None,
        "secreto_id_objetivo": secreto_id
    }
    
    response = client.post(f"/api/partidas/{partida_id}/jugar-y-resolver-set", json=payload)
    
    assert response.status_code == 400
    assert "Jugada invalida" in response.json()["detail"]

def test_jugar_y_resolver_set_partida_no_existe(client):
    """Test para cuando la partida no existe"""
    payload = {
        "jugador_id": 1,
        "cartas_ids": [1, 2],
        "nombre_set": "Set de Beresford",
        "jugador_id_objetivo": None,
        "secreto_id_objetivo": 1  # Incluir un ID aunque la partida no exista
    }
    
    response = client.post("/api/partidas/partida-inexistente/jugar-y-resolver-set", json=payload)
    
    assert response.status_code == 400
    assert "La partida especificada no existe" in response.json()["detail"]

def test_jugar_y_resolver_set_con_secreto(client, partida_con_jugadores_y_cartas):
    """Test para jugar un set que requiere seleccionar un secreto"""
    partida_id = partida_con_jugadores_y_cartas["partida"].id
    carta_ids = partida_con_jugadores_y_cartas["carta_ids"]
    
    db = next(get_session())
    secreto = db.query(Secreto).filter(Secreto.partida_id == partida_id).first()
    secreto_id = secreto.secreto_id
    db.close()
    
    payload = {
        "jugador_id": 1,
        "cartas_ids": [
            carta_ids["Tommy Beresford_0"],
            carta_ids["Tuppence Beresford_1"]
        ],
        "nombre_set": "Set de Beresford",
        "jugador_id_objetivo": None,
        "secreto_id_objetivo": secreto_id
    }
    
    response = client.post(f"/api/partidas/{partida_id}/jugar-y-resolver-set", json=payload)
    
    assert response.status_code == 201, f"Expected 201, got {response.status_code}. Response: {response.text}"
    
    data = response.json()
    assert data["nombre"] == "Set de Beresford"
    assert data["status"] == "completo"

@pytest.fixture
def partida_con_datos():
    db = next(get_session())

    partida = Partida(
        id="p-agregar-carta",
        nombre="Partida Test Agregar Carta",
        estado="en_curso",
        maxJugadores=4,
        host=1,
        cantidad_jugadores=2,
        turno_actual=1
    )

    db.add(partida)
    db.commit()

    jugador1 = Jugador(jugador_id=1, username="J1", cumpleaños="1990-01-01", partida_id=partida.id)
    jugador2 = Jugador(jugador_id=2, username="J2", cumpleaños="1991-02-02", partida_id=partida.id)
    db.add_all([jugador1, jugador2])
    db.commit()

    # Cartas: un Poirot en mano del jugador1 y otra en mano para crear el set más adelante
    carta1 = Carta(nombre="Hercule Poirot", ubicacion="mano", orden=0, partida_id=partida.id, jugador_id=1)
    carta2 = Carta(nombre="Hercule Poirot", ubicacion="mano", orden=1, partida_id=partida.id, jugador_id=1)
    carta_wild = Carta(nombre="Wildcard", ubicacion="mano", orden=2, partida_id=partida.id, jugador_id=1)

    db.add_all([carta1, carta2, carta_wild])
    db.commit()

    # Secretos mínimos
    from src.crud.secreto_crud import SECRETOS
    secretos = [Secreto(descripcion=s, revelado=False, partida_id=partida.id, jugador_id=None) for s in SECRETOS]
    db.add_all(secretos)
    db.commit()

    cartas = db.query(Carta).filter(Carta.partida_id == partida.id).all()
    carta_ids = {f"{carta.nombre}_{idx}": carta.carta_id for idx, carta in enumerate(cartas)}
    yield {
        "partida": partida,
        "jugadores": [jugador1, jugador2],
        "cartas": cartas,
        "carta_ids": carta_ids
    }

def test_agregar_carta_a_set_existente_endpoint(client, partida_con_datos):
    partida = partida_con_datos["partida"]
    carta_objs = partida_con_datos["cartas"]

    db = next(get_session())

    nuevo_set = Set(nombre="Set de Hercule Poirot", partida_id=partida.id, owner_id=1)
    db.add(nuevo_set)
    db.commit()
    db.refresh(nuevo_set)
    db.close()

    db2 = next(get_session())
    carta_para_agregar = db2.query(Carta).filter(
        Carta.partida_id == partida.id,
        Carta.jugador_id == 1,
        Carta.nombre == "Hercule Poirot"
    ).first()
    assert carta_para_agregar is not None
    carta_id_para_agregar = carta_para_agregar.carta_id
    db2.close()

    payload = {
        "carta_id": carta_id_para_agregar,
        "set_id": nuevo_set.set_id,
        "owner_id": 1,
        "jugador_id_objetivo": None,
        "secreto_id_objetivo": None
    }

    response = client.post(f"/api/partidas/{partida.id}/agregar-carta-a-set", json=payload)
    assert response.status_code == 200, f"Expected 200, got {response.status_code}. Resp: {response.text}"

    data = response.json()
    assert data["nombre"] == "Set de Hercule Poirot"
    assert int(data["owner_id"]) == 1 or data["owner_id"] == 1
    assert any(c["carta_id"] == carta_id_para_agregar for c in data["cartas"])

    db3 = next(get_session())
    carta_db = db3.query(Carta).filter(Carta.carta_id == carta_id_para_agregar).first()
    assert carta_db.ubicacion == "set"
    assert carta_db.jugador_id == 1
    db3.close()

    