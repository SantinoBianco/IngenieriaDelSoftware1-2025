import { useMemo } from "react";

const STATUS_TITLES = {
  voting: "Point Your Suspicious",
  tie: "Empate en la votación",
  awaiting_secret: "Esperando revelación",
  finished: "Votación finalizada",
};

export default function PointSuspiciousModal({
  isOpen = false,
  state,
  players = [],
  currentUserId,
  selection,
  onSelect,
  onConfirmVote,
  hasVoted,
  pendingVoters = [],
  onClose,
}) {
  const { status, initiatorId, result, participantIds = [], revoteCount = 0 } = state ?? {};
  const playerDictionary = useMemo(() => {
    const entries = Array.isArray(players) ? players : [];
    const map = new Map();
    entries.forEach((player) => {
      const pid = Number(player?.id);
      map.set(pid, player);
      if (player?.id && !Number.isNaN(pid)) {
        map.set(String(player.id), player);
      }
    });
    return map;
  }, [players]);

  if (!isOpen) return null;

  const numericCurrentUserId = Number(currentUserId);

  const getPlayerName = (playerId) => {
    const pidNumber = Number(playerId);
    const record =
      playerDictionary.get(playerId) ??
      playerDictionary.get(pidNumber) ??
      playerDictionary.get(String(playerId));
    return record?.nombre ?? record?.username ?? `Jugador ${playerId}`;
  };

  const isTarget = result?.targetId != null && Number(result.targetId) === numericCurrentUserId;
  if (status === "awaiting_secret" && isTarget) {
    return null;
  }
  const votersStillPendingNames = pendingVoters.map(getPlayerName);
  const totalParticipants = Array.isArray(participantIds) ? participantIds.length : players.length;
  const votesCount = Object.keys(state?.votes ?? {}).length;
  const title = STATUS_TITLES[status] ?? "Point Your Suspicious";
  const sanitizedSelection =
    selection != null && Number(selection) === numericCurrentUserId ? null : selection;
  const voteOptions = (Array.isArray(players) ? players : []).filter(
    (player) => Number(player.id) !== numericCurrentUserId,
  );
  const isRevote = Number(revoteCount) > 0;

  const renderVotingSection = () => (
    <>
      {isRevote && (
        <p className="text-xs text-amber-300 mb-2">
          Hubo un empate en la votación anterior. Voten nuevamente para decidir quién revelará el secreto.
        </p>
      )}
      <p className="text-sm text-gray-200 mb-4">
        Todos los jugadores deben votar públicamente quién les parece más sospechoso.
        Confirmá tu voto cuando estés seguro: no podrás cambiarlo luego.
      </p>

      <div className="bg-gray-900/60 rounded-lg p-4 max-h-60 overflow-y-auto mb-4 text-left">
        {voteOptions.map((player) => {
          const pid = Number(player.id);
          const disabled = hasVoted && pid !== Number(sanitizedSelection);
          return (
            <label
              key={player.id}
              className={`flex items-center justify-between px-3 py-2 rounded border border-gray-700 mb-2 last:mb-0 cursor-pointer transition-colors ${
                Number(sanitizedSelection) === pid ? "bg-emerald-900/40 border-emerald-500" : "hover:bg-gray-800/50"
              } ${disabled ? "opacity-70 cursor-not-allowed" : ""}`}
            >
              <div className="flex items-center gap-3">
                <input
                  type="radio"
                  name="point-suspicious-choice"
                  value={pid}
                  checked={Number(sanitizedSelection) === pid}
                  onChange={() => {
                    if (!hasVoted && typeof onSelect === "function") onSelect(pid);
                  }}
                  disabled={hasVoted}
                  className="radio radio-success"
                />
                <span className="font-medium text-gray-100">
                  {player.nombre}
                </span>
              </div>
              {hasVoted && Number(sanitizedSelection) === pid && (
                <span className="text-xs text-emerald-300 font-semibold uppercase tracking-wide">
                  Voto confirmado
                </span>
              )}
            </label>
          );
        })}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="text-sm text-gray-300">
          {votesCount}/{totalParticipants} votos registrados.
          {votersStillPendingNames.length > 0 && (
            <span className="block text-xs text-gray-400 mt-1">
              Esperando a: {votersStillPendingNames.join(", ")}
            </span>
          )}
        </div>
        <button
          type="button"
          className="btn btn-primary px-6"
          onClick={() => {
            if (typeof onConfirmVote === "function") onConfirmVote(sanitizedSelection);
          }}
          disabled={hasVoted || sanitizedSelection == null}
        >
          Confirmar voto
        </button>
      </div>
    </>
  );

  const renderResults = () => {
    if (!result) return null;
    const { counts = {}, totalVotes = 0, topPlayers = [], tie } = result;
    const maxVotes = Math.max(0, ...Object.values(counts));

    return (
      <div className="space-y-4 text-left">
        <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
          <p className="text-sm text-gray-200 mb-3">Resumen de la votación:</p>
          {Object.entries(counts).map(([playerId, value]) => (
            <div key={playerId} className="flex items-center justify-between py-1">
              <span className="text-gray-300">{getPlayerName(playerId)}</span>
              <span className={`font-semibold ${value === maxVotes ? "text-emerald-300" : "text-gray-400"}`}>
                {value} voto{value === 1 ? "" : "s"}
              </span>
            </div>
          ))}
          <p className="text-xs text-gray-500 mt-3">
            Votos totales: {totalVotes} / {totalParticipants}
          </p>
        </div>

        {tie ? (
          <div className="bg-amber-900/40 border border-amber-600 rounded-lg p-4">
            <p className="text-sm text-amber-200 font-semibold mb-2">Empate detectado</p>
            <p className="text-xs text-amber-200">
              Los jugadores {topPlayers.map(getPlayerName).join(", ")} obtuvieron la misma cantidad de votos.
              Se realizará una nueva votación para desempatar.
            </p>
          </div>
        ) : (
          <div className="bg-emerald-900/30 border border-emerald-600 rounded-lg p-4">
            <p className="text-sm text-emerald-200 font-semibold mb-2">
              {isTarget ? "Fuiste la persona más votada." : `${getPlayerName(result.targetId)} fue la persona más votada.`}
            </p>
            <p className="text-xs text-emerald-100">
              Debe revelar uno de sus secretos. {isTarget ? "Elegí un secreto en el modal para continuar." : "Esperando la revelación..."}
            </p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-[70]" role="dialog" aria-modal="true">
      <div className="bg-gray-800 rounded-xl shadow-2xl ring-1 ring-white/10 w-full max-w-2xl mx-4 p-6 space-y-4">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-emerald-300">{title}</h2>
            {initiatorId != null && (
              <p className="text-sm text-gray-400 mt-1">
                Evento iniciado por {getPlayerName(initiatorId)}.
              </p>
            )}
          </div>
          {["finished", "tie"].includes(status) && typeof onClose === "function" && (
            <button type="button" className="btn btn-sm btn-ghost" onClick={onClose} aria-label="Cerrar modal Point Your Suspicious">
              ✕
            </button>
          )}
        </header>

        {status === "voting" && renderVotingSection()}
        {["tie", "awaiting_secret", "finished"].includes(status) && renderResults()}

        {status === "awaiting_secret" && !isTarget && (
          <p className="text-xs text-gray-400">
            Esperando a {getPlayerName(result?.targetId)} para revelar un secreto...
          </p>
        )}

        {["finished", "tie"].includes(status) && typeof onClose === "function" && (
          <div className="flex justify-end">
            <button type="button" className="btn btn-primary" onClick={onClose}>
              Cerrar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
