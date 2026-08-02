/* =========================================================================
 *  ai.js — 컴퓨터 플레이어 (경제/테크/생산/방어/공격 웨이브/스펠)
 *  AI는 호스트에서만 실행되어 일반 명령으로 발행 → 락스텝 결정성 유지
 * ========================================================================= */
'use strict';
(function () {
  const T = 32, ONE = 256;

  const COMP = {
    T: [['marine', 40], ['medic', 10], ['firebat', 5], ['vulture', 10], ['siege_tank', 17], ['goliath', 10], ['wraith', 8]],
    Z: [['zergling', 34], ['hydralisk', 34], ['mutalisk', 14], ['lurker', 10], ['scourge', 8]],
    P: [['zealot', 38], ['dragoon', 34], ['high_templar', 10], ['dark_templar', 8], ['corsair', 5], ['scout', 5]],
  };
  // 시퀀스: 같은 건물이 여러 번 나오면 그 수만큼 짓는다
  const BUILD_SEQ = {
    T: ['supply_depot', 'barracks', 'refinery', 'barracks', 'academy', 'engineering_bay', 'factory', 'machine_shop', 'factory', 'starport', 'control_tower', 'armory'],
    Z: ['spawning_pool', 'extractor', 'hydralisk_den', 'evolution_chamber', 'lair', 'spire', 'queens_nest', 'hive'],
    P: ['pylon', 'gateway', 'assimilator', 'gateway', 'cybernetics_core', 'forge', 'citadel_of_adun', 'templar_archives', 'stargate', 'robotics_facility'],
  };
  const DEFENSE = { T: 'missile_turret', Z: 'creep_colony', P: 'photon_cannon' };
  const RESEARCH_PRI = {
    T: ['stim_pack', 'siege_tech', 'u238', 't_inf_w', 't_inf_a', 'spider_mines', 'ion_thrusters', 't_veh_w'],
    Z: ['metabolic_boost', 'muscular_augments', 'grooved_spines', 'lurker_aspect', 'z_missile', 'z_melee', 'z_cara', 'burrow_tech'],
    P: ['singularity_charge', 'leg_enhancements', 'psionic_storm_tech', 'p_ground_w', 'p_ground_a', 'p_shields'],
  };
  const DIFF = { easy: { attackSup: 60, interval: 20, workers: 14, waveT: 24 * 300 },
    normal: { attackSup: 44, interval: 10, workers: 20, waveT: 24 * 210 },
    hard: { attackSup: 36, interval: 6, workers: 24, waveT: 24 * 150 } };

  function create(pi, difficulty) {
    return { pi, d: DIFF[difficulty] || DIFF.normal, seq: 0, lastWave: 0, lastExpandT: 0, lastBuildT: -999,
      lastDefT: -999, t: 0 };
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
      if (!tid && o.op === 'construct') return true;
    }
    return false;
  }
  const isGasAssigned = (g, w) => w.orders.some(o => o.op === 'gather' &&
    g.res.some(r => r.id === o.t && r.kind === 'g'));

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
    for (const w of workers) {
      if (!w.orders.length && !w.carry) {
        const r = SC.Engine.nearestRes(g, w.x, w.y, 'm');
        if (r) issue({ p: ai.pi, k: 'gat', ids: [w.id], t: r.id });
      }
    }
    // 가스 배정: 주문 스택 전체로 판정 (복귀 중 포함), 간헐천당 정확히 3기
    const gasB = myUnits(g, ai.pi, u => u.kind === 'building' && (D.all[u.tid].flags || []).includes('gas') && u.complete);
    for (const gb of gasB) {
      const miners = workers.filter(w => w.orders.some(o => o.op === 'gather' && o.t === gb.geyser));
      if (miners.length < 3 && workers.length > 8) {
        const free = workers.filter(w => !isGasAssigned(g, w) && !w.building &&
          (!w.orders.length || w.orders.some(o => o.op === 'gather')));
        const r = SC.Engine.resById(g, gb.geyser);
        if (free.length && r) issue({ p: ai.pi, k: 'gat', ids: [free[0].id], t: r.id });
      }
    }
    // 일꾼 생산
    if (workers.length < ai.d.workers * halls.length && p.minerals >= 50) {
      if (race === 'Z') trainLarva(g, ai, issue, D.RACES.Z.worker);
      else for (const h of halls) if (h.queue.length < 2 && (D.all[h.tid].trains || []).length) { issue({ p: ai.pi, k: 'trn', t: h.id, u: D.RACES[race].worker }); break; }
    }

    // ---- 방치된 테란 건설 재개 ----
    if (race === 'T') {
      for (const b of myUnits(g, ai.pi, u => u.kind === 'building' && !u.complete && !SC.DATA.all[u.tid].addonOf)) {
        const builder = b.builder != null ? g.units.find(x => x.id === b.builder && !x.dead) : null;
        if (!builder || builder.orders.length === 0 || builder.orders[0].op !== 'construct') {
          const w = workers.find(x => !x.carry && !x.building && (!x.orders.length || x.orders[0].op === 'gather'));
          if (w) issue({ p: ai.pi, k: 'con', ids: [w.id], t: b.id });
          break;
        }
      }
    }

    // ---- 보급: 생산력에 비례한 여유분, 최대 2개 동시 ----
    const prodB = myUnits(g, ai.pi, u => u.kind === 'building' && u.complete &&
      ((D.all[u.tid].trains || []).length || (D.all[u.tid].flags || []).includes('larvaSpawner'))).length;
    const margin = 8 + prodB * 4;
    if (p.supUsed + margin >= p.supMax && p.supMax < D.SUPPLY_CAP) {
      if (race === 'Z') {
        const ovEggs = myUnits(g, ai.pi, u => u.morph && u.morph.u === 'overlord').length;
        const maxEggs = p.supMax >= 60 ? 2 : 1;
        if (ovEggs < maxEggs && p.minerals >= 100) trainLarva(g, ai, issue, 'overlord');
      } else {
        const sb = race === 'T' ? 'supply_depot' : 'pylon';
        const inFlight = myUnits(g, ai.pi, u => u.tid === sb && !u.complete).length + (hasBuildOrder(g, ai.pi, sb) ? 1 : 0);
        const maxFly = p.supMax >= 60 ? 2 : 1;
        if (inFlight < maxFly && p.minerals >= 100) buildNear(g, ai, issue, sb, hall);
      }
    }

    // ---- 건물 시퀀스 (누적 수량 기준 진행 + 실패 시 재시도) ----
    const seq = BUILD_SEQ[race];
    if (ai.seq < seq.length) {
      const next = seq[ai.seq];
      const needCount = seq.slice(0, ai.seq + 1).filter(x => x === next).length;
      if (next === 'lair' || next === 'hive') {
        const from = next === 'lair' ? 'hatchery' : 'lair';
        if (SC.Engine.hasBuilding(g, p, next) || (next === 'lair' && SC.Engine.hasBuilding(g, p, 'hive'))) ai.seq++;
        else {
          const def = D.all[next];
          const src = halls.find(h => h.tid === from && !h.morph);
          if (src && SC.Engine.meetsReq(g, p, def) && p.minerals >= def.min && p.gas >= def.gas)
            issue({ p: ai.pi, k: 'morB', t: src.id, u: next });
        }
      } else {
        const def = D.all[next];
        if (def && count(g, ai.pi, next, true) >= needCount) ai.seq++;
        else if (def && SC.Engine.meetsReq(g, p, def) && p.minerals >= def.min + 50 && p.gas >= def.gas &&
          g.tick - ai.lastBuildT > 240 && !hasBuildOrder(g, ai.pi, next)) {
          ai.lastBuildT = g.tick;
          if (def.addonOf) {
            const par = myUnits(g, ai.pi, u => u.tid === def.addonOf && u.complete && !u.addon && !u.addonPending)[0];
            if (par) issue({ p: ai.pi, k: 'add', t: par.id, u: next });
          } else buildNear(g, ai, issue, next, hall);
        }
      }
    }

    // ---- 방어 건물: 본진마다 2개 (저그는 크립 콜로니 → 성큰 변태) ----
    if (p.minerals > 300 && g.tick - ai.lastDefT > 480) {
      const dtid = DEFENSE[race];
      const def = D.all[dtid];
      const nearDef = h => myUnits(g, ai.pi, u => u.kind === 'building' &&
        (u.tid === dtid || u.tid === 'sunken_colony') &&
        Math.hypot((u.x - h.x) / ONE, (u.y - h.y) / ONE) < 12 * T).length;
      for (const h of halls) {
        if (nearDef(h) >= 2) continue;
        if (SC.Engine.meetsReq(g, p, def) && !hasBuildOrder(g, ai.pi, dtid)) {
          ai.lastDefT = g.tick;
          buildNear(g, ai, issue, dtid, h);
        }
        break;
      }
    }
    // 완성된 크립 콜로니 → 성큰
    if (race === 'Z') {
      const cc = myUnits(g, ai.pi, u => u.tid === 'creep_colony' && u.complete && !u.morph)[0];
      if (cc && SC.Engine.hasBuilding(g, p, 'spawning_pool') && p.minerals >= 50)
        issue({ p: ai.pi, k: 'morB', t: cc.id, u: 'sunken_colony' });
    }

    // ---- 연구 ----
    if (p.minerals > 200 && p.gas > 100) {
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
              ((D.all[u.tid].trains || []).includes(pick) || (u.addonDef && (u.addonDef.trains || []).includes(pick))))[0];
            if (b) issue({ p: ai.pi, k: 'trn', t: b.id, u: pick });
          }
        }
      }
    }

    // ---- 확장 (재시도 가능) ----
    if (halls.length < 3 && g.tick > 24 * 420 && p.minerals > 500 && g.tick - ai.lastExpandT > 24 * 60 &&
      !hasBuildOrder(g, ai.pi, D.RACES[race].hall)) {
      const spot = freeExpansion(g, hall);
      if (spot) {
        const w = workers.find(u => !u.carry && !u.building && !isGasAssigned(g, u));
        if (w) {
          ai.lastExpandT = g.tick;
          issue({ p: ai.pi, k: 'bld', ids: [w.id], u: D.RACES[race].hall, tx: spot.tx, ty: spot.ty - 1 });
        }
      }
    }
    // 확장 가스 (모든 홀 근처의 빈 간헐천)
    if (p.minerals > 150 && gasB.length < halls.length && !hasBuildOrder(g, ai.pi, D.RACES[race].gasB)) {
      for (const h of halls) {
        const gr = g.res.find(r => r.kind === 'g' && !r.building &&
          Math.hypot((r.x - h.x) / ONE, (r.y - h.y) / ONE) < 14 * T);
        if (gr) {
          const w = workers.find(u => !u.carry && !u.building && !isGasAssigned(g, u));
          if (w) issue({ p: ai.pi, k: 'bld', ids: [w.id], u: D.RACES[race].gasB, tx: gr.tx, ty: gr.ty });
          break;
        }
      }
    }

    // ---- 마이크로: 시즈/러커/지뢰/스펠 ----
    if (race === 'T' && p.research.siege_tech) {
      for (const t2 of myUnits(g, ai.pi, u => u.tid === 'siege_tank')) {
        const near = groundEnemyNear(g, ai.pi, t2.x, t2.y, 11 * T);
        if (near && !t2.st.sieged) issue({ p: ai.pi, k: 'abl', ids: [t2.id], a: 'siege' });
        else if (!near && t2.st.sieged && !groundEnemyNear(g, ai.pi, t2.x, t2.y, 14 * T)) issue({ p: ai.pi, k: 'abl', ids: [t2.id], a: 'unsiege' });
      }
    }
    // 러커: 적 근처 잠복, 이동 필요 시 해제
    for (const lk of myUnits(g, ai.pi, u => u.tid === 'lurker')) {
      const near = groundEnemyNear(g, ai.pi, lk.x, lk.y, 6 * T);
      if (near && !lk.st.burrow) issue({ p: ai.pi, k: 'abl', ids: [lk.id], a: 'burrow' });
      else if (!near && lk.st.burrow && !groundEnemyNear(g, ai.pi, lk.x, lk.y, 9 * T))
        issue({ p: ai.pi, k: 'abl', ids: [lk.id], a: 'unburrow' });
    }
    // 시체매: 대기 중 기지 근처 지뢰 매설
    if (p.research.spider_mines) {
      const v = myUnits(g, ai.pi, u => u.tid === 'vulture' && u.mines > 0 && !u.orders.length)[0];
      if (v) issue({ p: ai.pi, k: 'abl', ids: [v.id], a: 'mines', x: v.x + ((g.tick % 5) - 2) * T * ONE, y: v.y + T * ONE });
    }
    // 스팀: 교전 중인 마린/파벳
    if (p.research.stim_pack && (ai.t % (ai.d.interval * 3)) === 0) {
      const fighters = myUnits(g, ai.pi, u => (u.tid === 'marine' || u.tid === 'firebat') && !u.st.stim &&
        u.hp > 20 << 8 && u.orders.length && u.orders[0].op === 'attack');
      if (fighters.length >= 4) issue({ p: ai.pi, k: 'abl', ids: fighters.slice(0, 12).map(u => u.id), a: 'stim' });
    }
    // 스톰: 에너지 찬 하이템플러 + 밀집 적
    if (p.research.psionic_storm_tech) {
      const ht = myUnits(g, ai.pi, u => u.tid === 'high_templar' && u.en >= (80 << 8))[0];
      if (ht) {
        const tgt = clusterTarget(g, ai.pi, ht, 9 * T);
        if (tgt) issue({ p: ai.pi, k: 'abl', ids: [ht.id], a: 'storm', x: tgt.x, y: tgt.y });
      }
    }

    // ---- 방어: 본진 근처 위협 대응 (+ 소수 병력이면 일꾼 동원) ----
    for (const h of halls) {
      const foe = groundOrAirEnemyNear(g, ai.pi, h.x, h.y, 10 * T);
      if (!foe) continue;
      const army = armyUnits(g, ai.pi);
      if (army.length) issue({ p: ai.pi, k: 'atk', ids: army.slice(0, 12).map(u => u.id), x: foe.x, y: foe.y });
      if (army.length < 3 && !foe.fly) {
        const defenders = workers.filter(w => !w.building).slice(0, 6);
        if (defenders.length) issue({ p: ai.pi, k: 'atk', ids: defenders.map(u => u.id), t: foe.id });
      }
      break;
    }

    // ---- 공격 웨이브 ----
    const army = armyUnits(g, ai.pi);
    const armySup = army.reduce((s, u) => s + (D.all[u.tid].sup || 0), 0);
    if (armySup >= ai.d.attackSup && g.tick - ai.lastWave > ai.d.waveT) {
      ai.lastWave = g.tick;
      const tgt = enemyBase(g, ai.pi, hall);
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
      !u.morph && !u.st.burrow);
  }

  function groundEnemyNear(g, pi, x, y, r) {
    const team = g.players[pi].team;
    for (const u of g.units) {
      if (u.dead || u.hidden || u.fly || g.players[u.o].team === team || u.kind !== 'unit') continue;
      if (SC.Engine.isWorker(u)) continue;
      const dx = (u.x - x) / ONE, dy = (u.y - y) / ONE;
      if (dx * dx + dy * dy < r * r) return u;
    }
    return null;
  }
  function groundOrAirEnemyNear(g, pi, x, y, r) {
    const team = g.players[pi].team;
    for (const u of g.units) {
      if (u.dead || u.hidden || g.players[u.o].team === team || u.kind !== 'unit') continue;
      if (['larva', 'egg', 'overlord'].includes(u.tid)) continue;
      const dx = (u.x - x) / ONE, dy = (u.y - y) / ONE;
      if (dx * dx + dy * dy < r * r) return u;
    }
    return null;
  }

  // 밀집 적 지점 (스톰용): 반경 내 적 3+ 모인 곳
  function clusterTarget(g, pi, from, range) {
    const team = g.players[pi].team;
    for (const u of g.units) {
      if (u.dead || u.hidden || g.players[u.o].team === team || u.kind !== 'unit') continue;
      const d = Math.hypot((u.x - from.x) / ONE, (u.y - from.y) / ONE);
      if (d > range) continue;
      let n = 0;
      for (const v of g.units) {
        if (v.dead || v.hidden || g.players[v.o].team === team) continue;
        if (Math.hypot((v.x - u.x) / ONE, (v.y - u.y) / ONE) < 1.5 * T) n++;
      }
      if (n >= 3) return u;
    }
    return null;
  }

  // 가장 가까운 적 건물 (없으면 가장 가까운 적 스타팅)
  function enemyBase(g, pi, hall) {
    const team = g.players[pi].team;
    let best = null, bd = Infinity;
    for (const u of g.units) {
      if (u.dead || g.players[u.o].team === team || u.kind !== 'building') continue;
      const d = (u.x - hall.x) / ONE * (u.x - hall.x) / ONE + (u.y - hall.y) / ONE * (u.y - hall.y) / ONE;
      if (d < bd) { bd = d; best = { x: u.x, y: u.y }; }
    }
    if (best) return best;
    for (const p2 of g.players) {
      if (p2.team === team || p2.defeated) continue;
      const d = (p2.startX - hall.x / ONE) ** 2 + (p2.startY - hall.y / ONE) ** 2;
      if (d < bd) { bd = d; best = { x: Math.round(p2.startX * ONE), y: Math.round(p2.startY * ONE) }; }
    }
    return best;
  }

  function freeExpansion(g, hall) {
    let best = null, bd = Infinity;
    for (const s of g.map.starts) {
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
          const w = myUnits(g, ai.pi, u => SC.Engine.isWorker(u) && !u.carry && !u.building &&
            !u.orders.some(o => o.op === 'build' || o.op === 'construct'))[0];
          if (w) issue({ p: ai.pi, k: 'bld', ids: [w.id], u: tid, tx: r.tx, ty: r.ty });
          return;
        }
      }
      return;
    }
    const hx = hall.tileX, hy = hall.tileY;
    const seed = (g.tick + ai.t) % 8;
    const w = myUnits(g, ai.pi, u => SC.Engine.isWorker(u) && !u.carry && !u.building &&
      !u.orders.some(o => o.op === 'build' || o.op === 'construct'))[0];
    if (!w) return;
    const wtx = (w.x / ONE / T) | 0, wty = (w.y / ONE / T) | 0;
    for (let r = 3; r < 14; r++) {
      for (let i = 0; i < 16; i++) {
        const an = ((i + seed) % 16) / 16 * Math.PI * 2;
        const tx = Math.round(hx + Math.cos(an) * r), ty = Math.round(hy + Math.sin(an) * r);
        if (!SC.Engine.canPlace(g, ai.pi, tid, tx, ty)) continue;
        // 일꾼이 실제로 도달 가능한 위치인지 확인 (우회 종착점이 목표 근처인지도 검증)
        const [bw, bh] = SC.DATA.all[tid].tiles;
        const gtx = tx + (bw >> 1), gty = ty + bh;
        const path = SC.Path.findPath(g.map, g.occ, wtx, wty, gtx, gty, 1200);
        if (path === null) continue;
        const last = path.length ? path[path.length - 1] : [wtx, wty];
        if (Math.hypot(last[0] - gtx, last[1] - gty) > 2.5) continue;
        issue({ p: ai.pi, k: 'bld', ids: [w.id], u: tid, tx, ty });
        return;
      }
    }
  }

  SC.AI = { create, tick };
})();
