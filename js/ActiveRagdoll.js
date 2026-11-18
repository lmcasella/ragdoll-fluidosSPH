import { getRaycaster } from "./raycast.js";

const AIM_LIMIT = Math.PI - 0.05;
const AIM_HYSTERESIS = 0.4;
const GROUND_RAY = 0.3;
const FLASH_TIME = 1;
const BURN_TIME = 1.5;
const BURN_DPS = 4;

// rig: { rootBody: id del cuerpo raíz, aimJoints: nombres de articulaciones que apuntan,
//        aimOffset: ángulo de reposo del arma relativo al padre, clips: { walk, jump, dead },
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
        this.honeyTimer = 0;
        this.framesGrounded = 0;
        this.jumping = false;
        this.clipState = null;
        this.facing = flipX ? -1 : 1;
        this.weapon = 1;
        this.flashes = new Map(); // bodyId → instante del último golpe (s)
        this.burns = new Map(); // bodyId → segundos de quemadura restantes
    }

    get dead() {
        return this.hp <= 0;
    }

    // Copia el estado de juego desde la instancia anterior (al girar se vuelve a generar el ragdoll)
    copyStateFrom(old) {
        this.hp = old.hp;
        this.weapon = old.weapon;
        this.honeyTimer = old.honeyTimer;
        this.framesGrounded = old.framesGrounded;
        this.jumping = old.jumping;
        this.flashes = old.flashes;
        this.burns = old.burns;
        this.aimDir = old.aimDir;
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

    applyHoney() {
        this.honeyTimer = 60;
    }

    // Estados con duración (quemaduras); una vez por paso fijo
    updateStatus(dt) {
        for (const [bodyId, left] of this.burns) {
            this.hurt(bodyId, BURN_DPS * dt);
            if (left - dt <= 0) this.burns.delete(bodyId);
            else this.burns.set(bodyId, left - dt);
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
    aim(mouseX, mouseY) {
        if (this.dead) return;
        const mirror = this.flipX ? -1 : 1;
        const forward = this.flipX ? Math.PI : 0;
        for (const name of this.rig.aimJoints) {
            const joint = this.rag.joint(name);
            const anchor = joint.GetAnchorA();
            const ax = anchor.get_x();
            const ay = anchor.get_y();
            const parentAngle = joint.GetBodyA().GetAngle();
            const desired =
                Math.atan2(mouseY - ay, mouseX - ax) -
                parentAngle -
                forward -
                this.rig.aimOffset * mirror;
            const current = joint.GetJointAngle();
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
            this.rag.setJointAngle(name, target * mirror);
        }
    }

    setVelocity(x, y) {
        this.scratch.set_x(x);
        this.scratch.set_y(y);
        this.torso.SetLinearVelocity(this.scratch);
    }

    // La versión actual de RagImporter cambia de clip sin fundido (fadeIn/fadeOut aún no implementados)
    setClip(state) {
        if (state === this.clipState) return;
        if (this.clipState !== null) {
            this.rag.stop(this.rig.clips[this.clipState]);
        }
        this.clipState = state;
        if (state !== null) this.rag.play(this.rig.clips[state]);
    }

    // Se llama una vez por frame fijo (STEP_SETTINGS.dt), antes de stepWorld.
    // input: { left, right, up } (ver Input.js); el salto es la dirección arriba
    move(input) {
        if (this.dead) {
            if (this.clipState !== "dead") this.rag.clearAllOverrides();
            this.setClip("dead");
            return;
        }

        let currentSpeed = this.honeyTimer > 0 ? 3 : 6;
        if (this.honeyTimer > 0) this.honeyTimer--;

        const vel = this.torso.GetLinearVelocity();
        const velX = vel.get_x();
        const velY = vel.get_y();

        if (this.isGrounded()) {
            this.framesGrounded++;
        } else {
            this.framesGrounded = 0;
        }

        let isMoving = false;
        if (input.left && !input.right) {
            this.setVelocity(-currentSpeed, velY);
            this.facing = -1;
            isMoving = true;
        } else if (input.right && !input.left) {
            this.setVelocity(currentSpeed, velY);
            this.facing = 1;
            isMoving = true;
        } else {
            const friction = this.honeyTimer > 0 ? 0.95 : 0.85;
            this.setVelocity(velX * friction, velY);
        }

        // Y hacia arriba: el salto es velocidad positiva
        if (input.up && this.framesGrounded > 5) {
            // Se aplica a todos los cuerpos: con solo la raíz, el resto del rig frena el salto
            const jumpPower = this.honeyTimer > 0 ? 3 : 9;
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

        if (this.jumping) {
            this.setClip("jump");
        } else if (isMoving) {
            this.setClip("walk");
        } else {
            this.setClip(null);
        }
    }

    destroy() {
        this.rag.destroy();
        Box2D.destroy(this.scratch);
    }
}
