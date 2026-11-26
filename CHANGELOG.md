# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/); versiones según [SemVer](https://semver.org/lang/es/).
Cada merge a `main` agrega su versión acá (ver `CLAUDE.md`). La primera entrada `## [x.y.z]` define la versión que publica el deploy.

## [Unreleased]

### Changed
- Flujo de ramas `main ← dev ← rama de trabajo`: cada paso de `dev` a `main` publica un release con su tag, y el deploy falla si la versión no subió.
- El código se reorganizó en `src/` por subsistema y el arranque pasó de `index.html` a `index.js`. Sin cambios para el jugador.
- El juego se dibuja en un solo canvas con PIXI y el umbral que funde las gotas pasa de un filtro SVG a un shader propio. Se ve igual.

## [0.54.2] - 2026-11-25

### Changed
- Reglas de código del proyecto: nombres en inglés y textos en español, sin números mágicos ni abreviaciones, y revisión del diff contra esas reglas antes de cada PR. Sin cambios en el juego.

## [0.54.1] - 2026-11-23

### Fixed
- El medidor del agua de Infinito queda pegado al borde derecho de la pantalla, alineado con el panel de J2, también en pantallas más anchas que 16:9.

## [0.54.0] - 2026-11-23

### Added
- Plataformas rompibles: un toque de un robot arma la cuenta, la plataforma tiembla y se pone roja, y se rompe al cumplirse el tiempo aunque el robot se baje. Rota no sostiene a nadie y reaparece a los 4 s sin dejar robots encajados. En Clásico son las dos plataformas chicas de los costados de la pileta; en Infinito aparecen desde la etapa 2, con una probabilidad que sube con cada etapa (20 % y +10 % por etapa, hasta 90 %). Una plataforma con arma o reparación nunca es rompible. Al terminar la partida o volver al título quedan todas enteras. Los bots dan por perdida una plataforma en cuanto empieza a romperse.

## [0.53.1] - 2026-11-21

### Changed
- `docs/referencias.md` pasa a ser un índice en tablas por sección, con un enlace para leer sobre cada concepto; `CLAUDE.md` fija qué explica el GDD, qué los docstrings y qué las referencias.

## [0.53.0] - 2026-11-21

### Added
- El menú principal muestra la versión y el commit del juego publicado (por ejemplo `v0.52.3 · da518ab`) abajo a la derecha; en local muestra `dev`.

## [0.52.3] - 2026-11-21

### Fixed
- El deploy vuelve a publicarse: los topes de tiempo de la adherencia, la flotación y el panel de debug solo se exigen con `PERF=1` en corrida aislada, como los demás tests de costo. Corridos en paralelo con la suite medían la carga de la máquina y dejaban el CI en rojo.

## [0.52.2] - 2026-11-21

### Changed
- Los tests largos pasaron a `tests/slow/`: la suite rápida (`node --test "tests/*.test.js"`) corre en menos de 30 s y la completa (`node --test "tests/**/*.test.js"`) sigue igual en CI.

## [0.52.1] - 2026-11-21

### Fixed
- Los bots de Infinito ya no se suicidan: con el agua cerca dejan de pelear y suben, y si estar quieto es peligroso entran en pánico y van a la plataforma alcanzable más cercana. Antes se quedaban bloqueando o golpeando bajo la línea segura, o parados sin plataforma a la vista, hasta que el agua los alcanzaba. Pasa igual en fácil, normal y difícil.
- Los bots eligen saltos con margen: evitan los que están justo al límite de lo que alcanzan y las caídas de más de 6 m, y en el aire corrigen hacia la plataforma más alta que quede sobre el agua en vez de la más cercana.
- Los bots no pelean al borde de una plataforma: no arrancan un golpe si el paso adelante los saca, se apartan del borde tras un golpe y no se tiran al vacío con el stick en cero.
- El bot de J2 en Infinito con la semilla 8 llega vivo a los 180 s en lugar de ahogarse a los 29 m.
- Los bots saltan lejos del rival que está justo encima y se zafan de las plataformas donde quedan encajados empujando hacia el centro.
- El monitor de debug (F3) muestra el modo de supervivencia de cada bot.

## [0.52.0] - 2026-11-21

### Changed
- En Infinito, las plataformas son largas y pocas al principio (de 8 a 14 m, y las de una sola por fila de 10 a 14 m) y se van acortando y multiplicando al subir: desde la etapa 5 miden de 2 a 4 m y las filas suelen tener de 2 a 4 plataformas.

## [0.51.0] - 2026-11-21

### Added
- En Infinito, el agua persigue a los jugadores que se escapan: si el jugador vivo más bajo queda a más de 6 m sobre ella, sube más rápido (hasta 3 m/s extra) hasta quedar justo debajo de la pantalla, y desde ahí entra a la vista a su ritmo de siempre. Los saltos no la aceleran: cuenta la plataforma donde está parado cada jugador.

## [0.50.3] - 2026-11-21

### Changed
- La documentación del juego queda al día: el README explica el combate, la pausa y los tiempos de nocaut, e incluye el enlace para jugar.
- El diseño marca como hecho lo que ya está en el juego (combos, bloqueo, plataformas atravesables, armas recogibles, agua física).

