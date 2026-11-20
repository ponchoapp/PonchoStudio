"""Pruebas de rutas contra un uvicorn real (sin llaves: modo demo)."""

import io
import time

import requests


def _png() -> bytes:
    from app.trabajos import png_degradado
    return png_degradado(8, 8)


def esperar(base, tid, estado="listo", segundos=20):
    fin = time.time() + segundos
    while time.time() < fin:
        t = requests.get(f"{base}/api/trabajos/{tid}").json()
        if t["estado"] == estado:
            return t
        time.sleep(0.5)
    raise AssertionError(f"El trabajo no llegó a {estado}: {t}")


def test_salud(servidor):
    r = requests.get(servidor["base"] + "/api/salud").json()
    from app import VERSION
    assert r["version"] == VERSION
    assert r["demo"] is True
    p = r["proveedores"]
    assert p["seedance"] == {"listo": False, "motivo": p["seedance"]["motivo"]}
    assert p["openai"]["listo"] is False
    assert p["openrouter"]["listo"] is False and p["seedream"]["listo"] is False
    assert p["seedream"]["modelo"] == "dola-seedream-5-5-261028"
    assert p["ollama"] == {"listo": False, "modelos": []}
    assert p["higgsfield"]["conectado"] is False


def test_catalogo_y_costo(servidor):
    b = servidor["base"]
    c = requests.get(b + "/api/catalogo").json()
    assert any(m["id"] == "seedance-2.5" for m in c["video"])
    assert any(m["id"] == "hf:kling4_0" for m in c["video"])
    r = requests.post(b + "/api/costo", json={"tipo": "video", "modelo": "seedance-2.5", "resolucion": "480p",
                                               "formato": "16:9", "duracion": 5, "variantes": 1})
    assert r.status_code == 200 and abs(r.json()["usd"] - 0.514) < 0.001
    r = requests.post(b + "/api/costo", json={"tipo": "video", "modelo": "hf:kling4_0"})
    assert r.json()["usd"] is None and "creditos" in r.json()
    r = requests.post(b + "/api/costo", json={"tipo": "video", "modelo": "nada"})
    assert r.status_code == 400 and "error" in r.json()


def test_generar_valida(servidor):
    b = servidor["base"] + "/api/generar"
    casos = [
        {"tipo": "video", "modelo": "seedance-2.5", "prompt": ""},
        {"tipo": "pintura", "modelo": "seedance-2.5", "prompt": "x"},
        {"tipo": "video", "modelo": "gpt-image-2", "prompt": "x"},
        {"tipo": "video", "modelo": "seedance-2.5", "prompt": "x", "ajustes": {"duracion": 31}},
        {"tipo": "video", "modelo": "seedance-2.0", "prompt": "x", "ajustes": {"duracion": 20}},
        {"tipo": "video", "modelo": "seedance-2.0-fast", "prompt": "x", "ajustes": {"resolucion": "1080p"}},
        {"tipo": "video", "modelo": "seedance-2.5", "prompt": "x", "ajustes": {"formato": "5:4"}},
        {"tipo": "imagen", "modelo": "gpt-image-2", "prompt": "x", "ajustes": {"calidad": "ultra"}},
        {"tipo": "imagen", "modelo": "gpt-image-2", "prompt": "x", "ajustes": {"variantes": 5}},
        {"tipo": "video", "modelo": "seedance-2.5", "prompt": "x", "entradas": {"primer_cuadro": "/etc/passwd"}},
        {"tipo": "video", "modelo": "seedance-2.5", "prompt": "x", "entradas": {"primer_cuadro": "/medios/no.png"}},
        {"tipo": "video", "modelo": "seedance-2.5", "prompt": "x", "estilo": "no-existe"},
    ]
    for caso in casos:
        r = requests.post(b, json=caso)
        assert r.status_code == 400, caso
        assert isinstance(r.json()["error"], str)
    r = requests.post(b, data="{no es json", headers={"Content-Type": "application/json"})
    assert r.status_code == 400


def test_higgsfield_pide_confirmacion(servidor):
    r = requests.post(servidor["base"] + "/api/generar",
                      json={"tipo": "video", "modelo": "hf:kling4_0", "prompt": "un perro"})
    assert r.status_code == 409
    d = r.json()
    assert d["pide_confirmacion"] is True and d["creditos"] is None and d["error"]


