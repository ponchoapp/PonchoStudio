"""Cliente MCP de Higgsfield: HTTP streamable (JSON-RPC 2.0) + OAuth 2.1 con PKCE.

Regla de oro: generar por MCP gasta créditos. Aquí solo se genera con generar_via_mcp,
y el backend solo lo llama si el usuario confirmó (confirmar_creditos=true).
aprender() solo llama herramientas de lectura.
"""

from __future__ import annotations

import base64
import hashlib
import json
import re
import secrets
import threading
import time
from pathlib import Path
from urllib.parse import urlencode, urlparse

import requests

from app import VERSION, catalogo, config
from app.proveedores import ErrorProveedor

PROTOCOLO = "2025-06-18"
TIEMPO = 60
TIEMPO_CORTO = 15

PALABRAS_LECTURA = ("list", "get", "history", "balance", "models", "search", "show")
PALABRAS_ESCRITURA = ("execute", "apply", "generate", "create", "delete", "remove", "update", "upload", "edit",
                      "cancel", "submit", "run", "start", "buy", "purchase", "write", "set_", "post")
EXTENSIONES_MEDIO = ("mp4", "mov", "webm", "png", "jpg", "jpeg", "webp", "gif", "mp3", "wav", "m4a", "ogg")

_candado = threading.RLock()
_sesion: dict = {"id": None, "lista": False}
_cache: dict = {"herramientas": None, "hora": 0.0, "estado": None, "hora_estado": 0.0}
_pendientes: dict[str, dict] = {}  # state → datos PKCE mientras el usuario hace login


class NoAutorizado(Exception):
    pass


class SesionVencida(Exception):
    pass


# ---------------------------------------------------------------- token en disco

def _ruta_token() -> Path:
    return config.cfg.TOKEN_HIGGSFIELD


