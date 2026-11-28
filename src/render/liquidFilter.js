import { NOISE_FUNCTIONS, RIPPLE_FUNCTIONS } from "./glslNoise.js";
import { FILTER_VERTEX, THRESHOLD_GAIN, THRESHOLD_OFFSET } from "./thresholdFilter.js";
import { RENDER_QUALITY } from "./renderQuality.js";

/**
 * Filtro de las capas de líquido (`docs/design/07-sph.md` §7.4, "Aspecto por material"): reemplaza al umbral solo. Corta el
 * campo de las gotas con el mismo umbral de `thresholdFilter.js` y le da a cada material su aspecto, con los datos de
 * `FLUID_LOOK` (`fluidDraw.js`). Todo sale del campo (el alfa de la textura de entrada), sin desenfoque: el borde y la
 * normal, del gradiente del campo en cuatro vecinos; el halo, del campo por debajo del umbral. El agua deja ver el fondo
 * desplazado (`uBackTexture`, que PIXI da a los filtros con `blendRequired` si el renderer arranca con `useBackBuffer`).
 * Los datos de cada material se ponen al crear el filtro; por frame solo cambian el tiempo y la cámara.
 */

/** Nombre del grupo de uniforms de los filtros de líquido; el filtro del agua del nivel usa el mismo para compartir `updateLiquidFilter`. */
export const LIQUID_UNIFORM_GROUP = "liquidUniforms";

/** Componentes del origen de pantalla (x, y). */
const ORIGIN_COMPONENTS = 2;

/** Escala inicial del filtro, en px por metro, hasta el primer `updateLiquidFilter`. */
const INITIAL_PIXELS_PER_METER = 1;

/** Decimales con que se escriben los números en el GLSL. */
const GLSL_DECIMALS = 4;

/**
 * Número de GLSL con punto decimal.
 * @param {number} value
 * @returns {string}
 */
function glslFloat(value) {
    return value.toFixed(GLSL_DECIMALS);
}

/**
 * Sección del fragmento que ve a través del líquido. El agua lee el fondo desplazado por ondas animadas y lo mezcla con su
 * color según la opacidad; los demás líquidos pintan solo su color. El desplazamiento máximo en m es `uRefraction`.
 */
const REFRACTIVE_SECTION = `
uniform sampler2D uBackTexture;
uniform highp float uRefraction;

${RIPPLE_FUNCTIONS}

vec4 seeThrough(vec3 liquidColor, float opacity, vec2 world, vec2 textureCoord)
{
    vec2 shiftTexture = rippleShift(world, uRefraction);
    vec4 back = texture(uBackTexture, clamp(textureCoord + shiftTexture, 0.0, 1.0));
    return vec4(liquidColor * opacity + back.rgb * (1.0 - opacity), opacity + back.a * (1.0 - opacity));
}
`;

/** Sección del fragmento de los líquidos que no dejan ver el fondo: solo pintan su color con la opacidad. */
const OPAQUE_SECTION = `
vec4 seeThrough(vec3 liquidColor, float opacity, vec2 world, vec2 textureCoord)
{
    return vec4(liquidColor * opacity, opacity);
}
`;

/**
 * Fragmento del filtro, GLSL ES 3.00. Las constantes de dibujo están acá, en m, en campo (alfa de la textura) o en px.
 * @param {boolean} refractive verdadero para el agua: declara `uBackTexture` y desplaza el fondo
 * @returns {string}
 */
