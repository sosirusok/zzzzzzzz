/* =========================================================================
 *  main.js — 화면 흐름 (메인 메뉴 / 게임 설정 / 멀티 로비 / 인게임 / 결과)
 * ========================================================================= */
'use strict';
(function () {
  const $ = id => document.getElementById(id);
  const T = 32, ONE = 256;
  let game = null, driver = null, localPlayer = 0, rafId = 0, ended = false;

  // ---- 화면 전환 -------------------------------------------------------------
  function show(id) {
    for (const s of document.querySelectorAll('.screen')) s.classList.remove('active');
    $(id).classList.add('active');
  }

  // ---- 슬롯 설정 UI ----------------------------------------------------------
  const RACES = ['T', 'Z', 'P', 'R'];
  const RACE_NAME = { T: '테란', Z: '저그', P: '프로토스', R: '무작위' };
  function slotRows(container, mp) {
    container.innerHTML = '';
    const rows = [];
    for (let i = 0; i < 8; i++) {
      const row = document.createElement('div');
      row.className = 'slot-row';
      const state = { type: i === 0 ? 'human' : (i === 1 ? 'ai' : 'closed'), race: 'R', team: i + 1, diff: 'normal', name: null };
      const typeBtn = document.createElement('button');
      typeBtn.className = 'slot-type';
      const raceBtn = document.createElement('button');
      raceBtn.className = 'slot-race';
      const teamBtn = document.createElement('button');
      teamBtn.className = 'slot-team';
      const diffBtn = document.createElement('button');
      diffBtn.className = 'slot-diff';
      const colorDot = document.createElement('span');
      colorDot.className = 'slot-color';
      colorDot.style.background = SC.DATA.PLAYER_COLORS[i];
      const label = document.createElement('span');
      label.className = 'slot-label';
      label.textContent = `${i + 1}. ${SC.DATA.PLAYER_COLOR_NAMES[i]}`;

      const refresh = () => {
        typeBtn.textContent = state.type === 'human' ? (state.name || '플레이어') : state.type === 'ai' ? '컴퓨터' : state.type === 'open' ? '대기 중...' : '닫힘';
        raceBtn.textContent = RACE_NAME[state.race];
        teamBtn.textContent = `팀 ${state.team}`;
        diffBtn.textContent = state.diff === 'easy' ? '쉬움' : state.diff === 'hard' ? '어려움' : '보통';
        diffBtn.style.visibility = state.type === 'ai' ? 'visible' : 'hidden';
        raceBtn.disabled = state.type === 'closed';
        teamBtn.disabled = state.type === 'closed';
        row.classList.toggle('closed', state.type === 'closed');
      };
      typeBtn.onclick = () => {
        if (i === 0) return;
        const order = mp ? ['closed', 'ai', 'open'] : ['closed', 'ai'];
        let idx = order.indexOf(state.type);
        state.type = order[(idx + 1) % order.length];
        refresh(); if (mp && state.onOpenChange) state.onOpenChange();
      };
      raceBtn.onclick = () => { state.race = RACES[(RACES.indexOf(state.race) + 1) % 4]; refresh(); };
      teamBtn.onclick = () => { state.team = state.team % 4 + 1; refresh(); };
      diffBtn.onclick = () => { state.diff = state.diff === 'easy' ? 'normal' : state.diff === 'normal' ? 'hard' : 'easy'; refresh(); };
      row.append(colorDot, label, typeBtn, raceBtn, teamBtn, diffBtn);
      container.appendChild(row);
      rows.push({ state, refresh, row });
      refresh();
    }
    return rows;
  }

  function resolveRace(r, seedObj) {
    if (r !== 'R') return r;
    const opts = ['T', 'Z', 'P'];
    seedObj.v = (seedObj.v * 1103515245 + 12345) & 0x7fffffff;
    return opts[seedObj.v % 3];
  }

  function buildPlayers(rows, seed) {
    const seedObj = { v: seed };
    const players = [];
    const map = [];
    rows.forEach((r, i) => {
      if (r.state.type === 'closed') return;
      if (r.state.type === 'open' && !r.state.name) return;
      players.push({
        race: resolveRace(r.state.race, seedObj),
        team: r.state.team,
        color: SC.DATA.PLAYER_COLORS[i],
        name: r.state.type === 'ai' ? `컴퓨터 ${i + 1}` : (r.state.name || '플레이어'),
        type: r.state.type === 'ai' ? 'ai' : 'human',
        difficulty: r.state.diff,
        slotIndex: i,
      });
      map.push(i);
    });
    return { players, slotMap: map };
  }

  // ---- 맵 미리보기 ------------------------------------------------------------
  function drawPreview(canvasId) {
    const cv = $(canvasId);
    const x2 = cv.getContext('2d');
    const map = SC.MapGen.genHunters(20260801);
    const sc = cv.width / map.w;
    for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
      const t = map.tiles[y * map.w + x];
      x2.fillStyle = t === 2 ? '#181410' : t === 3 ? '#173d5c' : t === 1 ? '#6b5a3e' : t === 4 ? '#5d4f38' : '#4a3d2c';
      x2.fillRect(x * sc, y * sc, sc + 0.5, sc + 0.5);
    }
    for (const s of map.starts) {
      x2.fillStyle = '#3ddc55';
      x2.beginPath(); x2.arc(s.tx * sc, s.ty * sc, 4, 0, 7); x2.fill();
      x2.fillStyle = '#57c8ff';
      for (const m of s.minerals) x2.fillRect(m.tx * sc - 1, m.ty * sc - 1, 2.5, 2);
    }
  }

  // ---- 게임 시작 -------------------------------------------------------------
  function startGame(cfg, myIndex, netDriver) {
    ended = false;
    game = SC.Engine.createGame(cfg);
    localPlayer = myIndex;
    SC.Gfx.init(game);
    show('screen-game');
    if (netDriver) {
      driver = netDriver;
      if (driver.mode === 'host') driver.startGame(cfg, game);
      else driver.startGame(game, myIndex);
    } else {
      const ais = cfg.players.map((p, i) => p.type === 'ai' ? { pi: i, difficulty: p.difficulty } : null).filter(Boolean);
      driver = SC.Net.createLocal(game, ais);
    }
    SC.UI.init(game, localPlayer, c => driver.send(c));
    SC.Audio.startAmbient(cfg.players[myIndex].race);
    SC.debug = { game, driver, localPlayer };          // 테스트/디버그 용
    // 크립 렌더 갱신 훅
    const origStep = SC.Engine.step;
    cancelAnimationFrame(rafId);
    let lastCreepTick = 0;
    const loop = now => {
      rafId = requestAnimationFrame(loop);
      driver.step(now);
      if (game.creepDirty === false && game.tick - lastCreepTick > 48) { lastCreepTick = game.tick; game.creepDirtyGfx = true; }
      SC.UI.frame();
      const w = driver.waitingFor && driver.waitingFor();
      $('net-wait').style.display = w ? 'flex' : 'none';
      if (game.over && !ended) { ended = true; setTimeout(() => endScreen(), 900); }
    };
    rafId = requestAnimationFrame(loop);
  }

  function endScreen() {
    const p = game.players[localPlayer];
    const won = game.over.winner === p.team;
    SC.Audio.play(won ? 'victory' : 'defeat');
    SC.Audio.stopAmbient();
    $('end-title').textContent = won ? '승리!' : '패배';
    $('end-title').className = won ? 'win' : 'lose';
    const secs = Math.floor(game.over.tick / 24);
    let html = `<div class="end-time">경기 시간 ${Math.floor(secs / 60)}분 ${secs % 60}초 — 헌팅 그라운드</div>`;
    html += '<table><tr><th>플레이어</th><th>종족</th><th>생산</th><th>처치</th><th>파괴</th><th>손실</th><th>미네랄</th><th>가스</th></tr>';
    game.players.forEach((pl, i) => {
      const s = game.stats[i];
      html += `<tr style="color:${pl.color}"><td>${pl.name}${pl.defeated ? ' ✝' : ''}</td><td>${SC.DATA.RACES[pl.race].name}</td>` +
        `<td>${s.produced}</td><td>${s.killed}</td><td>${s.razed}</td><td>${s.lost}</td><td>${s.mineralsGathered}</td><td>${s.gasGathered}</td></tr>`;
    });
    html += '</table>';
    $('end-stats').innerHTML = html;
    show('screen-end');
  }

  function quitToMenu() {
    cancelAnimationFrame(rafId);
    if (driver) { driver.stop(); driver = null; }
    game = null;
    SC.Audio.stopAmbient();
    show('screen-main');
  }

  // ---- 메인 메뉴 배선 ---------------------------------------------------------
  window.addEventListener('DOMContentLoaded', () => {
    // 별 배경
    const stars = $('starfield');
    if (stars) {
      const x2 = stars.getContext('2d');
      stars.width = innerWidth; stars.height = innerHeight;
      for (let i = 0; i < 300; i++) {
        const b = Math.random();
        x2.fillStyle = `rgba(${180 + b * 75},${190 + b * 65},255,${0.2 + b * 0.8})`;
        x2.fillRect(Math.random() * stars.width, Math.random() * stars.height, b > 0.9 ? 2 : 1, b > 0.9 ? 2 : 1);
      }
    }

    $('btn-single').onclick = () => { SC.Audio.unlock(); SC.Audio.play('menu'); show('screen-setup'); drawPreview('map-preview'); };
    $('btn-multi').onclick = () => { SC.Audio.unlock(); SC.Audio.play('menu'); show('screen-multi'); };
    $('btn-credits').onclick = () => { SC.Audio.play('menu'); show('screen-credits'); };
    for (const b of document.querySelectorAll('.btn-back')) b.onclick = () => { SC.Audio.play('menu'); show('screen-main'); };

    // ---- 싱글 ----
    const singleRows = slotRows($('single-slots'), false);
    $('btn-start-single').onclick = () => {
      SC.Audio.play('menu');
      const seed = (Date.now() % 1000000000) | 0;
      const { players } = buildPlayers(singleRows, seed);
      if (players.filter(p => p.type === 'human').length !== 1) return;
      if (players.length < 2) { alert('상대를 최소 1명 추가하십시오 (슬롯 클릭 → 컴퓨터)'); return; }
      const myIndex = players.findIndex(p => p.type === 'human');
      startGame({ seed, mapSeed: 20260801, players }, myIndex, null);
    };

    // ---- 멀티 ----
    $('btn-host').onclick = () => { SC.Audio.play('menu'); show('screen-host'); initHost(); };
    $('btn-join').onclick = () => { SC.Audio.play('menu'); show('screen-join'); };

    // 호스트: 방 코드 자동 생성, 게스트는 빈 슬롯에 자동 배치
    let host = null, hostRows = null;
    function initHost() {
      hostRows = slotRows($('host-slots'), true);
      hostRows[0].state.name = $('host-name').value || '호스트';
      hostRows[0].refresh();
      $('room-code').textContent = '····';
      $('host-status').textContent = '방 생성 중...';
      host = SC.Net.createHost({
        onGuestJoin(gu) {
          // 첫 빈 슬롯(1~7)에 자동 배치
          for (let i = 1; i < 8; i++) {
            const st = hostRows[i].state;
            if (st.type !== 'ai' && !st.name) {
              st.type = 'open'; st.name = gu.name;
              if (gu.race && gu.race !== 'R') st.race = gu.race;
              gu.slot = i;
              hostRows[i].refresh();
              $('host-status').textContent = `${gu.name} 님 참가 (슬롯 ${i + 1})`;
              SC.Audio.play('chat');
              return;
            }
          }
          $('host-status').textContent = '빈 슬롯이 없습니다';
        },
        onGuestLeave(gu) {
          if (gu.slot != null && hostRows[gu.slot]) {
            hostRows[gu.slot].state.name = null;
            hostRows[gu.slot].state.type = 'closed';
            hostRows[gu.slot].refresh();
            $('host-status').textContent = `${gu.name || '게스트'} 님이 나갔습니다`;
          }
        },
      });
      host.open().then(code => {
        $('room-code').textContent = code;
        $('host-status').textContent = '상대에게 방 코드를 알려주세요';
      }).catch(e => { $('host-status').textContent = e.message; });
    }
    $('btn-start-host').onclick = () => {
      const seed = (Date.now() % 1000000000) | 0;
      hostRows[0].state.name = $('host-name').value || '호스트';
      const { players } = buildPlayers(hostRows, seed);
      if (players.length < 2) { alert('상대가 필요합니다 (게스트 접속 대기 또는 슬롯 클릭 → 컴퓨터)'); return; }
      const cfg = { seed, mapSeed: 20260801, players };
      // 게스트 → 플레이어 인덱스 매핑
      for (const gu of host.guests) {
        gu.playerIndex = gu.slot != null ? players.findIndex(p => p.slotIndex === gu.slot) : null;
        if (gu.playerIndex < 0) gu.playerIndex = null;
      }
      startGame(cfg, players.findIndex(p => p.slotIndex === 0), host);
    };
    $('btn-back-host').onclick = () => { if (host) host.stop(); host = null; show('screen-multi'); };

    // 게스트: 방 코드 입력만으로 접속
    let guest = null;
    $('btn-join-go').onclick = async () => {
      const name = $('join-name').value || '게스트';
      const race = $('join-race').value;
      const code = $('join-code').value.trim().toUpperCase();
      if (guest) { guest.stop(); guest = null; }
      guest = SC.Net.createGuest({
        onConnected() { $('join-status').textContent = '접속 완료! 호스트가 게임을 시작하면 자동으로 입장합니다.'; },
        onStart(cfg, you) { startGame(cfg, you != null && you >= 0 ? you : 0, guest); },
        onDisconnected() { if (!game) $('join-status').textContent = '연결이 끊어졌습니다'; },
        onDesync() { SC.UI.addMsg('⚠ 동기화 오류가 감지되었습니다'); },
      });
      try {
        $('join-status').textContent = '접속 중...';
        $('btn-join-go').disabled = true;
        await guest.join(code, name, race);
      } catch (e) { $('join-status').textContent = e.message; }
      $('btn-join-go').disabled = false;
    };
    $('btn-back-join').onclick = () => { if (guest) { guest.stop(); guest = null; } show('screen-multi'); };

    // ---- 인게임 메뉴 ----
    $('btn-resume').onclick = () => SC.UI.toggleMenu();
    $('btn-surrender').onclick = () => { driver.send({ p: localPlayer, k: 'resign' }); SC.UI.toggleMenu(); };
    $('btn-quit').onclick = quitToMenu;
    $('btn-end-menu').onclick = quitToMenu;
    $('vol-slider').oninput = e => SC.Audio.setVolume(parseFloat(e.target.value));
    $('menu-open-btn').onclick = () => SC.UI.toggleMenu();

    // 리소스 아이콘 생성
    genResIcons();
  });

  function genResIcons() {
    const mk = (draw) => {
      const c = document.createElement('canvas'); c.width = 18; c.height = 18;
      draw(c.getContext('2d'));
      return `url(${c.toDataURL()})`;
    };
    const min = mk(x2 => {
      const gr = x2.createLinearGradient(0, 14, 0, 2);
      gr.addColorStop(0, '#1a5a9a'); gr.addColorStop(1, '#bfe8ff');
      x2.fillStyle = gr;
      x2.beginPath(); x2.moveTo(2, 13); x2.lineTo(6, 3); x2.lineTo(10, 13); x2.closePath(); x2.fill();
      x2.beginPath(); x2.moveTo(8, 14); x2.lineTo(12, 6); x2.lineTo(16, 14); x2.closePath(); x2.fill();
    });
    const gas = mk(x2 => {
      x2.fillStyle = '#2c6a44'; x2.beginPath(); x2.arc(9, 11, 6, 0, 7); x2.fill();
      x2.fillStyle = '#7bd48a'; x2.beginPath(); x2.arc(9, 10, 4, 0, 7); x2.fill();
      x2.fillStyle = 'rgba(160,255,170,0.7)'; x2.beginPath(); x2.arc(7, 5, 2, 0, 7); x2.fill();
      x2.beginPath(); x2.arc(11, 3, 1.5, 0, 7); x2.fill();
    });
    const sup = mk(x2 => {
      x2.strokeStyle = '#b8c8d8'; x2.lineWidth = 1.6;
      x2.strokeRect(3, 3, 12, 12);
      x2.fillStyle = '#b8c8d8';
      x2.fillRect(5, 9, 3, 6); x2.fillRect(9, 6, 3, 9);
    });
    document.querySelector('#res-min-box .res-icon').style.backgroundImage = min;
    document.querySelector('#res-gas-box .res-icon').style.backgroundImage = gas;
    document.querySelector('#res-sup-box .res-icon').style.backgroundImage = sup;
  }
})();
