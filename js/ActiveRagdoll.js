class ActiveRagdoll {
    constructor(physicsWorld, startX, startY, renderArray) {
        this.world = physicsWorld;
        this.scale = 40;
        this.renderArray = renderArray;

        // Estados del jugador
        this.hp = 100;
        this.honeyTimer = 0;
        this.framesGrounded = 0;
        this.walkCycle = 0;

        this.head = this.createCircle(startX, startY - 30, 10, 0.5);
        this.torso = this.createBox(startX, startY, 10, 25, 1.0);
        this.leftArm = this.createBox(startX - 15, startY - 3, 6, 20, 1.0);
        this.rightArm = this.createBox(startX + 15, startY - 3, 6, 20, 1.0);
        this.leftLeg = this.createBox(startX - 5, startY + 30, 6, 20, 1.5);
        this.rightLeg = this.createBox(startX + 5, startY + 30, 6, 20, 1.5);

        this.joints = [];
        this.headJoint = this.createMuscleJoint(
            this.torso,
            this.head,
            startX,
            startY - 25,
        );
        this.leftArmJoint = this.createMuscleJoint(
            this.torso,
            this.leftArm,
            startX - 15,
            startY - 10,
        );
        this.rightArmJoint = this.createMuscleJoint(
            this.torso,
            this.rightArm,
            startX + 15,
            startY - 10,
        );
        this.leftLegJoint = this.createMuscleJoint(
            this.torso,
            this.leftLeg,
            startX - 5,
            startY + 20,
        );
        this.rightLegJoint = this.createMuscleJoint(
            this.torso,
            this.rightLeg,
            startX + 5,
            startY + 20,
        );

        this.joints.push(
            this.headJoint,
            this.leftArmJoint,
            this.rightArmJoint,
            this.leftLegJoint,
            this.rightLegJoint,
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
        fixtureDef.filter.groupIndex = -1;

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
        fixtureDef.filter.groupIndex = -1;

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

    takeDamage(amount) {
        this.hp -= amount;
        if (this.hp < 0) this.hp = 0;
    }

    applyHoney() {
        this.honeyTimer = 60;
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

    aim(mouseX, mouseY) {
        const torsoPos = this.torso.GetPosition();
        let angle =
            Math.atan2(mouseY - torsoPos.y, mouseX - torsoPos.x) - Math.PI / 2;
        angle -= this.torso.GetAngle();

        this.leftArmJoint.targetAngle = angle;
        this.rightArmJoint.targetAngle = angle + 0.2;
    }

    move(keys) {
        let currentSpeed = this.honeyTimer > 0 ? 3 : 6;
        if (this.honeyTimer > 0) this.honeyTimer--;

        const vel = this.torso.GetLinearVelocity();

        if (Math.abs(vel.y) < 1.0) {
            this.framesGrounded++;
        } else {
            this.framesGrounded = 0;
        }

        let isMoving = false;
        if (keys["a"] || keys["arrowleft"]) {
            this.torso.SetLinearVelocity(new b2Vec2(-currentSpeed, vel.y));
            isMoving = true;
        } else if (keys["d"] || keys["arrowright"]) {
            this.torso.SetLinearVelocity(new b2Vec2(currentSpeed, vel.y));
            isMoving = true;
        } else {
            const friction = this.honeyTimer > 0 ? 0.95 : 0.85;
            this.torso.SetLinearVelocity(new b2Vec2(vel.x * friction, vel.y));
        }

        if (
            (keys["w"] || keys["arrowup"] || keys[" "]) &&
            this.framesGrounded > 15
        ) {
            const jumpPower = this.honeyTimer > 0 ? 15 : 30;
            this.torso.SetLinearVelocity(new b2Vec2(vel.x, -jumpPower));
            this.framesGrounded = 0;
        }

        if (isMoving && this.framesGrounded > 5) {
            this.walkCycle += 0.25;
            const step = Math.sin(this.walkCycle) * 1.2;
            this.leftLegJoint.targetAngle = step;
            this.rightLegJoint.targetAngle = -step;
        } else {
            this.walkCycle = 0;
            this.leftLegJoint.targetAngle = 0;
            this.rightLegJoint.targetAngle = 0;
        }
    }
}
