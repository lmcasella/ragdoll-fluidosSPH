import {
    RagImporter,
    stepWorld,
    STEP_SETTINGS,
} from "./lib/ragimporter.js";
import { ActiveRagdoll } from "./src/ragdoll/ActiveRagdoll.js";
import { Input } from "./src/input/Input.js";
import { Bot, botConfig } from "./src/ai/bot.js";
import { Menu, ControlsScreen, HelpScreen, PAUSE } from "./src/ui/menu.js";
import { Camera } from "./src/render/camera.js";
import { createScene } from "./src/render/scene.js";
import { LevelView } from "./src/render/levelView.js";
import { BackgroundView } from "./src/render/backgroundView.js";
import { createLiquidFilter, updateLiquidFilter } from "./src/render/liquidFilter.js";
import { LEVEL, buildLevel } from "./src/level/level.js";
import { OneWayPlatforms } from "./src/level/platforms.js";
import { BreakablePlatforms } from "./src/level/breakable.js";
import { Flood, RisingFlood, supportHeight } from "./src/water/flood.js";
import { CLIMB, Climb, StagePrizes } from "./src/level/climb.js";
import { ShallowWater, WATER_FIELD } from "./src/water/water.js";
import { Immersion } from "./src/water/immersion.js";
import { Evaporation } from "./src/fluids/evaporation.js";
import { Corrosion } from "./src/fluids/corrosion.js";
import { Thermal, THERMAL } from "./src/fluids/thermal.js";
import { Viscosity } from "./src/fluids/viscosity.js";
import { Adhesion } from "./src/fluids/adhesion.js";
import { Buoyancy } from "./src/water/buoyancy.js";
import { Debug } from "./src/core/debug.js";
import { consumeFixedSteps, MAX_STEPS_PER_FRAME } from "./src/core/fixedStep.js";
import { MATERIALS } from "./src/fluids/materials.js";
import { Match, GO_TIME } from "./src/match/round.js";
import { Hud } from "./src/ui/hud.js";
import { Screens, versionLabel } from "./src/ui/screens.js";
import { Melee, MELEE } from "./src/combat/melee.js";
import { getRaycaster } from "./src/core/raycast.js";
import { vectorLength, normalize } from "./src/core/math/vector2.js";
import { boundsOfBodies } from "./src/core/engine/box2d.js";
import { GRAVITY } from "./src/core/physics/constants.js";
import { withReversedClip, withoutJointTracks } from "./src/ragdoll/clips.js";
import { DamageSystem } from "./src/combat/damage.js";
import { createParticleSystem } from "./src/fluids/particles.js";
import { ParticleStore, SINK } from "./src/fluids/particleStore.js";
import { WallContact } from "./src/fluids/wallContact.js";
import { Pickups } from "./src/level/pickups.js";
import { CRATE, Crates } from "./src/level/crates.js";
import { GameAudio } from "./src/audio/audio.js";
import {
    FLUID,
    WEAPONS,
    SHOT_SYSTEM,
    ShotEmitter,
    cycleWeapon,
    equipLoadout,
    LOADOUT,
    wheelSector,
    wheelWeapon,
} from "./src/combat/weapons.js";
import { buildRenderItems } from "./src/ragdoll/renderItems.js";
import { drawParticles, lookOf, SHOT_DRAW } from "./src/render/fluidDraw.js";
import { collectSurfaces } from "./src/render/fluidSurfaces.js";
import { FluidLayers } from "./src/render/fluidLayers.js";
import { addRobotLight, buildKindSources, createLightSet, gatherLights, unitRgbOfBytes } from "./src/render/lighting.js";
import { createRobotFilter, setRobotFilterLights, updateRobotFilter } from "./src/render/robotFilter.js";
import { WaterView } from "./src/render/waterView.js";
import { PickupView } from "./src/render/pickupView.js";
import { CrateView } from "./src/render/crateView.js";
import { AimLaserView } from "./src/render/aimLaserView.js";
import { HitEffectsView } from "./src/render/hitEffectsView.js";
import { WeaponWheelView, WHEEL_RADII } from "./src/render/weaponWheelView.js";
import { DebugView } from "./src/render/debugView.js";
import { DebugPanel } from "./src/ui/debugPanel.js";
import { BenchPanel } from "./src/ui/benchPanel.js";
import { BENCH } from "./src/bench/benchScript.js";
import { BenchRunner } from "./src/bench/benchRunner.js";
import { BenchParticles } from "./src/bench/benchParticles.js";
import { GpuTimer } from "./src/bench/gpuTimer.js";
import { wordIndexOf } from "./src/core/heap.js";
import { RagdollPainter } from "./src/ragdoll/RagdollPainter.js";
import { ROBOT_ART_LAYERS, ROBOT_ART_PIECES, robotArtPath } from "./src/ragdoll/robotArt.js";
import { parseHexColor } from "./src/ragdoll/ragdollTint.js";

RagImporter.configure({ Box2D, PIXI });

const LASER_RANGE = 25;
const PLAYER_COLORS = ["#5468ff", "#f23a2e"];
const PLAYER_TINTS = PLAYER_COLORS.map(parseHexColor);
const PLAYER_LIGHT_COLORS = PLAYER_TINTS.map(unitRgbOfBytes);

async function loadRag(url, prepare = (json) => json) {
    const response = await fetch(url);
    const json = prepare(await response.json());
    return { json, def: RagImporter.parse(json) };
}

const AIM_JOINTS = ["back_shoulder", "front_shoulder"];
const AIM_HOLD = ["back_elbow", "front_elbow"];
const AIM_FREE_CLIPS = ["jump_start", "air", "air_forward", "air_backward", "fall_high", "idle", "aim"];
const robotRag = await loadRag("./assets/robot.rag.json", (json) =>
    withReversedClip(
        withReversedClip(
            withoutJointTracks(json, AIM_FREE_CLIPS, [...AIM_JOINTS, ...AIM_HOLD]),
            "walk",
            "walk_back",
        ),
        "roll",
        "roll_back",
    ),
);
const ROBOT_RIG = {
    rootBody: robotRag.json.ragdoll.rootBody,
    aimJoints: AIM_JOINTS,
    aimHold: AIM_HOLD,
    aimOffset: 0,
    clips: {
        idle: "idle",
        aim: "aim",
        walk: "walk",
        walkBack: "walk_back",
        jumpStart: "jump_start",
        air: "air",
        airForward: "air_forward",
        airBackward: "air_backward",
        fallHigh: "fall_high",
        block: "block",
        roll: "roll",
        rollBack: "roll_back",
        combo1: "punch_combo1",
        combo2: "punch_combo2",
        combo3: "punch_combo3",
        airPunch: "air_punch",
        airKick: "air_kick",
        reactSimple: "melee_react_simple",
        reactStumble: "melee_react_stumble",
        landHurt: "land_hurt",
        getupFront: "getup_front",
        getupBack: "getup_back",
        dead: "dead",
    },
    clipLengths: Object.fromEntries(robotRag.json.clips.map((clip) => [clip.key, clip.length])),
    arms: ["b_3", "b_13", "b_14", "b_15"],
    melee: MELEE,
    feet: ["b_4", "b_16"],
    gun: { body: "b_3", muzzle: [0.33, 0.035] },
    damage: { b_1: 1.5, b_2: 1, b_6: 1 },
    defaultDamage: 0.75,
};

/** Px por metro de la geometría dibujada: la del JSON del robot, la única escala del juego (`docs/design/07-sph.md` §7.4). */
const PIXELS_PER_METER = robotRag.json.units.pixelsPerMeter;

