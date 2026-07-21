import pytest 
from unittest.mock import MagicMock, patch, call 
from src.crud.carta_crud import CartaCRUD
from src.modelos.carta_modelo import Carta
from random import shuffle

@pytest.fixture 
def mock_session():
    return MagicMock() 

@pytest.fixture
def carta_crud(mock_session):
    """
    Instancia CartaCRUD e inyecta la sesión mockeada.
    reemplaza su db por el mock en lugar de la sesión real de SQLAlchemy.
    """
    return CartaCRUD(mock_session)

@patch("src.crud.carta_crud.Carta") 
def test_crear_cartas_iniciales(mock_carta_class, carta_crud, mock_session):
    mock_instance = MagicMock() 
    mock_carta_class.side_effect = lambda **kwargs: mock_instance 

    carta_crud.crear_cartas_iniciales("partida1") 
    
    mock_session.add_all.assert_called_once()
    mock_session.commit.assert_called_once()

def test_robar_cartas(carta_crud, mock_session):
    # Crea dos objetos falsos que simulan ser cartas de la base de datos
    carta1, carta2 = MagicMock(spec=Carta), MagicMock(spec=Carta)
    # Damos atributos a los mocks para la prueba.
    carta1.carta_id = 1
    carta2.carta_id = 2
    # Configuramos el mock de la sesión para que, al buscar cartas, devuelva nuestros mocks.
    mock_session.query.return_value.filter.return_value.order_by.return_value.limit.return_value.all.return_value = [carta1, carta2]
    # Ejecutamos el método a testear.
    cartas = carta_crud.robar_cartas("p1", 99, 2)
    # Verificamos que la función devolvió la cantidad correcta de cartas
    assert len(cartas) == 2
    # Verificamos que la función cambió la ubicación de la carta a "mano"
    assert carta1.ubicacion == "mano"
    # Verificamos que la carta ahora le pertenece al jugador correcto
    assert carta1.jugador_id == 99
    # Verificamos que se intentó guardar los cambios en la base de datos
    mock_session.commit.assert_called_once()

def test_repartir_NotSoFast_con_error_y_rollback(carta_crud, mock_session):
    carta_mock = MagicMock(spec=Carta)
    carta_mock.carta_id = 1
    carta_mock.nombre = "Not so Fast..."
    carta_mock.ubicacion = "robo"
    carta_mock.orden = 5
    carta_mock.jugador_id = None
    carta_mock.partida_id = "partida1"
    
    mock_session.query.return_value.filter.return_value.order_by.return_value.first.return_value = carta_mock
    
    # Simular error en el commit
    mock_session.commit.side_effect = Exception("Error de base de datos")
    
    # Verificar la excepción
    with pytest.raises(Exception, match="Error de base de datos"):
        carta_crud.repartir_NotSoFast("partida1", 99, "Not so Fast...")
    
    # Verificar que se hizo rollback
    mock_session.rollback.assert_called_once()

def test_repartir_NotSoFast_exito(carta_crud, mock_session):
    carta_mock = MagicMock(spec=Carta)
    carta_mock.carta_id = 1
    carta_mock.nombre = "Not so Fast..."
    carta_mock.ubicacion = "robo"
    carta_mock.orden = 5
    carta_mock.jugador_id = None
    carta_mock.partida_id = "partida1"
    
    mock_session.query.return_value.filter.return_value.order_by.return_value.first.return_value = carta_mock
    
    # Ejecutar el método
    resultado = carta_crud.repartir_NotSoFast("partida1", 99, "Not so Fast...")
    
    # Verificaciones
    mock_session.query.assert_called_with(Carta)
    
    filter_call = mock_session.query.return_value.filter
    assert filter_call.called
    
    assert carta_mock.ubicacion == "mano"
    assert carta_mock.jugador_id == 99
    assert carta_mock.orden is None
    
    mock_session.commit.assert_called_once()
    assert resultado is carta_mock

def test_descartar_cartas(carta_crud, mock_session):
   
    carta1, carta2 = MagicMock(spec=Carta), MagicMock(spec=Carta)
    carta1.carta_id = 1
    carta1.jugador_id = 10
    carta2.carta_id = 2
    carta2.jugador_id = 10
    
    mock_session.query.return_value.filter.return_value.all.side_effect = [
        [carta1, carta2],  
    ]
    #Simulamos otra posible consulta que busca la carta superior del mazo de descarte.
    mock_session.query.return_value.filter.return_value.order_by.return_value.first.return_value = (5,)  
    # Ejecutamos el método a testear.
    result = carta_crud.descartar_cartas([1,2], jugador_id=10)
    # Verificamos que las cartas esten en descarte
    assert all(c.ubicacion == "descarte" for c in result)
    mock_session.commit.assert_called_once()

def test_ver_mazo_descarte_con_cartas(carta_crud, mock_session):
    carta1 = MagicMock(spec=Carta)
    carta1.carta_id = 1
    carta1.ubicacion = "descarte"
    carta1.orden = 5
    
    carta2 = MagicMock(spec=Carta)
    carta2.carta_id = 2
    carta2.ubicacion = "descarte"
    carta2.orden = 4
    
    carta3 = MagicMock(spec=Carta)
    carta3.carta_id = 3
    carta3.ubicacion = "descarte"
    carta3.orden = 3

    mock_session.query.return_value.filter.return_value.order_by.return_value.limit.return_value.all.return_value = [
        carta1, carta2, carta3
    ]
    resultado = carta_crud.ver_mazo_descarte("partida1")

    assert len(resultado) == 3
    assert resultado == [carta1, carta2, carta3]
    
    mock_session.query.assert_called_with(Carta)
    mock_session.query.return_value.filter.assert_called_once()
    mock_session.query.return_value.filter.return_value.order_by.assert_called_once()
    mock_session.query.return_value.filter.return_value.order_by.return_value.limit.assert_called_once_with(5)

