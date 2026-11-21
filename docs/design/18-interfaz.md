# Waterbots · especificación de interfaz

Maqueta: `interfaz/maqueta.html`. Vale para estilo (colores, tipografía, glifos, foco). **Si la maqueta y este archivo no coinciden en tamaños o textos, manda este archivo.**

Todas las medidas están en **px de referencia sobre 1920 × 1080** y escalan con el canvas: `px_real = px_ref × --u`, con `--u: calc(min(100cqw / 1920, 100cqh / 1080))` en un contenedor `container-type: size`.

Capas: canvas del juego → canvas de partículas → **capa de interfaz (HTML)** con `pointer-events: none` salvo en menús.

## 0. Principios

1. **Íconos y estados antes que palabras.** Una palabra queda solo si sin ella no se entiende la acción. Hoy quedan: el logo, "J1"/"J2" en las insignias, "¡YA!", los nombres de acción en la pantalla de controles y las unidades "%" y "m".
2. **La interfaz acompaña al robot, no lo domina.** Escala de referencia: el robot mide ~1,2 m. Con la cámara (40 px/m × zoom, zoom 0,84–1,6 a 1080 de alto) ocupa **~41 px ref con el Clásico completo en pantalla**, hasta ~77 px con el zoom máximo, y ~32 px en Infinito (vista de 40 m). Regla: nada del HUD de partida pasa de **1,8 veces el alto del robot en la vista completa del Clásico (≈ 72 px)**, salvo los carteles de cuenta regresiva y fin de ronda, que aparecen cuando no se pelea.
3. **Visibilidad por estado.** La capa de HUD de partida (paneles, marcador, aviso, medidor, daño) se muestra solo en `countdown`, `playing`, `roundEnd` y `matchEnd`. En el menú, en controles y en la asignación queda oculta (`display: none`, no solo transparente).
4. **Amarillo (`--focus`) solo para foco y acción primaria.** El daño nunca usa amarillo ni brillo dorado.

## 1. Tokens

### Color

| Token | Valor | Uso |
|---|---|---|
| `--p1` / `--p1-ink` | `#ff9933` / `#1f1103` | J1: insignia, franja, barra, rombos, fichas. `-ink` = texto sobre el color |
| `--p2` / `--p2-ink` | `#33b5ff` / `#03182a` | J2, ídem |
| `--p1-soft` / `--p2-soft` | color al 22 % | Fondo degradado de columnas de jugador |
| `--panel` | `rgba(11,12,19,.86)` | Fondo de todo panel sobre el escenario |
| `--panel-2` / `--panel-3` | `#161824` / `#1f2230` | Superficies sólidas, fichas |
| `--line` / `--line-2` | blanco 10 % / 24 % | Bordes en reposo / bordes marcados, vacío de barras |
| `--scrim` | `rgba(8,9,14,.62)` | Velo sobre el escenario en menús (controles: .82) |
| `--text` / `--text-2` / `--text-3` | `#f3f5fa` / `#b4b8c8` / `#737889` | Primario / secundario / apagado |
| `--focus` / `--focus-ink` | `#ffd84a` / `#1d1600` | **Solo foco y acción primaria** |
| `--danger` | `#ff4d5e` | Vida baja, zona de peligro del medidor |
| `--hazard` | `#ffcc44` | Franjas del aviso de inundación próxima (siempre con franjas, nunca liso) |
| `--flood` | `#40dcff` | Ícono de inundación en curso / agua que sube |
| `--chip` | `#ffffff` | Tramo de vida recién perdida |
| `--heat-0` … `--heat-3` | `#ffffff` `#ffc9a0` `#ff7a3d` `#ff2e3e` | **Rampa de calor del daño** (§3.7): 0 / 100 / 250 / 500 % |
| `--w-agua` `--w-acido` `--w-lava` `--w-miel` | `#5aaaff` `#32ff32` `#ff5014` `#ffc832` | Ícono y tanque del arma (los de `WEAPONS`) |
| `--g-a` `--g-b` `--g-x` `--g-y` | `#6bd66b` `#ff6060` `#4fa8ff` `#ffd84a` | Glifos de botones frontales |

