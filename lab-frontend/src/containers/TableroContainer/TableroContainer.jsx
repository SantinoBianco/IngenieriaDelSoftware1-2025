import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useWebSocket } from "../../hooks/useWebSocket";
import { get, post, put, del } from "../../services/HttpService";
import toast from "react-hot-toast";
import { getCardInfo } from "../../utils/CardImageMapper";
import {
  canCardJoinSet,
  harleyViolatesRule,
  isDetectiveCard,
  isAriadneCard,
  isUnblockableCombination,
} from "../../utils/detectiveRules";
import Tablero from "../../components/Tablero/Tablero";
import TimeoutModal from "../../components/TimeoutModal/TimeoutModal";

export const TURN_TIMEOUT_SECONDS = 60;
export const NOT_SO_FAST_TIMEOUT_SECONDS =  7;

const normalizePlayers = (players = []) =>
  players.map((player) => {
    const normalizedId = Number(player.id);
    return {
      ...player,
      id: Number.isNaN(normalizedId) ? player.id : normalizedId,
      secretsRevealed: player.secretsRevealed ?? 0,
      secretsCount: player.secretsCount ?? 3,
    };
  });

const normalizeSecrets = (secretsData, currentUserId) => {
  if (!secretsData || Number.isNaN(currentUserId)) return [];
  if (Array.isArray(secretsData)) {
    const foundSecrets = secretsData.filter(
      (secret) => Number(secret?.jugador_id ?? secret?.jugadorId) === currentUserId,
    );
    return foundSecrets.map((secret) => ({
      ...secret,
      revealed: secret.revealed ?? secret.revelado ?? false,
      revelado: secret.revelado ?? secret.revealed ?? false,
    }));
  }

  const directMatch =
    secretsData[currentUserId] ??
    secretsData[String(currentUserId)] ??
    secretsData[Number(currentUserId)];
  if (Array.isArray(directMatch)) return directMatch;

  if (Array.isArray(secretsData.maestro)) {
    return normalizeSecrets(secretsData.maestro, currentUserId);
  }

  if (secretsData.secretos !== undefined) {
    return normalizeSecrets(secretsData.secretos, currentUserId);
  }

  if (secretsData.secrets !== undefined) {
    return normalizeSecrets(secretsData.secrets, currentUserId);
  }

  if (secretsData.data !== undefined) {
    return normalizeSecrets(secretsData.data, currentUserId);
  }

  return [];
};

const normalizeRevealedSecretsByPlayer = (secretsData) => {
  const map = {};
  if (!secretsData) return map;

  const push = (secret) => {
    if (!secret) return;
    const owner = String(
      secret?.jugador_id ?? secret?.jugadorId ?? secret?.ownerId ?? secret?.jugador ?? "unknown",
    );
    const revealed = Boolean(secret?.revelado ?? secret?.revealed);
    if (!revealed) return;
    if (!map[owner]) map[owner] = [];
    map[owner].push(secret);
  };

  if (Array.isArray(secretsData)) {
    secretsData.forEach(push);
    return map;
  }

  if (typeof secretsData === "object" && secretsData !== null) {
    const secretsSource =
      secretsData.secretos ??
      secretsData.secrets ??
      secretsData.data ??
      secretsData.maestro;

    if (secretsSource) {
      if (Array.isArray(secretsSource)) {
        secretsSource.forEach(push);
        return map;
      }

      if (typeof secretsSource === "object" && secretsSource !== null) {
        Object.values(secretsSource).forEach((value) => {
          if (Array.isArray(value)) {
            value.forEach(push);
          }
        });
        return map;
      }
    }

    Object.values(secretsData).forEach((value) => {
      if (Array.isArray(value)) {
        value.forEach(push);
      } else if (typeof value === "object" && value !== null) {
        Object.values(value).forEach((innerValue) => {
          if (Array.isArray(innerValue)) {
            innerValue.forEach(push);
          }
        });
      }
    });
  }

  return map;
};

const normalizeDraft = (draftData) => {
  if (!draftData) return [];
  if (Array.isArray(draftData)) return draftData;

  if (Array.isArray(draftData?.cards)) return draftData.cards;
  if (Array.isArray(draftData?.draft)) return draftData.draft;
  if (Array.isArray(draftData?.mazoDraft)) return draftData.mazoDraft;
  if (Array.isArray(draftData?.draftCards)) return draftData.draftCards;

  if (typeof draftData === "object") {
    if (draftData?.data) {
      const nested = normalizeDraft(draftData.data);
      if (nested.length > 0) return nested;
    }

    for (const value of Object.values(draftData)) {
      if (value === draftData) continue;
      const nested = normalizeDraft(value);
      if (nested.length > 0) return nested;
    }
  }

  return [];
};

const CARD_ID_KEYS = ["carta_id", "cartaId", "id", "cardId"];

const findCardInPayload = (payload, depth = 0, visited = new Set()) => {
  if (!payload || depth > 5) return null;

  if (typeof payload === "object") {
    if (visited.has(payload)) return null;
    visited.add(payload);
  }

  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = findCardInPayload(item, depth + 1, visited);
      if (found) return found;
    }
    return null;
  }

  if (typeof payload === "object") {
    for (const key of CARD_ID_KEYS) {
      if (Object.prototype.hasOwnProperty.call(payload, key)) {
        return payload;
      }
    }
    for (const value of Object.values(payload)) {
      const found = findCardInPayload(value, depth + 1, visited);
      if (found) return found;
    }
  }

  return null;
};

const getCardIdFromObject = (card) => {
  if (!card || typeof card !== "object") return null;
  for (const key of CARD_ID_KEYS) {
    const raw = card[key];
    if (raw != null) {
      const numeric = Number(raw);
      return Number.isNaN(numeric) ? raw : numeric;
    }
  }
  return null;
};

const normalizeCardFromPayload = (card) => {
  if (!card || typeof card !== "object") return null;
  const cardId = getCardIdFromObject(card);
  if (cardId == null) return null;
  if (Object.prototype.hasOwnProperty.call(card, "carta_id") && card.carta_id === cardId) {
    return card;
  }
  return { ...card, carta_id: cardId };
};

const DEAD_CARD_FOLLY_DIRECTION = "derecha";
const MAX_EVENT_LOG_ITEMS = 12;

const createInitialDeadCardFollyState = () => ({
  status: "idle",
  roundId: null,
  initiatorId: null,
  cardId: null,
  cardName: null,
  direction: DEAD_CARD_FOLLY_DIRECTION,
  participantIds: [],
  selections: {},
  pendingPlayerIds: [],
  startedAt: null,
  submitted: false,
  receivedCard: null,
  resolvedAt: null,
  globalToastShown: false,
  privateToastShown: false,
  errorMessage: null,
});

const computePendingDeadCardPlayers = (participantIds = [], selections = {}) =>
  participantIds
    .map((pid) => Number(pid))
    .filter((pid) => {
      const key = String(pid);
      return selections[key] == null;
    });

const getPlayerNameById = (players = [], playerId) => {
  if (playerId == null) return "Jugador";
  const numericId = Number(playerId);
  const target =
    players.find((player) => Number(player.id) === numericId) ||
    players.find((player) => String(player.id) === String(playerId));
  return target?.nombre ?? target?.username ?? `Jugador ${playerId}`;
};

export default function TableroContainer({
  gameData,
  currentUser,
  isConnected: externalIsConnected,
  sendMessage: externalSendMessage,
  message: externalMessages,
}) {

  const useExternalWS =
    typeof externalIsConnected === "boolean" &&
    Array.isArray(externalMessages) &&
    typeof externalSendMessage === "function";

  const defaultHost = typeof window !== "undefined" ? window.location.hostname : "localhost";
  const defaultProtocol = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss" : "ws";
  const wsPort = import.meta.env?.VITE_WS_PORT ?? "8000";
  const envWs = import.meta.env?.VITE_WS_URL ?? null;
  const wsUrl = envWs ?? `${defaultProtocol}://${defaultHost}:${wsPort}/ws/lobby`;

  const { isConnected, sendMessage, messages } = useExternalWS
    ? {
        isConnected: externalIsConnected,
        sendMessage: externalSendMessage,
        messages: externalMessages,
      }
    : useWebSocket(wsUrl);

  const currentUserId = Number(currentUser?.id ?? NaN);
  const [allSecretsRaw, setAllSecretsRaw] = useState(null);

  const [gameState, setGameState] = useState(() => {
    const initialTurn = Number(gameData?.turno_actual ?? NaN);
    return {
      players: normalizePlayers(gameData?.players ?? []),
      currentPlayer: currentUser,
      cards: [],
      secrets: [],
      draft: [],
      gamePhase: "starting",
      descarte: [],
      currentTurn: Number.isNaN(initialTurn) ? null : initialTurn,
      endedReason: null,
      playerSets: [], // Sets que ha bajado el jugador actual
      winnerId: null, 
      winnerName: null,
    };
  });

  const loadCurrentPlayerSecrets = useCallback(async () => {
    if (!currentUserId || Number.isNaN(Number(currentUserId))) return [];
    try {
      const response = await get(`/partidas/${gameData.id}/secretos?jugadorId=${currentUserId}`);
      const normalized = normalizeSecrets(response, currentUserId);
      if (normalized.length > 0) {
        setGameState((prev) => ({
          ...prev,
          secrets: normalized,
        }));
      }
      return normalized;
    } catch (error) {
      console.warn("No se pudieron cargar secretos del jugador actual:", error);
      return [];
    }
  }, [currentUserId, gameData.id, get]);

  useEffect(() => {
    loadCurrentPlayerSecrets();
  }, [loadCurrentPlayerSecrets]);

  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [hasDiscardedThisTurn, setHasDiscardedThisTurn] = useState(false);
  const [secretoEnModal, setSecretoEnModal] = useState(null);
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
  const [waitingMessage, setWaitingMessage] = useState(null);
  const lastRevealedSecretIdRef = useRef(null);
  const gameEndedRef = useRef(false);
const [showSetNotifications, setShowSetNotifications] = useState(true);
const [showDiscardModal, setShowDiscardModal] = useState(false);
const [revealedSecretsByPlayer, setRevealedSecretsByPlayer] = useState({});
const revealedSecretsMapRef = useRef(revealedSecretsByPlayer);
useEffect(() => {
  revealedSecretsMapRef.current = revealedSecretsByPlayer;
}, [revealedSecretsByPlayer]);
const [incomingEvent, setIncomingEvent] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null);
  const [showPlayDetectiveModal, setShowPlayDetectiveModal] = useState(false);
  const [presetDetectiveCardId, setPresetDetectiveCardId] = useState(null);
  const [pendingDetectiveAction, setPendingDetectiveAction] = useState(null);
  const [isSubmittingDetective, setIsSubmittingDetective] = useState(false);
  const createInitialPointSuspicionsState = () => ({
    status: "idle",
    roundId: null,
    initiatorId: null,
    cardId: null,
    cardName: null,
    startedAt: null,
    votes: {},
    participantIds: [],
    result: null,
    secret: null,
    broadcasted: false,
    revoteCount: 0,
  });
  const [pointSuspicionPending, setPointSuspicionPending] = useState(false);
  const [pointSuspicionsState, setPointSuspicionsState] = useState(createInitialPointSuspicionsState);
  const [pointSuspicionsSelection, setPointSuspicionsSelection] = useState(null);
  const [pointSuspicionsVoteLocked, setPointSuspicionsVoteLocked] = useState(false);
 
  const [deadCardFollyState, setDeadCardFollyState] = useState(createInitialDeadCardFollyState);
  const [deadCardFollySelection, setDeadCardFollySelection] = useState(null);
  const [deadCardFollyLocked, setDeadCardFollyLocked] = useState(false);
  const deadCardFollyStateRef = useRef(deadCardFollyState);
  
  const [eventLog, setEventLog] = useState([]);
  const recentEventMessagesRef = useRef([]);
  const lastProcessedMessageIndexRef = useRef(0);

  const mergePlayersWithKnownReveals = useCallback((incomingPlayers = [], previousPlayers = []) => {
    const prevMap = new Map(
      (Array.isArray(previousPlayers) ? previousPlayers : []).map((player) => [
        String(player?.id),
        player,
      ]),
    );
    const revealedMap = revealedSecretsMapRef.current || {};
    return (Array.isArray(incomingPlayers) ? incomingPlayers : []).map((player) => {
      const key = String(player?.id);
      const prevEntry = prevMap.get(key);
      const revealedFromIncoming =
        player?.secretsRevealed ?? player?.secrets_revelados ?? null;
      const revealedFromPrev =
        prevEntry?.secretsRevealed ?? prevEntry?.secrets_revelados ?? null;
      const revealedFromMap = Array.isArray(revealedMap[key])
        ? revealedMap[key].length
        : Array.isArray(revealedMap[Number(key)])
          ? revealedMap[Number(key)].length
          : null;
      const resolvedRevealed =
        revealedFromIncoming ??
        revealedFromPrev ??
        revealedFromMap ??
        0;
      const resolvedTotal =
        player?.secretsCount ??
        player?.secrets_count ??
        prevEntry?.secretsCount ??
        prevEntry?.secrets_count ??
        3;
      return {
        ...player,
        secretsRevealed: resolvedRevealed,
        secrets_revelados: resolvedRevealed,
        secretsCount: resolvedTotal,
        secrets_count: resolvedTotal,
      };
    });
  }, []);

  // Estados para el temporizador de turno
  const [turnTimeRemaining, setTurnTimeRemaining] = useState(TURN_TIMEOUT_SECONDS);
  const [showTimeoutModal, setShowTimeoutModal] = useState(false);
  const [showTimeUpMessage, setShowTimeUpMessage] = useState(false);
  const turnTimerRef = useRef(null);
  const autoDiscardInProgressRef = useRef(false); // 🛡️ Bandera para evitar doble descarte
  const hasDiscardedThisTurnRef = useRef(false); // 🛡️ Mantiene el estado de descarte en tiempo real

  const resetPointSuspicions = () => {
    setPointSuspicionsState(createInitialPointSuspicionsState());
    setPointSuspicionsSelection(null);
    setPointSuspicionsVoteLocked(false);
  };

  useEffect(() => {
    hasDiscardedThisTurnRef.current = hasDiscardedThisTurn;
  }, [hasDiscardedThisTurn]);

  useEffect(() => {
    deadCardFollyStateRef.current = deadCardFollyState;
  }, [deadCardFollyState]);

const EVENT_LOG_DEDUPE_WINDOW = 4000;
const EVENT_LOG_MAX_DEDUPE = 50;

