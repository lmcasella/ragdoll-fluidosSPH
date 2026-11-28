import { SURFACES } from "../level/surfaces.js";
import { LIGHT_FUNCTIONS, applyLights, createBaseLightUniforms, createPointLightUniforms } from "./lighting.js";
import { BEVEL_FUNCTIONS } from "./bevelFunctions.js";
import { NOISE_FUNCTIONS } from "./glslNoise.js";
import { FILTER_VERTEX } from "./thresholdFilter.js";
import { RENDER_QUALITY } from "./renderQuality.js";

/**
 * Filtro de materiales de las plataformas (`docs/design/13-arte.md` §13.2): `LevelView` pinta los sólidos con un color
 * codificado y este `PIXI.Filter` lo cambia, en una sola pasada para todo el escenario, por el aspecto del material. El
 * código usa el rojo para el material (`id / SURFACE_ID_SCALE`), el verde para el desgaste (0 a 1) y el azul para el borde
 * del contorno (1) o el interior (0). La textura sale de la posición del fragmento en el mundo (con ruido de valor, sin
 * texturas externas), así queda pegada a la plataforma. Los colores y las escalas salen de `SURFACES`. Con la misma
 * posición arma una altura por material (juntas, remaches, grano y el bisel del contorno), saca la normal de su gradiente
 * y la ilumina con la luz base y las luces de `lighting.js` (`docs/design/13-arte.md` §13.3).
 */

/** Divisor del id del material al guardarlo en el canal rojo: con ids de 1 a 3 deja los valores bien separados. */
export const SURFACE_ID_SCALE = 4;

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

/** Componentes del origen de pantalla (x, y). */
const ORIGIN_COMPONENTS = 2;

/** Escala inicial del filtro, en px por metro, hasta el primer `updateSurfaceFilter`. */
const INITIAL_PIXELS_PER_METER = 1;

/**
 * Color de 24 bits con que `LevelView` pinta un sólido para que el filtro lo reconozca.
 * @param {object} code
 * @param {keyof typeof SURFACES} code.surface material
 * @param {number} code.wear desgaste, de 0 a 1
 * @param {boolean} code.edge verdadero si es el trazo del contorno
 * @returns {number}
 */
export function encodeSurface({ surface, wear, edge }) {
    const red = Math.round((SURFACES[surface].id / SURFACE_ID_SCALE) * CHANNEL_MAX);
    const green = Math.round(wear * CHANNEL_MAX);
    const blue = edge ? CHANNEL_MAX : 0;
    return (red << RED_SHIFT) | (green << GREEN_SHIFT) | blue;
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
const float ${prefix}_ALPHA = ${glslFloat(surface.alpha)};
const float ${prefix}_EDGE = ${glslFloat(surface.edgeLighten)};`;
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
uniform highp vec3 uBaseDirection;
uniform highp vec3 uBaseColor;
uniform highp float uAmbient;
${LIGHT_FUNCTIONS}
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
const float BEVEL_WIDTH = 0.06;
const float BEVEL_HEIGHT = 0.03;
const float SPECULAR_SHININESS = 24.0;
const float SPECULAR_STRENGTH = 0.35;
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

vec3 concreteColor(vec2 world, float wear)
{
    float grain = fractalNoise(world / CONCRETE_PATTERN);
    float stains = fractalNoise(world * STAIN_FREQUENCY);
    vec3 color = CONCRETE_BASE * (GRAIN_MIN + grain * GRAIN_RANGE);
    color *= 1.0 - stains * STAIN_DARKEN;
    return withWear(color, world, wear, CONCRETE_WEAR, CONCRETE_WEAR_DARK);
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

float surfaceHeight(int id, vec2 world)
{
    if (id == STEEL_ID) return steelHeight(world);
    if (id == CONCRETE_ID) return CONCRETE_GRAIN_HEIGHT * fractalNoise(world / CONCRETE_PATTERN);
    return 0.0;
}

vec2 bevelSlope(vec2 textureCoord)
{
    return coverageSlope(textureCoord, BEVEL_WIDTH, BEVEL_HEIGHT);
}

vec3 surfaceNormal(int id, vec2 world, vec2 bevel)
{
    float probe = 1.0 / uPixelsPerMeter;
    float slopeX = (surfaceHeight(id, world + vec2(probe, 0.0)) - surfaceHeight(id, world - vec2(probe, 0.0))) / (2.0 * probe);
    float slopeY = (surfaceHeight(id, world + vec2(0.0, probe)) - surfaceHeight(id, world - vec2(0.0, probe))) / (2.0 * probe);
    return normalize(vec3(-(slopeX + bevel.x), -(slopeY + bevel.y), 1.0));
}

vec3 litColor(vec3 albedo, vec3 normal, vec3 point, float specularAmount)
{
    float facing = max(0.0, dot(normal, uBaseDirection));
    vec3 light = vec3(uAmbient) + uBaseColor * facing + lightSum(point, normal, uLightShiftY, 1.0);
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
    float edgeLighten;
    if (id == STEEL_ID) {
        surface = vec4(steelColor(world, code.g), STEEL_ALPHA);
        edgeLighten = STEEL_EDGE;
    } else if (id == CONCRETE_ID) {
        surface = vec4(concreteColor(world, code.g), CONCRETE_ALPHA);
        edgeLighten = CONCRETE_EDGE;
    } else {
        surface = glassColor(world);
        edgeLighten = GLASS_EDGE;
    }
    float specularAmount = id == STEEL_ID ? 1.0 - smoothstep(0.0, SPECULAR_WEAR_LIMIT, code.g) : 0.0;
    vec3 normal = surfaceNormal(id, world, bevelSlope(vTextureCoord));
    vec3 lit = litColor(surface.rgb, normal, vec3(world, 0.0), specularAmount);
    vec3 color = mix(lit, vec3(1.0), code.b * edgeLighten);
    float alpha = surface.a * encoded.a;
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
        resources: {
            [UNIFORM_GROUP]: {
                uOrigin: { value: new Float32Array(ORIGIN_COMPONENTS), type: "vec2<f32>" },
                uPixelsPerMeter: { value: INITIAL_PIXELS_PER_METER, type: "f32" },
                uLightShiftY: { value: 0, type: "f32" },
                ...createBaseLightUniforms(),
                ...createPointLightUniforms(),
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
 * Pone las luces del frame en el filtro, sin crear objetos.
 * @param {PIXI.Filter} filter el de `createSurfaceFilter`
 * @param {{data: Float32Array, count: number}} lightSet luces de `createLightSet`
 */
export function setSurfaceFilterLights(filter, lightSet) {
    applyLights(filter.resources[UNIFORM_GROUP].uniforms, lightSet);
}
