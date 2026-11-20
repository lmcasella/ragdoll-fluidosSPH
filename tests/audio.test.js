import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGame } from "./helpers/game.js";
import { BUTTON, AIM_RIGHT, startDuel } from "./helpers/duel.js";
import { createFakeAudioContext } from "./helpers/fake-audio.js";

const { GameAudio, SOUNDS, MUSIC, AUDIO } = await import("../js/audio.js");
const { LEVEL } = await import("../js/level.js");

const tick = () => new Promise((resolve) => setTimeout(resolve, 20));
const name = (url) => url.match(/\/([^/]+)\.ogg$/)[1];
const eventOf = (url) => Object.keys(SOUNDS).find((event) => SOUNDS[event].files.includes(name(url)));

async function boot(fake, { duel = null } = {}) {
    const options = { audioContext: fake.FakeAudioContext };
    const game = duel === null ? await loadGame(options) : await startDuel(duel, options);
    game.setPad(0);
    game.setPad(1);
    if (duel === null) game.frames(60);
    await tick();
    return game;
}

async function unlock(game) {
    game.emit("keydown", { code: "KeyZ", repeat: false, preventDefault() {} });
    await tick();
}

function place(game, k, x, y) {
    const player = game.state.players[k];
    const torso = player.torso.GetPosition();
    const dx = x - torso.get_x();
    const dy = y - torso.get_y();
    const v = new Box2D.b2Vec2(0, 0);
    for (const body of player.rag.bodies.values()) {
        const p = body.GetPosition();
        v.set_x(p.get_x() + dx);
        v.set_y(p.get_y() + dy);
        body.SetTransform(v, body.GetAngle());
        body.SetAwake(true);
    }
    Box2D.destroy(v);
}

test("sin AudioContext todo es no-op y el juego corre igual", async () => {
    const audio = new GameAudio(undefined);
    assert.equal(audio.context, null);
    assert.equal(audio.play("hit"), false);
    audio.playMusic("combat");
    audio.unlock();
    await audio.load();

    const game = await loadGame();
    game.setPad(0, { buttons: [BUTTON.B], axes: AIM_RIGHT });
    game.frames(30);
    assert.equal(game.state.audio.context, null);
    assert.equal(game.state.audio.play("hit"), false);
});

test("la tabla SOUNDS solo usa efectos de golpes, pasos, caídas, muertes, recogidas y fin de ronda", () => {
    const files = Object.values(SOUNDS).flatMap((row) => row.files);
    assert.ok(files.length > 0);
    assert.ok(files.every((f) => !/^(laser|explosion)/.test(f)), `archivos: ${files}`);
    assert.deepEqual(Object.keys(SOUNDS).sort(), ["block", "blockBreak", "death", "hit", "hurt", "land", "pickup", "repair", "roundEnd", "step"]);
    assert.equal(SOUNDS.step.volume, 0.4);
    assert.equal(SOUNDS.step.cooldown, 0.22);
    assert.equal(SOUNDS.hurt.cooldown, 0.3);
    assert.equal(AUDIO.music, 0.35);
    assert.equal(AUDIO.sfx, 0.8);
});

test("suspendido no suena nada; el primer keydown, pointerdown o botón de gamepad reanuda el contexto", async () => {
    for (const how of ["keydown", "pointerdown", "pad"]) {
        const fake = createFakeAudioContext();
        const game = await boot(fake);
        const [context] = fake.created;
        assert.equal(context.state, "suspended");
        assert.equal(game.state.audio.play("death", 0, 1), false);
        if (how === "pad") {
            game.setPad(0, { buttons: [BUTTON.A] });
            game.frame();
            await tick();
        } else {
            game.emit(how, { code: "KeyZ", repeat: false, preventDefault() {} });
            await tick();
        }
        assert.equal(context.state, "running", how);
        assert.equal(game.state.audio.play("death", 0, 1), true);
    }
});

