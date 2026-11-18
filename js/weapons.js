// Armas de fluido (datos) y emisor de chorros. Sin imports: el emisor recibe el sistema de partículas, el
// sistema de daño y la tabla. Ver docs/design/04-fluidos.md §4.1.

// Ids de arma = tipo de fluido
export const FLUID = { ACID: 1, LAVA: 2, HONEY: 3 };

const WATER_PARTICLE = 0;
const VISCOUS_PARTICLE = 1 << 5;
const TENSILE_PARTICLE = 1 << 7;
const CONTACT_LISTENER_PARTICLE = 1 << 14; // b2_fixtureContactListenerParticle

// rate: partículas/s; speed: m/s; spread: rad (±); tank: partículas; dps: daño por segundo con el chorro entero
export const WEAPONS = [
    { id: FLUID.ACID, name: "Ácido", flags: WATER_PARTICLE, color: [50, 255, 50], rate: 90, speed: 14, spread: 0.035, tank: 135, dps: 20 },
    { id: FLUID.LAVA, name: "Lava", flags: TENSILE_PARTICLE, color: [255, 80, 20], rate: 60, speed: 10, spread: 0.017, tank: 90, dps: 12 },
    { id: FLUID.HONEY, name: "Miel", flags: VISCOUS_PARTICLE, color: [255, 200, 50], rate: 50, speed: 8, spread: 0.017, tank: 75, dps: 0 },
];

// Inventario inicial de cada robot (provisorio hasta #14); arranca equipada la primera
export const LOADOUT = [FLUID.ACID, FLUID.LAVA, FLUID.HONEY];

const byId = new Map(WEAPONS.map((w) => [w.id, w]));

export function weaponById(id) {
    return byId.get(id);
}

// Daño por partícula de las armas de daño por contacto: si cambia el caudal, el DPS no cambia
export function particleDamage(weapon) {
    return weapon.dps / weapon.rate;
}

export function equipLoadout(player) {
    player.tanks = new Map(LOADOUT.map((id) => [id, byId.get(id).tank]));
    player.weapon = LOADOUT[0];
}

// Siguiente arma del inventario (ordenado como la tabla) en el sentido de `step`, con vuelta
export function cycleWeapon(player, step) {
    const owned = WEAPONS.filter((w) => player.tanks.has(w.id));
    if (owned.length === 0) return;
    const at = owned.findIndex((w) => w.id === player.weapon);
    player.weapon = owned[(((at < 0 ? 0 : at) + step) % owned.length + owned.length) % owned.length].id;
}

const GOLDEN = 0.6180339887498949;
const MUZZLE_OFFSET = 0.15; // radio de la partícula (0,1) más 5 cm: no nace dentro del arma
const MAX_BURST_TIME = 0.05; // s de caudal que puede salir en un solo frame

// Emite el chorro de cada jugador: partículas sueltas, una vez por frame y fuera de los callbacks de Box2D
export class ShotEmitter {
    constructor(system, damage, weapons = WEAPONS) {
        this.system = system;
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

    // Después de un reinicio de ronda hay que soltar el botón antes de volver a disparar: los estados
    // nuevos nacen sin armar y se arman con el primer frame sin disparo
    reset() {
        this.players.length = 0;
        this.armedByDefault = false;
    }

    // Devuelve cuántas partículas emitió
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
        const id = this.damage.shotId(k, weapon.id, now);
        this.def.set_flags(weapon.flags | CONTACT_LISTENER_PARTICLE);
        this.def.set_color(this.colors.get(weapon.id));
        let made = 0;
        for (let j = 0; j < n; j++) {
            const angle = weapon.spread * (2 * ((s.seq * GOLDEN) % 1) - 1);
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            const along = MUZZLE_OFFSET + step * (n - 1 - j);
            this.position.set_x(muzzle.x + muzzle.dx * along);
            this.position.set_y(muzzle.y + muzzle.dy * along);
            this.velocity.set_x(weapon.speed * (muzzle.dx * cos - muzzle.dy * sin));
            this.velocity.set_y(weapon.speed * (muzzle.dx * sin + muzzle.dy * cos));
            this.def.set_position(this.position);
            this.def.set_velocity(this.velocity);
            const index = this.system.CreateParticle(this.def);
            if (index < 0) break;
            // crear puede reubicar los buffers: el de userData se vuelve a leer en cada partícula
            this.damage.tagParticle(index, id);
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
