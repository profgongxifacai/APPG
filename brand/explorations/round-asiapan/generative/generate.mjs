#!/usr/bin/env node
// Panasia — round "Asia + Pan", generative / algorithmic school (GN1..GN10).
// Pure Node, no deps. Every mark is computed from a glyph distance field or
// a glyph bitmap (亞 / 亚 / ㅍ / 판), each with its own algorithm + palette.
//
//   node generate.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const OUT = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------- utilities
const f = (v) => { const s = (+v).toFixed(2).replace(/\.?0+$/, ''); return s === '-0' || s === '' ? '0' : s; };
function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
function mixHex(a, b, t) {
  const pa = a.match(/\w\w/g).map((h) => parseInt(h, 16)), pb = b.match(/\w\w/g).map((h) => parseInt(h, 16));
  return '#' + pa.map((v, i) => Math.round(lerp(v, pb[i], t)).toString(16).padStart(2, '0')).join('');
}

function svg(code, bg, body, defs = '') {
  const id = code.toLowerCase();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="1024" height="1024">
<title>Panasia ${code}</title>
<defs><clipPath id="${id}-clip"><rect width="100" height="100" rx="22"/></clipPath>${defs}</defs>
<rect id="${id}-tile" width="100" height="100" rx="22" fill="${bg}"/>
<g clip-path="url(#${id}-clip)">${body}</g>
</svg>
`;
}

// value noise (2D)
function makeNoise(seed) {
  const r = rng(seed); const P = 64; const g = Array.from({ length: P * P }, () => r());
  const at = (i, j) => g[((i % P + P) % P) * P + ((j % P + P) % P)];
  return (x, y) => {
    const i = Math.floor(x), j = Math.floor(y); let u = x - i, v = y - j;
    u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v);
    return lerp(lerp(at(i, j), at(i + 1, j), u), lerp(at(i, j + 1), at(i + 1, j + 1), u), v) * 2 - 1;
  };
}

// ---------------------------------------------------------------- glyph SDFs
// A glyph is a list of shapes: ['r', x0,y0,x1,y1] boxes or ['c', ax,ay,bx,by,r] capsules.
function sdBox(px, py, x0, y0, x1, y1) {
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, hx = (x1 - x0) / 2, hy = (y1 - y0) / 2;
  const dx = Math.abs(px - cx) - hx, dy = Math.abs(py - cy) - hy;
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0);
}
function sdCap(px, py, ax, ay, bx, by, r) {
  const pax = px - ax, pay = py - ay, bax = bx - ax, bay = by - ay;
  const h = clamp((pax * bax + pay * bay) / (bax * bax + bay * bay));
  return Math.hypot(pax - bax * h, pay - bay * h) - r;
}
const sdf = (G) => (x, y) => {
  let d = 1e9;
  for (const s of G) d = Math.min(d, s[0] === 'r' ? sdBox(x, y, s[1], s[2], s[3], s[4]) : sdCap(x, y, s[1], s[2], s[3], s[4], s[5]));
  return d;
};
const R = (x0, y0, x1, y1) => ['r', x0, y0, x1, y1];
const C = (ax, ay, bx, by, r) => ['c', ax, ay, bx, by, r];

// 亞 = ㅍ core + [ ] sides.  (ㅍ: two bars + two verticals; brackets close onto the verticals)
const A_PIEUP = [R(18, 18, 82, 27), R(18, 73, 82, 82), R(33, 27, 42, 73), R(58, 27, 67, 73)];
const A_BRACK = [R(18, 37, 33, 44), R(18, 56, 33, 63), R(18, 44, 25, 56), R(67, 37, 82, 44), R(67, 56, 82, 63), R(75, 44, 82, 56)];
const A = [...A_PIEUP, ...A_BRACK];

const shapeSvg = (G, fill) => G.map((s) => s[0] === 'r'
  ? `<rect x="${f(s[1])}" y="${f(s[2])}" width="${f(s[3] - s[1])}" height="${f(s[4] - s[2])}" fill="${fill}"/>`
  : `<line x1="${f(s[1])}" y1="${f(s[2])}" x2="${f(s[3])}" y2="${f(s[4])}" stroke="${fill}" stroke-width="${f(s[5] * 2)}" stroke-linecap="round"/>`).join('');

function isolines(F, n, h, L) {
    // edge points keyed by edge id; segments joined into polylines
    const pt = (key) => {
      const [t, i, j] = key.split(':'); const I = +i, J = +j;
      const a = F[J * n + I], b = t === 'h' ? F[J * n + I + 1] : F[(J + 1) * n + I];
      const s = (L - a) / (b - a);
      return t === 'h' ? [(I + s) * h, J * h] : [I * h, (J + s) * h];
    };
    const adj = new Map(); const link = (a, b) => { (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a); };
    for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
      const v0 = F[j * n + i] > L, v1 = F[j * n + i + 1] > L, v2 = F[(j + 1) * n + i + 1] > L, v3 = F[(j + 1) * n + i] > L;
      const e = [];
      if (v0 !== v1) e.push(`h:${i}:${j}`);
      if (v1 !== v2) e.push(`v:${i + 1}:${j}`);
      if (v3 !== v2) e.push(`h:${i}:${j + 1}`);
      if (v0 !== v3) e.push(`v:${i}:${j}`);
      if (e.length === 2) link(e[0], e[1]);
      else if (e.length === 4) { link(e[0], e[3]); link(e[1], e[2]); }
    }
    const seen = new Set(); const paths = [];
    for (const start of adj.keys()) {
      if (seen.has(start)) continue;
      // walk to an end if open
      let s = start, prev = null;
      for (let guard = 0; guard < 1e5; guard++) { const nb = adj.get(s).filter((q) => q !== prev); if (adj.get(s).length < 2 || nb.length === 0) break; const nx = nb[0]; if (nx === start) break; prev = s; s = nx; }
      const seq = [s]; seen.add(s); prev = null; let cur = s;
      for (;;) { const nb = adj.get(cur).filter((q) => q !== prev && !seen.has(q)); if (!nb.length) break; prev = cur; cur = nb[0]; seen.add(cur); seq.push(cur); }
      const closed = adj.get(seq[0]).includes(seq[seq.length - 1]) && seq.length > 2;
      const pts = seq.map(pt);
      // light decimation
      const out = [pts[0]]; for (let k = 1; k < pts.length - 1; k++) { const o = out[out.length - 1]; if (Math.hypot(pts[k][0] - o[0], pts[k][1] - o[1]) > 0.9) out.push(pts[k]); } out.push(pts[pts.length - 1]);
      paths.push('M' + out.map((p) => f(p[0]) + ' ' + f(p[1])).join('L') + (closed ? 'Z' : ''));
    }
    return paths.join('');
  }

const files = {};
const meta = [];
const add = (code, name, note, content) => { files[code] = content; meta.push({ code, name, note }); };

// =========================================================== GN1 바둑판 [ㅍ]
// 19×19 Go board (바둑판 = 판). Stones sampled on the lattice: black = ㅍ, white = [ ] → together 亞.
{
  const code = 'GN1', id = 'gn1';
  const N = 19, x0 = 10, sp = 80 / 18, rS = 2.13;
  const r = rng(11);
  const noise = makeNoise(5);
  let body = '';
  // wood grain: long faint streaks from value noise
  for (let k = 0; k < 34; k++) {
    const y = k * 3.1 + r() * 2;
    let d = `M-2 ${f(y)}`;
    for (let x = 0; x <= 102; x += 4) d += ` L${x} ${f(y + noise(x * 0.035, k * 0.7) * 3.2)}`;
    body += `<path d="${d}" fill="none" stroke="#8A5A22" stroke-opacity="${f(0.05 + r() * 0.07)}" stroke-width="${f(0.3 + r() * 0.9)}"/>`;
  }
  // board lines
  let lines = '';
  for (let i = 0; i < N; i++) {
    const p = x0 + i * sp;
    lines += `M${f(x0)} ${f(p)}H${f(x0 + 80)}M${f(p)} ${f(x0)}V${f(x0 + 80)}`;
  }
  body += `<path d="${lines}" stroke="#4A3115" stroke-opacity=".55" stroke-width=".26" fill="none"/>`;
  for (const a of [3, 9, 15]) for (const b of [3, 9, 15]) body += `<circle cx="${f(x0 + a * sp)}" cy="${f(x0 + b * sp)}" r=".55" fill="#4A3115" fill-opacity=".6"/>`;
  // 亞 on lattice cols/rows 3..15, strokes two stones thick
  const black = new Set(), white = new Set();
  const put = (S, c0, c1, r0, r1) => { for (let c = c0; c <= c1; c++) for (let q = r0; q <= r1; q++) S.add(c + ',' + q); };
  put(black, 3, 15, 3, 4); put(black, 3, 15, 14, 15); put(black, 6, 7, 5, 13); put(black, 11, 12, 5, 13);
  put(white, 3, 5, 7, 8); put(white, 3, 5, 10, 11); put(white, 3, 4, 9, 9);
  put(white, 13, 15, 7, 8); put(white, 13, 15, 10, 11); put(white, 14, 15, 9, 9);
  let shadows = '', stones = '';
  for (const S of [black, white]) for (const k of S) {
    const [c, q] = k.split(',').map(Number); const cx = x0 + c * sp, cy = x0 + q * sp;
    shadows += `<circle cx="${f(cx + 0.35)}" cy="${f(cy + 0.45)}" r="${rS}"/>`;
    stones += S === black
      ? `<circle cx="${f(cx)}" cy="${f(cy)}" r="${rS}" fill="url(#${id}-b)"/>`
      : `<circle cx="${f(cx)}" cy="${f(cy)}" r="${rS}" fill="url(#${id}-w)" stroke="#6E5530" stroke-opacity=".5" stroke-width=".22"/>`;
  }
  body += `<g fill="#3A220A" fill-opacity=".28">${shadows}</g>${stones}`;
  const defs = `<radialGradient id="${id}-b" cx=".38" cy=".34" r=".75"><stop offset="0" stop-color="#4A4A4A"/><stop offset=".45" stop-color="#1A1A1A"/><stop offset="1" stop-color="#0B0B0B"/></radialGradient>`
    + `<radialGradient id="${id}-w" cx=".38" cy=".34" r=".8"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".6" stop-color="#F1ECE0"/><stop offset="1" stop-color="#CFC6B2"/></radialGradient>`;
  // (white stones get a fine rim so the [ ] holds on wood)
  add(code, '바둑판 [ㅍ]', '19×19 바둑판(=판) 위 돌 배치 — 흑돌 ㅍ + 백돌 [ ] = 亞, 판 위에 놓인 아시아', svg(code, '#D3A158', body, defs));
}

// =========================================================== GN2 주사선 亞
// A full-bleed field of horizontal scanlines whose thickness is driven by the 亞 distance field.
{
  const code = 'GN2';
  const D = sdf(A);
  const N = 31, y0 = 4.0, sp = 92 / (N - 1);
  let body = '';
  for (let k = 0; k < N; k++) {
    const y = y0 + k * sp;
    const top = [], bot = [];
    for (let x = -1; x <= 101.01; x += 0.5) {
      const d = D(x, y);
      const ins = smooth(0.9, -0.9, d);
      const glow = Math.exp(-Math.max(d, 0) / 3.5) * 0.18;
      const h = 0.17 + glow + ins * (sp * 0.5 - 0.17 - 0.08);
      top.push([x, y - h]); bot.push([x, y + h]);
    }
    const pts = [...top, ...bot.reverse()];
    body += `<path d="M${pts.map((p) => f(p[0]) + ' ' + f(p[1])).join('L')}Z"/>`;
  }
  add(code, '주사선 亞', '타일 전체(汎)를 가로지르는 31개의 주사선이 亞의 거리장에서만 부풀어 하나의 글자가 됨', svg(code, '#171A3E', `<g fill="#F2E6C9">${body}</g>`));
}

// =========================================================== GN3 오방 조각보
// BSP patchwork: 亞's rectangles split into 오방 patches stitched with 백(white) seams; the field is 모시.
{
  const code = 'GN3';
  const r = rng(7);
  const cutsX = [0, 18, 25, 33, 42, 58, 67, 75, 82, 100], cutsY = [0, 18, 27, 37, 44, 56, 63, 73, 82, 100];
  const D = sdf(A);
  const patches = [];
  const split = (x0, y0, x1, y1, depth, inside) => {
    const w = x1 - x0, h = y1 - y0;
    const minSide = inside ? 6 : 8;
    const can = (w > 2 * minSide || h > 2 * minSide) && depth < (inside ? 3 : 2) && (r() < 0.82 || w > 30 || h > 30);
    if (!can) { patches.push({ x0, y0, x1, y1, inside }); return; }
    const vert = w > 2 * minSide && (w >= h || h <= 2 * minSide);
    if (vert) { const c = x0 + w * (0.32 + r() * 0.36); split(x0, y0, c, y1, depth + 1, inside); split(c, y0, x1, y1, depth + 1, inside); }
    else { const c = y0 + h * (0.32 + r() * 0.36); split(x0, y0, x1, c, depth + 1, inside); split(x0, c, x1, y1, depth + 1, inside); }
  };
  // glyph pieces (non-overlapping decomposition of 亞)
  for (const s of A) split(s[1], s[2], s[3], s[4], 0, true);
  // outside: grid cells from the cut lines, merged along rows
  for (let j = 0; j < cutsY.length - 1; j++) {
    let run = null;
    for (let i = 0; i < cutsX.length - 1; i++) {
      const cx = (cutsX[i] + cutsX[i + 1]) / 2, cy = (cutsY[j] + cutsY[j + 1]) / 2;
      const out = D(cx, cy) > 0;
      if (out && run && r() < 0.6) run.x1 = cutsX[i + 1];
      else { if (run) split(run.x0, run.y0, run.x1, run.y1, 0, false); run = out ? { x0: cutsX[i], y0: cutsY[j], x1: cutsX[i + 1], y1: cutsY[j + 1] } : null; }
    }
    if (run) split(run.x0, run.y0, run.x1, run.y1, 0, false);
  }
  // 백 = the 모시 field (translucent ramie, tonal patches); 청·적·황·흑 silk patches build 亞.
  // Some glyph patches are cut on the diagonal into two triangles, as in 조각보 (never in Mondrian).
  const OB = ['#2A4C9A', '#B8312F', '#E09E14', '#26232A']; // 청 적 황 흑
  const PALE = ['#EFEBE3', '#E6E1D6', '#F4F1EB', '#DFD9CC', '#EAE5DB'];
  let last = -1, body = '', seamsIn = '', seamsOut = '';
  const pick = () => { let k; do { k = Math.floor(r() * OB.length); } while (k === last); last = k; return OB[k]; };
  for (const p of patches) {
    const rect = `x="${f(p.x0)}" y="${f(p.y0)}" width="${f(p.x1 - p.x0)}" height="${f(p.y1 - p.y0)}"`;
    if (!p.inside) { body += `<rect ${rect} fill="${PALE[Math.floor(r() * PALE.length)]}"/>`; seamsOut += `<rect ${rect}/>`; continue; }
    const w = p.x1 - p.x0, h = p.y1 - p.y0;
    if (Math.max(w, h) / Math.min(w, h) < 2.2 && Math.min(w, h) > 5 && r() < 0.6) {
      const c1 = pick(), c2 = pick();
      const flip = r() < 0.5;
      const A1 = flip ? [[p.x0, p.y0], [p.x1, p.y0], [p.x0, p.y1]] : [[p.x0, p.y0], [p.x1, p.y0], [p.x1, p.y1]];
      const A2 = flip ? [[p.x1, p.y0], [p.x1, p.y1], [p.x0, p.y1]] : [[p.x0, p.y0], [p.x1, p.y1], [p.x0, p.y1]];
      const poly = (P) => P.map((q) => f(q[0]) + ',' + f(q[1])).join(' ');
      body += `<polygon points="${poly(A1)}" fill="${c1}"/><polygon points="${poly(A2)}" fill="${c2}"/>`;
      seamsIn += flip ? `<path d="M${f(p.x1)} ${f(p.y0)}L${f(p.x0)} ${f(p.y1)}"/>` : `<path d="M${f(p.x0)} ${f(p.y0)}L${f(p.x1)} ${f(p.y1)}"/>`;
    } else body += `<rect ${rect} fill="${pick()}"/>`;
    seamsIn += `<rect ${rect}/>`;
  }
  body += `<g fill="none" stroke="#C9C0AE" stroke-width=".55">${seamsOut}</g>`;
  body += `<g fill="none" stroke="#F7F2E6" stroke-width=".75" stroke-linejoin="round">${seamsIn}</g>`;
  add(code, '오방 조각보 亞', '모시(백) 바탕 위 청·적·황·흑 비단 조각을 사선까지 이어 붙인 亞 — 오방 다섯 방위(汎)가 한 장의 아시아', svg(code, '#EAE5DB', body));
}

// =========================================================== GN4 판 등고선
// Marching-squares contours of the (noise-warped) distance field of 판 — 판 as a territory (판도).
{
  const code = 'GN4';
  const P = [R(18, 16, 54, 24), R(26, 24, 33, 46), R(39, 24, 46, 46), R(15, 46, 57, 53), // ㅍ
    R(64, 14, 71, 60), R(71, 33, 83, 40),                                               // ㅏ
    R(24, 63, 31, 85), R(24, 78, 83, 85)];                                              // ㄴ
  const D = sdf(P); const nz = makeNoise(23);
  const h = 0.5, n = Math.round(100 / h) + 1;
  const F = new Float64Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = i * h, y = j * h, d = D(x, y);
    const amp = 2.4 * smooth(2, 18, d);
    F[j * n + i] = d + amp * (nz(x * 0.06, y * 0.06) + 0.5 * nz(x * 0.13 + 9, y * 0.13 + 3));
  }
  let body = '';
  const levels = [];
  for (let L = 3.2; L < 44; L += 2.6) levels.push(L);
  levels.forEach((L, k) => {
    const t = k / (levels.length - 1);
    body += `<path d="${isolines(F, n, h, L)}" fill="none" stroke="#173A32" stroke-opacity="${f(lerp(0.75, 0.16, t))}" stroke-width="${f(lerp(0.62, 0.32, t))}" stroke-linejoin="round"/>`;
  });
  body += `<path d="${isolines(F, n, h, 0)}" fill="#173A32"/>`;
  add(code, '판 등고선', '판(板·版圖)의 거리장을 지형도로 — 판에서 퍼져 나가는 등고선이 전체를 덮고, 그 안에 동쪽 모음 ㅏ와 亞의 ㅍ', svg(code, '#B4D2C2', body));
}

// =========================================================== GN5 하프톤 亚
// Hex halftone over the whole tile; dot radius = coverage of 亚 (simplified Asia).
{
  const code = 'GN5';
  const Y = [R(20, 18, 80, 27), R(36, 27, 44, 73), R(56, 27, 64, 73), C(25.5, 42, 30.5, 58, 4), C(74.5, 42, 69.5, 58, 4), R(14, 73, 86, 82)];
  const D = sdf(Y);
  const sp = 3.3, rowH = sp * Math.sqrt(3) / 2;
  let body = '';
  for (let j = 0, y = 1; y < 101; j++, y = 1 + j * rowH) {
    for (let x = (j % 2) * sp / 2 - 1; x < 102; x += sp) {
      const d = D(x, y);
      const ins = smooth(1.3, -1.3, d);
      const halo = Math.exp(-Math.max(d, 0) / 3) * 0.14;
      const rr = 0.34 + halo + ins * (1.74 - 0.34 - halo);
      body += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(rr)}"/>`;
    }
  }
  add(code, '하프톤 亚', '타일 전체의 모든 점(汎)이 크기만 바꿔 亚를 그리는 육각 하프톤 — 점 하나하나가 모여 하나의 아시아', svg(code, '#F7F2E8', `<g fill="#D2382A">${body}</g>`));
}

