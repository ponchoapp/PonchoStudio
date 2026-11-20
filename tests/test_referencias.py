"""Importar referencias desde un enlace y mandarlas a Seedance según su tipo."""
import http.server

import pytest

from app import referencias
from app.proveedores import ErrorProveedor, seedance
from app.trabajos import png_degradado
from tests.falsos import arrancar

PNG = png_degradado(4, 4)


class Medios(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        rutas = {"/foto": ("image/png", PNG), "/clip.mp4": ("video/mp4", b"\x00\x00\x00\x18ftypmp42" + b"0" * 64),
                 "/texto": ("text/html", b"<html>"), "/vacio.png": ("image/png", b"")}
        if self.path == "/salto":
            self.send_response(302)
            self.send_header("Location", "/foto")
            self.end_headers()
            return
        if self.path not in rutas:
            self.send_response(404)
            self.end_headers()
            return
        mime, datos = rutas[self.path]
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(datos)))
        self.end_headers()
        self.wfile.write(datos)


@pytest.fixture
def web(entorno, monkeypatch):
    c = entorno()
    servidor, base = arrancar(Medios)
    monkeypatch.setattr(referencias, "PERMITIR_LOCAL", True)
    yield c, base
    servidor.shutdown()


def test_importa_imagen_y_sigue_redireccion(web):
    c, base = web
    r = referencias.importar(base + "/salto")
    assert r["tipo"] == "imagen" and r["url"].startswith("/medios/ref_") and r["url"].endswith(".png")
    assert (c.MEDIOS / r["url"].split("/")[-1]).read_bytes() == PNG
    assert referencias.origen_de(r["url"]) == base + "/salto"


def test_video_va_a_seedance_por_enlace_publico(web):
    c, base = web
    r = referencias.importar(base + "/clip.mp4")
    assert r["tipo"] == "video"
    foto = referencias.importar(base + "/foto")
    cuerpo = seedance.armar_cuerpo("seedance-2.5", "p", {"formato": "9:16"},
                                   {"referencias": [r["url"], foto["url"]]})
    video, imagen = cuerpo["content"][1], cuerpo["content"][2]
    assert video == {"type": "video_url", "video_url": {"url": base + "/clip.mp4"}, "role": "reference_video"}
    assert imagen["role"] == "reference_image" and imagen["image_url"]["url"].startswith("data:image/png;base64,")


def test_video_subido_sin_enlace_da_error_claro(web):
    c, _ = web
    (c.MEDIOS / "sub_x.mp4").write_bytes(b"0" * 10)
    with pytest.raises(ErrorProveedor, match="enlace público"):
        seedance.armar_cuerpo("seedance-2.5", "p", {}, {"referencias": ["/medios/sub_x.mp4"]})


@pytest.mark.parametrize("ruta,codigo", [("/texto", 415), ("/nada", 502), ("/vacio.png", 502)])
def test_rechaza(web, ruta, codigo):
    c, base = web
    antes = set(c.MEDIOS.iterdir())
    with pytest.raises(referencias.ErrorReferencia) as e:
        referencias.importar(base + ruta)
    assert e.value.codigo == codigo
    assert set(c.MEDIOS.iterdir()) == antes


@pytest.mark.parametrize("url", ["http://127.0.0.1:8010/api/llaves", "http://localhost/x.png",
                                 "http://192.168.1.1/a.png", "file:///C:/Windows/win.ini", ""])
def test_no_deja_pedir_a_la_red_local(entorno, url):
    entorno()
    with pytest.raises(referencias.ErrorReferencia):
        referencias.importar(url)
