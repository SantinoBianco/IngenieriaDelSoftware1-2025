import React, { useEffect, useState } from "react";

export default function ChooseSecretModal({
  mode,
  setName,
  players,
  secrets,
  fetchPlayerSecrets, 
  allSecretsRaw,  
  onConfirm,
  onCancel,
  currentUserId,
  secretsByPlayer, 
  playersInSocialDisgrace = new Set(), 
  forcedPlayerId = null,
  customMessage = null,
}) {
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [selectedSecret, setSelectedSecret] = useState(null);
  const [remoteSecrets, setRemoteSecrets] = useState([]);
  const selfRevealModes = new Set([
    "choose_secret_to_reveal",
    "point_suspicious_reveal_secret",
    "card_trade_blackmailed",
    "dead_card_folly_blackmailed",
    "card_trade_social_faux",
    "card_trade_social_faux_effect",
    "dead_card_folly_social_faux_effect",
  ]);
  const [loadingSecrets, setLoadingSecrets] = useState(false);

  const normalizedForcedPlayerId =
    forcedPlayerId !== null && forcedPlayerId !== undefined
      ? Number(forcedPlayerId)
      : null;
  const normalizedCurrentUserId =
    currentUserId !== null && currentUserId !== undefined
      ? Number(currentUserId)
      : null;

  // Jugadores disponibles (excluye al actual)
  const availablePlayers = Array.isArray(players)
    ? players.filter(p => {
        const playerNumericId = Number(p.id);
        if (Number.isNaN(playerNumericId)) return false;

        if (normalizedForcedPlayerId !== null) {
          return playerNumericId === normalizedForcedPlayerId;
        }

        // Excluir al jugador actual
        if (playerNumericId === normalizedCurrentUserId) return false;
        
        // Para modos que requieren revelar secretos, excluir jugadores en desgracia social
        // ya que no tienen secretos ocultos disponibles
        const playerInDisgrace =
          playersInSocialDisgrace.has(playerNumericId) ||
          playersInSocialDisgrace.has(p.id);
        const isRevealMode = mode === "choose_player_and_secret" || mode === "choose_player_then_they_choose_secret";
        
        if (isRevealMode && playerInDisgrace) {
          console.log(`Jugador ${p.id} (${p.nombre}) excluido por estar en desgracia social`);
          return false;
        }
        
        return true;
      })
    : [];
    
  const allSecretsOfSelectedPlayer = (() => {
    const targetPlayerId = selfRevealModes.has(mode) ? currentUserId : selectedPlayer;
    if (!targetPlayerId) return [];
    
    console.log(" Debug allSecretsRaw completo:", allSecretsRaw);
    console.log(" Debug selectedPlayer:", targetPlayerId, typeof targetPlayerId);
    console.log(" Debug secretsByPlayer:", secretsByPlayer);
    console.log(" Debug remoteSecrets:", remoteSecrets);
    
    let playerSecrets = [];
    
    // 1. Intentar obtener secretos de allSecretsRaw (fuente primaria)
    if (allSecretsRaw?.secretos) {
      console.log("🔍 secretos disponibles en allSecretsRaw:", Object.keys(allSecretsRaw.secretos));
      
      // Probar diferentes formatos de ID
      const playerIdNum = Number(targetPlayerId);
      const playerIdStr = String(targetPlayerId);
      
      playerSecrets = allSecretsRaw.secretos[playerIdNum] || 
                     allSecretsRaw.secretos[playerIdStr] || 
                     [];
      
      console.log(" Intentando buscar con ID:", { playerIdNum, playerIdStr });
      console.log(" Secretos encontrados en allSecretsRaw:", playerSecrets);
    } 
    // 2. Fallback: usar remoteSecrets (obtenidos por fetchPlayerSecrets)
    else if (Array.isArray(remoteSecrets) && remoteSecrets.length > 0) {
      playerSecrets = remoteSecrets;
      console.log(" Usando remoteSecrets como fallback:", playerSecrets);
    }
    // 3. Último fallback: usar secretsByPlayer
    else if (secretsByPlayer?.[selectedPlayer]) {
      playerSecrets = secretsByPlayer[selectedPlayer] || [];
      console.log(" Usando secretsByPlayer como último fallback:", playerSecrets);
    }
    
    // Si no hay secretos o no es array, retornar array vacío
    if (!Array.isArray(playerSecrets)) {
      console.log(" No se encontraron secretos para el jugador o no es array:", playerSecrets);
      return [];
    }
    
    console.log(" Secretos del jugador encontrados:", playerSecrets);
    
    // Asegurar que los secretos tengan el estado revelado correcto
    const secretsWithRevealedState = playerSecrets.map(secret => ({
      ...secret,
      // Asegurar que ambas propiedades estén sincronizadas
      revelado: secret.revelado || secret.revealed || false,
      revealed: secret.revelado || secret.revealed || false
    }));
    
    console.log(" Secretos con estado revelado:", secretsWithRevealedState);
    return secretsWithRevealedState;
  })();

  // Filtrar secretos según el modo
  const secretsOfSelectedPlayer = allSecretsOfSelectedPlayer.filter(s => {
    const isRevealed = s?.revelado || s?.revealed || false;
    
    console.log(" Filtrado de secreto:", {
      id: s.secreto_id,
      descripcion: s.descripcion?.substring(0, 30) + "...",
      revelado: s.revelado,
      revealed: s.revealed,
      isRevealed: isRevealed,
      mode: mode,
      incluyeEnFiltro: mode === "choose_player_and_secret_to_hide" ? isRevealed : !isRevealed
    });
    
    // Para ocultar: mostrar solo los revelados (Parker Pyne)
    if (mode === "choose_player_and_secret_to_hide") {
      return isRevealed;
    }
    
    // Para revelar: mostrar solo los no revelados
    return !isRevealed;
  });

 
  const handleSelectPlayer = async (playerId) => {
    setSelectedPlayer(Number(playerId));
    setSelectedSecret(null);
    
    // Intentar obtener secretos remotos si fetchPlayerSecrets está disponible
    if (typeof fetchPlayerSecrets === "function") {
      setLoadingSecrets(true);
      try {
        console.log(" Llamando fetchPlayerSecrets para playerId:", playerId);
        const list = await fetchPlayerSecrets(Number(playerId));
        console.log(" Resultado de fetchPlayerSecrets:", list);
        setRemoteSecrets(Array.isArray(list) ? list : []);
      } catch (err) {
        console.error(" Error en fetchPlayerSecrets:", err);
        setRemoteSecrets([]);
      } finally {
        setLoadingSecrets(false);
      }
    } else {
      console.log(" fetchPlayerSecrets no está disponible");
      setRemoteSecrets([]);
    }
  };

  useEffect(() => {
    if (normalizedForcedPlayerId === null) return;
    if (Number(selectedPlayer) === normalizedForcedPlayerId) return;

    const forcedExists = Array.isArray(players)
      ? players.some((p) => Number(p.id) === normalizedForcedPlayerId)
      : false;

    if (!forcedExists) return;

    handleSelectPlayer(normalizedForcedPlayerId);
  }, [normalizedForcedPlayerId, players, selectedPlayer, handleSelectPlayer]);

  // Determinar el texto según el modo
  const getModalText = () => {
    switch (mode) {
      case "choose_player_and_secret_to_hide":
        return "Elegí un jugador y uno de sus secretos revelados para ocultar:";
      case "choose_player_and_secret":
        return "Elegí un jugador y uno de sus secretos para revelar:";
      case "choose_player_then_they_choose_secret":
        return "Elegí un jugador que debe revelar uno de sus secretos.";
      case "choose_secret_to_reveal":
        return "Elegí cuál de tus secretos revelar:";
      case "point_suspicious_reveal_secret":
        return "Fuiste el más votado. Debes revelar uno de tus secretos al resto de la mesa.";
      case "card_trade_social_faux":
      case "card_trade_social_faux_effect":
        return (
          customMessage ??
          "Recibiste Social Faux Pas. Elegí cuál de tus secretos revelar públicamente."
        );
      case "dead_card_folly_social_faux_effect":
        return (
          customMessage ??
          "Dead Card Folly te obliga a revelar un secreto públicamente. Elegí cuál mostrar."
        );
      case "card_trade_blackmailed":
        return (
          customMessage ??
          "Fuiste víctima de Blackmailed. Elegí uno de tus secretos para mostrárselo en privado al jugador que te lo pasó."
        );
      case "dead_card_folly_blackmailed":
        return (
          customMessage ??
          "Dead Card Folly activó un Blackmailed contigo. Elegí un secreto para mostrárselo en privado al jugador que te pasó la carta."
        );
      default:
        return "Elegí una opción:";
    }
  };

  const getButtonText = () => {
    switch (mode) {
      case "choose_player_and_secret_to_hide":
        return "Ocultar";
      case "choose_player_and_secret":
        return "Revelar";
      case "choose_player_then_they_choose_secret":
        return "Pedir que revele";
      case "choose_secret_to_reveal":
        return "Revelar";
      case "point_suspicious_reveal_secret":
        return "Revelar";
      case "card_trade_blackmailed":
      case "dead_card_folly_blackmailed":
        return "Mostrar en privado";
      case "card_trade_social_faux":
      case "card_trade_social_faux_effect":
        return "Revelar";
      case "dead_card_folly_social_faux_effect":
        return "Revelar";
      default:
        return "Confirmar";
    }
  };

  const getErrorText = () => {
    switch (mode) {
      case "choose_player_and_secret_to_hide":
        return "Este jugador no tiene secretos revelados para ocultar.";
      case "choose_player_and_secret":
        return "Este jugador no tiene secretos disponibles para revelar.";
      case "card_trade_blackmailed":
      case "dead_card_folly_blackmailed":
        return "No tienes secretos disponibles para mostrar.";
      case "card_trade_social_faux":
      case "card_trade_social_faux_effect":
        return "No tienes secretos ocultos disponibles para revelar.";
      case "dead_card_folly_social_faux_effect":
        return "No tienes secretos ocultos disponibles para revelar.";
      default:
        return "No hay opciones disponibles.";
    }
  };

  const mySecretsAll = Array.isArray(secrets)
    ? secrets.filter((s) => Number(s.jugador_id) === Number(currentUserId))
    : [];
  const myHiddenSecrets = mySecretsAll.filter((s) => !(s?.revelado || s?.revealed));
  const secretsForSelfMode = (() => {
    if (
      mode === "card_trade_blackmailed" ||
      mode === "dead_card_folly_blackmailed" ||
      mode === "card_trade_social_faux" ||
      mode === "card_trade_social_faux_effect"
    ) {
      return myHiddenSecrets.length === 0 ? mySecretsAll : myHiddenSecrets;
    }
    return myHiddenSecrets;
  })();

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-8 max-w-lg text-center shadow-2xl ring-2 ring-amber-400">
        <h2 className="text-2xl font-bold mb-4 text-amber-300">
          {setName}: {mode === "choose_player_and_secret_to_hide" ? "Ocultar Secreto" : "Revelar Secreto"}
        </h2>
        
        {/* Casos que requieren seleccionar jugador y secreto */}
        {(mode === "choose_player_and_secret" || mode === "choose_player_and_secret_to_hide") && (
          <>
            <p className="mb-2">{getModalText()}</p>
            {availablePlayers.length === 0 ? (
              <div className="text-red-400 mb-4">No hay otros jugadores disponibles.</div>
            ) : (
              <select
                className="mb-2"
                onChange={e => handleSelectPlayer(e.target.value)}
                value={selectedPlayer ?? ""}
                disabled={normalizedForcedPlayerId !== null}
              >
                <option value="" disabled>Jugador...</option>
                {availablePlayers.map(p => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            )}
            {selectedPlayer && (
              loadingSecrets ? (
                <div className="text-sm text-gray-300 mb-4">Cargando secretos…</div>
              ) : secretsOfSelectedPlayer.length === 0 ? (
                <div className="text-red-400 mb-4">{getErrorText()}</div>
              ) : (
                <select
                  className="mb-2"
                  onChange={e => setSelectedSecret(Number(e.target.value))}
                  value={selectedSecret ?? ""}
                >
                  <option value="" disabled>Secreto...</option>
                  {secretsOfSelectedPlayer.map((s, idx) => {
                    const isOwner = Number(s.jugador_id) === Number(currentUserId);
                    const isHidingMode = mode === "choose_player_and_secret_to_hide";
                    
                    // Para ocultar secretos, siempre mostrar el nombre porque son secretos revelados públicos
                    // Para revelar secretos, ocultar descripción si no es el dueño
                    const label = (isOwner || isHidingMode)
                      ? (s.descripcion || `Secreto #${s.secreto_id}`)
                      : `Secreto #${idx + 1}`;
                    
                    return (
                      <option key={s.secreto_id ?? `${idx}`} value={s.secreto_id}>
                        {label}
                      </option>
                    );
                  })}
                </select>
              )
            )}
            <button
              className="btn btn-primary mt-4"
              disabled={
                availablePlayers.length === 0 ||
                !selectedPlayer ||
                secretsOfSelectedPlayer.length === 0 ||
                !selectedSecret
              }
              onClick={() => onConfirm({ jugadorId: selectedPlayer, secretoId: selectedSecret })}
            >
              {getButtonText()}
            </button>
          </>
        )}        
        
        {/* Caso: elegir jugador para que ellos elijan secreto */}
        {mode === "choose_player_then_they_choose_secret" && (
        <>
          <p>{getModalText()}</p>
          <select
            onChange={e => setSelectedPlayer(Number(e.target.value))}
            value={selectedPlayer ?? ""}
          >
          <option value="" disabled>Jugador...</option>
            {availablePlayers.map(p => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </select>
            <button
              className="btn btn-primary mt-4"
              disabled={!selectedPlayer}
              onClick={() => onConfirm({ jugadorId: selectedPlayer })}
            >
              {getButtonText()}
            </button>
          </>
        )}
        
        {/* Caso: elegir mi propio secreto para revelar */}
        {(mode === "choose_secret_to_reveal" ||
          mode === "point_suspicious_reveal_secret" ||
          mode === "card_trade_blackmailed" ||
          mode === "dead_card_folly_blackmailed" ||
          mode === "card_trade_social_faux" ||
          mode === "card_trade_social_faux_effect" ||
          mode === "dead_card_folly_social_faux_effect") && (
          <>
            <p>{getModalText()}</p>
            <select
              onChange={e => setSelectedSecret(Number(e.target.value))}
              value={selectedSecret ?? ""}
            >
            <option value="" disabled>Secreto...</option>
            {secretsForSelfMode.map(s => (
                <option key={s.secreto_id} value={s.secreto_id}>{s.descripcion}</option>
            ))}
            </select>
            <button
              className="btn btn-primary mt-4"
              disabled={!selectedSecret}
              onClick={() => onConfirm({ jugadorId: currentUserId, secretoId: selectedSecret })}
            >
              {getButtonText()}
            </button>
        </>
        )}
        
        {/* Solo mostrar botón Cancelar si no es una acción obligatoria */}
        {mode !== "choose_secret_to_reveal" &&
          mode !== "point_suspicious_reveal_secret" &&
          mode !== "card_trade_blackmailed" &&
          mode !== "dead_card_folly_blackmailed" &&
          mode !== "card_trade_social_faux" &&
          mode !== "card_trade_social_faux_effect" &&
          mode !== "dead_card_folly_social_faux_effect" && (
          <button className="btn btn-secondary mt-2" onClick={onCancel}>Cancelar</button>
        )}
      </div>
    </div>
  );
}