// =========================================================== GN6 한붓 회문 亞
// One closed Hamiltonian loop (spanning-tree contour) fills 亞 — the meander is both Greek key (pan-) and 雷紋.
{
  const code = 'GN6', id = 'gn6';
  const r = rng(3);
  const s = 4, ox = 18, oy = 18, M = 16;
  const on = (c, q) => {
    if (c < 0 || q < 0 || c >= M || q >= M) return false;
    if (q <= 1 || q >= 14) return true;                       // bars
    if (c === 3 || c === 4 || c === 11 || c === 12) return true; // verticals
    const L = c <= 2, Rt = c >= 13;
    if (!(L || Rt)) return false;
    if (q === 4 || q === 5 || q === 10 || q === 11) return true;  // bracket horizontals
    if (q >= 6 && q <= 9) return L ? c <= 1 : c >= 14;          // bracket outer verticals
    return false;
  };
  // random DFS spanning tree, preferring to keep direction (long meander runs)
  const key = (c, q) => c + ',' + q; const seen = new Set(); const tree = new Set();
  const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const stack = [[0, 0, -1]]; seen.add(key(0, 0));
  while (stack.length) {
    const [c, q, pd] = stack[stack.length - 1];
    let opts = dirs.map((d, k) => [c + d[0], q + d[1], k]).filter(([a, b]) => on(a, b) && !seen.has(key(a, b)));
    if (!opts.length) { stack.pop(); continue; }
    let pick = opts.find((o) => o[2] === pd && r() < 0.82) || opts[Math.floor(r() * opts.length)];
    seen.add(key(pick[0], pick[1])); tree.add([key(c, q), key(pick[0], pick[1])].sort().join('|'));
    stack.push(pick);
  }
  const hasT = (a, b, c2, d2) => tree.has([key(a, b), key(c2, d2)].sort().join('|'));
  // refined graph
  const adj = new Map(); const nk = (x, y) => x + ':' + y;
  const link = (a, b) => { (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a); };
  for (let c = 0; c < M; c++) for (let q = 0; q < M; q++) {
    if (!on(c, q)) continue;
    const X = 2 * c, Y2 = 2 * q;
    // top side (y) between (X,Y2)-(X+1,Y2): kept unless tree edge up
    if (!hasT(c, q, c, q - 1)) link(nk(X, Y2), nk(X + 1, Y2));
    if (!hasT(c, q, c, q + 1)) link(nk(X, Y2 + 1), nk(X + 1, Y2 + 1));
    if (!hasT(c, q, c - 1, q)) link(nk(X, Y2), nk(X, Y2 + 1));
    if (!hasT(c, q, c + 1, q)) link(nk(X + 1, Y2), nk(X + 1, Y2 + 1));
    if (hasT(c, q, c + 1, q)) { link(nk(X + 1, Y2), nk(X + 2, Y2)); link(nk(X + 1, Y2 + 1), nk(X + 2, Y2 + 1)); }
    if (hasT(c, q, c, q + 1)) { link(nk(X, Y2 + 1), nk(X, Y2 + 2)); link(nk(X + 1, Y2 + 1), nk(X + 1, Y2 + 2)); }
  }
  const start = adj.keys().next().value; const loop = [start]; let prev = null, cur = start;
  for (;;) { const nb = adj.get(cur).filter((q) => q !== prev); const nx = nb[0]; if (nx === start || nx === undefined) break; prev = cur; cur = nx; loop.push(cur); }
  const P = loop.map((k) => k.split(':').map(Number)).map(([x, y]) => [ox + (x + 0.5) * s / 2, oy + (y + 0.5) * s / 2]);
  // drop collinear points
  const out = P.filter((p, i) => { const a = P[(i - 1 + P.length) % P.length], b = P[(i + 1) % P.length]; return !((a[0] === p[0] && p[0] === b[0]) || (a[1] === p[1] && p[1] === b[1])); });
  const d = 'M' + out.map((p) => f(p[0]) + ' ' + f(p[1])).join('L') + 'Z';
  const defs = `<linearGradient id="${id}-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8CE6D8"/><stop offset=".35" stop-color="#B9B4F5"/><stop offset=".62" stop-color="#F4B9D2"/><stop offset=".85" stop-color="#F7D79A"/><stop offset="1" stop-color="#9ED7F5"/></linearGradient>`;
  const body = `<path d="${d}" fill="none" stroke="url(#${id}-g)" stroke-width="1.42" stroke-linejoin="round"/>`;
  add(code, '한붓 회문 亞', `끊김 없는 한 줄 루프(${loop.length}마디)가 亞를 채움 — 그리스 뇌문(pan-)과 동양 뇌문(雷紋)이 같은 선, 나전 칠흑 위`, svg(code, '#0E0D13', body, defs));
}

