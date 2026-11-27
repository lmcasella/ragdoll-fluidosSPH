# 10. Controles

**Gamepad primero:** el teclado y el mouse son respaldo y nunca pisan al gamepad. Los gamepads se asignan por orden de conexión (1.º → J1, 2.º → J2) y se combinan con el teclado del mismo jugador. Mapeo `standard` de la Gamepad API.

El teclado y el mouse son solo de J1 (un solo `KEYBOARD_LAYOUT`): J2 juega con gamepad o es el bot.

## 10.1 Mapeo ✅ (remapeo pedido por el usuario el 18/11)

El remapeo base está hecho ✅; el gancho 🔨 no tiene efecto en el juego todavía (`Input` ya entrega `grapple`). El modo ragdoll es 🔨 M5; la pausa ya es un menú (§10.4).

| Acción | Intención de `Input` | Gamepad | Teclado y mouse (solo J1) | Entrega |
|---|---|---|---|---|
| Moverse | `left`, `right`, `up`, `down` (mantenidos) | Stick izquierdo, solo analógico (zona muerta 0,35) | A / D (W / S para arriba y abajo) | Sí |
| Saltar | `jump` (flanco) | A (`buttons[0]`). Arriba ya no salta | W | Sí |
| Bajar de una plataforma atravesable | `drop` (flanco) | Stick abajo (`ly` > 0,6) + A | S + W | Sí (la intención; la plataforma atravesable es otro issue, [05](05-escenario.md#53-plataformas-atravesables-desde-abajo-)) |
| Apuntar | `aim` / `pointer` | Stick derecho (conserva la dirección) | Mouse (solo si se movió después del último uso del stick) o hacia donde camina | Sí. Sin stick derecho ni mouse como fuente, la mira (y el giro) sigue la dirección de caminar; durante un ataque no gira |
| Disparar | `fire` (mantenido); `action` (flanco, menús y revancha) | RT (`buttons[7]`); `action` también con A | Espacio o botón izquierdo del mouse | Sí |
| Golpe | `punch` (flanco) | B (`buttons[1]`) | F | Sí |
| Combo melee ✅ #104 | `punch` (flanco) | B repetido: cada toque dentro de la ventana del golpe en curso encadena `punch_combo1` → `2` → `3`; sin toque vuelve a la locomoción | F repetido | Sí ([03 §3.7.4](03-robots.md#374-ataques-melee-datos-en-melee)) |
| Bloqueo ✅ #104 | `block` (mantenido) | LT mantenido (`buttons[6]`) | Shift (izquierdo o derecho) | Sí ([03 §3.7.5](03-robots.md#375-bloqueo)) |
| Roll ✅ #104 | `roll` (flanco) | LT + A: saltar mientras se bloquea rueda hacia el stick izquierdo, o hacia el lado de la mira si está al centro | Shift + W | Sí ([03 §3.7.6](03-robots.md#376-roll)) |
| Golpe en el aire ✅ #104 | `punch` (flanco) en el aire | B en el aire | F en el aire | Sí |
| Patada en el aire ✅ #104 | `kick` (flanco) en el aire | Stick abajo (`ly` > 0,6) + B en el aire | S + F | Sí |
| Gancho | `grapple` (mantenido) | X (`buttons[2]`) | E o botón derecho del mouse | 🔨 ([03 §3.5](03-robots.md#35-gancho-)) |
| Arma anterior | `weaponStep` = −1 | LB, toque corto (se suelta antes de 0,25 s) | Q, toque corto | Sí |
| Arma siguiente | `weaponStep` = +1 | RB (flanco) | R | Sí |
| Rueda de armas | `wheel` = `{ open, x, y }` y `wheelPick` | LB mantenido ≥ 0,25 s + stick derecho; se elige al soltar LB, y con el stick al centro se cancela | Q mantenido + W/A/S/D | Sí (#15) |
| Arma directa | `weapon` (posición 1–4 en la tabla) | Cruceta: arriba 1, derecha 2, abajo 3, izquierda 4 | 1 / 2 / 3 / 4 | Sí |
| Modo ragdoll | `ragdoll` (flanco) | Y (`buttons[3]`), reservado: #104 no lo usa | — | 🔨 M5 ([03 §3.6](03-robots.md#36-modo-ragdoll--m5)) |
| Pausa | `start` (flanco) | Start (`buttons[9]`) | Escape | ✅ #82 ([10.4](#104-pausa)) |
| Debug (desarrollo) | — (no es intención de juego) | L3 + R3 juntos (`buttons[10]` y `[11]`) | F3 | ✅ #258 |

## 10.2 Intenciones de `Input`

`Input` (`src/input/Input.js`) sigue siendo el único que lee dispositivos (patrón "intención, no dispositivo"). Estado por jugador en cada `poll()`:

| Campo | Tipo | Cuándo es verdadero o qué trae |
|---|---|---|
| `left`, `right`, `up`, `down` | bool, mantenido | Stick izquierdo fuera de la zona muerta (0,35), o teclas de dirección. La cruceta ya no mueve |
| `jump` | bool, flanco | A o tecla de salto, **salvo** que en el mismo `poll` haya `roll` o `drop` |
| `drop` | bool, flanco | A (o salto de teclado) con abajo fuerte: `ly` > `DROP_THRESHOLD` (0,6), o tecla de abajo apretada, **salvo** que haya `roll`. El umbral es más alto que la zona muerta para que caminar en diagonal no baje sin querer. El juego lo trata como salto si el robot no está sobre una plataforma atravesable |
| `block` ✅ #104 | bool, mantenido | LT (`buttons[6].pressed`) o Shift (izquierdo o derecho, `KEYBOARD_LAYOUT`) |
| `roll` ✅ #104 | bool, flanco | Flanco de salto (A o tecla) con `block` mantenido en el mismo `poll`, de cualquier fuente. Gana sobre `drop` y `jump`, que quedan en falso. La dirección no viaja en la intención: el juego la toma de `left`/`right` |
| `kick` ✅ #104 | bool, flanco | Flanco de golpe (B o tecla) con abajo fuerte (el mismo criterio que `drop`). Deja `punch` en falso. El juego lo usa como patada en el aire y como `punch` en el piso |
| `fire` | bool, mantenido | RT, tecla de disparo o botón izquierdo (J1) |
| `action` | bool, flanco | A o RT, tecla de disparo, clic (J1). Solo menús y revancha |
| `punch` | bool, flanco | B o tecla de golpe, **salvo** que haya `kick`. Con #104 es el toque del combo y el golpe en el aire |
| `grapple` | bool, mantenido | X o tecla de gancho o botón derecho (J1). `Grapple` deriva el flanco |
| `weaponStep` | −1, 0, +1 | −1 al **soltar** LB (o la tecla) antes de `TAP_MAX`; +1 en el flanco de RB (o la tecla) |
| `wheel` | `{ open, x, y }` o `null` | `open` desde que LB (o la tecla) lleva `TAP_MAX` apretado. `x`, `y` es la dirección del stick derecho (Y arriba) o de las teclas de dirección; (0, 0) dentro de la zona muerta (0,4) |
| `wheelPick` | `{ x, y }`, `"cancel"` o `null` | Solo en el `poll` en que se suelta LB con la rueda abierta: la dirección en ese momento, o `"cancel"` si estaba al centro. El juego la convierte en el sector del arma (las armas del inventario repartidas en sectores iguales, empezando arriba en sentido horario) |
| `weapon` | 1–4 o `null` | Flanco de la cruceta o de las teclas numéricas: posición en la tabla de armas |
| `aim` | `{ x, y }` o `null` | Stick derecho fuera de la zona muerta. **Mientras la rueda está abierta, vale `null`**: el stick elige arma y la mira conserva la dirección anterior |
| `pointer` | `{ x, y }` o `null` (solo J1) | Mouse como fuente de mira |
| `ragdoll` 🔨 M5 | bool, flanco | Y o tecla |
| `pause` ✅ #82 | bool, flanco | Start o Escape (§10.4) |

**Umbral del toque corto (`TAP_MAX`) = 0,25 s.** Un toque deliberado dura 0,1–0,2 s. Con 0,25 s, el arma anterior responde al soltar (como mucho 0,25 s de demora) y la rueda se abre sin una espera molesta. Es un dato exportado de `Input.js`.

**Sin pisar al gamepad:**
- Los mantenidos y los flancos son un O entre fuentes: ninguna fuente escribe `false` sobre otra.
- La rueda la decide la fuente que la abrió: si LB está apretado, Q no la cierra ni cambia su dirección. El stick derecho gana sobre las teclas de dirección.
- El mouse solo apunta si se movió después del último uso del stick (como hoy).
- El botón derecho del mouse ya no abre el menú contextual (`preventDefault` en `contextmenu` cuando el juego tiene foco).
- Las teclas de dirección del teclado mueven al robot aunque la rueda esté abierta: el juego sigue corriendo.
- ✅ #104: `block` es un O entre LT y la tecla; soltar la tecla no corta el bloqueo si LT sigue apretado. `roll` y `kick` se derivan después de combinar todas las fuentes, como `drop`: LT del gamepad + W del teclado también rueda.
- ✅ #104: el flanco de `roll` se guarda hasta el próximo paso fijo con el mismo mecanismo que `jump` y `drop` (`jumpPending`), porque es movimiento ([03 §3.7.7](03-robots.md#377-ubicación-en-los-patrones)).

**Conflictos revisados (#104):** LT (`buttons[6]`) no tenía uso. `ShiftLeft` y `ShiftRight` no tienen otro uso en esta tabla ni en `KEYBOARD_LAYOUT` (`src/input/Input.js`). S + F no choca con `drop` (S + W); Shift + W es `roll` y gana sobre `jump`. Y queda reservado para el modo ragdoll (M5). **Bloqueo en Shift:** el bloqueo de teclado es Shift, izquierdo o derecho (`KEYBOARD_LAYOUT` y `src/ui/menu.js`).

## 10.3 Disparo mantenido ✅ #13

`Input` entrega dos señales por jugador:

| Campo | Tipo | Quién lo usa |
|---|---|---|
| `fire` | **Mantenido**: verdadero en cada `poll()` mientras alguna fuente lo tenga apretado | Emisor de chorros (`src/combat/weapons.js`) |
| `action` | **Flanco**: verdadero solo en el `poll()` en que se apretó | `Match` (revancha). No dispara |

- **Fuentes de `fire`:** con el remapeo, solo `buttons[7]` (RT) del gamepad, porque A pasa a ser salto. También la tecla de disparo en `held` y, solo para el J1, el botón izquierdo del mouse (`mousedown` → verdadero, `mouseup` → falso; `blur` lo limpia).
- **Revancha e inicio de ronda:** siguen con `action` (flanco). Para que el mismo botón no empiece a vaciar el tanque al arrancar, el emisor exige un frame con `fire` en falso después de cada reinicio ([04-fluidos](04-fluidos.md#disparo-continuo-con-tanque--13)).
- **Arma directa:** `state.weapon` es la **posición en la tabla** de armas (1 = primera fila), no el `id`. La raíz de composición la convierte en `WEAPONS[n−1].id` si esa arma está en el inventario.

## 10.4 Pausa ✅ #82

La pausa es un menú que abre cualquier jugador con Start (cualquier gamepad real) o Escape durante `countdown` o `playing`. La pausa consensuada (pedido y aceptación del otro jugador) queda descartada.
- `Match` pasa al estado `paused` y guarda el de origen (`resumeState`); `resume` vuelve exactamente a él y `quit` lleva al título como el Start del fin de partida.
- Mientras está en pausa no avanzan los pasos de física, el reloj de ronda, el input de los jugadores ni los bots; el juego se sigue dibujando con el HUD debajo del velo.
- Filas (con `Input.menu`): Continuar (también Start, Escape o B), Controles (abre la pantalla de controles; B vuelve a la pausa) y Menú (salir al título).

## 10.5 Debug

**Un solo botón (#258):** L3 + R3 apretados a la vez (clic de los dos sticks; botones que el juego no usa y difíciles de apretar sin querer) o F3 abren y cierran el **menú de debug**. Select no se usa para no confundirlo con los menús, y LB no porque abre la rueda. En la pantalla de título el botón no hace nada.

- **Filas:** Estadísticas (sí/no), Fluidos (metaball/puntos/ambos) y las capas Velocidades, Fuerzas, Columnas y Bots (sí/no cada una). Al empezar está todo apagado y los fluidos en metaball.
- **Navegación:** con los controles del menú (`MENU_CONTROLS`): arriba/abajo elige la fila, izquierda/derecha o confirmar cambia el valor, y atrás o el mismo botón cierran.
- **Pausa:** con el menú abierto la simulación no avanza ni lee el input de los jugadores, pero se sigue dibujando. Al cerrar, las opciones quedan activas. Las estadísticas se ven solo con el menú abierto.
- **Puntos:** cada partícula es un círculo de su radio físico, del color de su material y sin el filtro de umbral. Las capas de vectores van con trazo de 1 px y alfa 0,5.

Lo lee `debug.js` desde la raíz de composición; no es una intención de juego ([14.12](14-agua.md#1412-herramientas-de-debug)).
