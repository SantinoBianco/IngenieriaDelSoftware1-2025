import { useState, useEffect } from "react";

export default function Lobby({ gameData, currentUser, onStartGame, onLeaveGame, onCancelGame, hostCancelled, onHostCancelBackToMenu }) {
  const [players, setPlayers] = useState(gameData.players || []);

  useEffect(() => {
    setPlayers(gameData.players || []);
  }, [gameData.players]);

  const handleStartClick = () => {
    onStartGame();
  };

  const handleLeaveClick = () => {
    onLeaveGame();
  };

  const isOwner = currentUser?.id === gameData.owner;
  const canStart = isOwner && players.length >= 2;

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      {/* Overlay centrado y flotante cuando el anfitrión cancela la partida (diseño anterior) */}
      {hostCancelled && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 max-w-md text-center shadow-xl ring-1 ring-white/10">
            <h2 className="text-2xl font-bold mb-2">Partida cancelada</h2>
            <p className="text-gray-300 mb-6">La partida ha sido cancelada por el anfitrión. Volvé al inicio para ver otras partidas disponibles.</p>
            <button
              onClick={() => onHostCancelBackToMenu && onHostCancelBackToMenu()}
              className="btn btn-primary px-6"
            >
              Volver al Inicio
            </button>
          </div>
        </div>
      )}
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">{gameData.nombre} </h1>
          <h2 className="text-xl text-gray-300">Sala de Espera</h2>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Lista de jugadores */}
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <h3 className="text-xl font-semibold mb-4">
              👥 Jugadores ({players.length}/{gameData.maxJugadores})
            </h3>

            <div className="space-y-3">
              {players.map((player) => (
                <div
                  key={player.id}
                  className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
                    player.isOwner
                      ? 'bg-yellow-600/20 border border-yellow-500/30'
                      : 'bg-gray-700/50 hover:bg-gray-700'
                  }`}
                >
                  {/* Información del jugador */}
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{player.nombre}</span>
                      {player.id === currentUser?.id && (
                        <span className="text-xs bg-blue-500/30 text-blue-300 px-2 py-1 rounded-full">
                          Tú
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-300">
                      {player.isOwner ? 'Anfitrión' : 'Jugador'}
                    </div>
                  </div>
                </div>
              ))}

              {/* Slots vacíos */}
              {Array.from({ length: gameData.maxJugadores - players.length }).map((_, index) => (
                <div
                  key={`empty-${index}`}
                  className="flex items-center gap-3 p-3 rounded-lg border-2 border-dashed border-gray-600"
                >
                  <div className="w-12 h-12 bg-gray-700 rounded-full flex items-center justify-center text-2xl">
                  </div>
                  <div className="flex-1">
                    <div className="text-gray-400">Esperando jugador...</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Panel de controles */}
          <div className="space-y-6">
            {/* Información del juego */}
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
              <h3 className="text-xl font-semibold mb-4">Información</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span>Estado:</span>
                  <span className="text-yellow-300">Esperando jugadores</span>
                </div>
                <div className="flex justify-between">
                  <span>Jugadores conectados:</span>
                  <span className="text-green-300">{players.length}</span>
                </div>
                <div className="flex justify-between">
                  <span>Máximo:</span>
                  <span className="text-gray-300">{gameData.maxJugadores}</span>
                </div>
              </div>
            </div>

            {/* Controles */}
            <div className="space-y-4">
              {isOwner && (
                <button
                  onClick={handleStartClick}
                  disabled={!canStart}
                  className={`w-full py-4 px-6 rounded-xl font-semibold text-lg transition-all ${
                    canStart
                      ? '!bg-green-600 hover:!bg-green-700 !text-white shadow-lg'
                      : '!bg-gray-600 cursor-not-allowed opacity-50 !text-white'
                  }`}
                  style={canStart 
                    ? { backgroundColor: '#16a34a !important', color: 'white !important' }
                    : { backgroundColor: '#4b5563 !important', color: 'white !important' }
                  }
                >
                  {canStart ? 'Iniciar Juego' : 'Esperando más jugadores'}
                </button>
              )}

              {/* Si el usuario es el anfitrión mostramos 'Cancelar Partida' que llama a onCancelGame.
                  Si no es owner mostramos el botón normal de salir que llama a onLeaveGame. */}
              {isOwner ? (
                <button
                  onClick={() => onCancelGame && onCancelGame()}
                  className="w-full py-3 px-6 rounded-xl font-semibold !bg-red-600 hover:!bg-red-700 !text-white transition-all"
                  style={{ backgroundColor: '#dc2626 !important', color: 'white !important' }}
                >
                  Cancelar Partida
                </button>
              ) : (
                <button
                  onClick={handleLeaveClick}
                  className="w-full py-3 px-6 rounded-xl font-semibold !bg-red-600 hover:!bg-red-700 !text-white transition-all"
                  style={{ backgroundColor: '#dc2626 !important', color: 'white !important' }}
                >
                  Salir de la Sala
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
