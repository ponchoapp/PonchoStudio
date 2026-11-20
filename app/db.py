"""SQLite en data/studio.db. Una conexión compartida protegida con un candado."""

from __future__ import annotations

import sqlite3
import threading
from pathlib import Path

from app import config

# Cada migración se corre una sola vez, en orden. Nunca editar una ya publicada: agregar otra.
MIGRACIONES = [
    # 1: tablas base
    """
    CREATE TABLE trabajos (
        id TEXT PRIMARY KEY,
        tipo TEXT NOT NULL,
        modelo TEXT NOT NULL,
        proveedor TEXT NOT NULL,
        prompt TEXT NOT NULL,
        prompt_final TEXT NOT NULL DEFAULT '',
        ajustes TEXT NOT NULL DEFAULT '{}',
        entradas TEXT NOT NULL DEFAULT '{}',
        estilo TEXT,
        camara TEXT,
        estado TEXT NOT NULL DEFAULT 'en_cola',
        progreso INTEGER NOT NULL DEFAULT 0,
        resultado TEXT,
        error TEXT,
        costo_usd REAL,
        creado TEXT NOT NULL,
        iniciado TEXT,
        terminado TEXT,
        favorito INTEGER NOT NULL DEFAULT 0,
        demo INTEGER NOT NULL DEFAULT 0,
        nota TEXT,
        tarea_remota TEXT
    );
    CREATE INDEX idx_trabajos_tipo ON trabajos(tipo);
    CREATE INDEX idx_trabajos_estado ON trabajos(estado);
    CREATE TABLE prompts_guardados (
        id TEXT PRIMARY KEY,
        nombre TEXT NOT NULL,
        prompt TEXT NOT NULL,
        tipo TEXT NOT NULL DEFAULT 'video',
        creado TEXT NOT NULL
    );
    CREATE TABLE ajustes (
        clave TEXT PRIMARY KEY,
        valor TEXT
    );
    """,
]

_candado = threading.RLock()
_conexion: sqlite3.Connection | None = None
_ruta: Path | None = None


def iniciar(ruta: Path | None = None) -> sqlite3.Connection:
    """Abre la base (crea carpeta y tablas). Se puede llamar varias veces."""
    global _conexion, _ruta
    ruta = Path(ruta or config.cfg.DB)
    with _candado:
        if _conexion is not None and _ruta == ruta:
            return _conexion
        if _conexion is not None:
            _conexion.close()
        ruta.parent.mkdir(parents=True, exist_ok=True)
        con = sqlite3.connect(str(ruta), check_same_thread=False, timeout=10)
        con.row_factory = sqlite3.Row
        con.execute("PRAGMA journal_mode=WAL")
        con.execute("PRAGMA foreign_keys=ON")
        _migrar(con)
        _conexion, _ruta = con, ruta
        return con


def _migrar(con: sqlite3.Connection) -> None:
    version = con.execute("PRAGMA user_version").fetchone()[0]
    for numero, sql in enumerate(MIGRACIONES, start=1):
        if numero <= version:
            continue
        con.executescript(sql)
        con.execute(f"PRAGMA user_version = {numero}")
        con.commit()


def cerrar() -> None:
    global _conexion, _ruta
    with _candado:
        if _conexion is not None:
            _conexion.close()
        _conexion, _ruta = None, None


def _con() -> sqlite3.Connection:
    return _conexion if _conexion is not None else iniciar()


def ejecutar(sql: str, parametros: tuple | list = ()) -> int:
    """INSERT/UPDATE/DELETE. Devuelve filas afectadas."""
    with _candado:
        con = _con()
        cur = con.execute(sql, parametros)
        con.commit()
        return cur.rowcount


def uno(sql: str, parametros: tuple | list = ()) -> dict | None:
    with _candado:
        fila = _con().execute(sql, parametros).fetchone()
        return dict(fila) if fila else None


def todos(sql: str, parametros: tuple | list = ()) -> list[dict]:
    with _candado:
        return [dict(f) for f in _con().execute(sql, parametros).fetchall()]


def leer_ajuste(clave: str, defecto: str | None = None) -> str | None:
    fila = uno("SELECT valor FROM ajustes WHERE clave = ?", (clave,))
    return fila["valor"] if fila else defecto


def guardar_ajuste(clave: str, valor: str | None) -> None:
    ejecutar("INSERT INTO ajustes(clave, valor) VALUES(?, ?) "
             "ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor", (clave, valor))
