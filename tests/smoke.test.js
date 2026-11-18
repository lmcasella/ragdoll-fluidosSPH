import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const root = new URL("../", import.meta.url);
const readJson = (path) => JSON.parse(readFileSync(new URL(path, root), "utf8"));

// RagImporter necesita PIXI para crear la vista de cada instancia; en Node alcanza con un stub
class StubContainer {
    constructor() {
        this.parent = null;
    }
    addChild(child) {
        return child;
    }
    removeChild() {}
    destroy() {}
}

globalThis.Box2D = require("../vendor/liquidfun.js");
globalThis.PIXI = { Container: StubContainer };

const { RagImporter, stepWorld } = await import("../lib/ragimporter.js");
const { ActiveRagdoll } = await import("../js/ActiveRagdoll.js");
await import("../js/Input.js");

test("el script principal de index.html no tiene errores de sintaxis", () => {
    const html = readFileSync(new URL("index.html", root), "utf8");
    const match = html.match(/<script type="module">([\s\S]*?)<\/script>/);
    assert.ok(match, "falta el <script type=\"module\"> en index.html");
    const file = join(mkdtempSync(join(tmpdir(), "rfsph-")), "main.mjs");
    writeFileSync(file, match[1]);
    execFileSync(process.execPath, ["--check", file]);
});

for (const asset of ["assets/robot.rag.json", "assets/ragdino.rag.json"]) {
    test(`${asset} es un .rag.json válido`, () => {
        const { errors } = RagImporter.validate(readJson(asset));
        assert.deepEqual(errors, []);
    });
}

test("dos robots se mantienen en pie sobre el piso", () => {
    const json = readJson("assets/robot.rag.json");
    const def = RagImporter.parse(json);
    const rig = {
        rootBody: json.ragdoll.rootBody,
        aimJoints: ["joint_11", "joint_11_copy"],
        aimOffset: 0,
        clips: { walk: "walk", jump: "jump", dead: "dead" },
    };

    const gravity = new Box2D.b2Vec2(0, -10);
    const world = new Box2D.b2World(gravity);
    Box2D.destroy(gravity);
    const groundDef = new Box2D.b2BodyDef();
    const ground = world.CreateBody(groundDef);
    Box2D.destroy(groundDef);
    const shape = new Box2D.b2PolygonShape();
    const center = new Box2D.b2Vec2(0, -0.25);
    shape.SetAsBox(40, 0.25, center, 0);
    ground.CreateFixture(shape, 0);
    Box2D.destroy(center);
    Box2D.destroy(shape);

    const players = [
        new ActiveRagdoll(def, world, -3, 0.05, rig, false),
        new ActiveRagdoll(def, world, 3, 0.05, rig, true),
    ];
    const restY = players.map((p) => p.torso.GetPosition().get_y());
    const idle = { left: false, right: false, up: false };

    for (let i = 0; i < 180; i++) {
        players.forEach((p) => p.move(idle));
        stepWorld(world, players.map((p) => p.rag));
    }

    players.forEach((p, k) => {
        const pos = p.torso.GetPosition();
        assert.ok(Number.isFinite(pos.get_x()), `J${k + 1}: posición no finita`);
        assert.ok(
            Math.abs(pos.get_y() - restY[k]) < 0.2,
            `J${k + 1}: la raíz cayó a ${pos.get_y().toFixed(2)} m`,
        );
        assert.ok(Math.abs(p.torso.GetAngle()) < 0.3, `J${k + 1}: se cayó`);
    });

    players.forEach((p) => p.destroy());
    Box2D.destroy(world);
});
