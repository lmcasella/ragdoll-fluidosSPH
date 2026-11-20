import { getRaycaster } from "./raycast.js";

const AIM_LIMIT = Math.PI - 0.05;
const AIM_HYSTERESIS = 0.4;
const GROUND_RAY = 0.3;
const FLASH_TIME = 1;
const BURN_TIME = 1.5;
const BURN_DPS = 4;
// Cortocircuito (agua): falla de todo el robot, por eso no usa el multiplicador por parte
const WET_TIME = 3;
const SHORT_CIRCUIT_DPS = 3;
// Pegado (miel, docs/design/04-fluidos.md): factores sobre la velocidad de caminar, el frenado sin input y el
// salto; `down` es gravedad extra (m/s²) y `grace` los s que dura tras la última cercanía a la miel
export const STICKY = { speed: 0.1, brake: 0.5, jump: 0.3, down: 10, grace: 0.3 };
const WALK_SPEED = 6;
const JUMP_SPEED = 9;
/**
 * Salto variable y caída rápida (#152): `cut` multiplica la velocidad vertical al soltar el salto mientras el robot
 * sube; `fastFall` es la fracción de la gravedad que se suma por paso con el stick abajo mientras cae.
 */
export const JUMP = { cut: 0.5, fastFall: 0.3 };
/** Gravedad del mundo (m/s²), la misma con la que se crea en `index.html`. */
const GRAVITY = 10;
const WALK_FRICTION = 0.85;

/**
 * Velocidad del clip de caminar: |vx| del torso / `refSpeed`, acotada a [minSpeed, maxSpeed] y suavizada con
 * `smoothing` (fracción del error que se corrige por paso fijo). `refSpeed` (m/s) es el |vx| que el torso sostiene
 * al caminar a `WALK_SPEED` (medido con el rig v5: 5,1; el paso de física y el roce con el piso restan al 6 pedido).
 */
export const WALK_ANIM = { refSpeed: 5.1, minSpeed: 0.1, maxSpeed: 1.25, smoothing: 0.1 };

/**
 * Estados de aire. `deadband` (m/s): por debajo de esa velocidad horizontal relativa a la mira el clip es el neutro.
 * `fallSpeed` (m/s): velocidad de caída del torso desde la que se trabaja `fallHigh` hasta aterrizar.
 */
export const AIR = { deadband: 1.0, fallSpeed: 10 };

/**
 * Roll. `duration` (s) es el tiempo del estado, con el clip a `clipSpeed`; `speed` (m/s) fija la vx de la raíz;
 * `cooldown` (s) cuenta desde que termina.
 */
export const ROLL = { duration: 0.8, clipSpeed: 1.5, speed: 4, cooldown: 0.5 };

/** Largo (s) de los clips `jump_start` y de las reacciones al golpe. */
const JUMP_START_TIME = 0.6;
const REACT_TIME = 0.4;

/** Estados que sueltan los overrides de mira: los brazos los maneja el clip. */
const BUSY_STATES = new Set([
    "dead",
    "ragdoll",
    "reactSimple",
    "reactStumble",
    "roll",
    "rollBack",
    "combo1",
    "combo2",
    "combo3",
    "airPunch",
    "airKick",
    "block",
]);

/**
 * rig: { rootBody: id del cuerpo raíz, aimJoints: nombres de articulaciones que apuntan,
 *        aimHold: articulaciones de los codos, aimOffset: ángulo de reposo del arma relativo al padre,
 *        clips: estado → clave de clip, melee: tabla `MELEE` (js/melee.js),
 *        feet: ids de los pies (rayos de piso), gun: { body, muzzle: [x, y] local },
 *        damage: { [bodyId]: multiplicador }, defaultDamage: multiplicador del resto }
 */
