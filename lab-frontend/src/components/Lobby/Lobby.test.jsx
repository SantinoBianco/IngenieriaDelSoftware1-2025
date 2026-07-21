import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

import Lobby from './Lobby';

describe('Lobby', () => {
  const baseGameData = {
    id: 1,
    nombre: 'Partida de Prueba',
    maxJugadores: 4,
    owner: 1,
    players: [
      { id: 1, nombre: 'Jugador1', isOwner: true },
      { id: 2, nombre: 'Jugador2', isOwner: false }
    ]
  };

  const baseCurrentUser = {
    id: 1,
    nombre: 'Jugador1'
  };

  const mockOnStartGame = vi.fn();
  const mockOnLeaveGame = vi.fn();
  const mockOnCancelGame = vi.fn();
  const mockOnHostCancelBackToMenu = vi.fn();

  const renderLobby = (overrideProps = {}) => {
    const props = {
      gameData: baseGameData,
      currentUser: baseCurrentUser,
      onStartGame: mockOnStartGame,
      onLeaveGame: mockOnLeaveGame,
      onCancelGame: mockOnCancelGame,
      hostCancelled: false,
      onHostCancelBackToMenu: mockOnHostCancelBackToMenu,
      ...overrideProps,
      gameData: {
        ...baseGameData,
        ...(overrideProps.gameData || {})
      }
    };

    return render(<Lobby {...props} />);
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Renderizado básico', () => {
    it('muestra encabezados e información general', () => {
      renderLobby();

      expect(screen.getByRole('heading', { name: /partida de prueba/i })).toBeInTheDocument();
      expect(screen.getByText(/sala de espera/i)).toBeInTheDocument();
      expect(screen.getByText(/informaci/i)).toBeInTheDocument();
      expect(screen.getByText(/jugadores conectados/i)).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
    });

    it('lista jugadores, diferencia al anfitrión y marca al usuario actual', () => {
      renderLobby();

      expect(screen.getByText('Jugador1')).toBeInTheDocument();
      expect(screen.getByText('Jugador2')).toBeInTheDocument();
      expect(screen.getByText(/anfitri/i)).toBeInTheDocument();
      expect(screen.getAllByText(/^Jugador$/i)).toHaveLength(1);
      expect(screen.getByText('Tú')).toBeInTheDocument();
    });

    it('renderiza los espacios vacíos faltantes', () => {
      renderLobby();

      expect(screen.getAllByText('Esperando jugador...')).toHaveLength(2);
    });
  });

  describe('Acciones según rol', () => {
    it('habilita el botón de inicio cuando hay quorum', async () => {
      const user = userEvent.setup();
      const { rerender } = renderLobby({
        gameData: {
          ...baseGameData,
          players: [{ id: 1, nombre: 'Jugador1', isOwner: true }]
        }
      });

      const disabledStart = screen.getByRole('button', { name: /esperando/i });
      expect(disabledStart).toBeDisabled();

      rerender(
        <Lobby
          gameData={baseGameData}
          currentUser={baseCurrentUser}
          onStartGame={mockOnStartGame}
          onLeaveGame={mockOnLeaveGame}
          onCancelGame={mockOnCancelGame}
          hostCancelled={false}
          onHostCancelBackToMenu={mockOnHostCancelBackToMenu}
        />
      );

      const startButton = screen.getByRole('button', { name: /iniciar juego/i });
      expect(startButton).toBeEnabled();

      await user.click(startButton);
      expect(mockOnStartGame).toHaveBeenCalledTimes(1);
    });

    it('llama a cancel y leave según owner o invitado', async () => {
      const user = userEvent.setup();

      renderLobby();
      const cancelButton = screen.getByRole('button', { name: /cancelar partida/i });
      expect(cancelButton).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /salir de la sala/i })).toBeNull();

      await user.click(cancelButton);
      expect(mockOnCancelGame).toHaveBeenCalledTimes(1);

      const nonOwnerUser = { id: 2, nombre: 'Jugador2' };
      const { rerender } = renderLobby({ currentUser: nonOwnerUser });

      rerender(
        <Lobby
          gameData={baseGameData}
          currentUser={nonOwnerUser}
          onStartGame={mockOnStartGame}
          onLeaveGame={mockOnLeaveGame}
          onCancelGame={mockOnCancelGame}
          hostCancelled={false}
          onHostCancelBackToMenu={mockOnHostCancelBackToMenu}
        />
      );

      const leaveButton = screen.getByRole('button', { name: /salir de la sala/i });
      expect(leaveButton).toBeInTheDocument();

      await user.click(leaveButton);
      expect(mockOnLeaveGame).toHaveBeenCalledTimes(1);
    });

    it('no muestra controles de owner para un invitado', () => {
      renderLobby({ currentUser: { id: 2, nombre: 'Jugador2' } });

      expect(screen.queryByRole('button', { name: /iniciar juego/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /cancelar partida/i })).toBeNull();
      expect(screen.getByRole('button', { name: /salir de la sala/i })).toBeInTheDocument();
    });

    it('oculta opciones de owner cuando currentUser es null', () => {
      renderLobby({ currentUser: null });

      expect(screen.queryByRole('button', { name: /iniciar juego/i })).toBeNull();
      expect(screen.queryByText('Tú')).toBeNull();
    });
  });

  describe('Actualizaciones de la sala', () => {
    it('actualiza la lista cuando se unen jugadores', async () => {
      const { rerender } = renderLobby();

      expect(screen.getByText(/jugadores\s*\(2\/4\)/i)).toBeInTheDocument();

      const updatedGameData = {
        ...baseGameData,
        players: [
          ...baseGameData.players,
          { id: 3, nombre: 'Jugador3', isOwner: false }
        ]
      };

      rerender(
        <Lobby
          gameData={updatedGameData}
          currentUser={baseCurrentUser}
          onStartGame={mockOnStartGame}
          onLeaveGame={mockOnLeaveGame}
          onCancelGame={mockOnCancelGame}
          hostCancelled={false}
          onHostCancelBackToMenu={mockOnHostCancelBackToMenu}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/jugadores\s*\(3\/4\)/i)).toBeInTheDocument();
        expect(screen.getByText('Jugador3')).toBeInTheDocument();
      });
    });
  });

  describe('Eventos globales', () => {
    it('muestra overlay cuando el anfitrión cancela y permite volver', async () => {
      const user = userEvent.setup();

      renderLobby({ hostCancelled: true });

      expect(screen.getByText(/partida cancelada/i)).toBeInTheDocument();
      const backButton = screen.getByRole('button', { name: /volver al inicio/i });
      await user.click(backButton);

      expect(mockOnHostCancelBackToMenu).toHaveBeenCalledTimes(1);
    });
  });
});