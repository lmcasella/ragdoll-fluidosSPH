import { test } from "node:test";
import assert from "node:assert/strict";

const { Match } = await import("../js/round.js");

const alive = { dead: false };
const dead = { dead: true };

test("roundTime suma el dt real solo en playing", () => {
    const match = new Match(2);
    match.update([alive, alive], [], 0.5);
    match.update([alive, alive], [], 0.25);
    assert.equal(match.roundTime, 0.75);
});

test("roundTime se congela durante roundOver y vuelve a 0 con el reinicio", () => {
    const match = new Match(2);
    match.update([alive, alive], [], 10);
    assert.equal(match.update([alive, dead], [], 1), null);
    assert.equal(match.state, "roundOver");
    const frozen = match.roundTime;
    assert.equal(match.update([alive, dead], [], 1), null);
    assert.equal(match.roundTime, frozen);
    assert.equal(match.update([alive, dead], [], 5), "reset");
    assert.equal(match.roundTime, 0);
});

test("roundTime vuelve a 0 en la revancha", () => {
    const match = new Match(2, 1);
    match.update([alive, alive], [], 4);
    match.update([alive, dead], [], 0.1);
    match.update([alive, dead], [], 5);
    assert.equal(match.state, "matchOver");
    assert.equal(match.update([alive, dead], [{ action: true }], 0.1), "reset");
    assert.equal(match.roundTime, 0);
});
test("los peligros por tiempo solo actúan en playing", () => {
    const match = new Match(2, 1);
    assert.equal(match.hazardsActive, true);
    match.update([alive, dead], [], 1);
    assert.equal(match.state, "roundOver");
    assert.equal(match.hazardsActive, false);
    match.update([alive, dead], [], 5);
    assert.equal(match.state, "matchOver");
    assert.equal(match.hazardsActive, false);
});