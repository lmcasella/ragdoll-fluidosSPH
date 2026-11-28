/**
 * Luz de la escena (`docs/design/13-arte.md` §13.3): la tabla de valores, el agrupado de las partículas de lava y ácido en
 * pocas luces por zona y las funciones de GLSL que comparten los filtros de luz (`surfaceFilter.js`, `lightFilter.js` y, con
 * los robots, el filtro de `ragdoll`). Unidades: metros, Y hacia arriba.
 */

/**
 * Valores de la luz. `base`: la luz clave, cálida y algo lateral: dirección en el plano de la pantalla (unitaria, Y arriba)
 * y `front`, la parte de la dirección que apunta hacia el jugador, para que una cara plana también reciba luz; `color` e
 * `intensity` de la clave y `ambient` del aire. `fill`: relleno frío desde el lado contrario de la clave (misma altura y
 * `front`, con la X invertida), sin especular: `color` e `intensity`. `sources`: luz de cada material de fluido por nombre
 * (`color` RGB de 0 a 1, `intensity`, `range` en m hasta donde llega y `sourceRadius` en m, opcional: con valor, la luz
 * proyecta sombras y la marcha ignora la oclusión dentro de ese radio alrededor de ella). `robot` es la luz de cada
 * robot, con el color del jugador (el `color` de la tabla es solo un valor por defecto). `height`: altura de la fuente sobre el plano de las
 * plataformas, en m. `zoneSize`: lado de las zonas en que se juntan las partículas, en m; `minParticles`: partículas mínimas
 * para que una zona sea luz; `fullIntensityParticles`: partículas con las que la zona da la intensidad completa.
 * `backgroundLayers`: de la capa más cercana a la más lejana, cuánta luz puntual recibe (`pointLight`), cuánto la aclara
 * la clave en un degradé vertical, más clara arriba (`keyLight`), y cuánto la tiñe la niebla (`fog`, de 0 a 1) hacia
 * `backgroundFogColor` (RGB de 0 a 1), que separa los planos.
 */
export const LIGHTING = {
    base: { direction: [-0.45, 0.89], front: 0.8, color: [1, 0.93, 0.82], intensity: 0.88, ambient: 0.12 },
    fill: { color: [0.45, 0.55, 0.75], intensity: 0.25 },
    sources: {
        lava: { color: [1, 0.55, 0.2], intensity: 1.6, range: 6 },
        acid: { color: [0.45, 1, 0.35], intensity: 0.5, range: 3 },
        robot: { color: [1, 1, 1], intensity: 0.9, range: 5, sourceRadius: 0.15 },
    },
    height: 0.6,
    zoneSize: 2,
    minParticles: 6,
    fullIntensityParticles: 40,
    backgroundLayers: [
        { pointLight: 0.6, keyLight: 0.12, fog: 0 },
        { pointLight: 0.3, keyLight: 0.09, fog: 0.08 },
        { pointLight: 0, keyLight: 0.06, fog: 0.18 },
        { pointLight: 0, keyLight: 0.04, fog: 0.3 },
    ],
    backgroundFogColor: [0.28, 0.31, 0.38],
};

/** Luces como máximo por pantalla. */
export const MAX_LIGHTS = 8;

/** `vec4` de GLSL que ocupa cada luz en el arreglo de uniforms: posición con alcance e intensidad, y color. */
export const VEC4_PER_LIGHT = 2;

/** Números por luz en el buffer plano: x, y, alcance, intensidad (primer `vec4`) y r, g, b, radio de la fuente en m (segundo). */
export const LIGHT_STRIDE = VEC4_PER_LIGHT * 4;

const X_SLOT = 0;
const Y_SLOT = 1;
const RANGE_SLOT = 2;
const INTENSITY_SLOT = 3;
const COLOR_SLOT = 4;
const SOURCE_RADIUS_SLOT = 7;
const RGB_COMPONENTS = 3;
const CHANNEL_MAX = 255;
const POSITION_COMPONENTS = 2;

/** Zonas distintas que se llevan a la vez; las partículas de una zona más allá de este tope no suman. */
const ZONE_CAPACITY = 64;

const zoneColumn = new Int32Array(ZONE_CAPACITY);
const zoneRow = new Int32Array(ZONE_CAPACITY);
const zoneKind = new Int32Array(ZONE_CAPACITY);
const zoneCount = new Int32Array(ZONE_CAPACITY);
const zoneSumX = new Float64Array(ZONE_CAPACITY);
const zoneSumY = new Float64Array(ZONE_CAPACITY);

/**
 * Luces de un frame: el buffer plano que leen los filtros y cuántas hay. Se crea una vez y se llena en cada frame.
 * @returns {{data: Float32Array, count: number}}
 */
