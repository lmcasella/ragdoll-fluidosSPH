/**
 * Ataques melee y combo (docs/design/03-robots.md §3.7.4). `duration` y `active` (ventana en la que los rayos pueden
 * conectar) en s desde el inicio del ataque; `origin` es la articulación cuya ancla emite los rayos; `base` es la
 * dirección: `aim` (la mira) o `side` (el lado de la mira, `tilt` rad hacia abajo); `reach` en m y `spread` en rad
 * (rayos al centro y a ±`spread`); `damage` antes del multiplicador de la parte; `push` = [lateral, arriba] en m/s
 * sumados a todo el robot golpeado; `stun` en s; `reaction` = `simple` o `stumble`; `lunge` (m/s, opcional) es el paso adelante del atacante hasta el fin de la ventana activa. `impulse` (N·s) se aplica en el
 * punto de impacto. `combo`: secuencia, `grace` (s de tolerancia tras terminar un golpe para encadenar) y `cooldown`
 * (s tras cortarse o terminar un ataque). `breaksGuard` (opcional): si el golpe llega a un bloqueo lo rompe en vez de
 * ser bloqueado: sin daño, sin empuje ni reacción, el receptor sale de `block` y queda aturdido `guardBreakStun` s (#192).
 */
export const MELEE = {
    impulse: 5,
    guardBreakStun: 0.7,
    combo: { sequence: ["combo1", "combo2", "combo3"], grace: 0.2, cooldown: 0.25 },
    attacks: {
        combo1: {
            duration: 0.4,
            active: [0.2, 0.35],
            origin: "back_shoulder",
            base: "aim",
            tilt: 0,
            reach: 1.1,
            spread: 0.3,
            damage: 8,
            push: [1.5, 0],
            stun: 0.4,
            reaction: "simple",
        },
        combo2: {
            duration: 0.4,
            active: [0.15, 0.3],
            origin: "back_shoulder",
            base: "aim",
            tilt: 0,
            reach: 1.1,
            spread: 0.3,
            damage: 8,
            push: [1.5, 0],
            stun: 0.4,
            reaction: "simple",
            lunge: 5,
        },
        combo3: {
            duration: 1.0,
            active: [0.35, 0.6],
            origin: "back_shoulder",
            base: "aim",
            tilt: 0,
            reach: 1.2,
            spread: 0.4,
            damage: 14,
            push: [6, 4],
            stun: 0.7,
            reaction: "stumble",
            lunge: 5,
            breaksGuard: true,
        },
        airPunch: {
            duration: 0.9,
            active: [0.3, 0.6],
            origin: "back_shoulder",
            base: "aim",
            tilt: 0,
            reach: 1.1,
            spread: 0.3,
            damage: 8,
            push: [4.5, 3],
            stun: 0.4,
            reaction: "simple",
        },
        airKick: {
            duration: 0.7,
            active: [0.4, 0.6],
            origin: "front_hip",
            base: "side",
            tilt: 0.5,
            reach: 1.1,
            spread: 0.4,
            damage: 12,
            push: [6, 2],
            stun: 0.6,
            reaction: "stumble",
        },
    },
};

/**
 * Resolución de los ataques melee: rayos desde la articulación de origen, daño, bloqueo, empuje, reacción y eventos
 * de feedback. Una vez por paso fijo, después de `stepWorld`. No importa nada: recibe el raycaster, el sistema de
 * daño (solo `ownerOf`) y los jugadores. Los vectores nativos de trabajo se crean acá y se liberan en `dispose`.
 */
export class Melee {
    /**
     * @param {object} raycaster Servicio de rayos del mundo (`getRaycaster`).
     * @param {object} damage Sistema de daño; solo se usa `ownerOf`.
     * @param {object} [config] Tabla `MELEE`.
     */
    constructor(raycaster, damage, config = MELEE) {
        this.raycaster = raycaster;
        this.damage = damage;
        this.config = config;
        this.impulse = new Box2D.b2Vec2(0, 0);
        this.point = new Box2D.b2Vec2(0, 0);
        this.hits = [];
        this.events = [];
    }

    /**
     * Resuelve los ataques activos de este paso. Todos se leen antes de aplicar ninguno, así dos golpes
     * simultáneos conectan los dos.
     * @param {object[]} players Jugadores (`ActiveRagdoll`).
     * @param {number} now Reloj de simulación, s.
     */
    resolve(players, now) {
        const rows = players.map((player) => player.activeAttack(now));
        players.forEach((player, k) => {
            if (rows[k]) this.attack(players, k, rows[k], now);
        });
    }

    attack(players, k, row, now) {
        const player = players[k];
        const anchor = player.rag.joint(row.origin).GetAnchorA();
        const ax = anchor.get_x();
        const ay = anchor.get_y();
        const base =
            row.base === "side"
                ? Math.atan2(-Math.sin(row.tilt), player.side * Math.cos(row.tilt))
                : Math.atan2(player.aimDir.y, player.aimDir.x);
        for (const spread of [0, -row.spread, row.spread]) {
            const dx = Math.cos(base + spread);
            const dy = Math.sin(base + spread);
            const hit = this.raycaster.cast(ax, ay, ax + dx * row.reach, ay + dy * row.reach, player.ownBodies);
            if (!hit) continue;
            const owner = this.damage.ownerOf(hit.bodyPtr);
            if (!owner || owner.index === k) continue;
            this.connect(player, owner, row, dx, dy, hit, now);
            return;
        }
    }

    connect(attacker, owner, row, dx, dy, hit, now) {
        const victim = owner.player;
        const guarded =
            victim.blocking && dx * victim.side < 0 && (victim.rig.arms ?? []).includes(owner.bodyId);
        this.impulse.set_x(dx * this.config.impulse);
        this.impulse.set_y(dy * this.config.impulse);
        this.point.set_x(hit.x);
        this.point.set_y(hit.y);
        if (guarded && row.breaksGuard) {
            victim.stun(this.config.guardBreakStun, now);
            victim.rag.bodies.get(owner.bodyId).ApplyLinearImpulse(this.impulse, this.point, true);
            this.events.push({ kind: "blockBreak", victim: owner.index });
        } else if (guarded) {
            victim.rag.bodies.get(owner.bodyId).ApplyLinearImpulse(this.impulse, this.point, true);
            victim.blocked(now);
            this.events.push({ kind: "block", victim: owner.index });
        } else {
            const dealt = victim.hurt(owner.bodyId, row.damage, now);
            if (dealt > 0) this.events.push({ kind: "hit", victim: owner.index });
            victim.stun(row.stun, now);
            victim.rag.bodies.get(owner.bodyId).ApplyLinearImpulse(this.impulse, this.point, true);
            victim.knockback((Math.sign(dx) || 1) * row.push[0], row.push[1]);
            victim.hit(row.reaction, now);
        }
        attacker.markConnected();
        this.hits.push({ x: hit.x, y: hit.y, time: now, kind: guarded ? (row.breaksGuard ? "blockBreak" : "block") : "hit" });
    }

    /**
     * Vacía los eventos de feedback (ronda nueva). `events` (`{ kind: "hit"|"block"|"blockBreak", victim }`: golpe con daño,
     * bloqueado o que rompió la guardia) los vacía quien los consume, una vez por frame.
     */
    reset() {
        this.hits.length = 0;
        this.events.length = 0;
    }

    dispose() {
        Box2D.destroy(this.impulse);
        Box2D.destroy(this.point);
    }
}
