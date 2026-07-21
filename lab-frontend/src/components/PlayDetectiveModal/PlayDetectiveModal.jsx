import { useEffect, useMemo, useState } from "react";
import { getCardImage, getCardInfo } from "../../utils/CardImageMapper";
import {
  canCardJoinSet,
  harleyViolatesRule,
  isAriadneCard,
  isHarleyCard,
  isUnblockableCombination,
  isTooLongSet,
} from "../../utils/detectiveRules";

const getCardTitle = (card) => card?.nombre ?? "Carta";

const getSetKey = (set) => Number(set?.id ?? set?.set_id ?? set?.setId ?? set?.setID);

export default function PlayDetectiveModal({
  isOpen = false,
  cards = [],
  mySets = [],
  allSets = [],
  currentUserId,
  onClose,
  onConfirm,
  isSubmitting = false,
  initialCardId = null,
}) {
  const [selectedCardId, setSelectedCardId] = useState(null);
  const [selectedSetId, setSelectedSetId] = useState(null);

  useEffect(() => {
    if (!isOpen) {
      setSelectedCardId(null);
      setSelectedSetId(null);
      return;
    }

    if (initialCardId != null) {
      setSelectedCardId(Number(initialCardId));
    }
  }, [isOpen, initialCardId]);

  const setsByCard = useMemo(() => {
    const map = new Map();
    if (!Array.isArray(cards)) return map;

    cards.forEach((card) => {
      const cardId = Number(card?.carta_id);
      if (Number.isNaN(cardId)) return;

      const perSet = new Map();
      const isAriadne = isAriadneCard(card);
      const candidateSets = isAriadne
        ? (Array.isArray(allSets)
            ? allSets.filter((set) => {
                const ownerId = Number(
                  set?.owner_id ?? set?.ownerId ?? set?.owner ?? set?.jugador_id,
                );
                return !Number.isNaN(ownerId) && ownerId !== Number(currentUserId);
              })
            : [])
        : Array.isArray(mySets)
        ? mySets
        : [];

      candidateSets.forEach((set) => {
        const setKey = getSetKey(set);
        if (Number.isNaN(setKey)) return;

        const isCompatible = canCardJoinSet(card, set, currentUserId);
        const violatesHarley = harleyViolatesRule(card, set);
        const isUnblockable = isUnblockableCombination(card, set);
        const isTooLong = isTooLongSet(set);

        perSet.set(setKey, {
          set,
          isCompatible,
          violatesHarley,
          isUnblockable,
          isAriadneTarget: isAriadne,
        });
      });

      map.set(cardId, perSet);
    });

    return map;
  }, [cards, mySets, allSets, currentUserId]);

  useEffect(() => {
    if (!selectedCardId) {
      setSelectedSetId(null);
      return;
    }

    const metadataForCard = setsByCard.get(Number(selectedCardId));
    if (!metadataForCard) {
      setSelectedSetId(null);
      return;
    }

    if (selectedSetId != null) {
      const existing = metadataForCard.get(Number(selectedSetId));
      if (!existing || !existing.isCompatible) {
        setSelectedSetId(null);
      }
    }
  }, [selectedCardId, selectedSetId, setsByCard]);

  if (!isOpen) return null;

  const selectedCard = cards.find(
    (card) => Number(card?.carta_id) === Number(selectedCardId),
  );
  const metadataForSelectedCard = selectedCard
    ? setsByCard.get(Number(selectedCard?.carta_id))
    : null;
  const selectedSetMeta = metadataForSelectedCard?.get(Number(selectedSetId)) ?? null;
  const isAriadneSelected = Boolean(selectedCard && isAriadneCard(selectedCard));
  const availableSetEntries = metadataForSelectedCard
    ? Array.from(metadataForSelectedCard.entries())
    : [];

  let validationMessage = "";
  if (!selectedCard) {
    validationMessage = "Seleccioná un detective de tu mano.";
  } else if (!selectedSetId) {
    validationMessage = isAriadneSelected
      ? "Seleccioná un set de otro jugador."
      : "Seleccioná uno de tus sets.";
  } else if (!selectedSetMeta?.isCompatible) {
    validationMessage = "Ese detective no es compatible con el set elegido.";
  } else if (selectedSetMeta?.violatesHarley) {
    validationMessage = "No podés usar Harley Quin sin tener ya un detective de ese grupo.";
  } else if (selectedSetMeta?.isTooLong){
    validationMessage = "Ya hay 5 cartas en el set, no puede agregar mas.";
  }

  const confirmDisabled =
    !selectedCard ||
    !selectedSetMeta?.isCompatible ||
    selectedSetMeta?.violatesHarley ||
    isSubmitting;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
      <div className="bg-gray-900 w-full max-w-5xl mx-auto rounded-xl shadow-2xl ring-1 ring-white/10 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h2 className="text-2xl font-bold text-emerald-300">Agregar detective a un set</h2>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={onClose}
            disabled={isSubmitting}
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 px-6 py-6">
          <div>
            <h3 className="text-lg font-semibold text-white mb-3">Detectives en tu mano</h3>
            {cards.length === 0 ? (
              <div className="p-4 bg-gray-800 rounded-lg text-sm text-gray-300">
                No tenés detectives disponibles.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {cards.map((card) => {
                  const cardId = Number(card?.carta_id);
                  const isSelected = Number(selectedCardId) === cardId;
                  const info = getCardInfo(card?.nombre);
                  return (
                    <button
                      key={cardId}
                      type="button"
                      onClick={() => setSelectedCardId(cardId)}
                      className={`relative rounded-lg border-2 transition-transform duration-150 ${
                        isSelected
                          ? "border-emerald-500 ring-2 ring-emerald-500/40 scale-[1.02]"
                          : "border-gray-700 hover:border-emerald-400/60"
                      } overflow-hidden`}
                    >
                      <img
                        src={getCardImage(card?.nombre)}
                        alt={card?.nombre}
                        className="w-full h-40 object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                      <div className="absolute inset-x-0 bottom-0 bg-black/70 px-2 py-1 text-xs text-white text-center">
                        {getCardTitle(card)}
                      </div>
                      <span
                        className={`absolute top-1 right-1 text-[10px] px-1 py-0.5 rounded text-white font-semibold ${
                          info.type === "event"
                            ? "bg-green-600"
                            : info.type === "devious"
                            ? "bg-red-600"
                            : info.type === "instant"
                            ? "bg-yellow-600"
                            : "bg-blue-600"
                        }`}
                      >
                        {(info.type ?? "card").toUpperCase()}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <h3 className="text-lg font-semibold text-white mb-3">
              {selectedCard && isAriadneCard(selectedCard)
                ? "Sets de otros jugadores"
                : "Tus sets en mesa"}
            </h3>
            {!selectedCard ? (
              <div className="p-4 bg-gray-800 rounded-lg text-sm text-gray-300">
                Seleccioná un detective para ver los sets disponibles.
              </div>
            ) : availableSetEntries.length === 0 ? (
              <div className="p-4 bg-gray-800 rounded-lg text-sm text-gray-300">
                No hay sets compatibles para este detective.
              </div>
            ) : (
              <div className="flex flex-col gap-3 max-h-[400px] overflow-y-auto pr-1">
                {availableSetEntries.map(([setKey, meta]) => {
                  const set = meta?.set;
                  const isSelected = Number(selectedSetId) === Number(setKey);
                  const incompatible = !meta?.isCompatible;
                  const violatesHarley = meta?.violatesHarley && isHarleyCard(selectedCard);
                  const ownerId = Number(
                    set?.owner_id ?? set?.ownerId ?? set?.owner ?? set?.jugador_id,
                  );
                  const ownerLabel =
                    ownerId === Number(currentUserId) ? "Tu set" : `Jugador ${ownerId}`;
                  return (
                    <button
                      key={setKey}
                      type="button"
                      className={`text-left rounded-lg border-2 px-4 py-3 transition-colors ${
                        isSelected
                          ? "border-emerald-500 bg-emerald-500/10"
                          : incompatible || violatesHarley
                          ? "border-red-600/60 bg-red-500/10 cursor-not-allowed"
                          : "border-gray-700 hover:border-emerald-400/60 bg-gray-800/60"
                      }`}
                      onClick={() => {
                        if (meta?.isCompatible) {
                          setSelectedSetId(Number(setKey));
                        }
                      }}
                      disabled={!meta?.isCompatible}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-white">{set?.nombre}</p>
                          <p className="text-xs text-emerald-300">{ownerLabel}</p>
                          <p className="text-xs text-gray-300">
                            Cartas: {Array.isArray(set?.cartas) ? set.cartas.length : 0}
                          </p>
                        </div>
                        <div className="text-xs text-gray-400">ID #{setKey}</div>
                      </div>
                      {violatesHarley && (
                        <p className="mt-2 text-xs text-amber-400">
                          Necesitás un detective real en este set antes de usar a Harley Quin.
                        </p>
                      )}
                      {meta?.isUnblockable && (
                        <p className="mt-2 text-xs text-emerald-300">
                          Esta jugada no puede ser bloqueada con Not So Fast.
                        </p>
                      )}
                      {incompatible && !violatesHarley && (
                        <p className="mt-2 text-xs text-red-300">
                          El detective seleccionado no puede unirse a este set.
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="px-6 pb-6 border-t border-gray-700">
          {validationMessage && (
            <div className="mb-3 text-sm text-amber-300">{validationMessage}</div>
          )}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancelar
            </button>
            <button
              type="button"
              className={`btn ${confirmDisabled ? "btn-disabled" : "btn-primary"}`}
              onClick={() => {
                if (confirmDisabled || typeof onConfirm !== "function") return;
                onConfirm({
                  cardId: Number(selectedCardId),
                  setId: Number(selectedSetId),
                  isUnblockable: Boolean(selectedSetMeta?.isUnblockable),
                });
              }}
              disabled={confirmDisabled}
            >
              {isSubmitting ? "Procesando..." : "Confirmar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
