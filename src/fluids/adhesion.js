import { FLUID } from "../combat/weapons.js";
import { MATERIALS, SIGMA_W } from "./materials.js";
import { KIND_MATERIAL } from "../water/immersion.js";
import { Contacts } from "./contacts.js";
import { BodySubstepCache, bodyWorldPoint, bodyWorldVector, bodyLocalPoint, bodyLocalVector } from "../core/engine/bodySubstepCache.js";
import { BODY_TYPE } from "../core/engine/box2d.js";
import { exponentialApproachFactor } from "../core/math/scalar.js";
import { vectorLength, normalize, dot, cross } from "../core/math/vector2.js";
import { WATER_DENSITY } from "../core/physics/constants.js";
import { mixtureViscosity as logarithmicMixtureViscosity } from "../core/physics/formulas.js";

/** Espesor `b` de la rebanada 2D (m): `σ_w / ρ_w`. Pasa los esfuerzos de película a newtons. */
const THICKNESS = SIGMA_W / WATER_DENSITY;

/** Coeficiente de la película tangencial: Couette sobre media capa, `k_t = 2 μ_ef b`. */
const TANGENTIAL = 2;

/** Coeficiente de la película normal al separarse: Trouton cohesivo, `k_n = 3 μ_ef b`. */
const NORMAL = 3;

/**
 * Separación máxima del puente de miel, en radios de partícula: `2 r + d` con `d = 1,5 r`. El hilo que une la partícula a la
 * superficie se estira un diámetro más allá del rango de contacto de LiquidFun (`2 r`) y se corta.
 */
const BRIDGE_CUT_RADII = 3.5;

/** Vecinas de miel que se recuerdan por partícula para saber si otra capa la cubre (el resto se descarta). */
const COVER_SLOTS = 12;

/** Dirección de trabajo hacia una vecina de miel: se reutiliza para no crear objetos por paso. */
const COVER_DIRECTION = { x: 0, y: 0 };

/** Umbral del producto escalar entre la dirección a una vecina de miel y la normal de la pared para contarla como capa cubriente. */
const COVER_DOT = 0.2;

