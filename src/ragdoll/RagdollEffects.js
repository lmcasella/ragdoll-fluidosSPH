import { MATERIALS } from "../fluids/materials.js";
import { shortCircuitDps } from "./ActiveRagdoll.js";

/** Una vuelta completa, en rad. */
const FULL_TURN = Math.PI * 2;

const UINT32_RANGE = 4294967296;
const HASH_SHIFT_FIRST = 15;
const HASH_SHIFT_SECOND = 12;
const HASH_MULTIPLIER_FIRST = 0x2c1b3c6d;
const HASH_MULTIPLIER_SECOND = 0x297a2d39;

/** Frecuencia con que se repiten las chispas del cortocircuito, en Hz: por tick de reloj y no por frame, para que se vean como destellos. */
const SPARK_TICK_HZ = 12;
const SPARKS_PER_FRAME = 3;
const SPARK_SEGMENTS = 3;

/** Largo de cada tramo de una chispa, en m; con 0,12 m quedaban dentro del cuerpo y no se veían al zoom de juego. */
const SPARK_SEGMENT_LENGTH = 0.3;

/** Cuánto puede girar una chispa entre tramos, en rad (de punta a punta). */
const SPARK_TURN_RANGE = 2.4;
const SPARK_COLORS = [0xfff27a, 0xe8ffff];

/** Grosor del trazo de las chispas en pantalla, en px. */
const SPARK_SCREEN_PX = 3;

/** Pasos de la semilla por tick y por chispa, y desplazamientos de cada uso de `hashToUnit` dentro de una chispa. */
const SPARK_TICK_SEED_STRIDE = 97;
const SPARK_INDEX_SEED_STRIDE = 13;
const SPARK_SEED = { piece: 0, heading: 1, turn: 2 };

/**
 * Burbujas de H2 (docs/design/15-quimica.md §15.5b), solo dibujo en metros y segundos. `perPiece` (1/s) es la tasa
 * por pieza con ácido puro y se escala con σ/σ del ácido; nacen sobre la superficie de la pieza, suben `rise` (m/s),
 * miden de `minRadius` a `maxRadius` (m) y desaparecen a los `life` s. `capacity` es el máximo vivo por robot.
 */
export const H2_BUBBLES = { perPiece: 20, rise: 0.3, life: 0.5, minRadius: 0.02, maxRadius: 0.04, capacity: 256 };

/** Campos por burbuja en el arreglo de estado: x, y (m), radio (m), edad (s) y vivo (0 o 1). */
const BUBBLE_STRIDE = 5;
const BUBBLE_FIELD = { x: 0, y: 1, radius: 2, age: 3, alive: 4 };
const BUBBLE_SEED_STRIDE = 7;
const BUBBLE_SEED = { piece: 0, along: 1, side: 2, radius: 3 };

/** Tiempo máximo que avanzan las burbujas en un frame, en s (una pausa larga no las mueve de golpe). */
const BUBBLE_MAX_STEP = 0.1;
const BUBBLE_FILL_COLOR = 0xebffeb;
const BUBBLE_FILL_ALPHA = 0.35;
const BUBBLE_STROKE_COLOR = 0xf2fff2;

/** Grosor del borde de las burbujas en pantalla, en px. */
const BUBBLE_SCREEN_PX = 1;
const BOX_SIDES = 4;

/** Mitad de un valor en [0, 1): centra un número de `hashToUnit` alrededor de 0. */
const UNIT_CENTER = 0.5;

const surface = [0, 0];

/**
 * Hash entero a [0, 1): da piezas y ángulos repetibles sin `Math.random` (xorshift-multiply, ver `docs/referencias.md`).
 * @param {number} seed entero
 * @returns {number}
 */
function hashToUnit(seed) {
    let mixed = Math.imul(seed ^ (seed >>> HASH_SHIFT_FIRST), HASH_MULTIPLIER_FIRST);
    mixed = Math.imul(mixed ^ (mixed >>> HASH_SHIFT_SECOND), HASH_MULTIPLIER_SECOND);
    return ((mixed ^ (mixed >>> HASH_SHIFT_FIRST)) >>> 0) / UINT32_RANGE;
}

/**
 * Chispas por destello según el daño del cortocircuito: `SPARKS_PER_FRAME` con agua limpia y proporcional al dps
 * (el ácido al 8 % da unas 5 veces más).
 * @param {number} dps daño por segundo del cortocircuito, en vida/s
 * @returns {number}
 */
export function sparkCount(dps) {
    return Math.max(1, Math.round((SPARKS_PER_FRAME * dps) / shortCircuitDps(MATERIALS.water.sigmaE)));
}

