"""OpenRouter: plan B de Seedance (video). API asíncrona documentada, 19 nov 2026:
  POST {base}/videos                 -> 202 {id, polling_url, status}
  GET  {base}/videos/{id}            -> {status, urls?, unsigned_urls?, usage:{cost}, error?}
  GET  {base}/videos/{id}/content?index=0   (con la llave en Authorization)
Estados: pending, in_progress, completed, failed, cancelled, expired.
Doc: openrouter.ai/docs/api/api-reference/video-generation/create-videos
No cambiamos de proveedor a mitad de un trabajo: ver trabajos.py (nunca doble gasto).
"""

from __future__ import annotations

import requests

from app import catalogo, config, referencias
from app.proveedores import ErrorProveedor, seedance

TIEMPO = 30
PREFIJO = "or:"   # prefijo de trabajos.tarea_remota para saber que el trabajo va por OpenRouter

MENSAJES = {
    401: "La llave OPENROUTER_API_KEY no sirve. Revísala en el .env.",
    402: "OpenRouter dice que no hay saldo. Recarga créditos en tu cuenta de OpenRouter.",
    403: "Tu llave de OpenRouter no tiene permiso para generar video.",
    404: "OpenRouter no encontró el modelo o la tarea.",
    413: "OpenRouter dice que el pedido es muy pesado (las fotos de referencia).",
    429: "OpenRouter dice que hay demasiados pedidos. Espera un momento.",
}


def disponible() -> bool:
    return bool(config.cfg.OPENROUTER_API_KEY)


def _cabeceras() -> dict:
    return {"Authorization": f"Bearer {config.cfg.OPENROUTER_API_KEY}", "Content-Type": "application/json"}


def _error_http(resp: requests.Response) -> ErrorProveedor:
    codigo = resp.status_code
    detalle = ""
    try:
        err = (resp.json() or {}).get("error")
        if isinstance(err, dict):
            detalle = str(err.get("message") or "")
    except (ValueError, AttributeError):
        pass
    if codigo >= 500:
        return ErrorProveedor("OpenRouter está fallando. Intenta más tarde.", codigo, reintentable=True)
    base = MENSAJES.get(codigo) or f"Error {codigo} de OpenRouter"
    if codigo in (400, 404) and detalle:
        base = f"{base.rstrip('.')}: {detalle[:160]}"
    elif codigo not in MENSAJES and detalle:
        base = f"{base}: {detalle[:160]}"
    return ErrorProveedor(base if base.endswith(".") else base + ".", codigo, reintentable=codigo == 429)


def _pedir(metodo: str, ruta: str, **kw) -> dict:
    try:
        resp = requests.request(metodo, f"{config.cfg.OPENROUTER_BASE_URL}{ruta}", headers=_cabeceras(),
                                timeout=TIEMPO, **kw)
    except requests.RequestException:
        raise ErrorProveedor("No hay conexión con OpenRouter. Revisa internet.", reintentable=True)
    if resp.status_code >= 400:
        raise _error_http(resp)
    try:
        return resp.json() if resp.content else {}
    except ValueError:
        raise ErrorProveedor("OpenRouter respondió algo que no se entiende.", resp.status_code)


def armar_cuerpo(modelo_id: str, prompt: str, ajustes: dict, entradas: dict) -> dict:
    modelo = catalogo.buscar(modelo_id, "video")
    if not modelo or not modelo.get("_openrouter_id"):
        raise ErrorProveedor("Ese modelo no está disponible en OpenRouter.")
    entradas = entradas or {}
    cuerpo: dict = {
        "model": modelo["_openrouter_id"],
        "prompt": prompt,
        "resolution": ajustes.get("resolucion") or "720p",
        "duration": int(ajustes.get("duracion") or modelo["duracion"]["min"]),
        "generate_audio": bool(ajustes.get("audio", True)),
    }
    cuadros = []
    for clave, tipo in (("primer_cuadro", "first_frame"), ("ultimo_cuadro", "last_frame")):
        if entradas.get(clave):
            cuadros.append({"type": "image_url", "image_url": {"url": seedance.a_url(entradas[clave])},
                            "frame_type": tipo})
    if cuadros:
        cuerpo["frame_images"] = cuadros
    refs = []
    for ref in entradas.get("referencias") or []:
        if not ref:
            continue
        tipo = referencias.tipo_de(ref) or "imagen"
        if tipo == "imagen":
            refs.append({"type": "image_url", "image_url": {"url": seedance.a_url(ref)}})
            continue
        enlace = ref if ref.startswith(("http://", "https://")) else referencias.origen_de(ref)
        if not enlace:
            raise ErrorProveedor("Un video o audio de referencia debe venir de un enlace público.")
        campo = "video_url" if tipo == "video" else "audio_url"
        refs.append({"type": campo, campo: {"url": enlace}})
    if refs:
        cuerpo["input_references"] = refs
    # Con foto de entrada el formato sale de la foto (como en Seedance directo): no mandamos aspect_ratio.
    if not (cuadros and modelo.get("_ratio_adaptativo")):
        cuerpo["aspect_ratio"] = ajustes.get("formato") or "16:9"
    if ajustes.get("semilla") is not None:
        cuerpo["seed"] = int(ajustes["semilla"])
    return cuerpo


def crear(modelo_id: str, prompt: str, ajustes: dict, entradas: dict) -> str:
    """Crea el trabajo y devuelve su id."""
    datos = _pedir("POST", "/videos", json=armar_cuerpo(modelo_id, prompt, ajustes, entradas))
    if not datos.get("id"):
        raise ErrorProveedor("OpenRouter no devolvió el id del trabajo.")
    return datos["id"]


def consultar(tarea_id: str) -> dict:
    """Normaliza: {"estado": queued|running|succeeded|failed|cancelled, "video_url", "con_llave", "costo", "error"}."""
    datos = _pedir("GET", f"/videos/{tarea_id}")
    estado = datos.get("status", "")
    salida = {"estado": {"pending": "queued", "in_progress": "running", "completed": "succeeded",
                         "failed": "failed", "cancelled": "cancelled", "expired": "failed"}.get(estado, "running"),
              "video_url": None, "con_llave": False, "costo": None, "error": None}
    if estado == "completed":
        firmadas = datos.get("urls") or []
        if firmadas:                      # URL firmada: se baja sin llave
            salida["video_url"] = firmadas[0]
        else:                             # si no, el endpoint /content con la llave
            salida["video_url"] = f"{config.cfg.OPENROUTER_BASE_URL}/videos/{tarea_id}/content?index=0"
            salida["con_llave"] = True
        costo = (datos.get("usage") or {}).get("cost")
        salida["costo"] = round(float(costo), 4) if isinstance(costo, (int, float)) else None
    elif estado in ("failed", "expired"):
        msg = datos.get("error") or ("el trabajo venció" if estado == "expired" else "no pudo generar el video")
        salida["error"] = f"OpenRouter falló: {str(msg)[:200]}"
    return salida


def cabeceras_descarga() -> dict:
    return {"Authorization": f"Bearer {config.cfg.OPENROUTER_API_KEY}"}
