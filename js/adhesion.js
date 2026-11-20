import { FLUID } from "./weapons.js";
import { MATERIALS, SIGMA_W } from "./materials.js";
import { KIND_MATERIAL } from "./immersion.js";
import { Contacts } from "./contacts.js";

/** Densidad del agua (kg/m³). */
const RHO_W = 1000;

/** Espesor `b` de la rebanada 2D (m): `σ_w / ρ_w`. Pasa los esfuerzos de película a newtons. */
const THICKNESS = SIGMA_W / RHO_W;

/** Tipos de cuerpo de Box2D (2BodyType). */
const STATIC = 0;
const DYNAMIC = 2;

/** Coeficiente de la película tangencial: Couette sobre media capa, `k_t = 2 μ_ef b`. */
const TANGENTIAL = 2;

/** Coeficiente de la película normal al separarse: Trouton cohesivo, `k_n = 3 μ_ef b`. */
const NORMAL = 3;

/**
 * Separación máxima del puente de miel, en radios de partícula: `2 r + d` con `d = 1,5 r`. El hilo que une la partícula a la
 * superficie se estira un diámetro más allá del rango de contacto de LiquidFun (`2 r`) y se corta.
 */
const BRIDGE_CUT_RADII = 3.5;

/**
 * Fluidos que forman película sobre un cuerpo: los que tienen miel (`X > 0`). Con la `μ` del agua o del ácido el efecto es
 * despreciable (`k ~ 1e-5`). La lava y la piedra tienen su propia viscosidad de contacto (`js/viscosity.js`).
 */
const FILM_KINDS = new Set([FLUID.HONEY]);

/**
 * Viscosidad dinámica efectiva (Pa·s) de la mezcla de miel y agua de fracción de miel `X`, a temperatura fija, por la regla
 * logarítmica de Arrhenius: `ln μ = X ln μ_ef,miel + (1 − X) ln μ_agua`, con `μ_ef,miel = viscosityScale · μ_miel`
 * (similitud viscosa-gravitatoria de `MATERIALS.honey`). Es el único lugar donde adhesión conoce `μ(X)`: la viscosidad por
 * concentración y temperatura de #76 reemplaza esta función.
 * @param {number} X Fracción de miel, de 0 (agua) a 1 (miel pura).
 * @returns {number}
 */
export function mixtureViscosity(X) {
    const honey = MATERIALS.honey;
    return Math.exp(X * Math.log(honey.mu * honey.viscosityScale) + (1 - X) * Math.log(MATERIALS.water.mu));
}

/**
 * Adherencia de la miel a los cuerpos (docs/design/14-agua.md §14.10, #77, #214). Corre por subpaso como pseudo-instancia
 * de `stepWorld` (`update(substep)`), registrada después de `WallContact`. Lee los contactos partícula–cuerpo que calcula
 * LiquidFun (`js/contacts.js`) y, para cada partícula de miel con contacto, usa el de mayor peso: la película
 * actúa contra cualquier cuerpo (estático, cinemático o dinámico) sobre la velocidad relativa `v_r = v_p − v_cuerpo(q)` en el
 * punto de anclaje `q` (la proyección de la partícula sobre la superficie), con la `μ_ef(X)` de `mixtureViscosity` y
 * `b = σ_w / ρ_w`:
 *
 * - tangencial, `F = k_t v_t` con `k_t = 2 μ_ef b` (Couette sobre media capa);
 * - normal, solo si la partícula se separa (`v_r · n > 0`): `k_n = 3 μ_ef b` (Trouton cohesivo).
 *
 * Puente de miel: una partícula con `X > 0` que llega a un cuerpo (`v_r · n ≤ 0`; la que sale disparada no se engancha) guarda, por slot, el cuerpo, `q` y la normal `n` en
 * coordenadas locales del cuerpo. Mientras dure el puente la película sigue actuando aunque LiquidFun ya no reporte contacto
 * (el motor expulsa a la partícula hasta `2 r`): cada subpaso `q` y `n` se pasan a mundo con la transformada actual del
 * cuerpo. Con contacto, `q` se actualiza a la proyección actual (desliza por la pared); con dos cuerpos se conserva el de
 * mayor peso. El puente se corta cuando `(p − q) · n` supera `2 r + d`, cuando la partícula muere o su slot se reutiliza
 * (generación de `ParticleStore`), cuando el material deja de tener miel, o cuando `WallContact` descarta los contactos
 * (se destruyeron cuerpos: todos los puentes se sueltan).
 *
 * Cada componente se integra en forma exacta, `v_r ← v_r exp(−k dt (1/m_p + 1/m_c + (q × e)²/I))` con `m_p`, `m_c` e `I`
 * las masas y la inercia reales (el cuerpo estático vale masa infinita), así que no invierte la velocidad relativa con
 * ninguna `dt`. El cuerpo dinámico recibe el impulso opuesto con `ApplyLinearImpulse` en `q`; el cinemático no lo recibe. Se
 * saltea toda la partícula a la que `WallContact` le impuso la salida lateral en ese subpaso.
 *
 * `stats` (acumulan hasta `resetStats`): `contacts` (partículas con película), `bridges` (de ellas, con puente sin contacto),
 * `particleX/Y` y `bodyX/Y` (cantidad de movimiento, kg·m/s de la rebanada, entregada a las partículas y a los cuerpos
 * dinámicos), `staticX/Y` (la que absorben los cuerpos estáticos y cinemáticos; los tres suman cero) y `magnitude` (suma
 * de los módulos de cada impulso, kg·m/s). Reusa buffers y `b2Vec2` propios: `dispose` los libera.
 */