test("un golpe melee en una partida real suena hit y hurt, y arranca la música de combate", async () => {
    const fake = createFakeAudioContext();
    const game = await boot(fake, { duel: 0.8 });
    await unlock(game);
    assert.equal(fake.tracks.length, 1);
    assert.match(fake.tracks[0].buffer.url, /mu_combat\.ogg$/);
    assert.equal(fake.tracks[0].loop, true);
    game.setPad(0, { buttons: [BUTTON.B], axes: AIM_RIGHT });
    game.frame();
    game.setPad(0, { axes: AIM_RIGHT });
    game.frames(30);
    const events = fake.plays.map((p) => eventOf(p.buffer.url));
    assert.equal(events.filter((e) => e === "hit").length, 1, `eventos: ${events}`);
    assert.equal(events.filter((e) => e === "hurt").length, 1, `eventos: ${events}`);
    assert.ok(fake.plays.every((p) => p.playbackRate.value >= 0.95 && p.playbackRate.value <= 1.05));
});

test("un golpe bloqueado suena block y no hit ni hurt", async () => {
    const fake = createFakeAudioContext();
    const game = await boot(fake, { duel: 0.8 });
    await unlock(game);
    game.setPad(1, { buttons: [BUTTON.LT], axes: [-1, 0, -1, 0] });
    game.frames(30);
    game.setPad(0, { buttons: [BUTTON.B], axes: AIM_RIGHT });
    game.frame();
    game.setPad(0, { axes: AIM_RIGHT });
    game.frames(30);
    const events = fake.plays.map((p) => eventOf(p.buffer.url));
    assert.ok(game.state.melee.hits.length === 0 || game.state.melee.hits.every((h) => h.kind === "block"));
    assert.ok(events.includes("block"), `eventos: ${events}`);
    assert.ok(!events.includes("hit") && !events.includes("hurt"), `eventos: ${events}`);
});

test("el tercer golpe del combo contra un bloqueo suena blockBreak y no hit ni hurt", async () => {
    const fake = createFakeAudioContext();
    const game = await boot(fake, { duel: 0.8 });
    await unlock(game);
    game.setPad(1, { buttons: [BUTTON.LT], axes: [-1, 0, -1, 0] });
    game.frames(10);
    for (let f = 0; f < 170; f++) {
        game.setPad(0, { buttons: [0, 15, 39].includes(f) ? [BUTTON.B] : [], axes: AIM_RIGHT });
        game.frame();
    }
    const events = fake.plays.map((p) => eventOf(p.buffer.url));
    assert.equal(events.filter((e) => e === "block").length, 2, `eventos: ${events}`);
    assert.equal(events.filter((e) => e === "blockBreak").length, 1, `eventos: ${events}`);
    assert.ok(!events.includes("hit") && !events.includes("hurt"), `eventos: ${events}`);
});

test("recoger un arma de un punto del mapa suena pickup", async () => {
    const fake = createFakeAudioContext();
    const game = await boot(fake);
    await unlock(game);
    const point = game.state.pickups.points.find((p) => p.weapon === 2);
    place(game, 0, point.x, point.y);
    game.frames(5);
    const events = fake.plays.map((p) => eventOf(p.buffer.url));
    assert.equal(events.filter((e) => e === "pickup").length, 1, `eventos: ${events}`);
    assert.ok(game.state.players[0].tanks.has(2));
});

test("el disparo y los fluidos no producen ningún sonido", async () => {
    const fake = createFakeAudioContext();
    const game = await boot(fake, { duel: 0.8 });
    await unlock(game);
    game.setPad(0, { buttons: [BUTTON.RT], axes: AIM_RIGHT });
    game.frames(90);
    assert.ok(game.state.store.alive.some((a) => a === 1), "hubo partículas");
    assert.ok(game.state.players[1].wet || game.state.players[1].hp < 100, "el rival recibió el chorro");
    assert.equal(fake.plays.length, 0, `sonó: ${fake.plays.map((p) => p.buffer.url)}`);
});

