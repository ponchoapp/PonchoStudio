"""Cola de trabajos: valida, crea y sigue cada generación en un hilo de fondo.

- Seedance: máximo 3 tareas a la vez en ModelArk; el resto queda en_cola local.
- Plan B de Seedance: OpenRouter (tarea_remota con prefijo "or:"). Solo si Seedance directo no está disponible
  (sin ARK_API_KEY) o RECHAZA la creación con 401/403. Un trabajo que ya recibió id en BytePlus NUNCA pasa a OpenRouter.
- Imágenes: OpenAI (proveedor openai) y Seedream 5.5 (proveedor seedream) corren síncronas en un hilo.
- Se consulta cada 5 s a los proveedores remotos (Seedance y Higgsfield).
- MODO DEMO: si el proveedor no tiene llave, se simula (0→100 en ~6 s) con un PNG violeta.
"""

from __future__ import annotations

import json
import random
import secrets
import shutil
import struct
import subprocess
import threading
import time
import zlib
from datetime import datetime
from pathlib import Path

import requests

from app import catalogo, config, db, prompts, referencias as _refs
from app.proveedores import ErrorProveedor, higgsfield, openai_img, openrouter, seedance, seedream

INTERVALO_REMOTO = 5      # segundos entre consultas a cada tarea remota
TIC = 1                   # el hilo despierta cada segundo (para el demo)
MAX_SEEDANCE = 3          # límite de ModelArk para cuentas individuales
MAX_IMAGEN = 4            # imágenes en paralelo
DURACION_DEMO = 6         # segundos que tarda un trabajo simulado
LIMITE_VIDEO = 2 * 3600   # si pasa esto, se da por fallido
LIMITE_HIGGSFIELD = 30 * 60
MAX_REFERENCIAS = 9
PROVEEDORES_IMAGEN = ("openai", "seedream")   # imágenes síncronas en un hilo
ESTADOS = ("en_cola", "generando", "listo", "fallo", "cancelado")

_candado = threading.RLock()
_en_proceso: set[str] = set()          # trabajos con un hilo propio corriendo
_ultimo_sondeo: dict[str, float] = {}  # id → hora de la última consulta remota
_esperar_hasta: dict[str, float] = {}  # id → no reintentar crear antes de esta hora


class ErrorValidacion(Exception):
    def __init__(self, mensaje: str, codigo: int = 400, extra: dict | None = None):
        super().__init__(mensaje)
        self.mensaje = mensaje
        self.codigo = codigo
        self.extra = extra or {}


def ahora_iso() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def _segundos_desde(iso: str | None) -> float:
    if not iso:
        return 0.0
    try:
        return (datetime.now().astimezone() - datetime.fromisoformat(iso)).total_seconds()
    except ValueError:
        return 0.0


# ---------------------------------------------------------------- validación

def _entero(valor, nombre: str, minimo: int, maximo: int) -> int:
    if isinstance(valor, bool):
        raise ErrorValidacion(f"{nombre} debe ser un número.")
    try:
        numero = float(valor)
    except (TypeError, ValueError):
        raise ErrorValidacion(f"{nombre} debe ser un número.")
    if numero != int(numero):
        raise ErrorValidacion(f"{nombre} debe ser un número entero.")
    numero = int(numero)
    if not minimo <= numero <= maximo:
        raise ErrorValidacion(f"{nombre} debe estar entre {minimo} y {maximo}.")
    return numero


def _ruta_medio(valor, nombre: str) -> str:
    if not isinstance(valor, str) or not valor.strip():
        raise ErrorValidacion(f"{nombre} no es válido.")
    valor = valor.strip()
    if valor.startswith(("http://", "https://")):
        return valor
    if not valor.startswith("/medios/") or "/" in valor[len("/medios/"):] or ".." in valor:
        raise ErrorValidacion(f"{nombre} debe ser un archivo subido (/medios/...).")
    if not (config.cfg.MEDIOS / valor[len("/medios/"):]).is_file():
        raise ErrorValidacion(f"No encuentro el archivo de {nombre}. Súbelo otra vez.")
    return valor


def _por_defecto(opciones: list, preferida: str):
    """La preferida si existe; si no, la primera que no sea "auto"."""
    if not opciones:
        return None
    if preferida in opciones:
        return preferida
    return next((o for o in opciones if o != "auto"), opciones[0])


