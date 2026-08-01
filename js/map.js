/* =========================================================================
 *  map.js — '헌팅 그라운드' 맵 생성 (12시부터 45도 간격 8개 스타팅, 중앙 개활지)
 *  + A* 길찾기
 *  타일 종류: 0 저지대, 1 고지대, 2 절벽(불가), 3 물(불가), 4 경사로, 5 바위장식
 * ========================================================================= */
'use strict';
(function () {
  const T = 32;

  // ---- 결정적 RNG ----------------------------------------------------------
  function mulberry(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 12시=0도, 시계방향. sin/cos 하드코딩 테이블 (결정성 보장)
  const ANG = [
    [0, -1], [0.7071, -0.7071], [1, 0], [0.7071, 0.7071],
    [0, 1], [-0.7071, 0.7071], [-1, 0], [-0.7071, -0.7071],
  ];
  const CLOCK_NAME = ['12시', '1시 반', '3시', '4시 반', '6시', '7시 반', '9시', '10시 반'];

  function genHunters(seed) {
    const W = 128, H = 128;
    const g = new Uint8Array(W * H);        // 타일 종류
    const hgt = new Uint8Array(W * H);      // 0 저 1 고 2 램프
    const rnd = mulberry(seed || 20260801);
    const idx = (x, y) => y * W + x;
    const inB = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
    const cx = 64, cy = 64;

    // 스타팅 지점 계산
    const starts = [];
    for (let k = 0; k < 8; k++) {
      const diag = (k % 2) === 1;
      const R = diag ? 61 : 46;
      const mx = Math.round(cx + ANG[k][0] * R);
      const my = Math.round(cy + ANG[k][1] * R);
      starts.push({ k, tx: mx, ty: my, name: CLOCK_NAME[k], minerals: [], geysers: [] });
    }

    // 고지대 플래토
    for (const s of starts) {
      for (let y = -12; y <= 12; y++) for (let x = -12; x <= 12; x++) {
        const d2 = x * x + y * y;
        if (d2 <= 121 && inB(s.tx + x, s.ty + y)) hgt[idx(s.tx + x, s.ty + y)] = 1;
      }
    }

    // 경사로: 각 메인에서 중앙 방향
    for (const s of starts) {
      const dx = cx - s.tx, dy = cy - s.ty;
      const len = Math.sqrt(dx * dx + dy * dy);
      const ux = dx / len, uy = dy / len;
      // 플래토 경계(반경 8~14)를 따라 폭 5의 경사로
      for (let d = 7; d <= 14; d++) {
        const px = s.tx + ux * d, py = s.ty + uy * d;
        for (let o = -2; o <= 2; o++) {
          const rx = Math.round(px + -uy * o), ry = Math.round(py + ux * o);
          if (inB(rx, ry)) hgt[idx(rx, ry)] = 2;
        }
      }
    }

    // 절벽: 고지대와 저지대 접경 (램프 제외)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (hgt[idx(x, y)] !== 0) continue;
      let adjHigh = false;
      for (let oy = -1; oy <= 1 && !adjHigh; oy++) for (let ox = -1; ox <= 1; ox++) {
        const nx = x + ox, ny = y + oy;
        if (inB(nx, ny) && hgt[idx(nx, ny)] === 1) { adjHigh = true; break; }
      }
      if (adjHigh) g[idx(x, y)] = 2;
    }

    // 지형 태그 부여
    for (let i = 0; i < W * H; i++) {
      if (g[i] === 2) continue;
      g[i] = hgt[i] === 1 ? 1 : (hgt[i] === 2 ? 4 : 0);
    }

    // 맵 테두리 절벽
    for (let x = 0; x < W; x++) { g[idx(x, 0)] = 2; g[idx(x, 1)] = 2; g[idx(x, H - 1)] = 2; g[idx(x, H - 2)] = 2; }
    for (let y = 0; y < H; y++) { g[idx(0, y)] = 2; g[idx(1, y)] = 2; g[idx(W - 1, y)] = 2; g[idx(W - 2, y)] = 2; }

    // 물 웅덩이: 인접 스타팅 사이 테두리 근처
    for (let k = 0; k < 8; k++) {
      const a = (k * 45 + 22.5) * Math.PI / 180;
      const wx = Math.round(cx + Math.sin(a) * 56), wy = Math.round(cy - Math.cos(a) * 56);
      const rw = 4 + Math.floor(rnd() * 3);
      for (let y = -rw; y <= rw; y++) for (let x = -rw; x <= rw; x++) {
        if (x * x + y * y <= rw * rw && inB(wx + x, wy + y)) {
          const i = idx(wx + x, wy + y);
          if (g[i] === 0) g[i] = 3;
        }
      }
    }

    // 중앙 바위 장식 (통행 가능, 건설 불가)
    for (let n = 0; n < 24; n++) {
      const a = rnd() * Math.PI * 2, d = rnd() * 20;
      const rx = Math.round(cx + Math.sin(a) * d), ry = Math.round(cy + Math.cos(a) * d);
      if (inB(rx, ry) && g[idx(rx, ry)] === 0) g[idx(rx, ry)] = 5;
    }

    // 자원 배치: 미네랄 8덩이 + 가스 1
    for (const s of starts) {
      const ax = s.tx - cx, ay = s.ty - cy;
      const al = Math.sqrt(ax * ax + ay * ay);
      const ux = ax / al, uy = ay / al;               // 중앙 반대 방향
      for (let m = 0; m < 8; m++) {
        const th = (m - 3.5) / 3.5 * 1.05;            // -60도~+60도 부채꼴
        const c = Math.cos(th), sn = Math.sin(th);
        const dx2 = ux * c - uy * sn, dy2 = ux * sn + uy * c;
        const dist = 6.2;
        const px = Math.round(s.tx + dx2 * dist - 1), py = Math.round(s.ty + dy2 * dist);
        s.minerals.push({ tx: px, ty: py });
      }
      // 가스: 부채꼴 바깥쪽 사이드
      const gth = 1.55, c2 = Math.cos(gth), s2 = Math.sin(gth);
      const gx2 = ux * c2 - uy * s2, gy2 = ux * s2 + uy * c2;
      s.geysers.push({ tx: Math.round(s.tx + gx2 * 6.5 - 2), ty: Math.round(s.ty + gy2 * 6.5 - 1) });
    }

    // 통행/건설 그리드
    const walk = new Uint8Array(W * H), build = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) {
      const t = g[i];
      walk[i] = (t === 2 || t === 3) ? 0 : 1;
      build[i] = (t === 0 || t === 1) ? 1 : 0;
    }

    return {
      w: W, h: H, tiles: g, height: hgt, walk, build, starts,
      name: '헌팅 그라운드', desc: '8인 · 중앙 개활지 · 시계 방향 8 스타팅',
      seed: seed || 20260801,
    };
  }

  // ---- A* 길찾기 -----------------------------------------------------------
  // occ: 엔진이 관리하는 동적 점유 그리드(건물/자원)
  function findPath(map, occ, sx, sy, tx, ty, maxExpand) {
    const W = map.w, H = map.h;
    const blocked = (x, y) => x < 0 || y < 0 || x >= W || y >= H ||
      !map.walk[y * W + x] || occ[y * W + x] > 0;
    if (sx === tx && sy === ty) return [];
    // 목적지가 막혔으면 근처의 열린 타일로 보정
    if (blocked(tx, ty)) {
      let found = null;
      outer: for (let r = 1; r < 12; r++) {
        for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) {
          if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
          if (!blocked(tx + ox, ty + oy)) { found = [tx + ox, ty + oy]; break outer; }
        }
      }
      if (!found) return null;
      tx = found[0]; ty = found[1];
    }

    const open = [];            // 이진 힙 [f, count, x, y]
    const gScore = new Map(), came = new Map();
    let count = 0;
    const key = (x, y) => y * W + x;
    const h2 = (x, y) => {
      const dx = Math.abs(x - tx), dy = Math.abs(y - ty);
      return 10 * Math.max(dx, dy) + 4 * Math.min(dx, dy);
    };
    const push = (f, x, y) => {
      open.push([f, count++, x, y]);
      let i = open.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (open[p][0] < open[i][0] || (open[p][0] === open[i][0] && open[p][1] < open[i][1])) break;
        const t = open[p]; open[p] = open[i]; open[i] = t; i = p;
      }
    };
    const pop = () => {
      const top = open[0], last = open.pop();
      if (open.length) {
        open[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1, r = l + 1; let m = i;
          if (l < open.length && (open[l][0] < open[m][0] || (open[l][0] === open[m][0] && open[l][1] < open[m][1]))) m = l;
          if (r < open.length && (open[r][0] < open[m][0] || (open[r][0] === open[m][0] && open[r][1] < open[m][1]))) m = r;
          if (m === i) break;
          const t = open[m]; open[m] = open[i]; open[i] = t; i = m;
        }
      }
      return top;
    };

    gScore.set(key(sx, sy), 0);
    push(h2(sx, sy), sx, sy);
    const DIRS = [[1,0,10],[-1,0,10],[0,1,10],[0,-1,10],[1,1,14],[1,-1,14],[-1,1,14],[-1,-1,14]];
    let expand = 0, best = null, bestH = Infinity;
    const closed = new Set();
    const maxE = maxExpand || 3000;

    while (open.length) {
      const [, , x, y] = pop();
      const k = key(x, y);
      if (closed.has(k)) continue;
      closed.add(k);
      const hh = h2(x, y);
      if (hh < bestH) { bestH = hh; best = k; }
      if (x === tx && y === ty) { best = k; break; }
      if (++expand > maxE) break;
      const gc = gScore.get(k);
      for (const [dx, dy, c] of DIRS) {
        const nx = x + dx, ny = y + dy;
        if (blocked(nx, ny)) continue;
        if (dx && dy && (blocked(x + dx, y) || blocked(x, y + dy))) continue; // 코너 통과 금지
        const nk = key(nx, ny);
        if (closed.has(nk)) continue;
        const ng = gc + c;
        if (ng < (gScore.has(nk) ? gScore.get(nk) : Infinity)) {
          gScore.set(nk, ng); came.set(nk, k);
          push(ng + h2(nx, ny), nx, ny);
        }
      }
    }
    if (best === null) return null;

    // 경로 역추적
    const path = [];
    let cur = best;
    while (cur !== undefined && cur !== key(sx, sy)) {
      path.push([cur % W, (cur / W) | 0]);
      cur = came.get(cur);
    }
    path.reverse();

    // 라인 스무딩
    const clear = (x0, y0, x1, y1) => {
      const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2;
      for (let i = 1; i <= steps; i++) {
        const x = x0 + (x1 - x0) * i / steps, y = y0 + (y1 - y0) * i / steps;
        if (blocked(Math.round(x), Math.round(y))) return false;
      }
      return true;
    };
    const out = [];
    let anchor = [sx, sy];
    for (let i = 0; i < path.length; i++) {
      if (i === path.length - 1 || !clear(anchor[0], anchor[1], path[i + 1][0], path[i + 1][1])) {
        out.push(path[i]); anchor = path[i];
      }
    }
    return out;
  }

  SC.MapGen = { genHunters, mulberry };
  SC.Path = { findPath };
})();
