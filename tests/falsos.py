"""Servidores HTTP falsos para pruebas: MCP+OAuth de Higgsfield, ModelArk y Ollama."""

from __future__ import annotations

import base64
import hashlib
import json
import socket
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlencode, urlparse


def puerto_libre() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def arrancar(manejador) -> tuple[ThreadingHTTPServer, str]:
    servidor = ThreadingHTTPServer(("127.0.0.1", 0), manejador)
    servidor.daemon_threads = True
    threading.Thread(target=servidor.serve_forever, daemon=True).start()
    return servidor, f"http://127.0.0.1:{servidor.server_address[1]}"


class Base(BaseHTTPRequestHandler):
    def log_message(self, *a):  # silencio
        pass

    def _json(self, codigo: int, datos, cabeceras: dict | None = None):
        cuerpo = json.dumps(datos).encode()
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(cuerpo)))
        for k, v in (cabeceras or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(cuerpo)

    def _cuerpo(self) -> bytes:
        largo = int(self.headers.get("Content-Length") or 0)
        return self.rfile.read(largo) if largo else b""


# ---------------------------------------------------------------- Higgsfield falso

HERRAMIENTAS = [
    {"name": "get_balance", "description": "Credits balance", "inputSchema": {"type": "object", "properties": {}}},
    {"name": "get_account", "description": "Account info", "inputSchema": {"type": "object", "properties": {}}},
    {"name": "list_history", "description": "Generation history",
     "inputSchema": {"type": "object", "properties": {"limit": {"type": "integer", "maximum": 20}}}},
    {"name": "search_presets", "description": "Search presets",
     "inputSchema": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]}},
    {"name": "get_job_secret", "description": "Needs an id I can't fill",
     "inputSchema": {"type": "object", "properties": {"job_id": {"type": "string"}}, "required": ["job_id"]}},
    {"name": "generate_video", "description": "Generate a video with Kling, Veo or Seedance",
     "inputSchema": {"type": "object", "properties": {
         "prompt": {"type": "string"},
         "model": {"type": "string", "enum": ["kling_3_0", "veo_3_1", "seedance_2_5"]},
         "aspect_ratio": {"type": "string", "enum": ["16:9", "9:16", "1:1"]},
         "duration": {"type": "integer"}}, "required": ["prompt", "model"]}},
    {"name": "generate_image", "description": "Generate an image",
     "inputSchema": {"type": "object", "properties": {
         "prompt": {"type": "string"},
         "model": {"type": "string", "enum": ["nano_banana_pro", "soul_v2", "seedream_v5_lite"]}},
         "required": ["prompt"]}},
]


class EstadoMCP:
    def __init__(self):
        self.reiniciar()

    def reiniciar(self):
        self.base = ""
        self.clientes = {}
        self.codigos = {}       # code → (challenge, client_id, redirect)
        self.tokens = set()
        self.refrescos = {}
        self.sesiones = set()
        self.llamadas = []      # nombres de herramientas llamadas
        self.metodos = []
        self.rechazar_token = None  # token que de pronto deja de servir
        self.vencer_sesion = False
        self.contador = 0


ESTADO = EstadoMCP()


