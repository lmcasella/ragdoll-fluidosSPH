import { SURFACES } from "../level/surfaces.js";
import { BASE_LIGHT_FUNCTIONS, LIGHT_FUNCTIONS, LIGHT_MAP_FUNCTIONS, applyLights, createBaseLightUniforms, createPointLightUniforms } from "./lighting.js";
import { createLightMapUniforms, lightMapSource } from "./lightMap.js";
import { BEVEL_FUNCTIONS } from "./bevelFunctions.js";
import { NOISE_FUNCTIONS } from "./glslNoise.js";
import { FILTER_VERTEX } from "./thresholdFilter.js";
import { RENDER_QUALITY } from "./renderQuality.js";

/**
 * Filtro de materiales de las plataformas (`docs/design/13-arte.md` §13.2): `LevelView` pinta los sólidos con un color
 * codificado y este `PIXI.Filter` lo cambia, en una sola pasada para todo el escenario, por el aspecto del material. El
 * código usa el rojo para el material (`id / SURFACE_ID_SCALE`) y el verde para el desgaste (0 a 1; en las rompibles, la
 * grieta) y la cobertura (alfa) para la forma. La textura sale de la posición del fragmento en el mundo (con ruido de valor,
 * sin texturas externas), así queda pegada a la plataforma. Los colores y las escalas salen de `SURFACES`. Con la misma
 * posición arma una altura por material (juntas, remaches, grano y el bisel del borde), saca la normal de su gradiente
 * y la ilumina con la luz base y el mapa de luz (`lightMapPass.js`, `docs/design/13-arte.md` §13.3), este modulado por el
 * relieve. El borde no tiene trazo: lo
 * da el bisel con la luz y una oclusión que oscurece el material junto al borde. Los cantos expuestos se comen hasta unos
 * centímetros con un ruido de baja frecuencia (más en las esquinas), solo en lo que se ve.
 *
 * La madera de las cajas (`docs/design/13-arte.md` §13.2) es la excepción al "pegado al mundo": su dibujo sale del marco
 * local de la caja. Cada caja y cada pedazo lleva su propio filtro (patrón Object Pool en `crateView.js`) con el centro, el
 * giro y el desplazamiento del cuerpo como uniforms (`updateSurfaceFilterFrame`); el shader pasa la posición del mundo a ese
 * marco y solo la madera la usa. La luz se sigue leyendo en coordenadas del mundo. Un filtro sin marco (el de las plataformas)
 * deja los uniforms en la identidad.
 */

/** Divisor del id del material al guardarlo en el canal rojo: con ids de 1 a 5 deja los valores bien separados y dentro del canal. */
export const SURFACE_ID_SCALE = 8;

/** Valor máximo de un canal de color de 8 bits. */
const CHANNEL_MAX = 255;

/** Bits que se desplazan el canal rojo y el verde dentro de un color de 24 bits. */
const RED_SHIFT = 16;
const GREEN_SHIFT = 8;

/** Decimales con que se escriben los números en el GLSL. */
const GLSL_DECIMALS = 4;

const SHADER_NAME = "surface-filter";

/** Nombre del grupo de uniforms del filtro. */
const UNIFORM_GROUP = "surfaceUniforms";

/** Componentes de un vector 2D de uniforms (origen de pantalla, centro, giro y desplazamiento del marco). */
const ORIGIN_COMPONENTS = 2;

/** Giro (coseno, seno) del marco sin girar. */
const IDENTITY_ROTATION = [1, 0];

/** Escala inicial del filtro, en px por metro, hasta el primer `updateSurfaceFilter`. */
const INITIAL_PIXELS_PER_METER = 1;

/**
 * Color de 24 bits con que `LevelView` pinta un sólido para que el filtro lo reconozca.
 * @param {object} code
 * @param {keyof typeof SURFACES} code.surface material
 * @param {number} code.wear desgaste, de 0 a 1 (en las rompibles, la grieta)
 * @returns {number}
 */