export class ActiveRagdoll {
    constructor(def, physicsWorld, startX, startY, rig, flipX = false) {
        this.world = physicsWorld;
        this.rig = rig;
        this.flipX = flipX;
        this.rag = def.spawn(physicsWorld, { x: startX, y: startY, flipX });
        this.torso = this.rag.bodies.get(rig.rootBody);
        this.scratch = new Box2D.b2Vec2(0, 0);
        this.raycaster = getRaycaster(physicsWorld);
        this.ownBodies = new Set(
            [...this.rag.bodies.values()].map((b) => Box2D.getPointer(b)),
        );

        // Estados del jugador
        this.hp = 100;
        this.stickyTimer = 0; // s restantes de pegado
        this.boxes = new Float32Array(4 * (this.countFixtures() + 1));
        this.framesGrounded = 0;
        this.jumping = false;
        this.clipState = null;
        this.animSpeed = 1;
        this.facing = flipX ? -1 : 1;
        this.weapon = 1; // id del arma equipada
        this.tanks = new Map(); // id de arma → partículas que quedan; lo carga la raíz de composición
        this.flashes = new Map(); // bodyId → instante del último golpe (s)
        this.burns = new Map(); // bodyId → segundos de quemadura restantes
        this.drowned = false;
        this.wetTimer = 0; // s restantes de cortocircuito
        this.now = 0;
        this.blockHeld = false;
        this.attack = null;
        this.attackStart = -Infinity;
        this.attackHit = false;
        this.nextAttack = null;
        this.meleeReadyAt = 0;
        this.reactKind = null;
        this.reactStart = -Infinity;
        this.rollStart = -Infinity;
        this.rollReadyAt = 0;
        this.rollBack = false;
        this.rollDir = 1;
        this.fallLatched = false;
        /** Verdadero desde que aterriza una caída alta (la que activa `fallHigh`) hasta que quien lo consume lo baja. */
        this.landed = false;
        this.jumpAt = -Infinity;
        this.jumpCuttable = false;
        this.lastBlocked = -Infinity;
    }

    get dead() {
        return this.hp <= 0;
    }

    // Cayó a la pileta: cortocircuito total
    drown(now = this.now) {
        if (this.dead) return;
        this.drowned = true;
        this.hp = 0;
        for (const id of this.rag.bodies.keys()) this.flashes.set(id, now);
    }

    get side() {
        return this.flipX ? -1 : 1;
    }

    /** Apoyado: `framesGrounded` > 2, el mismo criterio con el que se aterriza. */
    get grounded() {
        return this.framesGrounded > 2;
    }

    /**
     * Verdadero cuando los brazos los maneja un clip y no la mira: `aim()` no escribe overrides, el emisor ve el
     * gatillo suelto y el gancho no tira. Incluye el bloqueo pedido aunque el estado entre en el próximo paso.
     */
    get armsBusy() {
        return (
            this.dead ||
            this.reacting() ||
            this.rolling() ||
            this.attack !== null ||
            this.clipState === "block" ||
            (this.blockHeld && this.grounded && !this.isStunned())
        );
    }

    get blocking() {
        return this.clipState === "block";
    }

    reacting(now = this.now) {
        return now - this.reactStart < REACT_TIME;
    }

    rolling(now = this.now) {
        return now - this.rollStart < ROLL.duration;
    }

    /**
     * Registra si `block` está apretado; la raíz de composición lo llama una vez por frame antes de la mira.
     * @param {boolean} held Intención `block` del jugador.
     */
    guard(held) {
        this.blockHeld = held;
    }

    /**
     * Acepta un golpe (`punch`) o patada (`kick`) pedidos en este frame. Apoyado, ambos son `punch`: empieza `combo1`
     * o deja en espera el siguiente golpe si cae en la ventana de encadenado. En el aire, `airPunch` o `airKick`.
     * @param {"punch"|"kick"} kind Intención.
     * @param {number} [now] Reloj de simulación, s.
     * @returns {boolean} Si el ataque se aceptó.
     */
    strike(kind, now = this.now) {
        const melee = this.rig.melee;
        if (!melee || this.dead || this.reacting(now) || this.rolling(now) || this.isStunned(now)) return false;
        if (!this.grounded) {
            if (this.attack !== null || now < this.meleeReadyAt) return false;
            this.beginAttack(kind === "kick" ? "airKick" : "airPunch", now);
            return true;
        }
        if (this.blockHeld) return false;
        if (this.attack !== null) return this.chainAttack(now);
        if (now < this.meleeReadyAt) return false;
        this.beginAttack(melee.combo.sequence[0], now);
        return true;
    }

    punch(now = this.now) {
        return this.strike("punch", now);
    }

    kick(now = this.now) {
        return this.strike("kick", now);
    }

    chainAttack(now) {
        const { attacks, combo } = this.rig.melee;
        const index = combo.sequence.indexOf(this.attack);
        if (index < 0 || index === combo.sequence.length - 1) return false;
        const row = attacks[this.attack];
        const t = now - this.attackStart;
        if (t < row.active[0] || t > row.duration + combo.grace) return false;
        if (t >= row.duration) {
            this.beginAttack(combo.sequence[index + 1], now);
        } else {
            this.nextAttack = combo.sequence[index + 1];
        }
        return true;
    }

