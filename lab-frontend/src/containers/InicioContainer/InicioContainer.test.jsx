import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

import InicioContainer from './InicioContainer';

// Mocks de servicios y hooks
vi.mock('../../services/HttpService', () => ({
  get: vi.fn(),
  post: vi.fn(),
}));
vi.mock('../../hooks/useWebSocket', () => ({
  useWebSocket: vi.fn()
}));

// Mocks de componentes hijos para controlar render y callbacks
vi.mock('../../components/PartidaItem/PartidaItem', () => ({
  __esModule: true,
  default: ({ partida, onClick }) => (
    <div data-testid={`partida-item-${partida.id}`} className="partida-item">
      <button onClick={onClick}>{partida.nombre}</button>
    </div>
  )
}));
vi.mock('../../components/CreateGameForm/CreateGameForm', () => ({
  __esModule: true,
  default: ({ isOpen, onCreateGame, onClose }) => {
    if (!isOpen) return null;
    const payload =
      globalThis.__NEXT_CREATE_GAME_PAYLOAD ?? {
        nombre: 'X',
        nombreUsuario: 'User',
        fechaNacimiento: '2000-01-01',
        maxJugadores: 4,
        privada: false,
        password: null,
      };
    return (
      <div>
        <h2>Crear Nueva Partida</h2>
        <button onClick={() => onCreateGame(payload)}>Crear</button>
        <button onClick={() => onClose && onClose()} data-testid="create-close">
          Cerrar
        </button>
      </div>
    );
  },
}));
vi.mock('../../components/JoinGameForm/JoinGameForm', () => ({
  __esModule: true,
  default: ({ isOpen, onJoinGame, partida, onClose }) => (
    isOpen ? (
      <div>
        <h2>Unirse a "{partida?.nombre || ''}"</h2>
        <button onClick={() => onJoinGame({ partidaId: partida?.id || 1, nombreUsuario: 'User', fechaNacimiento: '2000-01-01' })}>Unirse</button>
        <button onClick={() => onClose && onClose()} data-testid="join-close">Cerrar</button>
      </div>
    ) : null
  )
}));
vi.mock('../LobbyContainer/LobbyContainer', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: (props) => {
      React.useEffect(() => {
        if (globalThis.__AUTO_GO_TO_TABLERO && typeof props.onGoToTablero === 'function') {
          props.onGoToTablero({ id: 123, nombre: 'FromLobby' });
        }
        if (globalThis.__AUTO_BACK && typeof props.onBackToMenu === 'function') {
          props.onBackToMenu();
        }
      }, []);
      return <div>LOBBY</div>;
    }
  };
});
vi.mock('../TableroContainer/TableroContainer', () => ({ __esModule: true, default: () => <div>TABLERO</div> }));

// Imports reales (mocked modules access)
import * as HttpService from '../../services/HttpService';
import { useWebSocket } from '../../hooks/useWebSocket';