// =========================================================== GN7 코인 패킹 亞
// Greedy circle packing inside a bold 亞: many coins (tokens), one whole.
{
  const code = 'GN7';
  const AB = [R(15, 15, 85, 27), R(15, 73, 85, 85), R(30, 27, 42, 73), R(58, 27, 70, 73),
    R(15, 36, 30, 45), R(15, 55, 30, 64), R(15, 45, 24, 55), R(70, 36, 85, 45), R(70, 55, 85, 64), R(76, 45, 85, 55)];
  const D = sdf(AB); const r = rng(42);
  const circles = []; const gap = 0.32;
  const fit = (x, y) => { let m = -D(x, y) - 0.2; for (const c of circles) { m = Math.min(m, Math.hypot(x - c[0], y - c[1]) - c[2] - gap); if (m < 0.5) return m; } return m; };
  for (let pass = 0; pass < 9; pass++) {
    const minR = [5.2, 4.2, 3.4, 2.8, 2.2, 1.7, 1.3, 1.0, 0.75][pass];
    for (let t = 0; t < 14000; t++) {
      const x = 15 + r() * 70, y = 15 + r() * 70;
      if (D(x, y) > -minR) continue;
      const m = Math.min(fit(x, y), 5.6);
      if (m >= minR) circles.push([x, y, m]);
    }
  }
  const tones = ['#F6E7B6', '#EBCB6E', '#D9A93E', '#F2DA8C'];
  let body = '';
  for (const [x, y, rr] of circles) {
    const t = tones[Math.floor(r() * tones.length)];
    body += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(rr)}" fill="${t}"/>`;
    if (rr > 2.2) body += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(rr * 0.68)}" fill="none" stroke="#9C7420" stroke-opacity=".55" stroke-width="${f(Math.min(0.5, rr * 0.09))}"/>`;
  }
  add(code, '코인 패킹 亞', `크기가 다른 ${circles.length}개의 코인이 빈틈없이 모여 하나의 亞 — 모든 토큰(汎)이 이루는 아시아`, svg(code, '#0E6A5A', body));
}