/**
 * Punto del mundo (m) sobre el borde de la pieza `item`, elegido con `along` y `side` en [0, 1); queda en `surface`.
 * @param {object} item pieza de `buildRenderItems`
 * @param {number} along posición a lo largo del borde, de 0 a 1
 * @param {number} side lado o tramo sobre el que cae, de 0 a 1
 */
function surfacePoint(item, along, side) {
    let localX;
    let localY;
    if (item.type === "circle") {
        localX = Math.cos(along * FULL_TURN) * item.radius;
        localY = Math.sin(along * FULL_TURN) * item.radius;
    } else if (item.type === "box") {
        const boxSide = Math.floor(along * BOX_SIDES);
        const offset = side * 2 - 1;
        localX = boxSide === 0 ? item.hw : boxSide === 1 ? -item.hw : offset * item.hw;
        localY = boxSide === 2 ? item.hh : boxSide === 3 ? -item.hh : offset * item.hh;
    } else {
        const vertices = item.vertices;
        const from = vertices[Math.floor(along * vertices.length) % vertices.length];
        const to = vertices[(Math.floor(along * vertices.length) + 1) % vertices.length];
        localX = from[0] + (to[0] - from[0]) * side;
        localY = from[1] + (to[1] - from[1]) * side;
    }
    const cosItem = Math.cos(item.angle);
    const sinItem = Math.sin(item.angle);
    const bodyX = item.cx + localX * cosItem - localY * sinItem;
    const bodyY = item.cy + localX * sinItem + localY * cosItem;
    const position = item.body.GetPosition();
    const angle = item.body.GetAngle();
    const cosBody = Math.cos(angle);
    const sinBody = Math.sin(angle);
    surface[0] = position.get_x() + bodyX * cosBody - bodyY * sinBody;
    surface[1] = position.get_y() + bodyX * sinBody + bodyY * cosBody;
}

/**
 * Chispas del cortocircuito y burbujas de H2 de un robot, en un solo `PIXI.Graphics` que se limpia y se redibuja cada
 * frame encima de su robot (`docs/design/04-fluidos.md`, `docs/design/15-quimica.md` §15.5b). Reusar el `Graphics` no
 * crea objetos por frame. Solo dibujo: no toca la física.
 */
export class RagdollEffects {
    /**
     * @param {object} options
     * @param {PIXI.Container} options.parent contenedor del mundo donde se dibuja, en px a `pixelsPerMeter` con la Y hacia arriba
     * @param {number} options.pixelsPerMeter px por metro del JSON del robot
     */
    constructor({ parent, pixelsPerMeter }) {
        this.pixelsPerMeter = pixelsPerMeter;
        this.graphics = new PIXI.Graphics();
        parent.addChild(this.graphics);
        this.bubbles = null;
    }

    /**
     * Redibuja las chispas (solo con el robot mojado) y las burbujas del frame.
     * @param {object} player `ActiveRagdoll` con `renderItems`, `wet`, `dead`, `wetSigma` y `shortCircuitDps`
     * @param {number} screenScale escala de la cámara, en px de pantalla por metro
     * @param {number} now reloj de juego, en s
     */
    draw(player, screenScale, now) {
        this.graphics.clear();
        if (player.wet && !player.dead) this.drawSparks(player, screenScale, now);
        this.drawBubbles(player, screenScale, now);
    }

    /** Quita el `Graphics` del mundo y lo destruye; se llama junto con la destrucción del robot. */
    destroy() {
        this.graphics.parent?.removeChild(this.graphics);
        this.graphics.destroy();
    }

    /**
     * Zigzags amarillos y blancos que nacen en el centro de una pieza. La pieza y los ángulos salen de `floor(now × SPARK_TICK_HZ)`.
     * @param {object} player robot mojado, con `renderItems` y `shortCircuitDps`
     * @param {number} screenScale escala de la cámara, en px de pantalla por metro
     * @param {number} now reloj de juego, en s
     */
    drawSparks(player, screenScale, now) {
        const items = player.renderItems;
        if (items.length === 0) return;
        const scale = this.pixelsPerMeter;
        const tick = Math.floor(now * SPARK_TICK_HZ);
        const width = (SPARK_SCREEN_PX * scale) / screenScale;
        const sparks = sparkCount(player.shortCircuitDps);
        for (let spark = 0; spark < sparks; spark++) {
            const seed = tick * SPARK_TICK_SEED_STRIDE + spark * SPARK_INDEX_SEED_STRIDE;
            const position = items[Math.floor(hashToUnit(seed + SPARK_SEED.piece) * items.length)].body.GetPosition();
            let x = position.get_x();
            let y = position.get_y();
            let heading = hashToUnit(seed + SPARK_SEED.heading) * FULL_TURN;
            this.graphics.moveTo(x * scale, y * scale);
            for (let segment = 0; segment < SPARK_SEGMENTS; segment++) {
                heading += (hashToUnit(seed + SPARK_SEED.turn + segment) - UNIT_CENTER) * SPARK_TURN_RANGE;
                x += Math.cos(heading) * SPARK_SEGMENT_LENGTH;
                y += Math.sin(heading) * SPARK_SEGMENT_LENGTH;
                this.graphics.lineTo(x * scale, y * scale);
            }
            this.graphics.stroke({ width, color: SPARK_COLORS[spark % SPARK_COLORS.length] });
        }
    }

