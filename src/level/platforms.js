import { boundsOfBodies, fixtureBounds, forEachBody, forEachFixture, forEachWorldBody } from "../core/engine/box2d.js";

/**
 * Recalcula los contactos de un fixture (`Refilter`): no cambia sus datos.
 * @param {object} fixture `b2Fixture`
 */
function refilterFixture(fixture) {
    fixture.Refilter();
}

/**
 * Recalcula los contactos de todos los fixtures de un cuerpo.
 * @param {object} body `b2Body`
 */
function refilterBody(body) {
    forEachFixture(body, refilterFixture, null);
}

/**
 * Valores de las plataformas atravesables: `tolerance` (m) es cuánto puede estar el punto más bajo del dueño por debajo
 * del tope para seguir apoyado (y cuánto por encima para poder bajar); `dropMaxTime` (s) corta la bajada si el dueño no
 * termina de pasar. `approach` (m) es la franja sobre el tope en la que se registra el par antes de tocar, para que un
 * dueño que cae rápido (hasta ~30 m/s por paso de 1/60 s) quede sólido antes de hundirse bajo `tope - tolerance`. Un par
 * sólido sigue sólido mientras se solapen (histéresis): hundirse unos centímetros al caminar no lo vuelve fantasma; solo
 * la bajada o salir del solapamiento lo liberan.
 */
export const ONE_WAY = { tolerance: 0.05, approach: 0.5, dropMaxTime: 0.4 };

/**
 * Regla de colisión por defecto de Box2D (`b2ContactFilter::ShouldCollide`) con `groupIndex`, `categoryBits` y `maskBits`.
 */
function defaultCollide(fixtureA, fixtureB) {
    const a = fixtureA.GetFilterData();
    const b = fixtureB.GetFilterData();
    const group = a.get_groupIndex();
    if (group === b.get_groupIndex() && group !== 0) return group > 0;
    return (a.get_maskBits() & b.get_categoryBits()) !== 0 && (a.get_categoryBits() & b.get_maskBits()) !== 0;
}

/**
 * Plataformas atravesables desde abajo, genéricas: instala el único `JSContactFilter` del mundo. Un dueño es un conjunto
 * de cuerpos que pasa o choca entero: es fantasma contra una plataforma si su punto más bajo (mínimo de `GetAABB`) está
 * por debajo de `tope - tolerance` o si tiene una bajada activa en ella. Un cuerpo dinámico sin dueño es su propio
 * dueño. `ShouldCollide` solo lee estado; `update(now)` recalcula los pares después de cada `stepWorld` y, cuando uno
 * cambia, hace `Refilter` de las fixtures del dueño porque Box2D no repite la consulta mientras las cajas siguen
 * solapadas.
 */
export class OneWayPlatforms {
    constructor(world, config = ONE_WAY) {
        this.world = world;
        this.config = config;
        /** Reloj de simulación (s) del último `update`; marca el inicio de las bajadas. */
        this.now = 0;
        /** Puntero de fixture → { minX, maxX, bottom, top, fixture, moving }. */
        this.platforms = new Map();
        /** Clave → dueño `{ bodies, drops, pairs }`. */
        this.owners = new Map();
        /** Puntero de cuerpo → dueño registrado. */
        this.byBody = new Map();
        /** Puntero de cuerpo dinámico sin dueño → su dueño propio. */
        this.implicit = new Map();
        this.box = { minX: 0, maxX: 0, low: 0, high: 0 };
        this.bounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
        this.noDrops = new Map();
        this.filter = new Box2D.JSContactFilter();
        this.filter.ShouldCollide = (ptrA, ptrB) => this.shouldCollide(ptrA, ptrB);
        world.SetContactFilter(this.filter);
    }

    /**
     * Registra la plataforma `fixture` con los límites de su caja. Con `moving` (su cuerpo se mueve) `update` los vuelve a
     * leer en cada paso.
     */
    addPlatform(fixture, { moving = false } = {}) {
        const platform = { fixture, moving, minX: 0, maxX: 0, bottom: 0, top: 0 };
        this.refresh(platform);
        this.platforms.set(Box2D.getPointer(fixture), platform);
    }

    refresh(platform) {
        const bounds = fixtureBounds(platform.fixture, this.bounds);
        platform.minX = bounds.minX;
        platform.maxX = bounds.maxX;
        platform.bottom = bounds.minY;
        platform.top = bounds.maxY;
    }

