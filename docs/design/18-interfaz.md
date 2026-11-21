# Waterbots · especificación de interfaz

Maqueta: `maqueta.html` (misma carpeta). Todas las medidas están en **px de referencia sobre 1920 × 1080** y escalan con el canvas: `px_real = px_ref × (anchoCanvas / 1920)`. En HTML/CSS sobre el canvas: un contenedor 16:9 con `container-type: inline-size` y `--u: calc(100cqw / 1920)`; cada medida es `calc(N * var(--u))`.

Capas: canvas del juego → canvas de partículas → **capa HUD (HTML)** con `pointer-events: none` salvo en menús.

## 1. Tokens

### Color

| Token | Valor | Uso |
|---|---|---|
| `--p1` / `--p1-ink` | `#ff9933` / `#1f1103` | J1: insignia, borde, barra, rombos, fichas. `-ink` = texto sobre el color |
| `--p2` / `--p2-ink` | `#33b5ff` / `#03182a` | J2, ídem |
| `--p1-soft` / `--p2-soft` | color al 22 % | Fondo degradado de tarjetas de jugador |
| `--panel` | `rgba(11,12,19,.86)` | Fondo de todo panel sobre el escenario |
| `--panel-2` / `--panel-3` | `#161824` / `#1f2230` | Superficies sólidas, fichas |
| `--line` / `--line-2` | blanco 10 % / 24 % | Bordes en reposo / bordes marcados, vacío de barras |
| `--scrim` | `rgba(8,9,14,.62)` | Velo sobre el escenario en menús (controles: .82) |
| `--text` / `--text-2` / `--text-3` | `#f3f5fa` / `#b4b8c8` / `#737889` | Primario / secundario / ayuda y deshabilitado |
| `--focus` / `--focus-ink` | `#ffd84a` / `#1d1600` | **Solo foco y acción primaria.** Nunca identidad de jugador |
| `--danger` | `#ff4d5e` | Vida baja, VACÍO, zona de peligro del medidor |
| `--hazard` | `#ffcc44` | Aviso "Inundación en N" (con franjas) |
| `--flood` | `#40dcff` | "¡INUNDACIÓN!" / "EL AGUA SUBE" |
| `--chip` | `#ffffff` | Tramo de vida recién perdida |
| `--w-agua` `--w-acido` `--w-lava` `--w-miel` | `#5aaaff` `#32ff32` `#ff5014` `#ffc832` | Ícono y tanque del arma (los de `WEAPONS`) |
| `--g-a` `--g-b` `--g-x` `--g-y` | `#6bd66b` `#ff6060` `#4fa8ff` `#ffd84a` | Glifos de botones frontales |
| Escenario | `#1b1c26`, plataforma `#2b2c38` / borde `#4a4c5c`, agua `#2350a0` / superficie `#9ad6ff` | Solo para la maqueta |

Regla: el color de un jugador siempre va acompañado de "J1"/"J2" o de su lado de pantalla, porque miel ≈ naranja y agua ≈ celeste. Las armas se distinguen además por ícono (gota, gota con burbujas, llama, hexágono).

### Tipografía (Google Fonts)

- **Chakra Petch 700** (`--font-display`): títulos, números (vida, %, reloj, cuenta regresiva), insignias, glifos. `font-variant-numeric: tabular-nums` en todo número que cambia.
- **Barlow Semi Condensed 500/600/700** (`--font-ui`): etiquetas, ayudas, listas.

| Rol | Tamaño ref | Peso |
|---|---|---|
| Logo | 140 itálica | 700 |
| Título de pantalla | 58, `letter-spacing .06em` | 700 |
| Cartel grande (ganador) | 92 | 700 |
| Número de cuenta regresiva | 190 | 700 |
| Número de vida / % | 58 | 700 |
| Valor de selector | 36 | 700 |
| Acción en controles | 28 | 700 |
| Texto de HUD / ayuda | 22–24 | 600–700 |
| Microetiqueta (AL MEJOR DE 3, SIN JUGAR) | 17–22, mayúsculas, `letter-spacing .14–.3em` | 700 |
| Mínimo absoluto | 16 | — |

