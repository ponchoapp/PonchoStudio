"""Proveedores externos: Seedance, OpenAI, Ollama y Higgsfield (MCP)."""


class ErrorProveedor(Exception):
    """Error de un proveedor con mensaje corto en español.

    reintentable=True cuando vale la pena volver a intentar (429, 5xx, red).
    """

    def __init__(self, mensaje: str, codigo: int | None = None, reintentable: bool = False):
        super().__init__(mensaje)
        self.mensaje = mensaje
        self.codigo = codigo
        self.reintentable = reintentable
