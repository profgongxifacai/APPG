#!/usr/bin/env python3
"""Panasia — generative / algorithmic app-icon explorations (GN1..GN8).

Pure-Python (no deps). Each mark is built by a different algorithm and palette,
and every one resolves into a single clear silhouette at small sizes.

    python3 generate.py
"""
import json
import math
import os
import random

OUT = os.path.dirname(os.path.abspath(__file__))
TAU = math.tau


def f(v):
    s = f"{v:.2f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def svg(code, bg, body, defs=""):
    d = f"<defs>{defs}</defs>" if defs else ""
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="1024" height="1024">'
        f"{d}"
        f'<rect width="100" height="100" rx="22" fill="{bg}"/>'
        f"{body}</svg>\n"
    )


def poly_d(pts, close=True):
    s = "M" + " L".join(f"{f(x)} {f(y)}" for x, y in pts)
    return s + ("Z" if close else "")


def line_d(pts):
    return "M" + " ".join(f"{f(x)} {f(y)}" for x, y in pts)


# --- tiny smooth value noise -------------------------------------------------
def _hash(i, seed):
    n = math.sin(i * 127.1 + seed * 311.7) * 43758.5453
    return n - math.floor(n)


def noise1(x, seed=0):
    i = math.floor(x)
    t = x - i
    t = t * t * (3 - 2 * t)
    return _hash(i, seed) * (1 - t) + _hash(i + 1, seed) * t


def periodic_noise(theta, octaves=3, seed=0):
    """Smooth noise on the circle (periodic in theta)."""
    v, amp, tot = 0.0, 1.0, 0.0
    for o in range(octaves):
        k = 2 ** o
        v += amp * (0.5 + 0.5 * math.sin(k * 3 * theta + _hash(o, seed) * TAU)) * \
             (0.6 + 0.4 * math.sin(k * 5 * theta + _hash(o + 9, seed) * TAU))
        tot += amp
        amp *= 0.5
    return v / tot


# =============================================================================
# GN1 — radial line burst: 240 tapered rays form an annulus ("the whole")
# =============================================================================
def gn1():
    cx = cy = 50
    N = 144
    R_OUT = 35.5
    R_IN = 12.0
    TWIST = math.radians(64)   # each ray leans: the burst reads as an iris / vortex
    parts = []
    for i in range(N):
        a = i / N * TAU - math.pi / 2
        b = a + TWIST
        w_out = TAU * R_OUT / N * 0.43   # half-width at the rim (tapers to a hairline inside)
        p_in = (cx + math.cos(a) * R_IN, cy + math.sin(a) * R_IN)
        ob = (cx + math.cos(b) * R_OUT, cy + math.sin(b) * R_OUT)
        tx, ty = -math.sin(b), math.cos(b)
        p2 = (ob[0] + tx * w_out, ob[1] + ty * w_out)
        p3 = (ob[0] - tx * w_out, ob[1] - ty * w_out)
        parts.append(poly_d([p_in, p2, p3]))
    defs = (
        '<radialGradient id="gn1g" cx="50" cy="50" r="36" gradientUnits="userSpaceOnUse">'
        '<stop offset=".3" stop-color="#FFE7B0"/><stop offset="1" stop-color="#E8A93A"/></radialGradient>'
    )
    body = (
        f'<path d="{"".join(parts)}" fill="url(#gn1g)"/>'
        f'<circle cx="50" cy="50" r="{R_OUT}" fill="none" stroke="#E8A93A" stroke-width=".9"/>'
        f'<circle cx="50" cy="50" r="4.4" fill="#FFE7B0"/>'
    )
    return svg("GN1", "#0E1A2B", body, defs)