def test_ver_mazo_descarte_vacio(carta_crud, mock_session):
    mock_session.query.return_value.filter.return_value.order_by.return_value.limit.return_value.all.return_value = [] # vacia pues no hay cartas en descarte
    resultado = carta_crud.ver_mazo_descarte("partida1")

    assert len(resultado) == 0
    assert resultado == []


def test_obtener_cartas_por_jugador(carta_crud, mock_session):
    
    carta = MagicMock(spec=Carta)
    carta.jugador_id = 50
    # Configuramos qué debe devolver el método .to_dict() de nuestra carta falsa.
    carta.to_dict.return_value = {"id": 1, "nombre": "X"}
    mock_session.query.return_value.filter.return_value.all.return_value = [carta]
    # Ejecutamos el método a testear.
    result = carta_crud.obtener_cartas_por_jugador("p1")
    # Verificamos que el ID de la partida en el resultado es correcto
    assert result["partidaId"] == "p1"
    # Verificamos que el resultado contiene una entrada para nuestro jugador
    assert 50 in result["hands"]

def test_obtener_estado_mazos(carta_crud, mock_session):
    
    carta_robo = MagicMock(spec=Carta)
    carta_robo.to_dict.return_value = {"id": 1}
    carta_desc = MagicMock(spec=Carta)
    carta_desc.to_dict.return_value = {"id": 2}
    carta_draf = MagicMock(spec=Carta)
    carta_draf.to_dict.return_value = {"id": 3}
    # Programamos la base de datos para que devuelva resultados DIFERENTES en llamadas sucesivas
    mock_session.query.return_value.filter.return_value.order_by.return_value.all.side_effect = [
        [carta_robo],  
        [carta_desc],  
        [carta_draf],  
    ]

    result = carta_crud.obtener_estado_mazos("p1")

    assert result["mazoRobo"][0]["id"] == 1
    assert result["mazoDescarte"][0]["id"] == 2
    assert result["mazoDraft"][0]["id"] == 3

def test_obtener_draft(carta_crud, mock_session):
    carta1 = MagicMock(spec=Carta)
    carta2 = MagicMock(spec=Carta)

    # Simulamos que la consulta a la base trae justo las cartas que están en draft.
    mock_session.query.return_value.filter.return_value.order_by.return_value.all.return_value = [
        carta1,
        carta2,
    ]

    resultado = carta_crud.obtener_draft("partida-1")

    mock_session.query.assert_called_once_with(Carta)  # se consulta la tabla correcta
    assert resultado == [carta1, carta2]

def test_rellenar_draft(carta_crud, mock_session, monkeypatch):
    # Simula que ya hay 1 carta en draft, por lo que faltan 2 (DRAFT_SIZE = 3).
    carta_draft_existente = MagicMock(spec=Carta)
    monkeypatch.setattr(
        carta_crud,
        "obtener_draft",
        lambda partida_id: [carta_draft_existente],
    )

    # Cartas que vendrían del mazo de robo.
    carta_robo_1 = MagicMock(spec=Carta)
    carta_robo_2 = MagicMock(spec=Carta)

    # El query a robo debe devolver esas dos cartas.
    mock_session.query.return_value.filter.return_value.order_by.return_value.limit.return_value.all.return_value = [
        carta_robo_1,
        carta_robo_2,
    ]

    nuevas = carta_crud.rellenar_draft("partida-id")

    assert nuevas == [carta_robo_1, carta_robo_2]
    # Se marcan como cartas de draft, sin jugador y con orden consecutivo.
    assert carta_robo_1.ubicacion == "draft"
    assert carta_robo_2.ubicacion == "draft"
    assert carta_robo_1.jugador_id is None
    assert carta_robo_2.jugador_id is None
    assert carta_robo_1.orden == 1  
    assert carta_robo_2.orden == 2

def test_rellenar_draft_sin_faltantes(carta_crud, mock_session, monkeypatch):
    # Simula que ya hay 3 cartas en el draft, por lo que no faltan.
    cartas_en_draft = [MagicMock(spec=Carta) for _ in range(3)]
    monkeypatch.setattr(
        carta_crud,
        "obtener_draft",
        lambda partida_id: cartas_en_draft,
    )

    nuevas = carta_crud.rellenar_draft("partida-id")

    assert nuevas == []
    
    mock_session.query.return_value.filter.return_value.order_by.return_value.limit.assert_not_called()

# testeo ordenarlas
def test_compactar_draft(carta_crud, monkeypatch):
    carta1 = MagicMock(spec=Carta)
    carta2 = MagicMock(spec=Carta)
    carta3 = MagicMock(spec=Carta)

    # Orden inicial desordenado.
    carta1.orden = 10
    carta2.orden = 5
    carta3.orden = 0

    monkeypatch.setattr(
        carta_crud,
        "obtener_draft",
        lambda partida_id: [carta1, carta2, carta3],
    )

    carta_crud.compactar_draft("partida-id")

    assert carta1.orden == 0
    assert carta2.orden == 1
    assert carta3.orden == 2

