# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/); versiones según [SemVer](https://semver.org/lang/es/).
Cada merge a `main` agrega su versión acá (ver `CLAUDE.md`). La primera entrada `## [x.y.z]` define la versión que publica el deploy.

## [Unreleased]

## [0.26.0] - 2026-11-19

### Added
- Menú principal antes de la partida, que se maneja con gamepad: stick izquierdo o cruceta arriba/abajo elige la fila, izquierda/derecha cambia el valor, y A o Start sobre Jugar arranca (B no hace nada en el menú raíz). Se elige el modo (1v1, Contra el bot o Bot contra bot), la dificultad del bot (Fácil, Normal o Difícil, que cambian su demora de reacción, su error de puntería y cuánto defiende) y el mapa (Clásico; Infinito aparece deshabilitado, "próximamente"). El teclado funciona de respaldo con flechas o WASD y Enter, y nunca pisa al gamepad. Mantener el stick repite con retardo, sin saltear filas. La última elección se recuerda en el navegador; si no se puede guardar, arranca con 1v1, Normal y Clásico. `?bot=2` y `?bot=1,2` siguen funcionando y preseleccionan el modo.

### Changed
- Al terminar la partida, Start vuelve al menú principal, que ahora es la pantalla de título. Los bots se crean al elegir Jugar y se quitan al volver al menú.

## [0.25.0] - 2026-11-19

### Added
- Bot de prueba para jugar solo: abrí `http://localhost:8080/?bot=2` y J2 lo maneja el bot (`?bot=1,2` pone un bot en cada lado). El bot usa un gamepad virtual: aprieta los mismos botones que una persona. Camina y salta entre las plataformas, sube cuando la inundación se acerca, bloquea o rueda hacia atrás cuando el rival golpea, golpea en el aire, encadena el combo con el rival aturdido y dispara con línea de vista. Si se conecta un gamepad real para ese jugador, el bot se apaga.

## [0.24.0] - 2026-11-19

### Added
- Las plataformas se atraviesan desde abajo: saltá desde abajo y quedás parado arriba, sin trabarte a medio cruzar. Para bajar de una plataforma, apretá abajo + A parado sobre ella (en el piso, abajo + A sigue siendo un salto). Los robots siguen chocando entre sí, con el piso y con las paredes, y los fluidos siguen apoyándose en las plataformas.

## [0.23.0] - 2026-11-19

### Added
- Los robots flotan. El agua empuja a cada pieza con el empuje de Arquímedes (también hacia los costados si la superficie tiene pendiente) y la frena con arrastre; el arrastre horizontal también mueve el agua. Los robots tienen flotación neutra: caer al agua no los hunde ni los hace subir solos, y una pieza más liviana que el agua flota y una más pesada se hunde. Las reglas de la pileta no cambian.

## [0.22.2] - 2026-11-19

### Fixed
- Las gotas que caen sobre piso seco forman un charco que deja de extenderse. Antes la película se estiraba sin parar en láminas más finas que un espesor posible (hasta 13 m a los 60 s con 10 gotas); ahora se junta y queda en unos 5 m.

## [0.22.1] - 2026-11-19

### Fixed
- El agua y las partículas ya no tapan el HUD, la mira láser ni los golpes. El HUD y los carteles se dibujan en una capa propia arriba de todo; la mira y los golpes, sobre los fluidos y debajo de la rueda de armas.

## [0.22.0] - 2026-11-19

### Added
- El juego se cierra sin recargar la página. Arranca en una pantalla de título (A, Start o Enter para empezar) y antes de cada ronda hay una cuenta regresiva de 3 s en la que nadie se mueve ni dispara, seguida de un ¡YA!. Al terminar la partida el cartel muestra el marcador: con A o disparar pedís la revancha y con Start (Escape en el teclado) volvés al título. Durante el primer segundo del cartel final los botones se ignoran, para no pedir la revancha sin querer.

## [0.21.0] - 2026-11-19

### Added
- El tercer golpe del combo rompe el bloqueo. Si el rival te está bloqueando de frente, los dos primeros golpes quedan bloqueados, pero el tercero rompe la guardia: no hace daño, lo empuja, lo deja aturdido 0,7 s sin poder volver a bloquear aunque mantenga el botón, y suena y se ve distinto (chispas naranjas más grandes).

## [0.20.0] - 2026-11-19