## [0.50.2] - 2026-11-21

### Changed
- El nocaut de Infinito sube 3 s por cada nocaut siguiente, hasta 18 s.

## [0.50.1] - 2026-11-21

### Changed
- En Infinito el primer nocaut de la ronda dura 5 s y cada uno siguiente 5 s más, hasta 20 s (antes, siempre 15 s).

## [0.50.0] - 2026-11-21

### Changed
- Sin stick derecho ni mouse, el robot vuelve a mirar y girar hacia donde camina. Con el stick derecho o el mouse manda la mira, y durante un golpe o un combo no gira.
- El 2.º y el 3.er golpe del combo vuelven a hacer avanzar al atacante, a la mitad de velocidad que antes (2,5 m/s hasta el fin de la ventana activa).

## [0.49.1] - 2026-11-21

### Fixed
- En Infinito también aparece la barrita de vida sobre el robot al recibir daño.
- El menú de debug queda por encima de la interfaz y debajo del panel de J1.

## [0.49.0] - 2026-11-20

### Changed
- En Infinito la vida vuelve a ser la de 100 del Clásico, con las mismas fuentes de daño. Se quitan el daño acumulado en % y el empuje creciente: los golpes y los chorros empujan siempre igual.
- La tuerca de reparación en Infinito deja la vida en 100 (en el Clásico sigue sumando 35). El premio por etapa también.
- El panel de Infinito muestra la barra y el número de vida como el Clásico, y el número flotante de daño es "−N" con la misma rampa de calor.

### Added
- Nocaut en Infinito: con la vida en 0 el robot no muere, queda inconsciente 15 s con la animación de caída dolorida, sin responder a ningún control (el bot tampoco lo maneja) mientras los golpes y los fluidos lo siguen empujando, y se levanta con 50 de vida. Más daño en nocaut no alarga el tiempo. Una tuerca lo levanta en el acto con 100 de vida. Solo el agua saca al robot de la partida, también en nocaut. Sobre el robot inconsciente se ve el contador de segundos que faltan.

## [0.48.0] - 2026-11-20

### Added
- Menú de pausa: cualquier jugador lo abre con Start o Escape durante la cuenta regresiva o la partida. Mientras está abierto no avanzan la física, el reloj de ronda ni los bots, y el HUD sigue visible. Tiene Continuar (también Start, Escape o B), Controles (B vuelve a la pausa) y Menú, que vuelve al título.

## [0.47.1] - 2026-11-20

### Changed
- La pantalla de controles del gamepad es una tabla como la del teclado, en lugar del dibujo del gamepad.

## [0.47.0] - 2026-11-20

### Added
- Menú principal nuevo, con íconos en vez de texto: Mapa (con la miniatura del Clásico o del Infinito), Bot (1, 2 o 3 puntos de dificultad, o el maniquí), Controles y Jugar. El foco se ve en amarillo y el valor entra deslizándose al cambiarlo.
- Pantalla de controles propia, desde la fila Controles: el gamepad dibujado con cada botón y una palabra de acción, las combinaciones (rodar, bajar, patada, combo) y una pestaña con el teclado y mouse de J1. LB y RB cambian de pestaña y B vuelve.
- Asignación de controles nueva: fichas de dispositivo que se deslizan entre J1, la bandeja del medio y J2, con un tilde en el jugador que ya tiene control y el bot en el que no.
- Sonidos de interfaz para navegar el menú, cambiar valores y pestañas, sumar, mover y quitar dispositivos, conectar y desconectar un gamepad, empezar y la revancha, la cuenta regresiva, el "¡YA!", el aviso de inundación, el premio de etapa, el fin de ronda y la pausa. Suenan 6 dB más bajo que los golpes y de a uno por vez.
- Los glifos de ayuda muestran los botones del gamepad o las teclas, según lo último que usaste en esa pantalla.

### Changed
- El panel de cada jugador es más chico (420 × 72, como máximo 1,8 veces el alto de un robot) y ya no tiene texto: sin arma muestra el puño, y con el tanque vacío el ícono del arma se apaga.
- El marcador de arriba solo tiene los rombos de victorias y el reloj. El aviso de inundación muestra los segundos que faltan sobre franjas amarillas y después una ola que late. El fin de ronda es una banda con la insignia del ganador y el marcador, y el fin de partida tiene la corona y los botones de revancha y menú solo con íconos.
- El daño se lee como algo malo: el número flotante sale del torso, sacude y cae en vez de subir, no lleva el signo "+" y va de blanco a rojo según el daño acumulado de Infinito o la vida perdida en Clásico (nunca amarillo ni dorado). Los paneles de Infinito usan la misma escala de colores, sin "empuje".
- En Infinito el premio de etapa es una ficha con la insignia del ganador, un rayo y un tanque, y el medidor de altura no lleva texto: solo las fichas con los metros y la zona roja.

### Fixed
- El HUD de la partida ya no aparece encima del menú principal.
## [0.46.0] - 2026-11-20