    beginAttack(name, now) {
        this.attack = name;
        this.attackStart = now;
        this.attackHit = false;
        this.nextAttack = null;
        this.enterState(name, 1, true);
    }

    endAttack(now) {
        this.attack = null;
        this.nextAttack = null;
        this.meleeReadyAt = now + this.rig.melee.combo.cooldown;
    }

    /** Avanza el ataque en curso: encadena el golpe en espera, o lo corta al vencer su tiempo o al aterrizar. */
    updateAttack(now) {
        if (this.attack === null) return;
        const { attacks, combo } = this.rig.melee;
        const row = attacks[this.attack];
        const index = combo.sequence.indexOf(this.attack);
        const t = now - this.attackStart;
        const air = index < 0;
        if (air && this.grounded) {
            this.endAttack(now);
        } else if (this.nextAttack !== null && t >= row.duration) {
            this.beginAttack(this.nextAttack, now);
        } else if (t >= row.duration + (index >= 0 && index < combo.sequence.length - 1 ? combo.grace : 0)) {
            this.endAttack(now);
        }
    }

    /**
     * Fila de `MELEE` del ataque en su ventana activa que todavía no conectó, o `null`.
     * @param {number} [now] Reloj de simulación, s.
     */
    activeAttack(now = this.now) {
        if (this.dead || this.attack === null || this.attackHit) return null;
        const row = this.rig.melee.attacks[this.attack];
        const t = now - this.attackStart;
        return t >= row.active[0] && t <= row.active[1] ? row : null;
    }

    /**
     * Velocidad horizontal del paso adelante de un golpe del combo (columna `lunge`, m/s hacia el lado de la mira),
     * desde el inicio del golpe hasta el fin de su ventana activa; 0 fuera de eso. Mantiene al rival empujado dentro
     * del alcance para el golpe siguiente.
     */
    lungeSpeed(now = this.now) {
        if (this.attack === null) return 0;
        const row = this.rig.melee.attacks[this.attack];
        if (!row.lunge || now - this.attackStart > row.active[1]) return 0;
        return row.lunge * this.side;
    }

    /** Marca el ataque en curso como conectado (pegó o fue bloqueado): no vuelve a pegar en esa ventana. */
    markConnected() {
        this.attackHit = true;
    }

    /**
     * Recibe un golpe melee que conectó: fija la reacción (que corta ataque y roll) con el reloj de simulación.
     * @param {"simple"|"stumble"} reaction Columna `reaction` del ataque.
     * @param {number} [now] Reloj de simulación, s.
     */
    hit(reaction, now = this.now) {
        this.reactKind = reaction === "stumble" ? "reactStumble" : "reactSimple";
        this.reactStart = now;
        this.attack = null;
        this.nextAttack = null;
        if (this.rolling(now)) {
            this.rollStart = -Infinity;
            this.rollReadyAt = now + ROLL.cooldown;
        }
        if (!this.dead) this.enterState(this.reactKind, 1, true);
    }

    /** Recibe un golpe melee bloqueado: no cambia de estado, solo deja el instante. */
    blocked(now = this.now) {
        this.lastBlocked = now;
    }

    tryRoll(input, now) {
        if (this.dead || this.framesGrounded <= 5 || this.isStunned(now) || this.attack !== null) return;
        if (now < this.rollReadyAt || this.rolling(now) || this.reacting(now)) return;
        const dir = input.right && !input.left ? 1 : input.left && !input.right ? -1 : this.side;
        this.rollDir = dir;
        this.rollBack = dir !== this.side;
        this.rollStart = now;
        this.rollReadyAt = now + ROLL.duration + ROLL.cooldown;
    }

    // Empuje del robot entero: suma la misma velocidad a todas sus piezas (como el salto). Un impulso
    // sobre una sola pieza de 1 kg apenas mueve a un robot de 13 piezas.
    knockback(vx, vy) {
        for (const body of this.rag.bodies.values()) {
            const v = body.GetLinearVelocity();
            this.scratch.set_x(v.get_x() + vx);
            this.scratch.set_y(v.get_y() + vy);
            body.SetLinearVelocity(this.scratch);
        }
    }