def validar(datos) -> dict:
    """Revisa el cuerpo de /api/generar y devuelve una especificación limpia."""
    if not isinstance(datos, dict):
        raise ErrorValidacion("El cuerpo debe ser un objeto JSON.")
    tipo = datos.get("tipo")
    if tipo not in catalogo.TIPOS:
        raise ErrorValidacion("Tipo no válido. Usa video, imagen o audio.")
    modelo = catalogo.buscar(str(datos.get("modelo") or ""), tipo)
    if modelo is None:
        raise ErrorValidacion(f"Ese modelo no existe para {tipo}.")
    prompt = datos.get("prompt")
    if not isinstance(prompt, str) or not prompt.strip():
        raise ErrorValidacion("Escribe un prompt.")
    prompt = prompt.strip()
    if len(prompt) > 4000:
        raise ErrorValidacion("El prompt es muy largo (máximo 4000 caracteres).")
    ajustes_in = datos.get("ajustes") or {}
    if not isinstance(ajustes_in, dict):
        raise ErrorValidacion("ajustes debe ser un objeto.")
    ajustes: dict = {}

    if tipo == "video":
        resoluciones = modelo.get("resoluciones") or []
        resolucion = ajustes_in.get("resolucion") or _por_defecto(resoluciones, "720p")
        if resoluciones and resolucion not in resoluciones:
            raise ErrorValidacion(f"{modelo['nombre']} no tiene {resolucion}. Usa {', '.join(resoluciones)}.")
        formato = ajustes_in.get("formato") or _por_defecto(modelo["formatos"], "16:9")
        if formato not in modelo["formatos"]:
            raise ErrorValidacion(f"Formato {formato} no disponible en {modelo['nombre']}.")
        rango = modelo["duracion"]
        duracion = ajustes_in.get("duracion")
        if duracion is None:
            duracion = max(5, rango["min"]) if rango["max"] >= 5 else rango["min"]
        try:
            duracion = _entero(duracion, "La duración", rango["min"], rango["max"])
        except ErrorValidacion:
            raise ErrorValidacion(f"La duración debe estar entre {rango['min']} y {rango['max']} segundos.")
        audio = ajustes_in.get("audio", True)
        ajustes.update(resolucion=resolucion, formato=formato, duracion=duracion,
                       audio=bool(audio) and bool(modelo.get("audio")))
        variantes_max = 4
    elif tipo == "imagen":
        calidades = modelo.get("calidades") or []
        calidad = ajustes_in.get("calidad") or ("medium" if "medium" in calidades else None)
        if calidades and calidad not in calidades:
            raise ErrorValidacion(f"Calidad no válida. Usa {', '.join(calidades)}.")
        formato = ajustes_in.get("formato") or _por_defecto(modelo["formatos"], "1:1")
        if formato not in modelo["formatos"]:
            raise ErrorValidacion(f"Formato {formato} no disponible en {modelo['nombre']}.")
        ajustes.update(calidad=calidad if calidades else None, formato=formato)
        resoluciones = modelo.get("resoluciones") or []
        if resoluciones:  # modelos de Higgsfield: 1k, 2k, 4k...
            resolucion = ajustes_in.get("resolucion") or _por_defecto(resoluciones, "2k")
            if resolucion not in resoluciones:
                raise ErrorValidacion(f"{modelo['nombre']} no tiene {resolucion}. Usa {', '.join(resoluciones)}.")
            ajustes["resolucion"] = resolucion
        variantes_max = modelo.get("variantes_max", 4)
    else:
        rango = modelo.get("duracion")
        duracion = None
        if rango:
            duracion = ajustes_in.get("duracion") or min(max(30, rango["min"]), rango["max"])
            try:
                duracion = _entero(duracion, "La duración", rango["min"], rango["max"])
            except ErrorValidacion:
                raise ErrorValidacion(f"La duración debe estar entre {rango['min']} y {rango['max']} segundos.")
        ajustes.update(duracion=duracion)
        variantes_max = 4

    semilla = ajustes_in.get("semilla")
    ajustes["semilla"] = None if semilla in (None, "") else _entero(semilla, "La semilla", 0, 2**32 - 1)
    ajustes["variantes"] = _entero(ajustes_in.get("variantes") or 1, "Las variantes", 1, variantes_max)

    entradas_in = datos.get("entradas") or {}
    if not isinstance(entradas_in, dict):
        raise ErrorValidacion("entradas debe ser un objeto.")
    permitidas = modelo.get("entradas") or ["texto"]
    entradas = {"primer_cuadro": None, "ultimo_cuadro": None, "referencias": []}
    for clave, etiqueta in (("primer_cuadro", "el primer cuadro"), ("ultimo_cuadro", "el último cuadro")):
        if entradas_in.get(clave):
            if clave not in permitidas:
                raise ErrorValidacion(f"{modelo['nombre']} no acepta {etiqueta}.")
            entradas[clave] = _ruta_medio(entradas_in[clave], etiqueta)
    refs = entradas_in.get("referencias") or []
    if not isinstance(refs, list):
        raise ErrorValidacion("referencias debe ser una lista.")
    refs = [r for r in refs if r]
    if refs:
        if "referencias" not in permitidas:
            raise ErrorValidacion(f"{modelo['nombre']} no acepta referencias.")
        if len(refs) > MAX_REFERENCIAS:
            raise ErrorValidacion(f"Máximo {MAX_REFERENCIAS} referencias.")
        entradas["referencias"] = [_ruta_medio(r, "la referencia") for r in refs]
        if modelo["proveedor"] != "seedance":
            # Solo Seedance recibe video o audio de referencia (los demás reciben imágenes).
            for r in entradas["referencias"]:
                if _refs.tipo_de(r) not in (None, "imagen"):
                    raise ErrorValidacion(f"{modelo['nombre']} solo acepta imágenes como referencia. "
                                          "Usa una imagen (o el primer cuadro del video) o elige Seedance.")

    estilo = datos.get("estilo") or None
    camara = datos.get("camara") or None
    if estilo is not None and prompts.buscar_preset("estilo", str(estilo)) is None:
        raise ErrorValidacion("Ese estilo no existe.")
    if camara is not None and prompts.buscar_preset("camara", str(camara)) is None:
        raise ErrorValidacion("Esa cámara no existe.")

    if modelo.get("gasta_creditos_higgsfield") and datos.get("confirmar_creditos") is not True:
        raise ErrorValidacion(
            f"{modelo['nombre']} va por Higgsfield y gasta créditos de tu cuenta. Confirma para seguir.",
            409, {"creditos": None, "pide_confirmacion": True})

    return {"tipo": tipo, "modelo": modelo["id"], "proveedor": modelo["proveedor"], "prompt": prompt,
            "ajustes": ajustes, "entradas": entradas,
            "estilo": str(estilo) if estilo else None, "camara": str(camara) if camara else None}