### Added
- Interfaz nueva en partida: un panel por jugador arriba (insignia, vida con marcas cada 25 y número grande, o el % de daño en Infinito, y el arma con su tanque o "VACÍO"), marcador "AL MEJOR DE 3" con rombos de victorias, ronda, reloj y aviso de inundación, y la cuenta regresiva, el fin de ronda y el fin de partida (con los botones Revancha y Menú bloqueados el primer segundo).
- Cuando un robot recibe daño sale un número flotante sobre él ("−12", o "+12 %" en Infinito) que suma el daño seguido, una barrita de vida sobre la cabeza durante 1,5 s (solo en Clásico) y un tramo blanco en el panel con lo perdido.
- Infinito: medidor de altura a la derecha, con una ficha por jugador que marca cuántos metros le saca al agua, rayas por etapa y zona roja en los últimos 4 m.

### Changed
- Se retiran de la partida los textos de salud, los puntitos de ronda, "Ronda N", el reloj y la banda negra de carteles: los reemplaza la interfaz nueva. El menú y la pantalla de asignación siguen como estaban.

## [0.45.3] - 2026-11-20

### Fixed
- La miel vuelve a pegarse a los robots en el juego publicado: cuando las primeras gotas entraban en el cuerpo del robot, el juego dejaba de leer los contactos y la adherencia (junto con el calor y la evaporación por contacto) quedaba apagada toda la partida.

## [0.45.2] - 2026-11-20

### Changed
- Diseño del juego: página nueva de balance con los valores con los que se juega hoy (vida, golpes, armas, tiempos de la partida e Infinito), y corrección de los números viejos que no coincidían con el juego. Sin cambios en el juego.

## [0.45.1] - 2026-11-20

### Fixed
- Los líquidos ya no desaparecen apenas salen del arma cuando el juego corre a menos de 50 fps. El recorte de partículas por rendimiento solo actúa con más de 1000 partículas vivas.

## [0.45.0] - 2026-11-20

### Added
- Menú de debug con un solo botón: F3 (teclado) o L3 + R3 juntos (gamepad) lo abre y lo cierra. Mientras está abierto la partida queda en pausa y se recorre con arriba/abajo y izquierda/derecha. Filas: Estadísticas, Fluidos (metaball, puntos o ambos) y las capas de vectores Velocidades, Fuerzas, Columnas y Bots, cada una por separado y apagadas al empezar.
- Modo de fluidos en puntos: cada partícula se ve como un círculo del tamaño real y el color de su material, para mirar la simulación sin el efecto de gota.
- Las flechas del debug son más finas y semitransparentes.

### Removed
- F4 y los atajos Select + LB y Select + RB del monitor de física: ahora todo sale del menú. LB y RB vuelven a abrir la rueda y cambiar de arma aunque Select esté apretado.

## [0.44.3] - 2026-11-20

### Changed
- Test de aterrizajes rápidos sobre plataformas atravesables, fijas y móviles: ninguna pieza del robot queda dentro de la plataforma y termina parado arriba. Sin cambios en el juego.

## [0.44.2] - 2026-11-20

### Changed
- Flujo de trabajo: después de cada merge se comprueba que el issue quedó cerrado, y `/next` revisa los PRs ya mergeados de un issue antes de recomendarlo. Sin cambios en el juego.

## [0.44.1] - 2026-11-20

### Fixed
- El robot que pisa un charco de miel apoya los pies en el piso, en vez de quedar parado arriba del charco como sobre un bloque. La miel se sigue pegando al robot, pero ya no lo clava al piso: un chorro de miel puede empujar al rival, y caminar por un charco de miel cuesta más o menos lo mismo que por agua. La miel del fondo de la pileta se corre despacio con la corriente.

## [0.44.0] - 2026-11-20

### Added
- Cuando un robot cae al agua, la superficie levanta gotas hacia afuera, con la energía que el golpe le da al agua; el agua que sale de la pileta vuelve a ella cuando las gotas caen. Solo salpica el agua limpia, no la mezclada con miel o ácido.

## [0.43.1] - 2026-11-20

### Fixed
- En el cartel de fin de partida, Escape (o el Start de cualquier control) vuelve al menú y Enter (o A) pide la revancha, aunque el teclado o ese control no estén asignados a un jugador.

## [0.43.0] - 2026-11-20

### Added
- Monitor de física: F3 muestra un panel con FPS, milisegundos por subsistema, partículas por material, contactos partícula-cuerpo, subpasos del campo de agua, deriva del volumen de agua y el estado de cada bot, y F4 dibuja una capa con la velocidad de las partículas, el empuje y el arrastre de cada pieza de los robots, las columnas del campo de agua y la línea de cada bot a su meta. En gamepad: Select mantenido + LB el panel y Select mantenido + RB la capa; con Select apretado, LB no abre la rueda de armas.

## [0.42.12] - 2026-11-20

### Fixed
- La miel cuelga del techo unos 2 segundos antes de soltarse, escurre despacio por las paredes y las plataformas (unos 6 cm/s) y se estira en hilos entre las gotas, en lugar de caer como agua. Pega contra cualquier cosa del mapa, no solo contra los robots. La miel sale con más partículas por segundo y el mismo tiempo de fuego, para que el chorro vaya unido.

## [0.42.11] - 2026-11-20

### Fixed
- En Infinito suena una sola música durante la ronda (la de muerte súbita), en lugar de cambiar de pista a los 5 s cuando empieza a subir el agua, en cada ronda.

