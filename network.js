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
  const VERSION = 1;
  const MAX_PLAYERS = 4;
  const DEFAULT_TIMEOUT_MS = 12000;
  const SNAPSHOT_LIMIT_BYTES = 128 * 1024;
  const MESSAGE_LIMIT_BYTES = 140 * 1024;
  const ROOM_PATTERN = /^[A-Z0-9]{4,10}$/;
  const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
  const KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,39}$/;
  const CLASS_IDS = Object.freeze(["archer", "medic", "chairman", "fireman"]);
  const CLASS_SET = new Set(CLASS_IDS);
  const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

  const EVENTS = Object.freeze({
    STATUS: "status",
    ERROR: "error",
    ROSTER: "roster",
    PLAYER_JOIN: "player-join",
    PLAYER_LEAVE: "player-leave",
    PRESENCE: "presence",
    CLASS_SELECTION: "class-selection",
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
      isHost: player.isHost,
    };
  }

  function isPeerId(value) {
    return typeof value === "string" && ID_PATTERN.test(value);
  }

  function validatePlayer(player) {
    return (
      hasOnlyKeys(player, ["id", "name", "classId", "isHost"]) &&
      isPeerId(player.id) &&
      isPlayerName(player.name) &&
      CLASS_SET.has(player.classId) &&
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
    if (keys.some((key) => !["name", "classId"].includes(key))) {
      throw new TypeError("Player profile contains an unsupported field.");
    }
    const normalized = {
      name: source.name === undefined ? "Player" : source.name,
      classId: source.classId === undefined ? "archer" : source.classId,
    };
    if (!isPlayerName(normalized.name)) {
      throw new TypeError("Player name must be 1-20 safe letters, numbers, spaces, dots, '_' or '-'.");
    }
    if (!CLASS_SET.has(normalized.classId)) {
      throw new TypeError(`Unknown class: ${String(normalized.classId)}`);
    }
    return normalized;
  }

  function validateStartInfo(value) {
    return (
      hasOnlyKeys(value, ["stage", "seed", "tick", "startedAt"]) &&
      isSafeInteger(value.stage, 0, 4) &&
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
      stage: source.stage === undefined ? 0 : source.stage,
      seed: source.seed === undefined ? randomUint32() : source.seed,
      tick: source.tick === undefined ? 0 : source.tick,
      startedAt: Date.now(),
    };
    if (!validateStartInfo(info)) throw new TypeError("Invalid start options.");
    return info;
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
        return hasOnlyKeys(payload, ["name"]) && isPlayerName(payload.name);
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
          typeof payload.started === "boolean" &&
          (payload.startInfo === null || validateStartInfo(payload.startInfo)) &&
          payload.started === (payload.startInfo !== null)
        );
      case "reject":
        return (
          hasOnlyKeys(payload, ["code", "reason"]) &&
          isIdentifier(payload.code, 32) &&
          isSafeNetworkText(payload.reason, 100)
        );
      case "roster":
        return hasOnlyKeys(payload, ["players"]) && validateRoster(payload.players);
      case "start":
        return hasOnlyKeys(payload, ["info"]) && validateStartInfo(payload.info);
      case "snapshot":
        return hasOnlyKeys(payload, ["state"]) && validateSnapshot(payload.state);
      default:
        return false;
    }
  }

  function validateEnvelope(message, allowedTypes, roomCode) {
    if (!hasOnlyKeys(message, ["protocol", "version", "type", "room", "seq", "payload"])) return false;
    if (
      message.protocol !== PROTOCOL ||
      message.version !== VERSION ||
      message.room !== roomCode ||
      !allowedTypes.has(message.type) ||
      !isSafeInteger(message.seq, 0, Number.MAX_SAFE_INTEGER) ||
      !validatePayload(message.type, message.payload)
    ) {
      return false;
    }
    return jsonByteLength(message) <= MESSAGE_LIMIT_BYTES;
  }

  function makeError(code, message, source) {
    const error = new Error(message);
    error.code = code;
    error.source = source || null;
    return error;
  }

  function peerErrorCode(error) {
    return String((error && (error.type || error.code)) || "peer-error");
  }

  function peerErrorMessage(error, fallback) {
    if (error && typeof error.message === "string" && error.message.length <= 160) return error.message;
    return fallback;
  }

  class SafeEmitter {
    constructor() {
      this.listeners = new Map();
    }

    on(type, listener) {
      if (typeof listener !== "function") throw new TypeError("Listener must be a function.");
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type).add(listener);
      return () => this.off(type, listener);
    }

    once(type, listener) {
      const unsubscribe = this.on(type, (detail) => {
        unsubscribe();
        listener(detail);
      });
      return unsubscribe;
    }

    off(type, listener) {
      const listeners = this.listeners.get(type);
      if (!listeners) return false;
      const removed = listeners.delete(listener);
      if (listeners.size === 0) this.listeners.delete(type);
      return removed;
    }

    emit(type, detail) {
      const listeners = this.listeners.get(type);
      if (!listeners) return;
      for (const listener of Array.from(listeners)) {
        try {
          listener(detail);
        } catch (error) {
          if (global.console && typeof global.console.error === "function") {
            global.console.error("EP1Network listener failed", error);
          }
        }
      }
    }

    clear() {
      this.listeners.clear();
    }
  }

  class NetworkClient {
    constructor(options) {
      const source = isPlainObject(options) ? options : {};
      this._options = {
        Peer: typeof source.Peer === "function" ? source.Peer : null,
        peerOptions: isPlainObject(source.peerOptions) ? source.peerOptions : {},
        timeoutMs: isSafeInteger(source.timeoutMs, 3000, 30000)
          ? source.timeoutMs
          : DEFAULT_TIMEOUT_MS,
        namespace: typeof source.namespace === "string" ? hashText(source.namespace) : defaultNamespace(),
      };
      this._events = new SafeEmitter();
      this._token = 0;
      this._peer = null;
      this._hostConnection = null;
      this._connections = new Map();
      this._players = new Map();
      this._localProfile = normalizeProfile(source.player);
      this._selfId = null;
      this._hostId = null;
      this._roomCode = null;
      this._role = "none";
      this._mode = "offline";
      this._status = "idle";
      this._reason = "Online connection has not been started.";
      this._errorCode = null;
      this._outSequence = 0;
      this._inputSequence = 0;
      this._guestLastSequence = -1;
      this._guestRate = { startedAt: 0, count: 0 };
      this._guestInvalidCount = 0;
      this._pendingWelcome = null;
      this._started = false;
      this._startInfo = null;
    }

    on(type, listener) {
      return this._events.on(type, listener);
    }

    once(type, listener) {
      return this._events.once(type, listener);
    }

    off(type, listener) {
      return this._events.off(type, listener);
    }

    getState() {
      return {
        mode: this._mode,
        status: this._status,
        reason: this._reason,
        errorCode: this._errorCode,
        online: this._mode === "online",
        peerJSAvailable: typeof this._getPeerConstructor() === "function",
        role: this._role,
        isHost: this._mode === "online" && this._role === "host",
        roomCode: this._roomCode,
        selfId: this._selfId,
        hostId: this._hostId,
        maxPlayers: MAX_PLAYERS,
        players: this._publicRoster(),
        started: this._started,
        startInfo: this._startInfo ? cloneData(this._startInfo) : null,
      };
    }

    isOnline() {
      return this._mode === "online";
    }

    isHost() {
      return this._mode === "online" && this._role === "host";
    }

    createRoom(roomCode, profile) {
      let selectedCode = roomCode;
      let selectedProfile = profile;
      if (isPlainObject(roomCode) || roomCode === undefined || roomCode === null || roomCode === "") {
        selectedProfile = isPlainObject(roomCode) ? roomCode : profile;
        selectedCode = generateRoomCode();
      }
      return this.hostRoom(selectedCode, selectedProfile);
    }

    hostRoom(roomCode, profile) {
      return this._startConnection("host", normalizeRoomCode(roomCode), profile, false);
    }

    joinRoom(roomCode, profile) {
      return this._startConnection("guest", normalizeRoomCode(roomCode), profile, false);
    }

    connectRoom(roomCode, profile) {
      return this._startConnection("host", normalizeRoomCode(roomCode), profile, true);
    }

    leaveRoom(reason) {
      this._token += 1;
      this._closeResources();
      this._players.clear();
      this._selfId = null;
      this._hostId = null;
      this._roomCode = null;
      this._role = "none";
      this._started = false;
      this._startInfo = null;
      this._setStatus("offline", reason || "You left the room.", null);
      this._emitRoster();
      return this.getState();
    }

    destroy() {
      this.leaveRoom("Network adapter was closed.");
      this._events.clear();
    }

    setPlayerName(name) {
      if (!isPlayerName(name)) throw new TypeError("Invalid player name.");
      this._localProfile.name = name;
      const self = this._players.get(this._selfId);
      if (self) {
        self.name = name;
        this._emitRoster();
        this._events.emit(EVENTS.PRESENCE, { player: publicPlayer(self) });
      }
      if (!this.isOnline()) return false;
      if (this._role === "host") {
        this._broadcastRoster();
        return true;
      }
      return this._sendToHost("presence", { name });
    }

    selectClass(classId) {
      if (!CLASS_SET.has(classId)) throw new TypeError(`Unknown class: ${String(classId)}`);
      this._localProfile.classId = classId;
      const self = this._players.get(this._selfId);
      if (self) {
        self.classId = classId;
        this._emitRoster();
        this._events.emit(EVENTS.CLASS_SELECTION, {
          playerId: self.id,
          classId,
        });
      }
      if (!this.isOnline()) return false;
      if (this._role === "host") {
        this._broadcastRoster();
        return true;
      }
      return this._sendToHost("class-select", { classId });
    }

    startGame(options) {
      if (!this.isHost()) return false;
      if (this._started) return false;
      const info = createStartInfo(options);
      this._started = true;
      this._startInfo = info;
      this._broadcast("start", { info });
      this._events.emit(EVENTS.START, { info: cloneData(info), from: this._selfId });
      return true;
    }

    sendStateSnapshot(snapshot) {
      if (!validateSnapshot(snapshot)) {
        throw new TypeError("Snapshot must be a bounded safe object containing valid 'stage' and 'tick'.");
      }
      if (!this.isHost()) return false;
      const state = cloneData(snapshot);
      this._broadcast("snapshot", { state });
      this._events.emit(EVENTS.SNAPSHOT, { state: cloneData(state), from: this._selfId });
      return true;
    }

    sendInput(input) {
      this._inputSequence += 1;
      const normalized = normalizeInput(input, this._inputSequence);
      if (!this.isOnline()) return false;
      if (this._role === "host") {
        this._events.emit(EVENTS.INPUT, {
          playerId: this._selfId,
          input: cloneData(normalized),
        });
        return true;
      }
      return this._sendToHost("input", { input: normalized });
    }

    ping() {
      if (!this.isOnline() || this._role !== "guest") return false;
      const nonce = `${Date.now().toString(36)}_${randomUint32().toString(36)}`;
      return this._sendToHost("ping", { nonce });
    }

    async _startConnection(role, roomCode, profile, fallbackToJoin) {
      const normalizedProfile = normalizeProfile(profile === undefined ? this._localProfile : profile);
      this._token += 1;
      const token = this._token;
      this._closeResources();
      this._players.clear();
      this._localProfile = normalizedProfile;
      this._selfId = null;
      this._hostId = this._hostPeerId(roomCode);
      this._roomCode = roomCode;
      this._role = role === "host" ? "pending-host" : "pending-guest";
      this._started = false;
      this._startInfo = null;
      this._outSequence = 0;
      this._inputSequence = 0;
      this._guestLastSequence = -1;
      this._guestInvalidCount = 0;
      this._setStatus("connecting", `Connecting to room ${roomCode}...`, null);

      if (typeof this._getPeerConstructor() !== "function") {
        this._failOffline(
          "PeerJS is not loaded. The game is in honest offline mode; no online players are being simulated.",
          "peerjs-missing",
          token
        );
        return this.getState();
      }

      try {
        if (role === "host") {
          try {
            await this._openAsHost(roomCode, token);
          } catch (error) {
            if (fallbackToJoin && peerErrorCode(error) === "unavailable-id" && token === this._token) {
              this._closeResources();
              this._role = "pending-guest";
              this._setStatus("connecting", `Room ${roomCode} exists; joining its first creator...`, null);
              await this._openAsGuest(roomCode, token);
            } else {
              throw error;
            }
          }
        } else {
          await this._openAsGuest(roomCode, token);
        }
      } catch (error) {
        if (token === this._token) {
          const code = peerErrorCode(error);
          let reason = "The P2P connection failed. Offline mode is active.";
          if (code === "unavailable-id") {
            reason = "That room code is already hosted. Use joinRoom() or connectRoom().";
          } else if (code === "peer-unavailable") {
            reason = "No host is available for that room code. Offline mode is active.";
          } else if (code === "join-rejected") {
            reason = peerErrorMessage(error, "The host rejected this join request.");
          } else if (code === "connection-timeout") {
            reason = "The P2P connection timed out. Offline mode is active.";
          }
          this._failOffline(reason, code, token);
        }
      }
      return this.getState();
    }

    async _openAsHost(roomCode, token) {
      const peer = await this._openPeer(this._hostPeerId(roomCode), token);
      if (token !== this._token) return;
      this._bindPeerLifecycle(peer, token);
      this._selfId = peer.id;
      this._hostId = peer.id;
      this._role = "host";
      this._players.set(peer.id, {
        id: peer.id,
        name: this._localProfile.name,
        classId: this._localProfile.classId,
        isHost: true,
      });
      peer.on("connection", (connection) => this._acceptConnection(connection, token));
      this._setStatus("connected", `Hosting room ${roomCode}.`, null);
      this._emitRoster();
    }

    async _openAsGuest(roomCode, token) {
      const peer = await this._openPeer(null, token);
      if (token !== this._token) return;
      this._bindPeerLifecycle(peer, token);
      this._selfId = peer.id;
      this._hostId = this._hostPeerId(roomCode);
      this._role = "pending-guest";

      let connection;
      try {
        connection = peer.connect(this._hostId, {
          reliable: true,
          serialization: "json",
          metadata: {
            protocol: PROTOCOL,
            version: VERSION,
            room: roomCode,
            player: {
              name: this._localProfile.name,
              classId: this._localProfile.classId,
            },
          },
        });
      } catch (error) {
        this._rejectPendingWelcome(error);
        throw error;
      }
      if (!connection || typeof connection.on !== "function") {
        throw makeError("connection-failed", "PeerJS did not create a data connection.");
      }
      const welcomePromise = this._waitForWelcome(token);
      this._hostConnection = connection;
      this._bindGuestConnection(connection, token);
      await welcomePromise;
    }

    _getPeerConstructor() {
      return this._options.Peer || global.Peer;
    }

    _hostPeerId(roomCode) {
      return `ep1-${this._options.namespace}-${roomCode.toLowerCase()}`;
    }

    _openPeer(requestedId, token) {
      return new Promise((resolve, reject) => {
        const PeerConstructor = this._getPeerConstructor();
        let peer;
        try {
          peer = requestedId
            ? new PeerConstructor(requestedId, this._options.peerOptions)
            : new PeerConstructor(undefined, this._options.peerOptions);
        } catch (error) {
          reject(error);
          return;
        }
        this._peer = peer;
        let settled = false;
        const timer = global.setTimeout(() => {
          if (settled) return;
          settled = true;
          cleanup();
          try {
            peer.destroy();
          } catch (_error) {
            // Peer construction timed out; nothing else can be recovered here.
          }
          if (this._peer === peer) this._peer = null;
          reject(makeError("connection-timeout", "PeerJS open timed out."));
        }, this._options.timeoutMs);

        const cleanup = () => {
          global.clearTimeout(timer);
          if (typeof peer.off === "function") {
            peer.off("open", onOpen);
            peer.off("error", onError);
          }
        };
        const onOpen = (id) => {
          if (settled) return;
          settled = true;
          cleanup();
          if (token !== this._token || !isPeerId(id)) {
            try {
              peer.destroy();
            } catch (_error) {
              // Stale sessions are intentionally discarded.
            }
            reject(makeError("stale-session", "The connection attempt is no longer active."));
            return;
          }
          resolve(peer);
        };
        const onError = (error) => {
          if (settled) return;
          settled = true;
          cleanup();
          try {
            peer.destroy();
          } catch (_error) {
            // Failed peers can already be destroyed by PeerJS.
          }
          if (this._peer === peer) this._peer = null;
          reject(error);
        };
        peer.on("open", onOpen);
        peer.on("error", onError);
      });
    }

    _bindPeerLifecycle(peer, token) {
      peer.on("open", () => {
        if (token !== this._token || this._status !== "degraded") return;
        this._setStatus("connected", "PeerJS signaling connection restored.", null);
      });
      peer.on("disconnected", () => {
        if (token !== this._token) return;
        this._setStatus(
          "degraded",
          "Signaling is disconnected. Existing P2P links may continue, but new players cannot join yet.",
          "signaling-disconnected"
        );
        try {
          if (!peer.destroyed && typeof peer.reconnect === "function") peer.reconnect();
        } catch (_error) {
          // The status remains explicitly degraded until PeerJS reconnects or closes.
        }
      });
      peer.on("close", () => {
        if (token === this._token) {
          this._failOffline("The PeerJS connection closed. Offline mode is active.", "peer-closed", token);
        }
      });
      peer.on("error", (error) => {
        if (token !== this._token) return;
        const code = peerErrorCode(error);
        const recoverableForHost = this._role === "host" && ["peer-unavailable", "webrtc"].includes(code);
        this._emitError(code, peerErrorMessage(error, "PeerJS reported an error."), recoverableForHost);
        if (!recoverableForHost) {
          this._failOffline("The P2P connection failed. Offline mode is active.", code, token);
        }
      });
    }

    _acceptConnection(connection, token) {
      if (token !== this._token || this._role !== "host") {
        this._closeConnection(connection);
        return;
      }
      const metadata = connection && connection.metadata;
      const playerId = connection && connection.peer;
      const validMetadata =
        hasOnlyKeys(metadata, ["protocol", "version", "room", "player"]) &&
        metadata.protocol === PROTOCOL &&
        metadata.version === VERSION &&
        metadata.room === this._roomCode &&
        hasOnlyKeys(metadata.player, ["name", "classId"]) &&
        isPlayerName(metadata.player.name) &&
        CLASS_SET.has(metadata.player.classId);

      if (!isPeerId(playerId) || !validMetadata) {
        this._rejectConnection(connection, "invalid-join", "Invalid join request.");
        return;
      }
      if (this._started) {
        this._rejectConnection(connection, "game-started", "This game has already started.");
        return;
      }
      if (this._connections.size >= MAX_PLAYERS - 1 || this._connections.has(playerId)) {
        this._rejectConnection(connection, "room-full", "This room is full.");
        return;
      }

      const record = {
        connection,
        playerId,
        profile: {
          name: metadata.player.name,
          classId: metadata.player.classId,
        },
        opened: false,
        lastSequence: -1,
        invalidCount: 0,
        rate: { startedAt: 0, count: 0 },
      };
      this._connections.set(playerId, record);

      connection.on("open", () => {
        if (token !== this._token || !this._connections.has(playerId)) {
          this._closeConnection(connection);
          return;
        }
        record.opened = true;
        const player = {
          id: playerId,
          name: record.profile.name,
          classId: record.profile.classId,
          isHost: false,
        };
        this._players.set(playerId, player);
        this._send(connection, "welcome", {
          selfId: playerId,
          hostId: this._hostId,
          players: this._publicRoster(),
          started: this._started,
          startInfo: this._startInfo ? cloneData(this._startInfo) : null,
        });
        this._events.emit(EVENTS.PLAYER_JOIN, { player: publicPlayer(player) });
        this._broadcastRoster();
      });
      connection.on("data", (message) => this._handleHostInbound(record, message, token));
      connection.on("close", () => this._dropGuest(record, token));
      connection.on("error", (error) => {
        if (token !== this._token) return;
        this._emitError(peerErrorCode(error), "A guest data connection failed.", true);
        this._dropGuest(record, token);
      });
    }

    _handleHostInbound(record, message, token) {
      if (token !== this._token || !record.opened || !this._connections.has(record.playerId)) return;
      if (!this._allowRate(record.rate, 120)) {
        record.invalidCount += 1;
        if (record.invalidCount >= 3) this._dropGuest(record, token);
        return;
      }
      if (
        !validateEnvelope(message, HOST_INBOUND_TYPES, this._roomCode) ||
        message.seq <= record.lastSequence
      ) {
        record.invalidCount += 1;
        this._emitError("invalid-payload", `Rejected invalid data from ${record.playerId}.`, true);
        if (record.invalidCount >= 3) this._dropGuest(record, token);
        return;
      }
      record.lastSequence = message.seq;
      const player = this._players.get(record.playerId);
      if (!player) return;

      switch (message.type) {
        case "presence":
          player.name = message.payload.name;
          this._events.emit(EVENTS.PRESENCE, { player: publicPlayer(player) });
          this._broadcastRoster();
          break;
        case "class-select":
          player.classId = message.payload.classId;
          this._events.emit(EVENTS.CLASS_SELECTION, {
            playerId: player.id,
            classId: player.classId,
          });
          this._broadcastRoster();
          break;
        case "input":
          this._events.emit(EVENTS.INPUT, {
            playerId: player.id,
            input: cloneData(message.payload.input),
          });
          break;
        case "ping":
          this._send(record.connection, "pong", { nonce: message.payload.nonce });
          break;
        default:
          break;
      }
    }

    _bindGuestConnection(connection, token) {
      connection.on("data", (message) => this._handleGuestInbound(message, token));
      connection.on("close", () => {
        if (token !== this._token) return;
        const error = makeError("host-disconnected", "The host connection closed.");
        if (this._pendingWelcome) this._rejectPendingWelcome(error);
        else this._failOffline("The host disconnected. Offline mode is active.", error.code, token);
      });
      connection.on("error", (error) => {
        if (token !== this._token) return;
        if (this._pendingWelcome) this._rejectPendingWelcome(error);
        else this._failOffline("The host connection failed. Offline mode is active.", peerErrorCode(error), token);
      });
    }

    _handleGuestInbound(message, token) {
      if (token !== this._token) return;
      if (!this._allowRate(this._guestRate, 120)) {
        this._guestInvalidCount += 1;
        if (this._guestInvalidCount >= 3) {
          this._failOffline("The host exceeded the safe message rate. Offline mode is active.", "rate-limit", token);
        }
        return;
      }
      if (
        !validateEnvelope(message, GUEST_INBOUND_TYPES, this._roomCode) ||
        message.seq <= this._guestLastSequence
      ) {
        this._guestInvalidCount += 1;
        this._emitError("invalid-payload", "Rejected invalid data from the host.", true);
        if (this._guestInvalidCount >= 3) {
          this._failOffline("The host sent invalid data. Offline mode is active.", "invalid-payload", token);
        }
        return;
      }
      this._guestLastSequence = message.seq;

      if (message.type === "reject") {
        const error = makeError("join-rejected", message.payload.reason);
        error.rejectCode = message.payload.code;
        this._rejectPendingWelcome(error);
        return;
      }

      if (message.type === "welcome") {
        const payload = message.payload;
        const containsSelf = payload.players.some((player) => player.id === this._selfId && !player.isHost);
        const correctHost = payload.hostId === this._hostId && payload.players.some(
          (player) => player.id === payload.hostId && player.isHost
        );
        if (payload.selfId !== this._selfId || !containsSelf || !correctHost) {
          this._rejectPendingWelcome(makeError("invalid-welcome", "The host sent an invalid roster."));
          return;
        }
        this._players = new Map(payload.players.map((player) => [player.id, cloneData(player)]));
        this._role = "guest";
        this._started = payload.started;
        this._startInfo = payload.startInfo ? cloneData(payload.startInfo) : null;
        this._setStatus("connected", `Joined room ${this._roomCode}.`, null);
        this._emitRoster();
        this._resolvePendingWelcome();
        if (this._started && this._startInfo) {
          this._events.emit(EVENTS.START, { info: cloneData(this._startInfo), from: this._hostId });
        }
        return;
      }

      if (this._role !== "guest") return;
      switch (message.type) {
        case "roster":
          if (!message.payload.players.some((player) => player.id === this._selfId)) {
            this._failOffline("The host removed this player from the roster.", "removed", token);
            return;
          }
          this._players = new Map(message.payload.players.map((player) => [player.id, cloneData(player)]));
          this._emitRoster();
          break;
        case "start":
          if (this._started) return;
          this._started = true;
          this._startInfo = cloneData(message.payload.info);
          this._events.emit(EVENTS.START, { info: cloneData(this._startInfo), from: this._hostId });
          break;
        case "snapshot":
          this._events.emit(EVENTS.SNAPSHOT, {
            state: cloneData(message.payload.state),
            from: this._hostId,
          });
          break;
        case "pong":
          this._events.emit(EVENTS.PONG, { nonce: message.payload.nonce });
          break;
        default:
          break;
      }
    }

    _waitForWelcome(token) {
      return new Promise((resolve, reject) => {
        const timer = global.setTimeout(() => {
          if (!this._pendingWelcome || this._pendingWelcome.token !== token) return;
          this._pendingWelcome = null;
          reject(makeError("connection-timeout", "Timed out waiting for the host."));
        }, this._options.timeoutMs);
        this._pendingWelcome = { token, timer, resolve, reject };
      });
    }

    _resolvePendingWelcome() {
      const pending = this._pendingWelcome;
      if (!pending) return;
      this._pendingWelcome = null;
      global.clearTimeout(pending.timer);
      pending.resolve();
    }

    _rejectPendingWelcome(error) {
      const pending = this._pendingWelcome;
      if (!pending) return;
      this._pendingWelcome = null;
      global.clearTimeout(pending.timer);
      pending.reject(error);
    }

    _rejectConnection(connection, code, reason) {
      const reject = () => {
        this._send(connection, "reject", { code, reason });
        global.setTimeout(() => this._closeConnection(connection), 80);
      };
      if (connection && connection.open) reject();
      else if (connection && typeof connection.on === "function") connection.on("open", reject);
      else this._closeConnection(connection);
    }

    _dropGuest(record, token) {
      if (token !== this._token || !this._connections.has(record.playerId)) return;
      this._connections.delete(record.playerId);
      const player = this._players.get(record.playerId);
      this._players.delete(record.playerId);
      this._closeConnection(record.connection);
      if (player) this._events.emit(EVENTS.PLAYER_LEAVE, { player: publicPlayer(player) });
      if (this._role === "host") this._broadcastRoster();
    }

    _broadcastRoster() {
      const players = this._publicRoster();
      this._broadcast("roster", { players });
      this._events.emit(EVENTS.ROSTER, { players: cloneData(players) });
    }

    _emitRoster() {
      this._events.emit(EVENTS.ROSTER, { players: this._publicRoster() });
    }

    _publicRoster() {
      const players = Array.from(this._players.values(), publicPlayer);
      players.sort((left, right) => {
        if (left.isHost !== right.isHost) return left.isHost ? -1 : 1;
        return left.id.localeCompare(right.id);
      });
      return players;
    }

    _makeMessage(type, payload) {
      if (!validatePayload(type, payload)) {
        throw new TypeError(`Refused to send an invalid ${String(type)} payload.`);
      }
      this._outSequence += 1;
      const message = {
        protocol: PROTOCOL,
        version: VERSION,
        type,
        room: this._roomCode,
        seq: this._outSequence,
        payload: cloneData(payload),
      };
      if (jsonByteLength(message) > MESSAGE_LIMIT_BYTES) {
        throw new RangeError("Refused to send an oversized P2P message.");
      }
      return message;
    }

    _sendToHost(type, payload) {
      if (!this._hostConnection || !this._hostConnection.open) return false;
      return this._send(this._hostConnection, type, payload);
    }

    _broadcast(type, payload) {
      let sent = 0;
      const message = this._makeMessage(type, payload);
      for (const record of this._connections.values()) {
        if (record.opened && this._sendMessage(record.connection, message)) sent += 1;
      }
      return sent;
    }

    _send(connection, type, payload) {
      return this._sendMessage(connection, this._makeMessage(type, payload));
    }

    _sendMessage(connection, message) {
      if (!connection || !connection.open || typeof connection.send !== "function") return false;
      try {
        connection.send(message);
        return true;
      } catch (error) {
        this._emitError("send-failed", peerErrorMessage(error, "Could not send P2P data."), true);
        return false;
      }
    }

    _allowRate(rate, maximumPerSecond) {
      const now = Date.now();
      if (now - rate.startedAt >= 1000) {
        rate.startedAt = now;
        rate.count = 0;
      }
      rate.count += 1;
      return rate.count <= maximumPerSecond;
    }

    _setStatus(status, reason, errorCode) {
      this._status = status;
      this._mode = status === "connecting" ? "connecting" : ["connected", "degraded"].includes(status) ? "online" : "offline";
      this._reason = reason;
      this._errorCode = errorCode;
      this._events.emit(EVENTS.STATUS, this.getState());
    }

    _emitError(code, message, recoverable) {
      this._events.emit(EVENTS.ERROR, { code, message, recoverable: recoverable === true });
    }

    _failOffline(reason, code, token) {
      if (token !== undefined && token !== this._token) return;
      this._token += 1;
      this._closeResources();
      this._players.clear();
      this._selfId = null;
      this._role = "none";
      this._started = false;
      this._startInfo = null;
      this._setStatus("offline", reason, code || "offline");
      this._emitRoster();
    }

    _closeResources() {
      if (this._pendingWelcome) {
        const pending = this._pendingWelcome;
        this._pendingWelcome = null;
        global.clearTimeout(pending.timer);
        pending.reject(makeError("session-closed", "The connection attempt was closed."));
      }
      if (this._hostConnection) this._closeConnection(this._hostConnection);
      this._hostConnection = null;
      for (const record of this._connections.values()) this._closeConnection(record.connection);
      this._connections.clear();
      if (this._peer) {
        const peer = this._peer;
        this._peer = null;
        try {
          if (!peer.destroyed && typeof peer.destroy === "function") peer.destroy();
        } catch (_error) {
          // Cleanup is best-effort and session tokens ignore late callbacks.
        }
      }
    }

    _closeConnection(connection) {
      if (!connection || typeof connection.close !== "function") return;
      try {
        connection.close();
      } catch (_error) {
        // Closing an already closed PeerJS DataConnection is harmless.
      }
    }
  }

  const defaultClient = new NetworkClient();
  const api = {
    protocol: PROTOCOL,
    version: VERSION,
    maxPlayers: MAX_PLAYERS,
    classes: CLASS_IDS,
    events: EVENTS,
    client: defaultClient,
    createClient: (options) => new NetworkClient(options),
    generateRoomCode,
    normalizeRoomCode,
    isPeerJSAvailable: () => typeof (global.Peer) === "function",
  };

  [
    "on",
    "once",
    "off",
    "getState",
    "isOnline",
    "isHost",
    "createRoom",
    "hostRoom",
    "joinRoom",
    "connectRoom",
    "leaveRoom",
    "destroy",
    "setPlayerName",
    "selectClass",
    "startGame",
    "sendStateSnapshot",
    "sendInput",
    "ping",
  ].forEach((method) => {
    api[method] = defaultClient[method].bind(defaultClient);
  });

  Object.defineProperties(api, {
    state: { enumerable: true, get: () => defaultClient.getState() },
    online: { enumerable: true, get: () => defaultClient.isOnline() },
  });

  global.EP1Network = Object.freeze(api);
})(window);