    // Tras recibir un golpe, el control no pisa la velocidad durante `duration`: deja actuar al empuje
    stun(duration, now = this.now) {
        this.stunnedUntil = Math.max(this.stunnedUntil ?? 0, now + duration);
    }

    isStunned(now = this.now) {
        return now < (this.stunnedUntil ?? 0);
    }

    /**
     * Copia el estado de juego desde la instancia anterior (al girar se vuelve a generar el ragdoll), incluida la
     * máquina de clips, para que el giro no corte un combo ni una reacción.
     */
    copyStateFrom(old) {
        this.hp = old.hp;
        this.weapon = old.weapon;
        this.tanks = old.tanks;
        this.stickyTimer = old.stickyTimer;
        this.framesGrounded = old.framesGrounded;
        this.jumping = old.jumping;
        this.flashes = old.flashes;
        this.burns = old.burns;
        this.wetTimer = old.wetTimer;
        this.aimDir = old.aimDir;
        this.now = old.now;
        this.clipState = old.clipState;
        this.blockHeld = old.blockHeld;
        this.attack = old.attack;
        this.attackStart = old.attackStart;
        this.attackHit = old.attackHit;
        this.nextAttack = old.nextAttack;
        this.meleeReadyAt = old.meleeReadyAt;
        this.reactKind = old.reactKind;
        this.reactStart = old.reactStart;
        this.rollStart = old.rollStart;
        this.rollReadyAt = old.rollReadyAt;
        this.rollBack = old.rollBack;
        this.rollDir = old.rollDir;
        this.fallLatched = old.fallLatched;
        this.jumpAt = old.jumpAt;
        this.jumpCuttable = old.jumpCuttable;
        this.stunnedUntil = old.stunnedUntil;
        this.lastBlocked = old.lastBlocked;
    }

    takeDamage(amount) {
        this.hp -= amount;
        if (this.hp < 0) this.hp = 0;
    }

    // Daño a una parte del cuerpo: aplica su multiplicador y la pone roja
    hurt(bodyId, amount, now = this.now) {
        if (this.dead) return 0;
        const multiplier = this.rig.damage?.[bodyId] ?? this.rig.defaultDamage ?? 1;
        const dealt = amount * multiplier;
        this.takeDamage(dealt);
        this.flashes.set(bodyId, now);
        return dealt;
    }

    // 0 = color original, 1 = rojo pleno; vuelve al color original en FLASH_TIME
    flashAmount(bodyId, now = this.now) {
        const t = this.flashes.get(bodyId);
        if (t === undefined) return 0;
        const k = 1 - (now - t) / FLASH_TIME;
        if (k <= 0) {
            this.flashes.delete(bodyId);
            return 0;
        }
        return k;
    }

    burn(bodyId) {
        this.burns.set(bodyId, BURN_TIME);
    }

    // Moja al robot (renueva el tiempo); el daño se aplica en updateStatus
    soak() {
        this.wetTimer = WET_TIME;
    }

    // Lo seca (fin de la ronda: el cortocircuito no debe matar al ganador bajo el cartel)
    dry() {
        this.wetTimer = 0;
    }

    // Borde inferior (m) de la pieza más baja: AABB de las fixtures, sin crear objetos nativos
    lowestPoint() {
        let lowest = Infinity;
        for (const body of this.rag.bodies.values()) {
            for (let fixture = body.GetFixtureList(); Box2D.getPointer(fixture) !== 0; fixture = fixture.GetNext()) {
                lowest = Math.min(lowest, fixture.GetAABB(0).get_lowerBound().get_y());
            }
        }
        return lowest;
    }

    get wet() {
        return this.wetTimer > 0;
    }

    // Lo pega al piso por miel (renueva el tiempo); lo dispara DamageSystem.process
    stick() {
        this.stickyTimer = STICKY.grace;
    }

    get sticky() {
        return this.stickyTimer > 0;
    }

    countFixtures() {
        let n = 0;
        for (const body of this.rag.bodies.values()) {
            for (let f = body.GetFixtureList(); Box2D.getPointer(f) !== 0; f = f.GetNext()) n++;
        }
        return n;
    }

