import { LIGHTING, LIGHT_FUNCTIONS, VEC4_PER_LIGHT, applyLights, createPointLightUniforms } from "./lighting.js";
import { glslFloat } from "./surfaceFilter.js";
import { FILTER_VERTEX } from "./thresholdFilter.js";
import { RENDER_QUALITY } from "./renderQuality.js";

/**
 * Filtro de sombras proyectadas (`docs/design/13-arte.md` §13.3): un `PIXI.Filter` sobre una capa (nivel y cajas, o robots)
 * que oscurece lo que tiene detrás. Usa `padding` para dibujar fuera de la silueta de la capa: donde el contenido no tiene
 * alfa, mira la cobertura de la capa en el punto desplazado hacia la luz y pone una sombra negra translúcida. Sin
 * desenfoque gaussiano: el borde suave sale de promediar cuatro muestras alrededor del punto desplazado. Va después del
 * filtro de material de la capa, que necesita el color codificado sin sombra.
 */

/**
 * Valores de la sombra, en m salvo el alfa: `distance` es cuánto se desplaza el punto que se mira, `alpha` lo oscuro que es
 * la sombra (de 0 a 1), `softRadius` la separación de las cuatro muestras del borde suave y `switchSoftness` cuánta
 * intensidad de más necesita una luz puntual sobre la clave para tomar el mando de la dirección de la sombra por completo.
 */
export const SHADOW = { distance: 0.35, alpha: 0.45, softRadius: 0.06, switchSoftness: 0.25 };

const SHADER_NAME = "shadow-filter";

/** Nombre del grupo de uniforms del filtro. */
const UNIFORM_GROUP = "shadowUniforms";

/** Componentes del origen de pantalla (x, y). */
const ORIGIN_COMPONENTS = 2;

/** Escala inicial del filtro, en px por metro, hasta el primer `updateShadowFilter`. */
const INITIAL_PIXELS_PER_METER = 1;

/** Largo mínimo, en m, de la dirección hacia una luz para poder normalizarla. */
const MIN_DIRECTION_LENGTH = 0.0001;

/**
 * Fragmento del filtro, GLSL ES 3.00 tras la conversión de PIXI (sin `texelFetch`, `textureSize` ni operaciones de enteros).
 * `shadowDirection` da, en el punto del mundo, hacia dónde se mira: hacia la luz clave, o hacia la luz puntual más intensa
 * de `uLights` si su aporte supera al de la clave (así la sombra cae alejándose de la lava o el ácido).
 */
export const SHADOW_FRAGMENT = `
precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform highp vec4 uInputSize;
uniform highp vec4 uOutputFrame;
uniform highp vec2 uOrigin;
uniform highp float uPixelsPerMeter;
uniform highp vec2 uKeyDirection;
uniform highp float uKeyIntensity;
${LIGHT_FUNCTIONS}

const float SHADOW_DISTANCE = ${glslFloat(SHADOW.distance)};
const float SHADOW_ALPHA = ${glslFloat(SHADOW.alpha)};
const float SOFT_RADIUS = ${glslFloat(SHADOW.softRadius)};
const float SWITCH_SOFTNESS = ${glslFloat(SHADOW.switchSoftness)};
const float MIN_DIRECTION_LENGTH = ${glslFloat(MIN_DIRECTION_LENGTH)};
const float SOFT_SAMPLES = 4.0;

vec2 shadowDirection(vec2 world)
{
    float strongest = 0.0;
    vec2 toStrongest = vec2(0.0);
    for (int index = 0; index < MAX_LIGHTS; index++) {
        if (float(index) >= uLightCount) break;
        vec4 placement = uLights[index * ${VEC4_PER_LIGHT}];
        vec2 toLight = placement.xy - world;
        float strength = lightFalloff(length(vec3(toLight, LIGHT_HEIGHT)), placement.z, placement.w);
        if (strength > strongest) {
            strongest = strength;
            toStrongest = toLight;
        }
    }
    vec2 toPoint = toStrongest / max(length(toStrongest), MIN_DIRECTION_LENGTH);
    float pointShare = smoothstep(uKeyIntensity, uKeyIntensity + SWITCH_SOFTNESS, strongest);
    return mix(uKeyDirection, toPoint, pointShare);
}

float coverageAt(vec2 textureCoord)
{
    return texture(uTexture, textureCoord).a;
}

void main(void)
{
    vec4 color = texture(uTexture, vTextureCoord);
    if (color.a >= 1.0) {
        finalColor = color;
        return;
    }
    vec2 screen = vTextureCoord * uInputSize.xy + uOutputFrame.xy;
    vec2 world = vec2(screen.x - uOrigin.x, uOrigin.y - screen.y) / uPixelsPerMeter;
    vec2 direction = shadowDirection(world);
    vec2 towardLight = vec2(direction.x, -direction.y) * SHADOW_DISTANCE * uPixelsPerMeter / uInputSize.xy;
    vec2 tap = vec2(SOFT_RADIUS * uPixelsPerMeter) / uInputSize.xy;
    vec2 center = vTextureCoord + towardLight;
    float covered = coverageAt(center + vec2(tap.x, 0.0)) + coverageAt(center - vec2(tap.x, 0.0))
        + coverageAt(center + vec2(0.0, tap.y)) + coverageAt(center - vec2(0.0, tap.y));
    float shadow = SHADOW_ALPHA * covered / SOFT_SAMPLES * (1.0 - color.a);
    finalColor = vec4(color.rgb, color.a + shadow);
}
`;

