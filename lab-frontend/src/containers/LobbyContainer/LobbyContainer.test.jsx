import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

import LobbyContainer from './LobbyContainer';
import * as HttpService from '../../services/HttpService';
import { useWebSocket } from '../../hooks/useWebSocket';

// Mock del servicio HTTP
vi.mock('../../services/HttpService', () => ({
  post: vi.fn(),
  del: vi.fn()
}));

// Mock del hook WebSocket
vi.mock('../../hooks/useWebSocket', () => ({
  useWebSocket: vi.fn()
}));

// Mock del componente Lobby
vi.mock('../../components/Lobby/Lobby', () => ({
  default: ({ gameData, currentUser, onStartGame, onLeaveGame, onCancelGame, hostCancelled, onHostCancelBackToMenu }) => (
    <div data-testid="lobby">
      <h1>Sala de espera: {gameData.nombre}</h1>
      <div data-testid="player-count">
        Jugadores: {gameData.players?.length || 0}/{gameData.maxJugadores}
      </div>
      <div data-testid="players-list">
        {gameData.players?.map(player => (
          <div key={player.id} data-testid={`player-${player.id}`}>
            <span>{player.nombre}</span>
            {player.isOwner && <span data-testid={`owner-icon-${player.id}`}>👑</span>}
          </div>
        ))}
      </div>
      {currentUser.id === gameData.owner && (
        <button data-testid="start-game" onClick={onStartGame}>
          Iniciar Partida
        </button>
      )}
      <button data-testid="leave-game" onClick={onLeaveGame}>
        Salir
      </button>
      {typeof onCancelGame === 'function' && (
        <button data-testid="cancel-game" onClick={onCancelGame}>
          Cancelar Partida
        </button>
      )}
      {hostCancelled && (
        <div data-testid="host-cancelled">
          <span>El anfitrión canceló la partida</span>
          <button data-testid="host-back" onClick={onHostCancelBackToMenu}>Volver</button>
        </div>
      )}
    </div>
  )
}));