### Added
- Sonido y música. Suenan los golpes (con el quejido de quien los recibe), los golpes bloqueados, los pasos al caminar, el aterrizaje de una caída alta, la muerte de un robot, recoger un arma y el fin de la ronda. La música cambia sola: una pista durante la ronda, otra cuando empieza la inundación y otra en la pantalla de fin de partida, con un fundido de 1 s entre pistas. Los disparos y los fluidos todavía no hacen ruido. El navegador no deja sonar nada hasta que el jugador toca una tecla, hace clic o aprieta un botón del gamepad.

## [0.19.1] - 2026-11-19

### Fixed
- La rueda de armas elige solo con lo que apunta: el stick derecho o, en J1 con teclado, el mouse. Las teclas de movimiento ya no eligen sector.

## [0.19.0] - 2026-11-19

### Added
- Rueda de armas: mantené LB (Q en J1, Ctrl derecho en J2) más de 0,25 s y se abre un círculo alrededor del robot con las armas que tenés, con su tanque. Elegí con el stick derecho (W/A/S/D en J1, flechas en J2) y soltá LB para equipar; con el stick al centro se cancela. Mientras está abierta el juego sigue corriendo y la mira no se mueve. El toque corto de LB, RB y la cruceta funcionan igual que antes.

## [0.18.0] - 2026-11-19

### Added
- Armas recogibles en el mapa: el ácido, la lava y la miel aparecen como íconos sobre las plataformas; al tocarlos se suman al inventario con el tanque lleno (o rellenan el que ya tenés) y reaparecen a los 15 s. El agua también aparece sobre la plataforma de la pileta: es la única recarga dentro de la ronda.

### Changed
- Cada ronda empieza solo con el agua y su tanque lleno; el resto de las armas hay que recogerlas.

## [0.17.3] - 2026-11-19

### Changed
- Regla de trabajo: un agente que sigue con trabajo en segundo plano después de su informe no terminó y se frena antes de lanzar el siguiente.

## [0.17.2] - 2026-11-19

### Fixed
- Las gotas sueltas ya se ven desde que salen: el filtro que une las gotas las borraba hasta que se juntaban con otras o tocaban algo.

## [0.17.1] - 2026-11-19

### Fixed
- El agua, el ácido, la miel y la lava se dibujan con la cantidad que tienen en la física: la lluvia ya no forma pelotas al caer y el agua de lluvia y la de los disparos se ven iguales.

## [0.17.0] - 2026-11-19

### Added
- Robot nuevo (rig v5) con combo de tres golpes (B repetido), bloqueo (LT mantenido) que frena golpes de frente con un destello en el punto de impacto, roll (LT + A), golpe y patada en el aire (B y abajo + B), y salto con pose de aire según la dirección y caída alta.
- El segundo y el tercer golpe del combo dan un paso adelante para seguir al rival.

### Changed
- Respaldo de teclado: bloqueo de J1 en G (roll G + W) y golpe de J2 en Numpad 5, para no disparar el aviso de Teclas especiales de Windows con Shift.

## [0.16.0] - 2026-11-19

### Added
- El ácido que cae al agua del nivel ya no desaparece: el agua guarda su concentración, se tiñe según cuánto ácido tiene y cambia su densidad y conductividad.

## [0.15.7] - 2026-11-19

### Fixed
- La miel ya no se convierte en agua al caer a la pileta: se hunde, queda en el fondo como miel y sigue pegando.
- El agua con miel disuelta ya no pega.

## [0.15.6] - 2026-11-19

### Added
- Escenarios reportados al jugar como tests sobre la escena real (`tests/user-scenarios.test.js`): gotas que se estiran en película, miel que se vuelve agua, ácido que no cambia el agua y volumen dibujado distinto del real. Quedan como pendientes con su issue hasta que se arreglen; se pueden grabar con `USER_SCENARIOS_RECORD=<carpeta>`.

## [0.15.5] - 2026-11-19

### Added
- Tests permanentes de coherencia de los fluidos: masa por sustancia, identidad de cada material, volumen dibujado contra el físico y espesor mínimo del agua.
- Lo que hoy falla en esos tests figura como pendiente (`todo`) con el issue que lo arregla.
- El diseño del agua define el espesor mínimo de una lámina (`hMin` = 1,85 mm) y las especies de cada material.

## [0.15.4] - 2026-11-19

