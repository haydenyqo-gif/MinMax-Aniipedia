(() => {
  "use strict";

  const ANIILOG_URL = "./data/aniilog_data.json?v=20260721-skill-behavior-v001";
  const ITEMLOG_URL =
    window.ANIIPEDIA_CONFIG?.itemDataUrl ||
    "./data/itemlog_data.json?v=20260725-catalog-v003";
  const MECHANICS_URL = "./data/team_builder_mechanics.json?v=20260726-stat-range-v004";
  const LEGACY_STORAGE_KEY = "minmax-aniipedia:team-builder:v1";
  const LOADOUTS_STORAGE_KEY = "minmax-aniipedia:team-loadouts:v1";
  const LOADOUT_FILE_FORMAT = "aniipedia-team-loadout";
  const LOADOUT_FILE_VERSION = 1;
  const MAX_LOCAL_LOADOUTS = 50;
  const MAX_LOADOUT_FILE_BYTES = 512 * 1024;
  const TEAM_SHARE_PARAM = "team";
  const TEAM_SHARE_VERSION = 1;
  const SHORT_SHARE_CODE_PATTERN = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{8}$/;
  const SHARE_API_URL = String(window.ANIIPEDIA_CONFIG?.shareApiUrl || "").replace(/\/+$/, "");
  const INITIAL_URL_PARAMS = new URLSearchParams(window.location.search);
  const REQUESTED_TEAM_SHARE_ID = SHORT_SHARE_CODE_PATTERN.test(INITIAL_URL_PARAMS.get(TEAM_SHARE_PARAM) || "")
    ? INITIAL_URL_PARAMS.get(TEAM_SHARE_PARAM)
    : "";
  const TEAM_SIZE = 4;
  const MAX_ACTIVE_SKILLS = 2;
  const MIN_ANIIMO_LEVEL = 1;
  const MAX_ANIIMO_LEVEL = 60;
  const MAX_POTENTIAL_PER_STAT = 20;
  const MAX_RUNE_POTENTIAL_BONUS = 6;
  const MAX_CARRIED_ITEM_LEVEL = 20;
  const POTENTIAL_MILESTONE_SIZE = 4;
  const POTENTIAL_MILESTONE_BONUS = 0.06;
  const INDIVIDUAL_POINT_COEFFICIENT = 0.01961;
  const BUFF_PATTERN = /\b(increas|boost|amplif|bonus|restore|shield|resist|siphon|damage dealt|critical|break efficiency|invincible)/i;
  const STAT_ORDER = ["HP", "Attack", "Break", "Defense", "Magic Defense", "EP Regen"];
  const STAT_ALIASES = Object.freeze({
    HP: "HP",
    ATK: "Attack",
    Attack: "Attack",
    "Magic Attack": "Magic Attack",
    BREAK: "Break",
    Break: "Break",
    "P.DEF": "Defense",
    Defense: "Defense",
    "M.DEF": "Magic Defense",
    "Magic Defense": "Magic Defense",
    REGEN: "EP Regen",
    Regen: "EP Regen",
    "EP Regen": "EP Regen",
  });
  const LEVEL_STAT_CURVES = Object.freeze({
    HP: Object.freeze({ offset: 20, divisor: 120, scale: 20.4 }),
    Attack: Object.freeze({ offset: 0, divisor: 120, scale: 1.02 }),
    "Magic Attack": Object.freeze({ offset: 0, divisor: 120, scale: 1.02 }),
    Break: Object.freeze({ offset: 0, divisor: 50, scale: 0.51 }),
    Defense: Object.freeze({ offset: 0, divisor: 80, scale: 0.51 }),
    "Magic Defense": Object.freeze({ offset: 0, divisor: 80, scale: 0.51 }),
    "EP Regen": Object.freeze({ offset: 0, divisor: 90, scale: 0.51 }),
  });
  const POTENTIAL_STATS = Object.freeze([
    Object.freeze({ key: "HP", label: "HP" }),
    Object.freeze({ key: "Attack", label: "ATK" }),
    Object.freeze({ key: "Defense", label: "P.DEF" }),
    Object.freeze({ key: "EP Regen", label: "REGEN" }),
    Object.freeze({ key: "Magic Defense", label: "M.DEF" }),
    Object.freeze({ key: "Break", label: "BREAK" }),
  ]);
  const PERSONALITY_OPTIONS = Object.freeze([
    Object.freeze({
      id: "clingy",
      code: "E",
      pair: "E/I",
      label: "Clingy",
      effects: Object.freeze([
        Object.freeze({ label: "Attack", value: 0.02 }),
        Object.freeze({
          label: "Break",
          value: 0.05,
          cardStat: false,
          advancedLabel: "Break bonus",
        }),
      ]),
    }),
    Object.freeze({
      id: "instinctive",
      code: "I",
      pair: "E/I",
      label: "Instinctive",
      effects: Object.freeze([Object.freeze({ label: "EP Regen", value: 0.05 })]),
    }),
    Object.freeze({
      id: "practical",
      code: "S",
      pair: "S/N",
      label: "Practical",
      effects: Object.freeze([Object.freeze({ label: "Damage Amp", value: 0.04 })]),
    }),
    Object.freeze({
      id: "perspicacious",
      code: "N",
      pair: "S/N",
      label: "Perspicacious",
      effects: Object.freeze([Object.freeze({ label: "Critical Rate", value: 0.04 })]),
    }),
    Object.freeze({
      id: "aloof",
      code: "T",
      pair: "T/F",
      label: "Aloof",
      effects: Object.freeze([Object.freeze({ label: "Defense", value: 0.06 })]),
    }),
    Object.freeze({
      id: "faithful",
      code: "F",
      pair: "T/F",
      label: "Faithful",
      effects: Object.freeze([Object.freeze({ label: "Magic Defense", value: 0.06 })]),
    }),
    Object.freeze({
      id: "obedient",
      code: "J",
      pair: "J/P",
      label: "Obedient",
      effects: Object.freeze([Object.freeze({ label: "HP", value: 0.04 })]),
    }),
    Object.freeze({
      id: "spontaneous",
      code: "P",
      pair: "J/P",
      label: "Spontaneous",
      effects: Object.freeze([Object.freeze({ label: "Damage Reduction", value: 0.04 })]),
    }),
  ]);
  const PERSONALITY_PAIRS = Object.freeze(["E/I", "S/N", "T/F", "J/P"]);

  let sidebar = null;
  let panel = null;
  let aniilog = null;
  let itemlog = null;
  let mechanics = null;
  let loadPromise = null;
  let loadError = "";
  let requestedTeamShareLoaded = false;
  let shareBusy = false;
  let shareStatus = "";
  let loadoutStore = loadLoadoutStore();
  let model = activeLoadout().model;

  function defaultMember() {
    return {
      aniimoId: "",
      level: MAX_ANIIMO_LEVEL,
      stage: 7,
      activeSkills: ["", ""],
      switchSkill: "",
      ultimateSkill: "",
      personalities: [],
      potentials: Object.fromEntries(POTENTIAL_STATS.map((stat) => [stat.key, 0])),
      formCollectionLevel: 0,
      carriedItemId: "",
      carriedItemLevel: MAX_CARRIED_ITEM_LEVEL,
      runes: {},
    };
  }

  function defaultModel() {
    return {
      mode: "standard",
      activeSlot: 0,
      members: Array.from({ length: TEAM_SIZE }, defaultMember),
      scenarioToggles: {},
    };
  }

  function normalizeMember(value) {
    const base = defaultMember();
    const requestedCarriedItemLevel = Number(value?.carriedItemLevel);
    const activeSkills = Array.isArray(value?.activeSkills)
      ? value.activeSkills.slice(0, MAX_ACTIVE_SKILLS).map((skill) => String(skill || ""))
      : base.activeSkills;
    while (activeSkills.length < MAX_ACTIVE_SKILLS) activeSkills.push("");
    const selectedPersonalityPairs = new Map();
    if (Array.isArray(value?.personalities)) {
      value.personalities.forEach((trait) => {
        const option = PERSONALITY_OPTIONS.find((candidate) => candidate.id === String(trait || ""));
        if (option && !selectedPersonalityPairs.has(option.pair)) {
          selectedPersonalityPairs.set(option.pair, option.id);
        }
      });
    }
    const personalities = PERSONALITY_PAIRS
      .map((pair) => selectedPersonalityPairs.get(pair))
      .filter(Boolean);
    const potentials = Object.fromEntries(POTENTIAL_STATS.map((stat) => {
      const amount = Number(value?.potentials?.[stat.key]);
      return [stat.key, Math.min(MAX_POTENTIAL_PER_STAT, Math.max(0, Number.isFinite(amount) ? Math.round(amount) : 0))];
    }));
    return {
      ...base,
      aniimoId: String(value?.aniimoId || ""),
      level: Math.min(MAX_ANIIMO_LEVEL, Math.max(MIN_ANIIMO_LEVEL, Math.round(Number(value?.level) || MAX_ANIIMO_LEVEL))),
      stage: Math.min(7, Math.max(1, Number(value?.stage) || 7)),
      activeSkills,
      switchSkill: String(value?.switchSkill || ""),
      ultimateSkill: String(value?.ultimateSkill || ""),
      personalities,
      potentials,
      formCollectionLevel: Math.max(0, Math.round(Number(value?.formCollectionLevel) || 0)),
      carriedItemId: String(value?.carriedItemId || ""),
      carriedItemLevel: Math.min(
        MAX_CARRIED_ITEM_LEVEL,
        Math.max(
          0,
          Number.isFinite(requestedCarriedItemLevel)
            ? Math.round(requestedCarriedItemLevel)
            : MAX_CARRIED_ITEM_LEVEL,
        ),
      ),
      runes: value?.runes && typeof value.runes === "object" ? value.runes : {},
    };
  }

  function normalizeRunes(value) {
    if (Array.isArray(value)) {
      return Object.fromEntries(value.slice(0, 6).flatMap((slot) => {
        const position = String(slot?.position || "");
        if (!position) return [];
        return [[position, {
          itemId: String(slot?.itemId || ""),
          rolls: Array.isArray(slot?.rolls)
            ? slot.rolls.slice(0, 3).map((roll) => ({
              attributeId: String(roll?.attributeId || ""),
              mode: roll?.mode === "minimum" ? "minimum" : "perfect",
            }))
            : [],
        }]];
      }));
    }
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function normalizeModel(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return defaultModel();
    const members = Array.isArray(value.members)
      ? value.members.slice(0, TEAM_SIZE).map((member) => normalizeMember({
        ...member,
        runes: normalizeRunes(member?.runes),
      }))
      : [];
    while (members.length < TEAM_SIZE) members.push(defaultMember());
    const scenarioToggles = value.scenarioToggles && typeof value.scenarioToggles === "object"
      && !Array.isArray(value.scenarioToggles)
      ? Object.fromEntries(Object.entries(value.scenarioToggles)
        .slice(0, 500)
        .map(([key, enabled]) => [String(key), Boolean(enabled)]))
      : {};
    return {
      mode: value.mode === "coop" ? "coop" : "standard",
      activeSlot: Math.min(TEAM_SIZE - 1, Math.max(0, Number(value.activeSlot) || 0)),
      members,
      scenarioToggles,
    };
  }

  function loadoutId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `team-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function cleanLoadoutName(value, fallback = "Team") {
    const name = String(value || "").replace(/\s+/g, " ").trim().slice(0, 80);
    return name || fallback;
  }

  function normalizeLoadout(value, index) {
    return {
      id: String(value?.id || loadoutId()),
      name: cleanLoadoutName(value?.name, `Team ${index + 1}`),
      createdAt: String(value?.createdAt || new Date().toISOString()),
      updatedAt: String(value?.updatedAt || value?.createdAt || new Date().toISOString()),
      sourceShareId: SHORT_SHARE_CODE_PATTERN.test(String(value?.sourceShareId || ""))
        ? String(value.sourceShareId)
        : "",
      model: normalizeModel(value?.model),
    };
  }

  function normalizeLoadoutStore(value, legacyModel = null) {
    const savedLoadouts = Array.isArray(value?.loadouts)
      ? value.loadouts.slice(0, MAX_LOCAL_LOADOUTS).map(normalizeLoadout)
      : [];
    const loadouts = savedLoadouts.length
      ? savedLoadouts
      : [normalizeLoadout({ name: "Team 1", model: legacyModel || defaultModel() }, 0)];
    const requestedActiveId = String(value?.activeId || "");
    return {
      version: 1,
      activeId: loadouts.some((loadout) => loadout.id === requestedActiveId)
        ? requestedActiveId
        : loadouts[0].id,
      loadouts,
    };
  }

  function loadLoadoutStore() {
    let saved = null;
    let legacyModel = null;
    try {
      saved = JSON.parse(window.localStorage.getItem(LOADOUTS_STORAGE_KEY) || "null");
    } catch {
      saved = null;
    }
    if (!Array.isArray(saved?.loadouts) || !saved.loadouts.length) {
      try {
        const legacy = JSON.parse(window.localStorage.getItem(LEGACY_STORAGE_KEY) || "null");
        if (legacy && typeof legacy === "object") legacyModel = normalizeModel(legacy);
      } catch {
        legacyModel = null;
      }
    }
    const store = normalizeLoadoutStore(saved, legacyModel);
    try {
      window.localStorage.setItem(LOADOUTS_STORAGE_KEY, JSON.stringify(store));
      if (legacyModel) window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      // The builder remains usable for the current visit if storage is unavailable.
    }
    return store;
  }

  function activeLoadout() {
    return loadoutStore.loadouts.find((loadout) => loadout.id === loadoutStore.activeId)
      || loadoutStore.loadouts[0];
  }

  function persistLoadoutStore() {
    try {
      window.localStorage.setItem(LOADOUTS_STORAGE_KEY, JSON.stringify(loadoutStore));
    } catch {
      // The builder remains usable for the current visit if storage is unavailable.
    }
  }

  function persist() {
    const loadout = activeLoadout();
    model = normalizeModel(model);
    loadout.model = model;
    loadout.updatedAt = new Date().toISOString();
    persistLoadoutStore();
  }

  function uniqueLoadoutName(requestedName) {
    const base = cleanLoadoutName(requestedName, `Team ${loadoutStore.loadouts.length + 1}`);
    const names = new Set(loadoutStore.loadouts.map((loadout) => loadout.name.toLocaleLowerCase()));
    if (!names.has(base.toLocaleLowerCase())) return base;
    let suffix = 2;
    while (names.has(`${base} ${suffix}`.toLocaleLowerCase())) suffix += 1;
    return `${base} ${suffix}`;
  }

  function createLoadout(name, initialModel = defaultModel(), sourceShareId = "") {
    if (loadoutStore.loadouts.length >= MAX_LOCAL_LOADOUTS) {
      throw new Error(`You can save up to ${MAX_LOCAL_LOADOUTS} local team loadouts.`);
    }
    const now = new Date().toISOString();
    const loadout = normalizeLoadout({
      id: loadoutId(),
      name: uniqueLoadoutName(name),
      createdAt: now,
      updatedAt: now,
      sourceShareId,
      model: initialModel,
    }, loadoutStore.loadouts.length);
    loadoutStore.loadouts.push(loadout);
    loadoutStore.activeId = loadout.id;
    model = loadout.model;
    persistLoadoutStore();
    return loadout;
  }

  function switchLoadout(id) {
    persist();
    const loadout = loadoutStore.loadouts.find((entry) => entry.id === id);
    if (!loadout) return;
    loadoutStore.activeId = loadout.id;
    model = normalizeModel(loadout.model);
    loadout.model = model;
    shareStatus = `Loaded ${loadout.name}.`;
    persistLoadoutStore();
    render();
  }

  function createNewLoadout() {
    try {
      const loadout = createLoadout(`Team ${loadoutStore.loadouts.length + 1}`);
      shareStatus = `${loadout.name} created. Changes save automatically.`;
    } catch (error) {
      shareStatus = error instanceof Error ? error.message : String(error);
    }
    render();
  }

  function renameActiveLoadout() {
    const loadout = activeLoadout();
    const requested = window.prompt("Team loadout name:", loadout.name);
    if (requested === null) return;
    const nextName = cleanLoadoutName(requested, loadout.name);
    const duplicate = loadoutStore.loadouts.some((entry) => (
      entry.id !== loadout.id && entry.name.toLocaleLowerCase() === nextName.toLocaleLowerCase()
    ));
    loadout.name = duplicate ? uniqueLoadoutName(nextName) : nextName;
    loadout.updatedAt = new Date().toISOString();
    shareStatus = `Renamed to ${loadout.name}.`;
    persistLoadoutStore();
    render();
  }

  function teamShareSelection() {
    return {
      t: "team",
      v: TEAM_SHARE_VERSION,
      mode: model.mode,
      activeSlot: model.activeSlot,
      members: model.members.map((member) => ({
        aniimoId: member.aniimoId,
        level: member.level,
        stage: member.stage,
        activeSkills: member.activeSkills,
        switchSkill: member.switchSkill,
        ultimateSkill: member.ultimateSkill,
        personalities: member.personalities,
        potentials: member.potentials,
        formCollectionLevel: member.formCollectionLevel,
        carriedItemId: member.carriedItemId,
        carriedItemLevel: member.carriedItemLevel,
        runes: Object.entries(member.runes || {}).map(([position, selection]) => ({
          position,
          itemId: String(selection?.itemId || ""),
          rolls: Array.isArray(selection?.rolls)
            ? selection.rolls.map((roll) => ({
              attributeId: String(roll?.attributeId || ""),
              mode: roll?.mode === "minimum" ? "minimum" : "perfect",
            }))
            : [],
        })),
      })),
      scenarioToggles: model.scenarioToggles,
    };
  }

  function safeFileName(value) {
    const safe = cleanLoadoutName(value, "team")
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
      .replace(/[. ]+$/g, "")
      .slice(0, 80);
    return safe || "team";
  }

  function exportActiveLoadout() {
    persist();
    const loadout = activeLoadout();
    const payload = {
      format: LOADOUT_FILE_FORMAT,
      version: LOADOUT_FILE_VERSION,
      name: loadout.name,
      team: teamShareSelection(),
    };
    const blob = new Blob([JSON.stringify(payload)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeFileName(loadout.name)}.aniiteam`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    shareStatus = `${loadout.name} exported.`;
    render();
  }

  function importedLoadoutPayload(value) {
    const wrapper = value && typeof value === "object" && !Array.isArray(value) ? value : null;
    const selection = wrapper?.format === LOADOUT_FILE_FORMAT
      && Number(wrapper.version) === LOADOUT_FILE_VERSION
      ? wrapper.team
      : wrapper?.selection?.t === "team"
        ? wrapper.selection
        : wrapper;
    if (selection?.t !== "team" || Number(selection.v) !== TEAM_SHARE_VERSION) {
      throw new Error("This is not a valid Aniipedia team loadout file.");
    }
    return {
      name: cleanLoadoutName(wrapper?.name, "Imported team"),
      model: normalizeModel(selection),
    };
  }

  async function importLoadoutFile(file) {
    if (!file) return;
    if (file.size > MAX_LOADOUT_FILE_BYTES) {
      shareStatus = "That loadout file is too large.";
      render();
      return;
    }
    try {
      const parsed = JSON.parse(await file.text());
      const imported = importedLoadoutPayload(parsed);
      const loadout = activeLoadout();
      const confirmed = window.confirm(
        `Import "${imported.name}" and overwrite "${loadout.name}"?\n\n`
        + "The current profile's team setup will be replaced. This cannot be undone.",
      );
      if (!confirmed) {
        shareStatus = "Import cancelled. The current profile was not changed.";
        render();
        return;
      }
      loadout.model = imported.model;
      loadout.updatedAt = new Date().toISOString();
      loadout.sourceShareId = "";
      model = loadout.model;
      model.members.forEach(validateMember);
      persist();
      shareStatus = `${loadout.name} was overwritten by the imported team.`;
    } catch (error) {
      shareStatus = error instanceof Error ? error.message : String(error);
    }
    render();
  }

  async function copyText(value) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
    const input = document.createElement("textarea");
    input.value = value;
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.append(input);
    input.select();
    document.execCommand("copy");
    input.remove();
  }

  async function shareTeam() {
    if (shareBusy) return;
    if (!SHARE_API_URL) {
      shareStatus = "Team sharing is not configured.";
      render();
      return;
    }
    persist();
    shareBusy = true;
    shareStatus = "Creating share link…";
    render();
    try {
      const response = await fetch(`${SHARE_API_URL}/v1/shares`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ version: TEAM_SHARE_VERSION, selection: teamShareSelection() }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !SHORT_SHARE_CODE_PATTERN.test(body?.id || "")) {
        throw new Error(body?.error || "Could not create the team link");
      }
      const url = new URL(window.location.href);
      url.search = "";
      url.searchParams.set(TEAM_SHARE_PARAM, body.id);
      url.hash = "";
      await copyText(url.toString());
      shareStatus = body?.expiresAt
        ? "Team link copied. It expires in 30 days."
        : "Team link copied.";
    } catch (error) {
      shareStatus = error instanceof Error ? error.message : String(error);
    } finally {
      shareBusy = false;
      render();
    }
  }

  async function loadRequestedTeamShare() {
    if (requestedTeamShareLoaded || !REQUESTED_TEAM_SHARE_ID) return;
    requestedTeamShareLoaded = true;
    if (!SHARE_API_URL) {
      shareStatus = "This team link cannot be loaded because sharing is not configured.";
      return;
    }
    try {
      const response = await fetch(`${SHARE_API_URL}/v1/shares/${REQUESTED_TEAM_SHARE_ID}`, {
        headers: { accept: "application/json" },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || "Could not load the shared team");
      if (body?.selection?.t !== "team" || Number(body.selection.v) !== TEAM_SHARE_VERSION) {
        throw new Error("Shared team data is invalid");
      }
      const existing = loadoutStore.loadouts.find(
        (loadout) => loadout.sourceShareId === REQUESTED_TEAM_SHARE_ID,
      );
      if (existing) {
        existing.model = normalizeModel(body.selection);
        existing.updatedAt = new Date().toISOString();
        loadoutStore.activeId = existing.id;
        model = existing.model;
        persistLoadoutStore();
        shareStatus = `${existing.name} refreshed from its shared link.`;
      } else {
        const loadout = createLoadout("Shared team", body.selection, REQUESTED_TEAM_SHARE_ID);
        shareStatus = `${loadout.name} loaded and saved locally.`;
      }
    } catch (error) {
      shareStatus = error instanceof Error ? error.message : String(error);
    }
  }

  function translate(value) {
    return window.AniipediaI18n?.translate(value) || String(value || "");
  }

  function el(tag, className = "", text = "") {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== "") node.textContent = text;
    return node;
  }

  function button(text, className, onClick) {
    const node = el("button", className, text);
    node.type = "button";
    node.addEventListener("click", onClick);
    return node;
  }

  function selectControl(labelText, options, value, onChange, className = "") {
    const label = el("label", `team-field ${className}`.trim());
    const caption = el("span", "team-field-label", labelText);
    const select = el("select", "team-select");
    options.forEach((option) => {
      const item = document.createElement("option");
      item.value = option.value;
      item.textContent = option.label;
      item.disabled = Boolean(option.disabled);
      item.selected = String(option.value) === String(value || "");
      select.append(item);
    });
    select.addEventListener("change", () => onChange(select.value));
    label.append(caption, select);
    return label;
  }

  function numberControl(labelText, value, minimum, maximum, onChange, className = "") {
    const label = el("label", `team-field ${className}`.trim());
    const caption = el("span", "team-field-label", labelText);
    const input = el("input", "team-number-input");
    input.type = "number";
    input.min = String(minimum);
    input.max = String(maximum);
    input.step = "1";
    input.inputMode = "numeric";
    input.value = String(value);
    input.addEventListener("change", () => {
      const next = Math.min(maximum, Math.max(minimum, Math.round(Number(input.value) || 0)));
      input.value = String(next);
      onChange(next);
    });
    label.append(caption, input);
    return label;
  }

  function naturalCompare(left, right) {
    return String(left || "").localeCompare(String(right || ""), undefined, {
      numeric: true,
      sensitivity: "base",
    });
  }

  function aniimoEntries() {
    return Array.isArray(aniilog?.entries) ? aniilog.entries : [];
  }

  function carriedItems() {
    return (itemlog?.entries || [])
      .filter((entry) => entry?.catalog_category === "Carried Item" && entry?.rune_socket_layout)
      .sort((left, right) => naturalCompare(left.name, right.name) || naturalCompare(left.quality, right.quality));
  }

  function runeItems() {
    return (itemlog?.entries || [])
      .filter((entry) => entry?.rune_details)
      .sort((left, right) => {
        const qualityDifference = Number(left?.rune_details?.tier?.quality || 0) - Number(right?.rune_details?.tier?.quality || 0);
        return qualityDifference || naturalCompare(left.name, right.name);
      });
  }

  function aniimoFor(member) {
    return aniimoEntries().find((entry) => entry.id === member?.aniimoId) || null;
  }

  function carriedItemFor(member) {
    return carriedItems().find((entry) => entry.id === member?.carriedItemId) || null;
  }

  function skillKey(skill) {
    return String(skill?.localization_uids?.name || skill?.name || "");
  }

  function combatSkills(entry) {
    return (entry?.skills || []).filter((skill) => skill?.group === "Combat");
  }

  function coreSkills(entry) {
    return combatSkills(entry).filter((skill) => skill?.core);
  }

  function skillFor(entry, key) {
    return combatSkills(entry).find((skill) => skillKey(skill) === String(key || "")) || null;
  }

  function ultimateFor(entry, key) {
    return (entry?.ultimates || []).find((skill) => skillKey(skill) === String(key || "")) || null;
  }

  function mechanicsFor(entry, skill, section = "skills") {
    const formId = String(entry?.form_id || entry?.id || "").replace(/^aniimo:/, "");
    const name = String(skill?.name || "");
    if (!formId || !name) return null;
    return mechanics?.entries?.[`${formId}|${section}|${name}`] || null;
  }

  function statProjectionFor(entry) {
    const formId = String(entry?.form_id || entry?.id || "").replace(/^aniimo:/, "");
    return mechanics?.stat_projection?.forms?.[formId] || null;
  }

  function formCollectionDefinition(entry) {
    const familyId = String(statProjectionFor(entry)?.collection_family_id || "");
    return mechanics?.stat_projection?.collection_families?.[familyId] || null;
  }

  function maximumFormCollectionLevel(entry) {
    return Math.max(0, Number(formCollectionDefinition(entry)?.max_level) || 0);
  }

  function formCollectionBonus(member, entry) {
    const definition = formCollectionDefinition(entry);
    const level = Math.min(
      maximumFormCollectionLevel(entry),
      Math.max(0, Math.round(Number(member?.formCollectionLevel) || 0)),
    );
    const bonus = definition?.bonuses_by_level?.[String(level)] || null;
    return {
      stat: String(bonus?.stat || ""),
      percent: Number(bonus?.percent || 0),
    };
  }

  function compactStatLabel(label) {
    return POTENTIAL_STATS.find((stat) => stat.key === label)?.label || String(label || "");
  }

  function personalityFor(id) {
    return PERSONALITY_OPTIONS.find((option) => option.id === String(id || "")) || null;
  }

  function localizedAniimoLabel(entry) {
    if (!entry) return translate("Empty slot");
    const name = translate(entry.name);
    const form = translate(entry.form_label || "Basic");
    return `${name} — ${form}`;
  }

  function aniimoOptions() {
    return [
      { value: "", label: translate("Choose an Aniimo") },
      ...aniimoEntries()
        .slice()
        .sort((left, right) => naturalCompare(left.name, right.name) || naturalCompare(left.form_label, right.form_label))
        .map((entry) => ({ value: entry.id, label: localizedAniimoLabel(entry) })),
    ];
  }

  function resetMemberLoadout(member, entry) {
    const skills = combatSkills(entry);
    const nonCore = skills.filter((skill) => !skill.core);
    const defaults = [...nonCore, ...skills].slice(0, MAX_ACTIVE_SKILLS).map(skillKey);
    while (defaults.length < MAX_ACTIVE_SKILLS) defaults.push("");
    member.activeSkills = defaults;
    member.switchSkill = coreSkills(entry)
      .map(skillKey)
      .find((key) => !defaults.includes(key)) || "";
    member.ultimateSkill = (entry?.ultimates || []).map(skillKey).find(Boolean) || "";
    member.personalities = [];
    member.level = MAX_ANIIMO_LEVEL;
    member.stage = 7;
    member.formCollectionLevel = 0;
    member.carriedItemId = "";
    member.carriedItemLevel = MAX_CARRIED_ITEM_LEVEL;
    member.runes = {};
  }

  function validateMember(member) {
    const entry = aniimoFor(member);
    if (!entry) {
      Object.assign(member, defaultMember(), { aniimoId: member.aniimoId });
      return;
    }
    const keys = new Set(combatSkills(entry).map(skillKey));
    const seen = new Set();
    member.activeSkills = member.activeSkills.map((key) => {
      if (!keys.has(key) || seen.has(key)) return "";
      seen.add(key);
      return key;
    });
    const allowedSwitch = new Set(coreSkills(entry).map(skillKey));
    if (!allowedSwitch.has(member.switchSkill) || seen.has(member.switchSkill)) member.switchSkill = "";
    const ultimateKeys = new Set((entry.ultimates || []).map(skillKey));
    if (!ultimateKeys.has(member.ultimateSkill)) {
      member.ultimateSkill = (entry.ultimates || []).map(skillKey).find(Boolean) || "";
    }
    member.personalities = normalizeMember({ personalities: member.personalities }).personalities;
    member.stage = Math.min(member.stage, maxStageForLevel(member.level));
    member.formCollectionLevel = Math.min(
      maximumFormCollectionLevel(entry),
      Math.max(0, Math.round(Number(member.formCollectionLevel) || 0)),
    );
    const item = carriedItemFor(member);
    if (!item) {
      member.carriedItemId = "";
      member.carriedItemLevel = MAX_CARRIED_ITEM_LEVEL;
      member.runes = {};
      return;
    }

    member.carriedItemLevel = Math.min(
      MAX_CARRIED_ITEM_LEVEL,
      Math.max(0, Math.round(Number(member.carriedItemLevel) || 0)),
    );
    const slots = new Map(
      (item.rune_socket_layout?.slots || [])
        .filter((slot) => slot.available_at_this_rarity)
        .map((slot) => [String(slot.position), slot]),
    );
    const normalizedRunes = {};
    Object.entries(member.runes || {}).slice(0, slots.size).forEach(([position, selection]) => {
      const slot = slots.get(String(position));
      if (!slot) return;
      const compatibleShapes = new Set((slot.options || []).map((option) => option.id));
      const rune = runeItems().find((candidate) => (
        candidate.id === String(selection?.itemId || "")
        && compatibleShapes.has(candidate?.rune_details?.shape?.id)
      ));
      if (!rune) return;
      const allowedRolls = new Set(
        (rune.rune_details?.secondary_rolls || []).map((roll) => String(roll.attribute_id)),
      );
      const usedRolls = new Set();
      const lineCount = Number(rune.rune_details?.secondary_lines || 0);
      const rolls = Array.from({ length: lineCount }, (_, index) => {
        const chosen = selection?.rolls?.[index];
        const attributeId = String(chosen?.attributeId || "");
        if (!allowedRolls.has(attributeId) || usedRolls.has(attributeId)) {
          return { attributeId: "", mode: "perfect" };
        }
        usedRolls.add(attributeId);
        return {
          attributeId,
          mode: chosen?.mode === "minimum" ? "minimum" : "perfect",
        };
      });
      normalizedRunes[String(position)] = { itemId: rune.id, rolls };
    });
    member.runes = normalizedRunes;
  }

  async function ensureData() {
    if (aniilog && itemlog && mechanics) return;
    if (loadPromise) return loadPromise;
    loadPromise = Promise.all([
      fetch(ANIILOG_URL).then((response) => {
        if (!response.ok) throw new Error("Could not load Aniimo data");
        return response.json();
      }),
      fetch(ITEMLOG_URL).then((response) => {
        if (!response.ok) throw new Error("Could not load item data");
        return response.json();
      }),
      fetch(MECHANICS_URL).then((response) => {
        if (!response.ok) throw new Error("Could not load reviewed skill mechanics");
        return response.json();
      }),
    ]).then(([aniimoPayload, itemPayload, mechanicsPayload]) => {
      if (
        !Array.isArray(aniimoPayload?.entries)
        || !Array.isArray(itemPayload?.entries)
        || !mechanicsPayload?.entries
        || typeof mechanicsPayload.entries !== "object"
      ) {
        throw new Error("Team Builder data has an invalid format");
      }
      aniilog = aniimoPayload;
      itemlog = itemPayload;
      mechanics = mechanicsPayload;
      window.AniipediaI18n?.registerDisplay(aniilog.localizations);
      model.members.forEach(validateMember);
      loadError = "";
    }).catch((error) => {
      loadError = error instanceof Error ? error.message : String(error);
    }).finally(() => {
      loadPromise = null;
    });
    return loadPromise;
  }

  function setMode(mode) {
    model.mode = mode === "coop" ? "coop" : "standard";
    persist();
    render();
  }

  function renderModeSwitch(compact = false) {
    const group = el("div", compact ? "team-mode-switch team-mode-switch--compact" : "team-mode-switch");
    group.setAttribute("role", "tablist");
    [
      { id: "standard", label: "Standard" },
      { id: "coop", label: "Co-op" },
    ].forEach((mode) => {
      const control = button(mode.label, "team-mode-button", () => setMode(mode.id));
      control.setAttribute("aria-selected", String(model.mode === mode.id));
      control.setAttribute("role", "tab");
      group.append(control);
    });
    return group;
  }

  function slotRole(index) {
    if (model.mode !== "coop") return `${translate("Team slot")} ${index + 1}`;
    return index === 0 ? translate("Main Aniimo") : `${translate("Core skill ally")} ${index}`;
  }

  function starUpLevel(stageNumber) {
    return Math.max(0, Math.min(6, Math.round(Number(stageNumber) || 1) - 1));
  }

  function starUpLabel(stageNumber) {
    return `${translate("Star-Up")} +${starUpLevel(stageNumber)}`;
  }

  function renderSidebarSlot(member, index) {
    const entry = aniimoFor(member);
    const card = el("article", "team-sidebar-slot");
    if (model.activeSlot === index) card.classList.add("is-active");
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-pressed", String(model.activeSlot === index));
    const activate = () => {
      model.activeSlot = index;
      persist();
      render();
    };
    card.addEventListener("click", activate);
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      activate();
    });

    const header = el("div", "team-sidebar-slot-header");
    const role = el("span", "team-sidebar-slot-role", slotRole(index));
    const stage = el(
      "span",
      "team-sidebar-slot-stage",
      entry ? `${translate("Level")} ${member.level} · ${starUpLabel(member.stage)}` : "",
    );
    header.append(role, stage);

    const identity = el("div", "team-sidebar-slot-identity");
    if (entry?.icon) {
      const image = el("img", "team-sidebar-slot-icon");
      image.src = entry.icon;
      image.alt = "";
      identity.append(image);
    } else {
      identity.append(el("span", "team-sidebar-slot-icon team-sidebar-slot-icon--empty", String(index + 1)));
    }
    const copy = el("div", "team-sidebar-slot-copy");
    copy.append(
      el("strong", "", entry ? translate(entry.name) : translate("Empty slot")),
      el("small", "", entry ? translate(entry.form_label || "Basic") : translate("Choose an Aniimo below")),
    );
    identity.append(copy);

    const select = el("select", "team-sidebar-select");
    aniimoOptions().forEach((option) => {
      const item = document.createElement("option");
      item.value = option.value;
      item.textContent = option.label;
      item.selected = option.value === member.aniimoId;
      select.append(item);
    });
    select.setAttribute("aria-label", slotRole(index));
    select.addEventListener("click", (event) => event.stopPropagation());
    select.addEventListener("change", (event) => {
      event.stopPropagation();
      member.aniimoId = select.value;
      resetMemberLoadout(member, aniimoFor(member));
      model.activeSlot = index;
      persist();
      render();
    });
    card.append(header, identity, select);
    return card;
  }

  function renderLoadoutControls() {
    const section = el("section", "team-loadout-controls");
    const field = el("label", "team-loadout-field");
    field.append(el("span", "team-loadout-label", "Team loadout"));

    const selector = el("select", "team-select team-loadout-select");
    loadoutStore.loadouts.forEach((loadout) => {
      const option = document.createElement("option");
      option.value = loadout.id;
      option.textContent = loadout.name;
      option.selected = loadout.id === loadoutStore.activeId;
      selector.append(option);
    });
    const newOption = document.createElement("option");
    newOption.value = "__new__";
    newOption.textContent = "+ New team...";
    selector.append(newOption);
    selector.addEventListener("change", () => {
      if (selector.value === "__new__") {
        createNewLoadout();
        return;
      }
      switchLoadout(selector.value);
    });
    field.append(selector);

    const fileInput = el("input", "team-loadout-file-input");
    fileInput.type = "file";
    fileInput.accept = ".aniiteam,application/json,text/plain";
    fileInput.hidden = true;
    fileInput.addEventListener("change", async () => {
      const [file] = fileInput.files || [];
      fileInput.value = "";
      await importLoadoutFile(file);
    });

    const actions = el("div", "team-loadout-actions");
    actions.append(
      button("Rename", "team-loadout-action", renameActiveLoadout),
      button("Import", "team-loadout-action", () => fileInput.click()),
      button("Export", "team-loadout-action", exportActiveLoadout),
    );
    section.append(field, fileInput, actions);
    return section;
  }

  function renderSidebar() {
    sidebar.textContent = "";
    const heading = el("div", "team-sidebar-heading");
    heading.append(el("h2", "", "Team Builder"));
    const reset = button("Clear", "team-clear-button", () => {
      if (!window.confirm(translate("Clear this saved team?"))) return;
      model = defaultModel();
      persist();
      render();
    });
    heading.append(reset);
    sidebar.append(heading, renderLoadoutControls(), renderModeSwitch(true));
    const description = el(
      "p",
      "team-sidebar-description",
      model.mode === "coop"
        ? "Control one main Aniimo and bring the Core skills of three allies."
        : "Build a four-Aniimo team with two active skills and an optional Core switch-skill each.",
    );
    sidebar.append(description);
    const slots = el("div", "team-sidebar-slots");
    model.members.forEach((member, index) => slots.append(renderSidebarSlot(member, index)));
    const shareWrap = el("div", "team-share-wrap");
    const shareButton = button(shareBusy ? "Creating share link..." : "Share team", "team-share-button", shareTeam);
    shareButton.disabled = shareBusy;
    shareWrap.append(shareButton);
    if (shareStatus) shareWrap.append(el("p", "team-share-status", shareStatus));
    sidebar.append(slots, shareWrap);
  }

  function renderTeamOverview() {
    const section = el("section", "team-overview");
    const heading = el("div", "team-section-heading");
    heading.append(el("div", "", "Team overview"), el("small", "", model.mode === "coop" ? "1 main + 3 Core allies" : "Up to 4 Aniimo"));
    section.append(heading);
    const grid = el("div", "team-overview-grid");
    model.members.forEach((member, index) => {
      const entry = aniimoFor(member);
      const card = button("", "team-overview-card", () => {
        model.activeSlot = index;
        persist();
        render();
      });
      if (model.activeSlot === index) card.classList.add("is-active");
      if (entry?.icon) {
        const image = el("img", "team-overview-icon");
        image.src = entry.icon;
        image.alt = "";
        card.append(image);
      } else {
        card.append(el("span", "team-overview-icon team-overview-icon--empty", "+"));
      }
      const copy = el("span", "team-overview-copy");
      copy.append(
        el("small", "", slotRole(index)),
        el("strong", "", entry ? translate(entry.name) : translate("Empty slot")),
        el("span", "", entry ? translate(entry.form_label || "Basic") : translate("Select a team member")),
      );
      card.append(copy);
      grid.append(card);
    });
    section.append(grid);
    return section;
  }

  function renderSkillLoadout(member, entry, supportOnly) {
    const section = el("section", "team-config-section");
    const heading = el("div", "team-section-heading");
    heading.append(el("div", "", supportOnly ? "Co-op Core access" : "Skill loadout"));
    section.append(heading);
    const skills = combatSkills(entry);
    const cores = coreSkills(entry);

    if (supportOnly) {
      if (!cores.length) {
        section.append(el("p", "team-empty-copy", "This Aniimo has no Core skill in the current data."));
        return section;
      }
      cores.forEach((skill) => section.append(renderSkillSummary(skill, "Core skill", entry)));
      return section;
    }

    const grid = el("div", "team-field-grid");
    for (let position = 0; position < MAX_ACTIVE_SKILLS; position += 1) {
      const otherPosition = position === 0 ? 1 : 0;
      const options = [
        { value: "", label: "Choose a skill" },
        ...skills.map((skill) => ({
          value: skillKey(skill),
          label: `${skill.core ? `${translate("Core")} · ` : ""}${translate(skill.name)}`,
          disabled: member.activeSkills[otherPosition] === skillKey(skill),
        })),
      ];
      grid.append(selectControl(`${translate("Active skill")} ${position + 1}`, options, member.activeSkills[position], (value) => {
        member.activeSkills[position] = value;
        if (member.switchSkill === value) member.switchSkill = "";
        validateMember(member);
        persist();
        render();
      }));
    }
    const availableCore = cores.filter((skill) => !member.activeSkills.includes(skillKey(skill)));
    const switchOptions = [
      { value: "", label: cores.length ? "No switch-skill" : "No Core skill available" },
      ...availableCore.map((skill) => ({ value: skillKey(skill), label: translate(skill.name) })),
    ];
    grid.append(selectControl("Switch-skill (Core)", switchOptions, member.switchSkill, (value) => {
      member.switchSkill = value;
      validateMember(member);
      persist();
      render();
    }, "team-field--wide"));
    const ultimates = entry.ultimates || [];
    const ultimateOptions = [
      {
        value: "",
        label: ultimates.length ? "Choose an Ultimate" : "No Ultimate available",
      },
      ...ultimates.map((skill) => ({
        value: skillKey(skill),
        label: translate(skill.name),
      })),
    ];
    grid.append(selectControl("Ultimate", ultimateOptions, member.ultimateSkill, (value) => {
      member.ultimateSkill = value;
      validateMember(member);
      persist();
      render();
    }, "team-field--wide"));
    section.append(grid);

    const selected = [...member.activeSkills, member.switchSkill]
      .filter(Boolean)
      .map((key) => skillFor(entry, key))
      .filter(Boolean);
    if (selected.length) {
      const cards = el("div", "team-skill-cards");
      selected.forEach((skill) => cards.append(renderSkillSummary(
        skill,
        member.switchSkill === skillKey(skill) ? "Switch-skill" : "Active",
        entry,
      )));
      section.append(cards);
    }
    const ultimate = ultimateFor(entry, member.ultimateSkill);
    if (ultimate) {
      const cards = section.querySelector(".team-skill-cards") || el("div", "team-skill-cards");
      cards.append(renderSkillSummary(ultimate, "Ultimate", entry, "ultimates"));
      if (!cards.parentElement) section.append(cards);
    }
    return section;
  }

  function coefficientDisplay(coefficient) {
    const values = Array.isArray(coefficient?.values)
      ? coefficient.values.map(Number).filter(Number.isFinite)
      : [];
    if (!values.length) return "";
    const format = (value) => coefficient.display === "percent"
      ? formatValue(value, true)
      : `${formatValue(value, false)}x`;
    return [...new Set(values)].map(format).join(" / ");
  }

  function renderReviewedMechanics(entry, skill, mechanicsSection = "skills") {
    const reviewed = mechanicsFor(entry, skill, mechanicsSection);
    const section = el("div", "team-skill-mechanics");
    if (!reviewed) {
      section.append(el(
        "p",
        "team-skill-caveat",
        "No reviewed execution record is linked to this skill yet. The game description remains available below.",
      ));
      return section;
    }

    const tags = el("div", "team-skill-mechanics-tags");
    (reviewed.roles || []).forEach((role) => tags.append(el("span", "team-pill", role)));
    (reviewed.targets || []).forEach((target) => tags.append(el("span", "team-pill team-pill--scope", target)));
    if (tags.childElementCount) section.append(tags);

    const summaries = el("ul", "team-skill-mechanics-summary");
    (reviewed.summaries || []).forEach((summary) => summaries.append(el("li", "", summary)));
    if (summaries.childElementCount) section.append(summaries);

    if ((reviewed.operations || []).length) {
      const operations = el("div", "team-skill-operations");
      operations.append(el("strong", "", "Execution operations"));
      (reviewed.operations || []).forEach((operation) => {
        const counts = [...new Set(operation.counts || [])].join(" / ");
        operations.append(el(
          "span",
          "team-skill-operation",
          counts ? `${operation.label}: ${counts}` : operation.label,
        ));
      });
      section.append(operations);
    }

    if ((reviewed.coefficients || []).length) {
      const coefficients = el("dl", "team-skill-coefficients");
      (reviewed.coefficients || []).forEach((coefficient) => {
        const value = coefficientDisplay(coefficient);
        if (!value) return;
        coefficients.append(el("dt", "", coefficient.label), el("dd", "", value));
      });
      if (coefficients.childElementCount) section.append(coefficients);
    }

    if (Number(reviewed.variant_count) > 1) {
      section.append(el(
        "p",
        "team-skill-variant-note",
        `${reviewed.variant_count} execution variants are linked to this display skill. Values above include every confirmed variant.`,
      ));
    }
    return section;
  }

  function renderSkillSummary(skill, slotLabel, entry, mechanicsSection = "skills") {
    const card = el("article", "team-skill-summary");
    if (skill?.icon) {
      const icon = el("img", "team-skill-icon");
      icon.src = skill.icon;
      icon.alt = "";
      card.append(icon);
    }
    const copy = el("div", "team-skill-copy");
    const top = el("div", "team-skill-top");
    top.append(el("strong", "", translate(skill?.name || "Skill")), el("span", "team-pill", slotLabel));
    copy.append(top);
    const meta = [
      Number.isFinite(Number(skill?.combat?.might)) ? `${translate("Might")} ${skill.combat.might}` : "",
      Number.isFinite(Number(skill?.combat?.ep_cost)) ? `${translate("EP Cost")} ${skill.combat.ep_cost}` : "",
      Number.isFinite(Number(skill?.combat?.cooldown)) ? `${translate("Cooldown")} ${skill.combat.cooldown}s` : "",
    ].filter(Boolean).join(" · ");
    copy.append(el("small", "", meta));
    if (skill?.behavior?.team_role) {
      const scope = Array.isArray(skill.behavior.target_scope)
        ? skill.behavior.target_scope.join(" + ")
        : "";
      copy.append(el(
        "small",
        "team-skill-behavior",
        [skill.behavior.team_role, scope].filter(Boolean).join(" · "),
      ));
    }
    copy.append(renderReviewedMechanics(entry, skill, mechanicsSection));
    if (skill?.description) {
      const description = el("details", "team-skill-description");
      description.append(
        el("summary", "", "Game description"),
        el("p", "", translate(skill.description)),
      );
      copy.append(description);
    }
    card.append(copy);
    return card;
  }

  function renderMemberIdentity(member, entry, index) {
    const section = el("section", "team-member-identity");
    if (entry?.icon) {
      const image = el("img", "team-member-icon");
      image.src = entry.icon;
      image.alt = "";
      section.append(image);
    }
    const copy = el("div", "team-member-copy");
    copy.append(
      el("p", "team-eyebrow", slotRole(index)),
      el("h2", "", translate(entry.name)),
      el("p", "team-member-meta", `${translate(entry.form_label || "Basic")} · ${translate(entry.role || "Other")}`),
    );
    section.append(copy);
    const controls = el("div", "team-progression-fields");
    const levelOptions = Array.from({ length: MAX_ANIIMO_LEVEL }, (_, offset) => ({
      value: String(offset + MIN_ANIIMO_LEVEL),
      label: `${translate("Level")} ${offset + MIN_ANIIMO_LEVEL}`,
    }));
    controls.append(selectControl(translate("Aniimo level"), levelOptions, String(member.level), (value) => {
      member.level = Number(value);
      member.stage = Math.min(member.stage, maxStageForLevel(member.level));
      persist();
      render();
    }, "team-level-field"));
    const maxStage = maxStageForLevel(member.level);
    const stageOptions = progressionStages()
      .filter((stage) => Number(stage.stage) <= maxStage)
      .map((stage) => ({
        value: String(stage.stage),
        label: stage.level_gate
          ? `${starUpLabel(stage.stage)} · ${translate("Level")} ${stage.level_gate}`
          : starUpLabel(stage.stage),
      }));
    controls.append(selectControl(translate("Resonance Star-Up"), stageOptions, String(member.stage), (value) => {
      member.stage = Number(value);
      persist();
      render();
    }, "team-stage-field"));
    section.append(controls);
    return section;
  }

  function renderProgressionConfiguration(member) {
    const section = el("section", "team-config-section team-progression-config");
    const heading = el("div", "team-section-heading");
    heading.append(
      el("div", "", "Potential & personality"),
      el("small", "", "Enter base values from 0–20; totals include automatic bonuses"),
    );
    section.append(heading);

    const entry = aniimoFor(member);
    const progression = progressionForStage(member.stage);
    const carried = carriedItemFor(member);
    const potentialBonuses = potentialBonusBreakdown(member, progression.bonuses, carried);
    const potentialGrid = el("div", "team-potential-grid");
    POTENTIAL_STATS.forEach((stat) => {
      const control = numberControl(
        stat.label,
        member.potentials?.[stat.key] || 0,
        0,
        MAX_POTENTIAL_PER_STAT,
        (value) => {
          member.potentials[stat.key] = value;
          persist();
          render();
        },
        "team-potential-field",
      );
      const caption = control.querySelector(".team-field-label");
      caption?.append(el(
        "span",
        "team-potential-result",
        `Total ${formatValue(effectivePotentialValue(member, stat.key, potentialBonuses), false)}`,
      ));
      potentialGrid.append(control);
    });
    section.append(potentialGrid);

    const automatic = el("div", "team-derived-potential");
    const maximumBasePotential = Number(
      mechanics?.stat_projection?.maximum_base_potential || MAX_POTENTIAL_PER_STAT,
    );
    const maximumExtraPotential = Number(
      mechanics?.stat_projection?.maximum_extra_potential || 10,
    );
    const maximumEffectivePotential = Number(
      mechanics?.stat_projection?.maximum_effective_potential || 32,
    );
    const automaticHeading = el("div", "team-derived-potential-heading");
    automaticHeading.append(
      el("strong", "", "Automatic Potential bonuses"),
      el("span", "team-derived-potential-total", `+${formatValue(potentialBonuses.all, false)} to all`),
    );
    automatic.append(automaticHeading);
    const automaticSources = el("div", "team-derived-potential-sources");
    automaticSources.append(
      el(
        "span",
        "team-pill team-pill--stat",
        `${starUpLabel(member.stage)}: +${formatValue(potentialBonuses.starUp, false)} to all`,
      ),
      el(
        "span",
        "team-pill team-pill--stat",
        `Rune rolls: +${formatValue(potentialBonuses.runes, false)} / ${MAX_RUNE_POTENTIAL_BONUS} to all`,
      ),
    );
    const carriedEntries = Object.entries(potentialBonuses.carriedStats);
    if (carried && carriedEntries.length) {
      carriedEntries.forEach(([stat, value]) => {
        const label = POTENTIAL_STATS.find((candidate) => candidate.key === stat)?.label || stat;
        automaticSources.append(el(
          "span",
          "team-pill",
          `${translate(carried.name)} +${member.carriedItemLevel}: ${label} +${formatValue(value, false)}`,
        ));
      });
    }
    automatic.append(
      automaticSources,
      el(
        "small",
        "team-derived-potential-note",
        `Star-Up and selected Six Aptitude Stats rune rolls apply to every Potential; unlocked carried-item bonuses apply only to the listed Potential. A base ${maximumBasePotential} plus current selectable bonuses reaches ${maximumBasePotential + maximumExtraPotential}; the client formula has a hard ceiling of ${maximumEffectivePotential}.`,
      ),
    );
    section.append(automatic);

    const collectionDefinition = formCollectionDefinition(entry);
    const collectionMaximum = maximumFormCollectionLevel(entry);
    if (collectionMaximum) {
      const collectionBonus = formCollectionBonus(member, entry);
      const collectionOptions = Array.from({ length: collectionMaximum + 1 }, (_, level) => ({
        value: String(level),
        label: level
          ? `${level} collected alternate ${level === 1 ? "form" : "forms"}`
          : "No alternate forms collected",
      }));
      const collectionControl = selectControl(
        "Form collection",
        collectionOptions,
        String(Math.min(collectionMaximum, member.formCollectionLevel || 0)),
        (value) => {
          member.formCollectionLevel = Number(value);
          persist();
          render();
        },
        "team-form-collection-field",
      );
      const caption = collectionControl.querySelector(".team-field-label");
      caption?.append(el(
        "span",
        "team-potential-result",
        collectionBonus.stat
          ? `${compactStatLabel(collectionBonus.stat)} +${formatValue(collectionBonus.percent, true)}`
          : "No bonus",
      ));
      section.append(collectionControl);
    }
    if (collectionDefinition?.higher_level_unverified) {
      section.append(el(
        "p",
        "team-derived-potential-note",
        collectionMaximum
          ? "A higher form-collection level exists, but its bonus is not verified."
          : "This family has alternate forms, but its form-collection bonus is not verified.",
      ));
    }

    const personalityHeading = el("div", "team-subsection-heading");
    personalityHeading.append(
      el("strong", "", "Personality combat bonuses"),
      el("small", "", `${member.personalities.length} / ${PERSONALITY_PAIRS.length} pairs selected`),
    );
    section.append(personalityHeading);
    const personalityGrid = el("div", "team-personality-grid");
    PERSONALITY_OPTIONS.forEach((option) => {
      const selected = member.personalities.includes(option.id);
      const choice = el("label", "team-personality-option");
      if (selected) choice.classList.add("is-selected");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = selected;
      input.addEventListener("change", () => {
        if (input.checked) {
          member.personalities = [
            ...member.personalities.filter((trait) => personalityFor(trait)?.pair !== option.pair),
            option.id,
          ];
        } else {
          member.personalities = member.personalities.filter((trait) => trait !== option.id);
        }
        persist();
        render();
      });
      const effects = option.effects.map((effect) => (
        `${translate(effect.label)} +${formatValue(effect.value, true)}`
      )).join(", ");
      const copy = el("span", "team-personality-copy");
      copy.append(el("strong", "", `${option.code} · ${option.label}`), el("small", "", effects));
      choice.append(input, copy);
      personalityGrid.append(choice);
    });
    section.append(personalityGrid);
    return section;
  }

  function renderEquipment(member) {
    const section = el("section", "team-config-section");
    const heading = el("div", "team-section-heading");
    heading.append(el("div", "", "Carried item & runes"));
    section.append(heading);
    const options = [
      { value: "", label: "No carried item" },
      ...carriedItems().map((entry) => ({
        value: entry.id,
        label: `${translate(entry.name)} · ${translate(entry.quality || "")}`,
      })),
    ];
    section.append(selectControl("Carried item", options, member.carriedItemId, (value) => {
      member.carriedItemId = value;
      member.carriedItemLevel = MAX_CARRIED_ITEM_LEVEL;
      member.runes = {};
      persist();
      render();
    }));
    const item = carriedItemFor(member);
    if (!item) return section;

    const carriedLevelOptions = Array.from({ length: MAX_CARRIED_ITEM_LEVEL + 1 }, (_, level) => ({
      value: String(level),
      label: `+${level}`,
    }));
    section.append(selectControl(
      "Carried item enhancement",
      carriedLevelOptions,
      String(member.carriedItemLevel),
      (value) => {
        member.carriedItemLevel = Number(value);
        persist();
        render();
      },
      "team-carried-level-field",
    ));

    const effects = el("div", "team-equipment-effects");
    (item.carried_effects?.base_attributes || []).forEach((effect) => effects.append(el("span", "team-pill team-pill--stat", effect)));
    (item.carried_effects?.core_effects || []).forEach((effect) => effects.append(el("span", "team-pill", `${translate("Core")}: ${translate(effect)}`)));
    (item.carried_effects?.advanced_effects || []).forEach((group) => {
      const unlocked = Number(member.carriedItemLevel || 0) >= Number(group?.unlock_level || 0);
      (group?.effects || []).forEach((effect) => {
        effects.append(el(
          "span",
          `team-pill${unlocked ? "" : " is-locked"}`,
          `${translate("Advanced")} +${group.unlock_level}: ${translate(effect)}${unlocked ? "" : " (locked)"}`,
        ));
      });
    });
    if (effects.childElementCount) section.append(effects);

    const sockets = el("div", "team-rune-sockets");
    const availableSlots = (item.rune_socket_layout?.slots || []).filter((slot) => slot.available_at_this_rarity);
    availableSlots.forEach((slot) => sockets.append(renderRuneSocket(member, slot)));
    if (availableSlots.length) section.append(sockets);
    return section;
  }

  function renderRuneSocket(member, slot) {
    const card = el("article", "team-rune-socket");
    const shapes = new Set((slot.options || []).map((option) => option.id));
    const compatible = runeItems().filter((entry) => shapes.has(entry?.rune_details?.shape?.id));
    const selection = member.runes[String(slot.position)] || { itemId: "", rolls: [] };
    const header = el("div", "team-rune-socket-header");
    header.append(
      el("strong", "", `${translate("Slot")} ${slot.position}`),
      el("span", "team-pill", (slot.options || []).map((option) => `${translate(option.label)} · ${translate(option.role)}`).join(" / ")),
    );
    card.append(header);
    const runeSelect = el("select", "team-select");
    [{ value: "", label: "No rune" }, ...compatible.map((entry) => ({
      value: entry.id,
      label: `${translate(entry.name)} · ${translate(entry.quality)}`,
    }))].forEach((option) => {
      const item = document.createElement("option");
      item.value = option.value;
      item.textContent = option.label;
      item.selected = option.value === selection.itemId;
      runeSelect.append(item);
    });
    runeSelect.addEventListener("change", () => {
      member.runes[String(slot.position)] = { itemId: runeSelect.value, rolls: [] };
      persist();
      render();
    });
    card.append(runeSelect);
    const rune = compatible.find((entry) => entry.id === selection.itemId);
    if (!rune) return card;
    const main = (rune.rune_details?.main_stats || []).map((stat) => `${translate(stat.label)} +${stat.value_label}`).join(" · ");
    card.append(el("p", "team-rune-main", `${translate("Main stat")}: ${main}`));

    const lineCount = Number(rune.rune_details?.secondary_lines || 0);
    for (let index = 0; index < lineCount; index += 1) {
      const current = selection.rolls?.[index] || { attributeId: "", mode: "perfect" };
      const row = el("div", "team-rune-roll-row");
      const rollSelect = el("select", "team-select");
      const used = new Set((selection.rolls || []).filter((_, rollIndex) => rollIndex !== index).map((roll) => String(roll.attributeId)));
      [{ attribute_id: "", label: "No secondary roll", range_label: "" }, ...(rune.rune_details?.secondary_rolls || [])]
        .forEach((roll) => {
          const option = document.createElement("option");
          option.value = String(roll.attribute_id || "");
          option.textContent = roll.attribute_id ? `${translate(roll.label)} · ${roll.range_label}` : roll.label;
          option.disabled = used.has(option.value);
          option.selected = option.value === String(current.attributeId || "");
          rollSelect.append(option);
        });
      rollSelect.setAttribute("aria-label", `${translate("Secondary roll")} ${index + 1}`);
      rollSelect.addEventListener("change", () => {
        selection.rolls ||= [];
        selection.rolls[index] = { attributeId: rollSelect.value, mode: current.mode || "perfect" };
        member.runes[String(slot.position)] = selection;
        persist();
        render();
      });
      const valueMode = el("select", "team-select team-roll-mode");
      [
        { value: "minimum", label: "Minimum" },
        { value: "perfect", label: "Perfect" },
      ].forEach((mode) => {
        const option = document.createElement("option");
        option.value = mode.value;
        option.textContent = mode.label;
        option.selected = mode.value === current.mode;
        valueMode.append(option);
      });
      valueMode.disabled = !current.attributeId;
      valueMode.addEventListener("change", () => {
        selection.rolls ||= [];
        selection.rolls[index] = { attributeId: current.attributeId, mode: valueMode.value };
        member.runes[String(slot.position)] = selection;
        persist();
        render();
      });
      row.append(rollSelect, valueMode);
      card.append(row);
    }
    return card;
  }

  function progressionStages() {
    return Array.isArray(aniilog?.aniimo_progression?.stages)
      ? aniilog.aniimo_progression.stages
      : [];
  }

  function maxStageForLevel(level) {
    const aniimoLevel = Math.min(MAX_ANIIMO_LEVEL, Math.max(MIN_ANIIMO_LEVEL, Number(level) || MAX_ANIIMO_LEVEL));
    return progressionStages().reduce((maximum, stage) => {
      const gate = Number(stage.level_gate || MIN_ANIIMO_LEVEL);
      return gate <= aniimoLevel ? Math.max(maximum, Number(stage.stage) || 1) : maximum;
    }, 1);
  }

  function progressionForStage(stageNumber) {
    const stages = progressionStages();
    const eligible = stages.filter((stage) => Number(stage.stage) <= stageNumber);
    return {
      trainingSteps: eligible.flatMap((stage) => (
        Array.isArray(stage.training_steps) ? stage.training_steps : []
      )),
      bonuses: eligible.map((stage) => stage.stage_bonus).filter(Boolean),
    };
  }

  function addFlat(target, label, value, source) {
    const stat = STAT_ALIASES[label];
    const number = Number(value);
    if (!stat || !Number.isFinite(number)) return false;
    target.flat[stat] = (target.flat[stat] || 0) + number;
    target.sources.push({ stat, value: number, source, layer: "flat" });
    return true;
  }

  function addPostFlat(target, label, value, source) {
    const stat = STAT_ALIASES[label];
    const number = Number(value);
    if (!stat || !Number.isFinite(number)) return false;
    target.postFlat[stat] = (target.postFlat[stat] || 0) + number;
    target.sources.push({ stat, value: number, source, layer: "post-flat" });
    return true;
  }

  function addModifier(target, label, value, isPercent, source) {
    const number = Number(value);
    if (!Number.isFinite(number)) return;
    if (!isPercent && addFlat(target, label, value, source)) return;
    const stat = STAT_ALIASES[label];
    if (isPercent && stat) {
      target.percent[stat] = (target.percent[stat] || 0) + number;
      target.sources.push({ stat, value: number, source, layer: "percent" });
      return;
    }
    const key = String(label || "Modifier");
    target.advanced[key] = (target.advanced[key] || 0) + number;
  }

  function projectLevelStat(label, listedValue, level, effectivePotential = 0) {
    const curve = LEVEL_STAT_CURVES[label];
    const rating = Number(listedValue);
    const aniimoLevel = Number(level);
    if (!curve || !Number.isFinite(rating) || !Number.isFinite(aniimoLevel)) return rating || 0;
    const levelTerm = (4 * aniimoLevel) + 35;
    const coefficient = Number(
      mechanics?.stat_projection?.individual_point_coefficient
      ?? INDIVIDUAL_POINT_COEFFICIENT,
    );
    const individualMultiplier = 1 + (Number(effectivePotential) || 0) * coefficient;
    return Math.floor(
      ((rating + curve.offset) * individualMultiplier / curve.divisor)
      * levelTerm
      * curve.scale,
    );
  }

  function addLevelBasedCarriedEffects(result, member, carried) {
    (carried?.carried_effects?.core_effects || []).forEach((effect) => {
      const match = String(effect).match(/additional\s+(\d+(?:\.\d+)?)\s+(.+?)\s+for each\s+Level\b/i);
      if (!match) return;
      addPostFlat(result, match[2].trim(), Number(match[1]) * member.level, `${translate(carried.name)} · ${translate("Level scaling")}`);
    });
  }

  function stagePotentialBonuses(bonuses) {
    const totals = Object.fromEntries(POTENTIAL_STATS.map((stat) => [stat.key, 0]));
    const groups = [
      { pattern: /^ATK\/BREAK\/HP\s*\+([0-9.]+)$/i, stats: ["Attack", "Break", "HP"] },
      { pattern: /^REGEN\/P\.?DEF\/M\.?DEF\s*\+([0-9.]+)$/i, stats: ["EP Regen", "Defense", "Magic Defense"] },
    ];
    bonuses.forEach((bonus) => {
      const text = String(bonus);
      const allMatch = text.match(/^Six Potentials\s*\+([0-9.]+)$/i);
      if (allMatch) {
        POTENTIAL_STATS.forEach((stat) => {
          totals[stat.key] = Math.max(totals[stat.key], Number(allMatch[1]) || 0);
        });
        return;
      }
      for (const group of groups) {
        const match = text.match(group.pattern);
        if (!match) continue;
        group.stats.forEach((stat) => {
          totals[stat] = Math.max(totals[stat], Number(match[1]) || 0);
        });
        break;
      }
    });
    return totals;
  }

  function runePotentialBonus(member) {
    const total = Object.values(member.runes || {}).reduce((sum, selection) => {
      const rune = runeItems().find((entry) => entry.id === selection?.itemId);
      if (!rune) return sum;
      return sum + (selection.rolls || []).reduce((rollSum, chosen) => {
        const roll = (rune.rune_details?.secondary_rolls || [])
          .find((candidate) => String(candidate.attribute_id) === String(chosen.attributeId));
        if (roll?.label !== "Six Aptitude Stats") return rollSum;
        const value = chosen.mode === "minimum" ? roll.minimum : roll.maximum;
        return rollSum + (Number(value) || 0);
      }, 0);
    }, 0);
    return Math.min(MAX_RUNE_POTENTIAL_BONUS, total);
  }

  function carriedPotentialBonuses(member, carried) {
    const bonuses = {};
    const potentialKeys = new Set(POTENTIAL_STATS.map((stat) => stat.key));
    const add = (label, value) => {
      const stat = STAT_ALIASES[label];
      const amount = Number(value);
      if (!potentialKeys.has(stat) || !Number.isFinite(amount)) return;
      bonuses[stat] = (bonuses[stat] || 0) + amount;
    };
    (carried?.carried_effects?.advanced_effects || []).forEach((group) => {
      if (Number(group?.unlock_level || 0) > Number(member.carriedItemLevel || 0)) return;
      (group?.effects || []).forEach((effect) => {
        const text = String(effect || "").trim();
        const exact = text.match(/^(ATK|BREAK|HP|REGEN)\s*\+([0-9.]+)$/i);
        if (exact) {
          add(exact[1].toUpperCase(), exact[2]);
          return;
        }
        const explicit = /(ATK|BREAK|HP|REGEN|M\.?DEF|P\.?DEF)\s+Acquired Potential\s*\+([0-9.]+)/gi;
        for (const match of text.matchAll(explicit)) add(match[1].toUpperCase(), match[2]);
      });
    });
    return bonuses;
  }

  function potentialBonusBreakdown(member, bonuses, carried) {
    const starUpStats = stagePotentialBonuses(bonuses);
    const runes = runePotentialBonus(member);
    const carriedStats = carriedPotentialBonuses(member, carried);
    const starUpValues = [...new Set(Object.values(starUpStats))];
    return {
      starUp: starUpValues.length === 1 ? starUpValues[0] : 0,
      starUpStats,
      runes,
      all: starUpValues.length === 1 ? starUpValues[0] + runes : runes,
      carriedStats,
    };
  }

  function effectivePotentialValue(member, statKey, potentialBonuses) {
    const total = Number(member.potentials?.[statKey] || 0)
      + Number(potentialBonuses.starUpStats?.[statKey] || 0)
      + Number(potentialBonuses.runes || 0)
      + Number(potentialBonuses.carriedStats?.[statKey] || 0);
    const maximum = Number(
      mechanics?.stat_projection?.maximum_effective_potential || 32,
    );
    return Math.min(maximum, Math.max(0, total));
  }

  function applyStarUpBonuses(result, bonuses) {
    const groups = [
      { pattern: /^ATK\/BREAK\/HP\s*\+([0-9.]+)(%)?$/i, stats: ["Attack", "Break", "HP"] },
      { pattern: /^REGEN\/P\.?DEF\/M\.?DEF\s*\+([0-9.]+)(%)?$/i, stats: ["EP Regen", "Defense", "Magic Defense"] },
    ];
    bonuses.forEach((bonus) => {
      if (/^Six Potentials\s*\+/i.test(String(bonus))) return;
      for (const group of groups) {
        const match = String(bonus).match(group.pattern);
        if (!match) continue;
        if (!match[2]) break;
        const isPercent = Boolean(match[2]);
        const value = Number(match[1]) / (isPercent ? 100 : 1);
        group.stats.forEach((stat) => addModifier(result, stat, value, isPercent, "Star-Up bonus"));
        break;
      }
    });
  }

  function applyPotentialBonuses(result, member, carried) {
    POTENTIAL_STATS.forEach((stat) => {
      const effective = effectivePotentialValue(member, stat.key, result.potentialBonuses);
      result.effectivePotentials[stat.key] = effective;
      const stepSize = Number(
        mechanics?.stat_projection?.potential_step_size
        ?? POTENTIAL_MILESTONE_SIZE,
      );
      const stepPercent = Number(
        mechanics?.stat_projection?.potential_step_percent
        ?? POTENTIAL_MILESTONE_BONUS,
      );
      const percent = Math.floor(effective / stepSize) * stepPercent;
      if (percent) addModifier(result, stat.key, percent, true, "Potential");
    });
  }

  function applyPersonalityBonuses(result, member) {
    (member.personalities || []).forEach((id) => {
      const option = PERSONALITY_OPTIONS.find((candidate) => candidate.id === id);
      option?.effects.forEach((effect) => {
        if (effect.cardStat === false) {
          const key = String(effect.advancedLabel || effect.label || "Modifier");
          result.advanced[key] = (result.advanced[key] || 0) + Number(effect.value || 0);
          return;
        }
        addModifier(result, effect.label, effect.value, true, `Personality: ${option.label}`);
      });
    });
  }

  function applyFormCollectionBonus(result, member, entry) {
    const bonus = formCollectionBonus(member, entry);
    if (bonus.stat && bonus.percent) {
      addModifier(result, bonus.stat, bonus.percent, true, "Form collection");
    }
  }

  function memberStats(member, entry) {
    const result = {
      listed: {},
      base: {},
      flat: {},
      postFlat: {},
      percent: {},
      advanced: {},
      effectivePotentials: {},
      potentialBonuses: {
        starUp: 0,
        starUpStats: Object.fromEntries(POTENTIAL_STATS.map((stat) => [stat.key, 0])),
        runes: 0,
        all: 0,
        carriedStats: {},
      },
      sources: [],
      bonuses: [],
    };
    const progression = progressionForStage(member.stage);
    const carried = carriedItemFor(member);
    result.bonuses = progression.bonuses;
    result.potentialBonuses = potentialBonusBreakdown(member, result.bonuses, carried);
    const projectedSpecies = statProjectionFor(entry)?.species || {};
    (entry?.stats || []).forEach((stat) => {
      result.listed[stat.label] = Number(stat.value || 0);
      const potentialKey = stat.label === "Magic Attack" ? "Attack" : stat.label;
      const effectivePotential = effectivePotentialValue(
        member,
        potentialKey,
        result.potentialBonuses,
      );
      const speciesValue = Number(projectedSpecies[stat.label] ?? stat.value ?? 0);
      result.base[stat.label] = projectLevelStat(
        stat.label,
        speciesValue,
        member.level,
        effectivePotential,
      );
    });
    progression.trainingSteps.forEach((step) => {
      (step.stat_gains || []).forEach((gain) => addFlat(result, gain.label, gain.value, `${translate("Training level")} ${step.level}`));
    });
    applyStarUpBonuses(result, result.bonuses);

    (carried?.carried_effects?.base_attributes || []).forEach((effect) => {
      const match = String(effect).match(/^(.+?)\s*([+-]\d+(?:\.\d+)?)(%)?$/);
      if (!match) return;
      addModifier(result, match[1].trim(), Number(match[2]) / (match[3] ? 100 : 1), Boolean(match[3]), translate(carried.name));
    });
    addLevelBasedCarriedEffects(result, member, carried);
    Object.values(member.runes || {}).forEach((selection) => {
      const rune = runeItems().find((entry) => entry.id === selection?.itemId);
      if (!rune) return;
      (rune.rune_details?.main_stats || []).forEach((stat) => {
        addModifier(result, stat.label, stat.value, stat.is_percent, translate(rune.name));
      });
      (selection.rolls || []).forEach((chosen) => {
        const roll = (rune.rune_details?.secondary_rolls || [])
          .find((candidate) => String(candidate.attribute_id) === String(chosen.attributeId));
        if (!roll) return;
        const value = chosen.mode === "minimum" ? roll.minimum : roll.maximum;
        if (roll.label === "Six Aptitude Stats") return;
        addModifier(result, roll.label, value, roll.is_percent, `${translate(rune.name)} · ${translate("Secondary roll")}`);
      });
    });
    applyPotentialBonuses(result, member, carried);
    applyFormCollectionBonus(result, member, entry);
    applyPersonalityBonuses(result, member);
    return result;
  }

  function projectedStatTotal(stats, label) {
    const base = Number(stats.base[label] || 0);
    const added = Number(stats.flat[label] || 0);
    const percent = Number(stats.percent[label] || 0);
    const post = Number(stats.postFlat[label] || 0);
    return Math.floor((base + added) * (1 + percent) + post);
  }

  function verifiedAccountStatRanges(member, entry) {
    const maximum = maximumFormCollectionLevel(entry);
    const levels = Array.from({ length: maximum + 1 }, (_, level) => level);
    const totals = levels.map((formCollectionLevel) => memberStats(
      { ...member, formCollectionLevel },
      entry,
    ));
    return Object.fromEntries(STAT_ORDER.map((label) => {
      const values = totals
        .filter((stats) => Object.hasOwn(stats.base, label))
        .map((stats) => projectedStatTotal(stats, label));
      return [label, {
        minimum: values.length ? Math.min(...values) : 0,
        maximum: values.length ? Math.max(...values) : 0,
        collectionMaximum: maximum,
      }];
    }));
  }

  function renderStats(member, entry) {
    const section = el("section", "team-config-section team-stats-section");
    const heading = el("div", "team-section-heading");
    heading.append(
      el("div", "", translate("Projected build stats")),
      el("small", "", `${translate("Level")} ${member.level} · ${starUpLabel(member.stage)}`),
    );
    section.append(heading);
    const stats = memberStats(member, entry);
    const accountRanges = verifiedAccountStatRanges(member, entry);
    const grid = el("div", "team-stat-grid");
    STAT_ORDER.forEach((label) => {
      if (!Object.hasOwn(stats.base, label)) return;
      const base = Number(stats.base[label] || 0);
      const added = Number(stats.flat[label] || 0);
      const percent = Number(stats.percent[label] || 0);
      const post = Number(stats.postFlat[label] || 0);
      const total = projectedStatTotal(stats, label);
      const accountRange = accountRanges[label];
      const breakdown = [
        formatValue(base, false),
        added ? `+ ${formatValue(added, false)}` : "",
        percent ? `× ${formatValue(1 + percent, false)}` : "",
        post ? `+ ${formatValue(post, false)}` : "",
      ].filter(Boolean).join(" ");
      const card = el("article", "team-stat-card");
      card.append(
        el("span", "team-stat-label", translate(label === "EP Regen" ? "Regen" : label)),
        el("strong", "", formatValue(total, false)),
        el("small", "", added || percent || post ? breakdown : translate("Base value")),
      );
      if (accountRange?.collectionMaximum && accountRange.minimum !== accountRange.maximum) {
        card.append(el(
          "small",
          "team-stat-range",
          `Verified account range ${formatValue(accountRange.minimum, false)}-${formatValue(accountRange.maximum, false)}`,
        ));
      }
      grid.append(card);
    });
    section.append(grid);
    if (Object.keys(stats.percent).length) {
      const modifiers = el("div", "team-modifier-list");
      Object.entries(stats.percent).forEach(([label, value]) => {
        modifiers.append(el("span", "team-pill team-pill--stat", `${translate(label)} +${formatValue(value, true)}`));
      });
      section.append(modifiers);
    }
    if (Object.keys(stats.advanced).length) {
      const modifiers = el("div", "team-modifier-list");
      Object.entries(stats.advanced).forEach(([label, value]) => {
        modifiers.append(el(
          "span",
          "team-pill",
          `${translate(label)} +${formatValue(value, true)} · combat only`,
        ));
      });
      section.append(modifiers);
    }
    const displayedBonuses = stats.bonuses.filter((bonus) => {
      const text = String(bonus);
      if (/^Six Potentials\s*\+/i.test(text)) return false;
      if (/^(?:ATK\/BREAK\/HP|REGEN\/P\.?DEF\/M\.?DEF)\s*\+[0-9.]+$/i.test(text)) return false;
      return true;
    });
    if (displayedBonuses.length) {
      const bonuses = el("div", "team-stage-bonuses");
      bonuses.append(el("strong", "", "Star-Up bonuses"));
      displayedBonuses.forEach((bonus) => bonuses.append(el("span", "team-pill", bonus)));
      section.append(bonuses);
    }
    const potentials = el("div", "team-potential-summary");
    potentials.append(el("strong", "", "Effective Potentials"));
    POTENTIAL_STATS.forEach((stat) => {
      potentials.append(el(
        "span",
        "team-pill",
        `${stat.label} ${formatValue(stats.effectivePotentials[stat.key], false)}`,
      ));
    });
    section.append(potentials);
    section.append(el(
      "p",
      "team-data-note",
      translate("The large value uses the selected per-Aniimo inputs. A verified account range, where shown, spans zero through the highest confirmed Aniimo Forms collection bonus for that family. Temporary or server-synchronized modifiers have no locally proven cap and are not guessed. Totals use the verified layer order and final card flooring; combat-only effects remain separate."),
    ));
    return section;
  }

  function formatValue(value, percent) {
    const number = Number(value || 0);
    const display = Number.isInteger(number) ? String(number) : number.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
    return percent ? `${(number * 100).toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}%` : display;
  }

  function effectCandidates() {
    const effects = [];
    model.members.forEach((member, index) => {
      const entry = aniimoFor(member);
      if (!entry) return;
      const append = (kind, name, description, activation, behavior = null) => {
        if (!description) return;
        const support = behavior?.main_dps_support || "";
        const appliesToSelectedDps = support === "yes"
          || support === "conditional"
          || (support === "self_only" && index === model.activeSlot);
        if (behavior && !appliesToSelectedDps) return;
        if (!behavior && !BUFF_PATTERN.test(description)) return;
        const id = `${index}:${kind}:${name}`;
        effects.push({
          id,
          slot: index,
          source: translate(entry.name),
          kind,
          name: translate(name),
          description: translate(description),
          activation: behavior?.activation || activation,
          teamRole: behavior?.team_role || "Conditional effect",
          supportNote: behavior?.main_dps_note || "Apply only when the listed effect is active.",
          verification: behavior?.verification_label || "Listed item effect",
        });
      };
      (entry.traits || []).forEach((trait) => append("Trait", trait.name, trait.description, "Passive", trait.behavior));
      if (model.mode === "coop" && index > 0) {
        coreSkills(entry).forEach((skill) => append("Core skill", skill.name, skill.description, "Active", skill.behavior));
      } else {
        [...member.activeSkills, member.switchSkill]
          .filter(Boolean)
          .map((key) => skillFor(entry, key))
          .filter(Boolean)
          .forEach((skill) => append(
            skill.core ? "Core skill" : "Skill",
            skill.name,
            skill.description,
            "Active",
            skill.behavior,
          ));
        const ultimate = ultimateFor(entry, member.ultimateSkill);
        if (ultimate) {
          append(
            "Ultimate",
            ultimate.name,
            ultimate.description,
            "Active",
            ultimate.behavior,
          );
        }
      }
      const carried = carriedItemFor(member);
      (carried?.carried_effects?.core_effects || []).forEach((description, effectIndex) => append("Carried item", carried.name, description, `Core effect ${effectIndex + 1}`));
      (carried?.carried_effects?.advanced_effects || [])
        .filter((group) => Number(member.carriedItemLevel || 0) >= Number(group?.unlock_level || 0))
        .forEach((group) => {
          (group?.effects || []).forEach((description, effectIndex) => append(
            "Carried item",
            carried.name,
            description,
            `Advanced +${group.unlock_level} effect ${effectIndex + 1}`,
          ));
        });
    });
    return effects;
  }

  function renderScenario() {
    const section = el("section", "team-scenario");
    const heading = el("div", "team-section-heading");
    const effects = effectCandidates();
    const enabledCount = effects.filter((effect) => model.scenarioToggles[effect.id]).length;
    heading.append(el("div", "", "Team synergy scenario"), el("small", "", `${enabledCount} active`));
    section.append(heading);
    section.append(el(
      "p",
      "team-section-copy",
      "Toggle the buffs and conditional effects that apply to the situation you want to model.",
    ));
    if (!effects.length) {
      section.append(el("p", "team-empty-copy", "Choose team members and skills to reveal supported synergy effects."));
    } else {
      const list = el("div", "team-synergy-list");
      effects.forEach((effect) => {
        const label = el("label", "team-synergy-card");
        if (model.scenarioToggles[effect.id]) label.classList.add("is-enabled");
        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = Boolean(model.scenarioToggles[effect.id]);
        input.addEventListener("change", () => {
          model.scenarioToggles[effect.id] = input.checked;
          persist();
          render();
        });
        const copy = el("span", "team-synergy-copy");
        const title = el("span", "team-synergy-title");
        title.append(el("strong", "", effect.name), el("small", "", `${effect.source} · ${translate(effect.activation)}`));
        copy.append(
          title,
          el("span", "team-synergy-scope", `${effect.teamRole} · ${effect.verification}`),
          el("span", "team-synergy-description", effect.description),
          el("span", "team-synergy-note", effect.supportNote),
        );
        label.append(input, copy);
        list.append(label);
      });
      section.append(list);
    }

    const damage = el("div", "team-damage-preview");
    damage.append(
      el("p", "team-eyebrow", "Sample damage"),
      el("strong", "", "Combat profile ready"),
      el("p", "", "Attack, skill Might, rune rolls, carried-item effects, and enabled team buffs are preserved in this build. A damage number will be added after the combat formula and enemy mitigation model are verified."),
    );
    section.append(damage);
    return section;
  }

  function renderMemberConfiguration(member, index) {
    const entry = aniimoFor(member);
    if (!entry) {
      const empty = el("section", "team-builder-empty");
      empty.append(el("strong", "", "Choose an Aniimo for this slot"), el("p", "", "Use the team controls on the left to start configuring this position."));
      return empty;
    }
    const wrapper = el("div", "team-member-configuration");
    wrapper.append(renderMemberIdentity(member, entry, index));
    const columns = el("div", "team-builder-columns");
    const config = el("div", "team-builder-main-column");
    const supportOnly = model.mode === "coop" && index > 0;
    config.append(renderSkillLoadout(member, entry, supportOnly), renderProgressionConfiguration(member));
    if (!supportOnly) config.append(renderEquipment(member));
    config.append(renderStats(member, entry));
    columns.append(config, renderScenario());
    wrapper.append(columns);
    return wrapper;
  }

  function renderPanel() {
    panel.textContent = "";
    const header = el("header", "team-builder-header");
    const copy = el("div", "");
    copy.append(
      el("h1", "", "Team Builder"),
      el("p", "", model.mode === "coop"
        ? "Configure one controlled Aniimo and the three Core skills supplied by your personal team."
        : "Configure four Aniimo, their skill loadouts, progression, carried items, runes, and team effects."),
    );
    header.append(copy, renderModeSwitch());
    panel.append(header, renderTeamOverview(), renderMemberConfiguration(model.members[model.activeSlot], model.activeSlot));
  }

  function renderLoading() {
    if (!sidebar || !panel) return;
    sidebar.textContent = "";
    panel.textContent = "";
    sidebar.append(el("p", "team-loading", loadError || "Loading Team Builder…"));
    panel.append(el("p", "team-loading", loadError || "Loading Team Builder…"));
  }

  function render() {
    if (!sidebar || !panel) return;
    if (!aniilog || !itemlog) {
      renderLoading();
      return;
    }
    model.members.forEach(validateMember);
    renderSidebar();
    renderPanel();
    window.AniipediaI18n?.translateTree(sidebar);
    window.AniipediaI18n?.translateTree(panel);
  }

  function mount(elements) {
    sidebar = elements?.sidebar || null;
    panel = elements?.panel || null;
    renderLoading();
  }

  async function show() {
    renderLoading();
    await ensureData();
    await loadRequestedTeamShare();
    model.members.forEach(validateMember);
    persist();
    render();
  }

  window.AniipediaTeamBuilder = Object.freeze({ mount, show });
})();
