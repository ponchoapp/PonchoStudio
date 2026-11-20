# Contrato API de PonchoStudio (v0.3)

El backend (Starlette) y el frontend (JS sin framework) se hablan solo por estas rutas. Todo JSON, UTF-8.
Errores: código HTTP 4xx/5xx con `{"error": "frase corta en español"}`.

## Estructura del proyecto
```
PonchoStudio/
  app/                      backend Python 3.12
    __init__.py             VERSION = "0.3.0"
    main.py                 Starlette: rutas, estáticos, arranque
    config.py               lee .env (sin librerías extra)
    db.py                   SQLite en data/studio.db
    trabajos.py             cola de trabajos (hilo de fondo que consulta proveedores)
    catalogo.py             modelos, precios, formatos (fuente única)
    prompts.py              biblioteca de prompts + mejorador (Ollama → OpenAI)
    proveedores/
      __init__.py
      seedance.py           BytePlus ModelArk
      openai_img.py         gpt-image
      ollama.py             modelos locales
      higgsfield.py         cliente MCP (HTTP streamable + OAuth PKCE)
    static/                 frontend
      index.html, estilos.css, js/app.js, js/api.js, js/ui.js, js/vistas/*.js
  data/                     (git ignora) studio.db, medios/, higgsfield_token.json
  data/presets/             (sí va a git) JSON de estilos, cámaras y prompts aprendidos
  docs/                     MEMORIA.md, CONTRATO_API.md, ERRORES.md, ...
  tests/                    pytest
  env.ejemplo, requirements.txt, ABRIR.bat, INSTALAR.bat, README.md, CHANGELOG.md
```
Puerto local: 8010. Medios descargados en `data/medios/` y servidos en `/medios/<archivo>`.

## Rutas
### Estado
- `GET /api/salud` → `{"version":"0.1.0","proveedores":{"seedance":{"listo":bool,"motivo":str},"seedream":{"listo":bool,"modelo":str,"motivo":str},"openrouter":{"listo":bool,"motivo":str},"openai":{...},"ollama":{"listo":bool,"modelos":[str]},"higgsfield":{"listo":bool,"conectado":bool}}, "demo": bool}`
  `demo` = true si no hay ninguna llave: los trabajos se simulan con medios de muestra.

### Catálogo
- `GET /api/catalogo` → `{"video":[Modelo], "imagen":[Modelo], "audio":[Modelo]}`
  `Modelo = {"id":"seedance-2.5","nombre":"Seedance 2.5","proveedor":"seedance","etiqueta":"Directo · barato",
   "resoluciones":["480p","720p","1080p"],"formatos":["16:9","9:16","1:1","4:3","3:4","21:9"],
   "duracion":{"min":4,"max":30},"audio":true,"entradas":["texto","primer_cuadro","ultimo_cuadro","referencias"],
   "gasta_creditos_higgsfield":false, "nota": str}`
  Campos para el selector de modelos (todos los modelos): `descripcion` (texto corto, "" si no hay), `nuevo` (bool; solo con dato
  verificado, hoy Seedance 2.5 Flash) y `destacado` (bool; curaduría en `catalogo.DESTACADOS_HF` y en cada modelo directo).
  Seedream 5.5 (v0.3.0): `{"id":"seedream-5.5","proveedor":"seedream","calidades":[],"resoluciones":["1k","2k"],
   "formatos":["1:1","2:3","3:2","3:4","4:3","9:16","16:9"],"variantes_max":4,"nuevo":true,...}`. Una imagen por pedido
   (cada variante es un trabajo aparte). Usa `ARK_API_KEY`; Model ID en `SEEDREAM_MODEL`. Sin llave: modo demo.
  Modelos de imagen: `{"id":"gpt-image-2", "proveedor":"openai", "calidades":["low","medium","high"], "formatos":["1:1","2:3","3:2"], "variantes_max":4, ...}`
  Modelos de Higgsfield aparecen con `"proveedor":"higgsfield","gasta_creditos_higgsfield":true`.
- `POST /api/costo` body `{"tipo":"video","modelo":"seedance-2.5","resolucion":"720p","formato":"9:16","duracion":5,"variantes":1}`
  → `{"usd":0.51,"detalle":"tokens ..."}`. Imagen: la tarifa depende del tamaño (`formato` 1:1 = 1024x1024; 2:3 y 3:2 = tarifa mayor).
  Seedream 5.5: tarifa oficial por imagen de salida: 0,020 si el tamaño es hasta ~2,6 M píxeles (1k), 0,035 hasta ~4,6 M (2k);
  `detalle` avisa que las referencias podrían sumar un cargo pequeño (sin confirmar). Video con plan B (sin `ARK_API_KEY`
  pero con `OPENROUTER_API_KEY`): estimado "desde" US$/s de OpenRouter, `detalle` dice "aproximado".
  El video de referencia NO cambia el precio calculado (ModelArk cobra también el video de entrada): la interfaz lo marca como aproximado. (Higgsfield → `{"usd":null,"creditos":n|null,"detalle":"..."}`).

