import { FLUID } from "./weapons.js";
import { MATERIALS, SIGMA_W } from "./materials.js";
import { KIND_MATERIAL } from "./immersion.js";
import { bodyShapes } from "./bodyShapes.js";

/** Densidad del agua (kg/m³). */
const RHO_W = 1000;

/** Espesor `b` de la rebanada 2D (m): `σ_w / ρ_w`. Pasa los esfuerzos de película a newtons. */
const THICKNESS = SIGMA_W / RHO_W;

/** Tipos de cuerpo de Box2D (2BodyType). */
const STATIC = 0;
const DYNAMIC = 2;

/** Distancia máxima de la película, en radios de partícula (docs/design/14-agua.md §14.10). */
const FILM_RADII = 2;

/** Cota inferior de `δ`, en radios de partícula: evita que `μ / δ` diverja con una partícula sobre la superficie. */
const MIN_DELTA_RADII = 0.25;

/**
 * Fluidos que forman película sobre un cuerpo: agua, ácido y miel. La lava y la piedra tienen su propia viscosidad de
 * contacto (`js/viscosity.js`) y el vapor no moja.
 */
const FILM_KINDS = new Set([FLUID.WATER, FLUID.ACID, FLUID.HONEY]);

/**
 * Viscosidad dinámica (Pa·s) de la mezcla de miel y agua de fracción de miel `X`, a temperatura fija, por la regla
 * logarítmica de Arrhenius: `ln μ = X ln μ_miel + (1 − X) ln μ_agua`. Es el único lugar donde adhesión conoce `μ(X)`: la
 * viscosidad por concentración y temperatura de #76 reemplaza esta función.
 * @param {number} X Fracción de miel, de 0 (agua) a 1 (miel pura).
 * @returns {number}
 */
export function mixtureViscosity(X) {
    return Math.exp(X * Math.log(MATERIALS.honey.mu) + (1 - X) * Math.log(MATERIALS.water.mu));
}

/**
 * Adherencia de la miel a los cuerpos (docs/design/14-agua.md §14.10, #77). Una vez por paso fijo, después de
 * `stepWorld` y `store.afterStep()`, `step(dt)` busca las partículas de agua, ácido y miel a menos de `2 r` de la
 * superficie de alguna pieza de los robots registrados (distancia punto–polígono sobre las formas de `bodyShapes`,
 * filtradas por la caja de cada robot y de cada pieza) y les aplica la fuerza viscosa de una película sobre la
 * velocidad relativa `v_r = v_p − v_cuerpo(q)` en el punto más cercano `q`, solo con la pieza más cercana:
 *
 * - tangencial, `F = k v_t` con `k = filmFactor μ(X) b d / δ` (`τ = μ v_t / δ` sobre el área `d · b` de la partícula,
 *   `d = 1,5 r`, `b` el espesor de la rebanada), con `δ` la distancia a la superficie, acotada a `0,25 r`;
 * - normal, solo si la partícula se separa (`v_r · n > 0`, adhesión de Stefan): el mismo `k`.
 *
 * Cada componente se integra en forma exacta, `v_r ← v_r exp(−k dt (1/m_p + 1/m_c + (q × e)²/I))` con `m_p`, `m_c` e `I`
 * las masas y la inercia reales (la pieza estática vale masa infinita), así que no invierte la velocidad relativa con
 * ninguna `dt`. El impulso opuesto va al cuerpo con `ApplyLinearImpulse` en `q`. `filmFactor` de `MATERIALS.honey` es el
 * factor geométrico de la película, medido con Couette (`tests/tools/film-calibration.js`).
 *
 * `stats`: `contacts` (partículas con película en el último paso), `particleX/Y` e `bodyX/Y` (cantidad de movimiento,
 * kg·m/s de la rebanada, entregada a las partículas y a los cuerpos; con piezas dinámicas suman cero, y una pieza
 * estática absorbe el suyo como si fuera un cuerpo) y `magnitude` (suma de los módulos de cada impulso, kg·m/s). Reusa buffers y dos `b2Vec2` propios: `dispose` los libera.
 */
export class Adhesion {
    constructor(system, store, { filmFactor = MATERIALS.honey.filmFactor } = {}) {
        this.system = system;
        this.store = store;
        this.filmFactor = filmFactor;
        this.radius = system.GetRadius();
        this.diameter = 1.5 * this.radius;
        this.reach = FILM_RADII * this.radius;
        this.minDelta = MIN_DELTA_RADII * this.radius;
        this.area = this.diameter * this.diameter;
        this.kinds = new Uint8Array(256);
        this.mass = new Float64Array(256);
        this.honey = new Float64Array(256);
        for (const kind of FILM_KINDS) {
            this.kinds[kind] = 1;
            this.mass[kind] = KIND_MATERIAL[kind].material.SG * SIGMA_W * this.area;
            this.honey[kind] = KIND_MATERIAL[kind].honey;
        }
        this.robots = [];
        this.pieces = [];
        this.stats = { contacts: 0, particleX: 0, particleY: 0, bodyX: 0, bodyY: 0, magnitude: 0 };
        this.impulse = new Box2D.b2Vec2(0, 0);
        this.point = new Box2D.b2Vec2(0, 0);
        this.near = { dist: 0, nx: 0, ny: 0, qx: 0, qy: 0 };
    }