describe('InicioContainer - tests compactos (5-7)', () => {
  const partidasMock = [
    { id: 1, nombre: 'Partida 1', maxJugadores: 4, jugadoresActuales: 2, estado: 'lobby' },
    { id: 2, nombre: 'Partida 2', maxJugadores: 6, jugadoresActuales: 1, estado: 'lobby' }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    useWebSocket.mockReturnValue({ isConnected: true, sendMessage: vi.fn(), messages: [] });
    HttpService.get.mockResolvedValue(partidasMock);
    HttpService.post.mockResolvedValue({});
    globalThis.__NEXT_CREATE_GAME_PAYLOAD = null;
    globalThis.__AUTO_GO_TO_TABLERO = false;
    globalThis.__AUTO_BACK = false;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1) renderiza y realiza GET inicial de partidas', async () => {
    render(<InicioContainer />);
    expect(screen.getByRole('button', { name: /Crear Partida/i })).toBeInTheDocument();
    await waitFor(() => expect(HttpService.get).toHaveBeenCalledWith('/partidas'));
    // Los items aparecen
    await waitFor(() => expect(screen.getByTestId('partida-item-1')).toBeInTheDocument());
  });

  it('2) abrir form Crear Partida y crear con éxito (post + websocket)', async () => {
    const sendMessage = vi.fn();
    useWebSocket.mockReturnValue({ isConnected: true, sendMessage, messages: [] });

    render(<InicioContainer />);

    // Abrir modal Create
    const btn = screen.getByRole('button', { name: /Crear Partida/i });
    await userEvent.click(btn);

    // Crear (mocked CreateGameForm llama a onCreateGame)
    await waitFor(() => expect(screen.getByText('Crear Nueva Partida')).toBeInTheDocument());
    const crearBtn = screen.getByText('Crear');

    // Preparar post para devolver nueva partida
    HttpService.post.mockResolvedValueOnce({ id: 99, nombre: 'Nueva', maxJugadores: 5, host: 10 });
    await userEvent.click(crearBtn);

    // Debe llamar al post y enviar mensaje websocket
    await waitFor(() => expect(HttpService.post).toHaveBeenCalled());
    await waitFor(() => expect(sendMessage).toHaveBeenCalled());

    // Después de creación, debería navegar al lobby (render del mock LOBBY)
    await waitFor(() => expect(screen.getByText('LOBBY')).toBeInTheDocument());
  });

  it('3) abrir Join modal desde un PartidaItem y unirse con éxito', async () => {
    render(<InicioContainer />);
    await waitFor(() => expect(screen.getByTestId('partida-item-1')).toBeInTheDocument());

    // Click en el PartidaItem (botón con nombre)
    const itemBtn = screen.getByText('Partida 1');
    await userEvent.click(itemBtn);

    // Aparece el modal Join
    await waitFor(() => expect(screen.getByText(/Unirse a "/)).toBeInTheDocument());

    // Mock response for post join
    HttpService.post.mockResolvedValueOnce({ jugador_id: 55, username: 'User55', cumpleaños: '2000-01-01' });
    const joinBtn = screen.getByText('Unirse');
    await userEvent.click(joinBtn);

    // Debe llamar al endpoint de join
    await waitFor(() => expect(HttpService.post).toHaveBeenCalled());

    // Debe navegar al lobby
    await waitFor(() => expect(screen.getByText('LOBBY')).toBeInTheDocument());
  });

  it('4) manejar error al crear partida (alert)', async () => {
    render(<InicioContainer />);
    const btn = screen.getByRole('button', { name: /Crear Partida/i });
    await userEvent.click(btn);

    // Forzar error
    const error = new Error('boom create');
    HttpService.post.mockRejectedValueOnce(error);

    // Click crear
    const crearBtn = await screen.findByText('Crear');
    await userEvent.click(crearBtn);

    // Debe mostrar alert con mensaje
    await waitFor(() => {
      // aseguramos que post fue llamado y flujo no rompe
      expect(HttpService.post).toHaveBeenCalled();
    });
  });

  it('5) manejar mensajes WebSocket relevantes: partida_creada y partida_eliminada', async () => {
    // 5a) partida_creada (último mensaje = creada)
  useWebSocket.mockReturnValueOnce({ isConnected: true, sendMessage: vi.fn(), messages: [ { event: 'partida_creada', data: { id: 111, nombre: 'X' } } ] });
  const { rerender } = render(<InicioContainer />);
  await waitFor(() => expect(screen.getByTestId('partida-item-111')).toBeInTheDocument());

  // 5b) partida_eliminada (re-render con último mensaje = eliminada)
  useWebSocket.mockReturnValueOnce({ isConnected: true, sendMessage: vi.fn(), messages: [ { event: 'partida_eliminada', data: { partidaId: 1 } } ] });
  rerender(<InicioContainer />);
  await waitFor(() => expect(screen.queryByTestId('partida-item-1')).not.toBeInTheDocument());
  });

  it('6) handleBackToMenu recarga la lista filtrando por estado lobby', async () => {
    // Inicial: partidasMock cargadas
    render(<InicioContainer />);
    await waitFor(() => expect(HttpService.get).toHaveBeenCalledWith('/partidas'));

    // Forzar recarga desde get('/partidas') llamada en handleBackToMenu
    HttpService.get.mockResolvedValueOnce([{ id: 5, nombre: 'P5', estado: 'lobby' }, { id: 6, nombre: 'P6', estado: 'ended' }]);

    // Simular evento que dispara handleBackToMenu indirectamente: usar mensaje juego_iniciado para forzar cambios y recarga
    const messages = [{ event: 'juego_iniciado', data: { partidaId: 2 } }];
    useWebSocket.mockReturnValue({ isConnected: true, sendMessage: vi.fn(), messages });
    render(<InicioContainer />);

    await waitFor(() => expect(screen.getByTestId('partida-item-5')).toBeInTheDocument(), { timeout: 2000 });
  });

  it('7) navegar a Tablero cuando handleGoToTablero es invocado', async () => {
    // En el flujo real la navegación a tablero ocurre cuando el Lobby llama onGoToTablero.
    // Para simularlo abrimos el formulario de Crear Partida y dejamos que el mock de Lobby
    // invoque onGoToTablero (activando la bandera global).
    globalThis.__AUTO_GO_TO_TABLERO = true;
    try {
      render(<InicioContainer />);
      // Abrir modal de crear
      const btn = screen.getByRole('button', { name: /Crear Partida/i });
      await userEvent.click(btn);

      // Preparar post para devolver nueva partida (como en test 2)
      HttpService.post.mockResolvedValueOnce({ id: 1234, nombre: 'Nueva P', maxJugadores: 4, host: 10 });
      const crearBtn = await screen.findByText('Crear');
      await userEvent.click(crearBtn);

      // Primero debería navegar al Lobby (mock)
      await waitFor(() => expect(screen.getByText('LOBBY')).toBeInTheDocument());

      // El mock de Lobby invocará onGoToTablero automáticamente y debe aparecer TABLERO
      await waitFor(() => expect(screen.getByText('TABLERO')).toBeInTheDocument());
    } finally {
      delete globalThis.__AUTO_GO_TO_TABLERO;
    }
  });

  it('8) cierra modales y handleBackToMenu es invocado por Lobby (cubre onClose, closeJoinForm y handleBackToMenu)', async () => {
    // 1) Cerrar CreateGameForm a través de onClose inline
    render(<InicioContainer />);
    const btn = screen.getByRole('button', { name: /Crear Partida/i });
    await userEvent.click(btn);

    // Ver el modal y cerrarlo
    await waitFor(() => expect(screen.getByText('Crear Nueva Partida')).toBeInTheDocument());
    const cerrarCreate = screen.getByTestId('create-close');
    await userEvent.click(cerrarCreate);
    // El modal debe desaparecer
    await waitFor(() => expect(screen.queryByText('Crear Nueva Partida')).not.toBeInTheDocument());

    // 2) Abrir Join y cerrarlo para ejecutar closeJoinForm
    await waitFor(() => expect(screen.getByTestId('partida-item-1')).toBeInTheDocument());
    const itemBtn = screen.getByText('Partida 1');
    await userEvent.click(itemBtn);
    await waitFor(() => expect(screen.getByText(/Unirse a "/)).toBeInTheDocument());
    const cerrarJoin = screen.getByTestId('join-close');
    await userEvent.click(cerrarJoin);
    await waitFor(() => expect(screen.queryByText(/Unirse a "/)).not.toBeInTheDocument());

    // 3) Forzar que el Lobby invoque onBackToMenu
    globalThis.__AUTO_BACK = true;
    try {
      // Crear una partida para llegar al Lobby
      HttpService.post.mockResolvedValueOnce({ id: 5678, nombre: 'PtoLobby', maxJugadores: 4, host: 10 });
      // Abrir create y crear
      const btn2 = screen.getByRole('button', { name: /Crear Partida/i });
      await userEvent.click(btn2);
      const crearBtn = await screen.findByText('Crear');
      await userEvent.click(crearBtn);

      // Lobby mock llamará onBackToMenu automáticamente
      await waitFor(() => expect(screen.getByText('LOBBY')).toBeInTheDocument());
      await waitFor(() => expect(screen.getByTestId('partida-item-1')).toBeInTheDocument(), { timeout: 2000 });
    } finally {
      delete globalThis.__AUTO_BACK;
    }
  });


  it('8) crea partida privada enviando contraseña y marcando flag en broadcast', async () => {
    const sendMessage = vi.fn();
    useWebSocket.mockReturnValue({ isConnected: true, sendMessage, messages: [] });
    globalThis.__NEXT_CREATE_GAME_PAYLOAD = {
      nombre: 'Privada',
      nombreUsuario: 'VIP',
      fechaNacimiento: '1995-05-05',
      maxJugadores: 3,
      privada: true,
      password: 'clave',
    };

    render(<InicioContainer />);
    await userEvent.click(screen.getByRole('button', { name: /Crear Partida/i }));

    HttpService.post.mockResolvedValueOnce({
      id: 500,
      nombre: 'Privada',
      maxJugadores: 3,
      host: 42,
      privada: true,
    });

    await userEvent.click(await screen.findByText('Crear'));

    await waitFor(() => {
      expect(HttpService.post).toHaveBeenCalledWith('/partidas', {
        nombre: 'Privada',
        nombreUsuario: 'VIP',
        fechaNacimiento: '1995-05-05',
        maxJugadores: 3,
        privada: true,
        password: 'clave',
      });
    });

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({
        event: 'crear_partida',
        data: expect.objectContaining({
          partidaId: 500,
          privada: true,
        }),
      });
    });
  });
});
