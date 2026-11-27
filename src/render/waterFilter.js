import { NOISE_FUNCTIONS, RIPPLE_FUNCTIONS } from "./glslNoise.js";
import { LIQUID_UNIFORM_GROUP } from "./liquidFilter.js";
import { LIGHT_FUNCTIONS, LIGHT_SPECULAR_FUNCTIONS, applyLights, createPointLightUniforms } from "./lighting.js";
import { FILTER_VERTEX } from "./thresholdFilter.js";

/**
 * Filtro del agua del nivel (`docs/design/07-sph.md` §7.4, "Aspecto por material"): `WaterView` pinta los tramos mojados con
 * un color codificado y este `PIXI.Filter` lo reemplaza por el agua. El código usa el alfa para la cobertura y el rojo para
 * la fracción de ácido (0 a 1). La profundidad bajo la superficie sale de leer la cobertura hacia arriba. Con ella el filtro
 * oscurece el agua y esconde el fondo cuanto más profunda es, la hace más opaca cerca de la superficie (fresnel) y marca la
 * línea de la superficie. Deja ver el fondo (`uBackTexture`, que PIXI da a los filtros con `blendRequired` si el renderer
 * arranca con `useBackBuffer`) desplazado por ondas que se mueven con `uTime`, y refleja las luces de `lighting.js` con la
 * normal de esas ondas. Comparte el grupo de uniforms y `updateLiquidFilter` con `liquidFilter.js`.
 */

/** Valor máximo de un canal de color de 8 bits. */
const CHANNEL_MAX = 255;

/** Bits que se desplaza el canal rojo dentro de un color de 24 bits. */
const RED_SHIFT = 16;

/** Componentes del origen de pantalla (x, y). */
const ORIGIN_COMPONENTS = 2;

/** Escala inicial del filtro, en px por metro, hasta el primer `updateLiquidFilter`. */
const INITIAL_PIXELS_PER_METER = 1;

/**
 * Color de 24 bits con que `WaterView` pinta un tramo de agua para que el filtro lo reconozca.
 * @param {number} acidFraction fracción del tinte de ácido, de 0 a 1
 * @returns {number}
 */
export function encodeWater(acidFraction) {
    return Math.round(acidFraction * CHANNEL_MAX) << RED_SHIFT;
}

/**
 * Color RGB de 0 a 255 como uniform de 0 a 1.
 * @param {number[]} color
 * @returns {Float32Array}
 */
function unitColor(color) {
    return new Float32Array(color.map((channel) => channel / CHANNEL_MAX));
}

/**
 * Fragmento del filtro, GLSL ES 3.00. La profundidad se busca con sondas hacia arriba (en m, crecen en proporción) y se afina
 * por bisección; las demás constantes de dibujo están acá, en m, en px o sin unidad.
 */
