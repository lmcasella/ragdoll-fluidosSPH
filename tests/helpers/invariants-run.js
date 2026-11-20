/**
 * Escena estándar de los invariantes globales (docs/design/14-agua.md §14.16 G, #108): el script de `index.html`
 * con LiquidFun real y gamepad simulado. Robots quietos hasta `flood.start − 10` s de ronda; la ventana dura 60 s
 * (o hasta el último paso anterior a `reiniciarRonda`, si la ronda termina antes), cada robot cambia de arma cada
 * 3 s en el orden de la tabla de armas y dispara sin soltar, con la mira barriendo de la otra punta de la isla
 * rival al piso entre los dos. Se mide al final de cada paso fijo envolviendo `water.step`. `options` ajusta la
 * escena para los escenarios del usuario (#109): `windowSeconds`, `leadSeconds` (segundos antes de `flood.start`
 * en que empieza la ventana), `onStart(game)` y `onFrame(game, frame)` para grabar.
 */
import { loadGame, giveAllWeapons } from "./game.js";
import { UnionArea, polygonArea } from "./drawn-area.js";
import { HoneyProbe } from "./honey-probe.js";

const { LEVEL } = await import("../../js/level.js");
const { MATERIALS, SIGMA_W, REACTIONS } = await import("../../js/materials.js");
const { SINK, ORIGIN } = await import("../../js/particleStore.js");
const { KIND_MATERIAL } = await import("../../js/immersion.js");
const { FLUID, WEAPONS } = await import("../../js/weapons.js");
const { SHOT_DRAW, collectSurfaces, dropShape, waterOutline } = await import("../../js/render.js");

/** Pasos fijos por segundo (`STEP_SETTINGS.dt` = 1/60 s). */
export const STEPS_PER_SECOND = 60;

/** Duración de la ventana medida (s) y mínimo exigido si la ronda termina antes. */
export const WINDOW_SECONDS = 60;
export const MIN_WINDOW_SECONDS = 30;

/** Segundos entre cambios de arma y período del barrido de la mira. */
const SWITCH_SECONDS = 3;
const SWEEP_SECONDS = 6;

/**
 * Tolerancias: masa relativa (I1, I2) y área dibujada relativa (I3p): `AREA_TOLERANCE` en al menos `AREA_SHARE` de los
 * pasos y `AREA_HARD_LIMIT` en todos. I3f usa `AREA_TOLERANCE` en todos los pasos.
 */
export const MASS_TOLERANCE = 1e-6;
export const AREA_TOLERANCE = 0.05;
export const PARTICLE_AREA_TOLERANCE = 0.1;
export const AREA_SHARE = 0.95;
export const AREA_HARD_LIMIT = 0.15;

/** Botones del mapeo "standard": gatillo derecho (disparo) y RB (arma siguiente). */
const BUTTON_FIRE = 7;
const BUTTON_NEXT_WEAPON = 5;

export const SPECIES = ["H2O", "H2SO4", "honey", "basalt"];
export const MATERIAL_NAMES = ["water", "acid", "honey", "lava"];
const KIND_OF = { water: FLUID.WATER, acid: FLUID.ACID, honey: FLUID.HONEY, lava: FLUID.LAVA, stone: FLUID.STONE };

/** Serie de una medida: cuántas evaluaciones, cuántas fallaron, el peor valor y en qué paso. */
export class Track {
    constructor(name) {
        this.name = name;
        this.evals = 0;
        this.fails = 0;
        this.firstFail = -1;
        this.max = 0;
        this.maxStep = -1;
        this.last = 0;
        this.maxInfo = null;
    }

    add(value, ok, step, info = null) {
        this.evals++;
        this.last = value;
        if (Math.abs(value) > this.max) {
            this.max = Math.abs(value);
            this.maxStep = step;
            this.maxInfo = info;
        }
        if (!ok) {
            this.fails++;
            if (this.firstFail < 0) this.firstFail = step;
        }
    }
}

const tracks = (names) => Object.fromEntries(names.map((n) => [n, new Track(n)]));
const hr = () => Number(process.hrtime.bigint()) / 1e6;

/**
 * Ejecuta la escena estándar y devuelve las series de cada invariante, los conteos y el costo (ms) de cada
 * medición. Un juego por llamada.
 */