def test_flujo_demo_video(servidor):
    b = servidor["base"]
    r = requests.post(b + "/api/generar", json={
        "tipo": "video", "modelo": "seedance-2.5", "prompt": "Un cóndor sobre los Andes",
        "ajustes": {"resolucion": "720p", "formato": "9:16", "duracion": 5, "audio": True,
                    "semilla": None, "variantes": 2},
        "entradas": {"primer_cuadro": None, "ultimo_cuadro": None, "referencias": []},
        "estilo": None, "camara": None, "confirmar_creditos": False})
    assert r.status_code == 201
    ts = r.json()["trabajos"]
    assert len(ts) == 2
    t = ts[0]
    for campo in ("id", "tipo", "modelo", "proveedor", "prompt", "ajustes", "estado", "progreso",
                  "resultado", "error", "costo_usd", "creado", "terminado", "favorito", "demo"):
        assert campo in t
    assert t["id"].startswith("t_") and t["demo"] is True and t["estado"] == "en_cola"
    visto_generando = False
    fin = time.time() + 20
    while time.time() < fin:
        actual = requests.get(f"{b}/api/trabajos/{t['id']}").json()
        if actual["estado"] == "generando" and 0 < actual["progreso"] < 100:
            visto_generando = True
        if actual["estado"] == "listo":
            break
        time.sleep(0.4)
    assert actual["estado"] == "listo" and actual["progreso"] == 100 and visto_generando
    assert actual["resultado"]["url"] is None
    assert "demo" in actual["nota"]
    mini = requests.get(b + actual["resultado"]["miniatura"])
    assert mini.status_code == 200 and mini.content[:8] == b"\x89PNG\r\n\x1a\n"
    assert actual["terminado"]


def test_demo_imagen_favorito_repetir_borrar(servidor):
    b = servidor["base"]
    r = requests.post(b + "/api/generar", json={"tipo": "imagen", "modelo": "gpt-image-2",
                                                 "prompt": "Retrato de Poncho", "ajustes": {"formato": "2:3"}})
    assert r.status_code == 201
    t = esperar(b, r.json()["trabajos"][0]["id"])
    assert t["resultado"]["url"].startswith("/medios/")
    assert t["resultado"]["alto"] > t["resultado"]["ancho"]
    assert requests.get(b + t["resultado"]["url"]).status_code == 200

    f = requests.post(f"{b}/api/trabajos/{t['id']}/favorito").json()
    assert f["favorito"] is True
    favs = requests.get(b + "/api/trabajos?favoritos=1").json()["trabajos"]
    assert [x["id"] for x in favs] == [t["id"]]
    assert requests.post(f"{b}/api/trabajos/{t['id']}/favorito").json()["favorito"] is False

    rep = requests.post(f"{b}/api/trabajos/{t['id']}/repetir")
    assert rep.status_code == 201
    nuevo = rep.json()["trabajos"][0]
    assert nuevo["id"] != t["id"] and nuevo["ajustes"]["semilla"] is not None
    assert nuevo["ajustes"]["formato"] == "2:3"

    assert requests.delete(f"{b}/api/trabajos/{nuevo['id']}").json() == {"ok": True}
    assert requests.get(f"{b}/api/trabajos/{nuevo['id']}").status_code == 404
    assert requests.delete(f"{b}/api/trabajos/{nuevo['id']}").status_code == 404


def test_listar_y_paginar(servidor):
    b = servidor["base"]
    for i in range(3):
        requests.post(b + "/api/generar", json={"tipo": "imagen", "modelo": "gpt-image-2", "prompt": f"p{i}"})
    pagina1 = requests.get(b + "/api/trabajos?tipo=imagen&limite=2").json()
    assert len(pagina1["trabajos"]) == 2 and pagina1["siguiente"]
    pagina2 = requests.get(b + f"/api/trabajos?tipo=imagen&limite=2&antes={pagina1['siguiente']}").json()
    ids1 = {t["id"] for t in pagina1["trabajos"]}
    assert pagina2["trabajos"] and not ids1 & {t["id"] for t in pagina2["trabajos"]}
    assert all(t["tipo"] == "imagen" for t in pagina2["trabajos"])
    assert requests.get(b + "/api/trabajos?estado=raro").status_code == 400


