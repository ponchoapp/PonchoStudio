# Guía de prompts de PonchoStudio

Guía corta para escribir prompts que salgan bien a la primera y no gasten de más.
Los prompts van **en inglés** (los modelos rinden mejor). Los diálogos y letras sí van en español, entre comillas.

---

## 1. Video con Seedance 2.5

### Estructura recomendada (en este orden)
1. **Formato**: formato (9:16, 16:9…), duración y si es una sola toma o varias.
2. **Sujeto**: quién o qué es. Rasgos fijos: cara, peinado, ropa, tatuajes, producto. Si hay foto, se nombra: `@image1`.
3. **Acción**: qué hace, con un inicio y un final que se vean. Una acción principal por toma.
4. **Escena**: lugar, hora del día, clima, detalles reales (barrio, terraza, discoteca, calle mojada).
5. **Cámara**: tamaño de plano (wide, medium, close-up) + **un solo** movimiento dominante (dolly in, órbita, FPV…).
6. **Luz**: fuente concreta (farol de sodio, luz de ventana, neón, hora azul) y relación de color (sombras frías, luces cálidas).
7. **Estilo**: textura y acabado (35 mm, VHS, anime, comercial).
8. **Audio y diálogo**: música, ambiente, efectos atados a un momento (`bass drop at 0:04`), y lo que se dice **entre comillas**.
9. **Restricciones** (cortas, al final): lo que no puede cambiar (cara, logo, ropa) y lo que no debe aparecer (subtítulos, texto, gente extra).

Ejemplo corto:
```
Vertical 9:16, 8 seconds, one continuous shot. The artist from @image1 (same face, braids and black leather jacket)
sings "Esta noche no vuelvo temprano" leaning on a black car under a street lamp. Low-angle hero shot, slow push in.
Wet asphalt, light rain, warm glow only around the lamp, deep blacks, natural skin tones.
Audio: his voice in Colombian Spanish over a slow perreo beat, rain ambience. No subtitles, no extra text.
```

### Longitud
- No hay un límite fijo: usa **el prompt más corto que defina bien la toma**.
- Una toma simple: 3 a 5 frases (unas 50-90 palabras).
- Varias tomas o 15-30 s: divide por **tiempos** (`0-5s: … 5-10s: …`), una intención por bloque. Cada bloque de 5-8 s.
- Más palabras no es mejor: lo que manda es el orden y lo concreto.

### Imágenes, video y audio de referencia
- Nómbralos en el prompt: `@image1`, `@image2`, `@video1`, `@audio1`, en el orden en que los subes.
- Di **para qué sirve cada uno**: identidad (cara), ropa, producto, estilo, movimiento.
  Ej.: `Use @video1 only for the motion, not for the face or clothes.`
- Para personaje consistente: una referencia principal + repetir sus rasgos fijos en el texto.
- Primer y último cuadro: van en los campos "primer cuadro" / "último cuadro" de la app; en el prompt describe solo el movimiento que los une.
- Ojo: en Seedance 2.5, con foto de entrada el formato pasa a `adaptive` (toma el de la foto). Haz la foto ya en el formato que quieres.

### Diálogo y audio
- Lo que se dice va **entre comillas**, pegado a una acción visible: `he turns and says "Sale el viernes, hermano"`.
- Di el idioma y el acento: `in Colombian Spanish`.
- Describe el audio en su propia frase: música (`reggaeton beat with dembow rhythm`), ambiente (`rain, distant motorbikes`), efectos con su momento.
- Si no quieres sonido: `Audio: none, silent.` (o apaga "audio" en la app; también ahorra trabajo al modelo).

### Movimientos de cámara
- Usa los presets de **Cámara** de la app: ya traen el texto técnico listo.
- Pon la cámara **antes** del estilo; si queda enterrada al final, el modelo la ignora.
- Un movimiento por toma. No pidas a la vez "trípode fijo" y "cámara en mano".
- Gustos de Poncho: nada de sacudidas tipo terremoto. Si quieres cámara en mano, que sea `subtle handheld, no violent shake`.

---

## 2. Imágenes con gpt-image-2

### Estructura
1. **Uso y formato**: portada 1:1, miniatura 16:9 (1536x1024), póster 2:3.
2. **Sujeto y composición**: quién, pose, mirada, dónde va en el cuadro (tercio izquierdo, centro).
3. **Escena y luz**: lugar, fuente de luz, materiales.
4. **Estilo / medio**: foto 35 mm, editorial, ilustración, producto en estudio. Di `photorealistic` si lo quieres real.
5. **Texto** (si lleva): exacto y **entre comillas**, con dónde va y qué letra: `"NOCHE LARGA" in bold sans-serif at the top center`.
6. **Restricciones**: `No other text, no watermark`, qué mantener igual.