export async function runStandardScene({ windowSeconds = WINDOW_SECONDS, leadSeconds = 10, onStart = null, onFrame = null } = {}) {
    const wall0 = hr();
    const game = await loadGame();
    giveAllWeapons(game);
    const g = game.state;
    const { water, store, immersion, flood, match, particleSystem, players } = g;
    const startSeconds = LEVEL.flood.start - leadSeconds;
    const area = immersion.area;
    const mass = Object.fromEntries([...MATERIAL_NAMES, "stone"].map((n) => [n, MATERIALS[n].SG * SIGMA_W * area]));
    const reacted = (n) => REACTIONS.reduce((a, r) => a + g.thermal.stats.advance[r.id] * ((r.to[n] ?? 0) - (r.from[n] ?? 0)), 0);
    const allowed = new Set(REACTIONS.map((r) => `${KIND_OF[Object.keys(r.from)[0]]}>${KIND_OF[Object.keys(r.to)[0]]}`));
    const kindIndex = new Map(MATERIAL_NAMES.map((n, k) => [KIND_OF[n], k]));
    for (const [id, entry] of Object.entries(KIND_MATERIAL)) {
        const name = [...MATERIAL_NAMES, "stone"].find((n) => MATERIALS[n] === entry.material);
        if (KIND_OF[name] !== Number(id)) throw new Error("KIND_MATERIAL no coincide con los materiales de la prueba");
    }
    const field0 = { water: SIGMA_W * water.volume(), acid: 0, honey: 0, lava: 0, stone: 0 };
    const lightest = Object.fromEntries(
        SPECIES.map((s) => [s, Math.min(...[...MATERIAL_NAMES, "stone"].filter((n) => MATERIALS[n].species[s] > 0).map((n) => MATERIALS[n].species[s] * mass[n]))]),
    );

    const result = {
        area,
        mass,
        field0,
        i1: tracks(SPECIES),
        i2b: tracks(MATERIAL_NAMES),
        guard: tracks([...SPECIES, ...MATERIAL_NAMES]),
        i2a: { creations: 0, changes: 0, transitions: 0 },
        i3p: tracks(MATERIAL_NAMES),
        i3pNear: Object.fromEntries(MATERIAL_NAMES.map((n) => [n, 0])),
        i3f: tracks(["water"]),
        h2: tracks(["alive", "absorbed", "field"]),
        probe: null,
        i4: new Track("I4"),
        q6c: new Track("Q6c"),
        i4tips: { cells: 0, thin: 0, minH: Infinity },
        steps: 0,
        seconds: 0,
        roundEnded: false,
        firstDeath: null,
        peak: Object.fromEntries(MATERIAL_NAMES.map((n) => [n, 0])),
        cost: { total: 0, mass: 0, drawnParticles: 0, drawnField: 0, thickness: 0, scene: 0 },
        books: null,
        field: null,
    };

    const expectedKind = new Uint8Array(store.capacity);
    const create = store.create.bind(store);
    store.create = (def, props) => {
        const index = create(def, props);
        if (index >= 0) {
            const slot = store.slotAt(index);
            expectedKind[slot] = store.kind[slot];
            result.i2a.creations++;
        }
        return index;
    };
    const destroy = store.destroy.bind(store);
    store.destroy = (i, cause) => {
        const slot = store.slotAt(i);
        if (slot >= 0 && store.alive[slot] === 1 && store.kind[slot] !== expectedKind[slot]) {
            if (allowed.has(`${expectedKind[slot]}>${store.kind[slot]}`)) result.i2a.transitions++;
            else result.i2a.changes++;
        }
        destroy(i, cause);
    };

    const probe = new HoneyProbe(game);
    result.probe = probe;
    const union = new UnionArea();
    const shape = {};
    const outline = {};
    const drawn = new Float64Array(MATERIAL_NAMES.length);
    const alive = new Float64Array(MATERIAL_NAMES.length);
    let stoneAlive = 0;
    const evaporatedLive = new Float64Array(MATERIAL_NAMES.length);
    const round0 = match.round;
    let measuring = false;
    let ended = false;

    const measure = () => {
        const t0 = hr();
        const step = result.steps++;
        if (result.firstDeath === null) {
            const dead = players.findIndex((p) => p.dead);
            if (dead >= 0) result.firstDeath = { step, player: dead };
        }
        const count = particleSystem.GetParticleCount();
        alive.fill(0);
        evaporatedLive.fill(0);
        let slotChanges = 0;
        stoneAlive = 0;
        for (let slot = 0; slot < store.capacity; slot++) {
            if (store.alive[slot] === 0) continue;
            if (store.kind[slot] !== expectedKind[slot]) {
                if (allowed.has(`${expectedKind[slot]}>${store.kind[slot]}`)) {
                    expectedKind[slot] = store.kind[slot];
                    result.i2a.transitions++;
                } else slotChanges++;
            }
            if (store.kind[slot] === FLUID.STONE) stoneAlive++;
            const k = kindIndex.get(store.kind[slot]);
            if (k !== undefined) {
                alive[k]++;
                evaporatedLive[k] += store.evaporated[slot];
            }
        }
        result.i2a.changes += slotChanges;
        MATERIAL_NAMES.forEach((n, k) => (result.peak[n] = Math.max(result.peak[n], alive[k])));

        const honeyField = water.honey();
        const acidField = water.acid();
        const field = {
            water: SIGMA_W * (water.volume() - honeyField) - acidField / (MATERIALS.acid.SG * MATERIALS.acid.species.H2SO4),
            acid: acidField / MATERIALS.acid.species.H2SO4,
            honey: MATERIALS.honey.SG * SIGMA_W * honeyField,
            lava: 0,
            stone: 0,
        };
        const P = {};
        const out = {};
        const inj = {};
        MATERIAL_NAMES.forEach((n, k) => {
            const kind = KIND_OF[n];
            P[n] = (alive[k] - evaporatedLive[k]) * mass[n];
            out[n] = (store.destroyed[SINK.OUT][kind] + store.destroyed[SINK.EVAPORATED][kind] + evaporatedLive[k]) * mass[n];
            inj[n] = store.created[kind] * mass[n];
        });
        P.stone = stoneAlive * mass.stone;
        out.stone = store.destroyed[SINK.OUT][FLUID.STONE] * mass.stone;
        inj.stone = store.created[FLUID.STONE] * mass.stone;
        for (const s of SPECIES) {
            let den = 0;
            let sum = 0;
            for (const n of [...MATERIAL_NAMES, "stone"]) {
                const w = MATERIALS[n].species[s] ?? 0;
                den += w * (field0[n] + inj[n]);
                sum += w * (P[n] + field[n] + out[n] - field0[n] - inj[n]);
            }
            if (den <= 0) continue;
            result.i1[s].add(sum / den, Math.abs(sum) / den < MASS_TOLERANCE, step, { kg: sum, den });
            result.guard[s].add((MASS_TOLERANCE * den) / (0.1 * lightest[s]), MASS_TOLERANCE * den < 0.1 * lightest[s], step);
        }
        for (const n of MATERIAL_NAMES) {
            const den = field0[n] + inj[n];
            if (den <= 0) continue;
            const r = P[n] + field[n] + out[n] - field0[n] - inj[n] - reacted(n);
            result.i2b[n].add(r / den, Math.abs(r) / den < MASS_TOLERANCE, step, { kg: r, den });
            result.guard[n].add((MASS_TOLERANCE * den) / (0.1 * mass[n]), MASS_TOLERANCE * den < 0.1 * mass[n], step);
        }
        const t1 = hr();

        collectSurfaces(players, LEVEL.solids, SHOT_DRAW.snapReach);
        union.clear();
        const pos = Box2D.getPointer(particleSystem.GetPositionBuffer()) >> 2;
        for (let i = 0; i < count; i++) {
            const slot = store.slotAt(i);
            if (slot < 0 || store.alive[slot] === 0) continue;
            const k = kindIndex.get(store.kind[slot]);
            if (k === undefined) continue;
            const x = Box2D.HEAPF32[pos + 2 * i];
            const y = Box2D.HEAPF32[pos + 2 * i + 1];
            dropShape(x, y, store.kind[slot], SHOT_DRAW, shape);
            union.addCircle(k, shape.x0, shape.y0, shape.radius);
        }
        union.areas(drawn);
        MATERIAL_NAMES.forEach((n, k) => {
            const physical = alive[k] * area;
            if (physical === 0) return;
            const rel = (drawn[k] - physical) / physical;
            result.i3p[n].add(rel, Math.abs(rel) <= AREA_HARD_LIMIT, step, { drawn: drawn[k], physical, n: alive[k] });
            if (Math.abs(rel) <= PARTICLE_AREA_TOLERANCE) result.i3pNear[n]++;
        });
        const t2 = hr();

        waterOutline(water, outline);
        let drawnField = 0;
        for (let s = 0; s < outline.count; s++) drawnField += polygonArea(outline.xs, outline.ys, outline.start[s], outline.size[s]);
        const { h, M, N, dx } = water;
        let physicalWater = 0;
        for (let c = 0; c < N; c++) if (h[c] > 0) physicalWater += h[c] - M[c];
        physicalWater *= dx;
        const physicalHoney = honeyField;
        const relWater = (drawnField - physicalWater) / physicalWater;
        result.i3f.water.add(relWater, Math.abs(relWater) <= AREA_TOLERANCE, step, { drawn: drawnField, physical: physicalWater, honey: physicalHoney });
        const liveHoney = alive[kindIndex.get(FLUID.HONEY)];
        const expectedHoney = store.created[FLUID.HONEY] - store.destroyed[SINK.OUT][FLUID.HONEY];
        result.h2.alive.add(liveHoney - expectedHoney, liveHoney === expectedHoney, step, { alive: liveHoney, expected: expectedHoney });
        const absorbedHoney = store.destroyed[SINK.ABSORBED][FLUID.HONEY];
        result.h2.absorbed.add(absorbedHoney, absorbedHoney === 0, step);
        result.h2.field.add(field.honey, field.honey <= 1e-6 * inj.honey, step, { injected: inj.honey });
        probe.sample();
        const t3 = hr();

        const hDry = water.config.hDry;
        const hMin = water.config.hMin;
        let outside = 0;
        let worstRatio = 0;
        let worstNegative = 0;
        for (let k = 0; k < N; k++) {
            if (h[k] <= hDry) continue;
            const w = water.acidRatio(k);
            worstRatio = Math.max(worstRatio, w - MATERIALS.acid.species.H2SO4);
            worstNegative = Math.max(worstNegative, -water.A[k]);
            if (water.A[k] < -1e-12 || w > MATERIALS.acid.species.H2SO4 + 1e-9) outside++;
        }
        result.q6c.add(outside, outside === 0, step, { worstRatio, worstNegative });
        let thin = 0;
        let minInterior = Infinity;
        let c = 0;
        while (c < N) {
            if (h[c] <= hDry) {
                c++;
                continue;
            }
            let end = c;
            while (end + 1 < N && h[end + 1] > hDry) end++;
            result.i4tips.cells += end > c ? 2 : 1;
            result.i4tips.minH = Math.min(result.i4tips.minH, h[c], h[end]);
            if (h[c] < hMin) result.i4tips.thin++;
            if (end > c && h[end] < hMin) result.i4tips.thin++;
            for (let k = c + 1; k < end; k++) {
                if (h[k] < hMin) thin++;
                minInterior = Math.min(minInterior, h[k]);
            }
            c = end + 1;
        }
        result.i4.add(thin, thin === 0, step, { minInterior });
        const t4 = hr();

        result.books = {
            created: Object.fromEntries(MATERIAL_NAMES.map((n) => [n, store.created[KIND_OF[n]]])),
            destroyed: Object.fromEntries(
                Object.entries(SINK).map(([cause, id]) => [cause, Object.fromEntries(MATERIAL_NAMES.map((n) => [n, store.destroyed[id][KIND_OF[n]]]))]),
            ),
        };
        result.field = { volume: water.volume(), honey: honeyField };
        result.cost.mass += t1 - t0;
        result.cost.drawnParticles += t2 - t1;
        result.cost.drawnField += t3 - t2;
        result.cost.thickness += t4 - t3;
    };

    const advance = water.step.bind(water);
    water.step = (dt) => {
        advance(dt);
        if (!measuring || ended) return;
        if (match.round !== round0) {
            ended = true;
            return;
        }
        measure();
    };

    const sceneStart = hr();
    let guard = 0;
    while (match.roundTime < startSeconds && guard++ < 20000) game.frame();

    const floorX = (LEVEL.spawns[0].x + LEVEL.spawns[1].x) / 2;
    const islandTop = LEVEL.solids[1].y + LEVEL.solids[1].h / 2;
    const targets = [
        { ax: LEVEL.bounds.maxX - 1, ay: islandTop, bx: floorX, by: LEVEL.pool.bottom },
        { ax: LEVEL.bounds.minX + 1, ay: islandTop, bx: floorX, by: LEVEL.pool.bottom },
    ];
    const frames = windowSeconds * STEPS_PER_SECOND;
    measuring = true;
    if (onStart) onStart(game);
    for (let f = 0; f < frames && !ended; f++) {
        const sweep = (f / (SWEEP_SECONDS * STEPS_PER_SECOND)) % 1;
        const t = sweep < 0.5 ? sweep * 2 : 2 - sweep * 2;
        const press = f > 0 && f % (SWITCH_SECONDS * STEPS_PER_SECOND) === 0;
        players.forEach((player, k) => {
            const pos = player.torso.GetPosition();
            const target = targets[k];
            const tx = target.ax + (target.bx - target.ax) * t;
            const ty = target.ay + (target.by - target.ay) * t;
            const len = Math.hypot(tx - pos.get_x(), ty - pos.get_y()) || 1;
            game.setPad(k, {
                buttons: press ? [BUTTON_FIRE, BUTTON_NEXT_WEAPON] : [BUTTON_FIRE],
                axes: [0, 0, (tx - pos.get_x()) / len, -(ty - pos.get_y()) / len],
            });
        });
        game.frame();
        if (onFrame) onFrame(game, f);
    }
    measuring = false;
    result.cost.scene = hr() - sceneStart;
    result.cost.total = hr() - wall0;
    result.seconds = result.steps / STEPS_PER_SECOND;
    result.roundEnded = ended || match.round !== round0 || match.state !== "playing";
    result.weapons = WEAPONS.map((w) => w.name);
    return result;
}
