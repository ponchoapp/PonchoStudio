# Memoria del proyecto PonchoStudio

Archivo que resume TODA la conversación y las decisiones. Se actualiza en cada avance.
Si la conversación se compacta o se empieza una nueva sesión, leer esto primero.
Última actualización: 19 nov 2026, 21:20 (hora Colombia).

## 1. Qué pidió Poncho (sus palabras, resumidas)
- Una app nueva para crear videos e imágenes **con interfaz como Higgsfield** (inicio/explorar, imagen, video,
  audio, estudios, biblioteca). Hacer ingeniería inversa de Higgsfield con el código fuente que adjuntó
  (6 PDFs de view-source: página principal, generar video, generar fotos, audio, estudios, biblioteca).
- **Colores:** en vez del verde fosforescente (lima) de Higgsfield, **morado/violeta** y colores "bien cool".
  Igual que Poncho OS: acento violeta neón `#B15CFF`, cero lima.
- **Video:** que NO se mande a Higgsfield, sino **directo a Seedance 2.5** (BytePlus ModelArk, API oficial,
  sin intermediario, lo más barato). Poncho va a comprar Seedance.
- **Imágenes:** conectar **ChatGPT / OpenAI** (Poncho ya lo tiene; en otra consola de Claude ya lo usa).
  Ojo: la app necesita una **llave de API de OpenAI** (platform.openai.com), no la suscripción de ChatGPT.