def test_tomar_carta_draft(carta_crud, mock_session, monkeypatch):
    carta = MagicMock(spec=Carta)
    carta.ubicacion = "draft"
    carta.carta_id = 7

    # Primera query dentro de tomar_carta_draft devuelve la carta elegida.
    mock_session.query.return_value.filter.return_value.one_or_none.return_value = carta

    rellenar_mock = MagicMock()
    compactar_mock = MagicMock()
    monkeypatch.setattr(carta_crud, "rellenar_draft", rellenar_mock)
    monkeypatch.setattr(carta_crud, "compactar_draft", compactar_mock)

    result = carta_crud.tomar_carta_draft("partida-id", carta_id=7, jugador_id=42)

    assert result is carta
    assert carta.ubicacion == "mano"
    assert carta.jugador_id == 42
    assert carta.orden is None

    mock_session.flush.assert_called_once()
    rellenar_mock.assert_called_once_with("partida-id")
    compactar_mock.assert_called_once_with("partida-id")
    mock_session.commit.assert_called_once()

from src.modelos.jugador_modelo import Jugador  

def test_jugar_cards_off_the_table_exito(carta_crud, mock_session, monkeypatch):
    carta_evento = MagicMock(spec=Carta)
    carta_evento.carta_id = 10
    carta_evento.partida_id = "p1"
    carta_evento.nombre = "Cards off the table"
    carta_evento.jugador_id = 1
    carta_evento.ubicacion = "mano"

    jugador_objetivo = MagicMock(spec=Jugador)
    jugador_objetivo.partida_id = "p1"

    not_so_fast_1 = MagicMock(spec=Carta)
    not_so_fast_1.carta_id = 101
    not_so_fast_1.nombre = "Not so Fast..."
    not_so_fast_2 = MagicMock(spec=Carta)
    not_so_fast_2.carta_id = 102
    not_so_fast_2.nombre = "Not so Fast..."
    otra_carta = MagicMock(spec=Carta)
    otra_carta.nombre = "Otra"

    carta_event_query = MagicMock()
    carta_event_query.filter.return_value.first.return_value = carta_evento  

    jugador_query = MagicMock()
    jugador_query.filter.return_value.one_or_none.return_value = jugador_objetivo

    cartas_obj_query = MagicMock()
    cartas_obj_query.filter.return_value.all.return_value = [
        not_so_fast_1, not_so_fast_2, otra_carta
    ]

    mock_session.query.side_effect = [
        carta_event_query,
        jugador_query,
        cartas_obj_query,
    ]

    descartes_not_so_fast = [MagicMock(spec=Carta), MagicMock(spec=Carta)]
    descarte_evento = [MagicMock(spec=Carta)]
    descartar_mock = MagicMock(side_effect=[descartes_not_so_fast, descarte_evento])
    monkeypatch.setattr(carta_crud, "descartar_cartas", descartar_mock)

    resultado = carta_crud.jugar_cards_off_the_table("p1", 1, 10, 2)


    assert resultado == descartes_not_so_fast + descarte_evento
    descartar_mock.assert_has_calls([
        call([101, 102], jugador_id=2),
        call([10], jugador_id=1),
    ])

def test_jugar_cards_off_the_table_objetivo_sin_cartas(carta_crud, mock_session, monkeypatch):
    
    carta_evento = MagicMock(spec=Carta)
    carta_evento.carta_id = 10
    carta_evento.partida_id = "p1"
    carta_evento.nombre = "Cards off the table"
    carta_evento.jugador_id = 1
    carta_evento.ubicacion = "mano"

    jugador_objetivo = MagicMock(spec=Jugador)
    jugador_objetivo.partida_id = "p1"

    carta_event_query = MagicMock()
    carta_event_query.filter.return_value.first.return_value = carta_evento

    jugador_query = MagicMock()
    jugador_query.filter.return_value.one_or_none.return_value = jugador_objetivo

    cartas_obj_query = MagicMock()
    cartas_obj_query.filter.return_value.all.return_value = []

    mock_session.query.side_effect = [carta_event_query, jugador_query, cartas_obj_query]

    descartar_mock = MagicMock()
    monkeypatch.setattr(carta_crud, "descartar_cartas", descartar_mock)

    with pytest.raises(ValueError, match="El jugador objetivo no tiene cartas en mano"):
        carta_crud.jugar_cards_off_the_table("p1", 1, 10, 2)

    descartar_mock.assert_not_called()

