/* =========================================================================
 *  graphics.js — 오리지널 프로시저럴 아트 렌더러
 *  지형/유닛 스프라이트/이펙트/미니맵/초상화 전부 코드로 그린 자체 제작 그래픽.
 * ========================================================================= */
'use strict';
(function () {
  const T = 32, ONE = 256, FP = 8;
  const Gfx = {};
  let terrainCanvas = null, creepCanvas = null, fogCanvas = null, fogCtx = null;
  const spriteCache = new Map();
  const buildingCache = new Map();
  const portraitCache = new Map();

  // ---- 색 도우미 -----------------------------------------------------------
  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g2 = (n >> 8) & 255, b = n & 255;
    r = Math.max(0, Math.min(255, Math.round(r * f)));
    g2 = Math.max(0, Math.min(255, Math.round(g2 * f)));
    b = Math.max(0, Math.min(255, Math.round(b * f)));
    return `rgb(${r},${g2},${b})`;
  }
  function rgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  // ---- 지형 ----------------------------------------------------------------
  function renderTerrain(map) {
    const c = document.createElement('canvas');
    c.width = map.w * T; c.height = map.h * T;
    const x2 = c.getContext('2d');
    const rnd = SC.MapGen.mulberry(map.seed * 7 + 3);
    for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
      const t = map.tiles[y * map.w + x];
      const px = x * T, py = y * T;
      let base;
      if (t === 1) base = ['#6b5a3e', '#75634a', '#665538'];        // 고지대
      else if (t === 4) base = ['#5d4f38', '#655641', '#584a32'];   // 경사로
      else if (t === 3) base = ['#173d5c', '#1a4468', '#144058'];   // 물
      else if (t === 2) base = ['#241f18', '#2a241c', '#1e1a13'];   // 절벽
      else base = ['#4a3d2c', '#514434', '#453927'];                // 저지대
      x2.fillStyle = base[(x * 7 + y * 13) % 3];
      x2.fillRect(px, py, T, T);
      // 노이즈 스펙클
      const sp = 6;
      for (let i = 0; i < sp; i++) {
        const sx = px + rnd() * T, sy = py + rnd() * T;
        x2.fillStyle = rnd() > 0.5 ? 'rgba(255,235,190,0.05)' : 'rgba(0,0,0,0.10)';
        x2.fillRect(sx, sy, 1 + rnd() * 2, 1 + rnd() * 2);
      }
      if (t === 3) { // 물 반짝임
        x2.fillStyle = 'rgba(120,190,255,0.12)';
        for (let i = 0; i < 3; i++) x2.fillRect(px + rnd() * T, py + rnd() * T, 3 + rnd() * 5, 1);
      }
      if (t === 5) { // 바위
        x2.fillStyle = '#3a3128';
        for (let i = 0; i < 3; i++) {
          const rx = px + 4 + rnd() * 20, ry = py + 4 + rnd() * 20, rr = 3 + rnd() * 6;
          x2.beginPath(); x2.arc(rx, ry, rr, 0, 7); x2.fill();
          x2.fillStyle = '#55483a';
          x2.beginPath(); x2.arc(rx - 1, ry - 1, rr * 0.6, 0, 7); x2.fill();
          x2.fillStyle = '#3a3128';
        }
      }
    }
    // 절벽 음영 및 하이라이트
    for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
      const t = map.tiles[y * map.w + x];
      if (t !== 2) continue;
      const px = x * T, py = y * T;
      const above = y > 0 ? map.tiles[(y - 1) * map.w + x] : 2;
      const below = y < map.h - 1 ? map.tiles[(y + 1) * map.w + x] : 2;
      if (above === 1 || above === 4) { // 위가 고지대: 벼랑면
        const gr = x2.createLinearGradient(px, py, px, py + T);
        gr.addColorStop(0, '#4d4232'); gr.addColorStop(0.5, '#2c251b'); gr.addColorStop(1, '#191510');
        x2.fillStyle = gr; x2.fillRect(px, py, T, T);
        x2.fillStyle = 'rgba(0,0,0,0.35)';
        for (let i = 0; i < 4; i++) x2.fillRect(px + i * 8 + 2, py + 4, 2, T - 8);
      }
      if (below !== 2 && below !== 3 && below !== undefined && (above !== 1 && above !== 4)) {
        x2.fillStyle = 'rgba(255,240,200,0.06)'; x2.fillRect(px, py + T - 4, T, 4);
      }
    }
    // 물가
    for (let y = 1; y < map.h - 1; y++) for (let x = 1; x < map.w - 1; x++) {
      if (map.tiles[y * map.w + x] !== 3) continue;
      let edge = false;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
        if (map.tiles[(y + oy) * map.w + x + ox] !== 3) edge = true;
      if (edge) { x2.fillStyle = 'rgba(150,200,255,0.18)'; x2.fillRect(x * T, y * T, T, 3); }
    }
    return c;
  }

  function renderCreep(g) {
    if (!creepCanvas) { creepCanvas = document.createElement('canvas'); creepCanvas.width = g.map.w * T; creepCanvas.height = g.map.h * T; }
    const x2 = creepCanvas.getContext('2d');
    x2.clearRect(0, 0, creepCanvas.width, creepCanvas.height);
    x2.fillStyle = '#3d2450';
    for (let y = 0; y < g.map.h; y++) for (let x = 0; x < g.map.w; x++) {
      if (!g.creep[y * g.map.w + x]) continue;
      x2.beginPath(); x2.arc(x * T + 16, y * T + 16, 22, 0, 7); x2.fill();
    }
    x2.fillStyle = 'rgba(120,70,160,0.35)';
    for (let y = 0; y < g.map.h; y++) for (let x = 0; x < g.map.w; x++) {
      if (!g.creep[y * g.map.w + x]) continue;
      if (((x * 31 + y * 17) & 7) < 2) { x2.beginPath(); x2.arc(x * T + ((x * 13) % 20) + 6, y * T + ((y * 7) % 20) + 6, 3, 0, 7); x2.fill(); }
    }
  }

  // ---- 스프라이트 페인터 ------------------------------------------------------
  // 유닛 아트 파라미터: 오리지널 디자인 (실루엣 컨셉만 클래식 RTS 계열)
  const ART = {
    scv:      { fam: 'workerT', s: 20 }, marine:   { fam: 'trooper', s: 18 },
    firebat:  { fam: 'trooper', s: 19, accent: '#ff5a1f', tank2: true }, medic: { fam: 'trooper', s: 18, accent: '#e8f4ff', cross: true },
    ghost:    { fam: 'trooper', s: 17, slim: true, accent: '#9fb8c8' },
    vulture:  { fam: 'bike', s: 24 }, siege_tank: { fam: 'tank', s: 30 }, goliath: { fam: 'walker', s: 26 },
    wraith:   { fam: 'jet', s: 26 }, dropship: { fam: 'hauler', s: 28 }, science_vessel: { fam: 'orb', s: 30 },
    valkyrie: { fam: 'jet', s: 30, wide: true }, battlecruiser: { fam: 'capital', s: 40 },
    spider_mine: { fam: 'mine', s: 10 },
    larva:    { fam: 'grub', s: 12 }, egg: { fam: 'eggZ', s: 20 }, drone: { fam: 'bugfly', s: 20 },
    overlord: { fam: 'floater', s: 34 }, zergling: { fam: 'critter', s: 16 }, hydralisk: { fam: 'serpent', s: 22 },
    lurker:   { fam: 'serpent', s: 28, spiky: true }, mutalisk: { fam: 'wingZ', s: 26 }, scourge: { fam: 'wingZ', s: 14 },
    queen:    { fam: 'wingZ', s: 26, crown: true }, defiler: { fam: 'crawler', s: 24 }, ultralisk: { fam: 'behemoth', s: 36 },
    guardian: { fam: 'floater', s: 30, spiky: true }, devourer: { fam: 'floater', s: 32, jaw: true },
    broodling: { fam: 'critter', s: 10 }, infested_terran: { fam: 'trooper', s: 18, accent: '#7bd44a' },
    probe:    { fam: 'probe', s: 16 }, zealot: { fam: 'psiwar', s: 19 }, dragoon: { fam: 'quad', s: 28 },
    high_templar: { fam: 'robed', s: 17 }, dark_templar: { fam: 'robed', s: 18, dark: true },
    archon:   { fam: 'energy', s: 30 }, dark_archon: { fam: 'energy', s: 30, dark: true },
    shuttle:  { fam: 'hauler', s: 28, gold: true }, reaver: { fam: 'segment', s: 32 },
    observer: { fam: 'probe', s: 14, eye: true }, scout: { fam: 'jet', s: 26, gold: true },
    corsair:  { fam: 'jet', s: 22, gold: true, wide: true }, carrier: { fam: 'capital', s: 42, gold: true },
    interceptor: { fam: 'probe', s: 10 }, arbiter: { fam: 'capital', s: 32, gold: true, tri: true },
    scarab_proj: { fam: 'mine', s: 8, gold: true },
  };

  const RACE_BODY = { T: '#5a6570', Z: '#7a5a45', P: '#c8a832' };
  const RACE_DARK = { T: '#39424c', Z: '#54392c', P: '#8a7020' };

  function drawUnitArt(x2, tid, race, team, frame) {
    const a = ART[tid] || { fam: 'trooper', s: 18 };
    const s = a.s, body = a.gold ? '#c8a832' : RACE_BODY[race], dark = a.gold ? '#8a7020' : RACE_DARK[race];
    const tc = team;                                     // 팀 컬러
    const bob = Math.sin(frame * 0.9) * 1.2;
    x2.save();
    switch (a.fam) {
      case 'workerT': {
        x2.fillStyle = dark; roundRect(x2, -s * 0.45, -s * 0.35, s * 0.9, s * 0.7, 4); x2.fill();
        x2.fillStyle = body; roundRect(x2, -s * 0.35, -s * 0.28, s * 0.7, s * 0.56, 4); x2.fill();
        x2.fillStyle = tc; roundRect(x2, -s * 0.3, -s * 0.12, s * 0.28, s * 0.24, 2); x2.fill();
        x2.fillStyle = '#bfe3ff'; x2.fillRect(s * 0.1, -s * 0.12, s * 0.22, s * 0.24);   // 캐빈 창
        x2.fillStyle = dark; x2.fillRect(s * 0.34, -s * 0.3, s * 0.24, s * 0.12);        // 집게
        x2.fillRect(s * 0.34, s * 0.18, s * 0.24, s * 0.12);
        break;
      }
      case 'trooper': {
        const w = a.slim ? 0.32 : 0.42;
        x2.fillStyle = 'rgba(0,0,0,0.25)';
        x2.fillRect(-s * 0.3, s * 0.3 + bob * 0.4, s * 0.22, s * 0.18); x2.fillRect(s * 0.08, s * 0.3 - bob * 0.4, s * 0.22, s * 0.18);
        x2.fillStyle = dark; x2.beginPath(); x2.ellipse(0, bob * 0.3, s * w, s * 0.5, 0, 0, 7); x2.fill();
        x2.fillStyle = a.accent || body; x2.beginPath(); x2.ellipse(0, bob * 0.3, s * (w - 0.08), s * 0.4, 0, 0, 7); x2.fill();
        x2.fillStyle = tc; x2.beginPath(); x2.ellipse(-s * 0.05, -s * 0.1 + bob * 0.3, s * 0.16, s * 0.14, 0, 0, 7); x2.fill(); // 어깨 패드
        x2.fillStyle = '#20272e'; x2.beginPath(); x2.arc(s * 0.05, -s * 0.16 + bob * 0.3, s * 0.15, 0, 7); x2.fill();          // 바이저
        x2.fillStyle = '#66d9ff'; x2.fillRect(s * 0.02, -s * 0.2 + bob * 0.3, s * 0.15, s * 0.07);
        x2.fillStyle = '#2a3138'; x2.fillRect(s * 0.1, -s * 0.05, s * 0.55, s * 0.12);   // 총
        if (a.cross) { x2.fillStyle = '#ff4a4a'; x2.fillRect(-s * 0.28, -s * 0.06, s * 0.14, s * 0.05); x2.fillRect(-s * 0.235, -s * 0.11, s * 0.05, s * 0.14); }
        if (a.tank2) { x2.fillStyle = '#813c16'; roundRect(x2, -s * 0.5, -s * 0.3, s * 0.2, s * 0.6, 3); x2.fill(); }
        break;
      }
      case 'bike': {
        x2.fillStyle = 'rgba(0,0,0,0.2)'; x2.beginPath(); x2.ellipse(0, s * 0.28, s * 0.5, s * 0.16, 0, 0, 7); x2.fill();
        x2.fillStyle = dark; x2.beginPath();
        x2.moveTo(s * 0.6, 0); x2.lineTo(-s * 0.4, -s * 0.32); x2.lineTo(-s * 0.55, 0); x2.lineTo(-s * 0.4, s * 0.32); x2.closePath(); x2.fill();
        x2.fillStyle = body; x2.beginPath();
        x2.moveTo(s * 0.45, 0); x2.lineTo(-s * 0.3, -s * 0.22); x2.lineTo(-s * 0.42, 0); x2.lineTo(-s * 0.3, s * 0.22); x2.closePath(); x2.fill();
        x2.fillStyle = tc; x2.fillRect(-s * 0.28, -s * 0.1, s * 0.3, s * 0.2);
        x2.fillStyle = '#9fdcff'; x2.beginPath(); x2.arc(s * 0.22, 0, s * 0.09, 0, 7); x2.fill();
        x2.fillStyle = rgba('#57c8ff', 0.5); x2.fillRect(-s * 0.62, -s * 0.06, s * 0.16, s * 0.12); // 부스터
        break;
      }
      case 'tank': {
        x2.fillStyle = '#23282e'; roundRect(x2, -s * 0.5, -s * 0.36, s, s * 0.72, 5); x2.fill();       // 트랙
        x2.fillStyle = dark; roundRect(x2, -s * 0.42, -s * 0.3, s * 0.84, s * 0.6, 4); x2.fill();
        x2.fillStyle = body; roundRect(x2, -s * 0.34, -s * 0.22, s * 0.68, s * 0.44, 4); x2.fill();
        x2.fillStyle = tc; roundRect(x2, -s * 0.3, -s * 0.08, s * 0.2, s * 0.16, 2); x2.fill();
        x2.fillStyle = dark; x2.beginPath(); x2.arc(0, 0, s * 0.2, 0, 7); x2.fill();                  // 포탑
        x2.fillStyle = '#2a3138'; x2.fillRect(s * 0.05, -s * 0.05, s * 0.62, s * 0.1);                // 포신
        x2.fillStyle = 'rgba(255,255,255,0.12)'; x2.fillRect(-s * 0.34, -s * 0.22, s * 0.68, s * 0.08);
        break;
      }
      case 'walker': {
        x2.fillStyle = 'rgba(0,0,0,0.25)';
        x2.fillRect(-s * 0.35, s * 0.2 + bob, s * 0.16, s * 0.3); x2.fillRect(s * 0.2, s * 0.2 - bob, s * 0.16, s * 0.3);
        x2.fillStyle = dark; roundRect(x2, -s * 0.3, -s * 0.34, s * 0.6, s * 0.5, 5); x2.fill();
        x2.fillStyle = body; roundRect(x2, -s * 0.24, -s * 0.28, s * 0.48, s * 0.38, 4); x2.fill();
        x2.fillStyle = '#20272e'; x2.fillRect(-s * 0.42, -s * 0.26, s * 0.14, s * 0.3); x2.fillRect(s * 0.28, -s * 0.26, s * 0.14, s * 0.3); // 팔 포
        x2.fillStyle = tc; x2.fillRect(-s * 0.1, -s * 0.4, s * 0.2, s * 0.12);
        x2.fillStyle = '#66d9ff'; x2.fillRect(-s * 0.06, -s * 0.18, s * 0.12, s * 0.06);
        break;
      }
      case 'jet': {
        const w = a.wide ? 0.62 : 0.42;
        x2.fillStyle = dark; x2.beginPath();
        x2.moveTo(s * 0.62, 0); x2.lineTo(-s * 0.3, -s * w); x2.lineTo(-s * 0.12, 0); x2.lineTo(-s * 0.3, s * w); x2.closePath(); x2.fill();
        x2.fillStyle = body; x2.beginPath();
        x2.moveTo(s * 0.5, 0); x2.lineTo(-s * 0.2, -s * (w - 0.12)); x2.lineTo(-s * 0.05, 0); x2.lineTo(-s * 0.2, s * (w - 0.12)); x2.closePath(); x2.fill();
        x2.fillStyle = tc; x2.beginPath(); x2.moveTo(s * 0.25, 0); x2.lineTo(-s * 0.05, -s * 0.12); x2.lineTo(-s * 0.05, s * 0.12); x2.closePath(); x2.fill();
        x2.fillStyle = '#9fdcff'; x2.beginPath(); x2.ellipse(s * 0.28, 0, s * 0.1, s * 0.06, 0, 0, 7); x2.fill();
        x2.fillStyle = rgba('#57c8ff', 0.6); x2.fillRect(-s * 0.42, -s * 0.05, s * 0.14, s * 0.1);
        break;
      }
      case 'hauler': {
        x2.fillStyle = dark; roundRect(x2, -s * 0.5, -s * 0.3, s, s * 0.6, s * 0.2); x2.fill();
        x2.fillStyle = body; roundRect(x2, -s * 0.4, -s * 0.22, s * 0.8, s * 0.44, s * 0.15); x2.fill();
        x2.fillStyle = tc; roundRect(x2, -s * 0.1, -s * 0.3, s * 0.28, s * 0.6, 3); x2.fill();
        x2.fillStyle = '#9fdcff'; x2.fillRect(s * 0.3, -s * 0.08, s * 0.14, s * 0.16);
        x2.fillStyle = rgba('#57c8ff', 0.5); x2.fillRect(-s * 0.6, -s * 0.12, s * 0.14, s * 0.08); x2.fillRect(-s * 0.6, s * 0.04, s * 0.14, s * 0.08);
        break;
      }
      case 'orb': {
        x2.fillStyle = dark; x2.beginPath(); x2.arc(0, 0, s * 0.4, 0, 7); x2.fill();
        const gr = x2.createRadialGradient(-s * 0.12, -s * 0.12, 2, 0, 0, s * 0.4);
        gr.addColorStop(0, '#aeb9c4'); gr.addColorStop(1, body);
        x2.fillStyle = gr; x2.beginPath(); x2.arc(0, 0, s * 0.34, 0, 7); x2.fill();
        x2.strokeStyle = tc; x2.lineWidth = 2.5; x2.beginPath(); x2.ellipse(0, 0, s * 0.5, s * 0.18, 0.4, 0, 7); x2.stroke();
        x2.fillStyle = '#66d9ff'; x2.beginPath(); x2.arc(s * 0.12, -s * 0.08, s * 0.07, 0, 7); x2.fill();
        break;
      }
      case 'capital': {
        x2.fillStyle = dark; x2.beginPath();
        if (a.tri) { x2.moveTo(s * 0.55, 0); x2.lineTo(-s * 0.45, -s * 0.42); x2.lineTo(-s * 0.25, 0); x2.lineTo(-s * 0.45, s * 0.42); }
        else { x2.moveTo(s * 0.6, 0); x2.lineTo(s * 0.2, -s * 0.3); x2.lineTo(-s * 0.5, -s * 0.34); x2.lineTo(-s * 0.6, 0); x2.lineTo(-s * 0.5, s * 0.34); x2.lineTo(s * 0.2, s * 0.3); }
        x2.closePath(); x2.fill();
        x2.fillStyle = body; x2.beginPath();
        x2.moveTo(s * 0.48, 0); x2.lineTo(s * 0.14, -s * 0.22); x2.lineTo(-s * 0.42, -s * 0.26); x2.lineTo(-s * 0.5, 0); x2.lineTo(-s * 0.42, s * 0.26); x2.lineTo(s * 0.14, s * 0.22); x2.closePath(); x2.fill();
        x2.fillStyle = tc; roundRect(x2, -s * 0.3, -s * 0.1, s * 0.3, s * 0.2, 3); x2.fill();
        x2.fillStyle = '#9fdcff';
        for (let i = 0; i < 4; i++) x2.fillRect(-s * 0.35 + i * s * 0.18, -s * 0.05, s * 0.06, s * 0.1);
        x2.fillStyle = 'rgba(255,255,255,0.1)'; x2.fillRect(-s * 0.42, -s * 0.26, s * 0.85, s * 0.1);
        break;
      }
      case 'mine': {
        x2.fillStyle = a.gold ? '#c8a832' : '#5a6570'; x2.beginPath(); x2.arc(0, 0, s * 0.5, 0, 7); x2.fill();
        x2.fillStyle = '#ff4a4a'; x2.beginPath(); x2.arc(0, 0, s * 0.2, 0, 7); x2.fill();
        break;
      }
      case 'grub': {
        x2.fillStyle = '#6b4a8a'; x2.beginPath(); x2.ellipse(0, bob * 0.4, s * 0.5, s * 0.36, 0, 0, 7); x2.fill();
        x2.fillStyle = '#8a63aa'; x2.beginPath(); x2.ellipse(-s * 0.1, -s * 0.05 + bob * 0.4, s * 0.3, s * 0.22, 0, 0, 7); x2.fill();
        x2.fillStyle = '#2c1a3a'; x2.beginPath(); x2.arc(s * 0.25, bob * 0.4, s * 0.1, 0, 7); x2.fill();
        break;
      }
      case 'eggZ': {
        const gr = x2.createRadialGradient(-3, -5, 2, 0, 0, s * 0.55);
        gr.addColorStop(0, '#b89ecc'); gr.addColorStop(1, '#5a3a72');
        x2.fillStyle = gr; x2.beginPath(); x2.ellipse(0, 0, s * 0.42, s * 0.52, 0, 0, 7); x2.fill();
        x2.strokeStyle = 'rgba(230,200,255,0.4)'; x2.lineWidth = 1.5;
        x2.beginPath(); x2.moveTo(-s * 0.2, -s * 0.1); x2.quadraticCurveTo(0, s * 0.1, s * 0.2, -s * 0.05); x2.stroke();
        break;
      }
      case 'bugfly': {
        x2.fillStyle = rgba('#c8a0e0', 0.35);
        x2.beginPath(); x2.ellipse(-s * 0.15, -s * 0.3 - bob, s * 0.3, s * 0.14, -0.5, 0, 7); x2.fill();
        x2.beginPath(); x2.ellipse(-s * 0.15, s * 0.3 + bob, s * 0.3, s * 0.14, 0.5, 0, 7); x2.fill();
        x2.fillStyle = RACE_DARK.Z; x2.beginPath(); x2.ellipse(0, 0, s * 0.42, s * 0.3, 0, 0, 7); x2.fill();
        x2.fillStyle = '#9a7050'; x2.beginPath(); x2.ellipse(s * 0.05, 0, s * 0.3, s * 0.22, 0, 0, 7); x2.fill();
        x2.fillStyle = tc; x2.beginPath(); x2.ellipse(-s * 0.18, 0, s * 0.12, s * 0.1, 0, 0, 7); x2.fill();
        x2.fillStyle = '#301a10'; x2.beginPath(); x2.arc(s * 0.3, 0, s * 0.08, 0, 7); x2.fill();
        break;
      }
      case 'floater': {
        const gr = x2.createRadialGradient(-s * 0.1, -s * 0.15, 3, 0, 0, s * 0.5);
        gr.addColorStop(0, '#a08060'); gr.addColorStop(1, '#5a3c28');
        x2.fillStyle = gr; x2.beginPath(); x2.ellipse(0, bob * 0.5, s * 0.5, s * 0.38, 0, 0, 7); x2.fill();
        x2.fillStyle = tc; x2.beginPath(); x2.ellipse(-s * 0.15, -s * 0.1 + bob * 0.5, s * 0.14, s * 0.1, 0, 0, 7); x2.fill();
        if (a.spiky) { x2.strokeStyle = '#3a2418'; x2.lineWidth = 2;
          for (let i = 0; i < 5; i++) { const an = -0.8 + i * 0.4;
            x2.beginPath(); x2.moveTo(Math.cos(an) * s * 0.4, Math.sin(an) * s * 0.3 + bob * 0.5);
            x2.lineTo(Math.cos(an) * s * 0.62, Math.sin(an) * s * 0.5 + bob * 0.5); x2.stroke(); } }
        if (a.jaw) { x2.fillStyle = '#3a2418'; x2.beginPath();
          x2.moveTo(s * 0.4, -s * 0.12 + bob * 0.5); x2.lineTo(s * 0.65, 0 + bob * 0.5); x2.lineTo(s * 0.4, s * 0.12 + bob * 0.5); x2.closePath(); x2.fill(); }
        // 촉수
        x2.strokeStyle = '#6a4630'; x2.lineWidth = 2;
        for (let i = 0; i < 3; i++) { x2.beginPath(); x2.moveTo(-s * 0.2 + i * s * 0.2, s * 0.3 + bob * 0.5);
          x2.quadraticCurveTo(-s * 0.25 + i * s * 0.2, s * 0.55, -s * 0.15 + i * s * 0.2 + bob, s * 0.6); x2.stroke(); }
        break;
      }
      case 'critter': {
        x2.fillStyle = RACE_DARK.Z; x2.beginPath(); x2.ellipse(-s * 0.05, bob * 0.3, s * 0.38, s * 0.26, 0, 0, 7); x2.fill();
        x2.fillStyle = '#9a7050'; x2.beginPath(); x2.ellipse(0, bob * 0.3, s * 0.28, s * 0.18, 0, 0, 7); x2.fill();
        x2.fillStyle = tc; x2.beginPath(); x2.ellipse(-s * 0.2, bob * 0.3, s * 0.1, s * 0.08, 0, 0, 7); x2.fill();
        // 낫 팔
        x2.strokeStyle = '#c8b090'; x2.lineWidth = 2;
        x2.beginPath(); x2.moveTo(s * 0.15, -s * 0.12 + bob * 0.3); x2.quadraticCurveTo(s * 0.45, -s * 0.3, s * 0.5, -s * 0.05); x2.stroke();
        x2.beginPath(); x2.moveTo(s * 0.15, s * 0.12 + bob * 0.3); x2.quadraticCurveTo(s * 0.45, s * 0.3, s * 0.5, s * 0.05); x2.stroke();
        x2.fillStyle = '#c33'; x2.beginPath(); x2.arc(s * 0.22, bob * 0.3, s * 0.05, 0, 7); x2.fill();
        break;
      }
      case 'serpent': {
        x2.fillStyle = RACE_DARK.Z;
        x2.beginPath(); x2.ellipse(-s * 0.2, s * 0.05, s * 0.3, s * 0.2, 0.3, 0, 7); x2.fill();       // 꼬리
        x2.beginPath(); x2.ellipse(0, -s * 0.05 + bob * 0.3, s * 0.26, s * 0.3, 0, 0, 7); x2.fill();   // 몸통 세움
        x2.fillStyle = '#9a7050'; x2.beginPath(); x2.ellipse(s * 0.02, -s * 0.1 + bob * 0.3, s * 0.18, s * 0.2, 0, 0, 7); x2.fill();
        x2.fillStyle = tc; x2.beginPath(); x2.ellipse(-s * 0.05, s * 0.12, s * 0.12, s * 0.08, 0, 0, 7); x2.fill();
        // 머리 후드
        x2.fillStyle = '#5a3c28'; x2.beginPath();
        x2.moveTo(s * 0.1, -s * 0.35 + bob * 0.3); x2.lineTo(s * 0.35, -s * 0.15 + bob * 0.3); x2.lineTo(s * 0.15, -s * 0.05 + bob * 0.3); x2.closePath(); x2.fill();
        if (a.spiky) { x2.strokeStyle = '#c8b090'; x2.lineWidth = 2;
          for (let i = 0; i < 4; i++) { x2.beginPath(); x2.moveTo(-s * 0.1 + i * 6, -s * 0.2 + bob * 0.3); x2.lineTo(-s * 0.06 + i * 6, -s * 0.45 + bob * 0.3); x2.stroke(); } }
        x2.fillStyle = '#c33'; x2.beginPath(); x2.arc(s * 0.2, -s * 0.2 + bob * 0.3, 2, 0, 7); x2.fill();
        break;
      }
      case 'wingZ': {
        const flap = Math.sin(frame * 1.4) * 0.5;
        x2.fillStyle = rgba('#8a5a8a', 0.6);
        x2.beginPath(); x2.moveTo(0, 0); x2.quadraticCurveTo(-s * 0.3, -s * (0.7 + flap * 0.3), -s * 0.7, -s * (0.35 + flap * 0.2)); x2.quadraticCurveTo(-s * 0.3, -s * 0.15, 0, 0); x2.fill();
        x2.beginPath(); x2.moveTo(0, 0); x2.quadraticCurveTo(-s * 0.3, s * (0.7 + flap * 0.3), -s * 0.7, s * (0.35 + flap * 0.2)); x2.quadraticCurveTo(-s * 0.3, s * 0.15, 0, 0); x2.fill();
        x2.fillStyle = RACE_DARK.Z; x2.beginPath(); x2.ellipse(s * 0.05, 0, s * 0.32, s * 0.16, 0, 0, 7); x2.fill();
        x2.fillStyle = '#9a7050'; x2.beginPath(); x2.ellipse(s * 0.1, 0, s * 0.22, s * 0.1, 0, 0, 7); x2.fill();
        x2.fillStyle = tc; x2.beginPath(); x2.ellipse(-s * 0.12, 0, s * 0.09, s * 0.06, 0, 0, 7); x2.fill();
        if (a.crown) { x2.strokeStyle = '#c8b090'; x2.lineWidth = 2;
          x2.beginPath(); x2.moveTo(s * 0.28, -s * 0.08); x2.lineTo(s * 0.45, -s * 0.18); x2.stroke();
          x2.beginPath(); x2.moveTo(s * 0.28, s * 0.08); x2.lineTo(s * 0.45, s * 0.18); x2.stroke(); }
        break;
      }
      case 'crawler': {
        x2.fillStyle = RACE_DARK.Z; x2.beginPath(); x2.ellipse(0, bob * 0.2, s * 0.45, s * 0.24, 0, 0, 7); x2.fill();
        x2.fillStyle = '#7a5a8a'; x2.beginPath(); x2.ellipse(-s * 0.08, -s * 0.05 + bob * 0.2, s * 0.3, s * 0.16, 0, 0, 7); x2.fill();
        x2.fillStyle = tc; x2.beginPath(); x2.ellipse(-s * 0.28, bob * 0.2, s * 0.1, s * 0.07, 0, 0, 7); x2.fill();
        x2.strokeStyle = '#54392c'; x2.lineWidth = 2;
        for (let i = 0; i < 4; i++) {
          const lx = -s * 0.3 + i * s * 0.2;
          x2.beginPath(); x2.moveTo(lx, s * 0.15); x2.lineTo(lx - 3, s * 0.4 + ((i + frame) % 2) * 2); x2.stroke();
        }
        x2.fillStyle = '#c33'; x2.beginPath(); x2.arc(s * 0.32, bob * 0.2 - 2, 2, 0, 7); x2.fill();
        break;
      }
      case 'behemoth': {
        x2.fillStyle = 'rgba(0,0,0,0.25)'; x2.beginPath(); x2.ellipse(0, s * 0.3, s * 0.5, s * 0.16, 0, 0, 7); x2.fill();
        x2.fillStyle = RACE_DARK.Z; x2.beginPath(); x2.ellipse(-s * 0.05, bob * 0.3, s * 0.48, s * 0.34, 0, 0, 7); x2.fill();
        x2.fillStyle = '#9a7050'; x2.beginPath(); x2.ellipse(0, -s * 0.05 + bob * 0.3, s * 0.36, s * 0.24, 0, 0, 7); x2.fill();
        x2.fillStyle = tc; x2.beginPath(); x2.ellipse(-s * 0.25, bob * 0.3, s * 0.14, s * 0.1, 0, 0, 7); x2.fill();
        // 카이저 블레이드
        x2.strokeStyle = '#e0cca8'; x2.lineWidth = 4;
        x2.beginPath(); x2.moveTo(s * 0.3, -s * 0.2 + bob * 0.3); x2.quadraticCurveTo(s * 0.65, -s * 0.4, s * 0.7, -s * 0.1); x2.stroke();
        x2.beginPath(); x2.moveTo(s * 0.3, s * 0.2 + bob * 0.3); x2.quadraticCurveTo(s * 0.65, s * 0.4, s * 0.7, s * 0.1); x2.stroke();
        break;
      }
      case 'probe': {
        const gr = x2.createRadialGradient(-3, -4, 1, 0, 0, s * 0.5);
        gr.addColorStop(0, '#ffe9a0'); gr.addColorStop(1, '#c8a832');
        x2.fillStyle = gr; x2.beginPath();
        x2.moveTo(s * 0.5, 0); x2.lineTo(0, -s * 0.4); x2.lineTo(-s * 0.5, 0); x2.lineTo(0, s * 0.4); x2.closePath(); x2.fill();
        x2.fillStyle = tc; x2.beginPath(); x2.arc(0, 0, s * 0.16, 0, 7); x2.fill();
        x2.fillStyle = a.eye ? '#66ffd9' : '#66d9ff'; x2.beginPath(); x2.arc(s * 0.2, 0, s * 0.1, 0, 7); x2.fill();
        break;
      }
      case 'psiwar': {
        x2.fillStyle = 'rgba(0,0,0,0.25)';
        x2.fillRect(-s * 0.25, s * 0.28 + bob * 0.4, s * 0.18, s * 0.2); x2.fillRect(s * 0.05, s * 0.28 - bob * 0.4, s * 0.18, s * 0.2);
        x2.fillStyle = RACE_DARK.P; x2.beginPath(); x2.ellipse(0, bob * 0.3, s * 0.34, s * 0.44, 0, 0, 7); x2.fill();
        x2.fillStyle = '#c8a832'; x2.beginPath(); x2.ellipse(0, bob * 0.3, s * 0.27, s * 0.36, 0, 0, 7); x2.fill();
        x2.fillStyle = tc; x2.beginPath(); x2.ellipse(-s * 0.08, -s * 0.12 + bob * 0.3, s * 0.15, s * 0.12, 0, 0, 7); x2.fill();
        x2.fillStyle = '#3a4a5a'; x2.beginPath(); x2.arc(s * 0.02, -s * 0.18 + bob * 0.3, s * 0.12, 0, 7); x2.fill();
        x2.fillStyle = '#66d9ff'; x2.fillRect(-s * 0.02, -s * 0.22 + bob * 0.3, s * 0.12, s * 0.05);
        // 사이 블레이드
        x2.fillStyle = rgba('#57c8ff', 0.8);
        x2.fillRect(s * 0.18, -s * 0.3 + bob * 0.3, s * 0.42, s * 0.08);
        x2.fillRect(s * 0.18, s * 0.22 + bob * 0.3, s * 0.42, s * 0.08);
        break;
      }
      case 'quad': {
        x2.strokeStyle = RACE_DARK.P; x2.lineWidth = 4;
        for (const [lx, ly] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          x2.beginPath(); x2.moveTo(lx * s * 0.1, ly * s * 0.1);
          x2.lineTo(lx * s * 0.38, ly * s * 0.32 + (lx * bob) * 0.8); x2.lineTo(lx * s * 0.44, ly * s * 0.48); x2.stroke();
        }
        const gr = x2.createRadialGradient(-3, -5, 2, 0, 0, s * 0.4);
        gr.addColorStop(0, '#ffe9a0'); gr.addColorStop(1, '#a8862a');
        x2.fillStyle = gr; x2.beginPath(); x2.ellipse(0, -s * 0.05, s * 0.32, s * 0.28, 0, 0, 7); x2.fill();
        x2.fillStyle = tc; x2.beginPath(); x2.ellipse(0, -s * 0.14, s * 0.14, s * 0.1, 0, 0, 7); x2.fill();
        x2.fillStyle = '#66d9ff'; x2.beginPath(); x2.arc(s * 0.22, -s * 0.05, s * 0.08, 0, 7); x2.fill();
        break;
      }
      case 'robed': {
        const col = a.dark ? '#3a3450' : '#c8bfa0';
        x2.fillStyle = a.dark ? '#241f36' : '#8a8268'; x2.beginPath();
        x2.moveTo(0, -s * 0.42 + bob * 0.3); x2.lineTo(s * 0.3, s * 0.4); x2.lineTo(-s * 0.3, s * 0.4); x2.closePath(); x2.fill();
        x2.fillStyle = col; x2.beginPath();
        x2.moveTo(0, -s * 0.32 + bob * 0.3); x2.lineTo(s * 0.22, s * 0.4); x2.lineTo(-s * 0.22, s * 0.4); x2.closePath(); x2.fill();
        x2.fillStyle = tc; x2.fillRect(-s * 0.1, -s * 0.05 + bob * 0.3, s * 0.2, s * 0.14);
        x2.fillStyle = '#2c3642'; x2.beginPath(); x2.arc(0, -s * 0.3 + bob * 0.3, s * 0.13, 0, 7); x2.fill();
        x2.fillStyle = a.dark ? '#7bffb8' : '#66d9ff'; x2.fillRect(-s * 0.08, -s * 0.34 + bob * 0.3, s * 0.16, s * 0.05);
        break;
      }
      case 'energy': {
        const col = a.dark ? '#c05aff' : '#57c8ff';
        const gr = x2.createRadialGradient(0, 0, 2, 0, 0, s * 0.55);
        gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.4, rgba(col, 0.8)); gr.addColorStop(1, rgba(col, 0));
        x2.fillStyle = gr; x2.beginPath(); x2.arc(0, 0, s * 0.55, 0, 7); x2.fill();
        x2.fillStyle = a.dark ? '#3a2450' : '#2c3642';
        x2.beginPath(); x2.ellipse(0, 0, s * 0.2, s * 0.26, 0, 0, 7); x2.fill();
        x2.fillStyle = tc; x2.beginPath(); x2.ellipse(0, -s * 0.08, s * 0.1, s * 0.07, 0, 0, 7); x2.fill();
        x2.fillStyle = '#fff'; x2.beginPath(); x2.arc(0, -s * 0.14, 2.5, 0, 7); x2.fill();
        break;
      }
      case 'segment': {
        x2.fillStyle = RACE_DARK.P;
        for (let i = 0; i < 4; i++) { x2.beginPath(); x2.ellipse(-s * 0.3 + i * s * 0.2, bob * 0.2 * ((i & 1) ? 1 : -1), s * 0.16, s * 0.2, 0, 0, 7); x2.fill(); }
        x2.fillStyle = '#c8a832';
        for (let i = 0; i < 4; i++) { x2.beginPath(); x2.ellipse(-s * 0.3 + i * s * 0.2, bob * 0.2 * ((i & 1) ? 1 : -1), s * 0.11, s * 0.15, 0, 0, 7); x2.fill(); }
        x2.fillStyle = tc; x2.beginPath(); x2.ellipse(s * 0.32, 0, s * 0.12, s * 0.14, 0, 0, 7); x2.fill();
        x2.fillStyle = '#66d9ff'; x2.beginPath(); x2.arc(s * 0.38, 0, s * 0.05, 0, 7); x2.fill();
        break;
      }
    }
    x2.restore();
  }

  function roundRect(x2, x, y, w, h, r) {
    x2.beginPath();
    x2.moveTo(x + r, y); x2.arcTo(x + w, y, x + w, y + h, r); x2.arcTo(x + w, y + h, x, y + h, r);
    x2.arcTo(x, y + h, x, y, r); x2.arcTo(x, y, x + w, y, r); x2.closePath();
  }

  // 16방향 x 2프레임 스프라이트 시트
  function getSprite(tid, race, teamColor) {
    const key = tid + '|' + teamColor;
    if (spriteCache.has(key)) return spriteCache.get(key);
    const a = ART[tid] || { s: 18 };
    const cs = Math.ceil(a.s * 2.6);
    const c = document.createElement('canvas');
    c.width = cs * 16; c.height = cs * 2;
    const x2 = c.getContext('2d');
    for (let f = 0; f < 2; f++) for (let d = 0; d < 16; d++) {
      x2.save();
      x2.translate(d * cs + cs / 2, f * cs + cs / 2);
      x2.rotate(d * Math.PI / 8);
      drawUnitArt(x2, tid, race, teamColor, f * 2.2);
      x2.restore();
    }
    const spr = { c, cs };
    spriteCache.set(key, spr);
    return spr;
  }

  // ---- 건물 아트 -----------------------------------------------------------
  function drawBuildingArt(x2, tid, race, teamColor, w, h, tick) {
    const W = w * T, H = h * T;
    const def = SC.DATA.all[tid];
    x2.save();
    if (race === 'T') {
      // 금속 플랫폼 + 구조물
      const gr = x2.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, '#5d6874'); gr.addColorStop(1, '#39424c');
      x2.fillStyle = gr; roundRect(x2, 2, 4, W - 4, H - 6, 6); x2.fill();
      x2.fillStyle = '#2c343c'; roundRect(x2, 6, 8, W - 12, H - 14, 5); x2.fill();
      x2.fillStyle = '#4a545e'; roundRect(x2, 10, 12, W - 20, H - 22, 4); x2.fill();
      // 리벳
      x2.fillStyle = '#8a95a0';
      for (let i = 0; i < w * 2; i++) { x2.fillRect(8 + i * (W - 16) / (w * 2 - 1) - 1, 8, 2, 2); x2.fillRect(8 + i * (W - 16) / (w * 2 - 1) - 1, H - 10, 2, 2); }
      // 건물별 특징
      if (tid === 'command_center') {
        x2.fillStyle = '#5d6874'; roundRect(x2, W * 0.2, H * 0.12, W * 0.6, H * 0.5, 8); x2.fill();
        x2.fillStyle = '#9fdcff'; x2.fillRect(W * 0.32, H * 0.24, W * 0.36, H * 0.1);
        x2.fillStyle = teamColor; x2.fillRect(W * 0.42, H * 0.62, W * 0.16, H * 0.2);
      } else if (tid === 'barracks') {
        x2.fillStyle = '#5d6874'; roundRect(x2, W * 0.12, H * 0.2, W * 0.5, H * 0.55, 5); x2.fill();
        x2.fillStyle = teamColor; x2.fillRect(W * 0.66, H * 0.3, W * 0.2, H * 0.42);
        x2.fillStyle = '#20272e'; x2.fillRect(W * 0.2, H * 0.55, W * 0.32, H * 0.2); // 게이트
      } else if (tid === 'factory') {
        x2.fillStyle = '#5d6874'; roundRect(x2, W * 0.1, H * 0.15, W * 0.75, H * 0.4, 5); x2.fill();
        x2.fillStyle = '#20272e'; x2.fillRect(W * 0.15, H * 0.55, W * 0.45, H * 0.28);
        x2.fillStyle = teamColor; x2.fillRect(W * 0.68, H * 0.6, W * 0.16, H * 0.2);
        x2.fillStyle = '#8a95a0'; x2.fillRect(W * 0.75, H * 0.05, W * 0.06, H * 0.2); // 굴뚝
      } else if (tid === 'starport') {
        x2.fillStyle = '#5d6874'; x2.beginPath(); x2.ellipse(W / 2, H * 0.45, W * 0.35, H * 0.3, 0, 0, 7); x2.fill();
        x2.strokeStyle = '#9fdcff'; x2.lineWidth = 2; x2.beginPath(); x2.ellipse(W / 2, H * 0.45, W * 0.26, H * 0.2, 0, 0, 7); x2.stroke();
        x2.fillStyle = teamColor; x2.fillRect(W * 0.44, H * 0.7, W * 0.12, H * 0.18);
      } else if (tid === 'supply_depot') {
        x2.fillStyle = '#5d6874'; roundRect(x2, W * 0.15, H * 0.2, W * 0.7, H * 0.55, 8); x2.fill();
        x2.fillStyle = '#39424c';
        for (let i = 0; i < 3; i++) x2.fillRect(W * 0.2 + i * W * 0.22, H * 0.26, W * 0.16, H * 0.4);
        x2.fillStyle = teamColor; x2.fillRect(W * 0.4, H * 0.78, W * 0.2, H * 0.1);
      } else if (tid === 'missile_turret') {
        x2.fillStyle = '#5d6874'; x2.beginPath(); x2.arc(W / 2, H / 2, W * 0.3, 0, 7); x2.fill();
        x2.fillStyle = '#2c343c'; x2.fillRect(W * 0.42, H * 0.1, W * 0.16, H * 0.42);
        x2.fillStyle = '#c33'; x2.fillRect(W * 0.44, H * 0.12, W * 0.05, H * 0.14); x2.fillRect(W * 0.52, H * 0.12, W * 0.05, H * 0.14);
      } else if (tid === 'bunker') {
        x2.fillStyle = '#4a545e'; roundRect(x2, W * 0.12, H * 0.18, W * 0.76, H * 0.6, 10); x2.fill();
        x2.fillStyle = '#20272e';
        for (let i = 0; i < 3; i++) x2.fillRect(W * 0.2 + i * W * 0.22, H * 0.36, W * 0.14, H * 0.12);
      } else if (tid === 'refinery') {
        x2.fillStyle = '#3d7a54'; x2.beginPath(); x2.arc(W * 0.3, H * 0.45, W * 0.14, 0, 7); x2.fill();
        x2.fillStyle = '#5d6874'; roundRect(x2, W * 0.5, H * 0.2, W * 0.4, H * 0.55, 5); x2.fill();
        x2.fillStyle = '#7bd48a'; x2.fillRect(W * 0.56, H * 0.3, W * 0.28, H * 0.1);
      } else if (tid === 'academy') {
        x2.fillStyle = '#5d6874'; roundRect(x2, W * 0.15, H * 0.15, W * 0.7, H * 0.55, 5); x2.fill();
        x2.fillStyle = '#9fdcff'; x2.fillRect(W * 0.25, H * 0.25, W * 0.14, H * 0.14); x2.fillRect(W * 0.6, H * 0.25, W * 0.14, H * 0.14);
        x2.fillStyle = teamColor; x2.fillRect(W * 0.42, H * 0.72, W * 0.16, H * 0.14);
      } else if (tid.includes('comsat') || tid.includes('silo') || tid.includes('shop') || tid.includes('tower') || tid.includes('ops') || tid.includes('lab')) {
        x2.fillStyle = '#5d6874'; roundRect(x2, W * 0.15, H * 0.15, W * 0.7, H * 0.62, 5); x2.fill();
        if (tid === 'comsat_station') { x2.strokeStyle = '#9fdcff'; x2.lineWidth = 2;
          x2.beginPath(); x2.ellipse(W / 2, H * 0.4, W * 0.24, H * 0.16, -0.4, 0, 7); x2.stroke(); }
        if (tid === 'nuclear_silo') { x2.fillStyle = '#c33'; x2.beginPath(); x2.arc(W / 2, H * 0.45, W * 0.16, 0, 7); x2.fill(); }
      } else {
        x2.fillStyle = '#5d6874'; roundRect(x2, W * 0.15, H * 0.18, W * 0.68, H * 0.55, 5); x2.fill();
        x2.fillStyle = '#9fdcff'; x2.fillRect(W * 0.25, H * 0.3, W * 0.2, H * 0.12);
        x2.fillStyle = teamColor; x2.fillRect(W * 0.55, H * 0.55, W * 0.18, H * 0.18);
      }
      // 점멸등
      x2.fillStyle = (tick >> 4) & 1 ? '#ff6a4a' : '#7a2a1a';
      x2.beginPath(); x2.arc(W - 10, 10, 2.5, 0, 7); x2.fill();
    } else if (race === 'Z') {
      // 유기체 마운드
      const gr = x2.createRadialGradient(W / 2 - 6, H / 2 - 8, 4, W / 2, H / 2, W / 2);
      gr.addColorStop(0, '#9a7050'); gr.addColorStop(0.7, '#6a4630'); gr.addColorStop(1, '#3f2a1e');
      x2.fillStyle = gr;
      x2.beginPath(); x2.ellipse(W / 2, H / 2 + 2, W * 0.46, H * 0.42, 0, 0, 7); x2.fill();
      // 촉수/뿔
      x2.strokeStyle = '#54392c'; x2.lineWidth = 3;
      const horns = tid === 'spire' || tid === 'greater_spire' ? 1 : 4;
      for (let i = 0; i < horns; i++) {
        const an = -2.2 + i * 1.1;
        x2.beginPath(); x2.moveTo(W / 2 + Math.cos(an) * W * 0.3, H / 2 + Math.sin(an) * H * 0.3);
        x2.quadraticCurveTo(W / 2 + Math.cos(an) * W * 0.5, H / 2 + Math.sin(an) * H * 0.55 - 8,
          W / 2 + Math.cos(an) * W * 0.42, H / 2 + Math.sin(an) * H * 0.6); x2.stroke();
      }
      if (tid === 'spire' || tid === 'greater_spire') {
        x2.fillStyle = '#6a4630'; x2.beginPath();
        x2.moveTo(W * 0.35, H * 0.8); x2.quadraticCurveTo(W * 0.4, H * 0.1, W * 0.55, H * 0.05);
        x2.quadraticCurveTo(W * 0.62, H * 0.4, W * 0.65, H * 0.8); x2.closePath(); x2.fill();
      }
      if (tid === 'sunken_colony') {
        x2.strokeStyle = '#c8b090'; x2.lineWidth = 3;
        x2.beginPath(); x2.moveTo(W / 2, H * 0.4); x2.quadraticCurveTo(W * 0.7, H * 0.1, W * 0.8, H * 0.3); x2.stroke();
      }
      if (tid === 'spore_colony') {
        x2.fillStyle = '#b89ecc'; x2.beginPath(); x2.arc(W / 2, H * 0.4, W * 0.15, 0, 7); x2.fill();
      }
      // 숨쉬는 구멍
      const pulse = 0.7 + 0.3 * Math.sin(tick * 0.1);
      x2.fillStyle = rgba('#c05aff', 0.5 * pulse);
      x2.beginPath(); x2.ellipse(W / 2, H / 2, W * 0.14 * pulse, H * 0.1 * pulse, 0, 0, 7); x2.fill();
      x2.fillStyle = teamColor;
      x2.beginPath(); x2.ellipse(W * 0.3, H * 0.62, W * 0.08, H * 0.06, 0, 0, 7); x2.fill();
      if (['hatchery', 'lair', 'hive'].includes(tid)) {
        const tier = tid === 'hatchery' ? 1 : tid === 'lair' ? 2 : 3;
        x2.strokeStyle = '#c8b090'; x2.lineWidth = 2.5;
        for (let i = 0; i < tier + 1; i++) {
          x2.beginPath(); x2.moveTo(W * (0.3 + i * 0.13), H * 0.28);
          x2.lineTo(W * (0.32 + i * 0.13), H * (0.1 - tier * 0.01)); x2.stroke();
        }
      }
    } else {
      // 프로토스: 골드 크리스탈 구조체
      const gr = x2.createLinearGradient(0, 0, W, H);
      gr.addColorStop(0, '#e0c060'); gr.addColorStop(0.5, '#c8a832'); gr.addColorStop(1, '#8a7020');
      x2.fillStyle = gr;
      roundRect(x2, W * 0.1, H * 0.16, W * 0.8, H * 0.68, 10); x2.fill();
      x2.fillStyle = '#8a7020'; roundRect(x2, W * 0.16, H * 0.22, W * 0.68, H * 0.56, 8); x2.fill();
      x2.fillStyle = gr; roundRect(x2, W * 0.2, H * 0.26, W * 0.6, H * 0.48, 6); x2.fill();
      const glow = 0.6 + 0.4 * Math.sin(tick * 0.08);
      if (tid === 'nexus') {
        x2.fillStyle = rgba('#57c8ff', glow);
        x2.beginPath(); x2.moveTo(W / 2, H * 0.08); x2.lineTo(W * 0.62, H * 0.42); x2.lineTo(W / 2, H * 0.6); x2.lineTo(W * 0.38, H * 0.42); x2.closePath(); x2.fill();
      } else if (tid === 'pylon') {
        x2.fillStyle = rgba('#57c8ff', glow);
        x2.beginPath(); x2.moveTo(W / 2, H * 0.1); x2.lineTo(W * 0.72, H / 2); x2.lineTo(W / 2, H * 0.9); x2.lineTo(W * 0.28, H / 2); x2.closePath(); x2.fill();
        x2.fillStyle = 'rgba(255,255,255,0.6)'; x2.beginPath(); x2.arc(W / 2, H / 2, 3, 0, 7); x2.fill();
      } else if (tid === 'photon_cannon') {
        x2.fillStyle = rgba('#57c8ff', glow); x2.beginPath(); x2.arc(W / 2, H / 2, W * 0.2, 0, 7); x2.fill();
        x2.strokeStyle = '#e0c060'; x2.lineWidth = 3; x2.beginPath(); x2.arc(W / 2, H / 2, W * 0.28, 0, 7); x2.stroke();
      } else if (tid === 'gateway') {
        x2.fillStyle = '#2c3642'; roundRect(x2, W * 0.3, H * 0.3, W * 0.4, H * 0.45, 6); x2.fill();
        x2.fillStyle = rgba('#57c8ff', glow * 0.7); roundRect(x2, W * 0.33, H * 0.34, W * 0.34, H * 0.37, 5); x2.fill();
      } else if (tid === 'stargate') {
        x2.strokeStyle = rgba('#57c8ff', glow); x2.lineWidth = 4;
        x2.beginPath(); x2.arc(W / 2, H * 0.45, W * 0.25, 0, 7); x2.stroke();
        x2.fillStyle = rgba('#57c8ff', glow * 0.4); x2.beginPath(); x2.arc(W / 2, H * 0.45, W * 0.2, 0, 7); x2.fill();
      } else if (tid === 'assimilator') {
        x2.fillStyle = '#3d7a54'; x2.beginPath(); x2.arc(W * 0.3, H * 0.5, W * 0.13, 0, 7); x2.fill();
        x2.fillStyle = rgba('#7bd48a', glow); x2.fillRect(W * 0.5, H * 0.35, W * 0.3, H * 0.12);
      } else {
        x2.fillStyle = rgba('#57c8ff', glow * 0.8);
        x2.beginPath(); x2.arc(W / 2, H * 0.45, W * 0.12, 0, 7); x2.fill();
      }
      x2.fillStyle = teamColor;
      x2.beginPath(); x2.moveTo(W * 0.14, H * 0.75); x2.lineTo(W * 0.24, H * 0.62); x2.lineTo(W * 0.24, H * 0.85); x2.closePath(); x2.fill();
    }
    x2.restore();
  }

  function getBuildingSprite(tid, race, teamColor, w, h, animPhase) {
    const key = tid + '|' + teamColor + '|' + animPhase;
    if (buildingCache.has(key)) return buildingCache.get(key);
    const c = document.createElement('canvas');
    c.width = w * T; c.height = h * T;
    drawBuildingArt(c.getContext('2d'), tid, race, teamColor, w, h, animPhase * 16);
    buildingCache.set(key, c);
    return c;
  }

  // ---- 초상화 ---------------------------------------------------------------
  function drawPortrait(x2, tid, race, size, tick) {
    const s = size;
    x2.fillStyle = '#05080c'; x2.fillRect(0, 0, s, s);
    // 배경 글로우
    const bg = race === 'T' ? '#1a2a3a' : race === 'Z' ? '#2a1a30' : '#2a2410';
    const gr = x2.createRadialGradient(s / 2, s / 2, 4, s / 2, s / 2, s * 0.7);
    gr.addColorStop(0, bg); gr.addColorStop(1, '#05080c');
    x2.fillStyle = gr; x2.fillRect(0, 0, s, s);
    x2.save();
    x2.translate(s / 2, s * 0.56);
    x2.scale(1.9, 1.9);
    const breathe = Math.sin(tick * 0.06) * 0.6;
    x2.translate(0, breathe);
    // 두상 스타일
    const a = ART[tid] || {};
    if (race === 'T' && !['scv', 'vulture', 'siege_tank', 'goliath', 'wraith', 'dropship', 'science_vessel', 'valkyrie', 'battlecruiser'].includes(tid)) {
      // 헬멧 보병
      x2.fillStyle = '#39424c'; x2.beginPath(); x2.ellipse(0, 0, 15, 17, 0, 0, 7); x2.fill();
      x2.fillStyle = '#5a6570'; x2.beginPath(); x2.ellipse(0, -2, 13, 14, 0, 0, 7); x2.fill();
      x2.fillStyle = '#12181e'; x2.beginPath(); x2.ellipse(0, 0, 10, 8, 0, 0, 7); x2.fill();
      x2.fillStyle = a.accent || '#66d9ff'; x2.fillRect(-9, -3, 18, 3.5);
      x2.fillStyle = 'rgba(255,255,255,0.25)'; x2.fillRect(-9, -3, 5, 3.5);
    } else if (race === 'T') {
      // 기계 콕핏
      x2.fillStyle = '#39424c'; roundRect(x2, -16, -14, 32, 26, 5); x2.fill();
      x2.fillStyle = '#12181e'; roundRect(x2, -12, -10, 24, 14, 4); x2.fill();
      x2.fillStyle = '#66d9ff'; x2.fillRect(-9, -7, 18, 3);
      x2.fillStyle = ((tick >> 3) & 1) ? '#ff6a4a' : '#5a2a1a'; x2.beginPath(); x2.arc(10, 8, 2, 0, 7); x2.fill();
    } else if (race === 'Z') {
      x2.fillStyle = '#54392c'; x2.beginPath(); x2.ellipse(0, 2, 16, 14, 0, 0, 7); x2.fill();
      x2.fillStyle = '#9a7050'; x2.beginPath(); x2.ellipse(0, -1, 12, 10, 0, 0, 7); x2.fill();
      // 눈
      x2.fillStyle = '#ffb02a';
      x2.beginPath(); x2.ellipse(-5, -2, 3, 2 + Math.abs(breathe), 0.3, 0, 7); x2.fill();
      x2.beginPath(); x2.ellipse(5, -2, 3, 2 + Math.abs(breathe), -0.3, 0, 7); x2.fill();
      // 송곳니
      x2.fillStyle = '#e0cca8';
      x2.beginPath(); x2.moveTo(-6, 7); x2.lineTo(-4, 12); x2.lineTo(-2, 7); x2.closePath(); x2.fill();
      x2.beginPath(); x2.moveTo(2, 7); x2.lineTo(4, 12); x2.lineTo(6, 7); x2.closePath(); x2.fill();
      x2.strokeStyle = '#54392c'; x2.lineWidth = 2;
      x2.beginPath(); x2.moveTo(-12, -8); x2.quadraticCurveTo(-18, -16, -14, -20); x2.stroke();
      x2.beginPath(); x2.moveTo(12, -8); x2.quadraticCurveTo(18, -16, 14, -20); x2.stroke();
    } else {
      x2.fillStyle = '#3a4a5a'; x2.beginPath(); x2.ellipse(0, 0, 11, 15, 0, 0, 7); x2.fill();
      x2.fillStyle = '#4a5c6e'; x2.beginPath(); x2.ellipse(0, -3, 9, 11, 0, 0, 7); x2.fill();
      const glow = 0.6 + 0.4 * Math.sin(tick * 0.1);
      x2.fillStyle = rgba(a.dark ? '#7bffb8' : '#66d9ff', glow);
      x2.beginPath(); x2.ellipse(-4, -4, 2.5, 1.5, 0.2, 0, 7); x2.fill();
      x2.beginPath(); x2.ellipse(4, -4, 2.5, 1.5, -0.2, 0, 7); x2.fill();
      // 신경삭
      x2.strokeStyle = '#2c3642'; x2.lineWidth = 2.5;
      x2.beginPath(); x2.moveTo(-8, 6); x2.quadraticCurveTo(-14, 14, -10, 20); x2.stroke();
      x2.beginPath(); x2.moveTo(8, 6); x2.quadraticCurveTo(14, 14, 10, 20); x2.stroke();
    }
    x2.restore();
    // 스캔라인
    x2.fillStyle = 'rgba(120,200,255,0.05)';
    for (let y = (tick * 2) % 6; y < s; y += 6) x2.fillRect(0, y, s, 1);
    x2.strokeStyle = 'rgba(120,200,255,0.25)'; x2.lineWidth = 1;
    x2.strokeRect(0.5, 0.5, s - 1, s - 1);
  }

  // ---- 초기화 --------------------------------------------------------------
  Gfx.init = function (game) {
    terrainCanvas = renderTerrain(game.map);
    renderCreep(game);
    fogCanvas = document.createElement('canvas');
    fogCanvas.width = game.map.w * 2; fogCanvas.height = game.map.h * 2;
    fogCtx = fogCanvas.getContext('2d');
    spriteCache.clear(); buildingCache.clear();
  };
  Gfx.notifyCreep = function (game) { renderCreep(game); };

  // ---- 메인 렌더 -----------------------------------------------------------
  Gfx.render = function (ctx, game, cam, viewW, viewH, localPlayer, ui) {
    const g = game;
    const team = g.players[localPlayer] ? g.players[localPlayer].team : 0;
    const vis = g.teamVis[team];
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, viewW, viewH);
    ctx.save();
    ctx.translate(-cam.x, -cam.y);

    // 지형
    ctx.drawImage(terrainCanvas, cam.x, cam.y, viewW, viewH, cam.x, cam.y, viewW, viewH);
    if (g.creepDirtyGfx) { renderCreep(g); g.creepDirtyGfx = false; }
    ctx.drawImage(creepCanvas, cam.x, cam.y, viewW, viewH, cam.x, cam.y, viewW, viewH);

    // 자원
    for (const r of g.res) {
      const x = r.tx * T, y = r.ty * T;
      if (x + r.w * T < cam.x || x > cam.x + viewW || y + r.h * T < cam.y || y > cam.y + viewH) continue;
      if (r.kind === 'm') {
        if (r.amt <= 0) continue;
        drawMineral(ctx, x, y, r.amt, r.id);
      } else drawGeyser(ctx, x, y, r, g);
    }

    // 유닛 정렬: 지상 → 공중, y 정렬
    const ground = [], air = [], overlays = [];
    for (const u of g.units) {
      if (u.dead || u.hidden) continue;
      const sx = u.x / ONE, sy = u.y / ONE;
      if (sx < cam.x - 80 || sx > cam.x + viewW + 80 || sy < cam.y - 80 || sy > cam.y + viewH + 80) continue;
      // 시야 검사
      if (u.o !== localPlayer && g.players[u.o].team !== team) {
        if (!SC.Engine.isVisibleTo(g, team, u)) continue;
      }
      (u.fly ? air : ground).push(u);
    }
    ground.sort((a, b) => (a.y - b.y) || (a.id - b.id));
    air.sort((a, b) => (a.y - b.y) || (a.id - b.id));

    for (const u of ground) drawEntity(ctx, g, u, localPlayer, ui, team);
    // 총알
    for (const b of g.bullets) drawBullet(ctx, g, b);
    for (const u of air) drawEntity(ctx, g, u, localPlayer, ui, team);

    // 이펙트
    for (const f of g.fx) drawFx(ctx, g, f);

    // 존 표시 (스웜/디웹)
    for (const s of g.swarms) drawZone(ctx, s, '#a5652a', g.tick);
    for (const s of g.dwebs) drawZone(ctx, s, '#5a8ad4', g.tick);

    // 포그
    drawFog(ctx, g, team, cam, viewW, viewH);

    ctx.restore();
  };

  function drawMineral(ctx, x, y, amt, id) {
    const scale = amt > 800 ? 1 : amt > 300 ? 0.85 : 0.7;
    ctx.save();
    ctx.translate(x + T, y + T / 2);
    ctx.scale(scale, scale);
    const spikes = [[-18, 4, 12, -10], [-2, 6, 10, -14], [12, 5, 8, -8]];
    for (const [sx, sy, w, hh] of spikes) {
      const gr = ctx.createLinearGradient(sx, sy + hh, sx, sy + 8);
      gr.addColorStop(0, '#bfe8ff'); gr.addColorStop(0.5, '#3aa0e8'); gr.addColorStop(1, '#1a5a9a');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.moveTo(sx, sy + 6); ctx.lineTo(sx + w / 2, sy + hh); ctx.lineTo(sx + w, sy + 6);
      ctx.lineTo(sx + w * 0.8, sy + 10); ctx.lineTo(sx + w * 0.2, sy + 10); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath(); ctx.moveTo(sx + w / 2, sy + hh); ctx.lineTo(sx + w * 0.62, sy + 2); ctx.lineTo(sx + w / 2 + 1, sy + 2); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  function drawGeyser(ctx, x, y, r, g) {
    ctx.save();
    ctx.translate(x + r.w * T / 2, y + r.h * T / 2);
    ctx.fillStyle = '#3a3128';
    ctx.beginPath(); ctx.ellipse(0, 2, r.w * T * 0.45, r.h * T * 0.42, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#2c4a38';
    ctx.beginPath(); ctx.ellipse(0, 0, r.w * T * 0.3, r.h * T * 0.28, 0, 0, 7); ctx.fill();
    if (!r.building) {
      const p = (g.tick % 48) / 48;
      ctx.fillStyle = `rgba(120,220,140,${0.5 - p * 0.4})`;
      ctx.beginPath(); ctx.ellipse(0, -p * 26, 8 + p * 12, 5 + p * 8, 0, 0, 7); ctx.fill();
    }
    ctx.restore();
  }

  function drawEntity(ctx, g, u, localPlayer, ui, team) {
    const def = SC.DATA.all[u.tid];
    const x = u.x / ONE, y = u.y / ONE;
    const p = g.players[u.o];
    const selected = ui && ui.selection && ui.selection.includes(u.id);

    if (u.kind === 'building') {
      const [w, h] = def.tiles;
      const bx = u.tileX * T, by = u.tileY * T;
      if (selected) drawSelRing(ctx, x, y, Math.max(w, h) * T * 0.55, u.o === localPlayer ? '#3ddc55' : (g.players[u.o].team === team ? '#f4e42e' : '#f43f2e'));
      if (!u.complete) {
        // 건설 중
        const f = u.prog / u.total;
        if (p.race === 'T') {
          ctx.strokeStyle = '#8a95a0'; ctx.lineWidth = 2;
          ctx.strokeRect(bx + 3, by + 3, w * T - 6, h * T - 6);
          ctx.strokeStyle = '#5a6570';
          for (let i = 1; i < 3; i++) {
            ctx.beginPath(); ctx.moveTo(bx + 3, by + 3 + i * (h * T - 6) / 3); ctx.lineTo(bx + w * T - 3, by + 3 + i * (h * T - 6) / 3); ctx.stroke();
          }
          ctx.globalAlpha = Math.min(1, f * 1.3);
          ctx.drawImage(getBuildingSprite(u.tid, def.race, p.color, w, h, 0), bx, by);
          ctx.globalAlpha = 1;
        } else if (p.race === 'Z') {
          ctx.fillStyle = '#5a3a72';
          ctx.beginPath(); ctx.ellipse(x, y, w * T * 0.4 * (0.5 + f * 0.5), h * T * 0.38 * (0.5 + f * 0.5), 0, 0, 7); ctx.fill();
          ctx.fillStyle = rgba('#c05aff', 0.4 + 0.2 * Math.sin(g.tick * 0.2));
          ctx.beginPath(); ctx.ellipse(x, y, w * T * 0.2, h * T * 0.15, 0, 0, 7); ctx.fill();
        } else {
          ctx.globalAlpha = 0.35 + f * 0.5;
          ctx.drawImage(getBuildingSprite(u.tid, def.race, p.color, w, h, 0), bx, by);
          ctx.globalAlpha = 1;
          ctx.strokeStyle = rgba('#57c8ff', 0.8 - f * 0.4); ctx.lineWidth = 2;
          const rr = (g.tick % 24) / 24;
          ctx.beginPath(); ctx.ellipse(x, y, w * T * 0.5 * rr + 4, h * T * 0.45 * rr + 4, 0, 0, 7); ctx.stroke();
        }
        drawBar(ctx, x, by - 8, Math.min(60, w * T - 8), f, '#3ddc55', true);
      } else {
        ctx.drawImage(getBuildingSprite(u.tid, def.race, p.color, w, h, (g.tick >> 4) & 3), bx, by);
        if (def.needPower && !u.powered) {
          ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(bx, by, w * T, h * T);
          ctx.fillStyle = '#ffd60a'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center';
          ctx.fillText('!', x, y + 5);
        }
        // 생산 진행 바
        if (u.queue && u.queue.length && (selected || u.o === localPlayer)) {
          drawBar(ctx, x, by + h * T + 4, Math.min(60, w * T - 8), u.queue[0].t / u.queue[0].total, '#57c8ff', true);
        }
        if (u.morph) drawBar(ctx, x, by + h * T + 4, Math.min(60, w * T - 8), u.morph.t / u.morph.total, '#c05aff', true);
      }
      if (selected || u.lastHit > g.tick - 48) drawHpBar(ctx, g, u, x, by - 6, Math.min(64, w * T - 4));
      return;
    }

    // ---- 유닛 ----
    const spr = getSprite(u.tid, def.race, p.color);
    const cs = spr.cs;
    const frame = (((g.tick + u.id * 3) >> 3) & 1);
    const cloakedVisible = (u.st.cloak || u.st.burrow) && g.players[u.o].team !== team;
    const ownCloak = (u.st.cloak || u.st.burrow) && g.players[u.o].team === team;

    if (selected) {
      const col = u.o === localPlayer ? '#3ddc55' : (g.players[u.o].team === team ? '#f4e42e' : '#f43f2e');
      drawSelRing(ctx, x, y + (u.fly ? 14 : u.r * 0.5), u.r + 4, col);
    }
    // 그림자
    if (!u.st.burrow) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(x + (u.fly ? 8 : 0), y + (u.fly ? 20 : u.r * 0.55), u.r * 0.8, u.r * 0.3, 0, 0, 7); ctx.fill();
    }
    ctx.save();
    if (u.st.burrow) {
      // 잠복: 흙더미
      ctx.globalAlpha = ownCloak ? 0.7 : 0.9;
      ctx.fillStyle = '#4a3d2c';
      ctx.beginPath(); ctx.ellipse(x, y, u.r * 0.9, u.r * 0.5, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#5c4c36';
      ctx.beginPath(); ctx.ellipse(x, y - 2, u.r * 0.6, u.r * 0.3, 0, 0, 7); ctx.fill();
      if (g.players[u.o].team === team || cloakDetected(g, team, u)) {
        ctx.globalAlpha = 0.4;
        ctx.drawImage(spr.c, u.face * cs, frame * cs, cs, cs, x - cs / 2, y - cs / 2, cs, cs);
      }
      ctx.restore();
    } else {
      if (u.st.cloak) ctx.globalAlpha = g.players[u.o].team === team ? 0.55 : 0.35;
      if (u.st.hallu && g.players[u.o].team === team) ctx.globalAlpha = 0.8;
      ctx.drawImage(spr.c, u.face * cs, frame * cs, cs, cs, x - cs / 2, y - cs / 2, cs, cs);
      ctx.restore();
      // 상태 오버레이
      if (u.st.warp) { ctx.fillStyle = rgba('#57c8ff', 0.5); ctx.beginPath(); ctx.arc(x, y, u.r + 6, 0, 7); ctx.fill(); }
      if (u.st.stim) { ctx.fillStyle = 'rgba(255,80,80,0.25)'; ctx.beginPath(); ctx.arc(x, y, u.r + 2, 0, 7); ctx.fill(); }
      if (u.st.stasis) { ctx.fillStyle = rgba('#8ad4ff', 0.45); ctx.beginPath(); ctx.arc(x, y, u.r + 4, 0, 7); ctx.fill();
        ctx.strokeStyle = '#bfe8ff'; ctx.strokeRect(x - u.r, y - u.r, u.r * 2, u.r * 2); }
      if (u.st.lock) { ctx.strokeStyle = '#ffd60a'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, u.r + 3, 0, 7); ctx.stroke();
        ctx.fillStyle = '#ffd60a'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('⚡', x, y - u.r - 4); }
      if (u.st.mael) { ctx.strokeStyle = '#c05aff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, u.r + 3, 0, 7); ctx.stroke(); }
      if (u.st.ens) { ctx.fillStyle = 'rgba(140,220,80,0.3)'; ctx.beginPath(); ctx.arc(x, y, u.r + 2, 0, 7); ctx.fill(); }
      if (u.st.plague) { ctx.fillStyle = 'rgba(200,60,40,0.3)'; ctx.beginPath(); ctx.arc(x, y, u.r + 2, 0, 7); ctx.fill(); }
      if (u.st.irr) { const rr = (g.tick % 16) / 16; ctx.strokeStyle = rgba('#7bff4a', 1 - rr); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, u.r + rr * 10, 0, 7); ctx.stroke(); }
      if (u.st.dmx > 0) { ctx.strokeStyle = rgba('#8ad4ff', 0.7); ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(x, y, u.r + 5 + Math.sin(g.tick * 0.3), 0, 7); ctx.stroke(); }
      if (u.st.parasite != null) { ctx.fillStyle = '#c05aff'; ctx.beginPath(); ctx.arc(x + u.r, y - u.r, 3, 0, 7); ctx.fill(); }
      if (u.channel) { // 핵 조준 레이저
        ctx.strokeStyle = 'rgba(255,60,60,0.7)'; ctx.lineWidth = 1;
        const o = u.orders[0];
        if (o && o.x != null) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(o.x / ONE, o.y / ONE); ctx.stroke(); }
      }
    }
    // 캐리 표시
    if (u.carry) {
      ctx.fillStyle = u.carry.k === 'm' ? '#57c8ff' : '#7bd48a';
      ctx.fillRect(x - 3, y - u.r - 6, 6, 5);
    }
    // HP/실드/에너지 바
    if (selected || (u.lastHit && g.tick - u.lastHit < 48) || (ui && ui.showBars)) {
      drawHpBar(ctx, g, u, x, y - u.r - 10, Math.max(20, u.r * 2));
    }
  }

  function cloakDetected(g, team, u) {
    const i = ((u.y / ONE / T) | 0) * g.map.w + ((u.x / ONE / T) | 0);
    return g.teamDet[team] && g.teamDet[team][i];
  }

  function drawSelRing(ctx, x, y, r, col) {
    ctx.strokeStyle = col; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.42, 0, 0, 7); ctx.stroke();
    ctx.strokeStyle = rgba('#000000', 0.3);
    ctx.beginPath(); ctx.ellipse(x, y + 1.5, r, r * 0.42, 0, 0, 7); ctx.stroke();
  }

  function drawBar(ctx, cx, y, w, f, col, center) {
    const x = center ? cx - w / 2 : cx;
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(x - 1, y - 1, w + 2, 5);
    ctx.fillStyle = col; ctx.fillRect(x, y, Math.max(0, w * Math.min(1, f)), 3);
  }

  function drawHpBar(ctx, g, u, cx, y, w) {
    const hpF = u.hp / u.maxHp;
    const col = hpF > 0.66 ? '#3ddc55' : hpF > 0.33 ? '#f4e42e' : '#f43f2e';
    let yy = y;
    if (u.maxSh > 0) { drawBar(ctx, cx, yy, w, u.sh / u.maxSh, '#57c8ff', true); yy += 4; }
    drawBar(ctx, cx, yy, w, hpF, col, true); yy += 4;
    const def = SC.DATA.all[u.tid];
    if (def.me) { drawBar(ctx, cx, yy, w, u.en / SC.Engine.maxEnergy(g, u), '#c05aff', true); }
  }

  const BULLET_STYLE = {
    marine: ['#ffd88a', 1.5], firebat: ['#ff7a2a', 3], ghost: ['#c8e8ff', 1.5], vulture: ['#8ad4ff', 2.5],
    siege_tank: ['#ffb02a', 3], goliath: ['#ffd88a', 2], wraith: ['#ff5a5a', 2.5], battlecruiser: ['#ff5a5a', 3],
    valkyrie: ['#ff8a5a', 2.5], missile_turret: ['#c8e8ff', 2.5], bunker: ['#ffd88a', 1.5],
    hydralisk: ['#b8e068', 2.5], mutalisk: ['#7bd44a', 2.5], sunken_colony: ['#c05aff', 3], spore_colony: ['#c05aff', 2.5],
    devourer: ['#c8642a', 3], guardian: ['#7bd44a', 3], queen: ['#c05aff', 2],
    dragoon: ['#57c8ff', 3], photon_cannon: ['#57c8ff', 3], scout: ['#57c8ff', 2.5], interceptor: ['#ffe9a0', 2],
    arbiter: ['#8ad4ff', 2.5], corsair: ['#ff5aff', 2], zealot: ['#8ad4ff', 2], archon: ['#c8e8ff', 3],
  };
  function drawBullet(ctx, g, b) {
    const tgt = SC.Engine.byId(g, b.t);
    if (!tgt) return;
    const st = BULLET_STYLE[b.stid] || ['#ffd88a', 2];
    const x = b.x / ONE, y = b.y / ONE;
    if (b.spd > 0) {
      ctx.fillStyle = st[0];
      ctx.shadowColor = st[0]; ctx.shadowBlur = 6;
      ctx.beginPath(); ctx.arc(x, y, st[1], 0, 7); ctx.fill();
      ctx.shadowBlur = 0;
    } else {
      // 즉발: 트레이서
      ctx.strokeStyle = rgba2(st[0], 0.8); ctx.lineWidth = st[1] * 0.8;
      ctx.beginPath(); ctx.moveTo(b.sx / ONE, b.sy / ONE); ctx.lineTo(tgt.x / ONE, tgt.y / ONE); ctx.stroke();
    }
  }
  function rgba2(col, a) {
    if (col.startsWith('#')) return rgba(col, a);
    return col;
  }

  function drawZone(ctx, s, col, tick) {
    const x = s.x / ONE, y = s.y / ONE, r = s.r / ONE;
    ctx.fillStyle = rgba(col === '#a5652a' ? '#a5652a' : '#5a8ad4', 0.22 + 0.06 * Math.sin(tick * 0.15));
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.7, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = rgba(col, 0.5); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.7, 0, 0, 7); ctx.stroke();
  }

  function drawFx(ctx, g, f) {
    const age = g.tick - f.t0, lf = age / f.life;
    const x = f.x / ONE, y = f.y / ONE;
    ctx.save();
    switch (f.k) {
      case 'expl': case 'scarabHit': {
        const r = 8 + lf * 26;
        ctx.fillStyle = `rgba(255,${180 - lf * 140 | 0},40,${0.8 - lf * 0.8})`;
        ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
        ctx.fillStyle = `rgba(255,255,200,${0.6 - lf * 0.6})`;
        ctx.beginPath(); ctx.arc(x, y, r * 0.5, 0, 7); ctx.fill();
        break;
      }
      case 'gib': {
        ctx.fillStyle = `rgba(150,40,120,${0.7 - lf * 0.7})`;
        for (let i = 0; i < 5; i++) {
          const an = i * 1.26, d = lf * 20;
          ctx.beginPath(); ctx.arc(x + Math.cos(an) * d, y + Math.sin(an) * d, 3 - lf * 2, 0, 7); ctx.fill();
        }
        break;
      }
      case 'bdeath': case 'bdeathZ': {
        const r = 12 + lf * 42;
        ctx.fillStyle = f.k === 'bdeathZ' ? `rgba(160,60,180,${0.7 - lf * 0.7})` : `rgba(255,140,40,${0.7 - lf * 0.7})`;
        ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
        ctx.fillStyle = `rgba(60,60,60,${0.5 - lf * 0.5})`;
        for (let i = 0; i < 6; i++) { const an = i * 1.05; ctx.beginPath(); ctx.arc(x + Math.cos(an) * r * 0.8, y + Math.sin(an) * r * 0.6, 5, 0, 7); ctx.fill(); }
        break;
      }
      case 'hit': { ctx.fillStyle = `rgba(255,230,150,${0.7 - lf * 0.7})`; ctx.beginPath(); ctx.arc(x, y, 4 - lf * 3, 0, 7); ctx.fill(); break; }
      case 'miss': { ctx.fillStyle = `rgba(200,200,200,${0.5 - lf * 0.5})`; ctx.font = '9px sans-serif'; ctx.fillText('빗나감', x, y - lf * 10); break; }
      case 'storm': {
        const r = 48;
        ctx.fillStyle = `rgba(90,140,255,${0.15 + 0.1 * Math.sin(age * 1.7)})`;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
        ctx.strokeStyle = `rgba(180,220,255,${0.5 + 0.4 * Math.sin(age * 2.3)})`;
        ctx.lineWidth = 2;
        for (let i = 0; i < 4; i++) {
          const sx = x - r + ((age * 13 + i * 47) % (r * 2));
          ctx.beginPath(); ctx.moveTo(sx, y - r);
          ctx.lineTo(sx + 8 - (i & 1) * 16, y - r * 0.3); ctx.lineTo(sx - 6 + (i & 1) * 12, y + r * 0.4); ctx.lineTo(sx + 4, y + r); ctx.stroke();
        }
        break;
      }
      case 'scan': {
        const r = lf * 90;
        ctx.strokeStyle = `rgba(120,220,255,${0.7 - lf * 0.7})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y, r * 0.6, 0, 7); ctx.stroke();
        break;
      }
      case 'nukeDot': {
        ctx.fillStyle = (age >> 2) & 1 ? 'rgba(255,40,40,0.9)' : 'rgba(160,20,20,0.5)';
        ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill();
        break;
      }
      case 'nukeBoom': {
        const r = lf * 200;
        ctx.fillStyle = `rgba(255,255,255,${0.9 - lf * 0.9})`;
        ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
        ctx.fillStyle = `rgba(255,150,40,${0.7 - lf * 0.7})`;
        ctx.beginPath(); ctx.arc(x, y, r * 0.7, 0, 7); ctx.fill();
        ctx.fillStyle = `rgba(120,90,60,${0.6 - lf * 0.6})`;
        ctx.beginPath(); ctx.ellipse(x, y - r * 0.5, r * 0.3, r * 0.55, 0, 0, 7); ctx.fill();
        break;
      }
      case 'yamato': {
        ctx.fillStyle = `rgba(255,80,80,${0.8 - lf * 0.8})`;
        ctx.beginPath(); ctx.arc(x, y, 10 + lf * 24, 0, 7); ctx.fill();
        break;
      }
      case 'yamatoCh': { ctx.fillStyle = 'rgba(255,100,100,0.6)'; ctx.beginPath(); ctx.arc(x, y - 20, 5, 0, 7); ctx.fill(); break; }
      case 'burn': {
        ctx.fillStyle = `rgba(255,${120 + Math.sin(age) * 60 | 0},30,${0.6 - lf * 0.5})`;
        ctx.beginPath(); ctx.ellipse(x, y - lf * 10, 4, 7 + lf * 4, 0, 0, 7); ctx.fill();
        break;
      }
      case 'spark': { ctx.fillStyle = `rgba(160,220,255,${0.8 - lf * 0.8})`; ctx.fillRect(x - 1, y - 1, 2.5, 2.5); break; }
      case 'healfx': { ctx.fillStyle = `rgba(255,255,255,${0.8 - lf * 0.8})`; ctx.fillRect(x - 4, y - 1 - age, 8, 2); ctx.fillRect(x - 1, y - 4 - age, 2, 8); break; }
      case 'flame': {
        ctx.fillStyle = `rgba(255,120,30,${0.6 - lf * 0.6})`;
        for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(x + (i - 1.5) * 8, y + Math.sin(i * 2 + age) * 4, 6 - lf * 4, 0, 7); ctx.fill(); }
        break;
      }
      case 'spines': {
        ctx.strokeStyle = `rgba(220,200,150,${0.8 - lf * 0.8})`; ctx.lineWidth = 2;
        for (let i = 0; i < 5; i++) { const an = i * 1.26 + 0.3; ctx.beginPath(); ctx.moveTo(x + Math.cos(an) * 6, y + Math.sin(an) * 4); ctx.lineTo(x + Math.cos(an) * (10 + lf * 14), y + Math.sin(an) * (7 + lf * 9)); ctx.stroke(); }
        break;
      }
      case 'glaive': { ctx.fillStyle = `rgba(140,220,90,${0.7 - lf * 0.7})`; ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill(); break; }
      case 'lockdown': { ctx.strokeStyle = `rgba(255,214,10,${0.8 - lf * 0.8})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 14 - lf * 8, 0, 7); ctx.stroke(); break; }
      case 'dmatrix': { ctx.strokeStyle = `rgba(140,212,255,${0.8 - lf * 0.8})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 12 + lf * 8, 0, 7); ctx.stroke(); break; }
      case 'emp': { const r = lf * 70; ctx.strokeStyle = `rgba(120,180,255,${0.8 - lf * 0.8})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke(); break; }
      case 'irradiate': { ctx.fillStyle = `rgba(120,255,80,${0.5 - lf * 0.4})`; ctx.beginPath(); ctx.arc(x, y, 12, 0, 7); ctx.fill(); break; }
      case 'ensnare': { ctx.fillStyle = `rgba(140,220,80,${0.5 - lf * 0.5})`; ctx.beginPath(); ctx.ellipse(x, y, 40 * (0.4 + lf), 28 * (0.4 + lf), 0, 0, 7); ctx.fill(); break; }
      case 'plague': { ctx.fillStyle = `rgba(220,60,40,${0.5 - lf * 0.5})`; ctx.beginPath(); ctx.ellipse(x, y, 45 * (0.4 + lf), 32 * (0.4 + lf), 0, 0, 7); ctx.fill(); break; }
      case 'swarm': break; // 존으로 그림
      case 'dweb': break;
      case 'parasite': { ctx.fillStyle = `rgba(192,90,255,${0.7 - lf * 0.7})`; ctx.beginPath(); ctx.arc(x, y, 8 - lf * 4, 0, 7); ctx.fill(); break; }
      case 'brood': { ctx.fillStyle = `rgba(160,80,200,${0.7 - lf * 0.7})`; ctx.beginPath(); ctx.arc(x, y, 10 + lf * 8, 0, 7); ctx.fill(); break; }
      case 'mael': { ctx.strokeStyle = `rgba(192,90,255,${0.7 - lf * 0.7})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 12 + lf * 30, 0, 7); ctx.stroke(); break; }
      case 'stasis': { ctx.fillStyle = `rgba(140,212,255,${0.5 - lf * 0.5})`; ctx.beginPath(); ctx.arc(x, y, 14 + lf * 28, 0, 7); ctx.fill(); break; }
      case 'mc': { ctx.strokeStyle = `rgba(255,90,255,${0.8 - lf * 0.8})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 10 + lf * 16, 0, 7); ctx.stroke(); break; }
      case 'feedback': { ctx.fillStyle = `rgba(192,90,255,${0.8 - lf * 0.8})`; ctx.beginPath(); ctx.arc(x, y, 8 + lf * 10, 0, 7); ctx.fill(); break; }
      case 'hallu': { ctx.fillStyle = `rgba(140,212,255,${0.6 - lf * 0.6})`; ctx.beginPath(); ctx.arc(x, y, 12, 0, 7); ctx.fill(); break; }
      case 'recall': case 'recallSrc': { ctx.strokeStyle = `rgba(255,214,10,${0.8 - lf * 0.8})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, 30 - lf * 20, 0, 7); ctx.stroke(); break; }
      case 'archonMerge': { ctx.fillStyle = `rgba(140,212,255,${0.7 - lf * 0.7})`; ctx.beginPath(); ctx.arc(x, y, 8 + lf * 24, 0, 7); ctx.fill(); break; }
      case 'mineralGone': break;
    }
    ctx.restore();
  }

  // ---- 포그 ----------------------------------------------------------------
  function drawFog(ctx, g, team, cam, viewW, viewH) {
    const vis = g.teamVis[team];
    if (!vis) return;
    const W = g.map.w, W2 = W * 2;
    const img = fogCtx.createImageData(W2, g.map.h * 2);
    const data = img.data;
    for (let y = 0; y < g.map.h; y++) for (let x = 0; x < W; x++) {
      const v = vis[y * W + x];
      const a = v === 2 ? 0 : v === 1 ? 110 : 255;
      if (!a) continue;
      const base = (y * 2 * W2 + x * 2) * 4;
      data[base + 3] = a; data[base + 7] = a;
      data[base + W2 * 4 + 3] = a; data[base + W2 * 4 + 7] = a;
    }
    fogCtx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(fogCanvas, cam.x / T * 2, cam.y / T * 2, viewW / T * 2, viewH / T * 2, cam.x, cam.y, viewW, viewH);
  }

  // ---- 미니맵 --------------------------------------------------------------
  let miniTerrain = null;
  Gfx.renderMinimap = function (ctx, g, size, cam, viewW, viewH, localPlayer) {
    const team = g.players[localPlayer] ? g.players[localPlayer].team : 0;
    const sc = size / (g.map.w * T);
    if (!miniTerrain) {
      miniTerrain = document.createElement('canvas');
      miniTerrain.width = size; miniTerrain.height = size;
      const m2 = miniTerrain.getContext('2d');
      m2.drawImage(terrainCanvas, 0, 0, size, size);
      m2.fillStyle = 'rgba(0,0,0,0.25)'; m2.fillRect(0, 0, size, size);
    }
    ctx.drawImage(miniTerrain, 0, 0);
    // 크립
    ctx.globalAlpha = 0.5;
    ctx.drawImage(creepCanvas, 0, 0, size, size);
    ctx.globalAlpha = 1;
    // 자원
    ctx.fillStyle = '#57c8ff';
    for (const r of g.res) if (r.kind === 'm' && r.amt > 0) ctx.fillRect(r.tx * T * sc, r.ty * T * sc, 2, 1.5);
    ctx.fillStyle = '#7bd48a';
    for (const r of g.res) if (r.kind === 'g') ctx.fillRect(r.tx * T * sc, r.ty * T * sc, 2.5, 2);
    // 유닛
    const vis = g.teamVis[team];
    for (const u of g.units) {
      if (u.dead || u.hidden) continue;
      if (g.players[u.o].team !== team && !SC.Engine.isVisibleTo(g, team, u)) continue;
      ctx.fillStyle = g.players[u.o].color;
      const s2 = u.kind === 'building' ? 3.2 : 2;
      ctx.fillRect(u.x / ONE * sc - s2 / 2, u.y / ONE * sc - s2 / 2, s2, s2);
    }
    // 포그
    if (vis) {
      const img = fogCtx.createImageData(g.map.w, g.map.h);
      for (let i = 0; i < vis.length; i++) img.data[i * 4 + 3] = vis[i] === 2 ? 0 : vis[i] === 1 ? 110 : 235;
      fogCtx.putImageData(img, 0, 0);
      ctx.drawImage(fogCanvas, 0, 0, g.map.w, g.map.h, 0, 0, size, size);
    }
    // 핑
    for (const a of g.alerts) {
      if (a.x == null || g.tick - a.t > 72) continue;
      if (a.kind === 'attack' && a.p === localPlayer) {
        const f = ((g.tick - a.t) % 24) / 24;
        ctx.strokeStyle = `rgba(255,60,60,${1 - f})`; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(a.x / ONE * sc, a.y / ONE * sc, 4 + f * 8, 0, 7); ctx.stroke();
      }
    }
    for (const n of g.nukes) {
      ctx.fillStyle = (g.tick >> 2) & 1 ? '#ff3c3c' : '#801010';
      ctx.fillRect(n.x / ONE * sc - 2, n.y / ONE * sc - 2, 4, 4);
    }
    // 카메라 사각형
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1;
    ctx.strokeRect(cam.x * sc, cam.y * sc, viewW * sc, viewH * sc);
  };

  // ---- 초상화/와이어프레임 ----------------------------------------------------
  Gfx.renderPortrait = function (ctx, tid, size, tick) {
    const def = SC.DATA.all[tid];
    drawPortrait(ctx, tid, def.race, size, tick);
  };
  Gfx.renderWireframe = function (ctx, g, u, size) {
    ctx.clearRect(0, 0, size, size);
    const def = SC.DATA.all[u.tid];
    const hpF = u.hp / u.maxHp;
    const col = hpF > 0.66 ? '#3ddc55' : hpF > 0.33 ? '#f4e42e' : '#f43f2e';
    ctx.save();
    ctx.translate(size / 2, size / 2);
    if (u.kind === 'building') {
      ctx.strokeStyle = col; ctx.lineWidth = 1.5;
      ctx.strokeRect(-size * 0.3, -size * 0.25, size * 0.6, size * 0.5);
      ctx.strokeRect(-size * 0.2, -size * 0.15, size * 0.4, size * 0.3);
    } else {
      ctx.scale(1.4, 1.4);
      ctx.globalAlpha = 0.9;
      const spr = getSprite(u.tid, def.race, col);
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(spr.c, 4 * spr.cs, 0, spr.cs, spr.cs, -spr.cs / 2, -spr.cs / 2, spr.cs, spr.cs);
    }
    ctx.restore();
  };
  Gfx.getUnitIcon = function (tid, color) {
    const def = SC.DATA.all[tid];
    const key = 'icon|' + tid + '|' + color;
    if (spriteCache.has(key)) return spriteCache.get(key);
    const c = document.createElement('canvas');
    c.width = 40; c.height = 40;
    const x2 = c.getContext('2d');
    if (def.kind === 'building') {
      const [w, h] = def.tiles;
      const bc = getBuildingSprite(tid, def.race, color, w, h, 0);
      const s = Math.min(36 / (w * T), 36 / (h * T));
      x2.drawImage(bc, 20 - w * T * s / 2, 20 - h * T * s / 2, w * T * s, h * T * s);
    } else {
      const spr = getSprite(tid, def.race, color);
      const s = Math.min(1, 34 / spr.cs);
      x2.save(); x2.translate(20, 20); x2.scale(s, s);
      x2.drawImage(spr.c, 12 * spr.cs, 0, spr.cs, spr.cs, -spr.cs / 2, -spr.cs / 2, spr.cs, spr.cs);
      x2.restore();
    }
    spriteCache.set(key, c);
    return c;
  };

  // ---- 커서 ----------------------------------------------------------------
  Gfx.makeCursors = function () {
    const mk = (draw) => {
      const c = document.createElement('canvas'); c.width = 28; c.height = 28;
      draw(c.getContext('2d'));
      return `url(${c.toDataURL()}) 14 14, crosshair`;
    };
    const arrow = (() => {
      const c = document.createElement('canvas'); c.width = 24; c.height = 24;
      const x2 = c.getContext('2d');
      x2.fillStyle = '#e8f4e0'; x2.strokeStyle = '#1a3a1a'; x2.lineWidth = 1.2;
      x2.beginPath(); x2.moveTo(2, 2); x2.lineTo(16, 10); x2.lineTo(9, 11); x2.lineTo(12, 20); x2.lineTo(9, 21); x2.lineTo(7, 13); x2.lineTo(2, 17); x2.closePath();
      x2.fill(); x2.stroke();
      return `url(${c.toDataURL()}) 2 2, default`;
    })();
    const target = (col) => mk(x2 => {
      x2.strokeStyle = col; x2.lineWidth = 2;
      x2.beginPath(); x2.arc(14, 14, 9, 0, 7); x2.stroke();
      for (const [a, b] of [[14, 1], [14, 27], [1, 14], [27, 14]]) {
        x2.beginPath();
        if (a === 14) { x2.moveTo(14, b); x2.lineTo(14, b === 1 ? 7 : 21); }
        else { x2.moveTo(a, 14); x2.lineTo(a === 1 ? 7 : 21, 14); }
        x2.stroke();
      }
    });
    return { default: arrow, green: target('#3ddc55'), red: target('#f43f2e'), yellow: target('#f4e42e') };
  };

  SC.Gfx = Gfx;
})();
