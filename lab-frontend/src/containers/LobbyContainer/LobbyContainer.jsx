import { useState, useEffect, useMemo } from "react";
import Lobby from "../../components/Lobby/Lobby";
import { useWebSocket } from "../../hooks/useWebSocket";
import { del, post } from "../../services/HttpService"; 

export default function LobbyContainer({
  gameConfig,
  currentUser,
  onBackToMenu,
  onGoToTablero,
  isConnected: externalIsConnected,
  sendMessage: externalSendMessage,
  messages: externalMessages
}) {
  // Reutilizar el WebSocket del contenedor principal si viene por props
  const useExternalWS =
    typeof externalIsConnected === "boolean" &&
    Array.isArray(externalMessages) &&
    typeof externalSendMessage === "function";

  const { isConnected, sendMessage, messages } = useExternalWS
    ? {
        isConnected: externalIsConnected,
        sendMessage: externalSendMessage,
        messages: externalMessages
      }
    : useWebSocket(`ws://localhost:8000/ws/lobby`);

  const initialState = useMemo(() => {
    const id = gameConfig.partidaId || gameConfig.id;
    const owner = gameConfig.host || gameConfig.owner || currentUser.id;
    const basePlayers = Array.isArray(gameConfig.players)
      ? gameConfig.players.map((player) => ({
          id: player.id,
          nombre: player.nombre,
          isOwner: player.isOwner ?? player.id === owner
        }))
      : [];

    const hasCurrentUser = basePlayers.some((p) => p.id === currentUser.id);
    if (!hasCurrentUser) {
      basePlayers.push({
        id: currentUser.id,
        nombre: currentUser.nombre,
        isOwner: currentUser.id === owner && !gameConfig.isJoining
      });
    }

    return {
      id,
      nombre: gameConfig.nombre,
      maxJugadores: gameConfig.maxJugadores || gameConfig.jugadoresMax,
      owner,
      players: basePlayers
    };
  }, [gameConfig, currentUser]);

  const [gameData, setGameData] = useState(initialState);
  const [hostCancelled, setHostCancelled] = useState(false);

  // Recalcular estado base si cambia la configuración
  useEffect(() => {
    setGameData(initialState);
  }, [initialState]);

  // Conectarse al lobby cuando se monta el componente
  useEffect(() => {
    if (isConnected && typeof sendMessage === "function") {
      sendMessage({
        event: "conectar_lobby",
        data: {
          partidaId: gameData.id,
          jugador: {
            id: currentUser.id,
            nombre: currentUser.nombre,
            isOwner: !gameConfig.isJoining
          }
        }
      });
    }
  }, [isConnected, sendMessage, gameData.id, currentUser.id, currentUser.nombre, gameConfig.isJoining]);

  // Escuchar mensajes WebSocket del lobby
  useEffect(() => {
    if (!Array.isArray(messages) || messages.length === 0) return;
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) return;

    switch (lastMessage.event) {
      case "jugador_unido": {
        setGameData((prev) => {
          const payload = lastMessage.data || {};
          const rawJugador = payload.jugador
            ? payload.jugador
            : payload.jugador_id !== undefined && payload.username
            ? { id: payload.jugador_id, nombre: payload.username }
            : null;

          if (!rawJugador) return prev;
          if (payload.partidaId && payload.partidaId !== prev.id) return prev;

          const jugadorNormalizado = {
            id: rawJugador.id,
            nombre: rawJugador.nombre,
            isOwner: rawJugador.isOwner ?? rawJugador.id === prev.owner
          };

          const yaExiste = (prev.players || []).some((p) => p.id === jugadorNormalizado.id);
          if (yaExiste) return prev;

          return {
            ...prev,
            players: [...(prev.players || []), jugadorNormalizado]
          };
        });
        break;
      }

      case "jugador_desconectado": {
        setGameData((prev) => {
          const payload = lastMessage.data || {};
          console.log("Jugador desconectado recibido:", payload);
          console.log("Lista actual:", prev.players);
          
          if (payload.partidaId && payload.partidaId !== prev.id) {
            console.log(" Partida ID no coincide");
            return prev;
          }
          
          const listaActualizada = (prev.players || []).filter((p) => p.id !== payload.jugadorId);
          console.log("Lista después de filtrar:", listaActualizada);
          
          return {
            ...prev,
            players: listaActualizada
          };
        });
        break;
      }

      case "juego_iniciado": {
        const payload = lastMessage.data || {};
        console.log("RECIBIDO juego_iniciado:", payload);
        console.log("gameData.id:", gameData.id);
        console.log("payload.partidaId:", payload.partidaId);
        
        // Navegar al tablero usando juego_iniciado
        if (!payload.partidaId || payload.partidaId === gameData.id) {
          console.log("NAVEGANDO al tablero via juego_iniciado...");
          const gameDataForTablero = {
            ...gameData,
            estado: "jugando"
          };
          onGoToTablero(gameDataForTablero);
        }
        break;
      }

      case "estado_lobby": {
        setGameData((prev) => {
          const payload = lastMessage.data || {};
          if (payload.id && payload.id !== prev.id) return prev;

          const owner = payload.owner ?? prev.owner;
          const playersNormalizados = Array.isArray(payload.players)
            ? payload.players.map((player) => ({
                id: player.id,
                nombre: player.nombre,
                isOwner: player.isOwner ?? player.id === owner
              }))
            : prev.players;

          return {
            ...prev,
            ...payload,
            owner,
            players: playersNormalizados
          };
        });
        break;
      }

      case "partida_eliminada": {
        // Manejo: el backend emite 'partida_eliminada' cuando una partida fue borrada.
        const payload = lastMessage.data || {};
        if (!payload.partidaId || payload.partidaId === gameData.id) {
          // Si soy el anfitrión, salgo inmediatamente. Si soy otro jugador,
          // muestro un mensaje indicando que el anfitrión canceló y dejo al usuario
          // volver manualmente al menú.
          if (currentUser?.id && gameData?.owner && String(currentUser.id) === String(gameData.owner)) {
            onBackToMenu();
          } else {
            setHostCancelled(true);
          }
        }
        break;
      }

      default:
        break;
  }
}, [messages, gameData.id, onGoToTablero]);

  const handleStartGame = async () => {
    try {
      await post (`/partidas/${gameData.id}/start`, {
        jugadorId: currentUser.id
      });

      if (isConnected && typeof sendMessage === "function") {
        sendMessage({
          event: "partida_iniciada", 
          data: {
            partidaId: gameData.id,
            estado: "en_curso",
            iniciado_por: currentUser.id
          }
        });
      }
      // Navegar al tablero
      const gameDataForTablero = {
        ...gameData,
        estado: "jugando"
      };
      onGoToTablero(gameDataForTablero);
      
    } catch (error) {
      alert(`Error al iniciar partida: ${error.message}`);
    }
  };