def test_jugar_early_train_to_paddington_exito(carta_crud, mock_session, monkeypatch):
    carta_evento = MagicMock(spec=Carta)
    carta_evento.partida_id = "p1"
    carta_evento.nombre = "Early train to paddington"
    carta_evento.jugador_id = 7
    carta_evento.ubicacion = "mano"
    carta_evento.orden = 0
    monkeypatch.setattr(carta_crud, "obtener_carta_por_id", lambda _id: carta_evento)

    jugador_evento = MagicMock(spec=Jugador)
    jugador_evento.partida_id = "p1"

    cartas_a_mover = [MagicMock(spec=Carta) for _ in range(6)]
    for idx, carta in enumerate(cartas_a_mover):
        carta.ubicacion = "robo"
        carta.jugador_id = None
        carta.orden = idx

    restantes_robo = [MagicMock(spec=Carta) for _ in range(2)]

    jugador_query = MagicMock()
    jugador_query.filter.return_value.one_or_none.return_value = jugador_evento

    cartas_robo_query = MagicMock()
    cartas_robo_query.filter.return_value.order_by.return_value.limit.return_value.all.return_value = cartas_a_mover

    top_descarte_query = MagicMock()
    top_descarte_query.filter.return_value.order_by.return_value.first.return_value = (4,)

    restantes_query = MagicMock()
    restantes_query.filter.return_value.order_by.return_value.all.return_value = restantes_robo

    mock_session.query.side_effect = [
        jugador_query,
        cartas_robo_query,
        top_descarte_query,
        restantes_query,
    ]

    estado_esperado = {"partidaId": "p1", "mazoRobo": [], "mazoDescarte": [], "mazoDraft": []}
    obtener_estado_mock = MagicMock(return_value=estado_esperado)
    monkeypatch.setattr(carta_crud, "obtener_estado_mazos", obtener_estado_mock)

    cartas_movidas, estado = carta_crud.jugar_early_train_to_paddington("p1", 7, 42)

    assert cartas_movidas == cartas_a_mover
    assert estado == estado_esperado
    for idx, carta in enumerate(cartas_a_mover):
        assert carta.ubicacion == "descarte"
        assert carta.jugador_id is None
        assert carta.orden == 5 + idx 

    for idx, carta in enumerate(restantes_robo):
        assert carta.orden == idx

    assert carta_evento.ubicacion == "removida"
    assert carta_evento.jugador_id is None
    assert carta_evento.orden is None

    mock_session.flush.assert_called_once()
    mock_session.commit.assert_called_once()
    obtener_estado_mock.assert_called_once_with("p1")

def test_jugar_early_train_to_paddington_sin_cartas_en_robo(carta_crud, mock_session, monkeypatch):
    carta_evento = MagicMock(spec=Carta)
    carta_evento.partida_id = "p1"
    carta_evento.nombre = "Early train to paddington"
    carta_evento.jugador_id = 3
    carta_evento.ubicacion = "mano"
    monkeypatch.setattr(carta_crud, "obtener_carta_por_id", lambda _id: carta_evento)

    jugador_evento = MagicMock(spec=Jugador)
    jugador_evento.partida_id = "p1"

    jugador_query = MagicMock()
    jugador_query.filter.return_value.one_or_none.return_value = jugador_evento

    cartas_robo_query = MagicMock()
    cartas_robo_query.filter.return_value.order_by.return_value.limit.return_value.all.return_value = []

    top_descarte_query = MagicMock()
    top_descarte_query.filter.return_value.order_by.return_value.first.return_value = None

    restantes_query = MagicMock()
    restantes_query.filter.return_value.order_by.return_value.all.return_value = []

    mock_session.query.side_effect = [
        jugador_query,
        cartas_robo_query,
        top_descarte_query,
        restantes_query,
    ]

    estado_mock = {"partidaId": "p1", "mazoRobo": [], "mazoDescarte": [], "mazoDraft": []}
    monkeypatch.setattr(carta_crud, "obtener_estado_mazos", lambda partida_id: estado_mock)

    cartas_movidas, estado = carta_crud.jugar_early_train_to_paddington("p1", 3, 77)

    assert cartas_movidas == []
    assert estado == estado_mock
    assert carta_evento.ubicacion == "removida"
    assert carta_evento.jugador_id is None
    assert carta_evento.orden is None
    mock_session.flush.assert_called_once()
    mock_session.commit.assert_called_once()
    
def test_jugar_delay_the_murderer_exito(carta_crud, mock_session, monkeypatch):
    carta_evento = MagicMock(spec=Carta)
    carta_evento.carta_id = 99
    carta_evento.partida_id = "p1"
    carta_evento.nombre = "Delay the Murderer scape"
    carta_evento.jugador_id = 1
    carta_evento.ubicacion = "mano"
    query_carta_mock = MagicMock()
    filter_carta_mock = MagicMock()
    filter_carta_mock.first.return_value = carta_evento
    query_carta_mock.filter.return_value = filter_carta_mock

    jugador = MagicMock(spec=Jugador)
    jugador.partida_id = "p1"
    query_jugador_mock = MagicMock()
    filter_jugador_mock = MagicMock()
    filter_jugador_mock.one_or_none.return_value = jugador
    query_jugador_mock.filter.return_value = filter_jugador_mock


    cartas_descarte = []
    for idx, info in enumerate([
        (501, "Not so Fast..."),
        (502, "Dead Card Folly"),
        (503, "Harley Quin Wildcard"),
        (504, "Harley Quin Wildcard"),
        (505, "Tommy Beresford"),
        (506, "Tommy Beresford"),
    ]):
        carta = MagicMock(spec=Carta)
        carta.carta_id = info[0]
        carta.nombre = info[1]
        carta.orden = 100 - idx  # top first
        cartas_descarte.append(carta)
    query_descarte_mock = MagicMock()
    filter_descarte_mock = MagicMock()
    order_descarte_mock = MagicMock()
    order_descarte_mock.all.return_value = cartas_descarte
    filter_descarte_mock.order_by.return_value = order_descarte_mock
    query_descarte_mock.filter.return_value = filter_descarte_mock
    
    cartas_robo = []
    for idx, info in enumerate([
        (601, "Parker Pyne"),
        (602, "Parker Pyne"),
    ]):
        carta = MagicMock(spec=Carta)
        carta.carta_id = info[0]
        carta.nombre = info[1]
        carta.orden = idx
        cartas_robo.append(carta)
    query_robo_mock = MagicMock()
    filter_robo_mock = MagicMock()
    order_robo_mock = MagicMock()
    order_robo_mock.all.return_value = cartas_robo
    filter_robo_mock.order_by.return_value = order_robo_mock
    query_robo_mock.filter.return_value = filter_robo_mock

    mock_session.query.side_effect = [
        query_carta_mock,
        query_jugador_mock,
        query_descarte_mock,
        query_robo_mock,
    ]

    estado_mock = {
        "partidaId": "p1",
        "mazoRobo": [],
        "mazoDescarte": [],
        "mazoDraft": [],
    }
    monkeypatch.setattr(
        carta_crud,
        "obtener_estado_mazos",
        MagicMock(return_value=estado_mock),
    )

    monkeypatch.setattr("src.crud.carta_crud.shuffle", lambda seq: seq.reverse())
    mock_session.flush = MagicMock()
    mock_session.commit = MagicMock()

    cartas_movidas, estado = carta_crud.jugar_delay_the_murderer("p1", 1, 99)

    # que las cartas movidas sean esperadas en ese orden
    assert [c.carta_id for c in cartas_movidas] == [505, 504, 503, 502, 501]
    # que todas las cartas movidas quedaron en el mazo de robo y sin dueño
    assert all(carta.ubicacion == "robo" and carta.jugador_id is None for carta in cartas_movidas)
    # orden con las nuevas cartas movidas
    assert [carta.orden for carta in cartas_movidas] == list(range(len(cartas_movidas)))
    # las que ya estaban se corran detras de las movidas
    assert [c.orden for c in cartas_robo] == list(range(len(cartas_movidas), len(cartas_movidas) + len(cartas_robo)))
    # las que siguen en descarte tengan orden todavia
    assert all(c.orden >= 0 for c in cartas_descarte if c not in cartas_movidas)
    # que cambie la ubi
    assert carta_evento.ubicacion == "removida"
    # y no tenga un jugador asignado
    assert carta_evento.jugador_id is None
    # q se actualizo todo
    mock_session.commit.assert_called_once()
    assert estado is estado_mock

