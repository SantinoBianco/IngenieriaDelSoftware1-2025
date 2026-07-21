import pytest
from unittest.mock import MagicMock, patch
from src.crud.secreto_crud import SecretoCRUD
from src.modelos.secretos_modelo import Secreto
from src.modelos.jugador_modelo import Jugador

@pytest.fixture
def mock_session():
    return MagicMock()

@pytest.fixture
def secreto_crud(mock_session):
    """Instancia SecretoCRUD e inyecta la sesión mockeada."""
    return SecretoCRUD(mock_session)

@patch("src.crud.secreto_crud.Secreto")
def test_crear_secretos(mock_secreto_class, secreto_crud, mock_session):
    """Test para crear_secretos método."""
    mock_instance = MagicMock()
    mock_secreto_class.side_effect = lambda **kwargs: mock_instance

    secreto_crud.crear_secretos("partida1")

    # Verificamos que se llamó a add_all con la lista de secretos
    mock_session.add_all.assert_called_once()
    # Verificamos que se hizo commit
    mock_session.commit.assert_called_once()

def test_repartir_secretos(secreto_crud, mock_session):
    """Test para repartir_secretos método."""
    # Creamos mocks para los jugadores
    jugador1 = MagicMock()
    jugador1.jugador_id = 1
    jugador2 = MagicMock()
    jugador2.jugador_id = 2
    jugador3 = MagicMock()
    jugador3.jugador_id = 3
    
    jugadores = [jugador1, jugador2, jugador3]

    # Creamos mocks para los secretos
    secreto_asesino = MagicMock(spec=Secreto)
    secreto_asesino.descripcion = "Soy el asesino"
    secreto_asesino.jugador_id = None
    
    secretos_normales = [MagicMock(spec=Secreto) for _ in range(8)]
    for secreto in secretos_normales:
        secreto.descripcion = "Enjoy"
        secreto.jugador_id = None
    
    todos_secretos = [secreto_asesino] + secretos_normales

    # Configuramos el mock de la sesión
    mock_session.query.return_value.filter.return_value.all.return_value = todos_secretos

    # Ejecutamos el método a testear
    secreto_crud.repartir_secretos("partida1", jugadores)

    # Verificaciones
    # 1. El secreto "Soy el asesino" fue asignado a un jugador
    assert secreto_asesino.jugador_id in [1, 2, 3]
    
    # 2. Se hizo commit
    mock_session.commit.assert_called_once()

def test_repartir_secretos_sin_suficientes_secretos(secreto_crud, mock_session):
    """Test para cuando no hay suficientes secretos para repartir."""
    jugadores = [MagicMock() for _ in range(3)]
    
    # Solo 5 secretos disponibles (necesitamos 9 para 3 jugadores)
    secretos = [MagicMock(spec=Secreto) for _ in range(5)]
    for secreto in secretos:
        secreto.descripcion = "Enjoy"
        secreto.jugador_id = None
    
    mock_session.query.return_value.filter.return_value.all.return_value = secretos

    # Verificamos que se lanza la excepción
    with pytest.raises(ValueError, match="No hay suficientes secretos para repartir"):
        secreto_crud.repartir_secretos("partida1", jugadores)

def test_repartir_secretos_sin_secreto_asesino(secreto_crud, mock_session):
    """Test para cuando no se encuentra el secreto 'Soy el asesino'."""
    jugadores = [MagicMock() for _ in range(3)]
    
    # Secretos sin el "Soy el asesino"
    secretos = [MagicMock(spec=Secreto) for _ in range(9)]
    for secreto in secretos:
        secreto.descripcion = "Enjoy"
        secreto.jugador_id = None
    
    mock_session.query.return_value.filter.return_value.all.return_value = secretos

    # Verificamos que se lanza la excepción
    with pytest.raises(ValueError, match='No se encontró el secreto "Soy el asesino"'):
        secreto_crud.repartir_secretos("partida1", jugadores)

def test_repartir_secretos_asignacion_correcta(secreto_crud, mock_session):
    """Test para verificar que la asignación de secretos es correcta."""
    # Creamos 3 jugadores
    jugadores = [MagicMock() for _ in range(3)]
    for i, jugador in enumerate(jugadores):
        jugador.jugador_id = i + 1

    # Creamos 9 secretos (1 asesino + 8 enjoy)
    secreto_asesino = MagicMock(spec=Secreto)
    secreto_asesino.descripcion = "Soy el asesino"
    secreto_asesino.jugador_id = None
    
    secretos_enjoy = [MagicMock(spec=Secreto) for _ in range(8)]
    for secreto in secretos_enjoy:
        secreto.descripcion = "Enjoy"
        secreto.jugador_id = None
    
    todos_secretos = [secreto_asesino] + secretos_enjoy

    mock_session.query.return_value.filter.return_value.all.return_value = todos_secretos

    # Ejecutamos el método
    secreto_crud.repartir_secretos("partida1", jugadores)

    # Verificamos que el asesino tiene exactamente 2 secretos (1 asesino + 1 enjoy)
    jugador_asesino_id = secreto_asesino.jugador_id
    
    # Contamos cuántos secretos tiene cada jugador
    secretos_por_jugador = {}
    for secreto in todos_secretos:
        if secreto.jugador_id not in secretos_por_jugador:
            secretos_por_jugador[secreto.jugador_id] = 0
        secretos_por_jugador[secreto.jugador_id] += 1

    # El asesino debe tener 2 secretos, los demás 3 cada uno
    assert secretos_por_jugador[jugador_asesino_id] == 2
    
    for jugador_id, cantidad in secretos_por_jugador.items():
        if jugador_id != jugador_asesino_id:
            assert cantidad == 3

    # Verificamos que se hizo commit
    mock_session.commit.assert_called_once()