/**
 * Carga las texturas del arte del robot, una por capa de cada pieza de `ROBOT_ART`; las vistas las reciben ya cargadas.
 * @returns {Promise<Object<string, {paint: PIXI.Texture, trim: PIXI.Texture}>>}
 */
async function loadRobotTextures() {
    const entries = await Promise.all(
        ROBOT_ART_PIECES.map(async (piece) => {
            const layers = await Promise.all(
                ROBOT_ART_LAYERS.map(async (layer) => [layer, await PIXI.Assets.load(robotArtPath(piece, layer))]),
            );
            return [piece, Object.fromEntries(layers)];
        }),
    );
    return Object.fromEntries(entries);
}
const robotTextures = await loadRobotTextures();

const gameContainer = document.getElementById("gameContainer");
const scene = await createScene({ container: gameContainer, width: window.innerWidth, height: window.innerHeight });
const debugPanel = new DebugPanel(document, gameContainer);
const fluidLayers = new FluidLayers({
    renderer: scene.application.renderer,
    parent: scene.fluidParent,
    createFilter: (kind) => createLiquidFilter(lookOf(kind)),
    updateFilter: updateLiquidFilter,
    pixelsPerMeter: PIXELS_PER_METER,
});
const backgroundView = new BackgroundView({ parent: scene.backgroundLayer, pixelsPerMeter: PIXELS_PER_METER });
const levelView = new LevelView({ parent: scene.levelLayer, pixelsPerMeter: PIXELS_PER_METER });
const water = new ShallowWater();
const waterView = new WaterView({
    parent: scene.waterLayer,
    pixelsPerMeter: PIXELS_PER_METER,
    look: lookOf(FLUID.WATER),
    draw: WATER_FIELD.draw,
    water,
});

const camera = new Camera(LEVEL.bounds, PIXELS_PER_METER);
const hud = new Hud(document, gameContainer);
const screens = new Screens(document, gameContainer);
fetch("version.json", { cache: "no-store" })
    .then((res) => (res.ok ? res.json() : null))
    .catch(() => null)
    .then((data) => {
        screens.menu.ver.textContent = versionLabel(data);
    });

function resize() {
    scene.resize(window.innerWidth, window.innerHeight);
    camera.resize(window.innerWidth, window.innerHeight);
}
resize();
window.addEventListener("resize", resize);

const gravity = new Box2D.b2Vec2(0, -GRAVITY);
const world = new Box2D.b2World(gravity);
Box2D.destroy(gravity);
const platforms = new OneWayPlatforms(world);
let classic = buildLevel(world, LEVEL, { platforms });
let climb = null;
let currentMap = "classic";
const breakable = new BreakablePlatforms(platforms);
classic.breakableFixtures.forEach(({ fixture, solid }) => breakable.add(fixture, solid));
const raycaster = getRaycaster(world);

/** Caja de trabajo de lowestPoint: se reutiliza para no crear objetos. */
const probeBounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

function lowestPoint(rag) {
    return boundsOfBodies(rag.bodies, probeBounds).minY;
}

/**
 * Altura de aparición: en Clásico un rayo vertical desde el techo encuentra la superficie en x; en Infinito
 * el tope (`top`) de la plataforma sorteada ya es el dato.
 */
function spawnOnGround(def, x, top) {
    const hit = top === undefined ? raycaster.cast(x, LEVEL.bounds.maxY, x, LEVEL.bounds.minY) : null;
    const surface = top ?? (hit ? hit.y : LEVEL.bounds.minY);
    const probe = def.spawn(world, { x, y: 0 });
    const lift = surface + 0.02 - lowestPoint(probe);
    probe.destroy();
    return lift;
}

function spawnRobotRaw(x, y, flipX) {
    const robot = new ActiveRagdoll(
        robotRag.def,
        world,
        x,
        y,
        ROBOT_RIG,
        flipX,
        scene.ragdollLayer,
    );
    robot.renderItems = buildRenderItems(
        robot.rag,
        robotRag.json,
        flipX,
    );
    robot.painter = new RagdollPainter({
        player: robot,
        json: robotRag.json,
        textures: robotTextures,
        effectsParent: scene.effectsLayer,
    });
    return robot;
}

/** Destruye un robot: lo que dibuja fuera de `rag.view` y después la instancia, que se lleva su vista con las figuras. */
function destroyRobot(robot) {
    robot.painter.destroy();
    robot.destroy();
}

function spawnRobot(spawn) {
    const robot = spawnRobotRaw(
        spawn.x,
        spawnOnGround(robotRag.def, spawn.x, spawn.y),
        spawn.flipX,
    );
    robot.knocksOut = climb !== null;
    equipLoadout(robot, climb ? CLIMB.loadout : LOADOUT);
    return robot;
}

const players = LEVEL.spawns.map(spawnRobot);
const instances = players.map((p) => p.rag);
players.forEach((p, k) => platforms.addOwner(k, p.rag.bodies.values()));
const input = new Input(players.length);
let inputs = input.poll();
let controls = inputs;
const jumpPending = players.map(() => false);
const bots = new Map();
/** Verdadero con `?bench=1`: el modo de medición (`src/bench/`) corre solo una serie de escenas; sin él no se crea nada. */
const benchMode = new URLSearchParams(globalThis.location?.search ?? "").get("bench") === "1";
const botParam = new URLSearchParams(globalThis.location?.search ?? "").get("bot");
const urlBots = botParam === null ? null : botParam.split(",").map((n) => Number(n) - 1).filter((k) => k >= 0 && k < players.length);
const menu = new Menu({ storage: menuStorage() });
const asignacion = new ControlsScreen({ storage: menuStorage() });
const ayuda = new HelpScreen();
const pausa = new Menu({ table: PAUSE });
let pantalla = "menu";
let pausaPantalla = "menu";
let uiNow = 0;
let uiDevice = "pad";
let uiScreen = null;
let knownDevices = null;

/** Pantalla de interfaz visible: `menu`, `controles`, `asignacion`, `pausa`, `pausa-controles`, `final` (fin de partida) o `null` durante la partida. */
const pantallaActual = () => {
    if (match.state === "title") return pantalla;
    if (match.state === "matchOver") return "final";
    if (match.state === "paused") return pausaPantalla === "menu" ? "pausa" : "pausa-controles";
    return null;
};

/** `localStorage`, o `null` si el navegador lo bloquea (acceder a la propiedad puede lanzar). */
function menuStorage() {
    try {
        return globalThis.localStorage ?? null;
    } catch {
        return null;
    }
}

/** Quita todos los bots y devuelve sus jugadores a sus dispositivos. */
function quitarBots() {
    bots.clear();
    players.forEach((_, k) => input.setVirtualPad(k, null));
}

/** Semilla de los bots: `?seed=N` en la URL la fija para reproducir una partida; si no, es aleatoria. El modo de medición usa `BENCH.seed`. */
const botSeed = benchMode ? BENCH.seed : Number.parseInt(new URLSearchParams(globalThis.location?.search ?? "").get("seed") ?? "", 10);

/** Deja un bot en cada jugador de `ks`, con el preset de su dificultad. */
function ponerBots(ks, difficulty) {
    quitarBots();
    const config = botConfig(difficulty);
    for (const k of ks) {
        const seed = Number.isFinite(botSeed) ? botSeed + k : (Math.random() * 2 ** 32) >>> 0;
        bots.set(k, new Bot({ k, world, config, seed, level: climb ? climb.level : LEVEL }));
    }
}

const particleSystem = createParticleSystem(world, SHOT_SYSTEM);

