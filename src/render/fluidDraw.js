import { COLOR_BYTES, tintOf } from "../core/color.js";
import { VECTOR_COMPONENTS, wordIndexOf } from "../core/heap.js";
import { vectorLength } from "../core/math/vector2.js";
import { skinPosition } from "./fluidSurfaces.js";
import { THRESHOLD_GAIN, THRESHOLD_OFFSET } from "./thresholdFilter.js";

/**
 * Dibujo de las gotas como campo de metaballs (`docs/design/07-sph.md` §7.4): la forma de cada gota, el perfil del campo de
 * cada material y el volcado de las partículas del motor a las capas de `FluidLayers`.
 */

/** Radio físico de una partícula del sistema de disparos, en m (`SHOT_SYSTEM.radius` en `src/combat/weapons.js`). */
const PHYSICAL_PARTICLE_RADIUS = 0.06;

/** Lado del cuadrado de área de una partícula, en radios físicos: `A_p = (1,5 · radio físico)²`. */
const PARTICLE_SIDE_IN_RADII = 1.5;

/** Radio dibujado de las gotas: `√(A_p / π)` con `A_p` el área física de una partícula (0,0508 m), para que el área dibujada sea la física (I3). */
export const PARTICLE_RADIUS = (PARTICLE_SIDE_IN_RADII * PHYSICAL_PARTICLE_RADIUS) / Math.sqrt(Math.PI);

/** Área física de una partícula, en m². */
const PARTICLE_AREA = Math.PI * PARTICLE_RADIUS ** 2;

/** Radio de influencia del campo de cada partícula, en radios dibujados: con 2,2 las gotas a 0,12 m se funden y las de 0,16 m ya no. */
const INFLUENCE_IN_PARTICLE_RADII = 2.2;

/**
 * Radio de influencia `R` del campo de cada partícula, en m: el campo vale 0 a `R` del centro y solo las vecinas a
 * menos de `2 R` se suman.
 */
export const METABALL_RADIUS = INFLUENCE_IN_PARTICLE_RADII * PARTICLE_RADIUS;

/** Umbral de alfa del filtro de `thresholdFilter.js`: el alfa de salida es 0 hasta aquí (0,5 con ganancia 20 y desplazamiento −10). */
export const METABALL_THRESHOLD = -THRESHOLD_OFFSET / THRESHOLD_GAIN;

/**
 * Perfil radial del campo (Wyvill): `(1 − q²)²` con `q = d / R`, 1 en el centro y 0 desde `q` = 1, con derivada nula en ambos extremos.
 * @param {number} q distancia al centro sobre el radio de influencia
 * @returns {number} alfa relativo, de 0 a 1
 */
export function metaballProfile(q) {
    if (q >= 1) return 0;
    const complement = 1 - q * q;
    return complement * complement;
}

/**
 * Pico de alfa del sprite de un material para que una gota aislada de radio `radius` (m) cruce el umbral justo en ese radio:
 * `umbral / perfil(radius / R)`, con tope 1.
 * @param {number} radius radio visible de la gota, en m
 * @param {number} influence radio de influencia del campo, en m
 * @param {number} threshold umbral de alfa del filtro
 * @returns {number} alfa en el centro de la gota, de 0 a 1
 */
export function metaballPeak(radius, influence = METABALL_RADIUS, threshold = METABALL_THRESHOLD) {
    return Math.min(1, threshold / metaballProfile(radius / influence));
}

/**
 * Alfa de una gota de pico `peak` a `distance` m de su centro.
 * @param {number} distance distancia al centro, en m
 * @param {number} peak alfa en el centro
 * @param {number} influence radio de influencia del campo, en m
 * @returns {number} alfa en ese punto
 */
export function metaballAlpha(distance, peak, influence = METABALL_RADIUS) {
    return peak * metaballProfile(distance / influence);
}

/**
 * Radio visible (m) de una gota aislada de pico `peak`: donde el alfa baja al umbral. Invierte `metaballAlpha`.
 * @param {number} peak alfa en el centro
 * @param {number} influence radio de influencia del campo, en m
 * @param {number} threshold umbral de alfa del filtro
 * @returns {number} radio visible, en m
 */
