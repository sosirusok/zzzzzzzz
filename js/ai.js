/* =========================================================================
 *  ai.js — 컴퓨터 플레이어 (경제/테크/생산/공격 웨이브)
 *  AI는 호스트에서만 실행되어 일반 명령으로 발행 → 락스텝 결정성 유지
 * ========================================================================= */
'use strict';
(function () {
  const T = 32, ONE = 256;

  const COMP = {
    T: [['marine', 55], ['medic', 12], ['firebat', 6], ['siege_tank', 17], ['goliath', 10]],
    Z: [['zergling', 40], ['hydralisk', 40], ['mutalisk', 12], ['lurker', 8]],
    P: [['zealot', 45], ['dragoon', 40], ['high_templar', 8], ['dark_templar', 7]],
  };
  const BUILD_SEQ = {
    T: ['supply_depot', 'barracks', 'refinery', 'barracks', 'academy', 'engineering_bay', 'factory', 'machine_shop', 'factory', 'starport', 'armory', 'missile_turret'],
    Z: ['spawning_pool', 'extractor', 'hydralisk_den', 'evolution_chamber', 'lair', 'spire', 'queens_nest', 'sunken_hint'],
    P: ['pylon', 'gateway', 'assimilator', 'gateway', 'cybernetics_core', 'forge', 'citadel_of_adun', 'templar_archives', 'photon_cannon', 'stargate'],
  };
  const RESEARCH_PRI = {
    T: ['stim_pack', 'siege_tech', 'u238', 't_inf_w', 't_inf_a', 'spider_mines', 't_veh_w'],
    Z: ['metabolic_boost', 'muscular_augments', 'grooved_spines', 'lurker_aspect', 'z_missile', 'z_melee', 'z_cara', 'burrow_tech'],
    P: ['singularity_charge', 'leg_enhancements', 'psionic_storm_tech', 'p_ground_w', 'p_ground_a', 'p_shields'],
  };
  const DIFF = { easy: { attackSup: 60, interval: 20, workers: 14, waveT: 24 * 300 },
    normal: { attackSup: 44, interval: 10, workers: 20, waveT: 24 * 210 },
    hard: { attackSup: 36, interval: 6, workers: 24, waveT: 24 * 150 } };

  function create(pi, difficulty) {
    return { pi, d: DIFF[difficulty] || DIFF.normal, seq: 0, lastWave: 0, attackPt: null, rally: null, expanded: false, t: 0 };
  }

  function myUnits(g, pi, pred) {
    const out = [];
    for (const u of g.units) if (!u.dead && u.o === pi && (!pred || pred(u))) out.push(u);
    return out;
  }
  function count(g, pi, tid, includeQueue) {
    let n = 0;
    for (const u of g.units) {
      if (u.dead || u.o !== pi) continue;
      if (u.tid === tid) n++;
      if (includeQueue && u.queue) for (const q of u.queue) if (q.u === tid) n++;
      if (includeQueue && u.morph && u.morph.u === tid) n++;
    }
    return n;
  }
  // 일꾼이 이미 해당 건물 건설 주문을 들고 있는지
  function hasBuildOrder(g, pi, tid) {
    for (const u of g.units) {
      if (u.dead || u.o !== pi || !u.orders.length) continue;
      const o = u.orders[0];
      if (o.op === 'build' && (!tid || o.u === tid)) return true;
      if (o.op === 'construct') return true;
    }
    return false;
  }

  function tick(g, ai, issue) {
    const p = g.players[ai.pi];
    if (p.defeated) return;
    ai.t++;
    if (ai.t % ai.d.interval !== 0) return;
    const D = SC.DATA;
    const race = p.race;
    const halls = myUnits(g, ai.pi, u => u.kind === 'building' && (D.all[u.tid].flags || []).includes('hall') && u.complete);
    if (!halls.length) return;
    const hall = halls[0];

    // ---- 일꾼 관리 ----
    const workers = myUnits(g, ai.pi, u => SC.Engine.isWorker(u));
    // 유휴 일꾼 → 채취
    for (const w of workers) {
      if (!w.orders.length && !w.carry) {
        const r = SC.Engine.nearestRes(g, w.x, w.y, 'm');
        if (r) issue({ p: ai.pi, k: 'gat', ids: [w.id], t: r.id });
      }
    }
    // 가스 배정
    const gasB = myUnits(g, ai.pi, u => u.kind === 'building' && (D.all[u.tid].flags || []).includes('gas') && u.complete);
    for (const gb of gasB) {
      const miners = workers.filter(w => w.orders.length && w.orders[0].op === 'gather' && w.orders[0].t === gb.geyser);
      if (miners.length < 3 && workers.length > 8) {
        const free = workers.filter(w => !w.orders.length || (w.orders[0].op === 'gather' && w.orders[0].t !== gb.geyser));
        const r = SC.Engine.resById(g, gb.geyser);
        if (free.length && r) issue({ p: ai.pi, k: 'gat', ids: [free[0].id], t: r.id });
      }
    }
    // 일꾼 생산
    if (workers.length < ai.d.workers * halls.length && p.minerals >= 50) {
      if (race === 'Z') trainLarva(g, ai, issue, D.RACES.Z.worker);
      else for (const h of halls) if (h.queue.length < 2) { issue({ p: ai.pi, k: 'trn', t: h.id, u: D.RACES[race].worker }); break; }
    }

    // ---- 방치된 테란 건설 재개 ----
    if (race === 'T') {
      for (const b of myUnits(g, ai.pi, u => u.kind === 'building' && !u.complete)) {
        const builder = b.builder != null ? g.units.find(x => x.id === b.builder && !x.dead) : null;
        if (!builder || builder.orders.length === 0 || builder.orders[0].op !== 'construct') {
          const w = workers.find(x => !x.carry && !x.building && (!x.orders.length || x.orders[0].op === 'gather'));
          if (w) issue({ p: ai.pi, k: 'con', ids: [w.id], t: b.id });
          break;
        }
      }
    }

    // ---- 보급 ----
    const supNeed = p.supUsed + 8 >= p.supMax && p.supMax < D.SUPPLY_CAP;
    if (supNeed) {
      if (race === 'Z') { if (p.minerals >= 100 && count(g, ai.pi, 'overlord', true) * 16 + 20 < p.supUsed + 24) trainLarva(g, ai, issue, 'overlord'); }
      else {
        const sb = race === 'T' ? 'supply_depot' : 'pylon';
        if (!myUnits(g, ai.pi, u => u.tid === sb && !u.complete).length && p.minerals >= 100 &&
          !hasBuildOrder(g, ai.pi, sb))
          buildNear(g, ai, issue, sb, hall);
      }
    }

    // ---- 건물 시퀀스 ----
    const seq = BUILD_SEQ[race];
    if (ai.seq < seq.length) {
      const next = seq[ai.seq];
      if (next === 'sunken_hint') { ai.seq++; }
      else if (next === 'lair') {
        if (SC.Engine.hasBuilding(g, p, 'lair') || SC.Engine.hasBuilding(g, p, 'hive')) ai.seq++;
        else if (p.minerals >= 150 && p.gas >= 100 && SC.Engine.hasBuilding(g, p, 'spawning_pool')) {
          const h2 = halls.find(h => h.tid === 'hatchery' && !h.morph);
          if (h2) { issue({ p: ai.pi, k: 'morB', t: h2.id, u: 'lair' }); ai.seq++; }
        }
      } else {
        const def = D.all[next];
        const multi = ['barracks', 'factory', 'gateway', 'pylon'].includes(next);
        if (def && count(g, ai.pi, next, true) > 0) ai.seq++;   // 배치 확인 후 진행
        else if (def && SC.Engine.meetsReq(g, p, def) && p.minerals >= def.min + 50 && p.gas >= def.gas &&
          g.tick - (ai.lastBuildT || -999) > 240 && !hasBuildOrder(g, ai.pi, null)) {
          ai.lastBuildT = g.tick;
          if (def.addonOf) {
            const par = myUnits(g, ai.pi, u => u.tid === def.addonOf && u.complete && !u.addon && !u.addonPending)[0];
            if (par) { issue({ p: ai.pi, k: 'add', t: par.id, u: next }); }
          } else {
            buildNear(g, ai, issue, next, hall);
            if (multi) ai.seq++;                                 // 복수 건물은 즉시 다음으로
          }
        }
      }
    }

    // ---- 연구 ----
    if (p.minerals > 250 && p.gas > 150) {
      for (const rid of RESEARCH_PRI[race]) {
        const r = D.research[rid];
        const cur = p.research[rid] || 0;
        if (cur >= r.lv) continue;
        const src = myUnits(g, ai.pi, u => u.kind === 'building' && u.complete && !u.queue.length &&
          ((D.all[u.tid].researches || []).includes(rid) || (u.addonDef && (u.addonDef.researches || []).includes(rid)) ||
           (rid === 'burrow_tech' && (D.all[u.tid].flags || []).includes('larvaSpawner'))))[0];
        if (src) { issue({ p: ai.pi, k: 'rsr', t: src.id, r: rid }); break; }
      }
    }

    // ---- 병력 생산 ----
    if (p.minerals >= 100) {
      const comp = COMP[race];
      let roll = (Math.imul(g.tick + ai.pi * 7919, 2654435761) >>> 16) % 100, pick = null, acc = 0;
      for (const [uid, w] of comp) { acc += w; if (roll < acc) { pick = uid; break; } }
      if (pick) {
        const def = D.all[pick];
        if (SC.Engine.meetsReq(g, p, def) && p.minerals >= def.min && p.gas >= def.gas) {
          if (def.morphFrom) {
            const src = myUnits(g, ai.pi, u => u.tid === def.morphFrom && !u.morph && !u.st.burrow)[0];
            if (src) issue({ p: ai.pi, k: 'mor', ids: [src.id], u: pick });
          } else if (race === 'Z') trainLarva(g, ai, issue, pick);
          else {
            const b = myUnits(g, ai.pi, u => u.kind === 'building' && u.complete && u.queue.length < 2 &&
              (D.all[u.tid].trains || []).includes(pick))[0];
            if (b) issue({ p: ai.pi, k: 'trn', t: b.id, u: pick });
          }
        }
      }
    }

    // ---- 확장 ----
    if (!ai.expanded && g.tick > 24 * 420 && p.minerals > 500) {
      const spot = freeExpansion(g, hall);
      if (spot) {
        const w = workers.find(u => !u.carry);
        if (w) {
          issue({ p: ai.pi, k: 'bld', ids: [w.id], u: D.RACES[race].hall, tx: spot.tx, ty: spot.ty - 1 });
          ai.expanded = true;
        }
      }
    }

    // ---- 전차 자동 시즈 ----
    if (race === 'T' && p.research.siege_tech) {
      for (const t2 of myUnits(g, ai.pi, u => u.tid === 'siege_tank')) {
        const near = enemyNear(g, ai.pi, t2.x, t2.y, 10 * T);
        if (near && !t2.st.sieged) issue({ p: ai.pi, k: 'abl', ids: [t2.id], a: 'siege' });
        else if (!near && t2.st.sieged && !enemyNear(g, ai.pi, t2.x, t2.y, 14 * T)) issue({ p: ai.pi, k: 'abl', ids: [t2.id], a: 'unsiege' });
      }
    }

    // ---- 방어 ----
    for (const a of g.alerts) {
      if (a.p === ai.pi && a.kind === 'attack' && g.tick - a.t < 48 && !a.aiSeen) {
        a.aiSeen = true;
        const army = armyUnits(g, ai.pi);
        if (army.length >= 4) issue({ p: ai.pi, k: 'atk', ids: army.slice(0, 12).map(u => u.id), x: a.x, y: a.y });
      }
    }

    // ---- 공격 웨이브 ----
    const army = armyUnits(g, ai.pi);
    const armySup = army.reduce((s, u) => s + (D.all[u.tid].sup || 0), 0);
    if (armySup >= ai.d.attackSup && g.tick - ai.lastWave > ai.d.waveT) {
      ai.lastWave = g.tick;
      const tgt = enemyBase(g, ai.pi);
      if (tgt) {
        for (let i = 0; i < army.length; i += 12)
          issue({ p: ai.pi, k: 'atk', ids: army.slice(i, i + 12).map(u => u.id), x: tgt.x, y: tgt.y });
      }
    }
  }

  function trainLarva(g, ai, issue, uid) {
    for (const u of g.units) {
      if (!u.dead && u.o === ai.pi && u.tid === 'larva') {
        issue({ p: ai.pi, k: 'mor', ids: [u.id], u: uid });
        return true;
      }
    }
    return false;
  }

  function armyUnits(g, pi) {
    const D = SC.DATA;
    return myUnits(g, pi, u => u.kind === 'unit' && !SC.Engine.isWorker(u) &&
      !['larva', 'egg', 'overlord', 'interceptor', 'scarab_proj', 'spider_mine', 'broodling'].includes(u.tid) &&
      (D.all[u.tid].g || D.all[u.tid].a || ['medic', 'high_templar', 'defiler', 'queen', 'science_vessel'].includes(u.tid)) &&
      !u.morph);
  }

  function enemyNear(g, pi, x, y, r) {
    const team = g.players[pi].team;
    for (const u of g.units) {
      if (u.dead || u.hidden || g.players[u.o].team === team) continue;
      const dx = (u.x - x) / ONE, dy = (u.y - y) / ONE;
      if (dx * dx + dy * dy < r * r) return u;
    }
    return null;
  }

  function enemyBase(g, pi) {
    const team = g.players[pi].team;
    // 보이는 적 건물 우선, 없으면 적 스타팅
    for (const u of g.units) {
      if (u.dead || g.players[u.o].team === team || u.kind !== 'building') continue;
      return { x: u.x, y: u.y };
    }
    for (const p2 of g.players) {
      if (p2.team === team || p2.defeated) continue;
      return { x: Math.round(p2.startX * ONE), y: Math.round(p2.startY * ONE) };
    }
    return null;
  }

  function freeExpansion(g, hall) {
    let best = null, bd = Infinity;
    for (const s of g.map.starts) {
      // 점유 확인
      let taken = false;
      for (const u of g.units) {
        if (u.dead || u.kind !== 'building') continue;
        const dx = u.x / ONE / T - s.tx, dy = u.y / ONE / T - s.ty;
        if (dx * dx + dy * dy < 225) { taken = true; break; }
      }
      if (taken) continue;
      const dx = hall.x / ONE / T - s.tx, dy = hall.y / ONE / T - s.ty;
      const d = dx * dx + dy * dy;
      if (d > 1 && d < bd) { bd = d; best = s; }
    }
    return best;
  }

  function buildNear(g, ai, issue, tid, hall) {
    const p = g.players[ai.pi];
    const def = SC.DATA.all[tid];
    if ((def.flags || []).includes('gas')) {
      for (const r of g.res) {
        if (r.kind !== 'g' || r.building) continue;
        const dx = (r.x - hall.x) / ONE, dy = (r.y - hall.y) / ONE;
        if (dx * dx + dy * dy < (14 * T) * (14 * T)) {
          const w = myUnits(g, ai.pi, u => SC.Engine.isWorker(u) && !u.carry)[0];
          if (w) issue({ p: ai.pi, k: 'bld', ids: [w.id], u: tid, tx: r.tx, ty: r.ty });
          return;
        }
      }
      return;
    }
    const hx = hall.tileX, hy = hall.tileY;
    const seed = (g.tick + ai.t) % 8;
    for (let r = 3; r < 14; r++) {
      for (let i = 0; i < 16; i++) {
        const an = ((i + seed) % 16) / 16 * Math.PI * 2;
        const tx = Math.round(hx + Math.cos(an) * r), ty = Math.round(hy + Math.sin(an) * r);
        if (SC.Engine.canPlace(g, ai.pi, tid, tx, ty)) {
          const w = myUnits(g, ai.pi, u => SC.Engine.isWorker(u) && !u.carry && !u.building)[0];
          if (w) issue({ p: ai.pi, k: 'bld', ids: [w.id], u: tid, tx, ty });
          return;
        }
      }
    }
  }

  SC.AI = { create, tick };
})();
