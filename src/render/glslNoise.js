/**
 * Ruido de valor de GLSL que comparten los filtros de `src/render/` (`surfaceFilter.js`, `liquidFilter.js` y `waterFilter.js`).
 * Sale de la posición del fragmento en el mundo y no usa texturas, así que queda pegado a lo que se dibuja.
 */

/**
 * Funciones de GLSL: `hash` (número pseudoaleatorio de 0 a 1 por celda entera) y `valueNoise` (interpolación suave de los
 * `hash` de las cuatro esquinas de la celda, de 0 a 1).
 */
export const NOISE_FUNCTIONS = `
const vec2 HASH_SCALE = vec2(123.34, 456.21);
const float HASH_MIX = 45.32;

float hash(vec2 cell)
{
    vec2 scrambled = fract(cell * HASH_SCALE);
    scrambled += dot(scrambled, scrambled + HASH_MIX);
    return fract(scrambled.x * scrambled.y);
}

float valueNoise(vec2 point)
{
    vec2 cell = floor(point);
    vec2 local = fract(point);
    vec2 smoothed = local * local * (3.0 - 2.0 * local);
    float lowerLeft = hash(cell);
    float lowerRight = hash(cell + vec2(1.0, 0.0));
    float upperLeft = hash(cell + vec2(0.0, 1.0));
    float upperRight = hash(cell + vec2(1.0, 1.0));
    return mix(mix(lowerLeft, lowerRight, smoothed.x), mix(upperLeft, upperRight, smoothed.x), smoothed.y);
}
`;

/**
 * Ondas del agua de GLSL: `rippleNoise` son dos octavas de ruido de valor (de 0 a 1) que se mueven con `uTime`, y `rippleShift`
 * da el desplazamiento del fondo en coordenadas de textura para un máximo de `maxMeters` (m). Va después de `NOISE_FUNCTIONS`
 * y de la declaración de `uTime`, `uPixelsPerMeter` y `uInputSize`.
 */
export const RIPPLE_FUNCTIONS = `
const float RIPPLE_FREQUENCY = 4.0;
const float RIPPLE_SPEED = 0.6;
const float FINE_RIPPLE_SCALE = 2.1;
const float FINE_RIPPLE_SPEED = 1.3;
const float COARSE_RIPPLE_SHARE = 0.65;
const vec2 RIPPLE_DECORRELATION = vec2(17.3, 5.9);

float rippleNoise(vec2 point)
{
    float coarse = valueNoise(point * RIPPLE_FREQUENCY + vec2(uTime * RIPPLE_SPEED, 0.0));
    float fine = valueNoise(point * RIPPLE_FREQUENCY * FINE_RIPPLE_SCALE - vec2(0.0, uTime * RIPPLE_SPEED * FINE_RIPPLE_SPEED));
    return mix(fine, coarse, COARSE_RIPPLE_SHARE);
}

vec2 rippleShift(vec2 world, float maxMeters)
{
    vec2 ripple = vec2(rippleNoise(world), rippleNoise(world + RIPPLE_DECORRELATION)) - 0.5;
    vec2 shiftMeters = ripple * 2.0 * maxMeters;
    return vec2(shiftMeters.x, -shiftMeters.y) * uPixelsPerMeter * uInputSize.zw;
}
`;