def test_revelar_secreto_exitoso(secreto_crud, mock_session):
    """Revelar un secreto exitosamente debe setear revelado True y hacer commit."""
    secreto = MagicMock(spec=Secreto)
    secreto.secreto_id = 10
    secreto.revelado = False
    secreto.jugador_id = 1
    secreto.partida_id = "partida1"

    # Mock del jugador con el atributo en_desgracia
    mock_jugador = MagicMock()
    mock_jugador.en_desgracia = False

    # Mock de los otros secretos del jugador (para la verificación de desgracia)
    mock_secretos = [secreto, MagicMock(revelado=False), MagicMock(revelado=False)]

    # Configurar query para que devuelva diferentes resultados según el contexto
    def query_side_effect(model):
        mock_query = MagicMock()
        if model == Secreto:
            # Primera llamada: obtener el secreto a revelar
            # Segunda llamada: obtener todos los secretos del jugador
            mock_query.filter.return_value.first.return_value = secreto
            mock_query.filter.return_value.all.return_value = mock_secretos
        else:  # Jugador
            mock_query.filter.return_value.first.return_value = mock_jugador
        return mock_query

    mock_session.query.side_effect = query_side_effect

    resultado = secreto_crud.revelar_secreto(secreto.secreto_id)

    assert resultado is secreto
    assert secreto.revelado is True
    mock_session.commit.assert_called_once()

def test_ocultar_secreto_exitoso(secreto_crud, mock_session):
    """Ocultar un secreto exitosamente debe setear revelado False y hacer commit."""
    secreto = MagicMock(spec=Secreto)
    secreto.secreto_id = 20
    secreto.revelado = True
    secreto.jugador_id = 2
    secreto.partida_id = "partida2"

    # Mock del jugador con el atributo en_desgracia
    mock_jugador = MagicMock()
    mock_jugador.en_desgracia = True

    # Mock de los otros secretos del jugador (para la verificación de desgracia)
    mock_secretos = [secreto, MagicMock(revelado=True), MagicMock(revelado=True)]

    # Configurar query para que devuelva diferentes resultados según el contexto
    def query_side_effect(model):
        mock_query = MagicMock()
        if model == Secreto:
            # Primera llamada: obtener el secreto a ocultar
            # Segunda llamada: obtener todos los secretos del jugador
            mock_query.filter.return_value.first.return_value = secreto
            mock_query.filter.return_value.all.return_value = mock_secretos
        else:  # Jugador
            mock_query.filter.return_value.first.return_value = mock_jugador
        return mock_query

    mock_session.query.side_effect = query_side_effect

    resultado = secreto_crud.ocultar_secreto(secreto.secreto_id)

    assert resultado is secreto
    assert secreto.revelado is False
    mock_session.commit.assert_called_once()

def test_robar_secreto_exitoso(secreto_crud, mock_session):
    """Robar un secreto exitosamente debe reasignar jugador_id y hacer commit."""
    secreto = MagicMock(spec=Secreto)
    secreto.secreto_id = 30
    secreto.jugador_id = None

    mock_session.query.return_value.filter.return_value.first.return_value = secreto

    resultado = secreto_crud.robar_secreto(5, secreto.secreto_id)

    assert resultado is secreto
    assert secreto.jugador_id == 5
    mock_session.commit.assert_called_once()

def test_obtener_asesino_exitoso(secreto_crud, mock_session):
    """Test para obtener_asesino cuando se encuentra correctamente."""
    # Creamos un mock del secreto del asesino
    secreto_asesino = MagicMock(spec=Secreto)
    secreto_asesino.descripcion = "Soy el asesino"
    secreto_asesino.jugador_id = 42
    secreto_asesino.partida_id = "partida1"

    # Configuramos el mock de la sesión para que devuelva el secreto del asesino
    mock_session.query.return_value.filter.return_value.first.return_value = secreto_asesino

    # Ejecutamos el método
    resultado = secreto_crud.obtener_asesino("partida1")

    # Verificamos que devuelve el ID correcto del asesino
    assert resultado == 42
    
    # Verificamos que se llamó a los métodos de query con los filtros correctos
    mock_session.query.assert_called_with(Secreto)
    mock_session.query.return_value.filter.assert_called_once()