# =============================================================================
# GN2 — moiré: two offset concentric ring sets interfere inside one disc
# =============================================================================
def gn2():
    R = 34
    step = 2.3
    body = []
    clip = '<clipPath id="gn2c"><circle cx="50" cy="50" r="34"/></clipPath>'
    rings = []
    for c in (46.5, 53.5):
        r = step * 0.5
        while r < R + 12:
            rings.append(f'<circle cx="{f(c)}" cy="50" r="{f(r)}"/>')
            r += step
    body.append(
        f'<g clip-path="url(#gn2c)" fill="none" stroke="#FFF2E2" stroke-width="1.05">{"".join(rings)}</g>'
    )
    body.append('<circle cx="50" cy="50" r="34" fill="none" stroke="#FFF2E2" stroke-width="1.6"/>')
    return svg("GN2", "#D23A26", "".join(body), clip)


# =============================================================================
# GN3 — halftone dot matrix sphere (lit globe), hex grid
# =============================================================================
def gn3():
    R = 35
    L = (-0.55, -0.6, 0.58)  # light dir
    ln = math.sqrt(sum(v * v for v in L))
    L = tuple(v / ln for v in L)
    pitch = 2.18
    dots = []
    # polar dot matrix: concentric rings -> perfectly circular silhouette
    rings = int(R / pitch)
    for k in range(rings + 1):
        rr = R - k * pitch          # outermost ring sits exactly on R
        if rr < 0.2:
            cnt, rr = 1, 0.0
        else:
            cnt = max(1, round(TAU * rr / pitch))
        for j in range(cnt):
            a = (j + 0.5 * (k % 2)) / cnt * TAU
            x, y = 50 + rr * math.cos(a), 50 + rr * math.sin(a)
            dx, dy = (x - 50) / R, (y - 50) / R
            dz = math.sqrt(max(0.0, 1 - dx * dx - dy * dy))
            lam = max(0.0, dx * L[0] + dy * L[1] + dz * L[2])
            v = 0.16 + 0.84 * lam ** 1.1
            if k == 0:
                v = max(v, 0.62)   # crisp rim so the silhouette survives
            r = pitch * 0.5 * min(1.0, v) * 0.96
            dots.append(f"M{f(x - r)} {f(y)}a{f(r)} {f(r)} 0 1 0 {f(2 * r)} 0a{f(r)} {f(r)} 0 1 0 {f(-2 * r)} 0")
    body = f'<path d="{"".join(dots)}" fill="#A6F5C9"/>'
    return svg("GN3", "#0B3B2D", body)


# =============================================================================
# GN4 — damped harmonograph (2 pendulums per axis)
# =============================================================================
def gn4():
    # rotary harmonograph: two circular pendulums, slightly detuned, damped
    f1, f2 = 1.0, -3.012
    d = 0.0027
    pts = []
    T = 430
    n = 15000
    for i in range(n):
        t = i / n * T
        e = math.exp(-d * t)
        x = (math.cos(f1 * t) + 0.8 * math.cos(f2 * t)) * e
        y = (math.sin(f1 * t) + 0.8 * math.sin(f2 * t)) * e
        pts.append((50 + x, 50 + y))
    # scale to fit radius ~35
    # centre on the bounding box, then fit to radius 35
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    ox, oy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    mx = max(math.hypot(x - ox, y - oy) for x, y in pts)
    s = 36 / mx
    pts = [(50 + (x - ox) * s, 50 + (y - oy) * s) for x, y in pts]
    defs = (
        '<linearGradient id="gn4g" x1="14" y1="14" x2="86" y2="86" gradientUnits="userSpaceOnUse">'
        '<stop offset="0" stop-color="#FF8FB8"/><stop offset=".5" stop-color="#C9A6FF"/>'
        '<stop offset="1" stop-color="#7FE3FF"/></linearGradient>'
    )
    body = (
        f'<path d="{line_d(pts)}" fill="none" stroke="url(#gn4g)" stroke-width=".2" '
        f'stroke-linejoin="round" stroke-opacity=".92"/>'
    )
    return svg("GN4", "#17123D", body, defs)


