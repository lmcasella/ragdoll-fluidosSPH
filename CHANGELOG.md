# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/); versiones según [SemVer](https://semver.org/lang/es/).
Cada merge a `main` agrega su versión acá (ver `CLAUDE.md`). La primera entrada `## [x.y.z]` define la versión que publica el deploy.

## [Unreleased]

## [0.10.0] - 2026-11-18

### Changed
- La miel ya no desaparece al tocar: queda como charco espeso toda la ronda (hasta 300 partículas) y pega al robot que la pisa. Camina 5 veces más lento, casi no salta y queda apretado contra el piso; se ve con un tinte ámbar intermitente.
- La miel sale más rápido (18 m/s, alcance de ~3 m) para compensar su viscosidad, y la lava también es más espesa.
- La miel que cae al agua se hunde y sigue pegando en el fondo.

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
