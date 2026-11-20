"""Servidor Starlette de PonchoStudio: rutas /api, medios y frontend estático.

Arranque: `python -m app` o `uvicorn app.main:app --port 8010`.
"""

from __future__ import annotations

import contextlib
import functools
import html
import json
import secrets
from pathlib import Path

from starlette.applications import Starlette
from starlette.concurrency import run_in_threadpool
from starlette.exceptions import HTTPException
from starlette.requests import Request
from starlette.responses import HTMLResponse, JSONResponse, PlainTextResponse, RedirectResponse
from starlette.routing import Mount, Route
from starlette.staticfiles import StaticFiles

from app import referencias
from app import VERSION, catalogo, config, db, miniaturas, prompts, trabajos
from app.proveedores import ErrorProveedor, higgsfield, ollama, openai_img, openrouter, seedance, seedream
from app.trabajos import ErrorValidacion, ahora_iso

MAX_SUBIDA = 50 * 1024 * 1024
EXTENSIONES = {
    "imagen": {".png", ".jpg", ".jpeg", ".webp", ".gif"},
    "video": {".mp4", ".mov", ".webm", ".m4v"},
    "audio": {".mp3", ".wav", ".m4a", ".ogg", ".aac", ".flac"},
}
PREFIJO_MIME = {"imagen": "image/", "video": "video/", "audio": "audio/"}


# ---------------------------------------------------------------- utilidades

def error(mensaje: str, codigo: int = 400, **extra) -> JSONResponse:
    return JSONResponse({"error": mensaje, **extra}, status_code=codigo)


def manejar_errores(funcion):
    """Convierte las excepciones conocidas en {"error": ...} con su código."""
    @functools.wraps(funcion)
    async def envoltura(request: Request):
        try:
            return await funcion(request)
        except ErrorValidacion as e:
            return error(e.mensaje, e.codigo, **e.extra)
        except ErrorProveedor as e:
            return error(e.mensaje, 502)
        except ValueError as e:
            return error(str(e) or "Datos no válidos.", 400)
    return envoltura


async def leer_json(request: Request, obligatorio: bool = True) -> dict:
    cuerpo = await request.body()
    if not cuerpo.strip():
        if obligatorio:
            raise ErrorValidacion("Falta el cuerpo JSON.")
        return {}
    try:
        datos = json.loads(cuerpo)
    except ValueError:
        raise ErrorValidacion("El cuerpo no es JSON válido.")
    if not isinstance(datos, dict):
        raise ErrorValidacion("El cuerpo debe ser un objeto JSON.")
    return datos


def quiere_html(request: Request) -> bool:
    return "text/html" in request.headers.get("accept", "")


def pagina(titulo: str, mensaje: str, codigo: int = 200, volver: bool = True) -> HTMLResponse:
    redirige = '<meta http-equiv="refresh" content="3;url=/">' if volver else ""
    contenido = (
        "<!doctype html><html lang='es'><head><meta charset='utf-8'>"
        f"<title>{html.escape(titulo)}</title>{redirige}"
        "<style>body{background:#0d0814;color:#eee;font-family:system-ui,sans-serif;display:grid;"
        "place-items:center;height:100vh;margin:0}div{max-width:480px;text-align:center}"
        "h1{color:#B15CFF}a{color:#B15CFF}</style></head><body><div>"
        f"<h1>{html.escape(titulo)}</h1><p>{html.escape(mensaje)}</p>"
        "<p><a href='/'>Volver a PonchoStudio</a></p></div></body></html>")
    return HTMLResponse(contenido, status_code=codigo)


# ---------------------------------------------------------------- estado y catálogo

def _salud() -> dict:
    c = config.cfg
    modelos_ollama = [m["nombre"] for m in ollama.modelos()]
    ark = seedance.disponible()
    oai = openai_img.disponible()
    orr = openrouter.disponible()
    sdr = seedream.disponible()
    hf = higgsfield.conectado()
    return {
        "version": VERSION,
        "proveedores": {
            "seedance": {"listo": ark, "motivo": "Llave lista." if ark else "Falta ARK_API_KEY en el .env."},
            "seedream": {"listo": sdr, "modelo": c.SEEDREAM_MODEL,
                         "motivo": "Llave lista (la misma de Seedance)." if sdr else "Falta ARK_API_KEY en el .env."},
            "openrouter": {"listo": orr, "motivo": "Llave lista. Plan B de Seedance." if orr
                           else "Sin llave. Es opcional: plan B si Seedance directo falla."},
            "openai": {"listo": oai, "motivo": "Llave lista." if oai else "Falta OPENAI_API_KEY en el .env."},
            "ollama": {"listo": bool(modelos_ollama), "modelos": modelos_ollama},
            "higgsfield": {"listo": bool(c.HIGGSFIELD_MCP_URL), "conectado": hf},
        },
        "demo": not (ark or oai or hf or orr),
    }


