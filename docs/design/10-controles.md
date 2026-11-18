# 10. Controles

**Gamepad primero:** el teclado y el mouse son respaldo y nunca pisan al gamepad. Los gamepads se asignan por orden de conexión (1.º → J1, 2.º → J2) y se combinan con el teclado del mismo jugador. Mapeo `standard` de la Gamepad API.

## 10.1 Mapeo 🔨 (remapeo pedido por el usuario el 18/11)

El remapeo base y el gancho entran en la entrega (M4). El modo ragdoll y la pausa consensuada son 🔨 M5.

| Acción | Intención de `Input` | Gamepad | J1 teclado y mouse | J2 teclado | Entrega |
|---|---|---|---|---|---|
| Moverse | `left`, `right`, `up`, `down` (mantenidos) | Stick izquierdo, solo analógico (zona muerta 0,35) | A / D (W / S para arriba y abajo) | ← / → (↑ / ↓) | Sí |
| Saltar | `jump` (flanco) | A (`buttons[0]`). Arriba ya no salta | W | ↑ | Sí |
| Bajar de una plataforma atravesable | `drop` (flanco) | Stick abajo (`ly` > 0,6) + A | S + W | ↓ + ↑ | Sí (la intención; la plataforma atravesable es otro issue, [05](05-escenario.md#53-plataformas-atravesables-desde-abajo-)) |
| Apuntar | `aim` / `pointer` | Stick derecho (conserva la dirección) | Mouse (solo si se movió después del último uso del stick) o hacia donde camina | Hacia donde camina | Sí |
| Disparar | `fire` (mantenido); `action` (flanco, menús y revancha) | RT (`buttons[7]`); `action` también con A | Espacio o botón izquierdo del mouse | Enter | Sí |
| Golpe | `punch` (flanco) | B (`buttons[1]`) | F | Shift derecho | Sí |
| Gancho | `grapple` (mantenido) | X (`buttons[2]`) | E o botón derecho del mouse | Numpad 0 | Sí ([03 §3.5](03-robots.md#35-gancho-)) |
| Arma anterior | `weaponStep` = −1 | LB, toque corto (se suelta antes de 0,25 s) | Q, toque corto | Ctrl derecho, toque corto | Sí |
| Arma siguiente | `weaponStep` = +1 | RB (flanco) | R | Numpad + | Sí |
| Rueda de armas | `wheel` = `{ open, x, y }` y `wheelPick` | LB mantenido ≥ 0,25 s + stick derecho; se elige al soltar LB, y con el stick al centro se cancela | Q mantenido + W/A/S/D | Ctrl derecho mantenido + flechas | Sí (#15) |
| Arma directa | `weapon` (posición 1–4 en la tabla) | Cruceta: arriba 1, derecha 2, abajo 3, izquierda 4 | 1 / 2 / 3 / 4 | Num 1 / 2 / 3 / 4 | Sí |
| Modo ragdoll | `ragdoll` (flanco) | Y (`buttons[3]`) | C | Num . | 🔨 M5 ([03 §3.6](03-robots.md#36-modo-ragdoll--m5)) |
| Pausa consensuada | `pause` (flanco) | Select (`buttons[8]`) | Escape | Retroceso | 🔨 M5 ([10.4](#104-pausa-consensuada--m5)) |
| Debug (desarrollo) | — (no es intención de juego) | L3 + R3 juntos (`buttons[10]` y `[11]`) | F3 panel / F4 capa | — | Con #29 |

## 10.2 Intenciones de `Input`

`Input` (`js/Input.js`) sigue siendo el único que lee dispositivos (patrón "intención, no dispositivo"). Estado por jugador en cada `poll()`:

| Campo | Tipo | Cuándo es verdadero o qué trae |
|---|---|---|
| `left`, `right`, `up`, `down` | bool, mantenido | Stick izquierdo fuera de la zona muerta (0,35), o teclas de dirección. La cruceta ya no mueve |
| `jump` | bool, flanco | A o tecla de salto, **salvo** que en el mismo `poll` haya `drop` |
| `drop` | bool, flanco | A (o salto de teclado) con abajo fuerte: `ly` > `DROP_THRESHOLD` (0,6), o tecla de abajo apretada. El umbral es más alto que la zona muerta para que caminar en diagonal no baje sin querer. El juego lo trata como salto si el robot no está sobre una plataforma atravesable |
| `fire` | bool, mantenido | RT, tecla de disparo o botón izquierdo (J1) |
| `action` | bool, flanco | A o RT, tecla de disparo, clic (J1). Solo menús y revancha |
| `punch` | bool, flanco | B o tecla de golpe |
| `grapple` | bool, mantenido | X o tecla de gancho o botón derecho (J1). `Grapple` deriva el flanco |
| `weaponStep` | −1, 0, +1 | −1 al **soltar** LB (o la tecla) antes de `TAP_MAX`; +1 en el flanco de RB (o la tecla) |
| `wheel` | `{ open, x, y }` o `null` | `open` desde que LB (o la tecla) lleva `TAP_MAX` apretado. `x`, `y` es la dirección del stick derecho (Y arriba) o de las teclas de dirección; (0, 0) dentro de la zona muerta (0,4) |
| `wheelPick` | `{ x, y }`, `"cancel"` o `null` | Solo en el `poll` en que se suelta LB con la rueda abierta: la dirección en ese momento, o `"cancel"` si estaba al centro. El juego la convierte en el sector del arma (las armas del inventario repartidas en sectores iguales, empezando arriba en sentido horario) |
| `weapon` | 1–4 o `null` | Flanco de la cruceta o de las teclas numéricas: posición en la tabla de armas |
| `aim` | `{ x, y }` o `null` | Stick derecho fuera de la zona muerta. **Mientras la rueda está abierta, vale `null`**: el stick elige arma y la mira conserva la dirección anterior |
| `pointer` | `{ x, y }` o `null` (solo J1) | Mouse como fuente de mira |
| `ragdoll` 🔨 M5 | bool, flanco | Y o tecla |
| `pause` 🔨 M5 | bool, flanco | Select o tecla |

**Umbral del toque corto (`TAP_MAX`) = 0,25 s.** Un toque deliberado dura 0,1–0,2 s. Con 0,25 s, el arma anterior responde al soltar (como mucho 0,25 s de demora) y la rueda se abre sin una espera molesta. Es un dato exportado de `Input.js`.

**Sin pisar al gamepad:**
- Los mantenidos y los flancos son un O entre fuentes: ninguna fuente escribe `false` sobre otra.
- La rueda la decide la fuente que la abrió: si LB está apretado, Q no la cierra ni cambia su dirección. El stick derecho gana sobre las teclas de dirección.
- El mouse solo apunta si se movió después del último uso del stick (como hoy).
- El botón derecho del mouse ya no abre el menú contextual (`preventDefault` en `contextmenu` cuando el juego tiene foco).
- Las teclas de dirección del teclado mueven al robot aunque la rueda esté abierta: el juego sigue corriendo.

## 10.3 Disparo mantenido ✅ #13

`Input` entrega dos señales por jugador:

| Campo | Tipo | Quién lo usa |
|---|---|---|
| `fire` | **Mantenido**: verdadero en cada `poll()` mientras alguna fuente lo tenga apretado | Emisor de chorros (`js/weapons.js`) |
| `action` | **Flanco**: verdadero solo en el `poll()` en que se apretó | `Match` (revancha). No dispara |

- **Fuentes de `fire`:** con el remapeo, solo `buttons[7]` (RT) del gamepad, porque A pasa a ser salto. También la tecla de disparo en `held` y, solo para el J1, el botón izquierdo del mouse (`mousedown` → verdadero, `mouseup` → falso; `blur` lo limpia).
- **Revancha e inicio de ronda:** siguen con `action` (flanco). Para que el mismo botón no empiece a vaciar el tanque al arrancar, el emisor exige un frame con `fire` en falso después de cada reinicio ([04-fluidos](04-fluidos.md#disparo-continuo-con-tanque--13)).
- **Arma directa:** `state.weapon` es la **posición en la tabla** de armas (1 = primera fila), no el `id`. La raíz de composición la convierte en `WEAPONS[n−1].id` si esa arma está en el inventario.

## 10.4 Pausa consensuada 🔨 M5

Diseño mínimo:
- Un jugador aprieta Select: se abre un pedido de pausa con un cartel ("J1 pide pausa"). El juego sigue corriendo.
- El otro jugador acepta con Select en menos de `PAUSE.window` (10 s): `Match` pasa al estado `paused` (escala de tiempo 0) con el menú de ajustes. Cualquiera de los dos reanuda con Select.
- Si el otro no responde (por ejemplo, está ausente), el pedido vence y se ignora. Quien lo pidió puede cancelarlo con otro Select.
- Va en la máquina de estados de `Match` (estados `playing` → `pauseRequested` → `paused`), con las transiciones en un solo lugar.

## 10.5 Debug

El atajo anterior de #29 (Select + LB) choca con la pausa (Select) y con la rueda (LB). **Nuevo atajo:** L3 + R3 apretados a la vez (clic de los dos sticks; botones que el juego no usa y difíciles de apretar sin querer) encienden y apagan el panel. Mantenerlos 1 s pasa a la capa siguiente. En teclado: F3 (panel) y F4 (capa). Lo lee `debug.js` desde la raíz de composición; no es una intención de juego ([14.12](14-agua.md#1412-herramientas-de-debug)).
