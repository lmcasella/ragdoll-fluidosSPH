/** Factor de X de un robot espejado (`flipX`) y de uno sin espejar. */
const MIRRORED = -1;
const NOT_MIRRORED = 1;

/** Mitad de una medida: el JSON guarda ancho y alto completos y la pieza usa semiancho y semialto. */
const HALF = 0.5;

/**
 * Piezas de render de un robot, en metros y en el marco de su cuerpo, a partir de su `.rag.json`. Las usan el dibujo de
 * las figuras, los efectos de mojado y las superficies del agua dibujada (`docs/design/03-robots.md`).
 * @param {object} rag instancia de RagImporter con `bodies`
 * @param {object} json `.rag.json` del robot, con `bodies[].fixtures[].shape`
 * @param {boolean} flipX espeja las piezas en X
 * @returns {object[]} una pieza por fixture: `body`, `bodyId`, `type` ("box", "circle" o "polygon"), centro `centerX` y `centerY` (m),
 *   `angle` (rad) y, según el tipo, `halfWidth` y `halfHeight` (semiancho y semialto, m), `radius` (m) o `vertices` (`[x, y]` en m)
 */
export function buildRenderItems(rag, json, flipX) {
    const mirror = flipX ? MIRRORED : NOT_MIRRORED;
    const items = [];
    for (const bodyDef of json.bodies) {
        const body = rag.bodies.get(bodyDef.id);
        for (const fixtureDef of bodyDef.fixtures) {
            const shape = fixtureDef.shape;
            const item = {
                body,
                bodyId: bodyDef.id,
                type: shape.type,
                centerX: (shape.center?.[0] ?? 0) * mirror,
                centerY: shape.center?.[1] ?? 0,
                angle: (shape.angle ?? 0) * mirror,
            };
            if (shape.type === "box") {
                item.halfWidth = shape.width * HALF;
                item.halfHeight = shape.height * HALF;
            } else if (shape.type === "circle") {
                item.radius = shape.radius;
            } else if (shape.type === "polygon") {
                item.vertices = shape.vertices.map(([vertexX, vertexY]) => [vertexX * mirror, vertexY]);
            }
            items.push(item);
        }
    }
    return items;
}