const store = new ParticleStore(particleSystem, SHOT_SYSTEM);
const lightSet = createLightSet();
const robotFilter = createRobotFilter();
scene.ragdollLayer.filters = [robotFilter];
const lightSourceOfKind = buildKindSources({ lava: FLUID.LAVA, acid: FLUID.ACID });
const lightView = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
const lightScreenOrigin = { originX: 0, originY: 0, pixelsPerMeter: 1, viewHeight: 1 };
const liquidFrame = { time: 0, originX: 0, originY: 0, pixelsPerMeter: 1 };
const lightMaterialAt = (index) => store.kind[store.slotAt(index)];
const wallContact = new WallContact(particleSystem, store, SHOT_SYSTEM);
instances.push(wallContact);

const damage = new DamageSystem(world, store);
damage.killSensors = classic.killSensors;
damage.register(players);
const emitter = new ShotEmitter(store, damage, WEAPONS, raycaster);
const melee = new Melee(raycaster, damage);
const match = new Match(players.length);
let flood = new Flood(store, water, LEVEL, Number.isFinite(botSeed) ? botSeed : null);
const immersion = new Immersion(particleSystem, store, water);
const evaporation = new Evaporation(particleSystem, store);
const thermal = new Thermal(particleSystem, store, water, immersion, { evaporation, ...THERMAL.game });
const viscosity = new Viscosity(particleSystem, store, thermal);
const buoyancy = new Buoyancy(water, MATERIALS, { splash: { store, seed: Number.isFinite(botSeed) ? botSeed : null } });
buoyancy.register(players);
const debug = new Debug();
const overlayOptions = { parent: scene.overlayLayer, pixelsPerMeter: PIXELS_PER_METER };
const pickupView = new PickupView(overlayOptions);
const crateView = new CrateView({
    levelParent: scene.levelLayer,
    ...overlayOptions,
    weapons: WEAPONS,
    crateSide: CRATE.side,
    pieceSize: { width: CRATE.side * CRATE.pieceSize.width, height: CRATE.side * CRATE.pieceSize.height },
    registerOccluder: (filter) => scene.addOccluderFilters(filter),
});
scene.addOccluderFilters(levelView.surfaceFilter);
const aimLaserView = new AimLaserView({ ...overlayOptions, playerCount: players.length });
const hitEffectsView = new HitEffectsView(overlayOptions);
const debugView = new DebugView({ ...overlayOptions, debug });
const weaponWheelView = new WeaponWheelView({ ...overlayOptions, playerCount: players.length });
const adhesion = new Adhesion(particleSystem, store, wallContact);
instances.push(adhesion);
const stagePrizes = new StagePrizes();

/** Superficie del agua bajo la cual se ahoga un robot en Infinito: la del campo donde hay agua, ninguna donde no. */
const drownSurface = (x) => (water.depthAt(x) > water.config.hDry ? water.surfaceAt(x) : -Infinity);

/** Verdadero si el punto del mundo (m) está donde una caja ya no vuelve al juego: bajo el agua que se hunde del Infinito, o fuera de los límites del mapa clásico. */
function crateLost(x, y) {
    if (climb) return y < flood.level - CLIMB.flood.sinkBelow;
    const { bounds } = LEVEL;
    const margin = CRATE.lostMargin;
    return x < bounds.minX - margin || x > bounds.maxX + margin || y < bounds.minY - margin;
}

let pickups = null;
let crates = null;

/** Crea los puntos de aparición `points` y, si el mapa `mapData` usa cajas, las conecta a golpes, choques y partículas. Quien llama antes libera las anteriores. */
function buildPickups(points, mapData) {
    pickups = new Pickups(world, damage, points);
    crates = new Crates({
        world,
        store,
        pickups,
        surfaceAt: drownSurface,
        isLost: crateLost,
        enabled: mapData.crates === true,
        seed: Number.isFinite(botSeed) ? botSeed : null,
    });
    melee.crates = crates;
    platforms.setPieceFilter((bodyPointer) => crates.isPiece(bodyPointer));
    platforms.setCrateFilter((bodyPointer) => crates.isCrate(bodyPointer));
}

/** Libera las cajas y los puntos de aparición vivos. */
function disposePickups() {
    crates.dispose();
    pickups.dispose();
}
buildPickups(LEVEL.pickups, LEVEL);

/** Semilla del mapa infinito: `?seed=N` la fija para todas las rondas; si no, es nueva en cada ronda. */
const mapSeed = () => (Number.isFinite(botSeed) ? botSeed : (Math.random() * 2 ** 32) >>> 0);

const lastSupport = new WeakMap();

/** Altura de apoyo (m, mundo) más baja entre los robots vivos (un salto no cuenta, una caída sí); -Infinity sin robots vivos. */
function lowestAlive() {
    let low = Infinity;
    for (const player of players) {
        if (player.dead) continue;
        const y = supportHeight(player.grounded, player.lowestPoint(), lastSupport.get(player));
        lastSupport.set(player, y);
        if (y < low) low = y;
    }
    return low === Infinity ? -Infinity : low;
}

/** Terreno de densidad del mapa en juego (`docs/design/05-escenario.md` §5.5). */
const currentTerrain = () => (climb ? climb.terrain : classic.terrain);

const corrosion = new Corrosion({ system: particleSystem, store, terrain: currentTerrain });
damage.bodyContactHook = (bodyPointer, index) => {
    corrosion.enqueue(bodyPointer, index);
    crates.enqueueParticle(bodyPointer, index);
};
damage.impactHook = (bodyPointerA, bodyPointerB, speed) => crates.enqueueImpact(bodyPointerA, bodyPointerB, speed);

/** Pasa el mundo al mapa `map` ("classic" o "infinite") si no es el actual; llamar fuera de `stepWorld`. */
function aplicarMapa(map) {
    if (map === currentMap) return;
    flood.dispose();
    if (map === "infinite") {
        classic.dispose();
        breakable.clear();
        world.DestroyBody(classic.ground);
        damage.killSensors.clear();
        disposePickups();
        buildPickups([], CLIMB);
        water.setStart({ surface: CLIMB.flood.surface });
        flood = new RisingFlood(water, LEVEL, CLIMB, () => climb.offsetY, lowestAlive);
        climb = new Climb({ world, platforms, pickups, breakable });
        damage.drownSurface = drownSurface;
    } else {
        climb.dispose();
        climb = null;
        breakable.clear();
        disposePickups();
        classic = buildLevel(world, LEVEL, { platforms });
        classic.breakableFixtures.forEach(({ fixture, solid }) => breakable.add(fixture, solid));
        damage.killSensors = classic.killSensors;
        buildPickups(LEVEL.pickups, LEVEL);
        water.setStart(null);
        flood = new Flood(store, water, LEVEL, Number.isFinite(botSeed) ? botSeed : null);
        damage.drownSurface = null;
        camera.setBounds(LEVEL.bounds);
    }
    currentMap = map;
    wallContact.invalidate();
}
const audio = new GameAudio();
audio.load();
window.addEventListener("keydown", () => audio.unlock());
window.addEventListener("pointerdown", () => audio.unlock());
const muertos = new WeakSet();
const STEP_MIN_SPEED = 1;
let lastMatchState = match.state;

/**
 * Pista de música según el estado de la partida; en la cuenta regresiva y el cartel de fin de ronda sigue la actual (`null`).
 * En Infinito el agua sube desde los primeros segundos: suena `suddenDeath` toda la ronda, sin cambio de pista (#224).
 */
function musicaActual() {
    if (match.state === "title" || match.state === "matchOver") return "mainMenu";
    if (match.state === "roundOver" || match.state === "countdown" || match.state === "paused") return null;
    return climb || flood.active ? "suddenDeath" : "combat";
}

