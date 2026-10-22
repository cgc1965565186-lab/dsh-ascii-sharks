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
