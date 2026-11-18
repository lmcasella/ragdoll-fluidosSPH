// Daño por contactos. Un único JSContactListener del mundo (RagImporter no lo usa):
//  - BeginContact: impactos entre cuerpos; la velocidad de acercamiento se mide sobre la normal del contacto.
//  - BeginParticleBodyContact: cada partícula informa qué parte del cuerpo tocó (requiere CONTACT_LISTENER_PARTICLE).
// Regla de la materia: "juntá durante el paso, actuá después". Los callbacks solo encolan; process() aplica el daño.

import { FLUID, WEAPONS, particleDamage } from "./weapons.js";

const IMPACT_SPEED = 11; // m/s; un salto normal aterriza a ~9 m/s y no daña
const IMPACT_DAMAGE = 2; // por m/s por encima del umbral
const IMPACT_COOLDOWN = 0.25;
const SELF_IMMUNITY = 0.4; // s en que un disparo no daña a quien lo disparó
const SHOT_SLICE = 0.1; // s que dura un id de disparo abierto
const SHOT_LIFETIME = 6; // s hasta que el id se borra y sus partículas se destruyen

export class DamageSystem {
    constructor(world, particleSystem, weapons = WEAPONS) {
        this.particleDamage = new Map(weapons.map((w) => [w.id, particleDamage(w)]));
        this.world = world;
        this.particleSystem = particleSystem;
        this.particleSystemPtr = Box2D.getPointer(particleSystem);
        this.players = [];
        this.owners = new Map(); // puntero de cuerpo → { player, index, bodyId }
        this.shots = new Map(); // id de disparo → { owner, weapon, time }
        this.openShots = new Map(); // jugador → id del tramo abierto
        this.nextShot = 1;
        this.impacts = [];
        this.fluidHits = [];
        this.drowned = [];
        this.killSensors = new Set(); // punteros de fixtures sensor que destruyen al robot (pileta)
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
        this.players = players;
        players.forEach((player, index) => {
            for (const [bodyId, body] of player.rag.bodies) {
                this.owners.set(Box2D.getPointer(body), { player, index, bodyId });
            }
        });
    }

    ownerOf(bodyPtr) {
        return this.owners.get(bodyPtr);
    }

    // Id de disparo para lo que `owner` emite ahora con `weapon`: reutiliza el tramo abierto de ese jugador si
    // es del mismo arma y se abrió hace menos de SHOT_SLICE; si no, abre uno. `time` queda en la última emisión.
    shotId(owner, weapon, now) {
        const open = this.openShots.get(owner);
        const shot = open && this.shots.get(open);
        if (shot && shot.weapon === weapon && now - shot.start < SHOT_SLICE) {
            shot.time = now;
            return open;
        }
        const id = this.nextShot++;
        this.shots.set(id, { owner, weapon, time: now, start: now });
        this.openShots.set(owner, id);
        return id;
    }

    // Nueva ronda: se olvidan los disparos (las partículas se destruyen aparte)
    resetShots() {
        this.shots.clear();
        this.openShots.clear();
    }

    // Marca una partícula con su id de disparo (buffer de userData; se lee de nuevo en cada llamada porque
    // crear partículas puede reubicar los buffers)
    tagParticle(index, id) {
        Box2D.HEAP32[(this.particleSystem.GetUserDataBuffer() >> 2) + index] = id;
    }

    // Id más chico que sigue vivo: las partículas con 0 < userData < liveShotFloor son de disparos vencidos
    get liveShotFloor() {
        for (const id of this.shots.keys()) return id;
        return this.nextShot;
    }

    onBeginContact(contactPtr) {
        const contact = Box2D.wrapPointer(contactPtr, Box2D.b2Contact);
        const fixtureA = contact.GetFixtureA();
        const fixtureB = contact.GetFixtureB();
        const killA = this.killSensors.has(Box2D.getPointer(fixtureA));
        const killB = this.killSensors.has(Box2D.getPointer(fixtureB));
        if (killA || killB) {
            const other = killA ? fixtureB : fixtureA;
            const owner = this.owners.get(Box2D.getPointer(other.GetBody()));
            if (owner) this.drowned.push(owner);
            return;
        }
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
        const tag = Box2D.HEAP32[(system.GetUserDataBuffer() >> 2) + index];
        const colors = Box2D.getPointer(system.GetColorBuffer()) + index * 4;
        const shot = this.shots.get(tag);
        const kind = shot?.weapon ?? fluidFromColor(Box2D.HEAPU8[colors], Box2D.HEAPU8[colors + 1]);
        if (kind) this.fluidHits.push({ owner, index, shot, kind });
    }

    // Aplica lo encolado durante el paso; llamar después de stepWorld.
    // `waterLevel`: altura del agua en metros, o función `(x) => altura` para el agua local (columna x del
    // robot). El robot con el borde inferior de alguna pieza por debajo queda mojado (inundación, sin callbacks).
    process(now, waterLevel = -Infinity) {
        for (const owner of this.drowned) owner.player.drown(now);
        this.drowned.length = 0;

        if (waterLevel !== -Infinity) {
            for (const player of this.players) {
                if (player.dead) continue;
                const level = typeof waterLevel === "function" ? waterLevel(player.torso.GetPosition().get_x()) : waterLevel;
                if (level > -Infinity && player.lowestPoint() < level) player.soak();
            }
        }

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
                owner.player.hurt(owner.bodyId, this.particleDamage.get(kind), now);
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
        // Los ids crecen con el tiempo: se poda desde el más viejo, así liveShotFloor es siempre el primero
        for (const [id, shot] of this.shots) {
            if (now - shot.time <= SHOT_LIFETIME) break;
            this.shots.delete(id);
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