    // [minX, minY, maxX, maxY] de cada fixture y, al final, de la caja que las une. Devuelve un buffer
    // reutilizado (sin memoria nativa nueva) que vale hasta la próxima llamada
    fixtureBoxes() {
        const out = this.boxes;
        let n = 0;
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const body of this.rag.bodies.values()) {
            for (let f = body.GetFixtureList(); Box2D.getPointer(f) !== 0; f = f.GetNext()) {
                const aabb = f.GetAABB(0);
                const lo = aabb.get_lowerBound();
                const hi = aabb.get_upperBound();
                const x0 = lo.get_x();
                const y0 = lo.get_y();
                const x1 = hi.get_x();
                const y1 = hi.get_y();
                out[n++] = x0;
                out[n++] = y0;
                out[n++] = x1;
                out[n++] = y1;
                if (x0 < minX) minX = x0;
                if (y0 < minY) minY = y0;
                if (x1 > maxX) maxX = x1;
                if (y1 > maxY) maxY = y1;
            }
        }
        out[n++] = minX;
        out[n++] = minY;
        out[n++] = maxX;
        out[n++] = maxY;
        return out;
    }

    // Estados con duración (quemaduras); una vez por paso fijo
    updateStatus(dt) {
        if (this.stickyTimer > 0) this.stickyTimer = Math.max(0, this.stickyTimer - dt);
        for (const [bodyId, left] of this.burns) {
            this.hurt(bodyId, BURN_DPS * dt);
            if (left - dt <= 0) this.burns.delete(bodyId);
            else this.burns.set(bodyId, left - dt);
        }
        if (this.wetTimer > 0 && !this.dead) {
            this.takeDamage(SHORT_CIRCUIT_DPS * dt);
            this.wetTimer = Math.max(0, this.wetTimer - dt);
        }
    }

    // Piso por raycast: un rayo corto hacia abajo desde cada pie, ignorando al propio robot
    isGrounded() {
        const feet = this.rig.feet ?? [];
        if (feet.length === 0) {
            return Math.abs(this.torso.GetLinearVelocity().get_y()) < 1.0;
        }
        for (const id of feet) {
            const pos = this.rag.bodies.get(id).GetPosition();
            const x = pos.get_x();
            const y = pos.get_y();
            if (this.raycaster.cast(x, y, x, y - GROUND_RAY, this.ownBodies)) return true;
        }
        return false;
    }

    // Boca del arma y dirección del cañón en el mundo (sigue al cuerpo del arma, con flipX)
    muzzle() {
        const gun = this.rig.gun;
        if (!gun) return null;
        const body = this.rag.bodies.get(gun.body);
        const pos = body.GetPosition();
        const px = pos.get_x();
        const py = pos.get_y();
        const angle = body.GetAngle();
        const mirror = this.flipX ? -1 : 1;
        const lx = gun.muzzle[0] * mirror;
        const ly = gun.muzzle[1];
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        return {
            x: px + lx * cos - ly * sin,
            y: py + lx * sin + ly * cos,
            dx: cos * mirror,
            dy: sin * mirror,
        };
    }

    // Ángulo nativo de la articulación (sin espejar); el objetivo se toma por el camino más corto
    // desde el ángulo actual para que el brazo no salte al cruzar ±π
    // Con rig.gun: el ángulo se resuelve para que la línea del cañón (no la del hombro) pase por el objetivo.
    // Los joints de rig.aimHold (codos) quedan en reposo para que ningún clip mueva la cadena del arma.
    /**
     * El primer joint de `rig.aimJoints` lleva el arma y apunta por la línea del cañón; los demás apuntan con su propia geometría, para que ninguno quede trabado donde lo dejó un clip.
     * @param {number} targetX Punto a apuntar, m.
     * @param {number} targetY Punto a apuntar, m.
     * @param {number} [now] Reloj de simulación, s; el mismo que reciben `punch`, `stun` y `hurt`.
     */
    aim(targetX, targetY, now = this.now) {
        this.now = now;
        if (this.dead || this.armsBusy) return;
        const mirror = this.flipX ? -1 : 1;
        const forward = this.flipX ? Math.PI : 0;
        const muzzle = this.muzzle();
        for (const name of this.rig.aimHold ?? []) {
            this.rag.setJointAngle(name, 0, { strength: 1 });
        }
        this.rig.aimJoints.forEach((name, index) => {
            const joint = this.rag.joint(name);
            const anchor = joint.GetAnchorA();
            const ax = anchor.get_x();
            const ay = anchor.get_y();
            const current = joint.GetJointAngle();
            let desired;
            if (muzzle && index === 0) {
                // Distancia (con signo) de la línea del cañón al pivote del hombro
                const gunAngle = Math.atan2(muzzle.dy, muzzle.dx);
                const offset = -(muzzle.x - ax) * muzzle.dy + (muzzle.y - ay) * muzzle.dx;
                const dist = Math.hypot(targetX - ax, targetY - ay);
                const toTarget = Math.atan2(targetY - ay, targetX - ax);
                const wanted = dist > Math.abs(offset) ? toTarget - Math.asin(offset / dist) : toTarget;
                desired = current + (wanted - gunAngle);
            } else {
                const parentAngle = joint.GetBodyA().GetAngle();
                desired =
                    Math.atan2(targetY - ay, targetX - ax) -
                    parentAngle -
                    forward -
                    this.rig.aimOffset * mirror;
            }
            const delta = desired - current;
            let target = current + Math.atan2(Math.sin(delta), Math.cos(delta));
            // RagImporter normaliza el objetivo a (-π, π]: cerca de ±π se frena del lado actual
            // (histéresis) y más allá se da la vuelta por delante
            const overshoot = Math.abs(target) - AIM_LIMIT;
            if (overshoot > AIM_HYSTERESIS) {
                target = Math.atan2(Math.sin(desired), Math.cos(desired));
            } else if (overshoot > 0) {
                target = Math.sign(target) * AIM_LIMIT;
            }
            this.rag.setJointAngle(name, target * mirror, { strength: 1 });
        });
    }

    setVelocity(x, y) {
        this.scratch.set_x(x);
        this.scratch.set_y(y);
        this.torso.SetLinearVelocity(this.scratch);
    }

    /**
     * Único lugar donde cambia el estado de clips. La versión actual de RagImporter cambia de clip sin fundido.
     * Al entrar en un estado con los brazos ocupados desde uno de mira, se sueltan los overrides de mira.
     * @param {string} state Estado (clave de `rig.clips`).
     * @param {number} [speed] Velocidad del clip.
     * @param {boolean} [restart] Reinicia el clip aunque ya sea el activo.
     */
    enterState(state, speed = 1, restart = false) {
        if (state === this.clipState) {
            this.rag.play(this.rig.clips[state], { speed, restart });
            return;
        }
        if (this.clipState !== null) {
            this.rag.stop(this.rig.clips[this.clipState]);
        }
        if (BUSY_STATES.has(state) && !BUSY_STATES.has(this.clipState)) {
            for (const name of [...this.rig.aimJoints, ...(this.rig.aimHold ?? [])]) {
                this.rag.clearJointOverride(name);
            }
        }
        this.clipState = state;
        this.rag.play(this.rig.clips[state], { speed, restart });
    }

    /**
     * Estado de clips de este paso, por prioridad (docs/design/03-robots.md §3.7.3). `dead` se resuelve antes.
     * @param {object} input Estado de `Input`.
     * @param {number} velX Velocidad horizontal del torso, m/s.
     * @param {boolean} moving Si el control horizontal está caminando.
     * @param {boolean} blocking Si el bloqueo está activo.
     * @param {number} now Reloj de simulación, s.
     */
    resolveState(input, velX, moving, blocking, now) {
        if (this.reacting(now)) return this.reactKind;
        if (this.rolling(now)) return this.rollBack ? "rollBack" : "roll";
        if (this.attack !== null) return this.attack;
        if (blocking) return "block";
        if (!this.grounded) {
            if (this.fallLatched) return "fallHigh";
            if (this.jumping && now - this.jumpAt < JUMP_START_TIME) return "jumpStart";
            const rel = velX * this.side;
            if (rel > AIR.deadband) return "airForward";
            if (rel < -AIR.deadband) return "airBackward";
            return "air";
        }
        if (moving) return this.facing !== this.side ? "walkBack" : "walk";
        if (input.fire || input.aim || input.pointer) return "aim";
        return "idle";
    }

    /**
     * Se llama una vez por paso fijo (STEP_SETTINGS.dt), antes de stepWorld.
     * @param {object} input Estado de `Input` del jugador.
     * @param {number} [dt] Paso fijo, s.
     * @param {number} [now] Reloj de simulación, s; el golpe y el aturdimiento se miden con él.
     */
    move(input, dt = 1 / 60, now = this.now) {
        this.now = now;
        if (this.dead) {
            if (this.clipState !== "dead") this.rag.clearAllOverrides();
            this.enterState("dead");
            return;
        }
        this.blockHeld = input.block ?? this.blockHeld;

        const sticky = this.sticky;
        if (sticky) this.pull(STICKY.down * dt);
        const currentSpeed = sticky ? WALK_SPEED * STICKY.speed : WALK_SPEED;

        const vel = this.torso.GetLinearVelocity();
        const velX = vel.get_x();
        const velY = vel.get_y();

        if (this.isGrounded()) {
            this.framesGrounded++;
        } else {
            this.framesGrounded = 0;
        }

        if (input.roll) this.tryRoll(input, now);
        this.updateAttack(now);
        const rolling = this.rolling(now);
        const blocking =
            this.blockHeld &&
            this.grounded &&
            !this.isStunned(now) &&
            !rolling &&
            !this.reacting(now) &&
            this.attack === null;

        if (this.grounded) {
            if (this.fallLatched) this.landed = true;
            this.fallLatched = false;
        } else if (velY < -AIR.fallSpeed) {
            this.fallLatched = true;
        }

        let isMoving = false;
        const lunge = this.lungeSpeed(now);
        if (rolling) {
            this.setVelocity(ROLL.speed * this.rollDir * (sticky ? STICKY.speed : 1), velY);
        } else if (lunge !== 0 && this.grounded) {
            this.setVelocity(lunge * (sticky ? STICKY.speed : 1), velY);
        } else if (!this.isStunned(now)) {
            if (!blocking && input.left && !input.right) {
                this.setVelocity(-currentSpeed, velY);
                this.facing = -1;
                isMoving = true;
            } else if (!blocking && input.right && !input.left) {
                this.setVelocity(currentSpeed, velY);
                this.facing = 1;
                isMoving = true;
            } else {
                const friction = sticky ? STICKY.brake : WALK_FRICTION;
                this.setVelocity(velX * friction, velY);
            }
        }

        if (input.jump && this.framesGrounded > 5 && !this.isStunned()) {
            const jumpPower = sticky ? JUMP_SPEED * STICKY.jump : JUMP_SPEED;
            for (const body of this.rag.bodies.values()) {
                this.scratch.set_x(body.GetLinearVelocity().get_x());
                this.scratch.set_y(jumpPower);
                body.SetLinearVelocity(this.scratch);
            }
            this.framesGrounded = 0;
            this.jumping = true;
            this.jumpAt = now;
            this.jumpCuttable = true;
        } else {
            if (this.jumpCuttable && velY <= 0) this.jumpCuttable = false;
            if (this.jumpCuttable && !input.jumpHeld) {
                this.scaleVertical(JUMP.cut);
                this.jumpCuttable = false;
            }
            if (this.framesGrounded > 2) this.jumping = false;
        }
        if (input.strongDown && velY < 0 && !this.grounded) this.pull(JUMP.fastFall * GRAVITY * dt);

        const state = this.resolveState(input, velX, isMoving, blocking, now);
        if (state === "walk" || state === "walkBack") {
            const target = Math.min(WALK_ANIM.maxSpeed, Math.max(WALK_ANIM.minSpeed, Math.abs(velX) / WALK_ANIM.refSpeed));
            this.animSpeed = this.clipState === "walk" || this.clipState === "walkBack"
                ? this.animSpeed + (target - this.animSpeed) * WALK_ANIM.smoothing
                : target;
            this.enterState(state, this.animSpeed);
        } else {
            this.enterState(state, state === "roll" || state === "rollBack" ? ROLL.clipSpeed : 1);
        }
    }

    // Resta `dv` m/s a la velocidad vertical de todas las piezas (gravedad extra)
    pull(dv) {
        for (const body of this.rag.bodies.values()) {
            const v = body.GetLinearVelocity();
            this.scratch.set_x(v.get_x());
            this.scratch.set_y(v.get_y() - dv);
            body.SetLinearVelocity(this.scratch);
        }
    }

    // Multiplica la velocidad vertical de todas las piezas por `factor`, igual para todas para no deformar el ragdoll
    scaleVertical(factor) {
        for (const body of this.rag.bodies.values()) {
            const v = body.GetLinearVelocity();
            this.scratch.set_x(v.get_x());
            this.scratch.set_y(v.get_y() * factor);
            body.SetLinearVelocity(this.scratch);
        }
    }

    destroy() {
        this.rag.destroy();
        Box2D.destroy(this.scratch);
    }
}
