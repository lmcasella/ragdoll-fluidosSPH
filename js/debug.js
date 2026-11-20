/**
 * Monitor de física (#29, docs/design/14-agua.md §14.12 y §14.17). Módulo hoja: no importa ningún sistema del juego;
 * `index.html` le pasa datos planos una vez por frame y las referencias que la capa necesita para dibujar.
 *
 * - `alpha`: peso de la muestra nueva en el promedio móvil exponencial de todo número del panel;
 * - `maxArrows`: tope de flechas de velocidad de partículas por frame;
 * - `arrowTime`: segundos de movimiento que representa la flecha de una velocidad (m/s → m);
 * - `forceScale`: largo (m) de la flecha de una fuerza igual al peso de su pieza;
 * - `maxColumns`: tope de columnas del campo que se dibujan.
 */
export const DEBUG = { alpha: 0.1, maxArrows: 300, arrowTime: 0.1, forceScale: 0.5, maxColumns: 200 };

const PANEL = { x: 8, y: 8, width: 330, line: 15, pad: 6, font: "12px monospace" };

const GRAVITY = 10;

/**
 * Error relativo `|a − b| / |b|`. Es la fórmula de la deriva de volumen del test W1 (`tests/shallow-water.test.js`) y
 * la del panel.
 */
export function relativeError(a, b) {
    return Math.abs(a - b) / Math.abs(b);
}

const fixed = (v, digits) => (Number.isFinite(v) ? v.toFixed(digits) : "-");
const point = (p) => (p ? `${fixed(p.x, 1)}, ${fixed(p.y, 1)}` : "-");

/**
 * Estado del monitor: `panelOn` (texto en el HUD) y `layerOn` (vectores en metros con la cámara). Mide con `mark` solo
 * con el panel encendido; con todo apagado cada método sale en la primera línea.
 */
export class Debug {
    constructor({ alpha = DEBUG.alpha, now = () => performance.now() } = {}) {
        this.alpha = alpha;
        this.now = now;
        this.panelOn = false;
        this.layerOn = false;
        this.laps = {};
        this.last = 0;
        this.avg = { fps: 0, contacts: 0, cflSubsteps: 0, drift: 0, ms: {}, particles: {} };
        this.volume0 = null;
        this.bots = [];
    }

    /** Verdadero si el panel o la capa están encendidos: `index.html` arma los datos solo entonces. */
    get active() {
        return this.panelOn || this.layerOn;
    }

    /** Aplica los flancos `{ panel, layer }` de `Input.debug`. */
    toggle({ panel, layer }) {
        if (panel) this.panelOn = !this.panelOn;
        if (layer) this.layerOn = !this.layerOn;
    }

    /** Empieza a medir un frame: `laps` queda en cero. */
    begin() {
        if (!this.panelOn) return;
        for (const key in this.laps) this.laps[key] = 0;
        this.last = this.now();
    }

    /** Suma a `laps[name]` (ms) el tiempo desde la marca anterior. */
    mark(name) {
        if (!this.panelOn) return;
        const t = this.now();
        this.laps[name] = (this.laps[name] ?? 0) + (t - this.last);
        this.last = t;
    }

    /** Vuelve a tomar el volumen de referencia de la deriva en la próxima muestra (ronda nueva, mapa nuevo). */
    resetVolume() {
        this.volume0 = null;
    }

    /** Promedio móvil exponencial de `value` en `store[key]`. */
    smooth(store, key, value) {
        store[key] = key in store ? (1 - this.alpha) * store[key] + this.alpha * value : value;
    }

    /**
     * Toma los datos del frame: `{ fps, ms: { [subsistema]: ms }, particles: { [material]: n }, contacts, cflSubsteps,
     * volume: { total }, bots: [{ k, from, goal, target, action }] }`. `volume.total` (m²) se compara con el de la
     * primera muestra (`relativeError`); `goal`, `target` y `from` son puntos `{ x, y }` en m o `null`.
     */
    frame(data) {
        if (!this.active) return;
        this.bots = data.bots;
        if (!this.panelOn) return;
        const avg = this.avg;
        this.smooth(avg, "fps", data.fps);
        this.smooth(avg, "contacts", data.contacts);
        this.smooth(avg, "cflSubsteps", data.cflSubsteps);
        for (const key in data.ms) this.smooth(avg.ms, key, data.ms[key]);
        for (const key in data.particles) this.smooth(avg.particles, key, data.particles[key]);
        this.volume0 ??= data.volume.total;
        this.smooth(avg, "drift", relativeError(data.volume.total, this.volume0));
    }

    /** Líneas de texto del panel con los valores promediados. */
    lines() {
        const avg = this.avg;
        const lines = [`FPS ${fixed(avg.fps, 1)}`];
        for (const key in avg.ms) lines.push(`${key} ${fixed(avg.ms[key], 2)} ms`);
        const counts = [];
        for (const key in avg.particles) counts.push(`${key} ${fixed(avg.particles[key], 0)}`);
        lines.push(`partículas: ${counts.join(" · ") || "-"}`);
        lines.push(`contactos partícula-cuerpo ${fixed(avg.contacts, 0)}`);
        lines.push(`subpasos CFL ${fixed(avg.cflSubsteps, 1)}`);
        lines.push(`volumen de agua: deriva ${(avg.drift * 100).toExponential(2)} %`);
        for (const bot of this.bots) {
            lines.push(`bot J${bot.k + 1}: meta ${point(bot.goal)} · objetivo ${point(bot.target)} · ${bot.action}`);
        }
        return lines;
    }

