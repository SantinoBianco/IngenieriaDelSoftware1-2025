import { memo } from "react";
import { getCardImage } from "../../utils/CardImageMapper";

const statusLabels = {
  selecting: "Elegí una carta para entregar",
  ready: "Preparando redistribución",
  waiting_resolution: "Esperando redistribución",
  submitting: "Resolviendo Dead Card Folly",
  redistributing: "Redistribuyendo cartas",
  completed: "Cartas redistribuidas",
  error: "Dead Card Folly interrumpido",
};

const DeadCardFollyModal = memo(function DeadCardFollyModal({
  isOpen,
  state = {},
  cards = [],
  players = [],
  currentUserId,
  selectedCardId = null,
  locked = false,
  onSelect = () => {},
  onConfirm = () => {},
  onClear = () => {},
  onClose = () => {},
}) {
  if (!isOpen) return null;

  const directionLabel = state.direction === "izquierda" ? "izquierda" : "derecha";
  const pendingIds = Array.isArray(state.pendingPlayerIds) ? state.pendingPlayerIds : [];
  const getPlayerName = (playerId) => {
    const numericId = Number(playerId);
    const match =
      players.find((player) => Number(player.id) === numericId) ||
      players.find((player) => String(player.id) === String(playerId));
    return match?.nombre ?? match?.username ?? `Jugador ${playerId}`;
  };

  const pendingNames = pendingIds
    .filter((pid) => Number(pid) !== Number(currentUserId))
    .map(getPlayerName);

  const status = state.status ?? "selecting";
  const receivedCard = state.receivedCard ?? null;
  const canConfirm = Boolean(selectedCardId) && !locked && status === "selecting";
  const showCloseButton = status === "completed" || status === "error";

  const renderWaitingMessage = () => {
    if (status === "error") {
      return (
        <p className="text-red-300 text-sm">
          {state.errorMessage || "Dead Card Folly no pudo completarse. Volvé a intentarlo."}
        </p>
      );
    }

    if (locked && pendingNames.length > 0) {
      return (
        <p className="text-amber-200 text-sm">
          Esperando que {pendingNames.join(", ")} confirme
          {pendingNames.length > 1 ? "n" : ""} su carta...
        </p>
      );
    }

    if (locked) {
      return <p className="text-emerald-200 text-sm">Esperando redistribución...</p>;
    }

    if (status === "submitting" || status === "redistributing") {
      return <p className="text-emerald-200 text-sm">Redistribuyendo cartas...</p>;
    }

    if (pendingNames.length > 0) {
      return (
        <p className="text-amber-200 text-sm">
          Aún faltan: {pendingNames.join(", ")}
        </p>
      );
    }

    return (
      <p className="text-gray-300 text-sm">
        Seleccioná una carta de tu mano para entregar al jugador de la {directionLabel}.
      </p>
    );
  };

  const cardsGrid = Array.isArray(cards) && cards.length > 0 ? (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
      {cards.map((card) => {
        const cardId = Number(card?.carta_id ?? card?.id);
        if (Number.isNaN(cardId)) return null;
        const isSelected = Number(selectedCardId) === cardId;
        return (
          <button
            key={cardId}
            type="button"
            className={`relative rounded-lg border-2 overflow-hidden transition-all duration-150 ${
              isSelected
                ? "border-emerald-500 ring-2 ring-emerald-500/50"
                : "border-gray-700 hover:border-emerald-400/70"
            } ${locked ? "opacity-60 cursor-not-allowed" : ""}`}
            onClick={() => {
              if (locked) return;
              onSelect(cardId);
            }}
            disabled={locked}
          >
            <div className="relative w-full pt-[150%] bg-black/20">
              <img
                src={getCardImage(card?.nombre)}
                alt={card?.nombre}
                className="absolute inset-0 w-full h-full object-contain"
                draggable={false}
                onError={(event) => {
                  event.currentTarget.style.display = "none";
                  if (event.currentTarget.nextElementSibling) {
                    event.currentTarget.nextElementSibling.style.display = "flex";
                  }
                }}
              />
              <div className="absolute inset-0 hidden items-center justify-center bg-gray-900/60 text-white text-xs font-semibold">
                {card?.nombre}
              </div>
            </div>
            <div className="absolute inset-x-0 bottom-0 bg-black/70 text-xs text-white text-center px-2 py-1">
              {card?.nombre}
            </div>
          </button>
        );
      })}
    </div>
  ) : (
    <div className="p-4 bg-gray-800 rounded-lg text-sm text-gray-300">
      No encontramos cartas en tu mano.
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-[80] p-4">
      <div className="bg-gray-900 w-full max-w-3xl rounded-2xl shadow-2xl ring-1 ring-white/10">
        <header className="px-6 py-5 border-b border-gray-800 flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-wide text-emerald-300">Evento</p>
            <h2 className="text-2xl font-bold text-white">Dead Card Folly</h2>
            <p className="text-xs text-gray-400 mt-1">
              Dirección: {directionLabel}. {statusLabels[status] ?? ""}
            </p>
          </div>
          {showCloseButton && (
            <button type="button" className="btn btn-sm btn-ghost" onClick={onClose}>
              ✕
            </button>
          )}
        </header>

        <div className="px-6 py-6 space-y-4">
          {renderWaitingMessage()}
          {status !== "completed" && status !== "error" && cardsGrid}

          {status === "completed" && receivedCard && (
            <div className="bg-emerald-900/40 rounded-xl border border-emerald-500/40 p-4 flex flex-col sm:flex-row gap-4">
              <div className="w-28 h-40 overflow-hidden rounded-lg border border-emerald-500/40">
                <img
                  src={getCardImage(receivedCard.nombre)}
                  alt={receivedCard.nombre}
                  className="w-full h-full object-cover"
                  onError={(event) => {
                    event.currentTarget.style.display = "none";
                  }}
                />
              </div>
              <div>
                <p className="text-lg font-semibold text-white">Recibiste {receivedCard.nombre}</p>
                <p className="text-sm text-emerald-200">
                  Dead Card Folly hizo circular las cartas entre todos los jugadores.
                </p>
              </div>
            </div>
          )}
        </div>

        <footer className="px-6 pb-6 border-t border-gray-800 flex flex-wrap gap-3 justify-end">
          {!locked && status === "selecting" && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => onClear?.()}
              disabled={!selectedCardId}
            >
              Limpiar selección
            </button>
          )}

          {status === "selecting" && (
            <button
              type="button"
              className={`btn ${canConfirm ? "btn-primary" : "btn-disabled"}`}
              onClick={onConfirm}
              disabled={!canConfirm}
            >
              Listo
            </button>
          )}

          {showCloseButton && (
            <button type="button" className="btn btn-primary" onClick={onClose}>
              Entendido
            </button>
          )}
        </footer>
      </div>
    </div>
  );
});

export default DeadCardFollyModal;
