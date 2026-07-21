import pytest
from unittest.mock import MagicMock, patch
from src.crud.set_crud import SetCRUD
from src.modelos.set_modelo import Set
from src.modelos.carta_modelo import Carta

# el coverage es bajo pues se testean los metodos que hacen commits a la base de datos

@pytest.fixture
def mock_session():
    return MagicMock()

@pytest.fixture
def set_crud(mock_session):
    """Instancia SetCRUD e inyecta la sesión mockeada."""
    return SetCRUD(mock_session)

def test_crear_set_exitoso(set_crud, mock_session):
    """Test para crear_set exitoso."""
    nombre = "Test Set"
    partida_id = "partida1"
    owner_id = 1
    
    # Configuramos el mock para simular la creación exitosa
    mock_set_instance = MagicMock(spec=Set)
    with patch('src.crud.set_crud.Set', return_value=mock_set_instance):
        resultado = set_crud.crear_set(nombre, partida_id, owner_id)
    
    # Verificamos que se creó el set con los parámetros correctos
    assert resultado == mock_set_instance
    mock_session.add.assert_called_once_with(mock_set_instance)

def test_obtener_set_exitoso(set_crud, mock_session):
    """Test para obtener_set cuando el set existe."""
    set_id = 1
    mock_set = MagicMock(spec=Set)
    
    mock_session.query.return_value.filter.return_value.first.return_value = mock_set
    
    resultado = set_crud.obtener_set(set_id)
    
    assert resultado == mock_set
    mock_session.query.assert_called_with(Set)
    mock_session.query.return_value.filter.assert_called_once()

def test_obtener_set_no_encontrado(set_crud, mock_session):
    """Test para obtener_set cuando el set no existe."""
    set_id = 999
    
    mock_session.query.return_value.filter.return_value.first.return_value = None
    
    resultado = set_crud.obtener_set(set_id)
    
    assert resultado is None

def test_sets_de_owner(set_crud, mock_session):
    """Test para sets_de_owner."""
    owner_id = 1
    mock_sets = [MagicMock(spec=Set), MagicMock(spec=Set)]
    
    mock_session.query.return_value.filter.return_value.all.return_value = mock_sets
    
    resultado = set_crud.sets_de_owner(owner_id)
    
    assert resultado == mock_sets
    mock_session.query.assert_called_with(Set)
    mock_session.query.return_value.filter.assert_called_once()

def test_cambiar_owner_set_exitoso(set_crud, mock_session):
    """Test para cambiar_owner_set exitoso."""
    set_id = 1
    new_owner_id = 2
    mock_set = MagicMock(spec=Set)
    mock_set.set_id = set_id
    mock_set.owner_id = 1
    
    mock_session.query.return_value.filter.return_value.first.return_value = mock_set
    
    resultado = set_crud.cambiar_owner_set(set_id, new_owner_id)
    
    assert resultado == mock_set
    assert mock_set.owner_id == new_owner_id
    mock_session.commit.assert_called_once()
    mock_session.refresh.assert_called_once_with(mock_set)

def test_cambiar_owner_set_no_encontrado(set_crud, mock_session):
    """Test para cambiar_owner_set cuando el set no existe."""
    set_id = 999
    new_owner_id = 2
    
    mock_session.query.return_value.filter.return_value.first.return_value = None
    
    with pytest.raises(ValueError, match="El set especificado no existe."):
        set_crud.cambiar_owner_set(set_id, new_owner_id)

def test_determinar_nombre_del_set_beresford(set_crud):
    """Test para _determinar_nombre_del_set con set de Beresford."""
    # Creamos cartas mock para Tommy y Tuppence Beresford
    carta_tommy = MagicMock(spec=Carta)
    carta_tommy.nombre = "Tommy Beresford"
    
    carta_tuppence = MagicMock(spec=Carta)
    carta_tuppence.nombre = "Tuppence Beresford"
    
    cartas = [carta_tommy, carta_tuppence]
    
    resultado = set_crud._determinar_nombre_del_set(cartas)
    
    assert resultado == "Set de Beresford"

def test_determinar_nombre_del_set_detective_unico(set_crud):
    """Test para _determinar_nombre_del_set con un solo detective."""
    carta_poirot = MagicMock(spec=Carta)
    carta_poirot.nombre = "Hercule Poirot"
    
    cartas = [carta_poirot, carta_poirot]  # Mismo detective
    
    resultado = set_crud._determinar_nombre_del_set(cartas)
    
    assert resultado == "Set de Hercule Poirot"

