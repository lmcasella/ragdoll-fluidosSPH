# 15. Química y física de las interacciones entre sustancias

Qué pasa en la realidad cuando se encuentran las sustancias del juego. Es la referencia física para que el diseño decida cómo llevarlo al juego ([14-agua](14-agua.md)) y para validar el modelo. **No define jugabilidad ni balance.**

- **Escala de referencia** ([14.1](14-agua.md#141-unidades-rebanada-2d-y-materiales)): partícula de radio `r` = 0,06 m, área `A_p` = 0,0081 m², diámetro equivalente `D` = 1,5 r = 0,09 m y perímetro equivalente `P` = 0,319 m (círculo de área `A_p`). Rebanada de espesor `b` = 12 mm, así que el área de intercambio de una partícula es `P · b` = 3,83·10⁻³ m². Masas por partícula: agua 0,097 kg, ácido 0,102 kg, miel 0,138 kg, lava y piedra 0,253 kg. Tiempos de segundos a minutos; longitudes de 0,1 a 50 m.
- **Signos:** ΔH < 0 libera calor (exotérmico). Los calores latentes se dan en el sentido indicado: evaporar o fundir absorbe (+), condensar o solidificar libera (−).
- **Temperaturas** en °C (en radiación, K). Ambiente: aire a 20 °C, 1 atm y humedad relativa del 50 % (supuesto).
- **Valores:** de tabla o ley física, con referencia `[Rn]` ([15.6](#156-referencias)). Los marcados *(verificar)* son órdenes de magnitud que `physics-analyst` debe confirmar antes de usarlos como criterio de aceptación.
- **Fuera de esta lista:** el "fuego" de [04-fluidos](04-fluidos.md) (gases), y los sólidos del nivel: [05-escenario](05-escenario.md) no dice de qué son el piso, las paredes ni las plataformas. Si se define, se agrega su fila: con acero, es igual al robot; con hormigón, el ácido lo ataca (Ca(OH)₂ + H₂SO₄ → CaSO₄ + 2 H₂O) a una velocidad despreciable en segundos.

## 15.1 Sustancias reales representativas

### Agua

Agua dulce (lluvia y pileta) con sales en trazas.

| Propiedad | 20 °C | 100 °C | Ref. |
|---|---|---|---|
| Densidad ρ | 998,2 kg/m³ | 958,4 kg/m³ | [R1] |
| Viscosidad μ | 1,00·10⁻³ Pa·s | 0,28·10⁻³ Pa·s | [R1] |
| Calor específico `c_p` | 4182 J/(kg·K) | 4216 J/(kg·K) | [R1] |
| Conductividad térmica `k` | 0,598 W/(m·K) | 0,679 W/(m·K) | [R5] |
| Tensión superficial γ | 0,0728 N/m | 0,0589 N/m | [R1] |
| Calor latente de vaporización `L_v` | **2,454·10⁶ J/kg** | **2,257·10⁶ J/kg** | [R1] |
| Calor latente de fusión `L_f` (0 °C) | 3,34·10⁵ J/kg | — | [R1] |
| Presión y densidad de vapor saturado | 2,34 kPa; 0,0173 kg/m³ | 101,3 kPa; 0,598 kg/m³ | [R1] |
| Conductividad eléctrica | pura 5,5·10⁻⁶ S/m; lluvia 10⁻³–5·10⁻³ S/m; red 5·10⁻³–8·10⁻² S/m | — | [R2] |

**Color:** incolora en capas de menos de 1 m. En varios metros absorbe el rojo (≈ 0,6 1/m a 700 nm contra ≈ 0,01 1/m a 450 nm) y se ve azul verdosa; referencia para ~5 m sobre fondo claro: `#4F9DC4` *(verificar)* [R20].

### Ácido → ácido sulfúrico diluido al 8 % m/m

**Justificación:**
1. La gravedad específica del diseño (1,05) coincide con la del H₂SO₄ al 8 % a 20 °C (1,052) [R2].
2. No es volátil: a temperatura ambiente no desprende gas propio (el HCl sí), así que su única fase gaseosa en el juego es el H₂ que libera al atacar el acero.
3. Ataca al acero al carbono con desprendimiento de H₂, que es lo que el juego llama corrosión ([ficha 24](#24-ácido--robot)).
4. Diluido no deshidrata azúcares (eso exige ácido concentrado), así que con la miel solo se mezcla.
5. El verde del juego no es del ácido, que es incoloro. Sí es el color del Fe²⁺ disuelto cuando el ácido ya atacó acero (verde pálido).

| Propiedad | Valor (20 °C) | Ref. |
|---|---|---|
| ρ | 1052 kg/m³ | [R2] |
| Concentración | 0,86 mol/L; pH ≈ 0 | [R2] |
| μ | ≈ 1,17·10⁻³ Pa·s *(verificar)* | [R2] |
| `c_p` | ≈ 3,85·10³ J/(kg·K) *(verificar)* | [R3] |
| `k` | ≈ 0,58 W/(m·K) | [R3] |
| Punto de ebullición (1 atm) | ≈ 101 °C; sube a medida que se concentra (≈ 124 °C al 50 %, 338 °C en el azeótropo de 98,3 %) | [R2], [R3] |
| Conductividad eléctrica | ≈ 32 S/m (unas 10³ veces la del agua de red) | [R2] |
| Color | Incoloro (`#FFFFFF` con transparencia, como el agua); con Fe²⁺ disuelto, verde pálido `#CFE8C6` | [R2] |

### Miel → miel de flores con 17 % de agua

**Justificación:** es la sustancia misma. Composición típica: fructosa ≈ 38 %, glucosa ≈ 31 %, otros azúcares ≈ 9 %, agua 17 % (la norma admite hasta 20 %) y el resto ácidos orgánicos, minerales y enzimas [R12]. Los valores del diseño (SG 1,42, μ 10 Pa·s) corresponden a esa humedad a 20 °C.

| Propiedad | Valor | Ref. |
|---|---|---|
| ρ (20 °C) | 1420 kg/m³ (1400–1450) | [R12] |
| μ (20 °C) | 10 Pa·s (2–20 según humedad: cada +1 % de agua la divide por ~1,5–2) *(verificar)* | [R11] |
| μ(T) | Arrhenius con `E_a` ≈ 90 kJ/mol (rango 60–140) cerca del ambiente: ≈ 1 Pa·s a 40 °C y ≈ 0,15 Pa·s a 60 °C; a 100 °C, del orden de 10⁻² Pa·s (extrapolación, *verificar*) | [R11] |
| `c_p` | 2,4·10³ J/(kg·K) (2,2–2,6·10³) | [R12] |
| `k` | 0,5 W/(m·K) | [R12] |
| Actividad de agua | 0,55–0,65 (higroscópica: absorbe vapor del aire con humedad relativa > ~60 %) | [R12] |
| pH | 3,5–4,5 (ácido glucónico) | [R12] |
| Calentamiento | No tiene punto de ebullición propio: pierde agua, carameliza desde ~110 °C (fructosa) y piroliza por encima de ~200 °C | [R13] |
| Color | Ámbar `#E3A21A`; caramelizada `#8B4A12`; carbonizada `#1E1A17` | [R12], [R13] |

### Lava → basalto toleítico fundido a 1150 °C

**Justificación:** es la lava más común y la más fluida (la de las coladas hawaianas), la única que se parece a un chorro. El diseño ya la toma como basalto (SG 2,6, solidifica a 1000 °C).

| Propiedad | Valor | Ref. |
|---|---|---|
| Temperatura de emisión | 1150 °C (1100–1200) | [R8] |
| Liquidus / solidus | ≈ 1200 °C / ≈ 1000 °C (980–1000) | [R8] |
| ρ | 2650 kg/m³ desgasificada (2600 con vesículas; el diseño usa 2600) | [R8] |
| **μ** | **10²–10³ Pa·s a 1150 °C** (referencia 300 Pa·s): es **30 veces más viscosa que la miel**. Sube un orden de magnitud cada 30–50 K al cristalizar, y por debajo de ~1070 °C tiene umbral de fluencia (Bingham) | [R7] |
| `c_p` | 1200 J/(kg·K) (1100–1500) | [R8] |
| `k` | 1,5 W/(m·K) (1–2) | [R8] |
| `L_f` | 4,0·10⁵ J/kg (3,5–5·10⁵) | [R8] |
| Emisividad | 0,9 (0,7–0,95) | [R8] |
| Tensión superficial | ≈ 0,35 N/m | [R8] |
| Difusividad térmica α = k/(ρc) | 4,7·10⁻⁷ m²/s | derivado |
| Efusividad `e = √(kρc)` | 2,2·10³ J/(m²·K·s^½) | derivado [R6] |
| Color | Por temperatura, ver [color por incandescencia](#color-por-incandescencia) | [R21] |

### Piedra → basalto solidificado

Basalto que solidificó desde la lava. Si se enfrió en agua, su superficie es vidrio (taquilita) y se fractura (hialoclastita).

| Propiedad | Valor | Ref. |
|---|---|---|
| ρ | 2600–3000 kg/m³ (2900 densa; 2000–2700 vesiculada) | [R24] |
| `c` | 840 J/(kg·K) a 20 °C, ~1100 a 800 °C (media 1000) | [R24] |
| `k` | 1,5–2 W/(m·K) | [R24] |
| Transición vítrea | ≈ 650–720 °C (por encima, el vidrio se ablanda y dos piedras calientes se sueldan) *(verificar)* | [R8] |
| Refusión | Por encima del solidus (1000 °C) y solo si recibe `L_f` = 4,0·10⁵ J/kg | [R8] |
| Solubilidad en agua | Insoluble | [R22] |
| Color | Gris oscuro `#34322F`; vidrio negro `#151515`; caliente, por incandescencia | [R24] |

### Vapor de agua

| Propiedad | Valor (100 °C, 1 atm) | Ref. |
|---|---|---|
| ρ | 0,598 kg/m³ (1 kg de agua líquida da 1,67 m³ de vapor: 1603 veces su volumen) | [R1] |
| `c_p` | 2,08·10³ J/(kg·K) saturado; ≈ 1,9·10³ sobrecalentado a baja presión (el diseño usa 2010, dentro del 5 %) | [R1] |
| μ | 1,23·10⁻⁵ Pa·s | [R1] |
| `k` | 0,025 W/(m·K) | [R1] |
| Color | **Invisible.** Lo que se ve blanco es niebla: gotas de ~10 µm condensadas al mezclarse con aire frío, `#F2F4F5` con transparencia | [R1] |

**Escala:** la parcela de vapor del juego lleva la masa de una partícula de agua (0,097 kg), que como vapor real ocupa 0,163 m³: **13,5 m²** de rebanada, más que un robot ([14.8](14-agua.md#148-térmica-y-fases) ya lo declara como límite).

### Aire

Aire seco con 50 % de humedad relativa a 20 °C: ρ 1,204 kg/m³, `c_p` 1007 J/(kg·K), `k` 0,0257 W/(m·K), μ 1,82·10⁻⁵ Pa·s, 21 % de O₂ [R5]. Transparente.

### Robot → acero al carbono bajo (AISI 1010–1020)

**Justificación:** es el acero estructural más común en estructuras y robots de construcción simple. Conduce la electricidad (cortocircuito), reacciona con el ácido diluido liberando H₂ y **no se funde con lava basáltica** (solidus ≈ 1490 °C > 1150 °C).

**Alternativas, como dato:** el inoxidable 304 se pasiva y el ácido diluido frío lo ataca mucho más lento *(verificar)*. El aluminio 6061 funde entre 582 y 652 °C: **la lava lo fundiría**.

| Propiedad | Valor | Ref. |
|---|---|---|
| ρ | 7832 kg/m³ | [R5] (AISI 1010) |
| `c` | 434 J/(kg·K) | [R5] |
| `k` | 63,9 W/(m·K) | [R5] |
| Efusividad `e` | 1,47·10⁴ J/(m²·K·s^½) | derivado |
| Fusión | 1490–1530 °C; `L_f` ≈ 2,7·10⁵ J/kg | [R15] |
| Resistividad eléctrica | ≈ 1,4·10⁻⁷ Ω·m | [R15] |
| Emisividad | 0,1–0,3 pulido; 0,6–0,8 oxidado | [R5] |
| Resistencia a alta temperatura (fluencia relativa) | 1,0 hasta 400 °C; 0,78 a 500 °C; 0,47 a 600 °C; 0,23 a 700 °C | [R14] |
| Color | Gris acero `#8C9095`; herrumbre `#A0522D`; colores de revenido: paja `#E3CF7A` (~220 °C), azul `#3E5BA9` (~300 °C) | [R15] |

**Relación con D1:** el robot tiene gravedad específica media 1,00 ([14.1](14-agua.md#141-unidades-rebanada-2d-y-materiales)). Con acero de 7832 kg/m³, eso es un casco hueco con ~13 % de acero en volumen. Para la térmica cuenta la masa real de acero de cada pieza (1 kg → 434 J/K).

### Color por incandescencia

Para la lava, la piedra y el acero calientes. Por debajo del punto de Draper (≈ 525 °C) no hay brillo visible y se ve el color propio del material [R21].

| T (°C) | Color | Referencia |
|---|---|---|
| < 525 | Sin brillo (color propio) | — |
| 525–700 | Rojo oscuro, tenue | `#5A0F08` |
| 700–900 | Rojo cereza | `#B22A0E` |
| 900–1000 | Naranja rojizo | `#E0490F` |
| 1000–1100 | Naranja | `#FF6A13` |
| 1100–1200 | Naranja amarillento | `#FF8C1A` |
| > 1300 | Amarillo | `#FFC040` |

Los colores son una aproximación de la ley de Planck vista por el ojo, de referencia para el dibujo *(verificar)*.

### Temperatura de contacto

Cuando dos cuerpos a `T₁` y `T₂` se tocan, la superficie de contacto llega en el acto a `T_c = (e₁T₁ + e₂T₂)/(e₁ + e₂)`, con `e = √(kρc)` (dos sólidos semi-infinitos) [R6]. Define qué pasa en el primer instante:

| Contacto (lava a 1150 °C contra…) | `e` del otro | `T_c` | Consecuencia inmediata |
|---|---|---|---|
| Acero a 20 °C | 1,47·10⁴ | **166 °C** | Piel de vidrio instantánea sobre el acero |
| Agua a 20 °C | 1,59·10³ | **675 °C** | Mayor que el límite de sobrecalentamiento del agua (~300 °C): ebullición en película (Leidenfrost) |
| Miel a 20 °C | 1,33·10³ | **722 °C** | Pirólisis superficial instantánea y evaporación del agua de la miel |
| Piedra a 20 °C | 1,98·10³ | **613 °C** | Costra de la lava sobre la piedra |
| Aire | ≈ 5,5 | ≈ 1150 °C | Sin enfriamiento por contacto: domina la radiación |

## 15.2 Escala: qué domina y qué es despreciable

**Lo que domina a escala de partícula (0,09 m) y de segundos:**

- **Gravedad sobre capilaridad.** El número de Bond `Bo = ρ g R²/γ` con `R` = 0,045 m vale 270 en el agua, ~500 en la miel y ~150 en la lava. La tensión superficial, el mojado y la forma de gota no gobiernan; sí la gravedad, la inercia y la viscosidad.
- **Viscosidad.** Con 1 m/s: el agua tiene Re ≈ 9·10⁴ (turbulenta), la miel Re ≈ 13 (laminar) y la lava Re ≈ 0,8 (flujo reptante). Un charco de 5 cm escurre a `u ≈ ρ g H³/(3 μ L)` [R18]: la miel a ~0,1 m/s y la lava a **~7 mm/s**.
- **Ruptura en el aire.** Un chorro de agua de 9 cm a 14 m/s tiene número de Weber `We = ρ_a v² D/γ` ≈ 290, muy por encima del crítico (≈ 12). En la realidad se rompe en gotas en `t ≈ (D/v) √(ρ_l/ρ_a)` ≈ 0,2 s [R23]. La miel y la lava, por su viscosidad (número de Ohnesorge alto), forman hilos en lugar de gotas.
- **Térmica de contacto e interfaces:** la temperatura de contacto, la ebullición en película, la radiación de la lava y la condensación del vapor actúan en segundos a minutos.

**Despreciable a esta escala:**

| Fenómeno | Magnitud real | Por qué no se ve |
|---|---|---|
| Difusión molecular en líquido quieto | Recorrido `√(2Dt)` en 60 s: ácido (D = 1,7·10⁻⁹ m²/s) 0,45 mm; azúcar (6,7·10⁻¹⁰) 0,28 mm; calor en agua (α = 1,4·10⁻⁷) 4 mm [R19] | Mucho menor que una partícula (90 mm). Mezcla solo la cizalla |
| Corrosión del acero por el ácido | 1–10 mm/año → ≤ 0,06 µm en 3 min *(verificar)* [R15] | Sin pérdida estructural en una ronda; solo se ven burbujas de H₂ |
| Herrumbre del acero en agua o aire | µm por año | Días |
| Calor de dilución del ácido al 8 % | ΔT < 1 K ([ficha 3](#3-agua--ácido)) | Despreciable frente a cualquier otro intercambio |
| Calor de dilución de la miel | \|ΔT\| < 1–2 K *(verificar)* | Ídem |
| Ataque del ácido al basalto a 20 °C | 10⁻¹⁰–10⁻⁸ mol/(m²·s) [R22] | Semanas a años |
| Higroscopía de la miel en el aire | Horas a días | — |
| Evaporación real del agua al aire | 10⁻⁸–10⁻⁷ m/s → 1–6 µm por minuto | [14.7b](14-agua.md#147b-evaporación-de-agua-detenida-d7) la acelera con `F_evap`, como aproximación declarada |
| Desgasificación de la lava (H₂O, CO₂, SO₂) | Se supone lava ya desgasificada | — |
| Oxidación del acero por vapor (3 Fe + 4 H₂O → Fe₃O₄ + 4 H₂) | Apreciable solo por encima de ~570 °C y en horas | — |
| Inversión de la sacarosa por el ácido | La miel tiene ≤ 5 % de sacarosa; horas a 20 °C | — |
| Fusión del acero por la lava | Imposible: 1150 °C < 1490 °C | — |
| Aire disuelto en el agua | Sin efecto mecánico ni químico en segundos | — |

## 15.3 Matriz de interacciones

Cada celda resume lo que pasa y remite a su ficha ([15.4](#154-fichas)). La matriz es simétrica: debajo de la diagonal se repite el número de ficha. "Fría" o "caliente" se refiere a si está por debajo o por encima de 100 °C.

| | Agua (gota) | Agua (campo) | Ácido | Miel | Lava | Piedra | Vapor | Aire | Robot (acero) |
|---|---|---|---|---|---|---|---|---|---|
| **Agua (gota)** | [1] Coalescen; T media por masa | [2] Se incorpora (misma sustancia); T media por masa | [3] Miscibles: dilución, ΔT < 1 K | [4] Miscibles, pero solo con cizalla; la miel se hunde; μ y color cambian | [5] Ebullición en película → vapor; costra vítrea; piedra | [6] Fría: nada. Caliente: ebullición | [7] Condensación por contacto directo, en ms | [8] Evaporación lenta; ruptura del chorro en vuelo | [9] Moja; conduce electricidad; sin reacción en segundos |
| **Agua (campo)** | = 2 | [10] Advección y mezcla; el agua caliente flota | [11] Se hunde un poco y mezcla con turbulencia; un tanque da pH ≈ 1,4 en la pileta | [12] Se hunde y forma capa en el fondo; disolución de minutos a horas sin agitación | [13] Se hunde; burbujas de vapor que recondensan en agua fría; calienta | [14] Se hunde; fría: nada | [15] Condensa si el agua está a < 100 °C; escapa si está saturada | [16] Evaporación y pérdida de calor por la superficie | [17] Moja, empuje, intercambio de calor; conduce |
| **Ácido** | = 3 | = 11 | [18] Coalescen | [19] Miscibles; sin reacción al 8 % | [20] Como el agua, y el H₂SO₄ se concentra → humos de SO₃/SO₂ | [21] Fría: despreciable. Caliente: ebullición | [22] Condensa y lo diluye | [23] Evapora agua (lento); el H₂SO₄ queda | [24] Fe + H₂SO₄ → FeSO₄ + H₂: burbujas, verde pálido; pérdida de metal en nm/s |
| **Miel** | = 4 | = 12 | = 19 | [25] Coalescen lento; escurre a ~0,1 m/s | [26] El agua de la miel hierve; carameliza, piroliza y puede arder | [27] Fría: nada. Caliente: carameliza | [28] Condensa, la diluye y la calienta: μ cae órdenes de magnitud | [29] Despreciable (higroscópica) | [30] Se adhiere (película viscosa); sin reacción |
| **Lava** | = 5 | = 13 | = 20 | = 26 | [31] Coalescen; T media; escurre a mm/s | [32] Costra sobre piedra fría; refunde solo con calor suficiente | [33] Sobrecalienta el vapor; sin reacción | [34] Radiación: costra en segundos, núcleo en minutos | [35] Piel vítrea instantánea (`T_c` 166 °C); calienta el acero; no lo funde |
| **Piedra** | = 6 | = 14 | = 21 | = 27 | = 32 | [36] Fría: nada. Sobre ~700 °C: se sueldan | [37] Fría: condensa encima | [38] Caliente: se enfría por radiación | [39] Fría: nada. Caliente: conducción |
| **Vapor** | = 7 | = 15 | = 22 | = 28 | = 33 | = 37 | [40] Se mezcla; nada | [41] Sube, arrastra aire, forma niebla y se diluye | [42] Condensa en película: moja y calienta hasta 100 °C |
| **Aire** | = 8 | = 16 | = 23 | = 29 | = 34 | = 38 | = 41 | [43] Nada | [44] Robot frío: nada. Caliente: lo enfría |
| **Robot (acero)** | = 9 | = 17 | = 24 | = 30 | = 35 | = 39 | = 42 | = 44 | [45] Sin química; contacto eléctrico |

## 15.4 Fichas

Cada ficha tiene: **1** qué pasa, **2** productos y estado final, **3** energía, **4** velocidad, **5** referencias. Las triviales se resumen en una línea.

### 1. Agua + agua

1. Coalescen. Sin reacción.
2. Agua con la masa sumada y temperatura media ponderada por masa (el `c` es el mismo). Sin cambios de ρ, μ ni color, salvo por temperatura.
3. Sin calor de mezcla.
4. Contacto instantáneo. La temperatura se iguala por cizalla: la conducción molecular es despreciable (α = 1,4·10⁻⁷ m²/s, 4 mm en 60 s).
5. [R1], [R19].

### 2. Agua (gota) + agua (campo)

1. Misma sustancia: la gota se incorpora al cuerpo de agua y le entrega masa, cantidad de movimiento y energía. Es lo que hoy hace la absorción ([14.4](14-agua.md#144-absorción-e-inmersión)) y es físicamente correcto para el agua.
2. Columna con más volumen y `T = (m_c T_c + m_g T_g)/(m_c + m_g)`.
3. Sin calor de mezcla. La energía cinética del choque se disipa en calor (≤ 0,07 K a 25 m/s, ya en el diseño).
4. Instantáneo en la escala del juego.
5. [R1].

### 3. Agua + ácido

1. **Dilución** (mezcla miscible). Sin reacción nueva: el H₂SO₄ al 8 % ya está disociado (H⁺, HSO₄⁻, SO₄²⁻).
2. Solución de concentración `w = Σ m_i w_i / Σ m_i`. La densidad baja casi lineal con `w` (≈ 998 + 6,8·w[%] kg/m³), μ de 1,17·10⁻³ a 1,0·10⁻³ Pa·s, conductividad eléctrica proporcional a la concentración (≈ 32 S/m al 8 %), pH = −log[H⁺]. Color: incoloro, sin cambio.
3. Calor de dilución desde el 8 % (≈ 63 mol de agua por mol de ácido) hasta la dilución alta: ≈ −5 kJ/mol de H₂SO₄ ≈ **−4·10³ J/kg de solución al 8 %** → ΔT < 1 K *(verificar)*. Despreciable. El calor grande del sulfúrico (−96 kJ/mol a dilución infinita) es el del ácido concentrado, que no está en el juego.
4. Controlada por cizalla y turbulencia: en un chorro que choca, segundos; en líquido quieto, nada en minutos (D = 1,7·10⁻⁹ m²/s). La diferencia de densidad (5 %) hace que el ácido quieto se vaya al fondo como capa.
5. [R2], [R3], [R4], [R19].

### 4. Agua + miel

1. **Disolución miscible.** Los azúcares de la miel se disuelven en agua en cualquier proporción. Sin reacción. **No es instantánea:** con la miel quieta en agua quieta, la difusión del azúcar (6,7·10⁻¹⁰ m²/s) no la mezcla en minutos. La mezcla la hace la cizalla. Como es más densa (1,42), la miel se hunde.
2. Solución con fracción másica de miel `X`:
   - **Densidad** (volúmenes aditivos, exceso < 1 %): `ρ = 1 / (X/1420 + (1 − X)/998)`.
   - **Viscosidad** a 20 °C (sacarosa como sustituto de los azúcares de la miel, con sólidos `s` = 0,82 X; *verificar con datos de miel diluida*):

     | X (miel) | μ (Pa·s) | Regla logarítmica de [14.9](14-agua.md#149-mezcla-por-concentración-y-viscosidad) |
     |---|---|---|
     | 0 | 1,0·10⁻³ | 1,0·10⁻³ |
     | 0,25 | ≈ 2·10⁻³ | 5,6·10⁻³ |
     | 0,50 | ≈ 6,5·10⁻³ | 0,10 |
     | 0,70 | ≈ 4·10⁻² | 0,63 |
     | 0,80 | ≈ 0,16 | 1,6 |
     | 0,90 | ≈ 1 | 4,0 |
     | 1 | 10 | 10 |

     La viscosidad de una solución de azúcar crece casi exponencialmente recién por encima de ~50 % de sólidos. **La regla logarítmica lineal la sobreestima hasta 15 veces en el medio.** Una relación tabulada o de Grunberg–Nissan con parámetro de interacción ajusta mejor *(verificar)*.
   - **Calor específico:** `c = X · 2400 + (1 − X) · 4182` J/(kg·K) (aditivo por masa).
   - **Color** (Beer–Lambert, absorbancia proporcional a la concentración por el espesor): de ámbar `#E3A21A` (X = 1) a amarillo pálido `#F7E7B4` (X ≈ 0,1) y a casi incoloro con X < 0,03.
3. Calor de mezcla chico: |ΔH| ≲ 10⁴ J/kg de miel → |ΔT| < 1–2 K *(verificar el signo)*. Despreciable.
4. **Controlada por cizalla.** Una gota de miel en un chorro de agua se estira en hilos y se mezcla en segundos; en agua quieta, ver la [ficha 12](#12-agua-campo--miel).
5. [R2], [R11], [R12], [R19].

### 5. Agua + lava

1. **Transferencia de calor con dos cambios de fase. Sin reacción química** a esta escala.
   - H₂O(l) → H₂O(g): ΔH = +2,257·10⁶ J/kg a 100 °C.
   - Basalto(l) → basalto(s): ΔH = −4,0·10⁵ J/kg (en la superficie se forma vidrio).

   La temperatura de contacto (675 °C) supera el límite de sobrecalentamiento del agua (~300 °C): se forma en el acto una **película de vapor** (Leidenfrost) que aísla y frena el intercambio. La piel de la lava baja del solidus en el contacto: costra vítrea instantánea.
2. Productos: **vapor** (100 °C; 1,67 m³ por kg de agua evaporada) y **piedra** (basalto, vidrio negro `#151515` en la superficie, núcleo que sigue el color de incandescencia hasta enfriarse). El agua que no hierve queda más caliente.
3. Calor que entrega 1 kg de lava de 1150 °C hasta 100 °C: líquido de 1150 a 1000 °C, 1,8·10⁵; solidificación, 4,0·10⁵; sólido de 1000 a 100 °C, 9,0·10⁵. Total **−1,48·10⁶ J/kg**. Con eso se evaporan hasta 0,57 kg de agua a 20 °C (2,59·10⁶ J/kg contando el calentamiento hasta 100 °C). Por partícula: 3,7·10⁵ J, que evaporan ~0,14 kg de agua (~1,5 partículas de agua).
4. Por etapas:
   - Piel vítrea: instantánea.
   - Costra: `δ ≈ √(α t)` → 1 mm en ~2 s, 1 cm en ~3,5 min.
   - Ebullición en película: `h_b` = 200–1000 W/(m²·K) [R5]. Con 500 W/(m²·K) y el modelo concentrado, una partícula tarda **~1,2 min** en solidificar (el valor del diseño).
   - **Límite del modelo concentrado:** con Bi ≈ 17, el núcleo de una masa de 9 cm sigue fundido por más tiempo (decenas de minutos por conducción). En la realidad, el enfriamiento brusco **fragmenta** la lava (hialoclastita), lo que acelera mucho el enfriamiento.
   - Cuando la superficie baja de la temperatura de Leidenfrost (~250–400 °C), la ebullición pasa a nucleada (`h` = 10⁴–10⁵ W/(m²·K)) y el enfriamiento se acelera.
   - **Dato de riesgo:** si la lava se fragmenta fino y se mezcla con agua, puede haber una **explosión de vapor** (interacción combustible–refrigerante, freatomagmática), que convierte unos pocos por ciento de la energía térmica en trabajo mecánico en milisegundos [R10].
5. [R1], [R5], [R6], [R8], [R10].

### 6. Agua + piedra

1. **Piedra fría:** nada. El basalto es insoluble y su absorción de agua por poros es despreciable. **Piedra caliente** (> 100 °C): el agua hierve sobre ella; por encima de ~250–400 °C, en película (Leidenfrost). El enfriamiento brusco agrieta el vidrio (choque térmico).
2. Piedra más fría; vapor.
3. Calor sensible de la piedra, `c ≈ 1000 J/(kg·K) · ΔT`, contra `L_v` del agua. Sin latente de la piedra.
4. Como la [ficha 5](#5-agua--lava) sin la etapa de solidificación.
5. [R5], [R24].

### 7. Agua + vapor

1. **Condensación por contacto directo:** H₂O(g) → H₂O(l), ΔH = **−2,257·10⁶ J/kg**. Solo si el agua está por debajo de 100 °C. Con agua a 100 °C no pasa nada.
2. El agua sube su temperatura y recibe la masa condensada. Una partícula de agua a 20 °C solo puede absorber `c_p · 80` = 3,35·10⁵ J/kg antes de llegar a 100 °C: **condensa ~15 % de una parcela de vapor de igual masa** y queda a 100 °C. El resto del vapor sigue siendo vapor.
3. −2,257·10⁶ J/kg condensado, más el calor sensible del condensado.
4. **Casi instantánea** (`h` de condensación directa 10⁴–10⁶ W/(m²·K)). Queda limitada por cuánta agua fría toca el vapor.
5. [R1], [R17].

### 8. Agua + aire

1. **Evaporación** por la superficie (Dalton): `ṁ'' = h_m (ρ_v,sat(T_s) − φ ρ_v,sat(T_∞))`. El agua se enfría al evaporar (temperatura de bulbo húmedo ≈ 14 °C a 20 °C y 50 % de humedad).
   - **Agua en vuelo:** el aire frena las gotas y **rompe el chorro**: We ≈ 290 ≫ 12, ruptura en ~0,2 s. En la realidad no existen gotas de 9 cm en vuelo: se rompen en gotas de milímetros, y la gota de lluvia más grande estable mide ~5 mm, con velocidad terminal ~9 m/s.
2. Vapor disuelto en el aire (invisible). Agua más fría.
3. `L_v` = **+2,454·10⁶ J/kg a 20 °C**, no el valor de 100 °C (2,257·10⁶, un 8 % menos).
4. 10⁻⁸–10⁻⁷ m/s de espesor de agua: despreciable en una ronda (el diseño lo acelera con `F_evap`). Ruptura del chorro: décimas de segundo.
5. [R1], [R5], [R23].

### 9. Agua + robot (acero)

1. **Química:** ninguna en segundos. La herrumbre (4 Fe + 3 O₂ + 2 H₂O → 2 Fe₂O₃·H₂O) tarda días. **Física:** moja la superficie y, como conductor iónico (lluvia 10⁻³–5·10⁻³ S/m, red hasta 8·10⁻² S/m), cierra circuitos con fugas de corriente; es un dato eléctrico, no químico. **Térmica:** convección `h` = 10²–10⁴ W/(m²·K) según la velocidad. Si el acero está por encima de ~300 °C (por ejemplo, después de la lava), el agua hierve en película sobre él.
2. Robot mojado; ningún cambio de material. Color: el agua no cambia el gris del acero.
3. Solo calor sensible; sin reacción.
4. Mojado instantáneo; herrumbre en días (despreciable).
5. [R2], [R5], [R15].

### 10. Agua (campo) + agua (campo)

1. Dentro del cuerpo de agua: advección y mezcla de temperatura y de solutos por cizalla.
2. **Estratificación térmica:** el agua caliente es más liviana (958 kg/m³ a 100 °C contra 998 a 20 °C) y **flota sobre la fría** en una capa estable. Por eso una pileta calentada desde el fondo hierve antes en la superficie de lo que indica la media. Un campo promediado en la vertical no puede representarlo.
3. Sin calor de mezcla.
4. Mezcla por cizalla y olas, de segundos a minutos. La estratificación resiste la mezcla (número de Richardson).
5. [R1].

### 11. Agua (campo) + ácido

1. Como la [ficha 3](#3-agua--ácido), en volumen grande. El chorro que choca entra como una pluma turbulenta y mezcla en la zona del impacto. En el agua quieta, el ácido (5 % más denso) se asienta como capa de fondo y no se difunde.
2. **Dilución de un tanque entero** (272 partículas, 2,2 m²) en la pileta (60 m²): 28 veces → H₂SO₄ 0,03 mol/L, **pH ≈ 1,4**, ρ +0,2 %, μ sin cambio apreciable, conductividad ≈ 1–2 S/m *(verificar)*, es decir 10–300 veces la del agua de red. Sigue siendo una solución ácida, que ataca al acero más lento ([ficha 24](#24-ácido--robot)). Incolora.
3. ΔT < 1 K.
4. Zona de impacto: segundos. Toda la pileta: minutos, por advección y cizalla.
5. [R2], [R4].

### 12. Agua (campo) + miel

1. La miel entra como chorro denso, **se hunde** (velocidad terminal `√(2 g (SG − 1) A_p/(C_d D))` ≈ 0,8 m/s con `C_d` = 1,2), se estira en hilos y llega al fondo, donde forma una **capa de miel casi pura** con una interfaz neta (corriente de gravedad viscosa). **No se disuelve al tocar el agua.**
2. Mientras no se agite, coexisten dos fases: agua arriba (sin cambios) y miel abajo (ρ 1420, μ 10 Pa·s, ámbar). Si se mezcla del todo, un tanque entero (152 partículas, 21 kg) en la pileta (720 kg) da X = 2,8 %: ρ ≈ 1008 kg/m³, μ ≈ 1,05·10⁻³ Pa·s, amarillo apenas perceptible. **Mezclada, la pileta casi no cambia; sin mezclar, la miel queda en el fondo con sus propiedades.**
3. Despreciable ([ficha 4](#4-agua--miel)).
4. Disolución de la capa en agua quieta: coeficiente de transferencia de masa por convección natural de 10⁻⁶–10⁻⁵ m/s → una capa de 5 cm tarda **10³–10⁴ s** (minutos a horas) *(verificar)*. Con agitación turbulenta (chorros, olas, robots) baja a segundos o minutos, según la cizalla.
5. [R11], [R18], [R19].

### 13. Agua (campo) + lava

1. Como la [ficha 5](#5-agua--lava), sumergida. La lava se hunde (`v_t` ≈ 1,55 m/s, [14.4](14-agua.md#144-absorción-e-inmersión)) envuelta en su película de vapor.
   - **En agua subenfriada** (por debajo de ~90 °C), las burbujas de vapor colapsan en pocos milímetros: una burbuja de 1 cm colapsa en ~10 ms (número de Jakob ≈ 250). El calor queda en el agua y **no sale vapor a la superficie**.
   - **Sale vapor** solo donde el agua alrededor llegó a la saturación (100 °C).
2. Piedra en el fondo, agua más caliente y estratificada ([ficha 10](#10-agua-campo--agua-campo)), y vapor solo si hierve. Un tanque de lava (45 kg) calienta la pileta de 720 kg unos 23 K (cota por energía con c de la piedra 1.000 J/(kg·K)) en promedio ([14.8](14-agua.md#148-térmica-y-fases)), pero hierve localmente.
3. Igual que la [ficha 5](#5-agua--lava).
4. Hundimiento: segundos. Transferencia de calor: ~1 min por partícula con el modelo concentrado. Colapso de burbujas: milisegundos.
5. [R5], [R10], [R17].

### 14. Agua (campo) + piedra

Piedra fría: se hunde (SG 2,6, `v_t` como la lava) y queda en el fondo; nada más. Caliente: [ficha 6](#6-agua--piedra) sumergida, con el colapso del vapor de la [ficha 13](#13-agua-campo--lava). [R24].

### 15. Agua (campo) + vapor

1. El vapor que toca o entra al cuerpo de agua por debajo de 100 °C **condensa por contacto directo** ([ficha 7](#7-agua--vapor)). Si la columna ya está a 100 °C, el vapor no condensa y sube.
2. Más volumen de agua y más temperatura en la columna.
3. −2,257·10⁶ J/kg condensado.
4. Milisegundos en el contacto. El vapor que solo roza la superficie condensa a la velocidad que le permite la transferencia de calor en el contacto.
5. [R1], [R17].

### 16. Agua (campo) + aire

Evaporación por la superficie ([ficha 8](#8-agua--aire)) y pérdida de calor por convección (`h_a` ≈ 10 W/(m²·K)). La tasa de evaporación crece mucho con la temperatura del agua: la presión de vapor se duplica cada ~11 K cerca del ambiente y vale 47 kPa a 80 °C. Una pileta caliente humea, porque el vapor que sale condensa en niebla en el aire frío. [R1], [R5].

### 17. Agua (campo) + robot

Como la [ficha 9](#9-agua--robot-acero), sumergido: empuje de Arquímedes ([14.5](14-agua.md#145-flotación-de-arquímedes-por-pieza)), intercambio de calor por convección natural (`h` ≈ 10²–10³ W/(m²·K)) y conducción eléctrica. Si la pileta tiene ácido disuelto, la corrosión de la [ficha 24](#24-ácido--robot) sigue, más lenta (aproximadamente proporcional a [H⁺]). [R5], [R15].

### 18. Ácido + ácido

Coalescen; sin reacción ni calor. Igual que la [ficha 1](#1-agua--agua).

### 19. Ácido + miel

1. **Mezcla miscible de tres componentes** (agua, azúcares y H₂SO₄). **Sin reacción química** a 8 % y 20 °C:
   - La inversión de la sacarosa catalizada por el ácido (C₁₂H₂₂O₁₁ + H₂O → glucosa + fructosa) tarda horas, y la miel tiene ≤ 5 % de sacarosa.
   - La deshidratación de los azúcares (C₁₂H₂₂O₁₁ → 12 C + 11 H₂O, carbón negro) solo ocurre con ácido concentrado. Podría aparecer si el ácido se concentró hirviendo junto a la lava ([ficha 20](#20-ácido--lava)), pero es un caso marginal.
2. La miel se hunde en el ácido (1,42 contra 1,05). Mezclados, la viscosidad y el color siguen la [ficha 4](#4-agua--miel), con el ácido actuando como agua. El pH lo fija el H₂SO₄ diluido.
3. Despreciable.
4. Controlada por cizalla, como la [ficha 4](#4-agua--miel).
5. [R2], [R13].

### 20. Ácido + lava

1. **Térmicamente, igual que el agua** ([ficha 5](#5-agua--lava)): el 92 % es agua y hierve en película. El H₂SO₄ no es volátil y **se queda**: la solución se concentra y su punto de ebullición sube (≈ 101 °C al 8 %, ≈ 124 °C al 50 %, 338 °C en el azeótropo de 98,3 %). Cuando el agua se fue, el ácido concentrado sobre la lava se descompone:
   - H₂SO₄(l) → SO₃(g) + H₂O(g), ΔH ≈ **+177 kJ/mol**;
   - por encima de ~800 °C *(verificar)*, SO₃ → SO₂ + ½ O₂, ΔH ≈ **+99 kJ/mol**.
2. Productos: vapor y piedra (como con agua) más **humos blancos** de SO₃ y niebla de H₂SO₄ al contacto con la humedad, con SO₂. Cantidad: 8,2 g de H₂SO₄ por partícula (0,084 mol). Sobre la piedra puede quedar una costra fina de sulfatos (blanco amarillento `#E8E0C0`). **Dato de riesgo:** el SO₃ y el SO₂ son tóxicos y corrosivos.
3. Como la [ficha 5](#5-agua--lava) más la descomposición (endotérmica, +177 kJ/mol de H₂SO₄): ≈ 15 kJ por partícula, despreciable frente a 3,7·10⁵ J por partícula de lava.
4. Controlada por la transferencia de calor, como con el agua. La descomposición ocurre solo en la superficie de la lava, después de evaporarse el agua.
5. [R2], [R3], [R4].

### 21. Ácido + piedra

Piedra fría: el ácido diluido disuelve el vidrio basáltico a 10⁻¹⁰–10⁻⁸ mol/(m²·s) [R22], despreciable en una ronda; **nada visible**. Piedra caliente: hierve como la [ficha 6](#6-agua--piedra); por encima de ~340 °C, descomposición como la [ficha 20](#20-ácido--lava).

### 22. Ácido + vapor

Condensación por contacto directo ([ficha 7](#7-agua--vapor)) sobre el ácido frío: lo calienta y lo diluye con el condensado. −2,257·10⁶ J/kg; milisegundos. [R1].

### 23. Ácido + aire

El agua se evapora como en la [ficha 8](#8-agua--aire), un ~4 % más lento por la menor actividad del agua *(verificar)*. El H₂SO₄ no se evapora, así que en horas la solución se concentra. Despreciable en una ronda, salvo con la evaporación acelerada del juego, que **dejaría el ácido** en lugar de borrarlo. [R2], [R3].

### 24. Ácido + robot (acero)

1. **Reacción química (corrosión ácida):**
   - Fe(s) + H₂SO₄(aq) → FeSO₄(aq) + H₂(g);
   - en forma iónica, Fe + 2 H⁺ → Fe²⁺ + H₂.
2. Productos:
   - burbujas de **hidrógeno** en la superficie;
   - Fe²⁺ disuelto, que tiñe la solución de **verde pálido** `#CFE8C6`; en el aire se oxida lentamente a Fe³⁺ (amarillo pardo, horas);
   - superficie del acero apenas mate.
   - **Pérdida de metal y consumo de ácido despreciables en una ronda.**
   - **Dato de riesgo:** el H₂ es inflamable en aire entre el 4 % y el 75 %.
   - La solución ácida es ~10³ veces más conductora que el agua de red ([15.1](#ácido--ácido-sulfúrico-diluido-al-8--mm)).
3. ΔrH° = **−89,1 kJ/mol de Fe** (−1,6·10⁶ J por kg de hierro disuelto), por ΔfH°(Fe²⁺, aq) = −89,1 kJ/mol. Con las tasas del punto 4 da ~2 W/m²: no calienta nada.
4. Acero al carbono en H₂SO₄ ~1 mol/L a 25–30 °C: **1–10 mm/año** *(verificar)* = 0,03–0,3 nm/s → ≤ 0,06 µm en 3 minutos. Desprende H₂ a 0,1–1 mL/(m²·s), que se ve como burbujeo en segundos. La tasa se duplica cada ~10 K (Arrhenius, `E_a` ≈ 40–60 kJ/mol) y baja con la dilución (aproximadamente proporcional a [H⁺]).
5. [R4], [R15].

### 25. Miel + miel

1. Coalescen. Sin reacción.
2. Miel con temperatura media ponderada por masa.
3. Sin calor.
4. **Lenta y viscosa:**
   - el cuello entre dos gotas crece en `τ ≈ μ R/γ` ≈ 8 s (con R = 0,045 m);
   - como Bo ≫ 1, la gravedad las aplana antes: un charco de espesor `H` escurre a `u ≈ ρ g H³/(3 μ L)`, que da ~0,1 m/s con H = 5 cm y L = 0,5 m;
   - la velocidad es muy sensible a la temperatura (μ cae ×10 de 20 a 40 °C).
5. [R11], [R18].

### 26. Miel + lava

1. Temperatura de contacto de 722 °C. Tres procesos a la vez:
   - el agua de la miel (17 %) **hierve de golpe** (Leidenfrost);
   - los azúcares **caramelizan** (> 110 °C) y **pirolizan** (> 200 °C) en la superficie, dejando carbón;
   - los gases de pirólisis pueden **encenderse en el aire**, porque la lava está muy por encima de su temperatura de autoignición (~400–500 °C, *verificar*). Combustión completa de la glucosa: C₆H₁₂O₆ + 6 O₂ → 6 CO₂ + 6 H₂O.

   La lava se hunde en la miel fría lentamente (Stokes, ~5 mm/s con μ = 10 Pa·s), pero la miel que la rodea se calienta y su viscosidad cae órdenes de magnitud.
2. Productos:
   - vapor;
   - caramelo `#8B4A12` y carbón `#1E1A17` sobre la lava;
   - humo gris `#6E6A64`;
   - CO₂ y H₂O si arde (llama amarilla anaranjada);
   - la lava pierde calor y forma costra, como con el agua.
3. Por kg de miel:
   - evaporación del agua: +0,17 × 2,257·10⁶ ≈ **+3,8·10⁵ J/kg**, más el calentamiento (`c_p` 2400 J/(kg·K));
   - la caramelización y la pirólisis absorben poco en comparación *(verificar)*;
   - si arde: ΔcH°(glucosa) = −2803 kJ/mol = **−1,56·10⁷ J/kg de azúcar**, ≈ −1,3·10⁷ J/kg de miel, limitada por el oxígeno disponible y por la pirólisis.
4. Superficie: instantánea. Interior de una partícula: decenas de segundos a minutos, limitado por la conducción a través de la miel y del carbón (`k` ≈ 0,5). Llama: mientras haya volátiles, segundos.
5. [R4], [R6], [R13].

### 27. Miel + piedra

Piedra fría: nada; la miel se apoya y escurre ([ficha 25](#25-miel--miel)). Piedra caliente: la temperatura de contacto define el efecto, con caramelización por encima de 110 °C y carbonización por encima de 200 °C, como en la [ficha 26](#26-miel--lava) pero sin aporte latente. [R6], [R13].

### 28. Miel + vapor

1. El vapor **condensa** sobre la miel fría. Como su actividad de agua es 0,6, la miel incluso absorbe vapor por debajo de la saturación. La superficie se diluye y se calienta.
2. Miel más caliente y más diluida en la superficie. Su viscosidad cae por las dos causas: ×10 por cada +20 °C cerca del ambiente y ~×1,5–2 por cada +1 % de agua. Color más claro donde se diluye.
3. −2,257·10⁶ J/kg condensado.
4. Superficie: segundos. Hacia adentro, limitada por la conducción (`k` 0,5) y la difusión del agua.
5. [R1], [R11], [R12].

### 29. Miel + aire

Despreciable en una ronda. La miel no se evapora apreciablemente (actividad de agua de 0,6): pierde o gana agua según la humedad relativa sea menor o mayor que ~60 %, en horas o días. [R12].

### 30. Miel + robot (acero)

1. **Sin reacción química** apreciable. La miel es ácida (pH ~3,9), pero con un ácido orgánico débil y poca agua libre: la corrosión es de µm por año. **Física:** se adhiere como película viscosa. Resiste el corte (`τ = μ v/δ`) y la separación (adhesión de Stefan, `F ∝ μ R⁴ ḣ / h³`), que es lo que modela [14.10](14-agua.md#1410-adherencia).
2. Película de miel sobre el acero; sin cambio del material.
3. Ninguna.
4. La película escurre por una pared a la velocidad de un charco viscoso ([ficha 25](#25-miel--miel)). Sobre un robot caliente, la miel se vuelve fluida y escurre mucho más rápido.
5. [R11], [R12].

### 31. Lava + lava

1. Coalescen; temperatura media.
2. Lava con la masa sumada.
3. Sin calor de mezcla.
4. **Muy lenta por viscosidad:** con μ = 300 Pa·s, un charco de 5 cm escurre a ~7 mm/s (`u ≈ ρ g H³/(3 μ L)`). Se frena del todo al enfriarse por debajo de ~1070 °C (umbral de fluencia). Al juntarse con lava más fría, las costras se pliegan (cordones de pahoehoe).
5. [R7], [R8], [R18].

### 32. Lava + piedra

1. **Conducción.** Sobre piedra fría (temperatura de contacto 613 °C), la lava forma costra en el contacto y la piedra se calienta.
2. **Refusión:** la piedra vuelve a ser lava **solo si su entalpía supera la del solidus más `L_f`**. Ejemplo con masas iguales, lava a 1150 °C y piedra recién solidificada a 1000 °C: la lava aporta 1,8·10⁵ J/kg sobre el solidus, la mitad de lo que haría falta para fundir la piedra entera. Las dos quedan a 1000 °C con ~72 % de la masa total fundida. **El cambio de fase es reversible y lo decide la entalpía**: no es un paso de lava a piedra en un solo sentido.
3. Solo calor sensible y `L_f` = ±4,0·10⁵ J/kg.
4. Controlada por la conducción en el basalto (α = 4,7·10⁻⁷ m²/s): la costra de contacto se forma en segundos y el calentamiento de la piedra en minutos. La erosión térmica real de un sustrato basáltico es de cm por día.
5. [R6], [R8].

### 33. Lava + vapor

El vapor se **sobrecalienta** en contacto con la lava (convección de gas, `h` = 10–50 W/(m²·K), más algo de radiación absorbida por el vapor). No hay reacción química apreciable: la oxidación del Fe²⁺ del fundido por el vapor es despreciable en segundos. Al vapor sobrecalentado no le cambia nada visible (sigue invisible). [R5], [R8].

### 34. Lava + aire

1. **Enfriamiento por radiación y convección.** No hay reacción apreciable: la oxidación superficial del Fe²⁺ la oscurece en minutos, sin efecto mecánico.
2. Lava que se oscurece según el [color por incandescencia](#color-por-incandescencia) y se vuelve piedra: costra primero y núcleo después. El aire se calienta en una pluma que sube.
3. Flujo inicial a 1150 °C: radiación `ε σ (T⁴ − T_a⁴)` ≈ 2,1·10⁵ W/m² más convección ≈ 1,1·10⁴ W/m². Por partícula (3,83·10⁻³ m²): **~840 W**. Para solidificarse entera debe perder 1,47·10⁵ J (sensible hasta 1000 °C más `L_f`).
4. Por etapas:
   - Modelo concentrado: ~1 min hasta 1000 °C y ~3 min más para solidificar: **~4 min**.
   - **Realidad:** la superficie baja del solidus en segundos (Bi ≈ 3). La costra crece como `C [m] ≈ 0,0779 √(t [h])`: 1 cm en ~1 min y 2 cm en ~4 min [R9]. El núcleo de una masa de 9 cm se solidifica en ~10–30 min, por conducción.
5. [R5], [R8], [R9].

### 35. Lava + robot (acero)

1. **Transferencia de calor, sin reacción.** La temperatura de contacto es de **166 °C** (el acero tiene una efusividad 7 veces mayor). La piel de la lava se vuelve vidrio al instante y el acero apenas se calienta en el primer momento. Después, el calor pasa por conducción a través de la costra. La lava basáltica templada sobre acero frío se adhiere poco y suele desprenderse al contraerse *(verificar)*.
2. Productos:
   - **El acero no se funde** (1150 < 1490 °C).
   - Si todo el calor de una partícula de lava pegada (0,253 kg) pasara a una pieza de 1 kg sin pérdidas, la pieza llegaría a **~590 °C**. Ahí el acero conserva el 47 % de su resistencia y muestra brillo rojo apenas visible por encima de ~525 °C.
   - Antes, entre 220 y 300 °C, aparecen los colores de revenido (paja → azul).
   - La lava queda como piedra pegada o caída.
   - Con aluminio, la pieza **sí** se fundiría.
3. Calor transferible desde 1150 °C hasta el equilibrio con la pieza: ≈ −2,5·10⁵ J por partícula, para 1 kg de acero (434 J/K).
4. Controlada por la conducción a través de la costra (`k` 1,5): con 1 cm de costra y el área de contacto de una partícula (≈ 1,1·10⁻³ m²), ~165 W → **de 10 a 30 minutos** para transferir la mayor parte, mientras la lava y el robot pierden calor al aire. En una ronda, una partícula pegada calienta la pieza de decenas a pocos cientos de K *(verificar)*.
5. [R5], [R6], [R14].

### 36. Piedra + piedra

Frías: nada (contacto granular, rozamiento). Calientes: conducción entre ellas. Por encima de la transición vítrea (~700 °C), dos piedras de vidrio basáltico **se sueldan** por sinterizado viscoso en segundos a minutos (aglutinado de escoria) *(verificar)*. [R8].

### 37. Piedra + vapor

Piedra fría: el vapor **condensa** sobre ella como película (`h` 5·10³–2·10⁴ W/(m²·K), Nusselt), la moja y la calienta hasta 100 °C como máximo; −2,257·10⁶ J/kg. Piedra por encima de 100 °C: nada, el vapor se sobrecalienta. [R5].

### 38. Piedra + aire

Fría: nada. Caliente: se enfría por radiación y convección como la [ficha 34](#34-lava--aire), sin latente. Su color sigue la tabla de incandescencia hasta ~525 °C y después es gris oscuro. [R5], [R21].

### 39. Piedra + robot

Fría: nada químico; contacto mecánico y rozamiento. Caliente: conducción con temperatura de contacto `T_c` ([15.1](#temperatura-de-contacto)) y calentamiento del acero como en la [ficha 35](#35-lava--robot-acero), sin latente. [R6].

### 40. Vapor + vapor

Se mezclan; nada.

### 41. Vapor + aire

1. El vapor (0,598 kg/m³) **sube** en el aire (1,204 kg/m³) como pluma y **arrastra aire** (Morton–Taylor–Turner, α ≈ 0,1). La mezcla se enfría y su presión de vapor cruza la de saturación: se forma **niebla** visible (gotas de ~10 µm). Al seguir mezclándose con aire no saturado, la niebla se vuelve a evaporar y desaparece.
2. Aire más húmedo y algo más caliente. **La masa no vuelve como una gota líquida que cae:** las gotas de niebla tienen una velocidad terminal de ~3 mm/s (Stokes) y quedan suspendidas hasta evaporarse. Para disolver como vapor la masa de una parcela (0,097 kg) a 20 °C y 50 % de humedad hacen falta ~11 m³ de aire (~940 m² de rebanada). Una arena cerrada se humedece de forma apreciable.
3. La condensación en niebla libera −2,454·10⁶ J/kg en la pluma, y la re-evaporación la absorbe. El balance neto es el enfriamiento sensible del vapor hasta el ambiente.
4. Ascenso a ~1 m/s ([14.8](14-agua.md#148-térmica-y-fases)). Niebla: aparece en la mezcla en segundos y se disipa en decenas de segundos según la humedad.
5. [R1], [R16].

### 42. Vapor + robot

1. **Condensación en película** sobre el acero frío (`h` 5·10³–2·10⁴ W/(m²·K), Nusselt): el robot queda **mojado** y se calienta.
2. Agua líquida sobre el robot. El acero llega como máximo a 100 °C, y a esa temperatura la condensación se detiene. Calentar 1 kg de acero de 20 a 100 °C condensa solo 434 × 80 / 2,257·10⁶ ≈ **15 g** de vapor (~16 % de una parcela).
3. −2,257·10⁶ J/kg condensado.
4. Segundos, limitada por la llegada de vapor.
5. [R1], [R5].

### 43. Aire + aire

Nada.

### 44. Aire + robot

Robot a temperatura ambiente: nada en una ronda. Robot caliente: se enfría por convección natural (`h` 5–25 W/(m²·K)) y radiación (ε 0,6–0,8 oxidado), en decenas de minutos para una pieza de 1 kg. [R5].

### 45. Robot + robot

Sin química. Contacto mecánico y eléctrico (acero contra acero conduce). Si los dos están mojados, el agua entre ellos agrega un camino conductor ([ficha 9](#9-agua--robot-acero)). [R15].

## 15.5 Lo que el modelo actual no representa

Comparación con el código en `main` (`js/materials.js`, `js/immersion.js`, `js/water.js`) y con el diseño de [14](14-agua.md). Es una lista de diferencias con la física, no de tareas: qué se lleva al juego lo decide el diseño.

**Campo de agua y mezcla**
1. ✅ **La miel en el campo** (resuelto por #110). La miel ya no se absorbe: es inmiscible con el campo, se hunde como partícula y forma una capa en el fondo ([fichas 4](#4-agua--miel) y [12](#12-agua-campo--miel)). Lo que no se representa es la disolución por agitación (#76). El campo conserva el trazador `M` sin fuente y su efecto sobre `ρ` y `μ` (`densityAt`, fricción con `ν(X)`).
2. **La viscosidad de mezcla** del campo y de [14.9](14-agua.md#149-mezcla-por-concentración-y-viscosidad) usa la regla logarítmica lineal, que sobreestima hasta 15 veces la de las soluciones de azúcar ([ficha 4](#4-agua--miel)). Además, la viscosidad de la miel no depende de la temperatura (×10 cada 20 °C) ni del agua condensada.
3. **El calor específico de la columna** es siempre el del agua (`E / (σ_w c_w h)`), aunque haya miel (`c` 2400 J/(kg·K)).
4. **El color del campo** es fijo (`draw.color`). No cambia con la miel (ámbar), con la temperatura ni con la profundidad.
5. **El ácido pierde su identidad** al absorberse ([14.4](14-agua.md#144-absorción-e-inmersión)): no hay concentración, pH ni conductividad en la columna. En la realidad, un tanque en la pileta deja pH ≈ 1,4 y una conductividad 10–300 veces la del agua ([ficha 11](#11-agua-campo--ácido)).
6. **Estratificación:** el campo promediado en la vertical no puede tener agua caliente arriba ni ácido en el fondo ([ficha 10](#10-agua-campo--agua-campo)). Resuelto para la miel por #110 (la capa del fondo es de partículas); no resuelto para el ácido.

**Térmica y fases** (diseño [14.8](14-agua.md#148-térmica-y-fases), aún sin implementar)
7. No hay entalpía por partícula ni en el campo: la lava no calienta el agua, no hay vapor, piedra, ebullición ni condensación.
8. **La lava no tiene viscosidad en `MATERIALS`.** En la realidad es de 10²–10³ Pa·s (30 veces la miel) y sube con el enfriamiento hasta frenarse ([ficha 31](#31-lava--lava)).
9. El diseño solo tiene el paso de lava a piedra. **La refusión de piedra a lava** con entalpía suficiente ([ficha 32](#32-lava--piedra)) no está prevista.
10. **Condensación del vapor por contacto** sobre agua fría, ácido, miel, piedra y robot ([fichas 7](#7-agua--vapor), [15](#15-agua-campo--vapor), [22](#22-ácido--vapor), [28](#28-miel--vapor), [37](#37-piedra--vapor) y [42](#42-vapor--robot)): el diseño solo enfría el vapor por arrastre de aire. Tampoco está el colapso del vapor bajo agua subenfriada ([ficha 13](#13-agua-campo--lava)).
11. **El vapor que se enfría en el aire** vuelve a `WATER` entero, como una gota que cae. En la realidad se diluye en el aire, forma niebla y se re-evapora ([ficha 41](#41-vapor--aire)).
12. **La evaporación a temperatura ambiente** usa `L_v` de 100 °C (2,257·10⁶) en lugar del de 20 °C (2,454·10⁶ J/kg, +8,7 %).
13. Sin temperatura del robot: la lava, la piedra caliente y el vapor no lo calientan, y no hay pérdida de resistencia del acero ([fichas 35](#35-lava--robot-acero) y [42](#42-vapor--robot)).
14. Sin descomposición térmica de la miel con lava (caramelo, carbón, humo, llama) ([ficha 26](#26-miel--lava)).
15. Sin concentración del ácido al hervir ni humos de SO₃/SO₂ con lava ([ficha 20](#20-ácido--lava)). Con la evaporación acelerada de [14.7b](14-agua.md#147b-evaporación-de-agua-detenida-d7), el ácido detenido desaparece entero, cuando en la realidad se evapora el agua y queda el H₂SO₄ ([ficha 23](#23-ácido--aire)).
16. Sin soldado de piedras calientes ([ficha 36](#36-piedra--piedra)).

**Química con el robot**
17. **Ácido + acero:** la reacción real (H₂ y Fe²⁺ verde) no está; su daño real en una ronda es despreciable ([ficha 24](#24-ácido--robot)). El daño por segundo del juego es una regla de juego, no una consecuencia química.
18. **Conductividad eléctrica por sustancia** (agua de lluvia, ácido ~10³ veces más, miel baja): el cortocircuito y el arco eléctrico no dependen del líquido.

**En vuelo y en la escala**
19. **Ruptura del chorro de agua en el aire** (We ≈ 290, ~0,2 s) y las hebras de la miel y la lava ([ficha 8](#8-agua--aire)).
20. **El color del ácido:** el ácido real es incoloro; el verde corresponde al Fe²⁺ después de atacar acero.
21. Del diseño, ya declarados: la masa de partícula única por sistema en LiquidFun ([14.1](14-agua.md#141-unidades-rebanada-2d-y-materiales)), el modelo concentrado de la lava, que no ve la costra (Bi ≈ 17), y el volumen del vapor fuera de escala (13,5 m² reales por parcela).

**Datos de `MATERIALS` para revisar**
- **Ácido:** falta `c` (≈ 3,85·10³) y `μ` (≈ 1,17·10⁻³).
- **Miel:** `c` 2400 (el diseño dice 2500, dentro del rango).
- **Lava:** falta `μ`.
- **Vapor:** `c_p` 2,08·10³ saturado (el diseño usa 2010).
- **Piedra:** `SG` 2,6 corresponde a basalto vesiculado (la piedra densa es 2,9).

## 15.6 Referencias

- **[R1]** Wagner y Pruß, "The IAPWS formulation 1995 for the thermodynamic properties of ordinary water substance", *J. Phys. Chem. Ref. Data* 31 (2002) 387; NIST Chemistry WebBook, SRD 69 (agua líquida y vapor: ρ, μ, `c_p`, `L_v`, presión de vapor, tensión superficial).
- **[R2]** Haynes (ed.), *CRC Handbook of Chemistry and Physics*, secciones "Concentrative properties of aqueous solutions" (H₂SO₄ y sacarosa: densidad, viscosidad, conductividad, punto de ebullición) y "Electrical conductivity of water".
- **[R3]** Green y Southard (eds.), *Perry's Chemical Engineers' Handbook*, 9.ª ed., cap. 2 (calor específico, calores de disolución y equilibrio líquido–vapor del H₂SO₄ acuoso).
- **[R4]** Wagman et al., "The NBS tables of chemical thermodynamic properties", *J. Phys. Chem. Ref. Data* 11, supl. 2 (1982) (ΔfH° de Fe²⁺(aq), H₂SO₄, SO₃, SO₂, H₂O; entalpías de dilución; combustión de la glucosa).
- **[R5]** Incropera, DeWitt, Bergman y Lavine, *Fundamentals of Heat and Mass Transfer*, 7.ª ed.: tablas A.1 (AISI 1010), A.4 (aire), A.6 (agua saturada), A.11 (emisividades); cap. 10 (ebullición en película de Berenson, condensación de Nusselt) y cap. 6 (analogía calor–masa, evaporación).
- **[R6]** Carslaw y Jaeger, *Conduction of Heat in Solids*, 2.ª ed. (1959): contacto de dos sólidos semi-infinitos (temperatura de contacto con efusividades).
- **[R7]** Shaw, "Rheology of basalt in the melting range", *J. Petrology* 10 (1969) 510; Giordano, Russell y Dingwell, "Viscosity of magmatic liquids: a model", *Earth Planet. Sci. Lett.* 271 (2008) 123.
- **[R8]** Lesher y Spera, "Thermodynamic and transport properties of silicate melts and magma", en Sigurdsson (ed.), *The Encyclopedia of Volcanoes*, 2.ª ed. (2015).
- **[R9]** Hon, Kauahikaua, Denlinger y Mackay, "Emplacement and inflation of pahoehoe sheet flows", *GSA Bulletin* 106 (1994) 351 (crecimiento de la costra).
- **[R10]** Zimanowski, Büttner, Lorenz y Häfele, "Fragmentation of basaltic melt in the course of explosive volcanism", *J. Geophys. Res.* 102 (1997) 803; Wohletz, "Explosive magma–water interactions", *Bull. Volcanol.* 48 (1986) 245.
- **[R11]** Yanniotis, Skaltsi y Karaburnioti, "Effect of moisture content on the viscosity of honey at different temperatures", *J. Food Eng.* 72 (2006) 372.
- **[R12]** Codex Alimentarius, Norma para la miel CXS 12-1981; Crane (ed.), *Honey: A Comprehensive Survey* (1975) (composición, propiedades físicas y térmicas, higroscopía).
- **[R13]** Kroh, "Caramelisation in food and beverages", *Food Chemistry* 51 (1994) 373.
- **[R14]** EN 1993-1-2, Eurocódigo 3, parte 1-2: proyecto de estructuras de acero frente al fuego (factores de reducción de la resistencia).
- **[R15]** Fontana, *Corrosion Engineering*, 3.ª ed. (1986); ASM Handbook vol. 13B, *Corrosion: Materials* (acero al carbono en H₂SO₄, propiedades del acero).
- **[R16]** Morton, Taylor y Turner, "Turbulent gravitational convection from maintained and instantaneous sources", *Proc. R. Soc. A* 234 (1956) 1.
- **[R17]** Florschuetz y Chao, "On the mechanics of vapor bubble collapse", *J. Heat Transfer* 87 (1965) 209.
- **[R18]** Eggers, Lister y Stone, "Coalescence of liquid drops", *J. Fluid Mech.* 401 (1999) 293; Huppert, "The propagation of two-dimensional and axisymmetric viscous gravity currents over a rigid horizontal surface", *J. Fluid Mech.* 121 (1982) 43.
- **[R19]** Cussler, *Diffusion: Mass Transfer in Fluid Systems*, 3.ª ed. (2009) (coeficientes de difusión en agua).
- **[R20]** Pope y Fry, "Absorption spectrum (380–700 nm) of pure water", *Applied Optics* 36 (1997) 8710.
- **[R21]** Ley de radiación de Planck; Draper, "On the production of light by heat", *Phil. Mag.* 30 (1847) 345 (umbral de brillo visible ≈ 525 °C).
- **[R22]** Gislason y Oelkers, "Mechanism, rates, and consequences of basaltic glass dissolution", *Geochim. Cosmochim. Acta* 67 (2003) 3817.
- **[R23]** Pilch y Erdman, "Use of breakup time data and velocity history data to predict the maximum size of stable fragments for acceleration-induced breakup of a liquid drop", *Int. J. Multiphase Flow* 13 (1987) 741.
- **[R24]** Robertson, "Thermal properties of rocks", USGS Open-File Report 88-441 (1988) (densidad, calor específico y conductividad del basalto).
