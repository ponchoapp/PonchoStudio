"""OpenRouter como plan B de Seedance: solo cuando corresponde y NUNCA doble gasto."""

import time

import pytest

from app import catalogo, config, trabajos
from app.proveedores import ErrorProveedor, openrouter
from app.trabajos import png_degradado
from tests.falsos import ARK, OR, ManejadorArk, ManejadorOpenRouter, arrancar


@pytest.fixture
def mundo(entorno):
    """ModelArk y OpenRouter falsos. aplicar(ark=, router=) reconfigura las llaves."""
    s1, base_ark = arrancar(ManejadorArk)
    s2, base_or = arrancar(ManejadorOpenRouter)
    ARK.reiniciar()
    ARK.base = base_ark
    OR.reiniciar()
    OR.base = base_or

    def aplicar(ark=True, router=True, **extra):
        env = {"SEEDANCE_BASE_URL": base_ark + "/api/v3", "OPENROUTER_BASE_URL": base_or + "/api/v1",
               "ARK_API_KEY": "llave-falsa" if ark else "", "OPENROUTER_API_KEY": "llave-or" if router else ""}
        env.update(extra)
        return entorno(**env)

    yield aplicar
    s1.shutdown()
    s2.shutdown()
    trabajos.INTERVALO_REMOTO = 5


def nuevo(**ajustes):
    spec = trabajos.validar({"tipo": "video", "modelo": "seedance-2.5", "prompt": "un cóndor",
                             "ajustes": dict({"resolucion": "480p", "formato": "16:9", "duracion": 5}, **ajustes)})
    return trabajos.crear(spec)[0]


def correr(tid, hasta=("listo", "fallo"), segundos=20):
    trabajos.INTERVALO_REMOTO = 0
    fin = time.time() + segundos
    t = None
    while time.time() < fin:
        trabajos.tic()
        t = trabajos.obtener(tid)
        if t["estado"] in hasta:
            return t
        time.sleep(0.2)
    raise AssertionError(t)


def test_cuerpo_segun_la_doc(entorno):
    c = entorno()
    (c.MEDIOS / "f.png").write_bytes(png_degradado(4, 4))
    cuerpo = openrouter.armar_cuerpo("seedance-2.5-flash", "p", {"resolucion": "720p", "formato": "9:16",
                                                                  "duracion": 6, "audio": False, "semilla": 3}, {})
    assert cuerpo == {"model": "bytedance/seedance-2.5-flash", "prompt": "p", "resolution": "720p",
                      "duration": 6, "generate_audio": False, "aspect_ratio": "9:16", "seed": 3}
    con = openrouter.armar_cuerpo("seedance-2.5", "p", {}, {"primer_cuadro": "/medios/f.png",
                                                            "referencias": ["/medios/f.png"]})
    assert con["frame_images"][0]["frame_type"] == "first_frame"
    assert con["frame_images"][0]["image_url"]["url"].startswith("data:image/png;base64,")
    assert con["input_references"][0]["type"] == "image_url"
    assert "aspect_ratio" not in con
    assert {m["_openrouter_id"] for m in catalogo.VIDEO} == {
        "bytedance/seedance-2.5", "bytedance/seedance-2.5-flash", "bytedance/seedance-2.0",
        "bytedance/seedance-2.0-fast"}


def test_sin_llave_de_byteplus_va_por_openrouter(mundo):
    mundo(ark=False)
    assert trabajos.es_demo("seedance") == (False, None)
    t = nuevo()
    assert "OpenRouter (plan B)" in t["nota"] and not t["demo"]
    assert t["costo_usd"] == pytest.approx(0.1028 * 5, abs=1e-4)      # aproximado, por segundo
    fin = correr(t["id"])
    assert fin["estado"] == "listo", fin
    assert ARK.cuerpos == [] and len(OR.cuerpos) == 1                 # BytePlus ni se tocó
    assert fin["costo_usd"] == 0.5                                    # usage.cost real
    assert "OpenRouter (plan B)" in fin["nota"]
    archivo = config.cfg.MEDIOS / fin["resultado"]["url"].rsplit("/", 1)[-1]
    assert archivo.read_bytes() == b"video-falso-de-openrouter" and OR.descargas_con_llave == 1


def test_cuenta_sin_permiso_pasa_a_openrouter(mundo):
    mundo()
    ARK.forzar_codigo = 403           # BytePlus rechaza la creación: no se creó ninguna tarea
    t = nuevo()
    fin = correr(t["id"])
    assert fin["estado"] == "listo", fin
    assert ARK.cuerpos == [] and len(OR.cuerpos) == 1
    assert "plan B" in fin["nota"] and "403" in fin["nota"]


def test_si_byteplus_funciona_no_se_toca_openrouter(mundo):
    mundo()
    fin = correr(nuevo()["id"])
    assert fin["estado"] == "listo" and len(ARK.cuerpos) == 1
    assert OR.cuerpos == [] and OR.sondeos == 0


def test_limite_de_tareas_429_no_es_plan_b(mundo):
    mundo()
    ARK.forzar_codigo = 429
    t = nuevo()
    trabajos.tic()
    assert OR.cuerpos == []
    assert trabajos.obtener(t["id"])["estado"] == "en_cola"          # espera turno en BytePlus


def test_nunca_doble_gasto(mundo):
    """Una tarea ya creada en BytePlus que falla después NO se reenvía a OpenRouter."""
    mundo()
    t = nuevo()
    trabajos.tic()
    assert len(ARK.cuerpos) == 1
    ARK.fallar_sondeo = True
    fin = correr(t["id"])
    assert fin["estado"] == "fallo" and "Seedance falló" in fin["error"]
    trabajos.tic()
    trabajos.tic()
    assert OR.cuerpos == [] and OR.sondeos == 0


def test_sin_ninguna_llave_es_demo(mundo):
    mundo(ark=False, router=False)
    assert trabajos.es_demo("seedance")[0] is True
    assert nuevo()["demo"] is True


def test_plan_b_falla_en_limpio(mundo):
    mundo(ark=False)
    OR.forzar_codigo = 402
    fin = correr(nuevo()["id"])
    assert fin["estado"] == "fallo" and "saldo" in fin["error"]


def test_costo_via_openrouter(entorno):
    r = catalogo.costo("video", "seedance-2.5-flash", "720p", "16:9", 10, 1, None, "openrouter")
    assert r["usd"] == pytest.approx(0.6726, abs=1e-4) and "aproximado" in r["detalle"]
    assert catalogo.costo("video", "seedance-2.5-flash", "720p", "16:9", 10)["usd"] != r["usd"]


def test_error_de_llave_en_espanol(mundo):
    mundo()
    OR.forzar_codigo = 401
    with pytest.raises(ErrorProveedor) as e:
        openrouter.crear("seedance-2.5", "p", {}, {})
    assert "OPENROUTER_API_KEY" in e.value.mensaje
