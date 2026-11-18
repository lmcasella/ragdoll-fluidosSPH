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
// Golpe: el clip `punch` carga hasta 0,3 s y pega entre 0,3 y 0,5 s; los rayos solo dañan en esa ventana
const PUNCH_TIME = 0.55;
const PUNCH_ACTIVE = [0.3, 0.5];
const PUNCH_COOLDOWN = 0.6;
// Pegado (miel, docs/design/04-fluidos.md): factores sobre la velocidad de caminar, el frenado sin input y el
// salto; `down` es gravedad extra (m/s²) y `grace` los s que dura tras la última cercanía a la miel
export const STICKY = { speed: 0.1, brake: 0.5, jump: 0.3, down: 10, grace: 0.3 };
const WALK_SPEED = 6;
const JUMP_SPEED = 9;
const WALK_FRICTION = 0.85;

/**
 * Velocidad del clip de caminar: |vx| del torso / `refSpeed`, acotada a [minSpeed, maxSpeed] y suavizada con
 * `smoothing` (fracción del error que se corrige por paso fijo). `refSpeed` (m/s) es el |vx| que el torso sostiene
 * al caminar a `WALK_SPEED` (medido: 4,7; el paso de física y el roce con el piso restan al 6 pedido).
 */
export const WALK_ANIM = { refSpeed: 4.7, minSpeed: 0.1, maxSpeed: 1.25, smoothing: 0.1 };

