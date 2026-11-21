/**
 * Monitor de física (#29, docs/design/14-agua.md §14.12 y §14.17). Módulo hoja: no importa ningún sistema del juego;
 * `index.html` le pasa datos planos una vez por frame y las referencias que la capa necesita para dibujar.
 *
 * - `alpha`: peso de la muestra nueva en el promedio móvil exponencial de todo número del panel;
 * - `maxArrows`: tope de flechas de velocidad de partículas por frame;
 * - `arrowTime`: segundos de movimiento que representa la flecha de una velocidad (m/s → m);
 * - `forceScale`: largo (m) de la flecha de una fuerza igual al peso de su pieza;
 * - `maxColumns`: tope de columnas del campo que se dibujan;
 * - `materials`: nombre que muestra el panel para cada clave de `FLUID`.
 */
export const DEBUG = {
    alpha: 0.1,
    maxArrows: 300,
    arrowTime: 0.1,
    forceScale: 0.5,
    maxColumns: 200,
    materials: { ACID: "ácido", LAVA: "lava", HONEY: "miel", WATER: "agua", STONE: "piedra", STEAM: "vapor" },
};

/** Panel del menú de debug en px; `below` es la fracción del alto bajo la que empieza, para quedar debajo del HUD de partida (128 de 1080). */
const PANEL = { x: 8, y: 8, below: 0.13, width: 360, line: 15, pad: 6, font: "12px monospace" };

const GRAVITY = 10;

/**
 * Modos de dibujo de los fluidos, en el orden en que los recorre la fila "Fluidos" del menú: `"metaball"` (como el juego), `"puntos"` (un círculo
 * por partícula) y `"ambos"`.
 */
export const FLUID_MODES = ["metaball", "puntos", "ambos"];

/** Trazos de la capa de vectores: ancho en píxeles y alfa de todos los colores. */
const STROKE = { px: 1, alpha: 0.5 };

/** Alfa de los círculos del modo de puntos. */
const POINT_ALPHA = 0.8;

/**
 * Filas del menú de debug, en orden: `id` (clave del estado), `label` y, si no es sí/no, sus `options`. Las cuatro
 * últimas son las capas de vectores.
 */
export const DEBUG_ROWS = [
    { id: "stats", label: "Estadísticas" },
    { id: "fluidos", label: "Fluidos", options: FLUID_MODES },
    { id: "velocidades", label: "Velocidades" },
    { id: "fuerzas", label: "Fuerzas" },
    { id: "columnas", label: "Columnas" },
    { id: "bots", label: "Bots" },
];

const stroke = (r, g, b) => `rgba(${r}, ${g}, ${b}, ${STROKE.alpha})`;

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
 * Estado del monitor: el menú de debug (`open`, fila `cursor`) y sus opciones: `stats` (panel de estadísticas, que se
 * dibuja solo con el menú abierto), `fluidMode` y `layers` (vectores en metros con la cámara, siempre que estén en sí).
 * Mide con `mark` solo con `stats` en sí; con todo apagado cada método sale en la primera línea.
 */
export class Debug {
    constructor({ alpha = DEBUG.alpha, now = () => performance.now() } = {}) {
        this.alpha = alpha;
        this.now = now;
        this.open = false;
        this.cursor = 0;
        this.stats = false;
        this.fluidMode = FLUID_MODES[0];
        this.layers = { velocidades: false, fuerzas: false, columnas: false, bots: false };
        this.fills = new Map();
        this.laps = {};
        this.last = 0;
        this.avg = { fps: 0, contacts: 0, cflSubsteps: 0, drift: 0, ms: {}, particles: {} };
        this.volume0 = null;
        this.bots = [];
    }

    /** Verdadero si las estadísticas o alguna capa están en sí: `index.html` arma los datos solo entonces. */
    get active() {
        return this.stats || this.anyLayer;
    }

    /** Verdadero si alguna capa de vectores está en sí. */
    get anyLayer() {
        const layers = this.layers;
        return layers.velocidades || layers.fuerzas || layers.columnas || layers.bots;
    }

    /** Falso en el modo `"puntos"`: `index.html` no dibuja entonces los fluidos como metaball. */
    get metaballOn() {
        return this.fluidMode !== "puntos";
    }

    /** Abre o cierra el menú (el flanco del botón de debug). */
    toggleOpen() {
        this.open = !this.open;
    }