# =============================================================================
# GN5 — dipole flow field: field lines run from pole to pole inside a disc
# =============================================================================
def gn5():
    R = 35
    P = (37.0, 50.0)   # +
    Q = (63.0, 50.0)   # -

    def field(x, y):
        ex = ey = 0.0
        for (cx, cy), q in ((P, 1), (Q, -1)):
            dx, dy = x - cx, y - cy
            r2 = dx * dx + dy * dy + 1e-6
            r3 = r2 ** 1.5
            ex += q * dx / r3
            ey += q * dy / r3
        return ex, ey

    lines = []
    N = 40
    for k in range(N):
        a = (k + 0.5) / N * TAU
        x, y = P[0] + math.cos(a) * 1.6, P[1] + math.sin(a) * 1.6
        pts = [(x, y)]
        for _ in range(4000):
            ex, ey = field(x, y)
            m = math.hypot(ex, ey)
            h = 0.25
            # RK2
            mx_, my_ = x + ex / m * h * 0.5, y + ey / m * h * 0.5
            ex2, ey2 = field(mx_, my_)
            m2 = math.hypot(ex2, ey2)
            nx, ny = x + ex2 / m2 * h, y + ey2 / m2 * h
            if math.hypot(nx - 50, ny - 50) > R:
                # land exactly on the rim
                lo, hi = 0.0, 1.0
                for _ in range(20):
                    mid = (lo + hi) / 2
                    tx, ty = x + (nx - x) * mid, y + (ny - y) * mid
                    if math.hypot(tx - 50, ty - 50) > R:
                        hi = mid
                    else:
                        lo = mid
                pts.append((x + (nx - x) * lo, y + (ny - y) * lo))
                break
            x, y = nx, ny
            if math.hypot(x - Q[0], y - Q[1]) < 1.6:
                pts.append((x, y))
                break
            if len(pts) == 0 or math.hypot(x - pts[-1][0], y - pts[-1][1]) > 0.6:
                pts.append((x, y))
        lines.append(line_d(pts))
    # mirrored lines leaving Q outward (complete the rim from the - side)
    for k in range(N):
        a = (k + 0.5) / N * TAU
        x, y = Q[0] + math.cos(a) * 1.6, Q[1] + math.sin(a) * 1.6
        pts = [(x, y)]
        reached_p = False
        for _ in range(4000):
            ex, ey = field(x, y)
            ex, ey = -ex, -ey
            m = math.hypot(ex, ey)
            h = 0.25
            mx_, my_ = x + ex / m * h * 0.5, y + ey / m * h * 0.5
            ex2, ey2 = field(mx_, my_)
            ex2, ey2 = -ex2, -ey2
            m2 = math.hypot(ex2, ey2)
            nx, ny = x + ex2 / m2 * h, y + ey2 / m2 * h
            if math.hypot(nx - 50, ny - 50) > R:
                lo, hi = 0.0, 1.0
                for _ in range(20):
                    mid = (lo + hi) / 2
                    tx, ty = x + (nx - x) * mid, y + (ny - y) * mid
                    if math.hypot(tx - 50, ty - 50) > R:
                        hi = mid
                    else:
                        lo = mid
                pts.append((x + (nx - x) * lo, y + (ny - y) * lo))
                break
            x, y = nx, ny
            if math.hypot(x - P[0], y - P[1]) < 1.6:
                reached_p = True
                break
            if math.hypot(x - pts[-1][0], y - pts[-1][1]) > 0.6:
                pts.append((x, y))
        if not reached_p:  # only the ones escaping to the rim (others already drawn)
            lines.append(line_d(pts))
    body = (
        f'<path d="{"".join(lines)}" fill="none" stroke="#F4F7FF" stroke-width=".55" stroke-linecap="round"/>'
        f'<circle cx="50" cy="50" r="{R}" fill="none" stroke="#F4F7FF" stroke-width="1.4"/>'
        f'<circle cx="{f(P[0])}" cy="50" r="3.1" fill="#F4F7FF"/>'
        f'<circle cx="{f(Q[0])}" cy="50" r="3.1" fill="#F4F7FF"/>'
    )
    return svg("GN5", "#1F44F0", body)