def test_jugar_delay_the_murderer_sin_descarte(carta_crud, mock_session):
    carta_evento = MagicMock(spec=Carta)
    carta_evento.carta_id = 99
    carta_evento.partida_id = "p1"
    carta_evento.nombre = "Delay the Murderer scape"
    carta_evento.jugador_id = 1
    carta_evento.ubicacion = "mano"
    query_carta_mock = MagicMock()
    filter_carta_mock = MagicMock()
    filter_carta_mock.first.return_value = carta_evento
    query_carta_mock.filter.return_value = filter_carta_mock

    jugador = MagicMock(spec=Jugador)
    jugador.partida_id = "p1"
    query_jugador_mock = MagicMock()
    filter_jugador_mock = MagicMock()
    filter_jugador_mock.one_or_none.return_value = jugador
    query_jugador_mock.filter.return_value = filter_jugador_mock

    query_descarte_mock = MagicMock()
    filter_descarte_mock = MagicMock()
    order_descarte_mock = MagicMock()
    order_descarte_mock.all.return_value = []
    filter_descarte_mock.order_by.return_value = order_descarte_mock
    query_descarte_mock.filter.return_value = filter_descarte_mock

    mock_session.query.side_effect = [
        query_carta_mock,
        query_jugador_mock,
        query_descarte_mock,
    ]
    with pytest.raises(ValueError, match="No hay cartas en el descarte"):
        carta_crud.jugar_delay_the_murderer("p1", 1, 99)

def test_look_into_the_ashes_exito(carta_crud, mock_session):
    """Test exitoso para look_into_the_ashes: mueve carta del descarte a la mano del jugador."""
    # Configurar mocks
    carta_mock = MagicMock(spec=Carta)
    carta_mock.carta_id = 1
    carta_mock.ubicacion = "descarte"
    carta_mock.orden = 5
    carta_mock.jugador_id = None
    carta_mock.partida_id = "partida1"
    
    # Configurar la sesión para que devuelva la carta
    mock_session.query.return_value.filter.return_value.one_or_none.return_value = carta_mock
    
    # Ejecutar el método
    resultado = carta_crud.look_into_the_ashes("partida1", 99, 1)
    
    # Verificaciones
    mock_session.query.assert_called_with(Carta)
    # Verificar que se llamó a filter con los parámetros correctos
    filter_call = mock_session.query.return_value.filter
    assert filter_call.called
    
    # Verificar cambios en la carta
    assert carta_mock.ubicacion == "mano"
    assert carta_mock.orden is None
    assert carta_mock.jugador_id == 99
    
    # Verificar que se hizo commit
    mock_session.commit.assert_called_once()
    # Verificar que se retornó la carta
    assert resultado is carta_mock

def test_descartar_carta_aleatoria_exito(carta_crud, mock_session, monkeypatch):
    """Test exitoso para descartar_carta_aleatoria: descarta una carta aleatoria de la mano del jugador"""
    # Configurar mocks
    carta_mock = MagicMock(spec=Carta)
    carta_mock.carta_id = 42
    carta_mock.jugador_id = 99
    carta_mock.ubicacion = "mano"
    carta_mock.partida_id = "partida1"
    
    # Configurar la sesión para que devuelva la carta aleatoria
    mock_session.query.return_value.filter.return_value.order_by.return_value.first.return_value = carta_mock
    
    # Mockear la función descartar_cartas
    carta_descartada_mock = MagicMock(spec=Carta)
    descartar_mock = MagicMock(return_value=[carta_descartada_mock])
    monkeypatch.setattr(carta_crud, "descartar_cartas", descartar_mock)
    
    # Ejecutar el método
    resultado = carta_crud.descartar_carta_aleatoria("partida1", 99)
    
    # Verificaciones
    # Verificar que se llamó a query con Carta
    mock_session.query.assert_called_with(Carta)
    
    # Verificar los filtros aplicados
    filter_call = mock_session.query.return_value.filter
    assert filter_call.called
    
    # Verificar que se llamó a order_by con func.random()
    order_by_call = mock_session.query.return_value.filter.return_value.order_by
    assert order_by_call.called
    
    # Verificar que se llamó a first() para obtener una carta
    first_call = mock_session.query.return_value.filter.return_value.order_by.return_value.first
    assert first_call.called
    
    # Verificar que se llamó a descartar_cartas con los parámetros correctos
    descartar_mock.assert_called_once_with([42], jugador_id=99)
    
    # Verificar que se retornó la carta descartada
    assert resultado is carta_descartada_mock

