/* =========================================================================
 *  net.js — 락스텝 동기화 드라이버 (로컬 / P2P 멀티플레이)
 *  - 결정적 시뮬레이션 위에 명령만 교환하는 클래식 P2P 락스텝
 *  - 시그널링: PeerJS 공개 브로커 — 호스트가 만든 4자리 방 코드만 입력하면
 *    연결됩니다 (게임 서버 불필요, 게임 데이터는 P2P 직접 전송)
 * ========================================================================= */
'use strict';
(function () {
  const TURN_TICKS = 6;          // 250ms 턴
  const INPUT_DELAY = 2;         // 명령 지연 턴
  const TICK_MS = 1000 / 24;

  const Net = {};
  Net.available = () => typeof Peer !== 'undefined';

  // ---- 로컬 드라이버 (싱글/AI전) ------------------------------------------------
  Net.createLocal = function (game, aiList) {
    const pending = [];
    let acc = 0, last = performance.now(), paused = false;
    const ais = aiList.map(a => SC.AI.create(a.pi, a.difficulty));
    return {
      mode: 'local',
      send(cmd) { pending.push(cmd); },
      setPaused(v) { paused = v; },
      step(now) {
        const dt = Math.min(200, now - last); last = now;
        if (paused) return true;
        acc += dt;
        let n = 0;
        while (acc >= TICK_MS && n < 8) {
          acc -= TICK_MS; n++;
          const aiCmds = [];
          for (const ai of ais) SC.AI.tick(game, ai, c => aiCmds.push(c));
          const cmds = pending.splice(0).concat(aiCmds);
          SC.Engine.step(game, cmds);
        }
        return true;
      },
      stop() {},
      waitingFor: () => null,
    };
  };

  // ---- 방 코드 --------------------------------------------------------------
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  function makeCode() {
    let s = '';
    for (let i = 0; i < 4; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    return s;
  }
  const peerId = code => 'proj-hunters-' + code.trim().toLowerCase();
  // 기본은 PeerJS 공개 브로커. window.PH_PEER 로 사설 브로커 지정 가능 (테스트/LAN용)
  const peerOpts = () => Object.assign({ debug: 0 }, window.PH_PEER || {});

  // ---- 호스트 ---------------------------------------------------------------
  Net.createHost = function (callbacks) {
    const host = {
      code: null, peer: null, guests: [],   // 접속 순서대로 {conn, open, name, race, slot, playerIndex}
      game: null, started: false, turn: 0, turnBuf: {}, myPending: [],
      acc: 0, lastT: 0, tickInTurn: 0, waiting: null, ais: [],
      mode: 'host',

      open() {
        return new Promise((resolve, reject) => {
          if (!Net.available()) { reject(new Error('네트워크 라이브러리를 불러오지 못했습니다 (인터넷 연결 확인)')); return; }
          let tries = 0;
          const attempt = () => {
            host.code = makeCode();
            const peer = host.peer = new Peer(peerId(host.code), peerOpts());
            peer.on('open', () => resolve(host.code));
            peer.on('error', e => {
              if (e.type === 'unavailable-id' && tries++ < 3) { peer.destroy(); attempt(); }
              else if (!host.code || !host.started) reject(new Error('연결 실패: ' + (e.type || e.message)));
            });
            peer.on('connection', conn => {
              const gu = { conn, open: false, name: null, race: 'R', slot: null, playerIndex: null };
              conn.on('open', () => { gu.open = true; });
              conn.on('data', m => {
                if (typeof m === 'string') { try { m = JSON.parse(m); } catch (e) { return; } }
                if (!m || !m.t) return;
                if (m.t === 'hello') {
                  gu.name = String(m.name || '게스트').slice(0, 12);
                  gu.race = ['T', 'Z', 'P', 'R'].includes(m.race) ? m.race : 'R';
                  host.guests.push(gu);
                  callbacks.onGuestJoin && callbacks.onGuestJoin(gu);
                } else if (m.t === 'cmds') host.recvCmds(m);
              });
              conn.on('close', () => {
                gu.open = false;
                callbacks.onGuestLeave && callbacks.onGuestLeave(gu);
              });
            });
          };
          attempt();
        });
      },

      sendTo(gu, obj) { if (gu && gu.open) { try { gu.conn.send(obj); } catch (e) {} } },
      broadcast(obj) { for (const gu of host.guests) host.sendTo(gu, obj); },

      startGame(cfg, game) {
        host.game = game; host.started = true; host.lastT = performance.now();
        host.turnBuf = {}; host.turn = 0; host.tickInTurn = 0;
        for (let i = 0; i < INPUT_DELAY; i++) host.turnBuf[i] = { all: [], got: {} };
        for (const gu of host.guests)
          if (gu.playerIndex != null) host.sendTo(gu, { t: 'start', cfg, you: gu.playerIndex });
        host.ais = cfg.players.map((p, i) => p.type === 'ai' ? SC.AI.create(i, p.difficulty || 'normal') : null).filter(Boolean);
      },
      send(cmd) { host.myPending.push(cmd); },
      recvCmds(m) {
        const tb = host.turnBuf[m.turn] = host.turnBuf[m.turn] || { all: [], got: {} };
        if (!tb.got[m.p]) { tb.got[m.p] = true; tb.all.push(...(m.cmds || [])); }
      },
      activePlayers() {
        return host.guests.filter(g2 => g2.open && g2.playerIndex != null).map(g2 => g2.playerIndex);
      },
      step(now) {
        if (!host.started) return true;
        host.acc += Math.min(250, now - host.lastT); host.lastT = now;
        while (host.acc >= TICK_MS) {
          if (host.tickInTurn === 0) {
            const need = host.turn;
            const tb = host.turnBuf[need];
            const expect = host.activePlayers();
            const ready = tb && expect.every(pi => need < INPUT_DELAY || (tb.got && tb.got[pi]));
            if (!ready) { host.waiting = expect.filter(pi => !(tb && tb.got && tb.got[pi])); host.acc = Math.min(host.acc, TICK_MS * 2); return true; }
            host.waiting = null;
            const future = host.turn + INPUT_DELAY;
            const fb = host.turnBuf[future] = host.turnBuf[future] || { all: [], got: {} };
            fb.all.push(...host.myPending.splice(0));
            for (const ai of host.ais) SC.AI.tick(host.game, ai, c => fb.all.push(c));
            const h = (host.turn % 16 === 0) ? SC.Engine.hash(host.game) : undefined;
            host.broadcast({ t: 'turn', turn: need, all: host.turnBuf[need].all, hash: h });
          }
          SC.Engine.step(host.game, host.tickInTurn === 0 ? (host.turnBuf[host.turn].all || []) : null);
          host.acc -= TICK_MS;
          host.tickInTurn++;
          if (host.tickInTurn >= TURN_TICKS) {
            delete host.turnBuf[host.turn - 4];
            host.turn++; host.tickInTurn = 0;
          }
        }
        return true;
      },
      waitingFor() { return host.waiting; },
      stop() { try { host.peer && host.peer.destroy(); } catch (e) {} },
    };
    return host;
  };

  // ---- 게스트 ---------------------------------------------------------------
  Net.createGuest = function (callbacks) {
    const guest = {
      peer: null, conn: null, open: false,
      game: null, started: false, localPlayer: 1,
      turn: 0, tickInTurn: 0, turnBuf: {}, myPending: [], acc: 0, lastT: 0, waiting: null,
      hashCheck: {}, desyncWarned: false,
      mode: 'guest',

      join(code, name, race) {
        return new Promise((resolve, reject) => {
          if (!Net.available()) { reject(new Error('네트워크 라이브러리를 불러오지 못했습니다 (인터넷 연결 확인)')); return; }
          if (!code || code.trim().length < 4) { reject(new Error('방 코드 4자리를 입력하십시오')); return; }
          let settled = false;
          const fail = msg => { if (!settled) { settled = true; reject(new Error(msg)); } };
          const peer = guest.peer = new Peer(peerOpts());
          peer.on('error', e => {
            if (e.type === 'peer-unavailable') fail('해당 방 코드를 찾을 수 없습니다');
            else fail('연결 실패: ' + (e.type || e.message));
          });
          peer.on('open', () => {
            const conn = guest.conn = peer.connect(peerId(code), { reliable: true });
            conn.on('open', () => {
              guest.open = true;
              conn.send({ t: 'hello', name, race });
              if (!settled) { settled = true; resolve(); }
              callbacks.onConnected && callbacks.onConnected();
            });
            conn.on('data', m => {
              if (typeof m === 'string') { try { m = JSON.parse(m); } catch (e) { return; } }
              if (!m || !m.t) return;
              if (m.t === 'start') callbacks.onStart(m.cfg, m.you);
              else if (m.t === 'turn') {
                guest.turnBuf[m.turn] = m.all;
                if (m.hash !== undefined) guest.hashCheck[m.turn] = m.hash;
              }
            });
            conn.on('close', () => { guest.open = false; callbacks.onDisconnected && callbacks.onDisconnected(); });
          });
          setTimeout(() => fail('연결 시간 초과 — 방 코드를 확인하십시오'), 15000);
        });
      },

      startGame(game, localPlayer) {
        guest.game = game; guest.localPlayer = localPlayer; guest.started = true;
        guest.lastT = performance.now(); guest.turn = 0; guest.tickInTurn = 0;
      },
      send(cmd) { guest.myPending.push(cmd); },
      step(now) {
        if (!guest.started) return true;
        guest.acc += Math.min(250, now - guest.lastT); guest.lastT = now;
        while (guest.acc >= TICK_MS) {
          if (guest.tickInTurn === 0) {
            const all = guest.turnBuf[guest.turn];
            if (all === undefined) { guest.waiting = ['host']; guest.acc = Math.min(guest.acc, TICK_MS * 2); return true; }
            guest.waiting = null;
            if (guest.open) {
              guest.conn.send({ t: 'cmds', turn: guest.turn + INPUT_DELAY, p: guest.localPlayer, cmds: guest.myPending.splice(0) });
            }
            const hc = guest.hashCheck[guest.turn];
            if (hc !== undefined) {
              if (SC.Engine.hash(guest.game) !== hc && !guest.desyncWarned) {
                guest.desyncWarned = true;
                callbacks.onDesync && callbacks.onDesync();
              }
              delete guest.hashCheck[guest.turn];
            }
          }
          SC.Engine.step(guest.game, guest.tickInTurn === 0 ? guest.turnBuf[guest.turn] : null);
          guest.acc -= TICK_MS;
          guest.tickInTurn++;
          if (guest.tickInTurn >= TURN_TICKS) {
            delete guest.turnBuf[guest.turn - 4];
            guest.turn++; guest.tickInTurn = 0;
          }
        }
        return true;
      },
      waitingFor() { return guest.waiting; },
      stop() { try { guest.peer && guest.peer.destroy(); } catch (e) {} },
    };
    return guest;
  };

  SC.Net = Net;
})();
