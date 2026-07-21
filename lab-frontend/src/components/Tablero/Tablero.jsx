import { getCardImage, getCardInfo } from "../../utils/CardImageMapper";
import EventModal from "../EventModal/EventModal";
import mazoImage from "../../assets/01-card_back.png";
import ChooseSecretModal from "../ChooseSecretModal/ChooseSecretModal";
import PlayDetectiveModal from "../PlayDetectiveModal/PlayDetectiveModal";
import PointSuspiciousModal from "../PointSuspicionsModal/PointSuspicionsModal";
import DeadCardFollyModal from "../DeadCardFollyModal/DeadCardFollyModal";
import NotSoFastReactionModal from "../NotSoFastReactionModal/NotSoFastReactionModal";

// Importar imágenes de secretos
import secretMurderer from "../../assets/03-secret_murderer.png";
import secretBack from "../../assets/06-secret_back_ENJOY.png";

const renderCardTypeBadge = (type) => {
  switch (type) {
    case "detective":
      return "bg-blue-600";
    case "event":
      return "bg-green-600";
    case "devious":
      return "bg-red-600";
    case "instant":
      return "bg-yellow-600";
    default:
      return "bg-gray-600";
  }
};

export default function Tablero({
  gameData,
  currentUserId,
  gameState,
  secretsToShow,
  secretoEnModal,
  cerrarModalSecreto,
  showRevealSecretModal,
  handleRevealSecretAction,
  setShowRevealSecretModal,
  isWaitingForResponse,
  waitingMessage = null,
  secretsByPlayer = {},
  draftToShow,
  playerSets = [],
  allPlayersSets = [],
  selectedIds,
  toggleSelectCard,
  cancelSelection,
  discardSelected,
  playSelectedSet,
  handleDrawCard,
  handlePickDraftCard,
  handlePassTurn,
  fetchPlayerSecrets,
  allSecretsRaw,
  eliminarPartida,
  openDiscardModal,
  closeDiscardModal,
  showDiscardModal,
  openEventModal,
  showEventModal,
  closeEventModal,
  eventCardData, 
  statusMessage = null,
  announceEventInProgress = null,
  confirmPlayEvent,
  incomingEvent,
  clearIncomingEvent,
  playersInSocialDisgrace = new Set(),
  isCurrentPlayerInSocialDisgrace = false,
  deadCardFollyState = { status: "idle" },
  deadCardFollySelection = null,
  deadCardFollyLocked = false,
  onDeadCardFollySelect = () => {},
  onDeadCardFollyConfirm = () => {},
  onDeadCardFollyClose = () => {},
  canPlayDetective = false,
  onOpenPlayDetectiveModal = () => {},
  showPlayDetectiveModal = false,
  onClosePlayDetectiveModal = () => {},
  onConfirmPlayDetective = () => {},
  isSubmittingDetective = false,
  detectiveCards = [],
  presetDetectiveCardId = null,
  onCancelRevealSecretModal = () => {},
  pointSuspicionsState = { status: "idle", votes: {}, participantIds: [] },
  pointSuspicionsSelection = null,
  onPointSuspicionsSelect = () => {},
  onPointSuspicionsConfirm = () => {},
  pointSuspicionsHasVoted = false,
  pointSuspicionsPendingVoters = [],
  onPointSuspicionsClose = () => {},
  // Not So Fast reaction props (inmediato)
  reactionPrompt = null,
  onPlayNotSoFast = () => {},
  onSkipNotSoFast = () => {},
  isSubmittingNotSoFast = false,
  eventLog = [],
}) {
  //  Verificar que allSecretsRaw está llegando y cambiando

  const cardsInHand = Array.isArray(gameState.cards) ? gameState.cards.length : 0;
  const currentUserIdNum = Number(currentUserId);
  const currentTurnNum = Number(gameState.currentTurn);

  const currentTurnName = currentTurnNum
    ? gameState.players.find((player) => Number(player.id) === currentTurnNum)?.nombre ?? `Jugador ${currentTurnNum}`
    : "-";
    
  // Verificar si es el turno del usuario actual
  const isMyTurn = !Number.isNaN(currentUserIdNum) && currentTurnNum === currentUserIdNum;

  const formatEventTimestamp = (value) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const statusToneClasses = {
    actor: "bg-emerald-500/20 border-emerald-400/60 text-emerald-50",
    waiting: "bg-amber-500/20 border-amber-400/60 text-amber-100",
    neutral: "bg-slate-700/40 border-slate-600/60 text-slate-100",
  };

  let statusText = null;
  let statusTone = "neutral";
  let statusIcon = "i";

  if (statusMessage) {
    const actorIdNormalized =
      statusMessage.actorId != null ? Number(statusMessage.actorId) : NaN;
    const isActor =
      !Number.isNaN(actorIdNormalized) && actorIdNormalized === currentUserIdNum;
    const actorName =
      statusMessage.actorName ??
      (Number.isNaN(actorIdNormalized) ? "Otro jugador" : `Jugador ${actorIdNormalized}`);
    const cardLabel = statusMessage.cardName
      ? `“${statusMessage.cardName}”`
      : "la acción en curso";

    if (statusMessage.type === "event") {
statusTone = isActor ? "actor" : "waiting";
statusIcon = isActor ? ">>" : "..";
      statusText = isActor
        ? `Estás jugando ${cardLabel}. Completa la acción para continuar.`
        : `Esperando que ${actorName} resuelva ${cardLabel}.`;
    } else if (statusMessage.type === "turn") {
  statusTone = isActor ? "actor" : "waiting";
  statusIcon = isActor ? ">>" : "..";
      statusText = isActor
        ? "Es tu turno. Realiza tu acción."
        : `Esperando el movimiento de ${actorName}.`;
    } else if (statusMessage.fallback) {
      statusText = statusMessage.fallback;
    }
  }

  // Función para obtener la imagen correcta del secreto
  const getSecretImage = (secretDescription) => {
    if (!secretDescription) return secretBack;
    
    const description = secretDescription.trim().toLowerCase();
    const esAsesino = description === "soy el asesino" || 
                     description.includes("asesino") ||
                     description === "i'm the murderer" ||
                     description.includes("murderer");
    
    return esAsesino ? secretMurderer : secretBack;
  };

  // Calcular total real de secretos de un jugador
  const getPlayerTotalSecrets = (playerId) => {
    const pid = Number(playerId);
  
    
    // SIEMPRE usar allSecretsRaw como fuente de verdad para TODOS
    // Esto garantiza que todos los jugadores vean lo mismo
    if (allSecretsRaw?.secretos) {
      const playerSecretsById = allSecretsRaw.secretos[pid];
      const playerSecretsByString = allSecretsRaw.secretos[String(pid)];
      const playerSecretsByOriginal = allSecretsRaw.secretos[playerId];

      const playerSecrets = playerSecretsById ?? playerSecretsByString ?? playerSecretsByOriginal;
      
      if (Array.isArray(playerSecrets)) {
        return playerSecrets.length;
      }
    }
    
    // Fallback: Si no hay allSecretsRaw, usar gameState.secrets solo para el jugador actual
    // Esto solo debería pasar durante la carga inicial
    if (pid === currentUserIdNum && Array.isArray(gameState.secrets)) {
      const total = gameState.secrets.length;
      return total;
    }
    
    // Último fallback: usar player.secretsCount o default 3
    const player = gameState.players.find(p => Number(p.id) === pid);
    const fallbackTotal = player?.secretsCount ?? player?.secrets_count ?? 3;
    
    return fallbackTotal;
  };

  // ensure the single selected id is a Number to avoid string/number mismatches
  const onlySelectedId = selectedIds.size === 1 ? Number(selectedIds.values().next().value) : null;
  const selectedCard = (onlySelectedId !== null) && Array.isArray(gameState.cards)
    ? gameState.cards.find((c) => Number(c.carta_id) === onlySelectedId)
    : null;

  const selectedIsEvent = Boolean(
    selectedCard && getCardInfo(selectedCard.nombre)?.type === "event"
  );
  const selectedIsDetective = Boolean(
    selectedCard && getCardInfo(selectedCard.nombre)?.type === "detective"
  );

  // Detectar si el jugador tiene una carta "Not So Fast" en la mano
  const hasNotSoFastCard = Array.isArray(gameState.cards)
    ? gameState.cards.some((c) => {
        const name = String(c?.nombre ?? c?.name ?? "").toLowerCase();
        return name.includes("not so fast") || name.includes("notsofast") || name.includes("not_so_fast");
      })
    : false;
  const hasDiscardCards = Array.isArray(gameState.descarte) && gameState.descarte.length > 0;
  const discardTopFive = Array.isArray(gameState.descarte)
    ? gameState.descarte.slice(-5).reverse()
    : [];
  const topDiscardCard = hasDiscardCards ? gameState.descarte[gameState.descarte.length - 1] : null;

  const handleDiscardAreaClick = () => {
    if (!hasDiscardCards || typeof openDiscardModal !== "function") return;
    openDiscardModal();
  };
  const handleDiscardAreaKeyDown = (event) => {
    if (!hasDiscardCards || typeof openDiscardModal !== "function") return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openDiscardModal();
    }
  };

  return (
    <div className="w-screen min-h-screen flex flex-col bg-gray-900 text-white p-4 overflow-hidden relative">
      {isWaitingForResponse && (
        <div className="fixed inset-0 bg-black/60 flex flex-col items-center justify-center z-50 backdrop-blur-sm">
          <div className="loading loading-spinner loading-lg text-primary mb-4"></div>
          <p className="text-white text-xl font-semibold">{typeof waitingMessage === 'string' && waitingMessage.length > 0 ? waitingMessage : 'Esperando acción del oponente...'}</p>
        </div>
      )}
      <DeadCardFollyModal
        isOpen={Boolean(deadCardFollyState && deadCardFollyState.status && deadCardFollyState.status !== "idle")}
        state={deadCardFollyState}
        cards={gameState.cards}
        players={gameState.players}
        currentUserId={currentUserId}
        selectedCardId={deadCardFollySelection}
        locked={deadCardFollyLocked}
        onSelect={(value) => onDeadCardFollySelect(value)}
        onConfirm={onDeadCardFollyConfirm}
        onClear={() => onDeadCardFollySelect(null)}
        onClose={onDeadCardFollyClose}
      />
      {/* Modal de reacción inmediata "Not So Fast" */}
      <NotSoFastReactionModal
        reaction={reactionPrompt}
        hasNotSoFastCard={hasNotSoFastCard}
        isSubmitting={isSubmittingNotSoFast}
        onPlay={() => onPlayNotSoFast && onPlayNotSoFast()}
        onSkip={() => onSkipNotSoFast && onSkipNotSoFast()}
      />
      <PlayDetectiveModal
        isOpen={Boolean(showPlayDetectiveModal)}
        cards={detectiveCards}
        mySets={playerSets}
        allSets={allPlayersSets}
        currentUserId={currentUserId}
        onClose={onClosePlayDetectiveModal}
        onConfirm={onConfirmPlayDetective}
        isSubmitting={isSubmittingDetective}
        initialCardId={presetDetectiveCardId}
      />
      <PointSuspiciousModal
        isOpen={
          Boolean(
            pointSuspicionsState &&
              pointSuspicionsState.status &&
              pointSuspicionsState.status !== "idle",
          )
        }
        state={pointSuspicionsState}
        players={gameState.players}
        currentUserId={currentUserId}
        selection={pointSuspicionsSelection}
        onSelect={onPointSuspicionsSelect}
        onConfirmVote={onPointSuspicionsConfirm}
        hasVoted={Boolean(pointSuspicionsHasVoted)}
        pendingVoters={pointSuspicionsPendingVoters}
        onClose={onPointSuspicionsClose}
      />
      {secretoEnModal && (
        (() => {
          const context = secretoEnModal?.context ?? {};
          const contextType = context?.type ?? null;
          const contextRole = context?.role ?? "target";
          const pasadorName = context?.pasadorName ?? null;
          const receptorName = context?.receptorName ?? null;
          const blackmailedContextTypes = new Set(["card_trade_blackmailed", "dead_card_folly_blackmailed"]);
          const isBlackmailed = blackmailedContextTypes.has(contextType);
          const isDeadCardFollyBlackmailed = contextType === "dead_card_folly_blackmailed";
          let secretModalTitle = "¡Secreto Revelado!";
          let secretModalMessage = null;

          if (isBlackmailed) {
            secretModalTitle =
              contextRole === "viewer" ? "Secreto recibido en privado" : "Compartí este secreto en privado";
            secretModalMessage =
              contextRole === "viewer"
                ? isDeadCardFollyBlackmailed
                  ? `Dead Card Folly: ${receptorName ?? "tu oponente"} decidió mostrarte este secreto en privado. Guardalo en secreto.`
                  : `Este es el secreto que ${receptorName ?? "tu oponente"} decidió mostrarte. Guardalo en secreto.`
                : isDeadCardFollyBlackmailed
                ? `Dead Card Folly te obliga a compartir este secreto únicamente con ${pasadorName ?? "tu oponente"}. No lo muestres al resto.`
                : `Mostrale este secreto únicamente a ${pasadorName ?? "tu oponente"}. No lo compartas con el resto de la mesa.`;
          }
          return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-gray-800 rounded-lg p-8 max-w-lg text-center shadow-2xl ring-2 ring-amber-400">
            <h2 className="text-3xl font-bold mb-4 text-amber-300">{secretModalTitle}</h2>
            {secretModalMessage && (
              <p className="text-sm text-amber-100 mb-4">{secretModalMessage}</p>
            )}
            
            <div className="my-6 flex flex-col items-center gap-4">
              {/* Imagen del secreto */}
              <div className="w-32 h-48 flex-shrink-0">
                <img 
                  src={getSecretImage(secretoEnModal.descripcion)}
                  alt={secretoEnModal.descripcion}
                  className="w-full h-full object-cover rounded-lg shadow-lg"
                />
              </div>
              
              {/* Descripción del secreto */}
              <div className="p-4 bg-black/30 rounded-md">
                <p className="text-xl font-semibold text-white">{secretoEnModal.descripcion}</p>
              </div>
            </div>
            
            <button onClick={cerrarModalSecreto} className="btn btn-primary px-8">
              Continuar
            </button>
          </div>
        </div>
          );
        })()
      )}

      
      {(showEventModal && eventCardData) || incomingEvent ? (
        <EventModal
          eventCardData={showEventModal ? eventCardData : null}
          requiresTarget={eventCardData?.requiresTarget}
          players={gameState?.players ?? []}
          playersSets={allPlayersSets ?? []}
          currentUserId={currentUserId}
          onConfirm={(payload) => {
            confirmPlayEvent?.(payload);
          }}
          onCancel={() => {
            // Indicar que el modal fue cancelado para que el contenedor pueda
            // actualizar el mensaje de estado de "evento" a "turn" para
            // los demás jugadores (por ejemplo: "Esperando el movimiento de X").
            try {
              closeEventModal?.({ cancelled: true, cardName: eventCardData?.nombre ?? null });
            } catch (e) {
              // fallback: llamar sin opciones si la función no acepta objeto
              closeEventModal?.();
            }
          }}
          incomingEvent={incomingEvent}
          onCloseIncoming={() => clearIncomingEvent?.()}
          secretsToShow={secretsToShow}
          secretsByPlayer={secretsByPlayer}
          allowSelfTarget={eventCardData?.allowSelfTarget}
          discardTopFive={discardTopFive}
          fetchPlayerSecrets={fetchPlayerSecrets}
        />) : null }
      
      {showDiscardModal && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
          onClick={() => {
            if (typeof closeDiscardModal === "function") closeDiscardModal();
          }}
        >
          <div
            className="bg-gray-800 rounded-lg p-6 w-full max-w-3xl mx-4 shadow-xl ring-1 ring-white/10"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Ultimas cartas del descarte</h3>
              <button
                type="button"
                className="btn btn-sm btn-circle btn-ghost"
                onClick={() => {
                  if (typeof closeDiscardModal === "function") closeDiscardModal();
                }}
                aria-label="Cerrar modal del descarte"
              >
                ✕
              </button>
            </div>
            {discardTopFive.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
                {discardTopFive.map((card, index) => {
                  const cardImage = getCardImage(card.nombre);
                  const info = getCardInfo(card.nombre);
                  return (
                    <div key={card?.carta_id ?? `discard-${index}`} className="flex flex-col items-center space-y-2">
                      <div className="relative w-24 h-36 rounded-lg overflow-hidden border border-slate-500 bg-slate-900/80">
                        <img
                          src={cardImage}
                          alt={card.nombre}
                          className="absolute inset-0 w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                            if (e.currentTarget.nextSibling) e.currentTarget.nextSibling.style.display = "flex";
                          }}
                        />
                        <div className="absolute inset-0 hidden flex-col items-center justify-center bg-gradient-to-br from-red-700/80 to-red-900/90 text-center px-2">
                          <span className="text-white text-xs font-semibold leading-tight">
                            {card.nombre.split(" ").slice(0, 2).join(" ")}
                          </span>
                        </div>
                        <span
                          className={`absolute top-1 right-1 text-[9px] px-1 py-0.5 rounded text-white font-semibold ${renderCardTypeBadge(info.type)}`}
                        >
                          {info.type?.toUpperCase?.() ?? "CARD"}
                        </span>
                        <span className="absolute bottom-1 left-1 text-[9px] font-semibold text-white/80">
                          #{index + 1}
                        </span>
                      </div>
                      <span className="text-xs text-center text-slate-200 leading-tight">{card.nombre}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-center text-slate-300 py-6">No hay cartas en el descarte.</p>
            )}
          </div>
        </div>
      )}
      {showRevealSecretModal && (
        <ChooseSecretModal
          mode={showRevealSecretModal.mode}
          setName={showRevealSecretModal.setName}
          customMessage={showRevealSecretModal.customMessage}
          players={gameState.players}
          secrets={gameState.secrets}
          fetchPlayerSecrets={fetchPlayerSecrets}  // <-- reenviamos la función del container
          allSecretsRaw={allSecretsRaw}   
          onConfirm={handleRevealSecretAction}
          onCancel={() => {
            if (typeof onCancelRevealSecretModal === "function") {
              onCancelRevealSecretModal();
            } else {
              setShowRevealSecretModal(null);
            }
          }}
          currentUserId={currentUserId}
          secretsByPlayer={secretsByPlayer}  // <-- Agregar información de secretos revelados
          playersInSocialDisgrace={playersInSocialDisgrace}  // <-- Filtrar jugadores en desgracia social
          forcedPlayerId={showRevealSecretModal?.forcedPlayerId ?? null}
        />
      )}
      {gameState.gamePhase === "ended" && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 max-w-md text-center shadow-xl ring-1 ring-white/10">
            {/* Modal específico para fin por Desgracia Social */}
            {gameState.endedReason === "desgracia_social" ? (
              <>
                <h2 className="text-2xl font-bold mb-2">Fin de la partida.</h2>
                {Number(currentUserId) === Number(gameState.winnerId) ? (
                  <p className="text-gray-300 mb-6">Los detectives han caido en desgracia social. Ganaste la partida</p>
                ) : (
                  <>
                    <p className="text-gray-300 mb-2">Todos los detectives han caído en desgracia social.</p>
                    <p className="text-gray-300 mb-6 font-semibold">El Asesino gana.</p>
                  </>
                )}
              </>
            ) : (
              <>
                <h2 className="text-2xl font-bold mb-2">Partida finalizada</h2>
                <p className="text-gray-300 mb-6">
                  {gameState.endedReason === "mazo_agotado"
                    ? "La partida termino porque el mazo se quedo sin cartas. Ganó el asesino."
                    : "La partida termino. Vuelve al inicio para buscar otra mesa."}
                  {gameState.endedReason === "asesino_revelado"
                    ? "La partida termino porque se descubrió al asesino. "
                    : "La partida termino. Vuelve al inicio para buscar otra mesa. "}
                </p>

                {gameState.winnerName ? (
                  <p className="py-2 font-semibold text-lg"> Ganador/es: {gameState.winnerName}</p>
                ) : gameState.winnerId ? (
                  <p className="py-2 font-semibold text-lg">Asesino (id): {String(gameState.winnerId)}</p>
                ) : null}
              </>
            )}

            <button onClick={eliminarPartida} className="btn btn-primary px-6">
              Volver al inicio
            </button>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center mb-4">
        <div className="text-white">
          <h2 className="text-2xl font-bold">Agatha Christie's Death on the Cards</h2>
          <p className="text-green-200">Partida: {gameData?.nombre || "Sin nombre"}</p>
        </div>
      </div>

      {statusText && (
        <div
          className={`mb-4 px-4 py-3 rounded-lg border flex items-start gap-3 shadow-md ${
            statusToneClasses[statusTone] ?? statusToneClasses.neutral
          }`}
        >
          <span className="text-xl leading-none">{statusIcon}</span>
          <span className="text-sm sm:text-base font-medium">{statusText}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 flex-1 min-h-0 overflow-hidden">
        <div className="lg:col-span-1 space-y-4">
          <section>
            <h3 className="text-white font-semibold mb-2">Jugadores</h3>
            {gameState.players.map((player) => {
            const isInSocialDisgrace = playersInSocialDisgrace.has(Number(player.id));
            
            const totalSecrets = getPlayerTotalSecrets(player.id);

            return (
            <div
              key={player.id}
              className={`card bg-base-100 p-3 relative ${player.id === currentUserId ? "ring-2 ring-primary" : ""} ${
                isInSocialDisgrace ? "ring-2 ring-red-500 bg-red-900/20" : ""
              }`}
            >
              {/* Indicador visual de desgracia social */}
              {isInSocialDisgrace && (
                <div className="absolute top-1 right-1 z-10">
                  <div 
                    className="bg-red-600 text-white px-2 py-1 text-xs rounded-full shadow-lg border border-red-400"
                    title="En desgracia social"
                  >
                  </div>
                </div>
              )}
              
              <div className="flex items-center space-x-2">
                <div className={`avatar placeholder ${isInSocialDisgrace ? "opacity-60" : ""}`}>
                  <div className={`text-neutral-content rounded-full w-8 ${
                    isInSocialDisgrace ? "bg-red-600" : "bg-neutral-focus"
                  }`}>
                    <span className="text-xs">{player.nombre[0].toUpperCase()}</span>
                  </div>
                </div>
                 <div className="flex-grow">
                  <div className="flex items-center gap-2">
                    <p className={`font-semibold text-sm ${isInSocialDisgrace ? "text-red-300" : ""}`}>
                      {player.nombre}
                    </p>
                    {player.id === currentUserId && <span className="text-xs text-primary">Tu</span>}
                    {isInSocialDisgrace && (
                      <span className="text-xs text-red-400 font-medium">Desgracia Social</span>
                    )}
                  </div>
                  {/* Indicador de secretos */}
                  <div 
                    className={`mt-1 px-2 py-1 rounded-full inline-flex items-center gap-2 border ${
                      isInSocialDisgrace 
                        ? "bg-red-900/30 border-red-400/30" 
                        : "bg-black/20 border-white/10"
                    }`}
                    title={`Secretos: ${player.secretsRevealed ?? 0} de ${totalSecrets} revelados`}
                  >
                    {Array.from({ length: totalSecrets }).map((_, index) => (
                      <span
                        key={index}
                        className="text-lg"
                        title={index < (player.secretsRevealed ?? 0) ? 'Secreto Revelado' : 'Secreto Oculto'}
                      >
                        {index < (player.secretsRevealed ?? 0) ? '👀' : '❓'}
                      </span>
                    ))}
                    {/* Visible counter so tests can assert like '1/3' - Usa totalSecrets de allSecretsRaw */}
                    <span className="ml-2 text-sm text-slate-200" aria-label="secret-counter">{`${player.secretsRevealed ?? 0}/${totalSecrets}`}</span>
                  </div>
                </div>
              </div>
            </div>
            );
          })}
          </section>

        <section className="bg-gray-900/60 border border-gray-800 rounded-xl p-4 flex flex-col h-64 max-h-72">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white font-semibold">Eventos de partida</h3>
            <span className="text-[10px] uppercase tracking-wide text-emerald-300">Live</span>
          </div>
          <div className="flex-1 overflow-y-auto space-y-3 pr-1" aria-live="polite">
              {eventLog.length === 0 ? (
                <p className="text-sm text-gray-400">Aún no hay acciones registradas.</p>
              ) : (
                eventLog.map((entry) => (
                  <div
                    key={entry.id ?? entry.timestamp}
                    className="pb-2 border-b border-gray-800 last:border-none last:pb-0"
                  >
                    <p className="text-sm text-gray-100 leading-snug">{entry.message}</p>
                    <span className="text-xs text-gray-500">
                      {formatEventTimestamp(entry.timestamp)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        <div className="lg:col-span-3 flex flex-col min-h-0">
          <div className="flex-1 min-h-0 bg-green-700/30 rounded-lg border-2 border-green-600 p-6 mb-4">
            <div className="text-center text-white">
              <h2 className="text-xl mb-4">Mesa de juego</h2>
              <p className="text-sm mb-2">Turno actual: {currentTurnName}</p>

              {currentTurnNum === currentUserIdNum && !Number.isNaN(currentUserIdNum) && (
                <button 
                  className={`btn mb-4 ${isCurrentPlayerInSocialDisgrace ? "btn-error" : "btn-warning"}`} 
                  onClick={handlePassTurn}
                >
                  {isCurrentPlayerInSocialDisgrace ? "Finalizar turno (Desgracia Social)" : "Pasar turno"}
                </button>
              )}

              {gameState.gamePhase === "starting" && (
                <div className="flex flex-col items-center space-y-4">
                  <div className="loading loading-spinner loading-lg text-primary" />
                  <p>Iniciando partida...</p>
                </div>
              )}

              {gameState.gamePhase === "playing" && (
                <div className="text-center">
                  <p className="mb-4">El juego esta en marcha</p>

                  <div className="grid grid-cols-3 gap-8 max-w-4xl mx-auto">
                    <div className="flex flex-col items-center">
                      <div
                        className="relative cursor-pointer transition-all duration-200 hover:scale-105"
                        onClick={handleDrawCard}
                        title="Robar carta del mazo"
                      >
                        <img
                          src={mazoImage}
                          alt="Mazo de cartas"
                          className="w-32 h-48 object-cover rounded-xl border-3 border-slate-300 shadow-xl hover:border-blue-400 hover:shadow-blue-400/50"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                            if (e.currentTarget.nextSibling) e.currentTarget.nextSibling.style.display = "flex";
                          }}
                        />

                        <div className="w-32 h-48 bg-gradient-to-br from-blue-800 to-blue-900 rounded-xl border-3 border-slate-300 shadow-xl hidden flex-col items-center justify-center hover:border-blue-400">
                          <span className="text-white text-sm font-bold">MAZO</span>
                        </div>
                      </div>

                      <span className="text-white text-lg mt-3 font-semibold">Mazo</span>
                    </div>

                    <div className="flex flex-col items-center">
                      <div className="flex space-x-4">
                        {draftToShow.map((card, index) => {
                          if (card) {
                            const draftImage = getCardImage(card.nombre);
                            const info = getCardInfo(card.nombre);
                            return (
                              <div
                                key={card.carta_id ?? `draft-${index}`}
                                className="relative group w-24 h-36 cursor-pointer rounded-lg border-2 border-amber-400 shadow-lg overflow-hidden bg-slate-900/70 flex items-center justify-center transition-transform duration-200 hover:-translate-y-1"
                                title={card.nombre}
                                role="button"
                                tabIndex={0}
                                onClick={() => handlePickDraftCard?.(card.carta_id, card)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    handlePickDraftCard?.(card.carta_id, card);
                                  }
                                }}
                              >
                                <img
                                  src={draftImage}
                                  alt={card.nombre}
                                  className="absolute inset-0 w-full h-full object-cover"
                                  onError={(e) => {
                                    e.currentTarget.style.display = "none";
                                    if (e.currentTarget.nextSibling) e.currentTarget.nextSibling.style.display = "flex";
                                  }}
                                />
                                <div className="absolute inset-0 hidden flex-col items-center justify-center bg-gradient-to-br from-amber-500/70 to-amber-700/80 text-center px-2 opacity-0 transition-opacity duration-200 group-hover:flex group-hover:opacity-100 group-focus-within:flex group-focus-within:opacity-100">
                                  <span className="text-white text-xs font-semibold leading-tight">
                                    {card.nombre.split(" ").slice(0, 2).join(" ")}
                                  </span>
                                </div>
                                <span
                                  className={`absolute bottom-1 left-1 text-[10px] px-1 py-0.5 rounded text-white font-semibold ${renderCardTypeBadge(info.type)}`}
                                >
                                  {info.type?.toUpperCase?.() ?? "CARD"}
                                </span>
                                <span className="absolute top-1 right-1 text-xs bg-black/60 px-1 rounded text-amber-200 font-medium">
                                  #{index + 1}
                                </span>
                              </div>
                            );
                          }

                          return (
                            <div
                              key={`draft-placeholder-${index}`}
                              className="w-24 h-36 rounded-lg border-2 border-dashed border-slate-600 bg-slate-800/60 flex flex-col items-center justify-center text-slate-500 text-xs font-semibold"
                              title="Espacio de draft disponible"
                            >
                              DRAFT {index + 1}
                            </div>
                          );
                        })}
                      </div>
                      <span className="text-white text-lg mt-3 font-semibold">Draft</span>
                    </div>

                    <div className="flex flex-col items-center">
                      <div
                        className={`relative ${hasDiscardCards ? "cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 rounded-xl" : ""}`}
                        {...(hasDiscardCards
                          ? {
                              role: "button",
                              tabIndex: 0,
                              onClick: handleDiscardAreaClick,
                              onKeyDown: handleDiscardAreaKeyDown,
                              "aria-label": "Ver descarte",
                            }
                          : {})}
                      >
                        {hasDiscardCards ? (
                          <div className="w-32 h-48 relative">
                            {topDiscardCard && (
                              <img
                                src={getCardImage(topDiscardCard.nombre)}
                                alt={topDiscardCard.nombre}
                                className="w-32 h-48 object-cover rounded-xl border-3 border-slate-300 shadow-xl"
                                title={`Ultima carta descartada: ${topDiscardCard.nombre}`}
                                onError={(e) => {
                                  e.currentTarget.style.display = "none";
                                  if (e.currentTarget.nextSibling) e.currentTarget.nextSibling.style.display = "flex";
                                }}
                              />
                            )}

                            <div className="w-32 h-48 bg-gradient-to-br from-red-800 to-red-900 rounded-xl border-3 border-slate-300 shadow-xl hidden flex-col items-center justify-center">
                              <span className="text-white text-sm font-bold">DESCARTE</span>
                            </div>

                            {gameState.descarte.length > 1 && (
                              <div className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">
                                {gameState.descarte.length}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="w-28 h-40 bg-slate-600 rounded-xl border-3 border-dashed border-slate-400 flex flex-col items-center justify-center shadow-xl">
                            <span className="text-slate-300 text-sm font-semibold">DESCARTE</span>
                          </div>
                        )}
                      </div>

                      <span className="text-white text-lg mt-3 font-semibold">
                        Descarte
                        {Array.isArray(gameState.descarte) && gameState.descarte.length > 0
                          ? ` (${gameState.descarte.length})`
                          : ""}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="bg-base-100 rounded-lg p-4 max-h-[45vh] overflow-y-auto min-h-[20vh]">
            {Array.isArray(gameState.cards) && gameState.cards.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                <p>No tienes cartas aun...</p>
              </div>
            ) : (
              <>
                <div className="text-sm text-white mb-3">Cartas en mano: {cardsInHand}/6</div>

                {/* Mensaje especial para jugadores en desgracia social */}
                {isCurrentPlayerInSocialDisgrace && currentTurnNum === currentUserIdNum && (
                  <div className="bg-red-900/40 border border-red-500 rounded-lg p-4 mb-4">
                    <p className="text-red-200 text-sm">
                      Estás en desgracia social. Solo puedes descartar y robar cartas en tu turno.
                    </p>
                  </div>
                )}

                {selectedIds.size === 1 && selectedIsDetective && (
                  <div className="flex justify-end mb-3">
                    <button
                      className={`btn ${canPlayDetective ? "btn-accent" : "btn-disabled"}`}
                      onClick={() => {
                        if (
                          canPlayDetective &&
                          typeof onOpenPlayDetectiveModal === "function"
                        ) {
                          onOpenPlayDetectiveModal(onlySelectedId);
                        }
                      }}
                      disabled={!canPlayDetective}
                      title={
                        canPlayDetective
                          ? "Agrega este detective a uno de tus sets"
                          : "Necesitas un set compatible disponible"
                      }
                    >
                      Jugar detective
                    </button>
                  </div>
                )}

                {selectedIds.size > 0 && (
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-sm text-white">Seleccionadas: {selectedIds.size}</div>
                    <div className="space-x-3">
                      <button className="btn btn-error" onClick={cancelSelection}>
                        Cancelar
                      </button>
                      
                      {/* Mostrar solo opciones permitidas según el estado de desgracia social */}
                      {isCurrentPlayerInSocialDisgrace ? (
                        // UI simplificada para desgracia social: solo descartar
                        <button className="btn btn-primary" onClick={discardSelected}>
                          Descartar ({selectedIds.size})
                        </button>
                      ) : (
                        // UI completa para jugadores normales
                        <>
                          <button 
                            className={`btn ${isMyTurn ? 'btn-secondary' : 'btn-disabled'}`}
                            onClick={playSelectedSet}
                            disabled={!isMyTurn}
                            title={!isMyTurn ? "No es tu turno" : ""}
                          >
                            Bajar Set ({selectedIds.size})
                          </button>
                          <button 
                            className={`btn ${isMyTurn ? 'btn-primary' : 'btn-disabled'}`}
                            onClick={discardSelected}
                            disabled={!isMyTurn}
                            title={!isMyTurn ? "No es tu turno" : ""}
                          >
                            Descartar ({selectedIds.size})
                          </button>
                          {selectedIds.size == 1 && selectedIsEvent && (
                              <button
                                className={`btn ${isMyTurn ? 'btn-error' : 'btn-disabled'}`}
                                onClick={async () => {
                                  if (!isMyTurn || isCurrentPlayerInSocialDisgrace) return;
                                  if (typeof announceEventInProgress === "function") {
                                    try {
                                      await announceEventInProgress(onlySelectedId, selectedCard?.nombre);
                                    } catch (error) {
                                      console.error("No se pudo anunciar evento en curso:", error);
                                    }
                                  }
                                  if (typeof openEventModal === "function") {
                                    openEventModal(onlySelectedId, selectedCard?.nombre);
                                  }
                                }}
                                disabled={!isMyTurn || isCurrentPlayerInSocialDisgrace}
                                aria-label={`Jugar evento ${selectedCard?.nombre ?? ''}`}
                                title={!isMyTurn ? "No es tu turno" : isCurrentPlayerInSocialDisgrace ? "No puedes jugar eventos en desgracia social" : ""}
                              >
                                Jugar evento ({selectedCard?.nombre ?? 'Carta seleccionada'})
                              </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}

                

                <div className="flex space-x-3 overflow-x-auto overflow-y-visible pb-2">
                  {gameState.cards.map((card, index) => {
                    const cardImage = getCardImage(card.nombre);
                    const info = getCardInfo(card.nombre);
                    const isSelected = selectedIds.has(card.carta_id);

                    return (
                      <div
                        key={card.carta_id || index}
                        className={`relative group cursor-pointer flex-shrink-0 transform transition-all duration-200 origin-bottom ${
                          isSelected ? "scale-105 ring-4 ring-purple-500/60 z-10" : "hover:scale-110 hover:-translate-y-2"
                        }`}
                        onClick={() => toggleSelectCard(card.carta_id)}
                        title={`${card.nombre} ${isSelected ? "(Seleccionada)" : ""}`}
                      >
                        <span className="sr-only">{card.nombre}</span>
                        <img
                          src={cardImage}
                          alt={card.nombre}
                          className={`w-28 h-44 object-cover rounded-lg border-2 ${
                            isSelected ? "border-purple-500" : "border-gray-300"
                          } shadow-lg`}
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                            if (e.currentTarget.nextSibling) e.currentTarget.nextSibling.style.display = "flex";
                          }}
                        />

                        <div
                          className={`w-28 h-44 bg-gradient-to-br from-blue-500 to-blue-700 rounded-lg border-2 ${
                            isSelected ? "border-purple-500" : "border-gray-300"
                          } shadow-lg hidden flex-col items-center justify-center p-2`}
                          aria-hidden="true"
                        >
                          <span className="text-white text-xs font-semibold text-center leading-tight">
                            {card.nombre.split(" ").slice(0, 2).join(" ")}
                          </span>
                          <div
                            className={`w-2 h-2 rounded-full mt-1 ${
                              info.type === "detective"
                                ? "bg-blue-300"
                                : info.type === "event"
                                ? "bg-green-300"
                                : info.type === "devious"
                                ? "bg-red-300"
                                : info.type === "instant"
                                ? "bg-yellow-300"
                                : "bg-gray-300"
                            }`}
                          />
                        </div>

                        <div
                          className="pointer-events-none absolute inset-0 rounded-lg bg-black/70 backdrop-blur-sm opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100 flex flex-col items-center justify-center px-2 text-center"
                          aria-hidden="true"
                        >
                          <span className="text-white text-sm font-semibold leading-tight">{card.nombre}</span>
                          <span className="text-white/80 text-xs mt-1">{info.type?.toUpperCase?.() ?? ""}</span>
                        </div>

                        <div
                          className={`absolute bottom-1 left-1 z-20 text-xs px-1 py-0.5 rounded text-white font-semibold ${renderCardTypeBadge(
                            info.type,
                          )}`}
                        >
                          {info.type.toUpperCase()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Mis Sets - Esquina inferior izquierda */}
      <div className="absolute bottom-4 left-4">
        <div className="bg-gray-800/90 border border-white/10 rounded-lg shadow-xl backdrop-blur px-4 py-3 w-[20rem] max-h-[40vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-200">Mis Sets</h4>
            <span className="text-xs text-slate-400">
              {Array.isArray(playerSets) ? playerSets.length : 0}
            </span>
          </div>
          
          {Array.isArray(playerSets) && playerSets.length > 0 ? (
            <div className="space-y-3">
              {playerSets.map((set, setIndex) => (
                <div
                  key={set?.set_id ?? `set-${setIndex}`}
                  className="bg-slate-700/60 border border-slate-600 rounded-lg p-3"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h5 className="text-xs font-semibold text-blue-300">{set.nombre}</h5>
                    <span className="text-[10px] text-slate-400">
                      {Array.isArray(set.cartas) ? `${set.cartas.length} cartas` : '0 cartas'}
                    </span>
                  </div>
                  
                  {/* Mostrar las cartas del set */}
                  {Array.isArray(set.cartas) && set.cartas.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {set.cartas.map((carta, cardIndex) => {
                        const cardImage = getCardImage(carta.nombre);
                        const info = getCardInfo(carta.nombre);
                        
                        return (
                          <div
                            key={carta?.carta_id ?? `card-${cardIndex}`}
                            className="relative group w-12 h-16 rounded border border-slate-500 overflow-hidden bg-slate-900/70 flex items-center justify-center transition-transform duration-200 hover:scale-110"
                            title={carta.nombre}
                          >
                            <img
                              src={cardImage}
                              alt={carta.nombre}
                              className="absolute inset-0 w-full h-full object-cover"
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                                if (e.currentTarget.nextSibling) e.currentTarget.nextSibling.style.display = "flex";
                              }}
                            />
                            <div className="absolute inset-0 hidden flex-col items-center justify-center bg-gradient-to-br from-blue-500/80 to-blue-700/90 text-center px-1">
                              <span className="text-white text-[8px] font-semibold leading-tight">
                                {carta.nombre.split(" ").slice(0, 1).join(" ")}
                              </span>
                            </div>
                            <span
                              className={`absolute bottom-0 left-0 text-[6px] px-0.5 py-0.5 rounded-tr text-white font-semibold ${renderCardTypeBadge(info.type)}`}
                            >
                              {info.type?.charAt(0)?.toUpperCase() || 'C'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-slate-500 py-6">
              <p className="text-xs">No has bajado sets aún</p>
            </div>
          )}
        </div>
      </div>

      <div className="absolute bottom-4 right-4">
        <div className="bg-gray-800/90 border border-white/10 rounded-lg shadow-xl backdrop-blur px-4 py-3 w-auto max-w-[90vw]">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-200">Secretos</h4>
            <span className="text-xs text-slate-400">
              {(() => {
                // Usar gameState.secrets (ya normalizados con revelado correcto)
                const mySecrets = Array.isArray(gameState.secrets) ? gameState.secrets : [];
                const total = mySecrets.length;
                const revealed = mySecrets.filter(s => s.revelado || s.revealed).length;
                return `${revealed}/${total}`;
              })()}
            </span>
          </div>
          {/* Contenedor que se ajusta al contenido */}
          <div className="flex gap-3">
            {(() => {
              // Usar gameState.secrets (ya normalizados)
              const mySecrets = Array.isArray(gameState?.secrets) ? gameState.secrets : [];

              if (!mySecrets.length) {
                return (
                  <div className="text-center text-slate-500 py-6 px-4">
                    <p className="text-xs">No tienes secretos</p>
                  </div>
                );
              }

              return mySecrets.map((secret, index) => {
                const id =
                  secret?.secreto_id ??
                  secret?.id ??
                  `secret-${index}`;

                const desc =
                  secret?.descripcion ??
                  secret?.description ??
                  "Secreto";

                const isRevealed = Boolean(secret?.revelado ?? secret?.revealed);
                const imgSrc = typeof getSecretImage === "function" ? getSecretImage(desc) : null;

                return (
                  <div
                    key={id}
                    className={`
                      relative w-20 h-28 flex-shrink-0 rounded-lg border-2 shadow-md 
                      transition-all duration-300 overflow-hidden
                      ${imgSrc ? "" : "flex items-center justify-center px-2 text-center"}
                      bg-amber-900/60 hover:-translate-y-1 
                      ${isRevealed
                        ? "ring-2 ring-red-400 shadow-lg shadow-red-500/40 border-transparent"
                        : "border-amber-400"}
                    `}
                    title={desc}
                  >
                    <span className="absolute top-1 left-1 text-[10px] font-semibold text-white/90 bg-black/70 rounded px-1.5 py-0.5 z-10">
                      #{index + 1}
                    </span>

                    {imgSrc ? (
                      <img
                        src={imgSrc}
                        alt={desc}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-[10px] leading-tight text-amber-50">
                        {desc}
                      </span>
                    )}
                  </div>
                );
              });
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}
