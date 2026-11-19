import { test } from "node:test";
import assert from "node:assert/strict";

const { Match, COUNTDOWN_TIME, GO_TIME, MATCH_OVER_LOCK } = await import("../js/round.js");

const alive = { dead: false };
const dead = { dead: true };
const A = [{ action: true }];
const START = [{ start: true }];

/** Un Match ya en `playing`, saltando el título y la cuenta regresiva. */
function playing(winsNeeded = 2) {
    const match = new Match(2, winsNeeded);
    assert.equal(match.begin(), "reset");
    match.update([alive, alive], [], COUNTDOWN_TIME + 0.1);
    assert.equal(match.state, "playing");
    match.roundTime = 0;
    return match;
}

test("el juego arranca en el título, con los controles apagados", () => {
    const match = new Match(2);
    assert.equal(match.state, "title");
    assert.equal(match.controlsActive, false);
    assert.equal(match.hazardsActive, false);
    assert.equal(match.banner.title, "RAGDOLL FLUIDOS");
    assert.equal(match.update([alive, alive], [], 5), null);
    assert.equal(match.state, "title");
});

test("en el título action y start no inician nada; begin (el menú) inicia la cuenta regresiva con reset", () => {
    const match = new Match(2);
    for (const input of [A, START]) {
        assert.equal(match.update([alive, alive], input, 0.1), null);
        assert.equal(match.state, "title");
    }
    assert.equal(match.begin(), "reset");
    assert.equal(match.state, "countdown");
    assert.equal(match.round, 1);
});

test("la cuenta regresiva muestra 3, 2, 1, no avanza roundTime y pasa a playing con ¡YA! durante 0,6 s", () => {
    const match = new Match(2);
    match.begin();
    assert.equal(match.banner.title, "3");
    assert.equal(match.banner.subtitle, "Ronda 1");
    assert.equal(match.controlsActive, false);
    assert.equal(match.hazardsActive, false);
    match.update([alive, alive], [], 1);
    assert.equal(match.banner.title, "2");
    match.update([alive, alive], [], 1);
    assert.equal(match.banner.title, "1");
    assert.equal(match.roundTime, 0);
    match.update([alive, alive], [], 1.1);
    assert.equal(match.state, "playing");
    assert.equal(match.banner.title, "¡YA!");
    assert.equal(match.controlsActive, true);
    assert.equal(match.hazardsActive, true);
    match.update([alive, alive], [], GO_TIME + 0.1);
    assert.equal(match.banner, null);
});

test("roundTime suma el dt real solo en playing", () => {
    const match = playing();
    match.update([alive, alive], [], 0.5);
    match.update([alive, alive], [], 0.25);
    assert.equal(match.roundTime, 0.75);
});

test("roundTime se congela durante roundOver y la ronda siguiente pasa por countdown con reset", () => {
    const match = playing();
    match.update([alive, alive], [], 10);
    assert.equal(match.update([alive, dead], [], 1), null);
    assert.equal(match.state, "roundOver");
    assert.equal(match.controlsActive, true);
    const frozen = match.roundTime;
    assert.equal(match.update([alive, dead], [], 1), null);
    assert.equal(match.roundTime, frozen);
    assert.equal(match.update([alive, dead], [], 5), "reset");
    assert.equal(match.state, "countdown");
    assert.equal(match.round, 2);
    assert.equal(match.roundTime, 0);
    assert.equal(match.banner.subtitle, "Ronda 2");
});

test("matchOver ignora action y start durante el primer segundo; la revancha va a countdown", () => {
    const match = playing(1);
    match.update([alive, dead], [], 1);
    match.update([alive, dead], [], 5);
    assert.equal(match.state, "matchOver");
    assert.equal(match.controlsActive, false);
    assert.equal(match.update([alive, dead], A, MATCH_OVER_LOCK - 0.2), null);
    assert.equal(match.update([alive, dead], START, 0.1), null);
    assert.equal(match.state, "matchOver");
    assert.equal(match.update([alive, dead], A, 0.2), "reset");
    assert.equal(match.state, "countdown");
    assert.equal(match.round, 1);
    assert.deepEqual(match.wins, [0, 0]);
    assert.equal(match.roundTime, 0);
});

test("start en matchOver vuelve al título con reset", () => {
    const match = playing(1);
    match.update([alive, dead], [], 1);
    match.update([alive, dead], [], 5);
    assert.equal(match.update([alive, dead], START, MATCH_OVER_LOCK + 0.1), "reset");
    assert.equal(match.state, "title");
    assert.deepEqual(match.wins, [0, 0]);
});

test("el cartel de fin de partida muestra el marcador y las opciones", () => {
    const match = playing(1);
    match.update([alive, dead], [], 1);
    match.update([alive, dead], [], 5);
    assert.deepEqual(match.banner, { title: "J1 GANA LA PARTIDA", subtitle: "1 – 0 · A revancha · Start menú" });
});

test("los peligros por tiempo solo actúan en playing", () => {
    const match = playing(1);
    assert.equal(match.hazardsActive, true);
    match.update([alive, dead], [], 1);
    assert.equal(match.state, "roundOver");
    assert.equal(match.hazardsActive, false);
    match.update([alive, dead], [], 5);
    assert.equal(match.state, "matchOver");
    assert.equal(match.hazardsActive, false);
});