@manejar_errores
async def salud(request: Request):
    return JSONResponse(await run_in_threadpool(_salud))


@manejar_errores
async def ver_catalogo(request: Request):
    return JSONResponse(catalogo.catalogo_publico())


@manejar_errores
async def ver_costo(request: Request):
    d = await leer_json(request)
    tipo = d.get("tipo")
    if tipo not in catalogo.TIPOS:
        raise ErrorValidacion("Tipo no válido. Usa video, imagen o audio.")
    modelo = catalogo.buscar(str(d.get("modelo") or ""), tipo)
    if modelo is None:
        raise ErrorValidacion(f"Ese modelo no existe para {tipo}.")
    variantes = d.get("variantes") or 1
    if not isinstance(variantes, int) or isinstance(variantes, bool) or not 1 <= variantes <= 4:
        raise ErrorValidacion("Las variantes deben estar entre 1 y 4.")
    duracion = d.get("duracion")
    if duracion is not None and (not isinstance(duracion, (int, float)) or isinstance(duracion, bool)):
        raise ErrorValidacion("La duración debe ser un número.")
    if tipo == "audio" and not modelo.get("gasta_creditos_higgsfield"):
        raise ErrorValidacion("No hay precio para ese modelo.")
    via = trabajos.via_inicial(modelo["proveedor"]) if tipo == "video" else None
    return JSONResponse(catalogo.costo(tipo, modelo["id"], d.get("resolucion"), d.get("formato"),
                                       duracion, variantes, d.get("calidad"), via))


# ---------------------------------------------------------------- generar y subir

@manejar_errores
async def generar(request: Request):
    datos = await leer_json(request)
    spec = trabajos.validar(datos)
    creados = await run_in_threadpool(trabajos.crear, spec)
    return JSONResponse({"trabajos": creados}, status_code=201)


@manejar_errores
async def subir(request: Request):
    largo = request.headers.get("content-length")
    if largo and largo.isdigit() and int(largo) > MAX_SUBIDA + 1024 * 1024:
        return error("El archivo pesa más de 50 MB.", 413)
    try:
        formulario = await request.form(max_files=1, max_fields=10)
    except Exception:
        return error("No pude leer el archivo subido.", 400)
    try:
        archivo = formulario.get("archivo")
        if archivo is None or isinstance(archivo, str) or not getattr(archivo, "filename", None):
            return error("Falta el archivo (campo 'archivo').", 400)
        ext = Path(archivo.filename).suffix.lower()
        tipo = next((t for t, exts in EXTENSIONES.items() if ext in exts), None)
        if tipo is None:
            return error("Solo se aceptan imágenes, videos o audios.", 415)
        mime = (archivo.content_type or "").lower()
        if not mime.startswith(PREFIJO_MIME[tipo]):
            return error("El tipo del archivo no coincide con su extensión.", 415)
        config.cfg.MEDIOS.mkdir(parents=True, exist_ok=True)
        nombre = f"sub_{secrets.token_hex(8)}{'.jpg' if ext == '.jpeg' else ext}"
        destino = config.cfg.MEDIOS / nombre
        total = 0
        with open(destino, "wb") as f:
            while True:
                trozo = await archivo.read(1024 * 1024)
                if not trozo:
                    break
                total += len(trozo)
                if total > MAX_SUBIDA:
                    f.close()
                    destino.unlink(missing_ok=True)
                    return error("El archivo pesa más de 50 MB.", 413)
                f.write(trozo)
        if total == 0:
            destino.unlink(missing_ok=True)
            return error("El archivo está vacío.", 400)
        return JSONResponse({"url": f"/medios/{nombre}", "tipo": tipo})
    finally:
        await formulario.close()


@manejar_errores
async def importar_referencia(request: Request):
    """Trae un medio de un enlace público (p. ej. un ejemplo de Explorar) para usarlo como referencia."""
    d = await leer_json(request)
    try:
        return JSONResponse(await run_in_threadpool(referencias.importar, str(d.get("url") or "")))
    except referencias.ErrorReferencia as e:
        return error(str(e), e.codigo)


# ---------------------------------------------------------------- trabajos

