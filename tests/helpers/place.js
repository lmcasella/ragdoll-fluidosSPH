/** Mueve todas las piezas del robot `index` para que su torso quede en (`x`, `y`), en m. */
export function place(game, index, x, y) {
    const torso = game.state.players[index].torso.GetPosition();
    const deltaX = x - torso.get_x();
    const deltaY = y - torso.get_y();
    const target = new Box2D.b2Vec2(0, 0);
    for (const body of game.state.players[index].rag.bodies.values()) {
        const position = body.GetPosition();
        target.set_x(position.get_x() + deltaX);
        target.set_y(position.get_y() + deltaY);
        body.SetTransform(target, body.GetAngle());
    }
    Box2D.destroy(target);
}