test("hurt máximo uno cada 0,3 s por robot y step uno cada 0,22 s; las variantes no se repiten seguidas", async () => {
    const fake = createFakeAudioContext();
    const game = await boot(fake);
    await unlock(game);
    const audio = game.state.audio;
    const count = () => fake.plays.length;
    assert.equal(audio.play("hurt", 0, 10), true);
    assert.equal(audio.play("hurt", 0, 10.29), false);
    assert.equal(audio.play("hurt", 1, 10.1), true);
    assert.equal(audio.play("hurt", 0, 10.3), true);
    assert.equal(count(), 3);
    assert.equal(audio.play("step", 0, 20), true);
    assert.equal(audio.play("step", 0, 20.21), false);
    assert.equal(audio.play("step", 0, 20.23), true);
    assert.equal(audio.play("nada", 0, 20), false);

    fake.plays.length = 0;
    for (let i = 0; i < 60; i++) audio.play("hit", 0, i);
    const urls = fake.plays.map((p) => p.buffer.url);
    assert.equal(urls.length, 60);
    for (let i = 1; i < urls.length; i++) assert.notEqual(urls[i], urls[i - 1]);
    assert.ok(new Set(urls).size > 1);
});

test("caminar 1,5 s en el piso suena step, con 0,22 s de separación como mínimo", async () => {
    const fake = createFakeAudioContext();
    const game = await boot(fake);
    await unlock(game);
    game.setPad(0, { axes: [1, 0, 1, 0] });
    const times = [];
    for (let f = 0; f < 90; f++) {
        const before = fake.plays.length;
        game.frame();
        if (fake.plays.length > before) times.push(game.state.players[0].now);
    }
    const steps = fake.plays.filter((p) => eventOf(p.buffer.url) === "step");
    assert.equal(steps.length, fake.plays.length, "solo pasos");
    assert.ok(steps.length >= 2 && steps.length <= 8, `${steps.length} pasos`);
    for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] >= 0.22 - 1e-9, `${times}`);
});

test("quieto en el piso no suenan pasos", async () => {
    const fake = createFakeAudioContext();
    const game = await boot(fake);
    await unlock(game);
    game.frames(90);
    assert.equal(fake.plays.length, 0);
});

test("aterrizar de una caída alta suena land; un salto normal no", async () => {
    const jump = createFakeAudioContext();
    const a = await boot(jump);
    await unlock(a);
    a.setPad(0, { buttons: [BUTTON.A] });
    a.frame();
    a.setPad(0);
    a.frames(120);
    assert.equal(jump.plays.filter((p) => eventOf(p.buffer.url) === "land").length, 0);

    const fake = createFakeAudioContext();
    const game = await boot(fake);
    await unlock(game);
    const torso = game.state.players[0].torso.GetPosition();
    place(game, 0, torso.get_x(), torso.get_y() + 7);
    game.frames(120);
    assert.equal(fake.plays.filter((p) => eventOf(p.buffer.url) === "land").length, 1);
});

test("una muerte suena death una sola vez y el fin de la ronda suena roundEnd", async () => {
    const fake = createFakeAudioContext();
    const game = await boot(fake);
    await unlock(game);
    game.state.players[1].hp = 0;
    game.frames(60);
    const events = fake.plays.map((p) => eventOf(p.buffer.url));
    assert.equal(events.filter((e) => e === "death").length, 1, `eventos: ${events}`);
    assert.equal(events.filter((e) => e === "roundEnd").length, 1, `eventos: ${events}`);
});

test("la música pasa de combate a muerte súbita y a menú, una a la vez, con fundido de 1 s", async () => {
    const fake = createFakeAudioContext();
    const game = await boot(fake);
    await unlock(game);
    const current = () => fake.tracks.filter((t) => !t.stopped).map((t) => name(t.buffer.url));
    assert.deepEqual(current(), [name(`./x/${MUSIC.combat}.ogg`)]);

    game.state.match.roundTime = LEVEL.flood.start + 1;
    game.frames(2);
    assert.deepEqual(current(), [MUSIC.suddenDeath]);

    game.state.match.wins[0] = 1;
    game.state.players[1].hp = 0;
    game.frames(260);
    assert.equal(game.state.match.state, "matchOver");
    assert.deepEqual(current(), [MUSIC.mainMenu]);
    assert.deepEqual(fake.tracks.map((t) => name(t.buffer.url)), [MUSIC.combat, MUSIC.suddenDeath, MUSIC.mainMenu]);
});

