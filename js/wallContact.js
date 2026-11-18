/**
 * Contorno inelástico partícula–cuerpo (docs/design/14-agua.md §14.6). LiquidFun resuelve el contacto con una
 * presión de penalización que actúa como resorte y devuelve la gota con e ≈ 0,6. En cada subpaso se anula la
 * componente normal saliente de la velocidad relativa de cada partícula en contacto, `v ← v − max(0, (v − v_b)·n) n`,
 * y el cuerpo dinámico recibe el impulso opuesto en el punto de contacto, así que se conserva el momento.
 * Es un objeto con `update(substep)` para la lista de instancias de `stepWorld`; no crea objetos nativos por
 * subpaso.
 */

const BODY_CONTACT_WORDS = 7;
const SEARCH_WORDS = 200;
const DEFAULT_OFFSET = 58;
const STATIC = 0;
const DYNAMIC = 2;

/** Corrige, en cada subpaso, los contactos de un sistema de partículas con los cuerpos del mundo. */
export class WallContact {
    /**
     * @param {*} system `b2ParticleSystem` cuyas partículas se corrigen.
     */
    constructor(system) {
        this.system = system;
        this.offset = DEFAULT_OFFSET;
        this.stale = false;
        this.point = new Box2D.b2Vec2(0, 0);
        this.impulse = new Box2D.b2Vec2(0, 0);
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
     * componente saliente es `−(v − v_b)·n`.
     * @param {number} substep Duración del subpaso en segundos (no se usa: la corrección es instantánea).
     */
    update(substep) {
        if (this.stale) {
            this.stale = false;
            return;
        }
        const contacts = this.bodyContacts();
        if (!contacts) return;
        const { words, count } = contacts;
        const vel = Box2D.getPointer(this.system.GetVelocityBuffer()) >> 2;
        const pos = Box2D.getPointer(this.system.GetPositionBuffer()) >> 2;
        const heapI = Box2D.HEAP32;
        const heapF = Box2D.HEAPF32;
        const n = this.system.GetParticleCount();
        for (let c = 0; c < count; c++) {
            const w = words + c * BODY_CONTACT_WORDS;
            const index = heapI[w];
            if (index >= n) continue;
            const nx = -heapF[w + 4];
            const ny = -heapF[w + 5];
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
            if (out <= 0) continue;
            heapF[vel + 2 * index] = vx - out * nx;
            heapF[vel + 2 * index + 1] = vy - out * ny;
            if (dynamic) {
                const j = heapF[w + 6] * out;
                this.impulse.set_x(j * nx);
                this.impulse.set_y(j * ny);
                body.ApplyLinearImpulse(this.impulse, this.point, true);
            }
        }
    }

    /** Libera los vectores de trabajo. */
    dispose() {
        Box2D.destroy(this.point);
        Box2D.destroy(this.impulse);
    }
}