### Added
- Diseño de química (`docs/design/15-quimica.md`): cómo interactúan de verdad todas las sustancias del juego entre sí.

## [0.15.3] - 2026-11-19

### Added
- Referencias de estudio en `docs/referencias.md`: matemáticos, conceptos y algoritmos usados y descartados, con dónde se usan.

## [0.15.2] - 2026-11-19

### Changed
- Agente `chemist`: informa cómo interactúan de verdad las sustancias antes de diseñar cualquier interacción entre materiales.
- `physics-reviewer` pasa a `physics-analyst`: modela lo que decide el game designer y valida contra la física, los invariantes globales y los escenarios del usuario; las regresiones bloquean el merge.

## [0.15.1] - 2026-11-19

### Fixed
- Las partículas de agua y demás fluidos son más chicas (la mitad del radio) y livianas: una gota suelta ya no empuja ni levanta al robot ni le traba las piernas; hay la misma cantidad de agua en tanques y lluvia.
- El chorro sale en un solo carril con caudal algo menor (Agua y Ácido 155/s, Lava 111/s): el tanque dura más, el daño por segundo es el mismo y el chorro de agua empuja un 22 % menos.
- El chorro ya no gana energía al salir en monitores de 120/144 Hz o con frames irregulares.
- Las gotas apretadas entre el robot y el piso escurren hacia los costados en vez de sostenerlo.
- La miel disparada sobre las islas se integra al agua del campo y sigue pegando.

## [0.15.0] - 2026-11-18

### Changed
- La pileta y la inundación son agua con volumen y superficie continua: el nivel sube por conservación del agua que llueve, y las ondas viajan a la velocidad física. Las gotas que caen en ella se suman al agua.
- La lava que cae al agua se hunde despacio a velocidad terminal y arrastra la corriente; el agua, el ácido y la miel que caen se vuelven parte del agua.
- La lluvia sale del techo al caudal que pide la curva de la inundación (hasta 300 gotas/s) y se corta cuando el agua llega a 15 m. La que cae sobre una plataforma sigue como gotas hasta que escurre.
- Las reglas de la pileta no cambian: el sensor mata y la pileta no moja antes de la inundación.
- La miel que cae al piso o al agua deja de ser gotas y pasa a ser parte del agua: pega al robot que la pisa mientras sea la mitad o más del agua de esa zona.

## [0.14.0] - 2026-11-18

### Added
- Modelo de agua por volumen (campo de alturas de aguas someras): conserva el volumen, deja el lago en reposo exactamente quieto y maneja frentes secos y mojados. Todavía no se usa en el juego: la pileta sigue con partículas.

## [0.13.1] - 2026-11-18

### Fixed
- Las gotas del disparo vuelven a su tamaño anterior: se dibujaban un 37 % más grandes desde el cambio a agua pura. Siguen tocando a los robots y las paredes sin hueco.

## [0.13.0] - 2026-11-18

### Changed
- Controles nuevos del gamepad: el stick izquierdo mueve (la cruceta ya no mueve), A salta (arriba ya no salta), RT dispara (A ya no dispara), B golpea y X queda reservado para el gancho.
- Armas: LB con un toque corto elige el arma anterior, RB la siguiente y la cruceta elige directo (arriba 1, derecha 2, abajo 3, izquierda 4).
- Teclado de respaldo: salto en W (J1) y flecha arriba (J2); gancho en E (J1) y Num 0 (J2); arma anterior en Q (J1) y Ctrl derecho (J2), siguiente en R y Num +. El botón derecho del mouse ya no abre el menú contextual.

## [0.12.0] - 2026-11-18

### Changed
- El chorro de agua, ácido, lava y miel se ve y se comporta como agua: las gotas son más grandes y pesadas y se esparcen al chocar, en vez de pegarse como un líquido espeso.
- Caudales y tanques nuevos: agua 50 gotas/s con tanque de 150; ácido 45/s y 68; lava 30/s y 45; miel 25/s y 38. Cada tanque dura lo mismo que antes y el daño por segundo de cada arma no cambia.
- Las gotas ya no rebotan contra paredes y robots.

## [0.11.7] - 2026-11-18

### Fixed
- El aviso "Inundación en N" aparece 10 s antes de que empiece la inundación, no a los 290 s de ronda.

## [0.11.6] - 2026-11-18

### Changed
- Refactor interno: las partículas de los disparos tienen identidad estable (`ParticleStore`); el juego no cambia.