Regla: el color de un jugador siempre va con su insignia "J1"/"J2" o con su lado de pantalla, porque miel ≈ naranja y agua ≈ celeste. Las armas se distinguen además por ícono.

### Tipografía (Google Fonts)

- **Chakra Petch 700** (`--font-display`): logo, números, insignias, glifos, "¡YA!". `font-variant-numeric: tabular-nums` en todo número que cambia.
- **Barlow Semi Condensed 600/700** (`--font-ui`): nombres de acción en controles.

| Rol | Tamaño ref |
|---|---|
| Logo | 120 itálica |
| Número de cuenta regresiva | 120 |
| "¡YA!" | 130 itálica |
| Número de vida / % en el panel | 36 |
| Reloj del marcador | 28 |
| Número flotante de daño | 32 |
| Acción en controles | 28 |
| Altura en ficha del medidor | 18 |
| Mínimo absoluto | 16 (≈ 11 px a 1280 × 720) |

### Íconos

SVG en `<symbol>` de 24 × 24, trazo 2,5 redondeado, `currentColor`. Existentes: `i-agua`, `i-acido`, `i-lava`, `i-miel`, `i-puno`, `i-wave`, `i-up`. Nuevos:

| Ícono | Dibujo | Reemplaza |
|---|---|---|
| `i-map` | mapa plegado en tres | etiqueta "Mapa" |
| `i-bot` | cabeza de robot con antena | etiqueta "Bot", estado "BOT" |
| `i-dummy` | maniquí sobre poste | valor "Muñeco" |
| `i-pip` | punto lleno / vacío | valores Fácil · Normal · Difícil (1, 2 o 3 llenos de 3) |
| `i-pad` / `i-kb` | gamepad / teclado | fila "Controles", pestañas, fichas de dispositivo |
| `i-play` | triángulo ▶ | botón "JUGAR", "Empezar" |
| `i-back` | flecha curva hacia la izquierda | "Volver" |
| `i-ok` | tilde | "Aceptar", estado "LISTO" |
| `i-plus` | + | "Sumarte" |
| `i-swap` | flechas ◀ ▶ | "Mover tu control", "Cambiar" |
| `i-updown` | flechas ▲ ▼ | "Elegir" |
| `i-retry` | flecha circular ↻ | "REVANCHA" |
| `i-home` | casita | "MENÚ" |
| `i-crown` | corona | "GANA LA PARTIDA" |
| `i-hold` | arco de reloj alrededor del glifo | "(mantener)" |
| `i-bolt` | rayo | "VIDA" en el premio de etapa |
| `i-tank` | tanque con nivel | "TANQUES" en el premio de etapa |

### Glifos de botones

- **Gamepad** (`.g`, estilo Xbox): frontales = círculo con borde 3 y letra del color del botón sobre `#1c1e29`. LB/RB = rectángulo, esquinas superiores redondeadas. LT/RT = ídem, más alto. Sticks = círculo con anillo interior y L/R. Cruceta = cruz. Start = píldora con `≡`. Tamaños: 46 (controles), 36 (barra de ayuda).
- **Teclado** (`.k`): tecla clara (`#e9ebf2 → #c9ccd8`), borde inferior 4 `#8d91a3`, alto 40 (34 en listas), texto `#12131a`. Mouse: píldora con el botón marcado.
- Barra de ayuda y botones: se muestran los glifos del dispositivo que se usó por última vez **en esa pantalla** (si nadie tocó nada, gamepad). En la partida no hay glifos.
- **Par glifo + ícono** (`.hint`): glifo 36 + ícono 28 `--text-2`, separación 8; entre pares, 36. Reemplaza toda frase de ayuda.

## 2. Componentes y estados

