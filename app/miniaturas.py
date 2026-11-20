"""Miniaturas de las plantillas locales, generadas con OpenAI (gpt-image).

Se guardan en data/presets/miniaturas/<id>.png (va a git) y se sirven en /presets/miniaturas/.
Lotes de más de 2 corren en segundo plano, máximo 2 imágenes en paralelo.
"""

from __future__ import annotations

import hashlib
import re
import secrets
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from app import catalogo, config, prompts
from app.proveedores import ErrorProveedor, openai_img

PARALELO = 2
LIMITE_SINCRONO = 2  # hasta 2 se hacen en la misma petición

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
    nombre = nombre_archivo(plantilla_id)
    return f"/presets/miniaturas/{nombre}" if (carpeta() / nombre).is_file() else None


def tamano_para(plantilla: dict) -> str:
    """Vertical 1024x1536 o horizontal 1536x1024 según el prompt; si no dice, según la categoría."""
    texto = (plantilla.get("prompt") or "").lower()
    if any(p in texto for p in ("9:16", "vertical", "portrait orientation", "3:4", "2:3")):
        return "1024x1536"
    if any(p in texto for p in ("16:9", "horizontal", "widescreen", "21:9", "landscape", "3:2")):
        return "1536x1024"
    if "1:1" in texto or "square" in texto:
        return "1024x1024"
    return "1536x1024" if plantilla.get("categoria") == "video" else "1024x1536"


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
    origen.replace(carpeta() / nombre_archivo(plantilla["id"]))


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
