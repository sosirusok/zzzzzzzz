/* =========================================================================
 *  net.js — 락스텝 동기화 드라이버 (로컬 / WebRTC 멀티플레이)
 *  - 결정적 시뮬레이션 위에 명령만 교환하는 클래식 P2P 락스텝
 *  - 시그널링: 수동 코드 교환 (서버 불필요) — 호스트가 초대 코드 생성,
 *    게스트가 응답 코드 반환
 * ========================================================================= */
'use strict';
(function () {
  const TURN_TICKS = 6;          // 250ms 턴
  const INPUT_DELAY = 2;         // 명령 지연 턴
  const TICK_MS = 1000 / 24;

  const Net = {};

  // ---- 로컬 드라이버 (싱글/AI전) ------------------------------------------------
  Net.createLocal = function (game, aiList) {
    const pending = [];
    let acc = 0, last = performance.now();
    const ais = aiList.map(a => SC.AI.create(a.pi, a.difficulty));
    return {
      mode: 'local',
      send(cmd) { pending.push(cmd); },
      step(now) {
        acc += Math.min(200, now - last); last = now;
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

  // ---- WebRTC 유틸 ----------------------------------------------------------
  const RTC_CFG = { iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }] };

  function compress(s) { return btoa(unescape(encodeURIComponent(s))); }
  function decompress(s) { return decodeURIComponent(escape(atob(s.trim()))); }

  function gatherDesc(pc) {
    return new Promise(res => {
      const timeout = setTimeout(() => res(pc.localDescription), 4000);
      pc.onicecandidate = e => {
        if (!e.candidate) { clearTimeout(timeout); res(pc.localDescription); }
      };
    });
  }

  // ---- 호스트 ---------------------------------------------------------------
  // slots: 게스트 접속 대기 목록. 각 게스트마다 offer 생성 → 코드 전달 → answer 수신
  Net.createHost = function (callbacks) {
    const guests = [];   // {pc, ch, name, race, slot, open}
    const host = {
      guests,
      async makeOffer(slotIdx) {
        const pc = new RTCPeerConnection(RTC_CFG);
        const ch = pc.createDataChannel('game', { ordered: true });
        const gu = { pc, ch, slot: slotIdx, open: false, name: null, race: null };
        guests[slotIdx] = gu;
        ch.onopen = () => { gu.open = true; };
        ch.onmessage = e => {
          const m = JSON.parse(e.data);
          if (m.t === 'hello') { gu.name = m.name; gu.race = m.race; callbacks.onGuestJoin(slotIdx, m.name, m.race); }
          else if (m.t === 'cmds') host.recvCmds(m);
          else if (m.t === 'chatLobby') callbacks.onLobbyChat && callbacks.onLobbyChat(m.name, m.msg);
        };
        ch.onclose = () => { gu.open = false; callbacks.onGuestLeave && callbacks.onGuestLeave(slotIdx); };
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        const desc = await gatherDesc(pc);
        return compress(JSON.stringify(desc));
      },
      async acceptAnswer(slotIdx, code) {
        const gu = guests[slotIdx];
        if (!gu) throw new Error('슬롯 없음');
        await gu.pc.setRemoteDescription(JSON.parse(decompress(code)));
      },
      broadcast(obj) {
        const s = JSON.stringify(obj);
        for (const gu of guests) if (gu && gu.open) { try { gu.ch.send(s); } catch (e) {} }
      },
      // ---- 게임 드라이버 ----
      game: null, turn: 0, turnBuf: {}, myPending: [], started: false,
      localPlayer: 0, acc: 0, lastT: 0, tickInTurn: 0, waiting: null,
      startGame(cfg, game) {
        host.game = game; host.started = true; host.lastT = performance.now();
        host.turnBuf = {}; host.turn = 0; host.tickInTurn = 0;
        // 첫 지연 턴은 빈 명령
        for (let i = 0; i < INPUT_DELAY; i++) host.turnBuf[i] = { all: [] };
        host.broadcast({ t: 'start', cfg });
        host.ais = (cfg.players.map((p, i) => p.type === 'ai' ? SC.AI.create(i, p.difficulty || 'normal') : null)).filter(Boolean);
      },
      send(cmd) { host.myPending.push(cmd); },
      recvCmds(m) {
        const tb = host.turnBuf[m.turn] = host.turnBuf[m.turn] || { all: [], got: {} };
        tb.got = tb.got || {};
        if (!tb.got[m.p]) { tb.got[m.p] = true; tb.all.push(...m.cmds); }
      },
      guestsExpected() {
        return guests.filter(g2 => g2 && g2.open).map(g2 => g2.slot);
      },
      step(now) {
        if (!host.started) return true;
        host.acc += Math.min(250, now - host.lastT); host.lastT = now;
        while (host.acc >= TICK_MS) {
          if (host.tickInTurn === 0) {
            // 이번 턴 데이터 준비 확인
            const need = host.turn;
            const tb = host.turnBuf[need];
            const expect = host.guestsExpected();
            const ready = tb && expect.every(s => need < INPUT_DELAY || (tb.got && tb.got[s]));
            if (!ready) { host.waiting = expect.filter(s => !(tb && tb.got && tb.got[s])); host.acc = Math.min(host.acc, TICK_MS * 2); return true; }
            host.waiting = null;
            // 자기+AI 명령을 미래 턴에 배치
            const future = host.turn + INPUT_DELAY;
            const fb = host.turnBuf[future] = host.turnBuf[future] || { all: [], got: {} };
            fb.all.push(...host.myPending.splice(0));
            for (const ai of host.ais) SC.AI.tick(host.game, ai, c => fb.all.push(c));
            fb.got[0] = true;
            // 확정 브로드캐스트
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
      stop() { for (const gu of guests) if (gu) try { gu.pc.close(); } catch (e) {} },
      mode: 'host',
    };
    return host;
  };

  // ---- 게스트 ---------------------------------------------------------------
  Net.createGuest = function (callbacks) {
    const guest = {
      pc: null, ch: null, open: false,
      game: null, started: false, localPlayer: 1,
      turn: 0, tickInTurn: 0, turnBuf: {}, myPending: [], acc: 0, lastT: 0, waiting: null,
      hashCheck: {},
      async acceptOffer(code, name, race) {
        const pc = guest.pc = new RTCPeerConnection(RTC_CFG);
        pc.ondatachannel = e => {
          guest.ch = e.channel;
          guest.ch.onopen = () => {
            guest.open = true;
            guest.ch.send(JSON.stringify({ t: 'hello', name, race }));
            callbacks.onConnected && callbacks.onConnected();
          };
          guest.ch.onmessage = ev => {
            const m = JSON.parse(ev.data);
            if (m.t === 'start') callbacks.onStart(m.cfg);
            else if (m.t === 'turn') {
              guest.turnBuf[m.turn] = m.all;
              if (m.hash !== undefined) guest.hashCheck[m.turn] = m.hash;
            }
          };
          guest.ch.onclose = () => { guest.open = false; callbacks.onDisconnected && callbacks.onDisconnected(); };
        };
        await pc.setRemoteDescription(JSON.parse(decompress(code)));
        const ans = await pc.createAnswer();
        await pc.setLocalDescription(ans);
        const desc = await gatherDesc(pc);
        return compress(JSON.stringify(desc));
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
            // 내 입력을 미래 턴으로 전송
            if (guest.open) {
              guest.ch.send(JSON.stringify({ t: 'cmds', turn: guest.turn + INPUT_DELAY, p: guest.localPlayer, cmds: guest.myPending.splice(0) }));
            }
            // 해시 검증
            const hc = guest.hashCheck[guest.turn];
            if (hc !== undefined) {
              const mine = SC.Engine.hash(guest.game);
              if (mine !== hc && !guest.desyncWarned) {
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
      stop() { try { guest.pc && guest.pc.close(); } catch (e) {} },
      mode: 'guest',
    };
    return guest;
  };

  SC.Net = Net;
})();
