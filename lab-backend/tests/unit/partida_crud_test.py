# tests/unit/partida_crud_test.py

import pytest
from unittest.mock import MagicMock, patch
from src.crud.partida_crud import PartidaCRUD
from src.modelos.partida_modelo import Partida  # Importar solo para usar como 'spec'


@pytest.fixture
def mock_session():
    """Crea un mock de la sesión de SQLAlchemy."""
    return MagicMock()

@pytest.fixture
def partida_crud(mock_session):
    """
    Instancia PartidaCRUD e inyecta la sesión mockeada.
    Esta es una forma más limpia de inyección para tests.
    """
    return PartidaCRUD(mock_session)


@patch("src.crud.partida_crud.SecretoCRUD")  # Mock de SecretoCRUD
@patch("src.crud.partida_crud.CartaCRUD")
@patch("src.crud.partida_crud.Partida") 
def test_crear_partida(mock_partida_class, mock_carta_crud, mock_secreto_crud, partida_crud, mock_session):
    # Mock de Partida
    mock_instance = MagicMock()
    mock_partida_class.return_value = mock_instance

    # Mock de CartaCRUD y SecretoCRUD
    mock_carta_crud.return_value.crear_cartas_iniciales.return_value = None
    mock_secreto_crud.return_value.crear_secretos.return_value = None

    resultado = partida_crud.crear_partida("Test", 4, 1)

    # Verificaciones
    mock_partida_class.assert_called_once()
    mock_session.add.assert_called_once_with(mock_instance)
    mock_session.commit.assert_called_once()
    mock_session.refresh.assert_called_once_with(mock_instance)
    mock_carta_crud.return_value.crear_cartas_iniciales.assert_called_once_with(mock_instance.id)
    mock_secreto_crud.return_value.crear_secretos.assert_called_once_with(mock_instance.id)

    assert resultado == mock_instance


def test_listar_partidas(partida_crud, mock_session):
    # Usamos MagicMock con `spec` para simular las partidas. NO usamos Partida().
    partida1 = MagicMock(spec=Partida)
    partida1.nombre = "A"
    partida2 = MagicMock(spec=Partida)
    partida2.nombre = "B"

    # Configuramos el mock de la sesión para que devuelva nuestra lista de mocks
    mock_session.query.return_value.all.return_value = [partida1, partida2]
    partidas = partida_crud.listar_partidas()

    assert len(partidas) == 2
    assert partidas[0].nombre == "A"
    mock_session.query.return_value.all.assert_called_once()

def test_get_partida(partida_crud, mock_session):
    # Creamos un mock para simular la partida que será encontrada
    partida_encontrada = MagicMock(spec=Partida)
    partida_encontrada.id = "1"
    partida_encontrada.nombre = "A"
    
    mock_session.query.return_value.filter.return_value.first.return_value = partida_encontrada

    partida = partida_crud.get_partida("1")

    assert partida.id == "1"
    assert partida.nombre == "A"

@patch("src.crud.partida_crud.SecretoCRUD")  # Mock de SecretoCRUD
@patch("src.crud.partida_crud.CartaCRUD")
def test_iniciar_partida(mock_carta_crud, mock_secreto_crud, partida_crud, mock_session):
    partida_existente = MagicMock(spec=Partida)
    partida_existente.id = "1"
    partida_existente.estado = "lobby"
    partida_existente.host = 1
    
    mock_session.query.return_value.filter.return_value.first.return_value = partida_existente

    # mock de jugadores
    jugador_mock = MagicMock()
    jugador_mock.jugador_id = 10
    mock_session.query.return_value.filter.return_value.all.return_value = [jugador_mock]

    # mock de CartaCRUD y SecretoCRUD
    mock_carta_crud.return_value.robar_cartas.return_value = None
    mock_secreto_crud.return_value.repartir_secretos.return_value = None

    partida_iniciada = partida_crud.iniciar_partida("1", 1)

    assert partida_iniciada.estado == "en_curso"
    assert partida_iniciada == partida_existente
    mock_secreto_crud.return_value.repartir_secretos.assert_called_once_with("1", [jugador_mock])
    mock_carta_crud.return_value.robar_cartas.assert_called_once_with("1", 10, 5)
    mock_session.commit.assert_called_once()
    mock_session.refresh.assert_called_once_with(partida_existente)

def test_eliminar_partida(partida_crud, mock_session):
    """
    Prueba que la función elimine correctamente una partida y todos sus datos asociados.
    """
    # Simulamos una partida que SÍ existe en la base de datos
    partida_existente = MagicMock(spec=Partida)
    
    # Le decimos a la base de datos falsa que, cuando se llame a get_partida,
    # debe devolver nuestra partida simulada.
    # Usamos patch para interceptar la llamada a get_partida DENTRO de la misma clase.
    with patch.object(partida_crud, 'get_partida', return_value=partida_existente):
        
        # Llamamos a la función que queremos probar
        partida_crud.eliminar_partida("id-de-partida-existente")

        # Verificamos que se intentó borrar las cartas de la partida.
        # .delete() se llama sobre el resultado de .filter_by(), por eso la aserción es así.
        mock_session.query.return_value.filter_by.return_value.delete.assert_any_call()
        
        # Verificamos que se borró el objeto de la partida en sí.
        mock_session.delete.assert_called_once_with(partida_existente)
        
        # Verificamos que todos los cambios se guardaron en la base de datos.
        mock_session.commit.assert_called_once()
        
        # Nos aseguramos de que no hubo un rollback, ya que todo fue exitoso.
        mock_session.rollback.assert_not_called()

@patch('src.crud.partida_crud.SecretoCRUD')
def test_verificar_fin_por_desgracia_social_exito(
    mock_secreto_crud_class, partida_crud, mock_session
):
    # Configurar el mock
    mock_secreto_crud = MagicMock()
    mock_secreto_crud.obtener_asesino.return_value = 1
    mock_secreto_crud_class.return_value = mock_secreto_crud

    # Mock de jugadores
    jugador_asesino = MagicMock()
    jugador_asesino.jugador_id = 1
    jugador_asesino.en_desgracia = False

    jugador_normal_1 = MagicMock()
    jugador_normal_1.jugador_id = 2
    jugador_normal_1.en_desgracia = True

    jugador_normal_2 = MagicMock()
    jugador_normal_2.jugador_id = 3
    jugador_normal_2.en_desgracia = True

    mock_session.query.return_value.filter.return_value.all.return_value = [
        jugador_asesino, jugador_normal_1, jugador_normal_2
    ]

    resultado = partida_crud._verificar_fin_por_desgracia_social("partida_id")

    mock_secreto_crud.obtener_asesino.assert_called_once_with("partida_id")
    assert resultado == True

@patch('src.crud.partida_crud.SecretoCRUD')
def test_verificar_fin_por_desgracia_social_unJugador_no_en_desgracia(
    mock_secreto_crud_class, partida_crud, mock_session
):
    # Configurar el mock
    mock_secreto_crud = MagicMock()
    mock_secreto_crud.obtener_asesino.return_value = 1
    mock_secreto_crud_class.return_value = mock_secreto_crud

    jugador_asesino = MagicMock()
    jugador_asesino.jugador_id = 1
    jugador_asesino.en_desgracia = False

    jugador_normal = MagicMock()
    jugador_normal.jugador_id = 2
    jugador_normal.en_desgracia = False

    mock_session.query.return_value.filter.return_value.all.return_value = [
        jugador_asesino, jugador_normal
    ]

    resultado = partida_crud._verificar_fin_por_desgracia_social("partida_id")

    assert resultado == False