describe('LobbyContainer', () => {
  const mockSendMessage = vi.fn();
  const mockOnBackToMenu = vi.fn();
  const mockOnGoToTablero = vi.fn();
  
  const mockWebSocketReturn = {
    isConnected: true,
    sendMessage: mockSendMessage,
    messages: []
  };

  const mockGameConfig = {
    id: 1,
    partidaId: 1,
    nombre: 'Partida Test',
    maxJugadores: 4,
    host: 1,
    owner: 1,
    players: [
      { id: 1, nombre: 'Jugador1', isOwner: true },
      { id: 2, nombre: 'Jugador2', isOwner: false }
    ]
  };

  const mockCurrentUser = {
    id: 1,
    nombre: 'Jugador1'
  };

  const defaultProps = {
    gameConfig: mockGameConfig,
    currentUser: mockCurrentUser,
    onBackToMenu: mockOnBackToMenu,
    onGoToTablero: mockOnGoToTablero
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useWebSocket.mockReturnValue(mockWebSocketReturn);
    HttpService.post.mockResolvedValue({});
    HttpService.del.mockResolvedValue({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // 1. Pantalla (sala de espera), Cantidad de jugadores, nombres
  it('1) muestra pantalla de sala de espera con cantidad de jugadores y nombres', async () => {
    render(<LobbyContainer {...defaultProps} />);
    
    // Verificar que se renderiza la sala de espera
    expect(screen.getByTestId('lobby')).toBeInTheDocument();
    expect(screen.getByText('Sala de espera: Partida Test')).toBeInTheDocument();
    
    // Verificar cantidad de jugadores
    expect(screen.getByTestId('player-count')).toHaveTextContent('Jugadores: 2/4');
    
    // Verificar nombres de jugadores
    expect(screen.getByTestId('player-1')).toHaveTextContent('Jugador1');
    expect(screen.getByTestId('player-2')).toHaveTextContent('Jugador2');
  });

  // 2. Se muestra el owner con icono distintivo
  it('2) muestra el owner con icono distintivo', async () => {
    render(<LobbyContainer {...defaultProps} />);
    
    // Verificar que el owner tiene icono distintivo
    expect(screen.getByTestId('owner-icon-1')).toBeInTheDocument();
    expect(screen.getByTestId('owner-icon-1')).toHaveTextContent('👑');
    
    // Verificar que el jugador normal no tiene icono
    expect(screen.queryByTestId('owner-icon-2')).not.toBeInTheDocument();
  });

  // 3. Botón de iniciar para el owner
  it('3) muestra botón de iniciar solo para el owner', async () => {
    render(<LobbyContainer {...defaultProps} />);
    
    // Verificar que el owner ve el botón de iniciar
    expect(screen.getByTestId('start-game')).toBeInTheDocument();
    expect(screen.getByTestId('start-game')).toHaveTextContent('Iniciar Partida');
  });

  it('4) no muestra botón de iniciar para jugadores no-owner', async () => {
    const nonOwnerProps = {
      ...defaultProps,
      currentUser: { id: 2, nombre: 'Jugador2' }
    };
    
    render(<LobbyContainer {...nonOwnerProps} />);
    
    // Verificar que el jugador no-owner NO ve el botón de iniciar
    expect(screen.queryByTestId('start-game')).not.toBeInTheDocument();
  });

  // 5. Al unirse jugadores, el lobby se actualiza en tiempo real
  it('5) actualiza lobby en tiempo real cuando se une un jugador', async () => {
    const messagesWithNewPlayer = [
      {
        event: 'jugador_unido',
        data: {
          partidaId: 1,
          jugador: { id: 3, nombre: 'Jugador3', isOwner: false }
        }
      }
    ];

    useWebSocket.mockReturnValue({
      ...mockWebSocketReturn,
      messages: messagesWithNewPlayer
    });

    render(<LobbyContainer {...defaultProps} />);
    
    await waitFor(() => {
      // Verificar que se actualiza la cantidad
      expect(screen.getByTestId('player-count')).toHaveTextContent('Jugadores: 3/4');
      
      // Verificar que aparece el nuevo jugador
      expect(screen.getByTestId('player-3')).toBeInTheDocument();
      expect(screen.getByTestId('player-3')).toHaveTextContent('Jugador3');
    });
  });

  // 6. Al abandonar jugadores, el lobby se actualiza en tiempo real
  it('6) actualiza lobby en tiempo real cuando abandona un jugador', async () => {
    const messagesWithPlayerLeft = [
      {
        event: 'jugador_desconectado',
        data: {
          partidaId: 1,
          jugadorId: 2
        }
      }
    ];

    useWebSocket.mockReturnValue({
      ...mockWebSocketReturn,
      messages: messagesWithPlayerLeft
    });

    render(<LobbyContainer {...defaultProps} />);
    
    await waitFor(() => {
      // Verificar que se actualiza la cantidad
      expect(screen.getByTestId('player-count')).toHaveTextContent('Jugadores: 1/4');
      
      // Verificar que el jugador ya no aparece
      expect(screen.queryByTestId('player-2')).not.toBeInTheDocument();
    });
  });

  // 7. Debe permitir al owner Iniciar
  it('7) permite al owner iniciar la partida', async () => {
    const user = userEvent.setup();
    render(<LobbyContainer {...defaultProps} />);

    const startButton = screen.getByTestId('start-game');

    // Verificar que el botón es funcional
    expect(startButton).toBeEnabled();

    // Hacer clic en iniciar
    await user.click(startButton);

    // Verificar que se llama al servicio HTTP
    await waitFor(() => {
      expect(HttpService.post).toHaveBeenCalledWith('/partidas/1/start', {
        jugadorId: 1
      });
    });

    // Verificar que si hay WebSocket, se envía el evento
    expect(mockSendMessage).toHaveBeenCalledWith(expect.objectContaining({ event: 'partida_iniciada' }));

    // Verificar que se navega al tablero
    expect(mockOnGoToTablero).toHaveBeenCalledWith(expect.objectContaining({ id: 1, estado: 'jugando' }));
  });

  // 8. Al salir, debe llamar al del, enviar mensaje WS y volver al menú
  it('8) al salir llama del, envia mensaje y vuelve al menu', async () => {
    const user = userEvent.setup();
    render(<LobbyContainer {...defaultProps} />);

    const leaveButton = screen.getByTestId('leave-game');
    await user.click(leaveButton);

    await waitFor(() => {
      expect(HttpService.del).toHaveBeenCalledWith('/partidas/1/jugadores/1');
    });

    // sendMessage debe haberse llamado con jugador_manual_salida
    expect(mockSendMessage).toHaveBeenCalledWith(expect.objectContaining({ event: 'jugador_manual_salida' }));

    // onBackToMenu debe haberse llamado
    expect(mockOnBackToMenu).toHaveBeenCalled();
  });

  // 9. Cancelar partida y flujo hostCancelled
  it('9) cancelar partida y manejo de hostCancelled', async () => {
    const user = userEvent.setup();

    // Forzamos que el Lobby muestre el boton de cancelar (owner)
    render(<LobbyContainer {...defaultProps} />);

    // Hacer click en cancelar
    const cancelButton = screen.getByTestId('cancel-game');
    await user.click(cancelButton);

    // delete general de la partida debe llamarse
    await waitFor(() => {
      expect(HttpService.del).toHaveBeenCalledWith('/partidas/1');
    });

    // Finalmente, onBackToMenu debe haberse llamado por el finally
    expect(mockOnBackToMenu).toHaveBeenCalled();

    // Simular que el host canceló y que aparece el mensaje para un jugador NO-owner
    // Re-render con hostCancelled true: el comportamiento de 'partida_eliminada' muestra
    // el mensaje solo para jugadores que no sean el owner, así que pasamos un currentUser distinto.
    useWebSocket.mockReturnValue({
      ...mockWebSocketReturn,
      messages: [ { event: 'partida_eliminada', data: { partidaId: 1 } } ]
    });

    const nonOwnerProps = {
      ...defaultProps,
      currentUser: { id: 99, nombre: 'Invitado' }
    };

    render(<LobbyContainer {...nonOwnerProps} />);

    await waitFor(() => {
      expect(screen.getByTestId('host-cancelled')).toBeInTheDocument();
    });

    // Click en volver desde host-cancelled
    await user.click(screen.getByTestId('host-back'));
    expect(mockOnBackToMenu).toHaveBeenCalled();
  });
});