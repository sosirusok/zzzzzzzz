/* =========================================================================
 *  ui.js — 인게임 HUD (하단 콘솔/미니맵/커맨드 카드/선택/입력)
 * ========================================================================= */
'use strict';
(function () {
  const T = 32, ONE = 256;
  const UI = {};
  let game = null, localPlayer = 0, sendCmd = null;
  let canvas, ctx, mmCanvas, mmCtx, portCanvas, portCtx;
  let viewW = 0, viewH = 0;
  const cam = { x: 0, y: 0 };
  let cursors = null, cursorMode = 'default';

  const state = {
    selection: [],            // 유닛 id 배열
    groups: {},               // 컨트롤 그룹
    drag: null,               // {x0,y0,x1,y1}
    placing: null,            // {tid, worker}
    targeting: null,          // {ability, ids} 혹은 {attack:true}
    showBars: false,
    rallyFlash: 0,
    lastClickTime: 0, lastClickId: null,
    msgLog: [],               // {text, t}
    chatOpen: false,
    keys: {},
    minimapDrag: false,
    followCam: false,
    menuOpen: false,
    subMenu: null,            // 'build' | 'buildAdv'
  };
  UI.state = state;
  UI.cam = cam;

  const $ = id => document.getElementById(id);

  // ---- 초기화 ---------------------------------------------------------------
  UI.init = function (g, lp, send) {
    game = g; localPlayer = lp; sendCmd = send;
    canvas = $('game-canvas'); ctx = canvas.getContext('2d');
    mmCanvas = $('minimap'); mmCtx = mmCanvas.getContext('2d');
    portCanvas = $('portrait'); portCtx = portCanvas.getContext('2d');
    cursors = SC.Gfx.makeCursors();
    state.selection = [];
    state.groups = {};
    state.msgLog = [];
    const p = g.players[lp];
    document.body.dataset.race = p ? p.race : 'T';
    resize();
    cam.x = p.startX - viewW / 2; cam.y = p.startY - viewH / 2;
    clampCam();
    bindEvents();
    updateHud();
  };

  function resize() {
    const consoleH = Math.max(180, Math.min(230, window.innerHeight * 0.24));
    document.documentElement.style.setProperty('--console-h', consoleH + 'px');
    viewW = window.innerWidth;
    viewH = window.innerHeight - consoleH;
    canvas.width = viewW; canvas.height = viewH;
    canvas.style.width = viewW + 'px'; canvas.style.height = viewH + 'px';
  }
  window.addEventListener('resize', () => { if (game) { resize(); clampCam(); } });

  function clampCam() {
    cam.x = Math.max(0, Math.min(game.map.w * T - viewW, cam.x));
    cam.y = Math.max(0, Math.min(game.map.h * T - viewH, cam.y));
  }

  // ---- 명령 도우미 -----------------------------------------------------------
  function cmd(c) { c.p = localPlayer; sendCmd(c); }
  const selUnits = () => state.selection.map(id => SC.Engine.byId(game, id)).filter(u => u && !u.dead);
  const myUnits = () => selUnits().filter(u => u.o === localPlayer);

  function addMsg(text) {
    state.msgLog.push({ text, t: game.tick });
    if (state.msgLog.length > 8) state.msgLog.shift();
  }
  UI.addMsg = addMsg;

  // ---- 이벤트 ---------------------------------------------------------------
  let bound = false;
  function bindEvents() {
    if (bound) return; bound = true;

    canvas.addEventListener('mousedown', e => {
      SC.Audio.unlock();
      const mx = e.offsetX + cam.x, my = e.offsetY + cam.y;
      if (e.button === 0) {
        if (state.placing) { tryPlace(mx, my, e.shiftKey); return; }
        if (state.targeting) { fireTargeted(mx, my, e.shiftKey); return; }
        state.drag = { x0: e.offsetX, y0: e.offsetY, x1: e.offsetX, y1: e.offsetY };
      } else if (e.button === 2) {
        if (state.placing) { state.placing = null; updateHud(); return; }
        if (state.targeting) { state.targeting = null; setCursor('default'); return; }
        rightClick(mx, my, e.shiftKey);
      }
    });
    canvas.addEventListener('mousemove', e => {
      if (state.drag) { state.drag.x1 = e.offsetX; state.drag.y1 = e.offsetY; }
      state.mouseX = e.offsetX; state.mouseY = e.offsetY;
      updateCursorForHover();
    });
    window.addEventListener('mouseup', e => {
      if (e.button === 0 && state.drag) { finishDrag(e.shiftKey, e.ctrlKey); state.drag = null; }
      state.minimapDrag = false;
    });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('dblclick', e => {
      // 더블클릭: 화면 내 동일 타입 선택
      const u = unitAt(e.offsetX + cam.x, e.offsetY + cam.y);
      if (u && u.o === localPlayer) selectSameType(u);
    });

    // 미니맵
    mmCanvas.addEventListener('mousedown', e => {
      const r = mmCanvas.getBoundingClientRect();
      const sc = (game.map.w * T) / mmCanvas.width;
      const wx = (e.clientX - r.left) * (mmCanvas.width / r.width) * sc;
      const wy = (e.clientY - r.top) * (mmCanvas.height / r.height) * sc;
      if (e.button === 2 || state.targeting) {
        if (state.targeting) { fireTargeted(wx, wy, e.shiftKey); return; }
        smartOrder(wx, wy, e.shiftKey);
        return;
      }
      state.minimapDrag = true;
      cam.x = wx - viewW / 2; cam.y = wy - viewH / 2; clampCam();
    });
    mmCanvas.addEventListener('mousemove', e => {
      if (!state.minimapDrag) return;
      const r = mmCanvas.getBoundingClientRect();
      const sc = (game.map.w * T) / mmCanvas.width;
      cam.x = (e.clientX - r.left) * (mmCanvas.width / r.width) * sc - viewW / 2;
      cam.y = (e.clientY - r.top) * (mmCanvas.height / r.height) * sc - viewH / 2;
      clampCam();
    });
    mmCanvas.addEventListener('contextmenu', e => e.preventDefault());

    window.addEventListener('keydown', e => {
      if (state.chatOpen) {
        if (e.key === 'Enter') { sendChat(); }
        else if (e.key === 'Escape') { closeChat(); }
        return;
      }
      state.keys[e.key] = true;
      if (e.key.startsWith('Arrow')) { e.preventDefault(); return; }
      if (e.key === 'Enter') { openChat(); e.preventDefault(); return; }
      if (e.key === 'F10' || e.key === 'Escape') {
        if (state.placing || state.targeting) { state.placing = null; state.targeting = null; setCursor('default'); updateHud(); }
        else if (state.subMenu) { state.subMenu = null; updateHud(); }
        else toggleMenu();
        e.preventDefault(); return;
      }
      if (e.key === 'Alt') { state.showBars = true; e.preventDefault(); }
      // 컨트롤 그룹
      if (/^[0-9]$/.test(e.key)) {
        const n = e.key;
        if (e.ctrlKey) { state.groups[n] = myUnits().slice(0, 12).map(u => u.id); addMsg(`부대 ${n} 지정`); }
        else if (state.groups[n]) {
          const alive = state.groups[n].filter(id => { const u = SC.Engine.byId(game, id); return u && !u.dead; });
          state.groups[n] = alive;
          if (alive.length) {
            if (state.lastGroupKey === n && game.tick - (state.lastGroupTick || 0) < 12) centerOn(alive[0]);
            state.selection = alive.slice();
            state.lastGroupKey = n; state.lastGroupTick = game.tick;
            SC.Audio.play('select');
            updateHud();
          }
        }
        return;
      }
      handleHotkey(e.key.toLowerCase(), e);
    });
    window.addEventListener('keyup', e => {
      state.keys[e.key] = false;
      if (e.key === 'Alt') state.showBars = false;
    });

    $('chat-input').addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') sendChat();
      if (e.key === 'Escape') closeChat();
    });
  }

  function centerOn(id) {
    const u = SC.Engine.byId(game, id);
    if (!u) return;
    cam.x = u.x / ONE - viewW / 2; cam.y = u.y / ONE - viewH / 2; clampCam();
  }

  // ---- 선택 ----------------------------------------------------------------
  function unitAt(wx, wy) {
    let best = null, bd = Infinity;
    const team = game.players[localPlayer].team;
    for (const u of game.units) {
      if (u.dead || u.hidden) continue;
      if (u.o !== localPlayer && !SC.Engine.isVisibleTo(game, team, u)) continue;
      const r = u.kind === 'building' ? u.r + 6 : Math.max(12, u.r + 4);
      const d = Math.hypot(u.x / ONE - wx, u.y / ONE - wy);
      if (d < r && d < bd) { bd = d; best = u; }
    }
    return best;
  }
  function resourceAt(wx, wy) {
    for (const r of game.res) {
      if (wx >= r.tx * T - 4 && wx <= (r.tx + r.w) * T + 4 && wy >= r.ty * T - 4 && wy <= (r.ty + r.h) * T + 4) return r;
    }
    return null;
  }

  function finishDrag(shift, ctrl) {
    const d = state.drag;
    const w = Math.abs(d.x1 - d.x0), h = Math.abs(d.y1 - d.y0);
    if (w < 5 && h < 5) { clickSelect(d.x0 + cam.x, d.y0 + cam.y, shift, ctrl); return; }
    const x0 = Math.min(d.x0, d.x1) + cam.x, x1 = Math.max(d.x0, d.x1) + cam.x;
    const y0 = Math.min(d.y0, d.y1) + cam.y, y1 = Math.max(d.y0, d.y1) + cam.y;
    const picked = [];
    for (const u of game.units) {
      if (u.dead || u.hidden || u.kind === 'building' || u.o !== localPlayer) continue;
      if (u.tid === 'larva' || u.tid === 'egg' || u.tid === 'interceptor' || u.tid === 'scarab_proj') continue;
      const x = u.x / ONE, y = u.y / ONE;
      if (x >= x0 && x <= x1 && y >= y0 && y <= y1) picked.push(u.id);
    }
    if (picked.length) {
      if (!shift) state.subMenu = null;
      let sel = shift ? state.selection.concat(picked) : picked;
      sel = [...new Set(sel)].filter(id => { const u = SC.Engine.byId(game, id); return u && u.o === localPlayer && u.kind === 'unit'; });
      state.selection = sel.slice(0, 12);
      SC.Audio.play('select');
    } else if (!shift) {
      // 건물이라도 잡기
      const b = buildingIn(x0, y0, x1, y1);
      state.selection = b ? [b.id] : [];
    }
    updateHud();
  }
  function buildingIn(x0, y0, x1, y1) {
    for (const u of game.units) {
      if (u.dead || u.kind !== 'building' || u.o !== localPlayer) continue;
      const x = u.x / ONE, y = u.y / ONE;
      if (x >= x0 && x <= x1 && y >= y0 && y <= y1) return u;
    }
    return null;
  }

  function clickSelect(wx, wy, shift, ctrl) {
    const u = unitAt(wx, wy);
    if (!u) { if (!shift) { state.selection = []; updateHud(); } return; }
    if (ctrl && u.o === localPlayer) { selectSameType(u); return; }
    if (shift && u.o === localPlayer) {
      const i = state.selection.indexOf(u.id);
      if (i >= 0) state.selection.splice(i, 1);
      else if (state.selection.length < 12) state.selection.push(u.id);
    } else {
      state.selection = [u.id];
      state.subMenu = null;
    }
    SC.Audio.play('select');
    updateHud();
  }
  function selectSameType(u) {
    const picked = [];
    for (const v of game.units) {
      if (v.dead || v.hidden || v.o !== localPlayer || v.tid !== u.tid) continue;
      const x = v.x / ONE, y = v.y / ONE;
      if (x >= cam.x && x <= cam.x + viewW && y >= cam.y && y <= cam.y + viewH) picked.push(v.id);
    }
    state.selection = picked.slice(0, 12);
    SC.Audio.play('select');
    updateHud();
  }

  // ---- 우클릭 스마트 명령 -----------------------------------------------------
  function rightClick(wx, wy, shift) {
    smartOrder(wx, wy, shift);
  }
  function smartOrder(wx, wy, shift) {
    const sel = myUnits();
    if (!sel.length) return;
    const ids = sel.filter(u => u.kind === 'unit').map(u => u.id);
    const bsel = sel.filter(u => u.kind === 'building');
    // 건물 선택: 랠리 지정
    if (!ids.length && bsel.length) {
      const r = resourceAt(wx, wy);
      for (const b of bsel) cmd({ k: 'rly', t: b.id, x: Math.round(wx * ONE), y: Math.round(wy * ONE), rt: r ? r.id : undefined });
      state.rallyFlash = game.tick;
      SC.Audio.play('click');
      return;
    }
    const tgt = unitAt(wx, wy);
    const res = resourceAt(wx, wy);
    const team = game.players[localPlayer].team;
    if (tgt && game.players[tgt.o].team !== team) {
      cmd({ k: 'atk', ids, t: tgt.id, q: shift });
      SC.Audio.play('ackAtk');
      flashOrder(wx, wy, '#f43f2e');
      return;
    }
    if (res) {
      const workers = sel.filter(u => SC.Engine.isWorker(u)).map(u => u.id);
      if (workers.length) {
        cmd({ k: 'gat', ids: workers, t: res.id, q: shift });
        SC.Audio.play('ack');
        flashOrder(wx, wy, '#57c8ff');
        const rest = ids.filter(id => !workers.includes(id));
        if (rest.length) cmd({ k: 'mv', ids: rest, x: Math.round(wx * ONE), y: Math.round(wy * ONE), q: shift });
        return;
      }
    }
    if (tgt && tgt.o === localPlayer) {
      const def = SC.DATA.all[tgt.tid];
      // 수송선/벙커 탑승
      if ((def.slots || 0) > 0 && tgt.complete && ids.length) {
        cmd({ k: 'lod', ids, t: tgt.id });
        SC.Audio.play('ack');
        return;
      }
      // SCV 건설 재개
      const scvs = sel.filter(u => u.tid === 'scv').map(u => u.id);
      if (scvs.length && tgt.kind === 'building' && !tgt.complete && def.race === 'T') {
        cmd({ k: 'con', ids: scvs, t: tgt.id });
        SC.Audio.play('ack');
        return;
      }
      // SCV 수리
      if (scvs.length && tgt.hp < tgt.maxHp && (tgt.kind === 'building' || (def.flags || []).includes('mech'))) {
        cmd({ k: 'rep', ids: scvs, t: tgt.id, q: shift });
        SC.Audio.play('ack');
        return;
      }
      // 부상 아군에 메딕
      const medics = sel.filter(u => u.tid === 'medic').map(u => u.id);
      if (medics.length && tgt.hp < tgt.maxHp && (def.flags || []).includes('bio')) {
        cmd({ k: 'abl', ids: medics, a: 'heal', t: tgt.id });
        return;
      }
      // 따라가기
      cmd({ k: 'fol', ids, t: tgt.id, q: shift });
      SC.Audio.play('ack');
      return;
    }
    cmd({ k: 'mv', ids, x: Math.round(wx * ONE), y: Math.round(wy * ONE), q: shift });
    SC.Audio.play('ack');
    flashOrder(wx, wy, '#3ddc55');
  }

  const orderFlashes = [];
  function flashOrder(x, y, col) { orderFlashes.push({ x, y, col, t: performance.now() }); }

  // ---- 핫키 ----------------------------------------------------------------
  function handleHotkey(key, e) {
    const sel = myUnits();
    if (!sel.length) return;
    const first = sel[0];
    const def = SC.DATA.all[first.tid];
    const units = sel.filter(u => u.kind === 'unit');
    const ids = units.map(u => u.id);

    if (units.length) {
      // 1) 열린 건설 서브메뉴가 키를 우선 소비
      if (state.subMenu === 'build' || state.subMenu === 'buildAdv') {
        const menu = SC.DATA.buildMenu[game.players[localPlayer].race][state.subMenu === 'build' ? 'basic' : 'adv'];
        for (const bid of menu) {
          const bdef = SC.DATA.all[bid];
          if (bdef.hk === key) { beginPlace(bid); return; }
        }
      }
      const isW = units.some(u => SC.Engine.isWorker(u));
      if (isW && key === 'b') { state.subMenu = 'build'; updateHud(); return; }
      if (isW && key === 'v') { state.subMenu = 'buildAdv'; updateHud(); return; }
      // 2) 어빌리티 핫키 (일반 명령보다 우선 — 패러사이트 P, 환상 H 등)
      for (const u of units) {
        const abs = unitAbilities(u);
        for (const abId of abs) {
          const ab = SC.DATA.abilities[abId];
          if (ab && ab.hk === key) { triggerAbility(abId, units); return; }
        }
      }
      // 3) 라바 생산
      const larvae = units.filter(u => u.tid === 'larva');
      if (larvae.length) {
        for (const uid of SC.DATA.larvaTrains) {
          const udef = SC.DATA.all[uid];
          if (udef.hk === key && SC.Engine.meetsReq(game, game.players[localPlayer], udef)) {
            cmd({ k: 'mor', ids: larvae.map(l => l.id).slice(0, e.shiftKey ? 12 : 1), u: uid });
            SC.Audio.play('click'); return;
          }
        }
      }
      // 4) 유닛 변태 (러커/가디언/디바우러)
      for (const uid of ['lurker', 'guardian', 'devourer']) {
        const udef = SC.DATA.all[uid];
        if (udef.hk === key && units.some(u => u.tid === udef.morphFrom)) {
          const p2 = game.players[localPlayer];
          if (SC.Engine.meetsReq(game, p2, udef)) {
            cmd({ k: 'mor', ids: units.filter(u => u.tid === udef.morphFrom).map(u => u.id), u: uid });
            return;
          }
        }
      }
      // 5) 아콘 합체 / 토글 / 내리기
      if (key === 'r' && units.filter(u => u.tid === 'high_templar' || u.tid === 'dark_templar').length >= 2) {
        cmd({ k: 'mrg', ids }); return;
      }
      if (key === 'u') {
        const bur = units.filter(u => (SC.DATA.all[u.tid].flags || []).includes('burrowable'));
        if (bur.length) {
          const anyB = bur.some(u => u.st.burrow);
          cmd({ k: 'abl', ids: bur.map(u => u.id), a: anyB ? 'unburrow' : 'burrow' });
          return;
        }
      }
      if (key === 'o') {
        const tanks = units.filter(u => u.tid === 'siege_tank');
        if (tanks.length) {
          const anyS = tanks.some(u => u.st.sieged);
          cmd({ k: 'abl', ids: tanks.map(u => u.id), a: anyS ? 'unsiege' : 'siege' });
          return;
        }
      }
      if (key === 'd' && units.some(u => (SC.DATA.all[u.tid].slots || 0) > 0)) {
        startTargeting({ unload: true }); return;
      }
      // 6) 일반 명령 (라바만 선택된 경우 제외)
      if (units.some(u => u.tid !== 'larva')) {
        switch (key) {
          case 'a': startTargeting({ attack: true }); e.preventDefault(); return;
          case 's': cmd({ k: 'stp', ids }); SC.Audio.play('click'); return;
          case 'h': cmd({ k: 'hld', ids }); SC.Audio.play('click'); return;
          case 'p': startTargeting({ patrol: true }); return;
          case 'm': startTargeting({ move: true }); return;
        }
      }
    }
    // 건물 핫키
    const b = sel.find(u => u.kind === 'building');
    if (b) {
      const bDef = SC.DATA.all[b.tid];
      // 생산
      const trains = (bDef.trains || []).concat(b.addonDef ? (b.addonDef.trains || []) : []);
      for (const uid of trains) {
        const udef = SC.DATA.all[uid];
        if (udef.hk === key) { cmd({ k: 'trn', t: b.id, u: uid }); SC.Audio.play('click'); return; }
      }
      // 저그 홀: 라바 명령 대행
      if ((bDef.flags || []).includes('larvaSpawner')) {
        for (const uid of SC.DATA.larvaTrains) {
          const udef = SC.DATA.all[uid];
          if (udef.hk === key) {
            const lv = game.units.filter(u => !u.dead && u.tid === 'larva' && u.hatch === b.id);
            if (lv.length) { cmd({ k: 'mor', ids: [lv[0].id], u: uid }); SC.Audio.play('click'); }
            return;
          }
        }
      }
      // 연구
      const res = (bDef.researches || []).concat(b.addonDef ? (b.addonDef.researches || []) : []);
      if ((bDef.flags || []).includes('larvaSpawner')) res.push('burrow_tech');
      for (const rid of res) {
        const r = SC.DATA.research[rid];
        const hk = researchHotkey(rid);
        if (hk === key) { cmd({ k: 'rsr', t: b.id, r: rid }); SC.Audio.play('click'); return; }
      }
      // 건물 변태
      const morphs = (bDef.morphTo ? [bDef.morphTo] : []).concat(bDef.morphChoices || []);
      for (const mid of morphs) {
        const mdef = SC.DATA.all[mid];
        if (mdef.hk === key) { cmd({ k: 'morB', t: b.id, u: mid }); return; }
      }
      // 애드온
      for (const aid of (bDef.addons || [])) {
        const adef = SC.DATA.all[aid];
        if (adef.hk === key && !b.addon) { cmd({ k: 'add', t: b.id, u: aid }); return; }
      }
      // 컴샛 스캔
      if (key === 's' && b.addonDef && b.addonDef.abilities && b.addonDef.abilities.includes('scan')) {
        startTargeting({ ability: 'scan', ids: [b.id] }); return;
      }
      if (key === 'l' && b.tid === 'bunker') { cmd({ k: 'uld', t: b.id }); return; }
    }
  }

  const RESEARCH_HK = { t_inf_w:'w', t_inf_a:'a', t_veh_w:'w', t_veh_a:'a', t_ship_w:'s', t_ship_a:'p',
    z_melee:'m', z_missile:'i', z_cara:'c', z_flyer_w:'w', z_flyer_a:'a',
    p_ground_w:'w', p_ground_a:'a', p_shields:'s', p_air_w:'w', p_air_a:'a',
    stim_pack:'t', u238:'u', caduceus:'c', restoration:'r', optical_flare:'o',
    ion_thrusters:'i', spider_mines:'m', siege_tech:'s',
    cloaking_field:'c', apollo_reactor:'a', emp_shockwave:'e', irradiate_tech:'i', titan_reactor:'t',
    lockdown_tech:'l', personnel_cloaking:'c', ocular_implants:'o', moebius_reactor:'m',
    yamato_tech:'y', colossus_reactor:'c', charon_boosters:'h',
    burrow_tech:'w', metabolic_boost:'m', adrenal_glands:'a', muscular_augments:'m', grooved_spines:'g',
    lurker_aspect:'l', ventral_sacs:'v', antennae:'a', pneumatized_carapace:'p',
    ensnare_tech:'e', broodlings_tech:'b', gamete_meiosis:'g',
    anabolic_synthesis:'a', chitinous_plating:'c', consume_tech:'c', plague_tech:'g', metasynaptic_node:'m',
    singularity_charge:'s', leg_enhancements:'l', psionic_storm_tech:'t', hallucination_tech:'h',
    khaydarin_amulet:'k', maelstrom_tech:'e', mind_control_tech:'c', argus_talisman:'a',
    scarab_damage:'s', reaver_capacity:'r', gravitic_drive:'g', gravitic_boosters:'g', sensor_array:'s',
    carrier_capacity:'c', disruption_web_tech:'d', argus_jewel:'j', apial_sensors:'p', gravitic_thrusters:'t',
    recall_tech:'r', stasis_tech:'s', khaydarin_core:'k' };
  function researchHotkey(rid) {
    return RESEARCH_HK[rid] || rid[0];
  }

  function unitAbilities(u) {
    const def = SC.DATA.all[u.tid];
    let abs = (def.abilities || []).filter(a => !a.startsWith('merge_'));
    if ((def.flags || []).includes('stim') || u.tid === 'marine' || u.tid === 'firebat') abs.unshift('stim');
    if (u.tid === 'siege_tank') abs = [u.st.sieged ? 'unsiege' : 'siege'];
    if ((def.flags || []).includes('burrowable') && u.tid !== 'lurker') abs.push(u.st.burrow ? 'unburrow' : 'burrow');
    if (u.tid === 'lurker') abs.push(u.st.burrow ? 'unburrow' : 'burrow');
    return abs;
  }

  function triggerAbility(abId, units) {
    if (abId === 'merge_archon' || abId === 'merge_dark_archon') {
      cmd({ k: 'mrg', ids: units.map(u => u.id) });
      return;
    }
    const ab = SC.DATA.abilities[abId];
    const p = game.players[localPlayer];
    if (ab.req && !p.research[ab.req] && !['nuke_paint'].includes(abId)) {
      if (abId !== 'unsiege' && abId !== 'unburrow' && abId !== 'heal' && abId !== 'repair'
        && abId !== 'consume' && abId !== 'parasite' && abId !== 'dark_swarm' && abId !== 'dmatrix'
        && abId !== 'feedback' && abId !== 'scan') { SC.Audio.play('error'); addMsg('연구가 필요합니다'); return; }
    }
    const ids = units.filter(u => unitAbilities(u).includes(abId)).map(u => u.id);
    if (!ids.length) return;
    if (ab.target === 'self' || ab.target === 'toggle') {
      cmd({ k: 'abl', ids, a: abId });
      SC.Audio.play('click');
    } else {
      startTargeting({ ability: abId, ids });
    }
  }

  function startTargeting(t) {
    state.targeting = t;
    setCursor(t.attack ? 'red' : 'green');
  }
  function fireTargeted(wx, wy, shift) {
    const t = state.targeting;
    state.targeting = null;
    setCursor('default');
    const sel = myUnits().filter(u => u.kind === 'unit');
    const ids = sel.map(u => u.id);
    if (t.attack) {
      const tgt = unitAt(wx, wy);
      if (tgt && game.players[tgt.o].team !== game.players[localPlayer].team)
        cmd({ k: 'atk', ids, t: tgt.id, q: shift });
      else cmd({ k: 'atk', ids, x: Math.round(wx * ONE), y: Math.round(wy * ONE), q: shift });
      SC.Audio.play('ackAtk');
      flashOrder(wx, wy, '#f43f2e');
      return;
    }
    if (t.move) { cmd({ k: 'mv', ids, x: Math.round(wx * ONE), y: Math.round(wy * ONE), q: shift }); SC.Audio.play('ack'); flashOrder(wx, wy, '#3ddc55'); return; }
    if (t.patrol) { cmd({ k: 'pat', ids, x: Math.round(wx * ONE), y: Math.round(wy * ONE), q: shift }); SC.Audio.play('ack'); return; }
    if (t.unload) {
      for (const u of sel) if ((SC.DATA.all[u.tid].slots || 0) > 0)
        cmd({ k: 'uld', t: u.id, x: Math.round(wx * ONE), y: Math.round(wy * ONE) });
      return;
    }
    if (t.ability) {
      const ab = SC.DATA.abilities[t.ability];
      const tgt = unitAt(wx, wy);
      const c = { k: 'abl', ids: t.ids, a: t.ability, x: Math.round(wx * ONE), y: Math.round(wy * ONE) };
      if (ab.target === 'unit') {
        if (!tgt) { SC.Audio.play('error'); return; }
        c.t = tgt.id;
      } else if (tgt) c.t = tgt.id;
      cmd(c);
      SC.Audio.play('click');
    }
  }

  // ---- 건물 배치 -------------------------------------------------------------
  function beginPlace(tid) {
    const p = game.players[localPlayer];
    const def = SC.DATA.all[tid];
    if (!SC.Engine.meetsReq(game, p, def)) { addMsg('요구 조건이 충족되지 않았습니다'); SC.Audio.play('error'); return; }
    if (p.minerals < def.min) { addMsg('미네랄이 부족합니다'); SC.Audio.play('error'); return; }
    if (p.gas < def.gas) { addMsg('가스가 부족합니다'); SC.Audio.play('error'); return; }
    state.placing = { tid };
    state.subMenu = null;
    updateHud();
  }
  function tryPlace(wx, wy, shift) {
    const tid = state.placing.tid;
    const def = SC.DATA.all[tid];
    const tx = Math.round(wx / T - def.tiles[0] / 2), ty = Math.round(wy / T - def.tiles[1] / 2);
    const workers = myUnits().filter(u => SC.Engine.isWorker(u));
    if (!workers.length) { state.placing = null; return; }
    let ok = false;
    if ((def.flags || []).includes('gas')) {
      for (const r of game.res) if (r.kind === 'g' && !r.building &&
        wx >= r.tx * T && wx <= (r.tx + r.w) * T && wy >= r.ty * T && wy <= (r.ty + r.h) * T) {
        cmd({ k: 'bld', ids: [workers[0].id], u: tid, tx: r.tx, ty: r.ty, q: shift });
        ok = true; break;
      }
      if (!ok) { SC.Audio.play('error'); addMsg('간헐천 위에 건설해야 합니다'); return; }
    } else {
      if (!SC.Engine.canPlace(game, localPlayer, tid, tx, ty)) { SC.Audio.play('error'); addMsg('그곳에 건설할 수 없습니다'); return; }
      cmd({ k: 'bld', ids: [workers[0].id], u: tid, tx, ty, q: shift });
    }
    SC.Audio.play('buildStart');
    if (!shift) { state.placing = null; updateHud(); }
  }

  // ---- 커서 ----------------------------------------------------------------
  function setCursor(mode) {
    if (cursorMode === mode) return;
    cursorMode = mode;
    canvas.style.cursor = cursors[mode] || cursors.default;
  }
  function updateCursorForHover() {
    if (state.targeting) return;
    if (state.placing) { setCursor('default'); return; }
    const wx = (state.mouseX || 0) + cam.x, wy = (state.mouseY || 0) + cam.y;
    const u = unitAt(wx, wy);
    if (u && game.players[u.o].team !== game.players[localPlayer].team && state.selection.length) { setCursor('red'); return; }
    // 일꾼 선택 중 자원 위: 채취 커서
    if (!u && state.selection.length && resourceAt(wx, wy) && myUnits().some(s => SC.Engine.isWorker(s))) { setCursor('yellow'); return; }
    setCursor('default');
  }

  // ---- 채팅 ----------------------------------------------------------------
  function openChat() { state.chatOpen = true; $('chat-bar').style.display = 'flex'; $('chat-input').focus(); }
  function closeChat() { state.chatOpen = false; $('chat-bar').style.display = 'none'; $('chat-input').value = ''; canvas.focus(); }
  function sendChat() {
    const v = $('chat-input').value.trim();
    if (v) cmd({ k: 'chat', msg: v });
    closeChat();
  }

  function toggleMenu() {
    state.menuOpen = !state.menuOpen;
    $('game-menu').style.display = state.menuOpen ? 'flex' : 'none';
  }
  UI.toggleMenu = toggleMenu;

  // ---- 키보드 스크롤 (마우스 엣지 스크롤 없음 — 미니맵 클릭/드래그로도 이동 가능) ----
  function scrollTick(dtMs) {
    const sp = 1.1 * dtMs;
    if (state.chatOpen || state.menuOpen) return;
    if (state.keys.ArrowLeft) cam.x -= sp;
    if (state.keys.ArrowRight) cam.x += sp;
    if (state.keys.ArrowUp) cam.y -= sp;
    if (state.keys.ArrowDown) cam.y += sp;
    clampCam();
  }

  // ---- HUD DOM -------------------------------------------------------------
  let lastHudTick = -1;
  function updateHud() {
    if (!game) return;
    const p = game.players[localPlayer];
    $('res-min').textContent = p.minerals;
    $('res-gas').textContent = p.gas;
    const supEl = $('res-sup');
    supEl.textContent = `${Math.ceil(p.supUsed / 2)}/${Math.floor(p.supMax / 2)}`;
    supEl.parentElement.classList.toggle('maxed', p.supUsed >= p.supMax);

    renderSelectionPanel();
    renderCommandCard();
  }

  function renderSelectionPanel() {
    const sel = selUnits();
    const info = $('sel-info');
    const grid = $('sel-grid');
    if (!sel.length) {
      info.innerHTML = '<div class="sel-empty">유닛을 선택하십시오</div>';
      grid.innerHTML = '';
      $('portrait-box').style.visibility = 'hidden';
      return;
    }
    $('portrait-box').style.visibility = 'visible';
    if (sel.length === 1) {
      const u = sel[0];
      const def = SC.DATA.all[u.tid];
      grid.innerHTML = '';
      let html = `<div class="sel-name">${def.name}</div>`;
      html += `<div class="sel-sub">${def.en || ''}</div>`;
      const hp = Math.ceil(u.hp / ONE), mhp = def.hp;
      let stats = `<span class="hp ${hp / mhp > 0.66 ? 'g' : hp / mhp > 0.33 ? 'y' : 'r'}">${hp}/${mhp}</span>`;
      if (u.maxSh > 0) stats = `<span class="sh">${Math.ceil(u.sh / ONE)}/${def.sh}</span> ` + stats;
      if (def.me) stats += ` <span class="en">${Math.floor(u.en / ONE)}/${SC.Engine.maxEnergy(game, u) >> 8}</span>`;
      html += `<div class="sel-stats">${stats}</div>`;
      if (u.kind === 'unit' && def.g) {
        const p2 = game.players[u.o];
        const lvlG = def.upG ? (p2.research[def.upG] || 0) : 0;
        const lvlA = def.upA ? (p2.research[def.upA] || 0) : 0;
        html += `<div class="sel-det">공격력 ${SC.Engine.weaponDmg(game, u, u.st.sieged && def.siege ? def.siege : def.g)}${def.g.n > 1 ? ' x' + def.g.n : ''} <em>+${lvlG}</em></div>`;
        html += `<div class="sel-det">방어력 ${SC.Engine.getArmor(game, u)} <em>+${lvlA}</em></div>`;
      } else if (u.kind === 'unit') {
        html += `<div class="sel-det">방어력 ${SC.Engine.getArmor(game, u)}</div>`;
      }
      if (u.kind === 'building' && !u.complete) html += `<div class="sel-det">건설 중... ${Math.floor(u.prog / u.total * 100)}%</div>`;
      if (u.morph) html += `<div class="sel-det">변태 중... ${Math.floor(u.morph.t / u.morph.total * 100)}%</div>`;
      // 생산 큐
      if (u.queue && u.queue.length) {
        html += '<div class="queue-row">';
        u.queue.forEach((q, i) => {
          const label = q.isR ? SC.DATA.research[q.r].name : SC.DATA.all[q.u].name;
          html += `<div class="queue-item" data-qi="${i}" data-bid="${u.id}" title="${label} (클릭: 취소)">${q.isR ? '🧪' : ''}<span>${label.slice(0, 4)}</span>${i === 0 ? `<div class="qbar" style="width:${q.t / q.total * 100}%"></div>` : ''}</div>`;
        });
        html += '</div>';
      }
      // 벙커/수송선 적재
      if (u.cargo && u.cargo.length) {
        html += '<div class="queue-row">';
        for (const cid of u.cargo) {
          const cu = SC.Engine.byId(game, cid);
          if (cu) html += `<div class="queue-item">${SC.DATA.all[cu.tid].name.slice(0, 3)}</div>`;
        }
        html += '</div>';
      }
      if (u.tid === 'vulture') html += `<div class="sel-det">거미 지뢰: ${u.mines}</div>`;
      if (u.tid === 'reaver') html += `<div class="sel-det">갑충탄: ${u.scarabs}</div>`;
      if (u.tid === 'carrier') html += `<div class="sel-det">요격기: ${u.inters.length}</div>`;
      if (u.hasNuke) html += `<div class="sel-det">☢ 핵미사일 준비 완료</div>`;
      info.innerHTML = html;
      info.querySelectorAll('.queue-item[data-qi]').forEach(el => {
        el.addEventListener('mousedown', ev => {
          ev.stopPropagation();
          cmd({ k: 'cnl', t: parseInt(el.dataset.bid), i: parseInt(el.dataset.qi) });
        });
      });
    } else {
      info.innerHTML = `<div class="sel-name">${sel.length}개 유닛 선택됨</div>`;
      grid.innerHTML = '';
      for (const u of sel.slice(0, 12)) {
        const d = document.createElement('div');
        d.className = 'sel-cell';
        const cv = document.createElement('canvas');
        cv.width = 40; cv.height = 40;
        const icon = SC.Gfx.getUnitIcon(u.tid, game.players[u.o].color);
        cv.getContext('2d').drawImage(icon, 0, 0);
        d.appendChild(cv);
        const hb = document.createElement('div');
        hb.className = 'sel-hp';
        const f = u.hp / u.maxHp;
        hb.innerHTML = `<i style="width:${f * 100}%;background:${f > 0.66 ? '#3ddc55' : f > 0.33 ? '#f4e42e' : '#f43f2e'}"></i>`;
        d.appendChild(hb);
        d.addEventListener('mousedown', ev => {
          ev.stopPropagation();
          if (ev.shiftKey) state.selection = state.selection.filter(id => id !== u.id);
          else state.selection = [u.id];
          updateHud();
        });
        grid.appendChild(d);
      }
    }
  }

  // ---- 커맨드 카드 -----------------------------------------------------------
  function renderCommandCard() {
    const card = $('cmd-card');
    card.innerHTML = '';
    const sel = myUnits();
    const cells = new Array(9).fill(null);
    const p = game.players[localPlayer];

    if (sel.length) {
      const units = sel.filter(u => u.kind === 'unit');
      const b = sel.find(u => u.kind === 'building');
      if (state.subMenu && units.some(u => SC.Engine.isWorker(u))) {
        const menu = SC.DATA.buildMenu[p.race][state.subMenu === 'build' ? 'basic' : 'adv'];
        menu.forEach((bid, i) => {
          if (i < 8) cells[i] = buildCell(bid);
        });
        cells[8] = { label: '취소', hk: 'Esc', cls: 'cancel', fn: () => { state.subMenu = null; updateHud(); } };
      } else if (units.length) {
        const first = units[0];
        const canMv = units.some(u => u.tid !== 'larva');
        if (canMv) {
          cells[0] = { label: '이동', hk: 'M', icon: 'move', fn: () => startTargeting({ move: true }) };
          cells[1] = { label: '정지', hk: 'S', icon: 'stop', fn: () => { cmd({ k: 'stp', ids: units.map(u => u.id) }); } };
          const hasWep = units.some(u => SC.DATA.all[u.tid].g || SC.DATA.all[u.tid].a);
          if (hasWep || units.some(u => !SC.Engine.isWorker(u)))
            cells[2] = { label: '공격', hk: 'A', icon: 'attack', fn: () => startTargeting({ attack: true }) };
          cells[3] = { label: '순찰', hk: 'P', icon: 'patrol', fn: () => startTargeting({ patrol: true }) };
          cells[4] = { label: '홀드', hk: 'H', icon: 'hold', fn: () => { cmd({ k: 'hld', ids: units.map(u => u.id) }); } };
        }
        const isW = units.some(u => SC.Engine.isWorker(u));
        if (isW) {
          cells[5] = { label: '기본 건물', hk: 'B', icon: 'build', fn: () => { state.subMenu = 'build'; updateHud(); } };
          cells[6] = { label: '고급 건물', hk: 'V', icon: 'build2', fn: () => { state.subMenu = 'buildAdv'; updateHud(); } };
          if (units.some(u => u.carry)) cells[7] = { label: '자원 반환', hk: 'C', fn: () => cmd({ k: 'ret', ids: units.map(u => u.id) }) };
        }
        // 어빌리티 채우기
        let slot = 5;
        if (isW) slot = 8;
        const seen = new Set();
        for (const u of units) {
          for (const abId of unitAbilities(u)) {
            if (seen.has(abId) || slot > 8) continue;
            seen.add(abId);
            const ab = SC.DATA.abilities[abId];
            if (!ab) continue;
            const avail = !ab.req || p.research[ab.req] ||
              ['unsiege', 'unburrow', 'heal', 'repair', 'consume', 'parasite', 'dark_swarm', 'dmatrix', 'feedback', 'nuke_paint', 'merge_archon', 'merge_dark_archon'].includes(abId);
            cells[slot] = { label: ab.name, hk: (ab.hk || '').toUpperCase(), dim: !avail, en: ab.en,
              fn: () => triggerAbility(abId, units) };
            slot++;
          }
        }
        // 라바
        const larvae = units.filter(u => u.tid === 'larva');
        if (larvae.length) {
          SC.DATA.larvaTrains.forEach((uid, i) => {
            if (i > 8) return;
            cells[i] = trainCell(uid, () => cmd({ k: 'mor', ids: [larvae[0].id], u: uid }));
          });
        }
        // 변태 유닛 버튼
        if (units.some(u => u.tid === 'hydralisk') && p.research.lurker_aspect)
          cells[8] = trainCell('lurker', () => cmd({ k: 'mor', ids: units.filter(u => u.tid === 'hydralisk').map(u => u.id), u: 'lurker' }));
        if (units.some(u => u.tid === 'mutalisk') && SC.Engine.hasBuilding(game, p, 'greater_spire')) {
          cells[7] = trainCell('guardian', () => cmd({ k: 'mor', ids: units.filter(u => u.tid === 'mutalisk').map(u => u.id), u: 'guardian' }));
          cells[8] = trainCell('devourer', () => cmd({ k: 'mor', ids: units.filter(u => u.tid === 'mutalisk').map(u => u.id), u: 'devourer' }));
        }
        const morphing = units.filter(u => u.morph);
        if (morphing.length)
          cells[8] = { label: '변태 취소', cls: 'cancel', fn: () => { for (const mu of morphing) cmd({ k: 'cnb', t: mu.id }); } };
        if (units.filter(u => u.tid === 'high_templar').length >= 2)
          cells[8] = { label: '집정관 합체', hk: 'R', fn: () => cmd({ k: 'mrg', ids: units.map(u => u.id) }) };
        if (units.filter(u => u.tid === 'dark_templar').length >= 2)
          cells[7] = { label: '암흑 집정관', hk: 'R', fn: () => cmd({ k: 'mrg', ids: units.map(u => u.id) }) };
        if (units.some(u => (SC.DATA.all[u.tid].slots || 0) > 0))
          cells[7] = { label: '내리기', hk: 'D', fn: () => startTargeting({ unload: true }) };
      } else if (b) {
        const bDef = SC.DATA.all[b.tid];
        if (!b.complete) {
          cells[8] = { label: '건설 취소', hk: 'Esc', cls: 'cancel', fn: () => cmd({ k: 'cnb', t: b.id }) };
        } else {
          const isLarvaHall = (bDef.flags || []).includes('larvaSpawner');
          const p3 = game.players[localPlayer];
          const resList = (bDef.researches || []).concat(b.addonDef ? (b.addonDef.researches || []) : [])
            .concat(isLarvaHall ? ['burrow_tech'] : []);
          const morphs = (bDef.morphTo ? [bDef.morphTo] : []).concat(bDef.morphChoices || []);
          const trainViaLarva = uid => () => {
            const lv = game.units.filter(u => !u.dead && u.tid === 'larva' && u.hatch === b.id);
            if (lv.length) cmd({ k: 'mor', ids: [lv[0].id], u: uid });
            else { addMsg('애벌레가 없습니다'); SC.Audio.play('error'); }
          };
          if (isLarvaHall && state.subMenu !== 'hatchMore') {
            SC.DATA.larvaTrains.slice(0, 8).forEach((uid, j) => { cells[j] = trainCell(uid, trainViaLarva(uid)); });
            cells[8] = { label: '기타 ▸', fn: () => { state.subMenu = 'hatchMore'; updateHud(); } };
          } else if (isLarvaHall) {
            // 부화장 2페이지: 울트라리스크 / 연구 / 변태
            let s2 = 0;
            cells[s2++] = trainCell('ultralisk', trainViaLarva('ultralisk'));
            for (const rid of resList) {
              const r = SC.DATA.research[rid];
              if (!r || (p3.research[rid] || 0) >= r.lv) continue;
              if (s2 > 6) break;
              cells[s2++] = researchCell(rid, b);
            }
            for (const mid of morphs) {
              if (s2 > 6) break;
              const mdef = SC.DATA.all[mid];
              if (SC.Engine.meetsReq(game, p3, mdef)) cells[s2++] = buildCell(mid, () => cmd({ k: 'morB', t: b.id, u: mid }));
            }
            if (b.morph) cells[7] = { label: '변태 취소', cls: 'cancel', fn: () => cmd({ k: 'cnb', t: b.id }) };
            cells[8] = { label: '◂ 뒤로', fn: () => { state.subMenu = null; updateHud(); } };
          } else {
            let i = 0;
            const trains = (bDef.trains || []).concat(b.addonDef ? (b.addonDef.trains || []) : []);
            for (const uid of trains) { if (i < 6) cells[i++] = trainCell(uid, () => cmd({ k: 'trn', t: b.id, u: uid })); }
            let slot2 = i;
            for (const rid of resList) {
              const r = SC.DATA.research[rid];
              if (!r) continue;
              const cur = p3.research[rid] || 0;
              if (cur >= r.lv) continue;
              if (slot2 > 8) break;
              cells[slot2++] = researchCell(rid, b);
            }
            for (const mid of morphs) {
              if (slot2 > 8) break;
              const mdef = SC.DATA.all[mid];
              if (SC.Engine.meetsReq(game, p3, mdef)) cells[slot2++] = buildCell(mid, () => cmd({ k: 'morB', t: b.id, u: mid }));
            }
            if (!b.addon && !b.addonPending) for (const aid of (bDef.addons || [])) {
              if (slot2 > 8) break;
              const adef = SC.DATA.all[aid];
              if (SC.Engine.meetsReq(game, p3, adef)) cells[slot2++] = buildCell(aid, () => cmd({ k: 'add', t: b.id, u: aid }));
            }
            // 스캔 (컴샛 부착 사령부 또는 컴샛 직접 선택)
            if ((b.addonDef && (b.addonDef.abilities || []).includes('scan')) || (bDef.abilities || []).includes('scan')) {
              cells[6] = { label: '궤도 정찰', hk: 'S', en: 50, fn: () => startTargeting({ ability: 'scan', ids: [b.id] }) };
            }
            if (b.tid === 'bunker') cells[7] = { label: '모두 내리기', hk: 'L', fn: () => cmd({ k: 'uld', t: b.id }) };
            if (b.morph) cells[8] = { label: '취소', cls: 'cancel', fn: () => cmd({ k: 'cnb', t: b.id }) };
          }
        }
      }
    }

    for (let i = 0; i < 9; i++) {
      const cell = document.createElement('div');
      cell.className = 'cmd-btn' + (cells[i] ? '' : ' empty') + (cells[i] && cells[i].dim ? ' dim' : '') + (cells[i] && cells[i].cls ? ' ' + cells[i].cls : '');
      if (cells[i]) {
        const c = cells[i];
        if (c.iconTid) {
          const cv = document.createElement('canvas'); cv.width = 40; cv.height = 40;
          cv.getContext('2d').drawImage(SC.Gfx.getUnitIcon(c.iconTid, game.players[localPlayer].color), 0, 0);
          cell.appendChild(cv);
        }
        const lb = document.createElement('span'); lb.className = 'cmd-label'; lb.textContent = c.label;
        cell.appendChild(lb);
        if (c.hk) { const hk = document.createElement('em'); hk.className = 'cmd-hk'; hk.textContent = c.hk; cell.appendChild(hk); }
        if (c.tip) cell.title = c.tip;
        cell.addEventListener('mousedown', ev => { ev.stopPropagation(); SC.Audio.unlock(); if (!c.dim) c.fn(); else SC.Audio.play('error'); });
      }
      card.appendChild(cell);
    }
  }

  function costTip(def) {
    let t2 = `${def.name}`;
    if (def.min) t2 += ` — 미네랄 ${def.min}`;
    if (def.gas) t2 += ` 가스 ${def.gas}`;
    if (def.sup) t2 += ` 보급 ${def.sup / 2}`;
    if (def.bt) t2 += ` (${def.bt}초)`;
    return t2;
  }
  function trainCell(uid, fn) {
    const def = SC.DATA.all[uid];
    const p = game.players[localPlayer];
    const ok = SC.Engine.meetsReq(game, p, def);
    return { label: def.name, hk: (def.hk || '').toUpperCase(), iconTid: uid, dim: !ok, tip: costTip(def), fn };
  }
  function buildCell(bid, fnOverride) {
    const def = SC.DATA.all[bid];
    const p = game.players[localPlayer];
    const ok = SC.Engine.meetsReq(game, p, def);
    return { label: def.name, hk: (def.hk || '').toUpperCase(), iconTid: bid, dim: !ok, tip: costTip(def),
      fn: fnOverride || (() => beginPlace(bid)) };
  }
  function researchCell(rid, b) {
    const r = SC.DATA.research[rid];
    const p = game.players[localPlayer];
    const cur = p.research[rid] || 0;
    const cost = r.cost[cur];
    const inQ = (b.queue || []).some(q => q.isR && q.r === rid);
    return { label: r.name.split(' (')[0] + (r.lv > 1 ? ` ${cur + 1}` : ''), hk: researchHotkey(rid).toUpperCase(),
      dim: inQ, tip: `${r.name} — 미네랄 ${cost[0]} 가스 ${cost[1]}`,
      fn: () => { if (!inQ) { cmd({ k: 'rsr', t: b.id, r: rid }); SC.Audio.play('click'); } } };
  }

  // ---- 알림 처리 -------------------------------------------------------------
  let lastAlertIdx = 0;
  function processAlerts() {
    for (const a of game.alerts) {
      if (a.seen) continue;
      a.seen = true;
      if (a.p !== localPlayer && a.p !== -1) continue;
      switch (a.kind) {
        case 'attack': addMsg('⚠ 아군이 공격받고 있습니다!'); SC.Audio.play('alertAttack'); break;
        case 'minerals': addMsg('미네랄이 부족합니다'); SC.Audio.play('error'); break;
        case 'gas': addMsg('베스핀 가스가 부족합니다'); SC.Audio.play('error'); break;
        case 'supply': addMsg(game.players[localPlayer].race === 'Z' ? '대군주를 더 생산해야 합니다'
          : game.players[localPlayer].race === 'P' ? '수정탑을 더 건설해야 합니다' : '보급고를 더 건설해야 합니다'); SC.Audio.play('error'); break;
        case 'place': addMsg('그곳에 건설할 수 없습니다'); SC.Audio.play('error'); break;
        case 'energy': addMsg('에너지가 부족합니다'); SC.Audio.play('error'); break;
        case 'built': SC.Audio.play('built'); break;
        case 'research': addMsg(`연구 완료: ${SC.DATA.research[a.r] ? SC.DATA.research[a.r].name : ''}`); SC.Audio.play('research'); break;
        case 'nuke': addMsg('☢ 핵 공격이 감지되었습니다!'); SC.Audio.play('nukeWarn'); break;
        case 'eliminated': addMsg(`${game.players[a.who].name} 님이 제거되었습니다`); break;
      }
    }
    // 채팅
    for (const c of game.chat) {
      if (c.seen) continue;
      c.seen = true;
      addMsg(`<${game.players[c.p].name}> ${c.msg}`);
      SC.Audio.play('chat');
    }
  }

  // ---- 사운드 이벤트 ----------------------------------------------------------
  function processSfx() {
    let n = 0;
    for (const s of game.sfx) {
      if (s.seen) continue;
      s.seen = true;
      if (n > 4) break;
      const x = s.x / ONE, y = s.y / ONE;
      const onScreen = x > cam.x - 200 && x < cam.x + viewW + 200 && y > cam.y - 200 && y < cam.y + viewH + 200;
      if (!onScreen && !['nuke', 'built', 'research', 'ready'].includes(s.k)) continue;
      if (['built', 'research', 'ready'].includes(s.k) && s.o !== localPlayer) continue;
      SC.Audio.play(s.k);
      n++;
    }
  }

  // ---- 프레임 렌더 -----------------------------------------------------------
  let lastFrame = performance.now();
  UI.frame = function () {
    if (!game) return;
    const now = performance.now();
    const dt = Math.min(60, now - lastFrame);
    lastFrame = now;
    scrollTick(dt);
    processAlerts();
    processSfx();

    // 월드
    SC.Gfx.render(ctx, game, cam, viewW, viewH, localPlayer, state);

    ctx.save();
    ctx.translate(-cam.x, -cam.y);
    // 명령 플래시
    for (let i = orderFlashes.length - 1; i >= 0; i--) {
      const f = orderFlashes[i];
      const age = (now - f.t) / 500;
      if (age > 1) { orderFlashes.splice(i, 1); continue; }
      ctx.strokeStyle = f.col; ctx.globalAlpha = 1 - age; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(f.x, f.y, 14 * (1 - age * 0.5), 7 * (1 - age * 0.5), 0, 0, 7); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // 랠리 표시
    const sel = myUnits();
    for (const b of sel) {
      if (b.kind !== 'building' || !b.rally) continue;
      let rx, ry;
      if (b.rally.t) { const r = SC.Engine.resById(game, b.rally.t) || SC.Engine.byId(game, b.rally.t); if (!r) continue; rx = r.x / ONE; ry = r.y / ONE; }
      else { rx = b.rally.x / ONE; ry = b.rally.y / ONE; }
      ctx.strokeStyle = 'rgba(60,220,90,0.6)'; ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 5]);
      ctx.beginPath(); ctx.moveTo(b.x / ONE, b.y / ONE); ctx.lineTo(rx, ry); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(60,220,90,0.8)';
      ctx.beginPath(); ctx.moveTo(rx, ry - 10); ctx.lineTo(rx + 7, ry - 3); ctx.lineTo(rx, ry + 2); ctx.closePath(); ctx.fill();
      ctx.fillRect(rx - 1, ry - 10, 2, 14);
    }
    // 배치 고스트
    if (state.placing) {
      const def = SC.DATA.all[state.placing.tid];
      const wx = (state.mouseX || 0) + cam.x, wy = (state.mouseY || 0) + cam.y;
      const tx = Math.round(wx / T - def.tiles[0] / 2), ty = Math.round(wy / T - def.tiles[1] / 2);
      const ok = (def.flags || []).includes('gas')
        ? game.res.some(r => r.kind === 'g' && !r.building && wx >= r.tx * T && wx <= (r.tx + r.w) * T && wy >= r.ty * T && wy <= (r.ty + r.h) * T)
        : SC.Engine.canPlace(game, localPlayer, state.placing.tid, tx, ty);
      for (let y = 0; y < def.tiles[1]; y++) for (let x = 0; x < def.tiles[0]; x++) {
        ctx.fillStyle = ok ? 'rgba(60,220,90,0.3)' : 'rgba(240,60,50,0.35)';
        ctx.fillRect((tx + x) * T + 1, (ty + y) * T + 1, T - 2, T - 2);
      }
      ctx.globalAlpha = 0.6;
      const bspr = SC.Gfx.getUnitIcon(state.placing.tid, game.players[localPlayer].color);
      ctx.drawImage(bspr, tx * T + def.tiles[0] * T / 2 - 20, ty * T + def.tiles[1] * T / 2 - 20);
      ctx.globalAlpha = 1;
      // 파일런 파워 범위
      if (state.placing.tid === 'pylon') {
        ctx.strokeStyle = 'rgba(87,200,255,0.5)';
        ctx.beginPath(); ctx.ellipse((tx + 1) * T, (ty + 1) * T, 7.5 * T, 7.5 * T * 0.7, 0, 0, 7); ctx.stroke();
      }
    }
    ctx.restore();

    // 드래그 박스
    if (state.drag) {
      const d = state.drag;
      ctx.strokeStyle = '#3ddc55'; ctx.lineWidth = 1;
      ctx.strokeRect(Math.min(d.x0, d.x1) + 0.5, Math.min(d.y0, d.y1) + 0.5, Math.abs(d.x1 - d.x0), Math.abs(d.y1 - d.y0));
    }
    // 메시지 로그
    ctx.font = '13px "Malgun Gothic", sans-serif';
    ctx.textAlign = 'left';
    let my2 = viewH - 20;
    for (let i = state.msgLog.length - 1; i >= 0; i--) {
      const m = state.msgLog[i];
      const age = (game.tick - m.t) / 24;
      if (age > 8) continue;
      ctx.fillStyle = `rgba(0,0,0,${Math.min(0.55, (8 - age))})`;
      ctx.fillText(m.text, 13, my2 + 1);
      ctx.fillStyle = `rgba(180,255,190,${Math.min(1, (8 - age))})`;
      ctx.fillText(m.text, 12, my2);
      my2 -= 19;
    }
    // 게임 시간
    const secs = Math.floor(game.tick / 24);
    $('game-clock').textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

    // HUD 주기 갱신
    if (game.tick !== lastHudTick && (game.tick & 7) === 0) { lastHudTick = game.tick; updateHud(); }

    // 미니맵
    SC.Gfx.renderMinimap(mmCtx, game, mmCanvas.width, cam, viewW, viewH, localPlayer);

    // 초상화
    const psel = selUnits();
    if (psel.length) {
      const u = psel[0];
      SC.Gfx.renderPortrait(portCtx, u.tid, portCanvas.width, game.tick);
    }
  };

  UI.centerCamera = function (x, y) { cam.x = x - viewW / 2; cam.y = y - viewH / 2; clampCam(); };
  UI.refresh = updateHud;

  SC.UI = UI;
})();