export class Adhesion {
    /**
     * @param {*} system `b2ParticleSystem` de las partículas.
     * @param {*} store `ParticleStore` del sistema.
     * @param {*} wallContact `WallContact` del mismo sistema: corre antes en cada subpaso.
     */
    constructor(system, store, wallContact) {
        this.system = system;
        this.store = store;
        this.wallContact = wallContact;
        this.contacts = new Contacts(system);
        this.radius = system.GetRadius();
        this.diameter = 1.5 * this.radius;
        this.area = this.diameter * this.diameter;
        this.cut = BRIDGE_CUT_RADII * this.radius;
        this.kinds = new Uint8Array(256);
        this.mass = new Float64Array(256);
        this.mu = new Float64Array(256);
        this.honey = new Float64Array(256);
        for (const kind of FILM_KINDS) {
            this.kinds[kind] = 1;
            this.mass[kind] = KIND_MATERIAL[kind].material.SG * SIGMA_W * this.area;
            this.honey[kind] = KIND_MATERIAL[kind].honey;
            this.mu[kind] = mixtureViscosity(this.honey[kind]);
        }
        const capacity = Math.max(system.GetMaxParticleCount(), 1);
        this.best = new Int32Array(capacity);
        this.stamp = new Uint32Array(capacity);
        this.tick = 0;
        const slots = store.capacity;
        this.bridgeGen = new Uint32Array(slots);
        this.bridgeBody = new Int32Array(slots);
        this.bridgeWeight = new Float32Array(slots);
        this.bridgeX = new Float32Array(slots);
        this.bridgeY = new Float32Array(slots);
        this.bridgeNx = new Float32Array(slots);
        this.bridgeNy = new Float32Array(slots);
        this.impulse = new Box2D.b2Vec2(0, 0);
        this.point = new Box2D.b2Vec2(0, 0);
        this.resetStats();
    }

    /** Pone en cero las estadísticas. */
    resetStats() {
        this.stats = { contacts: 0, bridges: 0, particleX: 0, particleY: 0, bodyX: 0, bodyY: 0, staticX: 0, staticY: 0, magnitude: 0 };
    }

    /** Libera los vectores nativos. */
    dispose() {
        Box2D.destroy(this.impulse);
        Box2D.destroy(this.point);
    }

    /**
     * Un subpaso, antes de `world.Step`.
     * @param {number} substep Duración del subpaso en segundos.
     */
    update(substep) {
        if (this.wallContact.skipped) {
            this.bridgeGen.fill(0);
            return;
        }
        const { system, store, contacts } = this;
        const total = system.GetParticleCount();
        if (total === 0) return;
        const count = contacts.bodies(total);
        const escaped = this.wallContact.escaped;
        const vel = Box2D.getPointer(system.GetVelocityBuffer()) >> 2;
        const pos = Box2D.getPointer(system.GetPositionBuffer()) >> 2;
        const heap = Box2D.HEAPF32;
        const tick = ++this.tick;
        const { best, stamp } = this;
        const index = contacts.bodyIndex;
        const weight = contacts.bodyW;
        for (let c = 0; c < count; c++) {
            const i = index[c];
            if (escaped[i] === 1) continue;
            const slot = store.slotAt(i);
            if (slot < 0 || store.alive[slot] === 0 || this.kinds[store.kind[slot]] === 0) continue;
            if (stamp[i] !== tick) {
                stamp[i] = tick;
                best[i] = c;
            } else if (weight[c] > weight[best[i]]) {
                best[i] = c;
            }
        }
        const point = this.point;
        for (let c = 0; c < count; c++) {
            const i = index[c];
            if (stamp[i] !== tick || best[i] !== c) continue;
            const slot = store.slotAt(i);
            const nx = contacts.bodyNx[c];
            const ny = contacts.bodyNy[c];
            const gap = Math.max(0, 1 - weight[c]) * 2 * this.radius;
            const qx = heap[pos + 2 * i] - gap * nx;
            const qy = heap[pos + 2 * i + 1] - gap * ny;
            const body = Box2D.wrapPointer(contacts.bodyPtr[c], Box2D.b2Body);
            const held = this.bridgeGen[slot] === store.generation[slot];
            const same = held && this.bridgeBody[slot] === contacts.bodyPtr[c];
            if (same || !held || weight[c] > this.bridgeWeight[slot]) {
                point.set_x(qx);
                point.set_y(qy);
                if (!same && !this.arriving(i, body, vel, nx, ny)) continue;
                const local = body.GetLocalPoint(point);
                this.bridgeX[slot] = local.get_x();
                this.bridgeY[slot] = local.get_y();
                point.set_x(nx);
                point.set_y(ny);
                const normal = body.GetLocalVector(point);
                this.bridgeNx[slot] = normal.get_x();
                this.bridgeNy[slot] = normal.get_y();
                this.bridgeBody[slot] = contacts.bodyPtr[c];
                this.bridgeWeight[slot] = weight[c];
                this.bridgeGen[slot] = store.generation[slot];
            }
        }
        for (let i = 0; i < total; i++) {
            const slot = store.slotAt(i);
            if (slot < 0 || this.bridgeGen[slot] !== store.generation[slot]) continue;
            const kind = store.kind[slot];
            if (store.alive[slot] === 0 || this.honey[kind] === 0) {
                this.bridgeGen[slot] = 0;
                continue;
            }
            if (escaped[i] === 1) continue;
            const body = Box2D.wrapPointer(this.bridgeBody[slot], Box2D.b2Body);
            point.set_x(this.bridgeX[slot]);
            point.set_y(this.bridgeY[slot]);
            const q = body.GetWorldPoint(point);
            const qx = q.get_x();
            const qy = q.get_y();
            point.set_x(this.bridgeNx[slot]);
            point.set_y(this.bridgeNy[slot]);
            const n = body.GetWorldVector(point);
            const nx = n.get_x();
            const ny = n.get_y();
            const separation = (heap[pos + 2 * i] - qx) * nx + (heap[pos + 2 * i + 1] - qy) * ny;
            if (separation > this.cut) {
                this.bridgeGen[slot] = 0;
                continue;
            }
            if (stamp[i] !== tick) this.stats.bridges++;
            this.film(i, kind, body, qx, qy, nx, ny, vel, substep);
        }
    }

