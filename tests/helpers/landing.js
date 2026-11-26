/** Aterrizaje sintético sobre una plataforma atravesable (#171): crea la plataforma, deja caer al robot 0 y mide las piezas dentro. */
import { loadGame } from "./game.js";

const { ONE_WAY } = await import("../../src/level/platforms.js");

const PLATFORM = { x: 45, y: 20, w: 6, h: 0.4 };
const FALL_SPEED = 25;

/** Crea la plataforma atravesable en la escena: fija o cinemática (sube 0,5 m/s). Devuelve su registro de `OneWayPlatforms`. */
function addPlatform(game, moving) {
    const { world, platforms } = game.state;
    const bodyDef = new Box2D.b2BodyDef();
    bodyDef.set_type(moving ? Box2D.b2_kinematicBody : Box2D.b2_staticBody);
    const body = world.CreateBody(bodyDef);
    Box2D.destroy(bodyDef);
    const center = new Box2D.b2Vec2(PLATFORM.x, PLATFORM.y);
    const shape = new Box2D.b2PolygonShape();
    shape.SetAsBox(PLATFORM.w / 2, PLATFORM.h / 2, center, 0);
    const fixture = body.CreateFixture(shape, 0);
    Box2D.destroy(shape);
    Box2D.destroy(center);
    platforms.addPlatform(fixture, { moving });
    if (moving) {
        const velocity = new Box2D.b2Vec2(0, 0.5);
        body.SetLinearVelocity(velocity);
        Box2D.destroy(velocity);
    }
    return platforms.platforms.get(Box2D.getPointer(fixture));
}

/** Traslada todo el robot `k` para que su punto más bajo quede a `height` m del tope y le da `speed` m/s hacia abajo, sin tocar la pose. */
function dropRobot(game, k, platform, height, speed, dxOff = 0) {
    const { platforms, players } = game.state;
    const owner = platforms.owners.get(k);
    const dx = PLATFORM.x + dxOff - players[k].torso.GetPosition().get_x();
    const dy = platform.top + height - platforms.measure(owner).low;
    const vec = new Box2D.b2Vec2(0, 0);
    const vel = new Box2D.b2Vec2(0, -speed);
    for (const body of players[k].rag.bodies.values()) {
        const p = body.GetPosition();
        vec.set_x(p.get_x() + dx);
        vec.set_y(p.get_y() + dy);
        body.SetTransform(vec, body.GetAngle());
        body.SetLinearVelocity(vel);
    }
    Box2D.destroy(vec);
    Box2D.destroy(vel);
    platforms.update(game.now);
}

/** Fixtures del robot `k` cuya caja solapa la plataforma con el punto más bajo por debajo de `top - tolerance`. */
function insidePieces(game, k, platform, names) {
    const found = [];
    for (const body of game.state.platforms.owners.get(k).bodies) {
        for (let f = body.GetFixtureList(); Box2D.getPointer(f) !== 0; f = f.GetNext()) {
            const aabb = f.GetAABB(0);
            const lower = aabb.get_lowerBound();
            const upper = aabb.get_upperBound();
            const overlapsX = upper.get_x() > platform.minX && lower.get_x() < platform.maxX;
            const overlapsY = upper.get_y() > platform.bottom && lower.get_y() < platform.top - ONE_WAY.tolerance;
            if (overlapsX && overlapsY) found.push({ piece: names.get(Box2D.getPointer(body)), low: lower.get_y() });
        }
    }
    return found;
}

/** Deja caer al robot 0 sobre la plataforma y mide cuánto tiempo hay una pieza dentro, la peor pieza y dónde termina parado. */
export async function land(moving, speed = FALL_SPEED, height = 1, dxOff = 0) {
    const game = await loadGame();
    game.setPad(0);
    game.setPad(1);
    game.frames(40);
    const platform = addPlatform(game, moving);
    dropRobot(game, 0, platform, height, speed, dxOff);
    const names = new Map();
    for (const [name, body] of game.state.players[0].rag.bodies) names.set(Box2D.getPointer(body), name);
    const owner = game.state.platforms.owners.get(0);
    let run = 0;
    let longest = 0;
    let worst = null;
    for (let i = 0; i < 240; i++) {
        const vy = game.state.players[0].torso.GetLinearVelocity().get_y();
        game.frame();
        const found = insidePieces(game, 0, platform, names);
        run = found.length ? run + 1 / 60 : 0;
        longest = Math.max(longest, run);
        for (const x of found) {
            const depth = x.low - (platform.top + platform.bottom) / 2;
            if (!worst || depth < worst.depth) {
                worst = { t: +(i / 60).toFixed(3), piece: x.piece, depth: +depth.toFixed(3), vyBefore: +vy.toFixed(2), pair: owner.pairs.get(Box2D.getPointer(platform.fixture)) };
            }
        }
    }
    return { longest, worst, low: game.state.platforms.measure(owner).low, platform };
}