def test_descartar_carta_aleatoria_sin_cartas(carta_crud, mock_session):
    """Test que verifica error cuando el jugador no tiene cartas en mano"""
    # Configurar la sesión para que no devuelva cartas (None)
    mock_session.query.return_value.filter.return_value.order_by.return_value.first.return_value = None
    
    # Ejecutar el método y verificar que lanza excepción
    with pytest.raises(ValueError, match="El jugador no tiene cartas en mano para descartar"):
        carta_crud.descartar_carta_aleatoria("partida1", 99)
    
    # Verificar que NO se intentó hacer commit (porque falló antes)
    mock_session.commit.assert_not_called()

def test_descartar_carta_aleatoria_con_error_en_descartar(carta_crud, mock_session, monkeypatch):
    """Test que verifica el manejo de errores cuando descartar_cartas falla"""
    # Configurar mocks
    carta_mock = MagicMock(spec=Carta)
    carta_mock.carta_id = 42
    carta_mock.jugador_id = 99
    
    # Configurar la sesión para que devuelva la carta aleatoria
    mock_session.query.return_value.filter.return_value.order_by.return_value.first.return_value = carta_mock
    
    # Mockear descartar_cartas para que lance una excepción
    descartar_mock = MagicMock(side_effect=ValueError("Error al descartar cartas"))
    monkeypatch.setattr(carta_crud, "descartar_cartas", descartar_mock)
    
    # Ejecutar el método y verificar que propaga la excepción
    with pytest.raises(ValueError, match="Error al descartar cartas"):
        carta_crud.descartar_carta_aleatoria("partida1", 99)
    
    # Verificar que se llamó a descartar_cartas
    descartar_mock.assert_called_once_with([42], jugador_id=99)
    
@pytest.fixture
def carta_factory():
    def _build(
        carta_id: int,
        nombre: str,
        partida_id: str,
        jugador_id: int,
        ubicacion: str = "mano",
    ):
        carta = MagicMock(spec=Carta)
        carta.carta_id = carta_id
        carta.nombre = nombre
        carta.partida_id = partida_id
        carta.jugador_id = jugador_id
        carta.ubicacion = ubicacion
        carta.orden = None
        carta.to_dict.return_value = {
            "carta_id": carta_id,
            "nombre": nombre,
            "partida_id": partida_id,
            "jugador_id": jugador_id,
            "ubicacion": ubicacion,
        }
        return carta
    return _build


def _configure_card_trade_query_chain(mock_session, jugador_objetivo, top_descarte):
    # Simula las dos queries que hace jugar_card_trade: jugador objetivo y tope del descarte.
    jugador_query = MagicMock()
    jugador_query.filter.return_value = jugador_query
    jugador_query.one_or_none.return_value = jugador_objetivo

    descarte_query = MagicMock()
    descarte_query.filter.return_value = descarte_query
    descarte_query.order_by.return_value = descarte_query
    descarte_query.first.return_value = top_descarte

    mock_session.query.side_effect = [jugador_query, descarte_query]


def test_jugar_card_trade_intercambia_cartas_y_descarta_evento(
    carta_crud, mock_session, carta_factory
):
    partida_id = "partida-1"
    jugador_evento_id = 10
    jugador_objetivo_id = 20

    carta_evento = carta_factory(101, "Card Trade", partida_id, jugador_evento_id)
    carta_ofrecida = carta_factory(201, "Hercule Poirot", partida_id, jugador_evento_id)
    carta_elegida = carta_factory(301, "Miss Marple", partida_id, jugador_objetivo_id)

    cartas_por_id = {
        101: carta_evento,
        201: carta_ofrecida,
        301: carta_elegida,
    }
    carta_crud.obtener_carta_por_id = MagicMock(side_effect=lambda cid: cartas_por_id[cid])

    jugador_objetivo = MagicMock()
    jugador_objetivo.partida_id = partida_id
    jugador_objetivo.jugador_id = jugador_objetivo_id

    _configure_card_trade_query_chain(mock_session, jugador_objetivo, top_descarte=(5,))

    resultado = carta_crud.jugar_card_trade(
        partida_id,
        jugador_evento_id,
        101,
        jugador_objetivo_id,
        201,
        301,
    )

    assert carta_ofrecida.jugador_id == jugador_objetivo_id
    assert carta_elegida.jugador_id == jugador_evento_id
    assert carta_evento.ubicacion == "descarte"
    assert carta_evento.orden == 6
    mock_session.flush.assert_called_once()
    mock_session.commit.assert_called_once()
    assert resultado["intercambio"]["cartaOfrecida"] == carta_ofrecida.to_dict.return_value
    assert resultado["efectos"] == {}


