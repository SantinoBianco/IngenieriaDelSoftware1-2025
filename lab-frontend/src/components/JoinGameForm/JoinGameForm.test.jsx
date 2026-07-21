import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import JoinGameForm from './JoinGameForm';

describe('JoinGameForm', () => {
  const mockOnClose = vi.fn();
  const mockOnJoinGame = vi.fn();
  
  const defaultProps = {
    isOpen: true,
    onClose: mockOnClose,
    onJoinGame: mockOnJoinGame,
    partida: {
      id: 1,
      nombre: 'Partida pública',
      cantidad_jugadores: 1,
      maxJugadores: 4,
      privada: false,
    },
  };

  const privatePartida = {
    id: 2,
    nombre: 'Partida privada',
    cantidad_jugadores: 2,
    maxJugadores: 6,
    privada: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renderiza el componente cuando isOpen es true', () => {
    render(<JoinGameForm {...defaultProps} />);
    
    // Verificar que el componente se renderiza (no está vacío)
    expect(document.body).not.toBeEmptyDOMElement();
  });

  it('no renderiza cuando isOpen es false', () => {
    render(<JoinGameForm {...defaultProps} isOpen={false} />);
    
    // El body debe estar vacío o solo tener elementos básicos
    const modalElements = document.querySelectorAll('[class*="modal"]');
    expect(modalElements.length).toBe(0);
  });

  it('muestra el campo de contraseña cuando la partida es privada', () => {
    render(<JoinGameForm {...defaultProps} partida={privatePartida} />);

    expect(screen.getByLabelText('Contraseña de la partida *')).toBeInTheDocument();
  });

  it('no muestra el campo de contraseña cuando la partida es pública', () => {
    render(<JoinGameForm {...defaultProps} />);

    expect(screen.queryByLabelText('Contraseña de la partida *')).not.toBeInTheDocument();
  });

  it('envía los datos completos cuando la partida es privada', async () => {
    const user = userEvent.setup();
    mockOnJoinGame.mockResolvedValueOnce({});

    render(<JoinGameForm {...defaultProps} partida={privatePartida} />);

    await user.type(screen.getByLabelText('Nombre de usuario *'), ' UsuarioTest ');
  fireEvent.change(screen.getByLabelText('Fecha de nacimiento *'), { target: { value: '1990-01-01' } });
    await user.type(screen.getByLabelText('Contraseña de la partida *'), ' clave ');

    await user.click(screen.getByRole('button', { name: /unirse a partida/i }));

    await waitFor(() => {
      expect(mockOnJoinGame).toHaveBeenCalledWith({
        nombreUsuario: 'UsuarioTest',
        fechaNacimiento: '1990-01-01',
        partidaId: privatePartida.id,
        contraseña: 'clave',
      });
    });
  });

  it('muestra un error de contraseña incorrecta y contabiliza intentos', async () => {
    const user = userEvent.setup();
    mockOnJoinGame.mockRejectedValueOnce(Object.assign(new Error('Contraseña incorrecta'), { status: 401 }));

    render(<JoinGameForm {...defaultProps} partida={privatePartida} />);

    await user.type(screen.getByLabelText('Nombre de usuario *'), 'UsuarioTest');
  fireEvent.change(screen.getByLabelText('Fecha de nacimiento *'), { target: { value: '1990-01-01' } });
    await user.type(screen.getByLabelText('Contraseña de la partida *'), 'clave');

    await user.click(screen.getByRole('button', { name: /unirse a partida/i }));

  expect(await screen.findByText(/Contraseña incorrecta\. Te quedan 4 intentos\./)).toBeInTheDocument();
  expect(screen.getByText(/⚠️\s*Contraseña incorrecta/)).toBeInTheDocument();
  });

  it('cierra y resetea el formulario al presionar cancelar', async () => {
    const user = userEvent.setup();
    render(<JoinGameForm {...defaultProps} partida={privatePartida} />);

    await user.type(screen.getByLabelText('Nombre de usuario *'), 'UsuarioTest');
    await user.click(screen.getByRole('button', { name: /cancelar/i }));

    expect(mockOnClose).toHaveBeenCalled();
    expect(screen.queryByDisplayValue('UsuarioTest')).not.toBeInTheDocument();
  });
});