def test_determinar_nombre_del_set_con_comodines(set_crud):
    """Test para _determinar_nombre_del_set ignorando comodines."""
    carta_poirot = MagicMock(spec=Carta)
    carta_poirot.nombre = "Hercule Poirot"
    
    carta_comodin = MagicMock(spec=Carta)
    carta_comodin.nombre = "Wildcard"
    
    carta_ariadne = MagicMock(spec=Carta)
    carta_ariadne.nombre = "Ariadne Oliver"
    
    cartas = [carta_poirot, carta_comodin, carta_ariadne]
    
    resultado = set_crud._determinar_nombre_del_set(cartas)
    
    assert resultado == "Set de Hercule Poirot"

def test_determinar_nombre_del_set_solo_comodines(set_crud):
    """Test para _determinar_nombre_del_set con solo comodines."""
    carta_comodin1 = MagicMock(spec=Carta)
    carta_comodin1.nombre = "Wildcard"
    
    carta_comodin2 = MagicMock(spec=Carta)
    carta_comodin2.nombre = "Ariadne Oliver"
    
    cartas = [carta_comodin1, carta_comodin2]
    
    with pytest.raises(ValueError, match="No se puede crear un set utilizando unicamente comodines."):
        set_crud._determinar_nombre_del_set(cartas)

def test_determinar_nombre_del_set_detectives_distintos(set_crud):
    """Test para _determinar_nombre_del_set con detectives distintos."""
    carta_poirot = MagicMock(spec=Carta)
    carta_poirot.nombre = "Hercule Poirot"
    
    carta_marple = MagicMock(spec=Carta)
    carta_marple.nombre = "Miss Marple"
    
    cartas = [carta_poirot, carta_marple]
    
    with pytest.raises(ValueError, match="Las cartas seleccionadas pertenecen a detectives distintos."):
        set_crud._determinar_nombre_del_set(cartas)

def test_obtener_sets_organizados_por_jugador(set_crud, mock_session):
    """Test para obtener_sets_organizados_por_jugador."""
    partida_id = "partida1"
    
    # Mock de sets y cartas
    mock_carta1 = MagicMock(spec=Carta)
    mock_carta1.to_dict.return_value = {"carta_id": 1, "nombre": "Carta1"}
    mock_carta2 = MagicMock(spec=Carta)
    mock_carta2.to_dict.return_value = {"carta_id": 2, "nombre": "Carta2"}
    
    mock_set1 = MagicMock(spec=Set)
    mock_set1.set_id = 1
    mock_set1.nombre = "Set de Test 1"
    mock_set1.owner_id = 1
    mock_set1.cartas = [mock_carta1, mock_carta2]
    
    mock_set2 = MagicMock(spec=Set)
    mock_set2.set_id = 2
    mock_set2.nombre = "Set de Test 2"
    mock_set2.owner_id = 2
    mock_set2.cartas = [mock_carta1]
    
    mock_sets = [mock_set1, mock_set2]
    
    # Configurar el mock de la sesión
    mock_session.query.return_value.filter.return_value.all.return_value = mock_sets
    
    # Ejecutar el método
    resultado = set_crud.obtener_sets_organizados_por_jugador(partida_id)
    
    # Verificaciones
    expected_result = {
        1: {
            "sets": [
                {
                    "id": 1,
                    "nombre": "Set de Test 1",
                    "cartas": [
                        {"carta_id": 1, "nombre": "Carta1"},
                        {"carta_id": 2, "nombre": "Carta2"}
                    ]
                }
            ]
        },
        2: {
            "sets": [
                {
                    "id": 2,
                    "nombre": "Set de Test 2",
                    "cartas": [
                        {"carta_id": 1, "nombre": "Carta1"}
                    ]
                }
            ]
        }
    }
    
    assert resultado == expected_result
    
    # Verificar que se llamó a la consulta correcta
    mock_session.query.assert_called_with(Set)
    mock_session.query.return_value.filter.assert_called_once()
    
    # Verificar que se llamó a to_dict en las cartas
    assert mock_carta1.to_dict.call_count == 2  # Se usa en ambos sets
    assert mock_carta2.to_dict.call_count == 1  # Solo se usa en el primer set