export function createLightSet() {
    return { data: new Float32Array(MAX_LIGHTS * LIGHT_STRIDE), count: 0 };
}

/**
 * Tabla de fuentes de luz indexada por el id del material (`kind`) de las partículas.
 * @param {Record<string, number>} kindByName id de cada material de `LIGHTING.sources`, por nombre
 * @returns {object[]} la fuente de cada id; `undefined` donde el material no ilumina
 */
export function buildKindSources(kindByName) {
    const sourceOfKind = [];
    for (const [name, source] of Object.entries(LIGHTING.sources)) {
        if (kindByName[name] !== undefined) sourceOfKind[kindByName[name]] = source;
    }
    return sourceOfKind;
}

/**
 * Color RGB de 0 a 1 a partir de uno de 0 a 255, para la luz de un jugador.
 * @param {number[]} bytes RGB de 0 a 255
 * @returns {number[]}
 */
export function unitRgbOfBytes(bytes) {
    return bytes.map((channel) => channel / CHANNEL_MAX);
}

/**
 * Busca la zona (columna, fila, material) o la abre si hay lugar.
 * @param {number} zonesUsed zonas abiertas hasta ahora
 * @returns {number} índice de la zona, o -1 si no hay lugar
 */
function zoneFor(column, row, kind, zonesUsed) {
    for (let zone = 0; zone < zonesUsed; zone++) {
        if (zoneColumn[zone] === column && zoneRow[zone] === row && zoneKind[zone] === kind) return zone;
    }
    if (zonesUsed === ZONE_CAPACITY) return -1;
    zoneColumn[zonesUsed] = column;
    zoneRow[zonesUsed] = row;
    zoneKind[zonesUsed] = kind;
    zoneCount[zonesUsed] = 0;
    zoneSumX[zonesUsed] = 0;
    zoneSumY[zonesUsed] = 0;
    return zonesUsed;
}

/**
 * Inserta una luz en `output` manteniéndolas ordenadas de la más fuerte a la más débil, con tope `MAX_LIGHTS`.
 * @param {{data: Float32Array, count: number}} output
 */
function insertLight(output, { x, y, source, intensity }) {
    const { data } = output;
    const weakest = (MAX_LIGHTS - 1) * LIGHT_STRIDE + INTENSITY_SLOT;
    if (output.count === MAX_LIGHTS && intensity <= data[weakest]) return;
    if (output.count < MAX_LIGHTS) output.count++;
    let slot = output.count - 1;
    while (slot > 0 && data[(slot - 1) * LIGHT_STRIDE + INTENSITY_SLOT] < intensity) {
        data.copyWithin(slot * LIGHT_STRIDE, (slot - 1) * LIGHT_STRIDE, slot * LIGHT_STRIDE);
        slot--;
    }
    const base = slot * LIGHT_STRIDE;
    data[base + X_SLOT] = x;
    data[base + Y_SLOT] = y;
    data[base + RANGE_SLOT] = source.range;
    data[base + INTENSITY_SLOT] = intensity;
    for (let channel = 0; channel < RGB_COMPONENTS; channel++) data[base + COLOR_SLOT + channel] = source.color[channel];
    data[base + SOURCE_RADIUS_SLOT] = source.sourceRadius ?? 0;
}

const candidate = { x: 0, y: 0, source: null, intensity: 0 };

const robotSource = { color: [0, 0, 0], range: 0, sourceRadius: 0 };

/**
 * Suma la luz de un robot (`LIGHTING.sources.robot`, la única con sombras) a `output`, que ya tiene las de lava y ácido.
 * Entra en el orden por intensidad y, con el tope lleno, desplaza a la más débil. No crea objetos.
 * @param {{data: Float32Array, count: number}} output luces de `createLightSet`
 * @param {number} x posición de la luz, en m (la cabeza del robot)
 * @param {number} y posición de la luz, en m
 * @param {number[]} color RGB de 0 a 1 del jugador
 */
export function addRobotLight(output, x, y, color) {
    const { robot } = LIGHTING.sources;
    for (let channel = 0; channel < RGB_COMPONENTS; channel++) robotSource.color[channel] = color[channel];
    robotSource.range = robot.range;
    robotSource.sourceRadius = robot.sourceRadius;
    candidate.x = x;
    candidate.y = y;
    candidate.source = robotSource;
    candidate.intensity = robot.intensity;
    insertLight(output, candidate);
}