# ---------------------------------------------------------------- registro

def _a_trabajo(fila: dict) -> dict:
    return {
        "id": fila["id"], "tipo": fila["tipo"], "modelo": fila["modelo"], "proveedor": fila["proveedor"],
        "prompt": fila["prompt"], "ajustes": json.loads(fila["ajustes"] or "{}"),
        "estado": fila["estado"], "progreso": int(fila["progreso"] or 0),
        "resultado": json.loads(fila["resultado"]) if fila["resultado"] else None,
        "error": fila["error"], "costo_usd": fila["costo_usd"], "creado": fila["creado"],
        "terminado": fila["terminado"], "favorito": bool(fila["favorito"]),
        "demo": bool(fila["demo"]), "nota": fila["nota"],
    }


def _fila(trabajo_id: str) -> dict | None:
    return db.uno("SELECT * FROM trabajos WHERE id = ?", (trabajo_id,))


def _actualizar(trabajo_id: str, **campos) -> None:
    if not campos:
        return
    for clave in ("resultado", "ajustes", "entradas"):
        if clave in campos and not isinstance(campos[clave], (str, type(None))):
            campos[clave] = json.dumps(campos[clave], ensure_ascii=False)
    columnas = ", ".join(f"{c} = ?" for c in campos)
    db.ejecutar(f"UPDATE trabajos SET {columnas} WHERE id = ?", [*campos.values(), trabajo_id])


def _progreso(trabajo_id: str, valor: int) -> None:
    """Solo mueve el progreso si el trabajo sigue generando."""
    db.ejecutar("UPDATE trabajos SET progreso = ? WHERE id = ? AND estado = 'generando'",
                (int(valor), trabajo_id))


def es_demo(proveedor: str) -> tuple[bool, str | None]:
    """¿El proveedor está sin llave? Devuelve (demo, motivo)."""
    if proveedor == "seedance" and not seedance.disponible() and not openrouter.disponible():
        return True, "Modo demo: falta ARK_API_KEY en el .env. Esto es una simulación."
    if proveedor == "seedream" and not seedream.disponible():
        return True, "Modo demo: falta ARK_API_KEY en el .env (Seedream usa la misma de Seedance). Esto es una simulación."
    if proveedor == "openai" and not openai_img.disponible():
        return True, "Modo demo: falta OPENAI_API_KEY en el .env. Esto es una simulación."
    if proveedor == "higgsfield" and not higgsfield.conectado():
        return True, "Modo demo: Higgsfield no está conectado. Esto es una simulación."
    return False, None


NOTA_PLAN_B = "Enviado por OpenRouter (plan B)"


def via_inicial(proveedor: str) -> str | None:
    """"openrouter" si el video irá por OpenRouter desde el principio (no hay llave de BytePlus)."""
    if proveedor == "seedance" and not seedance.disponible() and openrouter.disponible():
        return "openrouter"
    return None


def crear(spec: dict) -> list[dict]:
    """Crea un trabajo por variante y los deja en_cola. El hilo de fondo los arranca."""
    demo, nota = es_demo(spec["proveedor"])
    via = None if demo else via_inicial(spec["proveedor"])
    if via == "openrouter":
        nota = f"{NOTA_PLAN_B}: no hay llave de BytePlus. Se cobra en OpenRouter."
    prompt_final = prompts.aplicar_presets(spec["prompt"], spec.get("estilo"), spec.get("camara"))
    variantes = spec["ajustes"].get("variantes", 1)
    creados = []
    for i in range(variantes):
        ajustes = dict(spec["ajustes"])
        if ajustes.get("semilla") is not None and i > 0:
            ajustes["semilla"] = (ajustes["semilla"] + i) % 2**32
        costo = None
        if demo:
            costo = 0.0
        else:
            try:
                costo = catalogo.costo(spec["tipo"], spec["modelo"], ajustes.get("resolucion"),
                                       ajustes.get("formato"), ajustes.get("duracion"), 1,
                                       ajustes.get("calidad"), via)["usd"]
            except ValueError:
                costo = None
        trabajo_id = "t_" + secrets.token_hex(6)
        db.ejecutar(
            "INSERT INTO trabajos (id, tipo, modelo, proveedor, prompt, prompt_final, ajustes, entradas, "
            "estilo, camara, estado, progreso, costo_usd, creado, demo, nota) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'en_cola', 0, ?, ?, ?, ?)",
            (trabajo_id, spec["tipo"], spec["modelo"], spec["proveedor"], spec["prompt"], prompt_final,
             json.dumps(ajustes, ensure_ascii=False), json.dumps(spec["entradas"], ensure_ascii=False),
             spec.get("estilo"), spec.get("camara"), costo, ahora_iso(), int(demo), nota))
        creados.append(_a_trabajo(_fila(trabajo_id)))
    despertar()
    return creados


