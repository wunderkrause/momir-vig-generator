const form = document.getElementById("filters-form");
const loading = document.getElementById("loading");
const result = document.getElementById("card-result");
const cmcSlider = document.getElementById("cmc");
const cmcValueLabel = document.getElementById("cmc-value");
const cmcAnyToggle = document.getElementById("cmc-any");
const debugQuery = document.getElementById("debug-query");
const debugResponse = document.getElementById("debug-response");
const debugToggle = document.getElementById("debug-toggle");
const debugPanel = document.getElementById("debug-panel");
const generateButton = form.querySelector('button[type="submit"]');
const resetButton = document.getElementById("reset-filters");
const printButton = document.getElementById("print-card");
let lastCardId = null;
let lastRequestTime = 0;
let throttleTimer = null;
let hasGeneratedCard = false;

function setGenerateButtonState(isDisabled, label) {
  generateButton.disabled = isDisabled;
  generateButton.textContent = label;
}

function restoreGenerateButton() {
  const waitTime = Math.max(0, 1000 - (Date.now() - lastRequestTime));
  if (throttleTimer) {
    window.clearTimeout(throttleTimer);
  }
  throttleTimer = window.setTimeout(() => {
    setGenerateButtonState(false, "Generate Card");
  }, waitTime);
}

function setPrintButtonState(isEnabled) {
  printButton.disabled = !isEnabled;
}

function getEffectiveCmc(cmcValue, cmcAny) {
  if (cmcAny) {
    return null;
  }

  const numericValue = Number(cmcValue);
  if (Number.isNaN(numericValue)) {
    return null;
  }

  return numericValue;
}

function updateCmcLabel() {
  cmcSlider.disabled = cmcAnyToggle.checked;

  if (cmcAnyToggle.checked) {
    cmcValueLabel.textContent = "Any";
    return;
  }

  const value = Number(cmcSlider.value);
  cmcValueLabel.textContent = value === 16 ? "16+" : value;
}

cmcSlider.addEventListener("input", updateCmcLabel);
cmcAnyToggle.addEventListener("change", updateCmcLabel);

function updateDebugVisibility() {
  debugPanel.classList.toggle("hidden", !debugToggle.checked);
  if (!debugToggle.checked) {
    debugQuery.textContent = "Debug disabled";
    debugResponse.textContent = "Debug disabled";
  }
}

function resetFilters() {
  document.getElementById("color").selectedIndex = -1;
  document.getElementById("type").value = "";
  document.getElementById("rarity").value = "";
  document.getElementById("cmc").value = "0";
  document.getElementById("cmc-any").checked = false;
  document.getElementById("legendary").checked = false;
  document.getElementById("exact-color").checked = false;
  //cmcSlider.disabled = true;
  cmcValueLabel.textContent = "0";
}

debugToggle.addEventListener("change", updateDebugVisibility);
window.addEventListener("beforeprint", () => {
  document.body.classList.add("print-image-only");
});
window.addEventListener("afterprint", () => {
  document.body.classList.remove("print-image-only");
});
printButton.addEventListener("click", () => {
  if (printButton.disabled) {
    return;
  }

  window.print();
});
resetButton.addEventListener("click", () => {
  resetFilters();
  hasGeneratedCard = false;
  setPrintButtonState(false);
  result.innerHTML = `<div class="placeholder"><h2>Filters reset</h2><p>Select new options and generate a card.</p></div>`;
});

updateCmcLabel();
updateDebugVisibility();
setPrintButtonState(false);

function buildSearchQuery({
  color,
  type,
  rarity,
  cmc,
  legendary,
  exactColor,
  cmcAny,
}) {
  const clauses = [];
  const effectiveCmc = getEffectiveCmc(cmc, cmcAny);
  const selectedColors = Array.isArray(color) ? color : [color].filter(Boolean);

  if (selectedColors.length > 0) {
    const colorClause = `${exactColor ? "c=" : "id:"}${selectedColors.join("")}`;
    clauses.push(colorClause);
  }
  if (type) clauses.push(`t:${type}`);
  if (rarity) clauses.push(`rarity:${rarity}`);
  if (legendary) clauses.push("t:legendary");
  if (effectiveCmc !== null) {
    clauses.push(effectiveCmc === 16 ? "cmc>=16" : `cmc=${effectiveCmc}`);
  }

  return clauses.join(" ");
}