@manejar_errores
async def listar_trabajos(request: Request):
    q = request.query_params
    tipo = q.get("tipo") or None
    if tipo and tipo not in catalogo.TIPOS:
        raise ErrorValidacion("Tipo no válido.")
    estado = q.get("estado") or None
    if estado and estado not in trabajos.ESTADOS:
        raise ErrorValidacion("Estado no válido.")
    try:
        limite = int(q.get("limite") or 60)
    except ValueError:
        raise ErrorValidacion("limite debe ser un número.")
    limite = max(1, min(200, limite))
    favoritos = (q.get("favoritos") or "").lower() in ("1", "true", "si", "sí")
    return JSONResponse(trabajos.listar(tipo, estado, favoritos, limite, q.get("antes") or None))


@manejar_errores
async def ver_trabajo(request: Request):
    t = trabajos.obtener(request.path_params["id"])
    return JSONResponse(t) if t else error("Ese trabajo no existe.", 404)


@manejar_errores
async def favorito(request: Request):
    t = trabajos.alternar_favorito(request.path_params["id"])
    return JSONResponse(t) if t else error("Ese trabajo no existe.", 404)


@manejar_errores
async def borrar_trabajo(request: Request):
    ok = await run_in_threadpool(trabajos.borrar, request.path_params["id"])
    return JSONResponse({"ok": True}) if ok else error("Ese trabajo no existe.", 404)


@manejar_errores
async def repetir(request: Request):
    datos = await leer_json(request, obligatorio=False)
    spec = trabajos.spec_para_repetir(request.path_params["id"], datos.get("confirmar_creditos") is True)
    if spec is None:
        return error("Ese trabajo no existe.", 404)
    creados = await run_in_threadpool(trabajos.crear, spec)
    return JSONResponse({"trabajos": creados}, status_code=201)


# ---------------------------------------------------------------- prompts

@manejar_errores
async def ver_presets(request: Request):
    return JSONResponse(await run_in_threadpool(prompts.presets))


@manejar_errores
async def mejorar(request: Request):
    d = await leer_json(request)
    motor = d.get("motor") or "auto"
    if motor not in ("auto", "ollama", "openai"):
        raise ErrorValidacion("Motor no válido. Usa auto, ollama u openai.")
    texto = d.get("prompt")
    if not isinstance(texto, str) or not texto.strip():
        raise ErrorValidacion("Escribe un prompt para mejorar.")
    tipo = d.get("tipo") or "video"
    if tipo not in ("video", "imagen"):
        raise ErrorValidacion("Tipo no válido. Usa video o imagen.")
    resultado = await run_in_threadpool(prompts.mejorar, texto, tipo, d.get("modelo"), motor,
                                        d.get("ollama_modelo"))
    return JSONResponse(resultado)


def _guardado(fila: dict) -> dict:
    return {"id": fila["id"], "nombre": fila["nombre"], "prompt": fila["prompt"],
            "tipo": fila["tipo"], "creado": fila["creado"]}


@manejar_errores
async def listar_guardados(request: Request):
    filas = [_guardado(f) for f in db.todos("SELECT * FROM prompts_guardados ORDER BY rowid DESC")]
    return JSONResponse({"prompts": filas, "guardados": filas})


@manejar_errores
async def crear_guardado(request: Request):
    d = await leer_json(request)
    texto = d.get("prompt")
    if not isinstance(texto, str) or not texto.strip():
        raise ErrorValidacion("Escribe el prompt que quieres guardar.")
    if len(texto) > 4000:
        raise ErrorValidacion("El prompt es muy largo (máximo 4000 caracteres).")
    nombre = d.get("nombre")
    if not isinstance(nombre, str) or not nombre.strip():
        nombre = " ".join(texto.split()[:6])
    tipo = d.get("tipo") or "video"
    if tipo not in catalogo.TIPOS:
        raise ErrorValidacion("Tipo no válido.")
    pid = "p_" + secrets.token_hex(6)
    db.ejecutar("INSERT INTO prompts_guardados (id, nombre, prompt, tipo, creado) VALUES (?, ?, ?, ?, ?)",
                (pid, nombre.strip()[:80], texto.strip(), tipo, ahora_iso()))
    return JSONResponse(_guardado(db.uno("SELECT * FROM prompts_guardados WHERE id = ?", (pid,))),
                        status_code=201)


@manejar_errores
async def borrar_guardado(request: Request):
    n = db.ejecutar("DELETE FROM prompts_guardados WHERE id = ?", (request.path_params["id"],))
    return JSONResponse({"ok": True}) if n else error("Ese prompt no existe.", 404)


# ---------------------------------------------------------------- Higgsfield y Ollama

@manejar_errores
async def hf_estado(request: Request):
    return JSONResponse(await run_in_threadpool(higgsfield.estado))


