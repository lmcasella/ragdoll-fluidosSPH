/**
 * Un hijo de `rag.view` por cada cuerpo del robot: el cuerpo que lo mueve, el id de ese cuerpo en el JSON, el contenedor
 * que se mueve (`display`), la pintura que recibe el tinte de los efectos (`paint`) y su oscurecido (`shade`, de 0 a 1,
 * menor que 1 en las piezas de atrás). `tint` guarda el último tinte puesto, para no repetirlo.
 * @typedef {object} RagdollPart
 * @property {*} body `Box2D.b2Body` que mueve la pieza
 * @property {string} bodyId id del cuerpo en el JSON del robot
 * @property {PIXI.Container} display
 * @property {PIXI.Container} paint
 * @property {PIXI.Container} trim detalle de acero, con su tinte fijo
 * @property {number} shade
 * @property {number} [tint] último tinte puesto, `0xRRGGBB`
 */

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
        part.display.position.set(position.get_x() * pixelsPerMeter, -position.get_y() * pixelsPerMeter);
        part.display.rotation = -part.body.GetAngle();
    }
}