    /**
     * Verdadero si la partícula `i` llega al `body` o está en reposo respecto de él (`v_r · n ≤ 0` en el punto `point`, con
     * `n` la normal exterior): solo así se forma un puente nuevo. Una gota que sale disparada de un arma no moja hacia atrás.
     */
    arriving(i, body, vel, nx, ny) {
        const heap = Box2D.HEAPF32;
        let vx = heap[vel + 2 * i];
        let vy = heap[vel + 2 * i + 1];
        if (body.GetType() !== STATIC) {
            const vb = body.GetLinearVelocityFromWorldPoint(this.point);
            vx -= vb.get_x();
            vy -= vb.get_y();
        }
        return vx * nx + vy * ny <= 0;
    }

    /** Película entre la partícula `i` y `body`, con anclaje `(qx, qy)` y normal exterior `(nx, ny)` ya en el mundo. */
    film(i, kind, body, qx, qy, nx, ny, vel, dt) {
        const heap = Box2D.HEAPF32;
        const stats = this.stats;
        const type = body.GetType();
        const dynamic = type === DYNAMIC;
        const mass = this.mass[kind];
        this.point.set_x(qx);
        this.point.set_y(qy);
        let vbx = 0;
        let vby = 0;
        let invBody = 0;
        let invInertia = 0;
        let rx = 0;
        let ry = 0;
        if (type !== STATIC) {
            const vb = body.GetLinearVelocityFromWorldPoint(this.point);
            vbx = vb.get_x();
            vby = vb.get_y();
        }
        if (dynamic) {
            const center = body.GetWorldCenter();
            rx = qx - center.get_x();
            ry = qy - center.get_y();
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
        const mub = this.mu[kind] * THICKNESS;
        const invParticle = 1 / mass;

        const armT = rx * ty - ry * tx;
        const invT = invParticle + invBody + armT * armT * invInertia;
        const kt = TANGENTIAL * mub;
        const jt = ((1 - Math.exp(-kt * dt * invT)) * vt) / invT;
        let jx = jt * tx;
        let jy = jt * ty;
        if (vn > 0) {
            const armN = rx * ny - ry * nx;
            const invN = invParticle + invBody + armN * armN * invInertia;
            const kn = NORMAL * mub;
            const jn = ((1 - Math.exp(-kn * dt * invN)) * vn) / invN;
            jx += jn * nx;
            jy += jn * ny;
        }
        heap[vel + 2 * i] -= jx / mass;
        heap[vel + 2 * i + 1] -= jy / mass;
        stats.particleX -= jx;
        stats.particleY -= jy;
        stats.magnitude += Math.hypot(jx, jy);
        stats.contacts++;
        if (dynamic) {
            stats.bodyX += jx;
            stats.bodyY += jy;
            this.impulse.set_x(jx);
            this.impulse.set_y(jy);
            body.ApplyLinearImpulse(this.impulse, this.point, true);
        } else {
            stats.staticX += jx;
            stats.staticY += jy;
        }
    }
}