## [0.11.5] - 2026-11-18

### Added
- Grabador de escenarios (`tests/helpers/recorder.js`) y visor (`tests/tools/viewer.html`) para revisar la física cuadro a cuadro.

## [0.11.4] - 2026-11-18

### Changed
- Diseño del agua nueva: campo de alturas para la pileta y la inundación, disparos con agua pura, flotación de Arquímedes e interacciones físicas, aprobado por revisión física (`docs/design/14-agua.md`).
- Diseño del remapeo del gamepad (salto con A, golpe con B, gancho con X, rueda de armas con LB mantenido) y del gancho.

## [0.11.3] - 2026-11-19

### Changed
- Agentes repartidos por modelo: `scout` (haiku) para lectura, `github-clerk` (sonnet) ejecuta en GitHub lo que decide `planner` (opus). Los agentes en sonnet y haiku no toman decisiones.

## [0.11.2] - 2026-11-19

### Fixed
- Después del golpe el segundo brazo ya no queda girado hacia atrás: los dos vuelven a apuntar.

## [0.11.1] - 2026-11-19

### Fixed
- El golpe melee vuelve a funcionar: se reproduce su animación, daña al rival y lo aturde. Los tiempos del golpe, el aturdimiento y el destello de daño usan el mismo reloj de simulación que el resto del juego.

## [0.11.0] - 2026-11-19

### Changed
- La animación de caminar acompaña la velocidad real del robot: más lenta al frenar o al quedar pegado en miel.
## [0.10.3] - 2026-11-19

### Added
- Agente `physics-reviewer`: valida diseños y resultados de la simulación contra la física real, sobre secuencias de frames; su aprobación es obligatoria para mergear cambios de simulación.

## [0.10.2] - 2026-11-19

### Fixed
- El robot sigue apuntando mientras salta: los brazos ya no giran por el clip de salto al apuntar hacia abajo. El impulso de los brazos sigue ayudando al salto.

## [0.10.1] - 2026-11-19

### Changed
- Regla de comentarios: el código no se comenta; las explicaciones van en docstrings JSDoc breves.

## [0.10.0] - 2026-11-18

### Changed
- La miel ya no desaparece al tocar: queda como charco espeso toda la ronda (hasta 300 partículas) y pega al robot que la pisa. Camina 5 veces más lento, casi no salta y queda apretado contra el piso; se ve con un tinte ámbar intermitente.
- La miel sale más rápido (18 m/s, alcance de ~3 m) para compensar su viscosidad, y la lava también es más espesa.
- La miel que cae al agua se hunde y sigue pegando en el fondo.
## [0.9.0] - 2026-11-18

### Changed
- La lluvia de la inundación se dibuja como trazos finos según su velocidad, en lugar de pelotas que caen; el agua acumulada se ve como antes.

## [0.8.1] - 2026-11-18

### Fixed
- El agua de la pileta y de la inundación se dibuja en contacto con el robot y las paredes, sin la franja vacía que quedaba alrededor.

## [0.8.0] - 2026-11-18

### Added
- Los disparos interactúan con el agua de la pileta y de la inundación: al entrar se frenan, el agua y el ácido quedan flotando, la miel se hunde despacio y la lava se hunde. La corriente del agua los arrastra.

### Changed
- Los disparos ya no desaparecen al tocar el agua; solo se borran al salir del mapa o al vencer (6 s).

## [0.7.0] - 2026-11-18

### Changed
- Los disparos ya no rebotan como pelotitas: al chocar se frenan y forman charcos planos.
- El agua de la pileta y de la inundación fluye, se nivela y queda quieta en reposo, en lugar de amontonarse.
- Las fuerzas de los dos sistemas de partículas y las propiedades de cada fluido se definen como datos.

## [0.6.0] - 2026-11-18

### Added
- Arma de agua: es el arma con la que arranca cada robot (tanque de 300). Moja al rival y lo deja en cortocircuito (−3 de vida por segundo, hasta 3 s después).
- Chispas eléctricas sobre el robot mojado, tanto por el arma de agua como por la inundación.
- Teclas 4 y Num 4 para elegir la cuarta arma.

### Changed
- El orden de armas pasa a ser agua, ácido, lava y miel.

## [0.5.0] - 2026-11-18