export function metaballVisibleRadius(peak, influence = METABALL_RADIUS, threshold = METABALL_THRESHOLD) {
    return influence * Math.sqrt(1 - Math.sqrt(threshold / peak));
}

/**
 * Dibujo de las gotas de disparo y de lluvia: un solo círculo por partícula, de área física `area` = A_p en m²,
 * igual para toda partícula de un material (sin trazos: la velocidad y el origen no cambian el dibujo).
 * `snapReach` y `snapFullReach` (m) acercan el círculo de las partículas junto a un cuerpo a su superficie: la fila de contacto física queda a
 * 0,192 m. `kinds` se indexa por `store.kind` (ids de `FLUID` en `src/combat/weapons.js`: 1 ácido, 2 lava, 3 miel, 4 agua, 5 piedra, 6 vapor) y
 * dice, por material, `radiusScale` (k que multiplica a `√(A_p/π)`, con tope `maxRadius` en m). Los k se midieron con el fluido en reposo (|v| < 1 m/s) en la
 * escena estándar de `tests/helpers/invariants-run.js` (60 s, un muestreo cada 20 pasos): el k que hace que la
 * unión de círculos (con `skinPosition`) mida N · A_p, por bisección; resultado ponderado por N: agua 1,040
 * (109 muestras), miel 1,069 (111), lava 1,045 (12); con la viscosidad de la lava (#75) la pila de lava ya no se
 * comprime y el k de lava y piedra sube a 1,06 (con 1,045, 6 de 2.458 pasos de I3p pasan de ±15 %). El ácido nunca queda en reposo en esa escena (se absorbe o
 * cae al campo) y usa el k del agua, que tiene sus mismos flags y separación SPH. `diffuse` dibuja el material sin filtro
 * de umbral, como una nube (el vapor).
 */
export const SHOT_DRAW = {
    radius: PARTICLE_RADIUS,
    area: PARTICLE_AREA,
    maxRadius: 0.14,
    snapReach: 0.15,
    snapFullReach: 0.11,
    kinds: {
        1: { radiusScale: 1.04 },
        2: { radiusScale: 1.06 },
        3: { radiusScale: 1.069 },
        4: { radiusScale: 1.04 },
        5: { radiusScale: 1.06 },
        6: { radiusScale: 1.04, diffuse: true },
    },
};

/** Fila de `SHOT_DRAW.kinds` de un material sin fila: sin escala ni difusión. */
const DEFAULT_KIND = { radiusScale: 1, diffuse: false };

/** Parámetros de dibujo sin acercamiento a los cuerpos ni tope de radio, para `drawParticles` sin `skin`. */
const NO_SKIN = { radius: PARTICLE_RADIUS, area: PARTICLE_AREA, maxRadius: Infinity, snapReach: 0, snapFullReach: 0, kinds: {} };

/**
 * Círculo con que se dibuja una partícula (puro, sin PIXI): llena `out` (`radius`, `x0`, `y0`, en metros) y lo
 * devuelve. Siempre un solo círculo de radio `min(draw.radius · k_material, draw.maxRadius)`, acercado a la
 * superficie del cuerpo si corresponde (`skinPosition`). Depende solo del material (`kind` = `store.kind`): ni la
 * velocidad ni el origen (lluvia o disparo) cambian el dibujo.
 * @param {number} x posición de la partícula, en m
 * @param {number} y posición de la partícula, en m
 * @param {number} kind material de la partícula
 * @param {object} draw tabla de dibujo (`SHOT_DRAW`)
 * @param {{radius: number, x0: number, y0: number}} out se llena y se devuelve
 */
export function dropShape(x, y, kind, draw, out) {
    const entry = draw.kinds[kind] ?? DEFAULT_KIND;
    const radius = Math.min(draw.radius * entry.radiusScale, draw.maxRadius);
    out.radius = radius;
    out.x0 = x;
    out.y0 = y;
    if (draw.snapReach > 0) {
        const snapped = skinPosition(x, y, radius, draw.snapReach, draw.snapFullReach);
        out.x0 = snapped.x;
        out.y0 = snapped.y;
    }
    return out;
}