- **Higgsfield MCP:** conectarse (https://mcp.higgsfield.ai/mcp, OAuth con su cuenta, sin llave).
  Usarlo **lo menos posible** para no gastar créditos (cada generación por MCP cuesta créditos normales,
  aunque tenga plan ilimitado en la web). Usarlo para **aprender sus modelos y prompts** (leer historial,
  modelos, presets: leer no gasta créditos). Poncho paga la licencia de Higgsfield.
- **Ollama:** Poncho tiene modelos locales de Ollama, algunos creados por él. Usarlos (gratis) para
  mejorar prompts antes de gastar en OpenAI. La app detecta los modelos con `GET http://localhost:11434/api/tags`.
- Guardar todo en **G:\DATOS\Documentos** (carpeta conectada). Proyecto: `G:\DATOS\Documentos\PonchoStudio`.
- **GitHub:** subir a un repositorio, manejar versiones y documentar cada versión (CHANGELOG).
- **Errores:** llevar un archivo de errores para no repetirlos (`docs/ERRORES.md`).
- Separar el trabajo y **usar agentes** para cada tarea. Instalar skills/lo que haga falta.
- **Compilar la conversación** en esta memoria cuando se acerque el límite de tokens.
- Usar Claude Code para construirlo.

## 2. Datos técnicos verificados
### Seedance 2.5 (BytePlus ModelArk, oficial)
- Base: `https://ark.ap-southeast.bytepluses.com/api/v3`
- Crear: `POST /contents/generations/tasks` · Consultar: `GET /contents/generations/tasks/{id}` ·
  Cancelar (solo en cola): `DELETE /contents/generations/tasks/{id}`
- Auth: `Authorization: Bearer <ARK_API_KEY>`
- Modelo 2.5: `dreamina-seedance-2-5-260628` · 2.0: `dreamina-seedance-2-0-260128` ·
  2.0 Fast: `dreamina-seedance-2-0-fast-260128`
- Cuerpo: `model`, `content` (lista: `{"type":"text","text":...}`, `{"type":"image_url","image_url":{"url":...},"role":"first_frame|last_frame|reference_image"}`),
  `resolution` (480p/720p/1080p), `ratio` (16:9, 9:16, 1:1, 4:3, 3:4, 21:9, adaptive), `duration` (2.5: 4-30 s),
  `generate_audio` (por defecto true), `seed`, `watermark`.
- En 2.5 con foto de entrada solo acepta `ratio: "adaptive"`.
- 4K: NO en la API pública (solo 480p/720p/1080p). 4K solo en Runway/Picsart o empresas invitadas.
  Para 4K barato: generar 1080p y escalar aparte.
- Precio: tokens = ancho × alto × 24 × segundos / 1024; tarifa USD por millón de tokens:
  2.5 → 480p/720p 10.7, 1080p 11.7 · 2.0 → 7.0/7.7 · 2.0 Fast → 5.6. (Tomado de catalogo.py de Poncho OS, verificado 5 nov 2026.)
- Cuentas individuales: máximo 3 tareas a la vez.
- Respuesta al terminar: `status` (queued/running/succeeded/failed/cancelled), `content.video_url`,
  `usage.completion_tokens`.
- Docs: docs.byteplus.com/en/docs/ModelArk (seedance-2-5, quick-start, model-pricing).

### OpenAI imágenes
- `POST https://api.openai.com/v1/images/generations` y `/v1/images/edits` (acepta `image[]` repetido).
- Modelo que usa Poncho OS: `gpt-image-2` (no acepta fondo transparente → pedir fondo blanco liso).

### Higgsfield MCP
- URL: `https://mcp.higgsfield.ai/mcp` (MCP por HTTP, OAuth con la cuenta de Higgsfield, requiere plan pago).
- Todo lo generado por MCP cae en Assets de higgsfield.ai con etiqueta MCP.
- Modelos vistos en su código: seedance_2_5, seedance_2_5_flash, seedream_v5_lite, gpt_image_2_5,
  nano_banana (2 / pro), soul_v2, soul_cinematic, kling (omni, video reference, 3.0 motion control),
  veo 3.1, wan 2.6 / 3.0, minimax hailuo 2.3 fast, Higgsfield Audio, Cinema Studio.

### Apps existentes de Poncho (guía de estilo y código)
- `PonchoOS/poncho-os-v1`: Python 3.12 + Starlette + Uvicorn + SQLite + requests, sin FastAPI.
  Frontend HTML/CSS/JS sin framework, módulos ES, una vista por archivo. Fuentes Unbounded + Manrope.
  Ya tiene integración Seedance (integraciones.py, catalogo.py, generacion.py) y banco de prompts.
  Reglas: nunca llaves en código/commits/chat; todo en español corto; botones que dicen lo que hacen.
- `PonchoEditor`: Python, con `APRENDIZAJES.md` (gustos de Poncho: nada de colores muy saturados, ni piel amarilla).
- `MoneyMakers/PENDIENTES_PONCHO.md`: lista de pendientes que solo Poncho puede hacer.

## 3. Decisiones
- Stack igual a Poncho OS (Starlette + JS sin framework) para que Poncho lo mantenga igual.
- Corre en local en Windows: `http://localhost:8010`.
- Proveedores con interfaz común: `seedance` (video), `openai` (imagen), `ollama` (texto/prompt, gratis),
  `higgsfield` (MCP, solo cuando se elige y con confirmación de créditos).
- Sin llaves = modo demostración con un aviso claro (no se rompe).

## 4. Pendientes de Poncho
- GitHub no está conectado en esta sesión de Claude: conectar en claude.ai → Configuración → Conectores → GitHub.
  Mientras tanto el repo queda con git local y versiones.
- Crear la llave `ARK_API_KEY` en BytePlus ModelArk y activar Seedance 2.5.
- Llave de OpenAI API (`OPENAI_API_KEY`).
- Conectar Higgsfield la primera vez (botón en la app abre el login).

## 4b. Estado de conexiones (19 nov, 19:31)
- Poncho agregó los conectores **Higgsfield** (personalizado) y **Higgsfield AI** (comunidad) en claude.ai: ambos conectados.
  En esta sesión no cargaron (un conector nuevo carga en un chat nuevo). La app trae su propio cliente MCP con OAuth.
- Ollama: `~/.ollama` (C:\Users\andre\.ollama) no tiene modelos; `config.json` usa `glm-5.3-flash:cloud` (Ollama Pro, nube).
  Los modelos locales viven en otra carpeta (OLLAMA_MODELS). La app los detecta en vivo con `/api/tags`.
- GitHub: "Integración con GitHub" conectada en claude.ai, pero `gh` en esta sesión aún dice "No linked GitHub account".
  Hace falta autorizar con el enlace auth_start=github de claude.ai/customize/connectors.
- Poncho está comprando Seedance (BytePlus).
- Agentes trabajando: backend, interfaz morada, biblioteca de prompts.

## 4c. Higgsfield leído (19 nov, 19:45)
- En esta sesión cargó el conector **Higgsfield AI** (comunidad): SOLO LECTURA (balance, models_list, models_get,
  show_generations, workspaces). No puede generar ni comprar.
- Cuenta: plan **creator**, **6000 créditos**.
- Catálogo real guardado en `data/presets/higgsfield_catalogo.json` (26 modelos: Cinema Studio 4.0/3.0, Seedance 2.5 con 4K
  y borrador, Kling 4.0/3.0/Omni, MiniMax H3, Hailuo, FLUX 3 Video, Grok Video, Wan 2.6, Soul 2, Soul Cinema,
  Nano Banana Pro/2.1, Seedream 4.5, ElevenLabs Music/Voz, Seed Audio…).
- El historial NO trae prompts. Lo que más usa Poncho: seedance_2_5 (9), replace object flash (10), kling3_0 (3).
- Dato útil: Seedance 2.5 en Higgsfield sí da 4K y tiene modo `draft` 480p que se finaliza después (7 días).

## 4d. GitHub
- Cuenta: **ponchoapp**. Repo: **github.com/ponchoapp/PonchoStudio** (privado), rama `main`.
- App de Claude instalada en GitHub con "All repositories": las sesiones de Claude ya pueden hacer push.
- Cada avance va con commit + push. Al cerrar versión: subir `VERSION`, entrada en `CHANGELOG.md` y `git tag vX.Y.Z`.
- La copia del PC (`G:\DATOS\Documentos\PonchoStudio`) tiene su `.git`. El PC (shell de Claude) NO llega a GitHub
  (proxy 403): para sincronizar se manda un `git bundle` y se hace `git pull` del bundle, o Poncho hace `git pull` en Windows.
- `G:\DATOS\Documentos\_to_delete\PonchoStudio.tar.gz`: copia vieja, se puede borrar.

## 4e. BytePlus (Seedance) — lo que hizo Poncho el 19 nov
- Cuenta creada en console.byteplus.com, región **Asia Pacific (Johor)** = `ap-southeast-1` (coincide con la URL de la app).
- NO comprar el "Coding Plan" (US$10/50 mes): es para modelos de texto, no incluye Seedance. Seedance es pago por uso.
- Va a activar en **Console → Model activation**: Dreamina-Seedance-2.5, Dreamina-Seedance-2.5-flash y Dola-Seedream-5.5.
- Model ID de Flash (verificado en consola): `dreamina-seedance-2-5-flash-261115`, US$7/M tokens sin video (4.3 con video).
  Ya está en `app/catalogo.py` como `seedance-2.5-flash` (480p/720p).
- **Falta**: Model ID de **Dola-Seedream-5.5** (imagen, US$0.02–0.035 por imagen, fondo transparente) para agregarlo
  como motor de imagen con la misma ARK_API_KEY (endpoint de imágenes de ModelArk).
- Opción "Free Credits Only Mode": si la prende, solo gasta crédito gratis y se pausa. Recomendado para la primera prueba.
- Modelos de texto baratos en la misma cuenta (GLM-5.3-Flash, DeepSeek-V4.1-Flash): idea para respaldo de "Mejorar prompt".
- Poncho TIENE API de OpenAI (ChatGPT API): imágenes con gpt-image-2 listas en cuanto pegue la llave.

- **Colombia: BytePlus NO acepta cuenta Personal, solo Business** (19 nov). Poncho va a crearla como Business con
  nombre de su marca (p. ej. Giraldo Records). Puede pedir verificación de empresa (probar con RUT).
  Plan B si no pasa: **OpenRouter** (tiene Seedance 2.5 y 2.5 Flash, acepta personas) → agregarlo como proveedor.

## 4f. Llaves
- NUNCA pedir ni recibir llaves por el chat. La app tiene ventana "Pegar mis llaves" en Ajustes → `POST /api/llaves`
  escribe el `.env` del PC (conserva lo demás), recarga sin reiniciar y solo muestra los 4 últimos caracteres.
  Bloquea peticiones de otras páginas (origen ≠ localhost). Servidor solo en 127.0.0.1:8010.

## 4g. Ollama
- `C:\Users\andre\.ollama\config.json` → integración con Claude usando `glm-5.3-flash:cloud` (Ollama Pro, nube).
- Los modelos locales NO están en `~/.ollama/models` (OLLAMA_MODELS apunta a otra carpeta, sin ubicar).
  La app los lista en vivo con `/api/tags`; Poncho elige el suyo en Ajustes (OLLAMA_MODELO).
- Hecho (19 nov): `ollama list` revisado; por defecto Gemma 4 E4B (ver 5b).

## 4h. Higgsfield completo
- El conector personalizado (mcp.higgsfield.ai, puede generar) está conectado en claude.ai pero NO cargó en la sesión
  del 19 nov (solo cargó el de solo lectura). En una sesión NUEVA debería aparecer. Antes de generar con él:
  decir el costo en créditos y esperar confirmación de Poncho.

## 5. Progreso (19 nov, 19:56)
- [x] Revisión de apps existentes y del código de Higgsfield (PDFs → /home/claude/hf/*.txt en la sesión vieja).
- [x] Backend completo (Starlette): Seedance 2.5/2.5 Flash/2.0/2.0 Fast directo, OpenAI imágenes, Ollama,
      cliente MCP Higgsfield con OAuth+PKCE, cola de trabajos (máx 3 Seedance), modo demo, llaves desde la app.
      **51 pruebas pasan** (`python -m pytest`).
- [x] Biblioteca de prompts: 40 cámaras, 35 estilos, 44 plantillas (`data/presets/`), `docs/GUIA_PROMPTS.md`.
- [x] Catálogo real de Higgsfield (26 modelos) cargado desde `data/presets/higgsfield_catalogo.json`.
- [x] Documentación: README, CHANGELOG, CLAUDE.md, ERRORES.md, CONTRATO_API.md, esta memoria.
- [x] En GitHub y en `G:\DATOS\Documentos\PonchoStudio`.
- [x] **Interfaz** terminada (app/static): Explorar, Video, Imagen, Audio, Estudios, Biblioteca, Ajustes y la ventana
      "Pegar mis llaves". Probada contra el backend real; capturas en `docs/capturas/`. Detalles en ERRORES.md.
- [ ] Verificación en Windows: ABRIR.bat, revisar consola, demo, y generación real 480p 4 s con Seedance 2.5 Flash
      cuando Poncho tenga la llave. (Audio aún es solo informativo: no hay ruta para generar audio.)
- [x] Versión **v0.1.0** cerrada. El tag existe en la copia del PC; la sesión en la nube no puede subir tags (proxy 403): Poncho corre `git push --tags` en Windows.

## 5b. Estado 19 nov 20:27
- En el PC de Poncho la app CORRE (localhost:8010). `.env` con ARK_API_KEY, OPENAI_API_KEY y OLLAMA_MODELO guardadas
  (desde la ventana de llaves) y `data/higgsfield_token.json` existe: **Seedance, OpenAI, Ollama y Higgsfield conectados**.
- A Poncho NO le gustó la interfaz v0.1.0. Eligió **"Igual a Higgsfield"**: masonry denso, panel izquierdo angosto de
  ajustes, feed al centro, barra de prompt flotante abajo, letra chica, negro, violeta solo en foco/botón principal.
  Rediseño en curso (agente de interfaz, con skill frontend-design).
- Plantillas sin imagen "no se ven": Explorar mostrará **presets reales de Higgsfield con video de muestra**
  (GET /api/higgsfield/presets, leído por MCP, gratis) + **sus generaciones** (GET /api/higgsfield/galeria) y botón
  "Recrear" que carga prompt/ajustes en Seedance directo. En curso (agente backend).
- Skills: `frontend-design` = la de páginas web (disponible). Remotion en Claude Code:
  `claude plugin marketplace add remotion-dev/claude-code-plugin` y `claude plugin install remotion@remotion`.

## 5c. Relevo a Claude Code en Windows (19 nov, 20:40)
- `main` ya tiene el **rediseño estilo Higgsfield** (masonry, panel izquierdo, barra de prompt flotante), y el backend de
  `/api/higgsfield/presets`, `/api/higgsfield/galeria`, `/api/higgsfield/recrear` y `/api/plantillas/miniaturas*`
  (ver CONTRATO_API.md). 64 pruebas pasan. **Nada de esto se probó contra Higgsfield ni OpenAI reales**: solo con
  servidores falsos. Primera tarea en el PC: probarlo con las conexiones reales de Poncho.
- Poncho siente que el diseño **todavía puede mejorar**. Sigue Claude Code en Windows (Fable 5.2) con las skills
  instaladas en `.agents/skills` (fuera de git): frontend-design, impeccable, ui-ux-pro-max (+design, ui-styling,
  design-system), web-design-guidelines, brand-guidelines y design-taste-frontend.
  **Ojo:** `design-taste-frontend` salió con "Critical Risk" (Gen) en el instalador: leer su SKILL.md y scripts antes
  de usarla; no es necesaria.
- La sesión en la nube (esta) deja de tocar el código para no pisarse. Rama `rediseno-higgsfield` ya está unida a main.
- Ollama: arreglado en 5d (`think: false`, Gemma 4 E4B por defecto).

## 5d. Sesión Claude Code en Windows (19 nov, 20:00–20:50)
- Higgsfield **completo** (mcp.higgsfield.ai, puede generar) SÍ cargó en Claude Code: 6000 créditos, plan creator.
  Regla: antes de generar con él, decir el costo (estimate_*_cost) y esperar el sí de Poncho.
- El PC ya hace `git push` directo a GitHub (el proxy 403 era solo de la sesión en la nube). Tag v0.1.0 ya está arriba.
- Python del PC: solo 3.14 (`py`). INSTALAR.bat ahora usa `py -3` si no hay 3.12 e instala también pytest.
- Poncho pegó sus llaves (ARK, OpenAI) y conectó Higgsfield en la app el 19 nov 20:25: **la app en 8010 ya NO es demo**.
  El demo se prueba en una copia en 8011 sin llaves (ver ERRORES.md). Probado: 7 vistas cargan, sin errores de consola
  (solo los de la extensión Bitwarden, que también bloquea las capturas de Claude in Chrome), video e imagen demo OK.
- Chrome: "Browser 1" es el de este PC; "Browser 2" no llega a localhost.
- Ollama (`ollama list`): qwen3.5:4b, hf.co/google/gemma-4-E4B-it-qat-q4_0-gguf:latest, hf.co/unsloth/Qwen3.5-4B-GGUF:Q4_K_M.
  GPU RTX 4050 6 GB. Por defecto ahora **Gemma 4 E4B** (~4 s, el texto más rico). Qwen 3.5 solo sirve con `think:false`
  (sin eso, 85 s y respuesta vacía): arreglado en `proveedores/ollama.py`.
- En curso: **v0.2.0** = Seedream 5.5 (imagen, misma ARK_API_KEY), botón "Comparar" y OpenRouter como plan B de Seedance.

## 5e. Orden que pidió Poncho (19 nov, 21:00) y dónde voy
Reglas nuevas: **decir cuánto vale cada cosa ANTES de generarla** (OpenAI, BytePlus, OpenRouter o Higgsfield) y esperar su sí.
Usar las skills de diseño que instaló (frontend-design, impeccable, ui-ux-pro-max, web-design-guidelines).
`design-taste-frontend`: NO usarla sin leer su SKILL.md y scripts y contarle a Poncho qué hace (salió "Critical Risk").
1. [x] Servidor 8010 reiniciado con el código nuevo (rediseño). Explorar contra el MCP real:
   - Galería estaba vacía: el MCP manda `results.rawUrl`/`minUrl`, `size` con `anyOf`, `createdAt` epoch y
     `next_cursor` decimal. Arreglado. **El historial del MCP completo SÍ trae `params.prompt`** (45 de 50 videos).
   - Presets daban 502: cursor "12" como texto = cursor opaco de Katana. Arreglado (`_cursor_valor`). Fuentes:
     viral, what_if, marketing_studio, soul (60 c/u, 200 en total, 4.7 s). Sin prompt: Recrear usa `description`.
   - Falta: probar Explorar en Chrome ("Browser 1") y poner "Recrear" en "Tus generaciones en Higgsfield"
     (inicio.js, ahora que traen prompt) → carga el prompt en Seedance directo (no gasta).
2. [ ] Miniaturas de plantillas con ChatGPT: autorizado ~US$0,50. Antes de lanzar, mirar el costo real con
   `POST /api/plantillas/miniaturas/costo` y decírselo.
3. [ ] Pulir la interfaz vista por vista con las skills, con capturas de antes y después (Bitwarden bloquea las
   capturas de Claude in Chrome: probar con la extensión en pausa o capturar con otra herramienta).
4. [ ] v0.2.0: Seedream 5.5, OpenRouter (plan B de Seedance) y "Comparar".

## 5f. Referencias que no se pierden (nube, 19 nov 21:10)
- Backend listo: `POST /api/referencias/importar {url}` (app/referencias.py) baja el medio de un ejemplo a `data/medios`
  y recuerda su enlace. `seedance.armar_cuerpo` manda imágenes en base64 y video/audio por enlace público.
- **Falta en la interfaz** (Claude Code): al dar "Recrear" o elegir un ejemplo, llamar a importar con la URL de la vista
  previa y dejar el resultado adjunto en Referencias (tarjeta con miniatura, "Cambiar" y X; persistir al cambiar de vista).
- **Falta probar de verdad**: una generación 480p 4 s con Seedance 2.5 Flash (~US$0,10) con un video de referencia para
  confirmar los roles `reference_video`/`reference_audio` y que ModelArk acepte el enlace de CloudFront de Higgsfield.
  Si lo rechaza: usar `cuadro` (primer cuadro) como `reference_image`. Pedir permiso a Poncho antes de gastar.

## 6. Ideas pedidas o propuestas (siguientes versiones)
- Botón **"Comparar"**: un prompt a dos modelos a la vez (p. ej. Seedance 2.5 directo vs Kling por Higgsfield).
- Seedream 5.5 como motor de imagen (más barato que OpenAI, fondo transparente).
- Plantillas del estilo de Poncho sacadas de sus videos de Seedance en Higgsfield (`show_generations` da los enlaces).
- Respaldo de "Mejorar prompt" con GLM/DeepSeek de BytePlus.

## 7. Cómo seguir en una ventana nueva
1. Abrir sesión nueva en Claude (desktop, con el PC seleccionado) y conectar la carpeta `G:\DATOS\Documentos`.
2. Decir: *"Lee G:\DATOS\Documentos\PonchoStudio\docs\MEMORIA.md y docs\ERRORES.md y sigue con PonchoStudio."*
3. O en Claude Code: `cd G:\DATOS\Documentos\PonchoStudio` → `git pull` → `claude` (lee CLAUDE.md solo).