# =============================================================================
# GN6 — Voronoi disc: center-weighted seeds, cells clipped to a circle
# =============================================================================
def clip_halfplane(poly, a, b, c):
    """keep points where a*x + b*y <= c"""
    out = []
    n = len(poly)
    for i in range(n):
        p, q = poly[i], poly[(i + 1) % n]
        fp = a * p[0] + b * p[1] - c
        fq = a * q[0] + b * q[1] - c
        if fp <= 0:
            out.append(p)
        if (fp <= 0) != (fq <= 0):
            t = fp / (fp - fq)
            out.append((p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t))
    return out


def gn6():
    rnd = random.Random(7)
    R = 35
    seeds = []
    # golden-angle (phyllotaxis) seeds, jittered -> organic but even
    n = 84
    ga = math.pi * (3 - math.sqrt(5))
    for i in range(n):
        r = R * 1.02 * math.sqrt((i + 0.5) / n)
        a = i * ga
        j = 0.9
        seeds.append((50 + r * math.cos(a) + rnd.uniform(-j, j), 50 + r * math.sin(a) + rnd.uniform(-j, j)))
    disc = [(50 + R * math.cos(t / 96 * TAU), 50 + R * math.sin(t / 96 * TAU)) for t in range(96)]
    pal = ["#FFE1A6", "#FFC673", "#FFA44A", "#FF8233", "#F45F22", "#E2461A"]
    cells = {c: [] for c in pal}
    for i, s in enumerate(seeds):
        poly = disc[:]
        for k, t in enumerate(seeds):
            if k == i:
                continue
            a, b = t[0] - s[0], t[1] - s[1]
            c = (t[0] ** 2 + t[1] ** 2 - s[0] ** 2 - s[1] ** 2) / 2
            poly = clip_halfplane(poly, a, b, c)
            if not poly:
                break
        if len(poly) < 3:
            continue
        # shrink toward centroid -> gutters
        cx = sum(p[0] for p in poly) / len(poly)
        cy = sum(p[1] for p in poly) / len(poly)
        dist = math.hypot(cx - 50, cy - 50) / R
        col = pal[min(len(pal) - 1, int(dist * 5.0 + rnd.random() * 0.6))]
        cells[col].append(poly)
    body = []
    for col, polys in cells.items():
        if polys:
            body.append(f'<path d="{"".join(poly_d(p) for p in polys)}" fill="{col}"/>')
    # gutters: stroke with background colour (keeps cells crisp + rim intact)
    allp = "".join(poly_d(p) for ps in cells.values() for p in ps)
    body.append(f'<path d="{allp}" fill="none" stroke="#1A0F0B" stroke-width=".9" stroke-linejoin="round"/>')
    body.append(f'<circle cx="50" cy="50" r="{R}" fill="none" stroke="#1A0F0B" stroke-width="1"/>')
    return svg("GN6", "#1A0F0B", "".join(body))


# =============================================================================
# GN7 — parametric scan-line field; line weight driven by an SDF of "[ ]"
# =============================================================================
def sd_box(px, py, cx, cy, hw, hh):
    dx, dy = abs(px - cx) - hw, abs(py - cy) - hh
    ox, oy = max(dx, 0), max(dy, 0)
    return math.hypot(ox, oy) + min(max(dx, dy), 0)


def bracket_sdf(x, y):
    # left [ : vertical bar + two arms; right ] mirrored
    top, bot = 23, 77
    t = 6.2   # stroke
    arm = 13
    d = 1e9
    for side in (-1, 1):
        xv = 50 + side * 27          # vertical stem centre
        d = min(d, sd_box(x, y, xv, 50, t / 2, (bot - top) / 2))
        xa = xv - side * (arm / 2 - t / 2)
        d = min(d, sd_box(x, y, xa, top + t / 2, arm / 2, t / 2))
        d = min(d, sd_box(x, y, xa, bot - t / 2, arm / 2, t / 2))
    # the meeting point: a centre dot
    d = min(d, math.hypot(x - 50, y - 50) - 5.2)
    return d


