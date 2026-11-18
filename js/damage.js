// Daño por contactos. Un único JSContactListener del mundo (RagImporter no lo usa):
//  - BeginContact: impactos entre cuerpos; la velocidad de acercamiento se mide sobre la normal del contacto.
//  - BeginParticleBodyContact: cada partícula informa qué parte del cuerpo tocó (requiere CONTACT_LISTENER_PARTICLE).
// Regla de la materia: "juntá durante el paso, actuá después". Los callbacks solo encolan; process() aplica el daño.

export const CONTACT_LISTENER_PARTICLE = 1 << 14; // b2_fixtureContactListenerParticle

// Ids de arma = tipo de fluido
export const FLUID = { ACID: 1, LAVA: 2, HONEY: 3 };

const IMPACT_SPEED = 11; // m/s; un salto normal aterriza a ~9 m/s y no daña
const IMPACT_DAMAGE = 2; // por m/s por encima del umbral
const IMPACT_COOLDOWN = 0.25;
const ACID_DAMAGE = 2;
const SELF_IMMUNITY = 0.4; // s en que un disparo no daña a quien lo disparó
const SHOT_MEMORY = 20;

export class DamageSystem {
    constructor(world, particleSystem) {
        this.world = world;
        this.particleSystem = particleSystem;
        this.particleSystemPtr = Box2D.getPointer(particleSystem);
        this.owners = new Map(); // puntero de cuerpo → { player, index, bodyId }
        this.shots = new Map(); // id de disparo → { owner, weapon, time }
        this.nextShot = 1;
        this.impacts = [];
        this.fluidHits = [];
        this.lastImpact = new Map();
        this.stats = { impacts: 0, fluidContacts: 0 };
        this.manifold = new Box2D.b2WorldManifold();

        const listener = new Box2D.JSContactListener();
        listener.BeginContact = (contactPtr) => this.onBeginContact(contactPtr);
        listener.EndContact = () => {};
        listener.BeginParticleContact = () => {};
        listener.EndParticleContact = () => {};
        listener.BeginParticleBodyContact = (systemPtr, contactPtr) =>
            this.onParticleBodyContact(systemPtr, contactPtr);
        listener.EndParticleBodyContact = () => {};
        world.SetContactListener(listener);
        this.listener = listener;
    }

    // Volver a llamar cada vez que cambian las instancias (al girar se regenera el ragdoll)
    register(players) {
        this.owners.clear();
        players.forEach((player, index) => {
            for (const [bodyId, body] of player.rag.bodies) {
                this.owners.set(Box2D.getPointer(body), { player, index, bodyId });
            }
        });
    }

    // Marca las partículas de un grupo recién disparado con su id de disparo (buffer de userData)
    tagShot(group, owner, weapon, now) {
        const id = this.nextShot++;
        this.shots.set(id, { owner, weapon, time: now });
        const start = group.GetBufferIndex();
        const end = start + group.GetParticleCount();
        const userData = Box2D.getPointer(this.particleSystem.GetUserDataBuffer()) >> 2;
        for (let i = start; i < end; i++) Box2D.HEAP32[userData + i] = id;
        return id;
    }

    onBeginContact(contactPtr) {
        const contact = Box2D.wrapPointer(contactPtr, Box2D.b2Contact);
        const fixtureA = contact.GetFixtureA();
        const fixtureB = contact.GetFixtureB();
        if (fixtureA.IsSensor() || fixtureB.IsSensor()) return;
        const bodyA = fixtureA.GetBody();
        const bodyB = fixtureB.GetBody();
        const ownerA = this.owners.get(Box2D.getPointer(bodyA));
        const ownerB = this.owners.get(Box2D.getPointer(bodyB));
        if (!ownerA && !ownerB) return;

        contact.GetWorldManifold(this.manifold);
        const normal = this.manifold.get_normal();
        const nx = normal.get_x();
        const ny = normal.get_y();
        const vA = bodyA.GetLinearVelocity();
        const ax = vA.get_x();
        const ay = vA.get_y();
        const vB = bodyB.GetLinearVelocity();
        const speed = Math.abs((ax - vB.get_x()) * nx + (ay - vB.get_y()) * ny);
        if (speed < IMPACT_SPEED) return;
        if (ownerA) this.impacts.push({ owner: ownerA, speed });
        if (ownerB) this.impacts.push({ owner: ownerB, speed });
    }

    onParticleBodyContact(systemPtr, contactPtr) {
        if (systemPtr !== this.particleSystemPtr) return;
        const contact = Box2D.wrapPointer(contactPtr, Box2D.b2ParticleBodyContact);
        const owner = this.owners.get(Box2D.getPointer(contact.get_body()));
        if (!owner) return;
        const index = contact.get_index();
        const system = this.particleSystem;
        const tag = Box2D.HEAP32[(Box2D.getPointer(system.GetUserDataBuffer()) >> 2) + index];
        const colors = Box2D.getPointer(system.GetColorBuffer()) + index * 4;
        const shot = this.shots.get(tag);
        const kind = shot?.weapon ?? fluidFromColor(Box2D.HEAPU8[colors], Box2D.HEAPU8[colors + 1]);
        if (kind) this.fluidHits.push({ owner, index, shot, kind });
    }

    // Aplica lo encolado durante el paso; llamar después de stepWorld
    process(now) {
        for (const { owner, speed } of this.impacts) {
            const key = `${owner.index}:${owner.bodyId}`;
            if (now - (this.lastImpact.get(key) ?? -Infinity) < IMPACT_COOLDOWN) continue;
            this.lastImpact.set(key, now);
            owner.player.hurt(owner.bodyId, (speed - IMPACT_SPEED) * IMPACT_DAMAGE, now);
            this.stats.impacts++;
        }

        const consumed = new Set();
        for (const { owner, index, shot, kind } of this.fluidHits) {
            this.stats.fluidContacts++;
            if (consumed.has(index)) continue;
            if (shot && shot.owner === owner.index && now - shot.time < SELF_IMMUNITY) continue;
            if (kind === FLUID.ACID) {
                owner.player.hurt(owner.bodyId, ACID_DAMAGE, now);
                consumed.add(index);
            } else if (kind === FLUID.LAVA) {
                owner.player.burn(owner.bodyId);
            } else if (kind === FLUID.HONEY) {
                owner.player.applyHoney();
                consumed.add(index);
            }
        }
        for (const index of consumed) this.particleSystem.DestroyParticle(index);

        this.impacts.length = 0;
        this.fluidHits.length = 0;
        for (const [id, shot] of this.shots) {
            if (now - shot.time > SHOT_MEMORY) this.shots.delete(id);
        }
    }
}

// Partículas sin disparo asociado (por ejemplo, peligros del mapa): el tipo se deduce del color
function fluidFromColor(r, g) {
    if (r === 50 && g === 255) return FLUID.ACID;
    if (r === 255 && g === 80) return FLUID.LAVA;
    if (r === 255 && g === 200) return FLUID.HONEY;
    return 0;
}