### Added
- Disparo continuo: mantené el botón (A / RT, Espacio / Enter o clic mantenido del J1) y el arma emite un chorro, con un caudal propio por arma (ácido 90 partículas por segundo, lava 60, miel 50).
- Cada arma tiene su tanque (ácido 135 partículas, lava 90, miel 75). No se recarga solo y se llena al empezar cada ronda; vacío, el arma no dispara.
- El HUD muestra una barra de tanque por jugador, con "VACÍO" en rojo cuando se acaba.

### Changed
- El ácido daña por caudal: 20 de vida por segundo con el chorro entero sobre el rival.
- Después de reiniciar la ronda o de pedir la revancha hay que soltar el botón antes de volver a disparar.

## [0.4.1] - 2026-11-18

### Changed
- La inundación empieza a los 60 s de ronda (antes, 90 s) y el aviso "Inundación en N", a los 50 s: rondas más rápidas.

## [0.4.0] - 2026-11-18

### Added
- Inundación: a los 90 s de ronda llueve desde el techo y el agua sube desde la pileta, así que la pelea se va hacia arriba.
- El robot con alguna parte bajo el agua queda mojado y pierde 3 de vida por segundo por cortocircuito, hasta 3 s después de salir del agua. Cuenta el agua que realmente llegó (no un nivel teórico) y solo mientras se juega la ronda; al reiniciar, la pileta vuelve a su estado inicial.
- El robot mojado se ve con un tinte cian intermitente.
- El HUD muestra el reloj de ronda, "Inundación en N" desde los 80 s y "¡INUNDACIÓN!" desde los 90 s.

### Changed
- El agua del nivel pasa a partículas de 0,25 m y la lluvia comparte su sistema, así que el agua de la pileta sube de verdad.
- Los disparos que entran al agua se eliminan en todo el ancho del mapa mientras está inundado.

### Fixed
- Las marcas de disparo de las partículas se leían y escribían en una dirección equivocada de la memoria (la 0 del heap); ahora usan el buffer real de `userData`.

## [0.3.4] - 2026-11-18

### Changed
- Regla de fuego amigo decidida: el fluido propio daña a quien lo disparó pasados 0,4 s del disparo (incluido el charco propio). Queda registrada en el diseño y cubierta por tests; el comportamiento del juego no cambia.

## [0.3.3] - 2026-11-18

### Fixed
- El mouse ya no pisa la mira del gamepad del J1: al soltar el stick derecho se conserva su última dirección y el mouse solo vuelve a apuntar si se mueve después.

### Changed
- El clic del mouse siempre dispara con el J1, aunque el mouse no se haya movido antes.

## [0.3.1] - 2026-11-18

### Added
- Guía de trabajo (`CLAUDE.md`) con patrones de arquitectura y convenciones, agentes y el skill `/next`, plantillas de issues y PRs.
- Backlog en issues de GitHub con milestones hasta la entrega y la presentación.

### Changed
- El GDD se divide en archivos por tema (`docs/design/`); `DESIGN.md` queda como índice y refleja el estado actual del juego.

## [0.3.0] - 2026-11-18

### Added
- Partidas al mejor de 3 rondas, con cámara lenta y cartel al terminar cada ronda y revancha sin recargar.
- Golpe melee (X en gamepad): daña la parte golpeada, aturde y empuja al rival unos 2 m.
- Pileta de agua en el centro del mapa: caer en ella destruye al robot.

## [0.2.2] - 2026-11-18

### Fixed
- El arma apunta exactamente al objetivo estando quieto y se desvía mucho menos al caminar.
- Caminar en contra de la mira reproduce la caminata en reversa.

## [0.2.1] - 2026-11-18

### Fixed
- Las gotas de los disparos se ven más chicas y su contorno no cambia con el zoom.

## [0.2.0] - 2026-11-18

### Added
- Mapa de tamaño fijo con plataformas y cámara que sigue a los dos jugadores.
- Mira láser que muestra a dónde apunta el arma.
- Daño por parte del cuerpo (la cabeza recibe más) con destello rojo de 1 s, y daño por impactos fuertes.

### Fixed
- Ya no se puede volver a saltar en el aire.

## [0.1.0] - 2026-11-11

### Added
- Dos robots ragdoll cargados con RagImporter, controlables con gamepad o teclado.
- Armas de fluidos: ácido, lava y miel.
- El robot se da vuelta hacia donde apunta o camina.