const handleLeaveGame = async () => {
  try {
    console.log("Saliendo de la partida...");
    
    try {
      await del(`/partidas/${gameData.id}/jugadores/${currentUser.id}`);
    } catch (httpError) {
      console.warn("Error HTTP al salir (continuando):", httpError);
    }
    
    if (isConnected && typeof sendMessage === "function") {
      sendMessage({
        event: "jugador_manual_salida",
        data: {
          partidaId: gameData.id,
          jugadorId: currentUser.id,
          jugadorNombre: currentUser.nombre
        }
      });
    }
    
    onBackToMenu();
    
  } catch (error) {
    console.error("Error al salir:", error);
    onBackToMenu();
  }
};

  return (
    <>
      <Lobby
        gameData={gameData}
        currentUser={currentUser}
        onStartGame={handleStartGame}
        onLeaveGame={handleLeaveGame}
        onCancelGame={async () => {
          // cancelar/borrar la partida (solo owner)
          try {
            // Intentar borrar la partida en el backend
            await del(`/partidas/${gameData.id}`);

            // Confiamos en que el backend es la fuente de la verdad y emitirá
            // el evento correspondiente ('partida_eliminada') para notificar
            // a todos los clientes.
          } catch (error) {
            console.error('Error al cancelar partida:', error);
            // Continuamos con la navegación de vuelta al menú
          } finally {
            // Volver al menú después de cancelar
            onBackToMenu();
          }
        }}
        hostCancelled={hostCancelled}
        onHostCancelBackToMenu={() => {
          setHostCancelled(false);
          onBackToMenu();
        }}
      />
    </>
  );
}
