import { FLUID, weaponById, particleFlags } from "../combat/weapons.js";
import { BENCH } from "./benchScript.js";

const COLOR_ALPHA = 255;

/**
 * Crea partículas de un material en una región, para las escenas de medición. Va por `ParticleStore.create`, como la lluvia
 * de `src/water/flood.js`. Las coloca en una grilla de `BENCH.particleSpacingRadii` radios, fila por fila desde abajo, así
 * que dos corridas crean lo mismo. Memoria nativa: la definición, el vector y un color por material se crean una vez y se
 * liberan con `dispose`.
 */
export class BenchParticles {
    /** @param {import("../fluids/particleStore.js").ParticleStore} store */
    constructor(store) {
        this.store = store;
        this.spacing = BENCH.particleSpacingRadii * store.system.GetRadius();
        this.def = new Box2D.b2ParticleDef();
        this.position = new Box2D.b2Vec2(0, 0);
        this.colors = new Map();
    }

    colorOf(kind) {
        let color = this.colors.get(kind);
        if (!color) {
            color = new Box2D.b2ParticleColor(...weaponById(kind).color, COLOR_ALPHA);
            this.colors.set(kind, color);
        }
        return color;
    }

    /**
     * Crea hasta `count` partículas de `material`.
     * @param {object} options
     * @param {string} options.material clave de `FLUID` con arma en `WEAPONS` (agua, ácido, lava o miel)
     * @param {number} options.count partículas a crear
     * @param {{centerX: number, bottomY: number, width: number}} options.region zona de creación, en m
     * @returns {number} cuántas se crearon (menos que `count` si el sistema se llenó)
     */
    spawn({ material, count, region }) {
        const kind = FLUID[material];
        const weapon = weaponById(kind);
        this.def.set_flags(particleFlags(weapon));
        this.def.set_color(this.colorOf(kind));
        const columns = Math.max(1, Math.floor(region.width / this.spacing));
        const left = region.centerX - ((columns - 1) * this.spacing) / 2;
        let created = 0;
        for (let n = 0; n < count; n++) {
            this.position.set_x(left + (n % columns) * this.spacing);
            this.position.set_y(region.bottomY + Math.floor(n / columns) * this.spacing);
            this.def.set_position(this.position);
            if (this.store.create(this.def, { kind }) < 0) break;
            created++;
        }
        return created;
    }

    /** Libera lo nativo. */
    dispose() {
        Box2D.destroy(this.def);
        Box2D.destroy(this.position);
        for (const color of this.colors.values()) Box2D.destroy(color);
        this.colors.clear();
    }
}