function matchesFilters(card, { color, type, rarity, cmc, legendary, cmcAny }) {
  const selectedColors = Array.isArray(color) ? color : [color].filter(Boolean);
  if (selectedColors.length > 0) {
    const cardColors = (card.colors || card.color_identity || []).map((entry) =>
      entry.toLowerCase(),
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

  const effectiveCmc = getEffectiveCmc(cmc, cmcAny);
  if (!cmcAny && effectiveCmc !== null) {
    const manaValue = Number(card.cmc);

    if (effectiveCmc === 16) {
      if (manaValue < 16) return false;
    } else if (manaValue !== effectiveCmc) {
      return false;
    }
  }

  return true;
}

function replaceWithManaSymbols(text) {
  if (!text) return "";

  // Regular expression to match any content inside curly braces {}
  return text.replace(/\{([^}]+)\}/g, (match, code) => {
    // 1. Clean the code string: trim spaces, lowercase it, and remove any internal slashes
    let cleanCode = code.trim().toLowerCase();

    // Tracks extra CSS utility classes needed for special symbols
    let extraClasses = "ms-cost";

    // 2. Handle special non-cost symbols (Tap, Untap, Chaos, etc.)
    if (cleanCode === "t") {
      cleanCode = "tap";
      extraClasses = ""; // Tap doesn't use the circular .ms-cost background
    } else if (cleanCode === "q") {
      cleanCode = "untap";
      extraClasses = "";
    } else if (cleanCode === "chaos") {
      extraClasses = "";
    }

    // 3. Handle hybrid/split mana codes containing slashes (e.g., "w/u" or "2/b")
    // Mana font styles split classes sequentially without slashes: .ms-wu or .ms-2b
    if (cleanCode.includes("/")) {
      cleanCode = cleanCode.replace(/\//g, "");
    }

    // 4. Return the fully formed Mana Font HTML element
    // Using a template literal to inject the modified class names cleanly
    return `<i class="ms ms-${cleanCode}${extraClasses ? " " + extraClasses : ""}" aria-label="${code} mana"></i>`;
  });
}

async function fetchMatchingCard(filters) {
  const searchQuery = buildSearchQuery(filters);
  console.debug("Scryfall query:", searchQuery);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const url = new URL("https://api.scryfall.com/cards/random");
    url.searchParams.set("q", searchQuery);

    const response = await fetch(url);
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Scryfall error ${response.status}: ${errorBody}`);
    }

    const card = await response.json();
    if (!card?.id) continue;

    if (card.id === lastCardId) continue;

    lastCardId = card.id;
    return { card, responseBody: JSON.stringify(card, null, 2) };
  }

  return { card: null, responseBody: "No matching card found" };
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const now = Date.now();
  if (now - lastRequestTime < 1000) {
    result.innerHTML =
      '<div class="placeholder"><h2>Slow down</h2><p>Please wait a moment before generating another card.</p></div>';
    return;
  }

  lastRequestTime = now;
  setGenerateButtonState(true, "Please wait…");

  const colorSelect = document.getElementById("color");
  const selectedColors = Array.from(colorSelect.selectedOptions)
    .map((option) => option.value)
    .filter(Boolean);

  const filters = {
    color: selectedColors,
    type: document.getElementById("type").value,
    rarity: document.getElementById("rarity").value,
    cmc: document.getElementById("cmc").value,
    legendary: document.getElementById("legendary").checked,
    cmcAny: document.getElementById("cmc-any").checked,
    exactColor: document.getElementById("exact-color").checked,
  };

  const query = buildSearchQuery(filters);
  const url = new URL("https://api.scryfall.com/cards/random");
  if (query) {
    url.searchParams.set("q", query);
  }
  debugQuery.textContent = debugToggle.checked
    ? url.toString()
    : "Debug disabled";
  debugResponse.textContent = debugToggle.checked
    ? "Waiting for response…"
    : "Debug disabled";

  loading.classList.remove("hidden");
  result.innerHTML = "";

  try {
    const { card, responseBody } = await fetchMatchingCard(filters);

    if (debugToggle.checked) {
      debugResponse.textContent = responseBody || "No response body returned";
    }

    if (!card) {
      if (debugToggle.checked) {
        result.innerHTML = `<div class="placeholder"><h2>No card returned</h2><p>${responseBody || "No matching card found."}</p></div>`;
      } else {
        result.innerHTML =
          '<div class="placeholder"><h2>Something went wrong</h2><p>Please try again with a different combination.</p></div>';
      }
      return;
    }

    const cardFrame = document.createElement("div");
    cardFrame.className = "card-frame";

    const firstFace = card.card_faces?.[0] || card;
    const imageUri = card.image_uris?.normal || firstFace?.image_uris?.normal;
    const titleText = firstFace?.name || card.name;
    const manaText = card.mana_cost || firstFace?.mana_cost || "";
    const typeText = card.type_line || firstFace?.type_line || "Unknown type";
    const setText = card.set_name || "";
    const oracleText =
      [
        card.oracle_text,
        ...(card.card_faces || []).map((face) => face.oracle_text),
      ]
        .filter(Boolean)
        .join("\n\n") || "No oracle text available.";

    if (imageUri) {
      const tiltWrapper = document.createElement("hover-tilt");
      tiltWrapper.className = "hover-tilt-wrapper";
      tiltWrapper.setAttribute("shadow", "false");
      tiltWrapper.setAttribute("scale-factor", "1.02");
      tiltWrapper.setAttribute("glare-intensity", "0.5");

      const image = document.createElement("img");
      image.src = imageUri;
      image.alt = titleText;
      image.className = "card-image";
      tiltWrapper.appendChild(image);

      cardFrame.appendChild(tiltWrapper);
    }

    const title = document.createElement("h2");
    title.className = "card-title";
    title.textContent = titleText;
    cardFrame.appendChild(title);

    const meta = document.createElement("p");
    meta.className = "card-meta";
    meta.textContent = [manaText, typeText, setText]
      .filter(Boolean)
      .join(" · ");
    meta.innerHTML = replaceWithManaSymbols(meta.textContent);
    cardFrame.appendChild(meta);

    const text = document.createElement("p");
    text.className = "card-text";
    text.innerHTML = oracleText.replace(/\n/g, "<br>");
    text.innerHTML = replaceWithManaSymbols(text.innerHTML);
    cardFrame.appendChild(text);

    if (card.scryfall_uri) {
      const link = document.createElement("a");
      link.href = card.scryfall_uri;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.className = "card-link";
      link.textContent = "View on Scryfall";
      cardFrame.appendChild(link);
    }

    result.appendChild(cardFrame);
    hasGeneratedCard = true;
    setPrintButtonState(true);
  } catch (error) {
    if (debugToggle.checked) {
      result.innerHTML = `<div class="placeholder"><h2>Scryfall error</h2><p>${error.message}</p></div>`;
    } else {
      result.innerHTML =
        '<div class="card-frame"><hover-tilt class="hover-tilt-wrapper" shadow="false" scale-factor="1.02" glare-intensity="0.5"><img src="https://cards.scryfall.io/display/front/1/5/151e0e5d-656e-4bec-8110-f31a3bb5f014.webp?1783942309" alt="Door to Nothingness" class="card-image"></hover-tilt><h2>Well that was awkward.</h2><p>Please try again with a different combination.</p></div>';
    }
  } finally {
    loading.classList.add("hidden");
    restoreGenerateButton();
  }
});