def obtener(trabajo_id: str) -> dict | None:
    fila = _fila(trabajo_id)
    return _a_trabajo(fila) if fila else None


def listar(tipo: str | None = None, estado: str | None = None, favoritos: bool = False,
           limite: int = 60, antes: str | None = None) -> dict:
    condiciones, parametros = [], []
    if tipo:
        condiciones.append("tipo = ?")
        parametros.append(tipo)
    if estado:
        condiciones.append("estado = ?")
        parametros.append(estado)
    if favoritos:
        condiciones.append("favorito = 1")
    if antes:
        fila = db.uno("SELECT rowid FROM trabajos WHERE id = ?", (antes,))
        if fila:
            condiciones.append("rowid < ?")
            parametros.append(fila["rowid"])
    donde = ("WHERE " + " AND ".join(condiciones)) if condiciones else ""
    filas = db.todos(f"SELECT * FROM trabajos {donde} ORDER BY rowid DESC LIMIT ?", [*parametros, limite + 1])
    siguiente = filas[limite - 1]["id"] if len(filas) > limite else None
    return {"trabajos": [_a_trabajo(f) for f in filas[:limite]], "siguiente": siguiente}


def alternar_favorito(trabajo_id: str) -> dict | None:
    if db.ejecutar("UPDATE trabajos SET favorito = 1 - favorito WHERE id = ?", (trabajo_id,)) == 0:
        return None
    return obtener(trabajo_id)


def borrar(trabajo_id: str) -> bool:
    """Cancela en el proveedor si aún corre y borra el registro. El archivo queda."""
    fila = _fila(trabajo_id)
    if not fila:
        return False
    if (fila["proveedor"] == "seedance" and fila["tarea_remota"] and not fila["demo"]
            and not fila["tarea_remota"].startswith(openrouter.PREFIJO)
            and fila["estado"] in ("en_cola", "generando")):
        try:
            seedance.cancelar(fila["tarea_remota"])
        except ErrorProveedor:
            pass  # si ya está corriendo, ModelArk no deja cancelar
    db.ejecutar("DELETE FROM trabajos WHERE id = ?", (trabajo_id,))
    with _candado:
        _ultimo_sondeo.pop(trabajo_id, None)
        _esperar_hasta.pop(trabajo_id, None)
    return True


def spec_para_repetir(trabajo_id: str, confirmar_creditos: bool = False) -> dict | None:
    fila = _fila(trabajo_id)
    if not fila:
        return None
    ajustes = json.loads(fila["ajustes"] or "{}")
    ajustes["semilla"] = random.randint(0, 2**31 - 1)  # semilla nueva
    ajustes["variantes"] = 1
    modelo = catalogo.buscar(fila["modelo"]) or {}
    if modelo.get("gasta_creditos_higgsfield") and not confirmar_creditos:
        raise ErrorValidacion(
            f"{modelo.get('nombre', fila['modelo'])} va por Higgsfield y gasta créditos. Confirma para seguir.",
            409, {"creditos": None, "pide_confirmacion": True})
    estilo = fila["estilo"] if prompts.buscar_preset("estilo", fila["estilo"]) else None
    camara = fila["camara"] if prompts.buscar_preset("camara", fila["camara"]) else None
    return {"tipo": fila["tipo"], "modelo": fila["modelo"], "proveedor": fila["proveedor"],
            "prompt": fila["prompt"], "ajustes": ajustes, "entradas": json.loads(fila["entradas"] or "{}"),
            "estilo": estilo, "camara": camara}


# ---------------------------------------------------------------- medios