// =========================================================== GN8 비단 문직 亞
// Satin-damask weave: warp (crimson) floats outside, weft (ivory) floats inside 亞; binding points per 5-satin.
{
  const code = 'GN8';
  const c = 2, N = 50; const r = rng(8);
  const AW = [R(18, 18, 82, 28), R(18, 72, 82, 82), R(32, 28, 42, 72), R(58, 28, 68, 72),
    R(18, 38, 32, 46), R(18, 54, 32, 62), R(18, 46, 26, 54), R(68, 38, 82, 46), R(68, 54, 82, 62), R(74, 46, 82, 54)];
  const D = sdf(AW);
  const weftTop = (i, j) => { const ins = D((i + 0.5) * c, (j + 0.5) * c) < 0; return ins ? (3 * i + j) % 8 !== 0 : (i + 3 * j) % 8 === 0; };
  let warp = '', weft = '';
  const th = c * 0.8, pad = (c - th) / 2;
  for (let j = 0; j < N; j++) { // weft runs
    let i = 0; while (i < N) { if (!weftTop(i, j)) { i++; continue; } let e = i; while (e + 1 < N && weftTop(e + 1, j)) e++;
      if (e === i && D((i + 0.5) * c, (j + 0.5) * c) > 0) { // a lone binding point in the warp-faced ground: small, in shadow
        weft += `<rect x="${f(i * c + 0.55)}" y="${f(j * c + 0.6)}" width="${f(c - 1.1)}" height="${f(c - 1.2)}" rx=".4" fill="#D7A9A0"/>`; i = e + 1; continue; }
      const sh = mixHex('F4EAD6', 'E3D3B4', r());
      weft += `<rect x="${f(i * c + 0.25)}" y="${f(j * c + pad)}" width="${f((e - i + 1) * c - 0.5)}" height="${f(th)}" rx="${f(th / 2)}" fill="${sh}"/>`; i = e + 1; }
  }
  for (let i = 0; i < N; i++) { // warp runs
    let j = 0; while (j < N) { if (weftTop(i, j)) { j++; continue; } let e = j; while (e + 1 < N && !weftTop(i, e + 1)) e++;
      const sh = mixHex('A3213A', '8A1830', r());
      warp += `<rect x="${f(i * c + pad)}" y="${f(j * c + 0.25)}" width="${f(th)}" height="${f((e - j + 1) * c - 0.5)}" rx="${f(th / 2)}" fill="${sh}"/>`; j = e + 1; }
  }
  add(code, '비단 문직 亞', '날실·씨실 모든 실(汎)이 오매듭 수자직으로 엮여, 씨실이 떠오른 자리만 亞가 되는 비단 다마스크', svg(code, '#4C0D1B', warp + weft));
}

