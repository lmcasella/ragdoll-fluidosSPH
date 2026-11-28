import { FLUID } from "../combat/weapons.js";
import { MELEE } from "../combat/melee.js";
import { PolygonFixtureBuilder } from "../core/engine/box2d.js";

/** Golpes simples de `MELEE` que rompen una caja. */
const BREAKING_HITS = 2;

/** Daño de los primeros `BREAKING_HITS` golpes del combo de `MELEE`. */
const TWO_HITS_DAMAGE = MELEE.combo.sequence
    .slice(0, BREAKING_HITS)
    .reduce((total, attackName) => total + MELEE.attacks[attackName].damage, 0);

/**
 * Cajas de acero que encierran los ítems del mapa (`docs/design/04-fluidos.md` §4.2). Distancias en m, masas en kg, tiempos
 * en s, velocidades en m/s.
 * - `side` y `mass`: lado de la caja y masa de la rebanada 2D (la densidad sale de `mass / side²`, en kg/m²); `friction`:
 *   fricción de la caja y de sus pedazos, adimensional;
 * - `strength`: resistencia, igual al daño de los dos primeros golpes del combo melee; la gastan el daño de los golpes, los choques por encima de `impactSpeed` (`impactDamage` por
 *   m/s sobre ese umbral) y cada partícula de los líquidos de `damagingFluids` que la toca (`particleDamage`);
 * - `pieceLayout`: un pedazo por cuadrante `{ x, y }` (±1 desde el centro de la caja), cuyo lado es `pieceSize` veces el de
 *   la caja y cuyo centro queda a `pieceOffset` lados de caja del centro en cada eje; sale a `pieceSpeed` hacia afuera
 *   sumada a la velocidad de la caja y dura `pieceLife`;
 * - `itemSurfaceLift`: altura sobre la superficie del agua a la que queda el ítem de una caja que se rompió sumergida;
 * - `lostMargin`: cuánto fuera de los límites del mapa clásico (o bajo el piso de muerte) una caja cuenta como perdida.
 */
export const CRATE = {
    side: 0.7,
    mass: 20,
    friction: 0.6,
    strength: TWO_HITS_DAMAGE,
    impactSpeed: 8,
    impactDamage: 2,
    particleDamage: 0.1,
    damagingFluids: [FLUID.ACID, FLUID.LAVA],
    pieceLayout: [
        { x: -1, y: -1 },
        { x: 1, y: -1 },
        { x: -1, y: 1 },
        { x: 1, y: 1 },
    ],
    pieceSize: 0.5,
    pieceOffset: 0.25,
    pieceLife: 1.5,
    pieceSpeed: 3,
    itemSurfaceLift: 0.5,
    lostMargin: 5,
};

/**
 * Sistema de las cajas físicas. Una caja es un cuerpo dinámico por cada punto de `Pickups` (que queda inactivo mientras la
 * caja existe: `Pickups.boxer`). Patrón "juntar durante el paso, actuar después": los callbacks de Box2D (`enqueueImpact`,
 * `enqueueParticle`) y el melee (`enqueueDamage`) solo encolan daño; `process` corre después de `stepWorld` y es el único
 * lugar que lo aplica, rompe cajas (destruye el cuerpo, crea los pedazos y libera el ítem donde estaba la caja) y borra los
 * pedazos vencidos. Los datos planos de cada frame (`x`, `y`, `angle`, `wear`) los lee `src/render/crateView.js`.
 *
 * Los vectores y el constructor de fixtures se crean una vez y se liberan en `dispose`. Los cuerpos son del mundo: se
 * destruyen con `world.DestroyBody`, nunca con `Box2D.destroy`.
 */
export class Crates {
    /**
     * @param {object} options
     * @param {object} options.world `b2World`
     * @param {object} options.store `ParticleStore`, para reconocer el líquido de cada partícula
     * @param {object} options.pickups `Pickups` cuyos puntos encierra; este sistema pasa a ser su `boxer`
     * @param {(x: number) => number} options.surfaceAt altura (m, mundo) del agua del nivel en la columna `x`, o `-Infinity` si está seco
     * @param {(x: number, y: number) => boolean} options.isLost verdadero si el punto del mundo (m) está fuera del mapa
     * @param {typeof CRATE} [options.config]
     * @param {boolean} [options.enabled] falso si el mapa no usa cajas: no encierra nada y `Pickups` queda con los ítems sueltos
     */
    constructor({ world, store, pickups, surfaceAt, isLost, config = CRATE, enabled = true }) {
        this.world = world;
        this.store = store;
        this.pickups = pickups;
        this.surfaceAt = surfaceAt;
        this.isLost = isLost;
        this.config = config;
        this.density = config.mass / (config.side * config.side);
        this.builder = new PolygonFixtureBuilder();
        this.bodyDef = new Box2D.b2BodyDef();
        this.bodyDef.set_type(Box2D.b2_dynamicBody);
        this.vector = new Box2D.b2Vec2(0, 0);
        /** Cajas vivas `{ point, body, damage, x, y, angle, wear }`; `wear` va de 0 (nueva) a 1 (a punto de romperse). */
        this.crates = [];
        /** Pedazos vivos `{ body, expiresAt, x, y, angle }`. */
        this.pieces = [];
        this.byBody = new Map();
        /** Punteros de los cuerpos de los pedazos vivos. */
        this.pieceBodies = new Set();
        this.queue = [];
        if (!enabled) return;
        pickups.boxer = this;
        for (const point of pickups.points) this.box(point);
    }