const shape = { radius: 0, x0: 0, y0: 0 };

/**
 * Estiramiento del sprite a lo largo de la velocidad, para que un chorro muestreado se dibuje continuo: medio largo extra
 * `|v| · time / 2` (m), con `time` el intervalo de emisión del chorro (1/100 s), desde `minSpeed` (m/s) y con tope `max` (m).
 * A 18 m/s la separación entre gotas del chorro es 0,18 m y el campo solo funde a menos de 2 `METABALL_RADIUS`.
 */
export const DROP_STRETCH = { time: 0.01, minSpeed: 1, max: 0.2 };

/** Mitad de un largo: el estiramiento se suma al radio de influencia por un solo lado del eje de la gota. */
const HALF = 0.5;

/**
 * Pone las partículas de `particleSystem` en las capas de `layers` (`FluidLayers`): una partícula del pool por gota, con la
 * textura de campo de su material (`kind` = `store.kind`, o 0 sin `store`) teñida con el color del buffer del motor, que la térmica
 * escribe por partícula. `skin` (`SHOT_DRAW`) acerca las partículas junto a un cuerpo a su superficie (ver `skinPosition`) y
 * la forma la decide `dropShape`. Una gota en movimiento se estira a lo largo de su velocidad (`DROP_STRETCH`). Lee los buffers
 * del heap y no crea nada nativo. Ver `docs/design/07-sph.md` §7.4.
 * @param {FluidLayers} layers capas de fluido
 * @param {object} particleSystem sistema de partículas de LiquidFun
 * @param {object|null} skin tabla de dibujo (`SHOT_DRAW`), o `null` para dibujar cada gota donde está
 * @param {ParticleStore|null} store identidad de las partículas, o `null` para tratarlas como un solo material
 */
export function drawParticles(layers, particleSystem, skin = null, store = null) {
    const count = particleSystem.GetParticleCount();
    const floats = Box2D.HEAPF32;
    const bytes = Box2D.HEAPU8;
    const positionBase = wordIndexOf(Box2D.getPointer(particleSystem.GetPositionBuffer()));
    const velocityBase = wordIndexOf(Box2D.getPointer(particleSystem.GetVelocityBuffer()));
    const colorBase = Box2D.getPointer(particleSystem.GetColorBuffer());
    const draw = skin ?? NO_SKIN;
    const { pixelsPerMeter, scalePerMeter } = layers;
    layers.begin();
    for (let index = 0; index < count; index++) {
        const colorOffset = colorBase + index * COLOR_BYTES;
        const kind = store !== null ? store.kind[store.slotAt(index)] : 0;
        const vectorOffset = index * VECTOR_COMPONENTS;
        dropShape(floats[positionBase + vectorOffset], floats[positionBase + vectorOffset + 1], kind, draw, shape);
        const diffuse = (draw.kinds[kind] ?? DEFAULT_KIND).diffuse === true;
        const particle = layers.acquire(kind, shape.radius, diffuse);
        const velocityX = floats[velocityBase + vectorOffset];
        const velocityY = floats[velocityBase + vectorOffset + 1];
        const speed = vectorLength(velocityX, velocityY);
        const stretching = speed >= DROP_STRETCH.minSpeed;
        const reachAlongVelocity = stretching
            ? METABALL_RADIUS + Math.min(DROP_STRETCH.max, speed * DROP_STRETCH.time * HALF)
            : METABALL_RADIUS;
        particle.x = shape.x0 * pixelsPerMeter;
        particle.y = shape.y0 * pixelsPerMeter;
        particle.scaleX = reachAlongVelocity * scalePerMeter;
        particle.scaleY = METABALL_RADIUS * scalePerMeter;
        particle.rotation = stretching ? Math.atan2(velocityY, velocityX) : 0;
        particle.tint = tintOf(bytes[colorOffset], bytes[colorOffset + 1], bytes[colorOffset + 2]);
    }
    layers.end();
}
