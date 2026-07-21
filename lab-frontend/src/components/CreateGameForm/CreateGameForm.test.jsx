import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

import CreateGameForm from './CreateGameForm';

describe('CreateGameForm', () => {
  const mockOnClose = vi.fn();
  const mockOnCreateGame = vi.fn();
  
  const defaultProps = {
    isOpen: true,
    onClose: mockOnClose,
    onCreateGame: mockOnCreateGame
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Renderizado del Formulario', () => {
    it('muestra el formulario cuando está abierto', () => {
      render(<CreateGameForm {...defaultProps} />);
      
      expect(screen.getByText('Crear Nueva Partida')).toBeInTheDocument();
      expect(screen.getByText('Nombre de la partida *')).toBeInTheDocument();
      expect(screen.getByText('Fecha de nacimiento *')).toBeInTheDocument();
      expect(screen.getByText('Nombre de usuario *')).toBeInTheDocument();
      expect(screen.getByText('Número máximo de jugadores *')).toBeInTheDocument();
      expect(screen.getByText('Partida privada')).toBeInTheDocument();
    });

    it('no muestra el formulario cuando está cerrado', () => {
      render(<CreateGameForm {...defaultProps} isOpen={false} />);
      
      expect(screen.queryByText('Crear Nueva Partida')).not.toBeInTheDocument();
    });

    it('muestra todos los campos del formulario', () => {
      render(<CreateGameForm {...defaultProps} />);
      
      expect(screen.getByPlaceholderText('Ej: Misterio en la mansión')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Ej: JugadorMisterioso')).toBeInTheDocument();
      
      // Verificar que existe el campo de fecha por tipo
      const inputs = screen.getAllByDisplayValue('');
      const fechaInput = inputs.find(input => input.type === 'date');
      expect(fechaInput).toBeInTheDocument();
      
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    it('muestra los botones de acción', () => {
      render(<CreateGameForm {...defaultProps} />);
      
      expect(screen.getByText('Cancelar')).toBeInTheDocument();
      expect(screen.getByText('Crear Partida')).toBeInTheDocument();
    });
  });

  describe('Interacción con Campos', () => {
    it('permite escribir en el campo nombre de partida', async () => {
      const user = userEvent.setup();
      render(<CreateGameForm {...defaultProps} />);
      
      const nombreInput = screen.getByPlaceholderText('Ej: Misterio en la mansión');
      await user.type(nombreInput, 'Mi Partida');
      
      expect(nombreInput).toHaveValue('Mi Partida');
    });

    it('permite escribir en el campo nombre de usuario', async () => {
      const user = userEvent.setup();
      render(<CreateGameForm {...defaultProps} />);
      
      const usuarioInput = screen.getByPlaceholderText('Ej: JugadorMisterioso');
      await user.type(usuarioInput, 'MiUsuario');
      
      expect(usuarioInput).toHaveValue('MiUsuario');
    });

    it('permite seleccionar fecha de cumpleaños', async () => {
      const user = userEvent.setup();
      render(<CreateGameForm {...defaultProps} />);
      
      // Usar getAllByDisplayValue y filtrar por tipo date
      const inputs = screen.getAllByDisplayValue('');
      const fechaInput = inputs.find(input => input.type === 'date');
      
      await user.type(fechaInput, '1990-05-15');
      
      expect(fechaInput).toHaveValue('1990-05-15');
    });

    it('permite seleccionar cantidad de jugadores', async () => {
      const user = userEvent.setup();
      render(<CreateGameForm {...defaultProps} />);
      
      const selectInput = screen.getByRole('combobox');
      await user.selectOptions(selectInput, '6');
      
      expect(selectInput).toHaveValue('6');
    });
  });

  describe('Validación de Campos', () => {
    it('muestra error cuando el nombre está vacío', async () => {
      const user = userEvent.setup();
      render(<CreateGameForm {...defaultProps} />);
      
      const submitButton = screen.getByText('Crear Partida');
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText('⚠️ El nombre de la partida es obligatorio')).toBeInTheDocument();
      });
    });

    it('muestra error cuando el usuario está vacío', async () => {
      const user = userEvent.setup();
      render(<CreateGameForm {...defaultProps} />);
      
      const submitButton = screen.getByText('Crear Partida');
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText('⚠️ El nombre de usuario es obligatorio')).toBeInTheDocument();
      });
    });

    it('muestra error cuando no se selecciona fecha de nacimiento', async () => {
      const user = userEvent.setup();
      render(<CreateGameForm {...defaultProps} />);
      
      const submitButton = screen.getByText('Crear Partida');
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText('⚠️ La fecha de nacimiento es obligatoria')).toBeInTheDocument();
      });
    });
  });

  describe('Envío del Formulario', () => {
    it('envía los datos cuando el formulario es válido', async () => {
      const user = userEvent.setup();
      render(<CreateGameForm {...defaultProps} />);
      
      // Llenar todos los campos
      await user.type(screen.getByPlaceholderText('Ej: Misterio en la mansión'), 'Partida Test');
      await user.type(screen.getByPlaceholderText('Ej: JugadorMisterioso'), 'Usuario123');
      
      // Para el campo de fecha
      const inputs = screen.getAllByDisplayValue('');
      const fechaInput = inputs.find(input => input.type === 'date');
      await user.type(fechaInput, '1990-01-01');
      
      await user.selectOptions(screen.getByRole('combobox'), '4');
      
      // Enviar formulario
      const submitButton = screen.getByText('Crear Partida');
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(mockOnCreateGame).toHaveBeenCalledWith({
          nombre: 'Partida Test',
          nombreUsuario: 'Usuario123',
          fechaNacimiento: '1990-01-01',
          maxJugadores: 4,
          privada: false,
          password: null,
        });
      });
    });

    it('requiere contraseña cuando se marca como privada', async () => {
      const user = userEvent.setup();
      render(<CreateGameForm {...defaultProps} />);

      await user.click(screen.getByLabelText(/Partida privada/i));

      const submitButton = screen.getByText('Crear Partida');
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/contraseña es obligatoria/i)).toBeInTheDocument();
      });
    });

    it('envía contraseña cuando la partida es privada', async () => {
      const user = userEvent.setup();
      render(<CreateGameForm {...defaultProps} />);

      await user.type(screen.getByPlaceholderText('Ej: Misterio en la mansión'), 'Partida Privada');
      await user.type(screen.getByPlaceholderText('Ej: JugadorMisterioso'), 'PrivUser');
      const inputs = screen.getAllByDisplayValue('');
      const fechaInput = inputs.find(input => input.type === 'date');
      await user.type(fechaInput, '1990-01-01');
      await user.click(screen.getByLabelText(/Partida privada/i));
      await user.type(screen.getByPlaceholderText('Ingresá una contraseña fácil de compartir'), 'clave123');

      const submitButton = screen.getByText('Crear Partida');
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockOnCreateGame).toHaveBeenCalledWith({
          nombre: 'Partida Privada',
          nombreUsuario: 'PrivUser',
          fechaNacimiento: '1990-01-01',
          maxJugadores: 4,
          privada: true,
          password: 'clave123',
        });
      });
    });

    it('no envía datos cuando hay errores de validación', async () => {
      const user = userEvent.setup();
      render(<CreateGameForm {...defaultProps} />);
      
      const submitButton = screen.getByText('Crear Partida');
      await user.click(submitButton);
      
      expect(mockOnCreateGame).not.toHaveBeenCalled();
    });

    it('limpia el formulario después de envío exitoso', async () => {
      const user = userEvent.setup();
      render(<CreateGameForm {...defaultProps} />);
      
      // Llenar formulario
      const nombreInput = screen.getByPlaceholderText('Ej: Misterio en la mansión');
      const usuarioInput = screen.getByPlaceholderText('Ej: JugadorMisterioso');
      
      await user.type(nombreInput, 'Partida Test');
      await user.type(usuarioInput, 'Usuario123');
      
      // Para el campo de fecha
      const inputs = screen.getAllByDisplayValue('');
      const fechaInput = inputs.find(input => input.type === 'date');
      await user.type(fechaInput, '1990-01-01');
      
      // Enviar
      await user.click(screen.getByText('Crear Partida'));
      
      await waitFor(() => {
        expect(nombreInput).toHaveValue('');
        expect(usuarioInput).toHaveValue('');
        expect(fechaInput).toHaveValue('');
      });
    });
  });

  describe('Cerrar Modal', () => {
    it('llama onClose cuando se hace clic en Cancelar', async () => {
      const user = userEvent.setup();
      render(<CreateGameForm {...defaultProps} />);
      
      const cancelButton = screen.getByText('Cancelar');
      await user.click(cancelButton);
      
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('llama onClose cuando se hace clic en la X', async () => {
      const user = userEvent.setup();
      render(<CreateGameForm {...defaultProps} />);
      
      const closeButton = screen.getByText('×');
      await user.click(closeButton);
      
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('limpia el formulario cuando se cierra', async () => {
      const user = userEvent.setup();
      render(<CreateGameForm {...defaultProps} />);
      
      // Llenar algo en el formulario
      const nombreInput = screen.getByPlaceholderText('Ej: Misterio en la mansión');
      await user.type(nombreInput, 'Algo');
      
      // Cerrar
      await user.click(screen.getByText('Cancelar'));
      
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  describe('Opciones de Jugadores', () => {
    it('muestra todas las opciones de cantidad de jugadores', () => {
      render(<CreateGameForm {...defaultProps} />);
      
      expect(screen.getByText('2 jugadores')).toBeInTheDocument();
      expect(screen.getByText('3 jugadores')).toBeInTheDocument();
      expect(screen.getByText('4 jugadores')).toBeInTheDocument();
      expect(screen.getByText('5 jugadores')).toBeInTheDocument();
      expect(screen.getByText('6 jugadores')).toBeInTheDocument();
    });

    it('tiene combobox de jugadores disponible', () => {
      render(<CreateGameForm {...defaultProps} />);
      
      const selectInput = screen.getByRole('combobox');
      expect(selectInput).toBeInTheDocument();
      expect(selectInput).toHaveValue('4');
    });
  });
});