def png_degradado(ancho: int, alto: int, semilla: int = 0) -> bytes:
    """PNG violeta degradado hecho a mano (zlib + struct), sin dependencias."""
    rnd = random.Random(semilla)
    # Violeta apagado (no neón): a Poncho no le gustan los colores sobresaturados.
    a = (88 + rnd.randint(-12, 12), 66 + rnd.randint(-10, 10), 120 + rnd.randint(-14, 14))
    b = (16 + rnd.randint(0, 8), 14 + rnd.randint(0, 6), 24 + rnd.randint(0, 10))  # casi negro
    filas = bytearray()
    for y in range(alto):
        filas.append(0)  # filtro "ninguno"
        fy = y / max(1, alto - 1)
        fila = bytearray(ancho * 3)
        for x in range(ancho):
            t = 0.6 * (x / max(1, ancho - 1)) + 0.4 * fy
            fila[x * 3] = int(a[0] + (b[0] - a[0]) * t) & 255
            fila[x * 3 + 1] = int(a[1] + (b[1] - a[1]) * t) & 255
            fila[x * 3 + 2] = int(a[2] + (b[2] - a[2]) * t) & 255
        filas += fila

    def bloque(tipo: bytes, datos: bytes) -> bytes:
        return struct.pack(">I", len(datos)) + tipo + datos + struct.pack(">I", zlib.crc32(tipo + datos) & 0xFFFFFFFF)

    cabecera = struct.pack(">IIBBBBB", ancho, alto, 8, 2, 0, 0, 0)
    return (b"\x89PNG\r\n\x1a\n" + bloque(b"IHDR", cabecera)
            + bloque(b"IDAT", zlib.compress(bytes(filas), 6)) + bloque(b"IEND", b""))


def _tamano_demo(formato: str | None) -> tuple[int, int]:
    try:
        w, h = (float(x) for x in (formato or "16:9").split(":"))
    except ValueError:
        w, h = 16.0, 9.0
    lado = 512
    if w >= h:
        return lado, max(1, int(round(lado * h / w)))
    return max(1, int(round(lado * w / h))), lado


def _terminar_demo(fila: dict) -> None:
    ajustes = json.loads(fila["ajustes"] or "{}")
    ancho, alto = _tamano_demo(ajustes.get("formato") or ("1:1" if fila["tipo"] == "audio" else None))
    nombre = f"demo_{fila['id']}.png"
    config.cfg.MEDIOS.mkdir(parents=True, exist_ok=True)
    (config.cfg.MEDIOS / nombre).write_bytes(png_degradado(ancho, alto, hash(fila["id"]) & 0xFFFF))
    url_png = f"/medios/{nombre}"
    if fila["tipo"] == "imagen":
        resultado = {"url": url_png, "miniatura": url_png, "ancho": ancho, "alto": alto}
        nota = (fila["nota"] or "Modo demo.") + " La imagen es de muestra."
    else:
        resultado = {"url": None, "miniatura": url_png, "ancho": ancho, "alto": alto}
        nota = (fila["nota"] or "Modo demo.") + " demo: no se generó un archivo real."
    _actualizar(fila["id"], estado="listo", progreso=100, resultado=resultado,
                terminado=ahora_iso(), nota=nota)


def hay_ffmpeg() -> bool:
    return shutil.which("ffmpeg") is not None


def miniatura(video: Path) -> str | None:
    """Saca un cuadro JPG del video con ffmpeg. None si no hay ffmpeg o falla."""
    if not hay_ffmpeg():
        return None
    salida = video.with_name(video.stem + "_mini.jpg")
    try:
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", "0.3", "-i", str(video),
                        "-frames:v", "1", "-vf", "scale=480:-2", str(salida)],
                       check=True, timeout=60, capture_output=True)
    except (subprocess.SubprocessError, OSError):
        return None
    return f"/medios/{salida.name}" if salida.is_file() else None


def medidas(video: Path) -> tuple[int, int] | None:
    if shutil.which("ffprobe") is None:
        return None
    try:
        r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                            "stream=width,height", "-of", "csv=p=0:s=x", str(video)],
                           capture_output=True, text=True, timeout=30, check=True)
        w, h = r.stdout.strip().split("x")[:2]
        return int(w), int(h)
    except (subprocess.SubprocessError, OSError, ValueError):
        return None


def descargar(url: str, nombre: str, cabeceras: dict | None = None) -> Path:
    destino = config.cfg.MEDIOS / nombre
    temporal = destino.with_suffix(destino.suffix + ".part")
    config.cfg.MEDIOS.mkdir(parents=True, exist_ok=True)
    with requests.get(url, stream=True, timeout=120, headers=cabeceras) as r:
        r.raise_for_status()
        with open(temporal, "wb") as f:
            for trozo in r.iter_content(1024 * 256):
                f.write(trozo)
    temporal.replace(destino)
    return destino


def _extension(url: str, defecto: str) -> str:
    base = url.split("?")[0].rsplit(".", 1)
    ext = base[-1].lower() if len(base) == 2 else ""
    return ext if ext in higgsfield.EXTENSIONES_MEDIO else defecto


