# Contrato API de PonchoStudio (v0.1)

El backend (Starlette) y el frontend (JS sin framework) se hablan solo por estas rutas. Todo JSON, UTF-8.
Errores: código HTTP 4xx/5xx con `{"error": "frase corta en español"}`.

## Estructura del proyecto
```
PonchoStudio/
  app/                      backend Python 3.12
    __init__.py             VERSION = "0.1.0"
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
- `GET /api/salud` → `{"version":"0.1.0","proveedores":{"seedance":{"listo":bool,"motivo":str},"openai":{...},"ollama":{"listo":bool,"modelos":[str]},"higgsfield":{"listo":bool,"conectado":bool}}, "demo": bool}`
  `demo` = true si no hay ninguna llave: los trabajos se simulan con medios de muestra.

### Catálogo
- `GET /api/catalogo` → `{"video":[Modelo], "imagen":[Modelo], "audio":[Modelo]}`
  `Modelo = {"id":"seedance-2.5","nombre":"Seedance 2.5","proveedor":"seedance","etiqueta":"Directo · barato",
   "resoluciones":["480p","720p","1080p"],"formatos":["16:9","9:16","1:1","4:3","3:4","21:9"],
   "duracion":{"min":4,"max":30},"audio":true,"entradas":["texto","primer_cuadro","ultimo_cuadro","referencias"],
   "gasta_creditos_higgsfield":false, "nota": str}`
  Modelos de imagen: `{"id":"gpt-image-2", "proveedor":"openai", "calidades":["low","medium","high"], "formatos":["1:1","2:3","3:2"], "variantes_max":4, ...}`
  Modelos de Higgsfield aparecen con `"proveedor":"higgsfield","gasta_creditos_higgsfield":true`.
- `POST /api/costo` body `{"tipo":"video","modelo":"seedance-2.5","resolucion":"720p","formato":"9:16","duracion":5,"variantes":1}`
  → `{"usd":0.51,"detalle":"tokens ..."}` (Higgsfield → `{"usd":null,"creditos":n|null,"detalle":"..."}`).

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
  `Plantilla = {"id":…,"nombre":…,"categoria":"video"|"imagen","prompt":"…","modelo_sugerido":…,"origen":…}`
- `POST /api/prompts/mejorar` body `{"prompt":"...","tipo":"video"|"imagen","modelo":"seedance-2.5","motor":"auto"|"ollama"|"openai","ollama_modelo":null}`
  → `{"prompt":"…mejorado…","motor":"ollama:llama3"|"openai:gpt-…"|"reglas"}` (sin IA disponible: reglas locales).
- `GET /api/prompts/guardados` / `POST /api/prompts/guardados` `{"nombre","prompt","tipo"}` / `DELETE /api/prompts/guardados/{id}`

### Higgsfield (MCP)
- `GET /api/higgsfield/estado` → `{"conectado":bool,"cuenta":str|null,"creditos":number|null,"herramientas":[str]}`
- `GET /api/higgsfield/conectar` → redirige al login OAuth de Higgsfield; vuelve a `/api/higgsfield/callback`.
- `POST /api/higgsfield/desconectar` → `{"ok":true}`
- `POST /api/higgsfield/aprender` → lee historial/modelos/presets de Higgsfield (no genera, no gasta créditos),
  guarda prompts útiles en `data/presets/aprendidos.json` → `{"nuevos":n,"total":m}`
- `GET /api/ollama/modelos` → `{"modelos":[{"nombre":"poncho-prompts:latest","tamano":…}]}`

## Reglas
- Nunca imprimir ni devolver llaves. `.env` y `data/` fuera de git.
- Español de Colombia, frases cortas, botones que dicen lo que hacen.
- Solo dependencias: starlette, uvicorn, python-multipart, requests (+ pytest en dev).
