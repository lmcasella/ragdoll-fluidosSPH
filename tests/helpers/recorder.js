import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { LEVEL } from "../../js/level.js";

const CIRCLE = 0;
const POLYGON = 2;

const round = (v) => Math.round(v * 1000) / 1000;

/**
 * Formas de una pieza en su marco local (metros). Corre una sola vez por pieza, al empezar a grabar: los
 * wrappers de Box2D que usa son referencias a objetos del mundo y no se destruyen.
 */
function localShapes(body) {
    const shapes = [];
    for (let f = body.GetFixtureList(); Box2D.getPointer(f) !== 0; f = f.GetNext()) {
        const shape = f.GetShape();
        const type = shape.GetType();
        if (type === POLYGON) {
            const poly = Box2D.castObject(shape, Box2D.b2PolygonShape);
            const verts = [];
            for (let i = 0; i < poly.GetVertexCount(); i++) {
                const v = poly.GetVertex(i);
                verts.push([round(v.get_x()), round(v.get_y())]);
            }
            shapes.push({ poly: verts });
        } else if (type === CIRCLE) {
            const circle = Box2D.castObject(shape, Box2D.b2CircleShape);
            const c = circle.get_m_p();
            shapes.push({ circle: [round(c.get_x()), round(c.get_y()), round(circle.get_m_radius())] });
        }
    }
    return shapes;
}

/**
 * Graba un escenario del juego, un registro por frame, para reproducirlo en `tests/tools/viewer.html`.
 * Las partículas se leen de los buffers `HEAPF32`/`HEAP32` y de las piezas solo se piden posición y ángulo:
 * grabar no crea objetos `Box2D.*` por frame.
 *
 * Formato: `{ meta, frames }`. `meta` trae `view` [x0, y0, x1, y1], `dt`, los `solids` del nivel como
 * { x, y, w, h }, las `systems` con su radio y las `pieces` con su forma local. Cada frame trae `t`,
 * `particles` (por sistema: `x`, `y`, `color` RGB entero que identifica el material y `tag` = userData),
 * `pieces` ([x, y, ángulo] en el orden de `meta.pieces`) y `eta` (perfil del campo de alturas; vacío
 * hasta que exista el campo).
 *
 * `systems` es un objeto { nombre: particleSystem }; `pieces` un objeto { id: body }.
 */
export class Recorder {
    constructor({ name, systems, pieces, dt = 1 / 60, view = [-1, -1, 57, 18], solids = LEVEL.solids }) {
        this.name = name;
        this.systems = Object.entries(systems);
        this.pieces = Object.entries(pieces);
        this.dt = dt;
        this.frames = [];
        this.meta = {
            name,
            view,
            dt,
            solids: solids.map(({ x, y, w, h }) => ({ x, y, w, h })),
            systems: this.systems.map(([id, system]) => ({ id, radius: round(system.GetRadius()) })),
            pieces: this.pieces.map(([id, body]) => ({ id, shapes: localShapes(body) })),
        };
    }

    /** Agrega el estado actual del mundo como un frame nuevo. `eta` es el perfil del campo, si existe. */
    capture(eta = []) {
        const particles = this.systems.map(([id, system]) => {
            const count = system.GetParticleCount();
            const pos = Box2D.getPointer(system.GetPositionBuffer()) >> 2;
            const col = Box2D.getPointer(system.GetColorBuffer());
            const tags = system.GetUserDataBuffer() >> 2;
            const x = new Array(count);
            const y = new Array(count);
            const color = new Array(count);
            const tag = new Array(count);
            for (let i = 0; i < count; i++) {
                x[i] = round(Box2D.HEAPF32[pos + 2 * i]);
                y[i] = round(Box2D.HEAPF32[pos + 2 * i + 1]);
                color[i] = (Box2D.HEAPU8[col + 4 * i] << 16) | (Box2D.HEAPU8[col + 4 * i + 1] << 8) | Box2D.HEAPU8[col + 4 * i + 2];
                tag[i] = Box2D.HEAP32[tags + i];
            }
            return { id, x, y, color, tag };
        });
        const pieces = this.pieces.map(([, body]) => {
            const p = body.GetPosition();
            return [round(p.get_x()), round(p.get_y()), round(body.GetAngle())];
        });
        this.frames.push({ t: round(this.frames.length * this.dt), particles, pieces, eta });
    }

    /** Escribe la grabación en `file` como JSON y devuelve su ruta. */
    save(file) {
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, JSON.stringify({ meta: this.meta, frames: this.frames }));
        return file;
    }
}

/**
 * Arma un `Recorder` sobre el estado de `loadGame()`: los sistemas de partículas y las piezas de ambos robots.
 * Hay que crearlo después de los frames iniciales; si la ronda reinicia, las piezas ya no son las mismas.
 */
export function recordGame(game, name, options = {}) {
    const { particleSystem, poolSystem, players } = game.state;
    const pieces = {};
    players.forEach((player, k) => {
        for (const [id, body] of player.rag.bodies.entries()) pieces[`j${k + 1}:${id}`] = body;
    });
    return new Recorder({ name, systems: { disparos: particleSystem, pileta: poolSystem }, pieces, ...options });
}