def _guardar_remoto(fila: dict, url: str, defecto: str, cabeceras: dict | None = None) -> dict:
    """Descarga el medio remoto (dos intentos). Si falla, deja el enlace remoto."""
    ext = _extension(url, defecto)
    nombre = f"{fila['id']}.{ext}"
    ajustes = json.loads(fila["ajustes"] or "{}")
    for intento in range(2):
        try:
            archivo = descargar(url, nombre, cabeceras)
            break
        except (requests.RequestException, OSError):
            if intento == 1:
                return {"resultado": {"url": url, "miniatura": None, "ancho": None, "alto": None},
                        "nota": "No pude descargar el archivo. El enlace remoto puede vencer en 24 h."}
            time.sleep(2)
    local = f"/medios/{archivo.name}"
    if ext in ("png", "jpg", "jpeg", "webp", "gif"):
        return {"resultado": {"url": local, "miniatura": local, "ancho": None, "alto": None}}
    if ext in ("mp3", "wav", "m4a", "ogg"):
        return {"resultado": {"url": local, "miniatura": None, "ancho": None, "alto": None}}
    px = medidas(archivo)
    if px is None:
        modelo = catalogo.buscar(fila["modelo"], "video") or {}
        px = catalogo.pixeles(modelo, ajustes.get("resolucion", ""), ajustes.get("formato", "")) \
            if modelo.get("_pixeles") else None
    return {"resultado": {"url": local, "miniatura": miniatura(archivo),
                          "ancho": px[0] if px else None, "alto": px[1] if px else None}}


# ---------------------------------------------------------------- trabajo de cada proveedor

def _hilo(trabajo_id: str, funcion) -> None:
    with _candado:
        if trabajo_id in _en_proceso:
            return
        _en_proceso.add(trabajo_id)

    def correr():
        try:
            funcion()
        except Exception as e:  # nunca dejar un trabajo colgado
            _actualizar(trabajo_id, estado="fallo", error=f"Error inesperado: {str(e)[:160]}",
                        terminado=ahora_iso())
        finally:
            with _candado:
                _en_proceso.discard(trabajo_id)

    threading.Thread(target=correr, name=f"trabajo-{trabajo_id}", daemon=True).start()


def _correr_imagen(trabajo_id: str) -> None:
    fila = _fila(trabajo_id)
    if not fila:
        return
    ajustes = json.loads(fila["ajustes"] or "{}")
    entradas = json.loads(fila["entradas"] or "{}")
    prompt = fila["prompt_final"] or fila["prompt"]
    try:
        if fila["proveedor"] == "seedream":
            ancho, alto = catalogo.tamano_seedream(ajustes.get("formato"), ajustes.get("resolucion"))
            nombres = seedream.generar(prompt, ajustes.get("formato") or "1:1", ajustes.get("resolucion") or "2k",
                                       entradas.get("referencias") or [])
        else:
            tamano = catalogo.TAMANOS_IMAGEN.get(ajustes.get("formato"), "1024x1024")
            ancho, alto = (int(x) for x in tamano.split("x"))
            nombres = openai_img.generar(prompt, ajustes.get("calidad") or "medium",
                                         tamano, entradas.get("referencias") or [], n=1)
    except ErrorProveedor as e:
        _actualizar(trabajo_id, estado="fallo", error=e.mensaje, terminado=ahora_iso())
        return
    url = f"/medios/{nombres[0]}"
    _actualizar(trabajo_id, estado="listo", progreso=100, terminado=ahora_iso(),
                resultado={"url": url, "miniatura": url, "ancho": ancho, "alto": alto})


def _correr_higgsfield(trabajo_id: str) -> None:
    fila = _fila(trabajo_id)
    if not fila:
        return
    ajustes = json.loads(fila["ajustes"] or "{}")
    entradas = json.loads(fila["entradas"] or "{}")
    try:
        salida = higgsfield.generar_via_mcp(fila["modelo"], fila["prompt_final"] or fila["prompt"],
                                            ajustes, entradas)
    except ErrorProveedor as e:
        _actualizar(trabajo_id, estado="fallo", error=e.mensaje, terminado=ahora_iso())
        return
    _procesar_higgsfield(trabajo_id, salida)


def _procesar_higgsfield(trabajo_id: str, salida: dict) -> None:
    fila = _fila(trabajo_id)
    if not fila:
        return
    estado = (salida.get("estado") or "").lower()
    defecto = {"video": "mp4", "imagen": "png", "audio": "mp3"}[fila["tipo"]]
    if salida.get("url") and estado not in ("queued", "pending", "running", "in_progress", "processing"):
        guardado = _guardar_remoto(fila, salida["url"], defecto)
        _actualizar(trabajo_id, estado="listo", progreso=100, terminado=ahora_iso(), **guardado)
    elif estado in ("failed", "error", "nsfw", "cancelled", "canceled"):
        _actualizar(trabajo_id, estado="fallo", terminado=ahora_iso(),
                    error=f"Higgsfield no pudo generar ({estado}).")
    elif salida.get("id_remoto"):
        _actualizar(trabajo_id, tarea_remota=salida["id_remoto"])
    else:
        _actualizar(trabajo_id, estado="fallo", terminado=ahora_iso(),
                    error="Higgsfield no devolvió el medio ni un id para seguirlo.")