/** Traduce a sonido los eventos ya resueltos del frame; se llama después de todos los pasos, nunca desde un callback de Box2D. */
/** Estado de input sin intención de control: los robots quedan quietos fuera de `controlsActive`; solo la mira sigue. */
function neutro(s) {
    return {
        left: false, right: false, up: false, down: false, jump: false, jumpHeld: false, strongDown: false, drop: false, roll: false,
        action: false, start: false, fire: false, grapple: false, block: false, punch: false, kick: false,
        weapon: null, weaponStep: 0, aim: s.aim, pointer: s.pointer, wheel: null, wheelPick: null,
    };
}

function sonarEventos(now) {
    for (const e of melee.events) {
        if (e.kind === "block" || e.kind === "blockBreak") {
            audio.play(e.kind, e.victim, now);
        } else {
            audio.play("hit", e.victim, now);
            audio.play("hurt", e.victim, now);
        }
    }
    melee.events.length = 0;
    for (const e of pickups.events) audio.play(e.kind === "repair" ? "repair" : "pickup", e.weapon ?? 0, now);
    pickups.events.length = 0;
    for (const { player, index } of damage.footfalls) {
        const walking = player.clipState === "walk" || player.clipState === "walkBack";
        if (player.dead || !player.grounded || !walking) continue;
        if (Math.abs(player.torso.GetLinearVelocity().get_x()) > STEP_MIN_SPEED) audio.play("step", index, now);
    }
    damage.footfalls.length = 0;
    players.forEach((player, k) => {
        if (player.landed) audio.play("land", k, now);
        player.landed = false;
        if (player.dead && !muertos.has(player)) {
            muertos.add(player);
            audio.play("death", k, now);
        }
    });
}

/**
 * Sonido de la asignación de controles de este frame: `antes` es `ControlsScreen.view.devices` por `id` antes de
 * aplicar las intenciones y `salida` lo que devolvió `update`. Sumar, quitar y mover una ficha suenan distinto,
 * y empujar contra la pared suena como lo bloqueado.
 */
function sonarAsignacion(antes, salida) {
    const ahora = asignacion.view.devices;
    let evento = null;
    for (const d of ahora) {
        const previo = antes.get(d.id);
        if (!previo) continue;
        if (d.joined && !previo.joined) evento = "join";
        else if (d.column !== previo.column) evento ??= d.column === 1 ? "leave" : "move";
    }
    if (!evento) {
        const empujo = input.devices.some((d) => d.x && asignacion.ids.includes(d.id));
        if (empujo) evento = "denied";
    }
    if (!evento && salida === "back") evento = "back";
    if (evento) audio.playUi(evento, uiNow);
}

let lastUiState = match.state;
/** Verdadero en el frame en que suena jugar: el "3" de la cuenta no suena encima. */
let cuentaMuda = false;

/** Sonido de las transiciones de `Match`: empezar y revancha suenan como jugar, y volver al menú desde el fin de partida como volver. Al entrar en `matchOver` o `title` deja enteras las plataformas rompibles. */
function sonarTransicion() {
    if (match.state === lastUiState) return;
    if (match.state === "matchOver" || match.state === "title") breakable.reset();
    if (match.state === "countdown" && (lastUiState === "title" || lastUiState === "matchOver")) {
        audio.playUi("play", uiNow);
        cuentaMuda = true;
    } else if (match.state === "title" && (lastUiState === "matchOver" || lastUiState === "paused")) audio.playUi("back", uiNow);
    else if (match.state === "paused" || lastUiState === "paused") audio.playUi("pause", uiNow);
    lastUiState = match.state;
}

/** Sonido de conectar y desconectar gamepads: compara los dispositivos de este frame con los del anterior. */
function sonarDispositivos() {
    const ids = new Set(input.devices.map((d) => d.id));
    if (knownDevices) {
        if ([...ids].some((id) => !knownDevices.has(id))) audio.playUi("join", uiNow);
        else if ([...knownDevices].some((id) => !ids.has(id))) audio.playUi("leave", uiNow);
    }
    knownDevices = ids;
}

// Nueva ronda: se destruyen robots y disparos y se vuelve a aparecer en los puntos de inicio
function reiniciarRonda() {
    if (climb) {
        climb.reset(mapSeed());
        bots.forEach((bot) => bot.setNav(climb.level));
    } else {
        classic.terrain.restore();
    }
    corrosion.reset();
    players.forEach((player, k) => {
        destroyRobot(player);
        players[k] = spawnRobot(climb ? climb.spawns[k] : LEVEL.spawns[k]);
        instances[k] = players[k].rag;
        platforms.removeOwner(k);
        platforms.addOwner(k, players[k].rag.bodies.values());
    });
    wallContact.invalidate();
    damage.register(players);
    buoyancy.register(players);
    buoyancy.reset();
    stagePrizes.reset();
    flood.reset();
    bots.forEach((bot) => bot.reset());
    immersion.reset();
    evaporation.reset();
    thermal.reset();
    viscosity.reset();
    pickups.reset();
    breakable.reset();
    emitter.reset();
    debug.resetVolume();
    melee.reset();
    damage.resetShots();
    store.reset();
    accumulator = 0;
    firstFrame = true;
}

/**
 * Arranca la partida con la elección actual del menú y la asignación de controles: los jugadores sin
 * dispositivo (o los de `?bot=`) los maneja el bot con la dificultad elegida; marcador en cero y ronda nueva.
 */
function arrancarPartida() {
    aplicarMapa(menu.choice.map);
    input.setAssignment(asignacion.assignment);
    ponerBots(urlBots ?? asignacion.bots, menu.choice.difficulty);
    match.begin();
    reiniciarRonda();
}

// Dirección de mira por jugador: stick derecho (se conserva al soltarlo), si no mouse (J1,
// solo si se movió después del último uso del stick), si no teclado (hacia donde se camina;
// abajo inclina 45°)
/**
 * Dirección de la rueda (`wheel` o `wheelPick`) en metros, Y arriba. Con `pointer` (mouse de J1) es el
 * mouse respecto del torso, y (0, 0) dentro del radio interno de la rueda.
 */
function direccionRueda(dir, player) {
    if (!dir.pointer) return dir;
    const pos = player.torso.GetPosition();
    const m = camera.toWorld(dir.pointer.x, dir.pointer.y);
    const dx = m.x - pos.get_x();
    const dy = m.y - pos.get_y();
    return vectorLength(dx, dy) < WHEEL_RADII.inner ? { x: 0, y: 0 } : { x: dx, y: dy };
}

function actualizarMira(player, state, k, now) {
    const pos = player.torso.GetPosition();
    const x = pos.get_x();
    const y = pos.get_y();
    if (state.wheel) {
        player.aimDir ??= { x: player.flipX ? -1 : 1, y: 0 };
    } else if (state.aim) {
        const len = vectorLength(state.aim.x, state.aim.y);
        player.aimDir = { x: state.aim.x / len, y: state.aim.y / len };
    } else if (state.pointer) {
        const m = camera.toWorld(state.pointer.x, state.pointer.y);
        player.aimDir = normalize(m.x - x, m.y - y, { x: 0, y: 0 });
    } else if (state.left || state.right || state.down) {
        const dx = state.left && !state.right ? -1 : state.right && !state.left ? 1 : player.flipX ? -1 : 1;
        player.aimDir = state.down
            ? { x: dx * Math.SQRT1_2, y: -Math.SQRT1_2 }
            : { x: dx, y: 0 };
    }
    player.aimDir ??= { x: player.flipX ? -1 : 1, y: 0 };
    player.aim(x + player.aimDir.x * 5, y + player.aimDir.y * 5, now);
}

