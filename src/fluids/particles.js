// Sistemas de partículas de LiquidFun como datos. Sin imports: es el único módulo que conoce b2ParticleSystemDef.
// Ver docs/design/07-sph.md §7.5.

// Flags por partícula (b2ParticleFlag, LiquidFun 1.1): el build no exporta los nombres
export const PARTICLE = {
    WATER: 0,
    WALL: 1 << 2,
    VISCOUS: 1 << 5,
    POWDER: 1 << 6,
    TENSILE: 1 << 7,
    STATIC_PRESSURE: 1 << 11,
    CONTACT_LISTENER: 1 << 14, // b2_fixtureContactListenerParticle
};

// Crea un sistema con los valores de `params` (claves de b2ParticleSystemDef sin el prefijo `set_`).
// Una clave sin setter es un error de tipeo en los datos: se lanza en vez de ignorarla.
export function createParticleSystem(world, params) {
    const def = new Box2D.b2ParticleSystemDef();
    try {
        for (const [key, value] of Object.entries(params)) {
            if (value === undefined) continue;
            const setter = def["set_" + key];
            if (typeof setter !== "function") throw new Error(`b2ParticleSystemDef no tiene "${key}"`);
            setter.call(def, value);
        }
        return world.CreateParticleSystem(def);
    } finally {
        Box2D.destroy(def);
    }
}
