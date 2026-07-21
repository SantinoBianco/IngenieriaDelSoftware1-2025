# tests/unit/jugador_crud_test.py

import pytest
from unittest.mock import MagicMock, patch
from src.crud.jugador_crud import JugadorCRUD
from src.modelos.jugador_modelo import Jugador # Para spec
from src.modelos.partida_modelo import Partida # Para spec

from passlib.hash import pbkdf2_sha256


# --- Fixtures ---

@pytest.fixture
def mock_session():
    """Crea un mock de la sesión de SQLAlchemy."""
    return MagicMock()

@pytest.fixture
def jugador_crud(mock_session):
    """
    Instancia PartidaCRUD e inyecta la sesión mockeada.
    Esta es una forma más limpia de inyección para tests.
    """
    return JugadorCRUD(mock_session)

# --- Tests ---

@patch('src.crud.jugador_crud.Jugador') # Interceptamos la clase Jugador
def test_crear_jugador(mock_jugador_class, jugador_crud, mock_session):
    """Prueba la creación exitosa de un jugador."""
    mock_instance = MagicMock()
    mock_jugador_class.return_value = mock_instance

    resultado = jugador_crud.crear_jugador("test_user", "2000-01-01")

    mock_jugador_class.assert_called_once_with(username="test_user", cumpleaños="2000-01-01")
    mock_session.add.assert_called_once_with(mock_instance)
    mock_session.commit.assert_called_once()
    mock_session.refresh.assert_called_once_with(mock_instance)
    assert resultado == mock_instance

def test_obtener_jugador(jugador_crud, mock_session):
    """Prueba obtener un jugador que existe."""
    mock_jugador = MagicMock(spec=Jugador)
    mock_session.get.return_value = mock_jugador

    resultado = jugador_crud.obtener_jugador(1)

    mock_session.get.assert_called_once_with(Jugador, 1)
    assert resultado == mock_jugador

@patch('src.crud.jugador_crud.Jugador')
def test_crear_y_unir_jugador(mock_jugador_class, jugador_crud, mock_session):
    """Prueba crear y unir un jugador a una partida existente."""
    mock_partida = MagicMock(spec=Partida)
    mock_partida.cantidad_jugadores = 0
    mock_partida.privada = False
    mock_session.get.return_value = mock_partida # db.get(Partida, ...) devolverá esto

    mock_nuevo_jugador = MagicMock()
    mock_jugador_class.return_value = mock_nuevo_jugador

    jugador_crud.crear_y_unir_jugador("TestUser", "2001-02-03", "partida-1")

    mock_session.get.assert_called_once_with(Partida, "partida-1")
    assert mock_partida.cantidad_jugadores == 1 # Verificamos que se incrementó
    mock_session.add.assert_called_once_with(mock_nuevo_jugador)
    mock_session.commit.assert_called_once()

def test_eliminar_jugador_de_partida(jugador_crud, mock_session):
    """Prueba eliminar un jugador de una partida."""
    mock_jugador = MagicMock(spec=Jugador, partida_id="partida-1")
    mock_partida = MagicMock(spec=Partida, cantidad_jugadores=3)

    # Configuramos get para que devuelva el jugador y luego la partida
    mock_session.get.side_effect = [mock_jugador, mock_partida]

    jugador_crud.eliminar_jugador_de_partida(1, "partida-1")

    assert mock_partida.cantidad_jugadores == 2 # Verificamos que se decrementó
    mock_session.delete.assert_called_once_with(mock_jugador)
    mock_session.commit.assert_called_once()

@patch('src.crud.jugador_crud.Jugador')
def test_crear_y_unir_jugador_privada_correcta(mock_jugador_class):
    mock_session = MagicMock()
    jugador_crud = JugadorCRUD(mock_session)

    plain_password = "mi_secreta"
    hashed = pbkdf2_sha256.hash(plain_password)

    mock_partida = MagicMock(spec=Partida)
    mock_partida.cantidad_jugadores = 0
    mock_partida.privada = True
    mock_partida.contraseña = hashed

    mock_session.get.return_value = mock_partida

    mock_nuevo_jugador = MagicMock()
    mock_jugador_class.return_value = mock_nuevo_jugador

    resultado = jugador_crud.crear_y_unir_jugador("User", "2000-01-01", "p-1", contraseña=plain_password)

    mock_session.get.assert_called_once()
    assert mock_partida.cantidad_jugadores == 1
    mock_session.add.assert_called_once_with(mock_nuevo_jugador)
    mock_session.commit.assert_called_once()
    assert resultado == mock_nuevo_jugador