def _iniciar_openrouter(fila: dict, aviso: str) -> None:
    """Crea el trabajo en OpenRouter. Se llama solo si BytePlus no creó nada (sin llave o rechazo 401/403)."""
    ahora = time.time()
    ajustes = json.loads(fila["ajustes"] or "{}")
    try:
        tarea = openrouter.crear(fila["modelo"], fila["prompt_final"] or fila["prompt"], ajustes,
                                 json.loads(fila["entradas"] or "{}"))
    except ErrorProveedor as e:
        if e.reintentable:
            _esperar_hasta[fila["id"]] = ahora + 20
            _actualizar(fila["id"], nota=f"Esperando turno: {e.mensaje}")
        else:
            _actualizar(fila["id"], estado="fallo", error=e.mensaje, terminado=ahora_iso())
        return
    try:
        costo = catalogo.costo("video", fila["modelo"], ajustes.get("resolucion"), ajustes.get("formato"),
                               ajustes.get("duracion"), 1, None, "openrouter")["usd"]
    except ValueError:
        costo = fila["costo_usd"]
    _actualizar(fila["id"], estado="generando", tarea_remota=openrouter.PREFIJO + tarea, iniciado=ahora_iso(),
                progreso=5, nota=aviso, costo_usd=costo)
    _ultimo_sondeo[fila["id"]] = ahora


def _iniciar_seedance(fila: dict) -> None:
    ahora = time.time()
    if _esperar_hasta.get(fila["id"], 0) > ahora:
        return
    if via_inicial("seedance") == "openrouter":
        _iniciar_openrouter(fila, f"{NOTA_PLAN_B}: no hay llave de BytePlus. Se cobra en OpenRouter.")
        return
    try:
        tarea = seedance.crear(fila["modelo"], fila["prompt_final"] or fila["prompt"],
                               json.loads(fila["ajustes"] or "{}"), json.loads(fila["entradas"] or "{}"))
    except ErrorProveedor as e:
        # Cuenta sin permiso (401/403): BytePlus rechazó la creación, no cobró nada. Solo ahí va el plan B.
        if e.codigo in (401, 403) and openrouter.disponible():
            _iniciar_openrouter(fila, f"{NOTA_PLAN_B}: BytePlus respondió {e.codigo} ({e.mensaje.rstrip('.')}). "
                                      "Se cobra en OpenRouter.")
            return
        if e.reintentable:
            _esperar_hasta[fila["id"]] = ahora + 20
            _actualizar(fila["id"], nota=f"Esperando turno: {e.mensaje}")
        else:
            _actualizar(fila["id"], estado="fallo", error=e.mensaje, terminado=ahora_iso())
        return
    _actualizar(fila["id"], estado="generando", tarea_remota=tarea, iniciado=ahora_iso(),
                progreso=5, nota=None)
    _ultimo_sondeo[fila["id"]] = ahora


def _consultar_seedance(fila: dict) -> None:
    por_or = fila["tarea_remota"].startswith(openrouter.PREFIJO)
    try:
        info = (openrouter.consultar(fila["tarea_remota"][len(openrouter.PREFIJO):]) if por_or
                else seedance.consultar(fila["tarea_remota"]))
    except ErrorProveedor as e:
        if not e.reintentable:
            _actualizar(fila["id"], estado="fallo", error=e.mensaje, terminado=ahora_iso())
        return
    estado = info["estado"]
    if estado in ("queued", "running"):
        ajustes = json.loads(fila["ajustes"] or "{}")
        esperado = 45 + 8 * float(ajustes.get("duracion") or 5)
        progreso = int(min(95, max(5, _segundos_desde(fila["iniciado"]) / esperado * 100)))
        _progreso(fila["id"], progreso)
        if _segundos_desde(fila["iniciado"]) > LIMITE_VIDEO:
            _actualizar(fila["id"], estado="fallo", error="Seedance se demoró demasiado.", terminado=ahora_iso())
    elif estado == "succeeded":
        if not info.get("video_url"):
            _actualizar(fila["id"], estado="fallo", error="Seedance terminó sin enlace de video.",
                        terminado=ahora_iso())
            return
        ajustes = json.loads(fila["ajustes"] or "{}")
        if por_or:
            costo = info.get("costo")   # usage.cost real de OpenRouter, en US$
        else:
            costo = catalogo.costo_real_seedance(fila["modelo"], ajustes.get("resolucion", "720p"), info.get("tokens"))

        def terminar():
            guardado = _guardar_remoto(fila, info["video_url"], "mp4",
                                       openrouter.cabeceras_descarga() if info.get("con_llave") else None)
            campos = dict(estado="listo", progreso=100, terminado=ahora_iso(), **guardado)
            if costo is not None:
                campos["costo_usd"] = costo
            _actualizar(fila["id"], **campos)

        _progreso(fila["id"], 98)
        _hilo(fila["id"], terminar)
    elif estado == "failed":
        _actualizar(fila["id"], estado="fallo", error=info.get("error"), terminado=ahora_iso())
    elif estado == "cancelled":
        _actualizar(fila["id"], estado="cancelado", terminado=ahora_iso())


