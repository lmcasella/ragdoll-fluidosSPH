/**
 * Contorno partícula–cuerpo (docs/design/14-agua.md §14.6). LiquidFun resuelve el contacto con una presión de
 * penalización que actúa como resorte y devuelve la gota con e ≈ 0,6, y que solo empuja por la normal.
 *
 * Contorno inelástico: en cada subpaso, la componente normal saliente de la velocidad relativa
 * `u_n = (v − v_b)·n` de cada partícula del store en contacto pasa a `min(u_n, max(0, u_n,antes))`, con `u_n,antes`
 * la velocidad guardada por slot al final del subpaso anterior (o la de emisión): quita el rebote sin frenar a la
 * gota que nace saliendo del sólido. El cuerpo dinámico recibe el impulso opuesto `m_p · cut` en el punto de
 * contacto, con `m_p = ρ · (1,5 r)²` la masa de la partícula, así que se conserva el momento.
 *
 * Escape entre dos sólidos: una gota apretada entre dos sólidos enfrentados (con al menos uno dinámico) se
 * comportaría como un puntal. Se anula el par acción-reacción del motor, y la gota sale de costado con la
 * velocidad de continuidad de una película de apriete, tope por la energía que el cierre puede pagar; la energía
 * ganada se descuenta del cierre con un impulso normal. Las partículas fuera del store no se corrigen.
 *
 * Es un objeto con `update(substep)` para la lista de instancias de `stepWorld`; no crea objetos nativos por
 * subpaso.
 */

const BODY_CONTACT_WORDS = 7;
const SEARCH_WORDS = 200;
const DEFAULT_OFFSET = 58;
const STATIC = 0;
const DYNAMIC = 2;

/** Producto escalar máximo entre las normales exteriores de dos sólidos para que la gota esté aprisionada. */
const TRAP_DOT = -0.5;

/** Peso máximo del contacto con el cuerpo dinámico para aplicar el escape: con más, la gota penetra más que su radio y es un estado inválido. */
export const MAX_WEIGHT_D = 0.5;

/** Corrige, en cada subpaso, los contactos de un sistema de partículas con los cuerpos del mundo. */
export class WallContact {
    /**
     * @param {*} system `b2ParticleSystem` cuyas partículas se corrigen.
     * @param {*} store `ParticleStore` del sistema: solo se corrigen sus partículas y guarda la velocidad previa.
     * @param {{ pressureStrength: number }} params Datos del sistema (`SHOT_SYSTEM`): `pressureStrength` fija la
     * constante `K` de la penalización de contacto que el escape anula.
     */
    constructor(system, store, params) {
        this.system = system;
        this.store = store;
        this.pressureStrength = params.pressureStrength;
        this.offset = DEFAULT_OFFSET;
        this.stale = false;
        this.skipped = false;
        this.escaped = new Uint8Array(system.GetMaxParticleCount());
        this.point = new Box2D.b2Vec2(0, 0);
        this.impulse = new Box2D.b2Vec2(0, 0);
        const cap = system.GetMaxParticleCount();
        this.firstBody = new Int32Array(cap);
        this.firstFixture = new Int32Array(cap);
        this.firstNx = new Float32Array(cap);
        this.firstNy = new Float32Array(cap);
        this.firstWeight = new Float32Array(cap);
        this.firstMass = new Float32Array(cap);
        this.otherBody = new Int32Array(cap);
        this.otherFixture = new Int32Array(cap);
        this.otherNx = new Float32Array(cap);
        this.otherNy = new Float32Array(cap);
        this.otherWeight = new Float32Array(cap);
        this.otherMass = new Float32Array(cap);
        this.otherDot = new Float32Array(cap);
        this.stats = WallContact.emptyStats();
    }

    /**
     * Contadores del escape, sin estado nativo: `events` (gotas con salida lateral impuesta), `lateralX` y
     * `lateralY` (suma del impulso lateral `m_p Δu`), `maxUe` (velocidad de salida máxima, m/s) con la velocidad de
     * cierre `maxUeClosing` (m/s) y el espesor de película `maxUeFilm` (m) del evento que la dio, `cancelled`
     * (módulo del impulso del motor anulado, N·s), `paid` y `unpaid` (energía cobrada al cierre y energía que no
     * se pudo cobrar, J; `unpaid` es un control y debe dar 0).
     * @returns {{ events: number, lateralX: number, lateralY: number, maxUe: number, maxUeClosing: number, maxUeFilm: number, cancelled: number, paid: number, unpaid: number }}
     */
    static emptyStats() {
        return { events: 0, lateralX: 0, lateralY: 0, maxUe: 0, maxUeClosing: 0, maxUeFilm: 0, cancelled: 0, paid: 0, unpaid: 0 };
    }

