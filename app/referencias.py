"""Importar una referencia desde un enlace (p. ej. la vista previa de un ejemplo de Higgsfield).

Descarga el archivo a data/medios para que sirva como referencia igual que uno subido, y recuerda de dónde vino
(archivo `<nombre>.origen`). Seedance recibe las imágenes en base64 y los videos/audios por su enlace público,
así que el origen hace falta para las referencias de video y audio.
"""

from __future__ import annotations

import ipaddress
import mimetypes
import secrets
import shutil
import socket
import subprocess
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests

from app import config

MAX_BYTES = 50 * 1024 * 1024
MAX_SALTOS = 3
PERMITIR_LOCAL = False          # solo las pruebas lo ponen en True
EXT_POR_TIPO = {
    "imagen": {".png", ".jpg", ".jpeg", ".webp", ".gif"},
    "video": {".mp4", ".mov", ".webm", ".m4v"},
    "audio": {".mp3", ".wav", ".m4a", ".ogg"},
}
EXT_POR_MIME = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/gif": ".gif",
                "video/mp4": ".mp4", "video/quicktime": ".mov", "video/webm": ".webm",
                "audio/mpeg": ".mp3", "audio/wav": ".wav", "audio/x-wav": ".wav", "audio/mp4": ".m4a",
                "audio/ogg": ".ogg"}


class ErrorReferencia(Exception):
    def __init__(self, mensaje: str, codigo: int = 400):
        super().__init__(mensaje)
        self.codigo = codigo


def tipo_de(nombre: str) -> str | None:
    ext = Path(nombre).suffix.lower()
    return next((t for t, exts in EXT_POR_TIPO.items() if ext in exts), None)


def _revisar_destino(url: str) -> None:
    """Solo http(s) hacia internet: nunca a este PC ni a la red local (evita que una página pida archivos internos)."""
    p = urlparse(url)
    if p.scheme not in ("http", "https") or not p.hostname:
        raise ErrorReferencia("El enlace debe empezar por http:// o https://")
    if PERMITIR_LOCAL:
        return
    try:
        direcciones = {i[4][0] for i in socket.getaddrinfo(p.hostname, p.port or 443, proto=socket.IPPROTO_TCP)}
    except socket.gaierror:
        raise ErrorReferencia("No pude encontrar ese sitio.", 502)
    for d in direcciones:
        ip = ipaddress.ip_address(d.split("%")[0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
            raise ErrorReferencia("Ese enlace apunta a una red privada. Usa un enlace público.")


def _abrir(url: str) -> requests.Response:
    for _ in range(MAX_SALTOS + 1):
        _revisar_destino(url)
        try:
            r = requests.get(url, stream=True, timeout=(8, 60), allow_redirects=False,
                             headers={"User-Agent": "PonchoStudio"})
        except requests.RequestException:
            raise ErrorReferencia("No pude descargar ese enlace.", 502)
        if r.status_code in (301, 302, 303, 307, 308) and r.headers.get("location"):
            url = urljoin(url, r.headers["location"])
            r.close()
            continue
        if r.status_code != 200:
            r.close()
            raise ErrorReferencia(f"El enlace respondió {r.status_code}.", 502)
        return r
    raise ErrorReferencia("El enlace redirige demasiadas veces.", 502)


def _cuadro(video: Path) -> str | None:
    """Primer cuadro del video como JPG (si hay ffmpeg). Sirve de miniatura y de referencia de imagen."""
    if not shutil.which("ffmpeg"):
        return None
    salida = video.with_suffix(".jpg")
    try:
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", "0.5", "-i", str(video), "-frames:v", "1",
                        "-q:v", "3", str(salida)], check=True, timeout=30)
    except (subprocess.SubprocessError, OSError):
        return None
    return f"/medios/{salida.name}" if salida.is_file() else None


def importar(url: str) -> dict:
    """Descarga el enlace a medios. Devuelve {"url","tipo","origen","cuadro"}."""
    url = (url or "").strip()
    if not url or len(url) > 2000:
        raise ErrorReferencia("Falta el enlace de la referencia.")
    r = _abrir(url)
    try:
        mime = (r.headers.get("content-type") or "").split(";")[0].strip().lower()
        ext = EXT_POR_MIME.get(mime) or Path(urlparse(url).path).suffix.lower()
        ext = ".jpg" if ext == ".jpeg" else ext
        tipo = tipo_de("x" + ext)
        if tipo is None:
            raise ErrorReferencia("Ese enlace no es una imagen, video ni audio.", 415)
        largo = r.headers.get("content-length")
        if largo and largo.isdigit() and int(largo) > MAX_BYTES:
            raise ErrorReferencia("La referencia pesa más de 50 MB.", 413)
        config.cfg.MEDIOS.mkdir(parents=True, exist_ok=True)
        destino = config.cfg.MEDIOS / f"ref_{secrets.token_hex(8)}{ext}"
        total = 0
        try:
            with open(destino, "wb") as f:
                for trozo in r.iter_content(256 * 1024):
                    total += len(trozo)
                    if total > MAX_BYTES:
                        raise ErrorReferencia("La referencia pesa más de 50 MB.", 413)
                    f.write(trozo)
            if total == 0:
                raise ErrorReferencia("El enlace vino vacío.", 502)
        except (ErrorReferencia, requests.RequestException, OSError) as e:
            destino.unlink(missing_ok=True)
            if isinstance(e, ErrorReferencia):
                raise
            raise ErrorReferencia("Se cortó la descarga de la referencia.", 502)
    finally:
        r.close()
    Path(str(destino) + ".origen").write_text(url, encoding="utf-8")
    return {"url": f"/medios/{destino.name}", "tipo": tipo, "origen": url,
            "cuadro": _cuadro(destino) if tipo == "video" else None}


def origen_de(ruta: str) -> str | None:
    """Enlace público del que se importó un archivo de medios, si se conoce."""
    marca = config.cfg.MEDIOS / (Path(ruta).name + ".origen")
    try:
        texto = marca.read_text(encoding="utf-8").strip()
    except OSError:
        return None
    return texto if texto.startswith(("http://", "https://")) else None


def mime_de(ruta: str) -> str:
    return mimetypes.guess_type(ruta)[0] or "application/octet-stream"
