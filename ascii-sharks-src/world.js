import { angleDiff, clamp, current, rand, randInt, TAU } from "./math";
import { pickSpecies, SPECIES } from "./species";
export const SHARK_NODES = 20;
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
export class World {
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