class ManejadorMCP(Base):
    def do_GET(self):
        url = urlparse(self.path)
        e = ESTADO
        if url.path in ("/.well-known/oauth-protected-resource/mcp", "/.well-known/oauth-protected-resource"):
            return self._json(200, {"resource": e.base + "/mcp", "authorization_servers": [e.base + "/auth"],
                                    "scopes_supported": ["mcp"]})
        if url.path == "/.well-known/oauth-authorization-server/auth":
            return self._json(200, {"issuer": e.base + "/auth",
                                    "authorization_endpoint": e.base + "/auth/authorize",
                                    "token_endpoint": e.base + "/auth/token",
                                    "registration_endpoint": e.base + "/auth/register",
                                    "code_challenge_methods_supported": ["S256"]})
        if url.path == "/auth/authorize":
            q = {k: v[0] for k, v in parse_qs(url.query).items()}
            assert q["code_challenge_method"] == "S256"
            assert q["client_id"] in e.clientes
            e.contador += 1
            code = f"codigo{e.contador}"
            e.codigos[code] = (q["code_challenge"], q["client_id"], q["redirect_uri"])
            destino = q["redirect_uri"] + "?" + urlencode({"code": code, "state": q["state"]})
            self.send_response(302)
            self.send_header("Location", destino)
            self.end_headers()
            return
        if url.path == "/media/video.mp4":
            cuerpo = b"\x00\x00\x00\x18ftypmp42video-falso"
            self.send_response(200)
            self.send_header("Content-Type", "video/mp4")
            self.send_header("Content-Length", str(len(cuerpo)))
            self.end_headers()
            self.wfile.write(cuerpo)
            return
        self._json(404, {"error": "no"})

    def do_POST(self):
        e = ESTADO
        url = urlparse(self.path)
        cuerpo = self._cuerpo()
        if url.path == "/auth/register":
            datos = json.loads(cuerpo)
            assert datos["token_endpoint_auth_method"] == "none"
            e.contador += 1
            cid = f"cliente{e.contador}"
            e.clientes[cid] = datos["redirect_uris"]
            return self._json(201, {"client_id": cid, "redirect_uris": datos["redirect_uris"]})
        if url.path == "/auth/token":
            f = {k: v[0] for k, v in parse_qs(cuerpo.decode()).items()}
            if f["grant_type"] == "authorization_code":
                reto, cid, redirect = e.codigos.pop(f["code"])
                calculado = base64.urlsafe_b64encode(
                    hashlib.sha256(f["code_verifier"].encode()).digest()).rstrip(b"=").decode()
                if calculado != reto or cid != f["client_id"] or redirect != f["redirect_uri"]:
                    return self._json(400, {"error": "invalid_grant"})
            elif f["grant_type"] == "refresh_token":
                if f["refresh_token"] not in e.refrescos:
                    return self._json(400, {"error": "invalid_grant"})
            else:
                return self._json(400, {"error": "unsupported_grant_type"})
            e.contador += 1
            token, refresco = f"tok{e.contador}", f"ref{e.contador}"
            e.tokens.add(token)
            e.refrescos[refresco] = token
            return self._json(200, {"access_token": token, "token_type": "Bearer",
                                    "expires_in": 3600, "refresh_token": refresco})
        if url.path == "/mcp":
            return self._mcp(cuerpo)
        self._json(404, {"error": "no"})

    def _mcp(self, cuerpo: bytes):
        e = ESTADO
        auth = self.headers.get("Authorization", "")
        token = auth[7:] if auth.startswith("Bearer ") else ""
        if token not in e.tokens or token == e.rechazar_token:
            self.send_response(401)
            self.send_header("WWW-Authenticate",
                             f'Bearer resource_metadata="{e.base}/.well-known/oauth-protected-resource/mcp"')
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        msg = json.loads(cuerpo)
        metodo = msg.get("method")
        e.metodos.append(metodo)
        if metodo == "initialize":
            assert msg["params"]["protocolVersion"] == "2025-06-18"
            e.contador += 1
            sesion = f"ses{e.contador}"
            e.sesiones.add(sesion)
            return self._json(200, {"jsonrpc": "2.0", "id": msg["id"], "result": {
                "protocolVersion": "2025-06-18", "capabilities": {"tools": {}},
                "serverInfo": {"name": "falso", "version": "1"}}}, {"Mcp-Session-Id": sesion})
        sesion = self.headers.get("Mcp-Session-Id")
        if sesion not in e.sesiones or e.vencer_sesion:
            e.vencer_sesion = False
            e.sesiones.discard(sesion)
            return self._json(404, {"error": "sesion"})
        if metodo == "notifications/initialized":
            self.send_response(202)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        if metodo == "tools/list":
            cursor = (msg.get("params") or {}).get("cursor")
            if not cursor:
                return self._json(200, {"jsonrpc": "2.0", "id": msg["id"],
                                        "result": {"tools": HERRAMIENTAS[:3], "nextCursor": "p2"}})
            return self._json(200, {"jsonrpc": "2.0", "id": msg["id"], "result": {"tools": HERRAMIENTAS[3:]}})
        if metodo == "tools/call":
            nombre = msg["params"]["name"]
            args = msg["params"].get("arguments") or {}
            e.llamadas.append((nombre, args))
            resultado = self._herramienta(nombre, args)
            return self._sse(msg["id"], resultado)
        self._json(200, {"jsonrpc": "2.0", "id": msg["id"], "error": {"code": -32601, "message": "no existe"}})

    def _herramienta(self, nombre, args):
        e = ESTADO
        def texto(obj):
            return {"content": [{"type": "text", "text": json.dumps(obj)}]}
        if nombre == "get_balance":
            return texto({"credits": 1234.5})
        if nombre == "get_account":
            return texto({"user": {"email": "poncho@ejemplo.com"}})
        if nombre == "list_history":
            return texto({"items": [
                {"id": 1, "prompt": "A lone astronaut walks across red dunes at dusk, slow dolly",
                 "model": "kling_3_0", "duration": 5},
                {"id": 2, "prompt": "Portrait of a woman in neon rain, 85mm lens, bokeh", "model": "soul_v2"},
                {"id": 3, "prompt": "A lone astronaut walks across red dunes at dusk, slow dolly"},
                {"id": 4, "prompt": "corto"},
            ]})
        if nombre == "search_presets":
            return {"content": [{"type": "text", "text": "texto que no es JSON"}],
                    "structuredContent": {"presets": [
                        {"title": "Crash zoom", "prompt": "Crash zoom into the eyes of a boxer, sweat flying",
                         "type": "video"}]}}
        if nombre == "generate_video":
            return texto({"status": "completed", "job_id": "j1",
                          "video_url": e.base + "/media/video.mp4"})
        if nombre == "generate_image":
            return texto({"status": "queued", "job_id": "j2"})
        return {"isError": True, "content": [{"type": "text", "text": "no"}]}

    def _sse(self, id_msg, resultado):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.end_headers()
        aviso = {"jsonrpc": "2.0", "method": "notifications/progress", "params": {"progress": 50}}
        self.wfile.write(b"event: message\ndata: " + json.dumps(aviso).encode() + b"\n\n")
        respuesta = {"jsonrpc": "2.0", "id": id_msg, "result": resultado}
        self.wfile.write(b"event: message\ndata: " + json.dumps(respuesta).encode() + b"\n\n")
        self.wfile.flush()