| Componente | Reposo | Foco | Activo | Deshabilitado |
|---|---|---|---|---|
| Selector (fila) | `--panel`, borde 3 `--line`, ícono de fila `--text-3`, flechas ◀ ▶ al 45 % | Borde `--focus`, halo 4 al 18 %, barra 6 × 56 % a la izquierda, ícono y flechas `--focus` | Puntito del valor actual blanco (amarillo con foco) | Valor al 40 %, flecha de ese lado apagada; se saltea al cambiar |
| Botón primario (▶, ↻) | `--panel-3`, borde `--line-2`, ícono 48 | Fondo `--focus`, ícono `--focus-ink`, halo 6 | — | 40 %, barra inferior 6 que se vacía (bloqueo de 1 s) |
| Fila-enlace (controles) | Como selector, sin flechas, íconos `i-pad` + `i-kb` | Igual que selector | — | — |
| Pestaña (`.seg`) | `--panel`, ícono `--text-2` | — | Fondo `--focus`, ícono `--focus-ink` | — |
| Ficha de dispositivo | Sumada: `--panel-3`, borde del jugador + franja interior 6 | — | — | Sin sumar: borde punteado, 78 %, glifo A + `i-plus` respirando (1,6 s) |

Navegación: arriba/abajo cambia de fila con repetición, izquierda/derecha cambia valor, A confirma, B vuelve. El foco nunca desaparece de la pantalla.

## 3. Pantallas

### 3.1 Menú principal
- Escenario de fondo con `--scrim` y viñeta. Logo "WATERBOTS" centrado en y 150. Sin subtítulo.
- Columna centrada de 560 de ancho, desde y 340, separación 14. Foco por defecto en ▶.

| Fila | Alto | Ícono de fila | Valores |
|---|---|---|---|
| Mapa | 120 | `i-map` | Miniatura 160 × 90 del mapa (Clásico: pileta entre dos plataformas; Infinito: plataformas escalonadas con agua abajo e `i-up`). Sin nombre ni descripción |
| Bot | 88 | `i-bot` | Fácil · Normal · Difícil = 1 · 2 · 3 de 3 `i-pip` (24, separación 10, llenos `--text`, vacíos `--line-2`); Muñeco = `i-dummy` 36 |
| Controles | 76 | `i-pad` + `i-kb` | Fila-enlace: abre 3.2 |
| ▶ | 104 | — | Botón primario, `i-play` 48: abre 3.3 |

- Barra de ayuda centrada a 34 del borde inferior: `[cruceta] i-updown · [L] i-swap · [A] i-ok`.
- Datos: `Menu.view` (filas, valor elegido, deshabilitados); orden de filas de la tabla `MENU`.

### 3.2 Controles
Pantalla propia sin título. Arriba al centro (y 60), dos pestañas de 120 × 64 con `i-pad` y `i-kb`, flanqueadas por los glifos LB y RB. LB/RB cambian de pestaña, B vuelve. Barra de ayuda: `[LB][RB] i-swap · [B] i-back`.

**Pestaña gamepad**
- Dibujo del gamepad centrado (600 × 420 en x 660, y 250). Llamadas a izquierda (borde derecho en x 550) y derecha (desde x 1370), cada una 52 de alto: glifo 46 + **una palabra** de acción (28, `--text`). Línea de 2 px blanca al 28 % hasta el botón. Lo que hay que mantener lleva `i-hold` sobre el glifo, sin texto.
- Izquierda: LT `i-hold` Bloquear · LB `i-hold` + ◀ `i-agua` (arma anterior; mantener abre la rueda) · L Moverse · Cruceta: cruz con los cuatro íconos de arma en sus puntas (↑ agua, → ácido, ↓ lava, ← miel), sin palabra.
- Derecha: RT `i-hold` Disparar · RB `i-agua` ▶ (arma siguiente) · X `i-hold` Gancho · B Golpe · A Saltar · R Apuntar. **Y no se muestra** (sin uso).
- Combinaciones: 4 tarjetas en y 760, ancho total 1500, alto 96: glifos encadenados con "+" (o repetidos) y una palabra debajo: LT + A Rodar · ↓ + A Bajar · ↓ + B con un ícono chico (24) de robot en el aire Patada · B B B Combo.