const pushEventLog = useCallback((message, meta = {}) => {
  if (!message) return;
  const now = Date.now();
  const recent = (recentEventMessagesRef.current || []).filter(
    (entry) => now - entry.timestamp < EVENT_LOG_DEDUPE_WINDOW,
  );
  if (recent.some((entry) => entry.message === message)) {
    recentEventMessagesRef.current = recent;
    return;
  }
  recent.push({ message, timestamp: now });
  if (recent.length > EVENT_LOG_MAX_DEDUPE) {
    recent.splice(0, recent.length - EVENT_LOG_MAX_DEDUPE);
  }
  recentEventMessagesRef.current = recent;

  const { dedupeKey: _ignored, ...restMeta } = meta;
  setEventLog((prev) => {
    const entry = {
      id: `${now}-${Math.random().toString(36).slice(2, 7)}`,
      message,
      timestamp: now,
      ...restMeta,
    };
    const next = [entry, ...prev];
    return next.slice(0, MAX_EVENT_LOG_ITEMS);
  });
}, []);

  useEffect(() => {
    const key = String(currentUserId);
    if (
      deadCardFollyState.status === "idle" ||
      deadCardFollyState.status === "completed" ||
      deadCardFollyState.status === "error"
    ) {
      return;
    }
    if (
      deadCardFollyState.selections?.[key] != null &&
      !deadCardFollyLocked
    ) {
      setDeadCardFollyLocked(true);
    }
  }, [deadCardFollyState, deadCardFollyLocked, currentUserId]);

  useEffect(() => {
    if (gameState.gamePhase === "ended") {
      setStatusMessage(null);
      return;
    }

    if (!Array.isArray(gameState.players) || gameState.players.length === 0) {
      return;
    }

    if (gameState.gamePhase && gameState.gamePhase !== "playing") {
      return;
    }

    const currentTurnId = Number(gameState.currentTurn);
    if (Number.isNaN(currentTurnId)) {
      if (gameState.gamePhase === "playing") {
        setStatusMessage(null);
      }
      return;
    }

    setStatusMessage((prev) => {
      if (prev?.type === "event" && Number(prev.actorId) === currentTurnId) {
        return prev;
      }
      return {
        type: "turn",
        actorId: currentTurnId,
        actorName: getPlayerNameById(gameState.players, currentTurnId),
        cardName: null,
        timestamp: Date.now(),
      };
    });
  }, [gameState.currentTurn, gameState.players, gameState.gamePhase]);

  const handlePointSuspicionsSelect = (value) => {
    if (pointSuspicionsVoteLocked) return;
    const numericValue = value != null ? Number(value) : null;
    setPointSuspicionsSelection(Number.isNaN(numericValue) ? value : numericValue);
  };

  const resetDeadCardFolly = () => {
    setDeadCardFollyState(createInitialDeadCardFollyState());
    setDeadCardFollySelection(null);
    setDeadCardFollyLocked(false);
  };

  const startDeadCardFollyFlow = (cardId, cardName, direction = DEAD_CARD_FOLLY_DIRECTION) => {
    const participants = Array.isArray(gameState.players)
      ? gameState.players
          .map((player) => Number(player.id))
          .filter((value) => !Number.isNaN(value))
      : [];

    if (participants.length === 0) {
      toast.error("No hay jugadores disponibles para Dead Card Folly.");
      return;
    }

    const roundId = `dcf-${gameData.id}-${Date.now()}`;
    const payload = {
      partidaId: gameData.id,
      roundId,
      initiatorId: currentUserId,
      direction,
      cardId,
      cardName,
      participantIds: participants,
      startedAt: Date.now(),
    };

    setDeadCardFollyState({
      status: "selecting",
      roundId,
      initiatorId: currentUserId,
      cardId,
      cardName,
      direction,
      participantIds: participants,
      selections: {},
      pendingPlayerIds: participants,
      startedAt: payload.startedAt,
      submitted: false,
      receivedCard: null,
      resolvedAt: null,
      globalToastShown: false,
      privateToastShown: false,
      errorMessage: null,
    });
    setDeadCardFollySelection(null);
    setDeadCardFollyLocked(false);

    // Pedir Not So Fast antes de notificar a los demás jugadores
    try {
      const revealPayload = {
        ...payload,
        selections: payload.participantIds.reduce((acc, pid) => {
          acc[String(pid)] = null;
          return acc;
        }, {}),
        _deadCardFolly: true,
        stage: "start",
      };

      const revealReq = sendRevealRequestForAction({
        actionType: "play_event",
        actionSummary: cardName ?? "Dead Card Folly",
        blockable: true,
        payload: revealPayload,
        executor: async (req) => {
          try {
            if (sendMessage) {
              sendMessage({ event: "pedir_revelar_secreto", data: req.payload });
            }
          } catch (err) {
            console.error("No se pudo anunciar Dead Card Folly en executor:", err);
            throw err;
          }
        },
      });

      if (!revealReq) {
        // fallback: enviar directamente
        if (sendMessage) {
          try {
            sendMessage({ event: "pedir_revelar_secreto", data: revealPayload });
          } catch (err) {
            console.error("No se pudo anunciar Dead Card Folly:", err);
          }
        }
      }
    } catch (err) {
      console.error("Error iniciando Dead Card Folly reveal request:", err);
    }

    const announcement = cardName
      ? `${cardName} está en juego. Todos deben entregar una carta.`
      : "Dead Card Folly exige que todos entreguen una carta.";
    toast(announcement, { icon: "🔁" });
    
    const actorName = getPlayerNameById(gameState.players, currentUserId);
    pushEventLog(
      `${actorName} jugó "${cardName ?? "Dead Card Folly"}". Todos deben entregar una carta.`,
      {
        type: "event_dead_card_folly",
        playerId: currentUserId,
        cardName: cardName ?? "Dead Card Folly",
        dedupeKey: `dcf_start_${roundId}`,
      },
    );
  };

  const handleDeadCardFollyCardSelect = (cardId = null) => {
    if (deadCardFollyLocked) return;
    if (!deadCardFollyState || deadCardFollyState.status === "idle") return;
    if (cardId == null) {
      setDeadCardFollySelection(null);
      return;
    }
    const numericCardId = Number(cardId);
    setDeadCardFollySelection((prev) =>
      prev != null && Number(prev) === numericCardId ? null : numericCardId,
    );
  };

  const confirmDeadCardFollySelection = () => {
    if (deadCardFollyLocked) return;
    if (!deadCardFollyState || deadCardFollyState.status === "idle") return;
    if (!deadCardFollySelection) {
      toast.error("Seleccioná una carta para entregar.");
      return;
    }

    const cardId = Number(deadCardFollySelection);
    const roundId = deadCardFollyState.roundId;
    setDeadCardFollyLocked(true);
    setDeadCardFollyState((prev) => {
      if (!prev || prev.status === "idle") return prev;
      const selections = { ...prev.selections, [String(currentUserId)]: cardId };
      const pendingPlayerIds = computePendingDeadCardPlayers(prev.participantIds, selections);
      const everyoneReady = pendingPlayerIds.length === 0;
      const nextStatus = everyoneReady
        ? Number(prev.initiatorId) === Number(currentUserId)
          ? "ready"
          : "waiting_resolution"
        : prev.status;
      return {
        ...prev,
        selections,
        pendingPlayerIds,
        status: nextStatus,
        errorMessage: null,
      };
    });

    if (sendMessage && roundId) {
      try {
        sendMessage({
          event: "respuesta_revelar_secreto",
          data: {
            _deadCardFollySelection: true,
            partidaId: gameData.id,
            roundId,
            playerId: currentUserId,
            cardId,
          },
        });
      } catch (err) {
        console.error("No se pudo enviar selección de Dead Card Folly:", err);
      }
    }
  };

  const closeDeadCardFollyModal = () => {
    if (
      deadCardFollyState.status !== "completed" &&
      deadCardFollyState.status !== "error" &&
      deadCardFollyState.status !== "idle"
    ) {
      return;
    }
    resetDeadCardFolly();
  };

  const announceEventInProgress = useCallback(
    async (cardId, cardName = null) => {
      if (cardId == null || Number.isNaN(Number(currentUserId))) return;
      const numeric = Number(cardId);
      const eventCardId = Number.isNaN(numeric) ? cardId : numeric;

      try {
        await get(
          `/partidas/${gameData.id}/estado-jugador-evento?jugador_id=${currentUserId}&cartaEventoId=${eventCardId}`,
        );
        const actorName = getPlayerNameById(gameState.players, currentUserId);
        setStatusMessage({
          type: "event",
          actorId: currentUserId,
          actorName,
          cardName,
          timestamp: Date.now(),
        });
      } catch (error) {
        console.error("No se pudo notificar evento en curso:", error);
        throw error;
      }
    },
    [currentUserId, gameData.id, gameState.players],
  );

    const announceEventCancelled = useCallback(
    ({ cardName = null } = {}) => {
      if (!sendMessage) return;
      const actorId = Number(currentUserId);
      if (Number.isNaN(actorId)) return;
      const partidaId = gameData?.id;
      if (!partidaId) return;
      try {
        // Enviar cancelación al servidor para que lo rebroadcast a los demás
        sendMessage({
          event: "evento_cancelado",
          data: {
            partidaId,
            jugadorId: actorId,
            cardName,
            jugadorNombre: getPlayerNameById(gameState.players, actorId),
          },
        });
      } catch (error) {
        console.error("No se pudo anunciar cancelacion del evento:", error);
      }

      // Actualizar inmediatamente el estado LOCAL del actor para que vea "Es tu turno..."
      // (evita que el broadcast del servidor le sobreescriba con el texto de los demás)
      const currentTurnId = Number(gameState.currentTurn);
      const actorForStatus = Number.isNaN(currentTurnId) ? actorId : currentTurnId;
      setStatusMessage({
        type: "turn",
        actorId: actorForStatus,
        actorName: getPlayerNameById(gameState.players, actorForStatus),
        cardName: null,
        timestamp: Date.now(),
        // marca local para debugging si hace falta
        _localUpdate: true,
      });
    },
    [sendMessage, currentUserId, gameData?.id, gameState.players, gameState.currentTurn],
  );

  const submitDeadCardFollySelections = useCallback(async () => {
    const snapshot = deadCardFollyStateRef.current;
    if (!snapshot || snapshot.status === "idle") return;
    const selectionPayload = {};
    const missing = [];

    snapshot.participantIds.forEach((pid) => {
      const key = String(pid);
      if (snapshot.selections[key] == null) {
        missing.push(pid);
      } else {
        selectionPayload[pid] = Number(snapshot.selections[key]);
      }
    });

    if (missing.length > 0) {
      console.warn("Dead Card Folly aún no está listo. Faltan selecciones de:", missing);
      return;
    }

    setDeadCardFollyState((prev) => ({
      ...prev,
      status: "submitting",
      submitted: true,
      errorMessage: null,
    }));

    try {
      await post(`/partidas/${gameData.id}/eventos/dead-card-folly`, {
        jugadorId: Number(currentUserId),
        cartaEventoId: Number(snapshot.cardId),
        direccion: snapshot.direction ?? DEAD_CARD_FOLLY_DIRECTION,
        selecciones: selectionPayload,
      });
    } catch (error) {
      console.error("Error resolviendo Dead Card Folly:", error);
      const message =
        error?.response?.data?.detail || error?.message || "No se pudo resolver Dead Card Folly.";
      toast.error(message);
      setDeadCardFollyLocked(false);
      setDeadCardFollyState((prev) => ({
        ...prev,
        status: "error",
        submitted: false,
        errorMessage: message,
      }));

      if (sendMessage && snapshot.roundId) {
        try {
          sendMessage({
            event: "pedir_revelar_secreto",
            data: {
              _deadCardFolly: true,
              stage: "failed",
              partidaId: gameData.id,
              roundId: snapshot.roundId,
              reason: message,
            },
          });
        } catch (err) {
          console.error("No se pudo notificar el fallo de Dead Card Folly:", err);
        }
      }
    }
  }, [currentUserId, gameData.id, post, sendMessage]);

  useEffect(() => {
    if (
      deadCardFollyState.status === "ready" &&
      Number(deadCardFollyState.initiatorId) === Number(currentUserId) &&
      !deadCardFollyState.submitted
    ) {
      submitDeadCardFollySelections();
    }
  }, [deadCardFollyState, currentUserId, submitDeadCardFollySelections]);

  const [allPlayersSets, setAllPlayerSets] = useState([]);
  
  // Estados para Desgracia Social
  const [playersInSocialDisgrace, setPlayersInSocialDisgrace] = useState(new Set());
  const [hasShownSocialDisgraceNotification, setHasShownSocialDisgraceNotification] = useState(false);
  // Pending Card Trade (iniciador guarda la propuesta hasta que el otro responda)
  const [pendingCardTrade, setPendingCardTrade] = useState(null);
  const [pendingSocialFauxTrade, setPendingSocialFauxTrade] = useState(null);


  // loadAllPlayerSets retorna los sets cargados
  const loadAllPlayerSets = async (forceRefresh = false) => {
    try {            
      const response = await get(`/partidas/${gameData.id}/sets`);

      if (response && typeof response === 'object' && !Array.isArray(response)) {
        const flatSets = [];
        Object.entries(response).forEach(([ownerId, playerData]) => {
          if (playerData && playerData.sets && Array.isArray(playerData.sets)) {
            playerData.sets.forEach(set => {
              flatSets.push({
                ...set,
                owner_id: parseInt(ownerId)
              });
            });
          }
        });
        setAllPlayerSets(flatSets);
        
        if (currentUserId) {
          const currentPlayerSets = flatSets.filter(set => Number(set.owner_id) === Number(currentUserId));
          setGameState((prev) => ({
            ...prev,
            playerSets: currentPlayerSets  
          }));
        }
        return flatSets; 
      } else if (Array.isArray(response)) {
        setAllPlayerSets(response);
        
        if (currentUserId) {
          const currentPlayerSets = response.filter(set => Number(set.owner_id) === Number(currentUserId));
          setGameState((prev) => ({
            ...prev,
            playerSets: currentPlayerSets 
          }));
        }
        return response; 
      }
      return []; 
    } catch (error) {
      console.error("Error cargando sets de jugadores:", error);
      return []; 
    }
  };

  const playEventPointSuspicion = async (cardId, cardName) => {
    if (!cardId) {
      toast.error("No se pudo identificar la carta de Point Your Suspicion.");
      return;
    }

    if (pointSuspicionPending) {
      return;
    }

    setPointSuspicionPending(true);
    try {
      await post(`/partidas/${gameData.id}/eventos/point-your-suspicion/activar`, {
        jugadorId: Number(currentUserId),
        cartaEventoId: Number(cardId),
      });

      startPointSuspicionsEvent(cardId, cardName);
    } catch (error) {
      const message =
        error?.response?.data?.detail ||
        error?.body?.detail ||
        error?.message ||
        "No se pudo activar Point Your Suspicion.";
      toast.error(message);
      throw error;
    } finally {
      setPointSuspicionPending(false);
    }
  };

  // Función para actualizar el estado de mazo y descarte
  const updateMazosState = async () => {
    try {
      console.log("Actualizando estado de mazos...");
      const estadoResponse = await get(`/partidas/${gameData.id}/cartas/estado`);
      console.log("Estado recibido:", estadoResponse);
      const newDescarte = Array.isArray(estadoResponse?.mazoDescarte) 
        ? estadoResponse.mazoDescarte 
        : [];
      
      setGameState((prev) => {
        const prevDescarteLength = prev.descarte?.length || 0;
        const shouldUpdateDescarte = newDescarte.length >= prevDescarteLength;
        if (!shouldUpdateDescarte) {
          console.log("⚠️ updateMazosState - NO actualizando descarte (datos más recientes ya presentes):", prevDescarteLength, ">", newDescarte.length);
        }
        return {
          ...prev,
          descarte: shouldUpdateDescarte ? newDescarte : prev.descarte,
          // También actualizar el draft si viene en la respuesta
          draft: estadoResponse?.mazoDraft ?? prev.draft
        };
      });
    } catch (error) {
      console.error("Error actualizando estado de mazos:", error);
    }
  };
  
  // Función para sincronizar revealedSecretsByPlayer basándose en el estado local
  const syncRevealedSecretsByPlayer = () => {
    // No ejecutar si el juego ya terminó
    if (gameEndedRef.current || gameState.gamePhase === "ended") {
      return;
    }
    
    if (!Array.isArray(gameState.players) || !allSecretsRaw?.secretos) {
      return;
    }
    
    const updated = {};
    gameState.players.forEach(player => {
      const playerId = Number(player.id);
      const secretsRevealed = player.secretsRevealed ?? player.secrets_revelados ?? 0;
      
      console.log(`Procesando jugador ${playerId}: ${secretsRevealed} secretos revelados`);
      
      if (secretsRevealed > 0) {
        // Obtener todos los secretos del jugador
        const playerSecrets = allSecretsRaw.secretos[playerId] || [];
        console.log(`Secretos disponibles para jugador ${playerId}:`, playerSecrets);
        
        // Filtrar los secretos que están revelados (revelado: true)
        const revealedSecrets = playerSecrets.filter(secret => 
          secret.revelado === true || secret.revealed === true
        );
        
        if (revealedSecrets.length > 0) {
          updated[playerId] = revealedSecrets;
        }
      }
    });
    
    setRevealedSecretsByPlayer(updated);
  };
  
  // Función para verificar si un jugador está en desgracia social 
  const checkSocialDisgraceStatus = (players) => {
    const newPlayersInDisgrace = new Set();
  
    players.forEach(player => {
      const playerId = Number(player.id);
      const secretsRevealed = player.secretsRevealed ?? player.secrets_revelados ?? 0;
      const totalSecrets = player.secretsCount ?? player.secrets_count ?? 3;
      
      // Un jugador está en desgracia social cuando TODOS sus secretos están revelados
      if (totalSecrets > 0 && secretsRevealed >= totalSecrets) {
        newPlayersInDisgrace.add(playerId);
      }
    });
    
    console.log("Jugadores en desgracia social:", Array.from(newPlayersInDisgrace));
    return newPlayersInDisgrace;
  };

  // Función para detectar cambios en el estado de desgracia social
  const detectSocialDisgraceChanges = (newPlayersInDisgrace) => {
    const previousPlayers = new Set([...playersInSocialDisgrace]);
    const currentPlayers = new Set([...newPlayersInDisgrace]);
    
    // Jugadores que entraron en desgracia social
    const enteredDisgrace = new Set([...currentPlayers].filter(id => !previousPlayers.has(id)));
    
    // Jugadores que salieron de desgracia social  
    const exitedDisgrace = new Set([...previousPlayers].filter(id => !currentPlayers.has(id)));
    
    return { enteredDisgrace, exitedDisgrace };
  };

  // Función para manejar notificaciones de desgracia social
  const handleSocialDisgraceNotifications = (enteredDisgrace, exitedDisgrace, players) => {
    enteredDisgrace.forEach(playerId => {
      const player = players.find(p => Number(p.id) === playerId);
      const playerName = player?.nombre ?? `Jugador ${playerId}`;
      
      if (playerId === currentUserId) {
        toast.error("¡Has caído en desgracia social!", { 
          duration: 5000,
          icon: "😱"
        });
      } else {
        toast.success(`${playerName} ha caído en desgracia social`, {
          duration: 3000,
          icon: "👁️"
        });
      }
    });

    exitedDisgrace.forEach(playerId => {
      const player = players.find(p => Number(p.id) === playerId);
      const playerName = player?.nombre ?? `Jugador ${playerId}`;
      
      if (playerId === currentUserId) {
        toast.success("¡Has salido de la desgracia social!", { 
          duration: 4000,
          icon: "🎉"
        });
      } else {
        toast.success(`${playerName} ha salido de la desgracia social`, {
          duration: 3000,
          icon: "✨"
        });
      }
    });
  };

  // Función para verificar si el jugador actual está en desgracia social
  const isCurrentPlayerInSocialDisgrace = () => {
    return playersInSocialDisgrace.has(currentUserId);
  };

  const openPlayDetectiveModal = (cardId = null) => {
    if (!canPlayDetective) {
      toast.error("No hay detectives disponibles para agregar a tus sets.");
      return;
    }
    setPresetDetectiveCardId(
      cardId != null ? Number(cardId) : null,
    );
    setShowPlayDetectiveModal(true);
  };

  const closePlayDetectiveModal = () => {
    if (!isSubmittingDetective) {
      setShowPlayDetectiveModal(false);
      setPresetDetectiveCardId(null);
    }
  };

  const cancelRevealSecretModal = () => {
    if (showRevealSecretModal?.source === "add_detective") {
      setPendingDetectiveAction(null);
    }
    setShowRevealSecretModal(null);
  };

  // Estado para la reacción Not So Fast (se define antes del helper para que el helper pueda
  // actualizarlo inmediatamente y mostrar el modal localmente al actor que inicia la acción)
  const [reactionPrompt, setReactionPrompt] = useState(null);
  const [pendingReactionPayload, setPendingReactionPayload] = useState(null);
  const [isSubmittingNotSoFast, setIsSubmittingNotSoFast] = useState(false);
  const pendingReactionExecutorRef = useRef(null);
  const pendingReactionTimerRef = useRef(null);
  const pendingReactionPayloadRef = useRef(null);

  const clearPendingReaction = () => {
    try {
      if (pendingReactionTimerRef.current) {
        clearTimeout(pendingReactionTimerRef.current);
      }
    } catch (e) {
      console.debug('Error clearing pending reaction timer', e);
    }
    pendingReactionTimerRef.current = null;
    pendingReactionExecutorRef.current = null;
    pendingReactionPayloadRef.current = null;
    setPendingReactionPayload(null);
    setReactionPrompt(null);
    setIsWaitingForResponse(false);
    setWaitingMessage(null);
    // Asegurar que la bandera de envío se reinicie si quedó activa
    try {
      setIsSubmittingNotSoFast && setIsSubmittingNotSoFast(false);
    } catch (e) {
      // noop
    }
  };

  const executePendingAction = async () => {
    const executor = pendingReactionExecutorRef.current;
    const payload = pendingReactionPayload;
    // limpiar estado antes de ejecutar para evitar reentradas
    pendingReactionExecutorRef.current = null;
    if (pendingReactionTimerRef.current) {
      clearTimeout(pendingReactionTimerRef.current);
      pendingReactionTimerRef.current = null;
    }
    setIsWaitingForResponse(false);
    setWaitingMessage(null);
    setReactionPrompt(null);
    pendingReactionPayloadRef.current = null;
    setPendingReactionPayload(null);

    if (typeof executor === 'function') {
      try {
        await executor(payload);
      } catch (err) {
        console.error('Error ejecutando la acción pendiente después de expiración:', err);
      }
    } else {
      console.debug('No hay executor para la acción pendiente, payload:', payload);
    }
  };

  // ---- Helpers para pedir reacción Not So Fast por WebSocket ----
  const sendRevealRequestForAction = (opts = {}) => {
    const {
      actionType = "play_event",
      actionSummary = "realizar una acción",
      blockable = true,
      payload = {},
      executor = null,
    } = opts;

    if (!sendMessage) {
      console.warn("No WebSocket disponible para pedir reacción Not So Fast");
      return null;
    }

    const reactionId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

    const partidaId = gameData?.id;
    const actorName = currentUser?.nombre ?? `Jugador ${currentUserId}`;

    const requestPayload = {
      reactionId,
      partidaId,
      jugadorId: Number(currentUserId),
      jugadorNombre: actorName,
      actionType,
      actionSummary,
      blockable: Boolean(blockable),
      payload,
      startedAt: Date.now(),
      expiresAt: Date.now() + NOT_SO_FAST_TIMEOUT_SECONDS * 1000,
    };

    try {
      // Guardar payload pendiente para que onSkipNotSoFast lo use
      setPendingReactionPayload(requestPayload);
      pendingReactionPayloadRef.current = requestPayload;
      // Guardar executor (función que ejecuta la acción original cuando expira)
      pendingReactionExecutorRef.current = typeof executor === 'function' ? executor : null;
      // Programar timeout local que ejecuta la acción si nadie juega Not So Fast
      try {
        if (pendingReactionTimerRef.current) {
          clearTimeout(pendingReactionTimerRef.current);
        }
        const delay = Math.max(0, requestPayload.expiresAt - Date.now());
        pendingReactionTimerRef.current = setTimeout(() => {
          // Si la petición aún está pendiente y nadie la canceló, ejecutar
          const currentPending = pendingReactionPayloadRef.current;
          if (currentPending && currentPending.reactionId === requestPayload.reactionId) {
            executePendingAction();
          }
        }, delay);
      } catch (errTimer) {
        console.warn('No se pudo programar timeout para Not So Fast:', errTimer);
      }

      // Mostrar el prompt localmente al actor que inicia la acción para que vea
      // el modal Not So Fast inmediatamente (antes de que el servidor rebroadcast)
      try {
        setReactionPrompt({
          id: reactionId,
          actorId: Number(currentUserId),
          actorName,
          actionSummary,
          blockable: Boolean(blockable),
          targetName: payload?.targetName ?? null,
          expiresAt: requestPayload.expiresAt,
        });
      } catch (e) {
        console.warn("No se pudo abrir prompt local de Not So Fast:", e);
      }

      console.log("📤 Enviando pedir_revelar_secreto ->", requestPayload);
      sendMessage({ event: "pedir_revelar_secreto", data: requestPayload });
      setIsWaitingForResponse(true);
      setWaitingMessage(`Esperando reacciones a ${actionSummary}...`);
      return requestPayload;
    } catch (err) {
      console.error("Error enviando pedir_revelar_secreto:", err);
      return null;
    }
  };

  const getNormalizedSetId = (set) => {
    if (!set || typeof set !== "object") return null;
    const raw =
      set.id ??
      set.set_id ??
      set.setId ??
      set.setID ??
      null;
    const numeric = Number(raw);
    return Number.isNaN(numeric) ? raw ?? null : numeric;
  };

  const getNormalizedSetOwnerId = (set) => {
    if (!set || typeof set !== "object") return null;
    const raw =
      set.owner_id ??
      set.ownerId ??
      set.owner ??
      set.jugador_id ??
      set.jugadorId ??
      set.player_id ??
      set.playerId ??
      null;
    const numeric = Number(raw);
    return Number.isNaN(numeric) ? raw ?? null : numeric;
  };

  const isOwnerCurrentUser = (ownerValue) => {
    if (ownerValue === null || ownerValue === undefined) return false;
    const ownerNumeric = Number(ownerValue);
    const currentNumeric = Number(currentUserId);
    if (!Number.isNaN(ownerNumeric) && !Number.isNaN(currentNumeric)) {
      return ownerNumeric === currentNumeric;
    }
    return String(ownerValue) === String(currentUserId);
  };

  const myPlayerSets = useMemo(
    () => (Array.isArray(gameState.playerSets) ? gameState.playerSets : []),
    [gameState.playerSets],
  );

  const detectiveCardsInHand = useMemo(
    () => (Array.isArray(gameState.cards) ? gameState.cards.filter(isDetectiveCard) : []),
    [gameState.cards],
  );

  const allSetsAvailable = useMemo(
    () => (Array.isArray(allPlayersSets) ? allPlayersSets : []),
    [allPlayersSets],
  );

  const isMyTurnNow = Number(gameState.currentTurn) === Number(currentUserId);

  const hasPlayableDetectiveOption = useMemo(() => {
    if (detectiveCardsInHand.length === 0) return false;
    return detectiveCardsInHand.some((card) => {
      const candidateSets = isAriadneCard(card)
        ? allSetsAvailable.filter((set) => {
            const ownerId = getNormalizedSetOwnerId(set);
            return ownerId != null && !isOwnerCurrentUser(ownerId);
          })
        : myPlayerSets;

      if (!Array.isArray(candidateSets) || candidateSets.length === 0) {
        return false;
      }

      return candidateSets.some((set) => {
        if (!canCardJoinSet(card, set, currentUserId)) return false;
        if (harleyViolatesRule(card, set)) return false;
        return true;
      });
    });
  }, [detectiveCardsInHand, myPlayerSets, allSetsAvailable, currentUserId]);

  const canPlayDetective = isMyTurnNow && !isCurrentPlayerInSocialDisgrace() && hasPlayableDetectiveOption;

  const playDetectiveOnSet = async ({
    cardId,
    setId,
    setOwnerId = null,
    jugadorObjetivoId = null,
    secretoIdObjetivo = null,
  }) => {
    if (!cardId || !setId) return;

    const toOptionalNumber = (value) => {
      if (value === null || value === undefined) return null;
      const parsed = Number(value);
      return Number.isNaN(parsed) ? value : parsed;
    };

    const toRequiredNumber = (value) => {
      const parsed = Number(value);
      return Number.isNaN(parsed) ? value : parsed;
    };

    const resolvedPlayerId =
      toOptionalNumber(currentUserId) ??
      currentUserId;
    const resolvedTargetId = toOptionalNumber(jugadorObjetivoId);
    const resolvedSecretId = toOptionalNumber(secretoIdObjetivo);

    setIsSubmittingDetective(true);
    try {
      const payload = {
        carta_id: toRequiredNumber(cardId),
        set_id: toRequiredNumber(setId),
        owner_id: toRequiredNumber(resolvedPlayerId),
        jugador_id: toRequiredNumber(currentUserId),
        jugador_id_objetivo: resolvedTargetId,
        secreto_id_objetivo: resolvedSecretId,
      };
      // Loguear payload para ayudar a diagnosticar 400s desde el backend
      // Usar console.log para asegurar visibilidad en la consola del navegador
      console.log('playDetectiveOnSet payload ->', payload);

      // Validación preventiva: asegurarnos que campos obligatorios sean números válidos
      const cid = Number(payload.carta_id);
      const sid = Number(payload.set_id);
      if (!Number.isFinite(cid) || !Number.isFinite(sid)) {
        const msg = `Payload inválido: carta_id=${payload.carta_id}, set_id=${payload.set_id}`;
        console.error(msg);
        toast.error(msg);
        setPendingDetectiveAction(null);
        setIsSubmittingDetective(false);
        return;
      }

      await post(`/partidas/${gameData.id}/agregar-carta-a-set`, payload);
    } catch (error) {
      console.error("Error al agregar detective al set:", error);
      // Loguear el cuerpo/parseo devuelto por el backend (si existe)
      console.error('Backend error body:', error?.body ?? error?.data ?? error?.response?.data ?? null);

      const backendDetail =
        (error && error.data && error.data.detail) ||
        (error && error.body && error.body.detail) ||
        (error && error.body) ||
        null;

      toast.error(
        backendDetail || error?.message || "No se pudo agregar el detective al set.",
      );
      setPendingDetectiveAction(null);
      throw error;
    } finally {
      setIsSubmittingDetective(false);
    }
  };

  const handlePlayDetectiveConfirm = async ({
    cardId,
    setId,
    isUnblockable = false,
  }) => {
    setShowPlayDetectiveModal(false);
    setPresetDetectiveCardId(null);
    const currentUserNumeric = Number(currentUserId);
    const currentUserString = String(currentUserId);

    const card = detectiveCardsInHand.find(
      (item) => Number(item?.carta_id) === Number(cardId),
    );

    const candidateSets = isAriadneCard(card)
      ? allSetsAvailable.filter((set) => {
          const ownerId = getNormalizedSetOwnerId(set);
          if (ownerId === null || ownerId === undefined) return false;
          return !isOwnerCurrentUser(ownerId);
        })
      : myPlayerSets;

    const selectedSetIdNumber = Number(setId);
    const selectedSetIdFallback = String(setId);
    const targetSet = Array.isArray(candidateSets)
      ? candidateSets.find((item) => {
          const candidateId = getNormalizedSetId(item);
          if (candidateId != null) {
            const candidateNumeric = Number(candidateId);
            if (!Number.isNaN(candidateNumeric) && !Number.isNaN(selectedSetIdNumber)) {
              return candidateNumeric === selectedSetIdNumber;
            }
            return String(candidateId) === selectedSetIdFallback;
          }
          return false;
        })
      : null;

    if (!card || !targetSet) {
      toast.error("No se encontró la carta o el set seleccionado.");
      setPendingDetectiveAction(null);
      return;
    }

    if (!canCardJoinSet(card, targetSet, currentUserId) || harleyViolatesRule(card, targetSet)) {
      toast.error("El detective seleccionado no puede agregarse a ese set.");
      setPendingDetectiveAction(null);
      return;
    }

    const targetSetOwnerIdRaw = getNormalizedSetOwnerId(targetSet);
    const jugadorObjetivoPorDefecto =
      targetSetOwnerIdRaw != null && !isOwnerCurrentUser(targetSetOwnerIdRaw)
        ? targetSetOwnerIdRaw
        : null;
    const normalizedSetIdForPending = (() => {
      const fromSet = getNormalizedSetId(targetSet);
      if (fromSet != null) return fromSet;
      if (!Number.isNaN(selectedSetIdNumber)) return selectedSetIdNumber;
      return setId;
    })();

    const pendingInfo = {
      cardId: Number(cardId),
      setId: normalizedSetIdForPending,
      cardName: card.nombre,
      setName: targetSet.nombre,
      setOwnerId:
        targetSetOwnerIdRaw ??
        (Number.isNaN(currentUserNumeric) ? currentUserString : currentUserNumeric),
      jugadorObjetivoId: jugadorObjetivoPorDefecto,
      isUnblockable:
        Boolean(isUnblockable) || isUnblockableCombination(card, targetSet),
    };
    setPendingDetectiveAction(pendingInfo);

    const effectMode = getDetectiveEffect(targetSet.nombre);

    if (effectMode) {
      setShowRevealSecretModal({
        mode: effectMode,
        source: "add_detective",
        setName: targetSet.nombre,
        cardId: Number(cardId),
        setId: normalizedSetIdForPending,
        cardName: card.nombre,
        setOwnerId:
          targetSetOwnerIdRaw ??
          (Number.isNaN(currentUserNumeric) ? currentUserString : currentUserNumeric),
        pendingInfo,
      });
      return;
    }

    try {
      await playDetectiveOnSet({
        cardId: Number(cardId),
        setId: normalizedSetIdForPending,
        setOwnerId:
          targetSetOwnerIdRaw ??
          (Number.isNaN(currentUserNumeric) ? currentUserString : currentUserNumeric),
        jugadorObjetivoId: jugadorObjetivoPorDefecto,
      });
    } catch (error) {
      // Error manejado en playDetectiveOnSet
    }
  };

  // Sincronizar secretsCount y secretsRevealed desde allSecretsRaw
  useEffect(() => {
    if (!allSecretsRaw?.secretos || !Array.isArray(gameState.players)) {
      return;
    }

    // No actualizar si el juego ya terminó
    if (gameEndedRef.current || gameState.gamePhase === "ended") {
      return;
    }

    setGameState((prev) => {
      const updatedPlayers = prev.players.map((player) => {
        const playerId = Number(player.id);
        const playerSecrets = allSecretsRaw.secretos[playerId];
        
        if (!Array.isArray(playerSecrets)) {
          // Si no hay secretos en allSecretsRaw, mantener valores actuales
          return player;
        }

        // Calcular secretsCount desde allSecretsRaw (fuente de verdad)
        const newSecretsCount = playerSecrets.length;
        
        // Calcular secretsRevealed contando secretos con revelado=true
        const newSecretsRevealed = playerSecrets.filter(s => s.revelado === true).length;

        return {
          ...player,
          secretsCount: newSecretsCount,
          secrets_count: newSecretsCount,
          secretsRevealed: newSecretsRevealed,
          secrets_revelados: newSecretsRevealed
        };
      });

      return {
        ...prev,
        players: updatedPlayers
      };
    });
  }, [allSecretsRaw]);

  // Cargar sets al inicializar
  useEffect(() => {
    if (gameData?.id) {
      loadAllPlayerSets();
    }
  }, [gameData?.id]);

  // useEffect para verificar cambios en el estado de desgracia social
  useEffect(() => {
    if (!Array.isArray(gameState.players) || gameState.players.length === 0) return;
    
    const newPlayersInDisgrace = checkSocialDisgraceStatus(gameState.players);
    const { enteredDisgrace, exitedDisgrace } = detectSocialDisgraceChanges(newPlayersInDisgrace);
    
    // Solo manejar notificaciones si hay cambios reales
    if (enteredDisgrace.size > 0 || exitedDisgrace.size > 0) {
      handleSocialDisgraceNotifications(enteredDisgrace, exitedDisgrace, gameState.players);
      setPlayersInSocialDisgrace(newPlayersInDisgrace);
    }
  }, [gameState.players]);

  useEffect(() => {
    const isMyTurn = !Number.isNaN(currentUserId) && gameState.currentTurn === currentUserId;
    const isGameActive = gameState.gamePhase === "playing";
    const isWSConnected = isConnected === true;
    
    if (turnTimerRef.current) {
      clearInterval(turnTimerRef.current);
      turnTimerRef.current = null;
    }
    
    autoDiscardInProgressRef.current = false;

    if (isMyTurn && isGameActive && isWSConnected) {
  setTurnTimeRemaining(TURN_TIMEOUT_SECONDS);
      setShowTimeoutModal(true);
      setShowTimeUpMessage(false);

      turnTimerRef.current = setInterval(() => {
        setTurnTimeRemaining((prevTime) => {
          const newTime = prevTime - 1;
          
          if (prevTime <= 1) {
            if (autoDiscardInProgressRef.current) {
              return 0;
            }
            
            clearInterval(turnTimerRef.current);
            turnTimerRef.current = null;
            setShowTimeUpMessage(true);
            autoDiscardInProgressRef.current = true;
            handleAutomaticDiscard();
            
            return 0;
          }
          return newTime;
        });
      }, 1000);
    } else {
      setShowTimeoutModal((prev) => showTimeUpMessage ? true : false);
  setTurnTimeRemaining(TURN_TIMEOUT_SECONDS);
    }

    return () => {
      if (turnTimerRef.current) {
        clearInterval(turnTimerRef.current);
        turnTimerRef.current = null;
      }
    };
  }, [gameState.currentTurn, currentUserId, gameState.gamePhase, isConnected]);

  useEffect(() => {
    // No ejecutar si el juego ya terminó
    if (gameEndedRef.current || gameState.gamePhase === "ended") {
      console.log("Saltando sincronización automática - juego terminado");
      return;
    }
    
    if (gameState.players?.length > 0 && allSecretsRaw?.secretos) {
      console.log("Datos disponibles para sincronización automática");
      setTimeout(() => syncRevealedSecretsByPlayer(), 50);
    }
  }, [gameState.players, allSecretsRaw]);

  const applyRevealToState = ({ targetId, secretId = null, secretoObj = null, skipDedupe = false } = {}) => {
    console.log("applyRevealToState EJECUTÁNDOSE con:", { targetId, secretId, secretoObj, skipDedupe });
    const rawTarget = targetId;
    const numericTarget = Number(rawTarget);
    const normalizedTargetId = !Number.isNaN(numericTarget) ? numericTarget : rawTarget;
    const normalizedSecretId = secretId != null ? (Number(secretId) || secretId) : null;

    if (secretoObj && secretoObj.descripcion) {      
      // Normalizar la descripción para comparación más robusta
      const descripcionNormalizada = secretoObj.descripcion.trim().toLowerCase();
      const esAsesino = descripcionNormalizada === "soy el asesino" || 
                       descripcionNormalizada.includes("asesino") ||
                       descripcionNormalizada === "i'm the murderer" ||
                       descripcionNormalizada.includes("murderer");
      
      if (esAsesino) {
        console.log("¡ASESINO DETECTADO! Terminando partida...");
        // Marcar que el juego ha terminado para evitar actualizaciones posteriores
        gameEndedRef.current = true;
        
        setGameState((prev) => ({
          ...prev,
          gamePhase: "ended",
          endedReason: "asesino_revelado",
          winnerName: " Los Detectives",
        }));
        toast.success("¡El asesino ha sido descubierto!", { duration: 6000 });
        setSecretoEnModal(secretoObj);
        
        // Forzar un return inmediato para evitar procesamiento adicional
        console.log("RETURN EARLY - Asesino detectado, evitando procesamiento adicional");
        return true;
      }
    }

    // Aplicar deduplicación DESPUÉS de verificar el asesino
    if (!skipDedupe && normalizedSecretId != null) {
      if (lastRevealedSecretIdRef.current === normalizedSecretId) {
        console.debug("applyRevealToState: duplicate reveal ignored:", normalizedSecretId);
        return false;
      }
      lastRevealedSecretIdRef.current = normalizedSecretId;
    }
    
    if (secretoObj) setSecretoEnModal(secretoObj);

    setGameState((prev) => {
      const jugadoresPrevios = Array.isArray(prev.players) ? prev.players : [];
      const secretosPrevios = Array.isArray(prev.secrets) ? prev.secrets : [];
      let foundPlayer = false;
      const nuevosJugadores = jugadoresPrevios.map((player) => {
        const playerIdNumber = Number(player.id);
        const playerId = Number.isNaN(playerIdNumber) ? player.id : playerIdNumber;
        if (playerId !== normalizedTargetId) return player;
        foundPlayer = true;
        const currentRevealed = Number(player.secretsRevealed ?? player.secrets_revelados ?? 0);
        const newRevealed = currentRevealed + 1;
        return {
          ...player,
          secretsRevealed: newRevealed,
          secrets_revelados: newRevealed,
        };
      });

      if (!foundPlayer) return prev;

      const shouldUpdateSecrets = Number(normalizedTargetId) === Number(currentUserId) && normalizedSecretId != null;

      const nuevosSecretos = shouldUpdateSecrets
        ? secretosPrevios.map((secret) => {
            const localSecretIdNumber = Number(secret?.secreto_id ?? secret?.id ?? secret?.secretoId);
            const localSecretId = !Number.isNaN(localSecretIdNumber)
              ? localSecretIdNumber
              : secret?.secreto_id ?? secret?.id ?? secret?.secretoId;
            if (normalizedSecretId != null && !Number.isNaN(localSecretIdNumber)) {
              return localSecretId === Number(normalizedSecretId)
                ? { ...secret, revealed: true, revelado: true }
                : secret;
            }
            const localRaw = secret?.secreto_id ?? secret?.id ?? secret?.secretoId;
            return localRaw === secretId ? { ...secret, revealed: true, revelado: true } : secret;
          })
        : secretosPrevios;

      return {
        ...prev,
        players: nuevosJugadores,
        secrets: nuevosSecretos,
      };
    });
    
    // Actualizar revealedSecretsByPlayer después de revelar
    // Refrescar secretos desde el servidor para actualizar la lista de revelados
    setTimeout(async () => {
      try {
        const secretosRes = await get(`/partidas/${gameData.id}/secretos`);
        const revealedByPlayer = normalizeRevealedSecretsByPlayer(secretosRes);
        setRevealedSecretsByPlayer(revealedByPlayer);
        console.log("revealedSecretsByPlayer actualizado después de revelar:", revealedByPlayer);
      } catch (error) {
        console.error("Error al refrescar secretos revelados:", error);
      }
    }, 300);
    
    // Verificar cambios en el estado de desgracia social después de actualizar
    setGameState((prev) => {
      const newPlayersInDisgrace = checkSocialDisgraceStatus(prev.players);
      const { enteredDisgrace, exitedDisgrace } = detectSocialDisgraceChanges(newPlayersInDisgrace);
      
      // Manejar notificaciones de cambios
      if (enteredDisgrace.size > 0 || exitedDisgrace.size > 0) {
        handleSocialDisgraceNotifications(enteredDisgrace, exitedDisgrace, prev.players);
        setPlayersInSocialDisgrace(newPlayersInDisgrace);
      }
      
      return prev;
    });
    
    return true;
  };

  const applyHideToState = ({ targetId, secretId = null, secretoObj = null } = {}) => {
    const rawTarget = targetId;
    const numericTarget = Number(rawTarget);
    const normalizedTargetId = !Number.isNaN(numericTarget) ? numericTarget : rawTarget;
    const normalizedSecretId = secretId != null ? (Number(secretId) || secretId) : null;

    setGameState((prev) => {
      const jugadoresPrevios = Array.isArray(prev.players) ? prev.players : [];
      const secretosPrevios = Array.isArray(prev.secrets) ? prev.secrets : [];
      let foundPlayer = false;
      
      const nuevosJugadores = jugadoresPrevios.map((player) => {
        const playerIdNumber = Number(player.id);
        const playerId = Number.isNaN(playerIdNumber) ? player.id : playerIdNumber;
        if (playerId !== normalizedTargetId) return player;
        foundPlayer = true;
        const currentRevealed = Number(player.secretsRevealed ?? player.secrets_revelados ?? 0);
        const newRevealed = Math.max(0, currentRevealed - 1); // No puede ser negativo
        return {
          ...player,
          secretsRevealed: newRevealed,
          secrets_revelados: newRevealed,
        };
      });

      if (!foundPlayer) return prev;

      const shouldUpdateSecrets = Number(normalizedTargetId) === Number(currentUserId) && normalizedSecretId != null;

      const nuevosSecretos = shouldUpdateSecrets
        ? secretosPrevios.map((secret) => {
            const localSecretIdNumber = Number(secret?.secreto_id ?? secret?.id ?? secret?.secretoId);
            const localSecretId = !Number.isNaN(localSecretIdNumber)
              ? localSecretIdNumber
              : secret?.secreto_id ?? secret?.id ?? secret?.secretoId;
            if (normalizedSecretId != null && !Number.isNaN(localSecretIdNumber)) {
              return localSecretId === Number(normalizedSecretId)
                ? { ...secret, revealed: false, revelado: false }
                : secret;
            }
            const localRaw = secret?.secreto_id ?? secret?.id ?? secret?.secretoId;
            return localRaw === secretId ? { ...secret, revealed: false, revelado: false } : secret;
          })
        : secretosPrevios;

      return {
        ...prev,
        players: nuevosJugadores,
        secrets: nuevosSecretos,
      };
    });
    
    // Verificar cambios en el estado de desgracia social después de actualizar
    setGameState((prev) => {
      const newPlayersInDisgrace = checkSocialDisgraceStatus(prev.players);
      const { enteredDisgrace, exitedDisgrace } = detectSocialDisgraceChanges(newPlayersInDisgrace);
      
      // Manejar notificaciones de cambios
      if (enteredDisgrace.size > 0 || exitedDisgrace.size > 0) {
        handleSocialDisgraceNotifications(enteredDisgrace, exitedDisgrace, prev.players);
        setPlayersInSocialDisgrace(newPlayersInDisgrace);
      }
      
      return prev;
    });
    
    return true;
  };

  useEffect(() => {
    console.log("Tablero inicializado con:", gameData);
    let isCancelled = false;
    let startTimeoutId;
    let postInitTimeoutId;

    const applyMazosState = async ({ prefetchedEstado = null, allowDraftUpdate = false } = {}) => {
      try {
        const estadoResponse =
          prefetchedEstado ?? (await get(`/partidas/${gameData.id}/cartas/estado`));
        console.log("Estado de mazos:", estadoResponse);
        const descarte = Array.isArray(estadoResponse?.mazoDescarte)
          ? estadoResponse.mazoDescarte
          : undefined;
        const draftSource =
          estadoResponse?.mazoDraft ??
          estadoResponse?.draft ??
          estadoResponse?.draftState ??
          estadoResponse?.draftCards ??
          estadoResponse?.draft_cards ??
          null;
        const draft = normalizeDraft(draftSource);
        if (isCancelled) {
          return { draft, descarte };
        }
        setGameState((prev) => {
          const nextState = {
            ...prev,
            descarte: descarte ?? prev.descarte,
          };
          if (allowDraftUpdate && draft.length > 0) {
            const prevDraftIds = Array.isArray(prev.draft)
              ? prev.draft.map((card) => card.carta_id)
              : [];
            const nextDraftIds = draft.map((card) => card.carta_id);
            const draftsAreEqual =
              prevDraftIds.length === nextDraftIds.length &&
              prevDraftIds.every((id, index) => id === nextDraftIds[index]);
            if (!draftsAreEqual) {
              nextState.draft = draft;
            }
          }
          return nextState;
        });
        return { draft, descarte };
      } catch (fallbackError) {
        if (!isCancelled) {
          console.error("Error obteniendo estado de mazos:", fallbackError);
        }
        return { draft: [], descarte: [] };
      }
    };

    const loadSecretos = async (maxRetries = 3, delay = 2000) => {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        if (isCancelled) return [];
        try {
          const response = await get(`/partidas/${gameData.id}/secretos`);
          console.log("Response de secretos:", response);
          setAllSecretsRaw(response);
          const secrets = normalizeSecrets(response, currentUserId);
          const revealedByPlayer = normalizeRevealedSecretsByPlayer(response);
          console.log("revealedByPlayer calculado:", revealedByPlayer);
          // actualizar el grouping aunque secrets del usuario sean vacíos
          setRevealedSecretsByPlayer(revealedByPlayer);
          
          // Sincronizar con el estado local de jugadores
          setTimeout(() => syncRevealedSecretsByPlayer(), 100);
          if (secrets.length > 0) {
            if (isCancelled) return [];
            console.log("Secretos cargados exitosamente:", secrets);
            setGameState((prev) => ({
              ...prev,
              secrets,
            }));
            return secrets;
          }
          if (attempt < maxRetries) {
            console.log(
              `No se encontraron secretos en intento ${attempt}, reintentando en ${delay}ms...`,
            );
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        } catch (error) {
          if (!isCancelled) {
            console.error(`Error en intento ${attempt} de cargar secretos:`, error);
          }
          if (attempt < maxRetries) {
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      }
      if (!isCancelled) {
        console.warn("No se pudieron cargar los secretos después de todos los intentos");
      }
      return [];
    };

    const loadDraft = async (maxRetries = 3, delay = 2000) => {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        if (isCancelled) return [];
        try {
          console.log(`Intento ${attempt} de cargar draft...`);
          const response = await get(`/partidas/${gameData.id}/cartas/estado`);
          const draftSource =
            response?.mazoDraft ??
            response?.draft ??
            response?.draftState ??
            response?.draftCards ??
            response?.draft_cards ??
            null;
          const draft = normalizeDraft(draftSource);
          if (draft.length > 0) {
            if (isCancelled) return [];
            setGameState((prev) => {
              const prevDraftIds = Array.isArray(prev.draft)
                ? prev.draft.map((card) => card.carta_id)
                : [];
              const nextDraftIds = draft.map((card) => card.carta_id);
              const draftsAreEqual =
                prevDraftIds.length === nextDraftIds.length &&
                prevDraftIds.every((id, index) => id === nextDraftIds[index]);
              if (draftsAreEqual) {
                return prev;
              }
              return {
                ...prev,
                draft,
              };
            });
            return draft;
          }
          if (attempt < maxRetries) {
            console.log(
              `Draft vacío en intento ${attempt}, reintentando en ${delay}ms...`,
            );
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        } catch (error) {
          if (!isCancelled) {
            console.error(`Error en intento ${attempt} de cargar draft:`, error);
          }
          if (attempt < maxRetries) {
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      }
      if (!isCancelled) {
        console.warn("No se pudo cargar el draft después de todos los intentos");
      }
      return [];
    };

    const initializeGame = async () => {
      if (isCancelled) return;
      setGameState((prev) => {
        const normalizedPlayers = normalizePlayers(gameData?.players ?? prev.players);
        return {
          ...prev,
          gamePhase: "playing",
          players: mergePlayersWithKnownReveals(normalizedPlayers, prev.players),
        };
      });
      setHasDiscardedThisTurn(false);
      hasDiscardedThisTurnRef.current = false;
      let estadoResponse = null;
      let initialDraft = [];
      try {
        console.log("Obteniendo cartas iniciales por HTTP para jugador:", currentUserId);
        estadoResponse = await get(`/partidas/${gameData.id}/cartas/estado`);
        const playerHand =
          !Number.isNaN(currentUserId) && estadoResponse?.hands?.[currentUserId]
            ? estadoResponse.hands[currentUserId]
            : null;
        const draftSource =
          estadoResponse?.mazoDraft ??
          estadoResponse?.draft ??
          estadoResponse?.draftState ??
          estadoResponse?.draftCards ??
          estadoResponse?.draft_cards ??
          null;
        initialDraft = normalizeDraft(draftSource);
        const initialDescarte = Array.isArray(estadoResponse?.mazoDescarte)
          ? estadoResponse.mazoDescarte
          : undefined;
        if (isCancelled) return;
        setGameState((prev) => {
          const nextState = { ...prev };
          if (Array.isArray(playerHand)) {
            console.log("Cartas obtenidas por HTTP:", playerHand);
            nextState.cards = playerHand;
          } else {
            console.warn("No se encontraron cartas para este jugador");
          }
          if (initialDraft.length > 0) {
            nextState.draft = initialDraft;
          }
          if (initialDescarte) { 
            nextState.descarte = initialDescarte;
          }
          return nextState;
        });
      } catch (error) {
        if (!isCancelled) {
          console.error("Error obteniendo cartas iniciales:", error);
        }
      } finally {
        await applyMazosState({
          prefetchedEstado: estadoResponse,
          allowDraftUpdate: initialDraft.length === 0,
        });
        postInitTimeoutId = setTimeout(() => {
          if (isCancelled) return;
          loadSecretos();
          loadDraft();
        }, 1500);
      }
    };

    startTimeoutId = setTimeout(initializeGame, 1000);

    return () => {
      isCancelled = true;
      if (startTimeoutId) {
        clearTimeout(startTimeoutId);
      }
      if (postInitTimeoutId) {
        clearTimeout(postInitTimeoutId);
      }
    };
  }, [gameData, currentUserId]);

  useEffect(() => {
    if (!Array.isArray(messages) || messages.length === 0) {
      lastProcessedMessageIndexRef.current = 0;
      return;
    }

    let startIndex = lastProcessedMessageIndexRef.current ?? 0;
    if (startIndex < 0 || startIndex > messages.length) {
      startIndex = 0;
    }

    for (let index = startIndex; index < messages.length; index += 1) {
      const lastMessage = messages[index];
      if (!lastMessage) continue;
      
      // Verificar si el mensaje es de otra partida
      const messageGameId =
        lastMessage.data?.id ?? lastMessage.data?.partidaId ?? lastMessage.data?.partida_id;
      console.log("🔍 FILTRO DEBUG:", {
        event: lastMessage.event,
        messageGameId,
        expectedGameId: gameData.id,
        willFilter: messageGameId && messageGameId !== gameData.id,
        dataKeys: Object.keys(lastMessage.data || {}),
      });
      
      if (messageGameId && messageGameId !== gameData.id) {
        console.log(
          "Ignorando mensaje de otra partida:",
          lastMessage.event,
          "- messageGameId:",
          messageGameId,
          "vs gameData.id:",
          gameData.id,
        );
        continue;
      }

      console.log("Mensaje recibido en tablero:", lastMessage);
      console.log("Evento WebSocket:", lastMessage.event, "Datos:", lastMessage.data);

    const handleCardTradeProposalPayload = (payload, sourceTag = lastMessage.event ?? "card_trade_proposed") => {
      const normalizedPayload = payload || {};
      const payloadGameId =
        normalizedPayload.partidaId ?? normalizedPayload.partida_id ?? normalizedPayload.id ?? null;
      if (payloadGameId && payloadGameId !== gameData.id) {
        console.log(`[${sourceTag}] Propuesta para otra partida, se ignora.`, {
          payloadGameId,
          currentGameId: gameData.id,
        });
        return;
      }

      const requesterId =
        normalizedPayload.requesterId ?? normalizedPayload.jugadorId ?? normalizedPayload.jugador_origen_id ?? null;
      const targetId =
        normalizedPayload.targetPlayerId ??
        normalizedPayload.jugadorObjetivoId ??
        normalizedPayload.jugador_objetivo_id ??
        null;

      console.log(`[${sourceTag}] WS card_trade_proposed recibido:`, {
        requesterId,
        targetId,
        currentUserId,
        raw: normalizedPayload,
      });

      if (Number(targetId) !== Number(currentUserId)) {
        return;
      }

      (async () => {
        try {
          const requesterPlayer = Array.isArray(gameState.players)
            ? gameState.players.find((p) => Number(p.id) === Number(requesterId))
            : null;
          const requesterName = requesterPlayer?.nombre ?? requesterPlayer?.username ?? `Jugador ${requesterId}`;

          let myCards = Array.isArray(gameState.cards) ? gameState.cards : [];
          if ((!Array.isArray(myCards) || myCards.length === 0) && typeof get === "function") {
            console.log(`[${sourceTag}] No hay cartas locales para el target, usando fallback GET /cartas/estado`);
            try {
              const stateRes = await get(`/partidas/${gameData.id}/cartas/estado`);
              const hands = stateRes?.hands ?? stateRes?.mano ?? null;
              if (hands) {
                const fetched = hands[currentUserId] ?? hands[String(currentUserId)] ?? null;
                console.log(`[${sourceTag}] Manos recuperadas del fallback:`, { fetched });
                if (Array.isArray(fetched)) myCards = fetched;
              }
            } catch (fetchErr) {
              console.warn(`[${sourceTag}] No se pudieron obtener cartas para el target desde el servidor:`, fetchErr);
            }
          }

          const metaPayload = { ...normalizedPayload, sourceEvent: sourceTag };
          const offeredNameKey = String(
            normalizedPayload.offeredCardName ??
              normalizedPayload.nombreCartaOfrecida ??
              normalizedPayload.cardName ??
              normalizedPayload.nombre ??
              "",
          )
            .trim()
            .toLowerCase();

          if (offeredNameKey.includes("social faux")) {
            toast("Recibiste Social Faux Pas. Debes revelar un secreto.", { icon: "🎭" });
            const fetchedSecrets = await loadCurrentPlayerSecrets();
            const secretsList =
              (Array.isArray(fetchedSecrets) && fetchedSecrets.length > 0
                ? fetchedSecrets
                : Array.isArray(gameState.secrets)
                ? gameState.secrets
                : []) || [];
            if (Array.isArray(secretsList) && secretsList.length > 0) {
              metaPayload.mySecrets = secretsList;
            }
          }

          console.log(
            `[${sourceTag}] card_trade_proposed: seteando incomingEvent, cartas:`,
            Array.isArray(myCards) ? myCards.length : 0,
          );
          setIncomingEvent({
            type: "card_trade",
            requesterId: requesterId != null ? Number(requesterId) : null,
            requesterName,
            cardName: normalizedPayload.cardName ?? normalizedPayload.nombre ?? "Card Trade",
            offeredCardName: normalizedPayload.offeredCardName ?? normalizedPayload.nombreCartaOfrecida ?? null,
            offeredCardId: normalizedPayload.offeredCardId ?? normalizedPayload.cartaOfrecidaId ?? null,
            eventId:
              normalizedPayload.eventoId ??
              normalizedPayload.cardId ??
              normalizedPayload.cartaEventoId ??
              normalizedPayload.eventId ??
              null,
            playerCards: myCards,
            requestId: normalizedPayload.requestId ?? normalizedPayload.requesterRequestId ?? null,
            meta: metaPayload,
          });
          console.log(`[${sourceTag}] card_trade_proposed: incomingEvent seteado`);
        } catch (err) {
          console.error(`[${sourceTag}] Error manejando card_trade_proposed:`, err);
        }
      })();
    };

      switch (lastMessage.event) {
      case "estado_lobby": {
        const payload = lastMessage.data || {};
        const nextTurnCandidate =
          payload.turno_actual !== undefined ? Number(payload.turno_actual) : NaN;

        setGameState((prev) => {
          const basePlayers = normalizePlayers(payload.players ?? prev.players ?? []);
          const mergedPlayers = mergePlayersWithKnownReveals(basePlayers, prev.players);
          return {
            ...prev,
            players: mergedPlayers,
            currentTurn:
              payload.turno_actual !== undefined && !Number.isNaN(nextTurnCandidate)
                ? nextTurnCandidate
                : prev.currentTurn,
          };
        });

        if (payload.turno_actual !== undefined) {
          setHasDiscardedThisTurn(false);
          hasDiscardedThisTurnRef.current = false;
          if (!Number.isNaN(nextTurnCandidate)) {
            const playersForStatus = payload.players ?? gameState.players ?? [];
            const actorName = getPlayerNameById(playersForStatus, nextTurnCandidate);
            setStatusMessage((prevStatus) =>
              prevStatus?.type === "event" && Number(prevStatus.actorId) === nextTurnCandidate
                ? prevStatus
                : {
                    type: "turn",
                    actorId: nextTurnCandidate,
                    actorName,
                    cardName: null,
                    timestamp: Date.now(),
                  },
            );
          }
        }
        setTimeout(() => syncRevealedSecretsByPlayer(), 100);
        break;
      }
      case "turno_cambiado": {
        const payload = lastMessage.data || {};
        if (payload.partida_id !== gameData.id) break;
        const nextTurnCandidate =
          payload.turno_actual !== undefined ? Number(payload.turno_actual) : NaN;
        setGameState((prev) => ({
          ...prev,
          currentTurn:
            payload.turno_actual !== undefined && !Number.isNaN(nextTurnCandidate)
              ? nextTurnCandidate
              : prev.currentTurn,
        }));
        setHasDiscardedThisTurn(false);
        hasDiscardedThisTurnRef.current = false;
        if (!Number.isNaN(nextTurnCandidate)) {
          const actorName = getPlayerNameById(gameState.players, nextTurnCandidate);
          setStatusMessage({
            type: "turn",
            actorId: nextTurnCandidate,
            actorName,
            cardName: null,
            timestamp: Date.now(),
          });
        }
        break;
      }
      case "cartas_repartidas": {
        const payload = lastMessage.data || {};
        if (!Number.isNaN(currentUserId)) {
          const playerCards = payload.hands?.[currentUserId];
          const draftSource =
            payload.draft ??
            payload.draftState ??
            payload.draft_cards ??
            payload.draftCards ??
            payload.mazoDraft ??
            null;
          const draft = normalizeDraft(draftSource);
          const secrets = normalizeSecrets(payload, currentUserId);
          // actualizar grouping de secretos revelados
          const revealedByPlayer = normalizeRevealedSecretsByPlayer(payload);
          setRevealedSecretsByPlayer(revealedByPlayer);
          if (!playerCards && secrets.length === 0 && draft.length === 0) break;
          setGameState((prev) => ({
            ...prev,
            cards: Array.isArray(playerCards) ? playerCards : prev.cards,
            draft: draft.length > 0 ? draft : prev.draft,
            secrets: secrets.length > 0 ? secrets : prev.secrets,
          }));
        }
        break;
      }
      case "cartas_en_mano":
      case "mano_actualizada": {
        // Handler para actualización de manos (usado por eventos como Card Trade)
        const payload = lastMessage.data || {};
        console.log(" Evento recibido:", lastMessage.event, "Payload completo:", payload);
        if (!Number.isNaN(currentUserId)) {
          // Intentar con número y con string (JSON convierte claves a string)
          const playerCards = 
            payload.hands?.[currentUserId] ?? 
            payload.hands?.[String(currentUserId)] ?? 
            payload[currentUserId] ?? 
            payload[String(currentUserId)];
          console.log(" Cartas para jugador", currentUserId, ":", playerCards);
          if (playerCards && Array.isArray(playerCards)) {
            console.log(" Actualizando mano del jugador:", { currentUserId, cantidadCartas: playerCards.length });
            if (deadCardFollyState.status !== "idle") {
              const previousCards = Array.isArray(gameState.cards) ? gameState.cards : [];
              const previousIds = new Set(previousCards.map((card) => Number(card?.carta_id ?? card?.id)));
              const gainedCard = playerCards.find((card) => !previousIds.has(Number(card?.carta_id ?? card?.id)));
              setDeadCardFollyState((prev) => {
                if (!prev || prev.status === "idle") return prev;
                if (prev.privateToastShown && gainedCard && prev.receivedCard?.carta_id === gainedCard.carta_id) {
                  return prev;
                }
                return {
                  ...prev,
                  status: "completed",
                  receivedCard: gainedCard ?? prev.receivedCard ?? null,
                  resolvedAt: Date.now(),
                  privateToastShown: true,
                };
              });
              setDeadCardFollyLocked(false);
              if (gainedCard) {
                toast.success(`Recibiste ${gainedCard.nombre} de Dead Card Folly.`, {
                  icon: "🃏",
                });
              }
            }

            setGameState((prev) => ({
              ...prev,
              cards: playerCards,
            }));
          } else {
            console.warn(" No se encontraron cartas para el jugador", currentUserId, "en payload:", payload);
            const payloadGameId = payload.partidaId ?? payload.partida_id ?? payload.id ?? null;
            const shouldForceRefresh = payloadGameId === gameData.id && payload.hands;
            if (shouldForceRefresh) {
              console.log(" Forzando refresh de mano/mazos tras cartas_en_mano sin datos específicos.");
              refreshPlayerHand();
              updateMazosState();
            }
          }
        }
        break;
      }
      case "secretos_repartidos": {
        const payload = lastMessage.data || {};
        const payloadGameId = payload.partidaId ?? payload.partida_id ?? payload.id;
        if (payloadGameId && payloadGameId !== gameData.id) break;
        const secrets = normalizeSecrets(payload, currentUserId);
        if (secrets.length === 0) break;
        setGameState((prev) => ({
          ...prev,
          secrets,
        }));
        // actualizar grouping de secretos revelados
        setRevealedSecretsByPlayer(normalizeRevealedSecretsByPlayer(payload));
        break;
      }
      case "draft_actualizado": {
        const payload = lastMessage.data || {};
        const payloadGameId = payload.partidaId ?? payload.partida_id ?? payload.id;
        if (payloadGameId && payloadGameId !== gameData.id) break;
        setGameState((prev) => ({
          ...prev,
          draft: normalizeDraft(payload),
        }));
        break;
      }
      case "cartas_robadas": {
        const payload = lastMessage.data || {};
        if (payload.jugadorId !== currentUserId || !Array.isArray(payload.cartas)) break;
        setGameState((prev) => {
          const currentCards = Array.isArray(prev.cards) ? prev.cards : [];
          const nextCards = [...currentCards];
          for (const carta of payload.cartas) {
            if (!nextCards.some((c) => c.carta_id === carta.carta_id)) {
              nextCards.push(carta);
            }
          }
          if (nextCards.length > 6 && currentCards.length < 6) {
            toast.error("Limite de cartas alcanzado (6/6)");
          }
          return {
            ...prev,
            cards: nextCards.slice(0, 6),
          };
        });
        break;
      }
      case "carta_descartada": {
        const payload = lastMessage.data || {};
        const cardRaw =
          payload.carta ??
          payload.cartaDescartada ??
          payload.carta_descartada ??
          findCardInPayload(payload);
        const card = normalizeCardFromPayload(cardRaw);
        const cardId = getCardIdFromObject(card);
        if (!card || cardId == null) {
          console.warn("carta_descartada recibido sin carta reconocible:", payload);
          break;
        }

        setGameState((prev) => {
          const currentDiscard = Array.isArray(prev.descarte) ? prev.descarte : [];
          const alreadyPresent = currentDiscard.some((c) => c.carta_id === cardId);
          const nextDiscard = alreadyPresent ? currentDiscard : [...currentDiscard, card];
          const nextHand = Array.isArray(prev.cards)
            ? prev.cards.filter((handCard) => handCard.carta_id !== cardId)
            : prev.cards;
          return {
            ...prev,
            descarte: nextDiscard,
            cards: nextHand,
          };
        });
        break;
      }
      case "cartas_descartadas": {
        const payload = lastMessage.data || {};
        console.log("CARTAS_DESCARTADAS - Payload completo:", payload);
        if (Array.isArray(payload.cartas)) {
          console.log(
            "CARTAS_DESCARTADAS - Cartas a agregar:",
            payload.cartas.map((c) => `${c.nombre} (ID: ${c.carta_id})`),
          );
          setGameState((prev) => {
            const baseDescarte = Array.isArray(prev.descarte) ? [...prev.descarte] : [];
            const seen = new Set(
              baseDescarte
                .map((card) => Number(card?.carta_id ?? card?.id ?? card?.cartaId))
                .filter((id) => !Number.isNaN(id)),
            );

            const cartasNuevas = [];
            const cartasDuplicadas = [];

            payload.cartas.forEach((card) => {
              const cardId = Number(card?.carta_id ?? card?.id ?? card?.cartaId);
              if (!Number.isNaN(cardId) && seen.has(cardId)) {
                cartasDuplicadas.push(card);
                return;
              }
              if (!Number.isNaN(cardId)) {
                seen.add(cardId);
              }
              cartasNuevas.push(card);
            });

            const nuevoDescarte = [...baseDescarte, ...cartasNuevas];

            console.log("CARTAS_DESCARTADAS - Descarte anterior:", prev.descarte?.length || 0);
            console.log("CARTAS_DESCARTADAS - Cartas en payload:", payload.cartas.length);
            console.log("CARTAS_DESCARTADAS - Cartas nuevas (sin duplicados):", cartasNuevas.length);

            if (cartasDuplicadas.length > 0) {
              console.log(
                "🛡️ CARTAS_DESCARTADAS - Se filtraron",
                cartasDuplicadas.length,
                "cartas duplicadas",
              );
              console.log(
                "🛡️ Cartas filtradas (duplicadas):",
                cartasDuplicadas.map((c) => `${c.nombre} (ID: ${c.carta_id ?? c.id ?? c.cartaId})`),
              );
            }

            if (nuevoDescarte.length > 0) {
              console.log(
                "CARTAS_DESCARTADAS - Ultimas cartas:",
                nuevoDescarte.slice(-3).map((c) => c.nombre),
              );
            }

            const cartasNuevasIds = new Set(
              cartasNuevas
                .map((card) => Number(card?.carta_id ?? card?.id ?? card?.cartaId))
                .filter((id) => !Number.isNaN(id)),
            );

            return {
              ...prev,
              descarte: nuevoDescarte,
              cards: Array.isArray(prev.cards)
                ? prev.cards.filter((card) => !cartasNuevasIds.has(Number(card?.carta_id)))
                : prev.cards,
            };
          });
        } else {
          const singleCardRaw =
            payload.carta ??
            payload.cartaDescartada ??
            payload.carta_descartada ??
            findCardInPayload(payload);
          const singleCard = normalizeCardFromPayload(singleCardRaw);
          const singleCardId = getCardIdFromObject(singleCard);

          if (!singleCard || singleCardId == null) {
            console.warn("CARTAS_DESCARTADAS - Sin datos de carta reconocibles en payload:", payload);
            break;
          }

          setGameState((prev) => {
            const currentDiscard = Array.isArray(prev.descarte) ? prev.descarte : [];
            const alreadyPresent = currentDiscard.some((carta) => carta.carta_id === singleCardId);
            const nextDiscard = alreadyPresent ? currentDiscard : [...currentDiscard, singleCard];
            const nextHand = Array.isArray(prev.cards)
              ? prev.cards.filter((card) => card.carta_id !== singleCardId)
              : prev.cards;
            return {
              ...prev,
              descarte: nextDiscard,
              cards: nextHand,
            };
          });
        }
        break;
      }
      case "evento_en_curso": {
        const payload = lastMessage.data || {};
        const actorIdRaw =
          payload.jugadorId ??
          payload.jugador_id ??
          payload.jugador?.jugador_id ??
          payload.jugador?.id ??
          null;
        const actorIdNumeric = actorIdRaw != null ? Number(actorIdRaw) : NaN;
        const normalizedActorId = Number.isNaN(actorIdNumeric) ? null : actorIdNumeric;
        const actorNameFromPayload =
          payload.jugador?.username ?? payload.jugador?.nombre ?? null;
        const resolvedActorName =
          actorNameFromPayload ??
          (normalizedActorId != null
            ? getPlayerNameById(gameState.players, normalizedActorId)
            : "Otro jugador");
        const eventName =
          payload.evento ??
          payload.event ??
          payload.cartaNombre ??
          payload.nombre ??
          payload.cardName ??
          null;

        setStatusMessage({
          type: "event",
          actorId: normalizedActorId,
          actorName: resolvedActorName,
          cardName: eventName,
          timestamp: Date.now(),
        });
        break;
      }
      
      case "evento_cancelado": {
        try {
          const rawActor =
            lastMessage.data?.jugadorId ??
            lastMessage.data?.jugadorId ??
            lastMessage.data?.jugador?.jugador_id ??
            lastMessage.data?.jugador?.id ??
            lastMessage.data?.playerId ??
            lastMessage.data?.initiatorId ??
            null;
          const actorId = rawActor != null ? Number(rawActor) : null;
          const actorName =
            lastMessage.data?.jugadorNombre ??
            lastMessage.data?.jugador?.nombre ??
            lastMessage.data?.jugador?.username ??
            (actorId != null ? getPlayerNameById(gameState.players, actorId) : "Jugador");
          
          // Si la cancelación fue iniciada por el mismo cliente, NO sobreescribir
          // su estado local (ya lo actualizamos en announceEventCancelled).
          if (actorId != null && Number(actorId) === Number(currentUserId)) {
            // No hacer nada para no borrar el banner local del actor
            break;
          }

          // Para los demás clientes: setear estado de turno (amarillo esperando movimiento)
          if (actorId != null) {
            setStatusMessage({
              type: "turn",
              actorId,
              actorName,
              cardName: null,
              timestamp: Date.now(),
            });
          }
        } catch (err) {
          console.error("Error manejando evento_cancelado:", err);
        }
        break;
      }

      case "estado_mazos": {
        const payload = lastMessage.data || {};
        console.log("ESTADO_MAZOS recibido - Payload completo:", payload);
        
        // Extraer draft
        const draftSource =
          payload.mazoDraft ??
          payload.draft ??
          payload.draftState ??
          payload.draft_cards ??
          payload.draftCards ??
          null;
        const nextDraft = normalizeDraft(draftSource);
        
        // Extraer descarte (fuente de verdad)
        const newDescarte = Array.isArray(payload.mazoDescarte) ? payload.mazoDescarte : [];
        
        // Extraer mazo de robo
        const newMazoRobo = Array.isArray(payload.mazoRobo) ? payload.mazoRobo : [];
        
        console.log("ESTADO_MAZOS - Mazo Robo:", newMazoRobo.length, "cartas");
        console.log("ESTADO_MAZOS - Descarte:", newDescarte.length, "cartas");
        console.log("ESTADO_MAZOS - Draft:", nextDraft.length, "cartas");
        
        if (newDescarte.length > 0) {
          console.log("ESTADO_MAZOS - Ultimas 3 cartas del descarte:", newDescarte.slice(-3).map(c => c.nombre));
        }
        
        setGameState((prev) => {
          const prevDescarteLength = prev.descarte?.length || 0;
          console.log("ESTADO_MAZOS - Descarte anterior:", prevDescarteLength, "cartas");
          
          // Solo actualizar descarte si el nuevo tiene más o igual cantidad de cartas
          // Esto evita sobrescribir actualizaciones más recientes de cartas_descartadas
          const shouldUpdateDescarte = newDescarte.length >= prevDescarteLength;
          
          if (!shouldUpdateDescarte) {
            console.log("⚠️ ESTADO_MAZOS - NO actualizando descarte (datos más recientes ya presentes):", prevDescarteLength, ">", newDescarte.length);
          }
          
          return {
            ...prev,
            mazoRobo: newMazoRobo,
            descarte: shouldUpdateDescarte ? newDescarte : prev.descarte,
            draft: nextDraft,
          };
        });
        break;
      }
      case "mano_actualizada": {
        const payload = lastMessage.data || {};
        if (payload.jugadorId === currentUserId && Array.isArray(payload.cartas)) {
          setGameState((prev) => ({
            ...prev,
            cards: payload.cartas,
          }));
        }
        break;
      }
      case "secreto_revelado": {
        const payload = lastMessage.data || {};
        console.log("Secreto revelado recibido:", payload);
        handleRevealSecret(payload);
        break;
      }
      case "secreto_ocultado": {
        const payload = lastMessage.data || {};
        console.log("Secreto ocultado recibido:", payload);
        handleHideSecret(payload);
        break;
      }
      
      case "partida_finalizada": {
        const payload = lastMessage.data || {};
        console.log("Evento partida_finalizada recibido:", payload);
        
        if (payload.partidaId === gameData.id) {
          console.log("Terminando partida con motivo:", payload.motivo || payload.reason);
          gameEndedRef.current = true; // Marcar que el juego terminó
          setGameState((prev) => ({
            ...prev,
            gamePhase: "ended",
            endedReason: payload.motivo || payload.reason || null,
          }));
        }
        if (payload.partidaId === gameData.id) {
          // intentar extraer un id de ganador/asesino desde varios campos posibles
          const candidateId =
            payload.asesinoId ??
            payload.asesino_id ??
            payload.asesino ??
            payload.ganador?.id ??
            payload.ganadorId ??
            payload.winnerId ??
            payload.winner?.id ??
            payload.jugadorId ??
            null;
          setGameState((prev) => {
            const players = Array.isArray(prev.players) ? prev.players : [];
            const resolvedName =
              players.find((p) => Number(p.id) === Number(candidateId))?.nombre ??
              players.find((p) => Number(p.id) === Number(candidateId))?.username ??
              null;
            return {
              ...prev,
              gamePhase: "ended",
              endedReason: payload.motivo || payload.reason || null,
              winnerId: candidateId ?? null,
              winnerName: resolvedName,
            };
          });
        }
        break;
      }
      case "partida_finalizada_por_DS": {
        const payload = lastMessage.data || {};
        console.log("Evento partida_finalizada_por_DS recibido:", payload);

        if (payload.partidaId === gameData.id) {
          console.log("Terminando partida por Desgracia Social. Asesino:", payload.asesinoId ?? payload.asesino_id ?? payload.asesino);
          gameEndedRef.current = true; // Marcar que el juego terminó

          const candidateId =
            payload.asesinoId ??
            payload.asesino_id ??
            payload.asesino ??
            payload.asesinoId ??
            null;

          setGameState((prev) => {
            const players = Array.isArray(prev.players) ? prev.players : [];
            const resolvedName =
              players.find((p) => Number(p.id) === Number(candidateId))?.nombre ??
              players.find((p) => Number(p.id) === Number(candidateId))?.username ??
              null;
            return {
              ...prev,
              gamePhase: "ended",
              endedReason: "desgracia_social",
              winnerId: candidateId ?? null,
              winnerName: resolvedName,
            };
          });

          // Marcar en el estado local quienes quedaron en desgracia social (todos excepto el asesino)
          try {
            const otherPlayers = Array.isArray(gameState.players) ? gameState.players : [];
            const newSet = new Set(
              otherPlayers
                .filter((p) => Number(p.id) !== Number(candidateId))
                .map((p) => Number(p.id))
            );
            setPlayersInSocialDisgrace(newSet);
          } catch (err) {
            console.warn("No se pudo actualizar playersInSocialDisgrace localmente:", err);
          }
        }
        break;
      }
      
      case "pedir_revelar_secreto": {
        const payload = lastMessage.data || {};

        if (payload && payload._deadCardFolly) {
          const payloadGameId = payload.partidaId ?? payload.partida_id ?? payload.id;
          if (payloadGameId && payloadGameId !== gameData.id) break;

          if (payload.stage === "failed") {
            setDeadCardFollyLocked(false);
            setDeadCardFollyState((prev) => {
              if (!prev || prev.status === "idle") return prev;
              if (payload.roundId && prev.roundId && payload.roundId !== prev.roundId) return prev;
              return {
                ...prev,
                status: "error",
                submitted: false,
                errorMessage: payload.reason ?? "Dead Card Folly no pudo completarse.",
              };
            });
            toast.error(payload.reason ?? "Dead Card Folly se canceló. Inténtalo nuevamente.");
            break;
          }

          const participants = Array.isArray(payload.participantIds) && payload.participantIds.length > 0
            ? payload.participantIds.map((pid) => Number(pid)).filter((value) => !Number.isNaN(value))
            : Array.isArray(gameState.players)
            ? gameState.players.map((player) => Number(player.id)).filter((value) => !Number.isNaN(value))
            : [];
          if (participants.length === 0) break;
          const initiatorId = payload.initiatorId ?? payload.jugadorId ?? null;
          const roundId = payload.roundId ?? `dcf-${gameData.id}-${Date.now()}`;

          setDeadCardFollyState({
            status: "selecting",
            roundId,
            initiatorId,
            cardId: payload.cardId ?? null,
            cardName: payload.cardName ?? "Dead Card Folly",
            direction: payload.direction ?? DEAD_CARD_FOLLY_DIRECTION,
            participantIds: participants,
            selections: payload.selections ?? {},
            pendingPlayerIds: computePendingDeadCardPlayers(participants, payload.selections ?? {}),
            startedAt: payload.startedAt ?? Date.now(),
            submitted: false,
            receivedCard: null,
            resolvedAt: null,
            globalToastShown: false,
            privateToastShown: false,
            errorMessage: null,
          });
          setDeadCardFollySelection(null);
          setDeadCardFollyLocked(false);

          if (Number(initiatorId) !== Number(currentUserId)) {
            const initiatorName = getPlayerNameById(gameState.players, initiatorId);
            const cardLabel = payload.cardName ?? "Dead Card Folly";
            toast(`${initiatorName} jugó Dead Card Folly. Elegí una carta para entregar.`, {
              icon: "🔁",
            });
            pushEventLog(
              `${initiatorName} jugó "${cardLabel}". Todos deben entregar una carta.`,
              {
                type: "event_dead_card_folly",
                playerId: initiatorId,
                cardName: cardLabel,
                dedupeKey: `dcf_start_${roundId}`,
              },
            );
          }
          break;
        }

        // 🎴 CARD TRADE: Detectar si es una propuesta de intercambio
        if (payload && payload._cardTradeProposal === true) {
          handleCardTradeProposalPayload(payload, "pedir_revelar_secreto");
          break;
        }
        
        // Si NO es Card Trade, continuar con comportamiento original:
        // Comportamiento original: petición para que un jugador revele un secreto
        const rawTargetId =
          payload.jugadorObjetivoId ??
          payload.jugador_id_objetivo ??
          payload.targetPlayerId ??
          (payload.jugadorObjetivo ? payload.jugadorObjetivo.id : null) ??
          null;
        const numericTargetId = Number(rawTargetId);
        const matchesCurrentUser = !Number.isNaN(numericTargetId)
          ? numericTargetId === Number(currentUserId)
          : rawTargetId === currentUserId;

        // Si el servidor incluyó reactionId, se trata de una solicitud de reacción
        // (Not So Fast u otra reacción inmediata). Mostramos el prompt a TODOS
        // los clientes para que puedan jugar Not So Fast. Si NO hay reactionId,
        // entonces es la vieja semántica: pedir al jugador objetivo que revele
        // un secreto (abrir el modal de elegir secreto) — eso solo aplica al
        // usuario objetivo.
        const reactionId = payload.reactionId ?? payload.reaction_id ?? null;
        if (reactionId) {
          const initiatorId =
            payload.jugadorQuePideId ?? payload.jugador_id_que_pide ?? payload.requesterId ?? payload.jugadorQuePide ?? payload.jugadorId ?? payload.jugador_id ?? payload.jugador ?? null;
          const actorName = payload.jugadorNombre ?? payload.jugadorNombre ?? getPlayerNameById(gameState.players, initiatorId);
          // actionSummary puede venir en el payload (cuando lo enviamos desde el actor)
          const actionSummary = payload.actionSummary ?? payload.action_summary ?? payload.action ?? payload.cardName ?? "realizar una acción";
          setReactionPrompt({
            id: reactionId,
            actorId: initiatorId != null ? Number(initiatorId) : null,
            actorName,
            actionSummary,
            blockable: payload.blockable !== false,
            targetName: payload.targetName ?? null,
            expiresAt: payload.expiresAt ?? null,
          });
          setPendingReactionPayload(payload);
        } else if (matchesCurrentUser) {
          // Sin reactionId: pedir al jugador objetivo que elija un secreto para revelar
          setShowRevealSecretModal({
            mode: "choose_secret_to_reveal", // Modo para que yo elija mi secreto
            setName: payload.setName,
            setOwnerId:
              payload.setOwnerId ??
              payload.jugadorObjetivoId ??
              payload.jugador_id_objetivo ??
              null,
            originalPayload: payload,
          });
        }
        break;
      }
      case "not_so_fast": {
        const payload = lastMessage.data || {};
        // limpiar prompt si la reacción fue jugada por otro
        const partidaId = payload.partidaId ?? payload.partida_id ?? null;
        if (!partidaId || partidaId === gameData.id) {
          // limpiar estado pendiente de reacción
          clearPendingReaction();
          const jugadorNombre = payload.jugadorNombre ?? payload.jugadorNombre ?? payload.jugadorId ?? 'Alguien';
          const actorNombre = payload.actorNombre ?? payload.actorNombre ?? payload.actorId ?? 'otro jugador';
          // Si la reacción afecta a Dead Card Folly, cancelar el flujo localmente para no dejar modales abiertos
          try {
            // log para depuración: qué payload vino en el not_so_fast
            console.debug('WS: not_so_fast payload ->', payload);

            const isDeadCardFolly = Boolean(
              payload._deadCardFolly ||
                (payload.cardName && String(payload.cardName).toLowerCase().includes("dead card folly")) ||
                (payload.roundId && deadCardFollyState && deadCardFollyState.roundId && String(payload.roundId) === String(deadCardFollyState.roundId))
            );

            // Si detectamos el caso explícito o si yo soy el iniciador y hay un DCF activo,
            // reiniciamos el flujo local para evitar que el modal quede pegado.
            if (isDeadCardFolly || (deadCardFollyState && deadCardFollyState.status !== 'idle' && Number(deadCardFollyState.initiatorId) === Number(currentUserId))) {
              resetDeadCardFolly();
              setIsWaitingForResponse(false);
              setWaitingMessage(null);
              toast.error(`Dead Card Folly fue cancelado por ${jugadorNombre}`);
            } else {
              toast.success(`${jugadorNombre} jugó 'Not So Fast' y bloqueó la acción de ${actorNombre}`);
            }
          } catch (err) {
            console.error('Error manejando not_so_fast para Dead Card Folly:', err);
            toast.success(`${jugadorNombre} jugó 'Not So Fast' y bloqueó la acción de ${actorNombre}`);
          }
        }
        break;
      }
      case "not_so_fast_jugado": {
        // Handler para el broadcast que envía el backend cuando alguien juega Not So Fast
        const payload = lastMessage.data || {};
        const partidaId = payload.partidaId ?? payload.partida_id ?? null;
        if (!partidaId || partidaId === gameData.id) {
          clearPendingReaction();
          const jugadorNombre = payload.jugadorNombre ?? payload.jugadorNombre ?? payload.jugadorId ?? 'Alguien';
          const actorNombre = payload.actorNombre ?? payload.actorNombre ?? payload.actorId ?? 'otro jugador';
          try {
            const isDeadCardFolly = Boolean(
              payload._deadCardFolly ||
                (payload.cardName && String(payload.cardName).toLowerCase().includes("dead card folly")) ||
                (payload.roundId && deadCardFollyState && deadCardFollyState.roundId && String(payload.roundId) === String(deadCardFollyState.roundId))
            );
            if (isDeadCardFolly) {
              resetDeadCardFolly();
              setIsWaitingForResponse(false);
              setWaitingMessage(null);
              toast.error(`Dead Card Folly fue cancelado por ${jugadorNombre}`);
            } else {
              toast.success(`${jugadorNombre} jugó 'Not So Fast' y bloqueó la acción de ${actorNombre}`);
            }
          } catch (err) {
            console.error('Error manejando not_so_fast_jugado para Dead Card Folly:', err);
            toast.success(`${jugadorNombre} jugó 'Not So Fast' y bloqueó la acción de ${actorNombre}`);
          }
        }
        break;
      }

      case "respuesta_revelar_secreto": {
        const payload = lastMessage.data || {};

        if (payload && payload._deadCardFollySelection) {
          const payloadGameId = payload.partidaId ?? payload.partida_id ?? payload.id;
          if (payloadGameId && payloadGameId !== gameData.id) break;
          const playerId = Number(payload.playerId ?? payload.jugadorId ?? payload.idJugador);
          const cardId = Number(payload.cardId ?? payload.cartaId);
          if (!playerId || Number.isNaN(cardId)) break;

          setDeadCardFollyState((prev) => {
            if (!prev || prev.status === "idle") return prev;
            if (payload.roundId && prev.roundId && payload.roundId !== prev.roundId) return prev;
            const key = String(playerId);
            if (prev.selections[key] === cardId) return prev;
            const selections = { ...prev.selections, [key]: cardId };
            const pendingPlayerIds = computePendingDeadCardPlayers(prev.participantIds, selections);
            const everyoneReady = pendingPlayerIds.length === 0;
            const nextStatus = everyoneReady
              ? Number(prev.initiatorId) === Number(currentUserId)
                ? "ready"
                : "waiting_resolution"
              : prev.status;
            return {
              ...prev,
              selections,
              pendingPlayerIds,
              status: nextStatus,
            };
          });
          break;
        }

        // 🎴 CARD TRADE: Ya no se maneja aquí, se ejecuta directamente en playEventCardTradeResponse
        if (payload && payload._cardTradeResponse === true) {
          console.log("📨 Card Trade: Respuesta recibida (ya procesada)");
          break;
        }
        const original = payload.originalPayload || {};
        const rawRequesterId =
          original.jugadorQuePideId ??
          original.jugador_id_que_pide ??
          original.requesterId ??
          null;
        const numericRequesterId = Number(rawRequesterId);
        const isRequester = !Number.isNaN(numericRequesterId)
          ? numericRequesterId === Number(currentUserId)
          : rawRequesterId === currentUserId;
        const rawTargetId =
          original.jugadorObjetivoId ??
          original.jugador_id_objetivo ??
          original.targetPlayerId ??
          payload.jugadorObjetivoId ??
          payload.jugador_id_objetivo ??
          null;
        const numericTargetId = Number(rawTargetId);
        const targetId = !Number.isNaN(numericTargetId) ? numericTargetId : rawTargetId;
        const resolvedSecretIdRaw =
          payload.secretoIdRevelado ??
          payload.secreto_id_revelado ??
          payload.secretoId ??
          (payload.secreto ? (payload.secreto.secreto_id ?? payload.secreto.id) : null) ??
          null;
        const secretIdNumber = Number(resolvedSecretIdRaw);
        const resolvedSecretId = !Number.isNaN(secretIdNumber) ? secretIdNumber : resolvedSecretIdRaw;
        
        // Extraer objeto secreto completo del payload si está disponible
        const secretoObj = payload.secreto ?? null;
        if (resolvedSecretId != null && lastRevealedSecretIdRef.current === resolvedSecretId) {
          console.debug("Respuesta 'revelar_secreto' duplicada ignorada:", resolvedSecretId);
        } else {
          if (resolvedSecretId != null) lastRevealedSecretIdRef.current = resolvedSecretId;
          setGameState((prev) => {
            const prevPlayers = Array.isArray(prev.players) ? prev.players : [];
            const updatedPlayers = prevPlayers.map((player) => {
              const numericPlayerId = Number(player?.id);
              const comparableId = !Number.isNaN(numericPlayerId) ? numericPlayerId : player?.id;
              if (comparableId !== targetId) return player;
              const currentRevealed = Number(player?.secretsRevealed ?? player?.secrets_revelados ?? 0);
              const secretsCount = Number(player?.secretsCount ?? player?.secrets_count ?? 3);
              const newRevealed = Math.min(currentRevealed + 1, secretsCount);
              return {
                ...player,
                secretsRevealed: newRevealed,
                secrets_revelados: newRevealed,
              };
            });
            const shouldUpdateSecrets = targetId === currentUserId && resolvedSecretId != null;
            const updatedSecrets = shouldUpdateSecrets && Array.isArray(prev.secrets)
              ? prev.secrets.map((secret) => {
                  const localSecretIdNumber = Number(secret?.secreto_id ?? secret?.id ?? secret?.secretoId);
                  const localSecretId = !Number.isNaN(localSecretIdNumber)
                    ? localSecretIdNumber
                    : secret?.secreto_id ?? secret?.id ?? secret?.secretoId;
                  if (localSecretId === resolvedSecretId) {
                    return { ...secret, revealed: true, revelado: true };
                  }
                  return secret;
                })
              : prev.secrets;
            return {
              ...prev,
              players: updatedPlayers,
              secrets: updatedSecrets,
            };
          });
          
          // Mostrar modal informativo del secreto revelado
          if (resolvedSecretId != null) {
            let modalSecretoObj = null;
            
            // Usar objeto del payload si está disponible 
            if (secretoObj && secretoObj.descripcion) {
              modalSecretoObj = secretoObj;
              console.log("Mostrando modal para secreto de set de 2 cartas (desde payload):", modalSecretoObj);
            }
            // Buscar el secreto en allSecretsRaw como respaldo
            else if (allSecretsRaw?.secretos) {
              Object.values(allSecretsRaw.secretos).forEach(playerSecrets => {
                if (Array.isArray(playerSecrets)) {
                  const foundSecret = playerSecrets.find(s => 
                    (s.secreto_id || s.id) === resolvedSecretId
                  );
                  if (foundSecret) {
                    modalSecretoObj = foundSecret;
                  }
                }
              });
              
              if (modalSecretoObj) {
                console.log("Mostrando modal para secreto de set de 2 cartas (desde allSecretsRaw):", modalSecretoObj);
              }
            }
            
          // Mostrar modal si encontramos la información
          if (modalSecretoObj && modalSecretoObj.descripcion) {
            setSecretoEnModal(modalSecretoObj);
          } else {
            console.log(" No se pudo obtener información completa del secreto para el modal:", resolvedSecretId);
          }

          const descripcionFuente =
            modalSecretoObj?.descripcion ??
            secretoObj?.descripcion ??
            "";
          const descripcionLower = descripcionFuente.toLowerCase();
          if (
            descripcionLower.includes("soy el asesino") ||
            descripcionLower.includes("asesino") ||
            descripcionLower.includes("murderer")
          ) {
            if (!gameEndedRef.current) {
              gameEndedRef.current = true;
            }
            setGameState((prev) => {
              if (prev.gamePhase === "ended") return prev;
              return {
                ...prev,
                gamePhase: "ended",
                endedReason: "asesino_revelado",
                winnerName: " Los Detectives",
              };
            });
            toast.success("¡El asesino ha sido descubierto!", { duration: 6000 });
          }
        }

        // Actualizar revealedSecretsByPlayer después de que se revela un secreto
        setTimeout(async () => {
          try {
              // Verificar si el juego ya terminó antes de actualizar
              if (gameEndedRef.current) {
                console.log("Juego ya terminado (ref), saltando refresh de secretos revelados");
                return;
              }
              
              console.log("Refrescando secretos revelados después de respuesta_revelar_secreto...");
              const secretosRes = await get(`/partidas/${gameData.id}/secretos`);
              console.log("Respuesta de /secretos:", secretosRes);
              console.log("Contenido de secretos.secretos:", secretosRes?.secretos);
              const revealedByPlayer = normalizeRevealedSecretsByPlayer(secretosRes);
              console.log("revealedSecretsByPlayer actualizado:", revealedByPlayer);
              setRevealedSecretsByPlayer(revealedByPlayer);
              
              console.log("Actualizando allSecretsRaw con datos frescos");
              setAllSecretsRaw(secretosRes);
            } catch (error) {
              console.error("Error al refrescar secretos revelados:", error);
            }
          }, 300);
        }
        if (isRequester) {
          const resolverAsync = async () => {
            if (original?.accion === "add_detective") {
              if (!pendingDetectiveAction) {
                setIsWaitingForResponse(false);
                setWaitingMessage(null);
                return;
              }
              try {
                await playDetectiveOnSet({
                  cardId: Number(original.cardId),
                  setId: Number(original.setId),
                  setOwnerId: original.setOwnerId ?? pendingDetectiveAction?.setOwnerId,
                  jugadorObjetivoId:
                    original.jugadorObjetivoId ??
                    payload.jugadorObjetivoId ??
                    targetId,
                  secretoIdObjetivo: resolvedSecretId,
                });
              } catch (error) {
                // Error manejado dentro de playDetectiveOnSet
              } finally {
                setIsWaitingForResponse(false);
                setWaitingMessage(null);
              }
            } else {
              try {
                await post(`/partidas/${gameData.id}/jugar-y-resolver-set`, {
                  jugador_id: currentUserId,
                  cartas_ids: original.cardIds,
                  nombre_set: original.setName,
                  jugador_id_objetivo: original.jugadorObjetivoId,
                  secreto_id_objetivo: payload.secretoIdRevelado,
                });
                toast.success("Set jugado con exito!");
              } catch (error) {
                console.error("Error al finalizar la jugada del set:", error);
                toast.error("No se pudo jugar el set.");
              } finally {
                setIsWaitingForResponse(false);
                setWaitingMessage(null);
              }
            }
          };
          resolverAsync();
        }
        break;
      }
      case "set_jugado_y_resuelto": {
        const payload = lastMessage.data || {};
        if (payload.partidaId === gameData.id && payload.set) {
          console.log("Set jugado:", payload.set);
          const setOwnerId = payload.set.owner_id ?? payload.set.ownerId ?? payload.set.jugador_id;
          const ownerName = getPlayerNameById(gameState.players, setOwnerId);
          const setTitle = payload.set.nombre ?? "un set";
          pushEventLog(`${ownerName} bajó ${setTitle}.`, {
            type: "set_played",
            playerId: setOwnerId,
            setId: payload.set.id ?? payload.set.set_id ?? null,
          });
          
          // Si el set es del jugador actual, actualizamos las cartas de la mano
          if (payload.set.owner_id === currentUserId) {
            const setCardIds = Array.isArray(payload.set.cartas) 
              ? payload.set.cartas.map(card => card.carta_id) 
              : [];
              
            // Solo remover las cartas de la mano
            setGameState((prev) => ({
              ...prev,
              cards: Array.isArray(prev.cards) 
                ? prev.cards.filter(card => !setCardIds.includes(card.carta_id))
                : [],
            }));
            
            // Recargar sets desde la API para mantener consistencia
            setTimeout(() => loadAllPlayerSets(), 100);
          } else {
            // Si es de otro jugador, también recargar sets y mostrar notificación
            setTimeout(() => loadAllPlayerSets(), 100);
            const playerName = gameState.players.find(p => p.id === payload.set.owner_id)?.nombre || `Jugador ${payload.set.owner_id}`;
            toast(`${playerName} jugó: ${payload.set.nombre}`, {
              icon: '🎴',
              style: {
                borderRadius: '10px',
                background: '#333',
                color: '#fff',
              },
            });
          }
        }
        break;
      }
      case "carta_agregada_a_set": {
        const payload = lastMessage.data || {};
        if (payload.partidaId !== gameData.id) break;

        const originalSet = payload.set;
        if (!originalSet) break;

        const setIdKey = Number(originalSet.id ?? originalSet.set_id);
        const previousSet = allPlayersSets.find(
          (set) => Number(set?.id ?? set?.set_id) === setIdKey,
        );
        const previousCardIds = new Set(
          Array.isArray(previousSet?.cartas)
            ? previousSet.cartas.map((carta) => carta.carta_id)
            : [],
        );

        let setActualizado = originalSet;
        let nuevaCarta = Array.isArray(setActualizado.cartas)
          ? setActualizado.cartas.find((carta) => !previousCardIds.has(carta.carta_id))
          : null;

        const setOwnerId = Number(
          setActualizado.owner_id ??
            setActualizado.ownerId ??
            setActualizado.jugador_id ??
            setActualizado.owner,
        );

        if (
          !nuevaCarta &&
          pendingDetectiveAction &&
          Number(pendingDetectiveAction.setId) === setIdKey &&
          Number(payload.jugadorQueJugo) === Number(currentUserId)
        ) {
          setActualizado = {
            ...setActualizado,
            cartas: [
              ...(Array.isArray(setActualizado.cartas) ? setActualizado.cartas : []),
              {
                carta_id: Number(pendingDetectiveAction.cardId),
                nombre: pendingDetectiveAction.cardName,
                jugador_id: setOwnerId,
                ubicacion: "set",
                partida_id: gameData.id,
              },
            ],
          };
          nuevaCarta = setActualizado.cartas.find(
            (carta) => Number(carta.carta_id) === Number(pendingDetectiveAction.cardId),
          );
        }

        const esInbloqueable = nuevaCarta
          ? isUnblockableCombination(nuevaCarta, setActualizado)
          : false;
        const cartasEnSet = Array.isArray(setActualizado.cartas)
          ? new Set(setActualizado.cartas.map((carta) => carta.carta_id))
          : new Set();

        if (Number(payload.jugadorQueJugo) === Number(currentUserId)) {
          setGameState((prev) => ({
            ...prev,
            cards: Array.isArray(prev.cards)
              ? prev.cards.filter((card) => !cartasEnSet.has(card.carta_id))
              : prev.cards,
          }));
        }

        if (Number(currentUserId) === setOwnerId) {
          setGameState((prev) => ({
            ...prev,
            playerSets: Array.isArray(prev.playerSets)
              ? prev.playerSets.map((set) =>
                  Number(set?.id ?? set?.set_id) === setIdKey
                    ? {
                        ...set,
                        ...setActualizado,
                        owner_id: setActualizado.owner_id ?? set.owner_id,
                      }
                    : set,
                )
              : prev.playerSets,
          }));
        }
        if (Number(payload.jugadorQueJugo) === Number(currentUserId)) {
          const mensajeExtra = (pendingDetectiveAction?.isUnblockable || esInbloqueable)
            ? " No puede ser bloqueado por Not So Fast."
            : "";
          const cartaLog =
            pendingDetectiveAction?.cardName ?? nuevaCarta?.nombre ?? "un detective";
          toast.success(
            `Agregaste ${cartaLog} a ${setActualizado.nombre} y activaste su efecto.${mensajeExtra}`,
          );
          setPendingDetectiveAction(null);
        } else {
          const jugador = gameState.players.find(
            (player) => Number(player.id) === Number(payload.jugadorQueJugo),
          );
          const jugadorNombre = jugador?.nombre ?? `Jugador ${payload.jugadorQueJugo}`;
          const extraDetalle = esInbloqueable
            ? " No puede ser bloqueado por Not So Fast."
            : "";
          toast(`${jugadorNombre} bajó ${nuevaCarta?.nombre ?? "un detective"} en ${setActualizado.nombre} y activó su efecto.${extraDetalle}`, {
            icon: "🕵️",
          });
        }

        setAllPlayerSets((prev) => {
          if (!Array.isArray(prev)) return prev;
          let replaced = false;
          const updated = prev.map((set) => {
            if (Number(set?.id ?? set?.set_id) === setIdKey) {
              replaced = true;
              return {
                ...set,
                ...setActualizado,
                owner_id: setActualizado.owner_id ?? set.owner_id,
              };
            }
            return set;
          });
          return replaced
            ? updated
            : [
                ...prev,
                {
                  ...setActualizado,
                  owner_id: setActualizado.owner_id ?? payload.jugadorQueJugo,
                },
              ];
        });

        if (Number(payload.jugadorQueJugo) === Number(currentUserId)) {
          setPendingDetectiveAction(null);
        }

        setTimeout(() => loadAllPlayerSets(), 150);

        const jugadorNombre = getPlayerNameById(gameState.players, payload.jugadorQueJugo);
        const cartaNombre = nuevaCarta?.nombre ?? pendingDetectiveAction?.cardName ?? "un detective";
        const setNombre = setActualizado?.nombre ?? "un set";
        pushEventLog(`${jugadorNombre} agregó ${cartaNombre} a ${setNombre}.`, {
          type: "set_update",
          playerId: payload.jugadorQueJugo,
          targetId: setOwnerId,
          dedupeKey: `set_add_${payload.partidaId}_${payload.jugadorQueJugo}_${setIdKey}_${cartaNombre}`,
        });
        break;
      }
      case "set_notification": {
        const payload = lastMessage.data || {};
        if (payload.partidaId === gameData.id && 
            payload.jugadorId !== currentUserId && 
            showSetNotifications) {
          // Solo mostrar notificaciones de otros jugadores
          toast(payload.message || `${payload.jugadorNombre} jugó un set`, {
            icon: '??',
            duration: 3000,
            style: {
              borderRadius: '10px',
              background: '#1f2937',
              color: '#f3f4f6',
              border: '1px solid #3b82f6',
            },
          });
          pushEventLog(payload.message || `${payload.jugadorNombre ?? "Un jugador"} jugó un set.`, {
            type: "set_notice",
            playerId: payload.jugadorId,
            dedupeKey: `set_notice_${payload.partidaId}_${payload.jugadorId}_${payload.setId ?? ""}`,
          });
        }
        break;
      }
      case "mazo_reordenado": {
        const payload = lastMessage.data || {};
        console.log("Mazo reordenado - cartas movidas:", payload.cartasMovidas);
        // Actualizar localmente el descarte eliminando las cartas movidas
        if (Array.isArray(payload.cartasMovidas) && payload.cartasMovidas.length > 0) {
          try {
            const movedIds = payload.cartasMovidas.map((c) => c.carta_id ?? c.id ?? null).filter(Boolean);
            if (movedIds.length > 0) {
              setGameState((prev) => {
                const prevDescarte = Array.isArray(prev.descarte) ? prev.descarte : [];
                const nextDescarte = prevDescarte.filter((c) => !movedIds.includes(c.carta_id ?? c.id));
                console.log("Aplicando mazo_reordenado en frontend - removiendo ids:", movedIds, "-> descarte ahora:", nextDescarte.length);
                return { ...prev, descarte: nextDescarte };
              });
            }
          } catch (e) {
            console.error("Error aplicando mazo_reordenado localmente:", e);
          }
        }
        break;
      }
      case "another_victim_jugado": {
        const payload = lastMessage.data || {};
        console.log("Another Victim jugado:", payload);
        
        if (payload.partidaId === gameData.id) {
          // Recargar sets para reflejar el cambio de ownership
          console.log("Recargando sets después de another_victim_jugado...");
          loadAllPlayerSets();
          
          // Mostrar notificación general
          const ladronName = gameState.players.find(p => p.id === payload.jugadorLadronId)?.nombre || `Jugador ${payload.jugadorLadronId}`;
          const objetivoName = gameState.players.find(p => p.id === payload.jugadorObjetivoId)?.nombre || `Jugador ${payload.jugadorObjetivoId}`;
          
          toast.success(`${ladronName} robó un set de ${objetivoName}: ${payload.setRobado?.nombre || 'Set'}`);
          pushEventLog(`${ladronName} robó ${payload.setRobado?.nombre ?? "un set"} a ${objetivoName}.`, {
            type: "event_special",
            event: "another_victim",
            playerId: payload.jugadorLadronId,
            targetId: payload.jugadorObjetivoId,
            dedupeKey: `another_victim_${payload.partidaId}_${payload.setRobado?.id ?? ""}`,
          });
          
          // Si soy el ladrón, remover la carta Another Victim de mi mano
          if (Number(payload.jugadorLadronId) === Number(currentUserId)) {
            setGameState((prev) => ({
              ...prev,
              cards: Array.isArray(prev.cards) 
                ? prev.cards.filter(card => 
                    !(String(card.nombre ?? "").toLowerCase().includes("another") && 
                      String(card.nombre ?? "").toLowerCase().includes("victim"))
                  )
                : prev.cards
            }));
            // Limpiar selección ya que la carta fue eliminada
            setSelectedIds(new Set());
          }
          
          // Si soy la víctima, mostrar modal informativo
          if (Number(payload.jugadorObjetivoId) === Number(currentUserId)) {
            setIncomingEvent({
              fromPlayerId: Number(payload.jugadorLadronId),
              cardName: "Another Victim",
              meta: {
                ...payload,
                nombre: "Another Victim",
                cartaNombre: "Another Victim"
              },
            });
          }
        }
        break;
      }

      

      case "card_trade_proposed": {
        handleCardTradeProposalPayload(lastMessage.data || {}, "card_trade_proposed");
        break;
      }
      case "dead_card_folly_efectos_pendientes": {
        const payload = lastMessage.data || {};
        const payloadGameId = payload.partidaId ?? payload.partida_id ?? payload.id;
        if (payloadGameId && payloadGameId !== gameData.id) break;
        const efectos = Array.isArray(payload.efectos) ? payload.efectos : [];
        const playersList = Array.isArray(gameState.players) ? gameState.players : [];
        const currentUserNumericId = Number(currentUserId);
        efectos.forEach((efecto) => {
          if (!efecto) return;
          const tipo = efecto.tipo;
          const receptorRaw = Number(efecto.receptorId);
          const pasadorRaw = Number(efecto.pasadorId);
          const receptor = Number.isNaN(receptorRaw) ? null : receptorRaw;
          const pasador = Number.isNaN(pasadorRaw) ? null : pasadorRaw;
          const resolvedPasadorName =
            pasador == null
              ? null
              : playersList.find((p) => Number(p.id) === Number(pasador))?.nombre ?? `Jugador ${pasador}`;
          const resolvedReceptorName =
            receptor == null
              ? null
              : playersList.find((p) => Number(p.id) === Number(receptor))?.nombre ?? `Jugador ${receptor}`;
          if (receptor != null && receptor === currentUserNumericId) {
            if (tipo === "blackmailed") {
             toast(
                `Recibiste Blackmailed debido a Dead Card Folly${
                  resolvedPasadorName ? ` de ${resolvedPasadorName}` : ""
                }.`,
                { icon: "😬" },
              );
              enqueueRevealModal({
                mode: "dead_card_folly_blackmailed",
                setName: "Blackmailed",
                source: "dead_card_folly_blackmailed",
                contextType: "dead_card_folly_blackmailed",
                pasadorId: pasador,
                pasadorName: resolvedPasadorName,
                receptorId: currentUserNumericId,
                receptorName: resolvedReceptorName,
                customMessage: `Dead Card Folly te obliga a compartir en privado un secreto con ${
                  resolvedPasadorName ?? "quien te pasó la carta"
                }. Elegí cuál mostrar.`,
              });
              setIsWaitingForResponse(false);
              setWaitingMessage(null);
            } else if (tipo === "social_faux_pas") {
              toast("Dead Card Folly provocó Social Faux Pas contigo. Revisá tus cartas.", {
                icon: "⚠️",
              });
              (async () => {
                try {
                  await loadCurrentPlayerSecrets();
                } catch (err) {
                  console.warn("No se pudieron refrescar secretos antes de Dead Card Folly Social Faux Pas:", err);
                }
                enqueueRevealModal({
                  mode: "dead_card_folly_social_faux_effect",
                  setName: "Social Faux Pas",
                  source: "dead_card_folly_social_faux_effect",
                  contextType: "dead_card_folly_social_faux_effect",
                  pasadorId: pasador,
                  pasadorName: resolvedPasadorName,
                  receptorId: currentUserNumericId,
                  receptorName: resolvedReceptorName,
                  customMessage:
                    "Dead Card Folly te obliga a revelar un secreto públicamente. Elegí cuál secreto mostrar.",
                });
                setIsWaitingForResponse(false);
                setWaitingMessage(null);
              })();
            }
          } else if (pasador != null && pasador === currentUserNumericId) {
            if (tipo === "blackmailed") {
              toast("Tu carta Blackmailed se activará en quien la recibió.", { icon: "🕵️" });
            } else if (tipo === "social_faux_pas") {
              toast("Social Faux Pas que entregaste afectará al siguiente jugador.", {
                icon: "🎭",
              });
            }
          }
        });
        break;
      }
      case "dead_card_folly_completed": {
        const payload = lastMessage.data || {};
        const payloadGameId = payload.partidaId ?? payload.partida_id ?? payload.id;
        if (payloadGameId && payloadGameId !== gameData.id) break;
        setDeadCardFollyLocked(false);
        setDeadCardFollyState((prev) => {
          if (!prev || prev.status === "idle" || prev.status === "completed" || prev.status === "error") return prev;
          return { ...prev, status: "completed", resolvedAt: prev.resolvedAt ?? Date.now() };
        });
        break;
      }
      case "early_train_jugado": {
        const payload = lastMessage.data || {};
        console.log("Early Train jugado:", payload);
        console.log("Partido actual:", gameData.id, "Partido del evento:", payload.partidaId);
        
        if (payload.partidaId === gameData.id) {       
          // Recargar estado del mazo y descarte
          updateMazosState();
          
          // Mostrar notificación
          const jugadorName = gameState.players.find(p => p.id === payload.jugadorId)?.nombre || `Jugador ${payload.jugadorId}`;
          const cartasMovidas = payload.cartasMovidas || 6;
          
          toast.success(`${jugadorName} jugó Early Train to Paddington: ${cartasMovidas} cartas movidas al descarte`);
          
          // Si yo jugué la carta, actualizar mi mano
          if (Number(payload.jugadorId) === Number(currentUserId)) {
            console.log("Actualizando mi mano después de jugar Early Train");
            setGameState((prev) => ({
              ...prev,
              cards: Array.isArray(prev.cards) 
                ? prev.cards.filter(card => 
                    !(String(card.nombre ?? "").toLowerCase().includes("early") && 
                      String(card.nombre ?? "").toLowerCase().includes("train"))
                  )
                : prev.cards
            }));
            // Limpiar selección ya que la carta fue eliminada
            setSelectedIds(new Set());
          }
        } else {
          console.log("Evento ignorado - diferente partida");
        }
        break;
      }

      case "evento_jugado": {
        const payload = lastMessage.data || {};
        // normalizar nombre y ids
        const objetivo = payload.jugadorObjetivoId ?? payload.jugadorObjetivo ?? payload.targetPlayerId ?? null;
        const jugadorId = payload.jugadorId ?? payload.jugador_id ?? null;
        const nombreEvento = payload.nombre ?? payload.cartaNombre ?? "";
        
        //  CARD TRADE: Detectar cuando el evento se completó para limpiar estado de espera del iniciador
        if (nombreEvento.toLowerCase().includes("card trade") || nombreEvento === "Card Trade") {
          console.log(" Card Trade completado - limpiando estado de espera");
          const esIniciador = Number(jugadorId) === Number(currentUserId);
          const esObjetivo = objetivo != null && Number(objetivo) === Number(currentUserId);
          if (esIniciador) {
            // Soy el iniciador, limpiar mi estado de espera
            setIsWaitingForResponse(false);
            setWaitingMessage(null);
            setPendingCardTrade(null);
            toast.success("¡Intercambio completado!");
          }
          if (esIniciador || esObjetivo) {
            console.log(" Refrescando mano/mazos tras Card Trade para jugador actual.");
            refreshPlayerHand();
            updateMazosState();
          }
          const efectos = payload.efectos ?? {};
          const playersList = Array.isArray(gameState.players) ? gameState.players : [];
          const blackmailedEffects = Array.isArray(efectos.blackmailed) ? efectos.blackmailed : [];
          blackmailedEffects.forEach((efecto) => {
            const receptorId = efecto?.receptorId;
            if (Number(receptorId) === Number(currentUserId)) {
              const pasadorId = efecto?.pasadorId ?? efecto?.jugadorId ?? null;
              const pasadorName =
                playersList.find((player) => Number(player.id) === Number(pasadorId))?.nombre ??
                (pasadorId != null ? `Jugador ${pasadorId}` : "otro jugador");
              const receptorPlayer =
                playersList.find((player) => Number(player.id) === Number(currentUserId)) ?? null;
              const receptorName = receptorPlayer?.nombre ?? `Jugador ${currentUserId}`;
              toast(`Fuiste Blackmailed por ${pasadorName}`, { icon: "🕵️" });
              setShowRevealSecretModal({
                mode: "card_trade_blackmailed",
                setName: "Blackmailed",
                source: "card_trade_blackmailed",
                pasadorId,
                pasadorName,
                receptorId: Number(currentUserId),
                receptorName,
                customMessage: `Elegí uno de tus secretos (preferentemente ocultos) para mostrárselo en privado a ${pasadorName}.`,
              });
              setIsWaitingForResponse(false);
              setWaitingMessage(null);
            }
          });

          const socialFauxEffects = Array.isArray(efectos.socialFauxPas) ? efectos.socialFauxPas : [];
          const alreadyRevealedByMe = Array.isArray(payload.secretosRevelados)
            ? payload.secretosRevelados.some(
                (secreto) => Number(secreto?.jugador_id ?? secreto?.jugadorId) === Number(currentUserId),
              )
            : false;
          const hasPendingResponse = Boolean(pendingSocialFauxTrade);
          const needsSocialFauxReveal = socialFauxEffects.some(
            (efecto) => Number(efecto?.receptorId) === Number(currentUserId),
          );
          if (needsSocialFauxReveal && !alreadyRevealedByMe && !hasPendingResponse) {
            (async () => {
              try {
                await loadCurrentPlayerSecrets();
              } catch (err) {
                console.warn("No se pudieron refrescar secretos antes de Social Faux Pas:", err);
              }
              setShowRevealSecretModal((prev) =>
                prev
                  ? prev
                  : {
                      mode: "card_trade_social_faux_effect",
                      setName: "Social Faux Pas",
                      source: "card_trade_social_faux_effect",
                      customMessage:
                        "Recibiste un Social Faux Pas durante el intercambio. Elegí cuál de tus secretos revelar públicamente.",
                    },
              );
              setIsWaitingForResponse(false);
              setWaitingMessage(null);
            })();
          }

        }

        if (nombreEvento.toLowerCase().includes("delay") && nombreEvento.toLowerCase().includes("murderer")) {
          toast.success("¡Evento Delay the Murderer Escape jugado!");
          // Actualizar mano del jugador - remover la carta de evento si fue ejecutada por el jugador actual
          if (Number(jugadorId) === Number(currentUserId)) {
            setGameState((prev) => ({
              ...prev,
              cards: Array.isArray(prev.cards) 
                ? prev.cards.filter(card => 
                    !(String(card.nombre ?? "").toLowerCase().includes("delay") && 
                      String(card.nombre ?? "").toLowerCase().includes("murderer"))
                  )
                : prev.cards
            }));
            // Limpiar selección ya que la carta fue eliminada
            setSelectedIds(new Set());
          }
        }
        // Para el evento "Early Train to Paddington"
        if (nombreEvento.toLowerCase().includes("early") && nombreEvento.toLowerCase().includes("train")) {
          console.log("Early Train recibido via evento_jugado:", payload);
          
          // Recargar estado del mazo y descarte
          updateMazosState();
          const jugadorName = gameState.players.find(p => p.id === jugadorId)?.nombre || `Jugador ${jugadorId}`;
          toast.success(`${jugadorName} jugó Early Train to Paddington: 6 cartas movidas al descarte`);
          // Actualizar mano del jugador si fue el que ejecutó el evento
          if (Number(jugadorId) === Number(currentUserId)) {
            console.log("Actualizando mi mano via evento_jugado");
            setGameState((prev) => ({
              ...prev,
              cards: Array.isArray(prev.cards) 
                ? prev.cards.filter(card => 
                    !(String(card.nombre ?? "").toLowerCase().includes("early") && 
                      String(card.nombre ?? "").toLowerCase().includes("train"))
                  )
                : prev.cards
            }));
            // Limpiar selección ya que la carta fue eliminada
            setSelectedIds(new Set());
          }
        }
        if (nombreEvento.toLowerCase().includes("dead card folly")) {
          const snapshot = deadCardFollyStateRef.current;
          if (!snapshot?.globalToastShown) {
            toast("Dead Card Folly hizo circular cartas entre los jugadores.", {
              icon: "🔄",
            });
          }
          setDeadCardFollyState((prev) => {
            if (!prev || prev.status === "idle") return prev;
            return {
              ...prev,
              status: prev.status === "completed" ? "completed" : "redistributing",
              globalToastShown: true,
            };
          });
        }
        const actorIdNumeric = jugadorId != null ? Number(jugadorId) : NaN;
        const actorName = !Number.isNaN(actorIdNumeric)
          ? getPlayerNameById(gameState.players, actorIdNumeric)
          : null;
        const cardLabel = nombreEvento ? `"${nombreEvento}"` : "un evento";
        const playedMessage = actorName
          ? `${actorName} jugó ${cardLabel}.`
          : `Un jugador jugó ${cardLabel}.`;
        const eventDedupeKey =
          payload.messageId ??
          payload.eventoId ??
          payload.eventId ??
          payload.cardId ??
          payload.cartaEventoId ??
          payload.roundId ??
          payload.uuid ??
          payload.id ??
          null;
        pushEventLog(playedMessage, {
          type: "event_played",
          playerId: jugadorId,
          targetId: objetivo ?? null,
          cardName: nombreEvento,
          dedupeKey: eventDedupeKey
            ? `event_${eventDedupeKey}`
            : `event_${nombreEvento}_${jugadorId}_${objetivo ?? ""}`,
        });

        if (objetivo != null && Number(objetivo) === Number(currentUserId)) {
          // guardar evento entrante para que la UI (Tablero/EventModal) pueda mostrar un modal si se desea
          setIncomingEvent((prev) => {
            if (prev) return prev;
            return {
              fromPlayerId: jugadorId != null ? Number(jugadorId) : null,
              cardName: payload.nombre ?? payload.cartaNombre ?? null,
              meta: payload,
            };
          });
        }

        const siguienteTurnoRaw =
          payload.turno_actual ??
          payload.turnoActual ??
          payload.turno_siguiente ??
          payload.turnoSiguiente ??
          payload.nextTurn ??
          null;
        if (siguienteTurnoRaw != null) {
          const siguienteTurno = Number(siguienteTurnoRaw);
          if (!Number.isNaN(siguienteTurno)) {
            const nextActorName = getPlayerNameById(gameState.players, siguienteTurno);
            setStatusMessage({
              type: "turn",
              actorId: siguienteTurno,
              actorName: nextActorName,
              cardName: null,
              message: null,
              fallback: nextActorName ? `Esperando el movimiento de ${nextActorName}.` : null,
              timestamp: Date.now(),
            });
          }
        } else {
          const fallbackTurnId = Number(gameState.currentTurn);
          if (!Number.isNaN(fallbackTurnId)) {
            const fallbackName = getPlayerNameById(gameState.players, fallbackTurnId);
            setStatusMessage({
              type: "turn",
              actorId: fallbackTurnId,
              actorName: fallbackName,
              cardName: null,
              message: null,
              fallback: fallbackName ? `Esperando el movimiento de ${fallbackName}.` : null,
              timestamp: Date.now(),
            });
          } else {
            setStatusMessage((prev) => ({
              ...prev,
              message: null,
              timestamp: Date.now(),
            }));
          }
        }
        break;
      }

      case "secreto_agregado": {
        const payload = lastMessage.data || {};
        const jugadorObjetivoId = payload.jugadorObjetivoId ?? payload.jugador_objetivo_id ?? payload.targetPlayerId ?? null;
        const jugadorOrigenId = payload.jugadorOrigenId ?? payload.jugador_origen_id ?? payload.jugadorId ?? null;
        const secretoAgregado = payload.secreto ?? payload.secretoAgregado ?? null;
        
        console.log("Secreto agregado recibido:", { jugadorObjetivoId, jugadorOrigenId, secretoAgregado, currentUserId });

        // Distinguir si soy el origen o el objetivo
        const iAmOrigin = Number(jugadorOrigenId) === Number(currentUserId);
        const iAmTarget = Number(jugadorObjetivoId) === Number(currentUserId);

        // Solo mostrar modal si SOY el objetivo Y NO soy el origen (otro jugador me agregó el secreto)
        if (iAmTarget && !iAmOrigin) {
          setIncomingEvent({
            fromPlayerId: jugadorOrigenId != null ? Number(jugadorOrigenId) : null,
            cardName: "And then there was one more...",
            meta: {
              ...payload,
              isSecretAdded: true,
              secreto: secretoAgregado,
            },
          });
        }

        // Refrescar secretos si soy el objetivo (incluye self-target)
        if (iAmTarget) {
          setTimeout(async () => {
            try {
              const secretosRes = await get(`/partidas/${gameData.id}/secretos`);
              const secrets = normalizeSecrets(secretosRes, currentUserId);
              setGameState((prev) => ({
                ...prev,
                secrets: secrets.length > 0 ? secrets : prev.secrets,
              }));
              setRevealedSecretsByPlayer(normalizeRevealedSecretsByPlayer(secretosRes));
            } catch (error) {
              console.error("Error al refrescar secretos después de agregar:", error);
            }
          }, 500);
        }
        break;
      }
      case "card_trade_blackmailed_secret": {
        const payload = lastMessage.data || {};
        const pasadorId = Number(payload.pasadorId ?? payload.pasador_id ?? payload.viewerId ?? NaN);
        const receptorId = Number(payload.receptorId ?? payload.receptor_id ?? payload.ownerId ?? NaN);
        const receptorNamePayload = payload.receptorName ?? payload.receptor ?? null;
        const pasadorNamePayload = payload.pasadorName ?? payload.viewerName ?? null;
        const secreto = payload.secreto ?? null;
        const contextTypeFromPayload =
          payload.contextType ??
          payload.context_type ??
          payload.origin ??
          payload.source ??
          "card_trade_blackmailed";

        if (!Number.isNaN(pasadorId) && Number(pasadorId) !== Number(currentUserId)) {
          break;
        }
        if (!secreto) {
          console.warn("card_trade_blackmailed_secret recibido sin secreto válido:", payload);
          break;
        }

        const playersList = Array.isArray(gameState.players) ? gameState.players : [];
        const resolvedPasadorName =
          pasadorNamePayload ??
          playersList.find((p) => Number(p.id) === Number(pasadorId))?.nombre ??
          (Number.isNaN(pasadorId) ? null : `Jugador ${pasadorId}`);
        const resolvedReceptorName =
          receptorNamePayload ??
          playersList.find((p) => Number(p.id) === Number(receptorId))?.nombre ??
          (Number.isNaN(receptorId) ? null : `Jugador ${receptorId}`);
        const contextType =
          typeof contextTypeFromPayload === "string" ? contextTypeFromPayload : "card_trade_blackmailed";

        setSecretoEnModal({
          ...secreto,
          context: {
            type: contextType,
            role: "viewer",
            pasadorId: Number.isNaN(pasadorId) ? null : pasadorId,
            pasadorName: resolvedPasadorName,
            receptorId: Number.isNaN(receptorId) ? null : receptorId,
            receptorName: resolvedReceptorName,
          },
        });
        
        const toastLabel =
          contextType === "dead_card_folly_blackmailed"
            ? "Recibiste un secreto privado por un Blackmailed de Dead Card Folly."
            : "El secreto privado fue compartido contigo.";
        toast.success(toastLabel, { icon: "🕵️" });
        
        const privateMessage = `${resolvedPasadorName ?? "Un jugador"} compartió "${secreto.descripcion ?? "un secreto"}" en privado con ${resolvedReceptorName ?? "otro jugador"}.`;
        pushEventLog(privateMessage, {
          type: "secret_private",
          playerId: pasadorId,
          targetId: receptorId,
          dedupeKey: `blackmailed_${pasadorId}_${receptorId}_${secreto.secreto_id ?? secreto.id ?? ""}`,
        });
        break;
      }

      case "and_then_there_was_one_more_jugado": {
        const payload = lastMessage.data || {};
        const jugadorQueJugo = payload.jugadorId ?? payload.jugador_id ?? null;
        const nuevoOwner = payload.nuevoOwner ?? payload.nuevo_owner ?? null;
        const oldOwnerId = payload.oldOwnerId ?? payload.old_owner_id ?? null;
        const secretoRevelado = payload.secretoRevelado ?? payload.secreto ?? null;
        const secretoEstabaRevelado = payload.secretoEstabaRevelado ?? false;
        
        console.log("And then there was one more jugado:", {
          jugadorQueJugo,
          nuevoOwner,
          oldOwnerId,
          secretoRevelado,
          secretoEstabaRevelado,
          currentUserId
        });

        // Decrementar inmediatamente el contador de secretos revelados del antiguo owner
        if (oldOwnerId && secretoEstabaRevelado) {
          setGameState((prev) => ({
            ...prev,
            players: prev.players.map(player => {
              if (Number(player.id) === Number(oldOwnerId)) {
                const newRevealed = Math.max(0, (player.secretsRevealed ?? 0) - 1);
                console.log(`Jugador ${oldOwnerId} perdió un secreto revelado: ${player.secretsRevealed} → ${newRevealed}`);
                return {
                  ...player,
                  secretsRevealed: newRevealed,
                  secrets_revelados: newRevealed
                };
              }
              return player;
            })
          }));
        }

        const actorName = getPlayerNameById(gameState.players, jugadorQueJugo);
        const newOwnerName = getPlayerNameById(gameState.players, nuevoOwner);
        const oldOwnerName = getPlayerNameById(gameState.players, oldOwnerId);
        const secretLabel = secretoRevelado?.descripcion
          ? `“${secretoRevelado.descripcion}”`
          : "un secreto";

        const andThenMessage = secretoEstabaRevelado
          ? `${actorName} jugó "And then there was one more..." y ocultó ${secretLabel} que pertenecía a ${oldOwnerName}.`
          : `${actorName} jugó "And then there was one more..." y entregó ${secretLabel} a ${newOwnerName}.`;

        pushEventLog(andThenMessage, {
          type: "event_special",
          event: "and_then_there_was_one_more",
          playerId: jugadorQueJugo,
          targetId: nuevoOwner ?? oldOwnerId ?? null,
        });

        // SIEMPRE refrescar mis secretos cuando se juega este evento
        setTimeout(async () => {
          try {
            const secretosRes = await get(`/partidas/${gameData.id}/secretos`);
            console.log("Secretos actualizados desde servidor:", secretosRes);
            
            const freshSecrets = normalizeSecrets(secretosRes, currentUserId);
            console.log("Secretos frescos del servidor:", freshSecrets, "Total:", freshSecrets.length);

            // Usar directamente los secretos del servidor (no preservar estado anterior)
            setGameState((prev) => {
              console.log("Actualizando secretos desde servidor:", freshSecrets);
              
              return {
                ...prev,
                secrets: freshSecrets,
              };
            });
            
            setRevealedSecretsByPlayer(normalizeRevealedSecretsByPlayer(secretosRes));
            
            // Actualizar allSecretsRaw para que el useEffect sincronice secretsCount
            setAllSecretsRaw(secretosRes);
            
            const iAmNewOwner = Number(nuevoOwner) === Number(currentUserId);
            if (iAmNewOwner) {
              const secretText = secretoRevelado?.descripcion ?? secretoRevelado?.description ?? "un secreto";
              toast.success(`Has recibido un secreto: "${secretText}"`);
            }
            
          } catch (error) {
            console.error("Error al refrescar secretos después de 'And then there was one more':", error);
          }
        }, 500);
        
        break;
      }

      case "point_suspicions_started": {
        const payload = lastMessage.data || {};
        handlePointSuspicionsStart(payload);
        break;
      }
      case "point_suspicions_vote": {
        const payload = lastMessage.data || {};
        handlePointSuspicionsVoteEvent(payload);
        break;
      }
      case "point_suspicions_complete": {
        const payload = lastMessage.data || {};
        handlePointSuspicionsCompleteEvent(payload);
        break;
      }
      case "point_suspicions_secret_selected": {
        const payload = lastMessage.data || {};
        handlePointSuspicionsSecretSelected(payload);
        break;
      }

      default:
        console.log("Evento no manejado:", lastMessage.event);
        break;
      }
    }

    lastProcessedMessageIndexRef.current = messages.length;
  }, [messages, currentUserId, gameData.id, pushEventLog, mergePlayersWithKnownReveals]);

  useEffect(() => {
    if (!pointSuspicionsState || pointSuspicionsState.status !== "voting") return;
    if (pointSuspicionsState.broadcasted) return;
    if (Number(currentUserId) !== Number(pointSuspicionsState.initiatorId)) return;
    if (!sendMessage) return;

    const participantIds = getPointSuspicionsParticipants(pointSuspicionsState.participantIds);
    const votes = pointSuspicionsState.votes ?? {};
    if (participantIds.length === 0) return;
    if (Object.keys(votes).length !== participantIds.length) return;

    const counts = participantIds.reduce((acc, participantId) => {
      return { ...acc, [participantId]: 0 };
    }, {});

    Object.values(votes).forEach((suspectRaw) => {
      if (suspectRaw == null) return;
      const suspectId = Number(suspectRaw);
      const key = String(Number.isNaN(suspectId) ? suspectRaw : suspectId);
      const current = counts[key] ?? 0;
      counts[key] = current + 1;
    });

    const entries = Object.entries(counts);
    if (entries.length === 0) return;

    const maxVotes = Math.max(...entries.map(([, value]) => Number(value ?? 0)));
    const topPlayers = entries
      .filter(([, value]) => Number(value ?? 0) === maxVotes)
      .map(([playerId]) => Number(playerId));
    const tie = topPlayers.length > 1;
    const targetId = tie ? null : topPlayers[0] ?? null;
    const payload = {
      partidaId: gameData.id,
      roundId: pointSuspicionsState.roundId,
      initiatorId: pointSuspicionsState.initiatorId,
      votes,
      counts,
      totalVotes: participantIds.length,
      topPlayers,
      targetId,
      tie,
    };

    try {
      sendMessage({
        event: "point_suspicions_complete",
        data: payload,
      });
      setPointSuspicionsState((prev) => ({
        ...prev,
        broadcasted: true,
      }));
    } catch (error) {
      console.error("No se pudo enviar el resultado de la votación:", error);
    }
  }, [pointSuspicionsState, currentUserId, sendMessage, gameData.id]);

  const eliminarPartida = async () => {
    try {
      await del(`/partidas/${gameData.id}`);
    } catch (error) {
      const msg = String(error?.message ?? error);
      if (!msg.includes("410") && !msg.includes("404") && !/not found/i.test(msg)) {
        console.error("Error eliminando partida:", error);
      }
    } finally {
      try {
        window.location.href = "/InicioContainer";
      } catch (navError) {
        console.warn("No se pudo redirigir con window.location.href", navError);
      }
    }
  };

  const handleRevealSecret = (data) => {
    setIsWaitingForResponse(false);
    setWaitingMessage(null);
    const { secreto, set } = data ?? {};
    console.log("handleRevealSecret - datos completos:", data);
    console.log("handleRevealSecret - secreto:", secreto);
    if (secreto && secreto.descripcion) {
      console.log("handleRevealSecret - descripción del secreto:", secreto.descripcion);
    }
    
    if (!secreto) {
      console.error("Payload de 'secreto_revelado' inválido:", data);
      return;
    }
    const secretId = secreto.secreto_id ?? secreto.id ?? null;
    const rawJugadorId = secreto.jugador_id ?? secreto.jugadorId;
    const jugadorIdNumber = Number(rawJugadorId);
    const jugadorId = Number.isNaN(jugadorIdNumber) ? rawJugadorId : jugadorIdNumber;

    // Extraer información del set que causó la revelación
    const setOwnerId = set?.owner_id ?? set?.jugador_id ?? null;
    const setName = set?.nombre ?? set?.name ?? "Set desconocido";
    const revealerName =
      setOwnerId != null ? getPlayerNameById(gameState.players, setOwnerId) : null;
    const victimName = getPlayerNameById(gameState.players, jugadorId);
    const secretLabel = secreto?.descripcion
      ? `“${secreto.descripcion}”`
      : "un secreto";
    pushEventLog(
      revealerName
        ? `${revealerName} reveló ${secretLabel} de ${victimName}.`
        : `${victimName} reveló ${secretLabel}.`,
      {
        type: "secret_revealed",
        actorId: setOwnerId ?? jugadorId,
        targetId: jugadorId,
        secretId,
        secretDescription: secreto?.descripcion ?? null,
      },
    );

    // Mostrar modal de evento entrante al jugador cuyo secreto fue revelado (solo si no soy yo mismo)
    if (Number(jugadorId) === Number(currentUserId) && setOwnerId && Number(setOwnerId) !== Number(currentUserId)) {
      console.log("Mostrando modal de evento entrante al jugador afectado:", jugadorId);
      setIncomingEvent({
        fromPlayerId: Number(setOwnerId),
        cardName: setName,
        meta: {
          tipo: "secreto_revelado",
          secretoRevelado: secreto,
          set: set,
          mensaje: `Tu secreto "${secreto.descripcion}" fue revelado`
        },
      });
    }

    // Actualizar el estado de secretos revelados por jugador
    setRevealedSecretsByPlayer((prev) => {
      const playerSecrets = prev[jugadorId] || [];
      const secretExists = playerSecrets.some(s => 
        (s.secreto_id || s.id) === secretId
      );
      
      if (!secretExists) {
        return {
          ...prev,
          [jugadorId]: [...playerSecrets, secreto]
        };
      }
      
      return prev;
    });

    console.log(" Llamando applyRevealToState con:", { targetId: jugadorId, secretId, secretoObj: secreto });
    applyRevealToState({ targetId: jugadorId, secretId, secretoObj: secreto });
    
    // Actualizar allSecretsRaw para que EventModal vea los secretos revelados
    setTimeout(async () => {
      try {
        console.log("Refrescando allSecretsRaw después de secreto_revelado...");
        const secretosRes = await get(`/partidas/${gameData.id}/secretos`);
        console.log("allSecretsRaw actualizado:", secretosRes);
        setAllSecretsRaw(secretosRes);
      } catch (error) {
        console.error("Error al refrescar allSecretsRaw:", error);
      }
    }, 200);
  };

  const handleHideSecret = (data) => {
    setIsWaitingForResponse(false);
    setWaitingMessage(null);
    const { secreto, set } = data ?? {};
    console.log("handleHideSecret llamado con data:", data);
    if (!secreto) {
      console.error("Payload de 'secreto_ocultado' inválido:", data);
      return;
    }
    const secretId = secreto.secreto_id ?? secreto.id ?? null;
    const rawJugadorId = secreto.jugador_id ?? secreto.jugadorId;
    const jugadorIdNumber = Number(rawJugadorId);
    const jugadorId = Number.isNaN(jugadorIdNumber) ? rawJugadorId : jugadorIdNumber;

    // Extraer información del set que causó la ocultación
    const setOwnerId = set?.owner_id ?? set?.jugador_id ?? null;
    const setName = set?.nombre ?? set?.name ?? "Set desconocido";
    const hiderName =
      setOwnerId != null ? getPlayerNameById(gameState.players, setOwnerId) : null;
    const ownerName = getPlayerNameById(gameState.players, jugadorId);
    const secretLabel = secreto?.descripcion ? `“${secreto.descripcion}”` : "un secreto";
    pushEventLog(
      hiderName
        ? `${hiderName} ocultó ${secretLabel} de ${ownerName}.`
        : `${ownerName} recuperó ${secretLabel}.`,
      {
        type: "secret_hidden",
        actorId: setOwnerId ?? jugadorId,
        targetId: jugadorId,
        secretId,
        secretDescription: secreto?.descripcion ?? null,
      },
    );

    console.log("Procesando secreto ocultado:", { jugadorId, secretId, secreto });
    console.log("currentUserId:", currentUserId);
    console.log("Es el jugador actual afectado?", jugadorId === currentUserId);

    // Mostrar modal de evento entrante al jugador cuyo secreto fue ocultado (solo si no soy yo mismo)
    if (Number(jugadorId) === Number(currentUserId) && setOwnerId && Number(setOwnerId) !== Number(currentUserId)) {
      console.log("Mostrando modal de evento entrante para secreto ocultado al jugador afectado:", jugadorId);
      setIncomingEvent({
        fromPlayerId: Number(setOwnerId),
        cardName: setName,
        meta: {
          tipo: "secreto_ocultado",
          secretoOcultado: secreto,
          set: set,
          mensaje: `Tu secreto "${secreto.descripcion}" fue ocultado`
        },
      });
    }

    // Actualizar el estado de secretos revelados por jugador (remover el secreto ocultado)
    setRevealedSecretsByPlayer((prev) => {
      const playerSecrets = prev[jugadorId] || [];
      const filteredSecrets = playerSecrets.filter(s => 
        (s.secreto_id || s.id) !== secretId
      );
      
      console.log(`Actualizando secretos revelados para jugador ${jugadorId}:`, {
        antes: playerSecrets.length,
        despues: filteredSecrets.length,
        secretosAntes: playerSecrets,
        secretosDespues: filteredSecrets
      });
      
      return {
        ...prev,
        [jugadorId]: filteredSecrets
      };
    });

    applyHideToState({ targetId: jugadorId, secretId, secretoObj: secreto });
    
    // Recargar datos para asegurar sincronización en todos los jugadores
    console.log("Recargando datos después de ocultar secreto...");
    setTimeout(() => {
      loadSecretos();
      syncRevealedSecretsByPlayer();
    }, 100);
  };
  
  const handleDrawCard = async () => {
    if (!isConnected) {
      console.warn("No conectado al WebSocket");
      return;
    }
    if (Number.isNaN(currentUserId) || gameState.currentTurn !== currentUserId) {
      console.warn("No es tu turno");
      alert("No es tu turno");
      return;
    }
    if (gameState.gamePhase === "ended") {
      console.warn("La partida ha finalizado");
      return;
    }
    if (Array.isArray(gameState.cards) && gameState.cards.length >= 6) {
      console.warn("Limite de cartas alcanzado");
      toast.error("Limite de cartas alcanzado (6/6)");
      return;
    }
    try {
      await post(`/partidas/${gameData.id}/cartas/robar`, {
        jugadorId: currentUserId,
        cantidad: 1,
      });
    } catch (error) {
      const msg = String(error?.message ?? error);
      if (msg.includes("410") || /mazo/i.test(msg) || /agotad/i.test(msg)) {
        setGameState((prev) => ({ ...prev, gamePhase: "ended", endedReason: "mazo_agotado" }));
      } else {
        console.warn("No se pudo robar la carta, ver consola para mas detalle.", error);
      }
    }
  };

  const handlePassTurn = async (skipDiscardCheck = false) => {
    // Si el primer argumento es un evento de React, ignorarlo
    const shouldSkipCheck = typeof skipDiscardCheck === 'boolean' ? skipDiscardCheck : false;
    
    if (Number.isNaN(currentUserId) || gameState.currentTurn !== currentUserId) {
      return;
    }
    if (gameState.gamePhase === "ended") {
      return;
    }
    
    if (!shouldSkipCheck) {
      if (isCurrentPlayerInSocialDisgrace()) {
        if (!hasDiscardedThisTurn) {
          toast.error("Estás en desgracia social. Debes descartar una carta antes de pasar el turno.", {
            duration: 4000
          });
          return;
        }
      } else {
        if (!hasDiscardedThisTurn) {
          alert("Debes descartar al menos una carta antes de pasar el turno");
          return;
        }
      }
    }
    
    try {
      await put(`/partidas/${gameData.id}/siguiente_turno`);
      
      if (turnTimerRef.current) {
        clearInterval(turnTimerRef.current);
        turnTimerRef.current = null;
      }
      setTurnTimeRemaining(TURN_TIMEOUT_SECONDS);
      setHasDiscardedThisTurn(false);
      hasDiscardedThisTurnRef.current = false;
    } catch (error) {
      console.error("Error al pasar el turno:", error);
      alert("No se pudo pasar el turno");
    }
  };

  const handleAutomaticDiscard = async () => {
    if (Number.isNaN(currentUserId) || gameState.currentTurn !== currentUserId) {
      autoDiscardInProgressRef.current = false;
      return;
    }
    
    if (gameState.gamePhase !== "playing") {
      autoDiscardInProgressRef.current = false;
      return;
    }
    
    if (!isConnected) {
      toast.error("Desconectado del servidor. No se puede descartar automáticamente.");
      autoDiscardInProgressRef.current = false;
      return;
    }

    const eventModalWasOpen = Boolean(showEventModalRef.current);
    if (eventModalWasOpen) {
      setShowEventModal(false);
      setEventCardData(null);
      setIsWaitingForResponse(false);
      setWaitingMessage(null);
    }

    if (hasDiscardedThisTurnRef.current) {
      console.log("⏰ Tiempo agotado pero ya descartaste manualmente, pasando turno sin descartar");
      setShowTimeUpMessage(false);
      setShowTimeoutModal(false);
      const timeoutMessage = eventModalWasOpen
        ? "Se te acabó el tiempo para accionar."
        : "Se te acabó el tiempo de accionar. Pasando turno automáticamente.";
      if (eventModalWasOpen) {
        toast.error(timeoutMessage);
      } else {
        toast.success(timeoutMessage);
      }
      try {
        await handlePassTurn(true);
      } finally {
        autoDiscardInProgressRef.current = false;
      }
      return;
    }
    
    if (!Array.isArray(gameState.cards) || gameState.cards.length === 0) {
      console.log("⏰ Tiempo agotado sin cartas disponibles, pasando turno automáticamente");
      setShowTimeUpMessage(false);
      setShowTimeoutModal(false);
      if (eventModalWasOpen) {
        toast.error("Se te acabó el tiempo para accionar.");
      } else {
        toast.success("No tenías cartas para descartar. Pasando turno automáticamente.");
      }
      try {
        await handlePassTurn(true);
      } finally {
        autoDiscardInProgressRef.current = false;
      }
      return;
    }

    setShowTimeUpMessage(false);
    setShowTimeoutModal(false);
    setSelectedIds(new Set());

    try {
      const response = await post(`/partidas/${gameData.id}/cartas/random-discard`, {
        jugadorId: currentUserId,
      });

      const discardedCardRaw =
        response?.carta ??
        response?.cartaDescartada ??
        response?.carta_descartada ??
        findCardInPayload(response);
      const discardedCard = normalizeCardFromPayload(discardedCardRaw);
      const discardedCardId = getCardIdFromObject(discardedCard);

      const cardName = discardedCard?.nombre ?? discardedCard?.name ?? null;
      const successMessage = cardName
        ? `Se agotó tu tiempo. Se descartó "${cardName}" automáticamente.`
        : "Se agotó tu tiempo. Se descartó una carta automáticamente.";
      if (eventModalWasOpen) {
        toast.error("Se te acabó el tiempo para accionar.");
      } else {
        toast.success(successMessage);
      }

      if (discardedCardId != null) {
        setGameState((prev) => ({
          ...prev,
          cards: Array.isArray(prev.cards)
            ? prev.cards.filter((card) => card.carta_id !== discardedCardId)
            : prev.cards,
          descarte: (() => {
            if (!discardedCard) return prev.descarte;
            const currentDiscard = Array.isArray(prev.descarte) ? prev.descarte : [];
            const isAlreadyTracked = currentDiscard.some((card) => card.carta_id === discardedCardId);
            return isAlreadyTracked ? currentDiscard : [...currentDiscard, discardedCard];
          })(),
        }));
      }

      setHasDiscardedThisTurn(true);
      hasDiscardedThisTurnRef.current = true;

      try {
        await updateMazosState();
      } catch (mazoError) {
        console.warn("No se pudo actualizar el estado de mazos tras descarte aleatorio:", mazoError);
      }

      try {
        await post(`/partidas/${gameData.id}/cartas/robar`, {
          jugadorId: currentUserId,
          cantidad: 1,
        });
      } catch (drawError) {
        const drawMessage = drawError?.message ? String(drawError.message) : String(drawError);
        if (drawMessage.includes("410")) {
          toast.error("No se pudo robar una carta automáticamente: el mazo está agotado.");
        } else {
          toast.error(drawMessage || "No se pudo robar una carta automáticamente.");
        }
        console.error("Error al robar carta tras descarte automático:", drawError);
      }

      await refreshPlayerHand();
      await handlePassTurn(true);
    } catch (error) {
      console.error("Error en descarte automático aleatorio:", error);
      const detail = error?.message ? String(error.message) : String(error) || "Error al descartar automáticamente.";

      if (detail.includes("403")) {
        toast.error("No es tu turno para descartar.");
      } else if (detail.includes("404")) {
        toast.error("Partida o jugador inexistente.");
      } else if (detail.includes("400")) {
        toast.error("No hay cartas disponibles para descartar.");
      } else {
        toast.error(detail || "Error al descartar automáticamente.");
      }

      try {
        await refreshPlayerHand();
        await updateMazosState();
      } catch (syncError) {
        console.error("No se pudo sincronizar el estado tras error de descarte aleatorio:", syncError);
      }
    } finally {
      autoDiscardInProgressRef.current = false;
    }
  };

  const handleTimeUpAcknowledge = () => {
    setShowTimeUpMessage(false);
    setShowTimeoutModal(false);
  };

  const toggleSelectCard = (cartaId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(cartaId)) next.delete(cartaId);
      else next.add(cartaId);
      return next;
    });
  };

  const cancelSelection = () => setSelectedIds(new Set());
  const openDiscardModal = () => {
    if (!Array.isArray(gameState.descarte) || gameState.descarte.length === 0) return;
    setShowDiscardModal(true);
  };
  const closeDiscardModal = () => setShowDiscardModal(false);

  const discardSelected = async () => {
    console.log("🗑️🗑️🗑️ DISCARD SELECTED - INICIO 🗑️🗑️🗑️");
    const ids = Array.from(selectedIds);
    console.log("IDs seleccionados:", ids);
    console.log("selectedIds original:", selectedIds);
    
    if (ids.length === 0) {
      console.warn("❌ No hay cartas seleccionadas para descartar");
      return;
    }
    
    console.log("Estado antes de descartar:", {
      currentUserId,
      currentTurn: gameState.currentTurn,
      cardsInHand: gameState.cards?.length,
      hasDiscardedThisTurn
    });
    
    if (Number.isNaN(currentUserId) || gameState.currentTurn !== currentUserId) {
      console.error("❌ No es tu turno");
      toast.error("No es tu turno para descartar cartas", {
        duration: 4000
      });
      return;
    }
    
    try {
      console.log("1️⃣ Actualizando estado local...");
      setGameState((prev) => {
        const newCards = Array.isArray(prev.cards) ? prev.cards.filter((c) => !ids.includes(c.carta_id)) : [];
        console.log("Cartas antes:", prev.cards?.length, "Cartas después:", newCards.length);
        return {
          ...prev,
          cards: newCards,
        };
      });
      
      console.log("2️⃣ Limpiando selectedIds...");
      setSelectedIds(new Set());
      
      console.log("3️⃣ POST al backend...");
      const response = await post(`/partidas/${gameData.id}/cartas/descarte`, {
        jugadorId: currentUserId,
        cartasIds: ids,
      });
      console.log("✅ Respuesta POST descarte:", response);
      
      console.log("4️⃣ Marcando hasDiscardedThisTurn = true");
      setHasDiscardedThisTurn(true);
      hasDiscardedThisTurnRef.current = true;
      
      console.log("✅✅✅ DISCARD SELECTED - FIN EXITOSO");
    } catch (error) {
      console.error("❌❌❌ ERROR en discardSelected:", error);
      console.error("Error completo:", error);
      setHasDiscardedThisTurn(false);
      hasDiscardedThisTurnRef.current = false;
      try {
        console.log("Recuperando estado...");
        const estado = await get(`/partidas/${gameData.id}/cartas/estado`);
        console.log("Estado recuperado:", estado);
        if (estado?.hands?.[currentUserId]) {
          setGameState((prev) => ({
            ...prev,
            cards: estado.hands[currentUserId],
          }));
        }
      } catch (fallback) {
        console.error("No se pudo recuperar la mano tras error de descarte:", fallback);
      }
    }
  };

  const refreshPlayerHand = async () => {
    try {
      const estado = await get(`/partidas/${gameData.id}/cartas/estado`);
      const nuevaMano = Array.isArray(estado?.hands?.[currentUserId])
        ? estado.hands[currentUserId]
        : Array.isArray(gameState.cards)
        ? gameState.cards
        : [];
      if (Array.isArray(nuevaMano) && nuevaMano.length > 6) {
        setGameState((prev) => ({
          ...prev,
          cards: nuevaMano.slice(0, 6),
        }));
        toast.error("Limite de cartas alcanzado (6/6)");
      } else {
        setGameState((prev) => ({
          ...prev,
          cards: Array.isArray(nuevaMano) ? nuevaMano : [],
        }));
      }
    } catch (err) {
      console.warn("No se pudo refrescar la mano:", err);
    }
  };

  const handlePickDraftCard = async (cartaId, draftCardFromView) => {
    if (Number.isNaN(currentUserId) || gameState.currentTurn !== currentUserId) {
      console.warn("No es tu turno para tomar una carta del draft");
      return;
    }
    if (gameState.gamePhase === "ended") {
      console.warn("La partida ha finalizado");
      return;
    }
    if (!Array.isArray(gameState.draft) || gameState.draft.length === 0) {
      console.warn("No hay cartas disponibles en el draft");
      return;
    }
    if (Array.isArray(gameState.cards) && gameState.cards.length >= 6) {
      toast.error("Limite de cartas alcanzado (6/6)");
      return;
    }
    const draftCard =
      draftCardFromView ??
      (Array.isArray(gameState.draft)
        ? gameState.draft.find((card) => card.carta_id === cartaId)
        : null);
    if (!draftCard) {
      console.warn("Carta de draft no encontrada");
      return;
    }
    try {
      const response = await post(`/partidas/${gameData.id}/draft/pick`, {
        cartaId,
        jugadorId: currentUserId,
      });
      const pickedCard = Array.isArray(response) ? response[0] : response;
      setGameState((prev) => {
        const nextDraft = Array.isArray(prev.draft)
          ? prev.draft.filter((card) => card.carta_id !== cartaId)
          : [];
        const incomingCard =
          pickedCard && typeof pickedCard === "object" && "carta_id" in pickedCard
            ? pickedCard
            : draftCard;
        const nextCards = Array.isArray(prev.cards) ? [...prev.cards, incomingCard] : [incomingCard];
        return {
          ...prev,
          draft: nextDraft,
          cards: nextCards.slice(0, 6),
        };
      });
    } catch (error) {
      console.error("Error al tomar carta del draft:", error);
      toast.error("No se pudo tomar la carta del draft");
    }
  };

  const getPointSuspicionsParticipants = (participantsFromPayload) => {
    if (Array.isArray(participantsFromPayload) && participantsFromPayload.length > 0) {
      return participantsFromPayload.map((pid) => Number(pid));
    }
    if (Array.isArray(gameState.players)) {
      return gameState.players.map((player) => Number(player.id));
    }
    return [];
  };

  const startPointSuspicionsEvent = (cardId, cardName, participantOverride = null) => {
    if (pointSuspicionsState.status !== "idle") {
      toast.error("Ya hay una votación de Point Your Suspicions en curso.");
      throw new Error("Point Your Suspicions already active");
    }

    const roundId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const participantIds = getPointSuspicionsParticipants(participantOverride);
    const startedAt = Date.now();

    setPointSuspicionsState({
      status: "voting",
      roundId,
      initiatorId: currentUserId,
      cardId,
      cardName,
      startedAt,
      votes: {},
      participantIds,
      result: null,
      secret: null,
      broadcasted: false,
      revoteCount: 0,
    });
    setPointSuspicionsSelection(null);
    setPointSuspicionsVoteLocked(false);

    setGameState((prev) => {
      if (!Array.isArray(prev.cards)) return prev;
      let removed = false;
      const normalizedName = typeof cardName === "string" ? cardName.toLowerCase() : null;
      const filteredCards = prev.cards.filter((card) => {
        if (removed) return true;
        const matchesById = cardId != null && Number(card.carta_id) === Number(cardId);
        const matchesByName =
          cardId == null &&
          normalizedName &&
          typeof card?.nombre === "string" &&
          card.nombre.toLowerCase() === normalizedName;
        if (matchesById || matchesByName) {
          removed = true;
          return false;
        }
        return true;
      });
      return {
        ...prev,
        cards: filteredCards,
      };
    });
    setSelectedIds(new Set());

    const payload = {
      partidaId: gameData.id,
      roundId,
      initiatorId: currentUserId,
      initiatorName: currentUser?.nombre ?? `Jugador ${currentUserId}`,
      cardId,
      cardName,
      participantIds,
      startedAt,
    };

    if (sendMessage) {
      try {
        sendMessage({
          event: "point_suspicions_started",
          data: payload,
        });
      } catch (error) {
        console.error("No se pudo anunciar Point Your Suspicions:", error);
      }
    }

    toast.success(`${payload.initiatorName} jugó Point Your Suspicions. Todos deben votar.`);
  };

  const handlePointSuspicionsStart = (payload) => {
    if (!payload || payload.partidaId !== gameData.id) return;

    const inferredRoundId =
      payload.roundId ??
      pointSuspicionsState?.roundId ??
      `${payload.partidaId}-pys-${payload.jugadorId ?? payload.initiatorId ?? "unknown"}`;
    const participants = getPointSuspicionsParticipants(payload.participantIds);
    const newState = {
      status: "voting",
      roundId: inferredRoundId,
      initiatorId: payload.initiatorId,
      cardId: payload.cardId ?? null,
      cardName: payload.cardName ?? "Point Your Suspicions",
      startedAt: payload.startedAt ?? Date.now(),
      votes: {},
      participantIds: participants,
      result: null,
      secret: null,
      broadcasted: false,
      revoteCount: 0,
    };

    setPointSuspicionsState(newState);
    setPointSuspicionsSelection(null);
    setPointSuspicionsVoteLocked(false);

    const initiatorName =
      payload.initiatorName ??
      getPlayerNameById(gameState.players, payload.initiatorId);
    const cardLabel = payload.cardName ?? "Point Your Suspicions";
    pushEventLog(`${initiatorName} jugó "${cardLabel}".`, {
      type: "point_suspicions",
      event: "start",
      playerId: payload.initiatorId,
      dedupeKey: `pys_start_${inferredRoundId}`,
      cardName: cardLabel,
    });

    if (Number(payload.initiatorId) !== Number(currentUserId)) {
      toast(`${initiatorName} jugó Point Your Suspicions. Todos deben votar.`, {
        icon: "🕵️",
      });
    }
  };

  const handlePointSuspicionsVoteEvent = (payload) => {
    if (!payload || payload.partidaId !== gameData.id) return;

    setPointSuspicionsState((prev) => {
      if (!prev || prev.status !== "voting") return prev;
      if (prev.roundId && payload.roundId && prev.roundId !== payload.roundId) return prev;

      const votes = { ...(prev.votes ?? {}) };
      const voterKey = String(payload.voterId);
      const suspectIdValue =
        payload.suspectId != null ? Number(payload.suspectId) : payload.suspectId;

      if (votes[voterKey] === suspectIdValue) {
        return prev;
      }

      votes[voterKey] = suspectIdValue;

      return {
        ...prev,
        votes,
        pendingVoters: Array.isArray(prev.participantIds)
          ? prev.participantIds.filter(
              (participantId) => Number(participantId) !== Number(payload.voterId),
            )
          : prev.pendingVoters,
      };
    });

    if (Number(payload.voterId) === Number(currentUserId)) {
      setPointSuspicionsVoteLocked(true);
      setPointSuspicionsSelection(
        payload.suspectId != null ? Number(payload.suspectId) : payload.suspectId,
      );
      toast.success("Voto registrado. Espera a que el resto de la mesa termine de votar.");
    }

    const voterName = getPlayerNameById(gameState.players, payload.voterId);
    const suspectName =
      payload.suspectId != null
        ? getPlayerNameById(gameState.players, payload.suspectId)
        : "Nadie";
    pushEventLog(`${voterName} votó a ${suspectName} en Point Your Suspicions.`, {
      type: "point_suspicions",
      event: "vote",
      playerId: payload.voterId,
      targetId: payload.suspectId ?? null,
      dedupeKey: `pys_vote_${payload.roundId ?? "unknown"}_${payload.voterId}`,
    });
  };

  const confirmPointSuspicionsVote = (selectionOverride = null) => {
    if (!pointSuspicionsState || pointSuspicionsState.status !== "voting") return;
    if (pointSuspicionsVoteLocked) return;

    const selectionValue =
      selectionOverride != null ? selectionOverride : pointSuspicionsSelection;
    if (selectionValue == null) {
      toast.error("Debes seleccionar a un jugador sospechoso antes de confirmar.");
      return;
    }

    if (!sendMessage) {
      toast.error("No hay conexión para enviar tu voto.");
      return;
    }

    const suspectId = Number(selectionValue);
    setPointSuspicionsVoteLocked(true);
    setPointSuspicionsSelection(suspectId);

    setPointSuspicionsState((prev) => {
      if (!prev || prev.status !== "voting") return prev;
      if (prev.roundId && prev.roundId !== pointSuspicionsState.roundId) return prev;

      const voterKey = String(currentUserId);
      const votes = { ...(prev.votes ?? {}) };
      if (votes[voterKey] !== suspectId) {
        votes[voterKey] = suspectId;
      }

      const pendingSource =
        Array.isArray(prev.pendingVoters) && prev.pendingVoters.length > 0
          ? prev.pendingVoters
          : Array.isArray(prev.participantIds)
          ? prev.participantIds
          : [];
      const pending = pendingSource.filter(
        (participantId) => Number(participantId) !== Number(currentUserId),
      );

      return {
        ...prev,
        votes,
        pendingVoters: pending,
      };
    });

    try {
      sendMessage({
        event: "point_suspicions_vote",
        data: {
          partidaId: gameData.id,
          roundId: pointSuspicionsState.roundId,
          voterId: currentUserId,
          suspectId,
          timestamp: Date.now(),
        },
      });
    } catch (error) {
      console.error("No se pudo enviar el voto:", error);
      toast.error("No se pudo enviar tu voto. Intenta de nuevo.");
      setPointSuspicionsVoteLocked(false);
    }
  };

  const handlePointSuspicionsCompleteEvent = (payload) => {
    if (!payload || payload.partidaId !== gameData.id) return;

    const counts = payload.counts ?? {};
    const votes = payload.votes ?? {};
    const totalVotes =
      payload.totalVotes ??
      Object.keys(votes).length ??
      Object.values(counts).reduce((acc, val) => acc + Number(val || 0), 0);
    const topPlayers = payload.topPlayers ?? [];
    const tie = Boolean(payload.tie);
    const targetId = !tie ? payload.targetId ?? topPlayers?.[0] ?? null : null;
    const status = tie ? "tie" : targetId != null ? "awaiting_secret" : "finished";

    setPointSuspicionsState((prev) => {
      if (!prev) return prev;
      if (prev.roundId && payload.roundId && prev.roundId !== payload.roundId) return prev;

      const resolvedVotes =
        Object.keys(prev.votes ?? {}).length >= Object.keys(votes).length ? prev.votes : votes;

      if (tie) {
        const participants =
          Array.isArray(payload.participantIds) && payload.participantIds.length > 0
            ? payload.participantIds
            : Array.isArray(prev.participantIds)
            ? prev.participantIds
            : [];
        return {
          ...prev,
          status: "voting",
          votes: {},
          pendingVoters: participants,
          result: {
            counts,
            totalVotes,
            topPlayers,
            targetId: null,
            tie: true,
          },
          broadcasted: false,
          revoteCount: (prev.revoteCount ?? 0) + 1,
        };
      }

      return {
        ...prev,
        status,
        votes: resolvedVotes,
        result: {
          counts,
          totalVotes,
          topPlayers,
          targetId,
          tie,
        },
        broadcasted: true,
      };
    });

    if (tie) {
      setPointSuspicionsVoteLocked(false);
      setPointSuspicionsSelection(null);
      toast("Point Your Suspicions terminó en empate. Se inicia una nueva votación.", {
        icon: "🔁",
      });
      pushEventLog("Point Your Suspicions terminó en empate. Se inicia una nueva votación.", {
        type: "point_suspicions",
        event: "tie",
        dedupeKey: `pys_tie_${payload.roundId ?? "unknown"}_${(pointSuspicionsState?.revoteCount ?? 0) + 1}`,
      });
      return;
    }

    setPointSuspicionsVoteLocked(true);

    if (targetId != null) {
      const targetName =
        gameState.players.find((player) => Number(player.id) === Number(targetId))?.nombre ??
        `Jugador ${targetId}`;
      const isCurrentUserTarget = Number(targetId) === Number(currentUserId);
      toast(
        `Point Your Suspicions: ${
          isCurrentUserTarget ? "Fuiste el más votado." : `${targetName} fue el más votado.`
        }`,
        {
          icon: "🕵️",
        },
      );
      if (isCurrentUserTarget) {
        setShowRevealSecretModal({
          mode: "choose_secret_to_reveal",
          source: "point_suspicions",
          roundId: payload.roundId,
        });
      }
      pushEventLog(
        `Point Your Suspicions: ${targetName} fue la persona más votada.`,
        {
          type: "point_suspicions",
          event: "result",
          playerId: targetId,
          dedupeKey: `pys_result_${payload.roundId ?? "unknown"}`,
        },
      );
    }
  };

  const handlePointSuspicionsSecretSelected = (payload) => {
    if (!payload || payload.partidaId !== gameData.id) return;

    setPointSuspicionsState((prev) => {
      if (!prev) return prev;
      if (prev.roundId && payload.roundId && prev.roundId !== payload.roundId) return prev;
      return {
        ...prev,
        status: "finished",
        secret: {
          targetId: payload.targetId,
          secretId: payload.secretId,
          secret: payload.secret ?? null,
        },
      };
    });

    const secretId = payload.secretId;
    const targetId = payload.targetId;

    const secretFromState =
      payload.secret ??
      (Array.isArray(gameState.secrets)
        ? gameState.secrets.find(
            (secret) => Number(secret?.secreto_id ?? secret?.id) === Number(secretId),
          )
        : null);

    applyRevealToState({
      targetId,
      secretId,
      secretoObj: secretFromState ?? payload.secret ?? null,
    });

    if (showRevealSecretModal?.source === "point_suspicions") {
      setShowRevealSecretModal(null);
    }

    const targetName =
      gameState.players.find((player) => Number(player.id) === Number(targetId))?.nombre ??
      `Jugador ${targetId}`;
    toast.success(`${targetName} reveló un secreto por Point Your Suspicions.`);
    const secretLabel =
      secretFromState?.descripcion ?? payload.secret?.descripcion ?? "un secreto";
    pushEventLog(`${targetName} reveló "${secretLabel}" por Point Your Suspicions.`, {
      type: "point_suspicions",
      event: "secret_selected",
      playerId: targetId,
      dedupeKey: `pys_secret_${payload.roundId ?? "unknown"}_${secretId}`,
    });
    setPointSuspicionsVoteLocked(true);
  };

  const pointSuspicionsParticipants = getPointSuspicionsParticipants(
    pointSuspicionsState?.participantIds,
  );
  const pointSuspicionsVotes = pointSuspicionsState?.votes ?? {};
  const pointSuspicionsPendingVoters = Array.isArray(pointSuspicionsState?.pendingVoters)
    ? pointSuspicionsState.pendingVoters
    : pointSuspicionsParticipants.filter((pid) => {
        const key = String(pid);
        return !(key in pointSuspicionsVotes);
      });

  const playSelectedSet = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (Number.isNaN(currentUserId) || gameState.currentTurn !== currentUserId) {
      toast.error("No es tu turno para jugar un set", {
        duration: 4000
      });
      return;
    }
    
    // Verificar si el jugador está en desgracia social
    if (isCurrentPlayerInSocialDisgrace()) {
      toast.error("No puedes jugar sets mientras estás en desgracia social. Solo puedes descartar y robar cartas.", {
        duration: 4000
      });
      return;
    }
    
    // Determinar el nombre del set basado en las cartas seleccionadas
    const selectedCards = gameState.cards.filter(card => ids.includes(card.carta_id));
    
    let setName;
    try {
      setName = determineSetName(selectedCards);
    } catch (setError) {
      console.error("Error determinando nombre del set:", setError);
      toast.error(setError.message || "Error validando el set");
      return;
    }

    const detectiveEffect = getDetectiveEffect(setName);
    console.log("Set name:", setName, "Detective effect:", detectiveEffect);

    if (detectiveEffect) {
      console.log("Opening reveal secret modal with mode:", detectiveEffect);
      setShowRevealSecretModal({
        mode: detectiveEffect,
        setName,
        selectedCards,
      });
      return;
    }

    try {
      console.log("Intentando jugar set:", {
        jugador_id: currentUserId,
        cartas_ids: ids,
        nombre_set: setName,
        selectedCards: selectedCards.map(c => ({ id: c.carta_id, nombre: c.nombre }))
      });
      
      // En lugar de ejecutar el endpoint inmediatamente, pedir reacción Not So Fast
      // El servidor decidirá si finalmente ejecuta el evento/set o si se aplica Not So Fast
      setSelectedIds(new Set());
      sendRevealRequestForAction({
        actionType: "play_set",
        actionSummary: `bajar el set ${setName}`,
        blockable: true,
        payload: {
          jugador_id: currentUserId,
          cartas_ids: ids,
          nombre_set: setName,
        },
        executor: async (req) => {
          // Ejecutar el endpoint original para bajar y resolver el set
          try {
            await post(`/partidas/${gameData.id}/jugar-y-resolver-set`, req.payload);
          } catch (err) {
            console.error('Error ejecutando bajar set tras expiración de Not So Fast', err);
            throw err;
          }
        },
      });
      // Enviar mensaje de notificación a otros jugadores si las notificaciones están habilitadas
      if (showSetNotifications && sendMessage) {
        const playerName = currentUser?.nombre || `Jugador ${currentUserId}`;
        sendMessage({
          event: "set_notification",
          data: {
            partidaId: gameData.id,
            jugadorId: currentUserId,
            jugadorNombre: playerName,
            setName: setName,
            message: `${playerName} jugó: ${setName}`,
            timestamp: Date.now()
          }
        });
      }
    } catch (error) {
      console.error("Error al jugar set:", error);
      const errorMessage = error?.response?.data?.detail || error?.message || "Error desconocido";
      console.error("Detalle del error:", errorMessage);
      toast.error(`No se pudo jugar el set: ${errorMessage}`);
      try {
        const estado = await get(`/partidas/${gameData.id}/cartas/estado`);
        if (estado?.hands?.[currentUserId]) {
          setGameState((prev) => ({
            ...prev,
            cards: estado.hands[currentUserId],
          }));
        }
      } catch (fallback) {
        console.error("No se pudo recuperar la mano tras error de set:", fallback);
      }
    }
  };

  const determineSetName = (cards) => {
    if (!Array.isArray(cards) || cards.length === 0) return "Set Genérico";
    
    // Validar que tenga al menos 2 cartas
    if (cards.length < 2) {
      throw new Error("Debes seleccionar al menos 2 cartas para formar un set.");
    }
    
    // Primero validar que todas las cartas sean de tipo detective
    const nonDetectiveCards = cards.filter(card => {
      const info = getCardInfo(card.nombre);
      return info.type !== "detective";
    });
    
    if (nonDetectiveCards.length > 0) {
      throw new Error("Solo se pueden formar sets con cartas de detective.");
    }
    
    // Filtrar cartas que no son comodines
    const cartasBase = cards.filter(card => 
      !card.nombre.includes("Wildcard") && 
      card.nombre !== "Harley Quin Wildcard"
    );
    
    if (cartasBase.length === 0) {
      throw new Error("No se puede crear un set utilizando únicamente comodines.");
    }
    
    // Obtener nombres únicos de detectives
    const nombresDetective = [...new Set(cartasBase.map(card => card.nombre))];
    
    // Caso especial: Set de Beresford (puede ser con 2 o más cartas)
    const beresfordNames = ["Tommy Beresford", "Tuppence Beresford"];
    const hasBeresfordCards = cartasBase.some(card => beresfordNames.includes(card.nombre));
    
    if (hasBeresfordCards && nombresDetective.length === 2 && 
        nombresDetective.includes("Tommy Beresford") && 
        nombresDetective.includes("Tuppence Beresford")) {
      return "Set de Beresford";
    }
    
    // Para sets normales: validar que todas las cartas base sean del mismo detective
    if (nombresDetective.length > 1 && !hasBeresfordCards) {
      throw new Error("Las cartas seleccionadas pertenecen a detectives distintos.");
    }
    
    // Validación especial para detectives que requieren mínimo 3 cartas
    const detectiveName = cartasBase[0].nombre;
    const detectivesMinimo3 = ["Hercule Poirot", "Miss Marple"];
    
    if (detectivesMinimo3.includes(detectiveName)) {
      // Contar todas las cartas: detective específico + comodines
      const cartasDelDetective = cartasBase.filter(card => card.nombre === detectiveName);
      const comodines = cards.filter(card => 
        card.nombre.includes("Wildcard") || 
        card.nombre === "Harley Quin Wildcard"
      );
      
      const totalCartas = cartasDelDetective.length + comodines.length;
      
      if (totalCartas < 3) {
        throw new Error(`Los sets de ${detectiveName} requieren al menos 3 cartas (detective + comodines).`);
      }
      
      // Verificar que haya al menos 1 carta del detective específico
      if (cartasDelDetective.length === 0) {
        throw new Error(`Los sets de ${detectiveName} requieren al menos 1 carta del detective específico.`);
      }
    }
    
    // Retornar el nombre del set en el formato que espera el backend
    return `Set de ${detectiveName}`;
  };

  const secretsToShow = Array.isArray(gameState.secrets) 
  ? gameState.secrets 
  : [];
  
  const draftToShow = Array.from({ length: 3 }, (_, index) =>
    Array.isArray(gameState.draft) && gameState.draft[index]
      ? gameState.draft[index]
      : null,
  );

  const [showEventModal, setShowEventModal] = useState(false);
  const showEventModalRef = useRef(showEventModal);
  useEffect(() => {
    showEventModalRef.current = showEventModal;
  }, [showEventModal]);
  const [eventCardData, setEventCardData] = useState(null);
  const openEventModal = (cartaId, cartaNombre) => {
    if (cartaId == null) return; 
    
    // Verificar si es el turno del jugador
    if (Number.isNaN(currentUserId) || gameState.currentTurn !== currentUserId) {
      toast.error("No es tu turno. Solo puedes jugar eventos durante tu turno.", {
        duration: 4000
      });
      return;
    }
    
    // Verificar si el jugador está en desgracia social
    if (isCurrentPlayerInSocialDisgrace()) {
      toast.error("No puedes jugar eventos mientras estás en desgracia social. Solo puedes descartar y robar cartas.", {
        duration: 4000
      });
      return;
    }
    
    const id = Number(cartaId);
    const nombre = cartaNombre ?? "";
    const nameKey = String(nombre).trim().toLowerCase();
    const info = getCardInfo?.(nombre) ?? {};
    const hardcodedRequiresTarget = [
      "cards off the table",
      "cards off the table (es)",
    ].includes(nameKey);
    const hardcodedRequiresSetTarget = nameKey.includes("another victim");
    const requiresSecretId = Boolean(
      info.requiresSecretId || info.requires_secret_id,
    );
    const requiresTarget = Boolean(
      info.requiresPlayerTarget || info.requires_target || info.requiresTarget || hardcodedRequiresTarget,
    );
    const requiresSetTarget = Boolean(
      info.requiresSetTarget || info.requires_set_target || hardcodedRequiresSetTarget,
    );
    const allowSelfTarget = Boolean(info.allowSelfTarget || info.allow_self);
    const actionKey = info.actionKey ?? info.key ?? null;
    const payload = {
      id,
      nombre,
      requiresSecretId,
      requiresTarget,
      requiresSetTarget,
      allowSelfTarget,
      actionKey,
      cardInfo: info,
    };
    // Proveer mano del jugador actual para eventos que necesitan elegir cartas (ej: Card Trade)
    if (Array.isArray(gameState.cards)) {
      // Si es Card Trade, filtrar solo la carta específica que se está jugando (no todas las Card Trade)
      const isCardTrade = nameKey.includes("card trade") || nombre === "Card Trade";
      payload.playerCards = isCardTrade 
        ? gameState.cards.filter(card => {
            // Filtrar solo la carta que se está jugando (por ID), no todas las Card Trade
            const cardId = card.carta_id ?? card.id ?? card.cartaId;
            return cardId !== id;
          })
        : gameState.cards;
    }
    setEventCardData(payload);
    if (typeof process !== "undefined" && process?.env?.NODE_ENV !== "production") {
      console.debug("openEventModal -> stored eventCardData:", payload);
    }
    setShowEventModal(true);
  };

  const closeEventModal = useCallback(
    (options = {}) => {
      const { cancelled = false, cardName = null } = options;
      const currentTurnId = Number(gameState.currentTurn);
      const actorName = !Number.isNaN(currentTurnId)
        ? getPlayerNameById(gameState.players, currentTurnId)
        : null;

      if (cancelled && Number(currentUserId) === currentTurnId) {
        announceEventCancelled({ cardName });
      }

      setShowEventModal(false);
      setEventCardData(null);

      if (!Number.isNaN(currentTurnId)) {
        setStatusMessage((prev) => {
          // Si el actor canceló: mantener/forzar el estado local a "turn" SIN message
          // para que el actor vea "Es tu turno. Realiza tu acción." en verde.
          if (cancelled && Number(currentUserId) === currentTurnId) {
            return {
              type: "turn",
              actorId: currentTurnId,
              actorName,
              cardName: null,
              timestamp: Date.now(),
            };
          }

          // Para los demás casos de cancelación (esto sólo corre en el cliente que ejecutó close),
          // dejamos el mensaje de espera para mostrárselo a quienes no sean el actor.
          if (cancelled) {
            return {
              type: "turn",
              actorId: currentTurnId,
              actorName,
              cardName: null,
              message: actorName ? `Esperando el movimiento de ${actorName}.` : null,
              timestamp: Date.now(),
            };
          }

          // Si no es cancelación, preservar prev salvo que venga de un evento
          if (!cancelled && prev?.type !== "event") {
            return prev;
          }

          return {
            type: "turn",
            actorId: currentTurnId,
            actorName,
            cardName: null,
            timestamp: Date.now(),
          };
        });
      }
    },
    [announceEventCancelled, gameState.currentTurn, gameState.players, currentUserId],
  );

  useEffect(() => {
    const isMyTurn = !Number.isNaN(currentUserId) && gameState.currentTurn === currentUserId;
    if (!isMyTurn) {
      if (showEventModal) {
        setShowEventModal(false);
      }
      if (eventCardData != null) {
        setEventCardData(null);
      }
      if (isWaitingForResponse) {
        setIsWaitingForResponse(false);
      }
      if (waitingMessage != null) {
        setWaitingMessage(null);
      }
    }
  }, [gameState.currentTurn, currentUserId, showEventModal, eventCardData, isWaitingForResponse, waitingMessage]);

  const fetchPlayerSecrets = async (playerId) => {
    console.log("DEBUG fetchPlayerSecrets called for playerId:", playerId);
    
    if (!playerId) return [];
    const normalizeList = (list) =>
      (Array.isArray(list) ? list : []).map((s) => ({
        ...s,
        jugador_id: Number(s?.jugador_id ?? s?.jugadorId ?? s?.owner_id ?? s?.owner ?? NaN),
        secreto_id: Number(s?.secreto_id ?? s?.secretoId ?? s?.id ?? NaN),
        descripcion: s?.descripcion ?? s?.texto ?? s?.description ?? s?.body ?? "",
        revealed: s?.revealed ?? s?.revelado ?? false,
        revelado: s?.revelado ?? s?.revealed ?? false,
      })).filter(s => !Number.isNaN(s.secreto_id));
    try {
      const res = await get(`/partidas/${gameData.id}/secretos?jugadorId=${playerId}`);
      console.debug("fetchPlayerSecrets - GET res:", res);
      if (!res) return [];
      if (res.secretos && typeof res.secretos === "object") {
        const list = res.secretos[String(playerId)] ?? res.secretos[playerId] ?? [];
        return normalizeList(list);
      }
      // caso: array plano o envoltorios
      if (Array.isArray(res)) return normalizeList(res).filter(s => Number(s.jugador_id) === Number(playerId));
      if (Array.isArray(res.secretos)) return normalizeList(res.secretos).filter(s => Number(s.jugador_id) === Number(playerId));
      if (Array.isArray(res.data)) return normalizeList(res.data).filter(s => Number(s.jugador_id) === Number(playerId));
      if (Array.isArray(res.secrets)) return normalizeList(res.secrets).filter(s => Number(s.jugador_id) === Number(playerId));
      // si viene como objeto mapeando playerId -> lista (otra forma)
      if (res[String(playerId)] && Array.isArray(res[String(playerId)])) {
        return normalizeList(res[String(playerId)]);
      }
      if (res[playerId] && Array.isArray(res[playerId])) {
        return normalizeList(res[playerId]);
      }
      // intentar extraer arrays dentro del objeto
      const values = Object.values(res).flatMap(v => (Array.isArray(v) ? v : []));
      const byPlayer = normalizeList(values).filter(s => Number(s.jugador_id) === Number(playerId));
      if (byPlayer.length > 0) return byPlayer;
      return [];
    } catch (err) {
      console.warn("fetchPlayerSecrets: GET falló, usando fallback allSecretsRaw", err);
      if (!allSecretsRaw) return [];
      // fallback: buscar en allSecretsRaw.secretos que es el mapping que mostraste
      const raw = allSecretsRaw;
      if (raw && raw.secretos && typeof raw.secretos === "object") {
        const list = raw.secretos[String(playerId)] ?? raw.secretos[playerId] ?? [];
        return normalizeList(list);
      }
      if (Array.isArray(raw)) return normalizeList(raw).filter(s => Number(s.jugador_id) === Number(playerId));
      const values = Object.values(raw).flatMap(v => (Array.isArray(v) ? v : []));
      return normalizeList(values).filter(s => Number(s.jugador_id) === Number(playerId));
    }
  };

  const handleRevealSecretAction = async ({ jugadorId, secretoId }) => {
    // Si no tenemos la información del modal, no hacemos nada
    if (!showRevealSecretModal) return;
    const { mode, setName } = showRevealSecretModal;
    const selectedCards =
      Array.isArray(showRevealSecretModal.selectedCards)
        ? showRevealSecretModal.selectedCards
        : Array.isArray(showRevealSecretModal.originalPayload?.selectedCards)
          ? showRevealSecretModal.originalPayload.selectedCards
          : [];
    const cardIds = Array.isArray(selectedCards)
      ? selectedCards.map(c => c.carta_id)
      : Array.isArray(showRevealSecretModal.originalPayload?.cardIds)
        ? showRevealSecretModal.originalPayload.cardIds
        : [];
    
    try {
      if (
        showRevealSecretModal?.source === "point_suspicion" ||
        showRevealSecretModal?.source === "point_suspicions"
      ) {
        if (!jugadorId || !secretoId) {
          toast.error("Debes seleccionar un jugador y un secreto para revelar.");
          return;
        }

        try {
          await post(`/partidas/${gameData.id}/eventos/point-your-suspicion`, {
            targetId: Number(jugadorId),
            secretoId: Number(secretoId),
          });
        } catch (error) {
          console.error("Error al ejecutar Point Your Suspicion:", error);
          const message =
            error?.response?.data?.detail ||
            error?.body?.detail ||
            error?.message ||
            "No se pudo revelar el secreto.";
          toast.error(message);
          return;
        }

        let localSecret = null;
        try {
          localSecret = Array.isArray(gameState.secrets)
            ? gameState.secrets.find(
                (secret) =>
                  Number(secret?.secreto_id ?? secret?.id ?? secret?.secretoId) ===
                  Number(secretoId),
              )
            : null;
        } catch (lookupError) {
          console.debug("No se pudo localizar secreto local para Point Your Suspicion:", lookupError);
        }

        try {
          applyRevealToState({
            targetId: Number(jugadorId),
            secretId: Number(secretoId),
            secretoObj: localSecret ?? null,
          });
        } catch (err) {
          console.debug("Actualización optimista falló para Point Your Suspicion:", err);
        }

        setPointSuspicionsState((prev) => {
          if (!prev) return prev;
          if (prev.roundId && prev.roundId !== pointSuspicionsState.roundId) return prev;
          return {
            ...prev,
            status: "finished",
            secret: {
              targetId: Number(jugadorId),
              secretId: Number(secretoId),
              secret: localSecret ?? null,
            },
          };
        });

        const broadcastPayload = {
          partidaId: gameData.id,
          roundId: showRevealSecretModal.roundId ?? pointSuspicionsState.roundId ?? null,
          targetId: Number(jugadorId),
          secretId: Number(secretoId),
          secret: localSecret ?? undefined,
        };

        if (sendMessage) {
          try {
            sendMessage({
              event: "point_suspicions_secret_selected",
              data: broadcastPayload,
            });
          } catch (broadcastError) {
            console.warn("No se pudo propagar la revelación de Point Your Suspicion:", broadcastError);
          }
        }

        toast.success("Secreto revelado gracias a Point Your Suspicion.");
        setSelectedIds(new Set());
        setShowRevealSecretModal(null);
        return;
      }

      // Caso 1: Set de 3+ cartas (ej. Poirot). Elegimos jugador y secreto para REVELAR.
      if (mode === "choose_player_and_secret") {
        if (!jugadorId || !secretoId) {
          toast.error("Debes seleccionar un jugador y un secreto.");
          return;
        }

        if (showRevealSecretModal?.source === "add_detective") {
          try {
            await playDetectiveOnSet({
              cardId: showRevealSecretModal.cardId,
              setId: showRevealSecretModal.setId,
              setOwnerId:
                showRevealSecretModal.setOwnerId ??
                pendingDetectiveAction?.setOwnerId ??
                currentUserId,
              jugadorObjetivoId: jugadorId,
              secretoIdObjetivo: secretoId,
            });
          } catch (error) {
            // manejado dentro de playDetectiveOnSet
          }
          setShowRevealSecretModal(null);
          return;
        }
        
        await post(`/partidas/${gameData.id}/jugar-y-resolver-set`, {
          jugador_id: currentUserId,
          cartas_ids: cardIds,
          nombre_set: setName,
          jugador_id_objetivo: jugadorId,
          secreto_id_objetivo: secretoId,
        });
        toast.success("¡Set jugado y secreto revelado!");
        // Optimistic UI update: increment the target player's revealed counter
        try {
          applyRevealToState({ targetId: jugadorId, secretId: secretoId });
        } catch (err) {
          console.debug('Optimistic update failed:', err);
        }
      } 
      // Caso 2: Set de Pyne - Elegimos jugador y secreto para OCULTAR
      else if (mode === "choose_player_and_secret_to_hide") {
        if (!jugadorId || !secretoId) {
          toast.error("Debes seleccionar un jugador y un secreto revelado para ocultar.");
          return;
        }

        if (showRevealSecretModal?.source === "add_detective") {
          try {
            await playDetectiveOnSet({
              cardId: showRevealSecretModal.cardId,
              setId: showRevealSecretModal.setId,
              setOwnerId:
                showRevealSecretModal.setOwnerId ??
                pendingDetectiveAction?.setOwnerId ??
                currentUserId,
              jugadorObjetivoId: jugadorId,
              secretoIdObjetivo: secretoId,
            });
          } catch (error) {
            // manejado dentro de playDetectiveOnSet
          }
          setShowRevealSecretModal(null);
          return;
        }
        
        console.log("Ejecutando Set de Parker Pyne - OCULTAR:", { jugadorId, secretoId });
        
        await post(`/partidas/${gameData.id}/jugar-y-resolver-set`, {
          jugador_id: currentUserId,
          cartas_ids: cardIds,
          nombre_set: setName,
          jugador_id_objetivo: jugadorId,
          secreto_id_objetivo: secretoId,
          accion: "ocultar" 
        });
        toast.success("¡Set de Pyne jugado y secreto ocultado!");
        
        // NO hacer actualización optimista para Sets de Pyne
        // El WebSocket se encarga de enviar secreto_ocultado y set_jugado_y_resuelto
        console.log("Set de Parker Pyne enviado, esperando eventos WebSocket...");
      }
      // Caso 3: Set de 2 cartas (ej. Beresford). Elegimos un jugador para que él elija.
      else if (mode === "choose_player_then_they_choose_secret") {
        if (!jugadorId) {
          toast.error("Debes seleccionar un jugador.");
          return;
        }

        if (showRevealSecretModal?.source === "add_detective") {
          setIsWaitingForResponse(true);
          toast("Esperando que el oponente elija un secreto...");
          if (sendMessage) {
            sendMessage({
              event: "pedir_revelar_secreto",
              data: {
                partidaId: gameData.id,
                jugadorQuePideId: currentUserId,
                jugadorObjetivoId: jugadorId,
                setName: showRevealSecretModal.setName,
                accion: "add_detective",
                cardId: showRevealSecretModal.cardId,
                setId: showRevealSecretModal.setId,
                cardName: showRevealSecretModal.cardName,
                setOwnerId:
                  showRevealSecretModal.setOwnerId ??
                  pendingDetectiveAction?.setOwnerId ??
                  currentUserId,
                isUnblockable: pendingDetectiveAction?.isUnblockable ?? false,
              },
            });
          }
          setShowRevealSecretModal(null);
          return;
        }
        // Aquí no se hace el POST final, se envía una petición al otro jugador
        setIsWaitingForResponse(true);
        toast('Esperando que el oponente elija un secreto...');
        // El backend se encargará de reenviar esto al jugador objetivo
        if (sendMessage) {
          sendMessage({
            event: "pedir_revelar_secreto",
            data: {
              partidaId: gameData.id,
              jugadorQuePideId: currentUserId,
              jugadorObjetivoId: jugadorId,
              setName: setName,
              cardIds: cardIds,
            }
          });
        }

        // Nota: Social Faux Pas se maneja directamente en EventModal antes de enviar la respuesta.
      }
      // Caso 4: Respondiendo a una petición para revelar nuestro secreto.
      else if (mode === "choose_secret_to_reveal") {
        if (!secretoId) {
          toast.error("Debes seleccionar un secreto para revelar.");
          return;
        }
        // Enviamos la respuesta para que el jugador original pueda completar su jugada
        if (sendMessage) {
          sendMessage({
            event: "respuesta_revelar_secreto",
            data: {
              partidaId: gameData.id,
              originalPayload: showRevealSecretModal.originalPayload,
              secretoIdRevelado: secretoId,
            }
          });
        }
        try {
          // Guardar id último para evitar procesarlo dos veces si llega el evento del servidor
          applyRevealToState({ targetId: currentUserId, secretId: secretoId, skipDedupe: false });
        } catch (err) {
          console.debug('Optimistic reveal (target) failed:', err);
        } finally {
          setIsWaitingForResponse(false);
          setWaitingMessage(null);
        }
      }
      else if (mode === "card_trade_blackmailed") {
        if (!secretoId) {
          toast.error("Debes seleccionar un secreto para mostrar.");
          return;
        }
        const pasadorName =
          showRevealSecretModal?.pasadorName ??
          (showRevealSecretModal?.pasadorId != null
            ? `Jugador ${showRevealSecretModal?.pasadorId}`
            : "tu oponente");
        const pasadorId = showRevealSecretModal?.pasadorId ?? null;
        const receptorName =
          showRevealSecretModal?.receptorName ??
          (Number.isNaN(currentUserId)
            ? null
            : gameState.players.find((p) => Number(p.id) === Number(currentUserId))?.nombre ??
              `Jugador ${currentUserId}`);
        const resolveSecret = () => {
          if (Array.isArray(gameState.secrets)) {
            const found = gameState.secrets.find(
              (secret) => Number(secret?.secreto_id ?? secret?.id ?? secret?.secretoId) === Number(secretoId),
            );
            if (found) return found;
          }
          const searchPool = (() => {
            if (!allSecretsRaw) return [];
            if (Array.isArray(allSecretsRaw)) return allSecretsRaw;
            if (Array.isArray(allSecretsRaw?.secretos)) return allSecretsRaw.secretos;
            if (typeof allSecretsRaw?.secretos === "object") {
              return Object.values(allSecretsRaw.secretos).flatMap((list) =>
                Array.isArray(list) ? list : [],
              );
            }
            if (typeof allSecretsRaw === "object") {
              return Object.values(allSecretsRaw).flatMap((list) => (Array.isArray(list) ? list : []));
            }
            return [];
          })();
          if (searchPool.length > 0) {
            const fallback = searchPool.find(
              (secret) => Number(secret?.secreto_id ?? secret?.id ?? secret?.secretoId) === Number(secretoId),
            );
            if (fallback) return fallback;
          }
          return null;
        };
        const secretoSeleccionado = resolveSecret();
        const payloadSecret =
          secretoSeleccionado ?? { secreto_id: secretoId, descripcion: "Secreto seleccionado" };
        setSecretoEnModal({
          ...payloadSecret,
          context: {
            type: "card_trade_blackmailed",
            role: "target",
            pasadorId,
            pasadorName,
            receptorId: Number(currentUserId),
            receptorName,
          },
        });
        if (sendMessage && pasadorId != null) {
          try {
            sendMessage({
              event: "card_trade_blackmailed_secret",
              data: {
                partidaId: gameData.id,
                pasadorId,
                pasadorName,
                receptorId: Number(currentUserId),
                receptorName,
                secreto: payloadSecret,
              },
            });
          } catch (secretSendError) {
            console.error("No se pudo notificar el secreto privado al pasador:", secretSendError);
          }
        }
        toast.success(`Mostrale este secreto en privado a ${pasadorName}.`);
        setShowRevealSecretModal(null);
        setSelectedIds(new Set());
        return;
      } else if (mode === "dead_card_folly_blackmailed") {
        if (!secretoId) {
          toast.error("Debes seleccionar un secreto para mostrar.");
          return;
        }
        const pasadorName =
          showRevealSecretModal?.pasadorName ??
          (showRevealSecretModal?.pasadorId != null
            ? `Jugador ${showRevealSecretModal?.pasadorId}`
            : "tu oponente");
        const pasadorId = showRevealSecretModal?.pasadorId ?? null;
        const receptorName =
          showRevealSecretModal?.receptorName ??
          (Number.isNaN(currentUserId)
            ? null
            : gameState.players.find((p) => Number(p.id) === Number(currentUserId))?.nombre ??
              `Jugador ${currentUserId}`);
        const resolveSecret = () => {
          if (Array.isArray(gameState.secrets)) {
            const found = gameState.secrets.find(
              (secret) => Number(secret?.secreto_id ?? secret?.id ?? secret?.secretoId) === Number(secretoId),
            );
            if (found) return found;
          }
          const searchPool = (() => {
            if (!allSecretsRaw) return [];
            if (Array.isArray(allSecretsRaw)) return allSecretsRaw;
            if (Array.isArray(allSecretsRaw?.secretos)) return allSecretsRaw.secretos;
            if (typeof allSecretsRaw?.secretos === "object") {
              return Object.values(allSecretsRaw.secretos).flatMap((list) =>
                Array.isArray(list) ? list : [],
              );
            }
            if (typeof allSecretsRaw === "object") {
              return Object.values(allSecretsRaw).flatMap((list) => (Array.isArray(list) ? list : []));
            }
            return [];
          })();
          if (searchPool.length > 0) {
            const fallback = searchPool.find(
              (secret) => Number(secret?.secreto_id ?? secret?.id ?? secret?.secretoId) === Number(secretoId),
            );
            if (fallback) return fallback;
          }
          return null;
        };
        const secretoSeleccionado = resolveSecret();
        const payloadSecret =
          secretoSeleccionado ?? { secreto_id: secretoId, descripcion: "Secreto seleccionado" };
        setSecretoEnModal({
          ...payloadSecret,
          context: {
            type: "dead_card_folly_blackmailed",
            role: "target",
            pasadorId,
            pasadorName,
            receptorId: Number(currentUserId),
            receptorName,
          },
        });
        if (sendMessage && pasadorId != null) {
          try {
            sendMessage({
              event: "card_trade_blackmailed_secret",
              data: {
                partidaId: gameData.id,
                pasadorId,
                pasadorName,
                receptorId: Number(currentUserId),
                receptorName,
                secreto: payloadSecret,
                contextType: "dead_card_folly_blackmailed",
              },
            });
          } catch (secretSendError) {
            console.error("No se pudo notificar el secreto privado al pasador (Dead Card Folly):", secretSendError);
          }
        }
        toast.success(`Dead Card Folly: mostrale este secreto en privado a ${pasadorName}.`);
        setShowRevealSecretModal(null);
        setSelectedIds(new Set());
        return;
      } else if (mode === "card_trade_social_faux") {
        if (!secretoId) {
          toast.error("Debes seleccionar un secreto para revelar.");
          return;
        }
        if (!pendingSocialFauxTrade) {
          toast.error("No hay un intercambio pendiente.");
          return;
        }
        const { body, requestId } = pendingSocialFauxTrade;
        const nextBody = {
          ...body,
          secretosARevelarIds: [Number(secretoId)],
        };
        setShowRevealSecretModal(null);
        setSelectedIds(new Set());
        setPendingSocialFauxTrade(null);
        setIsWaitingForResponse(true);
        try {
          await finalizeCardTradeResponse(nextBody, requestId);
        } catch (err) {
          setIsWaitingForResponse(false);
          throw err;
        }
        return;
      } else if (mode === "card_trade_social_faux_effect") {
        if (!secretoId) {
          toast.error("Debes seleccionar un secreto para revelar.");
          return;
        }
        setIsWaitingForResponse(true);
        try {
          const response = await post(`/partidas/${gameData.id}/eventos/card-trade/social-faux`, {
            jugadorId: Number(currentUserId),
            secretoId: Number(secretoId),
          });
          const revealedSecret = response?.secreto ?? null;
          if (revealedSecret) {
            try {
              applyRevealToState({
                targetId: Number(currentUserId),
                secretId: Number(secretoId),
                secretoObj: revealedSecret,
                skipDedupe: false,
              });
            } catch (err) {
              console.debug("Actualización optimista falló para Social Faux Pas (resultado):", err);
            }
          }
          toast.success("Revelaste un secreto por Social Faux Pas.");
        } catch (err) {
          const message = err?.response?.data?.detail || err?.message || "No se pudo revelar el secreto.";
          toast.error(message);
          throw err;
        } finally {
          setIsWaitingForResponse(false);
          setShowRevealSecretModal(null);
          setSelectedIds(new Set());
        }
        return;
      } else if (mode === "dead_card_folly_social_faux_effect") {
        if (!secretoId) {
          toast.error("Debes seleccionar un secreto para revelar.");
          return;
        }
        setIsWaitingForResponse(true);
        try {
          const response = await post(`/partidas/${gameData.id}/eventos/dead-card-folly/social-faux`, {
            jugadorId: Number(currentUserId),
            secretoId: Number(secretoId),
          });
          const revealedSecret = response?.secreto ?? null;
          if (revealedSecret) {
            try {
              applyRevealToState({
                targetId: Number(currentUserId),
                secretId: Number(secretoId),
                secretoObj: revealedSecret,
                skipDedupe: false,
              });
            } catch (err) {
              console.debug("Actualización optimista falló para Dead Card Folly Social Faux:", err);
            }
          }
          toast.success("Dead Card Folly: revelaste un secreto.");
        } catch (err) {
          const message = err?.response?.data?.detail || err?.message || "No se pudo revelar el secreto.";
          toast.error(message);
          throw err;
        } finally {
          setIsWaitingForResponse(false);
          setShowRevealSecretModal(null);
          setSelectedIds(new Set());
        }
        return;
      }
      // Limpiamos los estados al confirmar
      setSelectedIds(new Set());
      setShowRevealSecretModal(null);
    } catch (error) {
      console.error("Error en la acción del set:", error);
      toast.error(error?.response?.data?.detail || "No se pudo realizar la acción del set.");
      setIsWaitingForResponse(false); // Desbloquear en caso de error
      setWaitingMessage(null);
    }
  };


  function getDetectiveEffect(setName) {
    if (!setName) return null;
    const lower = setName.toLowerCase();
    console.log("getDetectiveEffect called with:", setName, "lower:", lower);
    
    if (["poirot", "marple"].some(n => lower.includes(n))) {
      console.log("Returning choose_player_and_secret for:", setName);
      return "choose_player_and_secret";
    }
    
    // abra el modal para elegir jugador y luego que ellos elijan secreto
    if (lower === "set de beresford") {
      console.log("Returning choose_player_then_they_choose_secret for Beresford set");
      return "choose_player_then_they_choose_secret";
    }
    
    // Otros sets de 2 cartas (Tommy, Tuppence, etc.) sí abren modal.
    if (["satterthwaite", "bundle", "tommy", "tuppence", "beresford"].some(n => lower.includes(n))) {
      console.log("Returning choose_player_then_they_choose_secret for:", setName);
      return "choose_player_then_they_choose_secret";
    }

    // Set de Pyne OCULTA secretos (efecto especial)
    if (lower.includes("pyne")) {
      console.log("Returning choose_player_and_secret_to_hide for Pyne set");
      return "choose_player_and_secret_to_hide";
    }
      
    console.log("No detective effect for:", setName);
    return null; // Solo los que revelan secreto
  }

  const [showRevealSecretModal, setShowRevealSecretModal] = useState(null);
  const [pendingRevealModals, setPendingRevealModals] = useState([]);

  const enqueueRevealModal = useCallback(
    (modalPayload) => {
      if (showRevealSecretModal) {
        setPendingRevealModals((prev) => [...prev, modalPayload]);
      } else {
        setShowRevealSecretModal(modalPayload);
      }
    },
    [showRevealSecretModal],
  );

  useEffect(() => {
    if (showRevealSecretModal || pendingRevealModals.length === 0) return;
    const [nextModal, ...rest] = pendingRevealModals;
    setPendingRevealModals(rest);
    setShowRevealSecretModal(nextModal);
  }, [pendingRevealModals, showRevealSecretModal]);

  useEffect(() => {
    if (!deadCardFollyLocked) return;
    if (showRevealSecretModal) return;
    if (pendingRevealModals.length > 0) return;
    if (deadCardFollyState.status === "completed") {
      setDeadCardFollyLocked(false);
    }
  }, [deadCardFollyLocked, showRevealSecretModal, pendingRevealModals.length, deadCardFollyState.status]);

  const playEventCardsOff = async (cartaId, cartaNombre, targetPlayerId = null) => {
    console.log("Carta jugada (placeholder):", cartaId, cartaNombre, targetPlayerId);
    try {
      await post(`/partidas/${gameData.id}/eventos/cards-off-the-table`, {
        jugadorId: currentUserId,
        cartaEventoId: cartaId,
        jugadorObjetivoId: targetPlayerId,
      });
    } catch (error) {
      console.error(`Error al ejecutar ${cartaNombre}:`, error);
      toast.error(`No se pudo jugar el evento ${cartaNombre}`);
      throw error;
    }
  };

  // Handler específico para "Delay the Murderer Escape" 
  const playEventDelayMurderer = async (cartaId, cartaNombre) => {
    console.log("Ejecutando Delay the Murderer Escape:", cartaId, cartaNombre);
    try {
      // Verificar si hay cartas en el descarte
      if (!Array.isArray(gameState.descarte) || gameState.descarte.length === 0) {
        const message = "No hay cartas en el descarte. No se puede ejecutar este evento.";
        toast.error(message);
        const handledError = new Error(message);
        handledError.toastHandled = true;
        throw handledError;
      }
      // Solo enviar al backend - el WebSocket manejará la actualización del estado
      await post(`/partidas/${gameData.id}/eventos/delay-the-murderer`, {
        jugadorId: currentUserId,
        cartaEventoId: cartaId,
      });
      
    } catch (error) {
      const normalizedError =
        error instanceof Error ? error : new Error(String(error ?? "Error desconocido"));
      console.error("Error al ejecutar Delay the Murderer Escape:", normalizedError);
      
      if (!normalizedError.toastHandled) {
        const toastMessage = normalizedError.message?.trim() || "No se pudo jugar Delay the Murderer Escape";
        toast.error(toastMessage);
        normalizedError.toastHandled = true;
      }
      throw normalizedError;
    }
  };

  const playEventAndThenThereWasOneMore = async (cartaId, cartaNombre, 
                                   targetPlayerId = null, secretTargetId) => {
    console.log("Jugando And then there was one more:");
  console.log("  - cartaId:", cartaId);
  console.log("  - cartaNombre:", cartaNombre);
  console.log("  - targetPlayerId:", targetPlayerId);
  console.log("  - secretTargetId:", secretTargetId);
  
  // Validar que tengamos jugador objetivo
  if (!targetPlayerId) {
    const message = "Debes seleccionar un jugador que recibirá el secreto.";
    toast.error(message);
    const handledError = new Error(message);
    handledError.toastHandled = true;
    throw handledError;
  }

  if (!secretTargetId) {
    const message = "Debes seleccionar un secreto revelado.";
    toast.error(message);
    const handledError = new Error(message);
    handledError.toastHandled = true;
    throw handledError;
  }

  const requestBody = {
    jugadorId: currentUserId,
    cartaEventoId: cartaId,
    secretoRevelado: secretTargetId,
    nuevoOwner: targetPlayerId,
  };
  
  console.log("Enviando petición POST con body:", requestBody);

  try {
    const response = await post(`/partidas/${gameData.id}/eventos/and-then-there-was-one-more`, requestBody);
    console.log("Respuesta del servidor:", response);

    // Refrescar TODOS los secretos INMEDIATAMENTE después de ejecutar el evento
    setTimeout(async () => {
      try {
        console.log("Refrescando TODOS los secretos después de ejecutar el evento...");
        
        // Hacer la petición HTTP para obtener TODOS los secretos actualizados
        const secretosRes = await get(`/partidas/${gameData.id}/secretos`);
        console.log("Todos los secretos actualizados desde servidor:", secretosRes);
        
        // Actualizar allSecretsRaw (fuente de verdad para otros jugadores)
        setAllSecretsRaw(secretosRes);
        
        // Normalizar y actualizar mis secretos
        const freshSecrets = normalizeSecrets(secretosRes, currentUserId);
        console.log(" Mis secretos frescos:", freshSecrets, "Total:", freshSecrets.length);
        
        // Actualizar el estado global con los nuevos secretos
        setGameState((prev) => {
          const prevSecrets = Array.isArray(prev.secrets) ? prev.secrets : [];
          
          // Preservar el estado "revealed" de los secretos existentes
          const revealedMap = new Map(
            prevSecrets.map(s => [
              s.secreto_id ?? s.id ?? s.secretoId,
              s.revealed ?? s.revelado ?? false
            ])
          );
          
          const mergedSecrets = freshSecrets.map(freshSecret => {
            const secretId = freshSecret.secreto_id ?? freshSecret.id ?? freshSecret.secretoId;
            const wasRevealed = revealedMap.get(secretId);
            
            return {
              ...freshSecret,
              revealed: wasRevealed !== undefined ? wasRevealed : (freshSecret.revealed ?? freshSecret.revelado ?? false),
              revelado: wasRevealed !== undefined ? wasRevealed : (freshSecret.revelado ?? freshSecret.revealed ?? false),
            };
          });
          
          console.log("Secretos después del merge:", mergedSecrets);
          
          return {
            ...prev,
            secrets: mergedSecrets,
          };
        });
        
        // Actualizar secretos revelados por jugador
        setRevealedSecretsByPlayer(normalizeRevealedSecretsByPlayer(secretosRes));
        
        // Sincronizar con el estado local
        setTimeout(() => syncRevealedSecretsByPlayer(), 100);
        
        console.log("Todos los secretos actualizados correctamente");
        
      } catch (error) {
        console.error("Error al refrescar secretos después del evento:", error);
      }
    }, 500); // Delay para dar tiempo al backend a procesar

    // Solo remover la carta de evento de la mano del jugador
    setGameState((prev) => ({
      ...prev,
      cards: Array.isArray(prev.cards) 
        ? prev.cards.filter(card => Number(card.carta_id) !== Number(cartaId))
        : prev.cards
    }));
    
    // Limpiar selección ya que la carta fue eliminada
    setSelectedIds(new Set());

  } catch (error) {
    console.error(`Error al jugar evento ${cartaNombre}:`, error);
    if (!error.toastHandled) {
      toast.error(`No se pudo jugar el evento ${cartaNombre}`);
    }
    throw error;
  }
  };

  const playEventLookIntoTheAshes = async (cartaId, cartaNombre, selectedDiscardCardId = null) => {
    console.log("Ejecutando Look into the ashes:", cartaId, cartaNombre, selectedDiscardCardId);
    
    try {
      // Requerir que el jugador descarte si ya tiene 6 o más cartas
      if (Array.isArray(gameState.cards) && gameState.cards.length >= 6) {
        const msg = 'Debes descartar una carta antes de jugar este evento';
        toast.error(msg);
        const handledError = new Error(msg);
        handledError.toastHandled = true;
        throw handledError; 
      }
      if (!Array.isArray(gameState.descarte) || gameState.descarte.length === 0) {
        const msg = "No hay cartas en el descarte. No se puede ejecutar este evento.";
        toast.error(msg);
        const handledError = new Error(msg);
        handledError.toastHandled = true;
        throw handledError;
      }
      // Enviar al backend el id de la carta seleccionada (si hay)
      await post(`/partidas/${gameData.id}/eventos/look-into-the-ashes`, {
        jugadorId: currentUserId,
        cartaEventoId: cartaId,
        cartaSeleccionadaId: selectedDiscardCardId ?? null,
        cartaDescarteId: selectedDiscardCardId ?? null,
      });
      await discardSelected(); 
      await refreshPlayerHand(); // refrescar mano desde backend
      toast.success('Evento jugado: Look into the ashes'); 
    } catch (error) {
      const normalizedError = error instanceof Error ? error : new Error(String(error ?? "Error desconocido"));
      console.error("Error al ejecutar Look into the ashes:", normalizedError);
      if (!normalizedError.toastHandled) {
        const toastMessage = normalizedError.message?.trim() || "No se pudo jugar Look into the ashes";
        toast.error(toastMessage);
        normalizedError.toastHandled = true;
      }
      throw normalizedError;
    }
  };

  const playEventAnotherVictim = async (cartaId, cartaNombre, targetSetId = null) => {
    console.log("Ejecutando Another Victim:", cartaId, cartaNombre, targetSetId);
    try {
      // Verificar que se haya seleccionado un set objetivo
      if (!targetSetId) {
        const message = "Debes seleccionar un set para robar.";
        toast.error(message);
        const handledError = new Error(message);
        handledError.toastHandled = true;
        throw handledError;
      }
      
      let currentSets = allPlayersSets; // Usar el estado actual
      let targetSet = currentSets.find((set) => Number(set.id) === Number(targetSetId) || Number(set.set_id) === Number(targetSetId));
      
      if (!targetSet) {
        // Si no se encuentra, refrescar y usar el valor retornado
        console.log("Set no encontrado en estado, recargando...");
        try {
          currentSets = await loadAllPlayerSets(true); // Capturar los sets retornados
        } catch (e) {
          // ignora
        }
        targetSet = currentSets.find((set) => Number(set.id) === Number(targetSetId) || Number(set.set_id) === Number(targetSetId));
      }

      if (!targetSet) {
        const message = "Set objetivo no encontrado.";
        toast.error(message);
        const handledError = new Error(message);
        handledError.toastHandled = true;
        throw handledError;
      }

      // Solo enviar al backend - el WebSocket manejará la actualización del estado
      await post(`/partidas/${gameData.id}/eventos/another-victim`, {
        jugador_ladron_id: parseInt(currentUserId),
        jugador_objetivo_id: targetSet.owner_id,
        set_id: parseInt(targetSetId),
        evento_id: parseInt(cartaId),
      });
      
    } catch (error) {
      const normalizedError =
        error instanceof Error ? error : new Error(String(error ?? "Error desconocido"));
      console.error("Error al ejecutar Another Victim:", normalizedError);
      
      if (!normalizedError.toastHandled) {
        const toastMessage = normalizedError.message?.trim() || "No se pudo jugar Another Victim";
        toast.error(toastMessage);
        normalizedError.toastHandled = true;
      }
      throw normalizedError;
    }
  };

  const playEventEarlyTrain = async (eventoId, cardName) => {
    try {
      console.log("Ejecutando evento Early Train to Paddington:", { eventoId, cardName });
      
      const response = await post(`/partidas/${gameData.id}/eventos/early-train`, {
        jugadorId: currentUserId,
        cartaEventoId: eventoId,
      });
      console.log("Early Train ejecutado exitosamente:", response);
      
      // El WebSocket manejará la actualización del estado
      toast.success("Early Train to Paddington: 6 cartas del mazo fueron movidas al descarte");
      
    } catch (error) {
      console.error("Error ejecutando Early Train:", error);
      const message = error.response?.data?.detail || "Error al ejecutar Early Train to Paddington";
      toast.error(message);
      throw new Error(message);
    }
  };

  // Handler para Card Trade (inicio de propuesta) - SIMPLIFICADO
  const playEventCardTrade = async (eventoId, cardName, targetPlayerId, offeredCardId) => {
    try {
      console.log("🎴 Card Trade: Iniciador propone intercambio", { eventoId, cardName, targetPlayerId, offeredCardId });

      // Generar correlador requestId
      const requestId =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

      const target = Array.isArray(gameState.players)
        ? gameState.players.find((p) => Number(p.id) === Number(targetPlayerId))
        : null;
      const targetName = target?.nombre ?? `Jugador ${targetPlayerId}`;
      const offeredCard =
        Array.isArray(gameState.cards)
          ? gameState.cards.find((card) => Number(card?.carta_id ?? card?.id ?? card?.cartaId) === Number(offeredCardId))
          : null;
      const offeredCardName = offeredCard?.nombre ?? offeredCard?.name ?? null;

      // Guardar propuesta localmente
      const pending = {
        requestId,
        partidaId: gameData.id,
        eventoId,
        cardName,
        requesterId: currentUserId,
        offeredCardId,
        offeredCardName,
        offeredCardData: offeredCard ? { ...offeredCard } : null,
        targetPlayerId,
        startedAt: Date.now(),
      };
      setPendingCardTrade(pending);

      // Optimistic: remover la carta de evento de la mano local del iniciador
      try {
        setGameState((prev) => ({
          ...prev,
          cards: Array.isArray(prev.cards)
            ? prev.cards.filter((c) => Number(c?.carta_id ?? c?.id ?? c?.cartaId) !== Number(eventoId))
            : prev.cards,
        }));
        // limpiar selección global local
        setSelectedIds(new Set());
      } catch (err) {
        console.warn('No se pudo remover optimistamente la carta de Card Trade:', err);
      }

      if (!sendMessage) {
        toast.error("No hay conexión WebSocket. No se puede proponer intercambio.");
        throw new Error("No WebSocket connection");
      }

      // En lugar de notificar inmediatamente al otro jugador, pedir Not So Fast primero.
      // Si nadie juega Not So Fast, el executor enviará la propuesta por WebSocket.
      const revealReq = sendRevealRequestForAction({
        actionType: "play_event",
        actionSummary: cardName ?? "Card Trade",
        blockable: true,
        payload: { _cardTradeProposal: true, ...pending },
        executor: async (req) => {
          try {
            console.log("📤 Enviando propuesta por WS (pedir_revelar_secreto):", req.payload);
            sendMessage({ event: "pedir_revelar_secreto", data: req.payload });
            setIsWaitingForResponse(true);
            setWaitingMessage(`Esperando respuesta de ${targetName}...`);
            toast.success(`Propuesta enviada a ${targetName}`);
          } catch (err) {
            console.error("No se pudo enviar propuesta por WS en executor:", err);
            throw err;
          }
        },
      });

      // Fallback: si no hay WebSocket o no se pudo crear la petición de reacción, enviar directamente
      if (!revealReq) {
        console.log("📤 WS no disponible, enviando propuesta directamente:", pending);
        sendMessage({
          event: "pedir_revelar_secreto",
          data: {
            _cardTradeProposal: true,
            ...pending,
          },
        });
        setIsWaitingForResponse(true);
        setWaitingMessage(`Esperando respuesta de ${targetName}...`);
        toast.success(`Propuesta enviada a ${targetName}`);
      }
    } catch (error) {
      console.error("❌ Error proponiendo Card Trade:", error);
      setPendingCardTrade(null);
      toast.error("No se pudo proponer el intercambio");
      throw error;
    }
  };

  // Handler para Card Trade (respuesta del jugador objetivo) - CON EJECUCIÓN DIRECTA
  const finalizeCardTradeResponse = async (body, requestId = null) => {
    try {
      console.log("📤 Ejecutando POST /eventos/card-trade:", body);
      const response = await post(`/partidas/${gameData.id}/eventos/card-trade`, body);
      console.log("✅ Respuesta del backend:", response);

      if (requestId && pendingCardTrade?.requestId === requestId) {
        setPendingCardTrade(null);
      }
      setPendingSocialFauxTrade(null);
      setIsWaitingForResponse(false);
      setWaitingMessage(null);
      setIncomingEvent(null);

      await refreshPlayerHand();
      await updateMazosState();
      toast.success("¡Intercambio completado!");
    } catch (error) {
      console.error("❌ Error ejecutando Card Trade:", error);
      const errorMsg = error?.response?.data?.detail || error?.message || "Error al procesar el intercambio";
      toast.error(errorMsg);
      throw error;
    }
  };

  const playEventCardTradeResponse = async (
    eventoId,
    cardName,
    requesterId,
    offeredCardId,
    chosenCardId,
    requestId = null,
    requiresSocialFauxReveal = false,
    secretosARevelarIds = null,
  ) => {
    try {
      console.log("🎴 Card Trade: Target responde y ejecuta", { eventoId, cardName, requesterId, offeredCardId, chosenCardId, requestId });

      // Ejecutar directamente el POST al backend
      const body = {
        jugadorId: Number(requesterId),
        cartaEventoId: eventoId,
        jugadorObjetivoId: Number(currentUserId),
        cartaOfrecidaId: offeredCardId,
        cartaElegidaId: chosenCardId,
      };
      if (requestId) body.requestId = requestId;
      const secretIdsClean = Array.isArray(secretosARevelarIds)
        ? secretosARevelarIds.filter((id) => id != null)
        : [];
      if (secretIdsClean.length > 0) {
        body.secretosARevelarIds = secretIdsClean;
      }

      if (requiresSocialFauxReveal && (!body.secretosARevelarIds || body.secretosARevelarIds.length === 0)) {
        setPendingSocialFauxTrade({ body, requestId });
        setShowRevealSecretModal({
          mode: "card_trade_social_faux",
          setName: "Social Faux Pas",
          source: "card_trade_social_faux",
          customMessage: "Recibiste un Social Faux Pas. Elegí cuál de tus secretos va a revelar la mesa.",
        });
        setIsWaitingForResponse(false);
        setWaitingMessage(null);
        return;
      }

      // Ejecutar la respuesta final del Card Trade directamente (la petición Not So Fast
      // se solicita en el momento de iniciar la propuesta para que ocurra ANTES de notificar al otro jugador).
      await finalizeCardTradeResponse(body, requestId);
    } catch (error) {
      throw error;
    }
  };

  const confirmPlayEvent = async (payload) => {
    if (!payload) return;
    try {
      const cardName = payload.cardName ?? "Evento";
      const cardNameLower = cardName.toLowerCase();
      let eventExecuted = false;
      let eventTargetId =
        payload.targetPlayerId ??
        payload.jugadorObjetivoId ??
        payload.jugadorObjetivo ??
        payload.targetPlayer ??
        null;
      
      if (cardNameLower.includes("look into the ashes") || cardNameLower.includes("look into ashes") || cardNameLower.includes("ashes")) {
        // Pedir reacción Not So Fast antes de ejecutar el endpoint del evento
        sendRevealRequestForAction({
          actionType: "play_event",
          actionSummary: payload.cardName,
          blockable: true,
          payload: { cardId: payload.cardId, cardName: payload.cardName, selectedDiscardCardId: payload.selectedDiscardCardId ?? null },
          executor: async (req) => {
            // ejecutar la acción original cuando expire la ventana de reacción
            await playEventLookIntoTheAshes(payload.cardId, payload.cardName, payload.selectedDiscardCardId ?? null);
            eventExecuted = true;
          },
        });
        return;
      } else if (cardNameLower.includes("cards off the table")) {
        // Este evento NO debería poder ser cancelado por Not So Fast
        sendRevealRequestForAction({
          actionType: "play_event",
          actionSummary: payload.cardName,
          blockable: false,
          payload: { cardId: payload.cardId, cardName: payload.cardName, targetPlayerId: payload.targetPlayerId ?? null },
          executor: async (req) => {
            await playEventCardsOff(payload.cardId, payload.cardName, payload.targetPlayerId ?? null);
            eventExecuted = true;
          },
        });
        return;
      } else if (
        cardNameLower.includes("point your suspicion") ||
        cardNameLower.includes("point your suspicions") ||
        cardNameLower.includes("point your suspicious")
      ) {
        sendRevealRequestForAction({
          actionType: "play_event",
          actionSummary: payload.cardName,
          blockable: true,
          payload: { cardId: payload.cardId, cardName: payload.cardName },
          executor: async (req) => {
            await playEventPointSuspicion(payload.cardId, payload.cardName);
            eventExecuted = true;
          },
        });
        return;
      } else if (cardNameLower.includes("dead card folly")) {
        startDeadCardFollyFlow(
          payload.cardId,
          payload.cardName,
          payload.direction ?? DEAD_CARD_FOLLY_DIRECTION,
        );
        return;
      } else if (cardNameLower.includes("delay") && cardNameLower.includes("murderer")) {
        sendRevealRequestForAction({
          actionType: "play_event",
          actionSummary: payload.cardName,
          blockable: true,
          payload: { cardId: payload.cardId, cardName: payload.cardName },
          executor: async (req) => {
            await playEventDelayMurderer(payload.cardId, payload.cardName);
            eventExecuted = true;
          },
        });
        return;
      } else if (
         cardNameLower.includes("and then there was one more") ||
         cardNameLower.includes("then there was one more") ||
         cardNameLower.includes("one more")
       ) {
         sendRevealRequestForAction({
           actionType: "play_event",
           actionSummary: payload.cardName,
           blockable: true,
           payload: {
             cardId: payload.cardId,
             cardName: payload.cardName,
             targetPlayerId: payload.targetPlayerId ?? null,
             secretTargetId: payload.secretTargetId ?? null,
           },
           executor: async (req) => {
             await playEventAndThenThereWasOneMore(
               payload.cardId,
               payload.cardName,
               payload.targetPlayerId ?? null,
               payload.secretTargetId ?? null
             );
             eventExecuted = true;
           },
         });
         return;
      } else if (cardNameLower.includes("another victim")) {
        sendRevealRequestForAction({
          actionType: "play_event",
          actionSummary: payload.cardName,
          blockable: true,
          payload: { cardId: payload.cardId, cardName: payload.cardName, targetSetId: payload.targetSetId ?? null },
          executor: async (req) => {
            await playEventAnotherVictim(payload.cardId, payload.cardName, payload.targetSetId ?? null);
            eventExecuted = true;
          },
        });
        return;
      } else if (payload.action === 'respond_card_trade') {
        // responder a una propuesta de intercambio (hacer el POST final)
        await playEventCardTradeResponse(
          payload.cardId,
          payload.cardName,
          payload.requesterId ?? payload.jugadorQuePropusoId ?? payload.jugadorObjetivoId ?? null,
          payload.offeredCardId ?? payload.cartaOfrecidaId ?? null,
          payload.chosenCardId ?? payload.cartaElegidaId ?? null,
          payload.requestId ?? payload.requesterRequestId ?? null,
          payload.requiresSocialFauxReveal ?? false,
          payload.secretosARevelarIds ?? null,
        );
        eventExecuted = true;
      } else if (payload.action === 'initiate_card_trade' || cardNameLower.includes('card trade')) {
        // iniciar propuesta de intercambio: payload must include targetPlayerId and offeredCardId
        await playEventCardTrade(
          payload.cardId,
          payload.cardName,
          payload.targetPlayerId ?? payload.jugadorObjetivoId ?? null,
          payload.offeredCardId ?? payload.cartaOfrecidaId ?? null,
        );
        eventExecuted = true;
        // no toast here, the handler will notify
      } else if (cardNameLower.includes("early train") || cardNameLower.includes("paddington")) {
        // Early Train sí puede ser bloqueado por Not So Fast
        sendRevealRequestForAction({
          actionType: "play_event",
          actionSummary: payload.cardName,
          blockable: true,
          payload: { cardId: payload.cardId, cardName: payload.cardName },
          executor: async (req) => {
            await playEventEarlyTrain(payload.cardId, payload.cardName);
            eventExecuted = true;
          },
        });
        return;
      } else {
        console.warn("Evento no implementado:", payload.cardName);
        toast.error("Este evento aún no está implementado");
        return;
      }

      // rely on backend broadcast (evento_jugado) for event log entries
    } catch (err) {
      console.error("Error confirmando evento:", err);
        if (!err.toastHandled) {
        toast.error("Error al confirmar el evento");
      }
      throw err;
    } finally {
      // Cerrar modal siempre
      try {
        closeEventModal();
      } catch (e) {
        console.warn("closeEventModal falló:", e);
      }
      
      // Limpiar selección de cartas para evitar problemas con cartas eliminadas
      setSelectedIds(new Set());
    }
  };
  
  // --- Not So Fast handlers (front-side) ---
  const onSkipNotSoFast = useCallback(() => {
    // El usuario decide no jugar Not So Fast: limpiar prompt y continuar con la acción pendiente
    const payload = pendingReactionPayload;
    // Si yo soy el actor que inició la acción, hacer que la acción continúe inmediatamente
    const amIActor = reactionPrompt && reactionPrompt.actorId != null && Number(reactionPrompt.actorId) === Number(currentUserId);
    if (amIActor) {
      // Ejecutar la acción pendiente ahora
      executePendingAction();
      return;
    }
    // Si no soy el actor, solo cierro mi prompt local y (si aplica) abro el modal de revelar secreto
    setReactionPrompt(null);
    setIsWaitingForResponse(false);
    setWaitingMessage(null);
    // Nota: No abrir modal de revelar secretos al hacer "No intervenir" para Not So Fast.
    // El prompt se cierra y el flujo continúa en el actor cuando corresponda.
  }, [pendingReactionPayload, reactionPrompt, currentUserId]);

  const onPlayNotSoFast = useCallback(async () => {
    if (!reactionPrompt) return;
    setIsSubmittingNotSoFast(true);
    try {
      // Intentar obtener la mano del jugador para elegir una carta Not so Fast
      const estado = await get(`/partidas/${gameData.id}/cartas/estado`);
      const myHand = estado?.hands?.[currentUserId] ?? estado?.hands?.[String(currentUserId)] ?? [];
      const notSoFastCard = Array.isArray(myHand)
        ? myHand.find((c) => String(c?.nombre ?? "").toLowerCase().includes("not so fast"))
        : null;
      if (!notSoFastCard) {
        toast.error("No tenés 'Not So Fast' en la mano");
        return;
      }
      // Determinar qué acción/evento estamos bloqueando: extraer desde el payload pendiente
      const pending = pendingReactionPayloadRef?.current ?? pendingReactionPayload;
      const actionPayload = pending?.payload ?? {};
      const eventoaCancelarId =
        actionPayload.cardId ?? actionPayload.cartaId ?? actionPayload.card_id ?? actionPayload.cartaEventoId ?? null;
      const cartasSetId = actionPayload.cartas_ids ?? actionPayload.cartasIds ?? null;

      await post(`/partidas/${gameData.id}/eventos/not-so-fast`, {
        jugadorId: currentUserId,
        cartaEventoId: notSoFastCard.carta_id ?? notSoFastCard.id,
        eventoaCancelarId: eventoaCancelarId ?? null,
        cartasSetId: Array.isArray(cartasSetId) ? cartasSetId : null,
        reactionId: reactionPrompt.id,
      });
      // Limpiar prompt y payload pendiente
      clearPendingReaction();
    } catch (err) {
      console.error("Error jugando Not So Fast:", err);
      toast.error(err?.message ?? "No se pudo jugar Not So Fast");
    } finally {
      setIsSubmittingNotSoFast(false);
    }
  }, [reactionPrompt, currentUserId, gameData.id]);

  return (
    <>
      <TimeoutModal
        isVisible={showTimeoutModal}
        timeRemaining={turnTimeRemaining}
        isMyTurn={!Number.isNaN(currentUserId) && gameState.currentTurn === currentUserId}
        onTimeUp={handleTimeUpAcknowledge}
        showTimeUpMessage={showTimeUpMessage}
      />

      <Tablero
        gameData={gameData}
        currentUser={currentUser}
        currentUserId={currentUserId}
        gameState={gameState}
        secretsToShow={secretsToShow}
        secretoEnModal={secretoEnModal}
        cerrarModalSecreto={() => setSecretoEnModal(null)}
        secretsByPlayer={revealedSecretsByPlayer}
        draftToShow={draftToShow}
        playerSets={gameState.playerSets || []}
        allPlayersSets={allPlayersSets}
        selectedIds={selectedIds}
        toggleSelectCard={toggleSelectCard}
        cancelSelection={cancelSelection}
        discardSelected={discardSelected}
        playSelectedSet={playSelectedSet}
        handleDrawCard={handleDrawCard}
        handlePickDraftCard={handlePickDraftCard}
        handlePassTurn={handlePassTurn}
        eliminarPartida={eliminarPartida}
        playEventCardsOff={playEventCardsOff}
        playEventDelayMurderer={playEventDelayMurderer}
        playEventLookIntoTheAshes={playEventLookIntoTheAshes}
    playEventAnotherVictim={playEventAnotherVictim}
    playEventEarlyTrain={playEventEarlyTrain}
    confirmPlayEvent={confirmPlayEvent}
    openEventModal={openEventModal}
    closeEventModal={closeEventModal}
    isConnected={isConnected}
    showEventModal={showEventModal}
    eventCardData={eventCardData}
    statusMessage={statusMessage}
    announceEventInProgress={announceEventInProgress}
    incomingEvent={incomingEvent}
        clearIncomingEvent={() => setIncomingEvent(null)}
  reactionPrompt={reactionPrompt}
  onPlayNotSoFast={onPlayNotSoFast}
  onSkipNotSoFast={onSkipNotSoFast}
  isSubmittingNotSoFast={isSubmittingNotSoFast}
        showSetNotifications={showSetNotifications}
        toggleSetNotifications={() => setShowSetNotifications(!showSetNotifications)}
        showRevealSecretModal={showRevealSecretModal}
        setShowRevealSecretModal={setShowRevealSecretModal}
        handleRevealSecretAction={handleRevealSecretAction}
        isWaitingForResponse={isWaitingForResponse}
        waitingMessage={waitingMessage}
        fetchPlayerSecrets={fetchPlayerSecrets}
        allSecretsRaw={allSecretsRaw}
        openDiscardModal={openDiscardModal}
        closeDiscardModal={closeDiscardModal}
        showDiscardModal={showDiscardModal}
        playersInSocialDisgrace={playersInSocialDisgrace}
        isCurrentPlayerInSocialDisgrace={isCurrentPlayerInSocialDisgrace()}
        deadCardFollyState={deadCardFollyState}
        deadCardFollySelection={deadCardFollySelection}
        deadCardFollyLocked={deadCardFollyLocked}
        onDeadCardFollySelect={handleDeadCardFollyCardSelect}
        onDeadCardFollyConfirm={confirmDeadCardFollySelection}
        onDeadCardFollyClose={closeDeadCardFollyModal}
        canPlayDetective={canPlayDetective}
        onOpenPlayDetectiveModal={openPlayDetectiveModal}
        showPlayDetectiveModal={showPlayDetectiveModal}
        onClosePlayDetectiveModal={closePlayDetectiveModal}
        onConfirmPlayDetective={handlePlayDetectiveConfirm}
        isSubmittingDetective={isSubmittingDetective}
        detectiveCards={detectiveCardsInHand}
        presetDetectiveCardId={presetDetectiveCardId}
        pointSuspicionsState={pointSuspicionsState}
        pointSuspicionsSelection={pointSuspicionsSelection}
        onPointSuspicionsSelect={handlePointSuspicionsSelect}
        onPointSuspicionsConfirm={confirmPointSuspicionsVote}
        pointSuspicionsHasVoted={pointSuspicionsVoteLocked}
        pointSuspicionsPendingVoters={pointSuspicionsPendingVoters}
        onPointSuspicionsClose={resetPointSuspicions}
        onCancelRevealSecretModal={cancelRevealSecretModal}
        eventLog={eventLog}
      />
    </>
  );
}
