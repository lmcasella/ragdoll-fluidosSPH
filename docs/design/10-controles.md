# 10. Controles

**Gamepad primero:** el teclado y el mouse son respaldo y nunca pisan al gamepad. Los gamepads se asignan por orden de conexión (1.º → J1, 2.º → J2) y se combinan con el teclado del mismo jugador.

| | Mover | Saltar | Apuntar | Disparar (mantener ✅) | Golpe | Arma |
|---|---|---|---|---|---|---|
| Gamepad | Stick izquierdo / cruceta | Arriba | Stick derecho (conserva la dirección) | Mantener A / RT | X | LB / RB ✅ → rueda con LB 🔨 #15 |
| J1 teclado | A / D | W | Hacia donde camina (S: abajo) o mouse (solo si se movió después del último uso del stick) | Mantener Espacio (o el botón del mouse) | F | 1 / 2 / 3 / 4 ✅ → rueda con Q 🔨 #15 |
| J2 teclado | ← / → | ↑ | Hacia donde camina (↓: abajo) | Mantener Enter | Shift derecho | Num 1 / 2 / 3 / 4 ✅ → rueda con Ctrl derecho 🔨 #15 |

## 10.1 Disparo mantenido ✅ #13

`Input` entrega dos señales del mismo botón por jugador:

| Campo | Tipo | Quién lo usa |
|---|---|---|
| `fire` | **Mantenido**: verdadero en cada `poll()` mientras alguna fuente lo tenga apretado | Emisor de chorros (`js/weapons.js`) |
| `action` | **Flanco**: verdadero solo en el `poll()` en que se apretó | `Match` (revancha). Ya no dispara. Sin cambios |

- **Fuentes de `fire`:** gamepad `buttons[0]` o `buttons[7]` con `pressed`, tecla de disparo en `held` y, solo para el J1, el botón del mouse apretado (`mousedown` → verdadero, `mouseup` → falso, y `blur` lo limpia, igual que el teclado).
- **Sin pisar al gamepad:** `fire` es un O entre las fuentes. Una fuente de respaldo puede sumar disparo, pero nunca cancelar el del gamepad, porque ninguna escribe `false` sobre otra.
- **Revancha e inicio de ronda:** siguen con `action` (flanco). Para que el mismo botón no empiece a vaciar el tanque al arrancar, el emisor exige un frame con `fire` en falso después de cada reinicio ([04-fluidos](04-fluidos.md#disparo-continuo-con-tanque--13)).
- **Teclas numéricas:** `state.weapon` es la **posición en la tabla** de armas (1 = primera fila), no el `id`. La raíz de composición la convierte en `WEAPONS[n−1].id` si esa arma está en el inventario. LB / RB recorren las armas del inventario en el orden de la tabla, con vuelta, usando el largo de la tabla (no un `% 3` fijo).

**Cambios en camino:**
- **Rueda de armas** con LB (#15): reemplaza LB / RB y las teclas numéricas.
- **Revancha** al final de la partida: disparar (flanco de `action`) ✅.
