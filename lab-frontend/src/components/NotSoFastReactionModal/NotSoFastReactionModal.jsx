import { useEffect, useState } from "react";

const formatCountdown = (ms) => {
  if (!ms || ms <= 0) return "0 s";
  const seconds = Math.ceil(ms / 1000);
  return `${seconds} s`;
};

export default function NotSoFastReactionModal({
  reaction = null,
  hasNotSoFastCard = false,
  isSubmitting = false,
  onPlay = () => {},
  onSkip = () => {},
}) {
  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    if (!reaction?.expiresAt) {
      setTimeLeft(0);
      return;
    }
    const update = () => {
      setTimeLeft(Math.max(0, reaction.expiresAt - Date.now()));
    };
    update();
    const interval = setInterval(update, 200);
    return () => clearInterval(interval);
  }, [reaction?.expiresAt, reaction?.id]);

  if (!reaction) return null;

  const {
    actorName = "Otro jugador",
    actionSummary = "realizar una acción",
    blockable = true,
    targetName = null,
  } = reaction;

  const baseMessage = `${actorName} está intentando ${actionSummary}.`;
  const question = blockable
    ? "¿Querés jugar “Not So Fast”?"
    : "Esta jugada no puede ser bloqueada con Not So Fast.";

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/75 backdrop-blur-sm flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-lg bg-gray-900 rounded-2xl border border-amber-500/40 shadow-2xl p-6 space-y-4">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-[0.35em] text-amber-200/80">
            Reacción inmediata
          </p>
          <h2 className="text-2xl font-semibold text-white">
            Not So Fast…
          </h2>
        </header>

        <div className="space-y-2 text-left">
          <p className="text-base text-gray-100">{baseMessage}</p>
          {targetName && (
            <p className="text-sm text-gray-400">
              Objetivo: <span className="font-semibold text-gray-100">{targetName}</span>
            </p>
          )}
          <p className={`text-sm ${blockable ? "text-amber-200" : "text-rose-200 font-semibold"}`}>
            {question}
          </p>
        </div>

        <div className="flex items-center justify-between text-sm text-gray-400">
          <span>La respuesta expira en</span>
          <span className="text-lg font-mono text-amber-300">{formatCountdown(timeLeft)}</span>
        </div>

        <div className="flex flex-col gap-3">
          {blockable ? (
            hasNotSoFastCard ? (
              <button
                type="button"
                className="btn btn-primary w-full"
                onClick={onPlay}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Jugando…" : "Jugar Not So Fast"}
              </button>
            ) : (
              <div className="text-sm text-gray-400 bg-gray-800/70 border border-gray-700 rounded-lg p-3 text-center">
                No tenés “Not So Fast” en tu mano.
              </div>
            )
          ) : null}
          <button
            type="button"
            className="btn btn-ghost w-full text-gray-200"
            onClick={onSkip}
            disabled={isSubmitting}
          >
            No intervenir
          </button>
        </div>
      </div>
    </div>
  );
}
