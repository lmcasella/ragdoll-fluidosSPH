# Referencias de estudio

Matemáticos, conceptos, leyes físicas y algoritmos que usa el proyecto, y los que se descartaron. Formato en `CLAUDE.md` ("Formato de `docs/referencias.md`").

- [Física de fluidos](#física-de-fluidos)
- [Métodos numéricos](#métodos-numéricos)
- [Física de cuerpos rígidos y ragdoll](#física-de-cuerpos-rígidos-y-ragdoll)
- [Geometría y raycast](#geometría-y-raycast)
- [Criterios de validación](#criterios-de-validación)
- [Descartados](#descartados)
- [Ejemplos de implementación](#ejemplos-de-implementación)

## Física de fluidos

| Concepto | Autor | Qué es | Dónde se usa | Para leer |
|---|---|---|---|---|
| **SPH (hidrodinámica de partículas suavizadas)** | Robert Gingold y Joe Monaghan (1977); Leon Lucy (1977) | Representa el fluido con partículas que interactúan con las vecinas dentro de un radio. | `src/combat/weapons.js:19`, `src/fluids/particles.js:15` | [Wikipedia](https://es.wikipedia.org/wiki/Hidrodin%C3%A1mica_de_part%C3%ADculas_suavizadas) |
| **LiquidFun** | Google, sobre el Box2D de Erin Catto | Variante de SPH con pares de partículas, presión `max(0, η(w − w₀))` y flags por partícula; aporta el sistema de disparos. | `src/fluids/particles.js:5`, `src/combat/weapons.js:19`, `docs/design/07-sph.md:7` | [sitio oficial](https://google.github.io/liquidfun/) |
| **Ecuaciones de Saint-Venant (aguas someras)** | Adhémar Barré de Saint-Venant (1871) | Conservación de masa y cantidad de movimiento del agua en una dimensión, con lecho variable. | `src/water/water.js:80`, `src/water/water.js:281` | [Wikipedia](https://en.wikipedia.org/wiki/Shallow_water_equations) |
| **Celeridad de onda larga `c = √(g h)`** | Joseph-Louis Lagrange (1781) | Velocidad de las ondas en aguas someras; fija las velocidades de onda del flujo. | `src/water/water.js:356`, `src/water/water.js:429` | [Wikipedia](https://en.wikipedia.org/wiki/Shallow_water_equations) |
| **Frente de Ritter** | August Ritter (1892) | Velocidad `2√(g h)` del frente de una rotura de presa sobre lecho seco; fija el tope de velocidad del campo. | `src/water/water.js:14` | [Wikipedia](https://en.wikipedia.org/wiki/Dam_break) |
| **Principio de Arquímedes** | Arquímedes de Siracusa | El empuje es el peso del fluido desalojado; con gravedad específica `SG`, la aceleración es `g ρ_col/(ρ_w SG)`. | `src/water/immersion.js:30`, `src/water/immersion.js:155`, `src/fluids/materials.js:8`, `src/fluids/materials.js:18` | [Wikipedia](https://es.wikipedia.org/wiki/Principio_de_Arqu%C3%ADmedes) |
| **Arrastre cuadrático** | Isaac Newton (*Principia*, libro II) | Fuerza de arrastre proporcional a `\|v_rel\|²` con coeficiente `C_d`; frena a la partícula inmiscible hacia la corriente. | `src/water/immersion.js:157`, `src/fluids/materials.js:9`, `src/fluids/materials.js:18` | [Wikipedia](https://es.wikipedia.org/wiki/Resistencia_aerodin%C3%A1mica) |
| **Aproximación de Boussinesq** | Joseph Boussinesq | La densidad de la mezcla solo entra en el empuje y en la cantidad de movimiento aportada (`SG · A · v_x`), no en la dinámica de la columna. | `src/water/immersion.js:26`, `src/water/immersion.js:109` | [Wikipedia](https://es.wikipedia.org/wiki/Aproximaci%C3%B3n_de_Boussinesq) |
| **Fricción de Manning** | Robert Manning (1889), antes Gauckler (1867) | Fricción de fondo `g n² u\|u\| / h^{1/3}` de un canal. | `src/water/water.js:36`, `src/water/water.js:489`, `src/water/water.js:498` | [Wikipedia](https://es.wikipedia.org/wiki/F%C3%B3rmula_de_Manning) |
| **Película laminar (Nusselt)** | Wilhelm Nusselt (1916) | Con perfil parabólico, la fricción de fondo promediada es `3 ν u / h²`; domina en columnas con miel. | `src/water/water.js:486`, `src/water/water.js:498` | — |
| **Regla logarítmica de mezcla de viscosidades** | Svante Arrhenius (1887) | `ln μ = X ln μ_miel + (1 − X) ln μ_agua`. | `src/core/physics/formulas.js:10`, `src/water/water.js:303`, `src/water/water.js:698`, `src/fluids/adhesion.js:54` | — |
| **Calor específico** | Joseph Black (siglo XVIII) | La energía térmica de una columna es `σ_w · c · h · T`. | `src/fluids/materials.js:8`, `src/water/water.js:151`, `src/water/water.js:184`, `src/water/immersion.js:48` | [Wikipedia](https://es.wikipedia.org/wiki/Calor_espec%C3%ADfico) |
| **Película de apriete (squeeze film)** | Jožef Stefan (1874) | Entre dos superficies que se acercan, el agua incompresible escurre de costado con `u = V_n x / h` y no sostiene carga estática. | `src/fluids/wallContact.js:11`, `src/fluids/wallContact.js:304`, `src/fluids/wallContact.js:333` | — |
| **Ecuación de continuidad** | Leonhard Euler (1757) | El caudal de la lluvia sale de la conservación de la masa: `Q = riseSpeed · W_libre`. | `src/water/flood.js:93`, `src/water/flood.js:160` | [Wikipedia](https://es.wikipedia.org/wiki/Ecuaci%C3%B3n_de_continuidad) |
| **Pistón de Stoker** | James J. Stoker (1957) | Un cuerpo que avanza por un charco levanta un frente y sufre `F = ½ σ_w g (h₂² − h₃²)`; es física del modelo y no se corrige. | `docs/design/14-agua.md:347`, `tests/drops-vs-robot.test.js:145` | — |
| **Longitud capilar y espesor de charco de equilibrio** | Pierre-Gilles de Gennes | Un charco quieto no se adelgaza más que `h_c = 2 κ⁻¹ sin(θ_E/2)`, con `κ⁻¹ = √(γ/(ρ g))`; fija `h_min` = 1,85 mm. | `src/water/water.js:35`, `docs/design/14-agua.md:163` | [Wikipedia](https://en.wikipedia.org/wiki/Capillary_length) |
| **Ángulo de contacto y ecuación de Young** | Thomas Young (1805) | El ángulo de equilibrio `θ_E` de una gota sobre un sólido; el diseño usa 40° (hormigón) como ángulo de avance. | `docs/design/14-agua.md:165` | [Wikipedia](https://es.wikipedia.org/wiki/%C3%81ngulo_de_contacto) |

## Métodos numéricos

| Concepto | Autor | Qué es | Dónde se usa | Para leer |
|---|---|---|---|---|
| **Volúmenes finitos** | Sergei Godunov (1959) | Actualiza cada celda con los flujos de sus caras; conserva masa y cantidad de movimiento. | `src/water/water.js:281`, `src/water/water.js:408` | [Wikipedia](https://es.wikipedia.org/wiki/M%C3%A9todo_de_los_vol%C3%BAmenes_finitos) |
| **Flujo HLL** | Ami Harten, Peter Lax y Bram van Leer (1983) | Flujo numérico entre dos estados con las velocidades de onda `S_L` y `S_R`. | `src/water/water.js:380` | [Wikipedia](https://en.wikipedia.org/wiki/Riemann_solver) |
| **Velocidades de onda de Einfeldt** | Bernd Einfeldt (1988) | Cota de `S_L` y `S_R` con los promedios de Roe entre estados mojados. | `src/water/water.js:369` | — |
| **Velocidades de onda con lado seco** | Eleuterio Toro | Con un lado seco, `S_R = u_L + 2 c_L` o `S_L = u_R − 2 c_R`. | `src/water/water.js:362` | — |
| **Reconstrucción hidrostática** | Audusse, Bouchut, Bristeau, Klein y Perthame (2004) | Esquema *well-balanced*: el lago en reposo sobre el escalón queda exactamente quieto y `h` no se hace negativa. | `src/water/water.js:335`, `src/water/water.js:392`, `src/water/water.js:409` | — |
| **Proyección por energía y caudal en escalones** | Noelle, Xing y Shu (2007); Henderson (1966) | Conserva la carga total y `q` al subir un escalón, con flujo estrangulado si la carga no alcanza. | `src/water/water.js:46`, `src/water/water.js:342` | — |
| **MUSCL con limitador minmod** | Bram van Leer (1979); Philip Roe (1986) | Segundo orden en espacio sin oscilaciones, limitando la pendiente entre celdas. | `src/core/math/numeric.js:55`, `src/water/water.js:454`, `src/water/water.js:456` | [Wikipedia](https://en.wikipedia.org/wiki/MUSCL_scheme) |
| **SSP-RK2 (Heun)** | Chi-Wang Shu y Stanley Osher (1988) | Integración temporal de segundo orden que conserva la positividad. | `src/water/water.js:456` | [Wikipedia](https://en.wikipedia.org/wiki/Heun%27s_method) |
| **Desingularización de la velocidad** | Alexander Kurganov y Guergana Petrova (2007) | `u = 2 h q / (h² + max(h², h_dry²))` evita dividir por una `h` casi nula. | `src/water/water.js:159`, `src/water/water.js:291` | — |
| **Condición CFL** | Richard Courant, Kurt Friedrichs y Hans Lewy (1928) | El paso no puede dejar que una onda cruce más de una fracción de celda: `n = ⌈dt · S_max / (CFL · dx)⌉` subpasos. | `src/water/water.js:32`, `src/water/water.js:529` | [Wikipedia](https://en.wikipedia.org/wiki/Courant%E2%80%93Friedrichs%E2%80%93Lewy_condition) |
| **Esquema upwind para escalares** | Richard Courant, Eugene Isaacson y Mina Rees (1952) | La energía y la miel viajan con el signo del flujo de masa de la cara. | `src/water/water.js:397` | [Wikipedia](https://en.wikipedia.org/wiki/Upwind_scheme) |
| **Método de Newton–Raphson** | Isaac Newton y Joseph Raphson | Resuelve `h* + q²/(2 g h*²) = Ẽ` en la proyección de escalones. | `src/core/math/numeric.js:16`, `src/water/water.js:88` | [Wikipedia](https://es.wikipedia.org/wiki/M%C3%A9todo_de_Newton) |
| **Bisección** | Bernard Bolzano (1817) | Invierte el área libre para hallar el nivel del agua. | `src/core/math/numeric.js:37`, `src/water/flood.js:82` | [Wikipedia](https://es.wikipedia.org/wiki/M%C3%A9todo_de_bisecci%C3%B3n) |
| **Euler implícito** | Leonhard Euler | La fricción y el arrastre se tratan de forma implícita linealizada, estable aunque el término sea rígido. | `src/water/water.js:499`, `src/water/immersion.js:158` | [Wikipedia](https://en.wikipedia.org/wiki/Backward_Euler_method) |
| **Cloud-in-cell** | Charles Birdsall y Dieter Fuss (1969) | Reparte una fuente puntual entre las dos celdas vecinas con pesos lineales. | `src/water/water.js:258` | [Wikipedia](https://en.wikipedia.org/wiki/Particle-in-cell) |
| **Interpolación lineal** | — | Lee el campo en `x` entre centros de celda, sin extrapolar. | `src/water/water.js:188` | [Wikipedia](https://es.wikipedia.org/wiki/Interpolaci%C3%B3n_lineal) |
| **Separación de operadores (Lie–Trotter)** | Sophus Lie y Hale Trotter (1959) | Las fuentes (absorción, reacción) se aplican aparte del avance del campo. | `src/water/water.js:255`, `index.js:484` | [Wikipedia](https://en.wikipedia.org/wiki/Operator_splitting) |
| **Paso fijo con acumulador** | Glenn Fiedler (2004) | Simula en pasos de 1/60 s sin importar el frame; la escala de tiempo da la cámara lenta. | `index.js:418`, `index.js:440`, `index.js:472` | [artículo](https://gafferongames.com/post/fix_your_timestep/) |
| **Secuencia áurea (equidistribución)** | Hermann Weyl (1916) | `(i · φ⁻¹) mod 1` reparte puntos de forma pareja y determinista. | `src/combat/weapons.js:88`, `src/combat/weapons.js:174`, `src/water/flood.js:7`, `src/water/flood.js:89` | [Wikipedia](https://en.wikipedia.org/wiki/Equidistribution_theorem) |
| **Hash entero xorshift-multiply** | George Marsaglia (2003) | Da piezas y ángulos repetibles sin `Math.random` (chispas del cortocircuito). | `src/core/math/random.js:39`, `src/core/math/random.js:23` | [Wikipedia](https://en.wikipedia.org/wiki/Xorshift) |

## Física de cuerpos rígidos y ragdoll

| Concepto | Autor | Qué es | Dónde se usa | Para leer |
|---|---|---|---|---|
| **Solver de Box2D** | Erin Catto | Impulsos secuenciales con integración de Euler semi-implícita; `stepWorld` lo llama 8 veces por paso con 20 iteraciones de velocidad. | `lib/ragimporter.js:66`, `lib/ragimporter.js:92`, `index.js:482` | [sitio oficial](https://box2d.org/) |
| **Control PD de articulaciones** | Nicolas Minorsky (1922) | El motor corrige el ángulo con `G · error − D · (velocidad − tasa)`, con tope de velocidad y de torque. | `lib/instance.js:35` | [Wikipedia](https://es.wikipedia.org/wiki/Controlador_PID) |
| **Impulso y conservación de la cantidad de movimiento** | Isaac Newton | Un cambio de velocidad `Δv` de una masa `m` se paga con el impulso opuesto `m Δv` sobre el otro cuerpo. | `src/fluids/wallContact.js:197`, `src/fluids/wallContact.js:281`, `src/water/immersion.js:170` | [Wikipedia](https://es.wikipedia.org/wiki/Cantidad_de_movimiento) |
| **Coeficiente de restitución** | Isaac Newton | Relación entre las velocidades normales de salida y llegada; el contorno inelástico lo lleva a 0. | `src/fluids/wallContact.js:189` | [Wikipedia](https://es.wikipedia.org/wiki/Coeficiente_de_restituci%C3%B3n) |
| **Masa reducida** | — | `1/μ = 1/m₁ + 1/m₂`; limita el impulso entre dos cuerpos para que no inviertan su velocidad relativa. | `src/fluids/wallContact.js:328`, `src/water/immersion.js:160` | [Wikipedia](https://es.wikipedia.org/wiki/Masa_reducida) |
| **Contorno inelástico** | propuesta de `physics-analyst` para el proyecto (D8) | Recorta la componente normal saliente `u_n ← min(u_n, max(0, u_n,antes))` en cada subpaso. | `src/fluids/wallContact.js:189`, `src/fluids/wallContact.js:193`, `docs/design/14-agua.md:292` | — |
| **Velocidad de acercamiento** | — | Velocidad relativa proyectada sobre la normal del contacto; sobre `IMPACT_SPEED` hay daño. | `src/combat/damage.js:112`, `src/combat/damage.js:120` | — |

## Geometría y raycast

| Concepto | Autor | Qué es | Dónde se usa | Para leer |
|---|---|---|---|---|
| **Raycast de Box2D (`b2World.RayCast`)** | Erin Catto | Recorre un árbol de cajas (AABB) y llama al callback por cada figura cruzada; lo que devuelve define el modo (−1 ignora, `fraction` recorta). | `src/core/raycast.js:14`, `src/core/raycast.js:45`, `src/combat/weapons.js:165`, `src/ragdoll/ActiveRagdoll.js:272`, `index.js:260` | [sitio oficial](https://box2d.org/) |
| **Caja envolvente alineada (AABB)** | — | `[minX, minY, maxX, maxY]` de cada figura, usada para pegar miel, ubicar la gota y calcular el punto más bajo del robot. | `src/ragdoll/ActiveRagdoll.js:215`, `src/fluids/wallContact.js:312`, `src/combat/damage.js:154` | [Wikipedia](https://en.wikipedia.org/wiki/Minimum_bounding_box) |
| **Rotación 2D con espejo** | — | Lleva la boca del arma del sistema local del cuerpo al del mundo, con `flipX`. | `src/ragdoll/ActiveRagdoll.js:278` | — |
| **Apuntado por la línea del cañón** | — | Corrige el ángulo del hombro con `asin(offset / dist)` para que la línea del cañón, y no la del hombro, pase por el objetivo. | `src/ragdoll/ActiveRagdoll.js:326` | — |
| **Camino angular más corto** | — | Evita que el brazo gire por el otro lado al cruzar ±π. | `src/ragdoll/ActiveRagdoll.js:341` | — |
| **Distancia a una caja orientada y a un círculo** | — | Acerca el segundo círculo de cada gota hasta tocar la superficie del cuerpo. | `src/render/fluidSurfaces.js:135` | [Wikipedia](https://en.wikipedia.org/wiki/Signed_distance_function) |
| **Grilla uniforme** | — | Cada celda lista las superficies cercanas, para consultar solo las de la celda de la gota. | `src/render/fluidSurfaces.js:67`, `src/render/fluidSurfaces.js:139` | [Wikipedia](https://en.wikipedia.org/wiki/Grid_(spatial_index)) |
| **Fórmula del área de Gauss (shoelace)** | Carl Friedrich Gauss | Área de un polígono como `½ \|Σ (xₐ y_b − x_b yₐ)\|`; el test mide con ella el área que dibuja `waterOutline`. | `src/core/math/geometry.js:9`, `tests/helpers/drawn-area.js:18`, `tests/helpers/invariants-run.js:231` | [Wikipedia](https://en.wikipedia.org/wiki/Shoelace_formula) |
| **Muestreo en grilla regular (regla del punto medio)** | — | El área de la unión de círculos y cápsulas se cuenta como las celdas de 2,5 mm cuyo centro cae dentro, fila por fila. | `tests/helpers/drawn-area.js:61`, `tests/helpers/drawn-area.js:142` | [Wikipedia](https://en.wikipedia.org/wiki/Midpoint_rule) |
| **Cámara con encuadre y suavizado exponencial** | Robert G. Brown (1956) | Encuadra a los jugadores con margen y mueve cámara y zoom con `1 − e^{−k dt}`, independiente del frame. | `src/render/camera.js:46`, `src/render/camera.js:81` | [Wikipedia](https://en.wikipedia.org/wiki/Exponential_smoothing) |
| **Transformación afín de cámara** | — | Pasa de metros con Y hacia arriba a píxeles y de la pantalla al mundo. | `src/render/camera.js:98`, `src/render/camera.js:105` | [Wikipedia](https://es.wikipedia.org/wiki/Transformaci%C3%B3n_af%C3%ADn) |
| **Metaballs (efecto "goo")** | James Blinn (1982) | Une las gotas vecinas en una sola masa de líquido: cada gota suma un campo `(1 − q²)²` y un `PIXI.Filter` corta con umbral el campo sumado, sin desenfoque. | `src/render/fluidDraw.js:40`, `src/render/thresholdFilter.js:52` | [Wikipedia](https://en.wikipedia.org/wiki/Metaballs) |
| **Zona muerta radial** | — | El stick de apuntar solo cuenta si la norma `√(x² + y²)` supera el umbral. | `src/input/Input.js:48`, `src/input/Input.js:208` | [Wikipedia](https://en.wikipedia.org/wiki/Deadband) |

## Criterios de validación

| Concepto | Autor | Qué es | Dónde se usa | Para leer |
|---|---|---|---|---|
| **Rotura de presa de Ritter** | August Ritter (1892) | El frente a `2√(g h₀)` y el perfil `(2c₀ − x/t)² / (9g)` validan el campo y la gota. | `tests/slow/shallow-water.test.js:124`, `tests/slow/shallow-water.test.js:151`, `tests/slow/pure-water.test.js:24` | [Wikipedia](https://en.wikipedia.org/wiki/Dam_break) |
| **Solución de Stoker** | James J. Stoker (1957) | Rotura de presa sobre lecho mojado: meseta intermedia y onda de choque. | `tests/slow/shallow-water.test.js:170` | — |
| **Lago en reposo (*well-balanced*)** | Audusse et al. (2004) | El agua quieta sobre el lecho real no debe moverse. | `tests/slow/shallow-water.test.js:69` | — |
| **Conservación del volumen** | — | `Σ h dx` constante con olas y frentes secos. | `tests/slow/shallow-water.test.js:58`, `tests/immersion.test.js:17` | [Wikipedia](https://es.wikipedia.org/wiki/Conservaci%C3%B3n_de_la_masa) |
| **Onda larga `√(g h)`** | Joseph-Louis Lagrange (1781) | Una perturbación chica viaja a `c = √(g h)`. | `tests/slow/shallow-water.test.js:114`, `tests/immersion.test.js:62` | [Wikipedia](https://en.wikipedia.org/wiki/Shallow_water_equations) |
| **Seiche, fórmula de Merian, y teoría de Airy** | Johann Rudolf Merian (1828); George Airy | Período `T = 2L/√(g h)` del modo fundamental, comparado con la dispersión de Airy `c = √(g tanh(kh)/k)`. | `tests/slow/shallow-water.test.js:302`, `tests/slow/shallow-water.test.js:319`, `tests/slow/shallow-water.test.js:323` | [Wikipedia](https://es.wikipedia.org/wiki/Seiche) |
| **Vertedero de cresta ancha** | Bélanger; Henderson (1966) | Caudal de la cresta `√g (2H/3)^{3/2}` con la carga total `H`. | `tests/slow/shallow-water.test.js:331`, `tests/slow/shallow-water.test.js:334`, `tests/slow/shallow-water.test.js:362` | [Wikipedia](https://es.wikipedia.org/wiki/Vertedero) |
| **Velocidad terminal en agua** | Arquímedes; Isaac Newton | `√(2 g (SG − 1) A_p / (C_d D))` = 1,55 m/s para la lava y 0,79 m/s para la miel (±15 %). | `tests/immersion.test.js:100`, `tests/immersion.test.js:103`, `tests/immersion.test.js:124`, `tests/immersion.test.js:142` | [Wikipedia](https://es.wikipedia.org/wiki/Velocidad_terminal) |
| **Flujo de Couette y esfuerzo de fondo de Manning** | Maurice Couette (1890); Robert Manning (1889) | Cota del desplazamiento horizontal de la miel apoyada en el fondo (H6, ≤ 0,5 m en 60 s): el arrastre del modelo no tiene apantallamiento y sobreestima ~10² veces la fuerza de la capa de Couette cerca del lecho. | `tests/slow/user-scenarios.test.js:218`, `tests/slow/user-scenarios.test.js:273`, `tests/slow/invariants.test.js:215` | [Wikipedia](https://es.wikipedia.org/wiki/Flujo_de_Couette) |
| **Conservación de la cantidad de movimiento** | Isaac Newton | Lo absorbido suma `Σ SG A_p v_x` y la reacción de la inmersión no invierte velocidades. | `tests/immersion.test.js:34`, `tests/immersion.test.js:143` | [Wikipedia](https://es.wikipedia.org/wiki/Cantidad_de_movimiento) |
| **Tiempo de la película de apriete** | Jožef Stefan (1874) | Integra la energía con masa agregada `σ_w W_c³/(12 h)` para fijar el tiempo de referencia `t_ref` de llegada al piso y la continuidad de la salida. | `tests/helpers/squeeze-bench.js:93`, `tests/squeeze-escape.test.js:51`, `tests/squeeze-escape.test.js:89` | — |
| **Peso de un charco `N m_p g`** | Isaac Newton | Un charco quieto sobre una placa pesa lo que sus gotas. | `tests/squeeze-escape.test.js:40` | [Wikipedia](https://es.wikipedia.org/wiki/Leyes_de_Newton) |
| **Flujo de cantidad de movimiento `ṁ v`** | Isaac Newton; Leonhard Euler | El empuje del chorro sobre una placa es `rate · σ_w · A_p · v`. | `tests/slow/pure-water.test.js:78` | — |
| **Restitución `e ≤ 0,2`** | Isaac Newton | El chorro y las gotas no rebotan contra el piso. | `tests/slow/pure-water.test.js:69`, `tests/wall-contact.test.js:65` | [Wikipedia](https://es.wikipedia.org/wiki/Coeficiente_de_restituci%C3%B3n) |
| **Conservación de la energía `½\|v\|² + g y`** | Hermann von Helmholtz (1847) | El chorro no gana energía al nacer. | `tests/stream-energy.test.js:89` | [Wikipedia](https://es.wikipedia.org/wiki/Conservaci%C3%B3n_de_la_energ%C3%ADa) |

## Descartados

| Descartado | Autor | Se optó por | Motivo | Dónde se decidió | Para leer |
|---|---|---|---|---|---|
| **Escape de gotas con la velocidad de Bernoulli y `F = K w²`** | Daniel Bernoulli (1738) | La película de apriete (Stefan). | `K w²` es un artefacto del motor: 215 J en las gotas contra 77 J que bajó el cuerpo, hasta 16 m/s. | `docs/design/14-agua.md:300` | [Wikipedia](https://es.wikipedia.org/wiki/Principio_de_Bernoulli) |
| **Dejar de recortar la gota apretada en el contorno inelástico** | — | El escape de la película de apriete. | La gota seguía sosteniendo al cuerpo como puntal. | `docs/design/14-agua.md:298` | — |
| **Chorro en dos carriles (`lanes` = 2)** | — | Un carril con caudal al tope `speed/(1,5 r)`. | El chorro derivaba de costado y fallaba P2. | `docs/design/14-agua.md:366` | — |
| **Arrastre del aire sobre la lluvia** | Isaac Newton | Soltar las gotas a `dropSpeed` constante. | Queda fuera de alcance (decisión del usuario: la lluvia rápida no es un problema). | `docs/design/14-agua.md:394`, `docs/design/14-agua.md:940` | [Wikipedia](https://es.wikipedia.org/wiki/Resistencia_aerodin%C3%A1mica) |
| **Agua masiva del nivel en partículas (SPH de LiquidFun con `VISCOUS` y `STATIC_PRESSURE`)** | Google | El campo de alturas de Saint-Venant. | ~7,2 ms por frame, frente de rotura de presa a −70/−75 % de Ritter y pico de 33 m/s al arrancar. | `docs/design/14-agua.md:103`, `docs/design/14-agua.md:288` | [sitio oficial](https://google.github.io/liquidfun/) |
| **Mundo de fluidos separado** | — | Un solo sistema líquido. | Fugas sobre ~13 m/s y empuje sin calibrar; innecesario sin agua en partículas. | `docs/design/12-decisiones.md:34` | — |
| **Empuje aplicado en cada subpaso con un objeto falso en `stepWorld`** | — | Un impulso por paso (`F · dt`). | Depende de un detalle de RagImporter que no está en su contrato (el esquema funcionaba). | `docs/design/14-agua.md:270` | — |
| **Offset fijo del buffer de contactos de LiquidFun** | — | Buscar y validar el offset al arrancar (`src/fluids/wallContact.js:96`). | Frágil: cambia con cada compilación del motor. | `docs/design/12-decisiones.md:34` | [sitio oficial](https://google.github.io/liquidfun/) |
| **Reciclado de partículas por edad del motor (`destroyByAge`)** | Google | `destroyByAge: false` y un `ParticleStore` propio (`src/fluids/particleStore.js:30`). | Sin `lifetime` por partícula es indefinido y el build no expone `SetParticleLifetime`. | `docs/design/12-decisiones.md:24` | [sitio oficial](https://google.github.io/liquidfun/) |
| **Grupos de partículas por pulsación o por paso** | Google | Partículas sueltas con crédito acumulado (`src/combat/weapons.js:146`). | Se ven como balas que rebotan. | `docs/design/12-decisiones.md:22` | [sitio oficial](https://google.github.io/liquidfun/) |
| **Pegar la miel con `BeginParticleBodyContact`** | Erin Catto | Una consulta geométrica por paso (`src/combat/damage.js:145`). | Un robot quieto en el charco deja de recibir avisos. | `docs/design/12-decisiones.md:33` | [sitio oficial](https://box2d.org/) |
| **Tensión superficial (`TENSILE`) en los disparos** | Google | Tensiones en 0 (`src/combat/weapons.js:28`). | Causaba el rebote de las gotas y no daba cohesión física. | `docs/design/12-decisiones.md:31` | [sitio oficial](https://google.github.io/liquidfun/) |
| **`b2DistanceJoint` para el gancho** | Erin Catto | `b2RopeJoint`. | Es una barra rígida y empuja hacia afuera. | `docs/design/12-decisiones.md:38` | [sitio oficial](https://box2d.org/) |
| **Desenfoque más umbral con un filtro SVG para fundir las gotas** | — | La suma de campos por gota con umbral en un `PIXI.Filter` (`src/render/thresholdFilter.js:60`). | El campo de cada partícula reemplaza al desenfoque (#310). | `docs/design/07-sph.md:73` | — |
| **Pegado por columnas de miel disuelta en el campo** | — | Miel inmiscible con pegado por partículas. | La miel se volvía agua (regresión). | `docs/design/14-agua.md` (D11, #110) | — |

<hr>

## Ejemplos de implementación

### Control PD de articulaciones

```js
rate + clampAbs(pose.G * error - pose.D * (jointSpeed - rate), motor.maxSpeed)
```

### Flujo HLL

```js
gM = (sR * flM - sL * frM + sL * sR * (hRs - hLs)) * inv;
```
