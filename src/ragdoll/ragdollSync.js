/**
 * Un hijo de `rag.view` por cada fixture del robot: el cuerpo que lo mueve, el id de ese cuerpo en el JSON, lo que se
 * dibuja (`fill`, que recibe el tinte de los efectos) y su contorno opcional (`outline`, que nunca se tiñe). `tint`
 * guarda el último tinte puesto, para no repetirlo.
 * @typedef {object} RagdollPart
 * @property {*} body `Box2D.b2Body` que mueve la pieza
 * @property {string} bodyId id del cuerpo en el JSON del robot
 * @property {PIXI.Container} fill
 * @property {PIXI.Container|null} outline
 * @property {number} [tint] último tinte puesto, `0xRRGGBB`
 */

/**
 * Pone un hijo de `rag.view` en la pose de su cuerpo.
 * @param {PIXI.Container} display
 * @param {number} x posición, en px (Y hacia abajo)
 * @param {number} y posición, en px (Y hacia abajo)
 * @param {number} rotation ángulo, en rad (sentido horario)
 */
function placeDisplay(display, x, y, rotation) {
    display.position.set(x, y);
    display.rotation = rotation;
}

/**
 * Sincroniza los hijos de `rag.view` con la física: es lo único que se hace por frame con la geometría. `rag.view` cuelga
 * de un contenedor con la Y invertida (`docs/design/07-sph.md` §7.4), así que la posición baja con `-y` y el ángulo
 * con `-ángulo`. Un `sync()` de la librería reemplazaría a esta función sin tocar nada más.
 * @param {RagdollPart[]} parts
 * @param {number} pixelsPerMeter px por metro del JSON del robot
 */
export function syncParts(parts, pixelsPerMeter) {
    for (const part of parts) {
        const position = part.body.GetPosition();
        const x = position.get_x() * pixelsPerMeter;
        const y = -position.get_y() * pixelsPerMeter;
        const rotation = -part.body.GetAngle();
        placeDisplay(part.fill, x, y, rotation);
        if (part.outline) placeDisplay(part.outline, x, y, rotation);
    }
}
