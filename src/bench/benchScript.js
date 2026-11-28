/**
 * Parámetros del modo de medición `?bench=1` (#368, `README.md` "Medir el rendimiento").
 *
 * - `seed`: semilla fija de bots, cajas, lluvia y mapa;
 * - `minuteSeconds`: s de partida que abarca cada fila "por minuto" de las escenas con `perMinute`;
 * - `warmupFrames`: frames al empezar cada escena que no se miden (el arranque de ronda y la creación de partículas);
 * - `particleSpacingRadii`: separación, en radios de partícula, de la grilla donde se crean las partículas;
 * - `gpuMaxPending`: consultas de tiempo de GPU en vuelo como máximo;
 * - `reportMaxLines`: tope de líneas del informe, para que entre en un comentario de GitHub;
 * - `percentiles`: percentiles (0 a 100) del informe.
 */
export const BENCH = {
    seed: 1,
    minuteSeconds: 60,
    warmupFrames: 2,
    particleSpacingRadii: 2,
    gpuMaxPending: 4,
    reportMaxLines: 60,
    percentiles: { median: 50, p95: 95, p99: 99 },
};

/**
 * Región donde se crean partículas, en m del mundo: `centerX` y `bottomY` son el centro y el borde inferior, y `width` el
 * ancho. La primera queda sobre la plataforma de acero central del mapa Clásico, lejos de los robots (que aparecen en los extremos).
 */
const CENTER_PLATFORM_BLOCK = { centerX: 28, bottomY: 14, width: 12 };
const CENTER_PLATFORM_DROP = { centerX: 28, bottomY: 14, width: 3 };

const CLASSIC = "classic";

/**
 * Escenas del modo de medición, en orden. Cada una: `name`, `map`, `bots` (índices de jugador que maneja un bot),
 * `seconds` (duración, en s), `spawns` (partículas a crear: `material` es una clave de `FLUID`, `count` cuántas,
 * `region` dónde y `everySeconds`, cada cuántos s se repite, o `null` si se crean una sola vez al empezar) y
 * `perMinute` (si el informe suma una fila por minuto). La suma de duraciones es menor a 6 min.
 */
export const BENCH_SCENES = [
    { name: "idle", map: CLASSIC, bots: [], seconds: 20, spawns: [], perMinute: false },
    ...["WATER", "ACID", "LAVA", "HONEY"].map((material) => ({
        name: `particles-${material.toLowerCase()}`,
        map: CLASSIC,
        bots: [],
        seconds: 20,
        spawns: [{ material, count: 1500, region: CENTER_PLATFORM_BLOCK, everySeconds: null }],
        perMinute: false,
    })),
    {
        name: "corrosion",
        map: CLASSIC,
        bots: [],
        seconds: 40,
        spawns: [{ material: "ACID", count: 60, region: CENTER_PLATFORM_DROP, everySeconds: 0.5 }],
        perMinute: false,
    },
    { name: "match", map: CLASSIC, bots: [0, 1], seconds: 180, spawns: [], perMinute: true },
];