// rig: { rootBody: id del cuerpo raíz, aimJoints: nombres de articulaciones que apuntan,
//        aimOffset: ángulo de reposo del arma relativo al padre, clips: { walk, walkBack, jump, dead, punch },
//        feet: ids de los pies (rayos de piso), gun: { body, muzzle: [x, y] local },
//        damage: { [bodyId]: multiplicador }, defaultDamage: multiplicador del resto }
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
        this.punchStart = -Infinity;
        this.punchReadyAt = 0;
        this.punchHit = false;
    }

    get dead() {
        return this.hp <= 0;
    }

    // Cayó a la pileta: cortocircuito total
    drown(now = performance.now() / 1000) {
        if (this.dead) return;
        this.drowned = true;
        this.hp = 0;
        for (const id of this.rag.bodies.keys()) this.flashes.set(id, now);
    }

    // Inicia un golpe si no está en enfriamiento; el clip `punch` toma los brazos (se sueltan los overrides de mira)
    punch(now = performance.now() / 1000) {
        if (this.dead || now < this.punchReadyAt) return false;
        this.punchStart = now;
        this.punchReadyAt = now + PUNCH_COOLDOWN;
        this.punchHit = false;
        for (const name of [...this.rig.aimJoints, ...(this.rig.aimHold ?? [])]) {
            this.rag.clearJointOverride(name);
        }
        return true;
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
    stun(duration, now = performance.now() / 1000) {
        this.stunnedUntil = Math.max(this.stunnedUntil ?? 0, now + duration);
    }

    isStunned(now = performance.now() / 1000) {
        return now < (this.stunnedUntil ?? 0);
    }

    isPunching(now = performance.now() / 1000) {
        return now - this.punchStart < PUNCH_TIME;
    }

    // Ventana en la que el golpe puede conectar (una sola vez por golpe)
    punchActive(now = performance.now() / 1000) {
        const t = now - this.punchStart;
        return !this.punchHit && t >= PUNCH_ACTIVE[0] && t <= PUNCH_ACTIVE[1];
    }

    // Copia el estado de juego desde la instancia anterior (al girar se vuelve a generar el ragdoll)
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
        this.punchStart = old.punchStart;
        this.punchReadyAt = old.punchReadyAt;
        this.punchHit = old.punchHit;
    }

    takeDamage(amount) {
        this.hp -= amount;
        if (this.hp < 0) this.hp = 0;
    }

    // Daño a una parte del cuerpo: aplica su multiplicador y la pone roja
    hurt(bodyId, amount, now = performance.now() / 1000) {
        if (this.dead) return 0;
        const multiplier = this.rig.damage?.[bodyId] ?? this.rig.defaultDamage ?? 1;
        const dealt = amount * multiplier;
        this.takeDamage(dealt);
        this.flashes.set(bodyId, now);
        return dealt;
    }

    // 0 = color original, 1 = rojo pleno; vuelve al color original en FLASH_TIME
    flashAmount(bodyId, now = performance.now() / 1000) {
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
    aim(targetX, targetY) {
        if (this.dead || this.isPunching()) return;
        const mirror = this.flipX ? -1 : 1;
        const forward = this.flipX ? Math.PI : 0;
        const muzzle = this.muzzle();
        for (const name of this.rig.aimHold ?? []) {
            this.rag.setJointAngle(name, 0, { strength: 1 });
        }
        for (const name of this.rig.aimJoints) {
            const joint = this.rag.joint(name);
            const anchor = joint.GetAnchorA();
            const ax = anchor.get_x();
            const ay = anchor.get_y();
            const current = joint.GetJointAngle();
            let desired;
            if (muzzle) {
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
        }
    }

    setVelocity(x, y) {
        this.scratch.set_x(x);
        this.scratch.set_y(y);
        this.torso.SetLinearVelocity(this.scratch);
    }

    // La versión actual de RagImporter cambia de clip sin fundido (fadeIn/fadeOut aún no implementados)
    setClip(state, speed = 1) {
        if (state === this.clipState) {
            if (state !== null) this.rag.play(this.rig.clips[state], { speed });
            return;
        }
        if (this.clipState !== null) {
            this.rag.stop(this.rig.clips[this.clipState]);
        }
        this.clipState = state;
        if (state !== null) this.rag.play(this.rig.clips[state], { speed });
    }

    // Se llama una vez por frame fijo (STEP_SETTINGS.dt), antes de stepWorld.
    // input: { left, right, up } (ver Input.js); el salto es la dirección arriba
    move(input, dt = 1 / 60) {
        if (this.dead) {
            if (this.clipState !== "dead") this.rag.clearAllOverrides();
            this.setClip("dead");
            return;
        }

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

        let isMoving = false;
        if (this.isStunned()) {
            // Aturdido: sin control horizontal ni frenado; el empuje del golpe actúa libre
        } else if (input.left && !input.right) {
            this.setVelocity(-currentSpeed, velY);
            this.facing = -1;
            isMoving = true;
        } else if (input.right && !input.left) {
            this.setVelocity(currentSpeed, velY);
            this.facing = 1;
            isMoving = true;
        } else {
            const friction = sticky ? STICKY.brake : WALK_FRICTION;
            this.setVelocity(velX * friction, velY);
        }

        // Y hacia arriba: el salto es velocidad positiva
        if (input.up && this.framesGrounded > 5 && !this.isStunned()) {
            // Se aplica a todos los cuerpos: con solo la raíz, el resto del rig frena el salto
            const jumpPower = sticky ? JUMP_SPEED * STICKY.jump : JUMP_SPEED;
            for (const body of this.rag.bodies.values()) {
                this.scratch.set_x(body.GetLinearVelocity().get_x());
                this.scratch.set_y(jumpPower);
                body.SetLinearVelocity(this.scratch);
            }
            this.framesGrounded = 0;
            this.jumping = true;
        } else if (this.framesGrounded > 2) {
            this.jumping = false;
        }

        if (this.isPunching() && this.rig.clips.punch) {
            this.setClip("punch");
        } else if (this.jumping) {
            this.setClip("jump");
        } else if (isMoving) {
            // Caminar en contra de hacia donde mira (apunta) reproduce el clip en reversa
            const backwards = this.facing !== (this.flipX ? -1 : 1);
            const target = Math.min(WALK_ANIM.maxSpeed, Math.max(WALK_ANIM.minSpeed, Math.abs(velX) / WALK_ANIM.refSpeed));
            this.animSpeed = this.clipState === "walk" || this.clipState === "walkBack"
                ? this.animSpeed + (target - this.animSpeed) * WALK_ANIM.smoothing
                : target;
            this.setClip(backwards && this.rig.clips.walkBack ? "walkBack" : "walk", this.animSpeed);
        } else {
            this.setClip(null);
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

    destroy() {
        this.rag.destroy();
        Box2D.destroy(this.scratch);
    }
}