## [0.42.9] - 2026-11-20

### Fixed
- El bloqueo es inmediato: protege todo el frente desde el primer frame en que se aprieta (antes el golpe tenía que pegar en un brazo, y los brazos tardaban en subir), y la animación de guardia corre 4 veces más rápido. Con el bloqueo mantenido, la mira sigue eligiendo hacia qué lado se bloquea.

## [0.42.8] - 2026-11-20

### Fixed
- La mira la mueven solo el stick derecho o el mouse: caminar con el stick izquierdo o el teclado ya no cambia hacia dónde apunta el robot ni lo da vuelta. Caminar hacia el lado contrario de la mira es caminar de espaldas.

## [0.42.7] - 2026-11-20

### Fixed
- Las gotas en movimiento se dibujan estiradas a lo largo de su velocidad, así el chorro se ve como un hilo continuo y no como una fila de bolitas: a 18 m/s las gotas del chorro quedan a 0,18 m y el dibujo solo las fundía a menos de 0,12 m.

## [0.42.6] - 2026-11-20

### Fixed
- Dificultad "Muñeco" en el menú: el rival que maneja la máquina se queda quieto, sin moverse ni atacar, para probar el combate con un solo control sin que la ronda se reinicie por su cuenta. En Clásico la inundación empieza a los 60 s.

## [0.42.5] - 2026-11-20

### Fixed
- El robot ya no se da vuelta durante un golpe ni durante el combo cuando la mira apunta al lado contrario: gira recién al terminar el ataque. El bot solo empieza un golpe con el rival del lado al que mira.

## [0.42.4] - 2026-11-20

### Changed
- La lluvia de la inundación es la misma agua que el chorro del jugador: mismas flags (genera los eventos de contacto que mojan y adhieren) y mismo color, definidos en un solo lugar (`WEAPONS`). La lluvia solo se distingue por su origen en el libro de masa.
- La lluvia cae de forma natural y menos densa: posición al azar con la semilla (`?seed`), nacimiento repartido en una franja de 2 m, velocidad de cada gota de 8 m/s ±25 %, viento leve de -1,5 a 1,5 m/s con período de 8 s y ráfagas de 0,5 a 1,5 veces el caudal medio cada 4 s. Solo el 40 % del caudal sale como gotas; el resto entra al campo de alturas repartido a lo ancho del agua, con su volumen en el libro de masa, así que la subida de la inundación no cambia.

## [0.42.3] - 2026-11-20

### Fixed
- La rueda de armas ya no cancela si el stick vuelve al centro antes de soltar LB: elige el último sector apuntado, que queda resaltado. Solo se cierra sin cambiar el arma si nunca se apuntó.

## [0.42.2] - 2026-11-20

### Changed
- Mapa Infinito: las plataformas se arman por filas separadas de 2,2 a 3,2 m, con de 1 a 4 plataformas por fila (sin más de 2 filas seguidas con la misma cantidad) y cada una corrida hasta 0,4 m en vertical, para que no parezca una escalera. Una plataforma vale si se alcanza con el salto real del robot (hasta 3,3 m de desnivel con 2 m de hueco, o 2 m de desnivel con 3,5 m de hueco) desde otra de la fila de abajo o de su misma fila. La plataforma de una fila de 1 es siempre ancha (de 4 a 5,5 m).

## [0.42.1] - 2026-11-20

### Changed
- Los golpes ya no empujan al atacante hacia adelante: el avance lo dan solo las piernas animadas.
- Durante un golpe o un combo el robot no camina ni se da vuelta, aunque el stick apunte al otro lado; gira al terminar el golpe.

## [0.42.0] - 2026-11-20

### Added
- Pantalla de asignación de controles al elegir Jugar: cada dispositivo conectado (teclado y mouse, gamepad 1, gamepad 2) se ubica en J1, sin jugar o J2 con su propio stick, cruceta o A/D. Select o A suman al gamepad, Start, Enter o A empiezan y B o Escape vuelven. La última asignación se recuerda; un jugador sin dispositivo lo maneja el bot con la dificultad del menú.

### Changed
- El teclado y el mouse son un solo dispositivo con un esquema nuevo: Espacio salta, Shift bloquea, Shift + Espacio rueda, F golpea, S + F patea, S + Espacio baja de la plataforma, clic izquierdo dispara, clic derecho o E es el gancho, Q anterior o rueda, R siguiente, 1-4 directa y Escape es Start. W queda solo como arriba. La revancha se pide con Espacio.
- El menú principal pierde la fila Modo; se elige con los dispositivos de la pantalla de asignación. ?bot= sigue forzando bots y salta la pantalla.
- Input asigna el estado por dispositivo y no por el índice del gamepad.

### Removed
- El teclado de J2 y todas las teclas del teclado numérico.

## [0.41.3] - 2026-11-20

### Fixed
- Infinito: el daño acumulado se satura en 500 % (factor de empuje máximo 6) en lugar de crecer sin límite.
- Infinito: el impulso extra que suma el daño acumulado a golpes y chorros se recorta para que ninguna pieza del robot golpeado supere 25 m/s por su causa; la física del contacto no cambia.

## [0.41.2] - 2026-11-20