    /** Valor de la fila `id` como texto: `sí`, `no` o el modo de fluidos. */
    valueOf(id) {
        if (id === "fluidos") return this.fluidMode;
        return (id === "stats" ? this.stats : this.layers[id]) ? "sí" : "no";
    }

    /**
     * Aplica las intenciones de `Input.menu` con el menú abierto: `y` mueve la fila (cíclico), `x` cambia su valor (los
     * sí/no alternan y "Fluidos" recorre `FLUID_MODES` en esa dirección), `confirm` lo cambia hacia adelante y `back`
     * cierra.
     */
    update({ x = 0, y = 0, confirm = false, back = false }) {
        if (!this.open) return;
        if (back) this.open = false;
        const rows = DEBUG_ROWS.length;
        if (y) this.cursor = (this.cursor + y + rows) % rows;
        const step = x || (confirm ? 1 : 0);
        if (!step) return;
        const id = DEBUG_ROWS[this.cursor].id;
        if (id === "fluidos") {
            const modes = FLUID_MODES.length;
            this.fluidMode = FLUID_MODES[(FLUID_MODES.indexOf(this.fluidMode) + step + modes) % modes];
        } else if (id === "stats") this.stats = !this.stats;
        else this.layers[id] = !this.layers[id];
    }

    /** Empieza a medir un frame: `laps` queda en cero. */
    begin() {
        if (!this.stats) return;
        for (const key in this.laps) this.laps[key] = 0;
        this.last = this.now();
    }

    /** Suma a `laps[name]` (ms) el tiempo desde la marca anterior. */
    mark(name) {
        if (!this.stats) return;
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
        if (!this.stats) return;
        const avg = this.avg;
        this.smooth(avg, "fps", data.fps);
        this.smooth(avg, "contacts", data.contacts);
        this.smooth(avg, "cflSubsteps", data.cflSubsteps);
        for (const key in data.ms) this.smooth(avg.ms, key, data.ms[key]);
        for (const key in data.particles) this.smooth(avg.particles, key, data.particles[key]);
        this.volume0 ??= data.volume.total;
        this.smooth(avg, "drift", relativeError(data.volume.total, this.volume0));
    }

    /** Líneas del menú: una por fila de `DEBUG_ROWS`, con el cursor en la elegida. */
    menuLines() {
        return DEBUG_ROWS.map((row, i) => `${i === this.cursor ? "▶" : " "} ${row.label}: ${this.valueOf(row.id)}`);
    }

    /** Líneas de texto de las estadísticas con los valores promediados. */
    lines() {
        const avg = this.avg;
        const lines = [`FPS ${fixed(avg.fps, 1)}`];
        for (const key in avg.ms) lines.push(`${key} ${fixed(avg.ms[key], 2)} ms`);
        const counts = [];
        for (const key in avg.particles) counts.push(`${DEBUG.materials[key] ?? key} ${fixed(avg.particles[key], 0)}`);
        lines.push(`partículas: ${counts.join(" · ") || "-"}`);
        lines.push(`contactos partícula-cuerpo ${fixed(avg.contacts, 0)}`);
        lines.push(`subpasos CFL ${fixed(avg.cflSubsteps, 1)}`);
        lines.push(`volumen de agua: deriva ${(avg.drift * 100).toExponential(2)} %`);
        for (const bot of this.bots) {
            lines.push(`bot J${bot.k + 1}: meta ${point(bot.goal)} · objetivo ${point(bot.target)} · ${bot.action}${bot.mode ? ` · ${bot.mode}` : ""}`);
        }
        return lines;
    }

    /**
     * Dibuja el menú arriba a la izquierda de un lienzo de HUD (píxeles), y debajo las estadísticas si `stats` está en
     * sí. Con el menú cerrado no dibuja nada.
     */
    drawPanel(ctx, width, height) {
        if (!this.open) return;
        const lines = this.stats ? [...this.menuLines(), "", ...this.lines()] : this.menuLines();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.font = PANEL.font;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        const top = Math.max(PANEL.y, PANEL.below * height);
        ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
        ctx.fillRect(PANEL.x, top, PANEL.width, lines.length * PANEL.line + 2 * PANEL.pad);
        ctx.fillStyle = "#e8ffe8";
        lines.forEach((text, i) => ctx.fillText(text, PANEL.x + PANEL.pad, top + PANEL.pad + i * PANEL.line));
    }