### Glifos

- **Gamepad** (`.g`): frontales = círculo 46 con borde 3 y letra del color del botón sobre `#1c1e29`. LB/RB = rectángulo 62 × 46, esquinas superiores 10. LT/RT = 56 × 52, esquinas superiores 20. Sticks = círculo con anillo interior, letra L/R o flecha. Cruceta = cruz. Start = píldora con `≡`. Tamaño chico (barra de ayuda, combos): 36.
- **Teclado** (`.k`): tecla clara (`#e9ebf2 → #c9ccd8`), borde inferior 4 `#8d91a3`, alto 40 (34 en listas), texto `#12131a`. Mouse: píldora.
- Se muestran los glifos del dispositivo que se usó por última vez **en esa pantalla** (si nadie tocó nada, gamepad). En la partida no hay glifos.

## 2. Componentes y estados

| Componente | Reposo | Foco | Seleccionado / activo | Deshabilitado |
|---|---|---|---|---|
| Selector (fila de menú) | `--panel`, borde 3 `--line`, etiqueta `--text-3`, flechas al 45 % | Borde `--focus`, halo 4 al 18 %, barra 6 × 56 % a la izquierda, etiqueta y flechas `--focus`, aparece la descripción | Puntito del valor actual blanco (amarillo con foco) | Valor al 40 %, flecha de ese lado apagada; se saltea al cambiar |
| Botón primario (JUGAR, REVANCHA) | `--panel-3`, borde `--line-2` | Fondo `--focus`, texto `--focus-ink`, halo 6 | — | 40 %, barra inferior 6 que se vacía (bloqueo de 1 s) |
| Fila-enlace (Controles) | Como selector, sin flechas | Igual que selector | — | — |
| Pestaña (`.seg`) | `--panel`, texto `--text-2` | — | Fondo `--focus` | — |
| Ficha de dispositivo | Sumada: `--panel-3`, borde del jugador + franja interior 6 | — | — | Sin sumar: borde punteado, 78 %, "A para sumarte" respirando (1,6 s) |

Navegación: arriba/abajo cambia de fila con repetición (como hoy), izquierda/derecha cambia valor, A confirma, B vuelve. El foco nunca desaparece de la pantalla.

## 3. Pantallas

### 3.1 Menú principal
- Escenario de fondo con `--scrim` y viñeta. Logo centrado (y 110), subtítulo y 250.
- Columna x 640–1280, desde y 330, separación 14:
  1. **Mapa** (selector 92 alto + descripción): miniatura 72 × 46 a la izquierda del valor. Descripción por valor: Clásico "Vida 100 · al mejor de 3 · se inunda a los 60 s"; Infinito "Subí antes que el agua · el daño suma % y empuje · solo el agua mata".
  2. **Bot** (hoy "Dificultad"): Fácil · Normal · Difícil · Muñeco.
  3. **Controles** (fila-enlace 76): abre 3.2.
  4. **JUGAR** (primario 104): abre 3.3. Foco por defecto al entrar.
- Barra de ayuda (centrada, a 34 del borde inferior): `L/cruceta Elegir · ↔ Cambiar · A Aceptar`.
- Datos: `Menu.view` (filas, valor elegido, deshabilitados). El orden de filas sale de la tabla `MENU`.

### 3.2 Controles (pantalla propia, dos pestañas; LB/RB cambian, B vuelve)
- **Gamepad:** dibujo del gamepad centrado (600 × 420 en x 660, y 290). Llamadas a izquierda (borde derecho en x 550) y derecha (desde x 1370), cada una 52 de alto con glifo + acción (28) + aclaración (20, `--text-3`), unidas al botón con línea de 2 px blanca al 28 %.
  - Izquierda: LT Bloquear (mantener) · LB Arma anterior (mantener: rueda) · L Moverse (abajo + A: bajar) · Cruceta Arma directa con ↑ agua → ácido ↓ lava ← miel.
  - Derecha: RT Disparar (mantener · gasta el tanque) · RB Arma siguiente · Y Sin uso (apagado) · X Gancho (mantener) · B Golpe (repetir: combo) · A Saltar · R Apuntar.
  - Combinaciones (4 tarjetas, y 790, ancho total 1660): LT+A Rodar · ↓+A Bajar · ↓+B en el aire Patada · B B B Combo.