// Gira al robot volviendo a generarlo espejado; conserva posición, velocidades y estado
function girar(k, wantsFlipX) {
    const player = players[k];
    const torsoPos = player.torso.GetPosition();
    const velocidades = new Map();
    for (const [id, body] of player.rag.bodies.entries()) {
        const v = body.GetLinearVelocity();
        velocidades.set(id, { x: v.get_x(), y: v.get_y() });
    }

    const rootBodyJson = robotRag.json.bodies.find(
        (b) => b.id === robotRag.json.ragdoll.rootBody,
    );
    const mirror = wantsFlipX ? -1 : 1;
    const baseX = torsoPos.get_x() - rootBodyJson.position[0] * mirror;
    const baseY = torsoPos.get_y() - rootBodyJson.position[1];

    destroyRobot(player);
    const nuevo = spawnRobotRaw(baseX, baseY, wantsFlipX);

    const tempVec = new Box2D.b2Vec2(0, 0);
    for (const [id, body] of nuevo.rag.bodies.entries()) {
        const vel = velocidades.get(id);
        if (vel) {
            tempVec.set_x(vel.x);
            tempVec.set_y(vel.y);
            body.SetLinearVelocity(tempVec);
        }
    }
    Box2D.destroy(tempVec);

    nuevo.copyStateFrom(player);
    players[k] = nuevo;
    instances[k] = nuevo.rag;
    platforms.addOwner(k, nuevo.rag.bodies.values());
    wallContact.invalidate();
    damage.register(players);
    buoyancy.register(players);
}

function laserDe(player) {
    if (player.dead || player.weapon === null) return null;
    const m = player.muzzle();
    const x2 = m.x + m.dx * LASER_RANGE;
    const y2 = m.y + m.dy * LASER_RANGE;
    const hit = raycaster.cast(m.x, m.y, x2, y2, player.ownBodies);
    return hit
        ? { x1: m.x, y1: m.y, x2: hit.x, y2: hit.y, hit: true }
        : { x1: m.x, y1: m.y, x2, y2, hit: false };
}

/**
 * Destruye las partículas que salieron del mundo. Las que caen al agua del nivel no se borran acá:
 * Immersion absorbe las miscibles y frena las demás. Ninguna otra desaparece por edad ni por tope.
 */
function limpiarParticulas() {
    const count = particleSystem.GetParticleCount();
    const pos = Box2D.getPointer(particleSystem.GetPositionBuffer()) >> 2;
    const { minX, maxX } = LEVEL.bounds;
    const minY = climb ? flood.floor : LEVEL.bounds.minY;
    for (let i = 0; i < count; i++) {
        const slot = store.slotAt(i);
        if (slot < 0 || store.alive[slot] === 0) continue;
        const x = Box2D.HEAPF32[pos + i * 2];
        const y = Box2D.HEAPF32[pos + i * 2 + 1];
        if (y < minY - 1 || x < minX - 1 || x > maxX + 1) store.destroy(i, SINK.OUT);
    }
}

const wetSurface = (x) =>
    flood.active && water.depthAt(x) > water.config.hDry ? water.surfaceAt(x) : -Infinity;

// Reloj de simulación (s): avanza con el dt del frame por la escala de tiempo. Lo usan los disparos, el daño
// y los efectos, así una pestaña oculta no vence los charcos y la cámara lenta los alarga igual que a la física.
let simTime = 0;
let accumulator = 0;
let stepsLastFrame = 0;
let lastTime = performance.now();
let firstFrame = true;
let debugSteps = 0;
let debugSubsteps = 0;
let debugCfl = 1;
const FLUID_NAMES = Object.fromEntries(Object.entries(FLUID).map(([name, id]) => [id, name]));
const pickupViewData = new WeakMap();
const pickupViewPoints = [];

/**
 * Datos planos de un punto de aparición para `PickupView`: posición, estado, y la clave (`FLUID_NAMES`) y el color del líquido
 * de su arma. Hay un objeto por punto, estable entre frames, porque la vista reconoce el punto de cada entrada por identidad.
 */
function pickupViewPoint(point) {
    let flat = pickupViewData.get(point);
    if (!flat) {
        const weapon = WEAPONS.find((candidate) => candidate.id === point.weapon);
        flat = { x: 0, y: 0, kind: point.kind, material: FLUID_NAMES[point.weapon] ?? null, color: weapon?.color ?? null, active: false };
        pickupViewData.set(point, flat);
    }
    flat.x = point.x;
    flat.y = point.y;
    flat.active = point.active;
    return flat;
}

/** Datos planos de este frame para `debug.frame` (solo con el monitor encendido). */
function datosDebug(frameDt) {
    const count = particleSystem.GetParticleCount();
    const particles = {};
    for (const name of Object.keys(FLUID)) particles[name] = 0;
    for (let i = 0; i < count; i++) {
        const slot = store.slotAt(i);
        if (slot < 0 || store.alive[slot] === 0) continue;
        const name = FLUID_NAMES[store.kind[slot]] ?? "OTRO";
        particles[name] = (particles[name] ?? 0) + 1;
    }
    const terrain = currentTerrain();
    const { steps, substeps } = water.stats;
    if (steps > debugSteps) debugCfl = (substeps - debugSubsteps) / (steps - debugSteps);
    debugSteps = steps;
    debugSubsteps = substeps;
    return {
        fps: 1 / Math.max(frameDt, 1e-6),
        ms: debug.laps,
        particles,
        contacts: wallContact.bodyContacts()?.count ?? 0,
        cflSubsteps: debugCfl,
        volume: { total: water.volume() },
        terrain: { ...terrain.counts(), rebuilds: terrain.lastRebuilds, rebuildMs: terrain.lastRebuildMs },
        bots: [...bots].map(([k, bot]) => {
            const pos = players[k].torso.GetPosition();
            return { k, from: { x: pos.get_x(), y: pos.get_y() }, ...bot.debugState };
        }),
    };
}

/** Referencias del heap para los puntos del debug (`DebugView.drawPoints`); solo se arman con los puntos encendidos. */
function debugPointRefs() {
    return {
        heap: Box2D.HEAPF32,
        bytes: Box2D.HEAPU8,
        positionIndex: wordIndexOf(Box2D.getPointer(particleSystem.GetPositionBuffer())),
        color: Box2D.getPointer(particleSystem.GetColorBuffer()),
        count: particleSystem.GetParticleCount(),
        radius: particleSystem.GetRadius(),
    };
}

/** Referencias para las capas de vectores del debug (`DebugView.drawLayers`); solo se arman con alguna capa encendida. */
function debugLayerRefs() {
    return {
        particles: {
            heap: Box2D.HEAPF32,
            positionIndex: wordIndexOf(Box2D.getPointer(particleSystem.GetPositionBuffer())),
            velocityIndex: wordIndexOf(Box2D.getPointer(particleSystem.GetVelocityBuffer())),
            count: particleSystem.GetParticleCount(),
        },
        pieces: buoyancy.pieces,
        water,
        terrain: debug.layers.terreno ? debugTerrainRefs() : null,
    };
}

/** Caja visible de la cámara, en m del mundo: se reutiliza para no crear objetos por frame. */
const terrainView = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

