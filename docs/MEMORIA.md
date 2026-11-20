# Memoria del proyecto PonchoStudio

Archivo que resume TODA la conversación y las decisiones. Se actualiza en cada avance.
Si la conversación se compacta o se empieza una nueva sesión, leer esto primero.
Última actualización: 19 nov 2026, 19:25 (hora Colombia).

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
- Cuenta: **ponchoapp**. Repo creado por Poncho: `ponchoapp/PonchoStudio` (vacío, privado).
- La sesión puede leerlo, pero el push se rechaza: falta instalar la app de Claude en GitHub con acceso al repo
  (github.com/apps/claude/installations/select_target).

## 5. Progreso
- [x] Revisión de apps existentes y del código de Higgsfield.
- [ ] App construida.
- [ ] Documentación (README, CHANGELOG, ERRORES).
- [ ] Guardada en G:\DATOS\Documentos\PonchoStudio y en git.
- [ ] Verificada.