- **Teclado:** dos tarjetas (J1 "Teclado y mouse", J2 "Flechas y teclado numérico") con borde superior del jugador; una acción por fila (alto 46) con teclas. Datos del GDD 10.1. El texto de `CONTROLS_HELP` actual queda obsoleto (dice Shift para bloquear; es G).

### 3.3 Asignación de controles ("¿QUIÉN JUEGA?")
- Título y 62; subtítulo con resumen "Mapa · Bot <dificultad>".
- Grilla x 170–1750, y 210, alto 640: **J1** (1fr) · **Sin jugar** (330, bandeja punteada) · **J2** (1fr), separación 40.
- Tarjeta de jugador: borde superior 8 del color, degradado `--pN-soft`, cabecera con insignia 88, "JUGADOR N" y estado: **LISTO** (verde `--g-a`) si tiene al menos un dispositivo sumado; **BOT** si no tiene ninguno. Robot fantasma de fondo al 14 %.
- Ficha de dispositivo 88 de alto: ícono (gamepad o teclado), nombre, estado ("sumado", "respaldo" para el teclado si comparte con un gamepad), flechas ◀ ▶ (la que apunta a la pared al 25 %). En la bandeja la ficha va en vertical.
- Jugador sin dispositivo: tarjeta punteada "BOT · Sin control: lo maneja el bot · <dificultad>" y "Mové un control hasta acá para jugar vos".
- Ayuda: `stick ↔ Mover tu control · A Sumarte · Start Empezar · B Volver`.
- Al moverse, la ficha se desliza a la columna nueva (180 ms, `ease-out`).
- Datos: `ControlsScreen.view` → `columns`, `devices[{label, column, joined}]`, `bots`; dificultad de `Menu.choice`.

### 3.4 HUD de partida (común a los dos mapas)
- **Paneles de jugador arriba**, no abajo: abajo están la pileta y el agua que sube, y el texto se perdía contra ellas.
  - J1: x 22, y 22, 700 × 128, `--panel`, franja interior izquierda 6 `--p1`, esquina inferior derecha cortada 44. J2 espejado.
  - Insignia 88 ("J1"/"J2", color lleno, texto `-ink`).
  - Fila 1: barra + número 58. Fila 2: arma (ícono 30 + nombre 22 + tanque 170 × 10 del color del arma). Tanque en 0: texto **VACÍO** `--danger` 18. Sin arma: puño `--text-3` + "Sin arma · solo golpe".
- **Marcador central** (centrado, y 18): microetiqueta "AL MEJOR DE 3"; caja `--panel` con rombos de J1 (izq.) · "RONDA N" + reloj 36 · rombos de J2 (der.). Rombo 24 girado 45°: vacío = borde blanco 28 %; ganado = lleno del color con brillo 12. Cantidad = `match.winsNeeded`; llenos = `match.wins[k]`.
- **Aviso bajo el marcador:** Clásico desde `floodStart − 10`: "INUNDACIÓN EN N" con franjas `--hazard`; desde `floodStart`: "¡INUNDACIÓN!" `--flood`. Infinito: "EL AGUA SUBE" `--flood` desde que empieza a subir.
- **Premio de etapa** (Infinito): ficha en y 200 centrada, borde del ganador, insignia chica + "ETAPA n · VIDA Y TANQUES". Entra en 0,24 s, se queda `stagePrize.banner` s, sale en 0,3 s.

### 3.5 Clásico: vida
- Barra 30 de alto, sesgada −14° (J2 +14°), fondo blanco 7 %, borde `--line-2`, marcas negras cada 25. Relleno = degradado del color del jugador, ancho `hp/100`. J2 se vacía hacia la derecha (hacia el centro).
- `hp < 30`: relleno y número `--danger`, latido de brillo 0,8 s. La insignia mantiene el color del jugador.
- Número: `Math.ceil(hp)`, sin "%" ni la palabra "Salud".