// =========================================================== GN9 亞의 亞
// Self-similar substitution: each pixel of a 9×9 亞 is itself a 亞 (level 2, 81×81).
{
  const code = 'GN9';
  const B = ['#########', '..#...#..', '..#...#..', '###...###', '#.#...#.#', '###...###', '..#...#..', '..#...#..', '#########'];
  const on = (x, y) => B[y][x] === '#';
  const size = 74, o = 13, cell = size / 81;
  let body = '', under = '';
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) if (on(x, y)) under += `<rect x="${f(o + x * 9 * cell)}" y="${f(o + y * 9 * cell)}" width="${f(9 * cell + 0.02)}" height="${f(9 * cell + 0.02)}"/>`;
  for (let Y = 0; Y < 81; Y++) {
    let X = 0;
    while (X < 81) {
      const filled = (x) => on(Math.floor(x / 9), Math.floor(Y / 9)) && on(x % 9, Y % 9);
      if (!filled(X)) { X++; continue; }
      let e = X; while (e + 1 < 81 && filled(e + 1)) e++;
      body += `<rect x="${f(o + X * cell)}" y="${f(o + Y * cell)}" width="${f((e - X + 1) * cell + 0.02)}" height="${f(cell + 0.02)}"/>`;
      X = e + 1;
    }
  }
  add(code, '亞의 亞', '亞의 픽셀 하나하나가 다시 亞 — 부분이 전체를 담는 자기유사 구조, 전체(pan)가 곧 아시아', svg(code, '#F4F1EA', `<g fill="#8AA0DA">${under}</g><g fill="#162E78">${body}</g>`));
}

