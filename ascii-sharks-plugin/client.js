/**
 * ascii-sharks for DeepSeek Harness — an ambient ASCII ocean in the frame gutters.
 * Shark, fish and ocean simulation ported from https://github.com/stackedlol/ascii-sharks
 * (TypeScript sources, plain-JS port). Rendering adapted for the Harness shell.
 */
window.__ModuleLoader__.load({
  id: '@local/ascii-ocean',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const TAU = Math.PI * 2;
    const clamp = (v, lo, hi)=>v < lo ? lo : v > hi ? hi : v;
    const rand = (lo, hi)=>lo + Math.random() * (hi - lo);
    const randInt = (lo, hi)=>Math.floor(rand(lo, hi + 1));
    function smoothstep(e0, e1, x) {
        const t = clamp((x - e0) / (e1 - e0), 0, 1);
        return t * t * (3 - 2 * t);
    }
    function angleDiff(a, b) {
        let d = (b - a) % TAU;
        if (d > Math.PI) d -= TAU;
        if (d < -Math.PI) d += TAU;
        return d;
    }
    function hash3(x, y, z) {
        let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1442695041);
        h = Math.imul(h ^ h >>> 13, 1274126177);
        h ^= h >>> 16;
        return (h >>> 0) / 4294967296;
    }
    const K1 = 1 / 260;
    const K2 = 1 / 310;
    const K3 = 1 / 190;
    const CURRENT_SCALE = 3400;
    function current(x, y, t, out) {
        const a = x * K1 + t * 0.07;
        const b = y * K2 - t * 0.05;
        const c = (x + y) * K3 + t * 0.11;
        out.x = (-K2 * Math.sin(a) * Math.sin(b) + 0.5 * K3 * Math.cos(c)) * CURRENT_SCALE;
        out.y = (-K1 * Math.cos(a) * Math.cos(b) - 0.5 * K3 * Math.cos(c)) * CURRENT_SCALE;
        return out;
    }

    const SPECIES = [
        {
            name: "sardine",
            cruise: 36,
            maxSpeed: 64,
            minSpeed: 18,
            weight: 3,
            schoolSize: [
                18,
                28
            ],
            spacing: [
                1.8,
                1.1
            ],
            align: 1.6,
            cohesion: 1.6,
            jitter: 40,
            mill: 70,
            verticalDrag: 0.5
        },
        {
            name: "anchovy",
            cruise: 46,
            maxSpeed: 78,
            minSpeed: 22,
            weight: 3,
            schoolSize: [
                20,
                32
            ],
            spacing: [
                1.5,
                1
            ],
            align: 3.2,
            cohesion: 0.45,
            jitter: 30,
            mill: 0,
            verticalDrag: 1.4
        },
        {
            name: "silverside",
            cruise: 40,
            maxSpeed: 70,
            minSpeed: 20,
            weight: 3,
            schoolSize: [
                12,
                20
            ],
            spacing: [
                2,
                1.1
            ],
            align: 2.4,
            cohesion: 1.1,
            jitter: 35,
            mill: 0,
            verticalDrag: 1.6
        },
        {
            name: "mackerel",
            cruise: 32,
            maxSpeed: 60,
            minSpeed: 16,
            weight: 2,
            schoolSize: [
                5,
                9
            ],
            spacing: [
                2.6,
                1.3
            ],
            align: 2,
            cohesion: 0.9,
            jitter: 25,
            mill: 0,
            verticalDrag: 2
        },
        {
            name: "goby",
            cruise: 26,
            maxSpeed: 56,
            minSpeed: 10,
            weight: 1,
            schoolSize: [
                8,
                12
            ],
            spacing: [
                1.4,
                1.1
            ],
            align: 0.35,
            cohesion: 1.4,
            jitter: 110,
            mill: 0,
            verticalDrag: 0.3
        }
    ];
    const TOTAL_WEIGHT = SPECIES.reduce((sum, s)=>sum + s.weight, 0);
    function pickSpecies() {
        let r = Math.random() * TOTAL_WEIGHT;
        for(let i = 0; i < SPECIES.length; i++){
            r -= SPECIES[i].weight;
            if (r <= 0) return i;
        }
        return 0;
    }

    const SHARK_NODES = 20;
    const DEFAULT_SHARKS = [
        {
            kind: "classic",
            size: 1
        },
        {
            kind: "classic",
            size: 0.7
        },
        {
            kind: "classic",
            size: 0.84
        },
        {
            kind: "classic",
            size: 0.77
        }
    ];
    const FISH_SEPARATION_K = 420;
    const FISH_ALIGN_K = 1.4;
    const FISH_COHESION_K = 1;
    const FISH_FLEE_K = 1100;
    const BLIND_COS = -0.6;
    class World {
        sharkSpecs;
        fishCount;
        width = 0;
        height = 0;
        time = 0;
        fish = [];
        sharks = [];
        events = [];
        pointer = {
            x: 0,
            y: 0,
            active: false
        };
        /** Visible water rectangles in frame coordinates; sharks patrol inside one. */
        regions = [];
        /** Skip hunting/feeding so the sharks stay on their patrol and in view. */
        peaceful = false;
        /** Optional fixed length in px for the biggest shark. */
        baseLength = 0;
        /**
         * Pick a random patrol point inside a nearby water region, inset so a full
         * body stays clear of the walls. When regions overlap or touch (the hero's
         * side gutters meet its wide top/bottom bands), the shark may cross over
         * instead of orbiting the same strip forever.
         */
        pickWaypoint(x, y, length) {
            const regs = this.regions;
            if (!regs.length) return null;
            const distances = regs.map((reg)=>{
                const dx = Math.max(reg.x - x, 0, x - (reg.x + reg.w));
                const dy = Math.max(reg.y - y, 0, y - (reg.y + reg.h));
                return Math.hypot(dx, dy);
            });
            const nearest = Math.min(...distances);
            const near = [];
            for(let i = 0; i < regs.length; i++){
                if (distances[i] <= nearest + 90) near.push(regs[i]);
            }
            const best = near[Math.floor(Math.random() * near.length)] ?? regs[0];
            const padX = Math.min(best.w * 0.28, Math.max(18, length * 0.3));
            const padY = Math.min(best.h * 0.18, Math.max(56, length * 0.8));
            const x0 = best.x + padX;
            const x1 = best.x + best.w - padX;
            const y0 = best.y + padY;
            const y1 = best.y + best.h - padY;
            return {
                x: x1 > x0 ? rand(x0, x1) : best.x + best.w / 2,
                y: y1 > y0 ? rand(y0, y1) : best.y + best.h / 2
            };
        }
        perception = 60;
        sepX = [];
        sepY = [];
        foreignSep = 40;
        bucketCols = 0;
        bucketRows = 0;
        bucketHead = new Int32Array(0);
        bucketCount = new Uint16Array(0);
        bucketNext = new Int32Array(0);
        lastSpawn = 0;
        tmp = {
            x: 0,
            y: 0
        };
        constructor(sharkSpecs = DEFAULT_SHARKS, fishCount){
            this.sharkSpecs = sharkSpecs;
            this.fishCount = fishCount;
        }
        resize(width, height, cellW, cellH) {
            const first = this.width === 0;
            this.width = width;
            this.height = height;
            this.sepX = SPECIES.map((sp)=>sp.spacing[0] * cellW);
            this.sepY = SPECIES.map((sp)=>sp.spacing[1] * cellH);
            this.perception = Math.max(cellH * 3, cellW * 5.5);
            this.foreignSep = cellW * 3;
            if (first || this.fish.length === 0) {
                this.seed();
                return;
            }
            for (const f of this.fish){
                f.x = clamp(f.x, 0, width);
                f.y = clamp(f.y, 0, height);
            }
        }
        seed() {
            const { width: W, height: H } = this;
            const minSide = Math.min(W, H);
            const baseLength = this.baseLength || clamp(minSide * 0.44, 170, 430);
            const sharkCount = this.sharkSpecs.length;
            this.sharks = [];
            for(let i = 0; i < sharkCount; i++){
                const { kind, size } = this.sharkSpecs[i];
                const length = baseLength * size;
                const orbitRadius = minSide * rand(0.28, 0.4);
                const a = i / sharkCount * TAU + rand(-0.4, 0.4);
                const orbitDir = i % 2 === 0 ? 1 : -1;
                let x = W / 2 + Math.cos(a) * orbitRadius * (W / minSide) * 0.9;
                let y = H / 2 + Math.sin(a) * orbitRadius;
                const reg = this.regions[i % this.regions.length];
                if (this.regions.length) {
                    x = reg.x + reg.w * rand(0.25, 0.75);
                    y = reg.y + reg.h * rand(0.2, 0.8);
                }
                const heading = a + orbitDir * Math.PI / 2;
                const nodes = new Float32Array(SHARK_NODES * 2);
                const seg = length / (SHARK_NODES - 1);
                for(let n = 0; n < SHARK_NODES; n++){
                    nodes[n * 2] = x - Math.cos(heading) * seg * n;
                    nodes[n * 2 + 1] = y - Math.sin(heading) * seg * n;
                }
                this.sharks.push({
                    id: i + 1,
                    kind,
                    length,
                    nodes,
                    heading,
                    speed: 30,
                    phase: rand(0, TAU),
                    turn: 0,
                    hunger: rand(0.25, 0.75),
                    wander: 0,
                    orbitDir,
                    orbitRadius,
                    target: null,
                    retargetAt: 0,
                    waypoint: null,
                    waypointAt: 0,
                    moodAt: 0,
                    roamAt: rand(0, 2),
                    targetHeading: heading,
                    seek: 1.2,
                    drift: 1,
                    speedBias: 1,
                    depth: size
                });
            }
            this.sharks.sort((a, b)=>a.length - b.length);
            const total = this.fishCount ?? clamp(Math.round(W * H / 4400), 85, 340);
            this.fish = [];
            while(this.fish.length < total){
                const species = pickSpecies();
                const sp = SPECIES[species];
                const size = Math.min(randInt(sp.schoolSize[0], sp.schoolSize[1]), total - this.fish.length);
                const millDir = Math.random() < 0.5 ? 1 : -1;
                const reg = this.regions.length ? this.regions[randInt(0, this.regions.length - 1)] : null;
                const cx = reg ? reg.x + reg.w * rand(0.2, 0.8) : rand(W * 0.06, W * 0.94);
                const cy = reg ? reg.y + reg.h * rand(0.1, 0.9) : rand(H * 0.08, H * 0.92);
                const dir = (Math.random() < 0.5 ? 0 : Math.PI) + rand(-0.5, 0.5);
                for(let k = 0; k < size; k++){
                    this.fish.push({
                        x: cx + rand(-1, 1) * this.sepX[species] * Math.sqrt(size),
                        y: cy + rand(-1, 1) * this.sepY[species] * Math.sqrt(size) * 0.6,
                        vx: Math.cos(dir) * sp.cruise,
                        vy: Math.sin(dir) * sp.cruise,
                        species,
                        alarm: 0,
                        alive: true,
                        respawnAt: 0,
                        phase: rand(0, TAU),
                        turn: 0,
                        depth: rand(0.55, 1),
                        millDir
                    });
                }
            }
            this.bucketNext = new Int32Array(this.fish.length);
        }
        splash(x, y) {
            this.events.push({
                kind: "splash",
                x,
                y
            });
            const r = 240;
            for (const f of this.fish){
                if (!f.alive) continue;
                const dx = f.x - x;
                const dy = f.y - y;
                const d = Math.hypot(dx, dy);
                if (d > r || d < 1e-3) continue;
                const k = (1 - d / r) * 260;
                f.vx += dx / d * k;
                f.vy += dy / d * k;
                f.alarm = 1;
            }
        }
        step(dt) {
            this.time += dt;
            this.rebuildHash();
            this.stepFish(dt);
            this.stepSharks(dt);
            this.respawn();
        }
        rebuildHash() {
            const size = this.perception;
            const pad = 2;
            this.bucketCols = Math.ceil(this.width / size) + pad * 2;
            this.bucketRows = Math.ceil(this.height / size) + pad * 2;
            const n = this.bucketCols * this.bucketRows;
            if (this.bucketHead.length !== n) {
                this.bucketHead = new Int32Array(n);
                this.bucketCount = new Uint16Array(n);
            }
            this.bucketHead.fill(-1);
            this.bucketCount.fill(0);
            if (this.bucketNext.length !== this.fish.length) {
                this.bucketNext = new Int32Array(this.fish.length);
            }
            for(let i = 0; i < this.fish.length; i++){
                const f = this.fish[i];
                if (!f.alive) continue;
                const b = this.bucketOf(f.x, f.y);
                this.bucketNext[i] = this.bucketHead[b];
                this.bucketHead[b] = i;
                this.bucketCount[b]++;
            }
        }
        bucketOf(x, y) {
            const size = this.perception;
            const c = clamp(Math.floor(x / size) + 2, 0, this.bucketCols - 1);
            const r = clamp(Math.floor(y / size) + 2, 0, this.bucketRows - 1);
            return r * this.bucketCols + c;
        }
        stepFish(dt) {
            const { fish, sharks, pointer, width: W, height: H, time } = this;
            const R = this.perception;
            const R2 = R * R;
            const foreignSep = this.foreignSep;
            const size = this.perception;
            const cols = this.bucketCols;
            const rows = this.bucketRows;
            const head = this.bucketHead;
            const next = this.bucketNext;
            const cur = this.tmp;
            const calmDecay = Math.exp(-dt * 0.7);
            const contagion = Math.min(1, dt * 6);
            for(let i = 0; i < fish.length; i++){
                const f = fish[i];
                if (!f.alive) continue;
                const sp = SPECIES[f.species];
                const spread = 1 + 1.8 * f.alarm;
                const sepX = this.sepX[f.species] * spread;
                const sepY = this.sepY[f.species] * spread;
                const speed = Math.hypot(f.vx, f.vy) || 1;
                const hx = f.vx / speed;
                const hy = f.vy / speed;
                let ax = 0;
                let ay = 0;
                let sx = 0;
                let sy = 0;
                let avx = 0;
                let avy = 0;
                let cx = 0;
                let cy = 0;
                let n = 0;
                let neighbourAlarm = 0;
                const bc = clamp(Math.floor(f.x / size) + 2, 0, cols - 1);
                const br = clamp(Math.floor(f.y / size) + 2, 0, rows - 1);
                for(let r = Math.max(0, br - 1); r <= Math.min(rows - 1, br + 1); r++){
                    for(let c = Math.max(0, bc - 1); c <= Math.min(cols - 1, bc + 1); c++){
                        let j = head[r * cols + c];
                        while(j !== -1){
                            if (j !== i) {
                                const o = fish[j];
                                const dx = o.x - f.x;
                                const dy = o.y - f.y;
                                const d2 = dx * dx + dy * dy;
                                if (d2 < R2 && d2 > 1e-6) {
                                    const d = Math.sqrt(d2);
                                    if ((dx * hx + dy * hy) / d > BLIND_COS) {
                                        const qx = dx / sepX;
                                        const qy = dy / sepY;
                                        const q2 = qx * qx + qy * qy;
                                        if (q2 < 1) {
                                            const q = Math.sqrt(q2) || 1e-3;
                                            const k = (1 - q) / q;
                                            sx -= qx * k;
                                            sy -= qy * k;
                                        }
                                        if (o.species === f.species) {
                                            avx += o.vx;
                                            avy += o.vy;
                                            cx += dx;
                                            cy += dy;
                                            n++;
                                        } else if (d < foreignSep) {
                                            const k = (1 - d / foreignSep) / d * 0.6;
                                            sx -= dx * k;
                                            sy -= dy * k;
                                        }
                                        if (o.alarm > neighbourAlarm) neighbourAlarm = o.alarm;
                                    }
                                }
                            }
                            j = next[j];
                        }
                    }
                }
                ax += sx * FISH_SEPARATION_K;
                ay += sy * FISH_SEPARATION_K;
                if (n > 0) {
                    const alignK = FISH_ALIGN_K * sp.align;
                    const cohesionK = FISH_COHESION_K * sp.cohesion * (1 - 0.8 * f.alarm);
                    ax += (avx / n - f.vx) * alignK + cx / n * cohesionK;
                    ay += (avy / n - f.vy) * alignK + cy / n * cohesionK;
                    if (sp.mill > 0) {
                        const cl = Math.hypot(cx, cy) || 1;
                        ax += -cy / cl * f.millDir * sp.mill * (1 - f.alarm);
                        ay += cx / cl * f.millDir * sp.mill * (1 - f.alarm);
                    }
                }
                let fear = 0;
                for (const sh of sharks){
                    const fearR = sh.length * 0.6 + 60;
                    let best = Infinity;
                    let bx = 0;
                    let by = 0;
                    for(let k = 0; k <= 12; k += 3){
                        const nx = sh.nodes[k * 2];
                        const ny = sh.nodes[k * 2 + 1];
                        const d2 = (f.x - nx) ** 2 + (f.y - ny) ** 2;
                        if (d2 < best) {
                            best = d2;
                            bx = nx;
                            by = ny;
                        }
                    }
                    const d = Math.sqrt(best);
                    if (d >= fearR || d < 1e-3) continue;
                    let w = 1 - d / fearR;
                    w *= w;
                    const awayX = (f.x - bx) / d;
                    const awayY = (f.y - by) / d;
                    const shx = Math.cos(sh.heading);
                    const shy = Math.sin(sh.heading);
                    const side = shx * (f.y - sh.nodes[1]) - shy * (f.x - sh.nodes[0]) >= 0 ? 1 : -1;
                    ax += (awayX * 0.7 - shy * side * 0.9) * FISH_FLEE_K * w;
                    ay += (awayY * 0.7 + shx * side * 0.9) * FISH_FLEE_K * w;
                    fear = Math.max(fear, Math.sqrt(w));
                }
                if (pointer.active) {
                    const pr = 130;
                    const dx = f.x - pointer.x;
                    const dy = f.y - pointer.y;
                    const d = Math.hypot(dx, dy);
                    if (d < pr && d > 1e-3) {
                        const w = (1 - d / pr) ** 2;
                        ax += dx / d * FISH_FLEE_K * w;
                        ay += dy / d * FISH_FLEE_K * w;
                        fear = Math.max(fear, Math.sqrt(w) * 0.8);
                    }
                }
                let alarm = Math.max(f.alarm * calmDecay, fear);
                const relayed = neighbourAlarm * 0.86;
                if (relayed > alarm) alarm += (relayed - alarm) * contagion;
                f.alarm = alarm;
                const m = 36;
                if (f.x < m) ax += (m - f.x) * 7;
                else if (f.x > W - m) ax -= (f.x - (W - m)) * 7;
                if (f.y < m) ay += (m - f.y) * 7;
                else if (f.y > H - m) ay -= (f.y - (H - m)) * 7;
                current(f.x, f.y, time, cur);
                ax += cur.x * 0.5 + (Math.random() - 0.5) * sp.jitter;
                ay += cur.y * 0.5 + (Math.random() - 0.5) * sp.jitter;
                ay -= f.vy * sp.verticalDrag * (1 - 0.7 * f.alarm);
                const preferred = sp.cruise * (1 + 1.3 * f.alarm);
                ax += (preferred - speed) * hx * 1.6;
                ay += (preferred - speed) * hy * 1.6;
                const before = Math.atan2(f.vy, f.vx);
                f.vx += ax * dt;
                f.vy += ay * dt;
                const maxSpeed = sp.maxSpeed * (1 + 1.8 * f.alarm);
                const s = Math.hypot(f.vx, f.vy);
                if (s > maxSpeed) {
                    f.vx *= maxSpeed / s;
                    f.vy *= maxSpeed / s;
                } else if (s < sp.minSpeed && s > 1e-3) {
                    f.vx *= sp.minSpeed / s;
                    f.vy *= sp.minSpeed / s;
                }
                f.turn += (angleDiff(before, Math.atan2(f.vy, f.vx)) / dt - f.turn) * Math.min(1, dt * 8);
                f.phase += dt * (7 + Math.hypot(f.vx, f.vy) * 0.12);
                f.x = clamp(f.x + f.vx * dt, -60, W + 60);
                f.y = clamp(f.y + f.vy * dt, -60, H + 60);
            }
        }
        stepSharks(dt) {
            const { sharks, width: W, height: H, time } = this;
            const minSide = Math.min(W, H);
            const cxW = W / 2;
            const cyW = H / 2;
            for (const sh of sharks){
                const L = sh.length;
                const nodes = sh.nodes;
                const hx = nodes[0];
                const hy = nodes[1];
                sh.hunger = Math.min(1, sh.hunger + dt * 0.03);
                // Every few seconds a shark adopts a new cruising mood: how hard it
                // steers for its waypoint, how much it weaves, and how fast it swims.
                // This keeps the paths from collapsing into the same repeated arc.
                if (time >= sh.moodAt) {
                    sh.moodAt = time + rand(4, 9);
                    sh.seek = rand(0.9, 1.6);
                    sh.drift = rand(0.35, 1.2);
                    sh.speedBias = rand(0.75, 1.35);
                }
                // A loose, continuous wander: a new heading every few seconds,
                // sometimes a near U-turn, with no fixed waypoint to circle back to.
                if (time >= sh.roamAt) {
                    sh.roamAt = time + rand(2.2, 5.5);
                    sh.targetHeading = sh.heading + rand(-1.6, 1.6);
                    if (Math.random() < 0.1) sh.targetHeading += Math.PI;
                }
                let dx = Math.cos(sh.heading);
                let dy = Math.sin(sh.heading);
                sh.wander = clamp(sh.wander + (Math.random() - 0.5) * dt * 3.2, -1.1, 1.1);
                dx += Math.cos(sh.heading + sh.wander) * 0.5;
                dy += Math.sin(sh.heading + sh.wander) * 0.5;
                if (!this.peaceful && time >= sh.retargetAt) {
                    sh.target = this.findPrey(sh);
                    sh.retargetAt = time + 0.45;
                }
                const t = this.peaceful ? null : sh.target;
                let hunting = false;
                let closing = 0;
                if (t && t.alive && sh.hunger > 0.3) {
                    const tx = t.x + t.vx * 0.35 - hx;
                    const ty = t.y + t.vy * 0.35 - hy;
                    const d = Math.hypot(tx, ty) || 1;
                    const w = 1.4 + 2.6 * sh.hunger;
                    dx += tx / d * w;
                    dy += ty / d * w;
                    hunting = true;
                    closing = clamp(1 - d / (L * 0.9), 0, 1);
                } else if (this.regions.length) {
                    // Soft water boundaries and a free heading: no waypoint to
                    // return to, so the path keeps drifting in new directions.
                    const regions = this.regions;
                    const inWater = (px, py)=>{
                        for (const r of regions){
                            if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return true;
                        }
                        return false;
                    };
                    let reg = regions[0];
                    let bestD = Infinity;
                    for (const r of regions){
                        const gx = Math.max(r.x - hx, 0, hx - (r.x + r.w));
                        const gy = Math.max(r.y - hy, 0, hy - (r.y + r.h));
                        const d = Math.hypot(gx, gy);
                        if (d < bestD) {
                            bestD = d;
                            reg = r;
                        }
                    }
                    let pushX = 0;
                    let pushY = 0;
                    if (bestD > 0.5) {
                        // Outside the water: come back toward the nearest pool.
                        const tx = reg.x + reg.w / 2 - hx;
                        const ty = reg.y + reg.h / 2 - hy;
                        const d = Math.hypot(tx, ty) || 1;
                        pushX = tx / d * 3.2;
                        pushY = ty / d * 3.2;
                    } else {
                        const m = Math.max(L * 0.45, 64);
                        // Only react to an edge that is not shared with another
                        // water rectangle, so the hero's bands and side channels
                        // stay connected instead of becoming separate tanks.
                        if (hx < reg.x + m && !inWater(reg.x - 4, hy)) pushX += (1 - (hx - reg.x) / m) * 2.6;
                        else if (hx > reg.x + reg.w - m && !inWater(reg.x + reg.w + 4, hy)) pushX -= (1 - (reg.x + reg.w - hx) / m) * 2.6;
                        if (hy < reg.y + m && !inWater(hx, reg.y - 4)) pushY += (1 - (hy - reg.y) / m) * 2.6;
                        else if (hy > reg.y + reg.h - m && !inWater(hx, reg.y + reg.h + 4)) pushY -= (1 - (reg.y + reg.h - hy) / m) * 2.6;
                    }
                    const hxDir = Math.cos(sh.targetHeading);
                    const hyDir = Math.sin(sh.targetHeading);
                    const weave = Math.sin(time * 0.55 + sh.id * 1.9 + sh.phase * 0.13) * sh.drift;
                    dx += hxDir * sh.seek + pushX - Math.sin(sh.heading) * weave * 0.8;
                    dy += hyDir * sh.seek + pushY + Math.cos(sh.heading) * weave * 0.8 + Math.sin(time * 0.17 + sh.id) * 0.3;
                } else {
                    const rx = (hx - cxW) / (W / minSide);
                    const ry = hy - cyW;
                    const r = Math.hypot(rx, ry) || 1;
                    const radius = sh.orbitRadius * (1 + 0.15 * Math.sin(time * 0.05 + sh.id));
                    const radial = clamp((radius - r) / radius, -1, 1);
                    dx += (-ry / r * sh.orbitDir + rx / r * radial * 0.9) * 0.55;
                    dy += (rx / r * sh.orbitDir + ry / r * radial * 0.9) * 0.55;
                }
                for (const other of sharks){
                    if (other === sh) continue;
                    for(let k = 0; k < SHARK_NODES; k += 4){
                        const ox = hx - other.nodes[k * 2];
                        const oy = hy - other.nodes[k * 2 + 1];
                        const d = Math.hypot(ox, oy);
                        const range = (L + other.length) * 0.45;
                        if (d < range && d > 1e-3) {
                            const w = (1 - d / range) * 3;
                            dx += ox / d * w;
                            dy += oy / d * w;
                        }
                    }
                }
                const ex = (hx - cxW) / (W * 0.3);
                const ey = (hy - cyW) / (H * 0.16);
                const e2 = ex * ex + ey * ey;
                if (e2 < 1) {
                    const e = Math.sqrt(e2) || 1e-3;
                    const w = (1 - e) * (hunting ? 1 : 2.5);
                    dx += ex / e * w;
                    dy += ey / e * w;
                }
                const over = Math.max(-hx, hx - W, -hy, hy - H);
                if (over > -L * 0.05) {
                    const w = clamp((over + L * 0.05) / (L * 0.35), 0, 1) * 3.5;
                    const toX = cxW - hx;
                    const toY = cyW - hy;
                    const d = Math.hypot(toX, toY) || 1;
                    dx += toX / d * w;
                    dy += toY / d * w;
                }
                const desired = Math.atan2(dy, dx);
                const agility = Math.min(hunting ? 1.7 + closing : 0.95, sh.speed / (L * 0.22));
                const maxTurn = agility * dt;
                const turned = clamp(angleDiff(sh.heading, desired), -maxTurn, maxTurn);
                sh.heading += turned;
                sh.turn += (turned / dt - sh.turn) * Math.min(1, dt * 3);
                const cruise = 30 + L * 0.04;
                const targetSpeed = hunting
                    ? cruise * (1.45 + closing * 1.5)
                    : cruise * sh.speedBias * (1 + 0.1 * Math.sin(time * 0.7 + sh.id * 2.1));
                sh.speed += (targetSpeed - sh.speed) * Math.min(1, dt * 1.1);
                sh.phase += dt * (2 + sh.speed / 24);
                nodes[0] += Math.cos(sh.heading) * sh.speed * dt;
                nodes[1] += Math.sin(sh.heading) * sh.speed * dt;
                const seg = L / (SHARK_NODES - 1);
                const maxBend = 0.16;
                let prevAngle = sh.heading + Math.PI;
                for(let k = 1; k < SHARK_NODES; k++){
                    const px = nodes[(k - 1) * 2];
                    const py = nodes[(k - 1) * 2 + 1];
                    let angle = Math.atan2(nodes[k * 2 + 1] - py, nodes[k * 2] - px);
                    angle = prevAngle + clamp(angleDiff(prevAngle, angle), -maxBend, maxBend);
                    nodes[k * 2] = px + Math.cos(angle) * seg;
                    nodes[k * 2 + 1] = py + Math.sin(angle) * seg;
                    prevAngle = angle;
                }
                if (!this.peaceful && sh.hunger > 0.15) {
                    const mouthR = L * 0.05 + 8;
                    const mx = nodes[0];
                    const my = nodes[1];
                    for (const f of this.fish){
                        if (!f.alive) continue;
                        if ((f.x - mx) ** 2 + (f.y - my) ** 2 < mouthR * mouthR) {
                            f.alive = false;
                            f.respawnAt = time + rand(3, 8);
                            sh.hunger = Math.max(0, sh.hunger - 0.16);
                            this.events.push({
                                kind: "eat",
                                x: f.x,
                                y: f.y
                            });
                        }
                    }
                }
            }
        }
        findPrey(sh) {
            const range = sh.length * 0.9 + 160;
            const hx = sh.nodes[0];
            const hy = sh.nodes[1];
            const fx = Math.cos(sh.heading);
            const fy = Math.sin(sh.heading);
            let best = null;
            let bestScore = Infinity;
            let currentScore = Infinity;
            for (const f of this.fish){
                if (!f.alive) continue;
                const dx = f.x - hx;
                const dy = f.y - hy;
                const d = Math.hypot(dx, dy);
                if (d > range || d < 1e-3) continue;
                const cos = (dx * fx + dy * fy) / d;
                if (cos < 0.2) continue;
                const crowd = this.bucketCount[this.bucketOf(f.x, f.y)];
                const score = d * (1 + (1 - cos) * 0.8) * (1 + crowd * 0.07);
                if (score < bestScore) {
                    bestScore = score;
                    best = f;
                }
                if (f === sh.target) currentScore = score;
            }
            if (sh.target && currentScore < bestScore * 1.3) return sh.target;
            return best;
        }
        respawn() {
            const { time, width: W, height: H } = this;
            const due = [];
            for (const f of this.fish)if (!f.alive && f.respawnAt <= time) due.push(f);
            if (due.length === 0) return;
            if (due.length < 6 && time - this.lastSpawn < 9) return;
            this.lastSpawn = time;
            let x;
            let y;
            let inward;
            if (this.regions.length) {
                const reg = this.regions[randInt(0, this.regions.length - 1)];
                const side = randInt(0, 3);
                const along = rand(0.15, 0.85);
                x = side === 0 ? reg.x - 20 : side === 1 ? reg.x + reg.w + 20 : reg.x + along * reg.w;
                y = side === 2 ? reg.y - 20 : side === 3 ? reg.y + reg.h + 20 : reg.y + along * reg.h;
                inward = Math.atan2(reg.y + reg.h / 2 - y, reg.x + reg.w / 2 - x) + rand(-0.5, 0.5);
            } else {
                const side = randInt(0, 3);
                const along = rand(0.15, 0.85);
                x = side === 0 ? -20 : side === 1 ? W + 20 : along * W;
                y = side === 2 ? -20 : side === 3 ? H + 20 : along * H;
                inward = Math.atan2(H / 2 - y, W / 2 - x) + rand(-0.5, 0.5);
            }
            const species = pickSpecies();
            const sp = SPECIES[species];
            const millDir = Math.random() < 0.5 ? 1 : -1;
            for (const f of due.slice(0, sp.schoolSize[1])){
                f.alive = true;
                f.species = species;
                f.alarm = 0;
                f.turn = 0;
                f.millDir = millDir;
                f.x = x + rand(-1, 1) * this.perception;
                f.y = y + rand(-1, 1) * this.perception;
                f.vx = Math.cos(inward) * sp.cruise * 1.4;
                f.vy = Math.sin(inward) * sp.cruise * 1.4;
            }
        }
    }

    const ALPHA_LEVELS = 6;
    const FISH_ALPHAS = [
        0.28,
        0.42,
        0.58,
        0.74,
        0.9
    ];
    const DOT_RGB = [
        [
            48,
            52,
            235
        ],
        [
            52,
            205,
            60
        ],
        [
            228,
            50,
            44
        ],
        [
            190,
            212,
            255
        ],
        [
            110,
            230,
            255
        ]
    ];
    const DOT_BASE_ALPHA = [
        1,
        1,
        1,
        1,
        1
    ];
    // Darker dot inks for the light app theme, where bright cyan would disappear.
    const DOT_RGB_LIGHT = [
        [
            44,
            62,
            190
        ],
        [
            28,
            140,
            64
        ],
        [
            196,
            52,
            44
        ],
        [
            96,
            120,
            168
        ],
        [
            18,
            146,
            190
        ]
    ];
    const WAKE = DOT_RGB.length - 1;
    const ACCENTS = [
        "#e0892c",
        "#e03a32",
        "#b44ae0",
        "#33c8cc",
        "#3cb54a",
        "#3150e8",
        "#d9c14a"
    ];
    const SKIN_RAMP = ":;t%SX8#@";
    const FIN_GLYPHS = "%;tS:";
    const RIDGE_GLYPHS = "@8%";
    const EDGE_HEAVY = ":;";
    const EDGE_LIGHT = ".',`";
    // Click splash: an expanding cell-snapped ripple plus a short droplet burst.
    const RIPPLE_GLYPHS = "~-.:'";
    const DROP_GLYPHS = "*+o";
    const SPLASH_LIFE = 2.0;
    const FLAG_BODY = 1;
    const FLAG_EDGE = 2;
    const FLAG_FIN = 3;
    const FLAG_RIDGE = 4;
    const FLAG_EYE = 5;
    const FLAG_MARK = 6;
    const MARK_GLYPHS = "#%@";
    const SUBSAMPLES = [
        0.25,
        0.3,
        0.75,
        0.3,
        0.25,
        0.72,
        0.75,
        0.72
    ];
    function classicHalfWidth(s) {
        if (s < 0.13) return 0.09 * Math.pow(Math.sin(s / 0.13 * Math.PI / 2), 0.95);
        if (s < 0.3) return 0.09 + 0.016 * smoothstep(0.13, 0.3, s);
        if (s < 0.84) return 0.019 + 0.087 * Math.pow(1 - (s - 0.3) / 0.54, 1.25);
        const k = (s - 0.84) / 0.16;
        return 0.019 * (1 - k) + 0.012 * Math.sin(k * Math.PI);
    }
    const SHAPES = {
        classic: {
            halfWidth: classicHalfWidth,
            pectoral: [
                0.15,
                0.43,
                0.55,
                0.26
            ],
            falcate: true,
            pelvic: [
                0.57,
                0.65,
                0.69,
                0.085
            ],
            caudal: 0.085,
            dorsal: [
                0.33,
                0.47
            ],
            secondDorsal: [
                0.71,
                0.76
            ],
            eye: [
                0.1,
                0.14
            ],
            gills: [
                0.19,
                0.29
            ],
            tint: [
                0.92,
                0.97,
                1.05
            ]
        },
        hammerhead: {
            halfWidth: (s)=>{
                if (s < 0.06) return 0.045;
                if (s < 0.3) return 0.045 + 0.061 * smoothstep(0.06, 0.3, s);
                return classicHalfWidth(s) * 0.92;
            },
            head: {
                span: 0.17,
                sweep: 0.035,
                depth: 0.09,
                notch: 0
            },
            pectoral: [
                0.17,
                0.4,
                0.5,
                0.22
            ],
            falcate: true,
            pelvic: [
                0.56,
                0.63,
                0.67,
                0.075
            ],
            caudal: 0.11,
            dorsal: [
                0.28,
                0.44
            ],
            secondDorsal: [
                0.7,
                0.74
            ],
            eye: null,
            gills: [
                0.16,
                0.26
            ],
            tint: [
                0.96,
                0.98,
                0.9
            ]
        },
        tiger: {
            halfWidth: (s)=>{
                if (s < 0.13) return 0.1 * Math.pow(Math.sin(s / 0.13 * Math.PI / 2), 0.45);
                if (s < 0.3) return 0.1 + 0.014 * smoothstep(0.13, 0.3, s);
                if (s < 0.84) return 0.019 + 0.095 * Math.pow(1 - (s - 0.3) / 0.54, 1.2);
                const k = (s - 0.84) / 0.16;
                return 0.019 * (1 - k) + 0.012 * Math.sin(k * Math.PI);
            },
            pectoral: [
                0.15,
                0.42,
                0.53,
                0.25
            ],
            falcate: true,
            pelvic: [
                0.57,
                0.65,
                0.69,
                0.085
            ],
            caudal: 0.095,
            dorsal: [
                0.33,
                0.46
            ],
            secondDorsal: [
                0.71,
                0.75
            ],
            eye: [
                0.08,
                0.12
            ],
            gills: [
                0.19,
                0.28
            ],
            tint: [
                1.02,
                0.95,
                0.84
            ]
        },
        zebra: {
            halfWidth: (s)=>{
                if (s < 0.1) return 0.075 * Math.pow(Math.sin(s / 0.1 * Math.PI / 2), 0.7);
                if (s < 0.28) return 0.075 + 0.025 * smoothstep(0.1, 0.28, s);
                if (s < 0.55) return 0.022 + 0.078 * Math.pow(1 - (s - 0.28) / 0.27, 1.1);
                const k = (s - 0.55) / 0.45;
                return 0.022 * (1 - k * k) + 0.012 * Math.sin(k * Math.PI);
            },
            pectoral: [
                0.12,
                0.3,
                0.36,
                0.19
            ],
            falcate: false,
            pelvic: [
                0.42,
                0.48,
                0.51,
                0.065
            ],
            caudal: 0,
            dorsal: [
                0.36,
                0.44
            ],
            secondDorsal: [
                0.49,
                0.53
            ],
            eye: [
                0.06,
                0.09
            ],
            gills: [
                0.13,
                0.2
            ],
            tint: [
                1.08,
                0.97,
                0.74
            ]
        },
        greathammer: {
            halfWidth: (s)=>{
                if (s < 0.05) return 0.04;
                if (s < 0.3) return 0.04 + 0.07 * smoothstep(0.05, 0.3, s);
                return classicHalfWidth(s) * 0.95;
            },
            head: {
                span: 0.21,
                sweep: 0.006,
                depth: 0.085,
                notch: 0.014
            },
            pectoral: [
                0.16,
                0.38,
                0.49,
                0.24
            ],
            falcate: true,
            pelvic: [
                0.55,
                0.62,
                0.67,
                0.085
            ],
            caudal: 0.13,
            dorsal: [
                0.24,
                0.45
            ],
            secondDorsal: [
                0.68,
                0.74
            ],
            eye: null,
            gills: [
                0.15,
                0.25
            ],
            tint: [
                0.86,
                0.93,
                1.02
            ]
        },
        mako: {
            halfWidth: (s)=>{
                if (s < 0.17) return 0.088 * Math.pow(Math.sin(s / 0.17 * Math.PI / 2), 1.5);
                if (s < 0.32) return 0.088 + 0.012 * smoothstep(0.17, 0.32, s);
                if (s < 0.86) return 0.014 + 0.086 * Math.pow(1 - (s - 0.32) / 0.54, 1.45);
                const k = (s - 0.86) / 0.14;
                return 0.014 * (1 - k) + 0.01 * Math.sin(k * Math.PI);
            },
            pectoral: [
                0.18,
                0.4,
                0.5,
                0.21
            ],
            falcate: true,
            pelvic: [
                0.58,
                0.64,
                0.68,
                0.06
            ],
            caudal: 0.13,
            dorsal: [
                0.34,
                0.45
            ],
            secondDorsal: [
                0.76,
                0.79
            ],
            eye: [
                0.11,
                0.15
            ],
            gills: [
                0.2,
                0.3
            ],
            tint: [
                0.78,
                0.9,
                1.2
            ]
        },
        thresher: {
            halfWidth: (s)=>{
                if (s < 0.08) return 0.07 * Math.pow(Math.sin(s / 0.08 * Math.PI / 2), 0.75);
                if (s < 0.2) return 0.07 + 0.02 * smoothstep(0.08, 0.2, s);
                if (s < 0.48) return 0.012 + 0.078 * Math.pow(1 - (s - 0.2) / 0.28, 1.3);
                const k = (s - 0.48) / 0.52;
                return 0.012 * (1 - k) + 0.006 * Math.sin(k * Math.PI * 0.9) + 0.002;
            },
            pectoral: [
                0.12,
                0.27,
                0.36,
                0.2
            ],
            falcate: true,
            pelvic: [
                0.37,
                0.41,
                0.44,
                0.045
            ],
            caudal: 0,
            dorsal: [
                0.24,
                0.32
            ],
            secondDorsal: [
                0.45,
                0.47
            ],
            eye: [
                0.05,
                0.1
            ],
            gills: [
                0.11,
                0.18
            ],
            tint: [
                1.0,
                0.9,
                1.08
            ]
        },
        nurse: {
            halfWidth: (s)=>{
                if (s < 0.08) return 0.085 * Math.pow(Math.sin(s / 0.08 * Math.PI / 2), 0.4);
                if (s < 0.3) return 0.085 + 0.02 * smoothstep(0.08, 0.3, s);
                if (s < 0.72) return 0.022 + 0.083 * Math.pow(1 - (s - 0.3) / 0.42, 1.1);
                const k = (s - 0.72) / 0.28;
                return 0.022 * (1 - k * k) + 0.014 * Math.sin(k * Math.PI);
            },
            pectoral: [
                0.16,
                0.34,
                0.4,
                0.17
            ],
            falcate: false,
            pelvic: [
                0.45,
                0.52,
                0.55,
                0.075
            ],
            caudal: 0,
            dorsal: [
                0.5,
                0.58
            ],
            secondDorsal: [
                0.63,
                0.69
            ],
            eye: [
                0.05,
                0.075
            ],
            gills: [
                0.14,
                0.22
            ],
            tint: [
                1.1,
                0.96,
                0.76
            ]
        }
    };
    const KINDS = Object.keys(SHAPES);
    function inTriangle(px, py, ax, ay, bx, by, cx, cy) {
        const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
        const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
        const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
        const neg = d1 < 0 || d2 < 0 || d3 < 0;
        const pos = d1 > 0 || d2 > 0 || d3 > 0;
        return !(neg && pos);
    }
    function paintGrid(g, W, H, cw, ch, dpr) {
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.strokeStyle = "rgba(255,255,255,0.055)";
        g.lineWidth = 1;
        g.beginPath();
        for(let c = 0; c <= Math.ceil(W / cw); c++){
            const x = Math.round(c * cw * dpr) + 0.5;
            g.moveTo(x, 0);
            g.lineTo(x, H * dpr);
        }
        for(let r = 0; r <= Math.ceil(H / ch); r++){
            const y = Math.round(r * ch * dpr) + 0.5;
            g.moveTo(0, y);
            g.lineTo(W * dpr, y);
        }
        g.stroke();
    }
    class AsciiRenderer {
        canvas;
        ctx;
        bg;
        dpr = 1;
        width = 0;
        height = 0;
        cw = 12;
        ch = 18;
        /** When set, resize() keeps this cell width instead of deriving one from the canvas. */
        cellWidthOverride = 0;
        cols = 0;
        rows = 0;
        fontFamily = "ui-monospace, Menlo, monospace";
        dotKind = new Uint8Array(0);
        dotPhase = new Float32Array(0);
        dotFreq = new Float32Array(0);
        energy = new Float32Array(0);
        energyTmp = new Float32Array(0);
        heat = new Float32Array(0);
        bucketOf = new Uint8Array(0);
        bucketOrder = new Int32Array(0);
        bucketCounts = new Int32Array(DOT_RGB.length * ALPHA_LEVELS + 1);
        dotStyles = [];
        sharkFlag = new Uint8Array(0);
        sharkShade = new Float32Array(0);
        sharkKey = new Uint32Array(0);
        sharkDepth = new Float32Array(0);
        sharkKind = new Uint8Array(0);
        sharkShadow = new Uint8Array(0);
        spine = new Float32Array(SHARK_NODES * 2);
        arc = new Float32Array(SHARK_NODES);
        arcTotal = 1;
        shape = SHAPES.classic;
        sharkId = 0;
        finTipLeft = 0;
        finTipRight = 0;
        hitFlag = 0;
        hitShade = 0;
        hitS = 0;
        hitV = 0;
        hitDist = 0;
        fishStamp = new Uint32Array(0);
        frameId = 0;
        fishBuckets = FISH_ALPHAS.map(()=>[]);
        fishStyles = FISH_ALPHAS.map((a)=>`rgba(230,238,255,${a})`);
        /** Active click splashes, in canvas CSS pixels with their own age clock. */
        splashes = [];
        /** App colour scheme: dark inks on the dark surface, inverted on the light one. */
        dark = true;
        constructor(canvas){
            this.canvas = canvas;
            const ctx = canvas.getContext("2d", {
                alpha: true
            });
            if (!ctx) throw new Error("2D canvas unavailable");
            this.ctx = ctx;
            this.buildDotStyles();
        }
        buildDotStyles() {
            const palette = this.dark ? DOT_RGB : DOT_RGB_LIGHT;
            this.dotStyles = [];
            for(let c = 0; c < palette.length; c++){
                const [r, g, b] = palette[c];
                for(let l = 0; l < ALPHA_LEVELS; l++){
                    const a = DOT_BASE_ALPHA[c] * (l + 1) / ALPHA_LEVELS;
                    this.dotStyles.push(`rgba(${r},${g},${b},${a.toFixed(3)})`);
                }
            }
            this.fishStyles = FISH_ALPHAS.map((a)=>this.dark ? `rgba(230,238,255,${a})` : `rgba(38,64,110,${(a * 0.82).toFixed(2)})`);
        }
        setTheme(dark) {
            const next = dark !== false;
            if (next === this.dark) return;
            this.dark = next;
            this.buildDotStyles();
        }
        get cellWidth() {
            return this.cw;
        }
        get cellHeight() {
            return this.ch;
        }
        setFontFamily(family) {
            if (family) this.fontFamily = family;
        }
        resize(width, height, dpr) {
            this.width = width;
            this.height = height;
            this.dpr = dpr;
            // A fixed cell size keeps the ASCII grid (and the shark glyph count)
            // stable instead of coarsening on wider windows.
            this.cw = this.cellWidthOverride || clamp(Math.round(width / 150), 8, 12);
            this.ch = Math.round(this.cw * 1.45);
            this.cols = Math.ceil(width / this.cw);
            this.rows = Math.ceil(height / this.ch);
            this.canvas.width = Math.round(width * dpr);
            this.canvas.height = Math.round(height * dpr);
            const n = this.cols * this.rows;
            this.dotKind = new Uint8Array(n);
            this.dotPhase = new Float32Array(n);
            this.dotFreq = new Float32Array(n);
            this.energy = new Float32Array(n);
            this.energyTmp = new Float32Array(n);
            this.heat = new Float32Array(n);
            this.bucketOf = new Uint8Array(n);
            this.bucketOrder = new Int32Array(n);
            this.sharkFlag = new Uint8Array(n);
            this.sharkShade = new Float32Array(n);
            this.sharkKey = new Uint32Array(n);
            this.sharkDepth = new Float32Array(n);
            this.sharkKind = new Uint8Array(n);
            this.sharkShadow = new Uint8Array(n);
            this.fishStamp = new Uint32Array(n);
            for(let i = 0; i < n; i++){
                const col = i % this.cols;
                const row = i / this.cols | 0;
                this.dotKind[i] = 0;
                this.dotPhase[i] = hash3(col, row, 23) * Math.PI * 2;
                this.dotFreq[i] = 0.3 + hash3(col, row, 37) * 1.1;
            }
            this.paintBackground();
        }
        /** Transparent layer: the app surface shows through; only a faint sunk grid remains. */
        paintBackground() {}
        render(world, dt, waterRects) {
            const { ctx, dpr, cols, ch } = this;
            if (cols === 0) return;
            if (!waterRects || waterRects.length === 0) {
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
                return;
            }
            const t = world.time;
            this.consumeEvents(world);
            this.rasterizeSharks(world.sharks, t);
            this.depositWake(world);
            this.diffuse(dt);
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            // Water is the frame minus the sidebar and the conversation column: the
            // creatures vanish behind the reading surface instead of covering it.
            ctx.save();
            ctx.beginPath();
            for (const r of waterRects){
                ctx.rect(r.x, r.y, r.w, r.h);
            }
            ctx.clip();
            this.markFish(world);
            this.drawDots(t);
            ctx.font = `600 ${Math.round(ch * 0.74)}px ${this.fontFamily}`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            this.drawHeat();
            this.drawFish();
            this.drawSplashes(dt);
            this.drawSharks(t);
            ctx.restore();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
        }
        cellIndex(x, y) {
            const c = Math.floor(x / this.cw);
            const r = Math.floor(y / this.ch);
            if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return -1;
            return r * this.cols + c;
        }
        stamp(field, x, y, radius, amount) {
            const c0 = Math.floor(x / this.cw);
            const r0 = Math.floor(y / this.ch);
            for(let r = r0 - radius; r <= r0 + radius; r++){
                for(let c = c0 - radius; c <= c0 + radius; c++){
                    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) continue;
                    const d = Math.hypot(c - c0, (r - r0) * 1.4);
                    if (d > radius + 0.5) continue;
                    const i = r * this.cols + c;
                    field[i] = Math.min(1.6, field[i] + amount * (1 - d / (radius + 1)));
                }
            }
        }
        consumeEvents(world) {
            for (const e of world.events){
                if (e.kind === "eat") {
                    this.stamp(this.heat, e.x, e.y, 2, 1);
                    this.stamp(this.energy, e.x, e.y, 3, 0.9);
                } else {
                    this.stamp(this.energy, e.x, e.y, 6, 1.4);
                }
            }
            world.events.length = 0;
        }
        depositWake(world) {
            const { energy } = this;
            for (const f of world.fish){
                if (!f.alive) continue;
                const i = this.cellIndex(f.x, f.y);
                if (i >= 0) energy[i] = Math.min(1.6, energy[i] + 0.012 + f.alarm * 0.03);
            }
            for (const sh of world.sharks){
                for(let k = SHARK_NODES - 6; k < SHARK_NODES; k++){
                    const i = this.cellIndex(sh.nodes[k * 2], sh.nodes[k * 2 + 1]);
                    if (i >= 0) energy[i] = Math.min(1.6, energy[i] + 0.05 + sh.speed * 0.0012);
                }
            }
            if (world.pointer.active) {
                this.stamp(energy, world.pointer.x, world.pointer.y, 1, 0.08);
            }
        }
        diffuse(dt) {
            const { cols, rows, energy, energyTmp: tmp, heat } = this;
            const decay = Math.exp(-dt * 1.5);
            for(let r = 0; r < rows; r++){
                for(let c = 0; c < cols; c++){
                    const i = r * cols + c;
                    const l = c > 0 ? energy[i - 1] : energy[i];
                    const rt = c < cols - 1 ? energy[i + 1] : energy[i];
                    const u = r > 0 ? energy[i - cols] : energy[i];
                    const d = r < rows - 1 ? energy[i + cols] : energy[i];
                    tmp[i] = (energy[i] * 4 + l + rt + u + d) * 0.125 * decay;
                }
            }
            this.energy = tmp;
            this.energyTmp = energy;
            const heatDecay = Math.exp(-dt * 2.2);
            for(let i = 0; i < heat.length; i++)heat[i] *= heatDecay;
        }
        sampleShark(px, py, L) {
            const { spine, arc } = this;
            const N = SHARK_NODES;
            let best = Infinity;
            let bestS = 0;
            let bestSign = 1;
            let bestNx = 0;
            let bestNy = 0;
            for(let k = 0; k < N - 1; k++){
                const ax = spine[k * 2];
                const ay = spine[k * 2 + 1];
                const sx = spine[(k + 1) * 2] - ax;
                const sy = spine[(k + 1) * 2 + 1] - ay;
                const len2 = sx * sx + sy * sy || 1;
                const u = clamp(((px - ax) * sx + (py - ay) * sy) / len2, 0, 1);
                const qx = ax + sx * u;
                const qy = ay + sy * u;
                const d2 = (px - qx) ** 2 + (py - qy) ** 2;
                if (d2 < best) {
                    best = d2;
                    const len = Math.sqrt(len2);
                    bestS = (arc[k] + u * len) / this.arcTotal;
                    bestSign = sx * (py - ay) - sy * (px - ax) >= 0 ? 1 : -1;
                    bestNx = -sy / len * bestSign;
                    bestNy = sx / len * bestSign;
                }
            }
            const a = Math.sqrt(best);
            const s = bestS;
            const u = s * L;
            const shape = this.shape;
            const w = shape.halfWidth(s) * L;
            this.hitDist = a;
            this.hitS = s;
            this.hitV = a * bestSign;
            const head = this.shape.head;
            if (head && u < L * (head.sweep + head.depth + head.notch)) {
                const span = L * head.span;
                const r = a / span;
                const front = L * head.sweep * r * r + L * head.notch * Math.max(0, 1 - r / 0.14);
                const depth = L * head.depth * (1 - 0.2 * r * r * r * r);
                if (r <= 1 && u >= front && u <= front + depth) {
                    this.hitFlag = r > 0.84 ? FLAG_EYE : FLAG_BODY;
                    this.hitShade = r > 0.84 ? 0 : 0.62 - 0.2 * r + (u < front + L * 0.012 ? 0.1 : 0);
                    return true;
                }
            }
            if (a <= w) {
                const across = a / (w || 1);
                const facing = (bestNx * -0.6 + bestNy * -0.8) * across;
                let shade = 0.58 - across * across * 0.42 + facing * 0.26;
                let flag = FLAG_BODY;
                if (s > shape.dorsal[0] && s < shape.dorsal[1] && across < 0.3) {
                    flag = FLAG_RIDGE;
                    shade = 1;
                } else if (s > shape.secondDorsal[0] && s < shape.secondDorsal[1] && across < 0.4) {
                    shade = Math.max(shade, 0.82);
                } else if (shape.eye && s > shape.eye[0] && s < shape.eye[1] && across > 0.6) {
                    flag = FLAG_EYE;
                    shade = 0;
                } else if (s > shape.gills[0] && s < shape.gills[1] && across > 0.58) {
                    if (Math.floor((s - shape.gills[0]) / (shape.gills[1] - shape.gills[0]) * 5) % 2 === 0) shade *= 0.45;
                } else if (s < 0.05) {
                    shade = Math.max(shade, 0.7);
                } else if (shape === SHAPES.zebra && s > 0.08 && s < 0.55 && (across < 0.1 || Math.abs(across - 0.6) < 0.08)) {
                    shade = Math.max(shade, 0.8);
                } else if (this.marked(s, a * bestSign, L, across)) {
                    flag = FLAG_MARK;
                }
                this.hitFlag = flag;
                this.hitShade = shade;
                return true;
            }
            const tip = bestSign > 0 ? this.finTipRight : this.finTipLeft;
            const [p0, p1, p2] = shape.pectoral;
            if (inTriangle(u, a, L * p0, 0, L * p1, 0, L * p2, tip) && !(shape.falcate && inTriangle(u, a, L * p1, 0, L * (p1 + (p2 - p1) * 0.33), tip * 0.55, L * p2, tip))) {
                this.hitFlag = this.marked(s, a * bestSign, L, 0) ? FLAG_MARK : FLAG_FIN;
                this.hitShade = 0.38 + 0.22 * (1 - clamp(a / tip, 0, 1));
                return true;
            }
            const [v0, v1, v2, vr] = shape.pelvic;
            if (inTriangle(u, a, L * v0, 0, L * v1, 0, L * v2, L * vr) || shape.caudal > 0 && inTriangle(u, a, L * 0.86, 0, L * 0.95, 0, L, L * shape.caudal)) {
                this.hitFlag = FLAG_FIN;
                this.hitShade = 0.36;
                return true;
            }
            return false;
        }
        marked(s, v, L, across) {
            if (this.shape === SHAPES.tiger) {
                if (s < 0.2 || s > 0.9 || across > 0.85) return false;
                const wobble = 0.35 * Math.sin(v / L * 25 + s * 5);
                const bar = Math.sin(s * Math.PI * 2 * 9 + wobble);
                return bar > 0.65 - 0.5 * smoothstep(0.2, 0.42, s) + 0.4 * smoothstep(0.8, 0.9, s);
            }
            if (this.shape === SHAPES.zebra) {
                if (s < 0.07) return false;
                const gu = s * L / (L * 0.06);
                const gv = v / (L * 0.045);
                const cu = Math.floor(gu);
                const cv = Math.floor(gv);
                const jx = hash3(cu, cv, this.sharkId) * 0.5 + 0.25;
                const jy = hash3(cu, cv, this.sharkId + 11) * 0.5 + 0.25;
                return (gu - cu - jx) ** 2 + (gv - cv - jy) ** 2 < 0.08;
            }
            return false;
        }
        rasterizeSharks(sharks, t) {
            const { sharkFlag, sharkShade, sharkKey, sharkDepth, sharkKind, sharkShadow, spine, arc, cw, ch, cols, rows } = this;
            sharkFlag.fill(0);
            sharkShadow.fill(0);
            for (const sh of sharks){
                const L = sh.length;
                const N = SHARK_NODES;
                const n = sh.nodes;
                const swim = clamp(sh.speed / 60, 0.4, 1.4);
                this.shape = SHAPES[sh.kind];
                this.sharkId = sh.id;
                const kindIndex = KINDS.indexOf(sh.kind);
                for(let k = 0; k < N; k++){
                    const s = k / (N - 1);
                    const a = Math.max(0, k - 1);
                    const b = Math.min(N - 1, k + 1);
                    let tx = n[a * 2] - n[b * 2];
                    let ty = n[a * 2 + 1] - n[b * 2 + 1];
                    const tl = Math.hypot(tx, ty) || 1;
                    tx /= tl;
                    ty /= tl;
                    const amp = L * 0.05 * (0.1 + 0.9 * Math.pow(s, 1.8)) * swim;
                    const off = amp * Math.sin(sh.phase - s * 5.2);
                    spine[k * 2] = n[k * 2] - ty * off;
                    spine[k * 2 + 1] = n[k * 2 + 1] + tx * off;
                }
                arc[0] = 0;
                for(let k = 1; k < N; k++){
                    arc[k] = arc[k - 1] + Math.hypot(spine[k * 2] - spine[(k - 1) * 2], spine[k * 2 + 1] - spine[(k - 1) * 2 + 1]);
                }
                this.arcTotal = arc[N - 1] || 1;
                const bank = clamp(sh.turn * 0.45, -0.35, 0.35);
                const flex = 1 + 0.06 * Math.sin(sh.phase * 0.5);
                const reachFin = this.shape.pectoral[3];
                this.finTipRight = L * reachFin * flex * (1 - bank);
                this.finTipLeft = L * reachFin * flex * (1 + bank);
                let minX = Infinity;
                let minY = Infinity;
                let maxX = -Infinity;
                let maxY = -Infinity;
                for(let k = 0; k < N; k++){
                    minX = Math.min(minX, spine[k * 2]);
                    maxX = Math.max(maxX, spine[k * 2]);
                    minY = Math.min(minY, spine[k * 2 + 1]);
                    maxY = Math.max(maxY, spine[k * 2 + 1]);
                }
                const reach = L * 0.36;
                const c0 = Math.max(0, Math.floor((minX - reach) / cw));
                const c1 = Math.min(cols - 1, Math.floor((maxX + reach) / cw));
                const r0 = Math.max(0, Math.floor((minY - reach) / ch));
                const r1 = Math.min(rows - 1, Math.floor((maxY + reach) / ch));
                if (c0 > c1 || r0 > r1) continue;
                const skipBeyond = reach + Math.hypot(cw, ch);
                const shadowDc = Math.round(L * 0.035 / cw) + 1;
                const shadowDr = Math.round(L * 0.02 / ch) + 1;
                for(let r = r0; r <= r1; r++){
                    for(let c = c0; c <= c1; c++){
                        const x = c * cw;
                        const y = r * ch;
                        const centerHit = this.sampleShark(x + cw / 2, y + ch / 2, L);
                        if (!centerHit && this.hitDist > skipBeyond) continue;
                        const flag = this.hitFlag;
                        const shade = this.hitShade;
                        const s = this.hitS;
                        const v = this.hitV;
                        let hits = centerHit ? 1 : 0;
                        for(let k = 0; k < SUBSAMPLES.length; k += 2){
                            if (this.sampleShark(x + SUBSAMPLES[k] * cw, y + SUBSAMPLES[k + 1] * ch, L)) hits++;
                        }
                        if (hits === 0) continue;
                        const coverage = hits / 5;
                        const i = r * cols + c;
                        const key = hash3(Math.round(s * 52), Math.round(v / (cw * 0.9)), sh.id) * 4294967295 >>> 0;
                        sharkKey[i] = key;
                        sharkDepth[i] = sh.depth;
                        sharkKind[i] = kindIndex;
                        if (centerHit && coverage >= 0.6) {
                            sharkFlag[i] = flag;
                            const flicker = (hash3(c, r, Math.floor(t * 6)) - 0.5) * 0.06;
                            sharkShade[i] = clamp(shade + flicker, 0, 1);
                            const sc = c + shadowDc;
                            const sr = r + shadowDr;
                            if (sc < cols && sr < rows) sharkShadow[sr * cols + sc] = 1;
                        } else {
                            sharkFlag[i] = FLAG_EDGE;
                            sharkShade[i] = coverage;
                        }
                    }
                }
            }
        }
        drawSharks(t) {
            const { ctx, cols, rows, cw, ch, sharkFlag, sharkShade, sharkKey, sharkDepth, sharkKind, dark } = this;
            const n = cols * rows;
            for(let i = 0; i < n; i++){
                const flag = sharkFlag[i];
                if (!flag) continue;
                const col = i % cols;
                const row = i / cols | 0;
                const x = col * cw;
                const y = row * ch;
                const key = sharkKey[i];
                const shade = sharkShade[i];
                const dim = 0.7 + 0.3 * sharkDepth[i];
                const [tr, tg, tb] = SHAPES[KINDS[sharkKind[i]]].tint;
                const tick = Math.floor(t * 2.4 + key % 997 / 97);
                const roll = hash3(key, tick, 7);
                if (flag === FLAG_EDGE) {
                    const set = shade >= 0.5 ? EDGE_HEAVY : EDGE_LIGHT;
                    const g0 = 70 + shade * 80;
                    const g = dark ? g0 * dim : 255 - g0 * dim;
                    ctx.fillStyle = roll < 0.07 ? ACCENTS[key % ACCENTS.length] : `rgb(${Math.min(255, Math.round(g * tr))},${Math.min(255, Math.round(g * tg))},${Math.min(255, Math.round(g * tb))})`;
                    ctx.fillText(set[(key >>> 8) % set.length], x + cw / 2, y + ch / 2 + 1);
                    continue;
                }
                let level;
                let glyph;
                if (flag === FLAG_RIDGE) {
                    level = 226;
                    glyph = RIDGE_GLYPHS[(key >>> 8) % RIDGE_GLYPHS.length];
                } else if (flag === FLAG_EYE) {
                    level = 12;
                    glyph = "o";
                } else if (flag === FLAG_MARK) {
                    level = 24 + shade * 22;
                    glyph = MARK_GLYPHS[(key >>> 8) % MARK_GLYPHS.length];
                } else if (flag === FLAG_FIN) {
                    level = 40 + shade * 120;
                    glyph = FIN_GLYPHS[(key >>> 8) % FIN_GLYPHS.length];
                } else {
                    level = 46 + shade * 160;
                    const jitter = (key >>> 4) % 3 - 1;
                    glyph = SKIN_RAMP[clamp(Math.floor((1 - shade) * 8.99) + jitter, 0, SKIN_RAMP.length - 1)];
                }
                level *= dim;
                // Dark theme keeps the deep-water palette; the light theme inverts the
                // ink so the same ASCII shading reads on a white surface.
                const g = dark ? level : 255 - level * 0.7;
                ctx.fillStyle = `rgb(${Math.min(255, Math.round(g * tr))},${Math.min(255, Math.round(g * tg))},${Math.min(255, Math.round(g * tb))})`;
                ctx.fillRect(x + 1, y + 1, cw - 1, ch - 1);
                let color;
                if (flag === FLAG_EYE) color = dark ? "#9aa0ad" : "#2b3240";
                else if (flag === FLAG_MARK) color = dark ? `rgb(${Math.round(70 * tr)},${Math.round(70 * tg)},${Math.round(70 * tb)})` : `rgb(${Math.round(150 * tr)},${Math.round(150 * tg)},${Math.round(150 * tb)})`;
                else if (roll < 0.09) color = ACCENTS[key % ACCENTS.length];
                else if (roll < 0.13) color = dark ? "#ffffff" : "#0e1520";
                else if (dark) color = shade > 0.55 ? "#0e0f13" : "#1b1d24";
                else color = shade > 0.55 ? "#f2f5fa" : "#2c3748";
                ctx.fillStyle = color;
                ctx.fillText(glyph, x + cw / 2, y + ch / 2 + 1);
            }
        }
        markFish(world) {
            const { fishStamp, fishBuckets, sharkFlag } = this;
            const frame = ++this.frameId;
            for (const bucket of fishBuckets)bucket.length = 0;
            for(let pass = 0; pass < 2; pass++){
                for (const f of world.fish){
                    if (!f.alive || (f.depth > 0.78 ? 0 : 1) !== pass) continue;
                    const i = this.cellIndex(f.x, f.y);
                    if (i < 0 || fishStamp[i] === frame || sharkFlag[i]) continue;
                    fishStamp[i] = frame;
                    const glint = clamp(Math.abs(f.turn) / 3.5, 0, 1);
                    const v = 0.3 + 0.4 * (f.depth - 0.55) / 0.45 + 0.3 * Math.max(glint, f.alarm);
                    fishBuckets[clamp(Math.floor(v * FISH_ALPHAS.length), 0, FISH_ALPHAS.length - 1)].push(i);
                }
            }
        }
        drawFish() {
            const { ctx, cw, ch, cols, fishBuckets } = this;
            for(let b = 0; b < fishBuckets.length; b++){
                const bucket = fishBuckets[b];
                if (!bucket.length) continue;
                ctx.fillStyle = this.fishStyles[b];
                for (const i of bucket){
                    ctx.fillText("-", i % cols * cw + cw / 2, (i / cols | 0) * ch + ch / 2 + 1);
                }
            }
        }
        /** Queue one click splash at a canvas-local point. */
        addSplash(x, y) {
            this.splashes.push({
                x,
                y,
                age: 0,
                seed: Math.random() * TAU
            });
            // A pond should not accumulate stale clicks; keep the newest handful.
            if (this.splashes.length > 10) this.splashes.shift();
        }
        /**
         * Draw expanding ASCII ripples. Glyphs snap to the same cell grid as the
         * creatures, so the splash reads as part of the ocean rather than a smooth
         * vector overlay; the render clip hides it behind the reading column.
         */
        drawSplashes(dt) {
            const { ctx, cw, ch, cols, rows, splashes } = this;
            if (!splashes.length || cols === 0) return;
            const ink = this.dark ? "140,235,255" : "18,105,165";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            const rings = [
                { scale: 1, alpha: 0.95, glyph: "~" },
                { scale: 0.74, alpha: 0.55, glyph: "-" },
                { scale: 0.5, alpha: 0.38, glyph: ":" }
            ];
            for(let i = splashes.length - 1; i >= 0; i--){
                const s = splashes[i];
                s.age += dt;
                if (s.age >= SPLASH_LIFE) {
                    splashes.splice(i, 1);
                    continue;
                }
                const k = s.age / SPLASH_LIFE;
                const fade = Math.pow(1 - k, 1.35);
                const radius = 9 + 285 * k;
                const seen = new Set();
                for(let ring = 0; ring < rings.length; ring++){
                    const spec = rings[ring];
                    const rr = radius * spec.scale;
                    const steps = Math.max(24, Math.floor(rr * 1.9));
                    for(let n = 0; n < steps; n++){
                        const a = n / steps * TAU + s.seed + ring * 0.21;
                        // Two cells thick reads as a wave band instead of dotted noise.
                        for(let thick = 0; thick < 2; thick++){
                            const rad = rr - thick * cw * 0.9;
                            if (rad < 2) continue;
                            const px = s.x + Math.cos(a) * rad;
                            const py = s.y + Math.sin(a) * rad * 0.62;
                            const c = Math.floor(px / cw);
                            const r = Math.floor(py / ch);
                            if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
                            const key = r * cols + c;
                            if (seen.has(key)) continue;
                            seen.add(key);
                            // Horizontal arcs read as water, the crest as a thin dash.
                            const sy = Math.sin(a);
                            const glyph = Math.abs(sy) > 0.72
                                ? (thick === 0 ? ":" : "'")
                                : (thick === 0 ? spec.glyph : ".");
                            const alpha = fade * spec.alpha * (thick === 0 ? 1 : 0.55);
                            ctx.fillStyle = `rgba(${ink},${alpha.toFixed(3)})`;
                            ctx.fillText(glyph, c * cw + cw / 2, r * ch + ch / 2 + 1);
                        }
                    }
                }
                if (k < 0.28) {
                    const c0 = Math.floor(s.x / cw);
                    const r0 = Math.floor(s.y / ch);
                    const burst = [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-2, 0], [2, 0]];
                    for(let n = 0; n < burst.length; n++){
                        const c = c0 + burst[n][0];
                        const r = r0 + burst[n][1];
                        if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
                        const glyph = DROP_GLYPHS[(n + (s.seed * 7 | 0)) % DROP_GLYPHS.length];
                        ctx.fillStyle = `rgba(${ink},${(fade * 0.85).toFixed(3)})`;
                        ctx.fillText(glyph, c * cw + cw / 2, r * ch + ch / 2 + 1);
                    }
                }
            }
        }
        drawHeat() {
            const { ctx, heat, cols, cw, ch } = this;
            for(let i = 0; i < heat.length; i++){
                const h = heat[i];
                if (h < 0.08) continue;
                const col = i % cols;
                const row = i / cols | 0;
                ctx.fillStyle = h > 0.5 ? `rgba(255,120,60,${h.toFixed(2)})` : `rgba(220,40,40,${(h * 1.6).toFixed(2)})`;
                ctx.fillText(h > 0.6 ? "*" : "·", col * cw + cw / 2, row * ch + ch / 2 + 1);
            }
        }
        drawDots(t) {
            const { ctx, cols, rows, cw, ch, dotKind, dotPhase, dotFreq, energy, sharkFlag, sharkShadow, fishStamp, frameId } = this;
            const { bucketOf, bucketOrder, bucketCounts } = this;
            const n = cols * rows;
            const SKIP = bucketCounts.length - 1;
            bucketCounts.fill(0);
            for(let i = 0; i < n; i++){
                const e = energy[i];
                const kind = dotKind[i];
                if (sharkFlag[i] || fishStamp[i] === frameId || kind === 0 && e < 0.45) {
                    bucketOf[i] = SKIP;
                    continue;
                }
                let bucket;
                if (e > 0.45) {
                    const level = clamp(Math.floor((e - 0.45) * 5), 0, ALPHA_LEVELS - 1);
                    bucket = WAKE * ALPHA_LEVELS + level;
                } else {
                    const col = i % cols;
                    const row = i / cols | 0;
                    const twinkle = 0.5 + 0.5 * Math.sin(t * dotFreq[i] + dotPhase[i]);
                    const caustic = 0.85 + 0.15 * Math.sin(col * 0.11 + t * 0.35) * Math.sin(row * 0.17 - t * 0.27);
                    let v = clamp((0.55 + 0.45 * twinkle) * caustic + e * 2, 0, 1);
                    if (sharkShadow[i]) v *= 0.2;
                    bucket = (kind - 1) * ALPHA_LEVELS + clamp(Math.floor(v * ALPHA_LEVELS), 0, ALPHA_LEVELS - 1);
                }
                bucketOf[i] = bucket;
                bucketCounts[bucket]++;
            }
            const starts = new Int32Array(bucketCounts.length);
            for(let b = 1; b < bucketCounts.length; b++)starts[b] = starts[b - 1] + bucketCounts[b - 1];
            const cursor = starts.slice();
            for(let i = 0; i < n; i++){
                const b = bucketOf[i];
                if (b !== SKIP) bucketOrder[cursor[b]++] = i;
            }
            const small = Math.max(2, Math.round(cw * 0.19));
            const large = small + 1;
            for(let b = 0; b < SKIP; b++){
                const count = bucketCounts[b];
                if (!count) continue;
                ctx.fillStyle = this.dotStyles[b];
                const size = b >= WAKE * ALPHA_LEVELS ? large : small;
                const start = starts[b];
                for(let k = start; k < start + count; k++){
                    const i = bucketOrder[k];
                    const col = i % cols;
                    const row = i / cols | 0;
                    ctx.fillRect(Math.round(col * cw + cw * 0.66 - size / 2), Math.round(row * ch + ch * 0.64 - size / 2), size, size);
                }
            }
        }
    }

    const STEP = 1 / 60;
    const MAX_STEPS = 4;
    const MIN_PAINT_MS = 1000 / 24;

    /**
     * Ambient ocean for the app frame: keeps the original fixed-timestep loop and
     * reduced-motion still frame, but the world spans the whole frame while only
     * the supplied water rectangles are painted. Pointer interaction is left out
     * because the layer is click-through decoration.
     */
    class OceanEngine {
        canvas;
        world;
        renderer;
        raf = 0;
        last = 0;
        lastPaint = 0;
        acc = 0;
        running = true;
        disposed = false;
        rects = [];
        reducedMotion;
        resizeObserver;
        intersectionObserver;

        constructor(canvas, options = {}) {
            this.canvas = canvas;
            this.world = new World(options.sharks ?? undefined, options.fishCount);
            this.world.regions = options.regions ?? [];
            this.world.peaceful = options.peaceful !== false;
            this.world.baseLength = options.baseLength ?? 0;
            this.renderer = new AsciiRenderer(canvas);
            const fontFamily = options.fontFamily ?? "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
            this.renderer.setFontFamily(fontFamily);
            this.renderer.setTheme(options.dark !== false);
            if (options.cellWidth) this.renderer.cellWidthOverride = options.cellWidth;
            this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

            this.resizeObserver = new ResizeObserver(() => this.resize());
            this.resizeObserver.observe(canvas);
            this.intersectionObserver = new IntersectionObserver((entries) => {
                const entry = entries[0];
                this.running = entry ? entry.isIntersecting : true;
                this.schedule();
            });
            this.intersectionObserver.observe(canvas);
            this.reducedMotion.addEventListener("change", this.onMotionPreference);

            this.resize();
            // Canvas text cannot trigger a webfont load; once the mono face is in, redraw.
            document.fonts?.load(`600 16px ${fontFamily}`).then(() => {
                if (!this.disposed && this.reducedMotion.matches) this.drawStill();
            }).catch(() => {});
            this.schedule();
        }

        destroy() {
            this.disposed = true;
            cancelAnimationFrame(this.raf);
            this.resizeObserver.disconnect();
            this.intersectionObserver.disconnect();
            this.reducedMotion.removeEventListener("change", this.onMotionPreference);
        }

        /** Water rectangles in canvas-local CSS pixels; an empty list paints nothing. */
        setWaterRects(rects) {
            this.rects = rects;
            this.world.regions = rects;
            // Never reseed on a layout change: teleporting every creature back to
            // its spawn point is exactly the "snap to the origin" glitch. The same
            // population simply keeps swimming and drifts into the new water.
            if (rects.length > 0 && this.world.sharks.length === 0) {
                this.world.width = 0;
                this.resize();
            } else if (this.reducedMotion.matches) {
                this.drawStill();
            }
            this.schedule();
        }

        /**
         * Splash at a canvas-local point when that point is inside visible water.
         * Called from a passive window pointer listener, so the click still reaches
         * whatever is underneath.
         */
        splashAt(x, y) {
            let inside = false;
            for (const r of this.rects) {
                if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
                    inside = true;
                    break;
                }
            }
            if (!inside) return false;
            this.world.splash(x, y);
            this.renderer.addSplash(x, y);
            if (this.reducedMotion.matches) {
                this.drawStill();
            } else {
                this.schedule();
            }
            return true;
        }
        setTheme(dark) {
            this.renderer.setTheme(dark);
            this.schedule();
        }

        setRunning(running) {
            if (this.running === running) return;
            this.running = running;
            this.schedule();
        }

        resize() {
            const rect = this.canvas.getBoundingClientRect();
            if (rect.width < 1 || rect.height < 1) return;
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            this.renderer.resize(rect.width, rect.height, dpr);
            this.world.resize(rect.width, rect.height, this.renderer.cellWidth, this.renderer.cellHeight);
            if (this.reducedMotion.matches) this.drawStill();
        }

        schedule() {
            cancelAnimationFrame(this.raf);
            this.raf = 0;
            if (this.disposed || !this.running || this.reducedMotion.matches) return;
            this.last = performance.now();
            this.raf = requestAnimationFrame(this.frame);
        }

        frame = (now) => {
            // The creatures move slowly; painting at ~30 fps keeps the ambience
            // without spending a full core on a 120 Hz display.
            if (now - this.lastPaint < MIN_PAINT_MS) {
                this.raf = requestAnimationFrame(this.frame);
                return;
            }
            this.lastPaint = now;
            const dt = Math.min(0.1, (now - this.last) / 1000);
            this.last = now;
            this.acc += dt;
            let steps = 0;
            while (this.acc >= STEP && steps < MAX_STEPS) {
                this.world.step(STEP);
                this.acc -= STEP;
                steps++;
            }
            if (steps === MAX_STEPS) this.acc = 0;
            this.renderer.render(this.world, dt, this.rects);
            this.raf = requestAnimationFrame(this.frame);
        };

        /** Reduced motion: let the ecosystem settle, then show a single frame. */
        drawStill() {
            if (this.world.time < 4) {
                for (let i = 0; i < 240; i++) this.world.step(STEP);
            }
            this.renderer.render(this.world, STEP, this.rects);
        }

        onMotionPreference = () => {
            if (this.reducedMotion.matches) {
                cancelAnimationFrame(this.raf);
                this.raf = 0;
                this.drawStill();
            } else {
                this.schedule();
            }
        };
    }

    /**
     * Client entry: mounts the ASCII ocean into the frame-wide overlay and keeps
     * its water rectangles in sync with the shell layout.
     *
     * Water = the frame minus the sidebar and the conversation reading column, so
     * the sharks swim in the gutters and slip behind the chat surface instead of
     * covering text, the composer, or the sidebar.
     */

    const SHARK_SCHOOL = [
        { kind: "classic", size: 1 },
        { kind: "hammerhead", size: 0.78 },
        { kind: "mako", size: 0.62 },
        { kind: "nurse", size: 0.55 }
    ];

    const GUTTER_MARGIN = 34;
    const MIN_WATER = 60;
    const BOTTOM_MARGIN = 6;

    function isDarkTheme() {
        return document.body?.hasAttribute("data-ds-dark-theme") === true;
    }

    /** The conversation body (chat + composer), only when it is the active main panel. */
    function findConversationBody() {
        const all = document.querySelectorAll("[data-conversation-content]");
        for (const el of all) {
            if (el.closest('[data-slot="main"]') !== null) {
                const rect = el.getBoundingClientRect();
                if (rect.width >= 240 && rect.height >= 240) return { el, rect };
            }
        }
        return null;
    }

    /**
     * The reading column's left/right edges. The shell's width handles sit 24px
     * outside the column and already account for a user-dragged width; otherwise
     * reproduce the CSS clamp the conversation uses.
     */
    function contentEdges(body) {
        const br = body.rect;
        const inMain = (el) => el.closest('[data-slot="main"]') !== null;
        const left = Array.from(document.querySelectorAll('[data-width-handle][data-side="left"]')).find(inMain);
        const right = Array.from(document.querySelectorAll('[data-width-handle][data-side="right"]')).find(inMain);
        if (left !== undefined && right !== undefined) {
            const l = left.getBoundingClientRect();
            const r = right.getBoundingClientRect();
            if (l.width > 0 && r.width > 0) {
                return { contentLeft: l.right + 24, contentRight: r.left - 24 };
            }
        }
        const width = Math.min(Math.max(240, br.width - 32), Math.max(680, Math.min(br.width * 0.64, 920)));
        const contentLeft = br.left + (br.width - width) / 2;
        return { contentLeft, contentRight: contentLeft + width };
    }

    /** Whether a floating right panel (no track) covers one viewport point. */
    function rightPanelAt(x, y) {
        if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return false;
        const el = document.elementFromPoint(x, y);
        return el !== null && el.closest('[data-slot="rightbar"]') !== null;
    }

    /** Top of the full-width dock above the composer, when it carries entries. */
    function dockTop() {
        const dock = document.querySelector('[data-slot="conversation.input.dock"]');
        if (dock === null) return Infinity;
        let top = Infinity;
        for (const child of dock.children) {
            const rect = child.getBoundingClientRect();
            if (rect.height > 1) top = Math.min(top, rect.top);
        }
        return top;
    }

    /** Water rectangles in coordinates local to the overlay layer. */
    function measureWater() {
        const body = findConversationBody();
        if (body === null) return [];
        const overlay = document.querySelector("[data-shell-overlay]");
        const center = document.querySelector('[data-slot="main"]')?.parentElement;
        if (overlay === null || !center) return [];
        const frameRect = overlay.getBoundingClientRect();
        const centerRect = center.getBoundingClientRect();
        if (centerRect.width < 240) return [];
        if (document.querySelector("[data-rightbar-fullscreen]") !== null) return [];

        const { contentLeft, contentRight } = contentEdges(body);
        const bottomRow = document.querySelector("[data-shell-bottom]");
        let waterBottom = bottomRow !== null && bottomRow.getBoundingClientRect().height > 1
            ? bottomRow.getBoundingClientRect().top - BOTTOM_MARGIN
            : frameRect.bottom - BOTTOM_MARGIN;
        const dock = dockTop();
        if (Number.isFinite(dock)) waterBottom = Math.min(waterBottom, dock - 8);
        const top = Math.max(frameRect.top + BOTTOM_MARGIN, body.rect.top + 2);
        const height = waterBottom - top;
        if (height < 140) return [];

        const leftStart = centerRect.left + BOTTOM_MARGIN;
        const leftEnd = contentLeft - GUTTER_MARGIN;
        const rightStart = contentRight + GUTTER_MARGIN;
        // The centre column's right edge is the right panel's left edge whenever it
        // owns a track. A floating panel (no track) is detected by hit-testing the
        // proposed gutter: the right Sidebar owns everything under [data-slot="rightbar"].
        const rightEnd = centerRect.right - 14;
        const probeX = (rightStart + rightEnd) / 2;
        const rightBlocked = rightEnd - rightStart >= MIN_WATER
            && (rightPanelAt(probeX, top + height * 0.25) || rightPanelAt(probeX, top + height * 0.65));

        const rects = [];
        if (leftEnd - leftStart >= MIN_WATER) {
            rects.push({
                x: leftStart - frameRect.left,
                y: top - frameRect.top,
                w: leftEnd - leftStart,
                h: height
            });
        }
        if (rightEnd - rightStart >= MIN_WATER && !rightBlocked) {
            rects.push({
                x: rightStart - frameRect.left,
                y: top - frameRect.top,
                w: rightEnd - rightStart,
                h: height
            });
        }

        // New-conversation Hero: the headline, workspace row and composer form one
        // centred block with large empty space above and below. Open both bands
        // across the whole centre so the sharks get a proper open-water run instead
        // of two narrow side channels.
        const phase = body.el.getAttribute("data-content-phase");
        if (phase === "hero" && !rightBlocked) {
            const seat = body.el.querySelector('[data-conversation-region="composer"]');
            if (seat !== null) {
                const seatRect = seat.getBoundingClientRect();
                const gap = 26;
                const fullX = centerRect.left + BOTTOM_MARGIN;
                const fullW = rightEnd - fullX;
                const above = seatRect.top - gap - top;
                if (above >= 100) {
                    rects.push({
                        x: fullX - frameRect.left,
                        y: top - frameRect.top,
                        w: fullW,
                        h: above
                    });
                }
                const belowTop = seatRect.bottom + gap;
                const below = waterBottom - belowTop;
                if (below >= 100) {
                    rects.push({
                        x: fullX - frameRect.left,
                        y: belowTop - frameRect.top,
                        w: fullW,
                        h: below
                    });
                }
            }
        }
        return rects;
    }

    function sharkLength() {
        return Math.max(140, Math.min(220, window.innerWidth * 0.14));
    }

    function OceanLayer() {
        const canvasRef = React.useRef(null);

        React.useEffect(() => {
            const canvas = canvasRef.current;
            if (canvas === null) return undefined;

            const engine = new OceanEngine(canvas, {
                sharks: SHARK_SCHOOL,
                fishCount: 150,
                peaceful: true,
                dark: isDarkTheme(),
                baseLength: sharkLength(),
                cellWidth: Math.max(7, Math.min(10, Math.round(sharkLength() / 28))),
                regions: measureWater()
            });

            let disposed = false;
            let observed = [];
            const apply = () => {
                if (disposed) return;
                const rects = measureWater();
                engine.setWaterRects(rects);
                engine.setRunning(rects.length > 0);
                canvas.style.opacity = rects.length > 0 ? "1" : "0";
                syncLayoutTargets();
            };
            // Follow the live column and body so sidebar drags, right-panel
            // transitions and composer growth remeasure on every frame instead of
            // waiting for the next poll.
            const resizeObserver = new ResizeObserver(apply);
            const syncLayoutTargets = () => {
                const next = [];
                const center = document.querySelector('[data-slot="main"]')?.parentElement;
                const body = document.querySelector("[data-conversation-content]");
                if (center) next.push(center);
                if (body) next.push(body);
                if (next.length === observed.length && next.every((el, i) => el === observed[i])) return;
                for (const el of observed) resizeObserver.unobserve(el);
                for (const el of next) resizeObserver.observe(el);
                observed = next;
            };
            apply();

            // A click on open water ripples the ASCII surface. The layer itself is
            // click-through (pointer-events: none), so this passive window listener
            // only observes the event and never blocks the app underneath.
            const onPointerDown = (event) => {
                if (event.button !== 0) return;
                const rect = canvas.getBoundingClientRect();
                engine.splashAt(event.clientX - rect.left, event.clientY - rect.top);
            };
            window.addEventListener("pointerdown", onPointerDown, { passive: true, capture: true });

            const interval = window.setInterval(apply, 800);
            window.addEventListener("resize", apply);
            const themeObserver = new MutationObserver(() => {
                engine.setTheme(isDarkTheme());
                apply();
            });
            if (document.body !== null) {
                themeObserver.observe(document.body, {
                    attributes: true,
                    attributeFilter: ["data-ds-dark-theme"]
                });
            }

            return () => {
                disposed = true;
                window.clearInterval(interval);
                window.removeEventListener("resize", apply);
                window.removeEventListener("pointerdown", onPointerDown, { capture: true });
                resizeObserver.disconnect();
                themeObserver.disconnect();
                engine.destroy();
            };
        }, []);

        return React.createElement(
            "div",
            {
                "aria-hidden": true,
                style: {
                    position: "absolute",
                    inset: 0,
                    zIndex: -1,
                    pointerEvents: "none",
                    overflow: "hidden",
                    contain: "layout style"
                }
            },
            React.createElement("canvas", {
                ref: canvasRef,
                "aria-hidden": true,
                style: {
                    display: "block",
                    width: "100%",
                    height: "100%",
                    opacity: 0,
                    transition: "opacity 600ms ease",
                    pointerEvents: "none"
                }
            })
        );
    }

    const plugin = {
        inject: ["slots"],
        apply(ctx) {
            ctx.slots.inject("shell.overlay", () => ctx.slots.register({
                name: "shell.overlay",
                id: "ascii-sharks.ocean",
                order: -10
            }, OceanLayer));
        }
    };

    return plugin;
  },
});