    /** Caja del cuerpo de puntero `bodyPointer`, o `undefined` si ese cuerpo no es una caja. */
    crateOf(bodyPointer) {
        return this.byBody.get(bodyPointer);
    }

    /** Verdadero si el cuerpo de puntero `bodyPointer` es un pedazo de caja vivo (lo usa el filtro de contactos). */
    isPiece(bodyPointer) {
        return this.pieceBodies.has(bodyPointer);
    }

    /** Encola `amount` de daño para `crate`: lo aplica `process`. */
    enqueueDamage(crate, amount) {
        this.queue.push({ crate, amount });
    }

    /**
     * Encola el daño del choque de un contacto entre los cuerpos `bodyPointerA` y `bodyPointerB` a `speed` m/s, si supera
     * el umbral, para cada uno que sea una caja. Se llama desde un callback de Box2D: no crea ni destruye nada.
     */
    enqueueImpact(bodyPointerA, bodyPointerB, speed) {
        const { impactSpeed, impactDamage } = this.config;
        if (speed < impactSpeed) return;
        for (const bodyPointer of [bodyPointerA, bodyPointerB]) {
            const crate = this.byBody.get(bodyPointer);
            if (crate) this.enqueueDamage(crate, (speed - impactSpeed) * impactDamage);
        }
    }

    /**
     * Encola el daño de la partícula de índice `index` que tocó el cuerpo `bodyPointer`, si es una caja y la partícula es
     * de un líquido de `damagingFluids`. Se llama desde un callback de Box2D: no crea ni destruye nada.
     */
    enqueueParticle(bodyPointer, index) {
        const crate = this.byBody.get(bodyPointer);
        if (!crate) return;
        const slot = this.store.slotAt(index);
        if (slot < 0 || this.store.alive[slot] === 0) return;
        if (this.config.damagingFluids.includes(this.store.kind[slot])) this.enqueueDamage(crate, this.config.particleDamage);
    }

    /**
     * Crea un cuerpo dinámico con una caja de lado `side` en `(x, y)` y lo devuelve. Con `velocity` arranca con esa velocidad.
     * @param {number} x
     * @param {number} y
     * @param {number} angle en rad
     * @param {number} side lado del cuadrado, en m
     * @param {{x: number, y: number}} [velocity] en m/s
     */
    createBody(x, y, angle, side, velocity = null) {
        this.vector.set_x(x);
        this.vector.set_y(y);
        this.bodyDef.set_position(this.vector);
        this.bodyDef.set_angle(angle);
        const body = this.world.CreateBody(this.bodyDef);
        this.builder.createBox(body, { x: 0, y: 0, width: side, height: side }, { density: this.density, friction: this.config.friction });
        if (velocity) {
            this.vector.set_x(velocity.x);
            this.vector.set_y(velocity.y);
            body.SetLinearVelocity(this.vector);
        }
        return body;
    }

    /** Encierra el ítem del punto en una caja nueva que cae desde su lugar original. No llamar dentro de un callback de Box2D. */
    box(point) {
        this.pickups.hold(point);
        const { side } = this.config;
        const x = point.homeX;
        const y = point.homeY + this.pickups.offsetY;
        const body = this.createBody(x, y, 0, side);
        body.SetSleepingAllowed(false);
        const crate = { point, body, damage: 0, x, y, angle: 0, wear: 0 };
        point.crate = crate;
        this.crates.push(crate);
        this.byBody.set(Box2D.getPointer(body), crate);
    }

    /** Destruye la caja del punto, si tiene, sin romperla ni liberar el ítem (el punto se está quitando). */
    unbox(point) {
        if (point.crate) this.removeCrate(point.crate);
    }

    /** Saca la caja de las listas y destruye su cuerpo. */
    removeCrate(crate) {
        this.crates.splice(this.crates.indexOf(crate), 1);
        this.byBody.delete(Box2D.getPointer(crate.body));
        this.world.DestroyBody(crate.body);
        crate.point.crate = null;
    }