    /** Pone en cero los contadores de `stats`. */
    resetStats() {
        Object.assign(this.stats, WallContact.emptyStats());
    }

    /**
     * Descarta el buffer de contactos que dejó el último paso: llamar al destruir cuerpos, porque el buffer
     * guarda punteros a ellos hasta el próximo `world.Step`.
     */
    invalidate() {
        this.stale = true;
    }

    /**
     * Cantidad y puntero al buffer de contactos partícula–cuerpo. El binding exporta `GetBodyContacts` pero no el
     * conteo: el buffer es un `b2GrowableBuffer { data, count, … }` dentro del sistema, a +58 palabras (validado
     * contra el puntero que devuelve `GetBodyContacts`; si no coincide se busca de nuevo).
     * @returns {{ words: number, count: number } | null}
     */
    bodyContacts() {
        const data = Box2D.getPointer(this.system.GetBodyContacts());
        if (data === 0) return null;
        const base = Box2D.getPointer(this.system) >> 2;
        if (Box2D.HEAP32[base + this.offset] !== data) {
            let found = -1;
            for (let k = 0; k < SEARCH_WORDS; k++) {
                if (Box2D.HEAP32[base + k] === data) {
                    found = k;
                    break;
                }
            }
            if (found < 0) return null;
            this.offset = found;
        }
        const count = Box2D.HEAP32[base + this.offset + 1];
        return count > 0 ? { words: data >> 2, count } : null;
    }

    /**
     * Un subpaso, antes de `world.Step`. La normal del contacto apunta de la partícula al cuerpo, así que la
     * componente saliente es `−(v − v_b)·n`. Deja para quien corre después en el mismo subpaso (`js/adhesion.js`)
     * `skipped` (el buffer de contactos estaba descartado y no se leyó) y `escaped[i]` (1 si a la partícula `i` se le
     * impuso la salida lateral del escape).
     * @param {number} substep Duración del subpaso en segundos.
     */
    update(substep) {
        const vel = Box2D.getPointer(this.system.GetVelocityBuffer()) >> 2;
        this.escaped.fill(0, 0, this.system.GetParticleCount());
        this.skipped = this.stale;
        if (this.stale) this.stale = false;
        else this.correct(vel, substep);
        this.record(vel);
    }

    /**
     * Guarda en el store la velocidad de cada partícula viva, para usarla como `u_n,antes` en el próximo subpaso.
     * @param {number} vel Índice (en palabras) del buffer de velocidades.
     */
    record(vel) {
        const heapF = Box2D.HEAPF32;
        const heapI = Box2D.HEAP32;
        const marks = this.system.GetUserDataBuffer() >> 2;
        const store = this.store;
        const n = this.system.GetParticleCount();
        for (let i = 0; i < n; i++) {
            const slot = heapI[marks + i] - 1;
            if (slot < 0 || slot >= store.capacity) continue;
            store.vx[slot] = heapF[vel + 2 * i];
            store.vy[slot] = heapF[vel + 2 * i + 1];
        }
    }

    /**
     * Aplica el recorte inelástico `u_n ← min(u_n, max(0, u_n,antes))` a las partículas del store en contacto,
     * junta el primer contacto y el más opuesto con otro cuerpo de cada una, y después aplica el escape a las
     * aprisionadas.
     * @param {number} vel Índice (en palabras) del buffer de velocidades.
     * @param {number} substep Duración del subpaso en segundos.
     */
    correct(vel, substep) {
        const contacts = this.bodyContacts();
        if (!contacts) return;
        const { words, count } = contacts;
        const pos = Box2D.getPointer(this.system.GetPositionBuffer()) >> 2;
        const heapI = Box2D.HEAP32;
        const heapF = Box2D.HEAPF32;
        const marks = this.system.GetUserDataBuffer() >> 2;
        const store = this.store;
        const n = this.system.GetParticleCount();
        const mass = this.system.GetDensity() * (1.5 * this.system.GetRadius()) ** 2;
        this.firstBody.fill(0, 0, n);
        this.otherBody.fill(0, 0, n);
        this.otherDot.fill(2, 0, n);
        for (let c = 0; c < count; c++) {
            const w = words + c * BODY_CONTACT_WORDS;
            const index = heapI[w];
            if (index >= n) continue;
            const slot = heapI[marks + index] - 1;
            if (slot < 0 || slot >= store.capacity) continue;
            const nx = -heapF[w + 4];
            const ny = -heapF[w + 5];
            this.collect(index, w, nx, ny);
            const body = Box2D.wrapPointer(heapI[w + 1], Box2D.b2Body);
            const type = body.GetType();
            const dynamic = type === DYNAMIC;
            const px = heapF[pos + 2 * index];
            const py = heapF[pos + 2 * index + 1];
            let bx = 0;
            let by = 0;
            if (type !== STATIC) {
                this.point.set_x(px);
                this.point.set_y(py);
                const vb = body.GetLinearVelocityFromWorldPoint(this.point);
                bx = vb.get_x();
                by = vb.get_y();
            }
            const vx = heapF[vel + 2 * index];
            const vy = heapF[vel + 2 * index + 1];
            const out = (vx - bx) * nx + (vy - by) * ny;
            const before = (store.vx[slot] - bx) * nx + (store.vy[slot] - by) * ny;
            const cut = out - Math.min(out, Math.max(0, before));
            if (cut <= 0) continue;
            heapF[vel + 2 * index] = vx - cut * nx;
            heapF[vel + 2 * index + 1] = vy - cut * ny;
            if (dynamic) {
                const j = mass * cut;
                this.impulse.set_x(j * nx);
                this.impulse.set_y(j * ny);
                body.ApplyLinearImpulse(this.impulse, this.point, true);
            }
        }
        this.escape(vel, pos, n, substep);
    }

