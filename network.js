(function installEP1Network(global) {
  "use strict";

  /*
   * DOM-free PeerJS adapter. Typical use:
   *   EP1Network.on("status", updateConnectionLabel);
   *   EP1Network.on("roster", ({ players }) => renderPlayersWithTextContent(players));
   *   await EP1Network.connectRoom(code, { name, classId: "archer" });
   *
   * connectRoom() claims the deterministic host id first, then joins the existing
   * host when that id is already taken. hostRoom()/joinRoom() are explicit forms.
   */

  const PROTOCOL = "ep1-p2p-lobby";
  const VERSION = 2;
  const MAX_PLAYERS = 4;
  const COUNTDOWN_SECONDS = 3;
  const COUNTDOWN_DURATION_MS = COUNTDOWN_SECONDS * 1000;
  const DEFAULT_TIMEOUT_MS = 12000;
  const SNAPSHOT_LIMIT_BYTES = 128 * 1024;
  const MESSAGE_LIMIT_BYTES = 140 * 1024;
  const ROOM_PATTERN = /^[A-Z0-9]{4,10}$/;
  const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
  const KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,39}$/;
  const CLASS_IDS = Object.freeze(["archer", "medic", "chairman", "fireman"]);
  const CLASS_SET = new Set(CLASS_IDS);
  const FACING_IDS = Object.freeze(["up", "down", "left", "right"]);
  const FACING_SET = new Set(FACING_IDS);
  const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

  const EVENTS = Object.freeze({
    STATUS: "status",
    ERROR: "error",
    ROSTER: "roster",
    PLAYER_JOIN: "player-join",
    PLAYER_LEAVE: "player-leave",
    PRESENCE: "presence",
    CLASS_SELECTION: "class-selection",
    COUNTDOWN: "countdown",
    START: "start",
    SNAPSHOT: "snapshot",
    INPUT: "input",
    PONG: "pong",
  });

  const HOST_INBOUND_TYPES = new Set(["presence", "class-select", "input", "ping"]);
  const GUEST_INBOUND_TYPES = new Set([
    "welcome",
    "reject",
    "roster",
    "countdown",
    "start",
    "snapshot",
    "pong",
  ]);

  function isPlainObject(value) {
    if (value === null || typeof value !== "object") return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function hasOnlyKeys(object, required, optional) {
    if (!isPlainObject(object)) return false;
    const allowed = new Set(required.concat(optional || []));
    const keys = Object.keys(object);
    if (keys.some((key) => !allowed.has(key) || FORBIDDEN_KEYS.has(key))) return false;
    return required.every((key) => Object.prototype.hasOwnProperty.call(object, key));
  }

  function isSafeInteger(value, min, max) {
    return Number.isSafeInteger(value) && value >= min && value <= max;
  }

  function isFiniteInRange(value, min, max) {
    return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
  }

  function isSafeNetworkText(value, maxLength) {
    return (
      typeof value === "string" &&
      value.length > 0 &&
      value.length <= maxLength &&
      !/[<>&`\u0000-\u001f\u007f]/u.test(value)
    );
  }

  function isPlayerName(value) {
    if (!isSafeNetworkText(value, 20) || value.trim() !== value) return false;
    try {
      return /^[\p{L}\p{N} _.-]+$/u.test(value);
    } catch (_error) {
      return /^[A-Za-z0-9\u3131-\u318e\uac00-\ud7a3 _.-]+$/.test(value);
    }
  }

  function isIdentifier(value, maxLength) {
    return (
      typeof value === "string" &&
      value.length > 0 &&
      value.length <= maxLength &&
      /^[A-Za-z0-9_-]+$/.test(value)
    );
  }

  function normalizeRoomCode(roomCode) {
    if (typeof roomCode !== "string") {
      throw new TypeError("Room code must be a string.");
    }
    const normalized = roomCode.trim().toUpperCase();
    if (!ROOM_PATTERN.test(normalized)) {
      throw new TypeError("Room code must contain 4-10 letters or numbers.");
    }
    return normalized;
  }

  function randomUint32() {
    if (global.crypto && typeof global.crypto.getRandomValues === "function") {
      const values = new Uint32Array(1);
      global.crypto.getRandomValues(values);
      return values[0];
    }
    return Math.floor(Math.random() * 0x100000000);
  }

  function generateRoomCode(length) {
    const size = isSafeInteger(length, 4, 10) ? length : 6;
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let index = 0; index < size; index += 1) {
      code += alphabet[randomUint32() % alphabet.length];
    }
    return code;
  }

  function hashText(text) {
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function defaultNamespace() {
    const location = global.location;
    const normalizedPath = location
      ? (location.pathname || "/").replace(/\/index\.html?$/i, "/").replace(/\/+$/, "") || "/"
      : "/";
    const source = location
      ? `${location.hostname || "local"}${normalizedPath}`
      : "ep1-local";
    return hashText(source);
  }

  function cloneData(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function jsonByteLength(value) {
    try {
      const json = JSON.stringify(value);
      if (typeof TextEncoder === "function") return new TextEncoder().encode(json).length;
      return unescape(encodeURIComponent(json)).length;
    } catch (_error) {
      return Infinity;
    }
  }

  function publicPlayer(player) {
    return {
      id: player.id,
      name: player.name,
      classId: player.classId,
      job: player.job,
      x: player.x,
      y: player.y,
      facing: player.facing,
      isHost: player.isHost,
    };
  }

  function isPeerId(value) {
    return typeof value === "string" && ID_PATTERN.test(value);
  }

  function validatePlayer(player) {
    return (
      hasOnlyKeys(player, ["id", "name", "classId", "job", "x", "y", "facing", "isHost"]) &&
      isPeerId(player.id) &&
      isPlayerName(player.name) &&
      CLASS_SET.has(player.classId) &&
      player.job === player.classId &&
      isFiniteInRange(player.x, -1000000, 1000000) &&
      isFiniteInRange(player.y, -1000000, 1000000) &&
      FACING_SET.has(player.facing) &&
      typeof player.isHost === "boolean"
    );
  }

  function validateRoster(players) {
    if (!Array.isArray(players) || players.length < 1 || players.length > MAX_PLAYERS) return false;
    const ids = new Set();
    let hostCount = 0;
    for (const player of players) {
      if (!validatePlayer(player) || ids.has(player.id)) return false;
      ids.add(player.id);
      if (player.isHost) hostCount += 1;
    }
    return hostCount === 1;
  }

  function normalizeProfile(profile) {
    const source = profile === undefined ? {} : profile;
    if (!isPlainObject(source)) throw new TypeError("Player profile must be an object.");
    const keys = Object.keys(source);
    if (keys.some((key) => !["name", "classId", "job", "x", "y", "facing"].includes(key))) {
      throw new TypeError("Player profile contains an unsupported field.");
    }
    if (source.classId !== undefined && source.job !== undefined && source.classId !== source.job) {
      throw new TypeError("Player classId and job must match.");
    }
    const job = source.job === undefined
      ? (source.classId === undefined ? "archer" : source.classId)
      : source.job;
    const normalized = {
      name: source.name === undefined ? "Player" : source.name,
      classId: job,
      job,
      x: source.x === undefined ? 0 : source.x,
      y: source.y === undefined ? 0 : source.y,
      facing: source.facing === undefined ? "down" : source.facing,
    };
    if (!isPlayerName(normalized.name)) {
      throw new TypeError("Player name must be 1-20 safe letters, numbers, spaces, dots, '_' or '-'.");
    }
    if (!CLASS_SET.has(normalized.classId)) {
      throw new TypeError(`Unknown class: ${String(normalized.classId)}`);
    }
    if (!isFiniteInRange(normalized.x, -1000000, 1000000) || !isFiniteInRange(normalized.y, -1000000, 1000000)) {
      throw new TypeError("Player coordinates must be finite numbers between -1000000 and 1000000.");
    }
    if (!FACING_SET.has(normalized.facing)) {
      throw new TypeError(`Unknown facing: ${String(normalized.facing)}`);
    }
    return normalized;
  }

  function validatePresence(value) {
    return (
      hasOnlyKeys(value, ["name", "job", "x", "y", "facing"]) &&
      isPlayerName(value.name) &&
      CLASS_SET.has(value.job) &&
      isFiniteInRange(value.x, -1000000, 1000000) &&
      isFiniteInRange(value.y, -1000000, 1000000) &&
      FACING_SET.has(value.facing)
    );
  }

  function presenceFromProfile(profile) {
    return {
      name: profile.name,
      job: profile.job,
      x: profile.x,
      y: profile.y,
      facing: profile.facing,
    };
  }

  function validateStartInfo(value) {
    return (
      hasOnlyKeys(value, ["stage", "seed", "tick", "startedAt"]) &&
      value.stage === 0 &&
      isSafeInteger(value.seed, 0, 0xffffffff) &&
      isSafeInteger(value.tick, 0, Number.MAX_SAFE_INTEGER) &&
      isSafeInteger(value.startedAt, 0, Number.MAX_SAFE_INTEGER)
    );
  }

  function createStartInfo(options) {
    const source = options === undefined ? {} : options;
    if (!isPlainObject(source)) throw new TypeError("Start options must be an object.");
    if (Object.keys(source).some((key) => !["stage", "seed", "tick"].includes(key))) {
      throw new TypeError("Start options contain an unsupported field.");
    }
    const info = {
      stage: 0,
      seed: source.seed === undefined ? randomUint32() : source.seed,
      tick: source.tick === undefined ? 0 : source.tick,
      startedAt: Date.now() + COUNTDOWN_DURATION_MS,
    };
    if (!validateStartInfo(info)) throw new TypeError("Invalid start options.");
    return info;
  }

  function sameStartInfo(left, right) {
    return (
      validateStartInfo(left) &&
      validateStartInfo(right) &&
      left.stage === right.stage &&
      left.seed === right.seed &&
      left.tick === right.tick &&
      left.startedAt === right.startedAt
    );
  }

  function validateInput(value) {
    return (
      hasOnlyKeys(value, [
        "inputSeq",
        "tick",
        "moveX",
        "moveY",
        "aimX",
        "aimY",
        "attack",
        "skill",
        "interact",
      ]) &&
      isSafeInteger(value.inputSeq, 0, Number.MAX_SAFE_INTEGER) &&
      isSafeInteger(value.tick, 0, Number.MAX_SAFE_INTEGER) &&
      isFiniteInRange(value.moveX, -1, 1) &&
      isFiniteInRange(value.moveY, -1, 1) &&
      isFiniteInRange(value.aimX, -1, 1) &&
      isFiniteInRange(value.aimY, -1, 1) &&
      typeof value.attack === "boolean" &&
      typeof value.skill === "boolean" &&
      typeof value.interact === "boolean"
    );
  }

  function normalizeInput(input, nextSequence) {
    if (!isPlainObject(input)) throw new TypeError("Input must be an object.");
    const allowed = new Set([
      "inputSeq",
      "tick",
      "moveX",
      "moveY",
      "aimX",
      "aimY",
      "attack",
      "skill",
      "interact",
    ]);
    if (Object.keys(input).some((key) => !allowed.has(key) || FORBIDDEN_KEYS.has(key))) {
      throw new TypeError("Input contains an unsupported field.");
    }
    const value = {
      inputSeq: input.inputSeq === undefined ? nextSequence : input.inputSeq,
      tick: input.tick === undefined ? 0 : input.tick,
      moveX: input.moveX === undefined ? 0 : input.moveX,
      moveY: input.moveY === undefined ? 0 : input.moveY,
      aimX: input.aimX === undefined ? 0 : input.aimX,
      aimY: input.aimY === undefined ? 0 : input.aimY,
      attack: input.attack === true,
      skill: input.skill === true,
      interact: input.interact === true,
    };
    if (!validateInput(value)) throw new TypeError("Invalid input values.");
    return value;
  }

  function validateSafeStateValue(value, depth, budget) {
    budget.count += 1;
    if (budget.count > 6000 || depth > 7) return false;
    if (value === null || typeof value === "boolean") return true;
    if (typeof value === "number") return Number.isFinite(value) && Math.abs(value) <= 1e12;
    if (typeof value === "string") return value.length <= 128 && !/[<>&`\u0000-\u001f\u007f]/u.test(value);
    if (Array.isArray(value)) {
      return value.length <= 512 && value.every((item) => validateSafeStateValue(item, depth + 1, budget));
    }
    if (!isPlainObject(value)) return false;
    const keys = Object.keys(value);
    if (keys.length > 64) return false;
    for (const key of keys) {
      if (FORBIDDEN_KEYS.has(key) || !KEY_PATTERN.test(key)) return false;
      if (!validateSafeStateValue(value[key], depth + 1, budget)) return false;
    }
    return true;
  }

  function validateSnapshot(snapshot) {
    if (!isPlainObject(snapshot)) return false;
    if (!Object.prototype.hasOwnProperty.call(snapshot, "stage") || !Object.prototype.hasOwnProperty.call(snapshot, "tick")) {
      return false;
    }
    if (!isSafeInteger(snapshot.stage, 0, 4) || !isSafeInteger(snapshot.tick, 0, Number.MAX_SAFE_INTEGER)) {
      return false;
    }
    const budget = { count: 0 };
    return (
      validateSafeStateValue(snapshot, 0, budget) &&
      jsonByteLength(snapshot) <= SNAPSHOT_LIMIT_BYTES
    );
  }

  function validatePayload(type, payload) {
    switch (type) {
      case "presence":
        return validatePresence(payload);
      case "class-select":
        return hasOnlyKeys(payload, ["classId"]) && CLASS_SET.has(payload.classId);
      case "input":
        return hasOnlyKeys(payload, ["input"]) && validateInput(payload.input);
      case "ping":
      case "pong":
        return hasOnlyKeys(payload, ["nonce"]) && isIdentifier(payload.nonce, 48);
      case "welcome":
        return (
          hasOnlyKeys(payload, ["selfId", "hostId", "players", "started", "startInfo"]) &&
          isPeerId(payload.selfId) &&
          isPeerId(payload.hostId) &&
          validateRoster(payload.players) &&
          payload.started === false &&
          payload.startInfo === null
        );
      case "reject":
        return (
          hasOnlyKeys(payload, ["code", "reason"]) &&
          isIdentifier(payload.code, 32) &&
          isSafeNetworkText(payload.reason, 100)
        );
      case "roster":
        return hasOnlyKeys(payload, ["players"]) && validateRoster(payload.players);
      case "countdown":
        return (
          hasOnlyKeys(payload, ["remaining", "total", "durationMs", "info"]) &&
          isSafeInteger(payload.remaining, 0, COUNTDOWN_SECONDS) &&
          payload.total === COUNTDOWN_SECONDS &&
          payload.durationMs === COUNTDOWN_DURATION_MS &&
          validateStartInfo(payload.info)
        );
      case "start":
        return hasOnlyKeys(payload, ["info"]) && validateStartInfo(payload.info);
      case "snapshot":
        return hasOnlyKeys(payload, ["state"]) && validateSnapshot(payload.state);
      default:
        return false;
    }
  }

  function validateEnvelope(message, allowedTypes, roomCode) {
    if (!hasOnlyKeys(message, ["protocol", "ónx¶‰žËkºwµçq½…¹©½ˆì(€€€€€€€€€€€Á±…å•È¹©½ˆ€ôµ•ÍÍ…”¹Á…å±½…¹©½ˆì(€€€€€€€€€€€Á±…å•È¹à€ôµ•ÍÍ…”¹Á…å±½…¹àì(€€€€€€€€€€€Á±…å•È¹ä€ôµ•ÍÍ…”¹Á…å±½…¹äì(€€€€€€€€€€€Á±…å•È¹™…¥¹œ€ôµ•ÍÍ…”¹Á…å±½…¹™…¥¹œì(€€€€€€€€€€€É•½É¹ÁÉ½™¥±”€ô±½¹•…Ñ„¡Á±…å•È¤ì(€€€€€€€€€€€Ñ¡¥Ì¹}•Ù•¹ÑÌ¹•µ¥Ð¡Y9QL¹AIM9°ìÁ±…å•ÈèÁÕ‰±¥A±…å•È¡Á±…å•È¤ô¤ì(€€€€€€€€€€€¥˜€¡ÁÉ•Ù¥½ÕÍ)½ˆ€„ôôÁ±…å•È¹©½ˆ¤ì(€€€€€€€€€€€€€Ñ¡¥Ì¹}•Ù•¹ÑÌ¹•µ¥Ð¡Y9QL¹1MM}M1Q%=8°ì(€€€€€€€€€€€€€€€Á±…å•É%èÁ±…å•È¹¥°(€€€€€€€€€€€€€€€±…ÍÍ%èÁ±…å•È¹±…ÍÍ%°(€€€€€€€€€€€€€€€©½ˆèÁ±…å•È¹©½ˆ°(€€€€€€€€€€€€€ô¤ì(€€€€€€€€€€€ô(€€€€€€€€€€€Ñ¡¥Ì¹}‰É½…‘…ÍÑI½ÍÑ•È ¤ì(€€€€€€€€€ô(€€€€€€€€€‰É•…¬ì(€€€€€€€…Í”€‰±…ÍÌµÍ•±•Ðˆè(€€€€€€€€€¥˜€¡Ñ¡¥Ì¹}½Õ¹Ñ‘½Ý¹Ñ¥Ù”ñðÑ¡¥Ì¹}ÍÑ…ÉÑ•¤‰É•…¬ì(€€€€€€€€€Á±…å•È¹±…ÍÍ%€ôµ•ÍÍ…”¹Á…å±½…¹±…ÍÍ%ì(€€€€€€€€€Á±…å•È¹©½ˆ€ôµ•ÍÍ…”¹Á…å±½…¹±…ÍÍ%ì(€€€€€€€€€Ñ¡¥Ì¹}•Ù•¹ÑÌ¹•µ¥Ð¡Y9QL¹1MM}M1Q%=8°ì(€€€€€€€€€€€Á±…å•É%èÁ±…å•È¹¥°(€€€€€€€€€€€±…ÍÍ%èÁ±…å•È¹±…ÍÍ%°(€€€€€€€€€€€©½ˆèÁ±…å•È¹©½ˆ°(€€€€€€€€€ô¤ì(€€€€€€€€€Ñ¡¥Ì¹}‰É½…‘…ÍÑI½ÍÑ•È ¤ì(€€€€€€€€€‰É•…¬ì(€€€€€€€…Í”€‰¥¹ÁÕÐˆè(€€€€€€€€€Ñ¡¥Ì¹}•Ù•¹ÑÌ¹•µ¥Ð¡Y9QL¹%9AUP°ì(€€€€€€€€€€€Á±…å•É%èÁ±…å•È¹¥°(€€€€€€€€€€€¥¹ÁÕÐè±½¹•…Ñ„¡µ•ÍÍ…”¹Á…å±½…¹¥¹ÁÕÐ¤°(€€€€€€€€€ô¤ì(€€€€€€€€€‰É•…¬ì(€€€€€€€…Í”€‰Á¥¹œˆè(€€€€€€€€€Ñ¡¥Ì¹}Í•¹¡É•½É¹½¹¹•Ñ¥½¸°€‰Á½¹œˆ°ì¹½¹”èµ•ÍÍ…”¹Á…å±½…¹¹½¹”ô¤ì(€€€€€€€€€‰É•…¬ì(€€€€€€€‘•™…Õ±Ðè(€€€€€€€€€‰É•…¬ì(€€€€€ô(€€€ô((€€€}‰¥¹‘Õ•ÍÑ½¹¹•Ñ¥½¸¡½¹¹•Ñ¥½¸°Ñ½­•¸¤ì(€€€€€½¹¹•Ñ¥½¸¹½¸ ‰‘…Ñ„ˆ°€¡µ•ÍÍ…”¤€ôøÑ¡¥Ì¹}¡…¹‘±•Õ•ÍÑ%¹‰½Õ¹¡µ•ÍÍ…”°Ñ½­•¸¤¤ì(€€€€€½¹¹•Ñ¥½¸¹½¸ ‰±½Í”ˆ°€ ¤€ôøì(€€€€€€€¥˜€¡Ñ½­•¸€„ôôÑ¡¥Ì¹}Ñ½­•¸¤É•ÑÕÉ¸ì(€€€€€€€½¹ÍÐ•ÉÉ½È€ôµ…­•ÉÉ½È ‰¡½ÍÐµ‘¥Í½¹¹•Ñ•ˆ°€‰Q¡”¡½ÍÐ½¹¹•Ñ¥½¸±½Í•¸ˆ¤ì(€€€€€€€¥˜€¡Ñ¡¥Ì¹}Á•¹‘¥¹]•±½µ”¤Ñ¡¥Ì¹}É•©•ÑA•¹‘¥¹]•±½µ”¡•ÉÉ½È¤ì(€€€€€€€•±Í”Ñ¡¥Ì¹}™…¥±=™™±¥¹” ‰Q¡”¡½ÍÐ‘¥Í½¹¹•Ñ•¸=™™±¥¹”µ½‘”¥Ì…Ñ¥Ù”¸ˆ°•ÉÉ½È¹½‘”°Ñ½­•¸¤ì(€€€€€ô¤ì(€€€€€½¹¹•Ñ¥½¸¹½¸ ‰•ÉÉ½Èˆ°€¡•ÉÉ½È¤€ôøì(€€€€€€€¥˜€¡Ñ½­•¸€„ôôÑ¡¥Ì¹}Ñ½­•¸¤É•ÑÕÉ¸ì(€€€€€€€¥˜€¡Ñ¡¥Ì¹}Á•¹‘¥¹]•±½µ”¤Ñ¡¥Ì¹}É•©•ÑA•¹‘¥¹]•±½µ”¡•ÉÉ½È¤ì(€€€€€€€•±Í”Ñ¡¥Ì¹}™…¥±=™™±¥¹” ‰Q¡”¡½ÍÐ½¹¹•Ñ¥½¸™…¥±•¸=™™±¥¹”µ½‘”¥Ì…Ñ¥Ù”¸ˆ°Á••ÉÉÉ½É½‘”¡•ÉÉ½È¤°Ñ½­•¸¤ì(€€€€€ô¤ì(€€€ô((€€€}¡…¹‘±•Õ•ÍÑ%¹‰½Õ¹¡µ•ÍÍ…”°Ñ½­•¸¤ì(€€€€€¥˜€¡Ñ½­•¸€„ôôÑ¡¥Ì¹}Ñ½­•¸¤É•ÑÕÉ¸ì(€€€€€¥˜€ …Ñ¡¥Ì¹}…±±½ÝI…Ñ”¡Ñ¡¥Ì¹}Õ•ÍÑI…Ñ”°€ÄÈÀ¤¤ì(€€€€€€€Ñ¡¥Ì¹}Õ•ÍÑ%¹Ù…±¥‘½Õ¹Ð€¬ô€Äì(€€€€€€€¥˜€¡Ñ¡¥Ì¹}Õ•ÍÑ%¹Ù…±¥‘½Õ¹Ð€øô€Ì¤ì(€€€€€€€€€Ñ¡¥Ì¹}™…¥±=™™±¥¹” ‰Q¡”¡½ÍÐ•á••‘•Ñ¡”Í…™”µ•ÍÍ…”É…Ñ”¸=™™±¥¹”µ½‘”¥Ì…Ñ¥Ù”¸ˆ°€‰É…Ñ”µ±¥µ¥Ðˆ°Ñ½­•¸¤ì(€€€€€€€ô(€€€€€€€É•ÑÕÉ¸ì(€€€€€ô(€€€€€¥˜€ (€€€€€€€€…Ù…±¥‘…Ñ•¹Ù•±½Á”¡µ•ÍÍ…”°UMQ}%9	=U9}QeAL°Ñ¡¥Ì¹}É½½µ½‘”¤ñð(€€€€€€€µ•ÍÍ…”¹Í•Ä€ðôÑ¡¥Ì¹}Õ•ÍÑ1…ÍÑM•ÅÕ•¹”(€€€€€€¤ì(€€€€€€€Ñ¡¥Ì¹}Õ•ÍÑ%¹Ù…±¥‘½Õ¹Ð€¬ô€Äì(€€€€€€€Ñ¡¥Ì¹}•µ¥ÑÉÉ½È ‰¥¹Ù…±¥µÁ…å±½…ˆ°€‰I•©•Ñ•¥¹Ù…±¥‘…Ñ„™É½´Ñ¡”¡½ÍÐ¸ˆ°ÑÉÕ”¤ì(€€€€€€€¥˜€¡Ñ¡¥Ì¹}Õ•ÍÑ%¹Ù…±¥‘½Õ¹Ð€øô€Ì¤ì(€€€€€€€€€Ñ¡¥Ì¹}™…¥±=™™±¥¹” ‰Q¡”¡½ÍÐÍ•¹Ð¥¹Ù…±¥‘…Ñ„¸=™™±¥¹”µ½‘”¥Ì…Ñ¥Ù”¸ˆ°€‰¥¹Ù…±¥µÁ…å±½…ˆ°Ñ½­•¸¤ì(€€€€€€€ô(€€€€€€€É•ÑÕÉ¸ì(€€€€€ô(€€€€€Ñ¡¥Ì¹}Õ•ÍÑ1…ÍÑM•ÅÕ•¹”€ôµ•ÍÍ…”¹Í•Äì((€€€€€¥˜€¡µ•ÍÍ…”¹ÑåÁ”€ôôô€‰É•©•Ðˆ¤ì(€€€€€€€½¹ÍÐ•ÉÉ½È€ôµ…­•ÉÉ½È ‰©½¥¸µÉ•©•Ñ•ˆ°µ•ÍÍ…”¹Á…å±½…¹É•…Í½¸¤ì(€€€€€€€•ÉÉ½È¹É•©•Ñ½‘”€ôµ•ÍÍ…”¹Á…å±½…¹½‘”ì(€€€€€€€Ñ¡¥Ì¹}É•©•ÑA•¹‘¥¹]•±½µ”¡•ÉÉ½È¤ì(€€€€€€€É•ÑÕÉ¸ì(€€€€€ô((€€€€€¥˜€¡µ•ÍÍ…”¹ÑåÁ”€ôôô€‰Ý•±½µ”ˆ¤ì(€€€€€€€½¹ÍÐÁ…å±½…€ôµ•ÍÍ…”¹Á…å±½…ì(€€€€€€€½¹ÍÐ½¹Ñ…¥¹ÍM•±˜€ôÁ…å±½…¹Á±…å•ÉÌ¹Í½µ” ¡Á±…å•È¤€ôøÁ±…å•È¹¥€ôôôÑ¡¥Ì¹}Í•±™%€˜˜€…Á±…å•È¹¥Í!½ÍÐ¤ì(€€€€€€€½¹ÍÐ½ÉÉ•Ñ!½ÍÐ€ôÁ…å±½…¹¡½ÍÑ%€ôôôÑ¡¥Ì¹}¡½ÍÑ%€˜˜Á…å±½…¹Á±…å•ÉÌ¹Í½µ” (€€€€€€€€€€¡Á±…å•È¤€ôøÁ±…å•È¹¥€ôôôÁ…å±½…¹¡½ÍÑ%€˜˜Á±…å•È¹¥Í!½ÍÐ(€€€€€€€€¤ì(€€€€€€€¥˜€¡Á…å±½…¹Í•±™%€„ôôÑ¡¥Ì¹}Í•±™%ñð€…½¹Ñ…¥¹ÍM•±˜ñð€…½ÉÉ•Ñ!½ÍÐ¤ì(€€€€€€€€€Ñ¡¥Ì¹}É•©•ÑA•¹‘¥¹]•±½µ”¡µ…­•ÉÉ½È ‰¥¹Ù…±¥µÝ•±½µ”ˆ°€‰Q¡”¡½ÍÐÍ•¹Ð…¸¥¹Ù…±¥É½ÍÑ•È¸ˆ¤¤ì(€€€€€€€€€É•ÑÕÉ¸ì(€€€€€€€ô(€€€€€€€Ñ¡¥Ì¹}Á±…å•ÉÌ€ô¹•Ü5…À¡Á…å±½…¹Á±…å•ÉÌ¹µ…À ¡Á±…å•È¤€ôømÁ±…å•È¹¥°±½¹•…Ñ„¡Á±…å•È¥t¤¤ì(€€€€€€€Ñ¡¥Ì¹}É½±”€ô€‰Õ•ÍÐˆì(€€€€€€€Ñ¡¥Ì¹}ÍÑ…ÉÑ•€ôÁ…å±½…¹ÍÑ…ÉÑ•ì(€€€€€€€Ñ¡¥Ì¹}ÍÑ…ÉÑ%¹™¼€ôÁ…å±½…¹ÍÑ…ÉÑ%¹™¼€ü±½¹•…Ñ„¡Á…å±½…¹ÍÑ…ÉÑ%¹™¼¤€è¹Õ±°ì(€€€€€€€Ñ¡¥Ì¹}½Õ¹Ñ‘½Ý¹Ñ¥Ù”€ô™…±Í”ì(€€€€€€€Ñ¡¥Ì¹}½Õ¹Ñ‘½Ý¹I•µ…¥¹¥¹œ€ô€Àì(€€€€€€€Ñ¡¥Ì¹}Í•ÑMÑ…ÑÕÌ ‰½¹¹•Ñ•ˆ°)½¥¹•É½½´€‘íÑ¡¥Ì¹}É½½µ½‘•ô¹€°¹Õ±°¤ì(€€€€€€€Ñ¡¥Ì¹}•µ¥ÑI½ÍÑ•È ¤ì(€€€€€€€Ñ¡¥Ì¹}É•Í½±Ù•A•¹‘¥¹]•±½µ” ¤ì(€€€€€€€¥˜€¡Ñ¡¥Ì¹}ÍÑ…ÉÑ•€˜˜Ñ¡¥Ì¹}ÍÑ…ÉÑ%¹™¼¤ì(€€€€€€€€€Ñ¡¥Ì¹}•Ù•¹ÑÌ¹•µ¥Ð¡Y9QL¹MQIP°ì¥¹™¼è±½¹•…Ñ„¡Ñ¡¥Ì¹}ÍÑ…ÉÑ%¹™¼¤°™É½´èÑ¡¥Ì¹}¡½ÍÑ%ô¤ì(€€€€€€€ô(€€€€€€€É•ÑÕÉ¸ì(€€€€€ô((€€€€€¥˜€¡Ñ¡¥Ì¹}É½±”€„ôô€‰Õ•ÍÐˆ¤É•ÑÕÉ¸ì(€€€€€ÍÝ¥Ñ €¡µ•ÍÍ…”¹ÑåÁ”¤ì(€€€€€€€…Í”€‰É½ÍÑ•Èˆè(€€€€€€€€€¥˜€ (€€€€€€€€€€€€…µ•ÍÍ…”¹Á…å±½…¹Á±…å•ÉÌ¹Í½µ” ¡Á±…å•È¤€ôøÁ±…å•È¹¥€ôôôÑ¡¥Ì¹}Í•±™%€˜˜€…Á±…å•È¹¥Í!½ÍÐ¤ñð(€€€€€€€€€€€€…µ•ÍÍ…”¹Á…å±½…¹Á±…å•ÉÌ¹Í½µ” ¡Á±…å•È¤€ôøÁ±…å•È¹¥€ôôôÑ¡¥Ì¹}¡½ÍÑ%€˜˜Á±…å•È¹¥Í!½ÍÐ¤(€€€€€€€€€€¤ì(€€€€€€€€€€€Ñ¡¥Ì¹}™…¥±=™™±¥¹” ‰Q¡”¡½ÍÐÉ•µ½Ù•Ñ¡¥ÌÁ±…å•È™É½´Ñ¡”É½ÍÑ•È¸ˆ°€‰É•µ½Ù•ˆ°Ñ½­•¸¤ì(€€€€€€€€€€€É•ÑÕÉ¸ì(€€€€€€€€€ô(€€€€€€€€€Ñ¡¥Ì¹}Á±…å•ÉÌ€ô¹•Ü5…À¡µ•ÍÍ…”¹Á…å±½…¹Á±…å•ÉÌ¹µ…À ¡Á±…å•È¤€ôømÁ±…å•È¹¥°±½¹•…Ñ„¡Á±…å•È¥t¤¤ì(€€€€€€€€€Ñ¡¥Ì¹}•µ¥ÑI½ÍÑ•È ¤ì(€€€€€€€€€‰É•…¬ì(€€€€€€€…Í”€‰½Õ¹Ñ‘½Ý¸ˆè(€€€€€€€€€ì(€€€€€€€€€€€½¹ÍÐÁ…å±½…€ôµ•ÍÍ…”¹Á…å±½…ì(€€€€€€€€€€€½¹ÍÐ•áÁ•Ñ•‘I•µ…¥¹¥¹œ€ôÑ¡¥Ì¹}½Õ¹Ñ‘½Ý¹Ñ¥Ù”(€€€€€€€€€€€€€€üÑ¡¥Ì¹}½Õ¹Ñ‘½Ý¹I•µ…¥¹¥¹œ€´€Ä(€€€€€€€€€€€€€€è=U9Q=]9}M=9Lì(€€€€€€€€€€€½¹ÍÐÙ…±¥‘=É‘•È€ô(€€€€€€€€€€€€€€…Ñ¡¥Ì¹}ÍÑ…ÉÑ•€˜˜(€€€€€€€€€€€€€•áÁ•Ñ•‘I•µ…¥¹¥¹œ€øô€À€˜˜(€€€€€€€€€€€€€Á…å±½…¹É•µ…¥¹¥¹œ€ôôô•áÁ•Ñ•‘I•µ…¥¹¥¹œì(€€€€€€€€€€€½¹ÍÐÙ…±¥‘%¹™¼€ô€…Ñ¡¥Ì¹}½Õ¹Ñ‘½Ý¹Ñ¥Ù”ñðÍ…µ•MÑ…ÉÑ%¹™¼¡Á…å±½…¹¥¹™¼°Ñ¡¥Ì¹}ÍÑ…ÉÑ%¹™¼¤ì(€€€€€€€€€€€¥˜€ …Ù…±¥‘=É‘•Èñð€…Ù…±¥‘%¹™¼¤ì(€€€€€€€€€€€€€Ñ¡¥Ì¹}É•½É‘%¹Ù…±¥‘!½ÍÑ…Ñ„ (€€€€€€€€€€€€€€€€‰I•©•Ñ•…¸½ÕÐµ½˜µ½É‘•È½È¥¹½¹Í¥ÍÑ•¹Ð½Õ¹Ñ‘½Ý¸™É½´Ñ¡”¡½ÍÐ¸ˆ°(€€€€€€€€€€€€€€€Ñ½­•¸(€€€€€€€€€€€€€€¤ì(€€€€€€€€€€€€€‰É•…¬ì(€€€€€€€€€€€ô(€€€€€€€€€€€¥˜€ …Ñ¡¥Ì¹}½Õ¹Ñ‘½Ý¹Ñ¥Ù”¤Ñ¡¥Ì¹}ÍÑ…ÉÑ%¹™¼€ô±½¹•…Ñ„¡Á…å±½…¹¥¹™¼¤ì(€€€€€€€€€€€Ñ¡¥Ì¹}½Õ¹Ñ‘½Ý¹Ñ¥Ù”€ôÑÉÕ”ì(€€€€€€€€€€€Ñ¡¥Ì¹}½Õ¹Ñ‘½Ý¹I•µ…¥¹¥¹œ€ôÁ…å±½…¹É•µ…¥¹¥¹œì(€€€€€€€€€€€Ñ¡¥Ì¹}•Ù•¹ÑÌ¹•µ¥Ð¡Y9QL¹=U9Q=]8°ì(€€€€€€€€€€€€€€¸¸¹±½¹•…Ñ„¡Á…å±½…¤°(€€€€€€€€€€€€€™É½´èÑ¡¥Ì¹}¡½ÍÑ%°(€€€€€€€€€€€ô¤ì(€€€€€€€€€ô(€€€€€€€€€‰É•…¬ì(€€€€€€€…Í”€‰ÍÑ…ÉÐˆè(€€€€€€€€€¥˜€¡Ñ¡¥Ì¹}ÍÑ…ÉÑ•¤É•ÑÕÉ¸ì(€€€€€€€€€¥˜€ (€€€€€€€€€€€€…Ñ¡¥Ì¹}½Õ¹Ñ‘½Ý¹Ñ¥Ù”ñð(€€€€€€€€€€€Ñ¡¥Ì¹}½Õ¹Ñ‘½Ý¹I•µ…¥¹¥¹œ€„ôô€Àñð(€€€€€€€€€€€€…Í…µ•MÑ…ÉÑ%¹™¼¡µ•ÍÍ…”¹Á…å±½…¹¥¹™¼°Ñ¡¥Ì¹}ÍÑ…ÉÑ%¹™¼¤(€€€€€€€€€€¤ì(€€€€€€€€€€€Ñ¡¥Ì¹}É•½É‘%¹Ù…±¥‘!½ÍÑ…Ñ„ ‰I•©•Ñ•„ÍÑ…ÉÐµ•ÍÍ…”Ý¥Ñ¡½ÕÐ„½µÁ±•Ñ•½Õ¹Ñ‘½Ý¸¸ˆ°Ñ½­•¸¤ì(€€€€€€€€€€€‰É•…¬ì(€€€€€€€€€ô(€€€€€€€€€Ñ¡¥Ì¹}½Õ¹Ñ‘½Ý¹Ñ¥Ù”€ô™…±Í”ì(€€€€€€€€€Ñ¡¥Ì¹}½Õ¹Ñ‘½Ý¹I•µ…¥¹¥¹œ€ô€Àì(€€€€€€€€€Ñ¡¥Ì¹}ÍÑ…ÉÑ•€ôÑÉÕ”ì(€€€€€€€€€Ñ¡¥Ì¹}ÍÑ…ÉÑ%¹™¼€ô±½¹•…Ñ„¡µ•ÍÍ…”¹Á…å±½…¹¥¹™¼¤ì(€€€€€€€€€Ñ¡¥Ì¹}•Ù•¹ÑÌ¹•µ¥Ð¡Y9QL¹MQIP°ì¥¹™¼è±½¹•…Ñ„¡Ñ¡¥Ì¹}ÍÑ…ÉÑ%¹™¼¤°™É½´èÑ¡¥Ì¹}¡½ÍÑ%ô¤ì(€€€€€€€€€‰É•…¬ì(€€€€€€€…Í”€‰Í¹…ÁÍ¡½Ðˆè(€€€€€€€€€Ñ¡¥Ì¹}•Ù•¹ÑÌ¹•µ¥Ð¡Y9QL¹M9AM!=P°ì(€€€€€€€€€€€ÍÑ…Ñ”è±½¹•…Ñ„¡µ•ÍÍ…”¹Á…å±½…¹ÍÑ…Ñ”¤°(€€€€€€€€€€€™É½´èÑ¡¥Ì¹}¡½ÍÑ%°(€€€€€€€€€ô¤ì(€€€€€€€€€‰É•…¬ì(€€€€€€€…Í”€‰Á½¹œˆè(€€€€€€€€€Ñ¡¥Ì¹}•Ù•¹ÑÌ¹•µ¥Ð¡Y9QL¹A=9°ì¹½¹”èµ•ÍÍ…”¹Á…å±½…¹¹½¹”ô¤ì(€€€€€€€€€‰É•…¬ì(€€€€€€€‘•™…Õ±Ðè(€€€€€€€€€‰É•…¬ì(€€€€€ô(€€€ô((€€€}É•½É‘%¹Ù…±¥‘!½ÍÑ…Ñ„¡µ•ÍÍ…”°Ñ½­•¸¤ì(€€€€€Ñ¡¥Ì¹}Õ•ÍÑ%¹Ù…±¥‘½Õ¹Ð€¬ô€Äì(€€€€€Ñ¡¥Ì¹}•µ¥ÑÉÉ½È ‰¥¹Ù…±¥µ¡½ÍÐµ…ÕÑ¡½É¥Ñäˆ°µ•ÍÍ…”°ÑÉÕ”¤ì(€€€€€¥˜€¡Ñ¡¥Ì¹}Õ•ÍÑ%¹Ù…±¥‘½Õ¹Ð€øô€Ì¤ì(€€€€€€€Ñ¡¥Ì¹}™…¥±=™™±¥¹” ‰Q¡”¡½ÍÐÍ•¹Ð¥¹½¹Í¥ÍÑ•¹Ð…ÕÑ¡½É¥Ñ…Ñ¥Ù”‘…Ñ„¸=™™±¥¹”µ½‘”¥Ì…Ñ¥Ù”¸ˆ°€‰¥¹Ù…±¥µ¡½ÍÐµ…ÕÑ¡½É¥Ñäˆ°Ñ½­•¸¤ì(€€€€€ô(€€€ô((€€€}Ý…¥Ñ½É]•±½µ”¡Ñ½­•¸¤ì(€€€€€É•ÑÕÉ¸¹•ÜAÉ½µ¥Í” ¡É•Í½±Ù”°É•©•Ð¤€ôøì(€€€€€€€½¹ÍÐÑ¥µ•È€ô±½‰…°¹Í•ÑQ¥µ•½ÕÐ  ¤€ôøì(€€€€€€€€€¥˜€ …Ñ¡¥Ì¹}Á•¹‘¥¹]•±½µ”ñðÑ¡¥Ì¹}Á•¹‘¥¹]•±½µ”¹Ñ½­•¸€„ôôÑ½­•¸¤É•ÑÕÉ¸ì(€€€€€€€€€Ñ¡¥Ì¹}Á•¹‘¥¹]•±½µ”€ô¹Õ±°ì(€€€€€€€€€É•©•Ð¡µ…­•ÉÉ½È ‰½¹¹•Ñ¥½¸µÑ¥µ•½ÕÐˆ°€‰Q¥µ•½ÕÐÝ…¥Ñ¥¹œ™½ÈÑ¡”¡½ÍÐ¸ˆ¤¤ì(€€€€€€€ô°Ñ¡¥Ì¹}½ÁÑ¥½¹Ì¹Ñ¥µ•½ÕÑ5Ì¤ì(€€€€€€€Ñ¡¥Ì¹}Á•¹‘¥¹]•±½µ”€ôìÑ½­•¸°Ñ¥µ•È°É•Í½±Ù”°É•©•Ðôì(€€€€€ô¤ì(€€€ô((€€€}É•Í½±Ù•A•¹‘¥¹]•±½µ” ¤ì(€€€€€½¹ÍÐÁ•¹‘¥¹œ€ôÑ¡¥Ì¹}Á•¹‘¥¹]•±½µ”ì(€€€€€¥˜€ …Á•¹‘¥¹œ¤É•ÑÕÉ¸ì(€€€€€Ñ¡¥Ì¹}Á•¹‘¥¹]•±½µ”€ô¹Õ±°ì(€€€€€±½‰…°¹±•…ÉQ¥µ•½ÕÐ¡Á•¹‘¥¹œ¹Ñ¥µ•È¤ì(€€€€€Á•¹‘¥¹œ¹É•Í½±Ù” ¤ì(€€€ô((€€€}É•©•ÑA•¹‘¥¹]•±½µ”¡•ÉÉ½È¤ì(€€€€€½¹ÍÐÁ•¹‘¥¹œ€ôÑ¡¥Ì¹}Á•¹‘¥¹]•±½µ”ì(€€€€€¥˜€ …Á•¹‘¥¹œ¤É•ÑÕÉ¸ì(€€€€€Ñ¡¥Ì¹}Á•¹‘¥¹]•±½µ”€ô¹Õ±°ì(€€€€€±½‰…°¹±•…ÉQ¥µ•½ÕÐ¡Á•¹‘¥¹œ¹Ñ¥µ•È¤ì(€€€€€Á•¹‘¥¹œ¹É•©•Ð¡•ÉÉ½È¤ì(€€€ô((€€€}É•©•Ñ½¹¹•Ñ¥½¸¡½¹¹•Ñ¥½¸°½‘”°É•…Í½¸¤ì(€€€€€½¹ÍÐÉ•©•Ð€ô€ ¤€ôøì(€€€€€€€Ñ¡¥Ì¹}Í•¹¡½¹¹•Ñ¥½¸°€‰É•©•Ðˆ°ì½‘”°É•…Í½¸ô¤ì(€€€€€€€±½‰…°¹Í•ÑQ¥µ•½ÕÐ  ¤€ôøÑ¡¥Ì¹}±½Í•½¹¹•Ñ¥½¸¡½¹¹•Ñ¥½¸¤°€àÀ¤ì(€€€€€ôì(€€€€€¥˜€¡½¹¹•Ñ¥½¸€˜˜½¹¹•Ñ¥½¸¹½Á•¸¤É•©•Ð ¤ì(€€€€€•±Í”¥˜€¡½¹¹•Ñ¥½¸€˜˜ÑåÁ•½˜½¹¹•Ñ¥½¸¹½¸€ôôô€‰™Õ¹Ñ¥½¸ˆ¤½¹¹•Ñ¥½¸¹½¸ ‰½Á•¸ˆ°É•©•Ð¤ì(€€€€€•±Í”Ñ¡¥Ì¹}±½Í•½¹¹•Ñ¥½¸¡½¹¹•Ñ¥½¸¤ì(€€€ô((€€€}‘É½ÁÕ•ÍÐ¡É•½É°Ñ½­•¸¤ì(€€€€€¥˜€¡Ñ½­•¸€„ôôÑ¡¥Ì¹}Ñ½­•¸ñð€…Ñ¡¥Ì¹}½¹¹•Ñ¥½¹Ì¹¡…Ì¡É•½É¹Á±…å•É%¤¤É•ÑÕÉ¸ì(€€€€€Ñ¡¥Ì¹}½¹¹•Ñ¥½¹Ì¹‘•±•Ñ”¡É•½É¹Á±…å•É%¤ì(€€€€€½¹ÍÐÁ±…å•È€ôÑ¡¥Ì¹}Á±…å•ÉÌ¹•Ð¡É•½É¹Á±…å•É%¤ì(€€€€€Ñ¡¥Ì¹}Á±…å•ÉÌ¹‘•±•Ñ”¡É•½É¹Á±…å•É%¤ì(€€€€€Ñ¡¥Ì¹}±½Í•½¹¹•Ñ¥½¸¡É•½É¹½¹¹•Ñ¥½¸¤ì(€€€€€¥˜€¡Á±…å•È¤Ñ¡¥Ì¹}•Ù•¹ÑÌ¹•µ¥Ð¡Y9QL¹A1eI}1Y°ìÁ±…å•ÈèÁÕ‰±¥A±…å•È¡Á±…å•È¤ô¤ì(€€€€€¥˜€¡Ñ¡¥Ì¹}É½±”€ôôô€‰¡½ÍÐˆ¤Ñ¡¥Ì¹}‰É½…‘…ÍÑI½ÍÑ•È ¤ì(€€€ô((€€€}‰É½…‘…ÍÑI½ÍÑ•È ¤ì(€€€€€½¹ÍÐÁ±…å•ÉÌ€ôÑ¡¥Ì¹}ÁÕ‰±¥I½ÍÑ•È ¤ì(€€€€€Ñ¡¥Ì¹}‰É½…‘…ÍÐ ‰É½ÍÑ•Èˆ°ìÁ±…å•ÉÌô¤ì(€€€€€Ñ¡¥Ì¹}•Ù•¹ÑÌ¹•µ¥Ð¡Y9QL¹I=MQH°ìÁ±…å•ÉÌè±½¹•…Ñ„¡Á±…å•ÉÌ¤ô¤ì(€€€ô((€€€}•µ¥ÑI½ÍÑ•È ¤ì(€€€€€Ñ¡¥Ì¹}•Ù•¹ÑÌ¹•µ¥Ð¡Y9QL¹I=MQH°ìÁ±…å•ÉÌèÑ¡¥Ì¹}ÁÕ‰±¥I½ÍÑ•È ¤ô¤ì(€€€ô((€€€}ÁÕ‰±¥I½ÍÑ•È ¤ì(€€€€€½¹ÍÐÁ±…å•ÉÌ€ôÉÉ…ä¹™É½´¡Ñ¡¥Ì¹}Á±…å•ÉÌ¹Ù…±Õ•Ì ¤°ÁÕ‰±¥A±…å•È¤ì(€€€€€Á±…å•ÉÌ¹Í½ÉÐ ¡±•™Ð°É¥¡Ð¤€ôøì(€€€€€€€¥˜€¡±•™Ð¹¥Í!½ÍÐ€„ôôÉ¥¡Ð¹¥Í!½ÍÐ¤É•ÑÕÉ¸±•™Ð¹¥Í!½ÍÐ€ü€´Ä€è€Äì(€€€€€€€É•ÑÕÉ¸±•™Ð¹¥¹±½…±•½µÁ…É”¡É¥¡Ð¹¥¤ì(€€€€€ô¤ì(€€€€€É•ÑÕÉ¸Á±…å•ÉÌì(€€€ô((€€€}µ…­•5•ÍÍ…”¡ÑåÁ”°Á…å±½…¤ì(€€€€€¥˜€ …Ù…±¥‘…Ñ•A…å±½…¡ÑåÁ”°Á…å±½…¤¤ì(€€€€€€€Ñ¡É½Ü¹•ÜQåÁ•ÉÉ½È¡I•™ÕÍ•Ñ¼Í•¹…¸¥¹Ù…±¥€‘íMÑÉ¥¹œ¡ÑåÁ”¥ôÁ…å±½…¹€¤ì(€€€€€ô(€€€€€Ñ¡¥Ì¹}½ÕÑM•ÅÕ•¹”€¬ô€Äì(€€€€€½¹ÍÐµ•ÍÍ…”€ôì(€€€€€€€ÁÉ½Ñ½½°èAI=Q==0°(€€€€€€€Ù•ÉÍ¥½¸èYIM%=8°(€€€€€€€ÑåÁ”°(€€€€€€€É½½´èÑ¡¥Ì¹}É½½µ½‘”°(€€€€€€€Í•ÄèÑ¡¥Ì¹}½ÕÑM•ÅÕ•¹”°(€€€€€€€Á…å±½…è±½¹•…Ñ„¡Á…å±½…¤°(€€€€€ôì(€€€€€¥˜€¡©Í½¹	åÑ•1•¹Ñ ¡µ•ÍÍ…”¤€ø5MM}1%5%Q}	eQL¤ì(€€€€€€€Ñ¡É½Ü¹•ÜI…¹•ÉÉ½È ‰I•™ÕÍ•Ñ¼Í•¹…¸½Ù•ÉÍ¥é•@É@µ•ÍÍ…”¸ˆ¤ì(€€€€€ô(€€€€€É•ÑÕÉ¸µ•ÍÍ…”ì(€€€ô((€€€}Í•¹‘Q½!½ÍÐ¡ÑåÁ”°Á…å±½…¤ì(€€€€€¥˜€ …Ñ¡¥Ì¹}¡½ÍÑ½¹¹•Ñ¥½¸ñð€…Ñ¡¥Ì¹}¡½ÍÑ½¹¹•Ñ¥½¸¹½Á•¸¤É•ÑÕÉ¸™…±Í”ì(€€€€€É•ÑÕÉ¸Ñ¡¥Ì¹}Í•¹¡Ñ¡¥Ì¹}¡½ÍÑ½¹¹•Ñ¥½¸°ÑåÁ”°Á…å±½…¤ì(€€€ô((€€€}‰É½…‘…ÍÐ¡ÑåÁ”°Á…å±½…¤ì(€€€€€±•ÐÍ•¹Ð€ô€Àì(€€€€€½¹ÍÐµ•ÍÍ…”€ôÑ¡¥Ì¹}µ…­•5•ÍÍ…”¡ÑåÁ”°Á…å±½…¤ì(€€€€€™½È€¡½¹ÍÐÉ•½É½˜Ñ¡¥Ì¹}½¹¹•Ñ¥½¹Ì¹Ù…±Õ•Ì ¤¤ì(€€€€€€€¥˜€¡É•½É¹½Á•¹•€˜˜Ñ¡¥Ì¹}Í•¹‘5•ÍÍ…”¡É•½É¹½¹¹•Ñ¥½¸°µ•ÍÍ…”¤¤Í•¹Ð€¬ô€Äì(€€€€€ô(€€€€€É•ÑÕÉ¸Í•¹Ðì(€€€ô((€€€}Í•¹¡½¹¹•Ñ¥½¸°ÑåÁ”°Á…å±½…¤ì(€€€€€É•ÑÕÉ¸Ñ¡¥Ì¹}Í•¹‘5•ÍÍ…”¡½¹¹•Ñ¥½¸°Ñ¡¥Ì¹}µ…­•5•ÍÍ…”¡ÑåÁ”°Á…å±½…¤¤ì(€€€ô((€€€}Í•¹‘5•ÍÍ…”¡½¹¹•Ñ¥½¸°µ•ÍÍ…”¤ì(€€€€€¥˜€ …½¹¹•Ñ¥½¸ñð€…½¹¹•Ñ¥½¸¹½Á•¸ñðÑåÁ•½˜½¹¹•Ñ¥½¸¹Í•¹€„ôô€‰™Õ¹Ñ¥½¸ˆ¤É•ÑÕÉ¸™…±Í”ì(€€€€€ÑÉäì(€€€€€€€½¹¹•Ñ¥½¸¹Í•¹¡µ•ÍÍ…”¤ì(€€€€€€€É•ÑÕÉ¸ÑÉÕ”ì(€€€€€ô…Ñ €¡•ÉÉ½È¤ì(€€€€€€€Ñ¡¥Ì¹}•µ¥ÑÉÉ½È ‰Í•¹µ™…¥±•ˆ°Á••ÉÉÉ½É5•ÍÍ…”¡•ÉÉ½È°€‰½Õ±¹½ÐÍ•¹@É@‘…Ñ„¸ˆ¤°ÑÉÕ”¤ì(€€€€€€€É•ÑÕÉ¸™…±Í”ì(€€€€€ô(€€€ô((€€€}…±±½ÝI…Ñ”¡É…Ñ”°µ…á¥µÕµA•ÉM•½¹¤ì(€€€€€½¹ÍÐ¹½Ü€ô…Ñ”¹¹½Ü ¤ì(€€€€€¥˜€¡¹½Ü€´É…Ñ”¹ÍÑ…ÉÑ•‘Ð€øô€ÄÀÀÀ¤ì(€€€€€€€É…Ñ”¹ÍÑ…ÉÑ•‘Ð€ô¹½Üì(€€€€€€€É…Ñ”¹½Õ¹Ð€ô€Àì(€€€€€ô(€€€€€É…Ñ”¹½Õ¹Ð€¬ô€Äì(€€€€€É•ÑÕÉ¸É…Ñ”¹½Õ¹Ð€ðôµ…á¥µÕµA•ÉM•½¹ì(€€€ô((€€€}Í•ÑMÑ…ÑÕÌ¡ÍÑ…ÑÕÌ°É•…Í½¸°•ÉÉ½É½‘”¤ì(€€€€€Ñ¡¥Ì¹}ÍÑ…ÑÕÌ€ôÍÑ…ÑÕÌì(€€€€€Ñ¡¥Ì¹}µ½‘”€ôÍÑ…ÑÕÌ€ôôô€‰½¹¹•Ñ¥¹œˆ€ü€‰½¹¹•Ñ¥¹œˆ€èl‰½¹¹•Ñ•ˆ°€‰‘•É…‘•‰t¹¥¹±Õ‘•Ì¡ÍÑ…ÑÕÌ¤€ü€‰½¹±¥¹”ˆ€è€‰½™™±¥¹”ˆì(€€€€€Ñ¡¥Ì¹}É•…Í½¸€ôÉ•…Í½¸ì(€€€€€Ñ¡¥Ì¹}•ÉÉ½É½‘”€ô•ÉÉ½É½‘”ì(€€€€€Ñ¡¥Ì¹}•Ù•¹ÑÌ¹•µ¥Ð¡Y9QL¹MQQUL°Ñ¡¥Ì¹•ÑMÑ…Ñ” ¤¤ì(€€€ô((€€€}•µ¥ÑÉÉ½È¡½‘”°µ•ÍÍ…”°É•½Ù•É…‰±”¤ì(€€€€€Ñ¡¥Ì¹}•Ù•¹ÑÌ¹•µ¥Ð¡Y9QL¹II=H°ì½‘”°µ•ÍÍ…”°É•½Ù•É…‰±”èÉ•½Ù•É…‰±”€ôôôÑÉÕ”ô¤ì(€€€ô((€€€}™…¥±=™™±¥¹”¡É•…Í½¸°½‘”°Ñ½­•¸¤ì(€€€€€¥˜€¡Ñ½­•¸€„ôôÕ¹‘•™¥¹•€˜˜Ñ½­•¸€„ôôÑ¡¥Ì¹}Ñ½­•¸¤É•ÑÕÉ¸ì(€€€€€Ñ¡¥Ì¹}Ñ½­•¸€¬ô€Äì(€€€€€Ñ¡¥Ì¹}±½Í•I•Í½ÕÉ•Ì ¤ì(€€€€€Ñ¡¥Ì¹}Á±…å•ÉÌ¹±•…È ¤ì(€€€€€Ñ¡¥Ì¹}Í•±™%€ô¹Õ±°ì(€€€€€Ñ¡¥Ì¹}É½±”€ô€‰¹½¹”ˆì(€€€€€Ñ¡¥Ì¹}ÍÑ…ÉÑ•€ô™…±Í”ì(€€€€€Ñ¡¥Ì¹}ÍÑ…ÉÑ%¹™¼€ô¹Õ±°ì(€€€€€Ñ¡¥Ì¹}½Õ¹Ñ‘½Ý¹Ñ¥Ù”€ô™…±Í”ì(€€€€€Ñ¡¥Ì¹}½Õ¹Ñ‘½Ý¹I•µ…¥¹¥¹œ€ô€Àì(€€€€€Ñ¡¥Ì¹}Í•ÑMÑ…ÑÕÌ ‰½™™±¥¹”ˆ°É•…Í½¸°½‘”ñð€‰½™™±¥¹”ˆ¤ì(€€€€€Ñ¡¥Ì¹}•µ¥ÑI½ÍÑ•È ¤ì(€€€ô((€€€}±½Í•I•Í½ÕÉ•Ì ¤ì(€€€€€Ñ¡¥Ì¹}±•…É½Õ¹Ñ‘½Ý¹Q¥µ•ÉÌ ¤ì(€€€€€¥˜€¡Ñ¡¥Ì¹}Á•¹‘¥¹]•±½µ”¤ì(€€€€€€€½¹ÍÐÁ•¹‘¥¹œ€ôÑ¡¥Ì¹}Á•¹‘¥¹]•±½µ”ì(€€€€€€€Ñ¡¥Ì¹}Á•¹‘¥¹]•±½µ”€ô¹Õ±°ì(€€€€€€€±½‰…°¹±•…ÉQ¥µ•½ÕÐ¡Á•¹‘¥¹œ¹Ñ¥µ•È¤ì(€€€€€€€Á•¹‘¥¹œ¹É•©•Ð¡µ…­•ÉÉ½È ‰Í•ÍÍ¥½¸µ±½Í•ˆ°€‰Q¡”½¹¹•Ñ¥½¸…ÑÑ•µÁÐÝ…Ì±½Í•¸ˆ¤¤ì(€€€€€ô(€€€€€¥˜€¡Ñ¡¥Ì¹}¡½ÍÑ½¹¹•Ñ¥½¸¤Ñ¡¥Ì¹}±½Í•½¹¹•Ñ¥½¸¡Ñ¡¥Ì¹}¡½ÍÑ½¹¹•Ñ¥½¸¤ì(€€€€€Ñ¡¥Ì¹}¡½ÍÑ½¹¹•Ñ¥½¸€ô¹Õ±°ì(€€€€€™½È€¡½¹ÍÐÉ•½É½˜Ñ¡¥Ì¹}½¹¹•Ñ¥½¹Ì¹Ù…±Õ•Ì ¤¤Ñ¡¥Ì¹}±½Í•½¹¹•Ñ¥½¸¡É•½É¹½¹¹•Ñ¥½¸¤ì(€€€€€Ñ¡¥Ì¹}½¹¹•Ñ¥½¹Ì¹±•…È ¤ì(€€€€€¥˜€¡Ñ¡¥Ì¹}Á••È¤ì(€€€€€€€½¹ÍÐÁ••È€ôÑ¡¥Ì¹}Á••Èì(€€€€€€€Ñ¡¥Ì¹}Á••È€ô¹Õ±°ì(€€€€€€€ÑÉäì(€€€€€€€€€¥˜€ …Á••È¹‘•ÍÑÉ½å•€˜˜ÑåÁ•½˜Á••È¹‘•ÍÑÉ½ä€ôôô€‰™Õ¹Ñ¥½¸ˆ¤Á••È¹‘•ÍÑÉ½ä ¤ì(€€€€€€€ô…Ñ €¡}•ÉÉ½È¤ì(€€€€€€€€€€¼¼±•…¹ÕÀ¥Ì‰•ÍÐµ•™™½ÉÐ…¹Í•ÍÍ¥½¸Ñ½­•¹Ì¥¹½É”±…Ñ”…±±‰…­Ì¸(€€€€€€€ô(€€€€€ô(€€€ô((€€€}±½Í•½¹¹•Ñ¥½¸¡½¹¹•Ñ¥½¸¤ì(€€€€€¥˜€ …½¹¹•Ñ¥½¸ñðÑåÁ•½˜½¹¹•Ñ¥½¸¹±½Í”€„ôô€‰™Õ¹Ñ¥½¸ˆ¤É•ÑÕÉ¸ì(€€€€€ÑÉäì(€€€€€€€½¹¹•Ñ¥½¸¹±½Í” ¤ì(€€€€€ô…Ñ €¡}•ÉÉ½È¤ì(€€€€€€€€¼¼±½Í¥¹œ…¸…±É•…‘ä±½Í•A••É)L…Ñ…½¹¹•Ñ¥½¸¥Ì¡…Éµ±•ÍÌ¸(€€€€€ô(€€€ô(€ô((€½¹ÍÐ‘•™…Õ±Ñ±¥•¹Ð€ô¹•Ü9•ÑÝ½É­±¥•¹Ð ¤ì(€½¹ÍÐ…Á¤€ôì(€€€ÁÉ½Ñ½½°èAI=Q==0°(€€€Ù•ÉÍ¥½¸èYIM%=8°(€€€µ…áA±…å•ÉÌè5a}A1eIL°(€€€±…ÍÍ•Ìè1MM}%L°(€€€™…¥¹Ìè%9}%L°(€€€½Õ¹Ñ‘½Ý¹M•½¹‘Ìè=U9Q=]9}M=9L°(€€€½Õ¹Ñ‘½Ý¹ÕÉ…Ñ¥½¹5Ìè=U9Q=]9}UIQ%=9}5L°(€€€•Ù•¹ÑÌèY9QL°(€€€±¥•¹Ðè‘•™…Õ±Ñ±¥•¹Ð°(€€€É•…Ñ•±¥•¹Ðè€¡½ÁÑ¥½¹Ì¤€ôø¹•Ü9•ÑÝ½É­±¥•¹Ð¡½ÁÑ¥½¹Ì¤°(€€€•¹•É…Ñ•I½½µ½‘”°(€€€¹½Éµ…±¥é•I½½µ½‘”°(€€€¥ÍA••É)MÙ…¥±…‰±”è€ ¤€ôøÑåÁ•½˜€¡±½‰…°¹A••È¤€ôôô€‰™Õ¹Ñ¥½¸ˆ°(€ôì((€l(€€€€‰½¸ˆ°(€€€€‰½¹”ˆ°(€€€€‰½™˜ˆ°(€€€€‰½¹%¹ÁÕÐˆ°(€€€€‰½¹M¹…ÁÍ¡½Ðˆ°(€€€€‰½¹½Õ¹Ñ‘½Ý¸ˆ°(€€€€‰•ÑMÑ…Ñ”ˆ°(€€€€‰¥Í=¹±¥¹”ˆ°(€€€€‰¥Í!½ÍÐˆ°(€€€€‰É•…Ñ•I½½´ˆ°(€€€€‰¡½ÍÑI½½´ˆ°(€€€€‰©½¥¹I½½´ˆ°(€€€€‰½¹¹•ÑI½½´ˆ°(€€€€‰±•…Ù•I½½´ˆ°(€€€€‰‘•ÍÑÉ½äˆ°(€€€€‰Í•ÑA±…å•É9…µ”ˆ°(€€€€‰Í•±•Ñ±…ÍÌˆ°(€€€€‰Í•Ñ1½‰‰åAÉ•Í•¹”ˆ°(€€€€‰ÕÁ‘…Ñ•1½‰‰åAÉ•Í•¹”ˆ°(€€€€‰ÍÑ…ÉÑ…µ”ˆ°(€€€€‰Í•¹‘MÑ…Ñ•M¹…ÁÍ¡½Ðˆ°(€€€€‰Í•¹‘M¹…ÁÍ¡½Ðˆ°(€€€€‰Í•¹‘%¹ÁÕÐˆ°(€€€€‰Á¥¹œˆ°(€t¹™½É…  ¡µ•Ñ¡½¤€ôøì(€€€…Á¥mµ•Ñ¡½‘t€ô‘•™…Õ±Ñ±¥•¹Ñmµ•Ñ¡½‘t¹‰¥¹¡‘•™…Õ±Ñ±¥•¹Ð¤ì(€ô¤ì((€=‰©•Ð¹‘•™¥¹•AÉ½Á•ÉÑ¥•Ì¡…Á¤°ì(€€€ÍÑ…Ñ”èì•¹Õµ•É…‰±”èÑÉÕ”°•Ðè€ ¤€ôø‘•™…Õ±Ñ±¥•¹Ð¹•ÑMÑ…Ñ” ¤ô°(€€€½¹±¥¹”èì•¹Õµ•É…‰±”èÑÉÕ”°•Ðè€ ¤€ôø‘•™…Õ±Ñ±¥•¹Ð¹¥Í=¹±¥¹” ¤ô°(€ô¤ì((€±½‰…°¹@Å9•ÑÝ½É¬€ô=‰©•Ð¹™É••é”¡…Á¤¤ì)ô¤¡Ý¥¹‘½Ü¤ì(