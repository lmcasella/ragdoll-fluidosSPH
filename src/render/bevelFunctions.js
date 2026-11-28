/**
 * Función de GLSL del bisel que comparten los filtros de materiales de las plataformas (`surfaceFilter.js`) y de los robots
 * (`robotFilter.js`): `coverageSlope` saca la pendiente de una altura que sube desde el borde de la silueta hacia adentro,
 * leyendo la cobertura (alfa) de `uTexture` en cuatro vecinos. Va después de declarar `uTexture`, `uInputSize` y
 * `uPixelsPerMeter`. Las texturas del filtro están en pantalla, con la Y hacia abajo; la pendiente sale con la Y hacia arriba.
 */
export const BEVEL_FUNCTIONS = `
float coverageAt(vec2 textureCoord)
{
    return texture(uTexture, textureCoord).a;
}

vec2 coverageSlope(vec2 textureCoord, float width, float height)
{
    vec2 tap = vec2(width * uPixelsPerMeter) / uInputSize.xy;
    float right = coverageAt(textureCoord + vec2(tap.x, 0.0));
    float left = coverageAt(textureCoord - vec2(tap.x, 0.0));
    float up = coverageAt(textureCoord - vec2(0.0, tap.y));
    float down = coverageAt(textureCoord + vec2(0.0, tap.y));
    return height / (2.0 * width) * vec2(right - left, up - down);
}
`;
