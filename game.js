(() => {
  "use strict";

  const DATA = window.EP1_DATA;
  const ASSETS = window.EP1_ASSETS;
  const NET = window.EP1Network;
  if (!DATA || !ASSETS) throw new Error("ê²Œìž„ ë°ì´í„° ë˜ëŠ” ì—ì…‹ ëª¨ë“ˆì„ ë¶ˆëŸ¬ì˜¤ì§€ ëª»í–ˆìŠµë‹ˆë‹¤.");

  const { TILE, TICK_RATE, PLAYER_SPEED, JOBS, ENEMIES, STAGES } = DATA;
  const STEP = 1 / TICK_RATE;
  const VIEW = { width: 640, height: 360 };
  const DIRECTIONS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };
  const PLAYER_HEIGHT = { archer: 42, medic: 44, chairman: 42, fireman: 46 };
  const ENEMY_HEIGHT = {
    crazy: 45, giant: 66, blind: 42, athlete: 54, chef: 54, bag: 34,
    glutton: 54, girl: 45, rabbit: 58, nurse: 56, liquid: 40, tank: 70, boss: 116,
  };
  const JOB_STANDS = [
    { job: "archer", x: 238, y: 78 },
    { job: "medic", x: 315, y: 78 },
    { job: "chairman", x: 390, y: 78 },
    { job: "fireman", x: 470, y: 78 },
  ];
  const LOBBY_SOLIDS = [
    [0, 0, 640, 42], [0, 337, 640, 23], [0, 0, 20, 360], [595, 0, 45, 360],
    [176, 82, 37, 48], [257, 82, 42, 48], [357, 82, 42, 48],
    [240, 187, 107, 48], [172, 249, 42, 65], [245, 250, 42, 64],
    [314, 250, 42, 64], [382, 250, 42, 64], [0, 169, 47, 52], [559, 224, 36, 74],
  ];

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const dom = {
    entrance: $("#entrance-screen"), lobby: $("#lobby-screen"), game: $("#game-screen"),
    enter: $("#enter-button"), lobbyCanvas: $("#lobby-canvas"), gameCanvas: $("#game-canvas"),
    lobbyRoster: $("#lobby-roster"), gameRoster: $("#game-roster"), lobbyMessage: $("#lobby-message"),
    roleButtons: $$("[data-job]"), networkToggle: $("#network-toggle"), networkPanel: $("#network-panel"),
    networkClose: $("#network-close"), playerName: $("#player-name"), roomCode: $("#room-code"),
    connectRoom: $("#connect-room-button"), copyRoom: $("#copy-room-button"), networkFeedback: $("#network-feedback"),
    start: $("#start-button"), countdown: $("#countdown"), hudStage: $("#hud-stage"),
    hudTimer: $("#hud-timer"), hudLocation: $("#hud-location"), hudScore: $("#hud-score"),
    hudMission: $("#hud-mission"), bossPanel: $("#boss-panel"), bossFill: $("#boss-fill"),
    firemanGauge: $("#fireman-gauge"), fuelFill: $("#fuel-fill"), stageToast: $("#stage-toast"),
    conditionToast: $("#condition-toast"), result: $("#result-dialog"), resultKicker: $("#result-kicker"),
    resultTitle: $("#result-title"), resultCopy: $("#result-copy"), resultButton: $("#result-button"),
  };
  const lobbyContext = dom.lobbyCanvas.getContext("2d");
  const context = dom.gameCanvas.getContext("2d");
  lobbyContext.imageSmoothingEnabled = false;
  context.imageSmoothingEnabled = false;

  const controls = { keys: new Set(), justPressed: new Set() };
  const debugParameters = new URLSearchParams(location.search);
  const session = {
    screen: "entrance",
    ready: false,
    selectedJob: "archer",
    lobbyPlayer: { x: 320, y: 212, facing: "up" },
    lobbyPresenceAt: 0,
    lobbyBolts: [],
    offlineCountdown: null,
    seed: 1,
    random: Math.random,
    tick: 0,
    stageIndex: 0,
    stage: STAGES[0],
    remaining: STAGES[0].time,
    score: 0,
    camera: { x: 0, y: 0 },
    players: [],
    enemies: [],
    attacks: [],
    activatedAreas: new Set(),
    facility: null,
    key: null,
    hasKey: false,
    addClock: 0,
    toastUntil: 0,
    conditionUntil: 0,
    accumulator: 0,
    lastFrame: performance.now(),
    ended: false,
    nextStage: null,
    remoteInputs: new Map(),
    lastSnapshotTick: 0,
    lastSentInput: "",
  };

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function inside(x, y, rect) { return x >= rect[0] && x <= rect[0] + rect[2] && y >= rect[1] && y <= rect[1] + rect[3]; }
  function overlaps(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
  function makeRandom(seed) {
    let state = (seed >>> 0) || 0x9e3779b9;
    return () => {
      state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
      return (state >>> 0) / 4294967296;
    };
  }
  function roomCodeFromLocation() {
    return location.hash.replace(/^#/, "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
  }
  function setScreen(name) {
    session.screen = name;
    [["entrance", dom.entrance], ["lobby", dom.lobby], ["game", dom.game]].forEach(([key, element]) => {
      element.hidden = key !== name;
      element.classList.toggle("is-active", key === name);
    });
  }
  function isOnline() { return Boolean(NET?.getState?.().online); }
  function isHost() { const state = NET?.getState?.(); return !state?.online || state.isHost; }
  function selfId() { return NET?.getState?.().selfId || "local"; }
  function pressed(code) { return controls.justPressed.has(code); }
  function movementInput() {
    let x = 0; let y = 0;
    if (controls.keys.has("KeyA") || controls.keys.has("ArrowLeft")) x -= 1;
    if (controls.keys.has("KeyD") || controls.keys.has("ArrowRight")) x += 1;
    if (controls.keys.has("KeyW") || controls.keys.has("ArrowUp")) y -= 1;
    if (controls.keys.has("KeyS") || controls.keys.has("ArrowDown")) y += 1;
    if (x && y) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }
    return { x, y };
  }
  function facingFromMove(move, fallback) {
    if (Math.abs(move.x) > Math.abs(move.y)) return move.x < 0 ? "left" : "right";
    if (Math.abs(move.y) > 0) return move.y < 0 ? "up" : "down";
    return fallback;
  }
  function circleBlocked(x, y, radius, solids) {
    return solids.some(([rx, ry, rw, rh]) => x + radius > rx && x - radius < rx + rw && y + radius > ry && y - radius < ry + rh);
  }
  function moveCircle(actor, vx, vy, dt, solids, width, height) {
    const radius = actor.radius || 10;
    const nextX = clamp(actor.x + vx * dt, radius, width - radius);
    if (!circleBlocked(nextX, actor.y, radius, solids)) actor.x = nextX;
    const nextY = clamp(actor.y + vy * dt, radius, height - radius);
    if (!circleBlocked(actor.x, nextY, radius, solids)) actor.y = nextY;
  }

  function rosterPlayers() {
    const state = NET?.getState?.();
    if (state?.online && state.players?.length) return state.players;
    return [{ id: "local", name: dom.playerName.value.trim() || "PLAYER", classId: session.selectedJob, job: session.selectedJob, isHost: true }];
  }
  function renderRoster(target, players = rosterPlayers()) {
    target.replaceChildren();
    const actorById = new Map(session.players.map((player) => [player.id, player]));
    for (let index = 0; index < 4; index += 1) {
      const profile = players[index];
      if (!profile) continue;
      const jobId = profile.job || profile.classId || "archer";
      const actor = actorById.get(profile.id);
      const item = document.createElement("li");
      const chip = document.createElement("span"); chip.className = "job-chip"; chip.style.setProperty("--job", JOBS[jobId].color); chip.textContent = JOBS[jobId].name[0];
      const signal = document.createElement("span"); signal.className = "signal"; signal.textContent = "â–®â–®â–®";
      const label = document.createElement("span"); label.textContent = profile.name;
      if (profile.isHost) { const host = document.createElement("em"); host.className = "host"; host.textContent = "(ë°©ìž¥)"; label.append(host); }
      const condition = document.createElement("span"); condition.className = "condition"; condition.textContent = actor?.condition === "injured" ? "ë¶€ìƒ" : JOBS[jobId].name;
      item.append(chip, signal, label, condition); target.append(item);
    }
  }
  function updateNetworkUI() {
    const state = NET?.getState?.() || {};
    const online = state.online === true;
    dom.start.disabled = online && !state.isHost;
    dom.start.textContent = online && !state.isHost ? "ëŒ€ê¸°" : "ì‹œìž‘";
    dom.networkFeedback.textContent = online
      ? `${state.roomCode} Â· ${state.isHost ? "ë°©ìž¥" : "ì°¸ê°€ìž"} Â· ${state.players.length}/4`
      : (state.status === "connecting" ? "ë°©ì— ì—°ê²°í•˜ëŠ” ì¤‘ìž…ë‹ˆë‹¤." : "ì˜¤í”„ë¼ì¸ 1ì¸ í”Œë ˆì´");
    renderRoster(dom.lobbyRoster);
  }
  function selectJob(jobId) {
    if (!JOBS[jobId] || session.screen !== "lobby") return;
    const state = NET?.getState?.();
    if (state?.countdownActive || state?.started) return;
    session.selectedJob = jobId;
    dom.roleButtons.forEach((button) => button.classList.toggle("is-selected", button.dataset.job === jobId));
    dom.lobbyMessage.textContent = `${JOBS[jobId].name} ì„ íƒ Â· ${JOBS[jobId].description}`;
    try { NET?.selectClass?.(jobId); } catch (_error) { /* offline selection remains available */ }
    updateNetworkUI();
  }
  function updateLobby(dt) {
    const move = movementInput();
    session.lobbyPlayer.facing = facingFromMove(move, session.lobbyPlayer.facing);
    moveCircle(session.lobbyPlayer, move.x * PLAYER_SPEED, move.y * PLAYER_SPEED, dt, LOBBY_SOLIDS, VIEW.width, VIEW.height);
    if (pressed("KeyJ")) {
      const vector = DIRECTIONS[session.lobbyPlayer.facing];
      session.lobbyBolts.push({ x: session.lobbyPlayer.x, y: session.lobbyPlayer.y - 13, vx: vector.x * 360, vy: vector.y * 360, life: .48 });
    }
    for (const bolt of session.lobbyBolts) {
      bolt.x += bolt.vx * dt; bolt.y += bolt.vy * dt; bolt.life -= dt;
      const stand = JOB_STANDS.find((entry) => Math.abs(entry.x - bolt.x) < 20 && Math.abs(entry.y - bolt.y) < 20);
      if (stand) { selectJob(stand.job); bolt.life = 0; }
    }
    session.lobbyBolts = session.lobbyBolts.filter((bolt) => bolt.life > 0 && bolt.x > 0 && bolt.x < 640 && bolt.y > 0 && bolt.y < 360);
    const now = performance.now();
    if (now - session.lobbyPresenceAt > 100) {
      session.lobbyPresenceAt = now;
      try { NET?.setLobbyPresence?.({ x: session.lobbyPlayer.x, y: session.lobbyPlayer.y, facing: session.lobbyPlayer.facing, job: session.selectedJob }); } catch (_error) { /* connection can be absent */ }
    }
  }
  function renderLobby(now) {
    lobbyContext.clearRect(0, 0, VIEW.width, VIEW.height);
    const image = ASSETS.get("lobby");
    if (image) lobbyContext.drawImage(image, 0, 0, VIEW.width, VIEW.height);
    const state = NET?.getState?.();
    const profiles = state?.online ? state.players : [{ id: "local", x: session.lobbyPlayer.x, y: session.lobbyPlayer.y, facing: session.lobbyPlayer.facing, job: session.selectedJob }];
    for (const profile of profiles) {
      const local = profile.id === state?.selfId || (!state?.online && profile.id === "local");
      const x = local ? session.lobbyPlayer.x : profile.x;
      const y = local ? session.lobbyPlayer.y : profile.y;
      const job = local ? session.selectedJob : (profile.job || profile.classId || "archer");
      ASSETS.draw(lobbyContext, job, x, y, { now, height: PLAYER_HEIGHT[job], flipX: (local ? session.lobbyPlayer.facing : profile.facing) === "left" });
    }
    for (const stand of JOB_STANDS) {
      lobbyContext.strokeStyle = stand.job === session.selectedJob ? "#fff451" : "rgba(255,255,255,.35)";
      lobbyContext.lineWidth = stand.job === session.selectedJob ? 2 : 1;
      lobbyContext.strokeRect(Math.round(stand.x - 17), Math.round(stand.y - 17), 34, 34);
    }
    lobbyContext.fillStyle = "#f7f1cb";
    for (const bolt of session.lobbyBolts) lobbyContext.fillRect(Math.round(bolt.x - 5), Math.round(bolt.y - 1), 10, 2);
    renderRoster(dom.lobbyRoster, rosterPlayers());
  }

  function spawnEnemy(type, x, y) {
    const definition = ENEMIES[type];
    if (!definition) return null;
    const enemy = {
      id: `${type}-${session.tick}-${session.enemies.length}-${Math.floor(session.random() * 9999)}`,
      type, x, y, radius: type === "boss" ? 24 : (type === "tank" ? 18 : 11),
      hp: definition.hp, maxHp: definition.hp, speed: definition.speed,
      stun: 0, dead: false, reviving: false, reviveAt: 0, summonClock: 0,
      primed: 0, facing: "down",
    };
    session.enemies.push(enemy);
    return enemy;
  }
  function safeSpawn(area, index, count) {
    const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
    const row = Math.floor(index / cols); const col = index % cols;
    const x = area[0] + 48 + (col + 0.5) * Math.max(38, (area[2] - 96) / cols);
    const y = area[1] + 60 + (row + 0.5) * 66;
    return { x: clamp(x, 40, session.stage.width - 40), y: clamp(y, 44, session.stage.height - 40) };
  }
  function activateArea(index, area) {
    if (session.activatedAreas.has(index)) return;
    session.activatedAreas.add(index);
    let cursor = 0;
    const total = area.enemies.reduce((sum, entry) => sum + entry[1], 0);
    for (const [type, count] of area.enemies) {
      for (let n = 0; n < count; n += 1) {
        const point = safeSpawn(area.at, cursor, total); cursor += 1;
        spawnEnemy(type, point.x, point.y);
      }
    }
    showStageToast("ê²½ê³ ! ì¢€ë¹„ ì§„ê²©!", 1600);
  }
  function createPlayers() {
    const profiles = rosterPlayers();
    session.players = profiles.map((profile, index) => ({
      id: profile.id || `player-${index}`, name: profile.name || `PLAYER ${index + 1}`,
      job: profile.job || profile.classId || (index === 0 ? session.selectedJob : "archer"),
      x: session.stage.start[0] - index * 22, y: session.stage.start[1] + (index % 2) * 20,
      radius: 10, facing: "up", condition: "healthy", injuredAt: 0, selfHealAt: 0,
      healProgress: 0, cooldown: 0, fuel: JOBS.fireman.maxFuel, attackHeld: false,
    }));
    if (!session.players.some((player) => player.id === selfId())) session.players[0].id = selfId();
  }
  function loadStage(index, seed = session.seed) {
    session.stageIndex = clamp(Number(index) || 0, 0, 4);
    session.stage = STAGES[session.stageIndex];
    session.seed = seed >>> 0;
    session.random = makeRandom((session.seed + session.stageIndex * 0x9e3779b9) >>> 0);
    session.tick = 0; session.remaining = session.stage.time; session.enemies = []; session.attacks = [];
    session.activatedAreas = new Set(); session.facility = null; session.key = null; session.hasKey = false;
    session.addClock = 0; session.ended = false; session.nextStage = null; session.remoteInputs.clear();
    createPlayers();
    if (session.stage.facility) session.facility = { ...session.stage.facility, maxHp: session.stage.facility.hp, dead: false };
    if (session.stage.keySpots?.length) {
      const spot = session.stage.keySpots[Math.floor(session.random() * session.stage.keySpots.length)];
      session.key = { x: spot[0], y: spot[1], found: false };
    }
    if (session.stage.boss) spawnEnemy("boss", session.stage.boss.x, session.stage.boss.y);
    for (const fixed of session.stage.fixedEnemies || []) spawnEnemy(fixed[0], fixed[1], fixed[2]);
    for (const add of session.stage.adds || []) spawnEnemy(add[0], add[1], add[2]);
    session.camera.x = clamp(session.stage.startãnö¶‰žËkºwµçl(€€€¥˜€¡Í¹…ÁÍ¡½Ð¹Ñ¥¬€ðÍ•ÍÍ¥½¸¹Ñ¥¬€´€ÄÀ¤É•ÑÕÉ¸ì(€€€Í•ÍÍ¥½¸¹Ñ¥¬€ôÍ¹…ÁÍ¡½Ð¹Ñ¥¬ìÍ•ÍÍ¥½¸¹É•µ…¥¹¥¹œ€ôÍ¹…ÁÍ¡½Ð¹Ñ¥µ”ìÍ•ÍÍ¥½¸¹Í½É”€ôÍ¹…ÁÍ¡½Ð¹Í½É”ì(€€€½¹ÍÐÁÉ½™¥±•5…À€ô¹•Ü5…À¡É½ÍÑ•ÉA±…å•ÉÌ ¤¹µ…À ¡ÁÉ½™¥±”¤€ôømÁÉ½™¥±”¹¥°ÁÉ½™¥±•t¤¤ì(€€€Í•ÍÍ¥½¸¹Á±…å•ÉÌ€ôÍ¹…ÁÍ¡½Ð¹Á±…å•ÉÌ¹µ…À ¡À¤€ôø€¡ì¥èÀ¹¥°¹…µ”èÁÉ½™¥±•5…À¹•Ð¡À¹¥¤ü¹¹…µ”ñð€‰A1eHˆ°©½ˆèÀ¹¨°àèÀ¹à°äèÀ¹ä°É…‘¥ÕÌè€ÄÀ°™…¥¹œèÀ¹˜°½¹‘¥Ñ¥½¸èÀ¹Œ°½½±‘½Ý¸èÀ¹°™Õ•°èÀ¹™Õ•°°…ÑÑ…­!•±è™…±Í”°¡•…±AÉ½É•ÍÌè€Àô¤¤ì(€€€Í•ÍÍ¥½¸¹•¹•µ¥•Ì€ôÍ¹…ÁÍ¡½Ð¹•¹•µ¥•Ì¹µ…À ¡”¤€ôø€¡ì¥è”¹¥°ÑåÁ”è”¹Ð°àè”¹à°äè”¹ä°¡Àè”¹¡À°µ…á!Àè”¹´°‘•…è”¹°É•Ù¥Ù¥¹œè”¹È°™…¥¹œè”¹˜°É…‘¥ÕÌè”¹Ð€ôôô€‰‰½ÍÌˆ€ü€ÈÐ€è€ÄÄ°ÍÑÕ¸è€À°ÍÁ••è95%Mm”¹Ñt¹ÍÁ••ô¤¤ì(€€€¥˜€¡Í•ÍÍ¥½¸¹™…¥±¥Ñä€˜˜Í¹…ÁÍ¡½Ð¹™…¥±¥Ñä¤=‰©•Ð¹…ÍÍ¥¸¡Í•ÍÍ¥½¸¹™…¥±¥Ñä°Í¹…ÁÍ¡½Ð¹™…¥±¥Ñä¤ì(€€€¥˜€¡Í•ÍÍ¥½¸¹­•ä¤ìÍ•ÍÍ¥½¸¹­•ä¹à€ôÍ¹…ÁÍ¡½Ð¹­•ä¹àìÍ•ÍÍ¥½¸¹­•ä¹ä€ôÍ¹…ÁÍ¡½Ð¹­•ä¹äìÍ•ÍÍ¥½¸¹­•ä¹™½Õ¹€ôÍ¹…ÁÍ¡½Ð¹­•ä¹™½Õ¹ìÍ•ÍÍ¥½¸¹¡…Í-•ä€ôÍ¹…ÁÍ¡½Ð¹­•ä¹¡…Ììô(€€€Í•ÍÍ¥½¸¹…Ñ¥Ù…Ñ•‘É•…Ì€ô¹•ÜM•Ð¡Í¹…ÁÍ¡½Ð¹…É•…Ì¤ìÕÁ‘…Ñ•…µ•É„ ¤ìÕÁ‘…Ñ•!U ¤ì(€€€¥˜€¡Í¹…ÁÍ¡½Ð¹•¹‘•€˜˜€…Í•ÍÍ¥½¸¹•¹‘•¤ìÍ•ÍÍ¥½¸¹•¹‘•€ôÑÉÕ”ìÍ¡½Ý½¹‘¥Ñ¥½¸ ‹®Â§²z—²vÐƒ®.“²v0ƒ²*“¶3²vÓ²ž®–ðƒ²’®æ¶VcªÎ€ƒ²z#²*×®.#®.¸ˆ°€ÌÀÀÀ¤ìô(€ô((€™Õ¹Ñ¥½¸™½Éµ…ÑQ¥µ•È¡Í•½¹‘Ì¤ì(€€€½¹ÍÐÙ…±Õ”€ô5…Ñ ¹µ…à À°Í•½¹‘Ì¤ì½¹ÍÐµ¥¹ÕÑ•Ì€ô5…Ñ ¹™±½½È¡Ù…±Õ”€¼€ØÀ¤ì½¹ÍÐÉ•ÍÐ€ô5…Ñ ¹™±½½È¡Ù…±Õ”€”€ØÀ¤ì½¹ÍÐÑ•¹Ñ €ô5…Ñ ¹™±½½È ¡Ù…±Õ”€”€Ä¤€¨€ÄÀ¤ì(€€€É•ÑÕÉ¸€‘íµ¥¹ÕÑ•Íôè‘íMÑÉ¥¹œ¡É•ÍÐ¤¹Á…‘MÑ…ÉÐ È°€ˆÀˆ¥ôè‘íÑ•¹Ñ¡õ€ì(€ô(€™Õ¹Ñ¥½¸ÕÁ‘…Ñ•!U ¤ì(€€€‘½´¹¡Õ‘MÑ…”¹Ñ•áÑ½¹Ñ•¹Ð€ôMQ€‘íÍ•ÍÍ¥½¸¹ÍÑ…•%¹‘•áô€¼€Ñ€ì(€€€‘½´¹¡Õ‘Q¥µ•È¹Ñ•áÑ½¹Ñ•¹Ð€ô™½Éµ…ÑQ¥µ•È¡Í•ÍÍ¥½¸¹É•µ…¥¹¥¹œ¤ì(€€€‘½´¹¡Õ‘1½…Ñ¥½¸¹Ñ•áÑ½¹Ñ•¹Ð€ôÍ•ÍÍ¥½¸¹ÍÑ…”¹Ñ¥Ñ±”ì(€€€‘½´¹¡Õ‘M½É”¹Ñ•áÑ½¹Ñ•¹Ð€ôÍ•ÍÍ¥½¸¹Í½É”¹Ñ½1½…±•MÑÉ¥¹œ ‰­¼µ-Hˆ¤ì(€€€±•Ðµ¥ÍÍ¥½¸€ôÍ•ÍÍ¥½¸¹ÍÑ…”¹½‰©•Ñ¥Ù”ì(€€€¥˜€¡Í•ÍÍ¥½¸¹ÍÑ…•%¹‘•à€ôôô€È€˜˜Í•ÍÍ¥½¸¹™…¥±¥Ñä¤µ¥ÍÍ¥½¸€ôÍ•ÍÍ¥½¸¹™…¥±¥Ñä¹‘•…€ü€‹²ÚsªÖ³®†pƒ²vÓ®>g¶Vc²ã²jP¸ˆ€èƒ²‚s²†Àƒ².s²ƒ¶23ªÒÐ€‘í5…Ñ ¹µ…à À°Í•ÍÍ¥½¸¹™…¥±¥Ñä¹¡À¥ô€¼€‘íÍ•ÍÍ¥½¸¹™…¥±¥Ñä¹µ…á!Áõ€ì(€€€¥˜€¡Í•ÍÍ¥½¸¹ÍÑ…•%¹‘•à€ôôô€Ì¤µ¥ÍÍ¥½¸€ôÍ•ÍÍ¥½¸¹¡…Í-•ä€ü€‹ªÖC²z—².ƒ²zªÖ³®†pƒ²vÓ®>g¶Vc²ã²jP¸ˆ€èÍ•ÍÍ¥½¸¹ÍÑ…”¹½‰©•Ñ¥Ù”ì(€€€‘½´¹¡Õ‘5¥ÍÍ¥½¸¹Ñ•áÑ½¹Ñ•¹Ð€ôµ¥ÍÍ¥½¸ì(€€€½¹ÍÐ‰½ÍÌ€ôÍ•ÍÍ¥½¸¹•¹•µ¥•Ì¹™¥¹ ¡•¹•µä¤€ôø•¹•µä¹ÑåÁ”€ôôô€‰‰½ÍÌˆ¤ì(€€€‘½´¹‰½ÍÍA…¹•°¹¡¥‘‘•¸€ô€…‰½ÍÌì(€€€¥˜€¡‰½ÍÌ¤‘½´¹‰½ÍÍ¥±°¹ÍÑå±”¹Ý¥‘Ñ €ô€‘í±…µÀ¡‰½ÍÌ¹¡À€¼‰½ÍÌ¹µ…á!À€¨€ÄÀÀ°€À°€ÄÀÀ¥ô•€ì(€€€½¹ÍÐ±½…°€ôÍ•ÍÍ¥½¸¹Á±…å•ÉÌ¹™¥¹ ¡Á±…å•È¤€ôøÁ±…å•È¹¥€ôôôÍ•±™% ¤¤ñðÍ•ÍÍ¥½¸¹Á±…å•ÉÍlÁtì(€€€‘½´¹™¥É•µ…¹…Õ”¹¡¥‘‘•¸€ô±½…°ü¹©½ˆ€„ôô€‰™¥É•µ…¸ˆì(€€€¥˜€¡±½…°ü¹©½ˆ€ôôô€‰™¥É•µ…¸ˆ¤‘½´¹™Õ•±¥±°¹ÍÑå±”¹Ý¥‘Ñ €ô€‘í±…µÀ¡±½…°¹™Õ•°€¼)=	L¹™¥É•µ…¸¹µ…áÕ•°€¨€ÄÀÀ°€À°€ÄÀÀ¥ô•€ì(€€€É•¹‘•ÉI½ÍÑ•È¡‘½´¹…µ•I½ÍÑ•È°É½ÍÑ•ÉA±…å•ÉÌ ¤¤ì(€ô(€™Õ¹Ñ¥½¸Í¡½ÝMÑ…•Q½…ÍÐ¡Ñ•áÐ°‘ÕÉ…Ñ¥½¸€ô€ÄÀÀÀ¤ì(€€€‘½´¹ÍÑ…•Q½…ÍÐ¹Ñ•áÑ½¹Ñ•¹Ð€ôÑ•áÐì‘½´¹ÍÑ…•Q½…ÍÐ¹±…ÍÍ1¥ÍÐ¹…‘ ‰¥ÌµÙ¥Í¥‰±”ˆ¤ìÍ•ÍÍ¥½¸¹Ñ½…ÍÑU¹Ñ¥°€ôÁ•É™½Éµ…¹”¹¹½Ü ¤€¬‘ÕÉ…Ñ¥½¸ì(€ô(€™Õ¹Ñ¥½¸Í¡½Ý½¹‘¥Ñ¥½¸¡Ñ•áÐ°‘ÕÉ…Ñ¥½¸€ô€ÄÐÀÀ¤ì(€€€‘½´¹½¹‘¥Ñ¥½¹Q½…ÍÐ¹Ñ•áÑ½¹Ñ•¹Ð€ôÑ•áÐì‘½´¹½¹‘¥Ñ¥½¹Q½…ÍÐ¹±…ÍÍ1¥ÍÐ¹…‘ ‰¥ÌµÙ¥Í¥‰±”ˆ¤ìÍ•ÍÍ¥½¸¹½¹‘¥Ñ¥½¹U¹Ñ¥°€ôÁ•É™½Éµ…¹”¹¹½Ü ¤€¬‘ÕÉ…Ñ¥½¸ì(€ô(€™Õ¹Ñ¥½¸ÍÉ••¹A½¥¹Ð¡…Ñ½È¤ìÉ•ÑÕÉ¸ìàè…Ñ½È¹à€´Í•ÍÍ¥½¸¹…µ•É„¹à°äè…Ñ½È¹ä€´Í•ÍÍ¥½¸¹…µ•É„¹äôìô(€™Õ¹Ñ¥½¸‘É…Ý!•…±Ñ ¡…Ñ½È°Á½¥¹Ð¤ì(€€€¥˜€¡…Ñ½È¹¡À€øô…Ñ½È¹µ…á!Àñð…Ñ½È¹‘•…¤É•ÑÕÉ¸ì(€€€½¹ÍÐÝ¥‘Ñ €ô…Ñ½È¹ÑåÁ”€ôôô€‰‰½ÍÌˆ€ü€ÜÀ€è€ÌÐì½¹ÍÐÉ…Ñ¥¼€ô±…µÀ¡…Ñ½È¹¡À€¼…Ñ½È¹µ…á!À°€À°€Ä¤ì(€€€½¹Ñ•áÐ¹™¥±±MÑå±”€ô€ˆŒÄÄÄˆì½¹Ñ•áÐ¹™¥±±I•Ð¡5…Ñ ¹É½Õ¹¡Á½¥¹Ð¹à€´Ý¥‘Ñ €¼€È¤°5…Ñ ¹É½Õ¹¡Á½¥¹Ð¹ä€´€¡95e}!%!Qm…Ñ½È¹ÑåÁ•tñð€ÐÐ¤€´€Ü¤°Ý¥‘Ñ °€Ô¤ì(€€€½¹Ñ•áÐ¹™¥±±MÑå±”€ôÉ…Ñ¥¼€ø€¸Ð€ü€ˆ”ØÉˆÉˆˆ€è€ˆ™™˜ÈÀˆì½¹Ñ•áÐ¹™¥±±I•Ð¡5…Ñ ¹É½Õ¹¡Á½¥¹Ð¹à€´Ý¥‘Ñ €¼€È€¬€Ä¤°5…Ñ ¹É½Õ¹¡Á½¥¹Ð¹ä€´€¡95e}!%!Qm…Ñ½È¹ÑåÁ•tñð€ÐÐ¤€´€Ø¤°5…Ñ ¹É½Õ¹ ¡Ý¥‘Ñ €´€È¤€¨É…Ñ¥¼¤°€Ì¤ì(€ô(€™Õ¹Ñ¥½¸‘É…ÝÑÑ…­•±±Ì¡…ÑÑ…¬¤ì(€€€½¹Ñ•áÐ¹Í…Ù” ¤ì½¹Ñ•áÐ¹ÑÉ…¹Í±…Ñ” µÍ•ÍÍ¥½¸¹…µ•É„¹à°€µÍ•ÍÍ¥½¸¹…µ•É„¹ä¤ì(€€€½¹Ñ•áÐ¹™¥±±MÑå±”€ô…ÑÑ…¬¹©½ˆ€ôôô€‰™¥É•µ…¸ˆ€ü€‰É‰„ ÈÔÔ°ÈÌÀ°ÄÀÀ°¸ÈÔ¤ˆ€è€‰É‰„ ÈÔÔ°ÈÔÔ°ÈÔÔ°¸Äà¤ˆì(€€€½¹Ñ•áÐ¹ÍÑÉ½­•MÑå±”€ô)=	Mm…ÑÑ…¬¹©½‰t¹½±½Èì½¹Ñ•áÐ¹±¥¹•]¥‘Ñ €ô€Äì(€€€½¹Ñ•áÐ¹™¥±±I•Ð¡…ÑÑ…¬¹à°…ÑÑ…¬¹ä°…ÑÑ…¬¹Ü°…ÑÑ…¬¹ ¤ì(€€€™½È€¡±•Ðà€ô…ÑÑ…¬¹àìà€ðô…ÑÑ…¬¹à€¬…ÑÑ…¬¹Üìà€¬ôQ%1¤ì½¹Ñ•áÐ¹‰•¥¹A…Ñ  ¤ì½¹Ñ•áÐ¹µ½Ù•Q¼¡à°…ÑÑ…¬¹ä¤ì½¹Ñ•áÐ¹±¥¹•Q¼¡à°…ÑÑ…¬¹ä€¬…ÑÑ…¬¹ ¤ì½¹Ñ•áÐ¹ÍÑÉ½­” ¤ìô(€€€™½È€¡±•Ðä€ô…ÑÑ…¬¹äìä€ðô…ÑÑ…¬¹ä€¬…ÑÑ…¬¹ ìä€¬ôQ%1¤ì½¹Ñ•áÐ¹‰•¥¹A…Ñ  ¤ì½¹Ñ•áÐ¹µ½Ù•Q¼¡…ÑÑ…¬¹à°ä¤ì½¹Ñ•áÐ¹±¥¹•Q¼¡…ÑÑ…¬¹à€¬…ÑÑ…¬¹Ü°ä¤ì½¹Ñ•áÐ¹ÍÑÉ½­” ¤ìô(€€€½¹Ñ•áÐ¹É•ÍÑ½É” ¤ì(€ô(€™Õ¹Ñ¥½¸É•¹‘•É…µ”¡¹½Ü¤ì(€€€½¹Ñ•áÐ¹±•…ÉI•Ð À°€À°Y%\¹Ý¥‘Ñ °Y%\¹¡•¥¡Ð¤ì(€€€½¹ÍÐµ…À€ôMMQL¹•Ð¡ÍÑ…”‘íÍ•ÍÍ¥½¸¹ÍÑ…•%¹‘•áõ€¤ì(€€€¥˜€¡µ…À¤½¹Ñ•áÐ¹‘É…Ý%µ…”¡µ…À°€µ5…Ñ ¹É½Õ¹¡Í•ÍÍ¥½¸¹…µ•É„¹à¤°€µ5…Ñ ¹É½Õ¹¡Í•ÍÍ¥½¸¹…µ•É„¹ä¤¤ì(€€€€¼¼ƒªÖ³¶bTƒ®ç¶fPƒ¶R®‚#²z²^@ƒªÎƒ²‚W®Bc²ZÐƒ²z#®6`ƒ¶²vÓ®¢ã
ß®ª®.£
ß²‚C²"c®ž0ƒªÂ®š³ªÎ€°(€€€€¼¼ƒªÂg²v ƒ²r²æc²v`ƒ².“².sªÂ!UªÂ ƒ¶b²z°ƒ²¶s®–ðƒ¶Fs².s¶Vs®.¸(€€€½¹Ñ•áÐ¹™¥±±MÑå±”€ô€‰É‰„ Ð°Ð°Ð°¸äÐ¤ˆì(€€€½¹Ñ•áÐ¹™¥±±I•Ð À°€À°Y%\¹Ý¥‘Ñ °€ÐÈ¤ì(€€€½¹Ñ•áÐ¹™¥±±MÑå±”€ô€‰É‰„ Ì°Ì°Ì°¸äÌ¤ˆì(€€€½¹Ñ•áÐ¹™¥±±I•Ð À°€ÐÈ°€ÄàÐ°€ÄÈØ¤ì(€€€½¹Ñ•áÐ¹™¥±±I•Ð ÐØÀ°€ÐÈ°€ÄàÀ°€ÄÄØ¤ì(€€€¥˜€¡Í•ÍÍ¥½¸¹­•ä€˜˜€…Í•ÍÍ¥½¸¹­•ä¹™½Õ¹¤ì(€€€€€½¹ÍÐÁ½¥¹Ð€ôÍÉ••¹A½¥¹Ð¡Í•ÍÍ¥½¸¹­•ä¤ì½¹Ñ•áÐ¹™¥±±MÑå±”€ô€ˆ™™àÌÈˆì½¹Ñ•áÐ¹™¥±±I•Ð¡5…Ñ ¹É½Õ¹¡Á½¥¹Ð¹à€´€Ô¤°5…Ñ ¹É½Õ¹¡Á½¥¹Ð¹ä€´€ÄÀ¤°€ÄÀ°€ÄÜ¤ì½¹Ñ•áÐ¹™¥±±MÑå±”€ô€ˆ™™˜á‰ˆì½¹Ñ•áÐ¹™¥±±I•Ð¡5…Ñ ¹É½Õ¹¡Á½¥¹Ð¹à€¬€Ð¤°5…Ñ ¹É½Õ¹¡Á½¥¹Ð¹ä€´€Ü¤°€à°€Ð¤ì(€€€ô(€€€¥˜€¡Í•ÍÍ¥½¸¹™…¥±¥Ñä€˜˜€…Í•ÍÍ¥½¸¹™…¥±¥Ñä¹‘•…¤ì(€€€€€½¹ÍÐÁ½¥¹Ð€ôÍÉ••¹A½¥¹Ð¡Í•ÍÍ¥½¸¹™…¥±¥Ñä¤ìMMQL¹‘É…Ü¡½¹Ñ•áÐ°€‰™…¥±¥Ñäˆ°Á½¥¹Ð¹à°Á½¥¹Ð¹ä°ì¹½Ü°¡•¥¡Ðè€àÈô¤ì(€€€ô(€€€™½È€¡½¹ÍÐ…ÑÑ…¬½˜Í•ÍÍ¥½¸¹…ÑÑ…­Ì¤‘É…ÝÑÑ…­•±±Ì¡…ÑÑ…¬¤ì(€€€½¹ÍÐ…Ñ½ÉÌ€ômtì(€€€™½È€¡½¹ÍÐ•¹•µä½˜Í•ÍÍ¥½¸¹•¹•µ¥•Ì¤¥˜€ …•¹•µä¹‘•…¤…Ñ½ÉÌ¹ÁÕÍ ¡ì­¥¹è€‰•¹•µäˆ°…Ñ½Èè•¹•µäô¤ì(€€€™½È€¡½¹ÍÐÁ±…å•È½˜Í•ÍÍ¥½¸¹Á±…å•ÉÌ¤…Ñ½ÉÌ¹ÁÕÍ ¡ì­¥¹è€‰Á±…å•Èˆ°…Ñ½ÈèÁ±…å•Èô¤ì(€€€…Ñ½ÉÌ¹Í½ÉÐ ¡„°ˆ¤€ôø„¹…Ñ½È¹ä€´ˆ¹…Ñ½È¹ä¤ì(€€€™½È€¡½¹ÍÐ•¹ÑÉä½˜…Ñ½ÉÌ¤ì(€€€€€½¹ÍÐ…Ñ½È€ô•¹ÑÉä¹…Ñ½Èì½¹ÍÐÁ½¥¹Ð€ôÍÉ••¹A½¥¹Ð¡…Ñ½È¤ì(€€€€€¥˜€¡Á½¥¹Ð¹à€ð€´ÄÈÀñðÁ½¥¹Ð¹à€ø€ÜØÀñðÁ½¥¹Ð¹ä€ð€´ÄÐÀñðÁ½¥¹Ð¹ä€ø€ÐÌÀ¤½¹Ñ¥¹Õ”ì(€€€€€¥˜€¡•¹ÑÉä¹­¥¹€ôôô€‰•¹•µäˆ¤ì(€€€€€€€¥˜€¡…Ñ½È¹É•Ù¥Ù¥¹œ€˜˜5…Ñ ¹™±½½È¡¹½Ü€¼€ÄàÀ¤€”€È€ôôô€À¤½¹Ñ¥¹Õ”ì(€€€€€€€MMQL¹‘É…Ü¡½¹Ñ•áÐ°95%Mm…Ñ½È¹ÑåÁ•t¹ÍÁÉ¥Ñ”°Á½¥¹Ð¹à°Á½¥¹Ð¹ä°ì¹½Ü°¡•¥¡Ðè95e}!%!Qm…Ñ½È¹ÑåÁ•t°™±¥Á`è…Ñ½È¹™…¥¹œ€ôôô€‰±•™Ðˆ°…±Á¡„è…Ñ½È¹ÍÑÕ¸€ø€À€ü€¸ØÈ€è€Äô¤ì(€€€€€€€‘É…Ý!•…±Ñ ¡…Ñ½È°Á½¥¹Ð¤ì(€€€€€ô•±Í”ì(€€€€€€€MMQL¹‘É…Ü¡½¹Ñ•áÐ°…Ñ½È¹©½ˆ°Á½¥¹Ð¹à°Á½¥¹Ð¹ä°ì¹½Ü°¡•¥¡ÐèA1eI}!%!Qm…Ñ½È¹©½‰t°™±¥Á`è…Ñ½È¹™…¥¹œ€ôôô€‰±•™Ðˆ°…±Á¡„è…Ñ½È¹½¹‘¥Ñ¥½¸€ôôô€‰¥¹©ÕÉ•ˆ€ü€¸Ôà€è€Äô¤ì(€€€€€€€¥˜€¡…Ñ½È¹½¹‘¥Ñ¥½¸€ôôô€‰¥¹©ÕÉ•ˆ¤ì½¹Ñ•áÐ¹™¥±±MÑå±”€ô€ˆ™˜ÌÐÐÐˆì½¹Ñ•áÐ¹™½¹Ð€ô€‰‰½±€ÄÉÁàÍ…¹ÌµÍ•É¥˜ˆì½¹Ñ•áÐ¹Ñ•áÑ±¥¸€ô€‰•¹Ñ•Èˆì½¹Ñ•áÐ¹™¥±±Q•áÐ ‹®Ú²ˆ°Á½¥¹Ð¹à°Á½¥¹Ð¹ä€´€ÐÜ¤ìô(€€€€€€€¥˜€¡…Ñ½È¹¡•…±AÉ½É•ÍÌ€ø€À¤ì½¹Ñ•áÐ¹ÍÑÉ½­•MÑå±”€ô€ˆŒÐÉ™™Àˆì½¹Ñ•áÐ¹±¥¹•]¥‘Ñ €ô€Ìì½¹Ñ•áÐ¹‰•¥¹A…Ñ  ¤ì½¹Ñ•áÐ¹…ÉŒ¡Á½¥¹Ð¹à°Á½¥¹Ð¹ä€´€ÈÈ°€Ää°€µ5…Ñ ¹A$€¼€È°€µ5…Ñ ¹A$€¼€È€¬5…Ñ ¹A$€¨€È€¨±…µÀ¡…Ñ½È¹¡•…±AÉ½É•ÍÌ€¼€Ì°€À°€Ä¤¤ì½¹Ñ•áÐ¹ÍÑÉ½­” ¤ìô(€€€€€ô(€€€ô(€€€¥˜€¡Í•ÍÍ¥½¸¹ÍÑ…•%¹‘•à€øô€È¤ì(€€€€€½¹ÍÐ±½…°€ôÍ•ÍÍ¥½¸¹Á±…å•ÉÌ¹™¥¹ ¡Á±…å•È¤€ôøÁ±…å•È¹¥€ôôôÍ•±™% ¤¤ñðÍ•ÍÍ¥½¸¹Á±…å•ÉÍlÁtì(€€€€€¥˜€¡±½…°¤ì(€€€€€€€½¹ÍÐÁ½¥¹Ð€ôÍÉ••¹A½¥¹Ð¡±½…°¤ì½¹ÍÐÉ…‘¥•¹Ð€ô½¹Ñ•áÐ¹É•…Ñ•I…‘¥…±É…‘¥•¹Ð¡Á½¥¹Ð¹à°Á½¥¹Ð¹ä°€àÀ°Á½¥¹Ð¹à°Á½¥¹Ð¹ä°€ÈÌÔ¤ì(€€€€€€€É…‘¥•¹Ð¹…‘‘½±½ÉMÑ½À À°€‰É‰„ À°À°À°À¤ˆ¤ìÉ…‘¥•¹Ð¹…‘‘½±½ÉMÑ½À Ä°€‰É‰„ À°À°À°¸Ðà¤ˆ¤ì(€€€€€€€½¹Ñ•áÐ¹™¥±±MÑå±”€ôÉ…‘¥•¹Ðì½¹Ñ•áÐ¹™¥±±I•Ð À°€À°Y%\¹Ý¥‘Ñ °Y%\¹¡•¥¡Ð¤ì(€€€€€ô(€€€ô(€ô((€…Íå¹Œ™Õ¹Ñ¥½¸½¹¹•Ñ1½‰‰ä¡É•ÅÕ•ÍÑ•‘½‘”¤ì(€€€¥˜€ …9P¤ìÕÁ‘…Ñ•9•ÑÝ½É­U$ ¤ìÉ•ÑÕÉ¸ìô(€€€½¹ÍÐ½‘”€ô€  ¤€ôøìÑÉäìÉ•ÑÕÉ¸9P¹¹½Éµ…±¥é•I½½µ½‘”¡É•ÅÕ•ÍÑ•‘½‘”ñð9P¹•¹•É…Ñ•I½½µ½‘” ¤¤ìô…Ñ €¡}•ÉÉ½È¤ìÉ•ÑÕÉ¸9P¹•¹•É…Ñ•I½½µ½‘” ¤ìôô¤ ¤ì(€€€‘½´¹É½½µ½‘”¹Ù…±Õ”€ô½‘”ì‘½´¹¹•ÑÝ½É­••‘‰…¬¹Ñ•áÑ½¹Ñ•¹Ð€ô€‹®Â§²^@ƒ²^ÃªÊÃ¶Vc®*Pƒ²’G²z®.#®.¸ˆì(€€€ÑÉäì(€€€€€½¹ÍÐÍÑ…Ñ”€ô…Ý…¥Ð9P¹½¹¹•ÑI½½´¡½‘”°ì¹…µ”è‘½´¹Á±…å•É9…µ”¹Ù…±Õ”¹ÑÉ¥´ ¤ñð€‰A1eHˆ°±…ÍÍ%èÍ•ÍÍ¥½¸¹Í•±•Ñ•‘)½ˆ°àèÍ•ÍÍ¥½¸¹±½‰‰åA±…å•È¹à°äèÍ•ÍÍ¥½¸¹±½‰‰åA±…å•È¹ä°™…¥¹œèÍ•ÍÍ¥½¸¹±½‰‰åA±…å•È¹™…¥¹œô¤ì(€€€€€¥˜€¡ÍÑ…Ñ”¹½¹±¥¹”¤¡¥ÍÑ½Éä¹É•Á±…•MÑ…Ñ”¡¹Õ±°°€ˆˆ°€‘í±½…Ñ¥½¸¹Á…Ñ¡¹…µ•ô‘í±½…Ñ¥½¸¹Í•…É¡ôŒ‘í½‘•õ€¤ì(€€€ô…Ñ €¡}•ÉÉ½È¤ì€¼¨½™™±¥¹”Á±…äÉ•µ…¥¹Ì¥µµ•‘¥…Ñ•±ä…Ù…¥±…‰±”€¨¼ô(€€€ÕÁ‘…Ñ•9•ÑÝ½É­U$ ¤ì(€ô(€™Õ¹Ñ¥½¸‰¥¹‘9•ÑÝ½É¬ ¤ì(€€€¥˜€ …9P¤É•ÑÕÉ¸ì(€€€9P¹½¸ ‰ÍÑ…ÑÕÌˆ°ÕÁ‘…Ñ•9•ÑÝ½É­U$¤ì9P¹½¸ ‰É½ÍÑ•Èˆ°ÕÁ‘…Ñ•9•ÑÝ½É­U$¤ì(€€€9P¹½¹½Õ¹Ñ‘½Ý¸ ¡ìÉ•µ…¥¹¥¹œô¤€ôøì(€€€€€¥˜€¡Í•ÍÍ¥½¸¹ÍÉ••¸€„ôô€‰±½‰‰äˆ¤É•ÑÕÉ¸ì(€€€€€‘½´¹½Õ¹Ñ‘½Ý¸¹¡¥‘‘•¸€ô™…±Í”ì‘½´¹½Õ¹Ñ‘½Ý¸¹ÅÕ•ÉåM•±•Ñ½È ‰ÍÑÉ½¹œˆ¤¹Ñ•áÑ½¹Ñ•¹Ð€ôÉ•µ…¥¹¥¹œñð€‰MQIPˆì(€€€€€‘½´¹±½‰‰å5•ÍÍ…”¹Ñ•áÑ½¹Ñ•¹Ð€ôÉ•µ…¥¹¥¹œ€ü€‘íÉ•µ…¥¹¥¹÷²Ò ƒ¶n²^@ƒ².s²zG¶V§®.#®.¹€€è€‹ªÊ3²z²vƒ².s²zG¶V§®.#®.¸ˆì(€€€ô¤ì(€€€9P¹½¸ ‰ÍÑ…ÉÐˆ°€¡ì¥¹™¼ô¤€ôøì‘½´¹½Õ¹Ñ‘½Ý¸¹¡¥‘‘•¸€ôÑÉÕ”ì¥˜€¡Í•ÍÍ¥½¸¹ÍÉ••¸€ôôô€‰±½‰‰äˆ¤ÍÑ…ÉÑIÕ¸¡¥¹™¼¤ìô¤ì(€€€9P¹½¹%¹ÁÕÐ ¡ìÁ±…å•É%°¥¹ÁÕÐô¤€ôøì¥˜€¡¥Í!½ÍÐ ¤¤Í•ÍÍ¥½¸¹É•µ½Ñ•%¹ÁÕÑÌ¹Í•Ð¡Á±…å•É%°¥¹ÁÕÐ¤ìô¤ì(€€€9P¹½¹M¹…ÁÍ¡½Ð ¡ìÍÑ…Ñ”ô¤€ôøì¥˜€ …¥Í!½ÍÐ ¤€˜˜Í•ÍÍ¥½¸¹ÍÉ••¸€ôôô€‰…µ”ˆ¤…ÁÁ±åM¹…ÁÍ¡½Ð¡ÍÑ…Ñ”¤ìô¤ì(€€€9P¹½¸ ‰•ÉÉ½Èˆ°€¡ìµ•ÍÍ…”ô¤€ôøì‘½´¹¹•ÑÝ½É­••‘‰…¬¹Ñ•áÑ½¹Ñ•¹Ð€ôµ•ÍÍ…”ñð€‹²^ÃªÊÀƒ²b“®–`ˆìÕÁ‘…Ñ•9•ÑÝ½É­U$ ¤ìô¤ì(€ô(€™Õ¹Ñ¥½¸ÍÑ…ÉÑ=™™±¥¹•½Õ¹Ñ‘½Ý¸ ¤ì(€€€¥˜€¡Í•ÍÍ¥½¸¹½™™±¥¹•½Õ¹Ñ‘½Ý¸¤É•ÑÕÉ¸ì(€€€±•ÐÉ•µ…¥¹¥¹œ€ô€Ìì‘½´¹½Õ¹Ñ‘½Ý¸¹¡¥‘‘•¸€ô™…±Í”ì‘½´¹½Õ¹Ñ‘½Ý¸¹ÅÕ•ÉåM•±•Ñ½È ‰ÍÑÉ½¹œˆ¤¹Ñ•áÑ½¹Ñ•¹Ð€ôÉ•µ…¥¹¥¹œì(€€€‘½´¹±½‰‰å5•ÍÍ…”¹Ñ•áÑ½¹Ñ•¹Ð€ô€‘íÉ•µ…¥¹¥¹÷²Ò ƒ¶n²^@ƒ².s²zG¶V§®.#®.¹€ì(€€€Í•ÍÍ¥½¸¹½™™±¥¹•½Õ¹Ñ‘½Ý¸€ôÍ•Ñ%¹Ñ•ÉÙ…°  ¤€ôøì(€€€€€É•µ…¥¹¥¹œ€´ô€Äì(€€€€€¥˜€¡É•µ…¥¹¥¹œ€ø€À¤ì‘½´¹½Õ¹Ñ‘½Ý¸¹ÅÕ•ÉåM•±•Ñ½È ‰ÍÑÉ½¹œˆ¤¹Ñ•áÑ½¹Ñ•¹Ð€ôÉ•µ…¥¹¥¹œì‘½´¹±½‰‰å5•ÍÍ…”¹Ñ•áÑ½¹Ñ•¹Ð€ô€‘íÉ•µ…¥¹¥¹÷²Ò ƒ¶n²^@ƒ².s²zG¶V§®.#®.¹€ìÉ•ÑÕÉ¸ìô(€€€€€±•…É%¹Ñ•ÉÙ…°¡Í•ÍÍ¥½¸¹½™™±¥¹•½Õ¹Ñ‘½Ý¸¤ìÍ•ÍÍ¥½¸¹½™™±¥¹•½Õ¹Ñ‘½Ý¸€ô¹Õ±°ì‘½´¹½Õ¹Ñ‘½Ý¸¹¡¥‘‘•¸€ôÑÉÕ”ìÍÑ…ÉÑIÕ¸¡ìÍÑ…”è€À°Í••è5…Ñ ¹™±½½È¡5…Ñ ¹É…¹‘½´ ¤€¨€Áá™™™™™™™˜¤ô¤ì(€€€ô°€ÄÀÀÀ¤ì(€ô((€‘½´¹•¹Ñ•È¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰±¥¬ˆ°…Íå¹Œ€ ¤€ôøì(€€€‘½´¹•¹Ñ•È¹‘¥Í…‰±•€ôÑÉÕ”ì‘½´¹•¹Ñ•È¹Ñ•áÑ½¹Ñ•¹Ð€ô€‹²nC®Îàƒ²^C²,ƒ®Ú#®~³²b“®*Pƒ²’GŠ˜ˆì(€€€¥˜€ …Í•ÍÍ¥½¸¹É•…‘ä¤ì…Ý…¥ÐMMQL¹ÁÉ•±½… ¤ìÍ•ÍÍ¥½¸¹É•…‘ä€ôÑÉÕ”ìô(€€€¥˜€¡‘•‰ÕA…É…µ•Ñ•ÉÌ¹¡…Ì ‰‘•‰Õœˆ¤€˜˜‘•‰ÕA…É…µ•Ñ•ÉÌ¹¡…Ì ‰ÍÑ…”ˆ¤¤ì(€€€€€ÍÑ…ÉÑIÕ¸¡ìÍÑ…”è€À°Í••è€ÄÈÌÐÔØÜàäô¤ì(€€€€€±½…‘MÑ…”¡±…µÀ¡9Õµ‰•È¡‘•‰ÕA…É…µ•Ñ•ÉÌ¹•Ð ‰ÍÑ…”ˆ¤¤ñð€À°€À°€Ð¤°€ÄÈÌÐÔØÜàä¤ì(€€€€€É•ÑÕÉ¸ì(€€€ô(€€€Í•ÑMÉ••¸ ‰±½‰‰äˆ¤ìÍ•±•Ñ)½ˆ ‰…É¡•Èˆ¤ìÕÁ‘…Ñ•9•ÑÝ½É­U$ ¤ì(€€€½¹¹•Ñ1½‰‰ä¡É½½µ½‘•É½µ1½…Ñ¥½¸ ¤¤ì(€ô¤ì(€‘½´¹ÍÑ…ÉÐ¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰±¥¬ˆ°€ ¤€ôøì(€€€½¹ÍÐÍÑ…Ñ”€ô9Pü¹•ÑMÑ…Ñ”ü¸ ¤ì(€€€¥˜€¡ÍÑ…Ñ”ü¹½¹±¥¹”¤ì(€€€€€¥˜€ …ÍÑ…Ñ”¹¥Í!½ÍÐ¤ì‘½´¹±½‰‰å5•ÍÍ…”¹Ñ•áÑ½¹Ñ•¹Ð€ô€‹®Â§²z—²vÐƒ².s²zG¶V€ƒ®V3ªæ3²ž ƒªâÃ®.“®‚ƒ²Žó²ã²jP¸ˆìÉ•ÑÕÉ¸ìô(€€€€€9P¹ÍÑ…ÉÑ…µ”¡ìÍÑ…”è€À°Í••è5…Ñ ¹™±½½È¡5…Ñ ¹É…¹‘½´ ¤€¨€Áá™™™™™™™˜¤ô¤ì(€€€ô•±Í”ÍÑ…ÉÑ=™™±¥¹•½Õ¹Ñ‘½Ý¸ ¤ì(€ô¤ì(€‘½´¹É½±•	ÕÑÑ½¹Ì¹™½É…  ¡‰ÕÑÑ½¸¤€ôø‰ÕÑÑ½¸¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰±¥¬ˆ°€ ¤€ôøÍ•±•Ñ)½ˆ¡‰ÕÑÑ½¸¹‘…Ñ…Í•Ð¹©½ˆ¤¤¤ì(€‘½´¹¹•ÑÝ½É­Q½±”¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰±¥¬ˆ°€ ¤€ôøì‘½´¹¹•ÑÝ½É­A…¹•°¹¡¥‘‘•¸€ô€…‘½´¹¹•ÑÝ½É­A…¹•°¹¡¥‘‘•¸ìô¤ì(€‘½´¹¹•ÑÝ½É­±½Í”¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰±¥¬ˆ°€ ¤€ôøì‘½´¹¹•ÑÝ½É­A…¹•°¹¡¥‘‘•¸€ôÑÉÕ”ìô¤ì(€‘½´¹½¹¹•ÑI½½´¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰±¥¬ˆ°€ ¤€ôø½¹¹•Ñ1½‰‰ä¡‘½´¹É½½µ½‘”¹Ù…±Õ”¤¤ì(€‘½´¹½ÁåI½½´¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰±¥¬ˆ°…Íå¹Œ€ ¤€ôøì(€€€½¹ÍÐÍÑ…Ñ”€ô9Pü¹•ÑMÑ…Ñ”ü¸ ¤ì¥˜€ …ÍÑ…Ñ”ü¹½¹±¥¹”¤É•ÑÕÉ¸ì(€€€ÑÉäì…Ý…¥Ð¹…Ù¥…Ñ½È¹±¥Á‰½…É¹ÝÉ¥Ñ•Q•áÐ¡€‘í±½…Ñ¥½¸¹½É¥¥¹ô‘í±½…Ñ¥½¸¹Á…Ñ¡¹…µ•ôŒ‘íÍÑ…Ñ”¹É½½µ½‘•õ€¤ì‘½´¹¹•ÑÝ½É­••‘‰…¬¹Ñ•áÑ½¹Ñ•¹Ð€ô€‹²Ò#®2 ƒ®ž¶³®–ðƒ®Î×²
³¶Z#²*×®.#®.¸ˆìô…Ñ €¡}•ÉÉ½È¤ì‘½´¹¹•ÑÝ½É­••‘‰…¬¹Ñ•áÑ½¹Ñ•¹Ð€ôƒ®Â¤ƒ²öS®Npè€‘íÍÑ…Ñ”¹É½½µ½‘•õ€ìô(€ô¤ì(€‘½´¹Á±…å•É9…µ”¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰¡…¹”ˆ°€ ¤€ôøìÑÉäì9Pü¹Í•ÑA±…å•É9…µ”ü¸¡‘½´¹Á±…å•É9…µ”¹Ù…±Õ”¹ÑÉ¥´ ¤ñð€‰A1eHˆ¤ìô…Ñ €¡}•ÉÉ½È¤ì‘½´¹Á±…å•É9…µ”¹Ù…±Õ”€ô€‰A1eHˆìôÕÁ‘…Ñ•9•ÑÝ½É­U$ ¤ìô¤ì(€‘½´¹É•ÍÕ±Ñ	ÕÑÑ½¸¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰±¥¬ˆ°€ ¤€ôøì(€€€‘½´¹É•ÍÕ±Ð¹¡¥‘‘•¸€ôÑÉÕ”ì(€€€¥˜€ …Í•ÍÍ¥½¸¹•¹‘•¤É•ÑÕÉ¸ì(€€€¥˜€¡Í•ÍÍ¥½¸¹¹•áÑMÑ…”€„ôô¹Õ±°¤±½…‘MÑ…”¡Í•ÍÍ¥½¸¹¹•áÑMÑ…”°Í•ÍÍ¥½¸¹Í••¤ì(€€€•±Í”¥˜€¡‘½´¹É•ÍÕ±Ñ-¥­•È¹Ñ•áÑ½¹Ñ•¹Ð€ôôô€‰5%MM%=8%1ˆ¤±½…‘MÑ…”¡Í•ÍÍ¥½¸¹ÍÑ…•%¹‘•à°Í•ÍÍ¥½¸¹Í••¤ì(€€€•±Í”ìÍ•ÑMÉ••¸ ‰±½‰‰äˆ¤ìÍ•ÍÍ¥½¸¹•¹‘•€ô™…±Í”ìÕÁ‘…Ñ•9•ÑÝ½É­U$ ¤ìô(€ô¤ì((€Ý¥¹‘½Ü¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰­•å‘½Ý¸ˆ°€¡•Ù•¹Ð¤€ôøì(€€€½¹ÍÐ½¹ÑÉ½±±•€ôl‰-•å\ˆ°€‰-•åˆ°€‰-•åLˆ°€‰-•åˆ°€‰ÉÉ½ÝUÀˆ°€‰ÉÉ½Ý½Ý¸ˆ°€‰ÉÉ½Ý1•™Ðˆ°€‰ÉÉ½ÝI¥¡Ðˆ°€‰-•å(‰tì(€€€¥˜€¡l‰±½‰‰äˆ°€‰…µ”‰t¹¥¹±Õ‘•Ì¡Í•ÍÍ¥½¸¹ÍÉ••¸¤€˜˜½¹ÑÉ½±±•¹¥¹±Õ‘•Ì¡•Ù•¹Ð¹½‘”¤¤•Ù•¹Ð¹ÁÉ•Ù•¹Ñ•™…Õ±Ð ¤ì(€€€¥˜€¡½¹ÑÉ½±±•¹¥¹±Õ‘•Ì¡•Ù•¹Ð¹½‘”¤¤ì(€€€€€¥˜€ …½¹ÑÉ½±Ì¹­•åÌ¹¡…Ì¡•Ù•¹Ð¹½‘”¤€˜˜€…•Ù•¹Ð¹É•Á•…Ð¤½¹ÑÉ½±Ì¹©ÕÍÑAÉ•ÍÍ•¹…‘¡•Ù•¹Ð¹½‘”¤ì(€€€€€½¹ÑÉ½±Ì¹­•åÌ¹…‘¡•Ù•¹Ð¹½‘”¤ì(€€€ô(€ô¤ì(€Ý¥¹‘½Ü¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰­•åÕÀˆ°€¡•Ù•¹Ð¤€ôø½¹ÑÉ½±Ì¹­•åÌ¹‘•±•Ñ”¡•Ù•¹Ð¹½‘”¤¤ì(€Ý¥¹‘½Ü¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰‰±ÕÈˆ°€ ¤€ôøì½¹ÑÉ½±Ì¹­•åÌ¹±•…È ¤ì½¹ÑÉ½±Ì¹©ÕÍÑAÉ•ÍÍ•¹±•…È ¤ìô¤ì(€€ ˆ¹Ñ½Õ µ½¹ÑÉ½±Ìm‘…Ñ„µ­•åtˆ¤¹™½É…  ¡‰ÕÑÑ½¸¤€ôøì(€€€½¹ÍÐ½‘”€ô‰ÕÑÑ½¸¹‘…Ñ…Í•Ð¹­•äì(€€€½¹ÍÐ‘½Ý¸€ô€¡•Ù•¹Ð¤€ôøì•Ù•¹Ð¹ÁÉ•Ù•¹Ñ•™…Õ±Ð ¤ì¥˜€ …½¹ÑÉ½±Ì¹­•åÌ¹¡…Ì¡½‘”¤¤½¹ÑÉ½±Ì¹©ÕÍÑAÉ•ÍÍ•¹…‘¡½‘”¤ì½¹ÑÉ½±Ì¹­•åÌ¹…‘¡½‘”¤ìôì(€€€½¹ÍÐÕÀ€ô€¡•Ù•¹Ð¤€ôøì•Ù•¹Ð¹ÁÉ•Ù•¹Ñ•™…Õ±Ð ¤ì½¹ÑÉ½±Ì¹­•åÌ¹‘•±•Ñ”¡½‘”¤ìôì(€€€‰ÕÑÑ½¸¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰Á½¥¹Ñ•É‘½Ý¸ˆ°‘½Ý¸¤ìl‰Á½¥¹Ñ•ÉÕÀˆ°€‰Á½¥¹Ñ•É…¹•°ˆ°€‰Á½¥¹Ñ•É±•…Ù”‰t¹™½É…  ¡¹…µ”¤€ôø‰ÕÑÑ½¸¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È¡¹…µ”°ÕÀ¤¤ì(€ô¤ì(€€ ˆ¹Ñ½Õ µ½¹ÑÉ½±Ìm‘…Ñ„µ…Ñ¥½¸ô…ÑÑ…¬tˆ¤¹™½É…  ¡‰ÕÑÑ½¸¤€ôøì(€€€½¹ÍÐ‘½Ý¸€ô€¡•Ù•¹Ð¤€ôøì•Ù•¹Ð¹ÁÉ•Ù•¹Ñ•™…Õ±Ð ¤ì¥˜€ …½¹ÑÉ½±Ì¹­•åÌ¹¡…Ì ‰-•å(ˆ¤¤½¹ÑÉ½±Ì¹©ÕÍÑAÉ•ÍÍ•¹…‘ ‰-•å(ˆ¤ì½¹ÑÉ½±Ì¹­•åÌ¹…‘ ‰-•å(ˆ¤ìôì(€€€½¹ÍÐÕÀ€ô€¡•Ù•¹Ð¤€ôøì•Ù•¹Ð¹ÁÉ•Ù•¹Ñ•™…Õ±Ð ¤ì½¹ÑÉ½±Ì¹­•åÌ¹‘•±•Ñ” ‰-•å(ˆ¤ìôì(€€€‰ÕÑÑ½¸¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰Á½¥¹Ñ•É‘½Ý¸ˆ°‘½Ý¸¤ìl‰Á½¥¹Ñ•ÉÕÀˆ°€‰Á½¥¹Ñ•É…¹•°ˆ°€‰Á½¥¹Ñ•É±•…Ù”‰t¹™½É…  ¡¹…µ”¤€ôø‰ÕÑÑ½¸¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È¡¹…µ”°ÕÀ¤¤ì(€ô¤ì((€™Õ¹Ñ¥½¸±½½À¡¹½Ü¤ì(€€€½¹ÍÐ™É…µ”€ô5…Ñ ¹µ¥¸ À¸Ä°5…Ñ ¹µ…à À°€¡¹½Ü€´Í•ÍÍ¥½¸¹±…ÍÑÉ…µ”¤€¼€ÄÀÀÀ¤¤ìÍ•ÍÍ¥½¸¹±…ÍÑÉ…µ”€ô¹½ÜìÍ•ÍÍ¥½¸¹…ÕµÕ±…Ñ½È€¬ô™É…µ”ì(€€€Ý¡¥±”€¡Í•ÍÍ¥½¸¹…ÕµÕ±…Ñ½È€øôMQ@¤ì(€€€€€¥˜€¡Í•ÍÍ¥½¸¹ÍÉ••¸€ôôô€‰±½‰‰äˆ¤ÕÁ‘…Ñ•1½‰‰ä¡MQ@¤ì(€€€€€¥˜€¡Í•ÍÍ¥½¸¹ÍÉ••¸€ôôô€‰…µ”ˆ¤ÕÁ‘…Ñ•…µ”¡MQ@¤ì(€€€€€Í•ÍÍ¥½¸¹…ÕµÕ±…Ñ½È€´ôMQ@ì½¹ÑÉ½±Ì¹©ÕÍÑAÉ•ÍÍ•¹±•…È ¤ì(€€€ô(€€€¥˜€¡Í•ÍÍ¥½¸¹ÍÉ••¸€ôôô€‰±½‰‰äˆ¤É•¹‘•É1½‰‰ä¡¹½Ü¤ì(€€€¥˜€¡Í•ÍÍ¥½¸¹ÍÉ••¸€ôôô€‰…µ”ˆ¤É•¹‘•É…µ”¡¹½Ü¤ì(€€€¥˜€¡Í•ÍÍ¥½¸¹Ñ½…ÍÑU¹Ñ¥°€˜˜¹½Ü€øÍ•ÍÍ¥½¸¹Ñ½…ÍÑU¹Ñ¥°¤ì‘½´¹ÍÑ…•Q½…ÍÐ¹±…ÍÍ1¥ÍÐ¹É•µ½Ù” ‰¥ÌµÙ¥Í¥‰±”ˆ¤ìÍ•ÍÍ¥½¸¹Ñ½…ÍÑU¹Ñ¥°€ô€Àìô(€€€¥˜€¡Í•ÍÍ¥½¸¹½¹‘¥Ñ¥½¹U¹Ñ¥°€˜˜¹½Ü€øÍ•ÍÍ¥½¸¹½¹‘¥Ñ¥½¹U¹Ñ¥°¤ì‘½´¹½¹‘¥Ñ¥½¹Q½…ÍÐ¹±…ÍÍ1¥ÍÐ¹É•µ½Ù” ‰¥ÌµÙ¥Í¥‰±”ˆ¤ìÍ•ÍÍ¥½¸¹½¹‘¥Ñ¥½¹U¹Ñ¥°€ô€Àìô(€€€É•ÅÕ•ÍÑ¹¥µ…Ñ¥½¹É…µ”¡±½½À¤ì(€ô((€‰¥¹‘9•ÑÝ½É¬ ¤ìÕÁ‘…Ñ•9•ÑÝ½É­U$ ¤ìÍ•±•Ñ)½ˆ ‰…É¡•Èˆ¤ìÉ•ÅÕ•ÍÑ¹¥µ…Ñ¥½¹É…µ”¡±½½À¤ì(€¥˜€¡‘•‰ÕA…É…µ•Ñ•ÉÌ¹¡…Ì ‰‘•‰Õœˆ¤¤ì(€€€Ý¥¹‘½Ü¹@Å…µ”€ô=‰©•Ð¹™É••é”¡ìÍ•ÍÍ¥½¸°±½…‘MÑ…”°ÍÑ…ÉÑIÕ¸°µ…­•M¹…ÁÍ¡½Ð°¥¹©ÕÉ”°…Ñ¥Ù…Ñ•É•„è€¡¥¹‘•à¤€ôø…Ñ¥Ù…Ñ•É•„¡¥¹‘•à°Í•ÍÍ¥½¸¹ÍÑ…”¹…É•…Ím¥¹‘•át¤ô¤ì(€ô)ô¤ ¤ì(