export function encodeSurface({ surface, wear }) {
    const red = Math.round((SURFACES[surface].id / SURFACE_ID_SCALE) * CHANNEL_MAX);
    const green = Math.round(wear * CHANNEL_MAX);
    return (red << RED_SHIFT) | (green << GREEN_SHIFT);
}

/**
 * Número de GLSL con punto decimal.
 * @param {number} value
 * @returns {string}
 */
export function glslFloat(value) {
    return value.toFixed(GLSL_DECIMALS);
}

/**
 * Color RGB de GLSL.
 * @param {number[]} color
 * @returns {string}
 */
export function glslColor(color) {
    return `vec3(${color.map(glslFloat).join(", ")})`;
}

/**
 * Constantes de GLSL de cada material, con el nombre del material en mayúsculas como prefijo.
 * @returns {string}
 */
function surfaceConstants() {
    return Object.entries(SURFACES)
        .map(([name, surface]) => {
            const prefix = name.toUpperCase();
            return `
const int ${prefix}_ID = ${surface.id};
const vec3 ${prefix}_BASE = ${glslColor(surface.baseColor)};
const vec3 ${prefix}_WEAR = ${glslColor(surface.wearColor)};
const vec3 ${prefix}_WEAR_DARK = ${glslColor(surface.wearDarkColor)};
const float ${prefix}_PATTERN = ${glslFloat(surface.patternSize)};
const float ${prefix}_ALPHA = ${glslFloat(surface.alpha)};`;
        })
        .join("\n");
}

/**
 * Fragmento del filtro, GLSL ES 3.00. Las constantes de aspecto de cada material salen de `SURFACES`; las de dibujo
 * (juntas, remaches, granos, reflejo) están acá, en metros.
 */
