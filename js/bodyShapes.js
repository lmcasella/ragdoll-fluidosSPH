/** Tipos de forma de Box2D (`b2Shape::Type`). */
const CIRCLE = 0;
const POLYGON = 2;

/** Lados del polígono que reemplaza a un círculo. */
export const CIRCLE_SIDES = 16;

/**
 * Radio con el que el 16-gono de un círculo de radio `r` conserva su área: `r · √(2π / (n sin(2π/n)))`.
 */
const AREA_SCALE = Math.sqrt((2 * Math.PI) / (CIRCLE_SIDES * Math.sin((2 * Math.PI) / CIRCLE_SIDES)));

/**
 * Formas de un cuerpo como polígonos convexos en su marco local (docs/design/14-agua.md §14.5). Lee la lista de
 * fixtures una sola vez: los círculos se reemplazan por un 16-gono de la misma área y los polígonos de Box2D ya vienen en
 * sentido antihorario. No crea objetos nativos: los wrappers que usa son referencias a objetos del mundo.
 * Cada forma es `{ n, verts, kind, area }`, con `verts` un `Float64Array` `[x0, y0, x1, y1, …]` (m), `kind` la clave de
 * `MATERIALS.drag` (`"box"` o `"circle"`) y `area` en m².
 * @param {object} body `b2Body`.
 * @returns {{ n: number, verts: Float64Array, kind: string, area: number }[]}
 */
export function bodyShapes(body) {
    const shapes = [];
    for (let f = body.GetFixtureList(); Box2D.getPointer(f) !== 0; f = f.GetNext()) {
        const shape = f.GetShape();
        const type = shape.GetType();
        if (type === POLYGON) {
            const poly = Box2D.castObject(shape, Box2D.b2PolygonShape);
            const n = poly.GetVertexCount();
            const verts = new Float64Array(2 * n);
            for (let i = 0; i < n; i++) {
                const v = poly.GetVertex(i);
                verts[2 * i] = v.get_x();
                verts[2 * i + 1] = v.get_y();
            }
            shapes.push({ n, verts, kind: "box", area: polygonArea(verts, n) });
        } else if (type === CIRCLE) {
            const circle = Box2D.castObject(shape, Box2D.b2CircleShape);
            const center = circle.get_m_p();
            const radius = circle.get_m_radius() * AREA_SCALE;
            const verts = new Float64Array(2 * CIRCLE_SIDES);
            for (let i = 0; i < CIRCLE_SIDES; i++) {
                const a = (2 * Math.PI * i) / CIRCLE_SIDES;
                verts[2 * i] = center.get_x() + radius * Math.cos(a);
                verts[2 * i + 1] = center.get_y() + radius * Math.sin(a);
            }
            shapes.push({ n: CIRCLE_SIDES, verts, kind: "circle", area: polygonArea(verts, CIRCLE_SIDES) });
        }
    }
    return shapes;
}

/** Área (m²) de un polígono `[x0, y0, x1, y1, …]` de `n` vértices; positiva si es antihorario. */
export function polygonArea(verts, n) {
    let sum = 0;
    for (let i = 0, j = n - 1; i < n; j = i++) {
        sum += verts[2 * j] * verts[2 * i + 1] - verts[2 * i] * verts[2 * j + 1];
    }
    return sum / 2;
}