def test_subir(servidor):
    b = servidor["base"] + "/api/subir"
    r = requests.post(b, files={"archivo": ("foto.png", io.BytesIO(_png()), "image/png")})
    assert r.status_code == 200
    d = r.json()
    assert d["tipo"] == "imagen" and d["url"].startswith("/medios/") and d["url"].endswith(".png")
    assert requests.get(servidor["base"] + d["url"]).status_code == 200
    # se puede usar como primer cuadro
    g = requests.post(servidor["base"] + "/api/generar", json={
        "tipo": "video", "modelo": "seedance-2.5", "prompt": "anima la foto",
        "entradas": {"primer_cuadro": d["url"]}})
    assert g.status_code == 201
    assert requests.post(b, files={"archivo": ("virus.exe", b"MZ", "application/octet-stream")}).status_code == 415
    assert requests.post(b, files={"archivo": ("falso.png", b"abc", "text/plain")}).status_code == 415
    assert requests.post(b, files={"otro": ("a.png", b"abc", "image/png")}).status_code == 400
    antes = set((servidor["datos"] / "medios").iterdir())
    grande = requests.post(b, files={"archivo": ("enorme.mp4", b"\0" * (51 * 1024 * 1024), "video/mp4")})
    assert grande.status_code == 413 and "50 MB" in grande.json()["error"]
    assert set((servidor["datos"] / "medios").iterdir()) == antes  # no deja basura


def test_prompts_guardados(servidor):
    b = servidor["base"] + "/api/prompts/guardados"
    r = requests.post(b, json={"nombre": "Cóndor", "prompt": "Un cóndor vuela", "tipo": "video"})
    assert r.status_code == 201
    pid = r.json()["id"]
    lista = requests.get(b).json()["prompts"]
    assert any(p["id"] == pid and p["nombre"] == "Cóndor" for p in lista)
    assert requests.post(b, json={"nombre": "x", "prompt": ""}).status_code == 400
    assert requests.delete(f"{b}/{pid}").json() == {"ok": True}
    assert requests.delete(f"{b}/{pid}").status_code == 404


def test_presets_y_mejorar(servidor):
    b = servidor["base"]
    p = requests.get(b + "/api/presets").json()
    assert set(p) == {"estilos", "camaras", "plantillas"}
    r = requests.post(b + "/api/prompts/mejorar", json={"prompt": "un perro en la playa", "tipo": "video",
                                                         "modelo": "seedance-2.5", "motor": "auto"})
    assert r.status_code == 200
    assert r.json()["motor"] == "reglas" and "un perro en la playa" in r.json()["prompt"]
    assert requests.post(b + "/api/prompts/mejorar", json={"prompt": ""}).status_code == 400


def test_higgsfield_y_ollama_apagados(servidor):
    b = servidor["base"]
    assert requests.get(b + "/api/higgsfield/estado").json() == {
        "conectado": False, "cuenta": None, "creditos": None, "herramientas": []}
    assert requests.post(b + "/api/higgsfield/aprender").status_code == 409
    assert requests.post(b + "/api/higgsfield/desconectar").json() == {"ok": True}
    assert requests.get(b + "/api/ollama/modelos").json() == {"modelos": []}
    r = requests.get(b + "/api/higgsfield/conectar", allow_redirects=False)
    assert r.status_code == 502 and "error" in r.json()


def test_ruta_api_desconocida_da_json(servidor):
    r = requests.get(servidor["base"] + "/api/no-existe")
    assert r.status_code == 404 and "error" in r.json()


def _subir(base, nombre, mime, datos):
    r = requests.post(base + "/api/subir", files={"archivo": (nombre, datos, mime)})
    assert r.status_code in (200, 201), r.text
    return r.json()["url"]


def test_imagen_no_acepta_video_de_referencia(servidor):
    """gpt-image-2 (y cualquier modelo que no sea Seedance) solo recibe imágenes como referencia."""
    b = servidor["base"]
    video = _subir(b, "clip.mp4", "video/mp4", b"\x00\x00\x00\x18ftypmp42" + b"0" * 64)
    foto = _subir(b, "f.png", "image/png", b"\x89PNG\r\n\x1a\n" + b"0" * 32)
    base = {"tipo": "imagen", "modelo": "gpt-image-2", "prompt": "un gato",
            "ajustes": {"calidad": "low", "formato": "1:1", "variantes": 1}}
    r = requests.post(b + "/api/generar", json={**base, "entradas": {"referencias": [video]}})
    assert r.status_code == 400 and "imágenes" in r.json()["error"]
    ok = requests.post(b + "/api/generar", json={**base, "entradas": {"referencias": [foto]}})
    assert ok.status_code == 201


def test_seedance_si_acepta_video_de_referencia(servidor):
    b = servidor["base"]
    video = _subir(b, "clip.mp4", "video/mp4", b"\x00\x00\x00\x18ftypmp42" + b"0" * 64)
    r = requests.post(b + "/api/generar", json={
        "tipo": "video", "modelo": "seedance-2.5", "prompt": "cambia el fondo",
        "ajustes": {"resolucion": "480p", "formato": "16:9", "duracion": 4, "audio": False, "variantes": 1},
        "entradas": {"referencias": [video]}})
    assert r.status_code == 201