def test_agregar_carta_a_set_existente_exitoso(set_crud, mock_session):
    mock_set = MagicMock(spec=Set)
    mock_set.set_id = 1
    mock_set.partida_id = "partida1"
    mock_set.owner_id = 1
    mock_set.nombre = "Set de Hercule Poirot"
    mock_set.cartas = []

    mock_carta = MagicMock(spec=Carta)
    mock_carta.carta_id = 10
    mock_carta.partida_id = "partida1"
    mock_carta.jugador_id = 1
    mock_carta.ubicacion = "mano"
    mock_carta.nombre = "Hercule Poirot"

    with patch('src.crud.set_crud.CartaCRUD') as MockCartaCRUD, \
        patch('src.crud.set_crud.SecretoCRUD') as MockSecretoCRUD, \
        patch.object(SetCRUD, 'obtener_set', return_value=mock_set), \
        patch('src.crud.set_crud.object_session', return_value=MagicMock()):

        mock_carta_crud = MockCartaCRUD.return_value
        mock_carta_crud.obtener_carta_por_id.return_value = mock_carta
        mock_carta_crud.update_carta_jugador_y_ubicacion = MagicMock()

        mock_secreto_crud = MockSecretoCRUD.return_value
        mock_secreto_crud.obtener_secreto_por_id.return_value = None

        resultado = set_crud.agregar_carta_a_set_existente_y_resolver(
            carta_id=10,
            set_id=1,
            partida_id="partida1",
            owner_id=1,
            jugador_id_objetivo=None,
            secreto_id_objetivo=None
        )

        # Verificaciones
        assert resultado == mock_set
        assert mock_carta in mock_set.cartas
        mock_carta_crud.update_carta_jugador_y_ubicacion.assert_called_once_with(10, 1, "set")

def test_agregar_carta_a_set_existente_ariadne_exitoso(set_crud, mock_session):
    mock_set = MagicMock(spec=Set)
    mock_set.set_id = 2
    mock_set.partida_id = "partida1"
    mock_set.owner_id = 42  # dueño real del set
    mock_set.nombre = "Set de Hercule Poirot"
    mock_set.cartas = []

    mock_carta = MagicMock(spec=Carta)
    mock_carta.carta_id = 11
    mock_carta.partida_id = "partida1"
    mock_carta.jugador_id = 1  # quien juega la Ariadne
    mock_carta.ubicacion = "mano"
    mock_carta.nombre = "Ariadne Oliver"

    mock_secreto = MagicMock()
    mock_secreto.secreto_id = 5
    mock_secreto.jugador_id = 42

    with patch('src.crud.set_crud.CartaCRUD') as MockCartaCRUD, \
        patch('src.crud.set_crud.SecretoCRUD') as MockSecretoCRUD, \
        patch.object(SetCRUD, 'obtener_set', return_value=mock_set), \
        patch('src.crud.set_crud.object_session', return_value=MagicMock()):

        mock_carta_crud = MockCartaCRUD.return_value
        mock_carta_crud.obtener_carta_por_id.return_value = mock_carta
        mock_carta_crud.update_carta_jugador_y_ubicacion = MagicMock()

        mock_secreto_crud = MockSecretoCRUD.return_value
        mock_secreto_crud.obtener_secreto_por_id.return_value = mock_secreto

        resultado = set_crud.agregar_carta_a_set_existente_y_resolver(
            carta_id=11,
            set_id=2,
            partida_id="partida1",
            owner_id=1,
            jugador_id_objetivo=None,
            secreto_id_objetivo=5
        )

        assert resultado == mock_set
        assert mock_carta in mock_set.cartas
        mock_carta_crud.update_carta_jugador_y_ubicacion.assert_called_once_with(11, 42, "set")

def test_agregar_carta_a_set_existente_set_no_encontrado(set_crud):

    with patch.object(SetCRUD, 'obtener_set', return_value=None):
        with pytest.raises(ValueError, match="El set especificado no existe."):
            set_crud.agregar_carta_a_set_existente_y_resolver(
                carta_id=1, set_id=999, partida_id="p", owner_id=1
            )


def test_agregar_carta_a_set_existente_carta_no_en_mano_o_owner_incorrecto(set_crud):

    mock_set = MagicMock(spec=Set)
    mock_set.set_id = 3
    mock_set.partida_id = "partida1"
    mock_set.owner_id = 1

    mock_carta = MagicMock(spec=Carta)
    mock_carta.carta_id = 20
    mock_carta.partida_id = "partida1"
    mock_carta.jugador_id = 2  # distinto al owner
    mock_carta.ubicacion = "mesa"
    mock_carta.nombre = "Hercule Poirot"

    with patch.object(SetCRUD, 'obtener_set', return_value=mock_set), \
        patch('src.crud.set_crud.CartaCRUD') as MockCartaCRUD, \
        patch('src.crud.set_crud.object_session', return_value=MagicMock()):

        mock_carta_crud = MockCartaCRUD.return_value
        mock_carta_crud.obtener_carta_por_id.return_value = mock_carta

        with pytest.raises(ValueError):
            set_crud.agregar_carta_a_set_existente_y_resolver(
                carta_id=20, set_id=3, partida_id="partida1", owner_id=1
            )