### Generar
- `POST /api/generar` body:
  ```
  {"tipo":"video"|"imagen", "modelo":"seedance-2.5", "prompt":"...",
   "ajustes":{"resolucion":"720p","formato":"9:16","duracion":5,"audio":true,"semilla":null,
              "calidad":"medium","variantes":1},
   "entradas":{"primer_cuadro":"/medios/x.png"|null,"ultimo_cuadro":null,"referencias":[]},
   "estilo":"id-preset"|null, "camara":"id-preset"|null,
   "confirmar_creditos": false}
  ```
  Plan B de video (v0.3.0): si Seedance directo no está disponible (sin `ARK_API_KEY`) o BytePlus RECHAZA la creación con
  401/403 y hay `OPENROUTER_API_KEY`, el trabajo va por OpenRouter: `Trabajo.nota` = "Enviado por OpenRouter (plan B)…",
  `costo_usd` = estimado y luego el `usage.cost` real. Una tarea ya creada en BytePlus NUNCA se reenvía (sin doble gasto).
  Referencias: Seedance acepta imagen, video y audio; los demás modelos (gpt-image-2, Higgsfield) solo imágenes
  (`400` si llega un video o audio). Higgsfield solo recibe enlaces `http(s)` públicos.
  → `201 {"trabajos":[Trabajo]}`. Si el modelo gasta créditos de Higgsfield y `confirmar_creditos` no es true
  → `409 {"error":"...","creditos":n|null,"pide_confirmacion":true}`.
- `POST /api/subir` multipart campo `archivo` (imagen/video/audio, máx 50 MB) → `{"url":"/medios/abc.png","tipo":"imagen"}`

### Trabajos y biblioteca
- `Trabajo = {"id":"t_…","tipo":"video","modelo":"seedance-2.5","proveedor":"seedance","prompt":"…",
   "ajustes":{…},"estado":"en_cola"|"generando"|"listo"|"fallo"|"cancelado","progreso":0-100,
   "resultado":{"url":"/medios/…mp4","miniatura":"/medios/…jpg"|null,"ancho":int|null,"alto":int|null}|null,
   "error":str|null,"costo_usd":float|null,"creado":"ISO","terminado":"ISO"|null,"favorito":bool}`
- `GET /api/trabajos?tipo=video|imagen|audio&estado=&favoritos=1&limite=60&antes=<id>` → `{"trabajos":[Trabajo],"siguiente":id|null}`
- `GET /api/trabajos/{id}` → Trabajo
- `POST /api/trabajos/{id}/favorito` → Trabajo (alterna)
- `DELETE /api/trabajos/{id}` → `{"ok":true}` (cancela si está en cola, borra el registro; el archivo queda)
- `POST /api/trabajos/{id}/repetir` → `201 {"trabajos":[Trabajo]}` (mismos ajustes, semilla nueva)

### Prompts
- `GET /api/presets` → `{"estilos":[Preset],"camaras":[Preset],"plantillas":[Plantilla]}`
  `Preset = {"id":"neo-noir","nombre":"Neo noir","tipo":"estilo"|"camara","texto":"fragmento que se añade al prompt","miniatura":str|null,"origen":"higgsfield"|"poncho"}`
  `Plantilla = {"id":…,"nombre":…,"categoria":"video"|"imagen","prompt":"…","modelo_sugerido":…,"origen":…,"miniatura":"/presets/miniaturas/<id>.png"|null}`
  (`miniatura` sale si existe el archivo en `data/presets/miniaturas/`, que va a git y se sirve en `/presets/miniaturas/`).

### Miniaturas de plantillas (OpenAI gpt-image, gasta saldo de OpenAI)
- `POST /api/plantillas/miniaturas/costo` body `{"ids"?:[str],"calidad"?:"low"}` → `{"total":n,"usd":n×precio}` (low ≈ 0.011 c/u).
- `POST /api/plantillas/miniaturas` body `{"ids"?:[str],"calidad"?:"low"|"medium"|"high"}`
  Sin `ids`: todas las plantillas sin miniatura. Con `ids`: esas (las regenera aunque ya tengan).
  Una imagen cuadrada 1024x1024 por plantilla (la tarifa baja que se cotiza; vertical/horizontal costaría ~US$0,016).
  En video el prompt va como `"cinematic still frame of: …"`.
  - Hasta 2 → `200 {"hechas":n,"fallidas":[{"id","error"}],"costo_usd":x}`.
  - Más de 2 → `202 {"trabajo_id":"m_…"}` en segundo plano (máx 2 en paralelo). Si ya hay un lote corriendo,
    `202 {"trabajo_id":<el actual>,"nota":…}`.
  - Sin `OPENAI_API_KEY` → `409 {"error"}`. Calidad no válida → 400.
- `GET /api/plantillas/miniaturas/estado` → `{"trabajo_id","hechas","total","costo_usd","fallidas":[…],"listo":bool}`
- `POST /api/prompts/mejorar` body `{"prompt":"...","tipo":"video"|"imagen","modelo":"seedance-2.5","motor":"auto"|"ollama"|"openai","ollama_modelo":null}`
  → `{"prompt":"…mejorado…","motor":"ollama:llama3"|"openai:gpt-…"|"reglas"}` (sin IA disponible: reglas locales).
