import { TAU } from "../core/math/scalar.js";
import { polygonArea } from "../core/math/geometry.js";
import { forEachFixture } from "../core/engine/box2d.js";

/** Tipos de forma de Box2D (`b2Shape::Type`). */
const CIRCLE = 0;
const POLYGON = 2;

/** Lados del polígono que reemplaza a un círculo. */
export const CIRCLE_SIDES = 16;

/**
 * Radio con el que el 16-gono de un círculo de radio `r` conserva su área: `r · √(2π / (n sin(2π/n)))`.
 */
const AREA_SCALE = Math.sqrt(TAU / (CIRCLE_SIDES * Math.sin(TAU / CIRCLE_SIDES)));

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
    forEachFixture(body, addFixtureShape, shapes);
    return shapes;
}

/**
 * Suma a `shapes` el polígono de un fixture; ignora los tipos de forma que no son círculo ni polígono.
 * @param {object} fixture `b2Fixture`.
 * @param {{ n: number, verts: Float64Array, kind: string, area: number }[]} shapes forma acumulada del cuerpo.
 */
function addFixtureShape(fixture, shapes) {
    const shape = fixture.GetShape();
    const type = shape.GetType();
    if (type === POLYGON) {
        const polygon = Box2D.castObject(shape, Box2D.b2PolygonShape);
        const n = polygon.GetVertexCount();
        const verts = new Float64Array(2 * n);
        for (let i = 0; i < n; i++) {
            const vertex = polygon.GetVertex(i);
            verts[2 * i] = vertex.get_x();
            verts[2 * i + 1] = vertex.get_y();
        }
        shapes.push({ n, verts, kind: "box", area: polygonArea(verts, n) });
    } else if (type === CIRCLE) {
        const circle = Box2D.castObject(shape, Box2D.b2CircleShape);
        const center = circle.get_m_p();
        const radius = circle.get_m_radius() * AREA_SCALE;
        const verts = new Float64Array(2 * CIRCLE_SIDES);
        for (let i = 0; i < CIRCLE_SIDES; i++) {
            const angle = (TAU * i) / CIRCLE_SIDES;
            verts[2 * i] = center.get_x() + radius * Math.cos(angle);
            verts[2 * i + 1] = center.get_y() + radius * Math.sin(angle);
        }
        shapes.push({ n: CIRCLE_SIDES, verts, kind: "circle", area: polygonArea(verts, CIRCLE_SIDES) });
    }
}