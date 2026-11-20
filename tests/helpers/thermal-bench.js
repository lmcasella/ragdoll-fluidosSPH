import "./water-bench.js";

const { stepWorld } = await import("../../lib/ragimporter.js");
const { createParticleSystem } = await import("../../js/particles.js");
const { SHOT_SYSTEM } = await import("../../js/weapons.js");
const { ParticleStore, ORIGIN } = await import("../../js/particleStore.js");
const { ShallowWater } = await import("../../js/water.js");
const { Immersion } = await import("../../js/immersion.js");
const { Thermal } = await import("../../js/thermal.js");
const { Viscosity } = await import("../../js/viscosity.js");
const { newWorld, addSolids, wallFor, DT } = await import("./water-bench.js");

/**
 * Banco de la térmica (#75, docs/design/14-agua.md §14.16 T y L): LiquidFun real, piso de 40 m (x de −15 a 25), el
 * contorno del juego, el campo de alturas, `Thermal` y `Viscosity`. `points` son `{ x, y, kind, flags, enthalpy }`;
 * `walls` agrega dos paredes que forman una artesa de x = 3 a 7; `immersion` agrega el campo y la inmersión;
 * `airLosses` apaga las pérdidas al aire; `floor` reemplaza el piso (`{ x, y, w, h }`), por ejemplo para cubrir la pileta
 * del campo (x de 18 a 38); `solids` agrega cajas estáticas `{ x, y, w, h }`. `step()` avanza un paso fijo en el orden del juego (mundo, térmica,
 * viscosidad); `thermalOnly(dt)` avanza solo la térmica con `dt` (para tiempos largos, sobre los contactos del
 * último paso del mundo).
 */
export function thermalScene({ points = [], kind = 0, params = {}, walls = false, immersion = false, airLosses = true, floor = null, solids = [] } = {}) {
    const world = newWorld();
    addSolids(world, [floor ?? { x: 5, y: -0.5, w: 40, h: 1 }, ...(walls ? [{ x: 2.5, y: 2, w: 1, h: 4 }, { x: 7.5, y: 2, w: 1, h: 4 }] : []), ...solids]);
    const system = createParticleSystem(world, { ...SHOT_SYSTEM, ...params });
    const store = new ParticleStore(system, SHOT_SYSTEM);
    const wall = wallFor(system, store);
    const water = new ShallowWater();
    const imm = immersion ? new Immersion(system, store, water) : null;
    const thermal = new Thermal(system, store, water, imm, { airLosses });
    const viscosity = new Viscosity(system, store, thermal);
    const def = new Box2D.b2ParticleDef();
    const at = new Box2D.b2Vec2(0, 0);
    const scene = {
        world,
        system,
        store,
        wall,
        water,
        immersion: imm,
        thermal,
        viscosity,
        time: 0,
        create(p) {
            at.set_x(p.x);
            at.set_y(p.y);
            def.set_position(at);
            def.set_flags(p.flags ?? 0);
            return store.create(def, { kind: p.kind ?? kind, origin: ORIGIN.SHOT, enthalpy: p.enthalpy });
        },
        step({ viscous = true } = {}) {
            stepWorld(world, [wall]);
            store.afterStep();
            imm?.step(DT);
            thermal.step(DT);
            if (viscous) viscosity.step(DT);
            scene.time += DT;
        },
        thermalOnly(dt) {
            thermal.step(dt);
        },
        positions() {
            const pos = Box2D.getPointer(system.GetPositionBuffer()) >> 2;
            const n = system.GetParticleCount();
            return Array.from({ length: n }, (_, i) => ({ x: Box2D.HEAPF32[pos + 2 * i], y: Box2D.HEAPF32[pos + 2 * i + 1] }));
        },
        speeds() {
            const vel = Box2D.getPointer(system.GetVelocityBuffer()) >> 2;
            const n = system.GetParticleCount();
            return Array.from({ length: n }, (_, i) => Math.hypot(Box2D.HEAPF32[vel + 2 * i], Box2D.HEAPF32[vel + 2 * i + 1]));
        },
        dispose() {
            wall.dispose();
            viscosity.dispose();
            thermal.dispose();
            Box2D.destroy(def);
            Box2D.destroy(at);
        },
    };
    for (const p of points) scene.create(p);
    return scene;
}

export { DT };