export const SURFACE_FRAGMENT = `
precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform highp vec4 uInputSize;
uniform highp vec4 uOutputFrame;
uniform highp vec2 uOrigin;
uniform highp float uPixelsPerMeter;
uniform highp float uLightShiftY;
uniform highp vec2 uFrameCenter;
uniform highp vec2 uFrameRotation;
uniform highp vec2 uFrameOffset;
${BASE_LIGHT_FUNCTIONS}
${LIGHT_FUNCTIONS}
${LIGHT_MAP_FUNCTIONS}
${BEVEL_FUNCTIONS}

const float ID_SCALE = ${glslFloat(SURFACE_ID_SCALE)};
${surfaceConstants()}

${NOISE_FUNCTIONS}
const int NOISE_OCTAVES = 4;
const float OCTAVE_FREQUENCY_GAIN = 2.0;
const float OCTAVE_AMPLITUDE_GAIN = 0.5;
const float FIRST_OCTAVE_AMPLITUDE = 0.5;

const float JOINT_WIDTH = 0.02;
const float JOINT_DARKEN = 0.45;
const float RIVET_INSET = 0.07;
const float RIVET_RADIUS = 0.025;
const float RIVET_SOFTNESS = 0.01;
const float RIVET_LIGHTEN = 1.35;
const vec2 STREAK_FREQUENCY = vec2(3.0, 90.0);
const float STREAK_STRENGTH = 0.18;

const float GRAIN_MIN = 0.78;
const float GRAIN_RANGE = 0.44;
const float STAIN_FREQUENCY = 0.7;
const float STAIN_DARKEN = 0.3;

const float WEAR_FREQUENCY = 5.0;
const float WEAR_COVERAGE = 1.4;
const float WEAR_CONTRAST = 1.6;

const float REFLECTION_CENTER = 0.5;
const float REFLECTION_WIDTH = 0.07;
const float REFLECTION_STRENGTH = 0.6;
const float REFLECTION_ALPHA = 0.25;

const float JOINT_DEPTH = 0.03;
const float RIVET_HEIGHT = 0.02;
const float CONCRETE_GRAIN_HEIGHT = 0.02;
const float PLATE_RUST_FREQUENCY = 3.0;
const float PLATE_RUST_THRESHOLD = 0.5;
const float PLATE_RUST_SOFTNESS = 0.04;
const float PLATE_RIB_WIDTH = 0.02;
const float PLATE_RIB_HEIGHT = 0.015;
const float PLATE_RIB_CENTER = 0.5;
const float CRACK_CELL = 0.4;
const float CRACK_WIDTH = 0.012;
const float CRACK_MIN_WIDTH_SHARE = 0.4;
const float CRACK_REVEAL_FREQUENCY = 3.0;
const float CRACK_REVEAL_SOFTNESS = 0.15;
const float CRACK_REVEAL_SPREAD = 0.85;
const float CRACK_DARKEN = 0.9;
const vec2 CRACK_DECORRELATION = vec2(31.7, 11.3);
const int CRACK_NEIGHBORS = 1;
const float CRACK_FAR = 8.0;
const float BEVEL_MIN_WIDTH = 0.08;
const float BEVEL_MIN_SCREEN_PX = 3.0;
const float BEVEL_SLOPE = 0.5;
const float OCCLUSION_REACH = 0.06;
const float OCCLUSION_DARKEN = 0.35;
const float ERODE_FREQUENCY = 8.0;
const float ERODE_REACH = 0.04;
const float ERODE_CORNER_REACH = 0.08;
const float COVERED = 0.999;
const float NEAR_TAP_SHARE = 0.5;
const float OCCLUSION_TAPS = 2.0;
const float HALF = 0.5;
const float INVERSE_SQRT_2 = 0.7071;
const float WOOD_BOARDS = 4.0;
const float WOOD_SEAM_WIDTH = 0.01;
const float WOOD_SEAM_DARKEN = 0.55;
const vec2 WOOD_GRAIN_FREQUENCY = vec2(3.0, 55.0);
const float WOOD_GRAIN_STRENGTH = 0.4;
const float WOOD_BOARD_SHIFT = 7.3;
const float WOOD_BOARD_TINT_RANGE = 0.14;
const float WOOD_FRAME_WIDTH = 0.07;
const float WOOD_DIAGONAL_HALF_WIDTH = 0.04;
const float WOOD_BATTEN_SOFTNESS = 0.008;
const float WOOD_BATTEN_DARKEN = 0.62;
const float WOOD_BATTEN_NOISE_FREQUENCY = 20.0;
const float WOOD_BATTEN_NOISE_STRENGTH = 0.25;
const float SPECULAR_SHININESS = 24.0;
const float SPECULAR_STRENGTH = 0.6;
const float SPECULAR_WEAR_LIMIT = 0.1;
const vec3 VIEW_DIRECTION = vec3(0.0, 0.0, 1.0);

float fractalNoise(vec2 point)
{
    float sum = 0.0;
    float amplitude = FIRST_OCTAVE_AMPLITUDE;
    for (int octave = 0; octave < NOISE_OCTAVES; octave++) {
        sum += amplitude * valueNoise(point);
        point *= OCTAVE_FREQUENCY_GAIN;
        amplitude *= OCTAVE_AMPLITUDE_GAIN;
    }
    return sum;
}

vec3 withWear(vec3 color, vec2 world, float wear, vec3 wearColor, vec3 wearDarkColor)
{
    if (wear <= 0.0) return color;
    float blotch = fractalNoise(world * WEAR_FREQUENCY);
    float amount = clamp(wear * WEAR_COVERAGE + (blotch - 0.5) * WEAR_CONTRAST, 0.0, 1.0);
    return mix(color, mix(wearColor, wearDarkColor, wear), amount);
}

vec2 panelEdgeOffset(vec2 world)
{
    vec2 local = fract(world / STEEL_PATTERN);
    return min(local, 1.0 - local) * STEEL_PATTERN;
}

vec3 steelColor(vec2 world, float wear)
{
    vec2 toEdge = panelEdgeOffset(world);
    float joint = 1.0 - smoothstep(0.0, JOINT_WIDTH, min(toEdge.x, toEdge.y));
    float rivet = 1.0 - smoothstep(RIVET_RADIUS - RIVET_SOFTNESS, RIVET_RADIUS, length(toEdge - vec2(RIVET_INSET)));
    float streak = valueNoise(world * STREAK_FREQUENCY);
    vec3 color = STEEL_BASE * (1.0 + (streak - 0.5) * STREAK_STRENGTH);
    color *= 1.0 - joint * JOINT_DARKEN;
    color = mix(color, STEEL_BASE * RIVET_LIGHTEN, rivet);
    return withWear(color, world, wear, STEEL_WEAR, STEEL_WEAR_DARK);
}

vec2 frameOf(vec2 world)
{
    vec2 relative = world - uFrameCenter;
    return vec2(
        relative.x * uFrameRotation.x + relative.y * uFrameRotation.y,
        relative.y * uFrameRotation.x - relative.x * uFrameRotation.y
    ) + uFrameOffset;
}

vec3 woodColor(vec2 local, float wear)
{
    float halfSide = WOOD_PATTERN * HALF;
    float boardHeight = WOOD_PATTERN / WOOD_BOARDS;
    float boardPosition = (local.y + halfSide) / boardHeight;
    float board = floor(boardPosition);
    float toSeam = min(fract(boardPosition), 1.0 - fract(boardPosition)) * boardHeight;
    float seam = 1.0 - smoothstep(0.0, WOOD_SEAM_WIDTH, toSeam);
    float grain = valueNoise((local + vec2(board * WOOD_BOARD_SHIFT, 0.0)) * WOOD_GRAIN_FREQUENCY);
    float boardTint = hash(vec2(board, 0.0)) - HALF;
    vec3 color = WOOD_BASE * (1.0 + boardTint * WOOD_BOARD_TINT_RANGE + (grain - HALF) * WOOD_GRAIN_STRENGTH);
    color *= 1.0 - seam * WOOD_SEAM_DARKEN;
    float toBorder = halfSide - max(abs(local.x), abs(local.y));
    float frame = 1.0 - smoothstep(WOOD_FRAME_WIDTH - WOOD_BATTEN_SOFTNESS, WOOD_FRAME_WIDTH, toBorder);
    float toDiagonal = abs(local.x - local.y) * INVERSE_SQRT_2;
    float diagonal = 1.0 - smoothstep(WOOD_DIAGONAL_HALF_WIDTH - WOOD_BATTEN_SOFTNESS, WOOD_DIAGONAL_HALF_WIDTH, toDiagonal);
    float battenNoise = valueNoise(local * WOOD_BATTEN_NOISE_FREQUENCY);
    vec3 batten = WOOD_BASE * WOOD_BATTEN_DARKEN * (1.0 + (battenNoise - HALF) * WOOD_BATTEN_NOISE_STRENGTH);
    color = mix(color, batten, max(frame, diagonal));
    return withWear(color, local, wear, WOOD_WEAR, WOOD_WEAR_DARK);
}

vec3 concreteColor(vec2 world, float wear)
{
    float grain = fractalNoise(world / CONCRETE_PATTERN);
    float stains = fractalNoise(world * STAIN_FREQUENCY);
    vec3 color = CONCRETE_BASE * (GRAIN_MIN + grain * GRAIN_RANGE);
    color *= 1.0 - stains * STAIN_DARKEN;
    return withWear(color, world, wear, CONCRETE_WEAR, CONCRETE_WEAR_DARK);
}

float crackLines(vec2 world, float crack)
{
    vec2 point = world / CRACK_CELL;
    vec2 cell = floor(point);
    vec2 local = fract(point);
    float nearest = CRACK_FAR;
    float second = CRACK_FAR;
    for (int offsetY = -CRACK_NEIGHBORS; offsetY <= CRACK_NEIGHBORS; offsetY++) {
        for (int offsetX = -CRACK_NEIGHBORS; offsetX <= CRACK_NEIGHBORS; offsetX++) {
            vec2 neighbor = vec2(float(offsetX), float(offsetY));
            vec2 feature = neighbor + vec2(hash(cell + neighbor), hash(cell + neighbor + CRACK_DECORRELATION));
            float toFeature = length(feature - local);
            if (toFeature < nearest) {
                second = nearest;
                nearest = toFeature;
            } else if (toFeature < second) {
                second = toFeature;
            }
        }
    }
    float width = CRACK_WIDTH / CRACK_CELL * (CRACK_MIN_WIDTH_SHARE + crack);
    float line = 1.0 - smoothstep(0.0, width, second - nearest);
    float reveal = smoothstep(0.0, CRACK_REVEAL_SOFTNESS, crack - valueNoise(world * CRACK_REVEAL_FREQUENCY) * CRACK_REVEAL_SPREAD);
    return line * reveal;
}

vec3 plateColor(vec2 world, float crack)
{
    float rustNoise = fractalNoise(world * PLATE_RUST_FREQUENCY);
    float rust = smoothstep(PLATE_RUST_THRESHOLD - PLATE_RUST_SOFTNESS, PLATE_RUST_THRESHOLD + PLATE_RUST_SOFTNESS, rustNoise);
    float streak = valueNoise(world * STREAK_FREQUENCY);
    vec3 metal = PLATE_BASE * (1.0 + (streak - 0.5) * STREAK_STRENGTH);
    vec3 color = mix(metal, mix(PLATE_WEAR, PLATE_WEAR_DARK, rustNoise), rust);
    return mix(color, vec3(0.0), crackLines(world, crack) * CRACK_DARKEN);
}
vec4 glassColor(vec2 world)
{
    float phase = fract((world.x + world.y) / GLASS_PATTERN);
    float reflection = 1.0 - smoothstep(0.0, REFLECTION_WIDTH, abs(phase - REFLECTION_CENTER));
    vec3 color = mix(GLASS_BASE, vec3(1.0), reflection * REFLECTION_STRENGTH);
    return vec4(color, GLASS_ALPHA + reflection * REFLECTION_ALPHA);
}

float steelHeight(vec2 world)
{
    vec2 toEdge = panelEdgeOffset(world);
    float joint = 1.0 - smoothstep(0.0, JOINT_WIDTH, min(toEdge.x, toEdge.y));
    float toRivet = length(toEdge - vec2(RIVET_INSET)) / RIVET_RADIUS;
    float dome = sqrt(max(0.0, 1.0 - toRivet * toRivet));
    return -JOINT_DEPTH * joint + RIVET_HEIGHT * dome;
}

float plateHeight(vec2 world)
{
    float toRib = abs(fract(world.x / PLATE_PATTERN) - PLATE_RIB_CENTER) * PLATE_PATTERN;
    return PLATE_RIB_HEIGHT * (1.0 - smoothstep(0.0, PLATE_RIB_WIDTH, toRib));
}

float surfaceHeight(int id, vec2 world)
{
    if (id == STEEL_ID) return steelHeight(world);
    if (id == CONCRETE_ID) return CONCRETE_GRAIN_HEIGHT * fractalNoise(world / CONCRETE_PATTERN);
    if (id == PLATE_ID) return plateHeight(world);
    return 0.0;
}

vec2 bevelSlope(vec2 textureCoord)
{
    float width = max(BEVEL_MIN_WIDTH, BEVEL_MIN_SCREEN_PX / uPixelsPerMeter);
    return coverageSlope(textureCoord, width, width * BEVEL_SLOPE);
}

float occlusionToward(vec2 textureCoord, vec2 direction)
{
    vec2 tap = direction * OCCLUSION_REACH * uPixelsPerMeter / uInputSize.xy;
    float covered = coverageAt(textureCoord + tap * NEAR_TAP_SHARE) + coverageAt(textureCoord + tap);
    return 1.0 - covered / OCCLUSION_TAPS;
}

float edgeOcclusion(vec2 textureCoord)
{
    float toSides = occlusionToward(textureCoord, vec2(1.0, 0.0)) + occlusionToward(textureCoord, vec2(-1.0, 0.0));
    return clamp(toSides + occlusionToward(textureCoord, vec2(0.0, 1.0)), 0.0, 1.0);
}

float edgeErosion(vec2 textureCoord, vec2 world)
{
    float roughness = valueNoise(world * ERODE_FREQUENCY);
    vec2 cornerTap = ERODE_CORNER_REACH * roughness * uPixelsPerMeter / uInputSize.xy;
    float right = coverageAt(textureCoord + vec2(cornerTap.x, 0.0));
    float left = coverageAt(textureCoord - vec2(cornerTap.x, 0.0));
    float up = coverageAt(textureCoord - vec2(0.0, cornerTap.y));
    float down = coverageAt(textureCoord + vec2(0.0, cornerTap.y));
    if (min(min(right, left), min(up, down)) >= COVERED) return 0.0;
    float cornerBite = max(1.0 - right, 1.0 - left) * max(1.0 - up, 1.0 - down);
    vec2 tap = ERODE_REACH * roughness * uPixelsPerMeter / uInputSize.xy;
    float sideRight = coverageAt(textureCoord + vec2(tap.x, 0.0));
    float sideLeft = coverageAt(textureCoord - vec2(tap.x, 0.0));
    float sideUp = coverageAt(textureCoord - vec2(0.0, tap.y));
    float sideDown = coverageAt(textureCoord + vec2(0.0, tap.y));
    float sideBite = 1.0 - min(min(sideRight, sideLeft), min(sideUp, sideDown));
    return max(sideBite, cornerBite);
}
vec3 surfaceNormal(int id, vec2 world, vec2 bevel)
{
    float probe = 1.0 / uPixelsPerMeter;
    float slopeX = (surfaceHeight(id, world + vec2(probe, 0.0)) - surfaceHeight(id, world - vec2(probe, 0.0))) / (2.0 * probe);
    float slopeY = (surfaceHeight(id, world + vec2(0.0, probe)) - surfaceHeight(id, world - vec2(0.0, probe))) / (2.0 * probe);
    return normalize(vec3(-(slopeX + bevel.x), -(slopeY + bevel.y), 1.0));
}

vec3 litColor(vec3 albedo, vec3 normal, vec3 point, vec2 screen, float specularAmount)
{
    float facing = max(0.0, dot(normal, uBaseDirection));
    vec3 light = baseLight(normal) + mappedLight(screen) * lightRelief(point, normal, uLightShiftY);
    vec3 halfway = normalize(uBaseDirection + VIEW_DIRECTION);
    float specular = specularAmount * SPECULAR_STRENGTH * pow(max(0.0, dot(normal, halfway)), SPECULAR_SHININESS) * facing;
    return albedo * light + uBaseColor * specular;
}

void main(void)
{
    vec4 encoded = texture(uTexture, vTextureCoord);
    if (encoded.a <= 0.0) {
        finalColor = vec4(0.0);
        return;
    }
    vec3 code = encoded.rgb / encoded.a;
    int id = int(floor(code.r * ID_SCALE + 0.5));
    vec2 screen = vTextureCoord * uInputSize.xy + uOutputFrame.xy;
    vec2 world = vec2(screen.x - uOrigin.x, uOrigin.y - screen.y) / uPixelsPerMeter;
    vec4 surface;
    if (id == STEEL_ID) {
        surface = vec4(steelColor(world, code.g), STEEL_ALPHA);
    } else if (id == CONCRETE_ID) {
        surface = vec4(concreteColor(world, code.g), CONCRETE_ALPHA);
    } else if (id == PLATE_ID) {
        surface = vec4(plateColor(world, code.g), PLATE_ALPHA);
    } else if (id == WOOD_ID) {
        surface = vec4(woodColor(frameOf(world), code.g), WOOD_ALPHA);
    } else {
        surface = glassColor(world);
    }
    float specularAmount = id == STEEL_ID ? 1.0 - smoothstep(0.0, SPECULAR_WEAR_LIMIT, code.g) : 0.0;
    vec3 normal = surfaceNormal(id, world, bevelSlope(vTextureCoord));
    vec3 lit = litColor(surface.rgb, normal, vec3(world, 0.0), screen, specularAmount);
    vec3 color = lit * (1.0 - edgeOcclusion(vTextureCoord) * OCCLUSION_DARKEN);
    float alpha = surface.a * encoded.a * (1.0 - edgeErosion(vTextureCoord, world));
    finalColor = vec4(color * alpha, alpha);
}
`;