**Pestaña teclado y mouse** (solo J1)
- Una tarjeta centrada de 900 de ancho, borde superior 8 `--p1`, insignia J1 52 arriba a la izquierda. Una acción por fila (alto 46): teclas a la izquierda (columna de 260), palabra de acción a la derecha, mismas palabras que la pestaña gamepad. Datos del GDD [10.1](10-controles.md). Bloquear es G.

### 3.3 Asignación de controles
- Sin título. Arriba al centro (y 50): miniatura del mapa elegido 96 × 54 + `i-bot` con sus `i-pip` (o `i-dummy`), al 70 %: recuerda lo elegido sin texto.
- Grilla x 170–1750, y 150, alto 700: **J1** (1fr) · **bandeja** (300) · **J2** (1fr), separación 40.
- Columna de jugador: borde superior 8 del color, degradado `--pN-soft`, insignia 88 arriba al centro. Estado a la derecha de la insignia (40): `i-ok` en `--g-a` si tiene al menos un dispositivo sumado; si no, `i-bot` + `i-pip` de la dificultad, y la columna pasa a borde punteado con robot fantasma al 14 %.
- Bandeja: solo el contorno punteado `--line-2`, sin texto ni ícono. Las fichas van en vertical.
- Ficha de dispositivo (88 alto, 240 ancho): `i-pad` 40 + número de gamepad (36, `--font-display`), o `i-kb` 40 (teclado y mouse es una sola ficha). Flechas ◀ ▶ a los costados; la que apunta a la pared, y en la ficha del teclado la que apunta a J2, al 25 %. Sumada / sin sumar según §2.
- Al moverse, la ficha se desliza a la columna nueva (180 ms, `ease-out`).
- Barra de ayuda: `[L] i-swap · [A] i-plus · [Start] i-play · [B] i-back`.
- Datos: `ControlsScreen.view` → `columns`, `devices[{label, column, joined}]`, `bots`; dificultad de `Menu.choice`.

### 3.4 HUD de partida (común a los dos mapas)
**Paneles de jugador arriba** (abajo están la pileta y el agua).
- J1: x 16, y 16, **420 × 72** (6,7 % del alto y 22 % del ancho; 1,75 veces el robot en la vista completa del Clásico). `--panel`, franja interior izquierda 4 `--p1`, esquina inferior derecha cortada 26. J2 espejado.
- Insignia **52** ("J1"/"J2", 26, color lleno, texto `-ink`, radio 6).
- Fila 1 (alto 36): barra **300 × 16** + número 36.
- Fila 2 (alto 16): ícono del arma 22 + tanque **140 × 6** del color del arma.
  - **Tanque vacío:** el tanque queda vacío (solo el borde `--line-2`) y el ícono del arma baja a 35 % de opacidad, sin color. Sin texto.
  - **Sin arma:** `i-puno` 22 en `--text-2`, sin tanque. Sin texto.

**Marcador central** (centrado, y 16, alto 56): caja `--panel` con rombos de J1 (izq.) · reloj 28 · rombos de J2 (der.). Rombo 16 girado 45°: vacío = borde blanco 28 %; ganado = lleno del color con brillo 8. Cantidad = `match.winsNeeded`; llenos = `match.wins[k]`. Sin "AL MEJOR DE 3" ni "RONDA N": los rombos dicen las dos cosas.

**Aviso bajo el marcador** (y 80, alto 40, centrado):
- Clásico desde `floodStart − 10`: `i-wave` 26 + segundos que faltan (28) sobre franjas `--hazard`, en `--focus-ink`.
- Clásico desde `floodStart`: `i-wave` 26 `--flood` latiendo (0,8 s) sobre `--panel`.
- Infinito, desde que el agua sube: `i-wave` + `i-up` en `--flood` sobre `--panel`.

**Premio de etapa** (Infinito): ficha centrada en y 130, alto 48, borde del ganador: insignia 36 + `i-bolt` + `i-tank` (28, `--text`). Entra en 0,24 s, se queda `stagePrize.banner` s, sale en 0,3 s.