async def hf_conectar(request: Request):
    try:
        url = await run_in_threadpool(higgsfield.url_conectar)
    except ErrorProveedor as e:
        if quiere_html(request):
            return pagina("No se pudo conectar", e.mensaje, 502, volver=False)
        return error(e.mensaje, 502)
    return RedirectResponse(url, status_code=302)


async def hf_callback(request: Request):
    q = request.query_params
    if q.get("error"):
        detalle = q.get("error_description") or q.get("error")
        return pagina("Higgsfield no conectó", f"Higgsfield respondió: {detalle}", 400, volver=False)
    try:
        await run_in_threadpool(higgsfield.callback, q.get("code") or "", q.get("state") or "")
    except ErrorProveedor as e:
        return pagina("Higgsfield no conectó", e.mensaje, 400, volver=False)
    return pagina("Higgsfield conectado", "Listo. Ya puedes cerrar esta pestaña o volver a la app.")


@manejar_errores
async def hf_desconectar(request: Request):
    return JSONResponse(await run_in_threadpool(higgsfield.desconectar))


@manejar_errores
async def hf_aprender(request: Request):
    if not higgsfield.conectado():
        return error("Higgsfield no está conectado. Conéctalo primero.", 409)
    return JSONResponse(await run_in_threadpool(higgsfield.aprender))


@manejar_errores
async def hf_galeria(request: Request):
    if not higgsfield.conectado():
        return error("Higgsfield no está conectado. Conéctalo primero.", 409)
    tipo = request.query_params.get("tipo") or None
    if tipo and tipo not in ("video", "image", "imagen"):
        raise ErrorValidacion("Tipo no válido. Usa video o image.")
    datos = await run_in_threadpool(higgsfield.galeria, tipo, request.query_params.get("cursor") or None)
    return JSONResponse(datos)


@manejar_errores
async def hf_presets(request: Request):
    q = request.query_params
    forzar = (q.get("forzar") or "") in ("1", "true")
    try:
        datos = await run_in_threadpool(higgsfield.presets_higgsfield, q.get("fuente") or None, forzar)
    except ErrorProveedor as e:
        return error(e.mensaje, 409 if e.codigo == 409 else 502)
    return JSONResponse(datos)


@manejar_errores
async def hf_recrear(request: Request):
    d = await leer_json(request)
    pid = d.get("preset_id")
    if not isinstance(pid, (str, int)) or isinstance(pid, bool) or not str(pid).strip():
        raise ErrorValidacion("Falta preset_id.")
    datos = await run_in_threadpool(higgsfield.recrear, str(pid))
    return JSONResponse(datos) if datos else error("Ese preset no existe.", 404)


def _ids_y_calidad(d: dict) -> tuple[list[str] | None, str]:
    ids = d.get("ids")
    if ids is not None and (not isinstance(ids, list) or not all(isinstance(i, str) for i in ids)):
        raise ErrorValidacion("ids debe ser una lista de textos.")
    calidad = d.get("calidad") or "low"
    if calidad not in catalogo.PRECIO_IMAGEN:
        raise ErrorValidacion("Calidad no válida. Usa low, medium o high.")
    return (ids or None), calidad


@manejar_errores
async def miniaturas_generar(request: Request):
    ids, calidad = _ids_y_calidad(await leer_json(request, obligatorio=False))
    try:
        codigo, cuerpo = await run_in_threadpool(miniaturas.generar, ids, calidad)
    except ErrorProveedor as e:
        return error(e.mensaje, 409 if e.codigo == 409 else 502)
    return JSONResponse(cuerpo, status_code=codigo)


@manejar_errores
async def miniaturas_costo(request: Request):
    ids, calidad = _ids_y_calidad(await leer_json(request, obligatorio=False))
    return JSONResponse(await run_in_threadpool(miniaturas.costo, ids, calidad))


@manejar_errores
async def miniaturas_estado(request: Request):
    return JSONResponse(miniaturas.estado_lote())


@manejar_errores
async def ollama_modelos(request: Request):
    return JSONResponse({"modelos": await run_in_threadpool(ollama.modelos)})


# ---------------------------------------------------------------- llaves (.env) desde la app

def _origen_local(request: Request) -> bool:
    """Solo la propia app (localhost) puede tocar las llaves: bloquea que otra página web las cambie."""
    origen = request.headers.get("origin") or request.headers.get("referer") or ""
    if not origen:
        return True
    from urllib.parse import urlparse
    return (urlparse(origen).hostname or "") in ("localhost", "127.0.0.1")


@manejar_errores
async def ver_llaves(request: Request):
    return JSONResponse(config.estado_llaves())


