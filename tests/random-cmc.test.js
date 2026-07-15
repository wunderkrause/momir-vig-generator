const assert = require("node:assert/strict");
const { buildSearchQuery, matchesFilters } = require("../filter-utils.js");

const randomCmcQuery = buildSearchQuery({
  randomCmc: true,
  randomCmcValue: 4,
  color: ["r"],
  type: "creature",
});
assert.match(randomCmcQuery, /cmc=4/);
assert.match(randomCmcQuery, /t:creature/);
assert.match(randomCmcQuery, /id:r/);

const card = { colors: ["R"], type_line: "Creature — Goblin", cmc: 4 };
assert.equal(
  matchesFilters(card, { randomCmc: true, randomCmcValue: 4 }),
  true,
);
assert.equal(matchesFilters(card, { cmc: "4" }), true);
assert.equal(matchesFilters(card, { cmc: "5" }), false);
assert.equal(matchesFilters({ cmc: 0 }, { cmc: "0" }), true);
assert.equal(matchesFilters({ cmc: 4 }, { cmc: "0" }), false);
assert.equal(buildSearchQuery({ cmc: "0", cmcAny: false }), "cmc=0");
assert.equal(buildSearchQuery({ cmcAny: true }), "");

console.log("Random CMC filter tests passed");
