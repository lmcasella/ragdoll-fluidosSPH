// Teclas físicas (KeyboardEvent.code), independientes de la distribución del teclado
export const KEYBOARD_LAYOUTS = [
    {
        left: ["KeyA"],
        right: ["KeyD"],
        up: ["KeyW"],
        down: ["KeyS"],
        action: ["Space"],
        weapons: ["Digit1", "Digit2", "Digit3"],
    },
    {
        left: ["ArrowLeft"],
        right: ["ArrowRight"],
        up: ["ArrowUp"],
        down: ["ArrowDown"],
        action: ["Enter", "NumpadEnter"],
        weapons: ["Numpad1", "Numpad2", "Numpad3"],
    },
];

// Mapeo "standard" de la Gamepad API
const PAD = {
    action: [0, 7], // A / RT
    prevWeapon: 4, // LB
    nextWeapon: 5, // RB
    up: 12,
    down: 13,
    left: 14,
    right: 15,
};
const STICK_DEADZONE = 0.35;
const AIM_DEADZONE = 0.4;

// Estado por jugador, leído una vez por frame con poll():
// { left, right, up, down } mantenidos; action (flanco) y weapon (1-3) o weaponStep (±1) del frame;
// aim: dirección { x, y } del stick derecho (Y hacia arriba) o null
export class Input {
    constructor(playerCount) {
        this.layouts = KEYBOARD_LAYOUTS.slice(0, playerCount);
        this.held = new Set();
        this.pressed = new Set();
        this.prevButtons = [];
        this.states = this.layouts.map(() => ({}));

        const gameCodes = new Set(
            this.layouts.flatMap((l) => Object.values(l).flat()),
        );

        window.addEventListener("keydown", (e) => {
            if (gameCodes.has(e.code)) e.preventDefault();
            if (e.repeat) return;
            this.held.add(e.code);
            this.pressed.add(e.code);
        });
        window.addEventListener("keyup", (e) => {
            this.held.delete(e.code);
        });
        window.addEventListener("blur", () => this.held.clear());
    }

    poll() {
        // Gamepads en orden de conexión: el primero es J1, el segundo J2
        const pads = navigator.getGamepads
            ? [...navigator.getGamepads()].filter(
                  (p) => p && p.connected,
              )
            : [];

        this.layouts.forEach((layout, k) => {
            const isHeld = (codes) => codes.some((c) => this.held.has(c));
            const wasPressed = (codes) => codes.some((c) => this.pressed.has(c));

            const state = {
                left: isHeld(layout.left),
                right: isHeld(layout.right),
                up: isHeld(layout.up),
                down: isHeld(layout.down),
                action: wasPressed(layout.action),
                weapon: null,
                weaponStep: 0,
                aim: null,
            };
            layout.weapons.forEach((code, i) => {
                if (this.pressed.has(code)) state.weapon = i + 1;
            });

            const pad = pads[k];
            if (pad) this.readPad(pad, k, state);
            this.states[k] = state;
        });

        this.pressed.clear();
        return this.states;
    }

    readPad(pad, k, state) {
        const prev = this.prevButtons[k] ?? [];
        const down = (i) => pad.buttons[i]?.pressed ?? false;
        const edge = (i) => down(i) && !prev[i];
        const [lx = 0, ly = 0, rx = 0, ry = 0] = pad.axes;

        state.left ||= down(PAD.left) || lx < -STICK_DEADZONE;
        state.right ||= down(PAD.right) || lx > STICK_DEADZONE;
        state.up ||= down(PAD.up) || ly < -STICK_DEADZONE;
        state.down ||= down(PAD.down) || ly > STICK_DEADZONE;
        state.action ||= PAD.action.some(edge);
        if (edge(PAD.prevWeapon)) state.weaponStep = -1;
        if (edge(PAD.nextWeapon)) state.weaponStep = 1;
        if (Math.hypot(rx, ry) > AIM_DEADZONE) state.aim = { x: rx, y: -ry };

        this.prevButtons[k] = pad.buttons.map((b) => b.pressed);
    }
}