    /** Dibuja el panel arriba a la izquierda de un lienzo de HUD (píxeles). */
    drawPanel(ctx, width, height) {
        if (!this.panelOn) return;
        const lines = this.lines();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.font = PANEL.font;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
        ctx.fillRect(PANEL.x, PANEL.y, PANEL.width, lines.length * PANEL.line + 2 * PANEL.pad);
        ctx.fillStyle = "#e8ffe8";
        lines.forEach((text, i) => ctx.fillText(text, PANEL.x + PANEL.pad, PANEL.y + PANEL.pad + i * PANEL.line));
    }

    /**
     * Dibuja la capa de vectores con `ctx` ya en metros (Y arriba, `scale` píxeles por metro). `refs`:
     * `particles` `{ heap, pos, vel, count }` (vista `Float32Array` del heap y los índices de palabra de los buffers de
     * posición y velocidad), `pieces` (las piezas de `Buoyancy`: `cx`, `cy`, `buoyancy`, `drag`, `body`) y `water` (el
     * campo: `h`, `b`, `uOf`, `x0`, `dx`, `i0`, `i1`, `config.hDry`).
     */
    drawLayer(ctx, scale, refs) {
        if (!this.layerOn) return;
        ctx.lineWidth = 1.5 / scale;
        this.drawParticles(ctx, scale, refs.particles);
        this.drawForces(ctx, refs.pieces);
        this.drawColumns(ctx, scale, refs.water);
        this.drawBots(ctx);
    }

    /** Flechas de velocidad de hasta `maxArrows` partículas, muestreadas a paso fijo sobre el buffer. */
    drawParticles(ctx, scale, { heap, pos, vel, count }) {
        if (count === 0) return;
        const stride = Math.ceil(count / DEBUG.maxArrows);
        const head = 3 / scale;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
        ctx.beginPath();
        for (let i = 0; i < count; i += stride) {
            const x = heap[pos + 2 * i];
            const y = heap[pos + 2 * i + 1];
            const dx = heap[vel + 2 * i] * DEBUG.arrowTime;
            const dy = heap[vel + 2 * i + 1] * DEBUG.arrowTime;
            ctx.moveTo(x, y);
            ctx.lineTo(x + dx, y + dy);
            const len = Math.hypot(dx, dy);
            if (len > head) {
                const ux = dx / len;
                const uy = dy / len;
                ctx.lineTo(x + dx - head * (ux + 0.5 * uy), y + dy - head * (uy - 0.5 * ux));
                ctx.moveTo(x + dx, y + dy);
                ctx.lineTo(x + dx - head * (ux - 0.5 * uy), y + dy - head * (uy + 0.5 * ux));
            }
        }
        ctx.stroke();
    }

    /** Empuje (cian) y arrastre (magenta) de cada pieza: el largo es `forceScale` por la fuerza sobre el peso de la pieza. */
    drawForces(ctx, pieces) {
        const arrow = (piece, force, weight) => {
            if (force.x === 0 && force.y === 0) return;
            const k = DEBUG.forceScale / weight;
            ctx.moveTo(piece.cx, piece.cy);
            ctx.lineTo(piece.cx + force.x * k, piece.cy + force.y * k);
        };
        ctx.strokeStyle = "#33e0ff";
        ctx.beginPath();
        for (const piece of pieces) arrow(piece, piece.buoyancy, Math.max(piece.body.GetMass() * GRAVITY, 1e-6));
        ctx.stroke();
        ctx.strokeStyle = "#ff55dd";
        ctx.beginPath();
        for (const piece of pieces) arrow(piece, piece.drag, Math.max(piece.body.GetMass() * GRAVITY, 1e-6));
        ctx.stroke();
    }

    /** Barra de `h` (del lecho a la superficie) y vector de `u` sobre ella en las columnas mojadas, hasta `maxColumns`. */
    drawColumns(ctx, scale, water) {
        const { i0, i1, h, b, x0, dx } = water;
        const hd = water.config.hDry;
        const stride = Math.ceil((i1 - i0) / DEBUG.maxColumns);
        ctx.strokeStyle = "rgba(80, 200, 255, 0.6)";
        ctx.beginPath();
        for (let i = i0; i < i1; i += stride) {
            if (h[i] <= hd) continue;
            const x = x0 + (i + 0.5) * dx;
            ctx.moveTo(x, b[i]);
            ctx.lineTo(x, b[i] + h[i]);
        }
        ctx.stroke();
        ctx.strokeStyle = "#ffe14d";
        ctx.beginPath();
        for (let i = i0; i < i1; i += stride) {
            if (h[i] <= hd) continue;
            const x = x0 + (i + 0.5) * dx;
            const y = b[i] + h[i];
            ctx.moveTo(x, y);
            ctx.lineTo(x + water.uOf(i) * DEBUG.arrowTime, y);
        }
        ctx.stroke();
    }

    /** Línea de cada bot a su meta, o a su objetivo si no tiene meta. */
    drawBots(ctx) {
        ctx.strokeStyle = "#ffb347";
        ctx.beginPath();
        for (const bot of this.bots) {
            const to = bot.goal ?? bot.target;
            if (!to || !bot.from) continue;
            ctx.moveTo(bot.from.x, bot.from.y);
            ctx.lineTo(to.x, to.y);
        }
        ctx.stroke();
    }
}
