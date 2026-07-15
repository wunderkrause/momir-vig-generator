(function (root) {
  function buildSearchQuery({
    color,
    type,
    rarity,
    cmc,
    legendary,
    exactColor,
    randomCmc,
    randomCmcValue,
    cmcAny,
  }) {
    const clauses = [];
    const targetValue = randomCmc
      ? (randomCmcValue ?? Math.floor(Math.random() * 17))
      : Number(cmc);
    const selectedColors = Array.isArray(color)
      ? color
      : [color].filter(Boolean);

    if (selectedColors.length > 0) {
      const colorClause = `${exactColor ? "c=" : "id:"}${selectedColors.join("")}`;
      clauses.push(colorClause);
    }

    if (type) clauses.push(`t:${type}`);
    if (rarity) clauses.push(`rarity:${rarity}`);
    if (legendary) clauses.push("t:legendary");

    if (!cmcAny && !Number.isNaN(targetValue)) {
      if (randomCmc) {
        clauses.push(`cmc=${targetValue}`);
      } else {
        clauses.push(targetValue === 16 ? "cmc>=16" : `cmc=${targetValue}`);
      }
    }

    return clauses.join(" ");
  }

  function matchesFilters(
    card,
    { color, type, rarity, cmc, legendary, randomCmc, randomCmcValue, cmcAny },
  ) {
    const selectedColors = Array.isArray(color)
      ? color
      : [color].filter(Boolean);
    if (selectedColors.length > 0) {
      const cardColors = (card.colors || card.color_identity || []).map(
        (entry) => entry.toLowerCase(),
      );
      const matchesAllColors = selectedColors.every((entry) =>
        cardColors.includes(entry),
      );
      if (!matchesAllColors) return false;
    }

    if (type) {
      const typeLine = (card.type_line || "").toLowerCase();
      if (!typeLine.includes(type)) return false;
    }

    if (rarity) {
      if ((card.rarity || "").toLowerCase() !== rarity) return false;
    }

    if (legendary) {
      const typeLine = (card.type_line || "").toLowerCase();
      if (!typeLine.includes("legendary")) return false;
    }

    const targetValue = randomCmc
      ? (randomCmcValue ?? Math.floor(Math.random() * 17))
      : Number(cmc);
    if (!cmcAny && !Number.isNaN(targetValue)) {
      const manaValue = Number(card.cmc);
      if (randomCmc) {
        if (manaValue !== targetValue) return false;
      } else if (targetValue === 16) {
        if (manaValue < 16) return false;
      } else if (manaValue !== targetValue) {
        return false;
      }
    }

    return true;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { buildSearchQuery, matchesFilters };
  }

  root.filterUtils = { buildSearchQuery, matchesFilters };
})(typeof window !== "undefined" ? window : globalThis);
