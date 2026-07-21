import { getCardInfo } from "./CardImageMapper";

const normalize = (value) => String(value ?? "").trim().toLowerCase();

export const isHarleyCard = (cardOrName) => normalize(cardOrName?.nombre ?? cardOrName) === "harley quin wildcard";

export const isAriadneCard = (cardOrName) => normalize(cardOrName?.nombre ?? cardOrName) === "ariadne oliver";

export const isDetectiveCard = (card) => {
  const name = card?.nombre ?? card;
  if (!name) return false;
  const info = getCardInfo(name);
  return info?.type === "detective";
};

const isWildcardName = (cardOrName) => normalize(cardOrName?.nombre ?? cardOrName).includes("wildcard");

const getBaseDetectiveNameForSet = (setName) => {
  if (!setName) return null;
  const lower = normalize(setName);
  if (lower === "set de beresford") return null;
  return setName.replace(/^Set de\s+/i, "");
};

export const setHasRealDetective = (set) => {
  if (!set || !Array.isArray(set.cartas)) return false;
  const lowerSetName = normalize(set.nombre);
  if (lowerSetName === "set de beresford") {
    return set.cartas.some(
      (carta) =>
        carta &&
        (carta.nombre === "Tommy Beresford" || carta.nombre === "Tuppence Beresford"),
    );
  }
  const baseName = getBaseDetectiveNameForSet(set.nombre);
  if (!baseName) return false;
  return set.cartas.some((carta) => carta && carta.nombre === baseName);
};

export const canCardJoinSet = (card, set, currentUserId) => {
  if (!card || !set) return false;

  const cardName = card.nombre;
  const ownerId = Number(set.owner_id ?? set.ownerId ?? set.owner);
  const currentId = Number(currentUserId);

  if (!Number.isNaN(currentId) && ownerId !== currentId && !isAriadneCard(cardName)) {
    return false;
  }

  if (isAriadneCard(cardName)) {
    return true;
  }

  if (!Number.isNaN(currentId) && ownerId !== currentId) {
    return false;
  }

  if (isHarleyCard(cardName)) {
    return true;
  }

  const lowerSetName = normalize(set.nombre);
  if (lowerSetName === "set de beresford") {
    return (
      cardName === "Tommy Beresford" ||
      cardName === "Tuppence Beresford" ||
      isWildcardName(cardName)
    );
  }

  const baseName = getBaseDetectiveNameForSet(set.nombre);
  if (!baseName) return false;

  if (isWildcardName(cardName)) {
    return true;
  }

  return cardName === baseName;
};

export const isUnblockableCombination = (card, set) => {
  if (!card || !set) return false;
  const cardName = card.nombre;
  if (set.nombre !== "Set de Beresford") return false;
  if (cardName !== "Tommy Beresford" && cardName !== "Tuppence Beresford") return false;
  const counterpart = cardName === "Tommy Beresford" ? "Tuppence Beresford" : "Tommy Beresford";
  return Array.isArray(set.cartas) && set.cartas.some((carta) => carta?.nombre === counterpart);
};

export const harleyViolatesRule = (card, set) => {
  if (!isHarleyCard(card)) return false;
  return !setHasRealDetective(set);
};

export const isTooLongSet = (set) => {
  return (length(set.cartas) > 4)
}