/**
 * Monitor de física (#29, docs/design/14-agua.md §14.12 y §14.17). Módulo hoja: no importa ningún sistema del juego;
 * `index.js` le pasa datos planos una vez por frame. Solo lleva el estado y los textos del panel: las capas del mundo las
 * dibuja `src/render/debugView.js` y el panel es HTML (`src/ui/debugPanel.js`).
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

/**
 * Modos de dibujo de los fluidos, en el orden en que los recorre la fila "Fluidos" del menú: `"metaball"` (como el juego), `"puntos"` (un círculo
 * por partícula) y `"ambos"`.
 */
export const FLUID_MODES = ["metaball", "puntos", "ambos"];

/**
 * Filas del menú de debug, en orden: `id` (clave del estado), `label` y, si no es sí/no, sus `options`. Desde la tercera
 * son capas: las cuatro de vectores y la del terreno de densidad (`docs/design/05-escenario.md` §5.5).
 */
export const DEBUG_ROWS = [
    { id: "stats", label: "Estadísticas" },
    { id: "fluidos", label: "Fluidos", options: FLUID_MODES },
    { id: "velocidades", label: "Velocidades" },
    { id: "fuerzas", label: "Fuerzas" },
    { id: "columnas", label: "Columnas" },
    { id: "bots", label: "Bots" },
    { id: "terreno", label: "Terreno" },
];

/**
 * Error relativo `|medido − referencia| / |referencia|`. Es la fórmula de la deriva de volumen del test W1 (`tests/slow/shallow-water.test.js`) y
 * la del panel.
 */
export function relativeError(measured, reference) {
    return Math.abs(measured - reference) / Math.abs(reference);
}

const fixed = (value, digits) => (Number.isFinite(value) ? value.toFixed(digits) : "-");
const point = (position) => (position ? `${fixed(position.x, 1)}, ${fixed(position.y, 1)}` : "-");

/**
 * Estado del monitor: el menú de debug (`open`, fila `cursor`) y sus opciones: `stats` (panel de estadísticas, que se
 * dibuja solo con el menú abierto), `fluidMode` y `layers` (vectores y terreno en metros con la cámara, siempre que estén en sí).
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
        this.layers = { velocidades: false, fuerzas: false, columnas: false, bots: false, terreno: false };
        this.laps = {};
        this.last = 0;
        this.avg = { fps: 0, contacts: 0, cflSubsteps: 0, drift: 0, ms: {}, particles: {}, terrain: {} };
        this.volume0 = null;
        this.bots = [];
    }

    /** Verdadero si las estadísticas o alguna capa están en sí: `index.js` arma los datos solo entonces. */
    get active() {
        return this.stats || this.anyLayer;
    }

    /** Verdadero si alguna capa (de vectores o del terreno) está en sí. */
    get anyLayer() {
        const layers = this.layers;
        return layers.velocidades || layers.fuerzas || layers.columnas || layers.bots || layers.terreno;
    }

    /** Falso en el modo `"puntos"`: `index.js` no dibuja entonces los fluidos como metaball. */
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
     * volume: { total }, bots: [{ k, from, goal, target, action }], terrain?: { grids, polygons, vertices, rebuilds,
     * rebuildMs } }`. `volume.total` (m²) se compara con el de la primera muestra (`relativeError`); `goal`, `target` y
     * `from` son puntos `{ x, y }` en m o `null`; `terrain` son los conteos del terreno de densidad y lo que costó
     * rehacerlo en el frame (`rebuildMs`, en ms).
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
        for (const key in data.terrain) this.smooth(avg.terrain, key, data.terrain[key]);
        this.volume0 ??= data.volume.total;
        this.smooth(avg, "drift", relativeError(data.volume.total, this.volume0));
    }

    /** Líneas del menú: una por fila de `DEBUG_ROWS`, con el cursor en la elegida. */
    menuLines() {
        return DEBUG_ROWS.map((row, index) => `${index === this.cursor ? "▶" : " "} ${row.label}: ${this.valueOf(row.id)}`);
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
        const terrain = avg.terrain;
        if ("grids" in terrain) {
            lines.push(
                `terreno: ${fixed(terrain.grids, 0)} grillas · ${fixed(terrain.polygons, 0)} polígonos · ${fixed(terrain.vertices, 0)} vértices · ` +
                    `${fixed(terrain.rebuilds, 2)} reconstrucciones por frame · ${fixed(terrain.rebuildMs, 3)} ms`,
            );
        }
        for (const bot of this.bots) {
            lines.push(`bot J${bot.k + 1}: meta ${point(bot.goal)} · objetivo ${point(bot.target)} · ${bot.action}${bot.mode ? ` · ${bot.mode}` : ""}`);
        }
        return lines;
    }

    /**
     * Líneas del panel de debug: el menú y, debajo, las estadísticas si `stats` está en sí. `null` con el menú cerrado.
     * @returns {string[]|null}
     */
    panelLines() {
        if (!this.open) return null;
        return this.stats ? [...this.menuLines(), "", ...this.lines()] : this.menuLines();
    }
}
