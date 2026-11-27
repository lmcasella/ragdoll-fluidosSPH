import { FLUID } from "../combat/weapons.js";
import { Terrain } from "./terrain.js";

// Nivel en metros, Y hacia arriba, independiente del tamaño de la ventana.
// Alturas entre plataformas <= 3,5 m: el salto (9 m/s) llega a unos 4 m.
// El hueco central es la pileta: agua del campo de alturas (src/water/water.js) y un sensor que destruye al robot que se hunde.
export const LEVEL = {
    bounds: { minX: 0, maxX: 56, minY: 0, maxY: 32 },
    // Rectángulos sólidos: { x, y } = centro, w × h
    solids: [
        { x: 28, y: -0.5, w: 56, h: 1, kind: "floor" },
        { x: 9, y: 2, w: 18, h: 4, kind: "floor" },
        { x: 47, y: 2, w: 18, h: 4, kind: "floor" },
        { x: -0.5, y: 16, w: 1, h: 32, kind: "wall" },
        { x: 56.5, y: 16, w: 1, h: 32, kind: "wall" },
        { x: 4.5, y: 6.8, w: 3, h: 0.4, kind: "platform", oneWay: true },
        { x: 13, y: 10.1, w: 8, h: 0.4, kind: "platform", oneWay: true },
        { x: 21, y: 5.6, w: 2, h: 0.4, kind: "platform", oneWay: true, breakable: 2 },
        { x: 28, y: 7.6, w: 8, h: 0.4, kind: "platform", oneWay: true },
        { x: 35, y: 5.6, w: 2, h: 0.4, kind: "platform", oneWay: true, breakable: 2 },
        { x: 28, y: 13.4, w: 12, h: 0.4, kind: "platform", oneWay: true },
        { x: 43, y: 10.1, w: 8, h: 0.4, kind: "platform", oneWay: true },
        { x: 51.5, y: 6.8, w: 3, h: 0.4, kind: "platform", oneWay: true },
    ],
    /** Pileta: el campo de alturas arranca con agua entre `x1` y `x2` hasta `surface` (m); el sensor cubre hasta `killY` (robot medio hundido). */
    pool: {
        x1: 18,
        x2: 38,
        bottom: 0,
        surface: 3,
        killY: 2.2,
    },
    /**
     * Inundación (muerte súbita): llueve desde `emitY` y la fuente sube el nivel `riseSpeed` m/s a partir de `start` s
     * de ronda; `maxRate` en gotas/s. `particleShare` es la fracción del caudal que sale como gotas (el resto entra
     * directo al campo); `spawnBand` (m) la franja de nacimiento bajo `emitY`; `dropSpeed` (m/s) la velocidad
     * vertical media y `dropSpeedSpread` su variación relativa (±); `windMax` (m/s) la velocidad horizontal máxima
     * del viento y `windPeriod` (s) su período; `gustMin` y `gustMax` (veces la media) los extremos de la ráfaga y
     * `gustPeriod` (s) su período.
     */
    flood: {
        start: 60,
        riseSpeed: 0.15,
        maxLevel: 15,
        emitY: 31.5,
        emitX1: 1,
        emitX2: 55,
        dropSpeed: 8,
        maxRate: 1200,
        particleShare: 0.4,
        spawnBand: 2,
        dropSpeedSpread: 0.25,
        windMax: 1.5,
        windPeriod: 8,
        gustMin: 0.5,
        gustMax: 1.5,
        gustPeriod: 4,
    },
    // En el piso, entre plataformas (el rayo de aparición baja desde el techo hasta la primera superficie)
    spawns: [{ x: 7.5, flipX: false }, { x: 48.5, flipX: true }],
    /** Puntos de aparición de armas: centro del ícono (0,6 m sobre la cara superior de la plataforma) y `weapon` = id de `FLUID`. */
    pickups: [
        { x: 28, y: 14.2, weapon: FLUID.ACID },
        { x: 13, y: 10.9, weapon: FLUID.LAVA },
        { x: 43, y: 10.9, weapon: FLUID.LAVA },
        { x: 4.5, y: 7.6, weapon: FLUID.HONEY },
        { x: 51.5, y: 7.6, weapon: FLUID.HONEY },
        { x: 26, y: 8.4, weapon: FLUID.WATER },
        { x: 30, y: 8.4, kind: "repair" },
    ],
};

/** Fricción de los sólidos del nivel (piso, paredes y plataformas), adimensional. */
export const SOLID_FRICTION = 0.8;

/**
 * Crea el nivel como un único cuerpo estático (`ground`). El piso, las paredes y las plataformas atravesables son terreno
 * de densidad (`terrain`, ver `docs/design/05-escenario.md` §5.5); las plataformas rompibles y el sensor de la pileta
 * siguen siendo cajas. Las atravesables, tramos y cajas, se registran en `platforms` si se la pasa. Devuelve `ground`,
 * `terrain`, `killSensors` (punteros de los sensores que matan), `breakableFixtures` (`{ fixture, solid }` de los sólidos
 * que declaran `breakable`) y `dispose`, que desregistra las atravesables y libera el terreno; el cuerpo lo destruye quien
 * llama.
 * @param {object} world `b2World`
 * @param {typeof LEVEL} [level]
 * @param {{platforms?: OneWayPlatforms|null}} [options] registro de plataformas atravesables
 */
export function buildLevel(world, level = LEVEL, { platforms = null } = {}) {
    const bodyDef = new Box2D.b2BodyDef();
    const ground = world.CreateBody(bodyDef);
    Box2D.destroy(bodyDef);
    const terrain = new Terrain({ body: ground, platforms, friction: SOLID_FRICTION });
    const boxFixtures = [];
    const breakableFixtures = [];
    for (const solid of level.solids) {
        if (!solid.breakable) {
            terrain.addSolid(solid, { oneWay: Boolean(solid.oneWay) });
            continue;
        }
        const box = { x: solid.x, y: solid.y, width: solid.w, height: solid.h };
        const fixture = terrain.builder.createBox(ground, box, { friction: SOLID_FRICTION });
        if (solid.oneWay && platforms) {
            platforms.addPlatform(fixture);
            boxFixtures.push(fixture);
        }
        breakableFixtures.push({ fixture, solid });
    }

    const killSensors = new Set();
    if (level.pool) {
        const { x1, x2, bottom, killY } = level.pool;
        const box = { x: (x1 + x2) / 2, y: (bottom + killY) / 2, width: x2 - x1, height: killY - bottom };
        const sensor = terrain.builder.createBox(ground, box, { isSensor: true });
        killSensors.add(Box2D.getPointer(sensor));
    }
    const dispose = () => {
        for (const fixture of boxFixtures) platforms.removePlatform(fixture);
        terrain.dispose();
    };
    return { ground, terrain, killSensors, breakableFixtures, dispose };
}
