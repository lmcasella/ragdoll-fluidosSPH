class ActiveRagdoll {
    constructor(physicsWorld, startX, startY, renderArray) {
        this.world = physicsWorld; // La instancia de b2World de LiquidFun
        this.scale = 40; // Tu factor de conversión a metros
        this.renderArray = renderArray;

        // 1. Crear las partes del cuerpo (Cuerpos Dinámicos)
        this.head = this.createCircle(startX, startY - 30, 10, 0.5);
        this.torso = this.createBox(startX, startY, 10, 25, 1.0);
        this.leftArm = this.createBox(startX - 15, startY - 3, 6, 20, 1.0);
        this.rightArm = this.createBox(startX + 15, startY - 3, 6, 20, 1.0);
        this.leftLeg = this.createBox(startX - 5, startY + 30, 6, 20, 1.5);
        this.rightLeg = this.createBox(startX + 5, startY + 30, 6, 20, 1.5);

        // 2. Crear las articulaciones (Joints) y guardar sus referencias
        this.joints = [];

        // Cuello: Une Torso y Cabeza
        this.joints.push(
            this.createMuscleJoint(
                this.torso,
                this.head,
                startX,
                startY - 25,
                0,
            ),
        );

        // Brazo Izquierdo: Une Torso y Brazo Izquierdo
        this.joints.push(
            this.createMuscleJoint(
                this.torso,
                this.leftArm,
                startX - 15,
                startY - 10,
                0,
            ),
        );

        // Brazo Derecho: Une Torso y Brazo Derecho
        this.joints.push(
            this.createMuscleJoint(
                this.torso,
                this.rightArm,
                startX + 15,
                startY - 10,
                0,
            ),
        );

        // Cuerpo Izquierda: Une Torso y Pierna Izquierda
        this.joints.push(
            this.createMuscleJoint(
                this.torso,
                this.leftLeg,
                startX - 5,
                startY + 20,
                0,
            ),
        );

        // Cadera Izquierda: Une Torso y Pierna Izquierda
        this.joints.push(
            this.createMuscleJoint(
                this.torso,
                this.leftLeg,
                startX - 5,
                startY + 20,
                0,
            ),
        );

        // Cadera Derecha: Une Torso y Pierna Derecha
        this.joints.push(
            this.createMuscleJoint(
                this.torso,
                this.rightLeg,
                startX + 5,
                startY + 20,
                0,
            ),
        );
    }

    // --- LÓGICA DE ACTUALIZACIÓN ---

    updateMuscles() {
        const pGain = 5.0; // Qué tan rápido reacciona el músculo para corregir la postura

        for (let joint of this.joints) {
            // 1. Dónde está la articulación ahora
            const currentAngle = joint.GetJointAngle();

            // 2. Dónde queremos que esté (0 significa alineado perfectamente)
            const target = joint.targetAngle;

            // 3. Calcular el error (la diferencia)
            const error = target - currentAngle;

            // 4. Aplicar la velocidad proporcional al error
            joint.SetMotorSpeed(error * pGain);
        }

        // Sistema de auto-equilibrio del Torso (evita que se caiga de cara)
        const torsoAngle = this.torso.GetAngle();
        const balanceError = 0 - torsoAngle; // 0 radianes = completamente vertical
        // Aplicamos un torque directo al torso para mantenerlo erguido
        this.torso.ApplyTorque(balanceError * 150, true);
    }

    // --- MÉTODOS DE FÁBRICA FÍSICA ---
    /**
     * Crea una caja en el escenario del videojuego.
     * @param {number} x - La posición X de la caja en píxeles.
     * @param {number} y - La posición Y de la caja en píxeles.
     * @param {number} width - El ancho de la caja en píxeles.
     * @param {number} height - El alto de la caja en píxeles.
     * @param {number} density - La densidad de la caja.
     * @returns {b2Body} - El cuerpo físico creado.
     */
    createBox(x, y, width, height, density) {
        const bodyDef = new b2BodyDef();
        bodyDef.type = b2_dynamicBody;
        bodyDef.position.Set(x / this.scale, y / this.scale);

        const body = this.world.CreateBody(bodyDef);
        const shape = new b2PolygonShape();
        shape.SetAsBoxXY(width / 2 / this.scale, height / 2 / this.scale);

        body.CreateFixtureFromShape(shape, density);

        // Registramos la caja para que Canvas la dibuje
        this.renderArray.push({
            body: body,
            type: "box",
            width: width / 2,
            height: height / 2,
        });

        return body;
    }

    /**
     * Crea un círculo en el escenario del videojuego.
     * @param {number} x - La posición X del círculo en píxeles.
     * @param {number} y - La posición Y del círculo en píxeles.
     * @param {number} radius - El radio del círculo en píxeles.
     * @param {number} density - La densidad del círculo.
     * @returns {b2Body} - El cuerpo físico creado.
     */
    createCircle(x, y, radius, density) {
        const bodyDef = new b2BodyDef();
        bodyDef.type = b2_dynamicBody;
        bodyDef.position.Set(x / this.scale, y / this.scale);

        const body = this.world.CreateBody(bodyDef);
        const shape = new b2CircleShape();
        shape.radius = radius / this.scale;

        body.CreateFixtureFromShape(shape, density);

        // Registramos el círculo para que Canvas lo dibuje
        this.renderArray.push({ body: body, type: "circle", radius: radius });

        return body;
    }

    /**
     * Crea una articulación con motor en el escenario del videojuego.
     * @param {b2Body} bodyA - El primer cuerpo físico.
     * @param {b2Body} bodyB - El segundo cuerpo físico.
     * @param {number} anchorX - La posición X del punto de anclaje en píxeles.
     * @param {number} anchorY - La posición Y del punto de anclaje en píxeles.
     * @param {number} targetAngle - El ángulo objetivo en radianes.
     * @returns {b2RevoluteJoint} - La articulación física creada.
     */
    createMuscleJoint(bodyA, bodyB, anchorX, anchorY, targetAngle) {
        const jointDef = new b2RevoluteJointDef();

        const anchor = new b2Vec2(anchorX / this.scale, anchorY / this.scale);
        jointDef.bodyA = bodyA;
        jointDef.bodyB = bodyB;
        jointDef.localAnchorA = bodyA.GetLocalPoint(anchor);
        jointDef.localAnchorB = bodyB.GetLocalPoint(anchor);
        jointDef.referenceAngle = bodyB.GetAngle() - bodyA.GetAngle();

        // ACTIVAR EL MÚSCULO
        jointDef.enableMotor = true;
        jointDef.maxMotorTorque = 10; // La fuerza máxima que puede hacer el músculo
        jointDef.motorSpeed = 0; // La velocidad inicial

        const joint = this.world.CreateJoint(jointDef);

        // Guardamos el ángulo objetivo personalizado en el objeto JS para usarlo después
        joint.targetAngle = targetAngle;

        return joint;
    }
}