export const WATER_FRAGMENT = `
precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform sampler2D uBackTexture;
uniform highp vec4 uInputSize;
uniform highp vec4 uOutputFrame;
uniform highp vec2 uOrigin;
uniform highp float uPixelsPerMeter;
uniform highp float uTime;
uniform highp float uRefraction;
uniform highp float uFresnel;
uniform highp vec3 uWaterColor;
uniform highp vec3 uAcidColor;
uniform highp vec3 uLineColor;
uniform highp float uLineWidth;
${LIGHT_FUNCTIONS}
${LIGHT_SPECULAR_FUNCTIONS}
${NOISE_FUNCTIONS}

const int PROBE_COUNT = 13;
const int REFINE_COUNT = 4;
const float FIRST_PROBE_M = 0.03;
const float PROBE_GROWTH = 1.5;
const float COVERED = 0.5;
const float UNREACHED_DEPTH_M = 6.0;

const float ABSORPTION_LENGTH_M = 1.0;
const float FRESNEL_DEPTH_M = 0.3;
const float DEEP_DARKEN = 0.3;

${RIPPLE_FUNCTIONS}

const float SLOPE_PROBE_M = 0.05;
const float SLOPE_GAIN = 0.25;

const float LIGHT_REFLECTION = 0.6;
const float SPECULAR_STRENGTH = 0.8;
const float SPECULAR_SHININESS = 40.0;
const float SURFACE_REFLECTION_SHARE = 0.5;

float coverageAbove(vec2 textureCoord, float meters)
{
    vec2 probe = textureCoord - vec2(0.0, meters * uPixelsPerMeter * uInputSize.w);
    return probe.y < 0.0 ? 1.0 : texture(uTexture, probe).a;
}

float surfaceDepth(vec2 textureCoord)
{
    float below = 0.0;
    float reach = FIRST_PROBE_M;
    for (int probe = 0; probe < PROBE_COUNT; probe++) {
        if (coverageAbove(textureCoord, reach) < COVERED) {
            float low = below;
            float high = reach;
            for (int refine = 0; refine < REFINE_COUNT; refine++) {
                float middle = 0.5 * (low + high);
                if (coverageAbove(textureCoord, middle) < COVERED) high = middle;
                else low = middle;
            }
            return 0.5 * (low + high);
        }
        below = reach;
        reach *= PROBE_GROWTH;
    }
    return UNREACHED_DEPTH_M;
}

void main(void)
{
    vec4 coded = texture(uTexture, vTextureCoord);
    float coverage = coded.a;
    if (coverage <= 0.0) {
        finalColor = vec4(0.0);
        return;
    }
    vec2 screen = vTextureCoord * uInputSize.xy + uOutputFrame.xy;
    vec2 world = vec2(screen.x - uOrigin.x, uOrigin.y - screen.y) / uPixelsPerMeter;
    float depth = surfaceDepth(vTextureCoord);
    float visibility = exp(-depth / ABSORPTION_LENGTH_M);
    float closeness = exp(-depth / FRESNEL_DEPTH_M);

    vec3 liquid = mix(uWaterColor, uAcidColor, coded.r / coverage);
    liquid = mix(liquid * DEEP_DARKEN, liquid, visibility);
    float opacity = 1.0 - visibility * (1.0 - uFresnel * closeness);

    vec4 back = texture(uBackTexture, clamp(vTextureCoord + rippleShift(world, uRefraction), 0.0, 1.0));
    vec3 color = liquid * opacity + back.rgb * (1.0 - opacity);
    float alpha = opacity + back.a * (1.0 - opacity);

    float rise = rippleNoise(world + vec2(SLOPE_PROBE_M, 0.0)) - rippleNoise(world - vec2(SLOPE_PROBE_M, 0.0));
    float run = rippleNoise(world + vec2(0.0, SLOPE_PROBE_M)) - rippleNoise(world - vec2(0.0, SLOPE_PROBE_M));
    vec3 normal = normalize(vec3(-vec2(rise, run) / (2.0 * SLOPE_PROBE_M) * SLOPE_GAIN, 1.0));
    vec3 point = vec3(world, 0.0);
    float reflectionShare = mix(SURFACE_REFLECTION_SHARE, 1.0, closeness);
    color += (lightSum(point, normal, 0.0, 1.0) * LIGHT_REFLECTION + lightSpecular(point, normal, SPECULAR_SHININESS) * SPECULAR_STRENGTH) * reflectionShare;

    float lineWidthMeters = uLineWidth / uPixelsPerMeter;
    float line = 1.0 - smoothstep(0.5 * lineWidthMeters, lineWidthMeters, depth);
    color = mix(color, uLineColor, line);
    alpha = mix(alpha, 1.0, line);
    finalColor = vec4(color, alpha) * coverage;
}
`;

/**
 * Crea el filtro del agua del nivel (un solo shader GLSL, sin texturas propias). Pide el fondo a PIXI con `blendRequired`. Se
 * crea una vez; el tiempo y la cámara se ponen con `updateLiquidFilter` y las luces con `setWaterFilterLights`.
 * @param {object} options
 * @param {object} options.look fila de `FLUID_LOOK` del agua (`refraction` y `fresnel`)
 * @param {number[]} options.color RGB del agua, de 0 a 255 (`WATER_FIELD.draw.color`)
 * @param {number[]} options.acidColor RGB del agua con el tinte de ácido completo, de 0 a 255
 * @param {number[]} options.lineColor RGB de la línea de superficie, de 0 a 255
 * @param {number} options.lineWidth grosor de la línea de superficie, en px de pantalla
 * @returns {PIXI.Filter}
 */
export function createWaterFilter({ look, color, acidColor, lineColor, lineWidth }) {
    return new PIXI.Filter({
        glProgram: PIXI.GlProgram.from({ vertex: FILTER_VERTEX, fragment: WATER_FRAGMENT, name: "water-filter" }),
        blendRequired: true,
        resources: {
            [LIQUID_UNIFORM_GROUP]: {
                uOrigin: { value: new Float32Array(ORIGIN_COMPONENTS), type: "vec2<f32>" },
                uPixelsPerMeter: { value: INITIAL_PIXELS_PER_METER, type: "f32" },
                uTime: { value: 0, type: "f32" },
                uRefraction: { value: look.refraction, type: "f32" },
                uFresnel: { value: look.fresnel, type: "f32" },
                uWaterColor: { value: unitColor(color), type: "vec3<f32>" },
                uAcidColor: { value: unitColor(acidColor), type: "vec3<f32>" },
                uLineColor: { value: unitColor(lineColor), type: "vec3<f32>" },
                uLineWidth: { value: lineWidth, type: "f32" },
                ...createPointLightUniforms(),
            },
        },
    });
}

/**
 * Pone las luces del frame en el filtro, sin crear objetos. Las luces van en coordenadas del mundo físico.
 * @param {PIXI.Filter} filter el de `createWaterFilter`
 * @param {{data: Float32Array, count: number}} lightSet luces de `createLightSet`
 */
export function setWaterFilterLights(filter, lightSet) {
    applyLights(filter.resources[LIQUID_UNIFORM_GROUP].uniforms, lightSet);
}