### 3.6 Infinito: % de daño y medidor de altura
- Número `Math.floor(damagePct)` + "%" a la mitad de tamaño. Color interpolado: 0 % `#ffffff` → 100 % `#ffe9a0` → 250 % `#ff8a6a` → 500 % `#ff4d5e`.
- Barra fina 8 hasta `KNOCKBACK.maxPct` (500), marcas cada 100, degradado blanco → `--focus` → `--danger`. Texto "empuje ×N,N" = `1 + KNOCKBACK.scale · %/100`, una cifra decimal con coma.
- **Medidor vertical** a la derecha: x 1752–1902, y 190–980, fondo `--panel` (78 de ancho detrás de la pista).
  - Pista 14 de ancho. **Ventana de 60 m que sigue al agua:** abajo = superficie del agua − 5 m, arriba = superficie + 55 m. La superficie es la del campo (`flood.level` o la curva; ver preguntas).
  - Agua: relleno desde abajo hasta la superficie, con línea `#9ad6ff` de 3. Zona de peligro: 0–4 m sobre el agua, degradado `--danger` 55 % → 0.
  - Rayas por etapa (`CLIMB.stageHeight` = 15 m) con etiqueta "E n" a la derecha; se mueven al subir el agua.
  - Ficha por jugador a la izquierda de la pista: 36 de alto, color del jugador, número del jugador + "N m" (altura del torso sobre el agua, entero). Flecha hacia la pista. Si está a < 4 m: latido rojo 0,7 s. Si está más arriba que la ventana: queda pegada arriba con "▲". Si las dos fichas se pisan, la de más abajo se corre hacia abajo lo justo para no tapar a la otra (la flecha sigue marcando la altura real).
  - Etiqueta "↑ AGUA" en `#9ad6ff` junto a la superficie.

### 3.7 Feedback de daño
Decisión: **número flotante + barrita sobre la cabeza + tramo blanco en el panel**, los tres a la vez.
- **Número flotante** en el torso, 46, blanco con contorno 2 oscuro y brillo `--danger` (Clásico "−12") o `--focus` (Infinito "+12 %"). **Se agrupa por víctima:** el daño que llega mientras el número está visible se suma al mismo número (los chorros dañan por tick y no puede haber una lluvia de "−1"). Al sumar, rebota a escala 1,25 en 0,1 s. Vida: 0,15 s de entrada (escala 0,6 → 1,25 → 1), sube 60 en 1,2 s, se desvanece los últimos 0,4 s. Sin daño nuevo durante 0,6 s, se suelta y el próximo daño crea otro.
- **Barrita sobre la cabeza** (solo Clásico): 96 × 12, sesgada, 40 sobre la cabeza; color del jugador + tramo blanco de lo perdido. Visible 1,5 s desde el último daño; se va en 0,3 s. Va en metros del mundo convertidos a píxeles con la cámara.
- **Panel:** el tramo blanco (`--chip`) queda en el ancho anterior 0,4 s y se vacía hasta el actual en 0,5 s (`ease-in`). El panel tiembla 4 px, 0,15 s, solo si el daño agrupado supera 5.
- **Robot:** destello blanco 0,1 s (en el canvas, si no rompe el render del robot).

### 3.8 Cuenta regresiva
- Velo 35 %. "RONDA N" (30, `letter-spacing .3em`) en y 330. Emblema de 300 de diámetro centrado: anillo `--focus` que se vacía en 1 s (máscara radial 62 %), núcleo `--panel`, número 190.
- Cada número entra en escala 1,5 → 1 en 0,18 s con un rebote.
- "¡YA!": Chakra Petch 700 itálica, `--focus`, 200, brillo; entra escala 1,4 → 1 en 0,15 s y se desvanece hasta los 0,6 s. Sin emblema.
- El HUD ya está visible durante la cuenta.

