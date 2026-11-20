// Capturas de PonchoStudio con Chrome headless por DevTools (sin extensiones: Bitwarden no estorba).
// Espera a que #contenido tenga algo real (no el bloque "Cargando") y unos segundos más para medios.
//
// Uso:  node tools/captura.mjs <carpeta> <prefijo> [ruta ...]
//   ej. node tools/captura.mjs docs/capturas/despues despues inicio video
// Variables: PONCHO_BASE (por defecto http://localhost:8010), ESPERA_MS (extra, por defecto 3500).
// Sale cada ruta en escritorio (1440x900) y celular (390x844, pantalla completa: fullPage).
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = process.env.PONCHO_BASE || "http://localhost:8010";
const ESPERA = Number(process.env.ESPERA_MS || 3500);
const TAMANOS = { escritorio: [1440, 900], celular: [390, 844] };
const [carpeta = "docs/capturas/tmp", prefijo = "cap", ...rutasArg] = process.argv.slice(2);
const rutas = rutasArg.length ? rutasArg : ["inicio", "video", "imagen", "audio", "estudios", "biblioteca", "ajustes"];
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function abrirChrome() {
  const perfil = mkdtempSync(join(tmpdir(), "cdp-captura-"));
  const puerto = 9300 + Math.floor(Math.random() * 500);
  const proc = spawn(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--mute-audio",
    `--remote-debugging-port=${puerto}`, `--user-data-dir=${perfil}`, "about:blank"], { stdio: "ignore" });
  for (let i = 0; i < 50; i++) {
    try {
      const lista = await (await fetch(`http://127.0.0.1:${puerto}/json/list`)).json();
      const pagina = lista.find((p) => p.type === "page");
      if (pagina) return { proc, perfil, ws: pagina.webSocketDebuggerUrl };
    } catch { /* aún no */ }
    await dormir(200);
  }
  proc.kill();
  throw new Error("Chrome no abrió el puerto de depuración");
}

function cliente(urlWs) {
  const ws = new WebSocket(urlWs);
  let id = 0;
  const pendientes = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pendientes.has(m.id)) { pendientes.get(m.id)(m); pendientes.delete(m.id); }
  };
  const listo = new Promise((r) => { ws.onopen = r; });
  const enviar = (method, params = {}) => new Promise((r) => { const n = ++id; pendientes.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
  return { listo, enviar, cerrar: () => ws.close() };
}

async function evaluar(c, expresion) {
  const r = await c.enviar("Runtime.evaluate", { expression: expresion, returnByValue: true, awaitPromise: true });
  return r.result && r.result.result ? r.result.result.value : undefined;
}

async function main() {
  mkdirSync(carpeta, { recursive: true });
  const { proc, perfil, ws } = await abrirChrome();
  const c = cliente(ws);
  await c.listo;
  await c.enviar("Page.enable");
  try {
    for (const ruta of rutas) {
      for (const [nombre, [w, h]] of Object.entries(TAMANOS)) {
        await c.enviar("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: nombre === "celular" });
        const hash = ruta === "inicio" ? "" : ruta;
        await c.enviar("Page.navigate", { url: `${BASE}/?c=${Date.now()}#/${hash}` });
        // Espera a que la vista monte algo distinto del bloque de carga (máx 20 s).
        for (let i = 0; i < 100; i++) {
          const ok = await evaluar(c, `(() => { const x = document.getElementById("contenido"); return !!x && x.children.length > 0 && !x.querySelector(".cargando-bloque"); })()`);
          if (ok) break;
          await dormir(200);
        }
        await dormir(ESPERA);
        const errores = await evaluar(c, `(window.__erroresCaptura || []).join(" | ")`);
        const r = await c.enviar("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
        const destino = resolve(carpeta, `${prefijo}-${ruta}-${nombre}.png`);
        writeFileSync(destino, Buffer.from(r.result.data, "base64"));
        console.log(destino + (errores ? `  ERRORES: ${errores}` : ""));
      }
    }
  } finally {
    c.cerrar();
    proc.kill();
    await dormir(500);
    try { rmSync(perfil, { recursive: true, force: true }); } catch { /* Chrome aún lo tiene */ }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
