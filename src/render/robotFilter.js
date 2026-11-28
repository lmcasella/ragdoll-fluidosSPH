import { SURFACES } from "../level/surfaces.js";
import { BEVEL_FUNCTIONS } from "./bevelFunctions.js";
import { BASE_LIGHT_FUNCTIONS, LIGHT_FUNCTIONS, applyLights, createBaseLightUniforms, createPointLightUniforms } from "./lighting.js";
import { glslColor, glslFloat } from "./surfaceFilter.js";
import { FILTER_VERTEX } from "./thresholdFilter.js";
import { RENDER_QUALITY } from "./renderQuality.js";

/**
 * Filtro de los robots (`docs/design/13-arte.md` §13.4): un solo `PIXI.Filter` sobre la capa de robots que los muestra como
 * metal pintado con relieve. Cada pieza ya llega pintada con su color final (jugador, destello y mojado) por `tint`, así el
 * filtro no sabe de jugadores. El contorno de las piezas llega en `ROBOT_JOINT_COLOR` y se dibuja como junta hundida. La
 * altura sube en el bisel de la silueta y baja en las juntas; de su gradiente sale la normal, que se ilumina con la luz base
 * y las luces de `lighting.js` (`docs/design/13-arte.md` §13.3). Sin ruido ni textura: los robots se mueven.
 */

/** Color con que se traza el contorno de las piezas para que el filtro lo reconozca como junta: ninguna pieza lo usa. */
export const ROBOT_JOINT_COLOR = 0x000000;

const SHADER_NAME = "robot-filter";

/** Nombre del grupo de uniforms del filtro. */
const UNIFORM_GROUP = "robotUniforms";

/** Componentes del origen de pantalla (x, y). */
const ORIGIN_COMPONENTS = 2;

/** Escala inicial del filtro, en px por metro, hasta el primer `updateRobotFilter`. */
const INITIAL_PIXELS_PER_METER = 1;

/**
 * Fragmento del filtro, GLSL ES 1.00 tras la conversión de PIXI (sin `texelFetch`, `textureSize` ni operaciones de enteros).
 * Medidas en metros. `PAINT_BRIGHTNESS`: cuánto del color de la pieza queda con la pintura satinada. `PAINT_WEAR_MIX`: parte
 * que se mezcla hacia el acero de las plataformas en los `PAINT_WEAR_WIDTH` más externos de la silueta. `LIGHT_FLOOR`:
 * piso del multiplicador de luz, para que el destello y el mojado sigan leyéndose. La luz base (clave y relleno) se divide por la de una cara plana, así el color
 * del jugador queda igual donde no hay relieve; las luces puntuales se suman sin dividir, para que alumbren de verdad. El bisel mide al menos MIN_BEVEL_PX px para que se vea con la cámara lejos.
 */