def gn7():
    pitch = 1.9
    wmin, wmax = 0.11, pitch * 0.47
    paths = []
    y = 12 + pitch / 2
    while y < 88:
        top, bot = [], []
        x = 12
        while x <= 88.001:
            d = bracket_sdf(x, y)
            s = 1 / (1 + math.exp(d / 0.55))  # soft step
            hw = wmin / 2 + (wmax - wmin / 2) * s
            top.append((x, y - hw))
            bot.append((x, y + hw))
            x += 0.5
        paths.append(poly_d(top + bot[::-1]))
        y += pitch
    defs = '<clipPath id="gn7c"><rect x="12" y="12" width="76" height="76" rx="12"/></clipPath>'
    body = f'<g clip-path="url(#gn7c)"><path d="{"".join(paths)}" fill="#D9FF3F"/></g>'
    return svg("GN7", "#0C0D0A", body, defs)


# =============================================================================
# GN8 — complete graph K_n ("mystic rose"): every node meets every node
# =============================================================================
def gn8():
    n = 13
    R = 35
    pts = [(50 + R * math.cos(i / n * TAU - math.pi / 2), 50 + R * math.sin(i / n * TAU - math.pi / 2)) for i in range(n)]
    # group chords by span so far/near chords can take different weights
    groups = {}
    for i in range(n):
        for j in range(i + 1, n):
            span = min(j - i, n - (j - i))
            groups.setdefault(span, []).append(f"M{f(pts[i][0])} {f(pts[i][1])}L{f(pts[j][0])} {f(pts[j][1])}")
    body = []
    for span, segs in sorted(groups.items()):
        op = 0.55 + 0.45 * (span / (n // 2))
        body.append(f'<path d="{"".join(segs)}" stroke-opacity="{f(op)}"/>')
    g = f'<g fill="none" stroke="#14171C" stroke-width=".42">{"".join(body)}</g>'
    ring = f'<circle cx="50" cy="50" r="{R}" fill="none" stroke="#1B1E24" stroke-width="1.1"/>'
    nodes = "".join(f'<circle cx="{f(x)}" cy="{f(y)}" r="1.7"/>' for x, y in pts)
    hub = '<circle cx="50" cy="50" r="2.6" fill="#E5482B"/>'
    return svg("GN8", "#F3EFE6", g + ring + f'<g fill="#1B1E24">{nodes}</g>' + hub)


META = [
    {"code": "GN1", "name": "방사 일륜", "note": "144개의 기울어진 테이퍼 광선이 소용돌이 원환을 이루는 금빛 일륜 — 전체(pan)이자 동방의 해"},
    {"code": "GN2", "name": "모아레 쌍원", "note": "두 동심원 군이 겹쳐 간섭무늬를 만드는 주홍 원판 — 두 세계가 만나는 지점"},
    {"code": "GN3", "name": "하프톤 구체", "note": "동심원 도트 매트릭스의 점 크기만으로 빛을 받는 구(지구)를 그린 민트 하프톤"},
    {"code": "GN4", "name": "하모노그래프", "note": "회전 진자 두 개의 감쇠 궤적이 1만5천 점으로 겹쳐 짠 로제트 — 리듬과 순환"},
    {"code": "GN5", "name": "쌍극 흐름장", "note": "두 극을 잇는 전기장 역선이 원 안을 채우는 흐름장 — 연결의 물리학"},
    {"code": "GN6", "name": "보로노이 원판", "note": "필로택시스 시드로 나눈 84개 보로노이 셀이 하나의 원을 이루는 네트워크"},
    {"code": "GN7", "name": "괄호 스캔라인", "note": "스캔라인 굵기를 SDF로 변조해 워드마크의 [ · ]가 떠오르는 라인필드"},
    {"code": "GN8", "name": "완전 그래프", "note": "13개 노드가 서로 모두 연결된 K13 미스틱 로즈 — 'pan'의 모든-대-모든 연결"},
]


def main():
    gens = [gn1, gn2, gn3, gn4, gn5, gn6, gn7, gn8]
    for i, g in enumerate(gens, 1):
        s = g()
        p = os.path.join(OUT, f"GN{i}.svg")
        with open(p, "w") as fh:
            fh.write(s)
        print(f"GN{i}.svg {len(s) / 1024:.1f}KB")
    with open(os.path.join(OUT, "meta.json"), "w") as fh:
        json.dump(META, fh, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