Todo el HUD de partida queda por encima de y 128, salvo el medidor de Infinito y lo que va sobre los robots.

### 3.5 Clásico: vida
- Barra 16 de alto, sesgada −14° (J2 +14°), fondo blanco 7 %, borde 2 `--line-2`, marcas negras cada 25. Relleno = degradado del color del jugador, ancho `hp/100`. J2 se vacía hacia el centro.
- `hp < 30`: relleno y número `--danger`, latido de brillo 0,8 s. La insignia mantiene el color del jugador.
- Número: `Math.ceil(hp)`, sin "%".

### 3.6 Infinito: % de daño y medidor de altura
- Número `Math.floor(damagePct)` + "%" a la mitad de tamaño, coloreado con la **rampa de calor** (§3.7). Debajo, barra 300 × 6 hasta `KNOCKBACK.maxPct` (500), marcas cada 100, relleno con la misma rampa. Sin "empuje ×N".
- **Medidor vertical** a la derecha: x 1810–1904, y 128–968, fondo `--panel` (56 de ancho detrás de la pista, radio 8).
  - Pista 10 de ancho. Ventana de 60 m que sigue al agua: abajo = superficie − 5 m, arriba = superficie + 55 m.
  - Agua: relleno desde abajo hasta la superficie, línea `#9ad6ff` de 3 e `i-wave` 18 `#9ad6ff` al lado. Zona de peligro: 0–4 m sobre el agua, degradado `--danger` 55 % → 0. Sin texto.
  - Raya de 16 por etapa (`CLIMB.stageHeight` = 15 m), sin etiqueta.
  - Ficha por jugador a la izquierda de la pista: 28 de alto, color del jugador, insignia 22 + altura entera (18) + "m" (16). Flecha hacia la pista. A < 4 m: latido `--danger` 0,7 s. Más arriba que la ventana: pegada arriba con `i-up`. Si se pisan, la de más abajo se corre lo justo.

### 3.7 Feedback de daño
**Número flotante + barrita sobre la cabeza + tramo blanco en el panel**, los tres a la vez. El daño se lee como algo malo en los dos mapas: misma forma, misma rampa de calor, nunca amarillo de foco ni brillo dorado.

- **Rampa de calor** (`--heat-0..3`), interpolada en RGB:
  - Infinito: `t = damagePct` de la víctima **después** del golpe; 0 % blanco → 100 % durazno → 250 % naranja rojizo → 500 % rojo.
  - Clásico: `t = (100 − hp) × 5` (el mismo recorrido de blanco a rojo entre vida llena y vida 0).
  - La usan el número flotante y el número y la barra del panel en Infinito.
- **Número flotante** en el torso, **32**, Chakra Petch 700, color de la rampa, contorno 2 `#2a0006`, sombra dura `0 2 0 rgba(0,0,0,.6)`. **Sin brillo.** Texto: Clásico "−12"; Infinito "12%" (**sin "+"**: el signo más se lee como premio).
- **Movimiento de golpe, no de premio:** entra en escala 1,3 → 1 en 0,08 s (sin rebote), **sacudón** horizontal ±4 px de 3 ciclos en 0,18 s, queda quieto y **cae** 16 mientras se desvanece en los últimos 0,4 s. Vida total 1 s. No sube.
- **Se agrupa por víctima:** el daño que llega mientras el número está visible se suma al mismo número, se recolorea con el `t` nuevo y repite el sacudón (sin escalar). Sin daño nuevo durante 0,6 s, se suelta y el próximo crea otro.
- **Barrita sobre la cabeza** (solo Clásico): **64 × 8**, sesgada, 28 sobre la cabeza; color del jugador + tramo blanco de lo perdido. Visible 1,5 s desde el último daño; se va en 0,3 s. En metros del mundo convertidos con la cámara.
- **Panel:** el tramo blanco (`--chip`) queda en el ancho anterior 0,4 s y se vacía hasta el actual en 0,5 s (`ease-in`). El panel tiembla 3 px, 0,15 s, solo si el daño agrupado supera 5.