### Fixed
- Música: un cambio de pista pedido durante un fundido ya no deja sonando la pista que estaba saliendo. Nunca hay más de una pista entrando y una saliendo.

## [0.41.1] - 2026-11-20

### Fixed
- Las gotas del mismo material se funden en una masa continua (chorro, charco, hilo) en lugar de verse como bolitas sueltas. Cada partícula aporta un campo que se suma al de sus vecinas y un umbral recorta el contorno, con la gota aislada con su área física. Cada material se dibuja en su propia capa, así que materiales distintos ya no se funden entre sí. Se conserva el color por temperatura.

## [0.41.0] - 2026-11-20

### Changed
- Infinito: la vida pasa a ser daño acumulado en %, que arranca en 0 y no tiene tope. El daño no mata: el robot solo muere ahogado. El HUD muestra el % (por ejemplo `47 %`) con el color del jugador en lugar de la salud. La reparación y el premio por etapa restan % sin bajar de 0. El bot usa el % de forma equivalente para huir y buscar reparación. Clásico no cambia.
- Infinito: todo golpe y todo chorro empuja `1 + daño % / 100` veces más (100 % duplica el empuje). En los chorros el extra se estima con la masa de la partícula y su velocidad de acercamiento sobre la normal del contacto.

## [0.40.0] - 2026-11-20

### Added
- El cortocircuito depende de la conductividad del líquido que moja al robot: agua limpia sigue en 3 de vida por segundo y el ácido (32 S/m) llega a ~15. El ácido de un disparo también moja, y en la pileta cuenta la conductividad del campo en la columna del robot, así que volcar ácido en la pileta la electrifica.
- Las chispas del cortocircuito escalan con el daño (el ácido da unas 5 veces más) y las piezas mojadas de ácido sueltan burbujas de H₂ que suben y se apagan en 0,5 s, con tasa proporcional a la concentración.

### Fixed
- El ácido no hacía daño apreciable: de un tanque entero solo ~7 de vida llegaban a un blanco a 4 m, porque no lo mojaba. Ahora el mismo disparo le quita ~33 de vida.

## [0.39.3] - 2026-11-20

### Fixed
- La levantada tras una caída con daño espera a que el robot esté apoyado y quieto: `land_hurt` sigue mientras esté en el aire o rebotando, y la levantada empieza tras 0,5 s seguidos con alguna pieza apoyada en el mapa o en el agua (mínimo 1 s de `land_hurt`).

## [0.39.2] - 2026-11-20

### Fixed
- Los modos contra bot y bot contra bot funcionan aunque haya más de un gamepad conectado: el jugador elegido como bot lo maneja el bot, y ya no se queda quieto esperando a un mando.

## [0.39.1] - 2026-11-20

### Fixed
- Al romperse la guardia vuelve la animación de tropiezo (`stumble`) del que bloqueaba; sigue sin el empuje artificial.

## [0.39.0] - 2026-11-20

### Added
- Robot v7: clips nuevos `land_hurt`, `getup_front` y `getup_back`; los 19 anteriores no cambian.
- Una caída alta que hace daño por impacto deja al robot dolorido en el piso (`land_hurt`) y después se levanta de frente o de espalda, según cómo quedó el torso. Durante esos 3 s no puede moverse, girar, saltar, rodar, atacar ni disparar; un golpe no reinicia la secuencia y la muerte la corta. Una caída sin daño sigue igual.

## [0.38.2] - 2026-11-20

### Fixed
- Infinito ya no se cuelga al arrancar una partida cuando la base deja una sola plataforma válida para aparecer: los dos robots aparecen sobre ella, separados y mirándose.

## [0.38.1] - 2026-11-20

### Fixed
- El salto completo a través de plataformas atravesables se verifica en las semillas 1 a 6 del Infinito. Los saltos "cortados" que mostraba la prueba eran el robot saltando ya bajo el agua de la inundación (el arrastre le acortaba el salto), no un fallo de las plataformas.

## [0.38.0] - 2026-11-20

### Changed
- Los bots equipan enseguida el arma que acaban de recoger y, cuando se les vacía el tanque equipado, cambian al azar a otra que tenga carga.

## [0.37.2] - 2026-11-20

### Fixed
- Un golpe bloqueado ya no corta el combo: el combo sigue como antes y el tercer golpe rompe la guardia, ahora sin lanzar ni hacer tropezar al que bloqueaba.

## [0.37.1] - 2026-11-20

### Fixed
- Bloquear vale la pena: un golpe bloqueado corta el combo del atacante, y romper la guardia solo aturde 0,7 s, sin lanzar ni hacer tropezar al que bloqueaba.

## [0.37.0] - 2026-11-20

### Changed
- La miel ahora frena al robot por adherencia física y no por una regla de juego: las partículas cerca de cualquier pieza del robot forman una película viscosa que lo arrastra (y que él arrastra a ella), así que cruzar un charco de miel de 9 capas lleva casi el doble que en seco (2,7 m/s contra 5,2 m/s medios en 4 m) y más que con agua (3,9 m/s), y al salir del charco camina normal. El agua casi no se pega. El robot ya no queda "pegado" al piso ni parpadea en ámbar.

