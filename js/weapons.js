import { PARTICLE } from "./particles.js";
import { ORIGIN } from "./particleStore.js";
import { SIGMA_W } from "./materials.js";

/**
 * Armas de fluido (datos) y emisor de chorros. El emisor recibe el sistema de partículas, el sistema de daño y
 * la tabla. Ver docs/design/04-fluidos.md §4.1, docs/design/07-sph.md §7.5 y docs/design/14-agua.md §14.6.
 */
export const FLUID = { ACID: 1, LAVA: 2, HONEY: 3, WATER: 4 };

export const CONTACT_LISTENER_PARTICLE = PARTICLE.CONTACT_LISTENER;

/**
 * Sistema de partículas de los disparos (claves de b2ParticleSystemDef): agua pura, con la masa física de la
 * rebanada (`density` = `σ_w`). La fuerza es por sistema; `flags` de cada arma elige qué términos recibe.
 * maxCount fijo y `destroyByAge: false`: `ParticleStore` lanza un error si no es `false`, porque el motor
 * borraría partículas por su cuenta y los slots quedarían colgados.
 */
export const SHOT_SYSTEM = {
    radius: 0.06,
    maxCount: 12000,
    destroyByAge: false,
    gravityScale: 1,
    density: SIGMA_W,
    dampingStrength: 0.5,
    pressureStrength: 0.1,
    viscousStrength: 0.6,
    surfaceTensionPressureStrength: 0,
    surfaceTensionNormalStrength: 0,
};

/** Tope de partículas de armas `persist` (la miel) que quedan en el mapa; las más viejas se destruyen primero. */
export const PERSIST_MAX = 1200;

/**
 * Tabla de armas. `rate`: partículas/s; `speed`: m/s; `spread`: rad (±); `tank`: partículas; `dps`: daño por
 * segundo con el chorro entero (0 si el arma aplica un estado). `lanes`: carriles paralelos separados 1,5 r y
 * centrados en el eje, repartidos por turno; cada arma cumple `rate / lanes ≤ speed / (1,5 r)`: un carril
 * sin explosión al crear. `persist`: no vence a los 6 s del disparo; queda como charco y cuenta para
 * PERSIST_MAX.
 */
export const WEAPONS = [
    { id: FLUID.WATER, name: "Agua", flags: PARTICLE.WATER, color: [90, 170, 255], rate: 155, speed: 14, spread: 0.035, tank: 600, dps: 0, lanes: 1 },
    { id: FLUID.ACID, name: "Ácido", flags: PARTICLE.WATER, color: [50, 255, 50], rate: 155, speed: 14, spread: 0.035, tank: 272, dps: 20, lanes: 1 },
    { id: FLUID.LAVA, name: "Lava", flags: PARTICLE.WATER, color: [255, 80, 20], rate: 111, speed: 10, spread: 0.017, tank: 180, dps: 12, lanes: 1 },
    { id: FLUID.HONEY, name: "Miel", flags: PARTICLE.VISCOUS, color: [255, 200, 50], rate: 100, speed: 18, spread: 0.017, tank: 152, dps: 0, lanes: 1, persist: true },
];

/**
 * Inventario inicial de cada robot: `weapon` arranca equipada y `weapons` son los tanques llenos. El resto de las
 * armas se recoge en los puntos de aparición del mapa (`js/pickups.js`).
 */
export const LOADOUT = { weapon: FLUID.WATER, weapons: [FLUID.WATER] };
const byId = new Map(WEAPONS.map((w) => [w.id, w]));

export function weaponById(id) {
    return byId.get(id);
}

/** Tipo de fluido por color de partícula (para las que no tienen disparo asociado). Los pares (r, g) salen de la tabla. */
const byColor = new Map(WEAPONS.map((w) => [w.color[0] * 256 + w.color[1], w.id]));

/** Ids de las armas con `persist`. */
export const PERSIST_FLUIDS = new Set(WEAPONS.filter((w) => w.persist).map((w) => w.id));

export function fluidFromColor(r, g) {
    return byColor.get(r * 256 + g) ?? 0;
}

/** Daño por partícula de las armas de daño por contacto: si cambia el caudal, el DPS no cambia. */
export function particleDamage(weapon) {
    return weapon.dps / weapon.rate;
}

export function equipLoadout(player) {
    player.tanks = new Map(LOADOUT.weapons.map((id) => [id, byId.get(id).tank]));
    player.weapon = LOADOUT.weapon;
}

/** Siguiente arma del inventario (ordenado como la tabla) en el sentido de `step`, con vuelta. */
export function cycleWeapon(player, step) {
    const owned = WEAPONS.filter((w) => player.tanks.has(w.id));
    if (owned.length === 0) return;
    const at = owned.findIndex((w) => w.id === player.weapon);
    player.weapon = owned[(((at < 0 ? 0 : at) + step) % owned.length + owned.length) % owned.length].id;
}

