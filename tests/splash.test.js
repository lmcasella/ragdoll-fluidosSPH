/** Salpicaduras del campo a partículas (#244, docs/design/14-agua.md §14.5): un robot que cae al agua lanza gotas y el campo las recupera. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fillField, DT } from "./helpers/water-scene.js";
import { loadGame } from "./helpers/game.js";

const { stepWorld } = await import("../lib/ragimporter.js");
const { SINK, ORIGIN } = await import("../src/fluids/particleStore.js");
const { FLUID } = await import("../src/combat/weapons.js");
const { LEVEL } = await import("../src/level/level.js");

/** Mueve todos los cuerpos de `player` `(dx, dy)` y los deja en reposo. */
function teleport(player, dx, dy) {
    const v = new Box2D.b2Vec2(0, 0);
    for (const body of player.rag.bodies.values()) {
        const p = body.GetPosition();
        v.set_x(p.get_x() + dx);
        v.set_y(p.get_y() + dy);
        body.SetTransform(v, body.GetAngle());
        v.set_x(0);
        v.set_y(0);
        body.SetLinearVelocity(v);
        body.SetAngularVelocity(0);
    }
    Box2D.destroy(v);
}

test("d: un robot que cae 3 m al agua lanza gotas, el campo baja n·A_p y lo recupera en 4 s con el libro cerrado", async (t) => {
    const game = await loadGame();
    const { world, water, store, buoyancy, immersion, wallContact, players } = game.state;
    const area = buoyancy.dropArea;
    const surface = LEVEL.pool.surface;
    fillField(water, surface);
    const player = players[0];
    let lowest = Infinity;
    for (const body of player.rag.bodies.values()) lowest = Math.min(lowest, body.GetPosition().get_y());
    teleport(player, 37 - player.torso.GetPosition().get_x(), surface + 3 - lowest);
    const v0 = water.volume();

    const aliveArea = () => {
        let sum = 0;
        for (let slot = 0; slot < store.alive.length; slot++) {
            if (store.alive[slot] === 1 && store.origin[slot] === ORIGIN.SPLASH) sum += area * (1 - store.evaporated[slot]);
        }
        return sum;
    };
    const exits = () => {
        let sum = 0;
        for (let cause = 1; cause < store.destroyed.length; cause++) {
            if (cause !== SINK.ABSORBED) sum += store.destroyed[cause][FLUID.WATER];
        }
        return sum * area;
    };

    let worstLaunch = 0;
    let worstBook = 0;
    let launches = 0;
    let impactStep = -1;
    const steps = 60 * 6;
    for (let s = 0; s < steps && (impactStep < 0 || s < impactStep + 240); s++) {
        buoyancy.apply(DT);
        stepWorld(world, [player.rag, wallContact]);
        store.afterStep();
        const before = water.volume();
        const drops = buoyancy.stats.splash.drops;
        buoyancy.releaseSplashes();
        const made = buoyancy.stats.splash.drops - drops;
        if (made > 0) {
            launches++;
            worstLaunch = Math.max(worstLaunch, Math.abs(before - water.volume() - made * area));
            if (impactStep < 0) impactStep = s;
        }
        immersion.step(DT);
        water.step(DT);
        worstBook = Math.max(worstBook, Math.abs(water.volume() + aliveArea() + exits() - v0) / v0);
    }

    const splash = buoyancy.stats.splash;
    const gap = Math.abs(water.volume() - v0);
    const allowed = aliveArea() + exits();
    t.diagnostic(
        `d: ${splash.drops} gotas en ${launches} lanzamientos (primero en el paso ${impactStep}); error máx de bajada ${worstLaunch.toExponential(2)} m²; ` +
            `|V − V0| a los 4 s ${gap.toExponential(2)} m² contra ${allowed.toExponential(2)} m² de vivas y salidas; ` +
            `libro máx ${worstBook.toExponential(2)} relativo; vertical lanzado ${splash.momentumY.toFixed(3)} contra Σ|J_y| ${splash.impulseY.toFixed(3)} kg·m/s`,
    );
    assert.ok(splash.drops >= 3, `gotas ${splash.drops}`);
    assert.ok(worstLaunch <= 1e-12, `bajada ${worstLaunch}`);
    assert.ok(gap <= allowed + 1e-9, `|V − V0| ${gap} > ${allowed}`);
    assert.ok(worstBook <= 1e-9, `libro ${worstBook}`);
    assert.ok(splash.momentumY <= splash.impulseY, "el vertical lanzado supera |J_y|");
});