### Removed
- El estado pegado de la miel: salto bajo, velocidad al 10 %, gravedad extra y parpadeo ámbar.

## [0.36.1] - 2026-11-20

### Fixed
- En Infinito aparecen de 8 a 13 plataformas en cada 10 m de alto (antes de 3 a 7), repartidas por todo el ancho. Cada plataforma tiene una vecina alcanzable arriba y otra a su altura o abajo, y ninguna queda a más de 6 m en horizontal de las de abajo: el alcance ya no depende de la semilla.

## [0.36.0] - 2026-11-20

### Added
- Ítem de reparación (tuerca hexagonal): suma 35 de salud con tope en el máximo, no se recoge con la salud llena y reaparece a los 20 s. Está en el mapa clásico (plataforma central, junto al agua, que se corrió a x = 26) y una vez por etapa en Infinito.
- El bot con menos de 40 de salud busca la reparación cercana.
- Sonido propio para la reparación.

## [0.35.2] - 2026-11-20

### Fixed
- Con el tanque de un líquido lleno, el robot atraviesa el punto de ese líquido sin gastarlo y queda para el contrincante.

## [0.35.1] - 2026-11-20

### Fixed
- El agua caliente (y la que condensa del vapor) se dibuja celeste claro en vez de blanca: antes se confundía con el vapor y parecía vapor que caía.
## [0.35.0] - 2026-11-20

### Changed
- La química se ve dentro de una ronda (tiempo de juego, con factores de aceleración nombrados en `THERMAL.game`; la masa y la energía se siguen conservando). El agua que toca la lava hierve al instante y la lava que toca se vuelve piedra: el agua es el contraataque de la lava. La lava que cae en la pileta larga vapor desde el primer contacto y se endurece. La lava sola en el aire es piedra en unos 10 s.
- El vapor sube, se vuelve niebla y se disipa en unos 5 s. Si toca un techo, una plataforma, una pared o un robot, condensa y gotea.

### Fixed
- El intercambio de calor de una gota parcialmente evaporada usa su masa restante, así el balance de energía cierra cuando hierve.
## [0.34.0] - 2026-11-20

### Agregado

- El vapor que sube se enfría con el aire que arrastra la pluma y se vuelve niebla; al agotar su latente se disuelve en el aire como humedad, sin crear gotas de agua.
- El vapor condensa por contacto directo sobre agua, ácido y piedra fría, que se calientan hasta 100 °C.

## [0.33.0] - 2026-11-20

### Added
- El agua hierve. La lava y la piedra caliente que tocan el agua ya no la dejan pasar de 100 °C: la partícula de agua que llega a la entalpía de vaporización pasa a vapor (`STEAM`) y las columnas del campo se quedan en 100 °C y guardan el excedente (`water.boiled`) hasta juntar el calor de un vapor, que sale como una partícula nueva sobre la superficie (una por columna y por paso, hasta 300 vivas). Bajo agua subenfriada no sale vapor: el calor queda en el agua.
- Material `STEAM` (vapor, con la masa del agua de la que vino) y dos filas en `REACTIONS`, `boil` y `condense`. El vapor sube en el aire por el empuje y el arrastre cuadrático (velocidad terminal 0,95 m/s), el que toca el campo por debajo de 100 °C se absorbe con su entalpía y el que cae sobre una columna a 100 °C no condensa. El vapor que sale del mapa se destruye con `OUT`.
- `MATERIALS.steam`, `MATERIALS.air` y `latentVaporization` y `boilingPoint` del agua. `thermal.boiledEnergy()` suma el excedente pendiente y entra al monitor de energía. `Thermal.dispose()` libera sus objetos nativos.
- Tests (`tests/boil.test.js`, `tests/boil-invariants.test.js`): T3, T4, T5, B1, B2 y B3 de ebullición, y I1, I2b y la energía con vapor, ácido y lava en la escena del juego.

### Changed
- Los invariantes I1 e I2b cuentan el vapor como H2O y el paso del campo al vapor.

## [0.32.0] - 2026-11-20

### Added
- Térmica de las partículas y de las columnas. Cada partícula lleva su entalpía (`store.enthalpy`) y se calienta o enfría por contacto con sus vecinas, con el agua del campo (la lava sumergida le cede calor a su columna) y con el aire (radiación y convección de la lava y la piedra). Una partícula de lava aislada tarda unos 4 min en solidificar, con los tiempos reales.
- La lava se vuelve piedra al perder su calor de fusión y la piedra vuelve a lava si lo recupera, decidido por la entalpía y no por un temporizador. La piedra cae y se apila (`POWDER`) y, en reposo 0,5 s, queda inmóvil (`WALL`). Hay un material y un tipo de partícula nuevos (piedra) y dos filas en `REACTIONS`.
- Viscosidad de la lava (300 Pa·s a 1.150 °C, ×1.000 a 1.070 °C): se aplica por contactos entre partículas y contra los cuerpos, con reacción sobre ellos.
- El color de la lava, la piedra y el agua caliente sigue su temperatura (incandescencia para el basalto).
- `js/thermal.js`, `js/viscosity.js`, `Contacts.pairs` y `Contacts.bodies`, `PARTICLE.WALL` y `PARTICLE.POWDER`. El monitor de energía (`thermal.energy()` más `thermal.energyLost()`) cierra el balance con el latente de la evaporación y el calor de la pérdida inelástica de la absorción.
- Tests: criterios T1, T2, T6, T7, T8, L1 y L2 de térmica y fases, más la viscosidad. L3 (charco de lava contra el flujo viscoso de película delgada) pasa en ±30 %.