### 3.8 Cuenta regresiva
- Velo 35 %. Sin "RONDA N". Emblema de **200** de diámetro centrado (y 540): anillo `--focus` que se vacía en 1 s (máscara radial 62 %), núcleo `--panel`, número 120.
- Cada número entra en escala 1,5 → 1 en 0,18 s con un rebote.
- "¡YA!": 130 itálica, `--focus`, brillo; entra escala 1,4 → 1 en 0,15 s y se desvanece hasta los 0,6 s. Sin emblema.
- El HUD de partida ya está visible durante la cuenta.

### 3.9 Fin de ronda
- Banda centrada en y 540, alto **200**, negra al 82 % que se desvanece en el 18 % de cada costado; líneas de 4 arriba y abajo del color del ganador.
- Contenido en una fila: insignia del ganador **96** (entra deslizándose 60 en 0,45 s) · rombos 28 de los dos jugadores, con el recién ganado haciendo su animación · marcador "0 – 1" (40, dígitos en su color).
- El rombo ganado aparece a la vez en la banda y en el marcador de arriba (escala 0,4 → 1,15 → 1, 0,5 s).
- Empate: líneas grises, las dos insignias al 50 % con "=" (40, `--text-3`) entre ellas, ningún rombo nuevo.
- Sin texto de causa ni de próxima ronda: la banda dura lo que dure `match.banner`.

### 3.10 Fin de partida
- Velo completo 86 % con brillo radial del color del ganador al 16 %.
- Centro: `i-crown` 72 en el color del ganador sobre la insignia 150 con brillo · marcador 110 (perdedor `--text-3`, ganador en su color) con rombos.
- Botones 200 × 92, separación 24: **[A] `i-retry`** (primario, foco) y **[Start] `i-home`** (secundario). Ícono 48 + glifo 36. Con teclado, los glifos pasan a Enter y Esc (regla de glifos de §1). Sin texto debajo.
- Bloqueo del primer segundo: los dos al 40 % con barra inferior que se vacía en 1 s.

## 4. Sonidos de interfaz

Archivos en `audio/ui/` (los `menu_*.wav` no se usan). Un solo sonido de interfaz a la vez: uno nuevo corta al anterior. La navegación con repetición suena como mucho una vez cada 70 ms. Volumen de interfaz −6 dB respecto de los golpes.

| Evento | Sonido |
|---|---|
| Mover el foco (fila en menú, llamada en controles) | `ui_select` |
| Cambiar un valor de selector (◀ ▶) | `ui_submit1` |
| Cambiar de pestaña en controles (LB/RB) | `ui_submit2` |
| Abrir controles o pasar a la asignación (A sobre la fila-enlace o ▶) | `ui_confirm` |
| Volver (B, Esc, `i-home` en fin de partida) | `ui_back` |
| Empezar la partida (Start en la asignación) y revancha | `ui_play` |
| Sumar un dispositivo (A en la asignación) o conectar un gamepad | `ui_player_join` |
| Quitar un dispositivo (vuelve a la bandeja) o desconectar un gamepad | `ui_player_leave` |
| Mover una ficha de columna | `ui_player_select` |
| Cada número de la cuenta regresiva (3, 2, 1) | `ui_countdown` |
| "¡YA!" | `ui_submit3` (provisorio) |
| Abrir y cerrar el menú de debug (pausa) | `ui_pause` |
| Aviso de inundación próxima (aparece el número) | `ui_submit4` (provisorio) |
| Premio de etapa (Infinito) | `ui_submit5` |
| Banda de fin de ronda (al entrar la insignia) | `ui_submit6` (provisorio) |
| Intento sobre algo deshabilitado (valor bloqueado, flecha contra la pared, botón en su segundo de bloqueo) | `ui_submit7` (provisorio) |

Las asignaciones `ui_submitN` son por nombre, sin escucharlas: se confirman al oírlas en el juego.