def _consultar_higgsfield(fila: dict) -> None:
    if _segundos_desde(fila["iniciado"]) > LIMITE_HIGGSFIELD:
        _actualizar(fila["id"], estado="fallo", error="Higgsfield se demoró demasiado.", terminado=ahora_iso())
        return
    try:
        salida = higgsfield.consultar_via_mcp(fila["tarea_remota"])
    except ErrorProveedor:
        return
    if salida is None:
        _actualizar(fila["id"], estado="fallo", terminado=ahora_iso(),
                    error="No encontré cómo consultar el trabajo en Higgsfield. Míralo en tus Assets.")
        return
    progreso = int(min(95, max(5, _segundos_desde(fila["iniciado"]) / 120 * 100)))
    _progreso(fila["id"], progreso)
    if salida.get("url") or (salida.get("estado") or "") in ("failed", "error", "nsfw", "cancelled", "canceled"):
        _hilo(fila["id"], lambda: _procesar_higgsfield(fila["id"], dict(salida, id_remoto=None)))


# ---------------------------------------------------------------- hilo de fondo

def tic() -> None:
    """Una vuelta del gestor. Se puede llamar directo en pruebas."""
    ahora = time.time()
    # Primero la foto de los hilos y luego la consulta: así no se marca como huérfano
    # un trabajo cuyo hilo acaba de terminar.
    with _candado:
        ocupados = set(_en_proceso)
    activos = db.todos("SELECT * FROM trabajos WHERE estado IN ('en_cola', 'generando') ORDER BY rowid")

    seedance_activos = sum(1 for f in activos if f["proveedor"] == "seedance" and not f["demo"]
                           and f["estado"] == "generando")
    imagenes_activas = sum(1 for f in activos if f["proveedor"] in PROVEEDORES_IMAGEN and f["id"] in ocupados)

    for fila in activos:
        tid = fila["id"]
        if tid in ocupados:
            continue
        if fila["demo"]:
            if fila["estado"] == "en_cola":
                _actualizar(tid, estado="generando", iniciado=ahora_iso(), progreso=1)
                continue
            transcurrido = _segundos_desde(fila["iniciado"])
            if transcurrido >= DURACION_DEMO:
                _terminar_demo(fila)
            else:
                _progreso(tid, int(max(1, min(99, transcurrido / DURACION_DEMO * 100))))
            continue

        if fila["proveedor"] == "seedance":
            if fila["estado"] == "en_cola":
                if seedance_activos < MAX_SEEDANCE:
                    _iniciar_seedance(fila)
                    if (_fila(tid) or {}).get("estado") == "generando":
                        seedance_activos += 1
            elif fila["tarea_remota"] and ahora - _ultimo_sondeo.get(tid, 0) >= INTERVALO_REMOTO:
                _ultimo_sondeo[tid] = ahora
                _consultar_seedance(fila)

        elif fila["proveedor"] in PROVEEDORES_IMAGEN:
            if fila["estado"] == "en_cola" and imagenes_activas < MAX_IMAGEN:
                _actualizar(tid, estado="generando", iniciado=ahora_iso(), progreso=3)
                _hilo(tid, lambda t=tid: _correr_imagen(t))
                imagenes_activas += 1
            elif fila["estado"] == "generando":
                # Se reinició la app a mitad de una imagen: no hay cómo retomarla
                _actualizar(tid, estado="fallo", error="Se cerró la app mientras generaba. Repítelo.",
                            terminado=ahora_iso())

        elif fila["proveedor"] == "higgsfield":
            if fila["estado"] == "en_cola":
                _actualizar(tid, estado="generando", iniciado=ahora_iso(), progreso=3)
                _hilo(tid, lambda t=tid: _correr_higgsfield(t))
            elif fila["tarea_remota"]:
                if ahora - _ultimo_sondeo.get(tid, 0) >= INTERVALO_REMOTO:
                    _ultimo_sondeo[tid] = ahora
                    _consultar_higgsfield(fila)
            elif _segundos_desde(fila["iniciado"]) > 30:
                _actualizar(tid, estado="fallo", error="Se cerró la app mientras generaba. Revisa tus Assets de Higgsfield.",
                            terminado=ahora_iso())

    # progreso estimado de imágenes en curso
    for fila in activos:
        if fila["proveedor"] in PROVEEDORES_IMAGEN and fila["id"] in ocupados and not fila["demo"]:
            progreso = int(min(95, max(3, _segundos_desde(fila["iniciado"]) / 45 * 100)))
            _progreso(fila["id"], progreso)


_despertador = threading.Event()
_parar = threading.Event()
_gestor: threading.Thread | None = None


def despertar() -> None:
    _despertador.set()


def _bucle() -> None:
    while not _parar.is_set():
        try:
            tic()
        except Exception:
            pass  # el gestor no se cae nunca; la próxima vuelta reintenta
        _despertador.wait(TIC)
        _despertador.clear()


def arrancar() -> None:
    global _gestor
    if _gestor and _gestor.is_alive():
        return
    _parar.clear()
    _gestor = threading.Thread(target=_bucle, name="gestor-trabajos", daemon=True)
    _gestor.start()


def detener() -> None:
    _parar.set()
    _despertador.set()
    if _gestor:
        _gestor.join(timeout=5)