### 3.9 Fin de ronda
- Banda y 380, alto 290, negra al 82 % que se desvanece en el 18 % de cada costado; líneas de 4 arriba y abajo del color del ganador.
- "RONDA N" (22) · "**J2** GANA LA RONDA" (92, "J2" en su color; entra deslizándose 60 en 0,45 s) · rombos + "0 – 1" con dígitos en color · línea de causa y "Ronda N+1 en S" (22, `--text-3`).
- El rombo ganado aparece a la vez en la banda y en el marcador de arriba (escala 0,4 → 1,15 → 1, 0,5 s).
- Empate: líneas grises, "EMPATE", "nadie suma".
- Datos: `match.banner`, `match.wins`, ganador; causa solo si el juego la tiene (ver preguntas).

### 3.10 Fin de partida
- Velo completo 86 % con un brillo radial del color del ganador al 16 %.
- "PARTIDA TERMINADA" (24) · insignia 150 con brillo + "GANA LA PARTIDA" (92, dos líneas) · marcador 110 (perdedor `--text-3`, ganador en su color) con rombos · botones **A REVANCHA** (primario, foco) y **Start MENÚ** (secundario), 360 × 92.
- Bloqueo del primer segundo: los dos botones al 40 % con una barra inferior que se vacía en 1 s; después pasan a su estado normal. Debajo, en chico: "Teclado: Enter revancha · Esc menú".

## 4. Animaciones (resumen)

| Qué | Duración | Curva |
|---|---|---|
| Cambio de foco en menú | 120 ms (borde, fondo) | `ease-out` |
| Cambio de valor en selector | 150 ms, el valor entra deslizándose 20 desde el lado de la flecha | `ease-out` |
| Ficha de dispositivo que cambia de columna | 180 ms | `ease-out` |
| "A para sumarte" | 1,6 s respiración en bucle | `ease-in-out` |
| Número flotante de daño | 1,2–1,4 s | `ease-out` |
| Tramo blanco de vida | espera 0,4 s, vacía en 0,5 s | `ease-in` |
| Temblor del panel | 150 ms | lineal |
| Vida baja / ficha en peligro | 0,8 s / 0,7 s en bucle | `ease-in-out` |
| Cuenta regresiva | 1 s por número, entrada 0,18 s | `cubic-bezier(.2,1.4,.4,1)` |
| "¡YA!" | 0,6 s | `ease-out` |
| Rombo ganado | 0,5 s | `cubic-bezier(.2,1.6,.4,1)` |
| Cartel de ganador | 0,45 s | `cubic-bezier(.2,1,.3,1)` |
| Ficha de premio de etapa | entra 0,24 s, sale 0,3 s | `ease-out` |

Con `prefers-reduced-motion: reduce`: sin temblor, sin latidos ni rebotes; el número flotante aparece y se desvanece sin moverse.

## 5. Legibilidad (criterios para revisar en el juego)
- Todo texto de HUD va sobre `--panel`, nunca directo sobre el escenario o el agua.
- Contraste mínimo 4,5:1 para texto y 3:1 para barras y fichas contra su fondo.
- Nada del HUD por debajo de y 160 salvo el medidor de altura (borde derecho, 150 de ancho) y lo que va sobre los robots.
- A 1280 × 720 el texto más chico (16 ref) mide ~11 px: es el piso; no bajar de ahí.

## Decisiones del game designer (20/11)

1. Glifos estilo Xbox (A/B/X/Y) para todos los controles.
2. Un solo dispositivo "Teclado y mouse" en la asignación: el teclado es solo de J1 ([10](10-controles.md)).
3. Medidor de Infinito: usa el mismo nivel de agua con el que el juego decide el ahogo. Ventana de 60 m y zona de peligro en los últimos 4 m.
4. Menú: "Dificultad" pasa a llamarse "Bot", Mapa va primero y se suma la fila "Controles".
5. Fin de ronda sin línea de causa.
6. "Muñeco" lleva la descripción "no pelea".
7. En Infinito se muestra solo el %, sin "empuje ×N".
8. Sin destello blanco del robot: alcanzan el número flotante y la barrita.

La maqueta de referencia está en `docs/design/interfaz/maqueta.html`.