    /**
     * Estado de las burbujas del robot; se reserva la primera vez que hace falta.
     * @returns {object} arreglo `slots` de burbujas más el cursor, lo pendiente de nacer, el último instante y la semilla
     */
    bubbleState() {
        this.bubbles ??= { slots: new Float32Array(H2_BUBBLES.capacity * BUBBLE_STRIDE), cursor: 0, pending: 0, last: -1, seed: 0 };
        return this.bubbles;
    }

    /**
     * Hace nacer las burbujas de ácido sobre la superficie de las piezas, las sube y dibuja las vivas, con su alfa
     * bajando con la edad.
     * @param {object} player robot con `renderItems`, `wet`, `dead` y `wetSigma`
     * @param {number} screenScale escala de la cámara, en px de pantalla por metro
     * @param {number} now reloj de juego, en s
     */
    drawBubbles(player, screenScale, now) {
        const items = player.renderItems;
        const sigma = player.wetSigma;
        const emitting = player.wet && !player.dead && sigma > MATERIALS.water.sigmaE;
        if (!this.bubbles && !emitting) return;
        const state = this.bubbleState();
        const step = state.last < 0 ? 0 : Math.min(now - state.last, BUBBLE_MAX_STEP);
        state.last = now;
        const { slots } = state;
        const { life, rise, capacity } = H2_BUBBLES;
        if (emitting && step > 0) {
            state.pending += H2_BUBBLES.perPiece * items.length * Math.min(1, sigma / MATERIALS.acid.sigmaE) * step;
            while (state.pending >= 1) {
                state.pending -= 1;
                const seed = state.seed++ * BUBBLE_SEED_STRIDE;
                const piece = items[Math.floor(hashToUnit(seed + BUBBLE_SEED.piece) * items.length)];
                surfacePoint(piece, hashToUnit(seed + BUBBLE_SEED.along), hashToUnit(seed + BUBBLE_SEED.side));
                const offset = state.cursor * BUBBLE_STRIDE;
                state.cursor = (state.cursor + 1) % capacity;
                slots[offset + BUBBLE_FIELD.x] = surface[0];
                slots[offset + BUBBLE_FIELD.y] = surface[1];
                slots[offset + BUBBLE_FIELD.radius] =
                    H2_BUBBLES.minRadius + hashToUnit(seed + BUBBLE_SEED.radius) * (H2_BUBBLES.maxRadius - H2_BUBBLES.minRadius);
                slots[offset + BUBBLE_FIELD.age] = 0;
                slots[offset + BUBBLE_FIELD.alive] = 1;
            }
        }
        const scale = this.pixelsPerMeter;
        const strokeWidth = (BUBBLE_SCREEN_PX * scale) / screenScale;
        for (let offset = 0; offset < slots.length; offset += BUBBLE_STRIDE) {
            if (slots[offset + BUBBLE_FIELD.alive] === 0) continue;
            slots[offset + BUBBLE_FIELD.age] += step;
            if (slots[offset + BUBBLE_FIELD.age] >= life) {
                slots[offset + BUBBLE_FIELD.alive] = 0;
                continue;
            }
            slots[offset + BUBBLE_FIELD.y] += rise * step;
            const alpha = 1 - slots[offset + BUBBLE_FIELD.age] / life;
            this.graphics
                .circle(slots[offset + BUBBLE_FIELD.x] * scale, slots[offset + BUBBLE_FIELD.y] * scale, slots[offset + BUBBLE_FIELD.radius] * scale)
                .fill({ color: BUBBLE_FILL_COLOR, alpha: BUBBLE_FILL_ALPHA * alpha })
                .stroke({ width: strokeWidth, color: BUBBLE_STROKE_COLOR, alpha });
        }
    }
}