    /**
     * Guarda, por partícula, el primer contacto y, entre los siguientes con otro cuerpo, el de normal exterior
     * más opuesta a la del primero.
     * @param {number} index Índice de la partícula.
     * @param {number} w Índice (en palabras) del registro de contacto.
     * @param {number} nx Normal exterior (del sólido a la partícula), componente x.
     * @param {number} ny Normal exterior, componente y.
     */
    collect(index, w, nx, ny) {
        const heapI = Box2D.HEAP32;
        const heapF = Box2D.HEAPF32;
        const body = heapI[w + 1];
        if (this.firstBody[index] === 0) {
            this.firstBody[index] = body;
            this.firstFixture[index] = heapI[w + 2];
            this.firstNx[index] = nx;
            this.firstNy[index] = ny;
            this.firstWeight[index] = heapF[w + 3];
            this.firstMass[index] = heapF[w + 6];
            return;
        }
        if (body === this.firstBody[index]) return;
        const dot = nx * this.firstNx[index] + ny * this.firstNy[index];
        if (dot >= this.otherDot[index]) return;
        this.otherDot[index] = dot;
        this.otherBody[index] = body;
        this.otherFixture[index] = heapI[w + 2];
        this.otherNx[index] = nx;
        this.otherNy[index] = ny;
        this.otherWeight[index] = heapF[w + 3];
        this.otherMass[index] = heapF[w + 6];
    }