### Changed
- La absorción en el campo deposita la entalpía propia de la partícula en lugar de la del agua ambiente.
- Los invariantes I1 e I2b cuentan la piedra y el avance de las filas de `REACTIONS`; I2a admite el cambio de material por una fila de esa tabla.
- El radio de dibujo de la lava y la piedra sube de 1,045 a 1,06: con la viscosidad la pila de lava ya no se comprime y I3p daba 6 pasos fuera de ±15 %.

## [0.31.1] - 2026-11-20

### Added
- Deploy automático a GitHub Pages en cada merge a `main`, con tests previos, tag y release por versión, y `version.json` publicado. El sitio publicado incluye el audio.

## [0.31.0] - 2026-11-19

### Added
- Evaporación del agua detenida. Las gotas y charcos de agua con menos de 1 m/s se evaporan según su superficie expuesta: una gota suelta desaparece en unos 2,5 s y un charco grande dura mucho más, porque solo evaporan las partículas de arriba y los bordes. La lluvia y los chorros en vuelo no se evaporan, y el ácido, la miel y la lava persisten detenidos. La tasa real se acelera 300.000 veces para que se vea en una ronda (`MATERIALS.water.evaporationScale`).
- `js/contacts.js`: lector en solo lectura de los contactos nativos partícula-partícula y partícula-cuerpo de LiquidFun. Busca y valida los offsets al arrancar (+54 y +58 palabras), los informa en `stats` y avisa por consola si difieren; si no los halla, la evaporación se desactiva y el juego sigue.
- `js/evaporation.js` y `store.evaporated` (fracción `φ` por partícula). `stats.latent` acumula el calor latente (negativo, J) hasta que exista el monitor `E_perdida`.
- Tests: E1 a E5 de evaporación contra el modelo del GDD y del lector de contactos.

### Changed
- La absorción en el campo deposita solo `A_p (1 − φ)` de una partícula ya evaporada en parte, y el libro de masa de `ParticleStore` anota la parte evaporada en `EVAPORATED`; los invariantes I1 e I2b cuentan `m (1 − φ)` como agua y `m φ` como evaporada.
- El banco P3 informa `W_full` como mediana (1,1114) y usa `js/contacts.js`.

## [0.30.1] - 2026-11-19

### Fixed
- En Infinito los bots pelean: persiguen al rival si está a 8 m o menos en vertical y 14 m o menos en horizontal y sobre la línea segura, aunque tengan que bajar plataformas. Antes el que iba adelante se escapaba subiendo.
- La cámara de Infinito se aleja hasta mostrar 40 m de alto para no dejar a un jugador fuera de cuadro.

## [0.30.0] - 2026-11-19

### Added
- Infinito natural y en movimiento. Las plataformas ya no van en filas: cada una crece desde otra de apoyo, con altura, ancho e irregularidad variables, de 3 a 7 por cada 10 m de altura, y los dos jugadores se mueven por todo el mapa (se quitó la justicia entre lados). Arrancan anchas (5 a 9 m en la etapa 0) y se acortan hasta 2 a 4 m desde la etapa 5, con alguna más larga o más corta de vez en cuando.
- Cada jugador arranca en una plataforma al azar de la etapa 0 de la que se puede seguir subiendo, a entre 4 y 10 m del otro, mirándose, para que en una laptop no se vean chicos.
- El mapa baja despacio (0,15 m/s, 0,02 m/s más por etapa alcanzada) mientras el agua lo llena; un robot apoyado baja con la plataforma y saltar desde abajo la atraviesa. El agua, que arranca a 2 m, sube ahora a 0,25 m/s más 0,04 m/s por etapa, porque el descenso del mapa suma subida relativa.
- Las plataformas atravesables pueden moverse (`OneWayPlatforms.addPlatform(fixture, { moving: true })`) y el bot sabe que el mapa baja (`offsetY`).
- Tests: generador por ramas (50 semillas), mapa que baja, aparición cercana, bot contra bot desde el arranque.

### Changed
- En Infinito no hay islas, pileta ni plataformas del clásico: solo paredes a los costados y plataformas. Todo el mapa es un único cuerpo cinemático.
- Las etapas, las armas y el premio por etapa se miden en la altura del mapa (la generada), no en la del mundo. Las armas salen una cada cierta cantidad de plataformas de la etapa, no por filas.
- El bot espera a frenarse bajo la plataforma de destino antes de saltar en vertical y, si queda encajado en una plataforma sin moverse durante 1 s, salta de un lado a otro para zafarse.

### Removed
- El generador por filas, la base con las plataformas bajas del clásico, la justicia entre lados, las rutas separadas por costado y el manejo de las costuras de la grilla de LiquidFun (con el mapa bajando, la altura en el mundo no llega a la primera costura).
## [0.29.1] - 2026-11-19