    /** Libera los vectores nativos. */
    dispose() {
        Box2D.destroy(this.impulse);
        Box2D.destroy(this.point);
    }

    /**
     * Lee las formas de todos los cuerpos de `players` (cada uno con `rag.bodies`); se vuelve a llamar cada vez que
     * cambian los robots (aparición, giro, ronda nueva), igual que `Buoyancy.register`.
     */
    register(players) {
        this.robots = [];
        this.pieces = [];
        for (const player of players) {
            const robot = { pieces: [], box: new Float64Array(4) };
            for (const body of player.rag.bodies.values()) {
                const shapes = bodyShapes(body);
                if (shapes.length === 0) continue;
                const world = shapes.map((s) => new Float64Array(2 * s.n));
                const piece = { body, shapes, world, box: new Float64Array(4), dynamic: body.GetType() === DYNAMIC, moving: body.GetType() !== STATIC, impulseX: 0, impulseY: 0 };
                robot.pieces.push(piece);
                this.pieces.push(piece);
            }
            this.robots.push(robot);
        }
    }

    /** Pone la transformación y la caja (con el alcance de la película) de cada pieza en el mundo, y la de cada robot. */
    prepare() {
        const reach = this.reach;
        for (const robot of this.robots) {
            let rx0 = Infinity;
            let ry0 = Infinity;
            let rx1 = -Infinity;
            let ry1 = -Infinity;
            for (const piece of robot.pieces) {
                const body = piece.body;
                piece.impulseX = 0;
                piece.impulseY = 0;
                const pos = body.GetPosition();
                const angle = body.GetAngle();
                const cos = Math.cos(angle);
                const sin = Math.sin(angle);
                const px = pos.get_x();
                const py = pos.get_y();
                let x0 = Infinity;
                let y0 = Infinity;
                let x1 = -Infinity;
                let y1 = -Infinity;
                for (let s = 0; s < piece.shapes.length; s++) {
                    const { n, verts } = piece.shapes[s];
                    const world = piece.world[s];
                    for (let i = 0; i < n; i++) {
                        const lx = verts[2 * i];
                        const ly = verts[2 * i + 1];
                        const wx = px + cos * lx - sin * ly;
                        const wy = py + sin * lx + cos * ly;
                        world[2 * i] = wx;
                        world[2 * i + 1] = wy;
                        if (wx < x0) x0 = wx;
                        if (wx > x1) x1 = wx;
                        if (wy < y0) y0 = wy;
                        if (wy > y1) y1 = wy;
                    }
                }
                piece.box[0] = x0 - reach;
                piece.box[1] = y0 - reach;
                piece.box[2] = x1 + reach;
                piece.box[3] = y1 + reach;
                if (x0 < rx0) rx0 = x0;
                if (y0 < ry0) ry0 = y0;
                if (x1 > rx1) rx1 = x1;
                if (y1 > ry1) ry1 = y1;
            }
            robot.box[0] = rx0 - reach;
            robot.box[1] = ry0 - reach;
            robot.box[2] = rx1 + reach;
            robot.box[3] = ry1 + reach;
        }
    }

    /**
     * Distancia de `(x, y)` al polígono convexo antihorario `world` de `n` vértices, con el punto más cercano y la normal
     * saliente en `this.near`. Un punto dentro vale distancia 0, con la arista menos hundida.
     */
    polygonDistance(world, n, x, y) {
        let best = Infinity;
        let maxD = -Infinity;
        let bx = 0;
        let by = 0;
        let inx = 0;
        let iny = 0;
        for (let i = 0, j = n - 1; i < n; j = i++) {
            const ax = world[2 * j];
            const ay = world[2 * j + 1];
            const ex = world[2 * i] - ax;
            const ey = world[2 * i + 1] - ay;
            const len2 = ex * ex + ey * ey;
            if (len2 < 1e-18) continue;
            const len = Math.sqrt(len2);
            const d = ((x - ax) * ey - (y - ay) * ex) / len;
            if (d > maxD) {
                maxD = d;
                inx = ey / len;
                iny = -ex / len;
            }
            let t = ((x - ax) * ex + (y - ay) * ey) / len2;
            t = t < 0 ? 0 : t > 1 ? 1 : t;
            const cx = ax + t * ex;
            const cy = ay + t * ey;
            const dist2 = (x - cx) * (x - cx) + (y - cy) * (y - cy);
            if (dist2 < best) {
                best = dist2;
                bx = cx;
                by = cy;
            }
        }
        const near = this.near;
        if (maxD <= 0) {
            near.dist = 0;
            near.nx = inx;
            near.ny = iny;
            near.qx = x - maxD * inx;
            near.qy = y - maxD * iny;
        } else {
            const dist = Math.sqrt(best);
            near.dist = dist;
            near.nx = dist > 0 ? (x - bx) / dist : inx;
            near.ny = dist > 0 ? (y - by) / dist : iny;
            near.qx = bx;
            near.qy = by;
        }
    }