/**
 * Crea el filtro de materiales (un solo shader GLSL, sin texturas). Se crea una vez y sirve para toda la capa de sólidos
 * fijos; los uniforms de cámara se ponen con `updateSurfaceFilter`.
 * @returns {PIXI.Filter}
 */
export function createSurfaceFilter() {
    return new PIXI.Filter({
        glProgram: PIXI.GlProgram.from({ vertex: FILTER_VERTEX, fragment: SURFACE_FRAGMENT, name: SHADER_NAME }),
        resolution: RENDER_QUALITY.filterResolution,
        antialias: RENDER_QUALITY.filterAntialias,
        resources: {
            uLightMap: lightMapSource(),
            [UNIFORM_GROUP]: {
                uOrigin: { value: new Float32Array(ORIGIN_COMPONENTS), type: "vec2<f32>" },
                uPixelsPerMeter: { value: INITIAL_PIXELS_PER_METER, type: "f32" },
                uLightShiftY: { value: 0, type: "f32" },
                uFrameCenter: { value: new Float32Array(ORIGIN_COMPONENTS), type: "vec2<f32>" },
                uFrameRotation: { value: new Float32Array(IDENTITY_ROTATION), type: "vec2<f32>" },
                uFrameOffset: { value: new Float32Array(ORIGIN_COMPONENTS), type: "vec2<f32>" },
                ...createBaseLightUniforms(),
                ...createPointLightUniforms(),
                ...createLightMapUniforms(),
            },
        },
    });
}

