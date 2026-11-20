"""Miniaturas de las plantillas locales, generadas con OpenAI (gpt-image).

Se guardan en data/presets/miniaturas/<id>.png (va a git) y se sirven en /presets/miniaturas/.
Lotes de más de 2 corren en segundo plano, máximo 2 imágenes en paralelo.
"""

from __future__ import annotations

import hashlib
import re
import secrets
import shutil
import subprocess
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from app import catalogo, config, prompts
from app.proveedores import ErrorProveedor, openai_img

PARALELO = 2
LIMITE_SINCRONO = 2  # hasta 2 se hacen en la misma petición
LADO_WEBP = 640       # las miniaturas se muestran chicas: 640 px en WebP pesa ~40 KB (el PNG ~1,4 MB)
MINIMO_COMPRIMIR = 300_000  # bytes: solo vale la pena con imágenes reales

_candado = threading.Lock()
_lote: dict = {"trabajo_id": None, "hechas": 0, "total": 0, "costo_usd": 0.0, "fallidas": [], "listo": True}


def carpeta() -> Path:
    return config.cfg.PRESETS / "miniaturas"


def nombre_archivo(plantilla_id: str) -> str:
    """Nombre seguro para el disco (ids raros se vuelven hash)."""
    if re.fullmatch(r"[A-Za-z0-9_-]{1,80}", plantilla_id):
        return f"{plantilla_id}.png"
    return "p_" + hashlib.sha1(plantilla_id.encode("utf-8")).hexdigest()[:16] + ".png"


def url_miniatura(plantilla_id: str) -> str | None:
    """Primero la versión WebP liviana; si no hay, el PNG original."""
    nombre = nombre_archivo(plantilla_id)
    for candidato in (nombre[:-4] + ".webp", nombre):
        if (carpeta() / candidato).is_file():
            return f"/presets/miniaturas/{candidato}"
    return None


def comprimir(png: Path) -> Path:
    """PNG grande -> WebP de 640 px con ffmpeg (si está). Devuelve el archivo que quedó."""
    if not png.is_file() or png.stat().st_size < MINIMO_COMPRIMIR or not shutil.which("ffmpeg"):
        return png
    webp = png.with_suffix(".webp")
    try:
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(png),
                        "-vf", f"scale={LADO_WEBP}:-2", "-quality", "80", str(webp)],
                       check=True, capture_output=True, timeout=60)
    except (OSError, subprocess.SubprocessError):
        webp.unlink(missing_ok=True)
        return png
    if webp.is_file() and webp.stat().st_size > 0:
        png.unlink(missing_ok=True)
        return webp
    return png


def tamano_para(plantilla: dict) -> str:
    """Siempre cuadrada 1024x1024: es la medida que cobra la tarifa más baja (US$0,011 en low).

    Vertical u horizontal cuesta ~US$0,016. Poncho eligió cuadradas (19 nov 2026); la tarjeta recorta al formato.
    """
    return "1024x1024"


def prompt_para(plantilla: dict) -> str:
    base = (plantilla.get("prompt") or plantilla.get("nombre") or "").strip()
    if plantilla.get("categoria") == "video":
        return f"cinematic still frame of: {base}"
    return base


def pendientes(ids: list[str] | None = None) -> tuple[list[dict], list[dict]]:
    """(plantillas a generar, fallidas por id desconocido). Sin ids: las que no tienen miniatura."""
    todas = {p["id"]: p for p in prompts.presets()["plantillas"]}
    if ids:
        validas = [todas[i] for i in dict.fromkeys(ids) if i in todas]
        fallidas = [{"id": i, "error": "Esa plantilla no existe."} for i in dict.fromkeys(ids) if i not in todas]
        return validas, fallidas
    return [p for p in todas.values() if url_miniatura(p["id"]) is None], []


def precio(calidad: str) -> float:
    if calidad not in catalogo.PRECIO_IMAGEN:
        raise ValueError("Calidad no válida. Usa low, medium o high.")
    return catalogo.PRECIO_IMAGEN[calidad]


def costo(ids: list[str] | None = None, calidad: str = "low") -> dict:
    lista, _ = pendientes(ids)
    return {"total": len(lista), "usd": round(len(lista) * precio(calidad), 4)}


def _una(plantilla: dict, calidad: str) -> None:
    nombres = openai_img.generar(prompt_para(plantilla), calidad, tamano_para(plantilla), n=1)
    carpeta().mkdir(parents=True, exist_ok=True)
    origen = config.cfg.MEDIOS / nombres[0]
    destino = carpeta() / nombre_archivo(plantilla["id"])
    origen.replace(destino)
    destino.with_suffix(".webp").unlink(missing_ok=True)  # una regenerada no debe quedar tapada por la vieja
    comprimir(destino)


def _correr(lista: list[dict], calidad: str, estado: dict) -> None:
    unidad = precio(calidad)

    def tarea(p):
        try:
            _una(p, calidad)
            with _candado:
                estado["hechas"] += 1
                estado["costo_usd"] = round(estado["costo_usd"] + unidad, 4)
        except ErrorProveedor as e:
            with _candado:
                estado["fallidas"].append({"id": p["id"], "error": e.mensaje})
        except OSError as e:
            with _candado:
                estado["fallidas"].append({"id": p["id"], "error": f"No pude guardar el archivo: {e}"})

    with ThreadPoolExecutor(max_workers=PARALELO) as grupo:
        list(grupo.map(tarea, lista))
    with _candado:
        estado["listo"] = True


def generar(ids: list[str] | None = None, calidad: str = "low") -> tuple[int, dict]:
    """Devuelve (código HTTP, cuerpo). 200 si se hizo aquí mismo, 202 si va en segundo plano."""
    if not openai_img.disponible():
        raise ErrorProveedor("Falta OPENAI_API_KEY en el .env para generar miniaturas.", 409)
    precio(calidad)
    with _candado:
        if not _lote["listo"]:
            return 202, {"trabajo_id": _lote["trabajo_id"], "nota": "Ya hay un lote en curso."}
    lista, fallidas = pendientes(ids)
    if len(lista) <= LIMITE_SINCRONO:
        estado = {"hechas": 0, "costo_usd": 0.0, "fallidas": list(fallidas), "listo": False}
        _correr(lista, calidad, estado)
        return 200, {"hechas": estado["hechas"], "fallidas": estado["fallidas"], "costo_usd": estado["costo_usd"]}
    with _candado:
        _lote.update(trabajo_id="m_" + secrets.token_hex(6), hechas=0, total=len(lista),
                     costo_usd=0.0, fallidas=list(fallidas), listo=False)
        trabajo_id = _lote["trabajo_id"]
    threading.Thread(target=_correr, args=(lista, calidad, _lote), name="miniaturas", daemon=True).start()
    return 202, {"trabajo_id": trabajo_id}


def estado_lote() -> dict:
    with _candado:
        return {"trabajo_id": _lote["trabajo_id"], "hechas": _lote["hechas"], "total": _lote["total"],
                "costo_usd": _lote["costo_usd"], "fallidas": list(_lote["fallidas"]), "listo": _lote["listo"]}
