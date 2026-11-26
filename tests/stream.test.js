// Gameplay del chorro con tanque: el script de index.js con LiquidFun real y gamepads simulados
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGame, giveAllWeapons } from "./helpers/game.js";

const RT = 7;

async function start() {
    const game = await loadGame();
    giveAllWeapons(game);
    game.setPad(0);
    game.setPad(1);
    game.frames(30);
    return game;
}

const tank = (game, k = 0) => game.state.players[k].tanks.get(game.state.players[k].weapon);

test("mantener RT 1 s emite el caudal del agua y el tanque baja lo mismo", async () => {
    const game = await start();
    const { particleSystem, players } = game.state;
    const before = particleSystem.GetParticleCount();
    const full = tank(game);
    game.setPad(0, { buttons: [RT] });
    game.frames(60);
    const grown = particleSystem.GetParticleCount() - before;
    const spent = full - tank(game);
    console.log(`1 s de RT: el sistema creció ${grown} partículas, el tanque bajó ${spent} (caudal 155)`);
    assert.ok(Math.abs(spent - (1 + 155 * 59 / 60)) <= 2, `tanque -${spent}`);
    assert.ok(grown <= spent && grown >= spent - 3, `creció ${grown}`);
    assert.equal(players[0].tanks.get(2), 180, "el resto del inventario conserva lo suyo");
    assert.equal(players[1].tanks.get(4), 600, "el otro jugador no disparó");
});

test("mantener hasta vaciar: el tanque llega a 0 y deja de emitir", async () => {
    const game = await start();
    const { damage } = game.state;
    game.setPad(0, { buttons: [RT] });
    game.frames(260);
    assert.equal(tank(game), 0);
    const shotsOpened = damage.nextShot;
    game.frames(60);
    assert.equal(tank(game), 0);
    assert.equal(damage.nextShot, shotsOpened, "no se abrió ningún disparo nuevo");
});

test("soltar y volver a apretar con el tanque vacío sigue sin emitir; otra arma sí", async () => {
    const game = await start();
    const { players, damage } = game.state;
    game.setPad(0, { buttons: [RT] });
    game.frames(260);
    game.setPad(0);
    game.frames(2);
    const opened = damage.nextShot;
    game.setPad(0, { buttons: [RT] });
    game.frames(10);
    assert.equal(damage.nextShot, opened);
    game.setPad(0, { buttons: [5] }); // RB: arma siguiente (ácido)
    game.frames(1);
    game.setPad(0, { buttons: [RT] });
    game.frames(30);
    assert.equal(players[0].weapon, 1);
    assert.ok(players[0].tanks.get(4) < 600);
});

test("durante el golpe no sale chorro, y al terminar arranca como una pulsación nueva", async () => {
    const game = await start();
    const { players } = game.state;
    game.setPad(0, { buttons: [RT, 1] }); // RT + B
    game.frames(1);
    const during = tank(game);
    game.setPad(0, { buttons: [RT] });
    game.frames(28); // el golpe dura 0,55 s (33 frames)
    assert.equal(tank(game), during, "sin chorro mientras pega");
    game.frames(40);
    assert.ok(tank(game) < during, "después del golpe, con RT apretado, el chorro sigue");
    assert.equal(players[0].tanks.get(2), 180);
});
test("un salto grande del reloj real sin frames no vence los disparos", async () => {
    const game = await start();
    const { damage, particleSystem } = game.state;
    game.setPad(0, { buttons: [RT] });
    game.frames(20);
    game.setPad(0);
    const shots = damage.shots.size;
    const particles = particleSystem.GetParticleCount();
    assert.ok(shots > 0 && particles > 0);
    game.skipTime(30); // pestaña oculta
    game.frames(1);
    assert.equal(damage.shots.size, shots);
    assert.ok(particleSystem.GetParticleCount() >= particles - 3, "los charcos siguen");
});