/**
 * Pone la cámara en el filtro, una vez por frame y sin crear objetos: así la textura queda pegada al mundo.
 * @param {PIXI.Filter} filter el de `createSurfaceFilter`
 * @param {object} camera
 * @param {number} camera.originX px de pantalla del origen del mundo local de los sólidos, en x
 * @param {number} camera.originY px de pantalla del origen del mundo local de los sólidos, en y (hacia abajo)
 * @param {number} camera.pixelsPerMeter px de pantalla por metro
 * @param {number} [camera.lightShiftY] desplazamiento vertical del nivel respecto de las luces, en m
 */
export function updateSurfaceFilter(filter, { originX, originY, pixelsPerMeter, lightShiftY = 0 }) {
    const { uniforms } = filter.resources[UNIFORM_GROUP];
    uniforms.uOrigin[0] = originX;
    uniforms.uOrigin[1] = originY;
    uniforms.uPixelsPerMeter = pixelsPerMeter;
    uniforms.uLightShiftY = lightShiftY;
}

/**
 * Pone el marco local de un cuerpo en el filtro, sin crear objetos: el shader dibuja la madera en ese marco, así el dibujo
 * se mueve y gira con el cuerpo. El punto del mundo `p` pasa al marco como `R(-angle) · (p - centro) + desplazamiento`.
 * @param {PIXI.Filter} filter el de `createSurfaceFilter`
 * @param {object} frame
 * @param {number} frame.centerX posición del cuerpo en el mundo, en m
 * @param {number} frame.centerY posición del cuerpo en el mundo, en m
 * @param {number} frame.angle giro del cuerpo, en rad
 * @param {number} [frame.offsetX] posición del cuerpo dentro de la caja entera, en m (un pedazo muestra su tramo de la caja)
 * @param {number} [frame.offsetY] ídem, en y
 */
export function updateSurfaceFilterFrame(filter, { centerX, centerY, angle, offsetX = 0, offsetY = 0 }) {
    const { uniforms } = filter.resources[UNIFORM_GROUP];
    uniforms.uFrameCenter[0] = centerX;
    uniforms.uFrameCenter[1] = centerY;
    uniforms.uFrameRotation[0] = Math.cos(angle);
    uniforms.uFrameRotation[1] = Math.sin(angle);
    uniforms.uFrameOffset[0] = offsetX;
    uniforms.uFrameOffset[1] = offsetY;
}

/**
 * Pone las luces del frame en el filtro, sin crear objetos.
 * @param {PIXI.Filter} filter el de `createSurfaceFilter`
 * @param {{data: Float32Array, count: number}} lightSet luces de `createLightSet`
 */
export function setSurfaceFilterLights(filter, lightSet) {
    applyLights(filter.resources[UNIFORM_GROUP].uniforms, lightSet);
}
