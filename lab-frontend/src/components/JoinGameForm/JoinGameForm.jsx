import { useCallback, useEffect, useId, useState } from "react";

let env = {};
try {
  env = import.meta.env || {};
} catch (error) {
  env = {};
}

const parsedMaxAttempts = Number(env.VITE_JOIN_PRIVATE_MAX_ATTEMPTS);
const parsedBlockTime = Number(env.VITE_JOIN_PRIVATE_BLOCK_MS);

const MAX_ATTEMPTS = Number.isFinite(parsedMaxAttempts) && parsedMaxAttempts > 0 ? parsedMaxAttempts : 5;
const BLOCK_TIME_MS = Number.isFinite(parsedBlockTime) && parsedBlockTime > 0 ? parsedBlockTime : 60000; // 1 minuto de bloqueo
const buildInitialFormState = () => ({
  nombreUsuario: "",
  fechaNacimiento: "",
  password: "",
});

export default function JoinGameForm({ isOpen, onClose, onJoinGame, partida }) {
  const [formData, setFormData] = useState(() => buildInitialFormState());
  const [errors, setErrors] = useState({});
  const [feedback, setFeedback] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [blockedUntil, setBlockedUntil] = useState(null);

  const isPrivate = Boolean(partida?.privada);
  const idPrefix = useId();
  const nombreUsuarioId = `${idPrefix}-nombre-usuario`;
  const fechaNacimientoId = `${idPrefix}-fecha-nacimiento`;
  const passwordId = `${idPrefix}-password`;

  const resetForm = useCallback(() => {
    setFormData(buildInitialFormState());
    setErrors({});
    setFeedback("");
    setAttempts(0);
    setBlockedUntil(null);
  }, []);

  useEffect(() => {
    if (isOpen) {
      resetForm();
    }
  }, [isOpen, partida?.id, resetForm]);

  useEffect(() => {
    if (!blockedUntil) {
      return;
    }

    const intervalId = setInterval(() => {
      if (Date.now() >= blockedUntil) {
        setBlockedUntil(null);
        setAttempts(0);
        setFeedback("");
      }
    }, 1000);

    return () => clearInterval(intervalId);
  }, [blockedUntil]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Limpiar error cuando el usuario empiece a escribir
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }

    if (feedback) {
      setFeedback("");
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.nombreUsuario.trim()) {
      newErrors.nombreUsuario = 'El nombre de usuario es obligatorio';
    } else if (formData.nombreUsuario.trim().length < 2) {
      newErrors.nombreUsuario = 'El nombre de usuario debe tener al menos 2 caracteres';
    }

    if (!formData.fechaNacimiento) {
      newErrors.fechaNacimiento = 'La fecha de nacimiento es obligatoria';
    } else {
      // Validar que la fecha no sea futura y que la persona sea mayor de edad
      const fechaSeleccionada = new Date(formData.fechaNacimiento);
      const hoy = new Date();
      
      if (fechaSeleccionada > hoy) {
        newErrors.fechaNacimiento = 'La fecha no puede ser futura';
      } else {
        // Calcular edad más precisamente
        const edad = hoy.getFullYear() - fechaSeleccionada.getFullYear();
        const cumplioEsteAño = hoy >= new Date(hoy.getFullYear(), fechaSeleccionada.getMonth(), fechaSeleccionada.getDate());
        const edadActual = cumplioEsteAño ? edad : edad - 1;

      }
    }

    if (isPrivate) {
      const trimmedPassword = formData.password.trim();
      if (!trimmedPassword) {
        newErrors.password = 'La contraseña es obligatoria';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const now = Date.now();
    if (blockedUntil && blockedUntil > now) {
      const remainingSeconds = Math.max(1, Math.ceil((blockedUntil - now) / 1000));
      setFeedback(`Has excedido el número máximo de intentos. Intentá nuevamente en ${remainingSeconds} segundos.`);
      return;
    }

    if (blockedUntil && blockedUntil <= now) {
      setBlockedUntil(null);
      setAttempts(0);
    }
    
    if (validateForm()) {
      if (!partida?.id) {
        setFeedback('La partida seleccionada no está disponible.');
        return;
      }

      try {
        await onJoinGame({
          nombreUsuario: formData.nombreUsuario.trim(),
          fechaNacimiento: formData.fechaNacimiento,
          partidaId: partida?.id,
          contraseña: isPrivate ? formData.password.trim() : undefined,
        });
        resetForm();
      } catch (error) {
        const message = error?.message || 'No se pudo unir a la partida';

        if (isPrivate && (error?.status === 401 || error?.status === 403 || message.toLowerCase().includes('contraseña'))) {
          setErrors(prev => ({
            ...prev,
            password: 'Contraseña incorrecta',
          }));

          const nextAttempts = attempts + 1;
          setAttempts(nextAttempts);

          if (nextAttempts >= MAX_ATTEMPTS) {
            const lockUntil = Date.now() + BLOCK_TIME_MS;
            setBlockedUntil(lockUntil);
            const remainingSeconds = Math.ceil(BLOCK_TIME_MS / 1000);
            setFeedback(`Has excedido el número máximo de intentos. Intentá nuevamente en ${remainingSeconds} segundos.`);
          } else {
            const remainingAttempts = MAX_ATTEMPTS - nextAttempts;
            setFeedback(
              remainingAttempts > 0
                ? `Contraseña incorrecta. Te quedan ${remainingAttempts} ${remainingAttempts === 1 ? 'intento' : 'intentos'}.`
                : 'Contraseña incorrecta.'
            );
          }
        } else {
          setFeedback(message);
        }
      }
    }
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-white">Unirse a "{partida?.nombre}"</h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-white text-2xl transition-colors"
          >
            ×
          </button>
        </div>

        {/* Info de la partida */}
        <div className="mb-6 p-4 bg-gray-800 rounded-lg border border-gray-600">
          <h3 className="text-white font-semibold mb-2">Información de la partida</h3>
          <p className="text-gray-300 text-sm">
            <span className="font-medium">Jugadores:</span> {partida?.cantidad_jugadores || 0}/{partida?.maxJugadores || 0}
          </p>
          {isPrivate && (
            <p className="text-amber-300 text-xs mt-2 flex items-center gap-1">
              <span role="img" aria-label="Partida privada">🔒</span>
              Partida privada: necesitás la contraseña correcta para ingresar.
            </p>
          )}
        </div>

        {feedback && (
          <div className="mb-4 p-3 bg-red-900/40 border border-red-500/60 rounded-lg text-red-200 text-sm">
            {feedback}
          </div>
        )}

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Nombre de usuario */}
          <div>
            <label className="block text-white text-sm font-semibold mb-2" htmlFor={nombreUsuarioId}>
              Nombre de usuario *
            </label>
            <input
              type="text"
              name="nombreUsuario"
              value={formData.nombreUsuario}
              onChange={handleInputChange}
              placeholder="Ej: JugadorMisterioso"
              id={nombreUsuarioId}
              className={`w-full px-4 py-3 bg-gray-800 border rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 transition-all ${
                errors.nombreUsuario
                  ? 'border-red-500 focus:ring-red-400'
                  : 'border-gray-600 focus:ring-blue-400'
              }`}
              maxLength={30}
            />
            {errors.nombreUsuario && (
              <p className="text-red-400 text-sm mt-1">⚠️ {errors.nombreUsuario}</p>
            )}
          </div>

          {/* Fecha de nacimiento */}
          <div>
            <label className="block text-white text-sm font-semibold mb-2" htmlFor={fechaNacimientoId}>
              Fecha de nacimiento *
            </label>
            <input
              type="date"
              name="fechaNacimiento"
              value={formData.fechaNacimiento}
              onChange={handleInputChange}
              id={fechaNacimientoId}
              className={`w-full px-4 py-3 bg-gray-800 border rounded-lg text-white focus:outline-none focus:ring-2 transition-all ${
                errors.fechaNacimiento
                  ? 'border-red-500 focus:ring-red-400'
                  : 'border-gray-600 focus:ring-blue-400'
              }`}
            />
            {errors.fechaNacimiento && (
              <p className="text-red-400 text-sm mt-1">⚠️ {errors.fechaNacimiento}</p>
            )}
          </div>

          {isPrivate && (
            <div>
              <label className="block text-white text-sm font-semibold mb-2" htmlFor={passwordId}>
                Contraseña de la partida *
              </label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleInputChange}
                placeholder="Ingresá la contraseña compartida por el anfitrión"
                id={passwordId}
                className={`w-full px-4 py-3 bg-gray-800 border rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 transition-all ${
                  errors.password
                    ? 'border-red-500 focus:ring-red-400'
                    : 'border-gray-600 focus:ring-blue-400'
                }`}
                maxLength={64}
              />
              {errors.password && (
                <p className="text-red-400 text-sm mt-1">⚠️ {errors.password}</p>
              )}
            </div>
          )}

          {/* Botones */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 py-3 px-4 !bg-red-600 hover:!bg-red-700 rounded-lg !text-white font-semibold transition-colors"
              style={{ backgroundColor: '#dc2626 !important', color: 'white !important' }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={Boolean(blockedUntil && blockedUntil > Date.now())}
              className="flex-1 py-3 px-4 !bg-green-600 hover:!bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed rounded-lg !text-white font-semibold transition-all shadow-lg"
              style={{ backgroundColor: '#16a34a !important', color: 'white !important' }}
            >
              Unirse a Partida
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}