const GOLDEN = 0.6180339887498949;
/** Separación entre carriles vecinos, en radios de partícula. */
const LANE_SPACING = 1.5;
const PARTICLE_RADIUS = SHOT_SYSTEM.radius;
/** Distancia de la boca a la primera partícula: no nace dentro del arma. */
const MUZZLE_OFFSET = PARTICLE_RADIUS + 0.05;
/** Segundos de caudal que pueden salir en un solo frame. */
const MAX_BURST_TIME = 0.05;

/**
 * Emite el chorro de cada jugador: partículas sueltas, una vez por frame y fuera de los callbacks de Box2D.
 * Crea las partículas con el `ParticleStore` de los disparos.
 */
export class ShotEmitter {
    /**
     * Con raycaster (opcional, con cast(x1, y1, x2, y2, ignore)) el chorro se recorta al primer obstáculo: no
     * nacen partículas detrás de una pared ni dentro del rival.
     */
    constructor(store, damage, weapons = WEAPONS, raycaster = null) {
        this.store = store;
        this.system = store.system;
        this.props = { kind: 0, origin: ORIGIN.SHOT, shot: 0 };
        this.raycaster = raycaster;
        this.damage = damage;
        this.weapons = new Map(weapons.map((w) => [w.id, w]));
        this.def = new Box2D.b2ParticleDef();
        this.position = new Box2D.b2Vec2(0, 0);
        this.velocity = new Box2D.b2Vec2(0, 0);
        this.colors = new Map(weapons.map((w) => [w.id, new Box2D.b2ParticleColor(...w.color, 255)]));
        this.players = [];
        this.armedByDefault = true;
    }

    state(k) {
        return (this.players[k] ??= { credit: 0, firing: false, armed: this.armedByDefault, seq: 0 });
    }

    /** Después de un reinicio de ronda hay que soltar el botón: los estados nuevos nacen sin armar y se arman con el primer frame sin disparo. */
    reset() {
        this.players.length = 0;
        this.armedByDefault = false;
    }

    /** Devuelve cuántas partículas emitió. */
    fire(k, player, wants, dt, now) {
        const s = this.state(k);
        if (!wants) {
            s.armed = true;
            s.firing = false;
            s.credit = 0;
            return 0;
        }
        const weapon = this.weapons.get(player.weapon);
        if (!s.armed || player.dead || !weapon) {
            s.firing = false;
            s.credit = 0;
            return 0;
        }
        if (s.firing) s.credit += weapon.rate * dt;
        else {
            s.firing = true;
            s.credit = 1;
        }
        const wanted = Math.floor(s.credit);
        s.credit -= wanted;

        const tank = player.tanks.get(weapon.id) ?? 0;
        const max = this.system.GetMaxParticleCount();
        const room = max > 0 ? max - this.system.GetParticleCount() : Infinity;
        const n = Math.min(wanted, tank, Math.ceil(weapon.rate * MAX_BURST_TIME), room);
        if (n <= 0) return 0;

        const muzzle = player.muzzle();
        const step = weapon.speed / weapon.rate;
        let reach = Infinity;
        if (this.raycaster) {
            const span = MUZZLE_OFFSET + step * (n - 1) + PARTICLE_RADIUS;
            const hit = this.raycaster.cast(muzzle.x, muzzle.y, muzzle.x + muzzle.dx * span, muzzle.y + muzzle.dy * span, player.ownBodies ?? null);
            if (hit) reach = Math.hypot(hit.x - muzzle.x, hit.y - muzzle.y) - PARTICLE_RADIUS;
        }
        this.props.kind = weapon.id;
        this.props.shot = this.damage.shotId(k, weapon.id, now);
        this.def.set_flags(weapon.flags | CONTACT_LISTENER_PARTICLE);
        this.def.set_color(this.colors.get(weapon.id));
        let made = 0;
        for (let j = 0; j < n; j++) {
            const angle = weapon.spread * (2 * ((s.seq * GOLDEN) % 1) - 1);
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            const along = MUZZLE_OFFSET + step * (s.credit + (n - 1 - j));
            if (along > reach) continue;
            const lateral = ((s.seq % weapon.lanes) - (weapon.lanes - 1) / 2) * LANE_SPACING * PARTICLE_RADIUS;
            this.position.set_x(muzzle.x + muzzle.dx * along - muzzle.dy * lateral);
            this.position.set_y(muzzle.y + muzzle.dy * along + muzzle.dx * lateral);
            this.velocity.set_x(weapon.speed * (muzzle.dx * cos - muzzle.dy * sin));
            this.velocity.set_y(weapon.speed * (muzzle.dx * sin + muzzle.dy * cos));
            this.def.set_position(this.position);
            this.def.set_velocity(this.velocity);
            const index = this.store.create(this.def, this.props);
            if (index < 0) break;
            s.seq++;
            made++;
        }
        player.tanks.set(weapon.id, tank - made);
        return made;
    }

    dispose() {
        Box2D.destroy(this.def);
        Box2D.destroy(this.position);
        Box2D.destroy(this.velocity);
        for (const color of this.colors.values()) Box2D.destroy(color);
        this.colors.clear();
    }
}
