const AIM_LIMIT = Math.PI - 0.05;
const AIM_HYSTERESIS = 0.4;

// rig: { rootBody: id del cuerpo raíz, aimJoints: nombres de articulaciones que apuntan,
//        aimOffset: ángulo de reposo del arma relativo al padre, clips: { walk, jump, dead } }
export class ActiveRagdoll {
    constructor(def, physicsWorld, startX, startY, rig, flipX = false) {
        this.world = physicsWorld;
        this.rig = rig;
        this.flipX = flipX;
        this.rag = def.spawn(physicsWorld, { x: startX, y: startY, flipX });
        this.torso = this.rag.bodies.get(rig.rootBody);
        this.scratch = new Box2D.b2Vec2(0, 0);

        // Estados del jugador
        this.hp = 100;
        this.honeyTimer = 0;
        this.framesGrounded = 0;
        this.jumping = false;
        this.clipState = null;
    }

    get dead() {
        return this.hp <= 0;
    }

    takeDamage(amount) {
        this.hp -= amount;
        if (this.hp < 0) this.hp = 0;
    }

    applyHoney() {
        this.honeyTimer = 60;
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
            let target =
                current + Math.atan2(Math.sin(delta), Math.cos(delta));
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

    // Se llama una vez por frame fijo (STEP_SETTINGS.dt), antes de stepWorld
    move(keys) {
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

        if (Math.abs(velY) < 1.0) {
            this.framesGrounded++;
        } else {
            this.framesGrounded = 0;
        }

        let isMoving = false;
        if (keys["a"] || keys["arrowleft"]) {
            this.setVelocity(-currentSpeed, velY);
            isMoving = true;
        } else if (keys["d"] || keys["arrowright"]) {
            this.setVelocity(currentSpeed, velY);
            isMoving = true;
        } else {
            const friction = this.honeyTimer > 0 ? 0.95 : 0.85;
            this.setVelocity(velX * friction, velY);
        }

        // Y hacia arriba: el salto es velocidad positiva
        if (
            (keys["w"] || keys["arrowup"] || keys[" "]) &&
            this.framesGrounded > 15
        ) {
            // Se aplica a todos los cuerpos: con solo la raíz, el resto del rig frena el salto
            const jumpPower = this.honeyTimer > 0 ? 3 : 6;
            for (const body of this.rag.bodies.values()) {
                this.scratch.set_x(body.GetLinearVelocity().get_x());
                this.scratch.set_y(jumpPower);
                body.SetLinearVelocity(this.scratch);
            }
            this.framesGrounded = 0;
            this.jumping = true;
        } else if (this.framesGrounded > 5) {
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
