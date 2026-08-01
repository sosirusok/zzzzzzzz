(() => {
  "use strict";

  const VIEW = { width: 1280, height: 720 };
  const TAU = Math.PI * 2;

  const JOBS = {
    archer: {
      name: "아처",
      icon: "➶",
      color: "#db4545",
      summary: "화살 발사 · 1×7 관통",
      hp: 100,
      speed: 235,
      damage: 20,
      basicName: "화살 발사",
      basicCooldown: 0.6,
    },
    medic: {
      name: "메딕",
      icon: "✚",
      color: "#35cfa6",
      summary: "주사기 투척 · 1×5 기절",
      hp: 100,
      speed: 235,
      damage: 25,
      basicName: "주사기 투척",
      basicCooldown: 1,
    },
    chairman: {
      name: "체어맨",
      icon: "▰",
      color: "#24a2cb",
      summary: "의자 휘두르기 · 3×2",
      hp: 100,
      speed: 235,
      damage: 25,
      basicName: "의자 휘두르기",
      basicCooldown: 0.5,
    },
    fireman: {
      name: "파이어맨",
      icon: "♨",
      color: "#f1ba2e",
      summary: "소화기 분사 · 3×3 기절",
      hp: 100,
      speed: 235,
      damage: 6,
      basicName: "소화기 분사",
      basicCooldown: 0.2,
    },
  };

  const ENEMY_TYPES = {
    shambler: { name: "감염 학생", hp: 40, speed: 62, damage: 9, radius: 20, color: "#75906d", score: 200 },
    runner: { name: "광폭 감염체", hp: 55, speed: 108, damage: 12, radius: 18, color: "#a55a58", score: 300 },
    brute: { name: "거대 감염체", hp: 130, speed: 43, damage: 17, radius: 29, color: "#6e718c", score: 500 },
    crawler: { name: "잠복 감염체", hp: 72, speed: 122, damage: 10, radius: 16, color: "#906a93", score: 350 },
    thrower: { name: "투척 감염체", hp: 78, speed: 52, damage: 10, radius: 20, color: "#a88b4d", score: 450, ranged: true },
    tank: { name: "강화 감염체", hp: 280, speed: 36, damage: 21, radius: 38, color: "#7b8288", score: 900 },
    boss: { name: "심층 변이체", hp: 1200, speed: 47, damage: 24, radius: 58, color: "#321f43", score: 5000, boss: true },
  };

  const BUILTIN_STAGES = [
    {
      id: 0,
      title: "봉쇄 구역",
      subtitle: "이상 징후의 시작",
      objective: "통로의 감염체를 정리하세요",
      palette: { floor: "#27353a", tile: "#304147", line: "#3b4c51", wall: "#151f23", edge: "#647176", accent: "#e7a52b" },
      playerSpawn: [130, 360],
      obstacles: [
        [0, 0, 1280, 58], [0, 662, 1280, 58], [0, 0, 58, 720], [1222, 0, 58, 720],
        [300, 150, 120, 100], [300, 470, 120, 100], [650, 270, 110, 180], [960, 120, 110, 120], [960, 480, 110, 120],
      ],
      waves: [
        [{ type: "shambler", x: 520, y: 160 }, { type: "shambler", x: 530, y: 550 }, { type: "runner", x: 830, y: 350 }],
        [{ type: "shambler", x: 1080, y: 180 }, { type: "shambler", x: 1080, y: 540 }, { type: "brute", x: 1110, y: 355 }],
      ],
      decor: "corridor",
    },
    {
      id: 1,
      title: "운동장",
      subtitle: "무너진 집결지",
      objective: "운동장의 세 무리를 돌파하세요",
      palette: { floor: "#425544", tile: "#485f49", line: "#617263", wall: "#202c27", edge: "#879383", accent: "#e2d8b0" },
      playerSpawn: [130, 360],
      obstacles: [
        [0, 0, 1280, 45], [0, 675, 1280, 45], [0, 0, 45, 720], [1235, 0, 45, 720],
        [280, 120, 42, 180], [280, 420, 42, 180], [610, 280, 150, 160], [970, 120, 160, 48], [970, 552, 160, 48],
      ],
      waves: [
        [{ type: "shambler", x: 470, y: 150 }, { type: "shambler", x: 480, y: 570 }, { type: "runner", x: 540, y: 360 }],
        [{ type: "runner", x: 850, y: 160 }, { type: "runner", x: 850, y: 560 }, { type: "brute", x: 920, y: 360 }],
        [{ type: "crawler", x: 1110, y: 130 }, { type: "crawler", x: 1110, y: 590 }, { type: "brute", x: 1110, y: 360 }, { type: "shambler", x: 800, y: 360 }],
      ],
      decor: "yard",
    },
    {
      id: 2,
      title: "급식실",
      subtitle: "멈추지 않는 식사",
      objective: "급식실 내부의 감염체를 처치하세요",
      palette: { floor: "#4a443b", tile: "#554d42", line: "#665e51", wall: "#28241f", edge: "#918571", accent: "#d66d42" },
      playerSpawn: [120, 600],
      obstacles: [
        [0, 0, 1280, 50], [0, 670, 1280, 50], [0, 0, 50, 720], [1230, 0, 50, 720],
        [240, 145, 210, 54], [240, 320, 210, 54], [240, 495, 210, 54],
        [620, 145, 210, 54], [620, 320, 210, 54], [620, 495, 210, 54],
        [1020, 250, 95, 220],
      ],
      waves: [
        [{ type: "runner", x: 510, y: 250 }, { type: "shambler", x: 510, y: 450 }, { type: "thrower", x: 900, y: 160 }],
        [{ type: "brute", x: 920, y: 560 }, { type: "runner", x: 900, y: 360 }, { type: "crawler", x: 1120, y: 110 }],
        [{ type: "brute", x: 1130, y: 570 }, { type: "thrower", x: 1140, y: 140 }, { type: "crawler", x: 900, y: 240 }, { type: "crawler", x: 900, y: 500 }],
      ],
      decor: "cafeteria",
    },
    {
      id: 3,
      title: "교실동",
      subtitle: "닫혀 있던 문",
      objective: "복도 끝까지 감염체를 밀어내세요",
      palette: { floor: "#34323f", tile: "#3d3b49", line: "#4d4a58", wall: "#1d1b24", edge: "#777381", accent: "#9a83d9" },
      playerSpawn: [120, 355],
      obstacles: [
        [0, 0, 1280, 52], [0, 668, 1280, 52], [0, 0, 52, 720], [1228, 0, 52, 720],
        [245, 105, 165, 105], [245, 505, 165, 105], [530, 255, 95, 210],
        [745, 105, 165, 105], [745, 505, 165, 105], [1050, 250, 95, 220],
      ],
      waves: [
        [{ type: "crawler", x: 470, y: 150 }, { type: "crawler", x: 470, y: 570 }, { type: "runner", x: 680, y: 360 }],
        [{ type: "thrower", x: 850, y: 280 }, { type: "thrower", x: 850, y: 440 }, { type: "brute", x: 980, y: 360 }],
        [{ type: "tank", x: 1120, y: 360 }, { type: "runner", x: 1110, y: 130 }, { type: "runner", x: 1110, y: 590 }, { type: "crawler", x: 930, y: 120 }, { type: "crawler", x: 930, y: 600 }],
      ],
      decor: "classroom",
    },
    {
      id: 4,
      title: "교장실",
      subtitle: "심층 변이체",
      objective: "보스를 제압하세요",
      palette: { floor: "#2d2832", tile: "#352f3b", line: "#463d4c", wall: "#171319", edge: "#6f6574", accent: "#d32f43" },
      playerSpawn: [160, 360],
      obstacles: [
        [0, 0, 1280, 54], [0, 666, 1280, 54], [0, 0, 54, 720], [1226, 0, 54, 720],
        [315, 115, 82, 110], [315, 495, 82, 110], [865, 115, 82, 110], [865, 495, 82, 110],
      ],
      waves: [[{ type: "boss", x: 1010, y: 360 }]],
      decor: "boss",
    },
  ];

  const injectedData = window.EP1_DATA ?? {};
  const injectedJobs = injectedData.JOBS ?? injectedData.jobs ?? {};
  for (const [key, values] of Object.entries(injectedJobs)) {
    if (!JOBS[key] || !values) continue;
    JOBS[key] = {
      ...JOBS[key],
      ...values,
      basicCooldown: Number(values.cooldown ?? JOBS[key].basicCooldown),
      damage: Number(values.damage ?? JOBS[key].damage),
    };
  }

  const injectedEnemies = injectedData.ENEMIES ?? injectedData.enemies ?? {};
  const injectedColors = ["#78916f", "#a86161", "#817699", "#a18a57", "#598a8b", "#84607f"];
  let injectedColorIndex = 0;
  for (const [key, values] of Object.entries(injectedEnemies)) {
    if (!values) continue;
    const base = ENEMY_TYPES[key] ?? {
      name: key,
      hp: 60,
      speed: 55,
      damage: 10,
      radius: 20,
      score: 200,
      color: injectedColors[injectedColorIndex++ % injectedColors.length],
    };
    ENEMY_TYPES[key] = { ...base, ...values, boss: Boolean(values.boss ?? base.boss) };
  }

  ENEMY_TYPES.facility = {
    name: "제조시설",
    hp: 600,
    speed: 0,
    damage: 0,
    radius: 48,
    score: 0,
    color: "#5e7e83",
    stationary: true,
  };

  function normalizeInjectedStages(source) {
    if (!Array.isArray(source) || source.length < 5) return null;
    const scaleX = VIEW.width / 960;
    const scaleY = VIEW.height / 540;
    return source.slice(0, 5).map((stage, index) => {
      const fallback = BUILTIN_STAGES[index];
      const normalizedWaves = Array.isArray(stage.waves)
        ? stage.waves.map((wave) => {
          const entries = Array.isArray(wave) ? wave : wave.enemies;
          if (!Array.isArray(entries)) return [];
          return entries.map((entry) => {
            if (Array.isArray(entry)) return { type: entry[0], x: entry[1] * scaleX, y: entry[2] * scaleY };
            return { ...entry, x: entry.x * scaleX, y: entry.y * scaleY };
          });
        }).filter((wave) => wave.length)
        : [];
      if (Array.isArray(stage.facility) && stage.facility.length >= 5) {
        const [x, y, width, height] = stage.facility;
        normalizedWaves.push([{
          type: "facility",
          x: (x + width / 2) * scaleX,
          y: (y + height / 2) * scaleY,
        }]);
      }
      const rawName = String(stage.name ?? fallback.title);
      const nameParts = rawName.split("·").map((part) => part.trim());
      return {
        ...fallback,
        id: Number(stage.id ?? index),
        title: nameParts.at(-1) || fallback.title,
        subtitle: index === 4 ? "최종 작전" : fallback.subtitle,
        objective: stage.objective ?? fallback.objective,
        playerSpawn: Array.isArray(stage.playerStart)
          ? [stage.playerStart[0] * scaleX, stage.playerStart[1] * scaleY]
          : fallback.playerSpawn,
        obstacles: Array.isArray(stage.walls)
          ? stage.walls.map(([x, y, w, h]) => [x * scaleX, y * scaleY, w * scaleX, h * scaleY])
          : fallback.obstacles,
        waves: Array.isArray(stage.waves) ? normalizedWaves : fallback.waves,
        decor: ({ briefing: "corridor", office: "boss" })[stage.theme] ?? stage.theme ?? fallback.decor,
        exit: Array.isArray(stage.exit)
          ? [stage.exit[0] * scaleX, stage.exit[1] * scaleY, stage.exit[2] * scaleX, stage.exit[3] * scaleY]
          : null,
        keysRequired: Number(stage.keysRequired ?? 0),
        keySpots: Array.isArray(stage.keySpots)
          ? stage.keySpots.map(([x, y]) => [x * scaleX, y * scaleY])
          : [],
        bossTime: Number(stage.bossTime ?? 0),
        reinforcements: stage.reinforcements && Array.isArray(stage.reinforcements.entries)
          ? {
            every: Number(stage.reinforcements.every ?? 13),
            entries: stage.reinforcements.entries.map(([type, x, y]) => ({ type, x: x * scaleX, y: y * scaleY })),
          }
          : null,
      };
    });
  }

  const STAGES = normalizeInjectedStages(injectedData.STAGES ?? injectedData.stages) ?? BUILTIN_STAGES;

  class NetworkAdapter extends EventTarget {
    async connect() {
      throw new Error("NetworkAdapter.connect() must be implemented by a backend adapter.");
    }

    sendInput() {}
    sendEvent() {}
    disconnect() {}
  }

  class LocalNetworkAdapter extends NetworkAdapter {
    constructor() {
      super();
      this.mode = "local";
    }

    async connect() {
      return { playerId: "local-player", isHost: true, mode: "local" };
    }
  }

  const dom = {
    entrance: document.querySelector("#entrance-screen"),
    lobby: document.querySelector("#lobby-screen"),
    game: document.querySelector("#game-screen"),
    enter: document.querySelector("#enter-button"),
    start: document.querySelector("#start-button"),
    startStage: document.querySelector("#start-stage"),
    jobCards: [...document.querySelectorAll(".job-card")],
    selectedRoleSummary: document.querySelector("#selected-role-summary"),
    localPlayerJob: document.querySelector("#local-player-job"),
    localPlayerAvatar: document.querySelector("#local-player-avatar"),
    connectionStatus: document.querySelector("#connection-status"),
    connectionStatusText: document.querySelector("#connection-status-text"),
    roomLabel: document.querySelector("#room-label"),
    playerList: document.querySelector("#player-list"),
    playerCount: document.querySelector("#player-count"),
    playerName: document.querySelector("#player-name"),
    roomCode: document.querySelector("#room-code"),
    connectRoom: document.querySelector("#connect-room-button"),
    copyRoom: document.querySelector("#copy-room-button"),
    networkFeedback: document.querySelector("#network-feedback"),
    canvas: document.querySelector("#game-canvas"),
    stageBanner: document.querySelector("#stage-banner"),
    stageNumber: document.querySelector("#stage-number"),
    stageTitle: document.querySelector("#stage-title"),
    stageSubtitle: document.querySelector("#stage-subtitle"),
    hudRoleIcon: document.querySelector("#hud-role-icon"),
    hudRoleName: document.querySelector("#hud-role-name"),
    hudHpText: document.querySelector("#hud-hp-text"),
    healthFill: document.querySelector("#health-fill"),
    hudStage: document.querySelector("#hud-stage"),
    hudObjective: document.querySelector("#hud-objective"),
    hudProgress: document.querySelector("#hud-progress"),
    hudTimer: document.querySelector("#hud-timer"),
    basicSkillName: document.querySelector("#basic-skill-name"),
    basicCooldown: document.querySelector("#basic-cooldown"),
    rolePortrait: document.querySelector(".role-portrait"),
    combatMessage: document.querySelector("#combat-message"),
    pause: document.querySelector("#pause-button"),
    dialog: document.querySelector("#game-dialog"),
    dialogKicker: document.querySelector("#dialog-kicker"),
    dialogTitle: document.querySelector("#dialog-title"),
    dialogCopy: document.querySelector("#dialog-copy"),
    dialogStats: document.querySelector("#dialog-stats"),
    dialogPrimary: document.querySelector("#dialog-primary"),
    dialogSecondary: document.querySelector("#dialog-secondary"),
    touchControls: document.querySelector("#touch-controls"),
  };

  const ctx = dom.canvas.getContext("2d");
  const input = {
    keys: new Set(),
    mouse: { x: VIEW.width * 0.7, y: VIEW.height / 2, down: false, touched: false },
  };

  const game = {
    screen: "entrance",
    selectedJob: "archer",
    stageIndex: 0,
    stage: null,
    player: null,
    enemies: [],
    projectiles: [],
    enemyProjectiles: [],
    particles: [],
    effects: [],
    floatingText: [],
    waveIndex: -1,
    waveDelay: 0,
    stageEnding: false,
    elapsed: 0,
    stageElapsed: 0,
    kills: 0,
    totalStageEnemies: 0,
    runStats: { kills: 0, damage: 0, healing: 0, startedAt: 0 },
    lastTime: performance.now(),
    messageTimer: 0,
    screenShake: 0,
    network: new LocalNetworkAdapter(),
    networkTick: 0,
    keyItem: null,
    keyCollected: false,
    reinforcementsIn: 0,
    timeExpired: false,
    lobbyConnecting: false,
    p2pListenersBound: false,
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function normalize(x, y) {
    const length = Math.hypot(x, y) || 1;
    return { x: x / length, y: y / length };
  }

  function angleDiff(a, b) {
    return Math.atan2(Math.sin(a - b), Math.cos(a - b));
  }

  function seededNoise(x, y, seed) {
    const value = Math.sin(x * 12.9898 + y * 78.233 + seed * 39.425) * 43758.5453;
    return value - Math.floor(value);
  }

  function getLoadedSprite(name) {
    return window.ZOMBIE_ASSETS?.get?.(name) ?? null;
  }

  function drawLoadedSprite(name, targetHeight, facingAngle = 0) {
    const sprite = getLoadedSprite(name);
    if (!sprite || !sprite.width || !sprite.height) return false;
    const targetWidth = targetHeight * (sprite.width / sprite.height);
    const facingLeft = Math.cos(facingAngle) < 0;
    ctx.save();
    if (facingLeft) ctx.scale(-1, 1);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sprite, -targetWidth / 2, -targetHeight * 0.82, targetWidth, targetHeight);
    ctx.restore();
    return true;
  }

  function circleIntersectsRect(circle, rect) {
    const closestX = clamp(circle.x, rect.x, rect.x + rect.w);
    const closestY = clamp(circle.y, rect.y, rect.y + rect.h);
    const dx = circle.x - closestX;
    const dy = circle.y - closestY;
    return dx * dx + dy * dy < circle.radius * circle.radius;
  }

  function pointInObstacle(x, y, padding = 0) {
    return game.stage.obstacles.some(([rx, ry, rw, rh]) => (
      x > rx - padding && x < rx + rw + padding && y > ry - padding && y < ry + rh + padding
    ));
  }

  function findSafeSpawn(x, y, radius) {
    const spawn = { x, y, radius };
    for (let pass = 0; pass < 4; pass += 1) {
      let adjusted = false;
      for (const [rx, ry, rw, rh] of game.stage.obstacles) {
        if (!circleIntersectsRect(spawn, { x: rx, y: ry, w: rw, h: rh })) continue;
        const closestX = clamp(spawn.x, rx, rx + rw);
        const closestY = clamp(spawn.y, ry, ry + rh);
        const dx = spawn.x - closestX;
        const dy = spawn.y - closestY;
        const edgeDistance = Math.hypot(dx, dy);
        if (edgeDistance > 0) {
          const correction = radius - edgeDistance + 2;
          spawn.x += (dx / edgeDistance) * correction;
          spawn.y += (dy / edgeDistance) * correction;
        } else {
          const exits = [
            { distance: Math.abs(spawn.x - rx), x: rx - radius - 2, y: spawn.y },
            { distance: Math.abs(rx + rw - spawn.x), x: rx + rw + radius + 2, y: spawn.y },
            { distance: Math.abs(spawn.y - ry), x: spawn.x, y: ry - radius - 2 },
            { distance: Math.abs(ry + rh - spawn.y), x: spawn.x, y: ry + rh + radius + 2 },
          ];
          exits.sort((left, right) => left.distance - right.distance);
          spawn.x = exits[0].x;
          spawn.y = exits[0].y;
        }
        spawn.x = clamp(spawn.x, radius, VIEW.width - radius);
        spawn.y = clamp(spawn.y, radius, VIEW.height - radius);
        adjusted = true;
      }
      if (!adjusted) break;
    }
    return spawn;
  }

  function moveEntity(entity, dx, dy) {
    entity.x += dx;
    for (const [x, y, w, h] of game.stage.obstacles) {
      if (circleIntersectsRect(entity, { x, y, w, h })) {
        entity.x -= dx;
        break;
      }
    }
    entity.y += dy;
    for (const [x, y, w, h] of game.stage.obstacles) {
      if (circleIntersectsRect(entity, { x, y, w, h })) {
        entity.y -= dy;
        break;
      }
    }
    entity.x = clamp(entity.x, entity.radius, VIEW.width - entity.radius);
    entity.y = clamp(entity.y, entity.radius, VIEW.height - entity.radius);
  }

  function setScreen(name) {
    game.screen = name;
    dom.entrance.hidden = name !== "entrance";
    dom.lobby.hidden = name !== "lobby";
    dom.game.hidden = !["game", "paused", "dialog"].includes(name);
    if (name === "game") {
      requestAnimationFrame(() => dom.canvas.focus({ preventScroll: true }));
    }
  }

  function selectJob(jobKey) {
    if (!JOBS[jobKey]) return;
    game.selectedJob = jobKey;
    const job = JOBS[jobKey];
    for (const card of dom.jobCards) {
      const selected = card.dataset.job === jobKey;
      card.classList.toggle("is-selected", selected);
      card.setAttribute("aria-pressed", String(selected));
    }
    dom.selectedRoleSummary.textContent = job.summary;
    const localPlayerJob = document.querySelector("#local-player-job");
    const localPlayerAvatar = document.querySelector("#local-player-avatar");
    if (localPlayerJob) localPlayerJob.textContent = job.name;
    if (localPlayerAvatar) {
      localPlayerAvatar.className = `mini-avatar ${jobKey}`;
      localPlayerAvatar.textContent = job.icon;
    }
    if (window.EP1Network) {
      try {
        window.EP1Network.selectClass(jobKey);
        renderLobbyRoster(window.EP1Network.getState());
      } catch (_error) {
        // Local selection remains available if P2P is unavailable.
      }
    }
    game.network.sendEvent({ type: "role-selected", role: jobKey });
  }

  function createPlayer() {
    const job = JOBS[game.selectedJob];
    return {
      x: game.stage.playerSpawn[0],
      y: game.stage.playerSpawn[1],
      radius: 18,
      job: game.selectedJob,
      hp: job.hp,
      maxHp: job.hp,
      speed: job.speed,
      aim: 0,
      primaryCooldown: 0,
      invulnerable: 0,
      hitFlash: 0,
      moving: false,
      fireFuelMax: Number(job.maxFuel ?? 13.5),
      fireFuel: Number(job.maxFuel ?? 13.5),
    };
  }

  function updateRoleHud() {
    const job = JOBS[game.selectedJob];
    dom.hudRoleIcon.textContent = job.icon;
    dom.hudRoleName.textContent = job.name;
    dom.basicSkillName.textContent = job.basicName;
    dom.rolePortrait.style.background = job.color;
  }

  function startRun(startStage = 0) {
    game.runStats = { kills: 0, damage: 0, healing: 0, startedAt: performance.now() };
    game.elapsed = 0;
    loadStage(clamp(Number(startStage) || 0, 0, STAGES.length - 1), false);
    setScreen("game");
    game.network.sendEvent({ type: "run-start", stage: game.stageIndex, role: game.selectedJob });
  }

  function loadStage(index, preservePlayer = true) {
    const previousPlayer = game.player;
    game.stageIndex = index;
    game.stage = STAGES[index];
    game.enemies = [];
    game.projectiles = [];
    game.enemyProjectiles = [];
    game.particles = [];
    game.effects = [];
    game.floatingText = [];
    game.waveIndex = -1;
    game.waveDelay = 1.15;
    game.stageEnding = false;
    game.stageElapsed = 0;
    game.kills = 0;
    game.keyCollected = false;
    game.keyItem = Array.isArray(game.stage.keySpots) && game.stage.keySpots.length
      ? (() => {
        const [x, y] = game.stage.keySpots[(index * 3 + 1) % game.stage.keySpots.length];
        return { x, y, active: false };
      })()
      : null;
    game.reinforcementsIn = Number(game.stage.reinforcements?.every ?? 0);
    game.timeExpired = false;
    game.totalStageEnemies = game.stage.waves.reduce((total, wave) => total + wave.length, 0);
    game.player = createPlayer();
    if (preservePlayer && previousPlayer) {
      game.player.hp = Math.min(game.player.maxHp, previousPlayer.hp + Math.ceil(game.player.maxHp * 0.32));
    }
    updateRoleHud();
    dom.hudStage.textContent = `STAGE ${game.stage.id}`;
    dom.hudObjective.textContent = game.stage.objective;
    dom.stageNumber.textContent = `STAGE ${game.stage.id}`;
    dom.stageTitle.textContent = game.stage.title;
    dom.stageSubtitle.textContent = game.stage.subtitle;
    dom.stageBanner.classList.remove("is-visible");
    void dom.stageBanner.offsetWidth;
    dom.stageBanner.classList.add("is-visible");
    showMessage(`${game.stage.title} 진입`, 2.1);
    updateHud();
  }

  function spawnWave(index) {
    const wave = game.stage.waves[index];
    if (!wave) return;
    for (const descriptor of wave) {
      spawnEnemy(descriptor.type, descriptor.x, descriptor.y);
    }
    showMessage(`WAVE ${index + 1} / ${game.stage.waves.length}`, 1.8);
    burstParticles(VIEW.width / 2, 100, "#ffbd2f", 16, 110);
  }

  function spawnEnemy(typeKey, x, y, countsForObjective = true) {
    const type = ENEMY_TYPES[typeKey];
    if (!type) return;
    const safeSpawn = findSafeSpawn(x, y, type.radius);
    game.enemies.push({
      id: `${typeKey}-${performance.now()}-${Math.random()}`,
      type: typeKey,
      x: safeSpawn.x,
      y: safeSpawn.y,
      radius: type.radius,
      hp: type.hp,
      maxHp: type.hp,
      speed: type.speed,
      damage: type.damage,
      color: type.color,
      score: type.score,
      ranged: Boolean(type.ranged),
      boss: Boolean(type.boss),
      stationary: Boolean(type.stationary),
      summon: type.summon ?? null,
      summonEvery: Number(type.summonEvery ?? 0),
      secondLife: Number(type.secondLife ?? 0),
      reviveDelay: Number(type.reviveDelay ?? 0),
      revived: false,
      reviveTimer: 0,
      angle: Math.PI,
      contactCooldown: 0,
      attackCooldown: 1.2 + Math.random(),
      specialCooldown: type.boss ? 2.8 : 0,
      summonCooldown: type.boss ? 8 : Number(type.summonEvery ?? 0),
      stunned: 0,
      hitFlash: 0,
      vx: 0,
      vy: 0,
      alive: true,
      countsForObjective,
      bob: Math.random() * TAU,
    });
  }

  function showMessage(text, seconds = 1.4) {
    dom.combatMessage.textContent = text;
    dom.combatMessage.classList.add("is-visible");
    game.messageTimer = seconds;
  }

  function getAimVector() {
    if (!input.mouse.touched) {
      const nearest = getNearestEnemy(game.player.x, game.player.y);
      if (nearest) return normalize(nearest.x - game.player.x, nearest.y - game.player.y);
    }
    return { x: Math.cos(game.player.aim), y: Math.sin(game.player.aim) };
  }

  function getNearestEnemy(x, y, maxDistance = Infinity) {
    let nearest = null;
    let nearestDistance = maxDistance;
    for (const enemy of game.enemies) {
      if (!enemy.alive) continue;
      const current = Math.hypot(enemy.x - x, enemy.y - y);
      if (current < nearestDistance) {
        nearest = enemy;
        nearestDistance = current;
      }
    }
    return nearest;
  }

  function spawnProjectile(options) {
    game.projectiles.push({
      x: options.x,
      y: options.y,
      vx: options.vx,
      vy: options.vy,
      radius: options.radius ?? 6,
      damage: options.damage,
      life: options.life ?? 1.3,
      color: options.color ?? "#fff",
      pierce: options.pierce ?? 0,
      stun: options.stun ?? 0,
      knockback: options.knockback ?? 110,
      hitIds: new Set(),
      trail: options.trail ?? true,
    });
  }

  function performBasicAttack() {
    const player = game.player;
    const job = JOBS[player.job];
    if (player.primaryCooldown > 0 || game.screen !== "game") return;
    if (player.job === "fireman" && player.fireFuel <= 0) return;
    player.primaryCooldown = job.basicCooldown;
    const aim = getAimVector();
    player.aim = Math.atan2(aim.y, aim.x);
    const startX = player.x + aim.x * 26;
    const startY = player.y + aim.y * 26;

    if (player.job === "archer") {
      spawnProjectile({ x: startX, y: startY, vx: aim.x * 680, vy: aim.y * 680, damage: job.damage, color: "#ff7669", radius: 5, pierce: 99, knockback: 0, life: 0.48 });
      addMuzzle(startX, startY, "#ff7669");
    } else if (player.job === "medic") {
      spawnProjectile({ x: startX, y: startY, vx: aim.x * 535, vy: aim.y * 535, damage: job.damage, color: "#62e4c1", radius: 7, stun: Number(job.stun ?? 1), knockback: 0, life: 0.43 });
      addMuzzle(startX, startY, "#62e4c1");
    } else if (player.job === "chairman") {
      meleeAttack({ range: 94, arc: 1.85, damage: job.damage, stun: 0, knockback: 0, color: "#59c5e6" });
    } else if (player.job === "fireman") {
      coneAttack({ range: 155, arc: 1.25, damage: job.damage, stun: Number(job.stun ?? 0.24), knockback: 60, color: "#eaf4f4" });
    }
    game.network.sendEvent({ type: "attack", angle: player.aim, role: player.job });
  }

  function meleeAttack({ range, arc, damage, stun, knockback, color }) {
    const player = game.player;
    for (const enemy of game.enemies) {
      const dx = enemy.x - player.x;
      const dy = enemy.y - player.y;
      const d = Math.hypot(dx, dy);
      const delta = Math.abs(angleDiff(Math.atan2(dy, dx), player.aim));
      if (d <= range + enemy.radius && delta <= arc / 2) {
        damageEnemy(enemy, damage, { stun, knockback, sourceX: player.x, sourceY: player.y });
      }
    }
    game.effects.push({ type: "slash", x: player.x, y: player.y, angle: player.aim, range, arc, life: 0.22, maxLife: 0.22, color });
    game.screenShake = Math.max(game.screenShake, 3);
  }

  function coneAttack({ range, arc, damage, stun, knockback, color, dense = false }) {
    const player = game.player;
    for (const enemy of game.enemies) {
      const dx = enemy.x - player.x;
      const dy = enemy.y - player.y;
      const d = Math.hypot(dx, dy);
      const delta = Math.abs(angleDiff(Math.atan2(dy, dx), player.aim));
      if (d <= range + enemy.radius && delta <= arc / 2) {
        damageEnemy(enemy, damage, { stun, knockback, sourceX: player.x, sourceY: player.y });
      }
    }
    game.effects.push({ type: "cone", x: player.x, y: player.y, angle: player.aim, range, arc, life: dense ? 0.55 : 0.18, maxLife: dense ? 0.55 : 0.18, color });
    for (let i = 0; i < (dense ? 26 : 9); i += 1) {
      const angle = player.aim + (Math.random() - 0.5) * arc;
      const speed = 90 + Math.random() * range * 1.4;
      game.particles.push({ x: player.x + Math.cos(angle) * 28, y: player.y + Math.sin(angle) * 28, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0.28 + Math.random() * 0.32, maxLife: 0.6, color, size: 2 + Math.random() * 5 });
    }
  }

  function damageEnemy(enemy, damage, options = {}) {
    if (!enemy.alive || enemy.reviveTimer > 0) return;
    enemy.hp -= damage;
    enemy.hitFlash = 0.11;
    enemy.stunned = Math.max(enemy.stunned, options.stun ?? 0);
    const direction = normalize(enemy.x - (options.sourceX ?? enemy.x), enemy.y - (options.sourceY ?? enemy.y));
    enemy.vx += direction.x * (options.knockback ?? 0);
    enemy.vy += direction.y * (options.knockback ?? 0);
    game.runStats.damage += damage;
    floatText(enemy.x, enemy.y - enemy.radius - 7, Math.round(damage), options.critical ? "#fff0a7" : "#ffffff");
    burstParticles(enemy.x, enemy.y, enemy.color, Math.min(7, 2 + Math.ceil(damage / 15)), 95);
    if (enemy.hp <= 0) killEnemy(enemy);
  }

  function killEnemy(enemy) {
    if (!enemy.alive) return;
    if (enemy.secondLife > 0 && !enemy.revived) {
      enemy.revived = true;
      enemy.hp = enemy.secondLife;
      enemy.reviveTimer = Math.max(0.2, enemy.reviveDelay || 3);
      enemy.stunned = enemy.reviveTimer;
      floatText(enemy.x, enemy.y - enemy.radius - 8, "부활", "#d8c5ff");
      showMessage("거대 좀비가 다시 일어납니다!", 1.3);
      return;
    }
    enemy.alive = false;
    if (enemy.countsForObjective) game.kills += 1;
    game.runStats.kills += 1;
    burstParticles(enemy.x, enemy.y, enemy.color, enemy.boss ? 55 : 18, enemy.boss ? 330 : 180);
    game.effects.push({ type: "ring", x: enemy.x, y: enemy.y, radius: enemy.radius, maxRadius: enemy.boss ? 220 : 80, life: enemy.boss ? 0.8 : 0.35, maxLife: enemy.boss ? 0.8 : 0.35, color: enemy.color });
    game.screenShake = enemy.boss ? 16 : Math.max(game.screenShake, 4);
  }

  function damagePlayer(amount, source) {
    const player = game.player;
    if (!player || player.invulnerable > 0 || game.screen !== "game") return;
    player.hp = Math.max(0, player.hp - amount);
    player.invulnerable = 0.7;
    player.hitFlash = 0.18;
    game.screenShake = Math.max(game.screenShake, 7);
    const direction = normalize(player.x - source.x, player.y - source.y);
    moveEntity(player, direction.x * 24, direction.y * 24);
    floatText(player.x, player.y - 32, `-${amount}`, "#ff6258");
    burstParticles(player.x, player.y, "#ff554b", 12, 150);
    if (player.hp <= 0) showGameOver();
  }

  function addMuzzle(x, y, color) {
    game.effects.push({ type: "ring", x, y, radius: 3, maxRadius: 20, life: 0.13, maxLife: 0.13, color });
    burstParticles(x, y, color, 5, 90);
  }

  function burstParticles(x, y, color, count, speed) {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * TAU;
      const velocity = speed * (0.25 + Math.random() * 0.75);
      const life = 0.28 + Math.random() * 0.5;
      game.particles.push({ x, y, vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity, life, maxLife: life, color, size: 2 + Math.random() * 4 });
    }
  }

  function floatText(x, y, text, color) {
    game.floatingText.push({ x, y, text: String(text), color, life: 0.75, maxLife: 0.75 });
  }

  function update(dt) {
    if (game.screen !== "game" || !game.player) return;
    game.elapsed += dt;
    game.stageElapsed += dt;
    game.messageTimer -= dt;
    if (game.messageTimer <= 0) dom.combatMessage.classList.remove("is-visible");

    updatePlayer(dt);
    updateStageMechanics(dt);
    updateWaves(dt);
    updateEnemies(dt);
    updateProjectiles(dt);
    updateEnemyProjectiles(dt);
    updateEffects(dt);

    game.enemies = game.enemies.filter((enemy) => enemy.alive);
    game.projectiles = game.projectiles.filter((projectile) => projectile.life > 0);
    game.enemyProjectiles = game.enemyProjectiles.filter((projectile) => projectile.life > 0);
    game.particles = game.particles.filter((particle) => particle.life > 0);
    game.effects = game.effects.filter((effect) => effect.life > 0);
    game.floatingText = game.floatingText.filter((item) => item.life > 0);
    game.screenShake = Math.max(0, game.screenShake - dt * 24);

    game.networkTick -= dt;
    if (game.networkTick <= 0) {
      game.networkTick = 0.1;
      game.network.sendInput({
        x: game.player.x,
        y: game.player.y,
        aim: game.player.aim,
        moving: game.player.moving,
        timestamp: performance.now(),
      });
    }
    updateHud();
  }

  function updatePlayer(dt) {
    const player = game.player;
    const job = JOBS[player.job];
    player.primaryCooldown = Math.max(0, player.primaryCooldown - dt);
    player.invulnerable = Math.max(0, player.invulnerable - dt);
    player.hitFlash = Math.max(0, player.hitFlash - dt);

    let moveX = 0;
    let moveY = 0;
    if (input.keys.has("KeyW") || input.keys.has("ArrowUp")) moveY -= 1;
    if (input.keys.has("KeyS") || input.keys.has("ArrowDown")) moveY += 1;
    if (input.keys.has("KeyA") || input.keys.has("ArrowLeft")) moveX -= 1;
    if (input.keys.has("KeyD") || input.keys.has("ArrowRight")) moveX += 1;
    const attacking = input.mouse.down || input.keys.has("Space");
    if (player.job === "fireman") {
      if (attacking) {
        player.fireFuel = Math.max(0, player.fireFuel - dt);
      } else {
        player.fireFuel = Math.min(player.fireFuelMax, player.fireFuel + (player.fireFuelMax / Number(job.recharge ?? 9)) * dt);
      }
    }
    const movement = normalize(moveX, moveY);
    const movementLocked = player.job === "fireman" && attacking && player.fireFuel > 0;
    player.moving = Boolean(moveX || moveY) && !movementLocked;
    if (player.moving) moveEntity(player, movement.x * player.speed * dt, movement.y * player.speed * dt);

    if (input.mouse.touched) {
      player.aim = Math.atan2(input.mouse.y - player.y, input.mouse.x - player.x);
    } else {
      const nearest = getNearestEnemy(player.x, player.y);
      if (nearest) player.aim = Math.atan2(nearest.y - player.y, nearest.x - player.x);
    }

    if (attacking) performBasicAttack();
  }

  function updateWaves(dt) {
    if (game.stageEnding) return;
    const aliveObjectiveEnemies = game.enemies.filter((enemy) => enemy.alive && enemy.countsForObjective).length;
    if (aliveObjectiveEnemies > 0) return;

    if (game.waveIndex < game.stage.waves.length - 1) {
      game.waveDelay -= dt;
      if (game.waveDelay <= 0) {
        game.waveIndex += 1;
        spawnWave(game.waveIndex);
        game.waveDelay = 1.25;
      }
      return;
    }

    if (game.keyItem && !game.keyCollected) {
      if (!game.keyItem.active) {
        game.keyItem.active = true;
        dom.hudObjective.textContent = "교장실 열쇠를 찾으세요";
        showMessage("교장실 열쇠가 나타났습니다!", 1.8);
      }
      return;
    }

    if (game.stage.exit) {
      dom.hudObjective.textContent = "도착 지점으로 이동하세요";
      if (!playerInsideRect(game.player, game.stage.exit)) return;
    }

    scheduleStageClear();
  }

  function updateStageMechanics(dt) {
    if (game.stage.bossTime > 0 && !game.timeExpired && game.stageElapsed >= game.stage.bossTime) {
      game.timeExpired = true;
      game.stageEnding = true;
      showGameOver("제한시간 3분 5초가 끝났습니다.");
      return;
    }

    if (game.keyItem?.active && !game.keyCollected && distance(game.player, game.keyItem) <= 34) {
      game.keyCollected = true;
      game.keyItem.active = false;
      dom.hudObjective.textContent = "교장실 출구로 이동하세요";
      burstParticles(game.keyItem.x, game.keyItem.y, "#ffe07a", 25, 160);
      showMessage("교장실 열쇠 획득!", 1.6);
    }

    const reinforcements = game.stage.reinforcements;
    const bossAlive = game.enemies.some((enemy) => enemy.alive && enemy.boss);
    if (reinforcements && bossAlive && game.waveIndex >= 0) {
      game.reinforcementsIn -= dt;
      if (game.reinforcementsIn <= 0 && game.enemies.length < 12) {
        for (const entry of reinforcements.entries) spawnEnemy(entry.type, entry.x, entry.y, false);
        game.reinforcementsIn = reinforcements.every;
        showMessage("캐비닛에서 증원이 나타났습니다!", 1.4);
      }
    }
  }

  function playerInsideRect(player, rect) {
    const [x, y, width, height] = rect;
    return player.x >= x && player.x <= x + width && player.y >= y && player.y <= y + height;
  }

  function scheduleStageClear() {
    if (game.stageEnding) return;
    game.stageEnding = true;
    const scheduledStage = game.stageIndex;
    window.setTimeout(() => {
      if (game.stageIndex !== scheduledStage || game.player?.hp <= 0 || game.timeExpired) return;
      if (game.screen === "game") showStageClear();
      else game.stageEnding = false;
    }, 650);
  }

  function updateEnemies(dt) {
    const player = game.player;
    for (const enemy of game.enemies) {
      if (!enemy.alive) continue;
      enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
      enemy.contactCooldown = Math.max(0, enemy.contactCooldown - dt);
      enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);
      enemy.specialCooldown = Math.max(0, enemy.specialCooldown - dt);
      enemy.summonCooldown = Math.max(0, enemy.summonCooldown - dt);
      enemy.bob += dt * (enemy.speed / 20);

      if (enemy.reviveTimer > 0) {
        enemy.reviveTimer = Math.max(0, enemy.reviveTimer - dt);
        continue;
      }

      if (enemy.stationary) continue;

      if (Math.abs(enemy.vx) + Math.abs(enemy.vy) > 1) {
        moveEntity(enemy, enemy.vx * dt, enemy.vy * dt);
        enemy.vx *= Math.pow(0.012, dt);
        enemy.vy *= Math.pow(0.012, dt);
      }

      if (enemy.stunned > 0) {
        enemy.stunned -= dt;
        continue;
      }

      if (enemy.summon && enemy.summonCooldown <= 0 && game.enemies.length < 14) {
        const angle = Math.random() * TAU;
        spawnEnemy(
          enemy.summon,
          clamp(enemy.x + Math.cos(angle) * (enemy.radius + 42), 70, VIEW.width - 70),
          clamp(enemy.y + Math.sin(angle) * (enemy.radius + 42), 70, VIEW.height - 70),
          false,
        );
        enemy.summonCooldown = Math.max(2, enemy.summonEvery || 8);
      }

      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const d = Math.hypot(dx, dy) || 1;
      const direction = { x: dx / d, y: dy / d };
      enemy.angle = Math.atan2(dy, dx);

      if (enemy.boss) {
        updateBoss(enemy, dt, direction, d);
      } else if (enemy.ranged) {
        if (d > 270) moveEntity(enemy, direction.x * enemy.speed * dt, direction.y * enemy.speed * dt);
        if (d < 195) moveEntity(enemy, -direction.x * enemy.speed * 0.65 * dt, -direction.y * enemy.speed * 0.65 * dt);
        if (enemy.attackCooldown <= 0 && d < 520) {
          spawnEnemyProjectile(enemy, direction, 265, 10, "#e3b84f");
          enemy.attackCooldown = 2.1 + Math.random() * 0.45;
        }
      } else {
        let speed = enemy.speed;
        if (enemy.type === "crawler" && d < 210) speed *= 1.35;
        moveEntity(enemy, direction.x * speed * dt, direction.y * speed * dt);
      }

      if (d < enemy.radius + player.radius + 3 && enemy.contactCooldown <= 0) {
        damagePlayer(enemy.damage, enemy);
        enemy.contactCooldown = enemy.boss ? 1.15 : 0.9;
      }
    }

    separateEnemies();
  }

  function updateBoss(enemy, dt, direction, playerDistance) {
    if (playerDistance > enemy.radius + game.player.radius + 6) {
      moveEntity(enemy, direction.x * enemy.speed * dt, direction.y * enemy.speed * dt);
    }
  }

  function separateEnemies() {
    for (let i = 0; i < game.enemies.length; i += 1) {
      const a = game.enemies[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < game.enemies.length; j += 1) {
        const b = game.enemies[j];
        if (!b.alive) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1;
        const overlap = a.radius + b.radius - d;
        if (overlap > 0) {
          const nx = dx / d;
          const ny = dy / d;
          moveEntity(a, -nx * overlap * 0.25, -ny * overlap * 0.25);
          moveEntity(b, nx * overlap * 0.25, ny * overlap * 0.25);
        }
      }
    }
  }

  function spawnEnemyProjectile(enemy, direction, speed, damage, color, radius = 6) {
    game.enemyProjectiles.push({
      x: enemy.x + direction.x * (enemy.radius + 8),
      y: enemy.y + direction.y * (enemy.radius + 8),
      vx: direction.x * speed,
      vy: direction.y * speed,
      radius,
      damage,
      color,
      life: 4,
    });
  }

  function updateProjectiles(dt) {
    for (const projectile of game.projectiles) {
      projectile.life -= dt;
      if (projectile.life <= 0) continue;
      const previousX = projectile.x;
      const previousY = projectile.y;
      projectile.x += projectile.vx * dt;
      projectile.y += projectile.vy * dt;
      if (projectile.trail && Math.random() < 0.72) {
        game.particles.push({ x: previousX, y: previousY, vx: -projectile.vx * 0.03, vy: -projectile.vy * 0.03, life: 0.15, maxLife: 0.15, color: projectile.color, size: projectile.radius * 0.55 });
      }
      if (pointInObstacle(projectile.x, projectile.y, projectile.radius)) {
        projectile.life = 0;
        addMuzzle(projectile.x, projectile.y, projectile.color);
        continue;
      }
      for (const enemy of game.enemies) {
        if (!enemy.alive || projectile.hitIds.has(enemy.id)) continue;
        if (Math.hypot(projectile.x - enemy.x, projectile.y - enemy.y) <= projectile.radius + enemy.radius) {
          projectile.hitIds.add(enemy.id);
          damageEnemy(enemy, projectile.damage, {
            stun: projectile.stun,
            knockback: projectile.knockback,
            sourceX: previousX,
            sourceY: previousY,
          });
          if (projectile.pierce > 0) projectile.pierce -= 1;
          else projectile.life = 0;
          if (projectile.life <= 0) break;
        }
      }
      if (projectile.x < -30 || projectile.x > VIEW.width + 30 || projectile.y < -30 || projectile.y > VIEW.height + 30) projectile.life = 0;
    }
  }

  function updateEnemyProjectiles(dt) {
    const player = game.player;
    for (const projectile of game.enemyProjectiles) {
      projectile.life -= dt;
      projectile.x += projectile.vx * dt;
      projectile.y += projectile.vy * dt;
      if (pointInObstacle(projectile.x, projectile.y, projectile.radius)) {
        projectile.life = 0;
        continue;
      }
      if (Math.hypot(projectile.x - player.x, projectile.y - player.y) <= projectile.radius + player.radius) {
        damagePlayer(projectile.damage, projectile);
        projectile.life = 0;
      }
      if (projectile.x < -30 || projectile.x > VIEW.width + 30 || projectile.y < -30 || projectile.y > VIEW.height + 30) projectile.life = 0;
    }
  }

  function updateEffects(dt) {
    for (const particle of game.particles) {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= Math.pow(0.08, dt);
      particle.vy *= Math.pow(0.08, dt);
    }
    for (const effect of game.effects) effect.life -= dt;
    for (const item of game.floatingText) {
      item.life -= dt;
      item.y -= dt * 34;
    }
  }

  function updateHud() {
    const player = game.player;
    if (!player || !game.stage) return;
    const hpRatio = clamp(player.hp / player.maxHp, 0, 1);
    dom.hudHpText.textContent = `${Math.ceil(player.hp)} / ${player.maxHp}`;
    dom.healthFill.style.width = `${hpRatio * 100}%`;
    const job = JOBS[player.job];
    if (player.job === "fireman") {
      const fuelRatio = clamp(player.fireFuel / player.fireFuelMax, 0, 1);
      dom.basicCooldown.style.height = `${(1 - fuelRatio) * 100}%`;
      dom.basicSkillName.textContent = `소화기 분사 ${player.fireFuel.toFixed(1)}초`;
    } else {
      dom.basicCooldown.style.height = `${clamp(player.primaryCooldown / job.basicCooldown, 0, 1) * 100}%`;
    }
    if (game.stageIndex === 4) {
      const boss = game.enemies.find((enemy) => enemy.boss);
      dom.hudProgress.textContent = boss ? `BOSS ${Math.ceil((boss.hp / boss.maxHp) * 100)}%` : "BOSS 0%";
    } else if (game.keyItem && !game.keyCollected && game.keyItem.active) {
      dom.hudProgress.textContent = "KEY 0 / 1";
    } else if (game.keyCollected) {
      dom.hudProgress.textContent = "KEY 1 / 1";
    } else if (game.stage.exit && game.waveIndex >= game.stage.waves.length - 1 && game.enemies.every((enemy) => !enemy.countsForObjective)) {
      dom.hudProgress.textContent = "EXIT";
    } else {
      dom.hudProgress.textContent = `${game.kills} / ${game.totalStageEnemies}`;
    }
    const displayedTime = game.stage.bossTime > 0
      ? Math.max(0, game.stage.bossTime - game.stageElapsed)
      : game.stageElapsed;
    const minutes = Math.floor(displayedTime / 60);
    const seconds = Math.floor(displayedTime % 60);
    dom.hudTimer.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function render() {
    if (!game.stage || !game.player || !["game", "paused", "dialog"].includes(game.screen)) return;
    const shakeX = game.screenShake ? (Math.random() - 0.5) * game.screenShake : 0;
    const shakeY = game.screenShake ? (Math.random() - 0.5) * game.screenShake : 0;
    ctx.save();
    ctx.translate(shakeX, shakeY);
    drawMap();
    drawEffects(false);
    for (const projectile of game.projectiles) drawProjectile(projectile);
    for (const projectile of game.enemyProjectiles) drawProjectile(projectile, true);
    for (const enemy of game.enemies) drawEnemy(enemy);
    drawPlayer(game.player);
    drawEffects(true);
    drawBossBar();
    ctx.restore();

    if (game.screen === "paused") {
      ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    }
  }

  function drawMap() {
    const { palette } = game.stage;
    ctx.fillStyle = palette.floor;
    ctx.fillRect(-10, -10, VIEW.width + 20, VIEW.height + 20);
    const tileSize = 48;
    for (let y = 0; y < VIEW.height; y += tileSize) {
      for (let x = 0; x < VIEW.width; x += tileSize) {
        const noise = seededNoise(x / tileSize, y / tileSize, game.stageIndex);
        ctx.globalAlpha = 0.17 + noise * 0.08;
        ctx.fillStyle = noise > 0.52 ? palette.tile : palette.floor;
        ctx.fillRect(x + 1, y + 1, tileSize - 2, tileSize - 2);
      }
    }
    ctx.globalAlpha = 1;
    drawStageDecor();
    for (const [x, y, w, h] of game.stage.obstacles) drawObstacle(x, y, w, h);
    drawStageObjectives();
  }

  function drawStageObjectives() {
    const combatComplete = game.waveIndex >= game.stage.waves.length - 1
      && !game.enemies.some((enemy) => enemy.alive && enemy.countsForObjective);
    if (game.stage.exit) {
      const [x, y, width, height] = game.stage.exit;
      const unlocked = combatComplete && (!game.keyItem || game.keyCollected);
      ctx.save();
      ctx.fillStyle = unlocked ? "rgba(73, 222, 128, 0.2)" : "rgba(239, 68, 68, 0.14)";
      ctx.strokeStyle = unlocked ? "#4ade80" : "#ef4444";
      ctx.lineWidth = 4;
      ctx.setLineDash([10, 7]);
      ctx.fillRect(x, y, width, height);
      ctx.strokeRect(x, y, width, height);
      ctx.setLineDash([]);
      ctx.fillStyle = unlocked ? "#d9ffe7" : "#ffd6d6";
      ctx.font = "900 14px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(unlocked ? "EXIT" : "LOCK", x + width / 2, y + height / 2 + 5);
      ctx.restore();
    }

    if (game.keyItem?.active && !game.keyCollected) {
      const pulse = 1 + Math.sin(game.stageElapsed * 6) * 0.14;
      ctx.save();
      ctx.translate(game.keyItem.x, game.keyItem.y);
      ctx.scale(pulse, pulse);
      ctx.shadowColor = "#ffe27a";
      ctx.shadowBlur = 22;
      ctx.strokeStyle = "#ffe27a";
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(-8, 0, 11, 0, TAU);
      ctx.moveTo(3, 0);
      ctx.lineTo(28, 0);
      ctx.lineTo(28, 10);
      ctx.moveTo(18, 0);
      ctx.lineTo(18, 8);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawStageDecor() {
    const decor = game.stage.decor;
    ctx.save();
    if (decor === "corridor") {
      ctx.fillStyle = "rgba(236, 181, 48, 0.1)";
      for (let x = 100; x < 1180; x += 90) ctx.fillRect(x, 346, 48, 28);
      ctx.fillStyle = "rgba(255,255,255,0.055)";
      ctx.fillRect(80, 325, 1120, 4);
      ctx.fillRect(80, 391, 1120, 4);
    } else if (decor === "yard") {
      ctx.strokeStyle = "rgba(235, 238, 216, 0.23)";
      ctx.lineWidth = 3;
      ctx.strokeRect(95, 90, 1090, 540);
      ctx.beginPath();
      ctx.moveTo(640, 90);
      ctx.lineTo(640, 630);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(640, 360, 92, 0, TAU);
      ctx.stroke();
    } else if (decor === "cafeteria") {
      ctx.fillStyle = "rgba(215, 209, 177, 0.1)";
      for (let x = 100; x < 1180; x += 120) ctx.fillRect(x, 92, 54, 7);
      ctx.fillStyle = "rgba(134, 61, 42, 0.16)";
      ctx.fillRect(1130, 90, 45, 545);
    } else if (decor === "classroom") {
      ctx.strokeStyle = "rgba(212, 205, 231, 0.12)";
      ctx.lineWidth = 5;
      ctx.setLineDash([28, 18]);
      ctx.beginPath();
      ctx.moveTo(80, 360);
      ctx.lineTo(1200, 360);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (decor === "boss") {
      const glow = ctx.createRadialGradient(680, 360, 10, 680, 360, 290);
      glow.addColorStop(0, "rgba(181, 29, 58, 0.22)");
      glow.addColorStop(1, "rgba(181, 29, 58, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(350, 30, 660, 660);
      ctx.strokeStyle = "rgba(202, 44, 70, 0.22)";
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(680, 360, 180, 0, TAU);
      ctx.stroke();
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i < 8; i += 1) {
        const angle = (i / 8) * TAU;
        ctx.moveTo(680 + Math.cos(angle) * 205, 360 + Math.sin(angle) * 205);
        ctx.lineTo(680 + Math.cos(angle) * 270, 360 + Math.sin(angle) * 270);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawObstacle(x, y, w, h) {
    const { palette } = game.stage;
    ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
    ctx.fillRect(x + 8, y + 10, w, h);
    ctx.fillStyle = palette.wall;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = palette.edge;
    ctx.fillRect(x, y, w, Math.min(8, h));
    ctx.fillStyle = "rgba(255,255,255,0.045)";
    ctx.fillRect(x + 8, y + 14, Math.max(0, w - 16), Math.max(0, h - 24));
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  }

  function drawPlayer(player) {
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.globalAlpha = player.invulnerable > 0 && Math.floor(player.invulnerable * 14) % 2 ? 0.45 : 1;
    drawShadow(player.radius);
    if (drawLoadedSprite(player.job, 68, player.aim)) {
      if (player.hitFlash > 0) {
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = 0.38;
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(0, -10, 25, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
      return;
    }
    ctx.rotate(player.aim);
    ctx.fillStyle = player.hitFlash > 0 ? "#fff" : JOBS[player.job].color;
    ctx.fillRect(-13, -15, 27, 33);
    ctx.fillStyle = "#e9d2bd";
    ctx.beginPath();
    ctx.arc(0, -19, 11, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#16222d";
    ctx.beginPath();
    ctx.arc(-2, -22, 11, Math.PI, TAU);
    ctx.fill();
    ctx.fillStyle = "#f4f6f7";
    ctx.fillRect(8, -5, 20, 6);
    ctx.fillStyle = JOBS[player.job].color;
    ctx.fillRect(24, -7, 9, 10);
    ctx.fillStyle = "#121a21";
    ctx.fillRect(-11, 18, 8, 10);
    ctx.fillRect(4, 18, 8, 10);
    ctx.rotate(-player.aim);
    ctx.fillStyle = "#fff";
    ctx.font = "900 11px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(JOBS[player.job].icon, 0, 8);
    ctx.restore();
  }

  function drawEnemy(enemy) {
    if (!enemy.alive) return;
    ctx.save();
    ctx.translate(enemy.x, enemy.y + Math.sin(enemy.bob) * (enemy.boss ? 1.5 : 2.5));
    drawShadow(enemy.radius);
    const spriteName = enemy.type === "liquid" && !getLoadedSprite("liquid") ? "liquidBoss" : enemy.type;
    if (!enemy.boss && drawLoadedSprite(spriteName, enemy.radius * 3.35, enemy.angle)) {
      if (enemy.hitFlash > 0) {
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = 0.42;
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(0, -enemy.radius * 0.25, enemy.radius * 1.18, 0, TAU);
        ctx.fill();
      }
      if (enemy.stunned > 0) {
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#ffe96b";
        for (let i = 0; i < 3; i += 1) {
          const angle = game.stageElapsed * 5 + (i / 3) * TAU;
          ctx.fillRect(Math.cos(angle) * (enemy.radius + 8) - 3, -enemy.radius - 16 + Math.sin(angle) * 5, 6, 6);
        }
      }
      ctx.restore();
      if (enemy.hp < enemy.maxHp) drawHealthBar(enemy.x, enemy.y - enemy.radius - 17, enemy.hp / enemy.maxHp, enemy.radius * 2.2);
      return;
    }
    ctx.rotate(enemy.angle);
    const color = enemy.hitFlash > 0 ? "#ffffff" : enemy.color;

    if (enemy.boss) {
      ctx.fillStyle = "rgba(177, 32, 65, 0.28)";
      ctx.beginPath();
      ctx.arc(0, 0, enemy.radius + 17 + Math.sin(game.stageElapsed * 4) * 5, 0, TAU);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(48, 0);
      ctx.lineTo(28, 44);
      ctx.lineTo(-22, 52);
      ctx.lineTo(-53, 16);
      ctx.lineTo(-46, -34);
      ctx.lineTo(6, -56);
      ctx.lineTo(45, -33);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#da3452";
      ctx.beginPath();
      ctx.moveTo(31, -15);
      ctx.lineTo(10, -4);
      ctx.lineTo(31, 7);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#1b0d21";
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.moveTo(-20, 28);
      ctx.lineTo(-51, 62);
      ctx.moveTo(6, 33);
      ctx.lineTo(18, 74);
      ctx.stroke();
    } else if (enemy.type === "crawler") {
      ctx.fillStyle = color;
      ctx.fillRect(-22, -13, 43, 25);
      ctx.strokeStyle = color;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(-12, 8); ctx.lineTo(-30, 23);
      ctx.moveTo(10, 8); ctx.lineTo(30, 23);
      ctx.stroke();
      ctx.fillStyle = "#dfe6db";
      ctx.fillRect(10, -8, 7, 5);
    } else {
      const scale = enemy.type === "tank" ? 1.22 : enemy.type === "brute" ? 1.12 : 1;
      ctx.scale(scale, scale);
      ctx.fillStyle = color;
      ctx.fillRect(-14, -16, 29, 37);
      ctx.fillStyle = "#acb4a1";
      ctx.beginPath();
      ctx.arc(0, -21, 12, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#20242a";
      ctx.beginPath();
      ctx.arc(-3, -24, 11, Math.PI, TAU);
      ctx.fill();
      ctx.fillStyle = enemy.ranged ? "#ffd25d" : "#e9f0e6";
      ctx.fillRect(6, -25, 5, 4);
      ctx.fillStyle = "#20262b";
      ctx.fillRect(-12, 21, 8, 11);
      ctx.fillRect(5, 21, 8, 11);
      if (enemy.type === "brute" || enemy.type === "tank") {
        ctx.fillStyle = color;
        ctx.fillRect(-22, -12, 9, 31);
        ctx.fillRect(14, -12, 9, 31);
      }
    }

    if (enemy.stunned > 0) {
      ctx.rotate(-enemy.angle);
      ctx.fillStyle = "#ffe96b";
      for (let i = 0; i < 3; i += 1) {
        const angle = game.stageElapsed * 5 + (i / 3) * TAU;
        ctx.fillRect(Math.cos(angle) * (enemy.radius + 8) - 3, -enemy.radius - 16 + Math.sin(angle) * 5, 6, 6);
      }
    }
    ctx.restore();

    if (!enemy.boss && enemy.hp < enemy.maxHp) drawHealthBar(enemy.x, enemy.y - enemy.radius - 17, enemy.hp / enemy.maxHp, enemy.radius * 2.2);
  }

  function drawShadow(radius) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    ctx.beginPath();
    ctx.ellipse(2, radius * 0.72, radius * 0.92, radius * 0.37, 0, 0, TAU);
    ctx.fill();
  }

  function drawHealthBar(x, y, ratio, width) {
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fillRect(x - width / 2 - 2, y - 2, width + 4, 8);
    ctx.fillStyle = "#d94545";
    ctx.fillRect(x - width / 2, y, width * clamp(ratio, 0, 1), 4);
  }

  function drawProjectile(projectile, enemy = false) {
    ctx.save();
    ctx.translate(projectile.x, projectile.y);
    ctx.fillStyle = projectile.color;
    ctx.shadowColor = projectile.color;
    ctx.shadowBlur = enemy ? 10 : 7;
    ctx.beginPath();
    ctx.arc(0, 0, projectile.radius, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawEffects(foreground) {
    for (const effect of game.effects) {
      const progress = 1 - effect.life / effect.maxLife;
      if ((effect.type === "ring") !== foreground) continue;
      ctx.save();
      ctx.globalAlpha = clamp(effect.life / effect.maxLife, 0, 1);
      ctx.strokeStyle = effect.color;
      ctx.fillStyle = effect.color;
      if (effect.type === "ring") {
        const radius = effect.radius + (effect.maxRadius - effect.radius) * progress;
        ctx.lineWidth = Math.max(2, 8 * (1 - progress));
        ctx.beginPath();
        ctx.arc(effect.x, effect.y, radius, 0, TAU);
        ctx.stroke();
      } else if (effect.type === "slash") {
        ctx.lineWidth = 16 * (1 - progress);
        ctx.beginPath();
        ctx.arc(effect.x, effect.y, effect.range * (0.75 + progress * 0.25), effect.angle - effect.arc / 2, effect.angle + effect.arc / 2);
        ctx.stroke();
      } else if (effect.type === "cone") {
        ctx.globalAlpha *= 0.15;
        ctx.beginPath();
        ctx.moveTo(effect.x, effect.y);
        ctx.arc(effect.x, effect.y, effect.range, effect.angle - effect.arc / 2, effect.angle + effect.arc / 2);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    if (foreground) {
      for (const particle of game.particles) {
        ctx.save();
        ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
        ctx.fillStyle = particle.color;
        ctx.fillRect(particle.x - particle.size / 2, particle.y - particle.size / 2, particle.size, particle.size);
        ctx.restore();
      }
      for (const item of game.floatingText) {
        ctx.save();
        ctx.globalAlpha = clamp(item.life / item.maxLife, 0, 1);
        ctx.fillStyle = item.color;
        ctx.font = "900 17px system-ui";
        ctx.textAlign = "center";
        ctx.shadowColor = "#000";
        ctx.shadowBlur = 4;
        ctx.fillText(item.text, item.x, item.y);
        ctx.restore();
      }
    }
  }

  function drawBossBar() {
    const boss = game.enemies.find((enemy) => enemy.boss && enemy.alive);
    if (!boss) return;
    const width = 520;
    const x = (VIEW.width - width) / 2;
    const y = 655;
    ctx.fillStyle = "rgba(4, 5, 7, 0.84)";
    ctx.fillRect(x - 4, y - 22, width + 8, 35);
    ctx.fillStyle = "#d7c9da";
    ctx.font = "900 12px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("심층 변이체", VIEW.width / 2, y - 7);
    ctx.fillStyle = "#261421";
    ctx.fillRect(x, y, width, 9);
    const gradient = ctx.createLinearGradient(x, y, x + width, y);
    gradient.addColorStop(0, "#8d1d3f");
    gradient.addColorStop(1, "#ed4059");
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, width * clamp(boss.hp / boss.maxHp, 0, 1), 9);
  }

  function showDialog(config) {
    game.screen = "dialog";
    dom.dialogKicker.textContent = config.kicker ?? "MISSION UPDATE";
    dom.dialogTitle.textContent = config.title;
    dom.dialogCopy.textContent = config.copy;
    dom.dialogStats.innerHTML = config.stats ?? "";
    dom.dialogPrimary.textContent = config.primaryLabel ?? "계속";
    dom.dialogSecondary.textContent = config.secondaryLabel ?? "대기실";
    dom.dialog.hidden = false;
    dom.dialogPrimary.onclick = () => {
      dom.dialog.hidden = true;
      config.onPrimary?.();
    };
    dom.dialogSecondary.onclick = () => {
      dom.dialog.hidden = true;
      config.onSecondary?.();
    };
    dom.dialogPrimary.focus();
  }

  function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remain = Math.floor(seconds % 60);
    return `${String(minutes).padStart(2, "0")}:${String(remain).padStart(2, "0")}`;
  }

  function showStageClear() {
    const isFinal = game.stageIndex === STAGES.length - 1;
    const stats = `<span>처치<b>${game.kills}</b></span><span>피해량<b>${Math.round(game.runStats.damage)}</b></span><span>시간<b>${formatTime(game.stageElapsed)}</b></span>`;
    showDialog({
      kicker: isFinal ? "MISSION COMPLETE" : `STAGE ${game.stageIndex} CLEAR`,
      title: isFinal ? "작전 완료" : "구역 확보",
      copy: isFinal ? "심층 변이체를 제압했습니다. 모든 스테이지를 완료했습니다." : "잠시 숨을 고른 뒤 다음 구역으로 이동합니다.",
      stats,
      primaryLabel: isFinal ? "다시 플레이" : "다음 스테이지",
      secondaryLabel: "대기실",
      onPrimary: () => {
        if (isFinal) startRun(0);
        else {
          loadStage(game.stageIndex + 1, true);
          setScreen("game");
        }
      },
      onSecondary: returnToLobby,
    });
    game.network.sendEvent({ type: "stage-clear", stage: game.stageIndex, time: game.stageElapsed });
  }

  function showGameOver(reason = "대열을 재정비하고 다시 도전하세요.") {
    if (game.screen !== "game") return;
    game.stageEnding = true;
    game.screen = "dialog";
    input.mouse.down = false;
    input.keys.clear();
    const stats = `<span>도달 구역<b>${game.stageIndex}</b></span><span>총 처치<b>${game.runStats.kills}</b></span><span>생존 시간<b>${formatTime(game.elapsed)}</b></span>`;
    window.setTimeout(() => {
      showDialog({
        kicker: "MISSION FAILED",
        title: "작전 실패",
        copy: reason,
        stats,
        primaryLabel: "현재 스테이지 재도전",
        secondaryLabel: "대기실",
        onPrimary: () => {
          loadStage(game.stageIndex, false);
          setScreen("game");
        },
        onSecondary: returnToLobby,
      });
    }, 350);
  }

  function togglePause() {
    if (game.screen === "game") {
      game.screen = "paused";
      input.mouse.down = false;
      input.keys.clear();
      showDialog({
        kicker: "PAUSED",
        title: "일시 정지",
        copy: "준비되면 작전을 계속하세요.",
        stats: `<span>스테이지<b>${game.stageIndex}</b></span><span>처치<b>${game.kills}</b></span><span>시간<b>${formatTime(game.stageElapsed)}</b></span>`,
        primaryLabel: "계속",
        secondaryLabel: "대기실",
        onPrimary: () => setScreen("game"),
        onSecondary: returnToLobby,
      });
    }
  }

  function returnToLobby() {
    input.keys.clear();
    input.mouse.down = false;
    dom.dialog.hidden = true;
    setScreen("lobby");
    game.network.sendEvent({ type: "return-to-lobby" });
  }

  function setNetworkFeedback(message, isError = false) {
    if (!dom.networkFeedback) return;
    dom.networkFeedback.textContent = message;
    dom.networkFeedback.classList.toggle("is-error", isError);
  }

  function roomCodeFromLocation() {
    if (!window.EP1Network || !location.hash) return "";
    let value = location.hash.slice(1);
    try {
      value = decodeURIComponent(value);
    } catch (_error) {
      return "";
    }
    value = value.replace(/^room=/i, "").trim();
    try {
      return window.EP1Network.normalizeRoomCode(value);
    } catch (_error) {
      return "";
    }
  }

  function inviteUrlFor(roomCode) {
    const url = new URL(location.href);
    url.hash = roomCode;
    return url.href;
  }

  function updateInviteHash(roomCode) {
    try {
      history.replaceState(null, "", inviteUrlFor(roomCode));
    } catch (_error) {
      // A restricted local preview may disallow history writes; connecting still works.
    }
  }

  function renderLobbyRoster(state = {}) {
    if (!dom.playerList) return;
    const networkPlayers = Array.isArray(state.players) ? state.players : [];
    const players = networkPlayers.length ? networkPlayers : [{
      id: "local-player",
      name: dom.playerName?.value.trim() || "PLAYER",
      classId: game.selectedJob,
      isHost: true,
    }];
    const selfId = state.selfId || players[0]?.id;
    dom.playerList.replaceChildren();

    for (let index = 0; index < 4; index += 1) {
      const player = players[index];
      const slot = document.createElement("li");
      slot.className = `player-slot${player ? " is-filled" : ""}`;

      const number = document.createElement("span");
      number.className = "slot-number";
      number.textContent = String(index + 1).padStart(2, "0");
      slot.append(number);

      if (!player) {
        const empty = document.createElement("span");
        empty.className = "empty-slot";
        empty.textContent = "대기 중";
        slot.append(empty);
      } else {
        const classId = JOBS[player.classId] ? player.classId : "archer";
        const avatar = document.createElement("span");
        avatar.className = `mini-avatar ${classId}`;
        avatar.textContent = JOBS[classId].icon;
        if (player.id === selfId) avatar.id = "local-player-avatar";

        const name = document.createElement("span");
        name.className = "player-name";
        name.append(document.createTextNode(player.id === selfId ? `${player.name} (나)` : player.name));
        if (player.isHost) {
          const host = document.createElement("em");
          host.textContent = "방장";
          name.append(host);
        }

        const role = document.createElement("span");
        role.className = "player-job";
        role.textContent = JOBS[classId].name;
        if (player.id === selfId) role.id = "local-player-job";
        slot.append(avatar, name, role);
      }
      dom.playerList.append(slot);
    }

    if (dom.playerCount) dom.playerCount.textContent = String(players.length);
    const code = state.roomCode || dom.roomCode?.value.trim().toUpperCase() || "------";
    if (dom.roomLabel) dom.roomLabel.textContent = `ROOM ${code}`;
  }

  function renderNetworkState(state = {}) {
    const status = state.status || "idle";
    const online = state.online === true;
    const connecting = status === "connecting" || game.lobbyConnecting;
    dom.connectionStatus?.classList.toggle("is-connecting", connecting || status === "degraded");
    dom.connectionStatus?.classList.toggle("is-offline", !online && !connecting);

    if (dom.connectionStatusText) {
      if (connecting) dom.connectionStatusText.textContent = "P2P 방 연결 중";
      else if (online) dom.connectionStatusText.textContent = state.isHost ? "온라인 · 방장" : "온라인 · 참가자";
      else dom.connectionStatusText.textContent = "오프라인 1인 플레이";
    }

    if (dom.start) {
      dom.start.disabled = connecting || (online && !state.isHost);
      const small = dom.start.querySelector("small");
      if (small) small.textContent = online ? (state.isHost ? "방장 전용" : "방장 시작 대기") : "오프라인 1인";
    }
    if (dom.startStage) dom.startStage.disabled = connecting || (online && !state.isHost);
    if (dom.connectRoom) dom.connectRoom.disabled = connecting;
    if (dom.roomCode) dom.roomCode.disabled = connecting;
    if (dom.playerName) dom.playerName.disabled = connecting;
    if (dom.copyRoom) dom.copyRoom.disabled = !online || !state.roomCode;
    renderLobbyRoster(state);
  }

  async function connectLobby(requestedCode) {
    if (!window.EP1Network) {
      renderNetworkState({ status: "offline", online: false, players: [] });
      setNetworkFeedback("온라인 모듈을 불러오지 못했습니다. 오프라인 1인 모드로 진행할 수 있습니다.", true);
      return;
    }
    if (game.lobbyConnecting) {
      return;
    }
    let roomCode;
    try {
      roomCode = window.EP1Network.normalizeRoomCode(requestedCode || window.EP1Network.generateRoomCode());
    } catch (_error) {
      setNetworkFeedback("방 코드는 영문·숫자 4~10자로 입력하세요.", true);
      return;
    }

    const name = dom.playerName?.value.trim() || "PLAYER";
    game.lobbyConnecting = true;
    if (dom.roomCode) dom.roomCode.value = roomCode;
    updateInviteHash(roomCode);
    setNetworkFeedback("방을 찾는 중입니다. 처음 접속한 사람이 방장이 됩니다.");
    renderNetworkState({ status: "connecting", online: false, roomCode, players: [] });

    try {
      const state = await window.EP1Network.connectRoom(roomCode, { name, classId: game.selectedJob });
      game.lobbyConnecting = false;
      renderNetworkState(state);
      if (state.online) {
        setNetworkFeedback(state.isHost
          ? `방 ${roomCode} 생성 완료 · 초대 링크를 공유하세요.`
          : `방 ${roomCode} 참가 완료 · 방장의 시작을 기다리세요.`);
      } else {
        const message = state.errorCode === "peerjs-missing"
          ? "온라인 라이브러리를 불러오지 못했습니다. 오프라인 1인 모드로 전환했습니다."
          : "P2P 연결에 실패했습니다. 오프라인 1인 모드로 전환했습니다.";
        setNetworkFeedback(message, true);
      }
    } catch (error) {
      game.lobbyConnecting = false;
      renderNetworkState({ status: "offline", online: false, roomCode, players: [] });
      setNetworkFeedback(error?.message || "방 연결에 실패해 오프라인 모드로 전환했습니다.", true);
    }
  }

  async function copyInviteLink() {
    const state = window.EP1Network?.getState?.();
    if (!state?.online || !state.roomCode) {
      setNetworkFeedback("온라인 방에 연결된 뒤 초대 링크를 복사할 수 있습니다.", true);
      return;
    }
    const code = state.roomCode;
    const inviteUrl = inviteUrlFor(code);
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setNetworkFeedback("초대 링크를 복사했습니다.");
    } catch (_error) {
      dom.roomCode?.focus();
      dom.roomCode?.select();
      setNetworkFeedback(`초대 주소: ${inviteUrl}`);
    }
  }

  function setupP2PNetwork() {
    if (!window.EP1Network) {
      renderNetworkState({ status: "offline", online: false, players: [] });
      return;
    }
    if (game.p2pListenersBound) return;
    game.p2pListenersBound = true;
    window.EP1Network.on("status", (state) => renderNetworkState(state));
    window.EP1Network.on("roster", () => renderNetworkState(window.EP1Network.getState()));
    window.EP1Network.on("start", ({ info }) => {
      if (game.screen === "lobby") startRun(info.stage);
    });
    window.EP1Network.on("error", ({ message }) => setNetworkFeedback(message, true));
    renderNetworkState(window.EP1Network.getState());
  }

  function canvasPoint(event) {
    const rect = dom.canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * VIEW.width,
      y: ((event.clientY - rect.top) / rect.height) * VIEW.height,
    };
  }

  async function attachNetworkAdapter(adapter) {
    if (!adapter || typeof adapter.connect !== "function" || typeof adapter.sendInput !== "function" || typeof adapter.sendEvent !== "function") {
      throw new TypeError("Adapter must implement connect(), sendInput(), and sendEvent().");
    }
    game.network.disconnect?.();
    game.network = adapter;
    const session = await adapter.connect({ protocol: 1, maxPlayers: 4 });
    return session;
  }

  dom.enter.addEventListener("click", async () => {
    await game.network.connect({ protocol: 1, maxPlayers: 1 });
    setScreen("lobby");
    const inviteCode = roomCodeFromLocation();
    await connectLobby(inviteCode || window.EP1Network?.generateRoomCode?.());
  });

  dom.start.addEventListener("click", () => {
    const state = window.EP1Network?.getState?.();
    if (state?.online) {
      if (!state.isHost) {
        setNetworkFeedback("방장만 게임을 시작할 수 있습니다.", true);
        return;
      }
      const started = window.EP1Network.startGame({ stage: Number(dom.startStage.value) });
      if (!started) setNetworkFeedback("이미 시작된 방입니다. 새 방 코드로 다시 연결하세요.", true);
      return;
    }
    startRun(dom.startStage.value);
  });
  dom.jobCards.forEach((card) => card.addEventListener("click", () => selectJob(card.dataset.job)));
  dom.connectRoom?.addEventListener("click", () => connectLobby(dom.roomCode.value));
  dom.copyRoom?.addEventListener("click", copyInviteLink);
  dom.roomCode?.addEventListener("input", () => {
    dom.roomCode.value = dom.roomCode.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  });
  dom.playerName?.addEventListener("change", () => {
    const name = dom.playerName.value.trim() || "PLAYER";
    dom.playerName.value = name;
    try {
      window.EP1Network?.setPlayerName(name);
      renderLobbyRoster(window.EP1Network?.getState?.() || {});
    } catch (_error) {
      setNetworkFeedback("닉네임은 한글·영문·숫자 1~20자로 입력하세요.", true);
    }
  });
  dom.pause.addEventListener("click", togglePause);

  window.addEventListener("keydown", (event) => {
    const controlled = ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Escape"];
    if (["game", "paused", "dialog"].includes(game.screen) && controlled.includes(event.code)) event.preventDefault();
    if (event.code === "Escape" && game.screen === "game") {
      togglePause();
      return;
    }
    if (game.screen !== "game") return;
    input.keys.add(event.code);
  });

  window.addEventListener("keyup", (event) => input.keys.delete(event.code));
  window.addEventListener("blur", () => {
    input.keys.clear();
    input.mouse.down = false;
  });

  dom.canvas.addEventListener("pointermove", (event) => {
    const point = canvasPoint(event);
    input.mouse.x = point.x;
    input.mouse.y = point.y;
    input.mouse.touched = true;
  });
  dom.canvas.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "touch") {
      const point = canvasPoint(event);
      input.mouse.x = point.x;
      input.mouse.y = point.y;
      input.mouse.touched = true;
      input.mouse.down = true;
    }
  });
  window.addEventListener("pointerup", () => { input.mouse.down = false; });
  dom.canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  for (const button of dom.touchControls.querySelectorAll("[data-key]")) {
    const key = button.dataset.key;
    const press = (event) => { event.preventDefault(); input.keys.add(key); };
    const release = (event) => { event.preventDefault(); input.keys.delete(key); };
    button.addEventListener("pointerdown", press);
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("pointerleave", release);
  }
  const attackButton = dom.touchControls.querySelector("[data-action='attack']");
  attackButton.addEventListener("pointerdown", (event) => { event.preventDefault(); input.keys.add("Space"); });
  ["pointerup", "pointercancel", "pointerleave"].forEach((name) => attackButton.addEventListener(name, (event) => { event.preventDefault(); input.keys.delete("Space"); }));

  window.QuarantineGameNetwork = Object.freeze({
    NetworkAdapter,
    LocalNetworkAdapter,
    attach: attachNetworkAdapter,
    protocolVersion: 1,
  });

  if (window.ZOMBIE_ASSETS?.preload) {
    const spriteNames = [...new Set([...Object.keys(JOBS), ...Object.keys(ENEMY_TYPES), "liquidBoss"])];
    window.ZOMBIE_ASSETS.preload(spriteNames).catch(() => {
      // Canvas placeholders remain active when an optional reference sprite cannot load.
    });
  }

  function loop(now) {
    const dt = Math.min(0.033, Math.max(0, (now - game.lastTime) / 1000));
    game.lastTime = now;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  setupP2PNetwork();
  selectJob("archer");
  requestAnimationFrame(loop);
})();