### Fixed
- En Infinito la etapa 0 ya no tiene armas (antes conservaba la miel y el agua del clásico) y las armas de las etapas de arriba siguen un tier: agua en la 1, agua y miel con lava ocasional en la 2, lava en la 3, ácido y lava desde la 4.
- Los bots son más estratégicos: el movimiento (subir, evadir, buscar armas) y el combate (apuntar y disparar) son independientes, así que ya no se plantan a vaciar el tanque. Disparan en ráfagas de 0,5 s con 0,7 s de pausa mientras se mueven, guardan el 25 % del tanque salvo con el rival a menos de 3 m, saltan o ruedan al recibir daño o líquido, y en Infinito solo persiguen al rival en su plataforma o en una vecina que no esté más abajo. Al buscar un arma o salir del agua no eligen plataformas más bajas si hay otra.
## [0.29.0] - 2026-11-19

### Added
- Mapa **Infinito**, ahora habilitado y elegido por defecto en el menú: la primera etapa es el mapa clásico y arriba hay etapas de 15 m con paredes propias y filas de 2 a 4 plataformas atravesables de 3 a 6 m de ancho, generadas al azar. Cada plataforma tiene debajo otra que solapa con ella al menos 1,5 m, así que siempre se alcanza saltando en vertical a través de ella, y los dos lados del mapa tienen un ancho de plataformas parecido (±20 %). Desde la etapa 1 el ancho entre paredes es de 36 m y se angosta 4 m por etapa hasta un mínimo de 24 m. A cada ronda le toca un mapa nuevo; con `?seed=N` en la URL todas las rondas repiten el mismo.
- El agua sube sin techo desde los 5 s de ronda (0,4 m/s y 0,06 m/s más en cada etapa). Se genera hacia arriba conforme sube la cámara y lo que queda hundido bajo el agua desaparece.
- Las etapas de arriba traen armas sobre sus plataformas más externas, cada vez más seguidas y más peligrosas (agua, miel y lava al principio, ácido y lava después).
- En Infinito un robot se ahoga cuando el agua cubre su torso, en cualquier parte del mapa. No hay sensor en la pileta.
- Clásico sigue disponible en el menú, y es el mapa con el que corren las pruebas.
- En Infinito los robots arrancan sin armas, solo con golpes: el gatillo no hace nada, no se dibuja la mira láser, la rueda de armas no se muestra y el HUD no muestra tanque. Recoger un ícono da el arma equipada con el tanque lleno. El equipo inicial es un dato por mapa (CLIMB.loadout); Clásico sigue con agua.
- El bot sin arma, o con el tanque vacío, va a buscar un punto de aparición listo sobre la línea segura a 3 aristas o menos (BOT.pickupReach); el golpe contra un rival cercano sigue teniendo prioridad.
- Premio por etapa: el primer robot que se apoya en una plataforma de la etapa 1 en adelante recupera toda la vida y llena todos sus tanques, una vez por etapa y por ronda (CLIMB.stagePrize). Un cartel chico arriba, ETAPA n · J1, dura 1,5 s y suena el efecto de recoger un arma.

### Changed
- Por única vez, la elección guardada del menú se ignora para que todos arranquen con Infinito; la nueva elección se guarda aparte.
- El campo de agua puede angostarse a las paredes de la etapa y subir su fondo efectivo; en Clásico no cambia nada.
- El cartel de controles (#163) ya no se dibuja durante la partida: se muestra solo en el menú principal, debajo de las opciones.

### Fixed
- Los robots ya no caen a través de una plataforma atravesable al caminar sobre ella, al darse vuelta encima ni al aterrizar rápido: una vez apoyado, la plataforma sigue sólida hasta que te vas o bajás con abajo + A.

## [0.28.0] - 2026-11-19

### Added
- Las partículas de los disparos ya no desaparecen solas: se quitan el vencimiento a los 6 s y el tope de miel.
- Recorte por rendimiento: solo si el juego baja de 50 fps (frame de más de 20 ms durante 1 s) se destruyen las partículas más viejas, de a 100 por frame, hasta recuperar; las del mapa al final. Sin carga no se recorta nada.

### Removed
- Las causas de destrucción `EXPIRED` y `PERSIST_CAP` y la constante `PERSIST_MAX`.

## [0.27.0] - 2026-11-19

### Added
- Salto variable: un toque de A (o de la tecla de salto) da un salto bajo de unos 1,2 m medidos, y mantener el botón conserva el salto completo de antes (unos 4,1 m). Soltar el salto mientras el robot sube le corta la velocidad vertical a la mitad.
- Caída rápida: con el stick izquierdo abajo (o la tecla abajo) mientras el robot cae, la gravedad efectiva sube un 30 % y la caída tarda cerca de un 13 % menos. Abajo + A sobre una plataforma atravesable sigue bajando como antes.
- El bot mantiene el salto apretado mientras sube, para conservar el salto completo.
- El bot prefiere subir en vertical, a través de la plataforma que tiene justo encima, antes que en diagonal, y conserva el destino de su salto cuando el mapa de Infinito genera o libera filas en pleno vuelo.

## [0.26.1] - 2026-11-19

### Changed
- El juego se llama **Waterbots**: así aparece en el título y en la pestaña del navegador.

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