def test_obtener_asesino_no_encontrado(secreto_crud, mock_session):
    """Test para obtener_asesino cuando no se encuentra el secreto."""
    # Configuramos el mock para que devuelva None (no encuentra el secreto)
    mock_session.query.return_value.filter.return_value.first.return_value = None

    # Verificamos que se lanza la excepción
    with pytest.raises(ValueError, match='No se encontró el secreto "Soy el asesino"'):
        secreto_crud.obtener_asesino("partida1")

def test_actualizar_desgracia_jugador(secreto_crud, mock_session):
    
    # --- Caso: jugador entra en desgracia ---
    jugador_id = 99
    partida_id = "partidaX"
    # 3 secretos, todos revelados
    secretos = [MagicMock(revelado=True), MagicMock(revelado=True), MagicMock(revelado=True)]
    mock_jugador = MagicMock()
    mock_jugador.en_desgracia = False

    def query_side_effect(model):
        mock_query = MagicMock()
        if model.__name__ == "Secreto":
            mock_query.filter.return_value.all.return_value = secretos
        else:  # Jugador
            mock_query.filter.return_value.first.return_value = mock_jugador
        return mock_query

    mock_session.query.side_effect = query_side_effect

    sc = secreto_crud
    sc._actualizar_desgracia_jugador(jugador_id, partida_id)
    assert mock_jugador.en_desgracia is True

    # --- Caso: jugador sale de desgracia ---
    secretos = [MagicMock(revelado=True), MagicMock(revelado=True), MagicMock(revelado=False)]
    mock_jugador.en_desgracia = True
    sc._actualizar_desgracia_jugador(jugador_id, partida_id)
    assert mock_jugador.en_desgracia is False

    # --- Caso: jugador no cambia (ya estaba en False y no cumple condición) ---
    secretos = [MagicMock(revelado=False), MagicMock(revelado=False), MagicMock(revelado=False)]
    mock_jugador.en_desgracia = False
    sc._actualizar_desgracia_jugador(jugador_id, partida_id)
    assert mock_jugador.en_desgracia is False
def test_and_then_there_was_one_more_exitoso(secreto_crud, mock_session):
    """Test exitoso para and_then_there_was_one_more: cambia dueño y luego oculta secreto."""
    # Configurar mocks
    secreto_original = MagicMock(spec=Secreto)
    secreto_original.secreto_id = 1
    secreto_original.jugador_id = 10  # Dueño original
    secreto_original.revelado = True
    
    secreto_oculto = MagicMock(spec=Secreto)
    secreto_oculto.secreto_id = 1
    secreto_oculto.jugador_id = 20  # Nuevo dueño (después del cambio)
    secreto_oculto.revelado = False  # Después de ocultar

    # Mockear obtener_secreto_por_id para devolver el secreto original
    with patch.object(secreto_crud, 'obtener_secreto_por_id') as mock_obtener:
        with patch.object(secreto_crud, '_ocultar_secreto_en_sesion') as mock_ocultar:
            mock_obtener.return_value = secreto_original
            mock_ocultar.return_value = secreto_oculto

            # Ejecutar el método
            resultado = secreto_crud.and_then_there_was_one_more(1, 20)

            # Verificaciones del orden:
            # 1. Primero se obtiene el secreto
            mock_obtener.assert_called_once_with(1)
            # 2. Luego se cambia el jugador_id en el secreto original
            assert secreto_original.jugador_id == 20
            # 3. Finalmente se oculta el secreto
            mock_ocultar.assert_called_once_with(1)
            
            # El resultado debe ser el secreto oculto
            assert resultado is secreto_oculto
            mock_session.commit.assert_called_once()

def test_and_then_there_more_mismo_jugador(secreto_crud, mock_session):
    """Test que permite cambiar el dueño al mismo jugador (edge case)."""
    secreto_original = MagicMock(spec=Secreto)
    secreto_original.secreto_id = 1
    secreto_original.jugador_id = 10
    
    secreto_oculto = MagicMock(spec=Secreto)
    secreto_oculto.secreto_id = 1
    secreto_oculto.jugador_id = 10  # Mismo jugador
    secreto_oculto.revelado = False

    with patch.object(secreto_crud, 'obtener_secreto_por_id') as mock_obtener:
        with patch.object(secreto_crud, '_ocultar_secreto_en_sesion') as mock_ocultar:
            mock_obtener.return_value = secreto_original
            mock_ocultar.return_value = secreto_oculto
            
            # Ejecutar con el mismo jugador como nuevo dueño
            resultado = secreto_crud.and_then_there_was_one_more(1, 10)
            
            # Verificaciones
            mock_obtener.assert_called_once_with(1)
            # El jugador_id se cambió (aunque sea el mismo)
            assert secreto_original.jugador_id == 10
            mock_ocultar.assert_called_once_with(1)
            mock_session.commit.assert_called_once()
            assert resultado is secreto_oculto