test("la cámara lenta alarga la vida de los disparos igual que a la física", async () => {
    const game = await start();
    const { damage, match } = game.state;
    game.setPad(0, { buttons: [RT] });
    game.frames(5);
    game.setPad(0);
    const first = damage.liveShotFloor;
    match.state = "roundOver"; // timeScale 0,3 durante 1,5 s
    match.timer = 3;
    game.frames(60);
    assert.equal(damage.liveShotFloor, first);
});

test("al reiniciar la ronda se olvidan los disparos", async () => {
    const game = await start();
    const { damage, particleSystem } = game.state;
    game.setPad(0, { buttons: [RT] });
    game.frames(20);
    game.setPad(0);
    assert.ok(damage.shots.size > 0);
    finishRound(game);
    assert.equal(game.state.match.round, 2);
    assert.equal(damage.shots.size, 0);
    assert.equal(damage.openShots.size, 0);
    assert.equal(particleSystem.GetParticleCount(), 0);
});

/** Termina la ronda matando al rival; devuelve cuando ya empezó la siguiente (pasada la cuenta regresiva) o terminó la partida. */
function finishRound(game, loser = 1) {
    game.state.players[loser].hp = 0;
    game.frames(1);
    assert.equal(game.state.match.state, "roundOver");
    game.frames(190);
    if (game.state.match.state === "countdown") game.frames(185);
}

test("al empezar la ronda siguiente los tanques están llenos y se pierden las armas recogidas y se puede disparar", async () => {
    const game = await start();
    const { match, players } = game.state;
    game.setPad(0, { buttons: [RT] });
    game.frames(30);
    assert.ok(tank(game) < 600);
    game.setPad(0);
    finishRound(game);
    assert.equal(match.round, 2);
    assert.equal(match.state, "playing");
    assert.equal(tank(game), 600, "el robot nuevo trae el agua con el tanque lleno");
    assert.deepEqual([...players[0].tanks], [[4, 600]], "el resto de las armas se pierde: hay que volver a recogerlas");
    game.setPad(0);
    game.frames(2);
    game.setPad(0, { buttons: [RT] });
    game.frames(10);
    assert.ok(tank(game) < 600, "soltado y apretado de nuevo, dispara");
});

test("el botón apretado desde la ronda anterior no dispara durante la cuenta regresiva", async () => {
    const game = await start();
    const { match } = game.state;
    game.setPad(0, { buttons: [RT] });
    game.frames(30);
    game.state.players[1].hp = 0;
    game.frames(190);
    assert.equal(match.state, "countdown");
    assert.equal(tank(game), 600);
    game.frames(120);
    assert.equal(match.state, "countdown");
    assert.equal(tank(game), 600, "RT apretado en la cuenta regresiva no dispara");
});

test("la revancha con RT funciona, no gasta el tanque y hay que soltar RT antes de disparar", async () => {
    const game = await start();
    const { match, players } = game.state;
    finishRound(game);
    finishRound(game);
    assert.equal(match.state, "matchOver");
    assert.equal(match.matchWinner, 0);

    game.frames(60);
    game.setPad(0, { buttons: [RT] });
    game.frames(1);
    assert.equal(match.state, "countdown");
    assert.equal(match.round, 1);
    assert.deepEqual(match.wins, [0, 0]);
    game.setPad(0);
    game.frames(185);
    assert.equal(match.state, "playing");
    assert.equal(players[0].tanks.get(4), 600, "RT de la revancha no dispara");
    game.frames(2);
    game.setPad(0, { buttons: [RT] });
    game.frames(10);
    assert.ok(players[0].tanks.get(4) < 600);
});

test("la revancha con Espacio (teclado) también funciona", async () => {
    const game = await start();
    const { match } = game.state;
    finishRound(game);
    finishRound(game);
    assert.equal(match.state, "matchOver");
    game.frames(60);
    game.emit("keydown", { code: "Space", preventDefault() {} });
    game.frames(1);
    assert.equal(match.state, "countdown");
    game.emit("keyup", { code: "Space" });
    game.frames(215);
    assert.equal(match.state, "playing");
    assert.equal(game.state.players[1].tanks.get(4), 600);
});
