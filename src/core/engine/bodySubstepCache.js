import { BODY_TYPE } from "./box2d.js";

const toFloat32 = Math.fround;

/**
 * Datos de un cuerpo que no cambian durante un subpaso: transformada, tipo, centro de masa e inversas de masa e inercia.
 * Valen durante todo el subpaso mientras quien los usa solo cambie velocidades y no mueva cuerpos, así que se leen del
 * binding de Box2D una vez por cuerpo y por subpaso en lugar de una vez por partícula.
 */
function createBodyData() {
    return { body: null, tick: 0, type: BODY_TYPE.STATIC, x: 0, y: 0, cos: 1, sin: 0, centerX: 0, centerY: 0, inverseMass: 0, inverseInertia: 0 };
}

/**
 * Caché de datos de cuerpos por subpaso, indexada por el puntero nativo del cuerpo (caché por subpaso, memoización: un
 * registro por cuerpo, reutilizado). `beginSubstep` invalida todo; `get` lee del binding la primera vez que se pide un cuerpo en el
 * subpaso. Los registros se crean una sola vez y no se crea memoria nativa.
 */
export class BodySubstepCache {
    constructor() {
        this.byPointer = new Map();
        this.tick = 0;
    }

    /** Invalida los registros: llamar al empezar cada subpaso. */
    beginSubstep() {
        this.tick++;
    }

    /** Olvida todos los cuerpos (se destruyeron cuerpos: sus punteros pueden reutilizarse). */
    clear() {
        this.byPointer.clear();
    }

    /**
     * @param {number} pointer Puntero nativo del `b2Body`.
     * @returns {object} Registro del cuerpo, actualizado a este subpaso.
     */
    get(pointer) {
        let data = this.byPointer.get(pointer);
        if (data === undefined) {
            data = createBodyData();
            data.body = Box2D.wrapPointer(pointer, Box2D.b2Body);
            this.byPointer.set(pointer, data);
        }
        if (data.tick !== this.tick) {
            data.tick = this.tick;
            this.read(data);
        }
        return data;
    }

    /** Copia del binding la transformada y, si el cuerpo es dinámico, las inversas de masa e inercia. */
    read(data) {
        const body = data.body;
        data.type = body.GetType();
        const transform = body.GetTransform();
        const position = transform.get_p();
        const rotation = transform.get_q();
        data.x = position.get_x();
        data.y = position.get_y();
        data.cos = rotation.get_c();
        data.sin = rotation.get_s();
        if (data.type === BODY_TYPE.DYNAMIC) {
            const center = body.GetWorldCenter();
            data.centerX = center.get_x();
            data.centerY = center.get_y();
            const mass = body.GetMass();
            data.inverseMass = 1 / mass;
            const local = body.GetLocalCenter();
            const inertia = body.GetInertia() - mass * (local.get_x() * local.get_x() + local.get_y() * local.get_y());
            data.inverseInertia = inertia > 0 ? 1 / inertia : 0;
        }
    }
}

/**
 * Pasa un punto local del cuerpo a mundo, igual que `b2Body::GetWorldPoint`. El build de Box2D calcula en doble precisión
 * y redondea a float32 solo el resultado, así que acá también (redondear cada operación daría otro último bit). `out`
 * recibe `x` e `y`.
 */
export function bodyWorldPoint(data, localX, localY, out) {
    out.x = toFloat32(data.cos * localX - data.sin * localY + data.x);
    out.y = toFloat32(data.sin * localX + data.cos * localY + data.y);
    return out;
}

/** Pasa un vector local del cuerpo a mundo, igual que `b2Body::GetWorldVector` (doble precisión y redondeo final). */
export function bodyWorldVector(data, localX, localY, out) {
    out.x = toFloat32(data.cos * localX - data.sin * localY);
    out.y = toFloat32(data.sin * localX + data.cos * localY);
    return out;
}

/** Pasa un punto de mundo a local del cuerpo, igual que `b2Body::GetLocalPoint` (doble precisión y redondeo final). */
export function bodyLocalPoint(data, worldX, worldY, out) {
    const offsetX = worldX - data.x;
    const offsetY = worldY - data.y;
    out.x = toFloat32(data.cos * offsetX + data.sin * offsetY);
    out.y = toFloat32(-data.sin * offsetX + data.cos * offsetY);
    return out;
}

/** Pasa un vector de mundo a local del cuerpo, igual que `b2Body::GetLocalVector` (doble precisión y redondeo final). */
export function bodyLocalVector(data, worldX, worldY, out) {
    out.x = toFloat32(data.cos * worldX + data.sin * worldY);
    out.y = toFloat32(-data.sin * worldX + data.cos * worldY);
    return out;
}