export function liquidFragment(refractive) {
    return `
precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform highp vec4 uInputSize;
uniform highp vec4 uOutputFrame;
uniform highp vec2 uOrigin;
uniform highp float uPixelsPerMeter;
uniform highp float uTime;
uniform highp float uFresnel;
uniform highp float uRim;
uniform highp float uGlow;
uniform highp vec3 uGlowColor;
uniform highp float uEmissive;
${NOISE_FUNCTIONS}

const float THRESHOLD_GAIN = ${glslFloat(THRESHOLD_GAIN)};
const float THRESHOLD_OFFSET = ${glslFloat(THRESHOLD_OFFSET)};
const float THRESHOLD_FIELD = ${glslFloat(-THRESHOLD_OFFSET / THRESHOLD_GAIN)};

const float EDGE_TAP_PX = 2.0;
const float EDGE_SLOPE_FULL = 8.0;
const float TOP_HIGHLIGHT = 0.8;
const vec3 RIM_COLOR = vec3(1.0);

const float HALO_START_FIELD = 0.15;
const float HALO_STRENGTH = 0.8;
const float HALO_ALPHA_SHARE = 0.25;

const float CORE_FIELD = 0.95;
const float EDGE_BRIGHTNESS = 0.7;
const float CORE_BRIGHTNESS = 1.3;
${refractive ? REFRACTIVE_SECTION : OPAQUE_SECTION}

float fieldAt(vec2 textureCoord)
{
    return texture(uTexture, textureCoord).a;
}

vec3 moltenColor(vec3 tint, float field)
{
    float interior = smoothstep(THRESHOLD_FIELD, CORE_FIELD, field);
    return tint * mix(1.0, mix(EDGE_BRIGHTNESS, CORE_BRIGHTNESS, interior), uEmissive);
}

void main(void)
{
    vec4 premultiplied = texture(uTexture, vTextureCoord);
    float field = premultiplied.a;
    vec3 tint = field > 0.0 ? premultiplied.rgb / field : vec3(0.0);
    float heat = max(tint.r, max(tint.g, tint.b));
    float body = clamp(field * THRESHOLD_GAIN + THRESHOLD_OFFSET, 0.0, 1.0);
    if (body <= 0.0) {
        float halo = smoothstep(HALO_START_FIELD, THRESHOLD_FIELD, field) * uGlow * heat * HALO_STRENGTH;
        finalColor = vec4(uGlowColor * halo, halo * HALO_ALPHA_SHARE);
        return;
    }
    vec2 screen = vTextureCoord * uInputSize.xy + uOutputFrame.xy;
    vec2 world = vec2(screen.x - uOrigin.x, uOrigin.y - screen.y) / uPixelsPerMeter;
    vec2 tap = vec2(EDGE_TAP_PX) * uInputSize.zw;
    float right = fieldAt(vTextureCoord + vec2(tap.x, 0.0));
    float left = fieldAt(vTextureCoord - vec2(tap.x, 0.0));
    float above = fieldAt(vTextureCoord - vec2(0.0, tap.y));
    float below = fieldAt(vTextureCoord + vec2(0.0, tap.y));
    vec2 slope = vec2(right - left, above - below) * (0.5 / EDGE_TAP_PX * uPixelsPerMeter);
    float slopeLength = length(slope);
    float grazing = clamp(slopeLength / EDGE_SLOPE_FULL, 0.0, 1.0);
    float facingUp = max(0.0, -slope.y / max(slopeLength, 0.0001));
    vec3 color = uEmissive > 0.0 ? moltenColor(tint, field) : tint;
    float lighten = clamp(uRim * grazing * (1.0 + facingUp * TOP_HIGHLIGHT), 0.0, 1.0) * mix(1.0, heat, uEmissive);
    color = mix(color, RIM_COLOR, lighten);
    float opacity = mix(1.0 - uFresnel, 1.0, grazing);
    finalColor = seeThrough(color, opacity, world, vTextureCoord) * body;
}
`;
}

/**
 * Crea el filtro de líquido de un material con los datos de su aspecto (un solo shader GLSL, sin texturas). El de agua
 * (`refraction` mayor que 0) pide el fondo a PIXI con `blendRequired`. Una instancia por capa; el tiempo y la cámara se
 * ponen con `updateLiquidFilter`.
 * @param {object} look fila de `FLUID_LOOK` (`fluidDraw.js`)
 * @returns {PIXI.Filter}
 */
export function createLiquidFilter(look) {
    const refractive = look.refraction > 0;
    return new PIXI.Filter({
        glProgram: PIXI.GlProgram.from({
            vertex: FILTER_VERTEX,
            fragment: liquidFragment(refractive),
            name: refractive ? "liquid-filter-refractive" : "liquid-filter",
        }),
        blendRequired: refractive,
        resolution: RENDER_QUALITY.filterResolution,
        resources: {
            [LIQUID_UNIFORM_GROUP]: {
                uOrigin: { value: new Float32Array(ORIGIN_COMPONENTS), type: "vec2<f32>" },
                uPixelsPerMeter: { value: INITIAL_PIXELS_PER_METER, type: "f32" },
                uTime: { value: 0, type: "f32" },
                ...(refractive ? { uRefraction: { value: look.refraction, type: "f32" } } : {}),
                uFresnel: { value: look.fresnel, type: "f32" },
                uRim: { value: look.rim, type: "f32" },
                uGlow: { value: look.glow, type: "f32" },
                uGlowColor: { value: new Float32Array(look.glowColor), type: "vec3<f32>" },
                uEmissive: { value: look.emissive, type: "f32" },
            },
        },
    });
}

/**
 * Pone el tiempo y la cámara en el filtro, una vez por frame y sin crear objetos: así el ruido queda pegado al mundo.
 * @param {PIXI.Filter} filter el de `createLiquidFilter`
 * @param {object} frame
 * @param {number} frame.time reloj de juego, en s
 * @param {number} frame.originX px de pantalla del origen del mundo, en x
 * @param {number} frame.originY px de pantalla del origen del mundo, en y (hacia abajo)
 * @param {number} frame.pixelsPerMeter px de pantalla por metro
 */
export function updateLiquidFilter(filter, { time, originX, originY, pixelsPerMeter }) {
    const { uniforms } = filter.resources[LIQUID_UNIFORM_GROUP];
    uniforms.uOrigin[0] = originX;
    uniforms.uOrigin[1] = originY;
    uniforms.uPixelsPerMeter = pixelsPerMeter;
    uniforms.uTime = time;
}