### Texto en la imagen
- Palabras raras o nombres: escríbelos tal cual y pide que aparezcan una sola vez.
- Texto pequeño o mucho texto: usa calidad **medium** o **high**. En **low** sale mal.
- Revisa siempre la ortografía del resultado (tildes incluidas).

### Editar con fotos de referencia
- Numera: `image 1`, `image 2`, y di el papel de cada una (cara, ropa, fondo, estilo).
- Di **qué cambia y qué se queda**: `Change only the outfit. Keep the face, pose, background and lighting exactly the same.`
- Para consistencia entre varias imágenes: reutiliza la misma foto del personaje y repite sus rasgos.
- Cambia **una cosa a la vez**; si algo se desvía, repite la restricción.

### Fondo transparente
- gpt-image-2 **no** da fondo transparente. Pide `plain pure white background` y recorta aparte.

---

## 3. Gustos de Poncho (aplican a todo)
- Nada de colores sobresaturados: `restrained color`, `low saturation`.
- Nada de piel amarillenta: `natural skin tones, no yellow cast`.
- Negros profundos: `deep blacks`.
- Halo / brillo suave **solo en luces fuertes**: `soft halation only around strong highlights`.
- Nada de sacudidas fuertes de cámara.

Los presets de Estilo de la app ya traen estas reglas metidas.

---

## 4. Errores comunes (y cómo arreglarlos)
| Problema | Causa | Arreglo |
|---|---|---|
| La cara o el producto cambia | Rasgos vagos o varias fotos que se contradicen | Una referencia principal, rasgos fijos escritos, repetirlos en cada toma |
| Cortes que no pediste | No dijiste cuántas tomas | Di "one continuous shot" o el número exacto de tomas con tiempos |
| Ignora la cámara | Movimiento enterrado entre adjetivos | Plano + movimiento antes del estilo |
| Acción apurada o rara | Demasiadas cosas para la duración | Quita acciones o alarga la toma |
| Se ve genérico | Palabras como "cinematic", "beautiful" | Lugar, fuente de luz, lente y textura concretos |
| Audio suelto | Sonido sin momento | Ata cada sonido a una acción o segundo |
| Logos o letras deformes en video | Texto pequeño en movimiento | Que el texto se agregue en edición, o cuadro final fijo de frente |
| Manos o cuerpos raros | Movimiento muy rápido o encuadre cortado | `full body in frame, correct anatomy`, menos velocidad |
| Lista negra larguísima | Compite con la escena | Pocas restricciones, concretas, al final |

---

## 5. Cómo no gastar de más
1. **Mejora el prompt gratis primero** con Ollama (botón "Mejorar prompt" → motor Ollama). OpenAI solo si Ollama no está.
2. **Prueba en 480p y corto** (4-5 s). Se cobra por píxeles × segundos: 480p cuesta mucho menos que 1080p.
3. Cuando una prueba te guste, **repite con la misma semilla** y sube a **720p o 1080p solo la toma final**.
4. Cambia **una sola cosa** entre pruebas (cámara, luz o estilo) para saber qué funcionó.
5. Apaga el audio en las pruebas de movimiento si no lo necesitas.
6. Imágenes: prueba en calidad **low** la composición; sube a **medium/high** solo la buena (o si lleva texto).
7. Haz primero la foto del personaje con gpt-image-2 y úsala como `@image1`: el video sale consistente y repites menos.
8. 4K no existe en la API: genera en 1080p y escala aparte.
9. Higgsfield gasta créditos: úsalo solo cuando lo elijas, y para **aprender** (leer historial y presets no gasta).

---

## Fuentes
- BytePlus ModelArk, "Dreamina Seedance 2.5 series prompt guide" y "Seedance 2.0 prompt guide": https://docs.byteplus.com/en/docs/ModelArk/seedance-2-5-prompt-guide (la página no mostró su cuerpo al consultarla; se usó junto con las guías públicas de abajo).
- Dreamina (CapCut), "Seedance 2.5 Prompt Guide": https://dreamina.capcut.com/seedance/seedance-2-5-prompt
- Kylon, "How to Use Seedance 2.5: A Prompt Framework": https://kylon.io/blog/seedance-2-5-prompt-guide-2026
- OpenAI Cookbook, "GPT Image Generation Models Prompting Guide": https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide
- Higgsfield, "Camera Controls" (lista de movimientos de cámara): https://higgsfield.ai/camera-controls
- Higgsfield blog, presets de estilo (Cinema Studio, Soul, Moodboards): https://geo.higgsfield.ai/blog/ai-image-video-generator-stylistic-presets
- Código fuente impreso de higgsfield.ai (páginas principal, video Seedance 2.5 Flash, imagen Seedream v5 Lite, audio, estudios, biblioteca): estructura de prompts con tiempos (`0:00–0:02 | …`) y campo "Camera Style", presets de reels tipo "Recrear" / style-transfer.
- Precios y límites de Seedance: docs/MEMORIA.md (catálogo de Poncho OS).
