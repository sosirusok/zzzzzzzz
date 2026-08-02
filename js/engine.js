/* =========================================================================
 *  engine.js — 결정적 RTS 시뮬레이션 (24 tick/s, 고정소수점 <<8)
 *  멀티플레이 락스텝 동기화를 위해 모든 연산은 결정적으로 수행된다.
 * ========================================================================= */
'use strict';
(function () {
  const D = () => SC.DATA;
  const FP = 8, ONE = 256;
  const T = 32;

  // 속도/사거리/시야/에너지 업그레이드 매핑
  const SPEED_UP = { zergling: ['metabolic_boost', 384], hydralisk: ['muscular_augments', 384],
    overlord: ['pneumatized_carapace', 1024], ultralisk: ['anabolic_synthesis', 400],
    zealot: ['leg_enhancements', 384], shuttle: ['gravitic_drive', 384],
    observer: ['gravitic_boosters', 512], scout: ['gravitic_thrusters', 341], vulture: ['ion_thrusters', 384] };
  const RANGE_UP = { marine: ['u238', 1], hydralisk: ['grooved_spines', 1], dragoon: ['singularity_charge', 2] };
  const SIGHT_UP = { ghost: ['ocular_implants', 2], overlord: ['antennae', 2], observer: ['sensor_array', 2], scout: ['apial_sensors', 2] };
  const ENERGY_UP = { medic: 'caduceus', wraith: 'apollo_reactor', science_vessel: 'titan_reactor',
    ghost: 'moebius_reactor', queen: 'gamete_meiosis', defiler: 'metasynaptic_node', high_templar: 'khaydarin_amulet',
    dark_archon: 'argus_talisman', corsair: 'argus_jewel', arbiter: 'khaydarin_core', battlecruiser: 'colossus_reactor' };

  function rngInt(g, n) { g.rngState |= 0; g.rngState = (g.rngState + 0x6D2B79F5) | 0;
    let t = Math.imul(g.rngState ^ (g.rngState >>> 15), 1 | g.rngState);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) % n; }

  const dist2 = (ax, ay, bx, by) => { const dx = (ax - bx) / ONE, dy = (ay - by) / ONE; return dx * dx + dy * dy; };
  const distPx = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));

  // ---- 게임 생성 -----------------------------------------------------------
  function createGame(cfg) {
    const map = SC.MapGen.genHunters(cfg.mapSeed || cfg.seed);
    const g = {
      tick: 0, rngState: (cfg.seed | 0) || 12345, map,
      players: [], units: [], res: [], bullets: [], fx: [], sfx: [], alerts: [],
      nextId: 1, occ: new Uint16Array(map.w * map.h), creep: new Uint8Array(map.w * map.h),
      teamVis: {}, teamDet: {}, scans: [], swarms: [], dwebs: [], nukes: [],
      over: null, stats: [], chat: [],
    };
    // 자원 엔티티
    for (const s of map.starts) {
      for (const m of s.minerals) addRes(g, 'm', m.tx, m.ty, 2, 1, D().PATCH_AMOUNT);
      for (const gs of s.geysers) addRes(g, 'g', gs.tx, gs.ty, 4, 2, D().GEYSER_AMOUNT);
    }
    // 스타팅 위치 셔플
    const order = [0, 1, 2, 3, 4, 5, 6, 7];
    for (let i = 7; i > 0; i--) { const j = rngInt(g, i + 1); const t2 = order[i]; order[i] = order[j]; order[j] = t2; }
    let si = 0;
    cfg.players.forEach((pc, pi) => {
      const start = map.starts[pc.start != null ? pc.start : order[si++]];
      const p = { i: pi, race: pc.race, team: pc.team != null ? pc.team : pi, color: pc.color || D().PLAYER_COLORS[pi],
        name: pc.name || `플레이어 ${pi + 1}`, type: pc.type || 'human', minerals: D().START_MINERALS, gas: 0,
        supUsed: 0, supMax: 0, research: {}, defeated: false, start,
        startX: start.tx * T + T * 2, startY: start.ty * T + T * 1.5 };
      g.players.push(p);
      g.stats.push({ produced: 0, killed: 0, razed: 0, lost: 0, mineralsGathered: 0, gasGathered: 0, apm: 0 });
      spawnStart(g, p);
    });
    for (const p of g.players) recomputeSupply(g, p);
    recomputeCreep(g);
    return g;
  }

  function addRes(g, kind, tx, ty, w, h, amt) {
    const r = { id: g.nextId++, kind, tx, ty, w, h, amt,
      x: (tx * T + w * T / 2) * ONE, y: (ty * T + h * T / 2) * ONE };
    g.res.push(r);
    for (let y = ty; y < ty + h; y++) for (let x = tx; x < tx + w; x++)
      if (x >= 0 && y >= 0 && x < g.map.w && y < g.map.h) g.occ[y * g.map.w + x] = r.id;
    return r;
  }

  function spawnStart(g, p) {
    const hallId = D().RACES[p.race].hall;
    const hall = placeBuilding(g, p.i, hallId, p.start.tx, p.start.ty - 1, true);
    hall.complete = true; hall.hp = hall.maxHp;
    // 기본 랠리: 가장 가까운 미네랄
    const near = nearestRes(g, hall.x, hall.y, 'm');
    if (near) hall.rally = { t: near.id };
    const wid = D().RACES[p.race].worker;
    for (let i = 0; i < D().START_WORKERS; i++) {
      const u = spawnUnit(g, p.i, wid, hall.x + ((i - 2) * 40) * ONE, hall.y + (T * 2.4 * ONE));
      const m = nearestRes(g, u.x, u.y, 'm');
      if (m) u.orders = [{ op: 'gather', t: m.id }];
    }
    if (p.race === 'Z') {
      spawnUnit(g, p.i, 'overlord', hall.x, hall.y - T * 3 * ONE);
      for (let i = 0; i < 3; i++) spawnLarva(g, hall);
    }
  }

  // ---- 엔티티 --------------------------------------------------------------
  function defOf(tid) { return D().all[tid]; }

  function unitRadius(def) {
    if (def.kind === 'building') return Math.max(def.tiles[0], def.tiles[1]) * T / 2 - 4;
    if (def.size === 2) return 16; if (def.size === 1) return 12; return 9;
  }

  function spawnUnit(g, owner, tid, x, y) {
    const def = defOf(tid);
    const u = { id: g.nextId++, tid, o: owner, x: Math.round(x), y: Math.round(y),
      fly: !!(def.flags && def.flags.includes('flyer')), r: unitRadius(def),
      hp: def.hp << FP, maxHp: def.hp << FP, sh: (def.sh || 0) << FP, maxSh: (def.sh || 0) << FP,
      en: def.me ? D().ENERGY_START << FP : 0, face: rngInt(g, 16), cd: 0,
      orders: [], path: null, kind: 'unit', st: {}, complete: true, prog: 0,
      cargo: [], mines: def.id === 'vulture' ? 0 : undefined,
      scarabs: def.id === 'reaver' ? 0 : undefined, inters: def.id === 'carrier' ? [] : undefined };
    if (def.flags && def.flags.includes('permaCloak')) u.st.cloak = true;
    if (def.id === 'vulture' && g.players[owner].research.spider_mines) u.mines = 3;
    g.units.push(u);
    return u;
  }

  function spawnLarva(g, hatch) {
    const off = [[0, 90], [-60, 76], [60, 76]];
    const n = countLarvae(g, hatch);
    const o = off[n % 3];
    const l = spawnUnit(g, hatch.o, 'larva', hatch.x + o[0] * ONE, hatch.y + o[1] * ONE);
    l.hatch = hatch.id;
    return l;
  }
  function countLarvae(g, hatch) {
    let n = 0;
    for (const u of g.units) if (u.tid === 'larva' && u.hatch === hatch.id) n++;
    return n;
  }

  function placeBuilding(g, owner, tid, tx, ty, free) {
    const def = defOf(tid);
    const [w, h] = def.tiles;
    const b = { id: g.nextId++, tid, o: owner, tileX: tx, tileY: ty,
      x: (tx * T + w * T / 2) * ONE, y: (ty * T + h * T / 2) * ONE,
      fly: false, r: unitRadius(def), kind: 'building',
      hp: free ? def.hp << FP : (def.hp << FP) / 10 | 0, maxHp: def.hp << FP,
      sh: (def.sh || 0) << FP, maxSh: (def.sh || 0) << FP,
      en: def.me ? D().ENERGY_START << FP : 0,
      complete: !!free, prog: 0, total: def.bt * D().TICKS, orders: [], queue: [], st: {},
      rally: null, larvaT: 0, creepR: 0, face: 0 };
    if ((def.flags || []).includes('battery')) b.en = 100 << FP;   // 실드 배터리는 100으로 시작
    g.units.push(b);
    for (let y = ty; y < ty + h; y++) for (let x = tx; x < tx + w; x++)
      g.occ[y * g.map.w + x] = b.id;
    // footprint 안의 지상 유닛을 가장자리 밖으로 밀어냄 (원작 방식)
    const x0 = tx * T * ONE, y0 = ty * T * ONE, x1 = (tx + w) * T * ONE, y1 = (ty + h) * T * ONE;
    for (const v of g.units) {
      if (v.dead || v.fly || v.kind === 'building' || v.hidden) continue;
      if (v.x < x0 || v.x > x1 || v.y < y0 || v.y > y1) continue;
      let best = null, bd2 = Infinity;
      for (let ry = ty - 1; ry <= ty + h; ry++) for (let rx = tx - 1; rx <= tx + w; rx++) {
        if (rx >= tx && rx < tx + w && ry >= ty && ry < ty + h) continue;
        if (rx < 0 || ry < 0 || rx >= g.map.w || ry >= g.map.h) continue;
        const ii = ry * g.map.w + rx;
        if (!g.map.walk[ii] || g.occ[ii]) continue;
        const px2 = (rx * T + 16) * ONE, py2 = (ry * T + 16) * ONE;
        const dd = dist2(v.x, v.y, px2, py2);
        if (dd < bd2) { bd2 = dd; best = [px2, py2]; }
      }
      if (best) { v.x = best[0]; v.y = best[1]; v.path = null; }
    }
    return b;
  }

  function byId(g, id) {
    for (const u of g.units) if (u.id === id) return u;
    return null;
  }
  function resById(g, id) { for (const r of g.res) if (r.id === id) return r; return null; }
  function nearestRes(g, x, y, kind) {
    let best = null, bd = Infinity;
    for (const r of g.res) {
      if (kind && r.kind !== kind) continue;
      if (r.amt <= 0 && r.kind === 'm') continue;
      const d = dist2(x, y, r.x, r.y);
      if (d < bd) { bd = d; best = r; }
    }
    return bd < 400 * 400 ? best : null;
  }

  // ---- 스탯 조회 -----------------------------------------------------------
  function getSpeed(g, u) {
    const def = defOf(u.tid);
    let s = Math.round(def.spd * ONE);
    const su = SPEED_UP[u.tid];
    if (su && g.players[u.o].research[su[0]]) s = (s * su[1]) >> FP;
    if (u.st.stim) s = (s * 384) >> FP;
    if (u.st.ens) s = s >> 1;
    return s;
  }
  function getRange(g, u, w) {
    let r = w.r;
    const ru = RANGE_UP[u.tid];
    if (ru && g.players[u.o].research[ru[0]]) r += ru[1];
    if (u.tid === 'goliath' && w === defOf(u.tid).a && g.players[u.o].research.charon_boosters) r += 3;
    if (u.tid === 'marine' && u.inBunker) r += 1;
    return r * T;
  }
  function getSight(g, u) {
    const def = defOf(u.tid);
    let s = def.sight || 7;
    const su = SIGHT_UP[u.tid];
    if (su && g.players[u.o].research[su[0]]) s += su[1];
    if (u.st && u.st.flare) return 1;          // 조명탄: 시야 1
    return s;
  }
  function getArmor(g, u) {
    const def = defOf(u.tid);
    let a = def.armor || 0;
    if (def.upA) a += g.players[u.o].research[def.upA] || 0;
    if (u.tid === 'ultralisk' && g.players[u.o].research.chitinous_plating) a += 2;
    a -= u.st.spores || 0;                 // 포식귀 산성 포자: 방어 -1/스택
    return Math.max(0, a);
  }
  function getWeapon(g, u, target) {
    const def = defOf(u.tid);
    if (u.st.sieged) return target.fly ? null : def.siege;
    if (target.fly) return def.a || null;
    return def.g || (def.id === 'battlecruiser' ? def.g : null) || null;
  }
  function weaponDmg(g, u, w) {
    let lvl = 0;
    const def = defOf(u.tid);
    if (def.upG && (w === def.g || w === def.siege || w === def.a)) lvl = g.players[u.o].research[def.upG] || 0;
    let d = w.d + (w.up || 0) * lvl;
    if (u.tid === 'reaver' && g.players[u.o].research.scarab_damage) d += 25;
    return d;
  }
  function getCooldown(g, u, w) {
    let cd = w.cd;
    if (u.st.stim) cd = cd >> 1;
    if (u.tid === 'zergling' && g.players[u.o].research.adrenal_glands) cd = 6;
    if (u.st.ens) cd = (cd * 5) >> 2;                 // 올가미: 쿨다운 +25%
    if (u.st.spores) cd = (cd * (8 + u.st.spores)) >> 3;   // 산성 포자: 스택당 +12.5%
    return cd;
  }
  function maxEnergy(g, u) {
    const r = ENERGY_UP[u.tid];
    return ((r && g.players[u.o].research[r]) ? 250 : 200) << FP;
  }

  const isDetectorActive = (g, u) => {
    const def = defOf(u.tid);
    return def.flags && def.flags.includes('detector') && u.complete && !u.st.lock && !u.st.stasis &&
      !u.st.flare && !(def.needPower && !u.powered);
  };

  // ---- 시야 ----------------------------------------------------------------
  function recomputeVision(g) {
    const W = g.map.w, H = g.map.h;
    const teams = {};
    for (const p of g.players) teams[p.team] = true;
    for (const t in teams) {
      if (!g.teamVis[t]) { g.teamVis[t] = new Uint8Array(W * H); g.teamDet[t] = new Uint8Array(W * H); }
      const vis = g.teamVis[t], det = g.teamDet[t];
      for (let i = 0; i < vis.length; i++) { if (vis[i] === 2) vis[i] = 1; det[i] = 0; }
    }
    const stamp = (grid, cx, cy, r, val) => {
      const tx = (cx / ONE / T) | 0, ty = (cy / ONE / T) | 0;
      for (let y = Math.max(0, ty - r); y <= Math.min(H - 1, ty + r); y++)
        for (let x = Math.max(0, tx - r); x <= Math.min(W - 1, tx + r); x++) {
          const dx = x - tx, dy = y - ty;
          if (dx * dx + dy * dy <= r * r) grid[y * W + x] = val;
        }
    };
    for (const u of g.units) {
      if (u.dead || u.hidden) continue;    // 수송/벙커/가스 채취 중 유닛은 시야 제공 없음
      const team = g.players[u.o].team;
      const s = getSight(g, u);
      stamp(g.teamVis[team], u.x, u.y, s, 2);
      if (isDetectorActive(g, u)) stamp(g.teamDet[team], u.x, u.y, s, 1);
      // 기생충: 시전자 팀에 시야 제공
      if (u.st.parasite != null && g.players[u.st.parasite]) {
        const pt = g.players[u.st.parasite].team;
        if (g.teamVis[pt]) stamp(g.teamVis[pt], u.x, u.y, s, 2);
      }
    }
    for (const s of g.scans) {
      const team = g.players[s.o].team;
      stamp(g.teamVis[team], s.x, s.y, D().SPELL.SCAN_R, 2);
      stamp(g.teamDet[team], s.x, s.y, D().SPELL.SCAN_R, 1);
    }
  }

  function isVisibleTo(g, team, u) {
    const W = g.map.w;
    const i = ((u.y / ONE / T) | 0) * W + ((u.x / ONE / T) | 0);
    const vis = g.teamVis[team];
    if (!vis || vis[i] !== 2) return false;
    if ((u.st.cloak || u.st.burrow || u.st.fcT) && g.players[u.o].team !== team) return !!g.teamDet[team][i];
    return true;
  }
  const targetable = (g, attacker, u) => !u.dead && !u.st.stasis && u.tid !== 'larva' &&
    isVisibleTo(g, g.players[attacker.o].team, u);

  // ---- 크립 / 파워 ----------------------------------------------------------
  function recomputeCreep(g) {
    const W = g.map.w, H = g.map.h;
    g.creep.fill(0);
    for (const u of g.units) {
      if (u.kind !== 'building' || u.dead) continue;
      const def = defOf(u.tid);
      if (!(def.flags && def.flags.includes('creepSource'))) continue;
      const r = Math.min(u.creepR | 0, def.id === 'creep_colony' || def.id === 'sunken_colony' || def.id === 'spore_colony' ? 5 : 8);
      const tx = u.tileX + (def.tiles[0] >> 1), ty = u.tileY + (def.tiles[1] >> 1);
      for (let y = Math.max(0, ty - r); y <= Math.min(H - 1, ty + r); y++)
        for (let x = Math.max(0, tx - r); x <= Math.min(W - 1, tx + r); x++) {
          const dx = x - tx, dy = y - ty;
          if (dx * dx + dy * dy <= r * r && g.map.build[y * W + x]) g.creep[y * W + x] = 1;
        }
    }
  }

  function isPowered(g, owner, tx, ty, w, h) {
    for (const u of g.units) {
      if (u.dead || u.o !== owner || u.tid !== 'pylon' || !u.complete) continue;
      const px = u.tileX + 1, py = u.tileY + 1;
      const cx = tx + w / 2, cy = ty + h / 2;
      const dx = cx - px, dy = cy - py;
      const pr = (defOf('pylon').powerRadius || 5) + 0.8;
      if (dx * dx + dy * dy <= pr * pr) return true;
    }
    return false;
  }

  function canPlace(g, owner, tid, tx, ty) {
    const def = defOf(tid);
    const [w, h] = def.tiles;
    const W = g.map.w, H = g.map.h;
    if (tx < 2 || ty < 2 || tx + w > W - 2 || ty + h > H - 2) return false;
    const p = g.players[owner];
    if (def.flags && def.flags.includes('gas')) {
      // 간헐천 위에만
      for (const r of g.res) {
        if (r.kind === 'g' && r.tx === tx && r.ty === ty && !r.building) return true;
      }
      return false;
    }
    for (let y = ty; y < ty + h; y++) for (let x = tx; x < tx + w; x++) {
      const i = y * W + x;
      if (!g.map.build[i] || g.occ[i]) return false;
      if (p.race === 'Z') {
        const needC = tid !== 'hatchery' && tid !== 'extractor';
        if (needC && !g.creep[i]) return false;
      } else if (g.creep[i]) return false;
    }
    if (p.race === 'P' && def.needPower && !isPowered(g, owner, tx, ty, w, h)) return false;
    // 지상 유닛 겹침 확인
    const x0 = tx * T * ONE, y0 = ty * T * ONE, x1 = (tx + w) * T * ONE, y1 = (ty + h) * T * ONE;
    for (const u of g.units) {
      if (u.dead || u.fly || u.kind === 'building' || u.st.burrow) continue;
      if (u.x > x0 - 8 * ONE && u.x < x1 + 8 * ONE && u.y > y0 - 8 * ONE && u.y < y1 + 8 * ONE) {
        if (!(defOf(u.tid).flags || []).includes('worker')) return false;
      }
    }
    return true;
  }

  // ---- 보급 ----------------------------------------------------------------
  function recomputeSupply(g, p) {
    let used = 0, max = 0;
    for (const u of g.units) {
      if (u.dead || u.o !== p.i) continue;
      const def = defOf(u.tid);
      if (def.sup) used += def.sup;
      if (u.morph && u.morph.uDef) used += u.morph.uDef.sup * (u.morph.uDef.pair || 1) - (defOf(u.tid).sup || 0);
      if (def.provides && u.complete) max += def.provides;
      if (u.queue) for (const q of u.queue) if (!q.isR) used += defOf(q.u).sup;
    }
    p.supUsed = used;
    p.supMax = Math.min(max, D().SUPPLY_CAP);
  }

  // ---- 명령 적용 -----------------------------------------------------------
  function applyCommand(g, c) {
    const p = g.players[c.p];
    if (!p || p.defeated) return;
    const my = id => { const u = byId(g, id); return u && !u.dead && u.o === c.p ? u : null; };
    const setOrders = (u, o) => { if (c.q && u.orders.length) u.orders.push(o); else { u.orders = [o]; u.path = null; } };

    switch (c.k) {
      case 'mv': if (c.x == null || c.y == null) break;
        for (const id of c.ids) { const u = my(id); if (u && canMove(u)) setOrders(u, { op: 'move', x: c.x, y: c.y }); } break;
      case 'atk': {
        for (const id of c.ids) {
          const u = my(id);
          if (!u) continue;
          if (c.t) setOrders(u, { op: 'attack', t: c.t });
          else setOrders(u, { op: 'amove', x: c.x, y: c.y });
        } break;
      }
      case 'pat': for (const id of c.ids) { const u = my(id); if (u && canMove(u)) setOrders(u, { op: 'patrol', x2: c.x, y2: c.y, x1: u.x, y1: u.y, leg: 0 }); } break;
      case 'hld': for (const id of c.ids) { const u = my(id); if (u) { u.orders = [{ op: 'hold' }]; u.path = null; } } break;
      case 'stp': for (const id of c.ids) { const u = my(id); if (u) { u.orders = []; u.path = null; } } break;
      case 'fol': for (const id of c.ids) { const u = my(id); if (u && canMove(u)) setOrders(u, { op: 'follow', t: c.t }); } break;
      case 'gat': for (const id of c.ids) { const u = my(id); if (u && isWorker(u)) setOrders(u, { op: 'gather', t: c.t }); } break;
      case 'ret': for (const id of c.ids) { const u = my(id); if (u && isWorker(u) && u.carry) setOrders(u, { op: 'return' }); } break;
      case 'rep': for (const id of c.ids) { const u = my(id); if (u && u.tid === 'scv') setOrders(u, { op: 'repair', t: c.t }); } break;
      case 'con': { // 미완성 테란 건물에 건설 재개
        const b = byId(g, c.t);
        if (!b || b.dead || b.complete || b.o !== c.p) break;
        for (const id of c.ids) { const u = my(id); if (u && u.tid === 'scv') setOrders(u, { op: 'construct', b: b.id }); }
        break;
      }
      case 'bld': {
        const u = my(c.ids[0]); if (!u || !isWorker(u)) break;
        const def = defOf(c.u);
        if (!def || def.kind !== 'building') break;
        if (!meetsReq(g, p, def) || !canAfford(p, def)) break;
        setOrders(u, { op: 'build', u: c.u, tx: c.tx, ty: c.ty });
        break;
      }
      case 'trn': {
        const b = my(c.t); if (!b || b.kind !== 'building' || !b.complete || b.morph) break;
        const def = defOf(c.u); if (!def) break;
        const bDef = defOf(b.tid);
        if (!(bDef.trains || []).includes(c.u) && !(b.addonDef && (b.addonDef.trains || []).includes(c.u))) break;
        if (!meetsReq(g, p, def) || !canAfford(p, def)) break;
        if (def.sup && p.supUsed + def.sup > p.supMax) { uiAlert(g, c.p, 'supply'); break; }
        if ((b.queue || []).length >= 5) break;
        pay(p, def);
        b.queue.push({ u: c.u, t: 0, total: def.bt * D().TICKS });
        recomputeSupply(g, p);
        break;
      }
      case 'mor': { // 라바/유닛 변태
        const def = defOf(c.u); if (!def) break;
        for (const id of c.ids) {
          const u = my(id); if (!u) continue;
          const from = def.morphFrom || 'larva';
          if (u.tid !== from) continue;
          if (def.morphFrom == null && u.tid !== 'larva') continue;
          if (!meetsReq(g, p, def) || !canAfford(p, def)) break;
          const addSup = def.sup * (def.pair || 1) - (defOf(u.tid).sup || 0);
          if (addSup > 0 && p.supUsed + addSup > p.supMax) { uiAlert(g, c.p, 'supply'); break; }
          pay(p, def);
          u.morph = { u: c.u, t: 0, total: def.bt * D().TICKS, uDef: def };
          if (u.tid === 'larva') { u.tid = 'egg'; u.maxHp = 200 << FP; u.hp = u.maxHp; }
          u.orders = []; u.path = null;
          recomputeSupply(g, p);
        } break;
      }
      case 'morB': { // 건물 변태 (해처리→레어 등)
        const b = my(c.t); if (!b || b.kind !== 'building' || !b.complete || b.morph) break;
        const def = defOf(c.u); if (!def) break;
        const bDef = defOf(b.tid);
        if (bDef.morphTo !== c.u && !(bDef.morphChoices || []).includes(c.u)) break;
        if (!meetsReq(g, p, def) || !canAfford(p, def)) break;
        pay(p, def);
        b.morph = { u: c.u, t: 0, total: def.bt * D().TICKS };
        break;
      }
      case 'rsr': {
        const b = my(c.t); if (!b || !b.complete || b.morph) break;
        const r = D().research[c.r]; if (!r) break;
        const cur = p.research[c.r] || 0;
        if (cur >= r.lv) break;
        if (r.req && !r.req.every(q => hasBuilding(g, p, q))) break;
        if (r.tierReq && r.tierReq[cur]) {       // 2/3단계 업그레이드 테크 요구
          const need = r.tierReq[cur];
          const ok2 = need === 'lair' ? (hasBuilding(g, p, 'lair') || hasBuilding(g, p, 'hive')) : hasBuilding(g, p, need);
          if (!ok2) break;
        }
        const canAt = (defOf(b.tid).researches || []).includes(c.r) || (b.addonDef && (b.addonDef.researches || []).includes(c.r)) ||
          (c.r === 'burrow_tech' && ['hatchery', 'lair', 'hive'].includes(b.tid));
        if (!canAt) break;
        const [m, gas, t2] = r.cost[cur];
        if (p.minerals < m || p.gas < gas) { uiAlert(g, c.p, p.minerals < m ? 'minerals' : 'gas'); break; }
        if ((b.queue || []).length >= 5) break;
        p.minerals -= m; p.gas -= gas;
        b.queue.push({ isR: true, r: c.r, t: 0, total: t2 * D().TICKS });
        break;
      }
      case 'cnl': {
        const b = my(c.t); if (!b || !b.queue || !b.queue[c.i]) break;
        const q = b.queue.splice(c.i, 1)[0];
        if (q.isR) { const r = D().research[q.r]; const cur = p.research[q.r] || 0; p.minerals += r.cost[cur][0]; p.gas += r.cost[cur][1]; }
        else { const def = defOf(q.u); p.minerals += def.min; p.gas += def.gas; }
        recomputeSupply(g, p);
        break;
      }
      case 'cnb': {
        const b = my(c.t); if (!b) break;
        if (b.kind === 'building' && !b.complete) cancelConstruction(g, b);
        else if (b.morph) {
          const def = b.morph.uDef || defOf(b.morph.u);
          p.minerals += def.min; p.gas += def.gas;
          if (b.tid === 'egg') { b.tid = 'larva'; b.maxHp = 25 << FP; b.hp = b.maxHp; }
          b.morph = null;
          recomputeSupply(g, p);
        }
        break;
      }
      case 'rly': { const b = my(c.t); if (b && b.kind === 'building') b.rally = c.rt ? { t: c.rt } : { x: c.x, y: c.y }; break; }
      case 'abl': applyAbility(g, p, c); break;
      case 'add': { // 애드온
        const b = my(c.t); if (!b || !b.complete || b.morph || b.addon) break;
        const def = defOf(c.u); if (!def || def.addonOf !== b.tid) break;
        if (!meetsReq(g, p, def) || !canAfford(p, def)) break;
        const ax = b.tileX + defOf(b.tid).tiles[0], ay = b.tileY + defOf(b.tid).tiles[1] - 2;
        if (!canPlaceAddon(g, ax, ay)) { uiAlert(g, c.p, 'place'); break; }
        pay(p, def);
        const a = placeBuilding(g, c.p, c.u, ax, ay);
        a.parent = b.id; b.addonPending = a.id;
        break;
      }
      case 'lod': {
        const tr = my(c.t); if (!tr) break;
        for (const id of c.ids) { const u = my(id); if (u && u.id !== tr.id && !u.fly && u.kind === 'unit') setOrders(u, { op: 'enter', t: tr.id }); }
        break;
      }
      case 'uld': {
        const tr = my(c.t); if (!tr) break;
        if (tr.kind === 'building') {         // 벙커: 즉시 배출
          let i2 = 0;
          for (const cid of tr.cargo) {
            const cu = byId(g, cid);
            if (!cu) continue;
            cu.hidden = false; cu.inBunker = false;
            const sp2 = findSpawnSpot(g, tr);
            cu.x = sp2.x + ((i2 % 3) - 1) * 20 * ONE; cu.y = sp2.y; cu.path = null;
            i2++;
          }
          tr.cargo = [];
          break;
        }
        setOrders(tr, { op: 'unload', x: c.x != null ? c.x : tr.x, y: c.y != null ? c.y : tr.y });
        break;
      }
      case 'mrg': { // 아콘 합체
        const list = c.ids.map(my).filter(u => u && (u.tid === 'high_templar' || u.tid === 'dark_templar'));
        const ht = list.filter(u => u.tid === 'high_templar');
        const dt = list.filter(u => u.tid === 'dark_templar');
        for (const grp of [ht, dt]) {
          for (let i = 0; i + 1 < grp.length; i += 2) {
            grp[i].orders = [{ op: 'merge', t: grp[i + 1].id }];
            grp[i + 1].orders = [{ op: 'merge', t: grp[i].id }];
          }
        }
        break;
      }
      case 'chat': g.chat.push({ p: c.p, msg: String(c.msg).slice(0, 120), t: g.tick }); break;
      case 'resign': defeat(g, p); break;
    }
  }

  const canMove = u => u.kind === 'unit' && !u.st.burrow && !u.st.sieged && !u.st.stasis && !u.st.lock && !u.st.mael && u.tid !== 'larva';
  const isWorker = u => (defOf(u.tid).flags || []).includes('worker');
  function canAfford(p, def) { return p.minerals >= def.min && p.gas >= def.gas; }
  function pay(p, def) { p.minerals -= def.min; p.gas -= def.gas; }
  function hasBuilding(g, p, tid) {
    for (const u of g.units) if (!u.dead && u.o === p.i && u.tid === tid && u.complete) return true;
    return false;
  }
  function meetsReq(g, p, def) {
    if (def.race && def.race !== p.race) return false;
    if (def.req) for (const r of def.req) {
      if (D().research[r]) { if (!p.research[r]) return false; }
      else if (r === 'lair') { if (!hasBuilding(g, p, 'lair') && !hasBuilding(g, p, 'hive')) return false; }
      else if (!hasBuilding(g, p, r)) return false;
    }
    return true;
  }
  function canPlaceAddon(g, tx, ty) {
    const W = g.map.w;
    for (let y = ty; y < ty + 2; y++) for (let x = tx; x < tx + 2; x++) {
      if (x < 0 || y < 0 || x >= W || y >= g.map.h) return false;
      if (!g.map.build[y * W + x] || g.occ[y * W + x] || g.creep[y * W + x]) return false;
    }
    return true;
  }
  function uiAlert(g, p, kind) { g.alerts.push({ p, kind, t: g.tick }); }

  // ---- 어빌리티 ------------------------------------------------------------
  const SELF_ABS = new Set(['stim', 'siege', 'unsiege', 'burrow', 'unburrow', 'cloak_ghost', 'cloak_wraith',
    'merge_archon', 'merge_dark_archon']);
  const NO_RANGE_GATE = new Set(['scan', 'recall', 'nuke_paint', 'mines', 'heal', 'repair', 'emp', 'yamato']);

  function applyAbility(g, p, c) {
    const ab = D().abilities[c.a];
    if (!ab) return;
    if (SELF_ABS.has(c.a) || ab.target === 'self' || ab.target === 'toggle') {
      for (const id of c.ids) {
        const u = byId(g, id);
        if (u && !u.dead && u.o === c.p && !u.st.hallu) doCast(g, p, c, u, ab);
      }
      return;
    }
    // 대상/지점 스펠: 가장 가깝고 에너지가 충분한 시전자 1기만 시전 (BW 방식)
    const tgt0 = c.t ? byId(g, c.t) : null;
    const tx = tgt0 ? tgt0.x : c.x, ty = tgt0 ? tgt0.y : c.y;
    let best = null, bd = Infinity;
    for (const id of c.ids) {
      const u = byId(g, id);
      if (!u || u.dead || u.o !== c.p || u.st.hallu || u.st.stasis || u.st.lock || u.st.mael) continue;
      if (ab.en > 1 && u.en < (ab.en << FP)) continue;
      const d = tx != null ? dist2(u.x, u.y, tx, ty) : 0;
      if (d < bd) { bd = d; best = u; }
    }
    if (!best) { uiAlert(g, c.p, 'energy'); return; }
    if (!NO_RANGE_GATE.has(c.a) && ab.r && tx != null &&
        distPx(best.x, best.y, tx, ty) > ab.r * T + 8 && canMove(best)) {
      best.orders = [{ op: 'cast', a: c.a, t: c.t, x: c.x, y: c.y }];
      best.path = null;
      return;
    }
    doCast(g, p, c, best, ab);
  }

  function doCast(g, p, c, u, ab) {
    const S = D().SPELL;
    if (ab.req && !p.research[ab.req]) return;
    const needE = (ab.en || 0) << FP;
    const tgt = c.t ? byId(g, c.t) : null;

    switch (c.a) {
      case 'stim': {
        if (u.tid !== 'marine' && u.tid !== 'firebat') break;
        if (u.hp <= (S.STIM_HP << FP)) break;
        u.hp -= S.STIM_HP << FP; u.st.stim = S.STIM_TICKS;
        sfx(g, 'stim', u); break;
      }
      case 'siege': if (u.tid === 'siege_tank' && !u.st.sieged) { u.st.sieged = true; u.orders = []; u.path = null; u.cd = 30; sfx(g, 'siege', u); } break;
      case 'unsiege': if (u.st.sieged) { u.st.sieged = false; u.cd = 30; } break;
      case 'burrow': if ((defOf(u.tid).flags || []).includes('burrowable') && !u.st.burrow &&
        (p.research.burrow_tech || u.tid === 'lurker')) { u.st.burrow = true; u.orders = []; u.path = null; sfx(g, 'burrow', u); } break;
      case 'unburrow': if (u.st.burrow) { u.st.burrow = false; u.cd = 20; } break;
      case 'cloak_ghost': case 'cloak_wraith':
        if (u.st.cloak) { u.st.cloak = false; }
        else if (u.en >= needE) { u.en -= needE; u.st.cloak = true; u.st.cloakDrain = ab.drain; }
        break;
      case 'mines': if (u.mines > 0) { u.orders = [{ op: 'mine', x: c.x, y: c.y }]; } break;
      case 'scan': {
        const addon = u.addon ? byId(g, u.addon) : null;
        const src = (u.tid === 'comsat_station') ? u : (addon && addon.tid === 'comsat_station' ? addon : null);
        if (src && src.complete && src.en >= needE) {
          src.en -= needE;
          g.scans.push({ o: c.p, x: c.x, y: c.y, t: g.tick + S.SCAN_TICKS });
          fx(g, 'scan', c.x, c.y, S.SCAN_TICKS);
        } break;
      }
      case 'heal': if (tgt) u.orders = [{ op: 'heal', t: tgt.id }]; break;
      case 'repair': if (tgt) u.orders = [{ op: 'repair', t: tgt.id }]; break;
      case 'lockdown': if (tgt && u.en >= needE) {
        u.en -= needE;
        if ((defOf(tgt.tid).flags || []).includes('mech') && tgt.kind === 'unit') { tgt.st.lock = S.LOCKDOWN_TICKS; tgt.orders = []; }
        fx(g, 'lockdown', tgt.x, tgt.y, 40); } break;
      case 'dmatrix': if (tgt && u.en >= needE) { u.en -= needE; tgt.st.dmx = S.DMATRIX_HP << FP; tgt.st.dmxT = S.DMATRIX_TICKS; fx(g, 'dmatrix', tgt.x, tgt.y, 40); } break;
      case 'emp': if (u.en >= needE) { u.orders = [{ op: 'castPoint', a: 'emp', x: c.x, y: c.y }]; } break;
      case 'irradiate': if (tgt && u.en >= needE) { u.en -= needE; tgt.st.irr = S.IRRADIATE_TICKS; tgt.st.irrDot = Math.round((S.IRRADIATE_DMG << FP) / S.IRRADIATE_TICKS); fx(g, 'irradiate', tgt.x, tgt.y, 60); sfx(g, 'irradiate', tgt); } break;
      case 'yamato': if (tgt && u.en >= needE) { u.en -= needE; u.orders = [{ op: 'yamato', t: tgt.id }]; } break;
      case 'nuke_paint': {
        let silo = null;
        for (const b of g.units) if (!b.dead && b.o === c.p && b.tid === 'nuclear_silo' && b.hasNuke) { silo = b; break; }
        if (silo && u.tid === 'ghost') { silo.hasNuke = false; u.orders = [{ op: 'nukePaint', x: c.x, y: c.y, t0: null }]; }
        break;
      }
      case 'parasite': if (tgt && u.en >= needE) { u.en -= needE; tgt.st.parasite = c.p; fx(g, 'parasite', tgt.x, tgt.y, 30); } break;
      case 'ensnare': if (u.en >= needE) { u.en -= needE; areaStatus(g, c.x, c.y, S.ENSNARE_R, v => { if (v.kind === 'unit') v.st.ens = S.ENSNARE_TICKS; }); fx(g, 'ensnare', c.x, c.y, 60); } break;
      case 'broodlings': if (tgt && u.en >= needE && tgt.kind === 'unit' && !tgt.fly &&
        !(defOf(tgt.tid).flags || []).includes('robotic') && !['archon', 'dark_archon', 'reaver', 'probe'].includes(tgt.tid)) {
        u.en -= needE; kill(g, tgt, u.o);
        for (let i = 0; i < S.BROODLING_COUNT; i++) spawnUnit(g, c.p, 'broodling', tgt.x + (i * 20 - 10) * ONE, tgt.y);
        fx(g, 'brood', tgt.x, tgt.y, 40); } break;
      case 'dark_swarm': if (u.en >= needE) { u.en -= needE; g.swarms.push({ x: c.x, y: c.y, t: g.tick + S.SWARM_TICKS, r: S.SWARM_R * T * ONE }); fx(g, 'swarm', c.x, c.y, S.SWARM_TICKS); } break;
      case 'consume': if (tgt && tgt.o === c.p && (defOf(tgt.tid).flags || []).includes('bio') && tgt.kind === 'unit' && tgt.id !== u.id) {
        kill(g, tgt, u.o); u.en = Math.min(maxEnergy(g, u), u.en + (S.CONSUME_ENERGY << FP)); } break;
      case 'plague': if (u.en >= needE) { u.en -= needE; areaStatus(g, c.x, c.y, S.PLAGUE_R, v => {
        v.st.plague = S.PLAGUE_TICKS; v.st.plagueDot = Math.round((S.PLAGUE_DMG << FP) / S.PLAGUE_TICKS); }); fx(g, 'plague', c.x, c.y, 80); sfx(g, 'plague', u); } break;
      case 'storm': if (u.en >= needE) { u.en -= needE;
        g.fx.push({ k: 'storm', x: c.x, y: c.y, t0: g.tick, life: S.STORM_TICKS });
        if (!g.storms) g.storms = [];
        g.storms.push({ x: c.x, y: c.y, end: g.tick + S.STORM_TICKS, dot: Math.round((S.STORM_DMG << FP) / S.STORM_TICKS), r: S.STORM_R * T * ONE });
        sfx(g, 'storm', { x: c.x, y: c.y, o: c.p }); } break;
      case 'hallucination': if (tgt && u.en >= needE && tgt.kind === 'unit') { u.en -= needE;
        for (let i = 0; i < S.HALLU_COUNT; i++) {
          const h = spawnUnit(g, u.o, tgt.tid, tgt.x + (i * 24 - 12) * ONE, tgt.y + 12 * ONE);
          h.st.hallu = true; h.st.halluT = S.HALLU_TICKS;
        } fx(g, 'hallu', tgt.x, tgt.y, 30); } break;
      case 'feedback': if (tgt && u.en >= needE && tgt.en > 0) { u.en -= needE;
        const dmg = tgt.en >> FP; tgt.en = 0; damage(g, tgt, dmg, 'n', u, true); fx(g, 'feedback', tgt.x, tgt.y, 30); } break;
      case 'maelstrom': if (u.en >= needE) { u.en -= needE; areaStatus(g, c.x, c.y, S.MAELSTROM_R, v => {
        if ((defOf(v.tid).flags || []).includes('bio')) v.st.mael = S.MAELSTROM_TICKS; }); fx(g, 'mael', c.x, c.y, 50); } break;
      case 'mind_control': if (tgt && u.en >= needE && tgt.kind === 'unit' && g.players[tgt.o].team !== p.team) {
        u.en -= needE; u.sh = 0; const prevO = tgt.o; tgt.o = c.p; tgt.orders = []; fx(g, 'mc', tgt.x, tgt.y, 50);
        recomputeSupply(g, p); recomputeSupply(g, g.players[prevO]); } break;
      case 'recall': if (u.en >= needE) { u.en -= needE; u.orders = [{ op: 'recall', x: c.x, y: c.y, t0: g.tick + S.RECALL_DELAY }]; fx(g, 'recallSrc', c.x, c.y, 60); } break;
      case 'stasis': if (u.en >= needE) { u.en -= needE; areaStatus(g, c.x, c.y, S.STASIS_R, v => {
        if (v.kind === 'unit') { v.st.stasis = S.STASIS_TICKS; v.orders = []; } }); fx(g, 'stasis', c.x, c.y, 60); } break;
      case 'dweb': if (u.en >= needE) { u.en -= needE; g.dwebs.push({ x: c.x, y: c.y, t: g.tick + S.DWEB_TICKS, r: S.DWEB_R * T * ONE }); fx(g, 'dweb', c.x, c.y, S.DWEB_TICKS); } break;
      case 'restoration': if (tgt && u.en >= needE && tgt.kind === 'unit') { u.en -= needE;
        const st = tgt.st;
        st.lock = 0; st.irr = 0; st.irrDot = 0; st.plague = 0; st.plagueDot = 0; st.ens = 0; st.mael = 0;
        delete st.parasite; st.flare = false;
        fx(g, 'healfx', tgt.x, tgt.y, 20); } break;
      case 'optical_flare': if (tgt && u.en >= needE && tgt.kind === 'unit') { u.en -= needE;
        tgt.st.flare = true; fx(g, 'lockdown', tgt.x, tgt.y, 30); } break;
      case 'infest': if (tgt && u.tid === 'queen' && tgt.tid === 'command_center' && tgt.complete &&
        tgt.hp < tgt.maxHp / 2 && g.players[tgt.o].team !== p.team) {
        const prevO = tgt.o;
        tgt.o = c.p; tgt.tid = 'infested_command_center'; tgt.queue = []; tgt.addon = null;
        fx(g, 'brood', tgt.x, tgt.y, 40);
        recomputeSupply(g, p); recomputeSupply(g, g.players[prevO]);
        g.creepDirty = true; } break;
      case 'merge_archon': case 'merge_dark_archon': break; // mrg 명령으로 처리
    }
  }
  function castable(g, u, tgt, ab) { return distPx(u.x, u.y, tgt.x, tgt.y) <= (ab.r || 8) * T + 16; }
  function areaStatus(g, x, y, rTiles, fn) {
    const r = rTiles * T;
    for (const v of g.units) {
      if (v.dead || v.st.stasis) continue;
      if (distPx(v.x, v.y, x, y) <= r + v.r) fn(v);
    }
  }
  function fx(g, k, x, y, life) { g.fx.push({ k, x, y, t0: g.tick, life }); }
  function sfx(g, k, u) { g.sfx.push({ k, x: u.x, y: u.y, o: u.o }); }

  // ---- 피해 ----------------------------------------------------------------
  function damage(g, tgt, raw, dtype, attacker, noMult) {
    if (tgt.dead || tgt.st.stasis) return;
    if (tgt.st.hallu) raw *= 2;
    let rem = raw << FP;
    // 방어막 매트릭스
    if (tgt.st.dmx > 0) {
      const absorbed = Math.min(tgt.st.dmx, rem - 128);
      tgt.st.dmx -= absorbed; rem -= absorbed;
      if (rem <= 0) return;
    }
    const p = g.players[tgt.o];
    // 보호막: 타입 배율 무시, 실드 업그레이드로 감소
    if (tgt.sh > 0) {
      let sd = rem - ((p.research.p_shields || 0) << FP);
      if (sd < 128) sd = 128;
      if (tgt.sh >= sd) { tgt.sh -= sd; hitReact(g, tgt, attacker); return; }
      rem = Math.round(rem * (1 - tgt.sh / sd));
      tgt.sh = 0;
    }
    // BW 순서: 장갑 차감 먼저 → 크기/타입 배율 적용 (Liquipedia Damage)
    const def = defOf(tgt.tid);
    let hd;
    if (noMult) hd = rem;
    else {
      const afterArmor = rem - (getArmor(g, tgt) << FP);
      hd = Math.round(Math.max(128, afterArmor) * D().MULT[dtype][def.size == null ? 2 : def.size] / ONE);
    }
    if (hd < 128) hd = 128;
    tgt.hp -= hd;
    hitReact(g, tgt, attacker);
    if (tgt.hp <= 0) kill(g, tgt, attacker ? attacker.o : -1);
  }

  function hitReact(g, tgt, attacker) {
    if (!attacker) return;
    tgt.lastHit = g.tick; tgt.lastHitBy = attacker.id;
    // 공격 알림
    if (g.tick - (g.players[tgt.o].lastAtkAlert || -999) > 240) {
      g.players[tgt.o].lastAtkAlert = g.tick;
      g.alerts.push({ p: tgt.o, kind: 'attack', x: tgt.x, y: tgt.y, t: g.tick });
    }
    // 반격
    if (tgt.kind === 'unit' && !tgt.orders.length && !isWorker(tgt) && !tgt.st.burrow) {
      const w = getWeapon(g, tgt, attacker);
      if (w && targetable(g, tgt, attacker)) tgt.orders = [{ op: 'attack', t: attacker.id, auto: true }];
    }
    // 주변 아군 반응
  }

  function kill(g, u, killerOwner) {
    if (u.dead) return;
    u.dead = true;
    const def = defOf(u.tid);
    if (killerOwner >= 0 && killerOwner !== u.o) g.stats[killerOwner][u.kind === 'building' ? 'razed' : 'killed']++;
    g.stats[u.o].lost++;
    // 수송 중 유닛 사망 (벙커는 생존)
    if (u.cargo && u.cargo.length) {
      for (const cid of u.cargo) {
        const cu = byId(g, cid);
        if (!cu) continue;
        if (u.tid === 'bunker') { cu.inBunker = false; cu.hidden = false; cu.x = u.x; cu.y = u.y; }
        else kill(g, cu, killerOwner);
      }
      u.cargo = [];
    }
    if (u.inters) for (const iid of u.inters) { const iu = byId(g, iid); if (iu) kill(g, iu, killerOwner); }
    if (u.kind === 'building') {
      const [w, h] = def.tiles;
      for (let y = u.tileY; y < u.tileY + h; y++) for (let x = u.tileX; x < u.tileX + w; x++)
        if (g.occ[y * g.map.w + x] === u.id) g.occ[y * g.map.w + x] = 0;
      if (def.flags && def.flags.includes('gas')) {
        const r = resById(g, u.geyser);
        if (r) {                                 // 간헐천 타일 점유 복원
          r.building = null;
          for (let yy = r.ty; yy < r.ty + r.h; yy++) for (let xx = r.tx; xx < r.tx + r.w; xx++)
            g.occ[yy * g.map.w + xx] = r.id;
        }
      }
      if (def.flags && def.flags.includes('creepSource')) g.creepDirty = true;
      if (def.flags && def.flags.includes('larvaSpawner'))
        for (const l of g.units) if (!l.dead && l.tid === 'larva' && l.hatch === u.id) kill(g, l, -1);
      fx(g, def.race === 'Z' ? 'bdeathZ' : 'bdeath', u.x, u.y, 30);
      sfx(g, 'bdeath', u);
      // 건설 중이던 SCV 해제
    } else {
      fx(g, def.race === 'Z' || (def.flags || []).includes('bio') ? 'gib' : 'expl', u.x, u.y, 24);
      sfx(g, 'death', u);
    }
    recomputeSupply(g, g.players[u.o]);
  }

  function cancelConstruction(g, b) {
    const def = defOf(b.tid);
    const p = g.players[b.o];
    p.minerals += Math.floor(def.min * 0.75); p.gas += Math.floor(def.gas * 0.75);
    if (p.race === 'Z') spawnUnit(g, b.o, 'drone', b.x, b.y + T * 2 * ONE);   // 드론 반환
    kill(g, b, -1);
    g.stats[b.o].lost--;
  }

  // ---- 이동 ----------------------------------------------------------------
  function moveStep(g, u, tx, ty, arriveDist) {
    const sp = getSpeed(g, u);
    const ad = (arriveDist || 6);
    if (u.fly) {
      const d = distPx(u.x, u.y, tx, ty);
      if (d <= ad) return true;
      // (tx-u.x)/d = 256*단위벡터 → sp(fp)를 곱한 뒤 ONE으로 나눠 fp 이동량
      const vx = (tx - u.x) / d, vy = (ty - u.y) / d;
      u.x += Math.round(vx * sp / ONE); u.y += Math.round(vy * sp / ONE);
      u.face = faceOf(vx, vy);
      return false;
    }
    // 지상: 경로 필요
    const key = ((tx / ONE) | 0) + ',' + ((ty / ONE) | 0);
    if (!u.path || u.pathKey !== key) {
      const sx = (u.x / ONE / T) | 0, sy = (u.y / ONE / T) | 0;
      const dx = (tx / ONE / T) | 0, dy = (ty / ONE / T) | 0;
      const path = SC.Path.findPath(g.map, g.occ, sx, sy, dx, dy);
      u.path = path || []; u.pi = 0; u.pathKey = key; u.stuck = 0;
    }
    let wx = tx, wy = ty;
    if (u.path && u.pi < u.path.length) {
      wx = (u.path[u.pi][0] * T + 16) * ONE; wy = (u.path[u.pi][1] * T + 16) * ONE;
      if (distPx(u.x, u.y, wx, wy) < 14) { u.pi++; return moveStep(g, u, tx, ty, arriveDist); }
    }
    const d = distPx(u.x, u.y, wx, wy);
    if (u.pi >= (u.path ? u.path.length : 0) && distPx(u.x, u.y, tx, ty) <= ad) return true;
    if (d < 1) { u.pi++; return distPx(u.x, u.y, tx, ty) <= ad; }
    const vx = (wx - u.x) / d, vy = (wy - u.y) / d;
    const nx = u.x + Math.round(vx * sp / ONE), ny = u.y + Math.round(vy * sp / ONE);
    // 지형 차단 확인
    const free = (px2, py2) => {
      const i2 = ((py2 / ONE / T) | 0) * g.map.w + ((px2 / ONE / T) | 0);
      return i2 >= 0 && i2 < g.map.walk.length && g.map.walk[i2] && !g.occ[i2];
    };
    if (!free(u.x, u.y)) { u.x = nx; u.y = ny; u.face = faceOf(vx, vy); u.stuck = 0; }   // 갇힘: 자유 탈출
    else if (free(nx, ny)) { u.x = nx; u.y = ny; u.face = faceOf(vx, vy); u.stuck = 0; }
    else if (free(nx, u.y)) { u.x = nx; u.face = faceOf(vx, vy); u.stuck = 0; }      // 벽 미끄러짐 (x축)
    else if (free(u.x, ny)) { u.y = ny; u.face = faceOf(vx, vy); u.stuck = 0; }      // 벽 미끄러짐 (y축)
    else {
      u.stuck = (u.stuck || 0) + 1;
      if (u.stuck > 8) { u.path = null; u.stuck = 0; }
    }
    return distPx(u.x, u.y, tx, ty) <= ad;
  }

  function faceOf(vx, vy) {
    // 16방향 (렌더 전용)
    let a = Math.atan2(vy, vx);
    return ((Math.round(a / (Math.PI / 8)) % 16) + 16) % 16;
  }

  // ---- 유닛 서로 밀치기 -------------------------------------------------------
  const isBusyWorker = u => isWorker(u) && u.orders.length &&
    ['gather', 'return', 'build', 'construct'].includes(u.orders[0].op);

  function separate(g) {
    const cell = 64, buckets = new Map();
    const list = [];
    for (const u of g.units) {
      if (u.dead || u.kind === 'building' || u.hidden || u.st.burrow) continue;
      if (isBusyWorker(u)) continue;              // 채취/건설 일꾼은 서로 통과
      list.push(u);
      const k = (((u.x / ONE / cell) | 0) << 12) | ((u.y / ONE / cell) | 0);
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(u);
    }
    for (const u of list) {
      const cx = (u.x / ONE / cell) | 0, cy = (u.y / ONE / cell) | 0;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const arr = buckets.get(((cx + ox) << 12) | (cy + oy));
        if (!arr) continue;
        for (const v of arr) {
          if (v.id <= u.id || v.fly !== u.fly) continue;
          const md = (u.r + v.r) * 0.85;
          const dx = (v.x - u.x) / ONE, dy = (v.y - u.y) / ONE;
          const d2 = dx * dx + dy * dy;
          if (d2 < md * md && d2 > 0.001) {
            const d = Math.sqrt(d2), push = ((md - d) / 2) * ONE;
            const px = Math.round(dx / d * push), py = Math.round(dy / d * push);
            tryPush(g, v, px, py); tryPush(g, u, -px, -py);
          } else if (d2 <= 0.001) { tryPush(g, v, ONE * 2, ONE); }
        }
      }
    }
  }
  function tryPush(g, u, px, py) {
    if (u.fly) { u.x += px; u.y += py; return; }
    const nx = u.x + px, ny = u.y + py;
    const ti = ((ny / ONE / T) | 0) * g.map.w + ((nx / ONE / T) | 0);
    if (ti >= 0 && ti < g.map.walk.length && g.map.walk[ti] && !g.occ[ti]) { u.x = nx; u.y = ny; }
  }

  // ---- 타겟 획득 -----------------------------------------------------------
  function acquireTarget(g, u, rangePx) {
    const def = defOf(u.tid);
    if (!def.g && !def.a && !def.siege) return null;
    // 우선순위: 0 무장 유닛 → 1 비무장 유닛/요격기 → 2 건물
    const best = [null, null, null], bd = [Infinity, Infinity, Infinity];
    const myTeam = g.players[u.o].team;
    for (const v of g.units) {
      if (v.dead || v.o === u.o || g.players[v.o].team === myTeam || v.hidden) continue;
      if (v.tid === 'larva' || v.tid === 'egg') continue;
      if (!targetable(g, u, v)) continue;
      const w = getWeapon(g, u, v);
      if (!w) continue;
      const vd = defOf(v.tid);
      const tier = v.kind === 'building' ? 2 : ((vd.g || vd.a) && v.tid !== 'interceptor' ? 0 : 1);
      const d = distPx(u.x, u.y, v.x, v.y) - v.r;
      if (d < bd[tier] && d <= rangePx) { bd[tier] = d; best[tier] = v; }
    }
    return best[0] || best[1] || best[2];
  }

  // ---- 공격 실행 -----------------------------------------------------------
  function tryAttack(g, u, tgt) {
    const w = getWeapon(g, u, tgt);
    if (!w) return 'nowep';
    if (w.needBurrow && !u.st.burrow) return 'nowep';
    const range = getRange(g, u, w);
    const minR = (w.min || 0) * T;
    const d = distPx(u.x, u.y, tgt.x, tgt.y) - tgt.r - u.r;
    if (d > range) return 'far';
    if (minR && d < minR) return 'close';
    if (u.cd > 0) return 'cd';
    // 발사
    u.cd = getCooldown(g, u, w);
    u.face = faceOf((tgt.x - u.x) / ONE || 0.01, (tgt.y - u.y) / ONE || 0.01);
    // 디스럽션 웹: 지상 유닛/건물 공격 불가
    if (!u.fly && underDweb(g, u)) return 'cd';
    if (w.suicide) {
      const dmg = weaponDmg(g, u, w);
      splashAt(g, u, tgt.x, tgt.y, dmg, w.t, w.splash === 'full' ? 64 : 32, false);
      kill(g, u, u.o);
      return 'ok';
    }
    if (w.scarab) {
      if (u.scarabs <= 0) { u.cd = 10; return 'cd'; }
      u.scarabs--;
      const s = spawnUnit(g, u.o, 'scarab_proj', u.x, u.y);
      s.tid = 'scarab_proj'; s.scTgt = tgt.id; s.scT = 90; s.r = 5; s.hp = 20 << FP; s.maxHp = 20 << FP;
      s.scDmg = weaponDmg(g, u, w);
      return 'ok';
    }
    const projSpeed = w.r > 1 ? 14 : 0;
    const isRanged = w.r > 1;
    // 다크스웜: 원거리 직접 공격 무효 (스플래시 무기는 유효)
    const swarmMiss = isRanged && !w.splash && underSwarm(g, tgt);
    // 언덕 위 공격 빗나감
    let missUp = false;
    if (isRanged && !u.fly && !tgt.fly) {
      const hu = g.map.height[tileIdx(g, u)], ht = g.map.height[tileIdx(g, tgt)];
      if (ht === 1 && hu !== 1) missUp = rngInt(g, 100) < 47;
    }
    const dmg = weaponDmg(g, u, w);
    g.bullets.push({ sx: u.x, sy: u.y, x: u.x, y: u.y, t: tgt.id, o: u.o, src: u.id, stid: u.tid,
      d: dmg, n: w.n || 1, dt: w.t, spd: projSpeed, splash: w.splash, bounce: w.bounce, spores: w.spores,
      miss: swarmMiss || missUp, air: tgt.fly });
    sfx(g, 'fire_' + u.tid, u);
    return 'ok';
  }
  const tileIdx = (g, u) => (((u.y / ONE / T) | 0) * g.map.w + ((u.x / ONE / T) | 0));
  function underSwarm(g, u) {
    if (u.fly) return false;
    for (const s of g.swarms) if (distPx(u.x, u.y, s.x, s.y) * ONE <= s.r) return true;
    return false;
  }
  function underDweb(g, u) {
    for (const s of g.dwebs) if (distPx(u.x, u.y, s.x, s.y) * ONE <= s.r) return true;
    return false;
  }

  function splashAt(g, src, x, y, dmg, dt, radiusPx, friendly) {
    for (const v of g.units) {
      if (v.dead || v.hidden || v.id === src.id) continue;   // 자기 자신은 스플래시 제외
      if (!friendly && g.players[v.o].team === g.players[src.o].team) continue;
      const d = distPx(v.x, v.y, x, y) - v.r;
      let f = 0;
      if (d <= radiusPx * 0.5) f = 1; else if (d <= radiusPx) f = 0.5; else if (d <= radiusPx * 1.5) f = 0.25;
      if (f > 0) damage(g, v, Math.round(dmg * f), dt, src);
    }
  }

  // ---- 총알 ----------------------------------------------------------------
  function stepBullets(g) {
    const S = D().SPELL;
    for (const b of g.bullets) {
      if (b.done) continue;
      if (b.resolved) { if (--b.ttl <= 0) b.done = true; continue; }   // 렌더용 잔상
      const tgt = byId(g, b.t);
      if (!tgt || tgt.dead) { b.done = true; continue; }
      if (b.spd > 0) {
        const d = distPx(b.x, b.y, tgt.x, tgt.y);
        if (d > b.spd) {
          b.x += Math.round((tgt.x - b.x) / d * b.spd); b.y += Math.round((tgt.y - b.y) / d * b.spd);
          continue;
        }
      }
      if (b.spd > 0) b.done = true;
      else { b.resolved = true; b.ttl = 4; b.ex = tgt.x; b.ey = tgt.y; }   // 즉발: 트레이서 잔상
      if (b.miss) { fx(g, 'miss', tgt.x, tgt.y, 10); continue; }
      const src = byId(g, b.src) || { o: b.o, id: -1, tid: b.stid, x: b.x, y: b.y };
      if (src.st && src.st.hallu) continue; // 환상은 피해 없음
      if (b.splash === 'full') {
        // 시즈탱크/발키리/커세어/화염방사병 등
        const friendly = (b.stid === 'siege_tank' || b.stid === 'spider_mine');
        for (let i = 0; i < b.n; i++) splashAt(g, src, tgt.x, tgt.y, b.d, b.dt, 60, friendly);
      } else if (b.splash === 'line') {
        // 러커/파이어뱃: 소스→타겟 직선
        const dx = tgt.x - b.sx, dy = tgt.y - b.sy;
        const len = Math.max(1, distPx(b.sx, b.sy, tgt.x, tgt.y));
        for (const v of g.units) {
          if (v.dead || v.fly || g.players[v.o].team === g.players[src.o].team) continue;
          const px = (v.x - b.sx) / ONE, py = (v.y - b.sy) / ONE;
          const proj = (px * dx / ONE + py * dy / ONE) / len;
          if (proj < 0 || proj > len + 32) continue;
          const cx = proj * dx / ONE / len, cy = proj * dy / ONE / len;
          const off = Math.sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy));
          if (off < 20 + v.r) for (let i = 0; i < b.n; i++) damage(g, v, b.d, b.dt, src);
        }
        fx(g, b.stid === 'lurker' ? 'spines' : 'flame', tgt.x, tgt.y, 14);
      } else if (b.bounce) {
        // 뮤탈: 3연쇄 100/33/11
        let cur = tgt, dmg = b.d, prev = [tgt.id];
        for (let hop = 0; hop < 3 && cur; hop++) {
          damage(g, cur, Math.max(1, Math.round(dmg)), b.dt, src);
          dmg /= 3;
          let next = null, nd = Infinity;
          for (const v of g.units) {
            if (v.dead || prev.includes(v.id) || g.players[v.o].team === g.players[src.o].team || v.hidden) continue;
            const dd = distPx(cur.x, cur.y, v.x, v.y);
            if (dd < 96 && dd < nd) { nd = dd; next = v; }
          }
          if (next) { prev.push(next.id); fx(g, 'glaive', next.x, next.y, 8); }
          cur = next;
        }
      } else {
        for (let i = 0; i < b.n; i++) damage(g, tgt, b.d, b.dt, src);
        if (b.spores) { tgt.st.spores = Math.min(9, (tgt.st.spores || 0) + 1); tgt.st.sporesT = S.ACID_SPORE_TICKS; }
      }
      fx(g, 'hit', tgt.x, tgt.y, 8);
    }
    g.bullets = g.bullets.filter(b => !b.done);
  }

  // ---- 유닛 개별 처리 --------------------------------------------------------
  function stepUnit(g, u) {
    const def = defOf(u.tid);
    const S = D().SPELL;
    const p = g.players[u.o];

    if (u.cd > 0) u.cd--;

    // 상태 타이머
    const st = u.st;
    if (st.stim) st.stim--;
    if (st.lock) st.lock--;
    if (st.stasis) st.stasis--;
    if (st.mael) st.mael--;
    if (st.ens) st.ens--;
    if (st.dmxT) { st.dmxT--; if (!st.dmxT) st.dmx = 0; }
    if (st.halluT != null) { if (--st.halluT <= 0) { kill(g, u, -1); return; } }
    if (st.sporesT) { if (--st.sporesT <= 0) st.spores = 0; }
    if (st.fcT) st.fcT--;
    // 아비터 은폐장: 주변 아군 유닛 은폐 (자신/아비터/건물 제외)
    if (u.tid === 'arbiter' && u.kind === 'unit' && (g.tick & 7) === 0) {
      for (const v of g.units) {
        if (v.dead || v.o !== u.o || v.id === u.id || v.kind !== 'unit' || v.tid === 'arbiter') continue;
        if (distPx(u.x, u.y, v.x, v.y) <= 4 * T) v.st.fcT = 16;
      }
    }
    if (st.irr) {
      st.irr--;
      for (const v of g.units) {          // 방사능: 주변 1타일 내 모든 생체 유닛 피해
        if (v.dead || v.st.stasis || v.hidden || v.kind !== 'unit') continue;
        if (v.id !== u.id && distPx(u.x, u.y, v.x, v.y) > T + v.r) continue;
        if (!(defOf(v.tid).flags || []).includes('bio') || v.st.hallu) continue;
        v.hp -= st.irrDot;
        if (v.hp <= 0 && v.id !== u.id) kill(g, v, -1);
      }
      if (u.hp <= 0) { kill(g, u, -1); return; }
    }
    if (st.plague) { st.plague--; u.hp = Math.max(ONE, u.hp - st.plagueDot); }
    if (u.life != null) { if (--u.life <= 0) { kill(g, u, -1); return; } }
    if (def.life && u.life == null) u.life = def.life;
    if (st.cloak && st.cloakDrain) {
      u.en -= st.cloakDrain;                       // 프레임당 n/256 (고스트 10, 레이스 13)
      if (u.en <= 0) { u.en = 0; st.cloak = false; }
    }
    if (st.stasis || st.lock || st.mael) return;

    // 재생 (은폐 중엔 에너지 회복 없음)
    if (def.race === 'Z' && u.hp < u.maxHp && !st.hallu) u.hp = Math.min(u.maxHp, u.hp + D().ZERG_REGEN);
    if (u.maxSh > 0 && u.sh < u.maxSh) u.sh = Math.min(u.maxSh, u.sh + D().SHIELD_REGEN);
    if (def.me && !(st.cloak && st.cloakDrain) && u.en < maxEnergy(g, u)) u.en = Math.min(maxEnergy(g, u), u.en + D().ENERGY_REGEN);

    if (u.kind === 'building') { stepBuilding(g, u); return; }
    // 가스 채취가 다른 명령으로 끊긴 경우 복구
    if (u.gT != null && (!u.orders.length || (u.orders[0].op !== 'gather' && u.orders[0].op !== 'return'))) {
      u.gT = null; u.hidden = false;
    }
    if (u.hidden && u.gT == null) return;   // 수송 탑승 중 (가스 채취 중인 일꾼은 계속 진행)
    if (u.tid === 'scarab_proj') { stepScarab(g, u); return; }
    if (u.tid === 'spider_mine') { stepMine(g, u); return; }
    if (u.tid === 'interceptor') { stepInterceptor(g, u); return; }
    if (u.tid === 'larva' || u.tid === 'egg') { stepMorph(g, u); return; }
    if (u.morph) { stepMorph(g, u); return; }

    // 캐리어 요격기 생산
    if (u.tid === 'carrier') stepCarrierAmmo(g, u);
    if (u.tid === 'reaver') stepReaverAmmo(g, u);

    const order = u.orders[0];
    if (!order) {
      // 대기: 자동 획득
      idleBehavior(g, u);
      return;
    }
    const done = execOrder(g, u, order);
    if (done) { u.orders.shift(); u.path = null; }
  }

  function idleBehavior(g, u) {
    const def = defOf(u.tid);
    if (isWorker(u)) {
      if (u.carry) { u.orders = [{ op: 'return' }]; return; }
      return;
    }
    if (u.tid === 'medic') {
      const tgt = findHealTarget(g, u, 6 * T);
      if (tgt) { u.orders = [{ op: 'heal', t: tgt.id, auto: true }]; return; }
      return;
    }
    if ((g.tick + u.id) % 8 === 0 && !u.st.burrow) {
      const tgt = acquireTarget(g, u, getSight(g, u) * T);
      if (tgt) u.orders = [{ op: 'attack', t: tgt.id, auto: true, anchor: { x: u.x, y: u.y } }];
    }
    // 러커는 잠복 상태에서 자동 공격
    if (u.tid === 'lurker' && u.st.burrow && u.cd <= 0) {
      const tgt = acquireTarget(g, u, 6 * T);
      if (tgt) tryAttack(g, u, tgt);
    }
  }

  function findHealTarget(g, m, range) {
    let best = null, bd = Infinity;
    for (const v of g.units) {
      if (v.dead || v.o !== m.o || v.id === m.id || v.kind !== 'unit') continue;
      if (!(defOf(v.tid).flags || []).includes('bio')) continue;
      if (v.hp >= v.maxHp) continue;
      const d = distPx(m.x, m.y, v.x, v.y);
      if (d < range && d < bd) { bd = d; best = v; }
    }
    return best;
  }

  function execOrder(g, u, o) {
    const def = defOf(u.tid);
    const S = D().SPELL;
    const p = g.players[u.o];
    switch (o.op) {
      case 'move': return moveStep(g, u, o.x, o.y, 10);
      case 'hold': {
        if (u.cd <= 0 && (g.tick + u.id) % 4 === 0) {
          const w = def.g || def.a;
          if (w) {
            const tgt = acquireTarget(g, u, getRange(g, u, w) + T);
            if (tgt) tryAttack(g, u, tgt);
          }
        }
        return false;
      }
      case 'amove': {
        if (u.tid === 'medic' && (g.tick + u.id) % 6 === 0) {
          const ht = findHealTarget(g, u, 6 * T);
          if (ht) { u.orders.unshift({ op: 'heal', t: ht.id, auto: true }); return false; }
        }
        if ((g.tick + u.id) % 6 === 0 && !isWorker(u)) {
          const tgt = acquireTarget(g, u, getSight(g, u) * T);
          if (tgt) { u.orders.unshift({ op: 'attack', t: tgt.id, auto: true, resume: { x: o.x, y: o.y } }); u.path = null; return false; }
        }
        return moveStep(g, u, o.x, o.y, 12);
      }
      case 'patrol': {
        if ((g.tick + u.id) % 6 === 0 && !isWorker(u)) {
          const tgt = acquireTarget(g, u, getSight(g, u) * T);
          if (tgt) { u.orders.unshift({ op: 'attack', t: tgt.id, auto: true }); u.path = null; return false; }
        }
        const dst = o.leg === 0 ? { x: o.x2, y: o.y2 } : { x: o.x1, y: o.y1 };
        if (moveStep(g, u, dst.x, dst.y, 12)) { o.leg = 1 - o.leg; u.path = null; }
        return false;
      }
      case 'attack': {
        const tgt = byId(g, o.t);
        if (!tgt || tgt.dead || !targetable(g, u, tgt)) {
          if (o.resume) { u.orders[0] = { op: 'amove', x: o.resume.x, y: o.resume.y }; u.path = null; return false; }
          return true;
        }
        const res = tryAttack(g, u, tgt);
        if (res === 'far') {
          if (u.st.sieged || u.st.burrow || !canMove(u)) return o.auto ? true : false;
          moveStep(g, u, tgt.x, tgt.y, Math.max(8, getRange(g, u, getWeapon(g, u, tgt) || { r: 1 }) - 8));
          // 자동 교전은 앵커에서 너무 멀어지면 복귀
          if (o.auto && o.anchor && distPx(u.x, u.y, o.anchor.x, o.anchor.y) > 15 * T) {
            u.orders[0] = { op: 'move', x: o.anchor.x, y: o.anchor.y }; u.path = null;
          }
        } else if (res === 'close' && canMove(u)) {
          // 최소 사거리: 후퇴
          const d = distPx(u.x, u.y, tgt.x, tgt.y) || 1;
          moveStep(g, u, u.x + Math.round((u.x - tgt.x) / d * 3 * T), u.y + Math.round((u.y - tgt.y) / d * 3 * T), 10);
        } else if (res === 'nowep') return true;
        return false;
      }
      case 'follow': {
        const tgt = byId(g, o.t);
        if (!tgt || tgt.dead) return true;
        if (distPx(u.x, u.y, tgt.x, tgt.y) > 3 * T) moveStep(g, u, tgt.x, tgt.y, T * 2);
        return false;
      }
      case 'gather': return stepGather(g, u, o);
      case 'return': return stepReturn(g, u);
      case 'build': return stepBuild(g, u, o);
      case 'construct': return stepConstruct(g, u, o);
      case 'repair': {
        const tgt = byId(g, o.t);
        if (!tgt || tgt.dead || tgt.hp >= tgt.maxHp) return true;
        const tDef = defOf(tgt.tid);
        if (!((tDef.flags || []).includes('mech') || tgt.kind === 'building')) return true;
        if (distPx(u.x, u.y, tgt.x, tgt.y) - tgt.r > T) { moveStep(g, u, tgt.x, tgt.y, tgt.r + T - 8); return false; }
        const rate = D().SPELL.REPAIR_RATE;
        const cost = tDef.min / ((tDef.hp << FP) || 1) * rate * 0.33;
        u.repAcc = (u.repAcc || 0) + cost;
        if (u.repAcc >= 1) {
          const c = Math.floor(u.repAcc);
          if (p.minerals < c) return false;
          p.minerals -= c; u.repAcc -= c;
        }
        tgt.hp = Math.min(tgt.maxHp, tgt.hp + rate);
        fx(g, 'spark', tgt.x + (rngInt(g, 32) - 16) * ONE, tgt.y + (rngInt(g, 32) - 16) * ONE, 6);
        return tgt.hp >= tgt.maxHp;
      }
      case 'heal': {
        const tgt = byId(g, o.t);
        if (!tgt || tgt.dead || tgt.hp >= tgt.maxHp || u.en <= 0) return true;
        if (distPx(u.x, u.y, tgt.x, tgt.y) > 2 * T) { moveStep(g, u, tgt.x, tgt.y, T * 1.5); return false; }
        const heal = Math.min(S.HEAL_RATE, tgt.maxHp - tgt.hp);
        tgt.hp += heal; u.en -= Math.round(heal / S.HEAL_HP_PER_E);
        if (u.en < 0) u.en = 0;
        fx(g, 'healfx', tgt.x, tgt.y, 6);
        return tgt.hp >= tgt.maxHp;
      }
      case 'enter': {
        const tr = byId(g, o.t);
        if (!tr || tr.dead) return true;
        const trDef = defOf(tr.tid);
        const cap = trDef.slots || 0;
        if (!cap && tr.tid !== 'bunker') return true;
        if (tr.tid === 'bunker' && !['marine', 'firebat', 'ghost', 'medic', 'scv'].includes(u.tid)) return true;
        if (tr.tid === 'overlord' && !p.research.ventral_sacs) return true;
        const used = tr.cargo.reduce((s, id) => { const cu = byId(g, id); return s + (cu ? defOf(cu.tid).cargo || 1 : 0); }, 0);
        if (used + (def.cargo || 1) > cap) return true;
        if (distPx(u.x, u.y, tr.x, tr.y) - tr.r > T) { moveStep(g, u, tr.x, tr.y, tr.r + 16); return false; }
        u.hidden = true; u.inBunker = tr.tid === 'bunker'; u.orders = [];
        tr.cargo.push(u.id);
        return true;
      }
      case 'unload': {
        if (u.tid !== 'bunker' && distPx(u.x, u.y, o.x, o.y) > T * 2) { moveStep(g, u, o.x, o.y, T * 1.5); return false; }
        let i = 0;
        for (const cid of u.cargo) {
          const cu = byId(g, cid);
          if (!cu) continue;
          cu.hidden = false; cu.inBunker = false;
          cu.x = u.x + ((i % 3) - 1) * 24 * ONE; cu.y = u.y + u.r * ONE + (((i / 3) | 0) + 1) * 20 * ONE;
          // 지상 확인
          if (!u.fly) { cu.x = u.x + ((i % 3) - 1) * 30 * ONE; }
          i++;
        }
        u.cargo = [];
        return true;
      }
      case 'mine': {
        if (distPx(u.x, u.y, o.x, o.y) > T) { moveStep(g, u, o.x, o.y, 20); return false; }
        if (u.mines > 0) {
          u.mines--;
          const m = spawnUnit(g, u.o, 'spider_mine', o.x, o.y);
          m.st.burrow = false; m.arming = D().SPELL.MINE_ARM;
        }
        return true;
      }
      case 'cast': {
        const ab2 = D().abilities[o.a];
        const ct = o.t ? byId(g, o.t) : null;
        if (o.t && (!ct || ct.dead)) return true;
        const cx2 = ct ? ct.x : o.x, cy2 = ct ? ct.y : o.y;
        if (distPx(u.x, u.y, cx2, cy2) > (ab2.r || 8) * T) { moveStep(g, u, cx2, cy2, (ab2.r || 8) * T - 12); return false; }
        doCast(g, g.players[u.o], { a: o.a, t: o.t, x: o.x, y: o.y, p: u.o }, u, ab2);
        return true;
      }
      case 'castPoint': {
        // 사거리 내 이동 후 시전 (EMP 등)
        if (distPx(u.x, u.y, o.x, o.y) > 8 * T) { moveStep(g, u, o.x, o.y, 8 * T - 16); return false; }
        if (o.a === 'emp') {
          if (u.en < 100 << FP) return true;
          u.en -= 100 << FP;
          areaStatus(g, o.x, o.y, D().SPELL.EMP_R, v => { v.sh = 0; v.en = 0; });
          fx(g, 'emp', o.x, o.y, 30); sfx(g, 'emp', u);
        }
        return true;
      }
      case 'yamato': {
        const tgt = byId(g, o.t);
        if (!tgt || tgt.dead) return true;
        if (distPx(u.x, u.y, tgt.x, tgt.y) > 10 * T) { moveStep(g, u, tgt.x, tgt.y, 10 * T - 16); return false; }
        if (o.ch == null) { o.ch = 40; return false; }
        if (--o.ch > 0) { fx(g, 'yamatoCh', u.x, u.y, 2); return false; }
        damage(g, tgt, D().SPELL.YAMATO_DMG, 'e', u, false);
        fx(g, 'yamato', tgt.x, tgt.y, 20); sfx(g, 'yamato', u);
        return true;
      }
      case 'nukePaint': {
        if (distPx(u.x, u.y, o.x, o.y) > 9 * T) { moveStep(g, u, o.x, o.y, 9 * T - 16); return false; }
        if (o.t0 == null) {
          o.t0 = g.tick + D().SPELL.NUKE_DELAY;
          g.nukes.push({ x: o.x, y: o.y, t: o.t0, ghost: u.id, o: u.o });
          for (const pl of g.players) if (pl.team !== p.team) g.alerts.push({ p: pl.i, kind: 'nuke', t: g.tick });
          fx(g, 'nukeDot', o.x, o.y, D().SPELL.NUKE_DELAY);
        }
        u.channel = true;
        if (g.tick >= o.t0) { u.channel = false; return true; }
        return false;
      }
      case 'recall': {
        if (g.tick < o.t0) return false;
        // 아비터 주변 유닛 소환
        let n = 0;
        for (const v of g.units) {
          if (v.dead || v.o !== u.o || v.kind !== 'unit' || v.id === u.id || v.hidden) continue;
          if (distPx(v.x, v.y, o.x, o.y) < 999999 && distPx(v.x, v.y, u.x, u.y) > 6 * T) continue;
          if (distPx(v.x, v.y, u.x, u.y) <= D().SPELL.RECALL_R * T) {
            v.x = o.x + ((n % 3) - 1) * 28 * ONE; v.y = o.y + (((n / 3) | 0) - 1) * 28 * ONE;
            v.path = null; n++;
            if (n >= 12) break;
          }
        }
        fx(g, 'recall', o.x, o.y, 40);
        return true;
      }
      case 'merge': {
        const other = byId(g, o.t);
        if (!other || other.dead || !other.orders.length || other.orders[0].op !== 'merge') return true;
        const d = distPx(u.x, u.y, other.x, other.y);
        if (d > T) { moveStep(g, u, other.x, other.y, 24); return false; }
        if (u.id < other.id) {
          // 낮은 id가 변환 담당
          const to = u.tid === 'high_templar' ? 'archon' : 'dark_archon';
          const mx = (u.x + other.x) / 2, my = (u.y + other.y) / 2;
          kill(g, other, -1); g.stats[u.o].lost--;
          u.dead = true; g.stats[u.o].lost--; // 정리 (킬 카운트 제외)
          const a = spawnUnit(g, u.o, to, mx, my);
          a.st.warp = defOf(to).mergeTime * D().TICKS;
          fx(g, 'archonMerge', mx, my, 40);
          recomputeSupply(g, p);
          return true;
        }
        return false;   // 높은 id는 파트너가 합체를 완료할 때까지 대기
      }
      default: return true;
    }
  }

  // ---- 채취 ----------------------------------------------------------------
  function stepGather(g, u, o) {
    const r = resById(g, o.t);
    const p = g.players[u.o];
    if (!r || (r.amt <= 0 && r.kind === 'm')) {
      // 근처 다른 자원
      const nr = nearestRes(g, u.x, u.y, 'm');
      if (nr) { o.t = nr.id; return false; }
      return true;
    }
    if (u.carry) { u.orders.unshift({ op: 'return' }); return false; }
    if (r.kind === 'g') {
      const gb = r.building ? byId(g, r.building) : null;
      if (!gb || gb.dead || !gb.complete || gb.o !== u.o) { u.gT = null; u.hidden = false; return true; }
    }
    const d = distPx(u.x, u.y, r.x, r.y) - r.w * T / 2;
    if (d > T * 0.9) { moveStep(g, u, r.x, r.y, r.w * T / 2 + 12); return false; }
    // 채취 시작
    if (u.gT == null) {
      u.gT = r.kind === 'm' ? D().MINE_TIME : D().GAS_TIME;
      if (r.kind === 'g') u.hidden = true;
    }
    if (--u.gT > 0) return false;
    u.gT = null; u.hidden = false;
    if (r.kind === 'm') {
      const take = Math.min(D().MINERAL_PER_TRIP, r.amt);
      r.amt -= take; u.carry = { k: 'm', n: take };
      if (r.amt <= 0) {                         // 고갈: 타일 점유 해제 후 제거
        fx(g, 'mineralGone', r.x, r.y, 10);
        for (let yy = r.ty; yy < r.ty + r.h; yy++) for (let xx = r.tx; xx < r.tx + r.w; xx++)
          if (g.occ[yy * g.map.w + xx] === r.id) g.occ[yy * g.map.w + xx] = 0;
        r.gone = true;
      }
    } else {
      const take = r.amt > 0 ? D().GAS_PER_TRIP : D().GAS_DEPLETED;
      r.amt = Math.max(0, r.amt - take); u.carry = { k: 'g', n: take };
    }
    u.orders.unshift({ op: 'return' });
    return false;
  }

  function stepReturn(g, u) {
    const p = g.players[u.o];
    if (!u.carry) return true;
    let hall = null, bd = Infinity;
    for (const b of g.units) {
      if (b.dead || b.o !== u.o || b.kind !== 'building' || !b.complete) continue;
      if (!(defOf(b.tid).flags || []).includes('hall')) continue;
      const d = dist2(u.x, u.y, b.x, b.y);
      if (d < bd) { bd = d; hall = b; }
    }
    if (!hall) return true;
    if (distPx(u.x, u.y, hall.x, hall.y) - hall.r > T * 0.8) { moveStep(g, u, hall.x, hall.y, hall.r + 14); return false; }
    if (u.carry.k === 'm') { p.minerals += u.carry.n; g.stats[u.o].mineralsGathered += u.carry.n; }
    else { p.gas += u.carry.n; g.stats[u.o].gasGathered += u.carry.n; }
    u.carry = null;
    return true;
  }

  // ---- 건설 ----------------------------------------------------------------
  function stepBuild(g, u, o) {
    const p = g.players[u.o];
    const def = defOf(o.u);
    const cx = (o.tx * T + def.tiles[0] * T / 2) * ONE, cy = (o.ty * T + def.tiles[1] * T / 2) * ONE;
    if (o.t0 == null) o.t0 = g.tick;
    if (distPx(u.x, u.y, cx, cy) > (Math.max(def.tiles[0], def.tiles[1]) / 2 + 1.2) * T) {
      if (g.tick - o.t0 > 600) { uiAlert(g, u.o, 'place'); return true; }   // 도달 불가: 25초 후 포기
      moveStep(g, u, cx, cy, Math.max(def.tiles[0], def.tiles[1]) / 2 * T + T);
      return false;
    }
    if (def.flags && def.flags.includes('gas')) {
      let gr = null;
      for (const r of g.res) if (r.kind === 'g' && r.tx === o.tx && r.ty === o.ty && !r.building) gr = r;
      if (!gr) return true;
      if (!canAfford(p, def)) { uiAlert(g, u.o, p.minerals < def.min ? 'minerals' : 'gas'); return true; }
      pay(p, def);
      const b = placeBuilding(g, u.o, o.u, o.tx, o.ty);
      b.geyser = gr.id; gr.building = b.id;
      if (p.race === 'Z') { kill(g, u, -1); g.stats[u.o].lost--; return true; }
      if (p.race === 'T') { u.orders[0] = { op: 'construct', b: b.id }; u.building = b.id; b.builder = u.id; return false; }
      return true;
    }
    if (!canPlace(g, u.o, o.u, o.tx, o.ty)) { uiAlert(g, u.o, 'place'); return true; }
    if (!canAfford(p, def)) { uiAlert(g, u.o, p.minerals < def.min ? 'minerals' : 'gas'); return true; }
    pay(p, def);
    const b = placeBuilding(g, u.o, o.u, o.tx, o.ty);
    sfx(g, 'buildStart', b);
    if (p.race === 'Z') { kill(g, u, -1); g.stats[u.o].lost--; return true; }   // 드론 소모
    if (p.race === 'T') { u.orders[0] = { op: 'construct', b: b.id }; u.building = b.id; b.builder = u.id; return false; }
    return true;
  }

  // 테란 SCV가 완공까지 붙어서 건설
  function stepConstruct(g, u, o) {
    const b = byId(g, o.b);
    if (!b || b.dead || b.complete) { u.building = null; return true; }
    const bDef = defOf(b.tid);
    const near = (Math.max(bDef.tiles[0], bDef.tiles[1]) / 2 + 1.4) * T;
    if (distPx(u.x, u.y, b.x, b.y) > near) { moveStep(g, u, b.x, b.y, near - 8); return false; }
    u.building = b.id;
    if (b.builder == null || !byId(g, b.builder) || byId(g, b.builder).dead) b.builder = u.id;
    return false;
  }

  // ---- 건물 틱 --------------------------------------------------------------
  function stepBuilding(g, b) {
    const def = defOf(b.tid);
    const p = g.players[b.o];
    const S = D().SPELL;

    // 건설 진행
    if (!b.complete) {
      let progress = false;
      if (p.race === 'T' && !def.addonOf) {
        const builder = b.builder ? byId(g, b.builder) : null;
        if (builder && !builder.dead && builder.building === b.id &&
          distPx(builder.x, builder.y, b.x, b.y) < (Math.max(def.tiles[0], def.tiles[1]) / 2 + 1.6) * T) progress = true;
        else { b.builder = null; if (builder && builder.building === b.id) builder.building = null; }
      } else progress = true;
      if (progress) {
        b.prog++;
        b.hp = Math.min(b.maxHp, b.hp + Math.max(1, Math.round(b.maxHp * 0.9 / b.total)));
        if (b.prog >= b.total) {
          b.complete = true; b.hp = Math.min(b.maxHp, b.hp);
          if (p.race === 'T' && b.builder) { const bu = byId(g, b.builder); if (bu) { bu.building = null; bu.orders = []; } b.builder = null; }
          if (b.parent) { const par = byId(g, b.parent); if (par) { par.addon = b.id; par.addonDef = def; par.addonPending = null; } }
          if ((def.flags || []).includes('creepSource')) g.creepDirty = true;
          if ((def.flags || []).includes('larvaSpawner')) spawnLarva(g, b);   // 신규 해처리는 라바 1
          recomputeSupply(g, p);
          g.alerts.push({ p: b.o, kind: 'built', t: g.tick, x: b.x, y: b.y });
          sfx(g, 'built', b);
          if (def.flags && def.flags.includes('hall') && !b.rally) {
            const near = nearestRes(g, b.x, b.y, 'm');
            if (near) b.rally = { t: near.id };
          }
        }
      }
      return;
    }

    // 테란 건물 화재 (20/256 HP per tick)
    if (def.race === 'T' && b.hp < b.maxHp / D().BURN_THRESHOLD) {
      b.hp -= 20;
      if ((g.tick & 7) === 0) fx(g, 'burn', b.x + (rngInt(g, 48) - 24) * ONE, b.y + (rngInt(g, 32) - 16) * ONE, 20);
      if (b.hp <= 0) { kill(g, b, -1); return; }
    }

    // 크립 확장
    if ((def.flags || []).includes('creepSource') && (g.tick & 63) === 0) {
      const max = (b.tid === 'hatchery' || b.tid === 'lair' || b.tid === 'hive') ? 8 : 5;
      if ((b.creepR | 0) < max) { b.creepR = (b.creepR | 0) + 1; g.creepDirty = true; }
    }

    // 라바 생성
    if ((def.flags || []).includes('larvaSpawner')) {
      b.larvaT++;
      if (b.larvaT >= 342) {
        b.larvaT = 0;
        if (countLarvae(g, b) < 3) spawnLarva(g, b);
      }
    }

    // 실드 배터리: 주변 아군 실드 충전
    if ((def.flags || []).includes('battery') && b.en > 0) {
      for (const v of g.units) {
        if (v.dead || v.o !== b.o || v.kind !== 'unit' || v.sh >= v.maxSh || v.maxSh === 0) continue;
        if (distPx(b.x, b.y, v.x, v.y) < 4 * T) {
          const amt = Math.min(640, (v.maxSh - v.sh + 1) >> 1, b.en);   // 1에너지 = 2실드
          v.sh = Math.min(v.maxSh, v.sh + amt * 2); b.en -= amt;
          if (b.en <= 0) break;
        }
      }
    }

    // 방어 건물 공격
    if ((def.g || def.a) && !(def.needPower && !b.powered)) {
      if (b.cd <= 0 && (g.tick + b.id) % 3 === 0) {
        const w = def.g || def.a;
        const tgt = acquireTarget(g, b, getRange(g, b, w));
        if (tgt) tryAttack(g, b, tgt);
      }
    }

    // 벙커 내부 사격
    if (b.tid === 'bunker' && b.cargo.length && (g.tick + b.id) % 2 === 0) {
      for (const cid of b.cargo) {
        const cu = byId(g, cid);
        if (!cu || cu.cd > 0) continue;
        const w = defOf(cu.tid).g;
        if (!w) continue;
        const tgt = acquireTarget(g, b, (w.r + 1) * T + T);
        if (tgt) {
          cu.x = b.x; cu.y = b.y;
          tryAttack(g, cu, tgt);
        }
      }
    }

    // 파워 체크 (프로토스)
    if (def.needPower && (g.tick + b.id) % 24 === 0)
      b.powered = isPowered(g, b.o, b.tileX, b.tileY, def.tiles[0], def.tiles[1]);
    else if (!def.needPower) b.powered = true;

    // 변태 (해처리→레어 등)
    if (b.morph) {
      b.morph.t++;
      if (b.morph.t >= b.morph.total) {
        const to = b.morph.u;
        b.morph = null;
        b.tid = to;
        const nd = defOf(to);
        b.maxHp = nd.hp << FP; b.hp = Math.min(b.hp + (nd.hp << FP) / 2 | 0, b.maxHp);
        if (nd.me) b.en = b.en || (D().ENERGY_START << FP);
        if ((nd.flags || []).includes('larvaSpawner') && countLarvae(g, b) < 3) spawnLarva(g, b);
        recomputeSupply(g, p);
        g.alerts.push({ p: b.o, kind: 'built', t: g.tick, x: b.x, y: b.y });
      }
      return;
    }

    // 생산/연구 큐
    if (b.queue && b.queue.length && (!def.needPower || b.powered)) {
      const q = b.queue[0];
      q.t++;
      if (q.t >= q.total) {
        b.queue.shift();
        if (q.isR) {
          p.research[q.r] = (p.research[q.r] || 0) + 1;
          g.alerts.push({ p: b.o, kind: 'research', t: g.tick, r: q.r });
          sfx(g, 'research', b);
          if (q.r === 'spider_mines') for (const v of g.units) if (!v.dead && v.o === b.o && v.tid === 'vulture') v.mines = 3;
        } else if (q.u === 'nuke') {
          const silo = b.tid === 'nuclear_silo' ? b : (b.addon ? byId(g, b.addon) : null);
          if (silo && silo.tid === 'nuclear_silo') silo.hasNuke = true;
          else b.hasNuke = true;
        } else {
          const spawnAt = findSpawnSpot(g, b);
          const nu = spawnUnit(g, b.o, q.u, spawnAt.x, spawnAt.y);
          g.stats[b.o].produced++;
          recomputeSupply(g, p);
          applyRally(g, b, nu);
          sfx(g, 'ready', nu);
        }
      }
    }
  }

  function findSpawnSpot(g, b) {
    const def = defOf(b.tid);
    const bx = b.tileX, by = b.tileY + def.tiles[1];
    for (let r = 0; r < 6; r++) {
      for (let x = bx - r; x <= bx + def.tiles[0] + r; x++) {
        const y = by + r;
        if (x >= 0 && y >= 0 && x < g.map.w && y < g.map.h && g.map.walk[y * g.map.w + x] && !g.occ[y * g.map.w + x])
          return { x: (x * T + 16) * ONE, y: (y * T + 16) * ONE };
      }
    }
    return { x: b.x, y: b.y + (def.tiles[1] * T / 2 + 20) * ONE };
  }

  function applyRally(g, b, nu) {
    if (!b.rally) return;
    if (b.rally.t) {
      const r = resById(g, b.rally.t);
      if (r && isWorker(nu)) { nu.orders = [{ op: 'gather', t: r.id }]; return; }
      if (r) { nu.orders = [{ op: 'move', x: r.x, y: r.y }]; return; }
      const tu = byId(g, b.rally.t);
      if (tu) nu.orders = [{ op: 'follow', t: tu.id }];
    } else nu.orders = [{ op: 'move', x: b.rally.x, y: b.rally.y }];
  }

  // ---- 변태 (라바/에그/유닛) --------------------------------------------------
  function stepMorph(g, u) {
    if (!u.morph) return;
    u.morph.t++;
    if (u.morph.t < u.morph.total) return;
    const def = u.morph.uDef;
    const p = g.players[u.o];
    const n = def.pair || 1;
    u.dead = true; g.stats[u.o].lost--;  // 에그/원본 소멸 (통계 제외)
    g.stats[u.o].lost++;                  // 상쇄
    for (let i = 0; i < n; i++) {
      const nu = spawnUnit(g, u.o, def.id, u.x + (i * 22 - 11 * (n - 1)) * ONE, u.y);
      g.stats[u.o].produced++;
      // 해처리 랠리 적용
      if (u.hatch) { const h = byId(g, u.hatch); if (h) applyRally(g, h, nu); }
    }
    recomputeSupply(g, p);
    sfx(g, 'ready', u);
  }

  // ---- 특수 유닛 -----------------------------------------------------------
  function stepScarab(g, u) {
    const tgt = byId(g, u.scTgt);
    if (!tgt || tgt.dead || --u.scT <= 0) { kill(g, u, -1); g.stats[u.o].lost--; return; }
    u.x += Math.round((tgt.x - u.x) / Math.max(1, distPx(u.x, u.y, tgt.x, tgt.y)) * 16);
    u.y += Math.round((tgt.y - u.y) / Math.max(1, distPx(u.x, u.y, tgt.x, tgt.y)) * 16);
    if (distPx(u.x, u.y, tgt.x, tgt.y) < tgt.r + 8) {
      splashAt(g, u, tgt.x, tgt.y, u.scDmg, 'n', 60, true);
      fx(g, 'scarabHit', tgt.x, tgt.y, 16); sfx(g, 'expl', tgt);
      u.dead = true; g.stats[u.o].lost--;
    }
  }

  function stepMine(g, u) {
    if (u.arming > 0) { u.arming--; if (u.arming === 0) u.st.burrow = true; return; }
    if (!u.st.burrow && !u.mTgt) { u.st.burrow = true; return; }
    if (!u.mTgt) {
      // 지상 비호버 적 탐색
      for (const v of g.units) {
        if (v.dead || v.fly || v.kind !== 'unit' || g.players[v.o].team === g.players[u.o].team || v.hidden) continue;
        if (['vulture', 'probe', 'drone', 'archon', 'dark_archon'].includes(v.tid)) continue;
        if (distPx(u.x, u.y, v.x, v.y) < D().SPELL.MINE_SIGHT * T) { u.mTgt = v.id; u.st.burrow = false; break; }
      }
      return;
    }
    const tgt = byId(g, u.mTgt);
    if (!tgt || tgt.dead || distPx(u.x, u.y, tgt.x, tgt.y) > 6 * T) { u.mTgt = null; u.st.burrow = true; return; }
    const d = Math.max(1, distPx(u.x, u.y, tgt.x, tgt.y));
    u.x += Math.round((tgt.x - u.x) / d * 16); u.y += Math.round((tgt.y - u.y) / d * 16);
    if (d < tgt.r + 10) {
      splashAt(g, u, u.x, u.y, 125, 'e', 60, true);
      fx(g, 'expl', u.x, u.y, 20); sfx(g, 'expl', u);
      u.dead = true; g.stats[u.o].lost--;
    }
  }

  function stepCarrierAmmo(g, u) {
    const p = g.players[u.o];
    const max = defOf('carrier').interceptorMax + (p.research.carrier_capacity ? 4 : 0);
    u.inters = u.inters.filter(id => { const v = byId(g, id); return v && !v.dead; });
    if (u.inters.length + (u.ammoT != null ? 1 : 0) < max) {
      if (u.ammoT == null) {
        if (p.minerals >= 25) { p.minerals -= 25; u.ammoT = defOf('interceptor').bt * D().TICKS; }
      }
    }
    if (u.ammoT != null && --u.ammoT <= 0) {
      const iu = spawnUnit(g, u.o, 'interceptor', u.x, u.y);
      iu.carrier = u.id; iu.hidden = true;
      u.inters.push(iu.id);
      u.ammoT = null;
    }
    // 공격 명령 처리: 요격기 출격
    const o = u.orders[0];
    let tgt = null;
    if (o && o.op === 'attack') tgt = byId(g, o.t);
    else if (!o && (g.tick + u.id) % 12 === 0) tgt = acquireTarget(g, u, 8 * T);
    if (tgt && !tgt.dead && distPx(u.x, u.y, tgt.x, tgt.y) < 12 * T) {
      for (const iid of u.inters) {
        const iu = byId(g, iid);
        if (iu && iu.hidden) { iu.hidden = false; iu.iTgt = tgt.id; iu.x = u.x; iu.y = u.y; }
        else if (iu && !iu.hidden) iu.iTgt = tgt.id;
      }
    }
  }

  function stepInterceptor(g, u) {
    const car = byId(g, u.carrier);
    if (!car || car.dead) { kill(g, u, -1); return; }
    if (u.hidden) { u.x = car.x; u.y = car.y; return; }
    const tgt = u.iTgt ? byId(g, u.iTgt) : null;
    if (!tgt || tgt.dead || distPx(car.x, car.y, tgt.x, tgt.y) > 14 * T) {
      // 귀환
      if (distPx(u.x, u.y, car.x, car.y) < 24) { u.hidden = true; u.iTgt = null; }
      else moveStep(g, u, car.x, car.y, 20);
      return;
    }
    const d = distPx(u.x, u.y, tgt.x, tgt.y);
    if (d > T * 1.2) moveStep(g, u, tgt.x, tgt.y, T);
    else if (u.cd <= 0) {
      tryAttack(g, u, tgt);
      // 지나쳐 날기
      u.x += Math.round((u.x - tgt.x) / Math.max(1, d) * 40);
      u.y += Math.round((u.y - tgt.y) / Math.max(1, d) * 40);
    }
  }

  function stepReaverAmmo(g, u) {
    const p = g.players[u.o];
    const max = defOf('reaver').scarabMax + (p.research.reaver_capacity ? 5 : 0);
    if (u.scarabs + (u.ammoT != null ? 1 : 0) < max) {
      if (u.ammoT == null && p.minerals >= defOf('reaver').scarabCost) {
        p.minerals -= defOf('reaver').scarabCost;
        u.ammoT = 105;                                   // 갑충탄 제작 105프레임
      }
    }
    if (u.ammoT != null && --u.ammoT <= 0) { u.scarabs++; u.ammoT = null; }
  }

  // ---- 지역 효과 -----------------------------------------------------------
  function stepZones(g) {
    const S = D().SPELL;
    // 사이오닉 스톰
    if (g.storms) {
      for (const s of g.storms) {
        if (g.tick > s.end) continue;
        for (const v of g.units) {
          if (v.dead || v.st.stasis || v.hidden || v.kind === 'building') continue;   // 스톰은 건물 미피해
          if (v.lastStormT === g.tick) continue;                                       // 중첩 스톰 비스택
          if (distPx(v.x, v.y, s.x, s.y) * ONE <= s.r + v.r * ONE) {
            v.lastStormT = g.tick;
            let dmg = s.dot;                       // 방어 무시, 실드 우선
            if (v.sh > 0) { const sd = Math.min(v.sh, dmg); v.sh -= sd; dmg -= sd; }
            v.hp -= dmg;
            if (v.hp <= 0) kill(g, v, -1);
          }
        }
      }
      g.storms = g.storms.filter(s => g.tick <= s.end);
    }
    g.swarms = g.swarms.filter(s => g.tick <= s.t);
    g.dwebs = g.dwebs.filter(s => g.tick <= s.t);
    g.scans = g.scans.filter(s => g.tick <= s.t);
    // 핵
    for (const n of g.nukes) {
      if (g.tick < n.t) {
        const gh = byId(g, n.ghost);
        if (!gh || gh.dead || !gh.orders.length || gh.orders[0].op !== 'nukePaint') { n.abort = true; }
        continue;
      }
      if (n.abort) continue;
      // 착탄
      for (const v of g.units) {
        if (v.dead) continue;
        const d = distPx(v.x, v.y, n.x, n.y);
        let f = 0;
        if (d < S.NUKE_R * T * 0.5) f = 1; else if (d < S.NUKE_R * T) f = 0.5; else if (d < S.NUKE_R * T * 1.4) f = 0.25;
        if (f > 0) {
          const dmg = Math.max(S.NUKE_DMG, Math.round(((v.maxHp + v.maxSh) >> FP) * S.NUKE_PCT));
          damage(g, v, Math.round(dmg * f), 'e', null, true);
        }
      }
      fx(g, 'nukeBoom', n.x, n.y, 40); sfx(g, 'nuke', { x: n.x, y: n.y, o: n.o });
      n.done = true;
    }
    g.nukes = g.nukes.filter(n => !n.done && !n.abort);
  }

  // ---- 패배/승리 -----------------------------------------------------------
  function defeat(g, p) {
    if (p.defeated) return;
    p.defeated = true;
    for (const u of g.units) if (!u.dead && u.o === p.i) kill(g, u, -1);
    g.alerts.push({ p: -1, kind: 'eliminated', who: p.i, t: g.tick });
  }
  function checkVictory(g) {
    if (g.over || g.tick < 48) return;
    for (const p of g.players) {
      if (p.defeated) continue;
      let hasB = false;
      for (const u of g.units) if (!u.dead && u.o === p.i && u.kind === 'building') { hasB = true; break; }
      if (!hasB) defeat(g, p);
    }
    const teams = new Set();
    for (const p of g.players) if (!p.defeated) teams.add(p.team);
    if (teams.size <= 1) g.over = { winner: teams.size ? [...teams][0] : -1, tick: g.tick };
  }

  // ---- 메인 스텝 -----------------------------------------------------------
  function step(g, commands) {
    g.sfx.length = 0;
    if (commands) for (const c of commands) applyCommand(g, c);
    g.tick++;

    for (let i = 0; i < g.units.length; i++) {
      const u = g.units[i];
      if (!u.dead) stepUnit(g, u);
      if (!u.dead && u.st.warp != null) { if (--u.st.warp <= 0) delete u.st.warp; }
    }
    stepBullets(g);
    stepZones(g);
    separate(g);

    if ((g.tick & 3) === 0) recomputeVision(g);
    if (g.creepDirty && (g.tick & 15) === 0) { recomputeCreep(g); g.creepDirty = false; }
    if ((g.tick & 31) === 0) for (const p of g.players) recomputeSupply(g, p);

    // 시체 정리
    if ((g.tick & 15) === 0) g.units = g.units.filter(u => !u.dead);
    if ((g.tick & 15) === 0 && g.res.some(r => r.gone)) g.res = g.res.filter(r => !r.gone);
    g.fx = g.fx.filter(f => g.tick - f.t0 <= f.life);
    if (g.alerts.length > 60) g.alerts.splice(0, g.alerts.length - 60);

    checkVictory(g);
  }

  function hash(g) {
    let h = 0 | 0;
    for (const u of g.units) {
      if (u.dead) continue;
      h = (Math.imul(h, 31) + u.id) | 0;
      h = (h + u.x + Math.imul(u.y, 7) + u.hp) | 0;
    }
    for (const p of g.players) h = (h + p.minerals + Math.imul(p.gas, 3)) | 0;
    return h;
  }

  SC.Engine = { createGame, step, applyCommand, byId, resById, canPlace, hash,
    getSpeed, getRange, getSight, getArmor, weaponDmg, isWorker, meetsReq, hasBuilding,
    isVisibleTo, maxEnergy, defOf, nearestRes, isPowered };
})();