/**
 * Junta las partículas que iluminan en luces por zona (`LIGHTING.zoneSize`): por zona y material, la cantidad y el
 * centroide. Una zona con menos de `LIGHTING.minParticles` no es luz, la intensidad crece con la cantidad hasta
 * `LIGHTING.fullIntensityParticles`, se descartan las partículas a más de un alcance de la vista y se queda con las
 * `MAX_LIGHTS` más fuertes. Es puro, no crea objetos y reutiliza los arreglos de módulo y `output`.
 * @param {object} options
 * @param {ArrayLike<number>} options.positions posiciones intercaladas (x, y) en m
 * @param {number} options.firstValue índice en `positions` del x de la primera partícula
 * @param {number} options.count partículas
 * @param {(index: number) => number} options.materialAt id del material de la partícula (`ParticleStore.kind`, nunca el color)
 * @param {object[]} options.sourceOfKind tabla de `buildKindSources`
 * @param {{minX: number, maxX: number, minY: number, maxY: number}} options.view vista visible, en m
 * @param {{data: Float32Array, count: number}} options.output luces de `createLightSet`, que se sobrescriben
 * @returns {{data: Float32Array, count: number}} el mismo `output`
 */
export function gatherLights({ positions, firstValue, count, materialAt, sourceOfKind, view, output }) {
    const { zoneSize, minParticles, fullIntensityParticles } = LIGHTING;
    let zonesUsed = 0;
    for (let index = 0; index < count; index++) {
        const source = sourceOfKind[materialAt(index)];
        if (source === undefined) continue;
        const x = positions[firstValue + index * POSITION_COMPONENTS];
        const y = positions[firstValue + index * POSITION_COMPONENTS + 1];
        const { range } = source;
        if (x < view.minX - range || x > view.maxX + range || y < view.minY - range || y > view.maxY + range) continue;
        const zone = zoneFor(Math.floor(x / zoneSize), Math.floor(y / zoneSize), materialAt(index), zonesUsed);
        if (zone < 0) continue;
        if (zone === zonesUsed) zonesUsed++;
        zoneCount[zone]++;
        zoneSumX[zone] += x;
        zoneSumY[zone] += y;
    }
    output.count = 0;
    for (let zone = 0; zone < zonesUsed; zone++) {
        if (zoneCount[zone] < minParticles) continue;
        const source = sourceOfKind[zoneKind[zone]];
        candidate.x = zoneSumX[zone] / zoneCount[zone];
        candidate.y = zoneSumY[zone] / zoneCount[zone];
        candidate.source = source;
        candidate.intensity = source.intensity * Math.min(1, zoneCount[zone] / fullIntensityParticles);
        insertLight(output, candidate);
    }
    return output;
}

/**
 * Definiciones de uniforms de las luces puntuales para un `UniformGroup` de PIXI v8: el arreglo de `vec4` y la cantidad.
 * @returns {object}
 */
export function createPointLightUniforms() {
    return {
        uLights: { value: new Float32Array(MAX_LIGHTS * LIGHT_STRIDE), type: "vec4<f32>", size: MAX_LIGHTS * VEC4_PER_LIGHT },
        uLightCount: { value: 0, type: "f32" },
    };
}

/**
 * Dirección 3D unitaria hacia una luz de `LIGHTING`, con la X multiplicada por `mirrorX`.
 * @param {number} mirrorX 1 para la dirección de la clave, -1 para la del relleno
 * @returns {Float32Array}
 */
function lightDirection(mirrorX) {
    const { direction, front } = LIGHTING.base;
    const length = Math.hypot(direction[0], direction[1], front);
    return new Float32Array([(mirrorX * direction[0]) / length, direction[1] / length, front / length]);
}

/**
 * Definiciones de uniforms de la luz base: dirección 3D unitaria y color por intensidad de la clave y del relleno, y el
 * ambiente, con los valores de `LIGHTING.base` y `LIGHTING.fill`.
 * @returns {object}
 */
export function createBaseLightUniforms() {
    const { color, intensity, ambient } = LIGHTING.base;
    const fill = LIGHTING.fill;
    return {
        uBaseDirection: { value: lightDirection(1), type: "vec3<f32>" },
        uBaseColor: { value: new Float32Array(color.map((channel) => channel * intensity)), type: "vec3<f32>" },
        uFillDirection: { value: lightDirection(-1), type: "vec3<f32>" },
        uFillColor: { value: new Float32Array(fill.color.map((channel) => channel * fill.intensity)), type: "vec3<f32>" },
        uAmbient: { value: ambient, type: "f32" },
    };
}

/**
 * Función de GLSL de la luz base para los filtros con normales: declara los uniforms de `createBaseLightUniforms` y define
 * `baseLight`, el ambiente más la clave y el relleno pesados por el coseno con la normal.
 */
export const BASE_LIGHT_FUNCTIONS = `
uniform highp vec3 uBaseDirection;
uniform highp vec3 uBaseColor;
uniform highp vec3 uFillDirection;
uniform highp vec3 uFillColor;
uniform highp float uAmbient;

vec3 baseLight(vec3 normal)
{
    vec3 key = uBaseColor * max(0.0, dot(normal, uBaseDirection));
    vec3 fill = uFillColor * max(0.0, dot(normal, uFillDirection));
    return vec3(uAmbient) + key + fill;
}
`;