/** Referencias de la capa del terreno (`DebugView.drawTerrain`); solo se arman con la capa encendida. */
function debugTerrainRefs() {
    const terrain = currentTerrain();
    const halfWidth = camera.viewW / (2 * camera.scale);
    const halfHeight = camera.viewH / (2 * camera.scale);
    terrainView.minX = camera.x - halfWidth;
    terrainView.maxX = camera.x + halfWidth;
    terrainView.minY = camera.y - halfHeight;
    terrainView.maxY = camera.y + halfHeight;
    return { tiles: terrain.tiles, frame: terrain.frame, offsetX: terrain.offsetX, offsetY: terrain.offsetY, view: terrainView };
}

/** Solo para las pruebas en Node (`tests/helpers/game.js`): expone el estado del juego en `globalThis.game`. */
if (globalThis.__TEST_HOOKS__) {
    globalThis.game = {
        asignacion, ayuda, pausa, screens, hud, world, platforms, breakable, players, particleSystem, water, store, stagePrizes, wallContact, damage, corrosion, emitter, match, immersion, evaporation, thermal, viscosity, buoyancy, adhesion, melee, audio, bots, input, menu, debug, debugView, debugPanel, pickupView, aimLaserView, hitEffectsView, weaponWheelView, fluidLayers, scene, levelView, waterView, camera, arrancarPartida,
        get flood() { return flood; },
        get pickups() { return pickups; },
        get crates() { return crates; },
        crateView,
        get climb() { return climb; },
        get map() { return currentMap; },
        get terrain() { return currentTerrain(); },
        get bench() { return bench; },
    };
}

/** Verdadero si algún dispositivo apretó Start (Escape en el teclado) en este frame. */
const startCualquiera = () => input.devices.some((d) => (d.kind === "keyboard" ? d.back : d.start));

/**
 * Un frame con la partida en pausa: solo corre el menú de pausa (Continuar, Controles y Menú), sin pasos de física,
 * reloj de ronda ni input de los jugadores. Start, Escape o B continúan; en Controles, B vuelve a la pausa.
 */
function simularPausa() {
    if (pausaPantalla === "controles") {
        const pestana = ayuda.tab;
        if (ayuda.update(input.menu) === "back") {
            pausaPantalla = "menu";
            audio.playUi("back", uiNow);
        } else if (ayuda.tab !== pestana) audio.playUi("tab", uiNow);
        return;
    }
    if (startCualquiera() || input.menu.back) {
        match.resume();
        sonarTransicion();
        return;
    }
    const fila = pausa.cursor;
    const salida = pausa.update(input.menu);
    if (pausa.cursor !== fila) audio.playUi("focus", uiNow);
    if (salida === "resume") match.resume();
    else if (salida === "controls") {
        audio.playUi("confirm", uiNow);
        ayuda.open();
        pausaPantalla = "controles";
    } else if (salida === "quit") {
        match.quit();
        reiniciarRonda();
        menu.reset();
        pantalla = "menu";
    }
    sonarTransicion();
}

/**
 * Avanza la partida un frame: input, rondas, pasos de física y limpieza. Con el menú de debug abierto no se llama.
 * `frameDt` es el tiempo de juego del frame, topeado a `MAX_FRAME_SECONDS`; `realFrameDt` es el tiempo real, que usa el
 * recorte de partículas por rendimiento.
 */
function simular(frameDt, enTitulo, realFrameDt) {
    if (match.state === "paused") {
        simularPausa();
        return;
    }
    inputs.forEach((s, k) => {
        const bajando = !s.roll && s.drop && match.controlsActive && !players[k].dead && platforms.drop(k);
        if (s.roll) jumpPending[k] = "roll";
        else if (!bajando && (s.jump || s.drop) && jumpPending[k] !== "roll") jumpPending[k] = "jump";
    });
    raycaster.count = 0;
    if (input.padButton) audio.unlock();

    if (enTitulo) {
        const dispositivos = input.devices.map((d) => d.id);
        if (pantalla === "asignacion") {
            asignacion.sync(dispositivos);
            const antes = new Map(asignacion.view.devices.map((d) => [d.id, d]));
            const salida = asignacion.update(input.devices);
            sonarAsignacion(antes, salida);
            if (salida === "start") {
                asignacion.save();
                arrancarPartida();
            } else if (salida === "back") pantalla = "menu";
        } else if (pantalla === "controles") {
            const pestana = ayuda.tab;
            if (ayuda.update(input.menu) === "back") {
                pantalla = "menu";
                audio.playUi("back", uiNow);
            } else if (ayuda.tab !== pestana) audio.playUi("tab", uiNow);
        } else {
            const fila = menu.cursor;
            const valores = JSON.stringify(menu.choice);
            const salida = menu.update(input.menu);
            if (menu.cursor !== fila) audio.playUi("focus", uiNow);
            if (input.menu.x && menu.table.rows[menu.cursor].values.length) {
                audio.playUi(JSON.stringify(menu.choice) === valores ? "denied" : "value", uiNow);
            }
            if (salida) audio.playUi("confirm", uiNow);
            if (salida === "controls") {
                ayuda.open();
                pantalla = "controles";
            } else if (salida === "play") {
                asignacion.open(dispositivos);
                if (urlBots) arrancarPartida();
                else pantalla = "asignacion";
            }
        }
    }
    const cualquiera = {
        start: startCualquiera(),
        action: input.devices.some((d) => (d.kind === "keyboard" ? d.start : d.a)),
    };
    if (match.state === "matchOver" && match.lockRemaining > 0 && (cualquiera.start || cualquiera.action)) {
        audio.playUi("denied", uiNow);
    }
    const entradas = [...inputs, cualquiera];
    if (match.update(players, enTitulo ? entradas.map((e) => ({ ...e, start: false })) : entradas, frameDt) === "reset") {
        reiniciarRonda();
    }
    if (!enTitulo && match.state === "title") {
        menu.reset();
        pantalla = "menu";
    }
    sonarTransicion();
    if (match.state === "paused") {
        pausa.reset();
        pausaPantalla = "menu";
        jumpPending.fill(false);
        controls = inputs.map(neutro);
        return;
    }
    controls = match.controlsActive ? inputs : inputs.map(neutro);
    if (!match.controlsActive) jumpPending.fill(false);
    if (match.state === "roundOver" && lastMatchState !== "roundOver") audio.play("roundEnd");
    lastMatchState = match.state;
    audio.playMusic(musicaActual());
    accumulator += frameDt * match.timeScale;
    const pendingSteps = consumeFixedSteps(accumulator, STEP_SETTINGS.dt, MAX_STEPS_PER_FRAME);
    accumulator = pendingSteps.accumulator;
    simTime += frameDt * match.timeScale - pendingSteps.discarded;
    const now = simTime;

    players.forEach((player, k) => {
        const state = controls[k];
        player.guard(state.block);
        actualizarMira(player, state, k, now);

        const wantsFlipX = player.aimDir.x < -0.05 ? true : player.aimDir.x > 0.05 ? false : player.flipX;
        if (!player.dead && !player.rolling(now) && !player.recovering() && player.attack === null && player.flipX !== wantsFlipX) {
            girar(k, wantsFlipX);
            actualizarMira(players[k], state, k, now);
        }
        player = players[k];

        if (state.wheelPick && state.wheelPick !== "cancel") {
            const pick = direccionRueda(state.wheelPick, player);
            const id = wheelWeapon(pick.x, pick.y, player.tanks);
            if (id) player.weapon = id;
        }
        if (state.weapon && WEAPONS[state.weapon - 1]) {
            const id = WEAPONS[state.weapon - 1].id;
            if (player.tanks.has(id)) player.weapon = id;
        }
        if (state.weaponStep) cycleWeapon(player, state.weaponStep);
        if (state.punch) player.punch(now);
        if (state.kick) player.kick(now);
        emitter.fire(
            k,
            player,
            state.fire && match.state === "playing" && !player.armsBusy,
            stepsLastFrame * STEP_SETTINGS.dt,
            now,
        );
    });

    debug.mark("control");
    stepsLastFrame = pendingSteps.steps;
    for (let stepIndex = 0; stepIndex < pendingSteps.steps; stepIndex++) {
        players.forEach((player, k) => {
            controls[k].jump = jumpPending[k] === "jump";
            controls[k].roll = jumpPending[k] === "roll";
            jumpPending[k] = false;
            player.move(controls[k], STEP_SETTINGS.dt, now);
            if (!match.hazardsActive) player.dry();
            player.updateStatus(STEP_SETTINGS.dt);
        });
        flood.step(match.roundTime, STEP_SETTINGS.dt);
        buoyancy.apply(STEP_SETTINGS.dt);
        debug.mark("flotación");
        stepWorld(world, instances);
        platforms.update(now);
        if (match.state === "playing") breakable.update(players, STEP_SETTINGS.dt, now);
        store.afterStep();
        buoyancy.releaseSplashes();
        debug.markEach(BENCH.physicsLap);
        immersion.step(STEP_SETTINGS.dt);
        debug.mark("inmersión");
        evaporation.step(STEP_SETTINGS.dt);
        debug.mark("evaporación");
        thermal.step(STEP_SETTINGS.dt);
        debug.mark("térmica");
        viscosity.step(STEP_SETTINGS.dt);
        debug.mark("viscosidad");
        water.step(STEP_SETTINGS.dt);
        debug.mark("campo");
        damage.process(
            now,
            match.hazardsActive ? wetSurface : -Infinity,
            (x) => water.conductivityAt(x),
        );
        debug.mark("daño");
        corrosion.process(STEP_SETTINGS.dt);
        debug.mark("corrosión");
        melee.resolve(players, now);
        crates.process(now);
        pickups.process(now);
        debug.mark("daño");
    }
    sonarEventos(now);
    if (climb && match.state === "playing") {
        stagePrizes.detect(players, climb.level.solids, climb.offsetY);
        for (const { k } of stagePrizes.apply(players, now)) audio.play("pickup", k, now);
    }
    limpiarParticulas();
    store.trim(realFrameDt * 1000, realFrameDt);
    debug.mark("limpieza");
}