def test_jugar_card_trade_dispara_efectos_blackmailed_y_social_faux_pas(
    carta_crud, mock_session, carta_factory
):
    partida_id = "partida-42"
    jugador_evento_id = 1
    jugador_objetivo_id = 2

    carta_evento = carta_factory(501, "Card Trade", partida_id, jugador_evento_id)
    carta_ofrecida = carta_factory(601, "Blackmailed", partida_id, jugador_evento_id)
    carta_elegida = carta_factory(701, "Social Faux Pas", partida_id, jugador_objetivo_id)

    cartas_por_id = {
        501: carta_evento,
        601: carta_ofrecida,
        701: carta_elegida,
    }
    carta_crud.obtener_carta_por_id = MagicMock(side_effect=lambda cid: cartas_por_id[cid])

    jugador_objetivo = MagicMock()
    jugador_objetivo.partida_id = partida_id
    jugador_objetivo.jugador_id = jugador_objetivo_id

    _configure_card_trade_query_chain(mock_session, jugador_objetivo, top_descarte=None)

    resultado = carta_crud.jugar_card_trade(
        partida_id,
        jugador_evento_id,
        501,
        jugador_objetivo_id,
        601,
        701,
    )

    assert resultado["efectos"]["blackmailed"] == [
        {"pasadorId": jugador_evento_id, "receptorId": jugador_objetivo_id}
    ]
    assert resultado["efectos"]["socialFauxPas"] == [
        {"receptorId": jugador_evento_id}
    ]


def test_jugar_card_trade_falla_si_jugador_objetivo_no_pertenece_a_la_partida(
    carta_crud, mock_session, carta_factory
):
    partida_id = "partida-1"
    jugador_evento_id = 7
    jugador_objetivo_id = 8

    carta_evento = carta_factory(801, "Card Trade", partida_id, jugador_evento_id)
    carta_crud.obtener_carta_por_id = MagicMock(return_value=carta_evento)

    jugador_objetivo = MagicMock()
    jugador_objetivo.partida_id = "otra-partida"
    jugador_objetivo.jugador_id = jugador_objetivo_id

    jugador_query = MagicMock()
    jugador_query.filter.return_value = jugador_query
    jugador_query.one_or_none.return_value = jugador_objetivo
    mock_session.query.side_effect = [jugador_query]

    with pytest.raises(ValueError, match="objetivo no pertenece a la partida"):
        carta_crud.jugar_card_trade(
            partida_id,
            jugador_evento_id,
            801,
            jugador_objetivo_id,
            0,
            0,
        )

    mock_session.flush.assert_not_called()
    mock_session.commit.assert_not_called()

def test_jugar_dead_card_folly_pasa_cartas_y_registra_efectos(carta_crud, mock_session):
    partida_id = "partida-demo"
    jugador_evento_id = 1
    seleccion = {1: 1, 2: 2, 3: 3}

    carta_evento = MagicMock(spec=Carta)
    carta_evento.partida_id = partida_id
    carta_evento.nombre = "Dead Card Folly"
    carta_evento.jugador_id = jugador_evento_id
    carta_evento.ubicacion = "mano"
    carta_evento.orden = None

    cartas_sel = []
    for carta_id, nombre, jugador_actual in [
        (1, "Blackmailed", 1),
        (2, "Social Faux Pas", 2),
        (3, "Agatha's Clue", 3),
    ]:
        carta = MagicMock(spec=Carta)
        carta.carta_id = carta_id
        carta.nombre = nombre
        carta.partida_id = partida_id
        carta.jugador_id = jugador_actual
        carta.ubicacion = "mano"
        carta.orden = None
        cartas_sel.append(carta)

    carta_crud.obtener_carta_por_id = MagicMock(return_value=carta_evento)
    carta_crud.get_cartas_by_ids = MagicMock(return_value=cartas_sel)

    jugadores = [MagicMock(jugador_id=i) for i in (1, 2, 3)]

    players_query = MagicMock()
    players_query.filter.return_value.order_by.return_value.all.return_value = jugadores

    player_card_queries = []
    for jugador_id in (1, 2, 3):
        card_query = MagicMock()
        card_query.filter.return_value.first.return_value = MagicMock(
            partida_id=partida_id,
            jugador_id=jugador_id,
            ubicacion="mano",
        )
        player_card_queries.append(card_query)

    discard_query = MagicMock()
    discard_query.filter.return_value.order_by.return_value.first.return_value = (4,)

    mock_session.query.side_effect = [
        players_query,
        *player_card_queries,
        discard_query,
    ]

    resultado = carta_crud.jugar_dead_card_folly(
        partida_id=partida_id,
        jugador_evento_id=jugador_evento_id,
        carta_evento_id=99,
        direccion="derecha",
        selecciones=seleccion,
    )

    assert carta_evento.ubicacion == "descarte"
    assert carta_evento.jugador_id is None
    assert carta_evento.orden == 5

    assert cartas_sel[0].jugador_id == 2
    assert cartas_sel[1].jugador_id == 3
    assert cartas_sel[2].jugador_id == 1
    assert all(c.ubicacion == "mano" for c in cartas_sel)

    assert resultado["evento"] is carta_evento
    assert resultado["efectos_por_tipo"]["blackmailed"][0] == {
        "pasadorId": 1,
        "receptorId": 2,
    }
    assert resultado["efectos_por_tipo"]["socialFauxPas"][0] == {
        "pasadorId": 2,
        "receptorId": 3,
    }
    assert mock_session.commit.call_count == 1
    mock_session.rollback.assert_not_called()