test("un archivo que no carga deja mudo a su evento sin romper nada", async () => {
    const fake = createFakeAudioContext();
    for (const file of SOUNDS.hit.files) fake.FakeAudioContext.broken.add(`./audio/sfx/${file}.ogg`);
    fake.FakeAudioContext.broken.add(`./audio/music/${MUSIC.combat}.ogg`);
    const game = await boot(fake, { duel: 0.8 });
    await unlock(game);
    game.setPad(0, { buttons: [BUTTON.B], axes: AIM_RIGHT });
    game.frame();
    game.setPad(0, { axes: AIM_RIGHT });
    game.frames(30);
    const events = fake.plays.map((p) => eventOf(p.buffer.url));
    assert.ok(!events.includes("hit"));
    assert.ok(events.includes("hurt"), `eventos: ${events}`);
    assert.equal(fake.tracks.length, 0);
});

/**
 * Corre `seconds` s de juego avanzando el reloj del contexto falso y devuelve el máximo de pistas de música vivas y
 * cuántos frames hubo más de una viva sin un cambio de pista en el último segundo (el fundido).
 */
async function musicOverlaps(map, seconds) {
    const fake = createFakeAudioContext();
    const game = await loadGame({ audioContext: fake.FakeAudioContext, map });
    game.setPad(0);
    game.setPad(1);
    game.frames(5);
    await tick();
    await unlock(game);
    const [context] = fake.created;
    let max = 0;
    let stray = 0;
    let lastChange = -Infinity;
    let seen = fake.tracks.length;
    for (let f = 0; f < seconds * 60; f++) {
        game.frame();
        context.currentTime += 1 / 60;
        if (fake.tracks.length !== seen) {
            seen = fake.tracks.length;
            lastChange = context.currentTime;
        }
        const live = fake.live(context.currentTime).length;
        max = Math.max(max, live);
        if (live > 1 && context.currentTime - lastChange > AUDIO.fade + 1e-6) stray++;
    }
    return { max, stray, changes: fake.tracks.length };
}

test("en Infinito y en Clásico nunca suenan más de dos pistas, y dos solo durante el fundido", async () => {
    for (const map of ["infinite", "classic"]) {
        const { max, stray, changes } = await musicOverlaps(map, map === "infinite" ? 150 : 70);
        assert.ok(changes >= (map === "infinite" ? 1 : 2), `${map}: cambios ${changes}`);
        assert.ok(max <= 2, `${map}: máximo ${max}`);
        assert.equal(stray, 0, `${map}: frames con dos pistas fuera del fundido`);
    }
});

test("un cambio de pista pedido durante un fundido corta la que estaba saliendo", async () => {
    const fake = createFakeAudioContext();
    const audio = new GameAudio(fake.FakeAudioContext);
    audio.context.state = "running";
    for (const file of Object.values(MUSIC)) audio.buffers.set(`./audio/music/${file}.ogg`, { url: `./audio/music/${file}.ogg` });
    const [context] = fake.created;
    let max = 0;
    const sample = () => (max = Math.max(max, fake.live(context.currentTime).length));
    for (const name of ["combat", "suddenDeath", "combat", "mainMenu", "suddenDeath"]) {
        audio.playMusic(name);
        sample();
        context.currentTime += 0.3;
        sample();
    }
    assert.ok(max <= 2, `máximo ${max}`);
    context.currentTime += AUDIO.fade;
    assert.deepEqual(fake.live(context.currentTime).map((t) => name(t.buffer.url)), [MUSIC.suddenDeath]);
});