/**
 * Copia las luces del frame en los uniforms de un filtro, sin crear objetos.
 * @param {object} uniforms `filter.resources[grupo].uniforms`
 * @param {{data: Float32Array, count: number}} lightSet luces de `createLightSet`
 */
export function applyLights(uniforms, lightSet) {
    uniforms.uLights.set(lightSet.data);
    uniforms.uLightCount = lightSet.count;
}

/**
 * Funciones de GLSL de las luces puntuales, para incluir en el fragment de cada filtro de luz. Declara `uLights` y
 * `uLightCount` (con precisión alta, como pide WebGL cuando el vertex también las ve) y define `lightFalloff` (caída
 * `intensidad · (1 − d / alcance)²`). La suma de las luces en cada píxel la hace el mapa de luz (`LIGHT_MAP_FUNCTIONS`).
 */
export const LIGHT_FUNCTIONS = `
const int MAX_LIGHTS = ${MAX_LIGHTS};
const float LIGHT_HEIGHT = ${LIGHTING.height.toFixed(4)};
uniform highp vec4 uLights[${MAX_LIGHTS * VEC4_PER_LIGHT}];
uniform highp float uLightCount;

float lightFalloff(float reach, float range, float intensity)
{
    float remaining = 1.0 - clamp(reach / range, 0.0, 1.0);
    return intensity * remaining * remaining;
}

`;

/** Rango de la luz que guarda el mapa de luz, en intensidad: el mapa es de 8 bits, así que guarda `luz / rango` y se lee `· rango`. */
export const LIGHT_MAP_RANGE = 3;

/**
 * Funciones de GLSL para leer el mapa de luz (`lightMap.js`), que reemplaza la suma de luces puntuales en los filtros del
 * fondo, las plataformas, los robots y el agua: declara `uLightMap` y `uScreenSize` (px de pantalla del mapa), y define
 * `mappedLight`, el color de la luz en un punto de pantalla, y `lightRelief`, cuánto el relieve (la normal) recibe de la luz
 * más fuerte, de `RELIEF_FLOOR` (de espaldas) a 1 (de frente). `shiftY` pasa la luz al marco del punto, en m. Va después de
 * `LIGHT_FUNCTIONS`.
 */
export const LIGHT_MAP_FUNCTIONS = `
uniform sampler2D uLightMap;
uniform highp vec2 uScreenSize;

const float LIGHT_MAP_RANGE = ${LIGHT_MAP_RANGE.toFixed(1)};
const float RELIEF_FLOOR = 0.55;
const float RELIEF_GAIN = 0.45;

vec3 mappedLight(vec2 screen)
{
    return texture(uLightMap, screen / uScreenSize).rgb * LIGHT_MAP_RANGE;
}

float lightRelief(vec3 point, vec3 normal, float shiftY)
{
    if (uLightCount < 0.5) return 1.0;
    vec3 toStrongest = vec3(uLights[0].xy - vec2(0.0, shiftY), LIGHT_HEIGHT) - point;
    return RELIEF_FLOOR + RELIEF_GAIN * max(0.0, dot(normal, normalize(toStrongest)));
}
`;

/**
 * Función de GLSL del brillo especular de las luces puntuales, para superficies de agua que reflejan la luz: `lightSpecular`
 * suma, por luz, su caída por `pow(normal · mitad, shininess)`, con `mitad` entre la dirección a la luz y la de la vista
 * (hacia el jugador). Va después de `LIGHT_FUNCTIONS`, de donde usa `lightFalloff`, `uLights` y `uLightCount`.
 */
export const LIGHT_SPECULAR_FUNCTIONS = `
const vec3 SPECULAR_VIEW_DIRECTION = vec3(0.0, 0.0, 1.0);

vec3 lightSpecular(vec3 point, vec3 normal, float shininess)
{
    vec3 total = vec3(0.0);
    for (int index = 0; index < MAX_LIGHTS; index++) {
        if (float(index) >= uLightCount) break;
        vec4 placement = uLights[index * ${VEC4_PER_LIGHT}];
        vec4 tint = uLights[index * ${VEC4_PER_LIGHT} + 1];
        vec3 toLight = vec3(placement.xy, LIGHT_HEIGHT) - point;
        float lightDistance = length(toLight);
        vec3 halfway = normalize(toLight / lightDistance + SPECULAR_VIEW_DIRECTION);
        total += tint.rgb * lightFalloff(lightDistance, placement.z, placement.w) * pow(max(0.0, dot(normal, halfway)), shininess);
    }
    return total;
}
`;