**Faltan** (pedir al usuario): un **error/bloqueado** corto y grave; un **"¡YA!"** distinto de la cuenta; un **remate de fin de ronda**; una **fanfarria de fin de partida**; una **alarma de inundación**. Cuando lleguen, reemplazan a los provisorios.

## 5. Animaciones (resumen)

| Qué | Duración | Curva |
|---|---|---|
| Cambio de foco en menú | 120 ms | `ease-out` |
| Cambio de valor en selector | 150 ms, el valor entra deslizándose 20 desde el lado de la flecha | `ease-out` |
| Ficha de dispositivo que cambia de columna | 180 ms | `ease-out` |
| Glifo A + `i-plus` sin sumar | 1,6 s respiración en bucle | `ease-in-out` |
| Número flotante de daño | entrada 0,08 s, sacudón 0,18 s, total 1 s | entrada `ease-out`, sacudón lineal |
| Tramo blanco de vida | espera 0,4 s, vacía en 0,5 s | `ease-in` |
| Temblor del panel | 150 ms | lineal |
| Vida baja / ficha en peligro / inundación en curso | 0,8 s / 0,7 s / 0,8 s en bucle | `ease-in-out` |
| Cuenta regresiva | 1 s por número, entrada 0,18 s | `cubic-bezier(.2,1.4,.4,1)` |
| "¡YA!" | 0,6 s | `ease-out` |
| Rombo ganado | 0,5 s | `cubic-bezier(.2,1.6,.4,1)` |
| Insignia del ganador | 0,45 s | `cubic-bezier(.2,1,.3,1)` |
| Ficha de premio de etapa | entra 0,24 s, sale 0,3 s | `ease-out` |

Con `prefers-reduced-motion: reduce`: sin temblor, sacudón, latidos ni rebotes; el número flotante aparece y se desvanece sin moverse.

## 6. Legibilidad (criterios para revisar en el juego)
- Todo número del HUD va sobre `--panel`, salvo el número flotante (con contorno).
- Contraste mínimo 4,5:1 para números y 3:1 para barras, íconos y fichas contra su fondo.
- Con el Clásico completo en pantalla, cada panel ocupa ≤ 22 % del ancho y ≤ 7 % del alto, y nada del HUD de partida baja de y 128 salvo el medidor (borde derecho, 94 de ancho) y lo que va sobre los robots.
- Ninguna palabra en el HUD de partida fuera de "J1"/"J2", "¡YA!", "%" y "m".

## Decisiones del game designer (20/11)

1. Glifos estilo Xbox (A/B/X/Y) para todos los controles.
2. Un solo dispositivo "Teclado y mouse" en la asignación: el teclado es solo de J1 ([10](10-controles.md)).
3. Medidor de Infinito: usa el mismo nivel de agua con el que el juego decide el ahogo. Ventana de 60 m y zona de peligro en los últimos 4 m.
4. Menú: "Dificultad" pasa a llamarse "Bot", Mapa va primero y se suma la fila "Controles".
5. Fin de ronda sin línea de causa.
6. "Muñeco" se muestra solo con el ícono de maniquí, sin descripción.
7. En Infinito se muestra solo el %, sin "empuje ×N".
8. Sin destello blanco del robot: alcanzan el número flotante y la barrita.
9. Ningún texto visible de la interfaz usa palabras de muerte biológica ("ahogar", "ahogo", "se ahogó"): los robots no se ahogan. Cuando un robot cae al agua se dice "cortocircuito"; la zona roja del medidor de Infinito no lleva texto, solo el degradado rojo. Los identificadores del código (`drown…`) no cambian: esto vale solo para el texto.
10. El teclado es solo de J1 y un solo jugador puede usar teclado y mouse a la vez: no hay teclado de J2. La pantalla de controles de teclado lleva una sola tarjeta.
11. La especificación manda sobre la maqueta, que no se actualiza. "¡YA!" queda como texto. Revancha y menú van solo con íconos (↻ y casita).
12. Los controles del gamepad van en una tabla igual a la del teclado (glifo y acción por fila, combinaciones al final), sin dibujo del gamepad.