// =========================================================== GN10 동류 ㅍ
// Stream function ψ = (y−50)·d/(d+k)·(1+κx): ψ=0 on the ㅍ outline, so every level set is a streamline
// that wraps the mark; spacing tightens toward the east (convergence). Isolines via marching squares.
{
  const code = 'GN10';
  const G = [R(24, 26, 76, 35), R(34, 35, 43, 65), R(57, 35, 66, 65), R(18, 65, 82, 74)];
  const Dob = sdf([...G, R(40, 33, 60, 67)]); // obstacle = ㅍ with its closed counter filled
  const h = 0.4, n = Math.round(100 / h) + 1, k = 12, kap = 0.55;
  const F = new Float64Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = i * h, y = j * h, d = Math.max(Dob(x, y), 0);
    F[j * n + i] = (y - 50) * (d / (d + k)) * (1 + kap * x / 100);
  }
  let body = '';
  const step = 2.05;
  for (let c = step / 2; c < 80; c += step) for (const sg of [-1, 1]) body += isolines(F, n, h, sg * c);
  const lines = `<path d="${body}" fill="none" stroke="#141414" stroke-width=".42" stroke-linejoin="round"/>`;
  add(code, '동류 ㅍ', '서쪽 전체에서 온 모든 흐름(汎)이 亞의 심장 ㅍ을 감싸 돌아 동쪽으로 좁혀 모임 — 유선함수 등치선', svg(code, '#F3C232', lines + shapeSvg(G, '#141414')));
}

for (const [code, content] of Object.entries(files)) fs.writeFileSync(path.join(OUT, `${code}.svg`), content);
fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify(meta, null, 2) + '\n');
for (const [code, content] of Object.entries(files)) console.log(code, (content.length / 1024).toFixed(1) + 'KB');