    /**
     * Dibuja cada partícula como un círculo relleno de radio `radius` (m) con el color de su buffer de color y alfa
     * `POINT_ALPHA`, con `ctx` ya en metros. Solo en los modos `"puntos"` y `"ambos"`. `refs`: `{ heap, bytes, pos, color,
     * count, radius }` (vistas `Float32Array` y `Uint8Array` del heap, índice de palabra de posición, offset en bytes del
     * buffer de color). Los estilos se cachean por color: no crea objetos nativos ni cadenas nuevas por frame.
     */
    drawPoints(ctx, { heap, bytes, pos, color, count, radius }) {
        if (this.fluidMode === "metaball") return;
        let last = -1;
        for (let i = 0; i < count; i++) {
            const c = color + 4 * i;
            const key = (bytes[c] << 16) | (bytes[c + 1] << 8) | bytes[c + 2];
            if (key !== last) {
                last = key;
                let fill = this.fills.get(key);
                if (fill === undefined) {
                    fill = `rgba(${bytes[c]}, ${bytes[c + 1]}, ${bytes[c + 2]}, ${POINT_ALPHA})`;
                    this.fills.set(key, fill);
                }
                ctx.fillStyle = fill;
            }
            ctx.beginPath();
            ctx.arc(heap[pos + 2 * i], heap[pos + 2 * i + 1], radius, 0, 2 * Math.PI);
            ctx.fill();
        }
    }

    /**
     * Dibuja la capa de vectores con `ctx` ya en metros (Y arriba, `scale` píxeles por metro): solo las capas en sí.
     * `refs`: `particles` `{ heap, pos, vel, count }` (vista `Float32Array` del heap y los índices de palabra de los
     * buffers de posición y velocidad), `pieces` (las piezas de `Buoyancy`: `cx`, `cy`, `buoyancy`, `drag`, `body`) y
     * `water` (el campo: `h`, `b`, `uOf`, `x0`, `dx`, `i0`, `i1`, `config.hDry`).
     */
    drawLayer(ctx, scale, refs) {
        if (!this.anyLayer) return;
        ctx.lineWidth = STROKE.px / scale;
        if (this.layers.velocidades) this.drawParticles(ctx, scale, refs.particles);
        if (this.layers.fuerzas) this.drawForces(ctx, refs.pieces);
        if (this.layers.columnas) this.drawColumns(ctx, scale, refs.water);
        if (this.layers.bots) this.drawBots(ctx);
    }

    /** Flechas de velocidad de hasta `maxArrows` partículas, muestreadas a paso fijo sobre el buffer. */
    drawParticles(ctx, scale, { heap, pos, vel, count }) {
        if (count === 0) return;
        const stride = Math.ceil(count / DEBUG.maxArrows);
        const head = 3 / scale;
        ctx.strokeStyle = stroke(255, 255, 255);
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
        ctx.strokeStyle = stroke(51, 224, 255);
        ctx.beginPath();
        for (const piece of pieces) arrow(piece, piece.buoyancy, Math.max(piece.body.GetMass() * GRAVITY, 1e-6));
        ctx.stroke();
        ctx.strokeStyle = stroke(255, 85, 221);
        ctx.beginPath();
        for (const piece of pieces) arrow(piece, piece.drag, Math.max(piece.body.GetMass() * GRAVITY, 1e-6));
        ctx.stroke();
    }

    /** Barra de `h` (del lecho a la superficie) y vector de `u` sobre ella en las columnas mojadas, hasta `maxColumns`. */
    drawColumns(ctx, scale, water) {
        const { i0, i1, h, b, x0, dx } = water;
        const hd = water.config.hDry;
        const stride = Math.ceil((i1 - i0) / DEBUG.maxColumns);
        ctx.strokeStyle = stroke(80, 200, 255);
        ctx.beginPath();
        for (let i = i0; i < i1; i += stride) {
            if (h[i] <= hd) continue;
            const x = x0 + (i + 0.5) * dx;
            ctx.moveTo(x, b[i]);
            ctx.lineTo(x, b[i] + h[i]);
        }
        ctx.stroke();
        ctx.strokeStyle = stroke(255, 225, 77);
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
        ctx.strokeStyle = stroke(255, 179, 71);
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
