import { AsciiRenderer } from "./renderer";
import { World } from "./world";

const STEP = 1 / 60;
const MAX_STEPS = 4;
const MIN_PAINT_MS = 1000 / 24;

/**
 * Ambient ocean for the app frame: keeps the original fixed-timestep loop and
 * reduced-motion still frame, but the world spans the whole frame while only
 * the supplied water rectangles are painted. Pointer interaction is left out
 * because the layer is click-through decoration.
 */
export class OceanEngine {
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