const HEAD_BODY = "b_1";
const HEAD_RADIUS = robotRag.json.bodies.find((b) => b.id === HEAD_BODY).fixtures[0].shape.radius;
const WEAPON_ICONS = { [FLUID.WATER]: "agua", [FLUID.ACID]: "acido", [FLUID.LAVA]: "lava", [FLUID.HONEY]: "miel" };
const hudScreen = { x: 0, y: 0 };
const hudTorso = { x: 0, y: 0 };
const SCREEN_NAMES = { menu: "menu", controles: "help", asignacion: "assign" };

/** Datos planos de este frame para `hud.update` (ver `src/ui/hud.js`); la altura sobre el agua usa la misma superficie con la que `damage` decide el cortocircuito. */
function datosHud(frameDt, now) {
    const infinite = climb !== null;
    const banner = stagePrizes.banner;
    return {
        dt: frameDt,
        mode: infinite ? "infinite" : "classic",
        state: match.phase,
        round: match.round,
        winsNeeded: match.winsNeeded,
        wins: match.wins,
        roundTime: match.roundTime,
        timer: match.timer,
        lock: match.lockRemaining,
        go: match.state === "playing" && match.roundTime < GO_TIME,
        roundWinner: match.roundWinner,
        matchWinner: match.matchWinner,
        floodStart: flood.config.start,
        device: uiDevice,
        prize: infinite && banner ? { k: banner.k, left: banner.until - now } : null,
        players: players.map((player) => {
            const weapon = WEAPONS.find((w) => w.id === player.weapon);
            const head = player.rag.bodies.get(HEAD_BODY).GetPosition();
            camera.toScreen(head.get_x(), head.get_y() + HEAD_RADIUS, hudScreen);
            const torso = player.torso.GetPosition();
            camera.toScreen(torso.get_x(), torso.get_y(), hudTorso);
            let above = null;
            if (infinite) {
                const x = player.torso.GetPosition().get_x();
                const surface = drownSurface(x);
                above = damage.torsoTop(player) - (surface > -Infinity ? surface : flood.eta);
            }
            return {
                hp: player.hp,
                knockout: player.knockoutLeft(now),
                alive: !player.dead,
                weapon: weapon
                    ? { icon: WEAPON_ICONS[weapon.id], ratio: (player.tanks.get(weapon.id) ?? 0) / weapon.tank }
                    : null,
                head: { x: hudScreen.x, y: hudScreen.y },
                torso: { x: hudTorso.x, y: hudTorso.y },
                above,
            };
        }),
        gauge: infinite ? { level: flood.eta, stageHeight: CLIMB.stageHeight, offset: climb.offsetY } : null,
    };
}
/**
 * Modo de medición (`?bench=1`, `src/bench/`): arma el corredor con una fachada de lo que necesita del juego y fuerza las
 * estadísticas de `debug` para tener los tiempos por subsistema. El corredor nunca lee este archivo.
 * @returns {{runner: BenchRunner, panel: BenchPanel, gpuTimer: GpuTimer}}
 */
function createBench() {
    const glContext = scene.application.renderer.gl ?? null;
    const gpuTimer = new GpuTimer(glContext);
    const particles = new BenchParticles(store);
    let sceneSetup = null;
    const game = {
        startScene(setup) {
            sceneSetup = setup;
            aplicarMapa(setup.map);
            ponerBots(setup.bots, menu.choice.difficulty);
            match.begin();
            reiniciarRonda();
        },
        spawn: (spawn) => particles.spawn(spawn),
        keepAlive() {
            if (match.state === "matchOver") this.startScene(sceneSetup);
        },
        laps: () => debug.laps,
        stepMilliseconds: () => debug.stepLaps[BENCH.physicsLap] ?? [],
        particleCount: () => particleSystem.GetParticleCount(),
        context() {
            const terrain = currentTerrain();
            let wornCells = 0;
            for (const tile of terrain.tiles) tile.grid.forEachWornCell(() => wornCells++);
            const rendererInfo = glContext?.getExtension("WEBGL_debug_renderer_info");
            return {
                userAgent: globalThis.navigator?.userAgent ?? "desconocido",
                devicePixelRatio: window.devicePixelRatio ?? 1,
                canvas: { width: scene.application.canvas.width, height: scene.application.canvas.height },
                renderer: rendererInfo ? glContext.getParameter(rendererInfo.UNMASKED_RENDERER_WEBGL) : null,
                gpuAvailable: gpuTimer.available,
                terrain: { ...terrain.counts(), wornCells },
            };
        },
    };
    debug.stats = true;
    const panel = new BenchPanel(document, gameContainer, {
        writeText: (value) => navigator.clipboard.writeText(value),
        selectContents: (node) => {
            const range = document.createRange();
            range.selectNodeContents(node);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
        },
    });
    return { runner: new BenchRunner({ game, gpuTimer }), panel, gpuTimer };
}

const bench = benchMode ? createBench() : null;

/**
 * Tiempo máximo de juego por frame, en s: lo que simulan `MAX_STEPS_PER_FRAME` pasos. Topear el `dt` del frame acá hace
 * que la ronda, la inundación, los relojes y la física se ralenticen juntos cuando el frame se atrasa (`docs/design/09-arquitectura.md` §9.3).
 */
const MAX_FRAME_SECONDS = MAX_STEPS_PER_FRAME * STEP_SETTINGS.dt;

