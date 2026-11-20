"""`python -m app`: arranca el servidor y abre el navegador.

Opciones: --sin-navegador, --puerto N
"""

import sys
import threading
import webbrowser

import uvicorn

from app import VERSION, config


def principal() -> None:
    argumentos = sys.argv[1:]
    puerto = config.cfg.PUERTO
    if "--puerto" in argumentos:
        try:
            puerto = int(argumentos[argumentos.index("--puerto") + 1])
        except (IndexError, ValueError):
            print("Uso: python -m app --puerto 8010")
            sys.exit(2)
    url = f"http://localhost:{puerto}"
    print(f"PonchoStudio {VERSION} en {url}  (Ctrl+C para cerrar)")
    if "--sin-navegador" not in argumentos:
        threading.Timer(1.5, lambda: webbrowser.open(url)).start()
    uvicorn.run("app.main:app", host="127.0.0.1", port=puerto, log_level="warning")


if __name__ == "__main__":
    principal()