    /** Nueva ronda: destruye cajas y pedazos y encierra todos los ítems en cajas nuevas. */
    reset() {
        this.queue.length = 0;
        while (this.crates.length > 0) this.removeCrate(this.crates[this.crates.length - 1]);
        for (const piece of this.pieces) this.destroyPiece(piece);
        this.pieces.length = 0;
        for (const point of this.pickups.points) this.box(point);
    }

    /**
     * Aplica lo encolado durante el paso, rompe las cajas sin resistencia, sumergidas o perdidas, borra los pedazos vencidos
     * y deja en `x`, `y`, `angle` y `wear` los datos del frame. Llamar después de `stepWorld`, nunca dentro de un callback de Box2D.
     * @param {number} now reloj de simulación, en s
     */
    process(now) {
        for (const { crate, amount } of this.queue) crate.damage += amount;
        this.queue.length = 0;
        for (let index = this.crates.length - 1; index >= 0; index--) {
            const crate = this.crates[index];
            const position = crate.body.GetPosition();
            const x = position.get_x();
            const y = position.get_y();
            if (crate.damage >= this.config.strength || y < this.surfaceAt(x) || this.isLost(x, y)) this.breakCrate(crate, now);
        }
        for (let index = this.pieces.length - 1; index >= 0; index--) {
            if (now < this.pieces[index].expiresAt) continue;
            this.destroyPiece(this.pieces[index]);
            this.pieces.splice(index, 1);
        }
        this.refresh();
    }

    /** Destruye el cuerpo del pedazo y lo saca del registro de pedazos. */
    destroyPiece(piece) {
        this.pieceBodies.delete(Box2D.getPointer(piece.body));
        this.world.DestroyBody(piece.body);
    }

    /**
     * Rompe la caja: crea los pedazos con la velocidad de la caja más la de salida, destruye su cuerpo y libera el ítem en su
     * lugar (en la superficie si la caja estaba bajo el agua).
     */
    breakCrate(crate, now) {
        const position = crate.body.GetPosition();
        const velocity = crate.body.GetLinearVelocity();
        const x = position.get_x();
        const y = position.get_y();
        const angle = crate.body.GetAngle();
        this.spawnPieces(x, y, angle, velocity.get_x(), velocity.get_y(), now);
        const surface = this.surfaceAt(x);
        const itemY = y < surface ? surface + this.config.itemSurfaceLift : y;
        const { point } = crate;
        this.removeCrate(crate);
        this.pickups.release(point, x, itemY - this.pickups.offsetY);
    }

    /** Crea un pedazo por cuadrante de `pieceLayout` alrededor de `(x, y)`, girados `angle`, saliendo hacia afuera. */
    spawnPieces(x, y, angle, velocityX, velocityY, now) {
        const { side, pieceLayout, pieceSize, pieceOffset, pieceSpeed, pieceLife } = this.config;
        const cosine = Math.cos(angle);
        const sine = Math.sin(angle);
        for (const quadrant of pieceLayout) {
            const rotatedX = quadrant.x * cosine - quadrant.y * sine;
            const rotatedY = quadrant.x * sine + quadrant.y * cosine;
            const length = Math.hypot(rotatedX, rotatedY);
            const directionX = rotatedX / length;
            const directionY = rotatedY / length;
            const pieceX = x + rotatedX * side * pieceOffset;
            const pieceY = y + rotatedY * side * pieceOffset;
            const body = this.createBody(pieceX, pieceY, angle, side * pieceSize, {
                x: velocityX + directionX * pieceSpeed,
                y: velocityY + directionY * pieceSpeed,
            });
            this.pieceBodies.add(Box2D.getPointer(body));
            this.pieces.push({ body, expiresAt: now + pieceLife, x: pieceX, y: pieceY, angle });
        }
    }

    /** Copia posición, giro y desgaste de cada caja y pedazo a sus datos planos. */
    refresh() {
        for (const crate of this.crates) {
            const position = crate.body.GetPosition();
            crate.x = position.get_x();
            crate.y = position.get_y();
            crate.angle = crate.body.GetAngle();
            crate.wear = Math.min(1, crate.damage / this.config.strength);
        }
        for (const piece of this.pieces) {
            const position = piece.body.GetPosition();
            piece.x = position.get_x();
            piece.y = position.get_y();
            piece.angle = piece.body.GetAngle();
        }
    }

    /** Destruye todos los cuerpos y libera lo nativo; el punto de `Pickups` vuelve a no tener caja. */
    dispose() {
        for (const crate of this.crates) {
            this.world.DestroyBody(crate.body);
            crate.point.crate = null;
        }
        for (const piece of this.pieces) this.destroyPiece(piece);
        this.crates.length = 0;
        this.pieces.length = 0;
        this.byBody.clear();
        this.queue.length = 0;
        if (this.pickups.boxer === this) this.pickups.boxer = null;
        this.builder.dispose();
        Box2D.destroy(this.bodyDef);
        Box2D.destroy(this.vector);
    }
}