export const ROBOT_FRAGMENT = `
precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform highp vec4 uInputSize;
uniform highp vec4 uOutputFrame;
uniform highp vec2 uOrigin;
uniform highp float uPixelsPerMeter;
${BASE_LIGHT_FUNCTIONS}
${LIGHT_FUNCTIONS}
${BEVEL_FUNCTIONS}

const vec3 STEEL_BASE = ${glslColor(SURFACES.steel.baseColor)};
const vec3 JOINT_PAINT = vec3(0.10, 0.11, 0.13);
const float JOINT_CODE_LIMIT = 0.08;
const float JOINT_DEPTH = 0.03;
const float BEVEL_WIDTH = 0.04;
const float BEVEL_HEIGHT = 0.05;
const float MIN_BEVEL_PX = 3.0;
const float MIN_WEAR_PX = 1.5;
const float PAINT_BRIGHTNESS = ${glslFloat(0.95)};
const float PAINT_WEAR_WIDTH = 0.02;
const float PAINT_WEAR_MIX = ${glslFloat(0.5)};
const float LIGHT_FLOOR = ${glslFloat(0.75)};
const float SPECULAR_SHININESS = 16.0;
const float SPECULAR_STRENGTH = ${glslFloat(0.5)};
const vec3 VIEW_DIRECTION = vec3(0.0, 0.0, 1.0);

float bevelWidth()
{
    return max(BEVEL_WIDTH, MIN_BEVEL_PX / uPixelsPerMeter);
}

float jointAt(vec2 textureCoord)
{
    vec4 code = texture(uTexture, textureCoord);
    if (code.a <= 0.0) return 0.0;
    float brightest = max(code.r, max(code.g, code.b)) / code.a;
    return 1.0 - smoothstep(0.0, JOINT_CODE_LIMIT, brightest);
}

vec2 jointSlope(vec2 textureCoord)
{
    vec2 tap = vec2(bevelWidth() * uPixelsPerMeter) / uInputSize.xy;
    float right = jointAt(textureCoord + vec2(tap.x, 0.0));
    float left = jointAt(textureCoord - vec2(tap.x, 0.0));
    float up = jointAt(textureCoord - vec2(0.0, tap.y));
    float down = jointAt(textureCoord + vec2(0.0, tap.y));
    return -JOINT_DEPTH / (2.0 * bevelWidth()) * vec2(right - left, up - down);
}

float outerEdgeAmount(vec2 textureCoord)
{
    vec2 tap = vec2(max(PAINT_WEAR_WIDTH, MIN_WEAR_PX / uPixelsPerMeter) * uPixelsPerMeter) / uInputSize.xy;
    float right = coverageAt(textureCoord + vec2(tap.x, 0.0));
    float left = coverageAt(textureCoord - vec2(tap.x, 0.0));
    float up = coverageAt(textureCoord - vec2(0.0, tap.y));
    float down = coverageAt(textureCoord + vec2(0.0, tap.y));
    return 1.0 - min(min(right, left), min(up, down));
}

void main(void)
{
    vec4 encoded = texture(uTexture, vTextureCoord);
    if (encoded.a <= 0.0) {
        finalColor = vec4(0.0);
        return;
    }
    vec3 tint = encoded.rgb / encoded.a;
    float joint = jointAt(vTextureCoord);
    vec2 slope = coverageSlope(vTextureCoord, bevelWidth(), BEVEL_HEIGHT) + jointSlope(vTextureCoord);
    vec3 normal = normalize(vec3(-slope, 1.0));

    vec2 screen = vTextureCoord * uInputSize.xy + uOutputFrame.xy;
    vec2 world = vec2(screen.x - uOrigin.x, uOrigin.y - screen.y) / uPixelsPerMeter;

    vec3 paint = tint * PAINT_BRIGHTNESS;
    paint = mix(paint, STEEL_BASE, PAINT_WEAR_MIX * outerEdgeAmount(vTextureCoord));
    paint = mix(paint, JOINT_PAINT, joint);

    float facing = max(0.0, dot(normal, uBaseDirection));
    vec3 flatNormal = vec3(0.0, 0.0, 1.0);
    vec3 baseRelief = baseLight(normal) / baseLight(flatNormal);
    vec3 light = baseRelief + lightSum(vec3(world, 0.0), normal, 0.0, 1.0);
    vec3 halfway = normalize(uBaseDirection + VIEW_DIRECTION);
    float specular = SPECULAR_STRENGTH * pow(max(0.0, dot(normal, halfway)), SPECULAR_SHININESS) * facing;
    vec3 color = paint * max(light, vec3(LIGHT_FLOOR)) + uBaseColor * specular;
    finalColor = vec4(color * encoded.a, encoded.a);
}
`;

/**
 * Crea el filtro de los robots (un solo shader GLSL, sin texturas). Se crea una vez y sirve para todos los robots; los
 * uniforms de cámara se ponen con `updateRobotFilter` y las luces con `setRobotFilterLights`.
 * @returns {PIXI.Filter}
 */
export function createRobotFilter() {
    return new PIXI.Filter({
        glProgram: PIXI.GlProgram.from({ vertex: FILTER_VERTEX, fragment: ROBOT_FRAGMENT, name: SHADER_NAME }),
        resolution: RENDER_QUALITY.filterResolution,
        antialias: RENDER_QUALITY.filterAntialias,
        resources: {
            [UNIFORM_GROUP]: {
                uOrigin: { value: new Float32Array(ORIGIN_COMPONENTS), type: "vec2<f32>" },
                uPixelsPerMeter: { value: INITIAL_PIXELS_PER_METER, type: "f32" },
                ...createBaseLightUniforms(),
                ...createPointLightUniforms(),
            },
        },
    });
}

/**
 * Pone la cámara en el filtro, una vez por frame y sin crear objetos: las luces quedan en coordenadas del mundo.
 * @param {PIXI.Filter} filter el de `createRobotFilter`
 * @param {object} camera
 * @param {number} camera.originX px de pantalla del origen del mundo físico, en x
 * @param {number} camera.originY px de pantalla del origen del mundo físico, en y (hacia abajo)
 * @param {number} camera.pixelsPerMeter px de pantalla por metro
 */
export function updateRobotFilter(filter, { originX, originY, pixelsPerMeter }) {
    const { uniforms } = filter.resources[UNIFORM_GROUP];
    uniforms.uOrigin[0] = originX;
    uniforms.uOrigin[1] = originY;
    uniforms.uPixelsPerMeter = pixelsPerMeter;
}

/**
 * Pone las luces del frame en el filtro, sin crear objetos.
 * @param {PIXI.Filter} filter el de `createRobotFilter`
 * @param {{data: Float32Array, count: number}} lightSet luces de `createLightSet`
 */
export function setRobotFilterLights(filter, lightSet) {
    applyLights(filter.resources[UNIFORM_GROUP].uniforms, lightSet);
}
