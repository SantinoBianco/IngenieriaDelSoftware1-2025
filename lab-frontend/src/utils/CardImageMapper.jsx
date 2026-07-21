// Importar todas las imágenes de cartas
import detectivePoirot from "../assets/07-detective_poirot.png";
import detectiveMarple from "../assets/08-detective_marple.png";
import detectiveSatterthwaite from "../assets/09-detective_satterthwaite.png";
import detectivePyne from "../assets/10-detective_pyne.png";
import detectiveBrent from "../assets/11-detective_brent.png";
import detectiveTommy from "../assets/12-detective_tommyberesford.png";
import detectiveTuppence from "../assets/13-detective_tuppenceberesford.png";
import detectiveQuin from "../assets/14-detective_quin.png";
import detectiveOliver from "../assets/15-detective_oliver.png";
import instantNotSoFast from "../assets/16-Instant_notsofast.png";
import eventCardsOnTable from "../assets/17-event_cardsonthetable.png";
import eventAnotherVictim from "../assets/18-event_anothervictim.png";
import eventDeadCardFolly from "../assets/19-event_deadcardfolly.png";
import eventLookAshes from "../assets/20-event_lookashes.png";
import eventCardTrade from "../assets/21-event_cardtrade.png";
import eventOneMore from "../assets/22-event_onemore.png";
import eventDelayEscape from "../assets/23-event_delayescape.png";
import eventEarlyTrain from "../assets/24-event_earlytrain.png";
import eventPointSuspicions from "../assets/25-event_pointsuspicions.png";
import deviousBlackmailed from "../assets/26-devious_blackmailed.png";
import deviousFauxPas from "../assets/27-devious_fauxpas.png";

// Mapeo de nombres de cartas a imágenes
const CARD_IMAGE_MAP = {
  // Detective Cards
  "Hercule Poirot": detectivePoirot,
  "Miss Marple": detectiveMarple,
  "Mr Satterthwaite": detectiveSatterthwaite,
  "Parker Pyne": detectivePyne,
  "Lady Eileen 'Bundle' Brent": detectiveBrent,
  "Tommy Beresford": detectiveTommy,
  "Tuppence Beresford": detectiveTuppence,
  "Harley Quin Wildcard": detectiveQuin,
  "Ariadne Oliver": detectiveOliver,
  
  // Event Cards
  "Cards off the table": eventCardsOnTable,
  "Another victim": eventAnotherVictim,
  "Dead Card Folly": eventDeadCardFolly,
  "Look into the Ashes": eventLookAshes,
  "Card Trade": eventCardTrade,
  "And then there was one more...": eventOneMore,
  "Delay the Murderer scape": eventDelayEscape,
  "Early train to paddington": eventEarlyTrain,
  "Point Your Suspicious": eventPointSuspicions,
  
  // Devious Cards
  "Blackmailed": deviousBlackmailed,
  "Social Faux Pas": deviousFauxPas,
  
  // Instant Cards
  "Not so Fast...": instantNotSoFast,
};

// Imagen por defecto para cartas no mapeadas
const DEFAULT_CARD_IMAGE = detectivePoirot;

/**
 * Obtiene la imagen correspondiente a una carta por su nombre
 * @param {string} cardName - Nombre de la carta
 * @returns {string} - URL de la imagen
 */
export const getCardImage = (cardName) => {
  if (!cardName) return DEFAULT_CARD_IMAGE;
  
  // Buscar coincidencia exacta primero
  if (CARD_IMAGE_MAP[cardName]) {
    return CARD_IMAGE_MAP[cardName];
  }
  
  // Buscar coincidencia parcial (por si hay variaciones en los nombres)
  const normalizedName = cardName.toLowerCase().trim();
  
  for (const [mappedName, image] of Object.entries(CARD_IMAGE_MAP)) {
    if (mappedName.toLowerCase().includes(normalizedName) || 
        normalizedName.includes(mappedName.toLowerCase())) {
      return image;
    }
  }
  
  console.warn(`No se encontró imagen para la carta: "${cardName}"`);
  return DEFAULT_CARD_IMAGE;
};

/**
 * Obtiene información adicional de la carta basada en su nombre
 * @param {string} cardName - Nombre de la carta
 * @returns {object} - Información de la carta (tipo, color, etc.)
 */
export const getCardInfo = (cardName) => {
  if (!cardName) return { type: "unknown", color: "gray" };
  
  const name = cardName.toLowerCase();
  
  // Detective Cards
  if (name.includes("hercule") || name.includes("miss marple") || 
      name.includes("satterthwaite") || name.includes("parker") ||
      name.includes("bundle") || name.includes("tommy") || 
      name.includes("tuppence") || name.includes("quin") || 
      name.includes("oliver")) {
    return { type: "detective", color: "blue" };
  }
  
  // Event Cards
  if (name.includes("cards") || name.includes("victim") || 
      name.includes("folly") || name.includes("ashes") ||
      name.includes("trade") || name.includes("more") ||
      name.includes("delay") || name.includes("train") ||
      name.includes("suspicious")) {
    if (name.includes("point your suspicion") || name.includes("point your suspicious")) {
      return {
        type: "event",
        color: "green",
        actionKey: "point-your-suspicions",
        requiresVoting: true,
        description:
          "Todos los jugadores votan públicamente quién es más sospechoso. La persona con más votos debe revelar un secreto.",
      };
    }
    if (name.includes("dead card folly")) {
      return {
        type: "event",
        color: "green",
        actionKey: "dead-card-folly",
        description:
          "Todos los jugadores eligen una carta de su mano y la pasan al siguiente jugador.",
      };
    }

    if (name.includes("cards off the table")) {
      return {
        type: "event",
        color: "green",
        actionKey: "cards-off-the-table",
        requiresPlayerTarget: true,
        description: "Hace que ciertas cartas se vayan del jugador objetivo",
      };
    }

    if (name.includes("delay") && name.includes("murderer")) {
      return {
        type: "event",
        color: "green",
        actionKey: "delay-the-murderer",
        isDelayMurderer: true,
        requiresPlayerTarget: false,
        description: "Reordena el mazo con cartas del descarte. Requiere cartas en el descarte.",
      };
    }

    // Look into the Ashes -> mostrar hasta 5 cartas superiores del descarte y elegir 1
    if (
      name.includes("look into the ashes") ||
      name.includes("look into ashes") ||
      // comprobación amplia por si el nombre cambia ligeramente
      name.includes("ashes")
    ) {
      return {
        type: "event",
        color: "green",
        actionKey: "look-into-the-ashes",
        requiresPickFromDiscard: true,
        description:
          "Permite mirar hasta 5 cartas superiores del descarte, elegir una para llevar a la mano. El resto permanece en el descarte en el mismo orden.",
      };
    }

    if (name.includes("and then there was one more") || name.includes("then there was one more") || name.includes("one more")) {
      return {
        type: "event",
        color: "green",
        actionKey: "and-then-there-was-one-more",
        requiresSecretId: true,
        allowSelfTarget: true,
        description: "Permite elegir un secreto revelado y agregarlo boca abajo a los secretos de cualquier jugador.",
      };
    }

    return { type: "event", color: "green" };
  }
  
  // Devious Cards
  if (name.includes("blackmail") || name.includes("faux pas")) {
    return { type: "devious", color: "red" };
  }
  
  // Instant Cards
  if (name.includes("not so fast")) {
    return { type: "instant", color: "yellow" };
  }
  
  return { type: "unknown", color: "gray" };
};