    /**
     * Cambia las fixtures de una plataforma por las de su forma rehecha (`docs/design/05-escenario.md` §5.5) sin perder el
     * estado de los robots: cada dueño traspasa a las nuevas el par que tenía con las viejas (sólido si alguno de los
     * pares era sólido) y su bajada en curso. Llamar con las viejas todavía vivas, para que ningún puntero se reuse
     * antes; quien llama las destruye después. Con `oldFixtures` vacío solo registra las nuevas.
     * @param {object[]} oldFixtures `b2Fixture` que se desregistran
     * @param {object[]} newFixtures `b2Fixture` que se registran
     * @param {{moving?: boolean}} [options] `moving`: como en `addPlatform`
     */
    replacePlatforms(oldFixtures, newFixtures, { moving = false } = {}) {
        const oldPointers = oldFixtures.map((fixture) => Box2D.getPointer(fixture));
        const owners = [...this.owners.values(), ...this.implicit.values()];
        for (const owner of owners) this.inheritPairs(owner, oldPointers, newFixtures);
        for (const pointer of oldPointers) this.platforms.delete(pointer);
        for (const fixture of newFixtures) this.addPlatform(fixture, { moving });
    }

    /**
     * Pasa el par y la bajada que un dueño tenía con las fixtures viejas a las nuevas.
     * @param {object} owner dueño `{ bodies, drops, pairs }`
     * @param {number[]} oldPointers punteros de las fixtures viejas
     * @param {object[]} newFixtures `b2Fixture` nuevas
     */
    inheritPairs(owner, oldPointers, newFixtures) {
        let ghost;
        let dropStart;
        for (const pointer of oldPointers) {
            const state = owner.pairs.get(pointer);
            if (state === false) ghost = false;
            else if (state === true && ghost === undefined) ghost = true;
            const start = owner.drops.get(pointer);
            if (start !== undefined) dropStart = Math.min(dropStart ?? Infinity, start);
            owner.pairs.delete(pointer);
            owner.drops.delete(pointer);
        }
        for (const fixture of newFixtures) {
            const pointer = Box2D.getPointer(fixture);
            if (ghost !== undefined) owner.pairs.set(pointer, ghost);
            if (dropStart !== undefined) owner.drops.set(pointer, dropStart);
        }
    }

    removePlatform(fixture) {
        const ptr = Box2D.getPointer(fixture);
        if (!this.platforms.delete(ptr)) return;
        const owners = [...this.owners.values(), ...this.implicit.values()];
        for (const owner of owners) {
            owner.drops.delete(ptr);
            owner.pairs.delete(ptr);
        }
        fixture.Refilter();
    }

    /**
     * Borra los pares y las bajadas de `fixture` en todos los dueños (registrados e implícitos) sin sacarla del registro
     * ni perder su `moving`, y hace `Refilter` de los dueños afectados. Sirve para que una plataforma que vuelve a ser
     * sólida no conserve un par "sólido" de antes: el próximo `update` lo recalcula desde la posición actual.
     */
    forget(fixture) {
        const ptr = Box2D.getPointer(fixture);
        const owners = [...this.owners.values(), ...this.implicit.values()];
        for (const owner of owners) {
            const had = owner.drops.delete(ptr);
            if (owner.pairs.delete(ptr) || had) this.refilter(owner);
        }
    }

    /**
     * Registra `bodies` (iterable de `b2Body`) como el dueño `key`. Con una clave que ya existe reemplaza los cuerpos y
     * conserva la bajada en curso y los pares ya registrados (el robot que gira se vuelve a crear en el mismo lugar y, si
     * los pares se perdieran, quedaría fantasma al hundirse unos centímetros bajo el tope al recrearse).
     */
    addOwner(key, bodies) {
        const list = [...bodies];
        const old = this.owners.get(key);
        if (old) for (const body of old.bodies) this.byBody.delete(Box2D.getPointer(body));
        const owner = old ?? { bodies: list, drops: new Map(), pairs: new Map() };
        owner.bodies = list;
        this.owners.set(key, owner);
        for (const body of list) this.byBody.set(Box2D.getPointer(body), owner);
    }

    removeOwner(key) {
        const owner = this.owners.get(key);
        if (!owner) return;
        for (const body of owner.bodies) this.byBody.delete(Box2D.getPointer(body));
        this.owners.delete(key);
    }