/**
 * Píxeles que el filtro necesita fuera de la silueta de la capa: el desplazamiento de la sombra más el radio del borde suave.
 * @param {number} pixelsPerMeter px de pantalla por metro
 * @returns {number}
 */
export function shadowPadding(pixelsPerMeter) {
    return Math.ceil((SHADOW.distance + SHADOW.softRadius) * pixelsPerMeter);
}

/**
 * Crea el filtro de sombras (un solo shader GLSL, sin texturas). Se crea una vez por capa; la cámara y las luces se ponen
 * cada frame con `updateShadowFilter` y `setShadowFilterLights`.
 * @returns {PIXI.Filter}
 */
export function createShadowFilter() {
    const [directionX, directionY] = LIGHTING.base.direction;
    const directionLength = Math.hypot(directionX, directionY);
    return new PIXI.Filter({
        glProgram: PIXI.GlProgram.from({ vertex: FILTER_VERTEX, fragment: SHADOW_FRAGMENT, name: SHADER_NAME }),
        resolution: RENDER_QUALITY.filterResolution,
        antialias: RENDER_QUALITY.filterAntialias,
        padding: shadowPadding(INITIAL_PIXELS_PER_METER),
        resources: {
            [UNIFORM_GROUP]: {
                uOrigin: { value: new Float32Array(ORIGIN_COMPONENTS), type: "vec2<f32>" },
                uPixelsPerMeter: { value: INITIAL_PIXELS_PER_METER, type: "f32" },
                uKeyDirection: { value: new Float32Array([directionX / directionLength, directionY / directionLength]), type: "vec2<f32>" },
                uKeyIntensity: { value: LIGHTING.base.intensity, type: "f32" },
                ...createPointLightUniforms(),
            },
        },
    });
}

/**
 * Pone la cámara en el filtro y ajusta su `padding`, una vez por frame y sin crear objetos.
 * @param {PIXI.Filter} filter el de `createShadowFilter`
 * @param {object} camera
 * @param {number} camera.originX px de pantalla del origen del mundo físico, en x
 * @param {number} camera.originY px de pantalla del origen del mundo físico, en y (hacia abajo)
 * @param {number} camera.pixelsPerMeter px de pantalla por metro
 */
export function updateShadowFilter(filter, { originX, originY, pixelsPerMeter }) {
    const { uniforms } = filter.resources[UNIFORM_GROUP];
    uniforms.uOrigin[0] = originX;
    uniforms.uOrigin[1] = originY;
    uniforms.uPixelsPerMeter = pixelsPerMeter;
    filter.padding = shadowPadding(pixelsPerMeter);
}

/**
 * Pone las luces del frame en el filtro, sin crear objetos.
 * @param {PIXI.Filter} filter el de `createShadowFilter`
 * @param {{data: Float32Array, count: number}} lightSet luces de `createLightSet`
 */
export function setShadowFilterLights(filter, lightSet) {
    applyLights(filter.resources[UNIFORM_GROUP].uniforms, lightSet);
}