def _leer_token() -> dict | None:
    ruta = _ruta_token()
    if not ruta.is_file():
        return None
    try:
        datos = json.loads(ruta.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return None
    if not isinstance(datos, dict) or not (datos.get("token") or {}).get("access_token"):
        return None
    return datos


def _guardar_token(datos: dict) -> None:
    ruta = _ruta_token()
    ruta.parent.mkdir(parents=True, exist_ok=True)
    temporal = ruta.with_suffix(".tmp")
    temporal.write_text(json.dumps(datos, indent=2), encoding="utf-8")
    temporal.replace(ruta)


def _reiniciar_sesion() -> None:
    with _candado:
        _sesion["id"] = None
        _sesion["lista"] = False
        _cache.update({"herramientas": None, "hora": 0.0, "estado": None, "hora_estado": 0.0})


def conectado() -> bool:
    return _leer_token() is not None


# ---------------------------------------------------------------- OAuth

def _origen(url: str) -> tuple[str, str]:
    p = urlparse(url)
    return f"{p.scheme}://{p.netloc}", p.path.rstrip("/")


def _get_json(url: str) -> dict | None:
    try:
        r = requests.get(url, timeout=TIEMPO_CORTO, headers={"Accept": "application/json"})
        if r.status_code == 200:
            datos = r.json()
            return datos if isinstance(datos, dict) else None
    except (requests.RequestException, ValueError):
        pass
    return None


def _metadatos_recurso_desde_401() -> str | None:
    """Pega al MCP sin token y lee resource_metadata de WWW-Authenticate."""
    try:
        r = requests.post(config.cfg.HIGGSFIELD_MCP_URL, timeout=TIEMPO_CORTO,
                          headers={"Content-Type": "application/json",
                                   "Accept": "application/json, text/event-stream"},
                          json={"jsonrpc": "2.0", "id": 0, "method": "ping"})
    except requests.RequestException:
        return None
    cabecera = r.headers.get("WWW-Authenticate", "")
    m = re.search(r'resource_metadata="?([^",\s]+)"?', cabecera)
    return m.group(1) if m else None


def descubrir() -> dict:
    """Encuentra los endpoints OAuth del servidor de autorización de Higgsfield."""
    recurso = config.cfg.HIGGSFIELD_MCP_URL
    origen, ruta = _origen(recurso)
    meta_recurso = None
    candidatos = [f"{origen}/.well-known/oauth-protected-resource{ruta}",
                  f"{origen}/.well-known/oauth-protected-resource"]
    for url in candidatos:
        meta_recurso = _get_json(url)
        if meta_recurso and meta_recurso.get("authorization_servers"):
            break
        meta_recurso = None
    if meta_recurso is None:
        desde_401 = _metadatos_recurso_desde_401()
        if desde_401:
            meta_recurso = _get_json(desde_401)
    servidor = origen
    alcances = None
    if meta_recurso:
        servidores = meta_recurso.get("authorization_servers") or []
        if servidores:
            servidor = servidores[0].rstrip("/")
        alcances = meta_recurso.get("scopes_supported")
    as_origen, as_ruta = _origen(servidor)
    meta_as = None
    for url in (f"{as_origen}/.well-known/oauth-authorization-server{as_ruta}",
                f"{as_origen}/.well-known/oauth-authorization-server",
                f"{as_origen}/.well-known/openid-configuration{as_ruta}",
                f"{servidor}/.well-known/openid-configuration"):
        meta_as = _get_json(url)
        if meta_as and meta_as.get("authorization_endpoint") and meta_as.get("token_endpoint"):
            break
        meta_as = None
    if meta_as is None:
        # Respaldo que define MCP cuando no hay metadatos
        meta_as = {"authorization_endpoint": f"{as_origen}/authorize",
                   "token_endpoint": f"{as_origen}/token",
                   "registration_endpoint": f"{as_origen}/register"}
    return {
        "authorization_endpoint": meta_as["authorization_endpoint"],
        "token_endpoint": meta_as["token_endpoint"],
        "registration_endpoint": meta_as.get("registration_endpoint"),
        "alcances": alcances or meta_as.get("scopes_supported"),
        "recurso": recurso,
    }


def _registrar_cliente(servidor: dict) -> dict:
    if not servidor.get("registration_endpoint"):
        raise ErrorProveedor("Higgsfield no permite registrar la app automáticamente.")
    cuerpo = {
        "client_name": "PonchoStudio",
        "redirect_uris": [config.cfg.redirect_higgsfield],
        "grant_types": ["authorization_code", "refresh_token"],
        "response_types": ["code"],
        "token_endpoint_auth_method": "none",
    }
    try:
        r = requests.post(servidor["registration_endpoint"], json=cuerpo, timeout=TIEMPO_CORTO)
    except requests.RequestException:
        raise ErrorProveedor("No pude hablar con Higgsfield para registrar la app.", reintentable=True)
    if r.status_code >= 400:
        raise ErrorProveedor(f"Higgsfield no aceptó el registro de la app (error {r.status_code}).", r.status_code)
    datos = r.json()
    if not datos.get("client_id"):
        raise ErrorProveedor("Higgsfield no devolvió client_id.")
    return {k: datos[k] for k in ("client_id", "client_secret") if datos.get(k)}


def _pkce() -> tuple[str, str]:
    verificador = base64.urlsafe_b64encode(secrets.token_bytes(32)).rstrip(b"=").decode("ascii")
    reto = base64.urlsafe_b64encode(hashlib.sha256(verificador.encode("ascii")).digest()).rstrip(b"=").decode("ascii")
    return verificador, reto


def url_conectar() -> str:
    """Prepara PKCE y devuelve la URL de login de Higgsfield."""
    servidor = descubrir()
    cliente = _registrar_cliente(servidor)
    verificador, reto = _pkce()
    estado = secrets.token_urlsafe(24)
    ahora = time.time()
    with _candado:
        for clave in [k for k, v in _pendientes.items() if ahora - v["creado"] > 900]:
            _pendientes.pop(clave, None)
        _pendientes[estado] = {"verificador": verificador, "servidor": servidor,
                               "cliente": cliente, "creado": ahora}
    parametros = {
        "response_type": "code",
        "client_id": cliente["client_id"],
        "redirect_uri": config.cfg.redirect_higgsfield,
        "code_challenge": reto,
        "code_challenge_method": "S256",
        "state": estado,
        "resource": servidor["recurso"],
    }
    if servidor.get("alcances"):
        parametros["scope"] = " ".join(servidor["alcances"])
    separador = "&" if "?" in servidor["authorization_endpoint"] else "?"
    return servidor["authorization_endpoint"] + separador + urlencode(parametros)


def _pedir_token(servidor: dict, cliente: dict, datos: dict) -> dict:
    datos = dict(datos, client_id=cliente["client_id"], resource=servidor["recurso"])
    if cliente.get("client_secret"):
        datos["client_secret"] = cliente["client_secret"]
    try:
        r = requests.post(servidor["token_endpoint"], data=datos, timeout=TIEMPO_CORTO,
                          headers={"Accept": "application/json"})
    except requests.RequestException:
        raise ErrorProveedor("No pude hablar con Higgsfield para pedir el token.", reintentable=True)
    if r.status_code >= 400:
        raise ErrorProveedor(f"Higgsfield no entregó el token (error {r.status_code}).", r.status_code)
    token = r.json()
    if not token.get("access_token"):
        raise ErrorProveedor("Higgsfield no devolvió access_token.")
    if token.get("expires_in"):
        token["expira"] = time.time() + float(token["expires_in"])
    return token


def callback(code: str, state: str) -> dict:
    """Cambia el código por el token y lo guarda en data/higgsfield_token.json."""
    with _candado:
        pendiente = _pendientes.pop(state or "", None)
    if not pendiente:
        raise ErrorProveedor("El enlace de conexión venció o no es válido. Vuelve a conectar.")
    if not code:
        raise ErrorProveedor("Higgsfield no envió el código de acceso.")
    token = _pedir_token(pendiente["servidor"], pendiente["cliente"], {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": config.cfg.redirect_higgsfield,
        "code_verifier": pendiente["verificador"],
    })
    _guardar_token({"servidor": pendiente["servidor"], "cliente": pendiente["cliente"], "token": token,
                    "conectado_en": time.strftime("%Y-%m-%dT%H:%M:%S")})
    _reiniciar_sesion()
    return {"ok": True}


def _refrescar(datos: dict) -> dict | None:
    refresco = (datos.get("token") or {}).get("refresh_token")
    if not refresco:
        return None
    try:
        nuevo = _pedir_token(datos["servidor"], datos["cliente"],
                             {"grant_type": "refresh_token", "refresh_token": refresco})
    except ErrorProveedor:
        return None
    if not nuevo.get("refresh_token"):
        nuevo["refresh_token"] = refresco
    datos["token"] = nuevo
    _guardar_token(datos)
    return datos


def _token_vigente(forzar_refresco: bool = False) -> str:
    datos = _leer_token()
    if not datos:
        raise ErrorProveedor("Higgsfield no está conectado. Usa el botón Conectar Higgsfield.")
    expira = datos["token"].get("expira")
    if forzar_refresco or (expira and expira - 60 < time.time()):
        nuevos = _refrescar(datos)
        if nuevos is None:
            if forzar_refresco or (expira and expira < time.time()):
                desconectar()
                raise ErrorProveedor("La sesión de Higgsfield venció. Vuelve a conectar.")
        else:
            datos = nuevos
    return datos["token"]["access_token"]


def desconectar() -> dict:
    ruta = _ruta_token()
    if ruta.exists():
        ruta.unlink()
    _reiniciar_sesion()
    return {"ok": True}


# ---------------------------------------------------------------- MCP (HTTP streamable)

def _leer_sse(resp: requests.Response, id_esperado) -> dict:
    """Lee eventos SSE hasta encontrar la respuesta JSON-RPC con nuestro id."""
    resp.encoding = "utf-8"
    datos: list[str] = []
    try:
        for linea in resp.iter_lines(decode_unicode=True):
            if linea is None:
                continue
            if linea == "":
                if datos:
                    texto = "\n".join(datos)
                    datos = []
                    try:
                        mensaje = json.loads(texto)
                    except ValueError:
                        continue
                    for m in (mensaje if isinstance(mensaje, list) else [mensaje]):
                        if isinstance(m, dict) and m.get("id") == id_esperado and ("result" in m or "error" in m):
                            return m
                continue
            if linea.startswith("data:"):
                datos.append(linea[5:].lstrip(" "))
        if datos:  # último evento sin línea en blanco
            mensaje = json.loads("\n".join(datos))
            for m in (mensaje if isinstance(mensaje, list) else [mensaje]):
                if isinstance(m, dict) and m.get("id") == id_esperado:
                    return m
    finally:
        resp.close()
    raise ErrorProveedor("Higgsfield cerró la conexión sin responder.")


def _post(mensaje: dict, token: str) -> dict | None:
    cabeceras = {"Content-Type": "application/json",
                 "Accept": "application/json, text/event-stream",
                 "Authorization": f"Bearer {token}"}
    if _sesion["id"]:
        cabeceras["Mcp-Session-Id"] = _sesion["id"]
    if _sesion["lista"]:
        cabeceras["MCP-Protocol-Version"] = PROTOCOLO
    try:
        resp = requests.post(config.cfg.HIGGSFIELD_MCP_URL, json=mensaje, headers=cabeceras,
                             timeout=TIEMPO, stream=True)
    except requests.RequestException:
        raise ErrorProveedor("No hay conexión con Higgsfield.", reintentable=True)
    sesion = resp.headers.get("Mcp-Session-Id")
    if sesion:
        _sesion["id"] = sesion
    if resp.status_code == 401:
        resp.close()
        raise NoAutorizado()
    if resp.status_code == 404 and cabeceras.get("Mcp-Session-Id"):
        resp.close()
        raise SesionVencida()
    if resp.status_code >= 400:
        resp.close()
        raise ErrorProveedor(f"Higgsfield respondió error {resp.status_code}.", resp.status_code,
                             reintentable=resp.status_code >= 500)
    if "id" not in mensaje:  # notificación: no hay respuesta
        resp.close()
        return None
    tipo = resp.headers.get("Content-Type", "")
    if "text/event-stream" in tipo:
        return _leer_sse(resp, mensaje["id"])
    try:
        datos = json.loads(resp.content.decode("utf-8"))
    except ValueError:
        raise ErrorProveedor("Higgsfield respondió algo que no se entiende.")
    finally:
        resp.close()
    if isinstance(datos, list):
        datos = next((d for d in datos if isinstance(d, dict) and d.get("id") == mensaje["id"]), None)
    if not isinstance(datos, dict):
        raise ErrorProveedor("Higgsfield respondió algo que no se entiende.")
    return datos


def _iniciar(token: str) -> None:
    _sesion["id"] = None
    _sesion["lista"] = False
    respuesta = _post({"jsonrpc": "2.0", "id": secrets.randbelow(10**9), "method": "initialize",
                       "params": {"protocolVersion": PROTOCOLO, "capabilities": {},
                                  "clientInfo": {"name": "PonchoStudio", "version": VERSION}}}, token)
    if respuesta and "error" in respuesta:
        raise ErrorProveedor("Higgsfield no aceptó iniciar la sesión MCP.")
    _sesion["lista"] = True
    _post({"jsonrpc": "2.0", "method": "notifications/initialized"}, token)


def _rpc(metodo: str, parametros: dict | None = None) -> dict:
    """Llama un método JSON-RPC con reintentos de token y sesión."""
    with _candado:
        token = _token_vigente()
        for intento in range(3):
            try:
                if not _sesion["lista"]:
                    _iniciar(token)
                mensaje = {"jsonrpc": "2.0", "id": secrets.randbelow(10**9), "method": metodo}
                if parametros is not None:
                    mensaje["params"] = parametros
                respuesta = _post(mensaje, token)
                break
            except NoAutorizado:
                if intento >= 1:
                    desconectar()
                    raise ErrorProveedor("Higgsfield pidió volver a conectar la cuenta.")
                token = _token_vigente(forzar_refresco=True)
                _sesion["lista"] = False
            except SesionVencida:
                _sesion["lista"] = False
                _sesion["id"] = None
        else:
            raise ErrorProveedor("No pude mantener la sesión con Higgsfield.")
    if "error" in respuesta:
        err = respuesta["error"] or {}
        raise ErrorProveedor(f"Higgsfield: {str(err.get('message', 'error'))[:200]}")
    return respuesta.get("result") or {}


def herramientas(forzar: bool = False) -> list[dict]:
    """tools/list con paginación. Se guarda 5 minutos."""
    if not forzar and _cache["herramientas"] is not None and time.time() - _cache["hora"] < 300:
        return _cache["herramientas"]
    lista: list[dict] = []
    cursor = None
    for _ in range(20):
        resultado = _rpc("tools/list", {"cursor": cursor} if cursor else {})
        lista.extend(resultado.get("tools") or [])
        cursor = resultado.get("nextCursor")
        if not cursor:
            break
    _cache["herramientas"] = lista
    _cache["hora"] = time.time()
    return lista


def llamar(nombre: str, argumentos: dict | None = None) -> dict:
    resultado = _rpc("tools/call", {"name": nombre, "arguments": argumentos or {}})
    if resultado.get("isError"):
        raise ErrorProveedor(f"Higgsfield ({nombre}): {texto_resultado(resultado)[:200] or 'falló'}")
    return resultado


# ---------------------------------------------------------------- lectura de resultados

def texto_resultado(resultado: dict) -> str:
    partes = [c.get("text", "") for c in resultado.get("content") or [] if c.get("type") == "text"]
    return "\n".join(p for p in partes if p)


def datos_resultado(resultado: dict):
    """structuredContent o el JSON que venga como texto. None si no hay JSON."""
    if resultado.get("structuredContent") is not None:
        return resultado["structuredContent"]
    salida = []
    for c in resultado.get("content") or []:
        if c.get("type") == "text":
            try:
                salida.append(json.loads(c.get("text", "")))
            except ValueError:
                continue
        elif c.get("type") == "resource" and isinstance(c.get("resource"), dict):
            recurso = c["resource"]
            try:
                salida.append(json.loads(recurso.get("text", "")))
            except ValueError:
                salida.append(recurso)
    if not salida:
        return None
    return salida[0] if len(salida) == 1 else salida


def es_lectura(nombre: str) -> bool:
    n = nombre.lower()
    return any(p in n for p in PALABRAS_LECTURA) and not any(p in n for p in PALABRAS_ESCRITURA)


def _args_lectura(herramienta: dict) -> dict | None:
    """Argumentos seguros para una herramienta de lectura. None si pide algo que no sé llenar."""
    esquema = herramienta.get("inputSchema") or {}
    props = esquema.get("properties") or {}
    requeridos = set(esquema.get("required") or [])
    args: dict = {}
    for nombre, prop in props.items():
        n = nombre.lower()
        tipo = (prop or {}).get("type")
        if tipo in ("integer", "number") and n in ("limit", "page_size", "per_page", "count", "size"):
            args[nombre] = min(50, prop.get("maximum", 50))
        elif tipo in ("integer", "number") and n == "page":
            args[nombre] = 1
        elif nombre in requeridos and tipo == "string" and n in ("query", "q", "search", "term", "keyword"):
            args[nombre] = "cinematic"
    if any(r not in args and "default" not in (props.get(r) or {}) for r in requeridos):
        return None
    return args


def _normalizar(texto: str) -> str:
    return re.sub(r"\s+", " ", texto.strip().lower())


PISTAS_VIDEO = ("video", "kling", "veo", "seedance", "wan", "hailuo", "minimax", "motion", "sora")


def _a_plantilla(obj: dict, prompt: str) -> dict:
    prompt = prompt.strip()
    nombre = None
    for clave in ("title", "name", "nombre"):
        if isinstance(obj.get(clave), str) and obj[clave].strip() and obj[clave].strip() != prompt:
            nombre = obj[clave].strip()[:60]
            break
    if not nombre:
        palabras = prompt.split()
        nombre = " ".join(palabras[:6]) + ("…" if len(palabras) > 6 else "")
    modelo = None
    for clave in ("model", "model_id", "model_name", "job_set_type", "type"):
        if isinstance(obj.get(clave), str) and obj[clave].strip():
            modelo = obj[clave].strip()
            break
    pistas = " ".join(str(obj.get(k, "")) for k in ("type", "kind", "media_type", "category",
                                                   "model", "model_id", "job_set_type")).lower()
    es_video = any(p in pistas for p in PISTAS_VIDEO) or "duration" in obj
    return {
        "id": "hf-" + hashlib.sha1(_normalizar(prompt).encode("utf-8")).hexdigest()[:10],
        "nombre": nombre,
        "categoria": "video" if es_video else "imagen",
        "prompt": prompt,
        "modelo_sugerido": modelo,
        "origen": "higgsfield",
    }


def _extraer_prompts(obj, salida: list[dict]) -> None:
    if isinstance(obj, dict):
        for clave in ("prompt", "text_prompt", "positive_prompt"):
            valor = obj.get(clave)
            if isinstance(valor, str) and len(valor.strip()) >= 15:
                salida.append(_a_plantilla(obj, valor))
                break
        for valor in obj.values():
            if isinstance(valor, (dict, list)):
                _extraer_prompts(valor, salida)
    elif isinstance(obj, list):
        for item in obj:
            _extraer_prompts(item, salida)


def _ruta_aprendidos() -> Path:
    return config.cfg.PRESETS / "aprendidos.json"


def _leer_archivo_aprendidos() -> dict:
    """Acepta el formato viejo (lista de plantillas) y el nuevo (objeto)."""
    vacio = {"plantillas": [], "modelos_usados": []}
    ruta = _ruta_aprendidos()
    if not ruta.is_file():
        return vacio
    try:
        datos = json.loads(ruta.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return vacio
    if isinstance(datos, list):
        return {"plantillas": [d for d in datos if isinstance(d, dict)], "modelos_usados": []}
    if not isinstance(datos, dict):
        return vacio
    plantillas = datos.get("plantillas") if isinstance(datos.get("plantillas"), list) else []
    usados = datos.get("modelos_usados") if isinstance(datos.get("modelos_usados"), list) else []
    return {"plantillas": [d for d in plantillas if isinstance(d, dict)],
            "modelos_usados": [u for u in usados if isinstance(u, dict) and u.get("modelo")]}


def _leer_aprendidos() -> list[dict]:
    return _leer_archivo_aprendidos()["plantillas"]


def guardar_aprendidos(nuevas: list[dict], usos: dict[str, int] | None = None) -> dict:
    """Mezcla plantillas sin duplicados (por texto) y actualiza los modelos más usados.

    Escribe data/presets/aprendidos.json como
    {"actualizado", "plantillas": [Plantilla], "modelos_usados": [{"modelo", "app_id", "nombre", "usos"}]}.
    """
    archivo = _leer_archivo_aprendidos()
    existentes = archivo["plantillas"]
    vistos = {_normalizar(p.get("prompt", "")) for p in existentes}
    agregados = 0
    for p in nuevas:
        clave = _normalizar(p["prompt"])
        if clave in vistos:
            continue
        vistos.add(clave)
        existentes.append(p)
        agregados += 1
    usados = archivo["modelos_usados"]
    if usos:  # el historial manda: se reemplaza el conteo con lo último leído
        nombres = {m["_hf_id"]: m for lista in catalogo.modelos_higgsfield().values() for m in lista}
        usados = []
        for real, n in sorted(usos.items(), key=lambda x: (-x[1], x[0])):
            info = nombres.get(real)
            usados.append({"modelo": real, "app_id": info["id"] if info else None,
                           "nombre": info["nombre"] if info else real, "usos": n})
    salida = {"actualizado": time.strftime("%Y-%m-%dT%H:%M:%S"), "plantillas": existentes,
              "modelos_usados": usados}
    ruta = _ruta_aprendidos()
    ruta.parent.mkdir(parents=True, exist_ok=True)
    temporal = ruta.with_suffix(".tmp")
    temporal.write_text(json.dumps(salida, ensure_ascii=False, indent=2), encoding="utf-8")
    temporal.replace(ruta)
    return {"nuevos": agregados, "total": len(existentes)}


def _contar_modelos(obj, usos: dict[str, int]) -> None:
    """Cuenta generaciones por modelo. El historial trae id, job_set_type, url y fecha (sin prompt)."""
    if isinstance(obj, dict):
        modelo = obj.get("job_set_type")
        if not isinstance(modelo, str) and any(k in obj for k in ("url", "result", "results", "status",
                                                                  "created_at")):
            modelo = obj.get("model") if isinstance(obj.get("model"), str) else None
        if isinstance(modelo, str) and modelo.strip():
            usos[modelo.strip()] = usos.get(modelo.strip(), 0) + 1
        for valor in obj.values():
            if isinstance(valor, (dict, list)):
                _contar_modelos(valor, usos)
    elif isinstance(obj, list):
        for item in obj:
            _contar_modelos(item, usos)


def aprender() -> dict:
    """Lee historial/modelos/presets con herramientas de lectura. Nunca genera.

    Si una herramienta trae prompts, se guardan como plantillas. El historial de Higgsfield
    (show_generations) no trae prompts: de ahí solo se cuentan los modelos más usados.
    """
    encontrados: list[dict] = []
    usos: dict[str, int] = {}
    for herramienta in herramientas(forzar=True):
        nombre = herramienta.get("name", "")
        if not es_lectura(nombre):
            continue
        args = _args_lectura(herramienta)
        if args is None:
            continue
        try:
            resultado = llamar(nombre, args)
        except ErrorProveedor:
            continue
        datos = datos_resultado(resultado)
        if datos is None:
            continue
        _extraer_prompts(datos, encontrados)
        if any(p in nombre.lower() for p in ("generation", "history", "show")):
            _contar_modelos(datos, usos)
    return guardar_aprendidos(encontrados, usos)


# ---------------------------------------------------------------- estado

def _numero(datos, claves=("credit", "balance")) -> float | None:
    if isinstance(datos, dict):
        for k, v in datos.items():
            if any(c in k.lower() for c in claves) and isinstance(v, (int, float)) and not isinstance(v, bool):
                return v
        for v in datos.values():
            n = _numero(v, claves)
            if n is not None:
                return n
    elif isinstance(datos, list):
        for v in datos:
            n = _numero(v, claves)
            if n is not None:
                return n
    return None


def _cuenta(datos) -> str | None:
    if isinstance(datos, dict):
        for k in ("email", "username", "user_name", "name"):
            if isinstance(datos.get(k), str) and datos[k]:
                return datos[k]
        for v in datos.values():
            c = _cuenta(v) if isinstance(v, (dict, list)) else None
            if c:
                return c
    elif isinstance(datos, list):
        for v in datos:
            c = _cuenta(v)
            if c:
                return c
    return None


def estado() -> dict:
    """{"conectado", "cuenta", "creditos", "herramientas"}. Solo usa herramientas de lectura."""
    vacio = {"conectado": False, "cuenta": None, "creditos": None, "herramientas": []}
    if not conectado():
        return vacio
    if _cache["estado"] and time.time() - _cache["hora_estado"] < 60:
        return _cache["estado"]
    salida = {"conectado": True, "cuenta": None, "creditos": None, "herramientas": []}
    try:
        lista = herramientas()
    except ErrorProveedor:
        salida["conectado"] = conectado()
        return salida
    salida["herramientas"] = [h.get("name") for h in lista if h.get("name")]
    for h in lista:
        nombre = (h.get("name") or "").lower()
        if not es_lectura(nombre) and nombre not in ("me", "whoami"):
            continue
        args = _args_lectura(h)
        if args is None:
            continue
        quiere_creditos = salida["creditos"] is None and ("balance" in nombre or "credit" in nombre)
        quiere_cuenta = salida["cuenta"] is None and (nombre in ("me", "whoami") or any(
            p in nombre for p in ("account", "profile", "user", "workspace")))
        if not (quiere_creditos or quiere_cuenta):
            continue
        try:
            resultado = llamar(h["name"], args)
        except ErrorProveedor:
            continue
        datos = datos_resultado(resultado)
        texto = texto_resultado(resultado)
        if quiere_creditos:
            n = _numero(datos) if datos is not None else None
            if n is None:
                m = re.search(r"(\d+(?:\.\d+)?)", texto)
                n = float(m.group(1)) if m else None
            salida["creditos"] = n
        if quiere_cuenta and datos is not None:
            salida["cuenta"] = _cuenta(datos)
    _cache["estado"] = salida
    _cache["hora_estado"] = time.time()
    return salida


# ---------------------------------------------------------------- generar (gasta créditos)

PALABRAS_TIPO = {"video": ("video",), "imagen": ("image", "photo", "picture", "img"),
                 "audio": ("audio", "sound", "music", "speech", "voice", "tts")}


def _plano(texto: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(texto).lower())


def _puntaje(herramienta: dict, tipo: str, claves: list[str]) -> int:
    nombre = _plano(herramienta.get("name", ""))
    desc = _plano(herramienta.get("description", ""))
    props = (herramienta.get("inputSchema") or {}).get("properties") or {}
    puntos = 0
    for palabra in PALABRAS_TIPO[tipo]:
        if palabra in nombre:
            puntos += 3
        elif palabra in desc:
            puntos += 1
    for otro, palabras in PALABRAS_TIPO.items():
        if otro != tipo and any(p in nombre for p in palabras):
            puntos -= 2
    crudo = " ".join(" ".join(map(str, p.get("enum") or [])) for p in props.values() if isinstance(p, dict))
    for clave in claves:
        if clave in crudo.split() or clave in (herramienta.get("description") or ""):
            puntos += 2
    if any(n in props for n in ("model", "model_id")):
        puntos += 1
    return puntos


def _medias(prop: dict, entradas: dict) -> list[dict]:
    """medias con roles start_image / end_image / image_references (solo URLs públicas)."""
    item = (prop.get("items") or {}).get("properties") or {}
    campo_url = next((k for k in ("url", "media_url", "image_url", "uri") if k in item), "url")
    campo_rol = next((k for k in ("role", "type", "kind") if k in item), "role")
    salida = []
    pares = [("start_image", (entradas or {}).get("primer_cuadro")),
             ("end_image", (entradas or {}).get("ultimo_cuadro"))]
    pares += [("image_references", r) for r in (entradas or {}).get("referencias") or []]
    for rol, ruta in pares:
        if isinstance(ruta, str) and ruta.startswith(("http://", "https://")):
            salida.append({campo_rol: rol, campo_url: ruta})
    return salida


def _armar_args(herramienta: dict, modelo: dict, prompt: str, ajustes: dict, entradas: dict) -> dict:
    esquema = herramienta.get("inputSchema") or {}
    props = esquema.get("properties") or {}
    requeridos = esquema.get("required") or []
    real = modelo.get("_hf_id") or modelo["id"]
    args: dict = {}
    for nombre, prop in props.items():
        prop = prop or {}
        n = nombre.lower()
        enum = prop.get("enum")
        valor = None
        if "prompt" in n and "negative" not in n:
            valor = prompt
        elif n in ("model", "model_id", "model_name", "job_set_type", "engine"):
            valor = real  # id real de Higgsfield, sin "hf:"
            enum = None   # el id real manda aunque el esquema traiga otra lista
        elif n in ("medias", "media", "inputs", "input_media"):
            valor = _medias(prop, entradas) or None
        elif n in ("aspect_ratio", "ratio", "aspect", "format"):
            valor = ajustes.get("formato")
        elif n in ("duration", "seconds", "length", "duration_seconds"):
            valor = ajustes.get("duracion")
        elif n in ("resolution",):
            valor = ajustes.get("resolucion")
        elif n == "seed":
            valor = ajustes.get("semilla")
        elif n in ("generate_audio", "with_audio", "audio", "sound") and prop.get("type") == "boolean":
            valor = bool(ajustes.get("audio", True))
        elif n in ("num_images", "count", "n", "batch_size", "num_outputs"):
            valor = 1
        elif n in ("image", "image_url", "start_image", "first_frame", "input_image", "start_image_url"):
            ruta = (entradas or {}).get("primer_cuadro")
            valor = ruta if ruta and ruta.startswith("http") else None
        elif n in ("end_image", "last_frame", "end_image_url"):
            ruta = (entradas or {}).get("ultimo_cuadro")
            valor = ruta if ruta and ruta.startswith("http") else None
        if valor is None:
            continue
        if enum and valor not in enum:
            continue
        if prop.get("type") == "integer":
            try:
                valor = int(valor)
            except (TypeError, ValueError):
                continue
        elif prop.get("type") == "string":
            valor = str(valor)
        args[nombre] = valor
    faltan = [r for r in requeridos if r not in args and "default" not in (props.get(r) or {})]
    if faltan:
        raise ErrorProveedor(f"La herramienta {herramienta.get('name')} pide {', '.join(faltan)} y no sé llenarlo.")
    return args


def _buscar_id(obj) -> str | None:
    if isinstance(obj, dict):
        for clave in ("job_id", "task_id", "generation_id", "request_id", "job_set_id", "id"):
            if isinstance(obj.get(clave), (str, int)) and not isinstance(obj.get(clave), bool):
                return str(obj[clave])
        for v in obj.values():
            r = _buscar_id(v)
            if r:
                return r
    elif isinstance(obj, list):
        for v in obj:
            r = _buscar_id(v)
            if r:
                return r
    return None


def _buscar_estado(obj) -> str | None:
    if isinstance(obj, dict):
        for clave in ("status", "state"):
            if isinstance(obj.get(clave), str):
                return obj[clave].lower()
        for v in obj.values():
            r = _buscar_estado(v)
            if r:
                return r
    elif isinstance(obj, list):
        for v in obj:
            r = _buscar_estado(v)
            if r:
                return r
    return None


def interpretar(resultado: dict) -> dict:
    """Saca url del medio, id remoto y estado de cualquier respuesta de herramienta."""
    crudo = json.dumps(resultado, ensure_ascii=False)
    patron = r"https?://[^\s\"'<>\\]+?\.(?:" + "|".join(EXTENSIONES_MEDIO) + r")(?:\?[^\s\"'<>\\]*)?"
    urls = list(dict.fromkeys(re.findall(patron, crudo, flags=re.IGNORECASE)))
    datos = datos_resultado(resultado)
    return {
        "url": urls[0] if urls else None,
        "urls": urls,
        "id_remoto": _buscar_id(datos) if datos is not None else None,
        "estado": _buscar_estado(datos) if datos is not None else None,
        "texto": texto_resultado(resultado)[:500],
    }


def generar_via_mcp(modelo_id: str, prompt: str, ajustes: dict, entradas: dict | None = None) -> dict:
    """GASTA CRÉDITOS. Busca la herramienta de generación adecuada y la llama."""
    modelo = catalogo.buscar(modelo_id)
    tipo = catalogo.tipo_de(modelo_id)
    if not modelo or modelo.get("proveedor") != "higgsfield":
        raise ErrorProveedor("Ese modelo no va por Higgsfield.")
    candidatas = [h for h in herramientas()
                  if any(p in (h.get("name") or "").lower() for p in ("generate", "create"))]
    if not candidatas:
        raise ErrorProveedor("Higgsfield no ofrece herramientas para generar.")
    claves = [modelo.get("_hf_id") or modelo["id"]]
    puntuadas = sorted(candidatas, key=lambda h: _puntaje(h, tipo, claves), reverse=True)
    elegida = puntuadas[0]
    if _puntaje(elegida, tipo, claves) <= 0:
        raise ErrorProveedor(f"No encontré en Higgsfield una herramienta para {modelo['nombre']}.")
    args = _armar_args(elegida, modelo, prompt, ajustes or {}, entradas or {})
    salida = interpretar(llamar(elegida["name"], args))
    salida["herramienta"] = elegida["name"]
    return salida


def consultar_via_mcp(id_remoto: str) -> dict | None:
    """Consulta un trabajo de Higgsfield con una herramienta de lectura. None si no hay cómo."""
    for h in herramientas():
        nombre = (h.get("name") or "").lower()
        if not es_lectura(nombre) or not any(p in nombre for p in ("status", "job", "generation", "get")):
            continue
        props = (h.get("inputSchema") or {}).get("properties") or {}
        campo = next((p for p in props if p.lower() in ("id", "job_id", "task_id", "generation_id",
                                                         "request_id", "job_set_id")), None)
        if not campo:
            continue
        try:
            return interpretar(llamar(h["name"], {campo: id_remoto}))
        except ErrorProveedor:
            continue
    return None


# ---------------------------------------------------------------- Explorar: galería, presets y recrear
# Todo esto es SOLO lectura: no genera ni gasta créditos.

NOMBRES_HISTORIAL = ("show_generations", "list_generations", "get_generations", "generations_list",
                     "get_history", "list_history", "history")
NOMBRES_PRESETS = ("get_presets", "presets_list", "list_presets", "presets_get", "search_presets", "presets")
CAMPOS_CURSOR = ("cursor", "next_cursor", "page_token", "after", "offset", "page")
CAMPOS_TIPO = ("type", "media_type", "kind", "job_type", "category_type", "output_type")
CAMPOS_FUENTE = ("source", "fuente", "collection", "category", "tab", "group", "section")
CLAVES_SIGUIENTE = ("next_cursor", "nextCursor", "next_page_token", "nextPageToken", "next", "cursor")
EXT_VIDEO = ("mp4", "mov", "webm", "m4v")
MAX_PRESETS = 200
VIGENCIA_PRESETS = 24 * 3600
VIGENCIA_GALERIA = 10 * 60
_cache_galeria: dict = {}  # (tipo, cursor) → (hora, respuesta)


def _elegir_herramienta(nombres: tuple[str, ...], palabras: tuple[str, ...]) -> dict | None:
    """Primero por nombre exacto (en orden), luego por palabra en nombre o descripción. Solo lectura."""
    lista = [h for h in herramientas() if es_lectura(h.get("name") or "") or
             (h.get("name") or "").lower() in nombres]
    lista = [h for h in lista if not any(w in (h.get("name") or "").lower() for w in PALABRAS_ESCRITURA)]
    por_nombre = {(h.get("name") or "").lower(): h for h in lista}
    for n in nombres:
        if n in por_nombre:
            return por_nombre[n]
    for h in lista:
        if any(w in (h.get("name") or "").lower() for w in palabras):
            return h
    for h in lista:
        if any(w in (h.get("description") or "").lower() for w in palabras):
            return h
    return None


def _props(herramienta: dict) -> tuple[dict, set]:
    esquema = herramienta.get("inputSchema") or {}
    return esquema.get("properties") or {}, set(esquema.get("required") or [])


def _valor_enum(prop: dict, deseado: str):
    """Para un campo con enum, el valor que contenga la palabra deseada (video/image)."""
    enum = prop.get("enum")
    if not enum:
        return deseado
    sinonimos = {"image": ("image", "imagen", "photo", "picture"), "video": ("video",)}[deseado]
    return next((v for v in enum if any(x in str(v).lower() for x in sinonimos)), None)


def _items_de(datos) -> list[dict]:
    """La lista de objetos más larga dentro de la respuesta."""
    mejor: list[dict] = []

    def recorrer(obj):
        nonlocal mejor
        if isinstance(obj, list):
            dicts = [x for x in obj if isinstance(x, dict)]
            if len(dicts) > len(mejor):
                mejor = dicts
            for x in obj:
                recorrer(x)
        elif isinstance(obj, dict):
            for v in obj.values():
                recorrer(v)

    recorrer(datos)
    return mejor


def _siguiente_de(datos) -> str | None:
    if not isinstance(datos, dict):
        return None
    for clave in CLAVES_SIGUIENTE:
        v = datos.get(clave)
        if isinstance(v, (str, int)) and not isinstance(v, bool) and str(v):
            return str(v)
    for anidado in ("pagination", "meta", "page_info", "pageInfo"):
        r = _siguiente_de(datos.get(anidado))
        if r:
            return r
    return None


def _primer_texto(obj: dict, claves: tuple[str, ...]) -> str | None:
    for c in claves:
        v = obj.get(c)
        if isinstance(v, (str, int)) and not isinstance(v, bool) and str(v).strip():
            return str(v).strip()
    return None


def _url_medio(obj: dict, claves: tuple[str, ...]) -> str | None:
    for c in claves:
        v = obj.get(c)
        if isinstance(v, str) and v.startswith(("http://", "https://")):
            return v
        if isinstance(v, dict):
            r = _url_medio(v, ("url", "src", "video_url", "image_url"))
            if r:
                return r
        if isinstance(v, list):
            for x in v:
                if isinstance(x, str) and x.startswith("http"):
                    return x
                if isinstance(x, dict):
                    r = _url_medio(x, ("url", "src", "video_url", "image_url"))
                    if r:
                        return r
    return None


def _tipo_por_url(url: str | None) -> str | None:
    if not url:
        return None
    ext = url.split("?")[0].rsplit(".", 1)[-1].lower()
    if ext in EXT_VIDEO:
        return "video"
    if ext in ("png", "jpg", "jpeg", "webp", "gif", "avif"):
        return "imagen"
    return None


def _tipo_de_item(obj: dict, url: str | None, modelo: str | None) -> str | None:
    pistas = " ".join(str(obj.get(c, "")) for c in CAMPOS_TIPO + ("category", "media")).lower()
    if "video" in pistas:
        return "video"
    if any(x in pistas for x in ("image", "imagen", "photo")):
        return "imagen"
    por_url = _tipo_por_url(url)
    if por_url:
        return por_url
    if modelo:
        info = catalogo.buscar(catalogo.PREFIJO_HF + modelo)
        if info:
            return catalogo.tipo_de(info["id"])
        if any(p in modelo.lower() for p in PISTAS_VIDEO):
            return "video"
    return None


def _item_galeria(obj: dict) -> dict | None:
    url = _url_medio(obj, ("url", "video_url", "image_url", "result_url", "media_url", "output_url",
                           "results", "result", "outputs", "output", "media", "images", "videos"))
    if not url:
        return None
    modelo = _primer_texto(obj, ("job_set_type", "model", "model_id", "model_name"))
    return {
        "id": _primer_texto(obj, ("id", "job_id", "generation_id", "job_set_id")) or
              hashlib.sha1(url.encode()).hexdigest()[:12],
        "modelo": modelo,
        "url": url,
        "miniatura": _url_medio(obj, ("thumbnail_url", "thumbnail", "poster", "preview_image", "thumb",
                                      "cover", "preview_url")),
        "tipo": _tipo_de_item(obj, url, modelo) or "imagen",
        "fecha": _primer_texto(obj, ("created_at", "createdAt", "created", "date", "timestamp", "updated_at")),
    }


def galeria(tipo: str | None = None, cursor: str | None = None) -> dict:
    """Historial de la cuenta para Explorar. {"items", "siguiente"}. Cache de 10 min."""
    tipo = {"image": "imagen", "imagen": "imagen", "video": "video"}.get((tipo or "").lower())
    clave = (tipo, cursor or "")
    guardado = _cache_galeria.get(clave)
    if guardado and time.time() - guardado[0] < VIGENCIA_GALERIA:
        return guardado[1]
    herramienta = _elegir_herramienta(NOMBRES_HISTORIAL, ("generation", "history"))
    if herramienta is None:
        return {"items": [], "siguiente": None, "nota": "Higgsfield no ofrece el historial por MCP."}
    props, requeridos = _props(herramienta)
    args: dict = {}
    campo_cursor = None
    for nombre, prop in props.items():
        n = nombre.lower()
        prop = prop or {}
        if n in ("limit", "page_size", "per_page", "count", "size") and prop.get("type") in ("integer", "number"):
            args[nombre] = int(min(50, prop.get("maximum", 50)))
        elif n in CAMPOS_CURSOR and campo_cursor is None:
            campo_cursor = nombre
            if cursor:
                args[nombre] = int(cursor) if prop.get("type") in ("integer", "number") and cursor.isdigit() else cursor
            elif n == "page":
                args[nombre] = 1
        elif n in CAMPOS_TIPO and tipo:
            valor = _valor_enum(prop, "video" if tipo == "video" else "image")
            if valor is not None:
                args[nombre] = valor
    faltan = [r for r in requeridos if r not in args and "default" not in (props.get(r) or {})]
    if faltan:
        raise ErrorProveedor(f"La herramienta {herramienta['name']} pide {', '.join(faltan)}.")
    datos = datos_resultado(llamar(herramienta["name"], args))
    crudos = _items_de(datos) if datos is not None else []
    items = [i for i in (_item_galeria(o) for o in crudos) if i]
    if tipo:
        items = [i for i in items if i["tipo"] == tipo]
    siguiente = _siguiente_de(datos)
    if siguiente is None and campo_cursor and crudos:
        n = campo_cursor.lower()
        if n == "page":
            siguiente = str(int(cursor or 1) + 1)
        elif n == "offset":
            siguiente = str(int(cursor or 0) + len(crudos))
    respuesta = {"items": items, "siguiente": siguiente}
    _cache_galeria[clave] = (time.time(), respuesta)
    return respuesta


# ---- presets

def _ruta_presets_hf() -> Path:
    return config.cfg.PRESETS / "higgsfield_presets.json"


def leer_presets_guardados() -> dict | None:
    ruta = _ruta_presets_hf()
    if not ruta.is_file():
        return None
    try:
        datos = json.loads(ruta.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return None
    if not isinstance(datos, dict) or not isinstance(datos.get("items"), list):
        return None
    return datos


def _item_preset(obj: dict, fuente: str | None) -> dict | None:
    pid = _primer_texto(obj, ("id", "preset_id", "slug", "uuid", "key"))
    nombre = _primer_texto(obj, ("name", "title", "nombre", "label"))
    if not pid and not nombre:
        return None
    preview = _url_medio(obj, ("preview_video_url", "video_url", "preview_url", "preview", "preview_video",
                               "media_url", "thumbnail_url", "image_url", "cover", "thumbnail", "url",
                               "examples", "media"))
    modelo = _primer_texto(obj, ("model", "model_id", "job_set_type", "model_name"))
    prompt = None
    for c in ("prompt", "text_prompt", "positive_prompt", "default_prompt", "prompt_template"):
        if isinstance(obj.get(c), str) and obj[c].strip():
            prompt = obj[c].strip()
            break
    tipo = _tipo_de_item(obj, None, modelo) or _tipo_por_url(preview) or "video"
    categoria = _primer_texto(obj, ("category", "categoria", "group", "collection", "section")) or fuente
    return {
        "id": pid or "hf-" + hashlib.sha1(nombre.encode()).hexdigest()[:10],
        "nombre": nombre or pid,
        "tipo": tipo,
        "preview": preview,
        "preview_tipo": _tipo_por_url(preview) or ("video" if preview and tipo == "video" else "imagen"),
        "prompt": prompt,
        "modelo": modelo,
        "categoria": categoria,
        # extras para recrear: formato y duración del preset si los trae
        "formato": _primer_texto(obj, ("aspect_ratio", "ratio", "formato")),
        "duracion": obj.get("duration") if isinstance(obj.get("duration"), (int, float))
        and not isinstance(obj.get("duration"), bool) else None,
    }


def _bajar_presets(herramienta: dict) -> list[dict]:
    """Recorre fuentes (si el esquema trae un enum) y páginas, hasta ~200 items."""
    props, requeridos = _props(herramienta)
    campo_fuente = next((n for n, p in props.items() if n.lower() in CAMPOS_FUENTE and (p or {}).get("enum")), None)
    fuentes = list(props[campo_fuente]["enum"]) if campo_fuente else [None]
    campo_cursor = next((n for n in props if n.lower() in CAMPOS_CURSOR), None)
    campo_limite = next((n for n, p in props.items() if n.lower() in ("limit", "page_size", "per_page", "count")
                         and (p or {}).get("type") in ("integer", "number")), None)
    salida: dict[str, dict] = {}
    for fuente in fuentes:
        cursor = None
        for _ in range(20):
            args: dict = {}
            if campo_fuente and fuente is not None:
                args[campo_fuente] = fuente
            if campo_limite:
                args[campo_limite] = int(min(50, (props[campo_limite] or {}).get("maximum", 50)))
            if campo_cursor and cursor is not None:
                args[campo_cursor] = cursor
            faltan = [r for r in requeridos if r not in args and "default" not in (props.get(r) or {})]
            if faltan:
                raise ErrorProveedor(f"La herramienta {herramienta['name']} pide {', '.join(faltan)}.")
            datos = datos_resultado(llamar(herramienta["name"], args))
            crudos = _items_de(datos) if datos is not None else []
            for o in crudos:
                item = _item_preset(o, str(fuente) if fuente is not None else None)
                if item and item["id"] not in salida:
                    salida[item["id"]] = item
            if len(salida) >= MAX_PRESETS or not crudos or not campo_cursor:
                break
            siguiente = _siguiente_de(datos)
            if siguiente is None and campo_cursor.lower() in ("page", "offset"):
                base = int(cursor or (1 if campo_cursor.lower() == "page" else 0))
                siguiente = base + (1 if campo_cursor.lower() == "page" else len(crudos))
            if siguiente is None or siguiente == cursor:
                break
            cursor = siguiente
        if len(salida) >= MAX_PRESETS:
            break
    return list(salida.values())[:MAX_PRESETS]


def presets_higgsfield(fuente: str | None = None, forzar: bool = False) -> dict:
    """Presets de Higgsfield normalizados. Sirve del archivo si tiene < 24 h o si el MCP falla."""
    guardado = leer_presets_guardados()

    def filtrar(datos: dict, nota: str | None = None) -> dict:
        items = datos.get("items") or []
        if fuente:
            items = [i for i in items if (i.get("categoria") or "").lower() == fuente.lower()]
        salida = {"items": items, "actualizado": datos.get("actualizado")}
        if nota or datos.get("nota"):
            salida["nota"] = nota or datos.get("nota")
        return salida

    if guardado and not forzar and time.time() - float(guardado.get("epoch") or 0) < VIGENCIA_PRESETS:
        return filtrar(guardado)
    if not conectado():
        if guardado:
            return filtrar(guardado, "Higgsfield no está conectado: es la copia guardada.")
        raise ErrorProveedor("Higgsfield no está conectado. Conéctalo primero.", 409)
    try:
        herramienta = _elegir_herramienta(NOMBRES_PRESETS, ("preset",))
        if herramienta is None:
            nota = "Higgsfield no ofrece una herramienta de presets por MCP."
            return filtrar(guardado, nota) if guardado else {"items": [], "nota": nota}
        items = _bajar_presets(herramienta)
    except ErrorProveedor as e:
        if guardado:
            return filtrar(guardado, f"Copia guardada ({e.mensaje})")
        raise
    datos = {"actualizado": time.strftime("%Y-%m-%dT%H:%M:%S"), "epoch": time.time(),
             "herramienta": herramienta["name"], "items": items}
    ruta = _ruta_presets_hf()
    ruta.parent.mkdir(parents=True, exist_ok=True)
    temporal = ruta.with_suffix(".tmp")
    temporal.write_text(json.dumps(datos, ensure_ascii=False, indent=2), encoding="utf-8")
    temporal.replace(ruta)
    return filtrar(datos)


def _formato_de(obj_formato: str | None, opciones: list[str], defecto: str) -> str:
    if obj_formato in opciones:
        return obj_formato
    try:
        w, h = (float(x) for x in str(obj_formato).split(":"))
    except (TypeError, ValueError):
        return defecto
    if w > h:
        return next((o for o in ("16:9", "3:2") if o in opciones), defecto)
    if h > w:
        return next((o for o in ("9:16", "2:3") if o in opciones), defecto)
    return "1:1" if "1:1" in opciones else defecto


def recrear(preset_id: str) -> dict | None:
    """Datos para precargar el generador con un preset. No genera nada. None si no existe."""
    guardado = leer_presets_guardados()
    if guardado is None and conectado():
        presets_higgsfield()
        guardado = leer_presets_guardados()
    item = next((i for i in (guardado or {}).get("items") or [] if str(i.get("id")) == str(preset_id)), None)
    if item is None:
        return None
    modelo_hf = item.get("modelo")
    info_hf = catalogo.buscar(catalogo.PREFIJO_HF + modelo_hf) if modelo_hf else None
    tipo = item.get("tipo") if item.get("tipo") in ("video", "imagen") else "video"
    formato_original = item.get("formato") or item.get("aspect_ratio")
    if tipo == "video":
        # Exclusivo = el preset usa un modelo propio de Higgsfield que no es Seedance
        exclusivo = bool(modelo_hf) and "seedance" not in modelo_hf.lower() and info_hf is not None
        sugerido = "seedance-2.5"
        ajustes = {"resolucion": "720p",
                   "formato": _formato_de(formato_original, catalogo.FORMATOS_VIDEO, "16:9"),
                   "duracion": int(min(30, max(4, item.get("duracion") or 5))),
                   "audio": True, "semilla": None, "variantes": 1}
    else:
        exclusivo = bool(modelo_hf) and "gpt_image" not in modelo_hf.lower() and info_hf is not None
        sugerido = "gpt-image-2"
        ajustes = {"calidad": "medium", "formato": _formato_de(formato_original, ["1:1", "2:3", "3:2"], "1:1"),
                   "semilla": None, "variantes": 1}
    salida = {"prompt": item.get("prompt") or item.get("nombre") or "", "modelo_sugerido": sugerido,
              "ajustes": ajustes, "tipo": tipo, "exclusivo": exclusivo,
              "modelo_higgsfield": info_hf["id"] if info_hf else None}
    if not item.get("prompt"):
        salida["nota"] = "El preset no trae prompt: se usa su nombre como idea. Mejóralo antes de generar."
    elif exclusivo:
        salida["nota"] = (f"Este preset es de {info_hf['nombre']} (exclusivo de Higgsfield). "
                          "Se sugiere Seedance 2.5 directo para no gastar créditos." if tipo == "video" else
                          f"Este preset es de {info_hf['nombre']} (Higgsfield). Se sugiere GPT Image 2 directo.")
    return salida
