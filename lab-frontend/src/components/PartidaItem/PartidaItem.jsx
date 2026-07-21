export default function PartidaItem({ partida, onClick }) {

    const jugadoresCount = partida.cantidad_jugadores ?? (Array.isArray(partida.players) ? partida.players.length : 0);
    const max = partida.maxJugadores ?? partida.jugadoresMax ?? 0;
    const isPrivate = Boolean(partida?.privada);

    return (
      <div className="bg-gray-800 p-4 rounded-lg flex justify-between items-center shadow hover:bg-gray-700 transition">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            {isPrivate && (
              <span role="img" aria-label="Partida privada" title="Partida privada">
                🔒
              </span>
            )}
            {partida.nombre}
          </h2>
          <p>
            Jugadores: {jugadoresCount}/{max}
          </p>
          {isPrivate && <p className="text-xs text-amber-300 mt-1">Requiere contraseña</p>}
        </div>
        <button
          onClick={() => onClick(partida)}
          disabled={jugadoresCount >= max}
          className={`px-4 py-2 rounded font-medium ${
            jugadoresCount >= max
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-500 text-white hover:bg-blue-600'
          }`}
        >
          Unirse a Partida
        </button>
      </div>
    );
  }