- `GET /api/prompts/guardados` / `POST /api/prompts/guardados` `{"nombre","prompt","tipo"}` / `DELETE /api/prompts/guardados/{id}`

### Higgsfield (MCP)
- `GET /api/higgsfield/estado` → `{"conectado":bool,"cuenta":str|null,"creditos":number|null,"herramientas":[str]}`
- `GET /api/higgsfield/conectar` → redirige al login OAuth de Higgsfield; vuelve a `/api/higgsfield/callback`.
- `POST /api/higgsfield/desconectar` → `{"ok":true}`
- `POST /api/higgsfield/aprender` → lee historial/modelos/presets de Higgsfield (no genera, no gasta créditos),
  guarda prompts útiles en `data/presets/aprendidos.json` → `{"nuevos":n,"total":m}`
- `GET /api/higgsfield/galeria?tipo=video|image&cursor=` → historial de la cuenta (no gasta créditos)
  → `{"items":[{"id","modelo","url","miniatura":str|null,"tipo":"video"|"imagen","fecha":str|null}],"siguiente":cursor|null}`
  Cache en memoria 10 min. No conectado → `409 {"error"}`. Sin herramienta de historial → `{"items":[],"siguiente":null,"nota"}`.
- `GET /api/higgsfield/presets?fuente=&forzar=1` → presets de Higgsfield con su preview
  → `{"items":[{"id","nombre","tipo":"video"|"imagen","preview":url|null,"preview_tipo":"video"|"imagen","prompt":str|null,"modelo":str|null,"categoria":str|null,"formato":str|null,"duracion":number|null}],"actualizado":"ISO","nota"?:str}`
  Recorre todas las fuentes (enum del esquema) y páginas, máx 200. Se guarda en `data/presets/higgsfield_presets.json`
  y se sirve de ahí si tiene < 24 h (o si el MCP falla / no hay conexión). `fuente` filtra por `categoria`.
  Sin herramienta de presets → `{"items":[],"nota"}`. No conectado y sin archivo → 409.
- `POST /api/higgsfield/recrear` body `{"preset_id"}` → no genera nada, solo precarga el generador:
  `{"prompt","modelo_sugerido":"seedance-2.5"|"gpt-image-2","ajustes":{…},"tipo","exclusivo":bool,"modelo_higgsfield":"hf:…"|null,"nota"?}`
  `exclusivo` = el preset usa un modelo propio de Higgsfield (no Seedance / no GPT Image). 404 si no existe.
- `GET /api/ollama/modelos` → `{"modelos":[{"nombre":"poncho-prompts:latest","tamano":…}]}`

## Reglas
- Nunca imprimir ni devolver llaves. `.env` y `data/` fuera de git.
- Español de Colombia, frases cortas, botones que dicen lo que hacen.
- Solo dependencias: starlette, uvicorn, python-multipart, requests (+ pytest en dev).

### Llaves (.env) desde la app
- `GET /api/llaves` → `{"ARK_API_KEY":{"guardada":bool,"final":"abcd"|null},"OPENAI_API_KEY":{...},"OPENROUTER_API_KEY":{...},"SEEDREAM_MODEL":{"guardada":bool,"valor":str},"OLLAMA_URL":{"guardada":bool,"valor":str},"OLLAMA_MODELO":{...}}`
  Nunca devuelve una llave completa: solo los 4 últimos caracteres.
- `POST /api/llaves` body `{ARK_API_KEY?, OPENAI_API_KEY?, OPENROUTER_API_KEY?, SEEDREAM_MODEL?, OLLAMA_URL?, OLLAMA_MODELO?}` (vacío = no cambiar)
  → `{"ok":true,"guardadas":[...],"salud":{...}}` · 400 si algo no sirve · 403 si la petición viene de otra página.
  Escribe el `.env` conservando las demás líneas y recarga la configuración sin reiniciar.

### Referencias desde un enlace (para que un ejemplo elegido no se pierda)
- `POST /api/referencias/importar` body `{"url":"https://…"}` → `{"url":"/medios/ref_….mp4","tipo":"imagen"|"video"|"audio","origen":"https://…","cuadro":"/medios/ref_….jpg"|null}`
  Descarga el medio a `data/medios` (máx 50 MB) y guarda su enlace de origen. `cuadro` es el primer cuadro de un
  video (solo si hay ffmpeg). El `url` devuelto se usa en `entradas.referencias` de `/api/generar` igual que uno subido.
  Solo acepta enlaces públicos http(s): rechaza localhost y redes privadas. 415 si no es imagen/video/audio,
  413 si pesa más de 50 MB, 502 si el enlace falla.
- Cómo llega a Seedance: imágenes en base64 (`reference_image`); video y audio por su enlace público de origen
  (`video_url`/`audio_url` con rol `reference_video`/`reference_audio`). Un video subido a mano (sin enlace público)
  da un error claro. **Los nombres de rol de video/audio no están confirmados con una generación real.**