/**
 * Fluidos que forman película sobre un cuerpo: los que tienen miel (`X > 0`). Con la `μ` del agua o del ácido el efecto es
 * despreciable (`k ~ 1e-5`). La lava y la piedra tienen su propia viscosidad de contacto (`src/fluids/viscosity.js`).
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
    return logarithmicMixtureViscosity(X, Math.log(honey.mu * honey.viscosityScale), Math.log(MATERIALS.water.mu));
}

/**
 * Adherencia de la miel a los cuerpos (docs/design/14-agua.md §14.10, #77, #214). Corre por subpaso como pseudo-instancia
 * de `stepWorld` (`update(substep)`), registrada después de `WallContact`. Lee los contactos partícula–cuerpo que calcula
 * LiquidFun (`src/fluids/contacts.js`) y, para cada partícula de miel con contacto, usa el de mayor peso: la película
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
        this.userDataStart = 0;
        const slots = store.capacity;
        this.bridgeGen = new Uint32Array(slots);
        this.bridgeBody = new Int32Array(slots);
        this.bridgeWeight = new Float32Array(slots);
        this.bridgeX = new Float32Array(slots);
        this.bridgeY = new Float32Array(slots);
        this.bridgeNx = new Float32Array(slots);
        this.bridgeNy = new Float32Array(slots);
        this.bodies = new BodySubstepCache();
        this.transformed = { x: 0, y: 0 };
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
            this.bodies.clear();
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
        this.userDataStart = store.userDataStart();
        const tick = ++this.tick;
        this.bodies.beginSubstep();
        const { best, stamp } = this;
        const index = contacts.bodyIndex;
        const weight = contacts.bodyW;
        for (let c = 0; c < count; c++) {
            const i = index[c];
            if (escaped[i] === 1) continue;
            const slot = store.slotIn(this.userDataStart, i);
            if (slot < 0 || store.alive[slot] === 0 || this.kinds[store.kind[slot]] === 0) continue;
            if (stamp[i] !== tick) {
                stamp[i] = tick;
                best[i] = c;
            } else if (weight[c] > weight[best[i]]) {
                best[i] = c;
            }
        }
        if (this.hasFilmParticles(total)) this.coverPairs(total, pos);
        const transformed = this.transformed;
        for (let c = 0; c < count; c++) {
            const i = index[c];
            if (stamp[i] !== tick || best[i] !== c) continue;
            const slot = store.slotIn(this.userDataStart, i);
            const nx = contacts.bodyNx[c];
            const ny = contacts.bodyNy[c];
            const gap = Math.max(0, 1 - weight[c]) * 2 * this.radius;
            const qx = heap[pos + 2 * i] - gap * nx;
            const qy = heap[pos + 2 * i + 1] - gap * ny;
            const body = this.bodies.get(contacts.bodyPtr[c]);
            const held = this.bridgeGen[slot] === store.generation[slot];
            const same = held && this.bridgeBody[slot] === contacts.bodyPtr[c];
            if (same || !held || weight[c] > this.bridgeWeight[slot]) {
                this.point.set_x(qx);
                this.point.set_y(qy);
                if (!same && !this.arriving(i, body, vel, nx, ny)) continue;
                bodyLocalPoint(body, this.point.get_x(), this.point.get_y(), transformed);
                this.bridgeX[slot] = transformed.x;
                this.bridgeY[slot] = transformed.y;
                bodyLocalVector(body, nx, ny, transformed);
                this.bridgeNx[slot] = transformed.x;
                this.bridgeNy[slot] = transformed.y;
                this.bridgeBody[slot] = contacts.bodyPtr[c];
                this.bridgeWeight[slot] = weight[c];
                this.bridgeGen[slot] = store.generation[slot];
            }
        }
        for (let i = 0; i < total; i++) {
            const slot = store.slotIn(this.userDataStart, i);
            if (slot < 0 || this.bridgeGen[slot] !== store.generation[slot]) continue;
            const kind = store.kind[slot];
            if (store.alive[slot] === 0 || this.honey[kind] === 0) {
                this.bridgeGen[slot] = 0;
                continue;
            }
            if (escaped[i] === 1) continue;
            const body = this.bodies.get(this.bridgeBody[slot]);
            bodyWorldPoint(body, this.bridgeX[slot], this.bridgeY[slot], transformed);
            const qx = transformed.x;
            const qy = transformed.y;
            bodyWorldVector(body, this.bridgeNx[slot], this.bridgeNy[slot], transformed);
            const nx = transformed.x;
            const ny = transformed.y;
            const separation = dot(heap[pos + 2 * i] - qx, heap[pos + 2 * i + 1] - qy, nx, ny);
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
        if (body.type !== BODY_TYPE.STATIC) {
            const vb = body.body.GetLinearVelocityFromWorldPoint(this.point);
            vx -= vb.get_x();
            vy -= vb.get_y();
        }
        return vx * nx + vy * ny <= 0;
    }

    /**
     * Verdadero si hay al menos una partícula viva de un material con película (miel). Sin ellas `coverPairs` no tiene qué
     * guardar y no se recorren los contactos partícula-partícula.
     */
    hasFilmParticles(total) {
        const { store } = this;
        for (let i = 0; i < total; i++) {
            const slot = store.slotIn(this.userDataStart, i);
            if (slot >= 0 && store.alive[slot] === 1 && this.kinds[store.kind[slot]] === 1) return true;
        }
        return false;
    }

    /** Guarda, por partícula, la dirección a sus vecinas de miel (contactos partícula-partícula de este paso). */
    coverPairs(total, pos) {
        const { contacts, store } = this;
        const heap = Box2D.HEAPF32;
        const K = COVER_SLOTS;
        if (!this.coverCount || this.coverCount.length < total) {
            const cap = Math.max(this.system.GetMaxParticleCount(), total, 1);
            this.coverCount = new Uint8Array(cap);
            this.coverDir = new Float32Array(cap * K * 2);
        }
        const cnt = this.coverCount;
        const dir = this.coverDir;
        cnt.fill(0, 0, total);
        const k = contacts.pairs(total);
        for (let c = 0; c < k; c++) {
            const a = contacts.pairA[c];
            const b = contacts.pairB[c];
            const sa = store.slotIn(this.userDataStart, a);
            const sb = store.slotIn(this.userDataStart, b);
            if (sa < 0 || sb < 0 || this.honey[store.kind[sa]] === 0 || this.honey[store.kind[sb]] === 0) continue;
            const dx = heap[pos + 2 * b] - heap[pos + 2 * a];
            const dy = heap[pos + 2 * b + 1] - heap[pos + 2 * a + 1];
            const direction = normalize(dx, dy, COVER_DIRECTION);
            if (cnt[a] < K) {
                dir[(a * K + cnt[a]) * 2] = direction.x;
                dir[(a * K + cnt[a]) * 2 + 1] = direction.y;
                cnt[a]++;
            }
            if (cnt[b] < K) {
                dir[(b * K + cnt[b]) * 2] = -direction.x;
                dir[(b * K + cnt[b]) * 2 + 1] = -direction.y;
                cnt[b]++;
            }
        }
    }

    /** Si la partícula `i` tiene una vecina de miel del lado opuesto a la pared, de normal exterior `(nx, ny)`. */
    covered(i, nx, ny) {
        const K = COVER_SLOTS;
        const dir = this.coverDir;
        for (let j = 0; j < this.coverCount[i]; j++) {
            if (dir[(i * K + j) * 2] * nx + dir[(i * K + j) * 2 + 1] * ny > COVER_DOT) return true;
        }
        return false;
    }

    /**
     * Película entre la partícula `i` y `body`, con anclaje `(qx, qy)` y normal exterior `(nx, ny)` ya en el mundo. Sobre un
     * cuerpo no dinámico, si la partícula tiene una vecina de miel del lado opuesto a la pared, `k_t` y `k_n` usan la `μ` real
     * (`μ_ef / viscosityScale`): la similitud `F = 100` reemplaza una película de una partícula de espesor, pero en un charco de
     * varias capas la profundidad ya la resuelven las partículas.
     */
    film(i, kind, body, qx, qy, nx, ny, vel, dt) {
        const heap = Box2D.HEAPF32;
        const stats = this.stats;
        const type = body.type;
        const dynamic = type === BODY_TYPE.DYNAMIC;
        const mass = this.mass[kind];
        this.point.set_x(qx);
        this.point.set_y(qy);
        let vbx = 0;
        let vby = 0;
        let invBody = 0;
        let invInertia = 0;
        let rx = 0;
        let ry = 0;
        if (type !== BODY_TYPE.STATIC) {
            const vb = body.body.GetLinearVelocityFromWorldPoint(this.point);
            vbx = vb.get_x();
            vby = vb.get_y();
        }
        if (dynamic) {
            rx = qx - body.centerX;
            ry = qy - body.centerY;
            invBody = body.inverseMass;
            invInertia = body.inverseInertia;
        }
        const vrx = heap[vel + 2 * i] - vbx;
        const vry = heap[vel + 2 * i + 1] - vby;
        const vn = dot(vrx, vry, nx, ny);
        const tx = -ny;
        const ty = nx;
        const vt = dot(vrx, vry, tx, ty);
        const resolved = !dynamic && this.covered(i, nx, ny);
        const mub = (resolved ? this.mu[kind] / MATERIALS.honey.viscosityScale : this.mu[kind]) * THICKNESS;
        const invParticle = 1 / mass;

        const armT = cross(rx, ry, tx, ty);
        const invT = invParticle + invBody + armT * armT * invInertia;
        const kt = TANGENTIAL * mub;
        const jt = (exponentialApproachFactor(kt * dt * invT) * vt) / invT;
        let jx = jt * tx;
        let jy = jt * ty;
        if (vn > 0) {
            const armN = cross(rx, ry, nx, ny);
            const invN = invParticle + invBody + armN * armN * invInertia;
            const kn = NORMAL * mub;
            const jn = (exponentialApproachFactor(kn * dt * invN) * vn) / invN;
            jx += jn * nx;
            jy += jn * ny;
        }
        heap[vel + 2 * i] -= jx / mass;
        heap[vel + 2 * i + 1] -= jy / mass;
        stats.particleX -= jx;
        stats.particleY -= jy;
        stats.magnitude += vectorLength(jx, jy);
        stats.contacts++;
        if (dynamic) {
            stats.bodyX += jx;
            stats.bodyY += jy;
            this.impulse.set_x(jx);
            this.impulse.set_y(jy);
            body.body.ApplyLinearImpulse(this.impulse, this.point, true);
        } else {
            stats.staticX += jx;
            stats.staticY += jy;
        }
    }
}
