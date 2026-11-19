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
        const aabb = platform.fixture.GetAABB(0);
        platform.minX = aabb.get_lowerBound().get_x();
        platform.maxX = aabb.get_upperBound().get_x();
        platform.bottom = aabb.get_lowerBound().get_y();
        platform.top = aabb.get_upperBound().get_y();
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

    syncImplicit() {
        const seen = new Set();
        for (let body = this.world.GetBodyList(); Box2D.getPointer(body) !== 0; body = body.GetNext()) {
            const ptr = Box2D.getPointer(body);
            if (body.GetType() !== Box2D.b2_dynamicBody || this.byBody.has(ptr)) continue;
            seen.add(ptr);
            if (!this.implicit.has(ptr)) this.implicit.set(ptr, { bodies: [body], drops: new Map(), pairs: new Map() });
        }
        for (const ptr of this.implicit.keys()) if (!seen.has(ptr)) this.implicit.delete(ptr);
    }

    refilter(owner) {
        for (const body of owner.bodies) {
            for (let fixture = body.GetFixtureList(); Box2D.getPointer(fixture) !== 0; fixture = fixture.GetNext()) {
                fixture.Refilter();
            }
        }
    }

    /** Caja del dueño (unión de los `GetAABB` de sus fixtures) en `this.box`; no reserva memoria. */
    measure(owner) {
        const box = this.box;
        box.minX = Infinity;
        box.maxX = -Infinity;
        box.low = Infinity;
        box.high = -Infinity;
        for (const body of owner.bodies) {
            for (let fixture = body.GetFixtureList(); Box2D.getPointer(fixture) !== 0; fixture = fixture.GetNext()) {
                const aabb = fixture.GetAABB(0);
                const lower = aabb.get_lowerBound();
                const upper = aabb.get_upperBound();
                box.minX = Math.min(box.minX, lower.get_x());
                box.maxX = Math.max(box.maxX, upper.get_x());
                box.low = Math.min(box.low, lower.get_y());
                box.high = Math.max(box.high, upper.get_y());
            }
        }
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
