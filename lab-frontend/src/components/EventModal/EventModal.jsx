import { useState, useEffect, useRef, useMemo } from "react";
import { getCardImage, getCardInfo } from "../../utils/CardImageMapper";

export default function EventModal({
  eventCardData,
  players = [],
  playersSets = [], 
  requiresTarget = undefined,
  currentUserId,
  onConfirm, 
  onCancel,
  incomingEvent = null,
  onCloseIncoming,
  secretsToShow = [],
  secretsByPlayer = {}, 
  discardTopFive = [],
  fetchPlayerSecrets = null,
}) {
  // Si no hay nada que mostrar, no renderizamos
  if (!eventCardData && !incomingEvent) return null;

  // info de la carta: preferir metadata ya incluida en eventCardData.cardInfo
  // para evitar llamar redundantly a getCardInfo; caer a getCardInfo solo si no existe
  const cardInfo =
    eventCardData?.cardInfo ?? (eventCardData ? getCardInfo(eventCardData?.nombre) || {} : {});

  // detectar si la carta permite elegir desde el descarte (Look into the ashes)
  const nameKey = String(eventCardData?.nombre ?? "").trim().toLowerCase();
  const isDeadCardFolly = nameKey.includes("dead card folly");
  const requiresPickFromDiscard = Boolean(
    cardInfo?.requiresPickFromDiscard ||
      eventCardData?.requiresPickFromDiscard ||
      /look into the ashes|look into ashes|ashes/.test(nameKey)
  );
  // estado para la carta seleccionada del descarte (Look into the ashes)
  const [selectedDiscardId, setSelectedDiscardId] = useState(null);


  // Detectar si es Another Victim
  const isAnotherVictim = String(eventCardData?.nombre ?? "").toLowerCase().includes("another victim");

  // si la carta requiere seleccionar un secreto (id) de los revelados en mesa
  const requiresSecretId = Boolean(cardInfo?.requiresSecretId || eventCardData?.requiresSecretId);

    // Para "And then there was one more" necesitamos SIEMPRE un jugador objetivo
  const requiresPlayerTarget = Boolean(
    cardInfo?.requiresPlayerTarget || 
    cardInfo?.targets === "player" || 
    eventCardData?.requiresTarget === true ||
    requiresSecretId 
  );

  // heurística: si la carta requiere target de jugado
  const explicitRequires = typeof requiresTarget === "boolean" ? requiresTarget : undefined;
  const inferredRequires = Boolean(
    cardInfo?.requiresPlayerTarget || cardInfo?.targets === "player" || eventCardData?.requiresTarget === true,
  );

  // si la carta permite targetearte a vos mismo
  const allowSelfTarget = Boolean(cardInfo?.allowSelfTarget || cardInfo?.allowSelf === true);

  // Detectar si requiere seleccionar un set
  const requiresSetTarget = Boolean(eventCardData?.requiresSetTarget) || isAnotherVictim;

  const [selectedPlayerId, setSelectedPlayerId] = useState(null);
  const [selectedSecretId, setSelectedSecretId] = useState(null);
  const [selectedOfferedCardId, setSelectedOfferedCardId] = useState(null);
  const [selectedIncomingCardId, setSelectedIncomingCardId] = useState(null);
  const [selectedSetId, setSelectedSetId] = useState(null); 
  const [deadCardFollyDirection, setDeadCardFollyDirection] = useState("derecha");
  const [selectedSecretToRevealId, setSelectedSecretToRevealId] = useState(null);
  const [fetchedSecretsForTrade, setFetchedSecretsForTrade] = useState([]);
  const confirmBtnRef = useRef(null);

  const publicSecretsByPlayer = useMemo(() => {
    console.log("EventModal - secretsByPlayer recibido:", secretsByPlayer);
    
    const result = {};
    Object.entries(secretsByPlayer || {}).forEach(([playerId, secrets]) => {
      if (Array.isArray(secrets) && secrets.length > 0) {
        result[playerId] = secrets;
        console.log(`Jugador ${playerId}: ${secrets.length} secretos revelados`);
      }
    });
    
    console.log(" publicSecretsByPlayer final:", result);
    return result;
  }, [secretsByPlayer]);

  const mySecretOptions = useMemo(() => {
    const collected = [];
    const seen = new Set();
    const pushSecret = (secret) => {
      if (!secret) return;
      const ownerId = Number(
        secret?.jugador_id ?? secret?.jugadorId ?? secret?.owner_id ?? secret?.ownerId ?? currentUserId,
      );
      if (Number.isNaN(ownerId) || ownerId !== Number(currentUserId)) return;
      const secretId = secret?.secreto_id ?? secret?.id ?? secret?.secretoId;
      if (secretId == null) return;
      const key = `${ownerId}:${secretId}`;
      if (seen.has(key)) return;
      seen.add(key);
      collected.push(secret);
    };

    if (Array.isArray(fetchedSecretsForTrade)) {
      fetchedSecretsForTrade.forEach(pushSecret);
    }
    if (Array.isArray(incomingEvent?.meta?.mySecrets)) {
      incomingEvent.meta.mySecrets.forEach(pushSecret);
    }
    if (Array.isArray(secretsToShow)) {
      secretsToShow.forEach(pushSecret);
    }

    return collected;
  }, [secretsToShow, incomingEvent, fetchedSecretsForTrade, currentUserId]);

  const unrevealedSecretOptions = useMemo(
    () => mySecretOptions.filter((secret) => !(secret?.revelado ?? secret?.revealed)),
    [mySecretOptions],
  );

  useEffect(() => {
    if (requiresSecretId) {
      console.log(" EventModal - Debug secretos revelados:", {
        secretsByPlayer,
        publicSecretsByPlayer,
        jugadoresConSecretos: Object.keys(publicSecretsByPlayer),
        totalSecretos: Object.values(publicSecretsByPlayer).reduce((sum, arr) => sum + arr.length, 0)
      });
    }
  }, [requiresSecretId, secretsByPlayer, publicSecretsByPlayer]);

  useEffect(() => {
    if (!incomingEvent) return;
    if (mySecretOptions.length > 0) return;
    if (typeof fetchPlayerSecrets !== "function") return;
    const numericUser = Number(currentUserId);
    if (Number.isNaN(numericUser)) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchPlayerSecrets(numericUser);
        if (!cancelled && Array.isArray(list)) {
          setFetchedSecretsForTrade(list);
        }
      } catch (err) {
        console.warn("No se pudieron cargar secretos para Social Faux Pas:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [incomingEvent, fetchPlayerSecrets, currentUserId, mySecretOptions.length]);

  // Fallback plano: secretsToShow también se filtra por revelados
  const publicSecretsToShow = (secretsToShow || []).filter((s) => Boolean(s?.revelado ?? s?.revealed));

  // calcular jugadores seleccionables (incluir self si la carta lo permite)
  const selectablePlayers = Array.isArray(players)
    ? players.filter((p) => (allowSelfTarget ? true : Number(p.id) !== Number(currentUserId)))
    : [];

  const discardList = Array.isArray(discardTopFive)
    ? discardTopFive
    : Array.isArray(discardTopFive)
    ? discardTopFive
    : [];

  // Calcular si el botón debe estar deshabilitado
  const isConfirmDisabled = 
    (requiresPlayerTarget && !requiresSecretId && selectedPlayerId == null) ||
    (requiresSecretId && (selectedSecretId == null || selectedPlayerId == null)) ||
    (requiresPickFromDiscard && selectedDiscardId == null) ||
    (requiresSetTarget && selectedSetId == null) ||
    (isDeadCardFolly && !deadCardFollyDirection);

  const isCardTradeInitiator = Boolean(
    eventCardData && (
      eventCardData.cardInfo?.actionKey === 'card-trade' ||
      String(eventCardData?.nombre ?? '').toLowerCase().includes('card trade')
    )
  );

  // If this modal is being used to initiate a Card Trade, require selection of target and offered card
  const playerCardsForTrade = Array.isArray(eventCardData?.playerCards) ? eventCardData.playerCards : [];
  const isCardTradeConfirmDisabled = isCardTradeInitiator && (!selectedPlayerId || !selectedOfferedCardId);

  // Helper local para devolver clases de badge según el tipo de carta.
  // Mantiene compatibilidad visual simple con Tablero.renderCardTypeBadge.
  const renderCardTypeBadge = (type) => {
    const t = String(type ?? "").toLowerCase();
    switch (t) {
      case "event":
        return "bg-emerald-600";
      case "detective":
      return "bg-indigo-600";
      case "item":
        return "bg-yellow-600";
      default:
        return "bg-slate-600";
    }
  };

  // reset de selección de secreto cuando cambia la carta
  useEffect(() => {
    setSelectedSecretId(null);
    // reset selección de descarte cuando cambia la carta/modal
    setSelectedDiscardId(null);
    setDeadCardFollyDirection("derecha");
  }, [eventCardData]);

  // calcular sets seleccionables (solo de otros jugadores) 
  const selectableSets = Array.isArray(playersSets) 
    ? playersSets.filter((set) => Number(set.owner_id) !== Number(currentUserId))
    : [];

  if (incomingEvent) {
    const objetivo =
      incomingEvent.jugadorObjetivoId ??
      incomingEvent.targetPlayerId ??
      incomingEvent.jugadorObjetivo ??
      null;

    if (objetivo != null && Number(objetivo) !== Number(currentUserId)) {
      return null;
    }
  }

  const getIncomingMessage = (cardName) => {
    // Si tenemos información específica en meta, usar esa
    if (incomingEvent?.meta?.mensaje) {
      return incomingEvent.meta.mensaje;
    }
    
    const key = String(cardName ?? "").trim().toLowerCase();
    switch (key) {
      case "cards off the table":
        return 'Todas tus cartas "Not so Fast" se han ido';
      case "early train to paddington":
        return "6 cartas fueron movidas del mazo al descarte.";
      case "and then there was one more...":
      case "and then there was one more":
      case "one more":
        return "Te han agregado un nuevo secreto boca abajo. Revisa tus secretos.";
      default:
        if (key.includes("delay") && key.includes("murderer")) {
          return "El mazo fue reordenado. Cartas del descarte fueron mezcladas y colocadas encima.";
        }
        if (key.includes("another victim")) {
          return "Te robaron un set. Revisa tu zona de juego.";
        }
        return "Esto pudo modificar tu mano. Revisa tus cartas.";
    }
  };

  // Función para obtener el nombre del propietario de un set
  const getSetOwnerName = (ownerId) => {
    const owner = players.find(p => Number(p.id) === Number(ownerId));
    return owner?.nombre || `Jugador ${ownerId}`;
  };

  // si la selección actual no está en la lista de seleccionables, resetearla
  useEffect(() => {
    if (selectedPlayerId == null) return;
    const exists = selectablePlayers.some((p) => String(p.id) === String(selectedPlayerId));
    if (!exists) setSelectedPlayerId(null);
  }, [eventCardData, players, currentUserId, selectedPlayerId, allowSelfTarget]);

  // si la selección actual no está en la lista de seleccionables, resetearla
  useEffect(() => {
    if (selectedPlayerId == null) return;
    const exists = selectablePlayers.some((p) => String(p.id) === String(selectedPlayerId));
    if (!exists) setSelectedPlayerId(null);
  }, [eventCardData, players, currentUserId, selectedPlayerId]);

  useEffect(() => {
    if (selectedSetId == null) return;
    const exists = selectableSets.some((set) => String(set.id) === String(selectedSetId));
    if (!exists) setSelectedSetId(null);
  }, [eventCardData, playersSets, currentUserId, selectedSetId]); 

  useEffect(() => {
    setSelectedPlayerId(null);
    setSelectedSetId(null);
    // foco al abrir modal
    if (confirmBtnRef?.current) confirmBtnRef.current.focus();
  }, [eventCardData]);

  const incomingType = incomingEvent?.type ?? incomingEvent?.action ?? incomingEvent?.meta?.type ?? null;
  const isIncomingCardTradeRequest = incomingType === 'card_trade_request' || incomingType === 'card_trade';
  const offeredCardName =
    incomingEvent?.offeredCardName ??
    incomingEvent?.meta?.offeredCardName ??
    incomingEvent?.meta?.nombreCartaOfrecida ??
    null;
  const offeredCardKey = String(offeredCardName ?? "").trim().toLowerCase();
  const isOfferedBlackmailed = isIncomingCardTradeRequest && offeredCardKey.includes("blackmail");
  const isOfferedSocialFaux = isIncomingCardTradeRequest && offeredCardKey.includes("social faux");
  const requiresSecretDueToDevious =
    isIncomingCardTradeRequest && isOfferedSocialFaux && unrevealedSecretOptions.length > 0;

  useEffect(() => {
    if (!requiresSecretDueToDevious) {
      if (selectedSecretToRevealId != null) setSelectedSecretToRevealId(null);
      return;
    }
    if (selectedSecretToRevealId == null && unrevealedSecretOptions.length === 1) {
      const uniqueSecret = unrevealedSecretOptions[0];
      const secretId = uniqueSecret?.secreto_id ?? uniqueSecret?.id ?? uniqueSecret?.secretoId ?? null;
      if (secretId != null) {
        setSelectedSecretToRevealId(Number(secretId));
      }
    }
  }, [requiresSecretDueToDevious, unrevealedSecretOptions, selectedSecretToRevealId]);

   // si cambia la lista de secretos visibles, asegurarse que selectedSecretId sigue válida
  useEffect(() => {
    if (selectedSecretId == null) return;
    const existsInFlat = (publicSecretsToShow || []).some((s) => String(s?.secreto_id ?? s?.id) === String(selectedSecretId));
    const existsInGrouped = Object.values(publicSecretsByPlayer || {}).some((arr) =>
      arr.some((s) => String(s?.secreto_id ?? s?.id) === String(selectedSecretId)),
    );
    const exists = existsInFlat || existsInGrouped;
    if (!exists) setSelectedSecretId(null);
  }, [publicSecretsToShow, publicSecretsByPlayer, selectedSecretId]);

  // Cerrar con Escape
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onCancel?.(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const closeModal = () => {
    setSelectedPlayerId(null);
    setSelectedSetId(null);
    onCancel?.();
  };

  useEffect(() => {
    console.debug("EventModal props:", { 
      eventCardData, 
      incomingEvent, 
      cardInfo, 
      requiresTarget, 
      requiresPlayerTarget,
      requiresSetTarget,
      isAnotherVictim, 
      players,
      playersSets,
      selectableSets: selectableSets.length,
      currentUserId,
      "playersSets raw": playersSets,
      "selectableSets raw": selectableSets
    });
  }, [eventCardData, cardInfo, requiresTarget, requiresPlayerTarget, requiresSetTarget, isAnotherVictim, players, playersSets, currentUserId, selectableSets]);

  if (incomingEvent && !isIncomingCardTradeRequest) {
    return (
      <div
        className="fixed inset-0 bg-black/70 flex items-center justify-center z-60"
        role="dialog"
        aria-modal="true"
        aria-labelledby="incoming-event-title"
      >
        <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md text-center shadow-xl ring-1 ring-white/10">
          <h3 id="incoming-event-title" className="text-2xl font-bold mb-2">Te aplicaron un efecto</h3>
          <p className="text-gray-300 mb-4">Has recibido el efecto: <strong>{incomingEvent.cardName}</strong></p>
          <p className="text-sm text-gray-400 mb-6">
            {getIncomingMessage(incomingEvent.cardName ?? incomingEvent.cartaNombre ?? eventCardData?.nombre)}
         </p>
         <div className="flex items-center justify-center">
          <button
            onClick={() => onCloseIncoming?.()}
            className="btn btn-primary px-6"
          >
            Cerrar
          </button>
         </div>
        </div>
      </div>
    );
  }

  // Si incomingEvent es una solicitud de Card Trade, mostramos UI para elegir carta a dar
  if (incomingEvent && isIncomingCardTradeRequest) {
    const requesterName = incomingEvent.requesterName ?? incomingEvent.requester?.nombre ?? `Jugador ${incomingEvent.requesterId ?? incomingEvent.requester}`;
    const playerCards = incomingEvent.playerCards ?? [];
    const cardList = Array.isArray(playerCards) ? playerCards : [];

    console.log("EventModal: incoming card trade recibido:", { requesterName, requestId: incomingEvent.requestId, cardListLength: cardList.length, incomingEvent });

    return (
      <div
        className="fixed inset-0 bg-black/70 flex items-center justify-center z-60"
        role="dialog"
        aria-modal="true"
        aria-labelledby="incoming-card-trade-title"
      >
        <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md text-center shadow-xl ring-1 ring-white/10">
          <h3 id="incoming-card-trade-title" className="text-2xl font-bold mb-2">Propuesta de intercambio</h3>
          <p className="text-gray-300 mb-4">{requesterName} te propone intercambiar cartas. Seleccioná cuál carta le darás a cambio.</p>
          {offeredCardName && (
            <div className="mb-4 rounded border border-amber-400/40 bg-amber-900/30 p-3 text-left">
              <p className="text-sm text-amber-100">
                Carta ofrecida: <strong>{offeredCardName}</strong>
              </p>
              {isOfferedBlackmailed && (
                <p className="text-xs text-amber-200 mt-1">
                  Blackmailed: el jugador que la entrega podrá ver uno de tus secretos en privado.
                </p>
              )}
              {isOfferedSocialFaux && (
                <p className="text-xs text-amber-200 mt-1">
                  Social Faux Pas: al aceptar esta carta deberás revelar uno de tus secretos.
                </p>
              )}
            </div>
          )}
          {isOfferedSocialFaux && (
            <div className="mb-4 rounded border border-amber-400/40 bg-amber-900/20 p-3 text-left">
              <label
                htmlFor="card-trade-social-faux-secret"
                className="text-sm text-amber-100 font-semibold mb-2 block"
              >
                Elegí qué secreto vas a revelar:
              </label>
              {requiresSecretDueToDevious ? (
                <select
                  id="card-trade-social-faux-secret"
                  className="select select-bordered w-full"
                  value={selectedSecretToRevealId ?? ""}
                  onChange={(event) => {
                    const { value } = event.target;
                    setSelectedSecretToRevealId(value === "" ? null : Number(value));
                  }}
                >
                  <option value="" disabled>Secreto...</option>
                  {unrevealedSecretOptions.map((secret, index) => {
                    const secretId = secret?.secreto_id ?? secret?.id ?? secret?.secretoId ?? index;
                    const label = secret?.descripcion ?? `Secreto #${index + 1}`;
                    return (
                      <option key={secretId} value={secretId}>
                        {label}
                      </option>
                    );
                  })}
                </select>
              ) : (
                <p className="text-xs text-amber-100/90">
                  No te quedan secretos ocultos disponibles para revelar, así que este efecto se omite.
                </p>
              )}
            </div>
          )}

          <div className="flex flex-col max-h-64 overflow-y-auto space-y-2 mb-4 bg-gray-900/50 rounded p-3">
            {cardList.length > 0 ? (
              cardList.map((c) => {
                const cid = c?.carta_id ?? c?.id ?? c?.cartaId ?? c?.carta_id ?? String(c);
                return (
                  <label key={String(cid)} className="cursor-pointer flex items-center space-x-3 px-3 py-2 rounded hover:bg-gray-700">
                    <input
                      type="radio"
                      name="incoming-card-trade-choice"
                      value={cid}
                      checked={String(selectedIncomingCardId) === String(cid)}
                      onChange={() => setSelectedIncomingCardId(cid)}
                      className="form-radio"
                    />
                    <span className="font-medium">{c?.nombre ?? `Carta ${cid}`}</span>
                  </label>
                );
              })
            ) : (
              <div className="text-sm text-gray-400 py-4">No se pudieron cargar las cartas para elegir.</div>
            )}
          </div>

          <div className="flex items-center justify-center">
            <button
              onClick={() => {
                const payload = {
                  action: "respond_card_trade",
                  cardId: incomingEvent.eventId ?? incomingEvent.cartaEventoId ?? incomingEvent.cardId ?? null,
                  cardName: incomingEvent.cardName ?? incomingEvent.cartaNombre ?? null,
                  requesterId: incomingEvent.requesterId ?? incomingEvent.requester ?? null,
                  offeredCardId: incomingEvent.offeredCardId ?? incomingEvent.cartaOfrecidaId ?? null,
                  chosenCardId: selectedIncomingCardId ?? null,
                  requestId: incomingEvent.requestId ?? null,
                  offeredCardName: offeredCardName ?? null,
                };
                if (requiresSecretDueToDevious && selectedSecretToRevealId != null) {
                  payload.secretosARevelarIds = [Number(selectedSecretToRevealId)];
                }
                if (isOfferedSocialFaux) {
                  payload.requiresSocialFauxReveal = true;
                }
                console.log("EventModal: responder Card Trade - payload:", payload);
                onConfirm?.(payload);
              }}
              className="btn btn-primary px-6 mr-3"
              disabled={
                !selectedIncomingCardId ||
                (requiresSecretDueToDevious && selectedSecretToRevealId == null)
              }
            >
              Confirmar
            </button>
            <button onClick={() => onCloseIncoming?.()} className="btn btn-ghost px-6">
              Cancelar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-60"
      role="dialog"
      aria-modal="true"
      aria-labelledby="event-modal-title"
    >
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-3xl text-center shadow-xl ring-1 ring-white/10">
        <h3 id="event-modal-title" className="text-2xl font-bold mb-2">Vas a jugar un evento</h3>
        <p className="text-gray-300 mb-4">Confirma que deseas jugar el siguiente evento:</p>

        <div className="flex flex-col md:flex-row items-center gap-6 justify-center mb-6">
          <img
            src={getCardImage(eventCardData?.nombre)}
            alt={eventCardData?.nombre}
            className="w-48 h-72 object-cover rounded-lg shadow-2xl"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
          <div className="text-left">
            <p className="text-xl font-semibold">{eventCardData?.nombre}</p>
            <p className="text-sm text-amber-300 mt-2">Tipo: {cardInfo?.type ?? "?"}</p>
            <p className="text-sm text-gray-400 mt-2">{cardInfo?.description ?? "Acción de evento."}</p>

            {/* Información específica para Delay the Murderer Escape */}
            {String(eventCardData?.nombre ?? "").toLowerCase().includes("delay") && 
             String(eventCardData?.nombre ?? "").toLowerCase().includes("murderer") && (
              <div className="mt-3 p-3 bg-purple-900/30 rounded border border-purple-600">
                <p className="text-sm text-purple-200 font-medium">Efecto del evento:</p>
                <p className="text-xs text-purple-300 mt-1">
                  • Toma hasta 5 cartas del tope del descarte<br/>
                  • Las coloca boca abajo sobre el mazo en orden aleatorio<br/>
                  • Esta carta se elimina del juego
                </p>
                <p className="text-xs text-yellow-400 mt-2">
                  ⚠️ Requiere que haya cartas en el descarte
                </p>
              </div>
            )}

            {requiresPickFromDiscard && (
              <div className="mt-4 text-left">
                <p className="text-sm text-gray-200 mb-2">Seleccioná una carta del descarte (hasta 5 superiores):</p>

                {discardList.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                    {discardList.map((card, idx) => {
                  const cid = card?.carta_id ?? card?.id ?? `dt-${idx}`;
                  const cardImage = getCardImage?.(card?.nombre) ?? null;
                  const info = getCardInfo?.(card?.nombre) ?? {};
                  const isSelected = String(selectedDiscardId) === String(cid);

                  return (
                    <button
                      key={card?.carta_id ?? `discard-${idx}`}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedDiscardId((prev) => (String(prev) === String(cid) ? null : cid));
                      }}
                      aria-pressed={isSelected}
                      aria-label={card?.nombre}
                      // fondo transparente y sin sombras/outline para que solo se vea la carta
                      className={`flex flex-col items-center p-0 rounded transition-transform duration-150 bg-transparent hover:bg-transparent focus:bg-transparent focus:outline-none ring-0 shadow-none border-0 ${isSelected ? "scale-105" : "hover:scale-102"}`}
                      // si existe una regla CSS global que aún coloree <button>, forzá inline:
                     style={{ background: "transparent" }}
                    >
                      <div
                        className={`relative w-24 h-36 rounded-lg overflow-hidden border ${
                          isSelected ? "border-2 border-violet-600 ring-2 ring-violet-600/40" : "border-slate-500"
                        } bg-transparent`}
                      >
                        <img
                          src={cardImage}
                          alt={card?.nombre}
                          className="absolute inset-0 w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                        <span
                          className={`absolute top-1 right-1 text-[9px] px-1 py-0.5 rounded text-white font-semibold ${renderCardTypeBadge(info.type)}`}
                        >
                          {info.type?.toUpperCase?.() ?? "CARD"}
                        </span>
                     </div>
                    </button>
                  );
                })}
                  </div>
                ) : (
                  <div className="text-sm text-gray-400 py-2">No hay cartas en el descarte</div>
                )}
              </div>
            )}

            {/* Información específica para Another Victim */}
            {isAnotherVictim && (
              <div className="mt-3 p-3 bg-purple-900/30 rounded border border-purple-600">
                <p className="text-sm text-purple-200 font-medium">Efecto del evento:</p>
                <p className="text-xs text-purple-300 mt-1">
                  • Selecciona un set de otro jugador<br/>
                  • El set pasa a tu zona de juego<br/>
                  • Mantienes todas las bonificaciones del set<br/>
                  • Esta carta se descarta
                </p>
                <p className="text-xs text-yellow-400 mt-2">
                  ⚠️ Requiere que otros jugadores tengan sets
                </p>
              </div>
            )}

            {/* Información específica para Point Your Suspicious */}
            {cardInfo?.actionKey === "point-your-suspicious" && (
              <div className="mt-3 p-3 bg-emerald-900/30 rounded border border-emerald-600">
                <p className="text-sm text-emerald-200 font-medium">Efecto del evento:</p>
                <p className="text-xs text-emerald-300 mt-1">
                  • Se inicia una votación entre todos los jugadores<br/>
                  • Cada jugador elige públicamente quién considera sospechoso<br/>
                  • El más votado deberá revelar uno de sus secretos
                </p>
                <p className="text-xs text-amber-300 mt-2">
                  Confirmar descarta la carta y comienza inmediatamente la ronda de votación.
                </p>
              </div>
            )}

            {/* Información específica para Early Train to Paddington */}
            {String(eventCardData?.nombre ?? "").toLowerCase().includes("early") && 
             String(eventCardData?.nombre ?? "").toLowerCase().includes("train") && (
              <div className="mt-3 p-3 bg-purple-900/30 rounded border border-purple-600">
                <p className="text-sm text-purple-200 font-medium">Efecto del evento:</p>
                <p className="text-xs text-purple-300 mt-1">
                  • Mueve las 6 cartas del tope del mazo al descarte<br/>
                  • No requiere seleccionar objetivo<br/>
                  • Esta carta se descarta después de usarse
                </p>
                <p className="text-xs text-green-400 mt-2">
                  Efecto inmediato - no necesita confirmaciones adicionales
                </p>
              </div>
            )}

            {/* Selector de jugador objetivo para eventos normales (NO secretos) */}
            {requiresPlayerTarget && !requiresSecretId && (
              <div className="mt-4">
                <p className="text-sm text-gray-200 mb-2">Seleccioná un jugador objetivo:</p>
                <div className="flex flex-col max-h-44 overflow-y-auto space-y-2 mb-2 bg-gray-900/50 rounded p-3">
                  {players.map((p) => (
                    <label
                      key={String(p.id)}
                      className="cursor-pointer flex items-center space-x-3 px-3 py-2 rounded hover:bg-gray-700"
                    >
                      <input
                        type="radio"
                        name="event-target-player"
                        value={p.id}
                        checked={Number(selectedPlayerId) === Number(p.id)}
                        onChange={() => setSelectedPlayerId(p.id)}
                        className="form-radio"
                      />
                      <span className="font-medium">{p.nombre}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {isDeadCardFolly && (
              <div className="mt-4 bg-gray-900/50 rounded-lg p-4">
                <p className="text-sm text-gray-200 mb-3 font-semibold">
                  ¿Hacia qué lado se pasarán las cartas?
                </p>
                <div className="flex flex-wrap gap-3">
                  {[
                    { label: "Derecha", value: "derecha" },
                    { label: "Izquierda", value: "izquierda" },
                  ].map((option) => {
                    const isActive = deadCardFollyDirection === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setDeadCardFollyDirection(option.value)}
                        className={`btn btn-sm ${
                          isActive ? "btn-primary" : "btn-outline"
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  Esta elección solo la realiza quien juega Dead Card Folly.
                </p>
              </div>
            )}

            {/* UI específica para iniciar Card Trade: seleccionar carta propia a ofrecer */}
            {isCardTradeInitiator && (
              <div className="mt-4">
                {/* Selección del jugador objetivo para proponer intercambio */}
                <div className="mb-3">
                  <p className="text-sm text-gray-200 mb-2">Seleccioná a quién propones el intercambio:</p>
                  <div className="flex flex-col max-h-44 overflow-y-auto space-y-2 mb-2 bg-gray-900/50 rounded p-3">
                    {selectablePlayers.map((p) => (
                      <label key={String(p.id)} className="cursor-pointer flex items-center space-x-3 px-3 py-2 rounded hover:bg-gray-700">
                        <input
                          type="radio"
                          name="card-trade-target"
                          value={p.id}
                          checked={Number(selectedPlayerId) === Number(p.id)}
                          onChange={() => setSelectedPlayerId(p.id)}
                          className="form-radio"
                        />
                        <span className="font-medium">{p.nombre}</span>
                      </label>
                    ))}
                    {selectablePlayers.length === 0 && (
                      <div className="text-sm text-gray-400 py-2">No hay otros jugadores disponibles</div>
                    )}
                  </div>
                </div>

                <p className="text-sm text-gray-200 mb-2">Seleccioná la carta de tu mano que ofrecerás:</p>
                <div className="flex flex-col max-h-44 overflow-y-auto space-y-2 mb-2 bg-gray-900/50 rounded p-3">
                  {playerCardsForTrade.length > 0 ? (
                    playerCardsForTrade.map((c) => {
                      const cid = c?.carta_id ?? c?.id ?? c?.cartaId ?? String(c);
                      return (
                        <label key={String(cid)} className="cursor-pointer flex items-center space-x-3 px-3 py-2 rounded hover:bg-gray-700">
                          <input
                            type="radio"
                            name="card-trade-offer"
                            value={cid}
                            checked={String(selectedOfferedCardId) === String(cid)}
                            onChange={() => setSelectedOfferedCardId(cid)}
                            className="form-radio"
                          />
                          <span className="font-medium">{c?.nombre ?? `Carta ${cid}`}</span>
                        </label>
                      );
                    })
                  ) : (
                    <div className="text-sm text-gray-400 py-4">No se encontraron cartas en tu mano para ofrecer.</div>
                  )}
                </div>
              </div>
            )}

            {/*  Modal unificado para eventos que requieren secreto */}
            {requiresSecretId && (
              <div className="mt-4 space-y-4">
                {/* Sección 1: Selección de Secreto Revelado */}
                <div className="bg-gray-900/50 rounded-lg p-4">
                  <p className="text-sm text-gray-200 mb-3 font-semibold">
                   Seleccioná un secreto revelado para agregar:
                  </p>
                  <div className="text-left">
                    {Object.keys(publicSecretsByPlayer || {}).length > 0 ? (
                      <div className="space-y-3 max-h-64 overflow-y-auto">
                        {players.map((p) => {
                          const pid = String(p.id);
                          const secretsForPlayer = publicSecretsByPlayer[pid] || [];
                          if (secretsForPlayer.length === 0) return null;
                          return (
                            <div key={pid} className="p-3 rounded border border-gray-700 bg-gray-800/30">
                              <div className="text-sm font-medium text-gray-300 mb-2">
                                Secretos de {p.nombre}:
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {secretsForPlayer.map((s) => {
                                  const sid = s?.secreto_id ?? s?.id;
                                  const isSelected = String(selectedSecretId) === String(sid);
                                  return (
                                    <button
                                      key={String(sid)}
                                      type="button"
                                      className={`p-3 text-left rounded border transition-all ${
                                        isSelected
                                          ? "border-primary bg-primary/20 shadow-lg" 
                                          : "border-gray-600 bg-gray-800/50 hover:bg-gray-700/50"
                                      }`}
                                      onClick={() => setSelectedSecretId(sid)}
                                    >
                                      <div className="text-sm font-medium text-white">
                                        {s?.descripcion ?? `Secreto #${sid}`}
                                      </div>
                                      {isSelected && (
                                        <div className="text-xs text-primary mt-1">✓ Seleccionado</div>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-sm text-gray-400 py-4 text-center">
                        No hay secretos revelados disponibles
                      </div>
                    )}
                  </div>
                </div>

                {/* Sección 2: Selección de Jugador Objetivo (receptor del secreto) */}
                <div className="bg-gray-900/50 rounded-lg p-4">
                  <p className="text-sm text-gray-200 mb-3 font-semibold">
                   Seleccioná quién recibirá este secreto:
                  </p>
                  <div className="flex flex-col max-h-48 overflow-y-auto space-y-2">
                    {players.map((p) => {
                      const isCurrentUser = Number(p.id) === Number(currentUserId);
                      
                      return (
                        <label
                          key={String(p.id)}
                          className="cursor-pointer flex items-center space-x-3 px-3 py-2 rounded transition-colors hover:bg-gray-700"
                        >
                          <input
                            type="radio"
                            name="event-target-player-for-secret"
                            value={p.id}
                            checked={Number(selectedPlayerId) === Number(p.id)}
                            onChange={() => setSelectedPlayerId(p.id)}
                            className="form-radio"
                          />
                          <span className={`font-medium ${isCurrentUser ? "text-primary" : ""}`}>
                            {p.nombre} {isCurrentUser ? "(Tú)" : ""}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Selección de set objetivo para Another Victim */}
            {requiresSetTarget && (
              <div className="mt-4">
                <p className="text-sm text-gray-200 mb-2">Seleccioná un set para robar:</p>
                <div className="flex flex-col max-h-64 overflow-y-auto space-y-2 bg-gray-900/50 rounded p-3">
                  {selectableSets.map((set) => (
                    <label
                      key={String(set.id)}
                      className="cursor-pointer flex items-center space-x-3 px-3 py-2 rounded hover:bg-gray-700 border border-gray-600"
                    >
                      <input
                        type="radio"
                        name="event-target-set"
                        value={set.id}
                        checked={Number(selectedSetId) === Number(set.id)}
                        onChange={() => setSelectedSetId(set.id)}
                        className="form-radio"
                      />
                      <div className="flex-1 text-left">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-blue-300">{set.nombre}</span>
                          <span className="text-sm text-gray-400">
                            de {getSetOwnerName(set.owner_id)}
                          </span>
                        </div>
                        {set.cartas && Array.isArray(set.cartas) && (
                          <div className="text-xs text-gray-500 mt-1">
                            {set.cartas.length} carta{set.cartas.length !== 1 ? 's' : ''}: {
                              set.cartas.map(carta => carta.nombre).join(', ')
                            }
                          </div>
                        )}
                      </div>
                    </label>
                  ))}
                  {selectableSets.length === 0 && (
                    <div className="text-sm text-gray-400 py-2 text-center">
                      No hay sets disponibles para robar
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Botones de acción */}
        <div className="flex items-center justify-center space-x-4 mt-6">
          <button
            onClick={() => {
              if (isCardTradeInitiator) {
                const payload = {
                  action: 'initiate_card_trade',
                  cardId: eventCardData?.carta_id ?? eventCardData?.id ?? null,
                  cardName: eventCardData?.nombre ?? null,
                  targetPlayerId: selectedPlayerId ?? null,
                  offeredCardId: selectedOfferedCardId ?? null,
                };
                console.log("EventModal - Card Trade payload:", payload);
                onConfirm?.(payload);
                return;
              }

              const payload = {
                cardId: eventCardData?.carta_id ?? eventCardData?.id ?? null,
                cardName: eventCardData?.nombre ?? null,
                targetPlayerId: requiresSecretId 
                  ? selectedPlayerId 
                  : (requiresPlayerTarget ? selectedPlayerId : null),
                ...(requiresSecretId ? { secretTargetId: selectedSecretId ?? null } : {}),
                ...(requiresPickFromDiscard ? { selectedDiscardCardId: selectedDiscardId ?? null } : {}),
                targetSetId: requiresSetTarget ? selectedSetId : null,
                ...(isDeadCardFolly ? { direction: deadCardFollyDirection } : {}),
              };
              console.log("EventModal - Payload construido:", payload);
              console.log("  - requiresSecretId:", requiresSecretId);
              console.log("  - selectedPlayerId:", selectedPlayerId);
              console.log("  - selectedSecretId:", selectedSecretId);
              onConfirm?.(payload);
            }}
            className="btn btn-primary px-6"
            disabled={isConfirmDisabled || isCardTradeConfirmDisabled}
          >
            Confirmar
          </button>
          <button onClick={onCancel} className="btn btn-ghost px-6">
            Cancelar
          </button>
        </div>

      </div>
    </div>
  );
}
