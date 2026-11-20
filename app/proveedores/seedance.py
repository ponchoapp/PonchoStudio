"""Seedance por BytePlus ModelArk (API oficial). Crear, consultar y cancelar tareas."""

from __future__ import annotations

import base64
import mimetypes
from pathlib import Path

import requests

from app import catalogo, config
from app import referencias
from app.proveedores import ErrorProveedor

TIEMPO = 30  # segundos por llamada

MENSAJES = {
    400: "ModelArk rechazó el pedido",
    401: "La llave ARK_API_KEY no sirve o venció. Revísala en el .env.",
    403: "Tu cuenta de ModelArk no tiene acceso a este modelo. Actívalo en la consola.",
    404: "ModelArk no encontró el modelo o la tarea.",
    429: "ModelArk dice que hay demasiadas tareas (máximo 3 a la vez) o se acabó la cuota. Espera un momento.",
}


def disponible() -> bool:
    return bool(config.cfg.ARK_API_KEY)


def _cabeceras() -> dict:
    return {"Authorization": f"Bearer {config.cfg.ARK_API_KEY}", "Content-Type": "application/json"}


def _error_http(resp: requests.Response) -> ErrorProveedor:
    codigo = resp.status_code
    detalle = ""
    try:
        cuerpo = resp.json()
        err = cuerpo.get("error") if isinstance(cuerpo, dict) else None
        if isinstance(err, dict):
            detalle = err.get("message") or err.get("code") or ""
        elif isinstance(err, str):
            detalle = err
    except ValueError:
        pass
    if codigo >= 500:
        return ErrorProveedor("ModelArk está fallando. Intenta más tarde.", codigo, reintentable=True)
    base = MENSAJES.get(codigo, f"Error {codigo} de ModelArk")
    if codigo in (400, 404) and detalle:
        base = f"{base}: {str(detalle)[:160]}"
    elif codigo not in MENSAJES and detalle:
        base = f"{base}: {str(detalle)[:160]}"
    return ErrorProveedor(base if base.endswith(".") else base + ".", codigo, reintentable=codigo == 429)


def _pedir(metodo: str, ruta: str, **kw) -> dict:
    url = f"{config.cfg.SEEDANCE_BASE_URL}{ruta}"
    try:
        resp = requests.request(metodo, url, headers=_cabeceras(), timeout=TIEMPO, **kw)
    except requests.RequestException:
        raise ErrorProveedor("No hay conexión con ModelArk. Revisa internet.", reintentable=True)
    if resp.status_code >= 400:
        raise _error_http(resp)
    if not resp.content:
        return {}
    try:
        return resp.json()
    except ValueError:
        raise ErrorProveedor("ModelArk respondió algo que no se entiende.", resp.status_code)


def a_url(ruta: str) -> str:
    """Las rutas locales /medios/x.png se mandan como data URL base64. Las http(s) van tal cual."""
    if ruta.startswith(("http://", "https://", "data:")):
        return ruta
    nombre = Path(ruta).name  # evita salir de la carpeta de medios
    archivo = config.cfg.MEDIOS / nombre
    if not archivo.is_file():
        raise ErrorProveedor(f"No encuentro el archivo {nombre}.")
    mime = mimetypes.guess_type(nombre)[0] or "image/png"
    datos = base64.b64encode(archivo.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{datos}"


def armar_cuerpo(modelo_id: str, prompt: str, ajustes: dict, entradas: dict) -> dict:
    """Arma el JSON de creación según el contrato de ModelArk."""
    modelo = catalogo.buscar(modelo_id, "video")
    if not modelo or modelo["proveedor"] != "seedance":
        raise ErrorProveedor("Modelo de Seedance desconocido.")
    contenido: list[dict] = [{"type": "text", "text": prompt}]
    entradas = entradas or {}
    hay_imagen = False
    for clave, rol in (("primer_cuadro", "first_frame"), ("ultimo_cuadro", "last_frame")):
        if entradas.get(clave):
            contenido.append({"type": "image_url", "image_url": {"url": a_url(entradas[clave])}, "role": rol})
            hay_imagen = True
    for ref in entradas.get("referencias") or []:
        if not ref:
            continue
        tipo = referencias.tipo_de(ref) or "imagen"
        if tipo == "imagen":
            contenido.append({"type": "image_url", "image_url": {"url": a_url(ref)}, "role": "reference_image"})
            hay_imagen = True
            continue
        # Video y audio de referencia van por enlace público (no caben en base64). El enlace es el de origen
        # que guardó /api/referencias/importar. Nombres de rol según el modo omni-reference de Seedance 2.x:
        # falta confirmarlos con una generación real (ver docs/MEMORIA.md).
        enlace = ref if ref.startswith(("http://", "https://")) else referencias.origen_de(ref)
        if not enlace:
            raise ErrorProveedor("Un video o audio de referencia debe venir de un enlace público. "
                                 "Elígelo desde Explorar o usa una imagen.")
        campo = "video_url" if tipo == "video" else "audio_url"
        contenido.append({"type": campo, campo: {"url": enlace}, "role": f"reference_{'video' if tipo == 'video' else 'audio'}"})
    ratio = ajustes.get("formato") or "16:9"
    if hay_imagen and modelo.get("_ratio_adaptativo"):
        ratio = "adaptive"  # Seedance 2.5 con foto de entrada solo acepta adaptive
    cuerpo = {
        "model": modelo["_api_id"],
        "content": contenido,
        "resolution": ajustes.get("resolucion") or "720p",
        "ratio": ratio,
        "duration": int(ajustes.get("duracion") or modelo["duracion"]["min"]),
        "generate_audio": bool(ajustes.get("audio", True)),
        "watermark": False,
    }
    semilla = ajustes.get("semilla")
    if semilla is not None:
        cuerpo["seed"] = int(semilla)
    return cuerpo


def crear(modelo_id: str, prompt: str, ajustes: dict, entradas: dict) -> str:
    """Crea la tarea y devuelve su id."""
    cuerpo = armar_cuerpo(modelo_id, prompt, ajustes, entradas)
    datos = _pedir("POST", "/contents/generations/tasks", json=cuerpo)
    tarea = datos.get("id")
    if not tarea:
        raise ErrorProveedor("ModelArk no devolvió el id de la tarea.")
    return tarea


def consultar(tarea_id: str) -> dict:
    """Devuelve {"estado", "video_url", "tokens", "error"} normalizado."""
    datos = _pedir("GET", f"/contents/generations/tasks/{tarea_id}")
    estado = datos.get("status", "")
    contenido = datos.get("content") or {}
    uso = datos.get("usage") or {}
    error = None
    if estado == "failed":
        err = datos.get("error") or {}
        error = (err.get("message") if isinstance(err, dict) else str(err)) or "Seedance no pudo generar el video."
        error = f"Seedance falló: {str(error)[:200]}"
    return {
        "estado": estado,  # queued / running / succeeded / failed / cancelled
        "video_url": contenido.get("video_url"),
        "tokens": uso.get("completion_tokens"),
        "error": error,
    }


def cancelar(tarea_id: str) -> None:
    """Solo funciona si la tarea sigue en cola en ModelArk."""
    _pedir("DELETE", f"/contents/generations/tasks/{tarea_id}")
