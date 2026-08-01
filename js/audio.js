/* =========================================================================
 *  audio.js — WebAudio 신디사이저 SFX (오리지널 자체 생성 사운드)
 * ========================================================================= */
'use strict';
(function () {
  let ctx = null, master = null, noiseBuf = null;
  let sfxVol = 0.5, ambient = null;
  const A = {};

  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = sfxVol;
      master.connect(ctx.destination);
      const len = ctx.sampleRate * 1.2;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { return false; }
    return true;
  }
  A.unlock = function () { if (ensure() && ctx.state === 'suspended') ctx.resume(); };
  A.setVolume = function (v) { sfxVol = v; if (master) master.gain.value = v; };

  function tone(freq, dur, type, vol, slide, delay) {
    if (!ensure()) return;
    const t0 = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    g.gain.setValueAtTime(vol || 0.15, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function noise(dur, vol, freq, q, slide, delay) {
    if (!ensure()) return;
    const t0 = ctx.currentTime + (delay || 0);
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass';
    f.frequency.setValueAtTime(freq || 800, t0);
    if (slide) f.frequency.exponentialRampToValueAtTime(Math.max(40, (freq || 800) + slide), t0 + dur);
    f.Q.value = q || 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol || 0.2, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0, Math.random() * 0.5); src.stop(t0 + dur + 0.02);
  }

  const FIRE_GUN = new Set(['fire_marine', 'fire_ghost', 'fire_goliath', 'fire_bunker', 'fire_vulture']);
  const FIRE_LASER = new Set(['fire_wraith', 'fire_battlecruiser', 'fire_scout', 'fire_interceptor', 'fire_arbiter', 'fire_corsair']);
  const FIRE_PSI = new Set(['fire_dragoon', 'fire_photon_cannon', 'fire_archon', 'fire_zealot', 'fire_dark_templar']);
  const FIRE_BIO = new Set(['fire_hydralisk', 'fire_mutalisk', 'fire_sunken_colony', 'fire_spore_colony', 'fire_zergling', 'fire_ultralisk', 'fire_guardian', 'fire_devourer', 'fire_broodling', 'fire_queen', 'fire_lurker']);

  A.play = function (k) {
    if (!ctx && !ensure()) return;
    if (k.startsWith('fire_')) {
      if (FIRE_GUN.has(k)) { noise(0.07, 0.12, 2200, 2, -1400); return; }
      if (FIRE_LASER.has(k)) { tone(1400, 0.12, 'sawtooth', 0.06, -900); return; }
      if (FIRE_PSI.has(k)) { tone(600, 0.15, 'sine', 0.1, 500); return; }
      if (FIRE_BIO.has(k)) { noise(0.12, 0.1, 700, 1.5, -350); return; }
      if (k === 'fire_siege_tank') { noise(0.25, 0.22, 500, 1, -350); tone(90, 0.22, 'triangle', 0.2, -40); return; }
      if (k === 'fire_firebat') { noise(0.3, 0.12, 900, 0.6, -200); return; }
      noise(0.08, 0.1, 1500, 2, -800); return;
    }
    switch (k) {
      case 'click': tone(900, 0.04, 'square', 0.05); break;
      case 'select': tone(700, 0.05, 'square', 0.06, 200); break;
      case 'ack': tone(500, 0.06, 'square', 0.06, 150); tone(750, 0.05, 'square', 0.05, 0, 0, 0.05); break;
      case 'ackAtk': tone(400, 0.07, 'sawtooth', 0.07, -100); tone(600, 0.06, 'sawtooth', 0.06, 0, 0, 0.06); break;
      case 'error': tone(180, 0.16, 'square', 0.1, -40); break;
      case 'expl': case 'death': noise(0.35, 0.2, 400, 0.8, -300); tone(70, 0.3, 'triangle', 0.15, -30); break;
      case 'bdeath': noise(0.7, 0.3, 300, 0.7, -220); tone(55, 0.6, 'triangle', 0.2, -25); break;
      case 'gib': noise(0.2, 0.15, 900, 1, -500); break;
      case 'built': tone(520, 0.1, 'sine', 0.12); tone(660, 0.1, 'sine', 0.12, 0, 0, 0.09); tone(880, 0.16, 'sine', 0.12, 0, 0, 0.18); break;
      case 'buildStart': noise(0.2, 0.1, 600, 1, 300); break;
      case 'ready': tone(660, 0.07, 'square', 0.08); tone(990, 0.09, 'square', 0.08, 0, 0, 0.07); break;
      case 'research': tone(440, 0.1, 'sine', 0.1); tone(550, 0.1, 'sine', 0.1, 0, 0, 0.1); tone(660, 0.1, 'sine', 0.1, 0, 0, 0.2); tone(880, 0.2, 'sine', 0.1, 0, 0, 0.3); break;
      case 'alertAttack': tone(880, 0.12, 'square', 0.14, -300); tone(880, 0.12, 'square', 0.14, -300, 0, 0.16); break;
      case 'nukeWarn': for (let i = 0; i < 4; i++) tone(950, 0.2, 'sawtooth', 0.14, -250, 0, i * 0.28); break;
      case 'nuke': noise(1.4, 0.4, 220, 0.5, -160); tone(45, 1.2, 'triangle', 0.3, -15); break;
      case 'storm': noise(0.8, 0.18, 2400, 0.8, -1200); break;
      case 'stim': tone(300, 0.08, 'sawtooth', 0.08, 500); break;
      case 'siege': noise(0.25, 0.12, 350, 1.5, -120); tone(140, 0.2, 'square', 0.08, -60); break;
      case 'burrow': noise(0.3, 0.14, 300, 1, -180); break;
      case 'irradiate': tone(1800, 0.4, 'sine', 0.06, -900); break;
      case 'plague': noise(0.4, 0.14, 500, 1, -250); break;
      case 'emp': tone(2200, 0.3, 'sawtooth', 0.08, -1800); break;
      case 'yamato': tone(200, 0.5, 'sawtooth', 0.16, 700); noise(0.5, 0.15, 800, 1, 400); break;
      case 'minerals': case 'gas': case 'supply': case 'place': tone(200, 0.14, 'square', 0.09, -50); break;
      case 'chat': tone(1100, 0.05, 'sine', 0.08); break;
      case 'victory': [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, 'sine', 0.14, 0, 0, i * 0.18)); break;
      case 'defeat': [400, 350, 300, 220].forEach((f, i) => tone(f, 0.35, 'triangle', 0.14, -30, 0, i * 0.22)); break;
      case 'menu': tone(600, 0.06, 'sine', 0.08, 200); break;
    }
  };

  // 은은한 배경 앰비언트
  A.startAmbient = function (race) {
    if (!ensure() || ambient) return;
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
    o1.type = 'sine'; o2.type = 'sine';
    const base = race === 'Z' ? 48 : race === 'P' ? 62 : 55;
    o1.frequency.value = base; o2.frequency.value = base * 1.5 + 1.2;
    g.gain.value = 0.018;
    o1.connect(g); o2.connect(g); g.connect(master);
    o1.start(); o2.start();
    ambient = { o1, o2, g };
  };
  A.stopAmbient = function () {
    if (!ambient) return;
    try { ambient.o1.stop(); ambient.o2.stop(); } catch (e) {}
    ambient = null;
  };

  SC.Audio = A;
})();