/** Tope del tiempo real de un frame, en s, para que una pestaña en segundo plano no dé un salto enorme al volver. */
const MAX_REAL_FRAME_SECONDS = 0.25;

function loop(nowMs) {
    const realFrameDt = Math.min((nowMs - lastTime) / 1000, MAX_REAL_FRAME_SECONDS);
    const frameDt = Math.min(realFrameDt, MAX_FRAME_SECONDS);
    lastTime = nowMs;
    uiNow = nowMs / 1000;
    const enTitulo = match.state === "title";
    if (enTitulo && bots.size) quitarBots();
    const botGame = { players, match, flood, water, pickups: pickups.points, climbing: climb !== null, offsetY: climb ? climb.offsetY : 0 };
    if (match.state !== "paused") bots.forEach((bot, k) => input.setVirtualPad(k, bot.update(botGame, simTime)));
    inputs = input.poll();
    sonarDispositivos();
    if (pantallaActual() !== uiScreen) {
        uiScreen = pantallaActual();
        uiDevice = "pad";
    }
    uiDevice = input.menu.source ?? uiDevice;
    if (input.debug && !enTitulo) {
        debug.toggleOpen();
        audio.playUi("pause", uiNow);
    }
    debug.update(input.menu);
    debug.begin();
    if (!debug.open) simular(frameDt, enTitulo, realFrameDt);
    const now = simTime;

    const points = players.map((p) => {
        const pos = p.torso.GetPosition();
        return { x: pos.get_x(), y: pos.get_y() };
    });
    if (climb) camera.setBounds(climb.cameraBounds(Math.min(...points.map((p) => p.y))));
    camera.update(points, frameDt, firstFrame);
    firstFrame = false;
    if (climb) {
        const { created, destroyed } = climb.update({
            top: camera.top,
            level: flood.level,
            reached: Math.max(...points.map((p) => p.y)),
        });
        if (destroyed > 0) wallContact.invalidate();
        if (created > 0 || destroyed > 0) bots.forEach((bot) => bot.setNav(climb.level));
    }
    const terrain = currentTerrain();
    debug.mark("dibujo");
    if (terrain.update(simTime) > 0) wallContact.invalidate();
    debug.mark("corrosión");
    const scale = camera.scale;
    const bottom = camera.y - camera.viewH / (2 * scale);

    camera.applyTo(scene.world);
    lightView.minX = camera.x - camera.viewW / (2 * scale);
    lightView.maxX = camera.x + camera.viewW / (2 * scale);
    lightView.minY = bottom;
    lightView.maxY = camera.y + camera.viewH / (2 * scale);
    gatherLights({
        positions: Box2D.HEAPF32,
        firstValue: wordIndexOf(Box2D.getPointer(particleSystem.GetPositionBuffer())),
        count: particleSystem.GetParticleCount(),
        materialAt: lightMaterialAt,
        sourceOfKind: lightSourceOfKind,
        view: lightView,
        output: lightSet,
    });
    players.forEach((player, k) => {
        if (player.dead) return;
        const head = player.rag.bodies.get(HEAD_BODY).GetPosition();
        addRobotLight(lightSet, head.get_x(), head.get_y(), PLAYER_LIGHT_COLORS[k]);
    });
    debug.mark("luces");
    lightScreenOrigin.originX = scene.world.position.x;
    lightScreenOrigin.originY = scene.world.position.y;
    lightScreenOrigin.pixelsPerMeter = scale;
    lightScreenOrigin.viewHeight = camera.viewH;
    levelView.setLights(lightSet);
    crateView.setLights(lightSet);
    updateRobotFilter(robotFilter, lightScreenOrigin);
    setRobotFilterLights(robotFilter, lightSet);
    backgroundView.setLights(lightSet, lightScreenOrigin);
    backgroundView.update({ x: camera.x, y: camera.y, zoom: camera.zoom, viewWidth: camera.viewW, viewHeight: camera.viewH });
    const offsetY = climb ? climb.offsetY : 0;
    levelView.update(climb ? climb.level : LEVEL, offsetY, now, scale, terrain.shape, scene.world.position);
    collectSurfaces(players, (climb ? climb.level : LEVEL).solids, SHOT_DRAW.snapReach, offsetY);
    debug.mark("dibujo");
    if (debug.metaballOn) drawParticles(fluidLayers, particleSystem, SHOT_DRAW, store);
    else {
        fluidLayers.begin();
        fluidLayers.end();
    }
    liquidFrame.time = now;
    liquidFrame.originX = lightScreenOrigin.originX;
    liquidFrame.originY = lightScreenOrigin.originY;
    liquidFrame.pixelsPerMeter = scale;
    fluidLayers.setFrame(liquidFrame);
    waterView.setFrame(liquidFrame);
    waterView.setLights(lightSet);
    debug.mark("fluidos");
    players.forEach((player, k) => {
        player.painter.paint(PLAYER_TINTS[k], scale, now);
    });
    waterView.draw(water, climb ? { floor: flood.floor, bottom } : null);
    pickupViewPoints.length = 0;
    for (const point of pickups.points) pickupViewPoints.push(pickupViewPoint(point));
    pickupView.update(pickupViewPoints, pickups.offsetY, now);
    crateView.update({ crates: crates.crates, pieces: crates.pieces, screenOrigin: scene.world.position, screenScale: scale });
    players.forEach((player, k) => {
        aimLaserView.draw(k, laserDe(player), PLAYER_COLORS[k], scale);
    });
    hitEffectsView.draw(melee.hits, scale, now);
    debugView.drawPoints(debug.fluidMode !== "metaball" ? debugPointRefs() : null);
    if (debug.active) debug.frame(datosDebug(realFrameDt));
    debugView.drawLayers(scale, debug.anyLayer ? debugLayerRefs() : null);
    players.forEach((player, k) => {
        const wheel = controls[k].wheel;
        const owned = WEAPONS.filter((w) => player.tanks.has(w.id));
        if (!wheel || player.dead || owned.length === 0) {
            weaponWheelView.hide(k);
            return;
        }
        const pos = player.torso.GetPosition();
        const direction = direccionRueda(wheel, player);
        weaponWheelView.show(
            k,
            pos.get_x(),
            pos.get_y(),
            owned.map((w) => ({
                name: w.name,
                color: w.color,
                fill: player.tanks.get(w.id) / w.tank,
                equipped: w.id === player.weapon,
            })),
            wheelSector(direction.x, direction.y, owned.length),
        );
    });

    hud.update(datosHud(frameDt, now));
    for (const event of hud.events) if (!(cuentaMuda && event === "count")) audio.playUi(event, uiNow);
    hud.events.length = 0;
    cuentaMuda = false;
    debugPanel.update(debug.panelLines());
    debug.mark("dibujo");
    scene.renderLightMap(lightScreenOrigin, lightSet);
    bench?.gpuTimer.begin();
    scene.render();
    bench?.gpuTimer.end();
    debug.mark("render");
    if (match.state === "title") {
        screens.update({
            screen: SCREEN_NAMES[pantalla],
            device: uiDevice,
            menu: menu.view,
            choice: menu.choice,
            helpView: ayuda.view,
            assignView: asignacion.view,
        });
    } else if (match.state === "paused") {
        screens.update({
            screen: pausaPantalla === "menu" ? "pause" : "help",
            device: uiDevice,
            pauseView: pausa.view,
            helpView: ayuda.view,
        });
    } else screens.update({ screen: null });
    if (bench) {
        bench.runner.frame(nowMs);
        bench.panel.update(bench.runner.view);
    }
    requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