# ---------------------------------------------------------------- ModelArk falso

class EstadoArk:
    def __init__(self):
        self.reiniciar()

    def reiniciar(self):
        self.base = ""
        self.tareas = {}
        self.cuerpos = []
        self.consultas = 0
        self.forzar_codigo = None


ARK = EstadoArk()


class ManejadorArk(Base):
    def _auth(self) -> bool:
        if self.headers.get("Authorization") != "Bearer llave-falsa":
            self._json(401, {"error": {"code": "AuthenticationError", "message": "bad key"}})
            return False
        return True

    def do_POST(self):
        if not self._auth():
            return
        cuerpo = json.loads(self._cuerpo())
        if ARK.forzar_codigo:
            return self._json(ARK.forzar_codigo, {"error": {"message": "forzado"}})
        ARK.cuerpos.append(cuerpo)
        tid = f"cgt-{len(ARK.cuerpos)}"
        ARK.tareas[tid] = {"consultas": 0}
        self._json(200, {"id": tid})

    def do_GET(self):
        if self.path == "/video.mp4":
            cuerpo = b"video-falso-de-seedance"
            self.send_response(200)
            self.send_header("Content-Type", "video/mp4")
            self.send_header("Content-Length", str(len(cuerpo)))
            self.end_headers()
            self.wfile.write(cuerpo)
            return
        if not self._auth():
            return
        tid = self.path.rsplit("/", 1)[-1]
        tarea = ARK.tareas.get(tid)
        if tarea is None:
            return self._json(404, {"error": {"message": "no task"}})
        tarea["consultas"] += 1
        ARK.consultas += 1
        if tarea["consultas"] < 2:
            return self._json(200, {"id": tid, "status": "running"})
        self._json(200, {"id": tid, "status": "succeeded",
                         "content": {"video_url": ARK.base + "/video.mp4"},
                         "usage": {"completion_tokens": 48037}})

    def do_DELETE(self):
        if not self._auth():
            return
        self._json(200, {})


# ---------------------------------------------------------------- Ollama falso

class ManejadorOllama(Base):
    def do_GET(self):
        if self.path == "/api/tags":
            return self._json(200, {"models": [{"name": "nomic-embed-text:latest", "size": 1},
                                               {"name": "poncho-prompts:latest", "size": 2000},
                                               {"name": "gpt-oss:120b-cloud", "size": None}]})
        self._json(404, {})

    def do_POST(self):
        datos = json.loads(self._cuerpo())
        assert datos["stream"] is False
        self._json(200, {"model": datos["model"], "message": {"role": "assistant", "content":
                         "<think>pensando...</think>\nPrompt: \"A golden retriever runs on a beach, "
                         "tracking shot, golden hour light, 50mm lens, waves crashing.\""}})