def test_agrupar_efectos_por_tipo(carta_crud):
    """Test para la función de agrupar efectos por tipo."""
    # Test 1: Lista vacía
    assert carta_crud.agrupar_efectos_por_tipo([]) == {}

    # Test 2: Lista con diferentes tipos de efectos
    efectos = [
        {"tipo": "blackmailed", "pasadorId": 1, "receptorId": 2},
        {"tipo": "social_faux_pas", "receptorId": 3},
        {"tipo": None, "mensaje": "sin tipo"},
        {"tipo": "otro_efecto", "data": "algo"}
    ]

    resultado = carta_crud.agrupar_efectos_por_tipo(efectos)

    # Verificar cada tipo de efecto por separado
    assert resultado == {
        "blackmailed": [{"pasadorId": 1, "receptorId": 2}],
        "socialFauxPas": [{"receptorId": 3}],
        "otros": [{"mensaje": "sin tipo"}],
        "otro_efecto": [{"data": "algo"}]
    }

def test_jugar_not_so_fast_cancela_evento(carta_crud, mock_session, monkeypatch):
    """Test para cancelar una carta individual con Not so Fast..."""
    # Configurar mocks
    carta_evento = MagicMock(spec=Carta)
    carta_evento.carta_id = 100
    carta_evento.partida_id = "partida1"
    carta_evento.nombre = "Not so Fast..."
    carta_evento.jugador_id = 1
    carta_evento.ubicacion = "mano"
    
    carta_cancelada = MagicMock(spec=Carta)
    carta_cancelada.carta_id = 200
    carta_cancelada.partida_id = "partida1"
    carta_cancelada.jugador_id = 2
    carta_cancelada.ubicacion = "mano"
    
    # Mockear obtener_carta_por_id
    def mock_obtener_carta(carta_id):
        if carta_id == 100:
            return carta_evento
        elif carta_id == 200:
            return carta_cancelada
        return None
    
    monkeypatch.setattr(carta_crud, "obtener_carta_por_id", mock_obtener_carta)
    
    # Mockear descartar_cartas
    evento_descartado = MagicMock(spec=Carta)
    carta_descartada = MagicMock(spec=Carta)
    descartar_mock = MagicMock(side_effect=[[evento_descartado], [carta_descartada]])
    monkeypatch.setattr(carta_crud, "descartar_cartas", descartar_mock)
    
    # Ejecutar el método
    resultado = carta_crud.jugar_not_so_fast(
        partida_id="partida1",
        jugador_evento_id=1,
        carta_evento_id=100,
        eventoa_cancelar_id=200
    )
    
    # Verificaciones
    assert resultado == [evento_descartado, carta_descartada]
    
    # Verificar que se llamó a descartar_cartas con los parámetros correctos
    descartar_mock.assert_has_calls([
        call([100], jugador_id=1),  # Descarte del evento
        call([200], jugador_id=2)   # Descarte de la carta cancelada
    ])

def test_jugar_not_so_fast_cancela_set_de_cartas(carta_crud, mock_session, monkeypatch):
    """Test para cancelar un set de cartas con Not so Fast..."""
    # Configurar mocks
    carta_evento = MagicMock(spec=Carta)
    carta_evento.carta_id = 100
    carta_evento.partida_id = "partida1"
    carta_evento.nombre = "Not so Fast..."
    carta_evento.jugador_id = 1
    carta_evento.ubicacion = "mano"
    
    cartas_set = [
        MagicMock(spec=Carta) for _ in range(3)
    ]
    for i, carta in enumerate(cartas_set):
        carta.carta_id = 200 + i
        carta.partida_id = "partida1"
        carta.jugador_id = 3  # Todas del mismo jugador
        carta.ubicacion = "mano"
    
    # Mockear obtener_carta_por_id
    def mock_obtener_carta(carta_id):
        if carta_id == 100:
            return carta_evento
        return None
    
    monkeypatch.setattr(carta_crud, "obtener_carta_por_id", mock_obtener_carta)
    
    # Mockear get_cartas_by_ids
    get_cartas_mock = MagicMock(return_value=cartas_set)
    monkeypatch.setattr(carta_crud, "get_cartas_by_ids", get_cartas_mock)
    
    # Mockear descartar_cartas
    evento_descartado = MagicMock(spec=Carta)
    cartas_descartadas = [MagicMock(spec=Carta) for _ in range(3)]
    descartar_mock = MagicMock(side_effect=[[evento_descartado], cartas_descartadas])
    monkeypatch.setattr(carta_crud, "descartar_cartas", descartar_mock)
    
    # Ejecutar el método
    cartas_set_ids = [200, 201, 202]
    resultado = carta_crud.jugar_not_so_fast(
        partida_id="partida1",
        jugador_evento_id=1,
        carta_evento_id=100,
        cartas_set_id=cartas_set_ids
    )
    
    # Verificaciones
    assert resultado == [evento_descartado] + cartas_descartadas
    
    # Verificar llamadas
    get_cartas_mock.assert_called_once_with(cartas_set_ids)
    descartar_mock.assert_has_calls([
        call([100], jugador_id=1),  # Descarte del evento
        call(cartas_set_ids, jugador_id=3)  # Descarte del set
    ])

def test_jugar_not_so_fast_carta_evento_no_existe(carta_crud, mock_session):
    """Test cuando la carta de evento Not so Fast no existe"""
    mock_session.query.return_value.filter.return_value.first.return_value = None
    
    with pytest.raises(ValueError, match="La carta de evento no existe"):
        carta_crud.jugar_not_so_fast(
            partida_id="partida1",
            jugador_evento_id=1,
            carta_evento_id=999
        )
