"""Catálogo de modelos, formatos y precios. Fuente única para backend y frontend.

Las llaves que empiezan con "_" son internas y no salen en /api/catalogo.
Precios de Seedance verificados el 5 nov 2026 (ver docs/MEMORIA.md).
"""

from __future__ import annotations

import copy
import json

from app import config

FORMATOS_VIDEO = ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"]

# Píxeles reales por resolución y formato (serie 2.5)
PIXELES = {
    "480p": {"16:9": (854, 480), "4:3": (752, 560), "1:1": (640, 640),
             "3:4": (560, 752), "9:16": (480, 854), "21:9": (992, 432)},
    "720p": {"16:9": (1280, 720), "4:3": (1112, 834), "1:1": (960, 960),
             "3:4": (834, 1112), "9:16": (720, 1280), "21:9": (1470, 630)},
    "1080p": {"16:9": (1920, 1080), "4:3": (1664, 1248), "1:1": (1440, 1440),
              "3:4": (1248, 1664), "9:16": (1080, 1920), "21:9": (2206, 946)},
}

# La serie 2.0 cambia dos tamaños en 480p
PIXELES_20 = copy.deepcopy(PIXELES)
PIXELES_20["480p"]["16:9"] = (864, 496)
PIXELES_20["480p"]["9:16"] = (496, 864)

NOTA_HIGGSFIELD = "Va por Higgsfield MCP y gasta créditos de tu cuenta. Pide confirmación."

VIDEO = [
    {
        "id": "seedance-2.5", "nombre": "Seedance 2.5", "proveedor": "seedance",
        "etiqueta": "Directo · barato",
        "resoluciones": ["480p", "720p", "1080p"], "formatos": FORMATOS_VIDEO,
        "duracion": {"min": 4, "max": 30}, "audio": True,
        "entradas": ["texto", "primer_cuadro", "ultimo_cuadro", "referencias"],
        "gasta_creditos_higgsfield": False,
        "nota": "API oficial de BytePlus ModelArk. Con foto de entrada el formato sale de la foto.",
        "_api_id": "dreamina-seedance-2-5-260628",
        "_tarifa": {"480p": 10.7, "720p": 10.7, "1080p": 11.7},
        "_pixeles": PIXELES,
        "_ratio_adaptativo": True,
    },
    {
        "id": "seedance-2.0", "nombre": "Seedance 2.0", "proveedor": "seedance",
        "etiqueta": "Directo · más barato",
        "resoluciones": ["480p", "720p", "1080p"], "formatos": FORMATOS_VIDEO,
        "duracion": {"min": 4, "max": 15}, "audio": True,
        "entradas": ["texto", "primer_cuadro", "ultimo_cuadro", "referencias"],
        "gasta_creditos_higgsfield": False,
        "nota": "Generación anterior. Hasta 15 s.",
        "_api_id": "dreamina-seedance-2-0-260128",
        "_tarifa": {"480p": 7.0, "720p": 7.0, "1080p": 7.7},
        "_pixeles": PIXELES_20,
        "_ratio_adaptativo": False,
    },
    {
        "id": "seedance-2.0-fast", "nombre": "Seedance 2.0 Fast", "proveedor": "seedance",
        "etiqueta": "Directo · rápido",
        "resoluciones": ["480p", "720p"], "formatos": FORMATOS_VIDEO,
        "duracion": {"min": 4, "max": 15}, "audio": True,
        "entradas": ["texto", "primer_cuadro", "ultimo_cuadro", "referencias"],
        "gasta_creditos_higgsfield": False,
        "nota": "El más barato y rápido. Máximo 720p.",
        "_api_id": "dreamina-seedance-2-0-fast-260128",
        "_tarifa": {"480p": 5.6, "720p": 5.6},
        "_pixeles": PIXELES_20,
        "_ratio_adaptativo": False,
    },
]

TAMANOS_IMAGEN = {"1:1": "1024x1024", "2:3": "1024x1536", "3:2": "1536x1024"}
PRECIO_IMAGEN = {"low": 0.011, "medium": 0.042, "high": 0.167}  # estimado por imagen

IMAGEN = [
    {
        "id": "gpt-image-2", "nombre": "GPT Image 2", "proveedor": "openai",
        "etiqueta": "OpenAI · directo",
        "calidades": ["low", "medium", "high"], "formatos": ["1:1", "2:3", "3:2"],
        "variantes_max": 4, "entradas": ["texto", "referencias"],
        "gasta_creditos_higgsfield": False,
        "nota": "Precio estimado por imagen. Sin fondo transparente: pide fondo blanco liso.",
    },
]

AUDIO: list[dict] = []  # por ahora solo hay audio vía Higgsfield

# Modelos propios (directos). Los de Higgsfield se cargan del catálogo real.
TIPOS = {"video": VIDEO, "imagen": IMAGEN, "audio": AUDIO}

PREFIJO_HF = "hf:"
ARCHIVO_HF = "higgsfield_catalogo.json"
_cache_hf: dict = {"clave": None, "modelos": {"video": [], "imagen": [], "audio": []}}


