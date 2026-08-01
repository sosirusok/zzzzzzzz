(() => {
  "use strict";

  const DATA = window.EP1_DATA;
  const ASSETS = window.EP1_ASSETS;
  const NET = window.EP1Network;
  if (!DATA || !ASSETS) throw new Error("게임 데이터 또는 에셋 모듈을 불러오지 못했습니다.");

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
      const signal = document.createElement("span"); signal.className = "signal"; signal.textContent = "▮▮▮";
      const label = document.createElement("span"); label.textContent = profile.name;
      if (profile.isHost) { const host = document.createElement("em"); host.className = "host"; host.textContent = "(방장)"; label.append(host); }
      const condition = document.createElement("span"); condition.className = "condition"; condition.textContent = actor?.condition === "injured" ? "부상" : JOBS[jobId].name;
      item.append(chip, signal, label, condition); target.append(item);
    }
  }
  function updateNetworkUI() {
    const state = NET?.getState?.() || {};
    const online = state.online === true;
    dom.start.disabled = online && !state.isHost;
    dom.start.textContent = online && !state.isHost ? "대기" : "시작";
    dom.networkFeedback.textContent = online
      ? `${state.roomCode} · ${state.isHost ? "방장" : "참가자"} · ${state.players.length}/4`
      : (state.status === "connecting" ? "방에 연결하는 중입니다." : "오프라인 1인 플레이");
    renderRoster(dom.lobbyRoster);
  }
  function selectJob(jobId) {
    if (!JOBS[jobId] || session.screen !== "lobby") return;
    const state = NET?.getState?.();
    if (state?.countdownActive || state?.started) return;
    session.selectedJob = jobId;
    dom.roleButtons.forEach((button) => button.classList.toggle("is-selected", button.dataset.job === jobId));
    dom.lobbyMessage.textContent = `${JOBS[jobId].name} 선택 · ${JOBS[jobId].description}`;
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
    showStageToast("경고! 좀비 진격!", 1600);
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
    session.camera.x = clamp(session.stage.start[0] - VIEW.width / 2, 0, Math.max(0, session.stage.width - VIEW.width));
    session.camera.y = clamp(session.stage.start[1] - VIEW.height / 2, 0, Math.max(0, session.stage.height - VIEW.height));
    setScreen("game");
    dom.result.hidden = true;
    dom.resultButton.disabled = false;
    showStageToast(`STAGE ${session.stageIndex} / 4\n${session.stage.title}`, 1800);
    updateHUD();
  }
  function startRun(info = {}) {
    const seed = Number.isInteger(info.seed) ? info.seed : Math.floor(Math.random() * 0xffffffff);
    session.score = 0;
    loadStage(0, seed);
    dom.gameCanvas.focus();
  }

  function currentInputFor(player) {
    if (player.id === selfId()) {
      const move = movementInput();
      return { moveX: move.x, moveY: move.y, attack: controls.keys.has("KeyJ") || controls.justPressed.has("KeyJ") };
    }
    return session.remoteInputs.get(player.id) || { moveX: 0, moveY: 0, attack: false };
  }
  function attackRectFor(player) {
    const job = JOBS[player.job]; const direction = DIRECTIONS[player.facing];
    const widthTiles = job.range[0]; const depthTiles = job.range[1];
    const lateral = widthTiles * TILE; const depth = depthTiles * TILE;
    if (direction.x) return {
      x: direction.x > 0 ? player.x + 8 : player.x - depth - 8,
      y: player.y - lateral / 2, w: depth, h: lateral,
    };
    return {
      x: player.x - lateral / 2,
      y: direction.y > 0 ? player.y + 8 : player.y - depth - 8,
      w: lateral, h: depth,
    };
  }
  function damageTarget(target, amount, stun = 0) {
    if (!target || target.dead || target.reviving) return false;
    target.hp -= amount; target.stun = Math.max(target.stun, stun);
    if (target.hp > 0) return true;
    const definition = ENEMIES[target.type];
    if (definition.revive && !target.usedSecondLife) {
      target.usedSecondLife = true; target.reviving = true; target.reviveAt = session.tick + TICK_RATE * 3;
      target.hp = definition.secondLife; return true;
    }
    target.dead = true; session.score += definition.score || 0;
    return true;
  }
  function performAttack(player) {
    const job = JOBS[player.job];
    const rect = attackRectFor(player);
    session.attacks.push({ ...rect, job: player.job, until: session.tick + Math.max(2, Math.round(job.cooldown * TICK_RATE * 0.45)) });
    const candidates = session.enemies.filter((enemy) => !enemy.dead && !enemy.reviving && overlaps(rect, { x: enemy.x - enemy.radius, y: enemy.y - enemy.radius, w: enemy.radius * 2, h: enemy.radius * 2 }));
    candidates.sort((a, b) => dist(player, a) - dist(player, b));
    const targets = job.attack === "first-hit" ? candidates.slice(0, 1) : candidates;
    for (const enemy of targets) damageTarget(enemy, job.damage, player.job === "medic" ? job.stun : (player.job === "fireman" ? 0.45 : 0));
    if (session.facility && !session.facility.dead && overlaps(rect, { x: session.facility.x - 42, y: session.facility.y - 38, w: 84, h: 76 })) {
      session.facility.hp -= job.damage;
      if (session.facility.hp <= 0) { session.facility.hp = 0; session.facility.dead = true; session.score += 0; showStageToast("제조 시설 파괴 완료", 1300); }
    }
  }
  function updatePlayer(player, input, dt) {
    player.cooldown = Math.max(0, player.cooldown - dt);
    if (player.condition === "injured") {
      if (player.job === "medic" && session.tick >= player.selfHealAt) {
        player.condition = "healthy"; player.selfHealAt = 0; showCondition(`${player.name} 자가 치료 완료`);
      }
      return;
    }
    const job = JOBS[player.job];
    const firing = input.attack && player.job === "fireman" && player.fuel > 0;
    if (!firing) {
      const move = { x: input.moveX, y: input.moveY };
      player.facing = facingFromMove(move, player.facing);
      moveCircle(player, move.x * PLAYER_SPEED, move.y * PLAYER_SPEED, dt, session.stage.solids || [], session.stage.width, session.stage.height);
    }
    if (player.job === "fireman") {
      if (firing) {
        player.fuel = Math.max(0, player.fuel - dt);
        if (player.cooldown <= 0) { performAttack(player); player.cooldown = job.cooldown; }
      } else {
        player.fuel = Math.min(job.maxFuel, player.fuel + (job.maxFuel / job.rechargeSeconds) * dt);
      }
    } else if (input.attack && !player.attackHeld && player.cooldown <= 0) {
      performAttack(player); player.cooldown = job.cooldown;
    }
    player.attackHeld = input.attack;
  }
  function injure(player) {
    if (!player || player.condition !== "healthy") return;
    player.condition = "injured"; player.injuredAt = session.tick;
    if (player.job === "medic") player.selfHealAt = session.tick + TICK_RATE * 10;
    showCondition(`${player.name} 부상! 메딕이 3초간 접촉하면 회복합니다.`);
  }
  function updateHealing(dt) {
    for (const medic of session.players.filter((player) => player.job === "medic" && player.condition === "healthy")) {
      const target = session.players.find((player) => player.condition === "injured" && player.id !== medic.id && dist(player, medic) < 34);
      for (const player of session.players) if (player !== target) player.healProgress = 0;
      if (target) {
        target.healProgress += dt;
        if (target.healProgress >= JOBS.medic.healSeconds) {
          target.condition = "healthy"; target.healProgress = 0; target.selfHealAt = 0;
          showCondition(`${target.name} 부상 회복`);
        }
      }
    }
  }
  function nearestHealthy(enemy) {
    let result = null; let best = Infinity;
    for (const player of session.players) {
      if (player.condition !== "healthy") continue;
      const value = dist(enemy, player);
      if (value < best) { best = value; result = player; }
    }
    return { player: result, distance: best };
  }
  function updateEnemy(enemy, dt) {
    if (enemy.dead) return;
    if (enemy.reviving) {
      if (session.tick >= enemy.reviveAt) enemy.reviving = false;
      return;
    }
    enemy.stun = Math.max(0, enemy.stun - dt);
    const definition = ENEMIES[enemy.type];
    const targetInfo = nearestHealthy(enemy);
    if (!targetInfo.player) return;
    if (definition.summon) {
      enemy.summonClock += dt;
      const livingSummons = session.enemies.filter((other) => !other.dead && other.owner === enemy.id).length;
      if (targetInfo.distance < definition.vision * TILE && enemy.summonClock >= 5 && livingSummons < 3) {
        enemy.summonClock = 0;
        const summon = spawnEnemy(definition.summon, enemy.x + (session.random() - 0.5) * 40, enemy.y + 28);
        if (summon) summon.owner = enemy.id;
      }
    }
    if (enemy.stun <= 0 && targetInfo.distance <= definition.vision * TILE) {
      const dx = targetInfo.player.x - enemy.x; const dy = targetInfo.player.y - enemy.y;
      const length = Math.hypot(dx, dy) || 1;
      enemy.facing = facingFromMove({ x: dx, y: dy }, enemy.facing);
      moveCircle(enemy, dx / length * enemy.speed, dy / length * enemy.speed, dt, session.stage.solids || [], session.stage.width, session.stage.height);
    }
    if (dist(enemy, targetInfo.player) < enemy.radius + targetInfo.player.radius + 2) injure(targetInfo.player);
  }
  function checkObjectives() {
    const local = session.players.find((player) => player.id === selfId()) || session.players[0];
    for (let index = 0; index < (session.stage.areas || []).length; index += 1) {
      const area = session.stage.areas[index];
      if (session.players.some((player) => player.condition === "healthy" && inside(player.x, player.y, area.at))) activateArea(index, area);
    }
    if (session.key && !session.key.found && session.players.some((player) => player.condition === "healthy" && Math.hypot(player.x - session.key.x, player.y - session.key.y) < 24)) {
      session.key.found = true; session.hasKey = true; showStageToast("교장실 열쇠를 찾았습니다!", 1500);
    }
    if (session.stageIndex === 4) {
      const boss = session.enemies.find((enemy) => enemy.type === "boss");
      if (boss?.dead) finishStage(true, "교장 선생님을 쓰러뜨렸습니다.");
      return;
    }
    if (!local || !session.stage.exit || !inside(local.x, local.y, session.stage.exit)) return;
    if (session.stageIndex === 2 && !session.facility?.dead) { showCondition("제조 시설을 먼저 파괴해야 합니다."); return; }
    if (session.stageIndex === 3 && !session.hasKey) { showCondition("교장실 열쇠가 필요합니다."); return; }
    finishStage(true, `${session.stage.title} 도착 지점에 도달했습니다.`);
  }
  function updateBossAdds(dt) {
    if (session.stageIndex !== 4) return;
    session.addClock += dt;
    if (session.addClock >= 12) {
      session.addClock = 0;
      const livingAdds = session.enemies.filter((enemy) => !enemy.dead && enemy.type !== "boss").length;
      if (livingAdds < 6) {
        spawnEnemy(session.random() < 0.55 ? "liquid" : "tank", session.random() < 0.5 ? 118 : 522, 82);
        showStageToast("캐비닛에서 좀비가 나타났습니다!", 900);
      }
    }
  }
  function allInjured() { return session.players.length > 0 && session.players.every((player) => player.condition === "injured"); }
  function finishStage(clear, copy) {
    if (session.ended) return;
    session.ended = true; session.nextStage = clear && session.stageIndex < 4 ? session.stageIndex + 1 : null;
    dom.resultKicker.textContent = clear ? (session.stageIndex === 4 ? "EPISODE CLEAR" : "STAGE CLEAR") : "MISSION FAILED";
    dom.resultTitle.textContent = clear ? (session.stageIndex === 4 ? "Episode 1 완료" : `${session.stageIndex}스테이지 완료`) : "작전 실패";
    dom.resultCopy.textContent = `${copy} · SCORE ${session.score.toLocaleString("ko-KR")}`;
    dom.resultButton.textContent = clear ? (session.nextStage === null ? "대기실로" : "다음 스테이지") : "다시 도전";
    dom.result.hidden = false;
  }
  function updateGame(dt) {
    if (session.ended) return;
    session.tick += 1; session.remaining = Math.max(0, session.remaining - dt);
    const netState = NET?.getState?.();
    const guest = netState?.online && !netState.isHost;
    const local = session.players.find((player) => player.id === selfId()) || session.players[0];
    const localInput = currentInputFor(local);
    if (guest) {
      try { NET.sendInput({ tick: session.tick, moveX: localInput.moveX, moveY: localInput.moveY, aimX: DIRECTIONS[local.facing].x, aimY: DIRECTIONS[local.facing].y, attack: localInput.attack, skill: false, interact: false }); } catch (_error) { /* network may disconnect */ }
      return;
    }
    for (const player of session.players) updatePlayer(player, currentInputFor(player), dt);
    updateHealing(dt);
    for (const enemy of [...session.enemies]) updateEnemy(enemy, dt);
    session.attacks = session.attacks.filter((attack) => attack.until > session.tick);
    updateBossAdds(dt); checkObjectives();
    if (allInjured()) finishStage(false, "모든 플레이어가 부상했습니다.");
    else if (session.remaining <= 0) finishStage(false, "제한 시간이 끝났습니다.");
    updateCamera(); updateHUD();
    if (netState?.online && netState.isHost && session.tick - session.lastSnapshotTick >= 4) {
      session.lastSnapshotTick = session.tick;
      try { NET.sendSnapshot(makeSnapshot()); } catch (_error) { /* transient connection error */ }
    }
  }
  function updateCamera() {
    const local = session.players.find((player) => player.id === selfId()) || session.players[0];
    if (!local) return;
    session.camera.x = clamp(local.x - VIEW.width / 2, 0, Math.max(0, session.stage.width - VIEW.width));
    session.camera.y = clamp(local.y - VIEW.height / 2, 0, Math.max(0, session.stage.height - VIEW.height));
  }
  function makeSnapshot() {
    return {
      stage: session.stageIndex, tick: session.tick, time: Math.round(session.remaining * 20) / 20, score: session.score,
      players: session.players.map((p) => ({ id: p.id, x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, f: p.facing, c: p.condition, j: p.job, cd: Math.round(p.cooldown * 20) / 20, fuel: Math.round(p.fuel * 20) / 20 })),
      enemies: session.enemies.filter((e) => !e.dead || e.type === "boss").map((e) => ({ id: e.id, t: e.type, x: Math.round(e.x * 10) / 10, y: Math.round(e.y * 10) / 10, hp: e.hp, m: e.maxHp, d: e.dead, r: e.reviving, f: e.facing })),
      facility: session.facility ? { hp: session.facility.hp, dead: session.facility.dead } : null,
      key: { x: session.key?.x || 0, y: session.key?.y || 0, found: Boolean(session.key?.found), has: session.hasKey }, areas: [...session.activatedAreas], ended: session.ended,
    };
  }
  function applySnapshot(snapshot) {
    if (!snapshot) return;
    if (snapshot.stage !== session.stageIndex) loadStage(snapshot.stage, session.seed);
    if (snapshot.tick < session.tick - 10) return;
    session.tick = snapshot.tick; session.remaining = snapshot.time; session.score = snapshot.score;
    const profileMap = new Map(rosterPlayers().map((profile) => [profile.id, profile]));
    session.players = snapshot.players.map((p) => ({ id: p.id, name: profileMap.get(p.id)?.name || "PLAYER", job: p.j, x: p.x, y: p.y, radius: 10, facing: p.f, condition: p.c, cooldown: p.cd, fuel: p.fuel, attackHeld: false, healProgress: 0 }));
    session.enemies = snapshot.enemies.map((e) => ({ id: e.id, type: e.t, x: e.x, y: e.y, hp: e.hp, maxHp: e.m, dead: e.d, reviving: e.r, facing: e.f, radius: e.t === "boss" ? 24 : 11, stun: 0, speed: ENEMIES[e.t].speed }));
    if (session.facility && snapshot.facility) Object.assign(session.facility, snapshot.facility);
    if (session.key) { session.key.x = snapshot.key.x; session.key.y = snapshot.key.y; session.key.found = snapshot.key.found; session.hasKey = snapshot.key.has; }
    session.activatedAreas = new Set(snapshot.areas); updateCamera(); updateHUD();
    if (snapshot.ended && !session.ended) { session.ended = true; showCondition("방장이 다음 스테이지를 준비하고 있습니다.", 3000); }
  }

  function formatTimer(seconds) {
    const value = Math.max(0, seconds); const minutes = Math.floor(value / 60); const rest = Math.floor(value % 60); const tenth = Math.floor((value % 1) * 10);
    return `${minutes}:${String(rest).padStart(2, "0")}:${tenth}`;
  }
  function updateHUD() {
    dom.hudStage.textContent = `STAGE ${session.stageIndex} / 4`;
    dom.hudTimer.textContent = formatTimer(session.remaining);
    dom.hudLocation.textContent = session.stage.title;
    dom.hudScore.textContent = session.score.toLocaleString("ko-KR");
    let mission = session.stage.objective;
    if (session.stageIndex === 2 && session.facility) mission = session.facility.dead ? "출구로 이동하세요." : `제조 시설 파괴 ${Math.max(0, session.facility.hp)} / ${session.facility.maxHp}`;
    if (session.stageIndex === 3) mission = session.hasKey ? "교장실 입구로 이동하세요." : session.stage.objective;
    dom.hudMission.textContent = mission;
    const boss = session.enemies.find((enemy) => enemy.type === "boss");
    dom.bossPanel.hidden = !boss;
    if (boss) dom.bossFill.style.width = `${clamp(boss.hp / boss.maxHp * 100, 0, 100)}%`;
    const local = session.players.find((player) => player.id === selfId()) || session.players[0];
    dom.firemanGauge.hidden = local?.job !== "fireman";
    if (local?.job === "fireman") dom.fuelFill.style.width = `${clamp(local.fuel / JOBS.fireman.maxFuel * 100, 0, 100)}%`;
    renderRoster(dom.gameRoster, rosterPlayers());
  }
  function showStageToast(text, duration = 1000) {
    dom.stageToast.textContent = text; dom.stageToast.classList.add("is-visible"); session.toastUntil = performance.now() + duration;
  }
  function showCondition(text, duration = 1400) {
    dom.conditionToast.textContent = text; dom.conditionToast.classList.add("is-visible"); session.conditionUntil = performance.now() + duration;
  }
  function screenPoint(actor) { return { x: actor.x - session.camera.x, y: actor.y - session.camera.y }; }
  function drawHealth(actor, point) {
    if (actor.hp >= actor.maxHp || actor.dead) return;
    const width = actor.type === "boss" ? 70 : 34; const ratio = clamp(actor.hp / actor.maxHp, 0, 1);
    context.fillStyle = "#111"; context.fillRect(Math.round(point.x - width / 2), Math.round(point.y - (ENEMY_HEIGHT[actor.type] || 44) - 7), width, 5);
    context.fillStyle = ratio > .4 ? "#e62b2b" : "#ffcf20"; context.fillRect(Math.round(point.x - width / 2 + 1), Math.round(point.y - (ENEMY_HEIGHT[actor.type] || 44) - 6), Math.round((width - 2) * ratio), 3);
  }
  function drawAttackCells(attack) {
    context.save(); context.translate(-session.camera.x, -session.camera.y);
    context.fillStyle = attack.job === "fireman" ? "rgba(255,230,100,.25)" : "rgba(255,255,255,.18)";
    context.strokeStyle = JOBS[attack.job].color; context.lineWidth = 1;
    context.fillRect(attack.x, attack.y, attack.w, attack.h);
    for (let x = attack.x; x <= attack.x + attack.w; x += TILE) { context.beginPath(); context.moveTo(x, attack.y); context.lineTo(x, attack.y + attack.h); context.stroke(); }
    for (let y = attack.y; y <= attack.y + attack.h; y += TILE) { context.beginPath(); context.moveTo(attack.x, y); context.lineTo(attack.x + attack.w, y); context.stroke(); }
    context.restore();
  }
  function renderGame(now) {
    context.clearRect(0, 0, VIEW.width, VIEW.height);
    const map = ASSETS.get(`stage${session.stageIndex}`);
    if (map) context.drawImage(map, -Math.round(session.camera.x), -Math.round(session.camera.y));
    // 구형 녹화 프레임에 고정되어 있던 타이머·명단·점수만 가리고,
    // 같은 위치의 실시간 HUD가 현재 상태를 표시한다.
    context.fillStyle = "rgba(4,4,4,.94)";
    context.fillRect(0, 0, VIEW.width, 42);
    context.fillStyle = "rgba(3,3,3,.93)";
    context.fillRect(0, 42, 184, 126);
    context.fillRect(460, 42, 180, 116);
    if (session.key && !session.key.found) {
      const point = screenPoint(session.key); context.fillStyle = "#ffd832"; context.fillRect(Math.round(point.x - 5), Math.round(point.y - 10), 10, 17); context.fillStyle = "#fff8bd"; context.fillRect(Math.round(point.x + 4), Math.round(point.y - 7), 8, 4);
    }
    if (session.facility && !session.facility.dead) {
      const point = screenPoint(session.facility); ASSETS.draw(context, "facility", point.x, point.y, { now, height: 82 });
    }
    for (const attack of session.attacks) drawAttackCells(attack);
    const actors = [];
    for (const enemy of session.enemies) if (!enemy.dead) actors.push({ kind: "enemy", actor: enemy });
    for (const player of session.players) actors.push({ kind: "player", actor: player });
    actors.sort((a, b) => a.actor.y - b.actor.y);
    for (const entry of actors) {
      const actor = entry.actor; const point = screenPoint(actor);
      if (point.x < -120 || point.x > 760 || point.y < -140 || point.y > 430) continue;
      if (entry.kind === "enemy") {
        if (actor.reviving && Math.floor(now / 180) % 2 === 0) continue;
        ASSETS.draw(context, ENEMIES[actor.type].sprite, point.x, point.y, { now, height: ENEMY_HEIGHT[actor.type], flipX: actor.facing === "left", alpha: actor.stun > 0 ? .62 : 1 });
        drawHealth(actor, point);
      } else {
        ASSETS.draw(context, actor.job, point.x, point.y, { now, height: PLAYER_HEIGHT[actor.job], flipX: actor.facing === "left", alpha: actor.condition === "injured" ? .58 : 1 });
        if (actor.condition === "injured") { context.fillStyle = "#ff3444"; context.font = "bold 12px sans-serif"; context.textAlign = "center"; context.fillText("부상", point.x, point.y - 47); }
        if (actor.healProgress > 0) { context.strokeStyle = "#42ffd0"; context.lineWidth = 3; context.beginPath(); context.arc(point.x, point.y - 22, 19, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(actor.healProgress / 3, 0, 1)); context.stroke(); }
      }
    }
    if (session.stageIndex >= 2) {
      const local = session.players.find((player) => player.id === selfId()) || session.players[0];
      if (local) {
        const point = screenPoint(local); const gradient = context.createRadialGradient(point.x, point.y, 80, point.x, point.y, 235);
        gradient.addColorStop(0, "rgba(0,0,0,0)"); gradient.addColorStop(1, "rgba(0,0,0,.48)");
        context.fillStyle = gradient; context.fillRect(0, 0, VIEW.width, VIEW.height);
      }
    }
  }

  async function connectLobby(requestedCode) {
    if (!NET) { updateNetworkUI(); return; }
    const code = (() => { try { return NET.normalizeRoomCode(requestedCode || NET.generateRoomCode()); } catch (_error) { return NET.generateRoomCode(); } })();
    dom.roomCode.value = code; dom.networkFeedback.textContent = "방에 연결하는 중입니다.";
    try {
      const state = await NET.connectRoom(code, { name: dom.playerName.value.trim() || "PLAYER", classId: session.selectedJob, x: session.lobbyPlayer.x, y: session.lobbyPlayer.y, facing: session.lobbyPlayer.facing });
      if (state.online) history.replaceState(null, "", `${location.pathname}${location.search}#${code}`);
    } catch (_error) { /* offline play remains immediately available */ }
    updateNetworkUI();
  }
  function bindNetwork() {
    if (!NET) return;
    NET.on("status", updateNetworkUI); NET.on("roster", updateNetworkUI);
    NET.onCountdown(({ remaining }) => {
      if (session.screen !== "lobby") return;
      dom.countdown.hidden = false; dom.countdown.querySelector("strong").textContent = remaining || "START";
      dom.lobbyMessage.textContent = remaining ? `${remaining}초 후에 시작합니다.` : "게임을 시작합니다.";
    });
    NET.on("start", ({ info }) => { dom.countdown.hidden = true; if (session.screen === "lobby") startRun(info); });
    NET.onInput(({ playerId, input }) => { if (isHost()) session.remoteInputs.set(playerId, input); });
    NET.onSnapshot(({ state }) => { if (!isHost() && session.screen === "game") applySnapshot(state); });
    NET.on("error", ({ message }) => { dom.networkFeedback.textContent = message || "연결 오류"; updateNetworkUI(); });
  }
  function startOfflineCountdown() {
    if (session.offlineCountdown) return;
    let remaining = 3; dom.countdown.hidden = false; dom.countdown.querySelector("strong").textContent = remaining;
    dom.lobbyMessage.textContent = `${remaining}초 후에 시작합니다.`;
    session.offlineCountdown = setInterval(() => {
      remaining -= 1;
      if (remaining > 0) { dom.countdown.querySelector("strong").textContent = remaining; dom.lobbyMessage.textContent = `${remaining}초 후에 시작합니다.`; return; }
      clearInterval(session.offlineCountdown); session.offlineCountdown = null; dom.countdown.hidden = true; startRun({ stage: 0, seed: Math.floor(Math.random() * 0xffffffff) });
    }, 1000);
  }

  dom.enter.addEventListener("click", async () => {
    dom.enter.disabled = true; dom.enter.textContent = "원본 에셋 불러오는 중…";
    if (!session.ready) { await ASSETS.preload(); session.ready = true; }
    if (debugParameters.has("debug") && debugParameters.has("stage")) {
      startRun({ stage: 0, seed: 123456789 });
      loadStage(clamp(Number(debugParameters.get("stage")) || 0, 0, 4), 123456789);
      return;
    }
    setScreen("lobby"); selectJob("archer"); updateNetworkUI();
    connectLobby(roomCodeFromLocation());
  });
  dom.start.addEventListener("click", () => {
    const state = NET?.getState?.();
    if (state?.online) {
      if (!state.isHost) { dom.lobbyMessage.textContent = "방장이 시작할 때까지 기다려 주세요."; return; }
      NET.startGame({ stage: 0, seed: Math.floor(Math.random() * 0xffffffff) });
    } else startOfflineCountdown();
  });
  dom.roleButtons.forEach((button) => button.addEventListener("click", () => selectJob(button.dataset.job)));
  dom.networkToggle.addEventListener("click", () => { dom.networkPanel.hidden = !dom.networkPanel.hidden; });
  dom.networkClose.addEventListener("click", () => { dom.networkPanel.hidden = true; });
  dom.connectRoom.addEventListener("click", () => connectLobby(dom.roomCode.value));
  dom.copyRoom.addEventListener("click", async () => {
    const state = NET?.getState?.(); if (!state?.online) return;
    try { await navigator.clipboard.writeText(`${location.origin}${location.pathname}#${state.roomCode}`); dom.networkFeedback.textContent = "초대 링크를 복사했습니다."; } catch (_error) { dom.networkFeedback.textContent = `방 코드: ${state.roomCode}`; }
  });
  dom.playerName.addEventListener("change", () => { try { NET?.setPlayerName?.(dom.playerName.value.trim() || "PLAYER"); } catch (_error) { dom.playerName.value = "PLAYER"; } updateNetworkUI(); });
  dom.resultButton.addEventListener("click", () => {
    dom.result.hidden = true;
    if (!session.ended) return;
    if (session.nextStage !== null) loadStage(session.nextStage, session.seed);
    else if (dom.resultKicker.textContent === "MISSION FAILED") loadStage(session.stageIndex, session.seed);
    else { setScreen("lobby"); session.ended = false; updateNetworkUI(); }
  });

  window.addEventListener("keydown", (event) => {
    const controlled = ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyJ"];
    if (["lobby", "game"].includes(session.screen) && controlled.includes(event.code)) event.preventDefault();
    if (controlled.includes(event.code)) {
      if (!controls.keys.has(event.code) && !event.repeat) controls.justPressed.add(event.code);
      controls.keys.add(event.code);
    }
  });
  window.addEventListener("keyup", (event) => controls.keys.delete(event.code));
  window.addEventListener("blur", () => { controls.keys.clear(); controls.justPressed.clear(); });
  $$(".touch-controls [data-key]").forEach((button) => {
    const code = button.dataset.key;
    const down = (event) => { event.preventDefault(); if (!controls.keys.has(code)) controls.justPressed.add(code); controls.keys.add(code); };
    const up = (event) => { event.preventDefault(); controls.keys.delete(code); };
    button.addEventListener("pointerdown", down); ["pointerup", "pointercancel", "pointerleave"].forEach((name) => button.addEventListener(name, up));
  });
  $$(".touch-controls [data-action='attack']").forEach((button) => {
    const down = (event) => { event.preventDefault(); if (!controls.keys.has("KeyJ")) controls.justPressed.add("KeyJ"); controls.keys.add("KeyJ"); };
    const up = (event) => { event.preventDefault(); controls.keys.delete("KeyJ"); };
    button.addEventListener("pointerdown", down); ["pointerup", "pointercancel", "pointerleave"].forEach((name) => button.addEventListener(name, up));
  });

  function loop(now) {
    const frame = Math.min(0.1, Math.max(0, (now - session.lastFrame) / 1000)); session.lastFrame = now; session.accumulator += frame;
    while (session.accumulator >= STEP) {
      if (session.screen === "lobby") updateLobby(STEP);
      if (session.screen === "game") updateGame(STEP);
      session.accumulator -= STEP; controls.justPressed.clear();
    }
    if (session.screen === "lobby") renderLobby(now);
    if (session.screen === "game") renderGame(now);
    if (session.toastUntil && now > session.toastUntil) { dom.stageToast.classList.remove("is-visible"); session.toastUntil = 0; }
    if (session.conditionUntil && now > session.conditionUntil) { dom.conditionToast.classList.remove("is-visible"); session.conditionUntil = 0; }
    requestAnimationFrame(loop);
  }

  bindNetwork(); updateNetworkUI(); selectJob("archer"); requestAnimationFrame(loop);
  if (debugParameters.has("debug")) {
    window.EP1Game = Object.freeze({ session, loadStage, startRun, makeSnapshot, injure, activateArea: (index) => activateArea(index, session.stage.areas[index]) });
  }
})();