    /** Aplica la película de este paso a todas las partículas cercanas. `dt` es el paso fijo (s). */
    step(dt) {
        const stats = this.stats;
        stats.contacts = 0;
        stats.particleX = 0;
        stats.particleY = 0;
        stats.bodyX = 0;
        stats.bodyY = 0;
        stats.magnitude = 0;
        const total = this.system.GetParticleCount();
        if (total === 0 || this.pieces.length === 0) return;
        this.prepare();
        const store = this.store;
        const pos = Box2D.getPointer(this.system.GetPositionBuffer()) >> 2;
        const vel = Box2D.getPointer(this.system.GetVelocityBuffer()) >> 2;
        const heap = Box2D.HEAPF32;
        const reach = this.reach;
        for (let i = 0; i < total; i++) {
            const slot = store.slotAt(i);
            if (slot < 0 || store.alive[slot] === 0) continue;
            const kind = store.kind[slot];
            if (this.kinds[kind] === 0) continue;
            const x = heap[pos + 2 * i];
            const y = heap[pos + 2 * i + 1];
            for (const robot of this.robots) {
                const rb = robot.box;
                if (x < rb[0] || x > rb[2] || y < rb[1] || y > rb[3]) continue;
                for (const piece of robot.pieces) {
                    const pb = piece.box;
                    if (x < pb[0] || x > pb[2] || y < pb[1] || y > pb[3]) continue;
                    let foundDist = reach;
                    let found = false;
                    const near = this.near;
                    let nx = 0;
                    let ny = 0;
                    let qx = 0;
                    let qy = 0;
                    for (let s = 0; s < piece.shapes.length; s++) {
                        this.polygonDistance(piece.world[s], piece.shapes[s].n, x, y);
                        if (near.dist <= foundDist) {
                            foundDist = near.dist;
                            found = true;
                            nx = near.nx;
                            ny = near.ny;
                            qx = near.qx;
                            qy = near.qy;
                        }
                    }
                    if (found) this.film(i, vel, kind, piece, foundDist, nx, ny, qx, qy, dt);
                }
            }
        }
    }
    /** Película entre la partícula `i` y la pieza `piece`, con la geometría ya resuelta. */
    film(i, vel, kind, piece, dist, nx, ny, qx, qy, dt) {
        const heap = Box2D.HEAPF32;
        const stats = this.stats;
        const body = piece.body;
        const dynamic = piece.dynamic;
        const mass = this.mass[kind];
        const center = body.GetWorldCenter();
        const cx = center.get_x();
        const cy = center.get_y();
        const rx = qx - cx;
        const ry = qy - cy;
        let vbx = 0;
        let vby = 0;
        let invBody = 0;
        let invInertia = 0;
        if (piece.moving) {
            const v = body.GetLinearVelocity();
            const omega = body.GetAngularVelocity();
            vbx = v.get_x() - omega * ry;
            vby = v.get_y() + omega * rx;
        }
        if (dynamic) {
            invBody = 1 / body.GetMass();
            const local = body.GetLocalCenter();
            const inertia = body.GetInertia() - body.GetMass() * (local.get_x() * local.get_x() + local.get_y() * local.get_y());
            invInertia = inertia > 0 ? 1 / inertia : 0;
        }
        const vrx = heap[vel + 2 * i] - vbx;
        const vry = heap[vel + 2 * i + 1] - vby;
        const vn = vrx * nx + vry * ny;
        const tx = -ny;
        const ty = nx;
        const vt = vrx * tx + vry * ty;
        const delta = Math.max(dist, this.minDelta);
        const k = (this.filmFactor * mixtureViscosity(this.honey[kind]) * THICKNESS * this.diameter) / delta;
        const invParticle = 1 / mass;

        const armT = rx * ty - ry * tx;
        const invT = invParticle + invBody + armT * armT * invInertia;
        const jt = ((1 - Math.exp(-k * dt * invT)) * vt) / invT;
        let jx = jt * tx;
        let jy = jt * ty;
        if (vn > 0) {
            const armN = rx * ny - ry * nx;
            const invN = invParticle + invBody + armN * armN * invInertia;
            const jn = ((1 - Math.exp(-k * dt * invN)) * vn) / invN;
            jx += jn * nx;
            jy += jn * ny;
        }
        heap[vel + 2 * i] -= jx / mass;
        heap[vel + 2 * i + 1] -= jy / mass;
        stats.particleX -= jx;
        stats.particleY -= jy;
        stats.bodyX += jx;
        stats.bodyY += jy;
        piece.impulseX += jx;
        piece.impulseY += jy;
        stats.magnitude += Math.hypot(jx, jy);
        stats.contacts++;
        if (dynamic) {
            this.impulse.set_x(jx);
            this.impulse.set_y(jy);
            this.point.set_x(qx);
            this.point.set_y(qy);
            body.ApplyLinearImpulse(this.impulse, this.point, true);
        }
    }
}
