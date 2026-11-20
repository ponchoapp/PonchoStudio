"""Seedream 5.5: tamaños, precio, cuerpo del pedido y trabajos contra un ModelArk falso (nunca el real)."""

import time

import pytest

from app import catalogo, trabajos
from app.proveedores import ErrorProveedor, seedream
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


def esperar(tid, estado="listo", segundos=20):
    fin = time.time() + segundos
    t = None
    while time.time() < fin:
        trabajos.tic()
        t = trabajos.obtener(tid)
        if t["estado"] in (estado, "fallo"):
            return t
        time.sleep(0.2)
    raise AssertionError(t)


def test_catalogo_publico(entorno):
    m = next(x for x in catalogo.catalogo_publico()["imagen"] if x["id"] == "seedream-5.5")
    assert m["proveedor"] == "seedream" and m["nuevo"] is True
    assert m["resoluciones"] == ["1k", "2k"] and "16:9" in m["formatos"]
    assert not any(k.startswith("_") for k in m)


@pytest.mark.parametrize("formato", catalogo.FORMATOS_SEEDREAM)
@pytest.mark.parametrize("resolucion", ["1k", "2k"])
def test_tamanos_dentro_de_lo_que_acepta_la_api(formato, resolucion):
    ancho, alto = catalogo.tamano_seedream(formato, resolucion)
    assert 921_600 <= ancho * alto <= 4_624_220          # doc: total de píxeles
    assert 1 / 16 <= ancho / alto <= 16                  # doc: relación de aspecto
    w, h = (int(x) for x in formato.split(":"))
    assert abs(ancho / alto - w / h) < 0.03


def test_costo_por_nivel(entorno):
    uno = catalogo.costo("imagen", "seedream-5.5", "1k", "1:1", variantes=1)
    dos = catalogo.costo("imagen", "seedream-5.5", "2k", "16:9", variantes=2)
    assert uno["usd"] == 0.02 and "1024x1024" in uno["detalle"]
    assert dos["usd"] == 0.07 and "BytePlus" in dos["detalle"]


def test_cuerpo(entorno):
    c = entorno()
    cuerpo = seedream.armar_cuerpo("un cóndor", "16:9", "1k")
    assert cuerpo["model"] == "dola-seedream-5-5-261028" and cuerpo["size"] == "1360x768"
    assert cuerpo["response_format"] == "b64_json" and cuerpo["output_format"] == "png"
    assert cuerpo["watermark"] is False and "background" not in cuerpo and "image" not in cuerpo
    assert seedream.armar_cuerpo("logo, fondo transparente", "1:1", "1k")["background"] == "transparent"
    (c.MEDIOS / "ref.png").write_bytes(png_degradado(4, 4))
    una = seedream.armar_cuerpo("p", "1:1", "1k", ["/medios/ref.png"])
    assert una["image"].startswith("data:image/png;base64,")
    varias = seedream.armar_cuerpo("p", "1:1", "1k", ["/medios/ref.png", "https://x.com/a.png"])
    assert isinstance(varias["image"], list) and varias["image"][1] == "https://x.com/a.png"
    with pytest.raises(ErrorProveedor):
        seedream.armar_cuerpo("p", "1:1", "1k", ["https://x.com/a.png"] * 11)


def test_modelo_configurable_por_env(entorno):
    entorno(SEEDREAM_MODEL="dola-seedream-5-5-999999")
    assert seedream.armar_cuerpo("p", "1:1", "1k")["model"] == "dola-seedream-5-5-999999"


def test_trabajo_con_referencia(ark):
    (ark.MEDIOS / "ref.png").write_bytes(png_degradado(4, 4))
    spec = trabajos.validar({"tipo": "imagen", "modelo": "seedream-5.5", "prompt": "un cóndor",
                             "ajustes": {"formato": "3:2", "resolucion": "1k"},
                             "entradas": {"referencias": ["/medios/ref.png"]}})
    [t] = trabajos.crear(spec)
    assert t["demo"] is False and t["costo_usd"] == 0.02
    fin = esperar(t["id"])
    assert fin["estado"] == "listo", fin
    assert len(ARK.imagenes) == 1 and ARK.imagenes[0]["image"].startswith("data:image/png;base64,")
    ancho, alto = catalogo.tamano_seedream("3:2", "1k")
    assert ARK.imagenes[0]["size"] == f"{ancho}x{alto}"
    nombre = fin["resultado"]["url"].rsplit("/", 1)[-1]
    assert (ark.MEDIOS / nombre).read_bytes()[:4] == b"\x89PNG"
    assert (fin["resultado"]["ancho"], fin["resultado"]["alto"]) == (ancho, alto)


def test_variantes_son_pedidos_separados(ark):
    spec = trabajos.validar({"tipo": "imagen", "modelo": "seedream-5.5", "prompt": "x",
                             "ajustes": {"variantes": 3, "resolucion": "2k"}})
    creados = trabajos.crear(spec)
    assert len(creados) == 3 and creados[0]["costo_usd"] == 0.035
    for t in creados:
        assert esperar(t["id"])["estado"] == "listo"
    assert len(ARK.imagenes) == 3


@pytest.mark.parametrize("codigo,texto", [(403, "activado Seedream"), (401, "ARK_API_KEY"), (429, "límite")])
def test_errores_en_espanol(ark, codigo, texto):
    ARK.forzar_codigo = codigo
    with pytest.raises(ErrorProveedor) as e:
        seedream.generar("p")
    assert texto in e.value.mensaje and e.value.codigo == codigo


def test_trabajo_con_error_queda_en_fallo(ark):
    ARK.forzar_codigo = 403
    [t] = trabajos.crear(trabajos.validar({"tipo": "imagen", "modelo": "seedream-5.5", "prompt": "x"}))
    fin = esperar(t["id"])
    assert fin["estado"] == "fallo" and "Seedream" in fin["error"]


def test_demo_sin_llave(entorno):
    entorno()
    demo, motivo = trabajos.es_demo("seedream")
    assert demo and "ARK_API_KEY" in motivo
    [t] = trabajos.crear(trabajos.validar({"tipo": "imagen", "modelo": "seedream-5.5", "prompt": "x"}))
    assert t["demo"] is True and t["costo_usd"] == 0.0