def _modelo_hf(m: dict) -> dict | None:
    """Convierte un modelo del catálogo real de Higgsfield al formato de la app."""
    real = m.get("id")
    tipo = m.get("tipo")
    if not isinstance(real, str) or not real or tipo not in TIPOS:
        return None
    base = {
        "id": PREFIJO_HF + real, "nombre": m.get("nombre") or real, "proveedor": "higgsfield",
        "etiqueta": "Higgsfield · créditos",
        "gasta_creditos_higgsfield": True, "nota": NOTA_HIGGSFIELD,
        "descripcion": m.get("descripcion") or "",
        "_hf_id": real,
    }
    resoluciones = [str(r) for r in m.get("resoluciones") or []]
    formatos = [str(f) for f in m.get("formatos") or []]
    duracion = m.get("duracion") if isinstance(m.get("duracion"), dict) else None
    if tipo == "video":
        base.update(resoluciones=resoluciones, formatos=formatos or ["16:9"],
                    duracion=duracion or {"min": 4, "max": 15}, audio=bool(m.get("audio")),
                    entradas=["texto", "primer_cuadro", "ultimo_cuadro", "referencias"])
    elif tipo == "imagen":
        base.update(calidades=[], resoluciones=resoluciones, formatos=formatos or ["1:1"],
                    variantes_max=4, entradas=["texto", "referencias"])
    else:
        base.update(duracion=duracion, entradas=["texto"])
    return base


def modelos_higgsfield() -> dict:
    """Lee data/presets/higgsfield_catalogo.json (cacheado por fecha). Si falta: listas vacías."""
    ruta = config.cfg.PRESETS / ARCHIVO_HF
    try:
        clave = (str(ruta), ruta.stat().st_mtime_ns)
    except OSError:
        return {"video": [], "imagen": [], "audio": []}
    if _cache_hf["clave"] == clave:
        return _cache_hf["modelos"]
    salida = {"video": [], "imagen": [], "audio": []}
    try:
        datos = json.loads(ruta.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        datos = {}
    lista = datos.get("modelos") if isinstance(datos, dict) else datos
    for m in lista if isinstance(lista, list) else []:
        modelo = _modelo_hf(m) if isinstance(m, dict) else None
        if modelo and not any(x["id"] == modelo["id"] for x in salida[m["tipo"]]):
            salida[m["tipo"]].append(modelo)
    _cache_hf.update(clave=clave, modelos=salida)
    return salida


def listas() -> dict:
    """Todos los modelos por tipo: directos primero, luego Higgsfield."""
    hf = modelos_higgsfield()
    return {tipo: lista + hf.get(tipo, []) for tipo, lista in TIPOS.items()}


def _publico(modelo: dict) -> dict:
    return {k: copy.deepcopy(v) for k, v in modelo.items() if not k.startswith("_")}


def catalogo_publico() -> dict:
    return {tipo: [_publico(m) for m in lista] for tipo, lista in listas().items()}


def buscar(modelo_id: str, tipo: str | None = None) -> dict | None:
    """Devuelve el modelo (con llaves internas) o None."""
    for t, lista in listas().items():
        if tipo and t != tipo:
            continue
        for m in lista:
            if m["id"] == modelo_id:
                return m
    return None


def tipo_de(modelo_id: str) -> str | None:
    for t, lista in listas().items():
        if any(m["id"] == modelo_id for m in lista):
            return t
    return None


def pixeles(modelo: dict, resolucion: str, formato: str) -> tuple[int, int] | None:
    tabla = modelo.get("_pixeles") or PIXELES
    return tabla.get(resolucion, {}).get(formato)


def tokens_video(ancho: int, alto: int, segundos: float) -> float:
    """Tokens que cobra ModelArk: ancho × alto × 24 cuadros × segundos / 1024."""
    return ancho * alto * 24 * segundos / 1024


def costo(tipo: str, modelo_id: str, resolucion: str | None = None, formato: str | None = None,
          duracion: float | None = None, variantes: int = 1, calidad: str | None = None) -> dict:
    """Costo estimado. Devuelve {"usd", "detalle"} o {"usd": None, "creditos", "detalle"}."""
    modelo = buscar(modelo_id, tipo)
    if modelo is None:
        raise ValueError("Ese modelo no existe en el catálogo.")
    variantes = max(1, int(variantes or 1))
    if modelo.get("gasta_creditos_higgsfield"):
        return {"usd": None, "creditos": None,
                "detalle": "Higgsfield cobra en créditos. El costo exacto aún no se conoce."}
    if tipo == "video":
        resolucion = resolucion or "720p"
        formato = formato or "16:9"
        if resolucion not in modelo["_tarifa"]:
            raise ValueError(f"{modelo['nombre']} no tiene {resolucion}.")
        px = pixeles(modelo, resolucion, formato)
        if px is None:
            raise ValueError(f"Formato {formato} no disponible.")
        segundos = float(duracion or modelo["duracion"]["min"])
        tarifa = modelo["_tarifa"][resolucion]
        tokens = tokens_video(px[0], px[1], segundos)
        usd = tokens / 1_000_000 * tarifa * variantes
        detalle = (f"tokens {tokens:,.0f} × US${tarifa}/millón ({px[0]}x{px[1]}, {segundos:g} s)"
                   + (f" × {variantes} variantes" if variantes > 1 else ""))
        return {"usd": round(usd, 4), "detalle": detalle}
    if tipo == "imagen":
        calidad = calidad or "medium"
        if calidad not in PRECIO_IMAGEN:
            raise ValueError("Calidad no válida.")
        precio = PRECIO_IMAGEN[calidad]
        usd = precio * variantes
        return {"usd": round(usd, 4),
                "detalle": f"estimado: US${precio} por imagen ({calidad}) × {variantes}"}
    raise ValueError("Tipo no válido.")


def costo_real_seedance(modelo_id: str, resolucion: str, tokens: float) -> float | None:
    """Costo real con usage.completion_tokens que devuelve ModelArk."""
    modelo = buscar(modelo_id, "video")
    if not modelo or "_tarifa" not in modelo or not tokens:
        return None
    tarifa = modelo["_tarifa"].get(resolucion) or max(modelo["_tarifa"].values())
    return round(float(tokens) / 1_000_000 * tarifa, 4)