@manejar_errores
async def guardar_llaves(request: Request):
    if not _origen_local(request):
        return JSONResponse({"error": "Solo se pueden guardar llaves desde la app en este PC."}, status_code=403)
    d = await leer_json(request)
    try:
        guardadas = await run_in_threadpool(config.guardar_llaves, d)
    except ValueError as e:
        raise ErrorValidacion(str(e))
    return JSONResponse({"ok": True, "guardadas": guardadas, "salud": await run_in_threadpool(_salud)})


# ---------------------------------------------------------------- app

class Estaticos(StaticFiles):
    """StaticFiles que no revienta si la carpeta aún no existe."""

    async def __call__(self, scope, receive, send):
        if self.directory and not Path(self.directory).is_dir():
            respuesta = PlainTextResponse("PonchoStudio: falta la carpeta del frontend (app/static).", 404)
            await respuesta(scope, receive, send)
            return
        await super().__call__(scope, receive, send)


async def http_error(request: Request, exc: HTTPException):
    if request.url.path.startswith("/api"):
        mensajes = {404: "Esa ruta no existe.", 405: "Método no permitido."}
        return error(mensajes.get(exc.status_code, exc.detail or "Error."), exc.status_code)
    return PlainTextResponse(str(exc.detail), status_code=exc.status_code, headers=getattr(exc, "headers", None))


async def error_interno(request: Request, exc: Exception):
    return error("Algo falló en el servidor. Revisa la consola.", 500)


@contextlib.asynccontextmanager
async def ciclo(app):
    config.crear_carpetas(config.cfg)
    db.iniciar()
    trabajos.arrancar()
    try:
        yield
    finally:
        trabajos.detener()


config.crear_carpetas(config.cfg)

rutas = [
    Route("/api/salud", salud, methods=["GET"]),
    Route("/api/catalogo", ver_catalogo, methods=["GET"]),
    Route("/api/costo", ver_costo, methods=["POST"]),
    Route("/api/generar", generar, methods=["POST"]),
    Route("/api/subir", subir, methods=["POST"]),
    Route("/api/referencias/importar", importar_referencia, methods=["POST"]),
    Route("/api/trabajos", listar_trabajos, methods=["GET"]),
    Route("/api/trabajos/{id}", ver_trabajo, methods=["GET"]),
    Route("/api/trabajos/{id}", borrar_trabajo, methods=["DELETE"]),
    Route("/api/trabajos/{id}/favorito", favorito, methods=["POST"]),
    Route("/api/trabajos/{id}/repetir", repetir, methods=["POST"]),
    Route("/api/presets", ver_presets, methods=["GET"]),
    Route("/api/prompts/mejorar", mejorar, methods=["POST"]),
    Route("/api/prompts/guardados", listar_guardados, methods=["GET"]),
    Route("/api/prompts/guardados", crear_guardado, methods=["POST"]),
    Route("/api/prompts/guardados/{id}", borrar_guardado, methods=["DELETE"]),
    Route("/api/higgsfield/estado", hf_estado, methods=["GET"]),
    Route("/api/higgsfield/conectar", hf_conectar, methods=["GET"]),
    Route("/api/higgsfield/callback", hf_callback, methods=["GET"]),
    Route("/api/higgsfield/desconectar", hf_desconectar, methods=["POST"]),
    Route("/api/higgsfield/aprender", hf_aprender, methods=["POST"]),
    Route("/api/higgsfield/galeria", hf_galeria, methods=["GET"]),
    Route("/api/higgsfield/presets", hf_presets, methods=["GET"]),
    Route("/api/higgsfield/recrear", hf_recrear, methods=["POST"]),
    Route("/api/plantillas/miniaturas", miniaturas_generar, methods=["POST"]),
    Route("/api/plantillas/miniaturas/costo", miniaturas_costo, methods=["POST"]),
    Route("/api/plantillas/miniaturas/estado", miniaturas_estado, methods=["GET"]),
    Route("/api/ollama/modelos", ollama_modelos, methods=["GET"]),
    Route("/api/llaves", ver_llaves, methods=["GET"]),
    Route("/api/llaves", guardar_llaves, methods=["POST"]),
    Mount("/medios", app=Estaticos(directory=str(config.cfg.MEDIOS), check_dir=False), name="medios"),
    Mount("/presets/miniaturas", app=Estaticos(directory=str(config.cfg.PRESETS / "miniaturas"), check_dir=False),
          name="miniaturas"),
    Mount("/", app=Estaticos(directory=str(config.cfg.STATIC), html=True, check_dir=False), name="static"),
]

app = Starlette(routes=rutas, lifespan=ciclo,
                exception_handlers={HTTPException: http_error, Exception: error_interno})