    /**
     * Escape de las gotas aprisionadas entre dos sólidos enfrentados (pasos 1 a 8 de §14.6), después del recorte
     * inelástico y antes de `record`.
     * @param {number} vel Índice (en palabras) del buffer de velocidades.
     * @param {number} pos Índice (en palabras) del buffer de posiciones.
     * @param {number} n Cantidad de partículas.
     * @param {number} substep Duración del subpaso en segundos.
     */
    escape(vel, pos, n, substep) {
        const heapF = Box2D.HEAPF32;
        const radius = this.system.GetRadius();
        const width = 1.5 * radius;
        const mp = this.system.GetDensity() * width * width;
        const diameter = 2 * radius;
        const kScale = (this.pressureStrength * diameter) / (substep * substep);
        const point = this.point;
        const impulse = this.impulse;
        const stats = this.stats;
        for (let i = 0; i < n; i++) {
            if (this.otherBody[i] === 0 || this.otherDot[i] > TRAP_DOT) continue;
            const first = Box2D.wrapPointer(this.firstBody[i], Box2D.b2Body);
            const other = Box2D.wrapPointer(this.otherBody[i], Box2D.b2Body);
            const firstDynamic = first.GetType() === DYNAMIC;
            const otherDynamic = other.GetType() === DYNAMIC;
            if (!firstDynamic && !otherDynamic) continue;
            const pickFirst = firstDynamic && (!otherDynamic || first.GetMass() <= other.GetMass());
            const bodyD = pickFirst ? first : other;
            const bodyO = pickFirst ? other : first;
            const ndx = pickFirst ? this.firstNx[i] : this.otherNx[i];
            const ndy = pickFirst ? this.firstNy[i] : this.otherNy[i];
            const wD = pickFirst ? this.firstWeight[i] : this.otherWeight[i];
            if (wD > MAX_WEIGHT_D) continue;
            const mcD = pickFirst ? this.firstMass[i] : this.otherMass[i];
            const fixtureD = pickFirst ? this.firstFixture[i] : this.otherFixture[i];
            const wO = pickFirst ? this.otherWeight[i] : this.firstWeight[i];
            const mcO = pickFirst ? this.otherMass[i] : this.firstMass[i];
            const px = heapF[pos + 2 * i];
            const py = heapF[pos + 2 * i + 1];
            point.set_x(px);
            point.set_y(py);

            const cancel = mcD * kScale * wD * wD * substep;
            impulse.set_x(cancel * ndx);
            impulse.set_y(cancel * ndy);
            bodyD.ApplyLinearImpulse(impulse, point, true);
            heapF[vel + 2 * i] -= (cancel / mp) * ndx;
            heapF[vel + 2 * i + 1] -= (cancel / mp) * ndy;
            stats.cancelled += cancel;

            const vD = bodyD.GetLinearVelocityFromWorldPoint(point);
            let dvx = vD.get_x();
            let dvy = vD.get_y();
            let refx = dvx / 2;
            let refy = dvy / 2;
            const oDynamic = bodyO.GetType() === DYNAMIC;
            if (bodyO.GetType() !== STATIC) {
                const vO = bodyO.GetLinearVelocityFromWorldPoint(point);
                dvx -= vO.get_x();
                dvy -= vO.get_y();
                refx += vO.get_x() / 2;
                refy += vO.get_y() / 2;
            }
            const closing = Math.max(0, dvx * ndx + dvy * ndy);
            if (closing === 0) continue;
            const film = Math.max(diameter * (2 - wD - wO), radius);
            let sx = this.firstNx[i] - this.otherNx[i];
            let sy = this.firstNy[i] - this.otherNy[i];
            const sLength = Math.hypot(sx, sy);
            sx /= sLength;
            sy /= sLength;
            const tx = -sy;
            const ty = sx;
            const box = Box2D.wrapPointer(fixtureD, Box2D.b2Fixture).GetAABB(0);
            const lower = box.get_lowerBound();
            const upper = box.get_upperBound();
            const lx = lower.get_x();
            const ly = lower.get_y();
            const ux = upper.get_x();
            const uy = upper.get_y();
            const x = (px - (lx + ux) / 2) * tx + (py - (ly + uy) / 2) * ty;
            const half = 0.5 * (Math.abs(tx) * (ux - lx) + Math.abs(ty) * (uy - ly));
            const vx = heapF[vel + 2 * i];
            const vy = heapF[vel + 2 * i + 1];
            const rel = (vx - refx) * tx + (vy - refy) * ty;
            const sign = Math.abs(x) >= radius / 10 ? Math.sign(x) : Math.sign(rel) || 1;
            const reach = Math.min(Math.abs(x), half);
            const along = sign * rel;
            const alongPlus = Math.max(0, along);
            const invD = Math.max(0, 1 / mcD - 1 / mp);
            const invO = bodyO.GetType() !== DYNAMIC ? 0 : Math.max(0, 1 / mcO - 1 / mp);
            const inv = invD + invO;
            if (inv <= 0) continue;
            const mu = 1 / inv;
            let exit = (closing * (reach + width / 2)) / film;
            exit = Math.min(exit, Math.sqrt(alongPlus * alongPlus + (mu * closing * closing) / mp));
            if (along >= exit) continue;
            const dv = (exit - along) * sign;
            heapF[vel + 2 * i] = vx + dv * tx;
            heapF[vel + 2 * i + 1] = vy + dv * ty;
            const gained = 0.5 * mp * (exit * exit - alongPlus * alongPlus);
            if (gained > 0) {
                const paid = Math.min(gained, 0.5 * mu * closing * closing);
                const debit = mu * (closing - Math.sqrt(Math.max(0, closing * closing - (2 * paid) / mu)));
                impulse.set_x(-debit * ndx);
                impulse.set_y(-debit * ndy);
                bodyD.ApplyLinearImpulse(impulse, point, true);
                if (oDynamic) {
                    impulse.set_x(debit * ndx);
                    impulse.set_y(debit * ndy);
                    bodyO.ApplyLinearImpulse(impulse, point, true);
                }
                stats.paid += paid;
                stats.unpaid += gained - paid;
            }
            this.escaped[i] = 1;
            stats.events++;
            stats.lateralX += mp * dv * tx;
            stats.lateralY += mp * dv * ty;
            if (exit > stats.maxUe) {
                stats.maxUe = exit;
                stats.maxUeClosing = closing;
                stats.maxUeFilm = film;
            }
        }
    }

    /** Libera los vectores de trabajo. */
    dispose() {
        Box2D.destroy(this.point);
        Box2D.destroy(this.impulse);
    }
}
