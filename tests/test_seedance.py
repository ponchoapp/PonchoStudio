"""Seedance: cuerpo del pedido, errores y cola con límite de 3, contra un ModelArk falso."""

import base64
import time

import pytest

from app import trabajos
from app.proveedores import ErrorProveedor, seedance
from app.trabajos import png_degradado
from tests.falsos import ARK, ManejadorArk, arrancar


@pytest.fixture
def ark(entorno):
    servidor, base = arrancar(ManejadorArk)
    ARK.reiniciar()
    ARK.base = base
    c = entorno(ARK_API_KEY="llave-falsa", SEEDANCE_BASE_URL=base + "/api/v3")
    yield c
    servidor.shutdown()


def test_cuerpo_texto(entorno):
    cuerpo = seedance.armar_cuerpo("seedance-2.5", "a condor", {"resolucion": "720p", "formato": "9:16",
                                                                "duracion": 8, "audio": False, "semilla": 7}, {})
    assert cuerpo == {"model": "dreamina-seedance-2-5-260628",
                      "content": [{"type": "text", "text": "a condor"}],
                      "resolution": "720p", "ratio": "9:16", "duration": 8,
                      "generate_audio": False, "watermark": False, "seed": 7}


def test_cuerpo_con_imagen_local(entorno):
    c = entorno()
    (c.MEDIOS / "foto.png").write_bytes(png_degradado(4, 4))
    entradas = {"primer_cuadro": "/medios/foto.png", "ultimo_cuadro": "https://x.com/b.png",
                "referencias": ["/medios/foto.png"]}
    cuerpo = seedance.armar_cuerpo("seedance-2.5", "p", {"formato": "16:9"}, entradas)
    assert cuerpo["ratio"] == "adaptive"
    assert "seed" not in cuerpo
    roles = [x.get("role") for x in cuerpo["content"]]
    assert roles == [None, "first_frame", "last_frame", "reference_image"]
    url = cuerpo["content"][1]["image_url"]["url"]
    assert url.startswith("data:image/png;base64,")
    assert base64.b64decode(url.split(",", 1)[1])[:4] == b"\x89PNG"
    assert cuerpo["content"][2]["image_url"]["url"] == "https://x.com/b.png"
    # la serie 2.0 no usa adaptive
    assert seedance.armar_cuerpo("seedance-2.0", "p", {"formato": "16:9"}, entradas)["ratio"] == "16:9"


def test_errores_en_espanol(ark, entorno):
    ARK.forzar_codigo = 429
    with pytest.raises(ErrorProveedor) as e:
        seedance.crear("seedance-2.5", "p", {}, {})
    assert e.value.reintentable and "3" in e.value.mensaje
    ARK.forzar_codigo = None
    entorno(ARK_API_KEY="otra")
    with pytest.raises(ErrorProveedor) as e:
        seedance.crear("seedance-2.5", "p", {}, {})
    assert e.value.codigo == 401 and "ARK_API_KEY" in e.value.mensaje


def test_cola_maximo_tres_y_costo_real(ark):
    spec = trabajos.validar({"tipo": "video", "modelo": "seedance-2.5", "prompt": "a condor",
                             "ajustes": {"resolucion": "480p", "formato": "16:9", "duracion": 5,
                                         "variantes": 4, "semilla": 10}})
    creados = trabajos.crear(spec)
    assert len(creados) == 4 and not any(t["demo"] for t in creados)
    assert creados[0]["costo_usd"] == pytest.approx(0.514, abs=1e-3)
    trabajos.tic()
    estados = [trabajos.obtener(t["id"])["estado"] for t in creados]
    assert estados.count("generando") == 3 and estados.count("en_cola") == 1
    assert [c["seed"] for c in ARK.cuerpos] == [10, 11, 12]
    trabajos.INTERVALO_REMOTO = 0
    try:
        fin = time.time() + 20
        while time.time() < fin:
            trabajos.tic()
            actuales = [trabajos.obtener(t["id"]) for t in creados]
            if all(a["estado"] == "listo" for a in actuales):
                break
            time.sleep(0.2)
    finally:
        trabajos.INTERVALO_REMOTO = 5
    assert all(a["estado"] == "listo" for a in actuales), actuales
    assert len(ARK.cuerpos) == 4
    a = actuales[0]
    assert a["resultado"]["url"] == f"/medios/{a['id']}.mp4"
    assert a["costo_usd"] == pytest.approx(48037 / 1e6 * 10.7, abs=1e-4)
    assert (ark.MEDIOS / f"{a['id']}.mp4").read_bytes() == b"video-falso-de-seedance"
