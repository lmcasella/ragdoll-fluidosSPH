class JSONRagdoll {
    constructor(physicsWorld, jsonData, startX, startY, renderArray) {
        this.world = physicsWorld;
        this.scale = jsonData.units.pixelsPerMeter;
        this.renderArray = renderArray;

        this.joints = [];
        this.bodiesMap = {};
        this.torso = null;
        this.torsoTargetAngle = 0; // NUEVO: Para guardar la postura inicial

        const offsetX = startX / this.scale;
        const offsetY = startY / this.scale;

        this.parseBodies(jsonData, offsetX, offsetY);
        this.parseJoints(jsonData, offsetX, offsetY);
    }

    parseBodies(jsonData, offsetX, offsetY) {
        for (let b of jsonData.bodies) {
            const bodyDef = new b2BodyDef();
            bodyDef.type = b2_dynamicBody;

            bodyDef.position.Set(
                b.position[0] + offsetX,
                -b.position[1] + offsetY,
            );
            bodyDef.angle = -b.angle;

            const body = this.world.CreateBody(bodyDef);
            this.bodiesMap[b.id] = body;

            // Guardamos la referencia del torso y SU ÁNGULO ORIGINAL
            if (b.id === jsonData.ragdoll.rootBody) {
                this.torso = body;
                this.torsoTargetAngle = bodyDef.angle;
            }

            for (let f of b.fixtures) {
                let renderData = { body: body };

                const fixtureDef = new b2FixtureDef();
                fixtureDef.density = f.density;
                fixtureDef.filter.groupIndex = -1; // Evita la autocolisión de las partes

                if (f.shape.type === "box") {
                    const shape = new b2PolygonShape();
                    const hx = f.shape.width / 2;
                    const hy = f.shape.height / 2;
                    shape.SetAsBoxXY(hx, hy);

                    fixtureDef.shape = shape;
                    body.CreateFixtureFromDef(fixtureDef);

                    renderData.type = "box";
                    renderData.width = hx * this.scale;
                    renderData.height = hy * this.scale;
                    renderData.cx = f.shape.center[0] * this.scale;
                    renderData.cy = -f.shape.center[1] * this.scale;
                } else if (f.shape.type === "circle") {
                    const shape = new b2CircleShape();
                    shape.radius = f.shape.radius;

                    fixtureDef.shape = shape;
                    body.CreateFixtureFromDef(fixtureDef);

                    renderData.type = "circle";
                    renderData.radius = f.shape.radius * this.scale;
                    renderData.cx = f.shape.center[0] * this.scale;
                    renderData.cy = -f.shape.center[1] * this.scale;
                }

                this.renderArray.push(renderData);
            }
        }
    }

    parseJoints(jsonData, offsetX, offsetY) {
        for (let j of jsonData.joints) {
            const jointDef = new b2RevoluteJointDef();
            const bodyA = this.bodiesMap[j.bodyA];
            const bodyB = this.bodiesMap[j.bodyB];

            const anchor = new b2Vec2(
                j.anchor[0] + offsetX,
                -j.anchor[1] + offsetY,
            );

            jointDef.bodyA = bodyA;
            jointDef.bodyB = bodyB;
            jointDef.localAnchorA = bodyA.GetLocalPoint(anchor);
            jointDef.localAnchorB = bodyB.GetLocalPoint(anchor);
            jointDef.referenceAngle = bodyB.GetAngle() - bodyA.GetAngle();

            if (j.limits.enabled) {
                jointDef.enableLimit = true;
                jointDef.lowerAngle = -j.limits.upper;
                jointDef.upperAngle = -j.limits.lower;
            }

            jointDef.enableMotor = true;
            jointDef.maxMotorTorque = j.motor.maxTorque;
            jointDef.motorSpeed = 0;

            const joint = this.world.CreateJoint(jointDef);
            joint.targetAngle = 0;

            joint.pGain = j.motor.gain;
            joint.dGain = j.motor.damping;
            joint.maxSpeed = j.motor.maxSpeed;

            // NUEVO: Guardamos las referencias a los cuerpos en JS para leer su velocidad después
            joint.jsBodyA = bodyA;
            joint.jsBodyB = bodyB;

            this.joints.push(joint);
        }
    }

    updateMuscles() {
        for (let joint of this.joints) {
            const currentAngle = joint.GetJointAngle();

            // NUEVO: Calculamos la velocidad de la articulación restando la velocidad angular de sus partes
            const currentSpeed =
                joint.jsBodyB.GetAngularVelocity() -
                joint.jsBodyA.GetAngularVelocity();

            const error = joint.targetAngle - currentAngle;

            let speed = error * joint.pGain - currentSpeed * joint.dGain;

            if (speed > joint.maxSpeed) speed = joint.maxSpeed;
            if (speed < -joint.maxSpeed) speed = -joint.maxSpeed;

            joint.SetMotorSpeed(speed);
        }

        if (this.torso) {
            const torsoAngle = this.torso.GetAngle();
            const error = this.torsoTargetAngle - torsoAngle;
            const inertia = this.torso.GetInertia();

            this.torso.ApplyTorque(error * inertia * 40, true);
            this.torso.SetAngularVelocity(
                this.torso.GetAngularVelocity() * 0.8,
            );
        }
    }
}
