import { useState } from "react";

export default function CreateGameForm({ isOpen, onClose, onCreateGame }) {
  const [formData, setFormData] = useState({
    nombre: "",
    maxJugadores: 4,
    nombreUsuario: "",
    fechaNacimiento: "",
    privada: false,
    password: "",
  });

  const [errors, setErrors] = useState({});

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'maxJugadores' ? parseInt(value) : value
    }));
    
    // Limpiar error cuando el usuario empiece a escribir
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const handlePrivadaChange = (event) => {
    const checked = event.target.checked;
    setFormData((prev) => ({
      ...prev,
      privada: checked,
      password: checked ? prev.password : "",
    }));
    setErrors((prev) => ({
      ...prev,
      password: "",
    }));
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.nombre.trim()) {
      newErrors.nombre = 'El nombre de la partida es obligatorio';
    } else if (formData.nombre.trim().length < 3) {
      newErrors.nombre = 'El nombre debe tener al menos 3 caracteres';
    }

    if (formData.maxJugadores < 2 || formData.maxJugadores > 6) {
      newErrors.maxJugadores = 'Debe ser entre 2 y 6 jugadores';
    }

    if (!formData.nombreUsuario.trim()) {
      newErrors.nombreUsuario = 'El nombre de usuario es obligatorio';
    } else if (formData.nombreUsuario.trim().length < 2) {
      newErrors.nombreUsuario = 'El nombre de usuario debe tener al menos 2 caracteres';
    }

    if (!formData.fechaNacimiento) {
      newErrors.fechaNacimiento = 'La fecha de nacimiento es obligatoria';
    } else {
      // Validar que la fecha no sea futura
      const fechaSeleccionada = new Date(formData.fechaNacimiento);
      const hoy = new Date();
      
      if (fechaSeleccionada > hoy) {
        newErrors.fechaNacimiento = 'La fecha no puede ser futura';
      }
    }

    if (formData.privada) {
      const trimmedPassword = formData.password.trim();
      if (!trimmedPassword) {
        newErrors.password = 'La contraseña es obligatoria para partidas privadas';
      } else if (trimmedPassword.length < 4) {
        newErrors.password = 'La contraseña debe tener al menos 4 caracteres';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (validateForm()) {
      const payload = {
        nombre: formData.nombre.trim(),
        maxJugadores: formData.maxJugadores,
        nombreUsuario: formData.nombreUsuario.trim(),
        fechaNacimiento: formData.fechaNacimiento,
        privada: Boolean(formData.privada),
        password: formData.privada ? formData.password.trim() : null,
      };

      onCreateGame(payload);
      
      // Resetear formulario
      setFormData({
        nombre: "",
        maxJugadores: 4,
        nombreUsuario: "",
        fechaNacimiento: "",
        privada: false,
        password: "",
      });
      setErrors({});
    }
  };

  const handleClose = () => {
    setFormData({
      nombre: "",
      maxJugadores: 4,
      nombreUsuario: "",
      fechaNacimiento: "",
      privada: false,
      password: "",
    });
    setErrors({});
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-white"> Crear Nueva Partida</h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-white text-2xl transition-colors"
          >
            ×
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Nombre de la partida */}
          <div>
            <label className="block text-white text-sm font-semibold mb-2">
              Nombre de la partida *
            </label>
            <input
              type="text"
              name="nombre"
              value={formData.nombre}
              onChange={handleInputChange}
              placeholder="Ej: Misterio en la mansión"
              className={`w-full px-4 py-3 bg-gray-800 border rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 transition-all ${
                errors.nombre
                  ? 'border-red-500 focus:ring-red-400'
                  : 'border-gray-600 focus:ring-blue-400'
              }`}
              maxLength={50}
            />
            {errors.nombre && (
              <p className="text-red-400 text-sm mt-1">⚠️ {errors.nombre}</p>
            )}
          </div>

          {/* Nombre de usuario */}
          <div>
            <label className="block text-white text-sm font-semibold mb-2">
              Nombre de usuario *
            </label>
            <input
              type="text"
              name="nombreUsuario"
              value={formData.nombreUsuario}
              onChange={handleInputChange}
              placeholder="Ej: JugadorMisterioso"
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
            <label className="block text-white text-sm font-semibold mb-2">
              Fecha de nacimiento *
            </label>
            <input
              type="date"
              name="fechaNacimiento"
              value={formData.fechaNacimiento}
              onChange={handleInputChange}
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

          {/* Número máximo de jugadores */}
          <div>
            <label className="block text-white text-sm font-semibold mb-2">
              Número máximo de jugadores *
            </label>
            <select
              name="maxJugadores"
              value={formData.maxJugadores}
              onChange={handleInputChange}
              className={`w-full px-4 py-3 bg-gray-800 border rounded-lg text-white focus:outline-none focus:ring-2 transition-all ${
                errors.maxJugadores
                  ? 'border-red-500 focus:ring-red-400'
                  : 'border-gray-600 focus:ring-blue-400'
              }`}
            >
              <option value={2}>2 jugadores</option>
              <option value={3}>3 jugadores</option>
              <option value={4}>4 jugadores</option>
              <option value={5}>5 jugadores</option>
              <option value={6}>6 jugadores</option>
            </select>
            {errors.maxJugadores && (
              <p className="text-red-400 text-sm mt-1">⚠️ {errors.maxJugadores}</p>
            )}
          </div>

          {/* Privacidad */}
          <div className="bg-gray-800/70 border border-gray-700 rounded-lg p-4 space-y-3">
            <label className="flex items-center gap-3 text-white text-sm font-semibold">
              <input
                type="checkbox"
                checked={formData.privada}
                onChange={handlePrivadaChange}
                className="checkbox checkbox-sm"
              />
              Partida privada
            </label>
            <p className="text-gray-400 text-xs">
              Si la partida es privada, solo quienes tengan la contraseña podrán unirse.
            </p>

            {formData.privada && (
              <div>
                <label className="block text-white text-sm font-semibold mb-2">
                  Contraseña *
                </label>
                <input
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  placeholder="Ingresá una contraseña fácil de compartir"
                  className={`w-full px-4 py-3 bg-gray-900 border rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 transition-all ${
                    errors.password
                      ? 'border-red-500 focus:ring-red-400'
                      : 'border-gray-600 focus:ring-blue-400'
                  }`}
                  maxLength={32}
                />
                {errors.password && (
                  <p className="text-red-400 text-sm mt-1">⚠️ {errors.password}</p>
                )}
              </div>
            )}
          </div>

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
              className="flex-1 py-3 px-4 !bg-green-600 hover:!bg-green-700 rounded-lg !text-white font-semibold transition-all shadow-lg"
              style={{ backgroundColor: '#16a34a !important', color: 'white !important' }}
            >
              Crear Partida
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