    /**
     * Empieza la bajada del dueño `key` en las plataformas atravesables donde está apoyado (punto más bajo a
     * `tolerance` del tope y solapado en x). Devuelve `false` si no estaba apoyado en ninguna.
     */
    drop(key) {
        const owner = this.owners.get(key);
        if (!owner) return false;
        const box = this.measure(owner);
        const tol = this.config.tolerance;
        let started = false;
        for (const [ptr, p] of this.platforms) {
            const resting = Math.abs(box.low - p.top) <= tol;
            if (!resting || box.maxX <= p.minX || box.minX >= p.maxX || owner.drops.has(ptr)) continue;
            owner.drops.set(ptr, this.now);
            owner.pairs.set(ptr, true);
            started = true;
        }
        if (started) this.refilter(owner);
        return started;
    }

    /** Se llama después de cada `stepWorld`: cierra las bajadas terminadas y vuelve a filtrar los pares que cambiaron. */
    update(now) {
        this.now = now;
        for (const p of this.platforms.values()) if (p.moving) this.refresh(p);
        this.syncImplicit();
        for (const owner of this.owners.values()) this.updateOwner(owner);
        for (const owner of this.implicit.values()) this.updateOwner(owner);
    }

    updateOwner(owner) {
        const box = this.measure(owner);
        const tol = this.config.tolerance;
        let changed = false;
        for (const [ptr, start] of owner.drops) {
            const p = this.platforms.get(ptr);
            if (!p || box.high < p.bottom || this.now - start >= this.config.dropMaxTime) {
                owner.drops.delete(ptr);
                changed = true;
            }
        }
        for (const [ptr, p] of this.platforms) {
            const overlaps =
                box.maxX > p.minX && box.minX < p.maxX && box.high > p.bottom - tol && box.low < p.top + this.config.approach;
            if (!overlaps) {
                owner.pairs.delete(ptr);
                continue;
            }
            const before = owner.pairs.get(ptr);
            const ghost = owner.drops.has(ptr) || (before !== false && box.low < p.top - tol);
            if (before !== undefined && before !== ghost) changed = true;
            owner.pairs.set(ptr, ghost);
        }
        if (changed) this.refilter(owner);
    }

    /**
     * Registra un cuerpo dinámico que no pertenece a una instancia de RagImporter.
     * @param {object} body `b2Body`
     * @param {Set<number>} seen punteros de los cuerpos implícitos vistos en este recorrido
     */
    trackImplicitBody(body, seen) {
        const ptr = Box2D.getPointer(body);
        if (body.GetType() !== Box2D.b2_dynamicBody || this.byBody.has(ptr)) return;
        seen.add(ptr);
        if (!this.implicit.has(ptr)) this.implicit.set(ptr, { bodies: [body], drops: new Map(), pairs: new Map() });
    }

    syncImplicit() {
        const seen = new Set();
        forEachWorldBody(this.world, (body, visited) => this.trackImplicitBody(body, visited), seen);
        for (const ptr of this.implicit.keys()) if (!seen.has(ptr)) this.implicit.delete(ptr);
    }

    refilter(owner) {
        forEachBody(owner.bodies, refilterBody, null);
    }

    /** Caja del dueño (unión de los `GetAABB` de sus fixtures) en `this.box`; no reserva memoria. */
    measure(owner) {
        const box = this.box;
        const bounds = boundsOfBodies(owner.bodies, this.bounds);
        box.minX = bounds.minX;
        box.maxX = bounds.maxX;
        box.low = bounds.minY;
        box.high = bounds.maxY;
        return box;
    }

    /** Callback de Box2D: solo lee estado. */
    shouldCollide(ptrA, ptrB) {
        const fixtureA = Box2D.wrapPointer(ptrA, Box2D.b2Fixture);
        const fixtureB = Box2D.wrapPointer(ptrB, Box2D.b2Fixture);
        if (!defaultCollide(fixtureA, fixtureB)) return false;
        const platformA = this.platforms.get(ptrA);
        const platformB = this.platforms.get(ptrB);
        if (!platformA === !platformB) return true;
        const platform = platformA ?? platformB;
        const ptr = platformA ? ptrA : ptrB;
        const body = (platformA ? fixtureB : fixtureA).GetBody();
        if (body.GetType() !== Box2D.b2_dynamicBody) return true;
        const bodyPtr = Box2D.getPointer(body);
        const owner = this.byBody.get(bodyPtr) ?? this.implicit.get(bodyPtr) ?? { bodies: [body], drops: this.noDrops };
        if (owner.drops.has(ptr)) return false;
        const state = owner.pairs?.get(ptr);
        if (state !== undefined) return !state;
        return this.measure(owner).low >= platform.top - this.config.tolerance;
    }
}
