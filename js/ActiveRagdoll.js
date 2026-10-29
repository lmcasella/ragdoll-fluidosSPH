class ActiveRagdoll {
    constructor(physicsWorld, startX, startY, renderArray) {
        this.world = physicsWorld;
        this.scale = 40;
        this.renderArray = renderArray;

        this.head = this.createCircle(startX, startY - 30, 10, 0.5);
        this.torso = this.createBox(startX, startY, 10, 25, 1.0);
        this.leftArm = this.createBox(startX - 15, startY - 3, 6, 20, 1.0);
        this.rightArm = this.createBox(startX + 15, startY - 3, 6, 20, 1.0);
        this.leftLeg = this.createBox(startX - 5, startY + 30, 6, 20, 1.5);
        this.rightLeg = this.createBox(startX + 5, startY + 30, 6, 20, 1.5);

        // Estados del jugador
        this.hp = 100;
        this.honeyTimer = 0; // Temporizador del debuff

        // El bloque del filter problemático fue eliminado.
        // Ahora se aplica nativamente en createBox y createCircle.

        this.joints = [];
        this.joints.push(
            this.createMuscleJoint(this.torso, this.head, startX, startY - 25),
        );
        this.joints.push(
            this.createMuscleJoint(
                this.torso,
                this.leftArm,
                startX - 15,
                startY - 10,
            ),
        );
        this.joints.push(
            this.createMuscleJoint(
                this.torso,
                this.rightArm,
                startX + 15,
                startY - 10,
            ),
        );
        this.joints.push(
            this.createMuscleJoint(
                this.torso,
                this.leftLeg,
                startX - 5,
                startY + 20,
            ),
        );
        this.joints.push(
            this.createMuscleJoint(
                this.torso,
                this.rightLeg,
                startX + 5,
                startY + 20,
            ),
        );
    }

    createBox(x, y, width, height, density) {
        const bodyDef = new b2BodyDef();
        bodyDef.type = b2_dynamicBody;
        bodyDef.position.Set(x / this.scale, y / this.scale);
        const body = this.world.CreateBody(bodyDef);

        const shape = new b2PolygonShape();
        shape.SetAsBoxXY(width / 2 / this.scale, height / 2 / this.scale);

        const fixtureDef = new b2FixtureDef();
        fixtureDef.shape = shape;
        fixtureDef.density = density;
        fixtureDef.filter.groupIndex = -1; // Filtro nativo anti-autocolisión

        body.CreateFixtureFromDef(fixtureDef);
        this.renderArray.push({
            body: body,
            type: "box",
            width: width / 2,
            height: height / 2,
        });
        return body;
    }

    createCircle(x, y, radius, density) {
        const bodyDef = new b2BodyDef();
        bodyDef.type = b2_dynamicBody;
        bodyDef.position.Set(x / this.scale, y / this.scale);
        const body = this.world.CreateBody(bodyDef);

        const shape = new b2CircleShape();
        shape.radius = radius / this.scale;

        const fixtureDef = new b2FixtureDef();
        fixtureDef.shape = shape;
        fixtureDef.density = density;
        fixtureDef.filter.groupIndex = -1; // Filtro nativo anti-autocolisión

        body.CreateFixtureFromDef(fixtureDef);
        this.renderArray.push({ body: body, type: "circle", radius: radius });
        return body;
    }

    createMuscleJoint(bodyA, bodyB, anchorX, anchorY) {
        const jointDef = new b2RevoluteJointDef();
        const anchor = new b2Vec2(anchorX / this.scale, anchorY / this.scale);
        jointDef.bodyA = bodyA;
        jointDef.bodyB = bodyB;
        jointDef.localAnchorA = bodyA.GetLocalPoint(anchor);
        jointDef.localAnchorB = bodyB.GetLocalPoint(anchor);
        jointDef.referenceAngle = bodyB.GetAngle() - bodyA.GetAngle();
        jointDef.enableMotor = true;
        jointDef.maxMotorTorque = 250;
        jointDef.motorSpeed = 0;

        const joint = this.world.CreateJoint(jointDef);
        joint.targetAngle = 0;
        joint.jsBodyA = bodyA;
        joint.jsBodyB = bodyB;
        return joint;
    }

    updateMuscles() {
        const pGain = 10.0;
        const dGain = 1.0;
        const maxSpeed = 15;

        for (let joint of this.joints) {
            const currentAngle = joint.GetJointAngle();
            const currentSpeed =
                joint.jsBodyB.GetAngularVelocity() -
                joint.jsBodyA.GetAngularVelocity();
            const error = joint.targetAngle - currentAngle;
            let speed = error * pGain - currentSpeed * dGain;

            if (speed > maxSpeed) speed = maxSpeed;
            if (speed < -maxSpeed) speed = -maxSpeed;
            joint.SetMotorSpeed(speed);
        }

        const torsoAngle = this.torso.GetAngle();
        this.torso.ApplyTorque((0 - torsoAngle) * 300, true);
        this.torso.SetAngularVelocity(this.torso.GetAngularVelocity() * 0.9);
    }

    // Agregar este método dentro de la clase ActiveRagdoll
    move(keys) {
        // Si tiene miel, la velocidad máxima cae a la mitad
        let currentSpeed = this.honeyTimer > 0 ? 3 : 6;
        if (this.honeyTimer > 0) this.honeyTimer--;

        const vel = this.torso.GetLinearVelocity();

        if (keys["a"] || keys["arrowleft"]) {
            this.torso.SetLinearVelocity(new b2Vec2(-currentSpeed, vel.y));
        } else if (keys["d"] || keys["arrowright"]) {
            this.torso.SetLinearVelocity(new b2Vec2(currentSpeed, vel.y));
        } else {
            // Si tiene miel, resbala más (fricción de 0.95 en lugar de 0.85)
            const friction = this.honeyTimer > 0 ? 0.95 : 0.85;
            this.torso.SetLinearVelocity(new b2Vec2(vel.x * friction, vel.y));
        }
    }

    takeDamage(amount) {
        this.hp -= amount;
        if (this.hp < 0) this.hp = 0;
    }

    applyHoney() {
        this.honeyTimer = 60; // 60 fotogramas (aprox 1 segundo) de ralentización por partícula
    }
}
