// Cliente del contrato API de PonchoStudio (docs/CONTRATO_API.md).
// Todos los errores muestran un toast salvo que se pida { silencioso: true }.
import { toast, confirmar } from "./ui.js";

export class ErrorApi extends Error {
  constructor(mensaje, estado, datos) {
    super(mensaje);
    this.estado = estado;
    this.datos = datos || {};
  }
}

async function pedir(metodo, ruta, cuerpo, opciones = {}) {
  const init = { method: metodo, headers: { Accept: "application/json" } };
  if (cuerpo instanceof FormData) {
    init.body = cuerpo;
  } else if (cuerpo !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(cuerpo);
  }
  let resp;
  try {
    resp = await fetch(ruta, init);
  } catch (e) {
    const err = new ErrorApi("No hay conexión con PonchoStudio. Revisa que la app esté abierta.", 0);
    if (!opciones.silencioso) toast(err.message, "error");
    throw err;
  }
  let datos = null;
  const tipo = resp.headers.get("content-type") || "";
  if (tipo.includes("application/json")) {
    try { datos = await resp.json(); } catch { datos = null; }
  }
  if (!resp.ok) {
    const mensaje = (datos && datos.error) || `La app respondió con error ${resp.status}.`;
    const err = new ErrorApi(mensaje, resp.status, datos);
    const callar = opciones.silencioso || (opciones.callar && opciones.callar.includes(resp.status));
    if (!callar) toast(mensaje, "error");
    throw err;
  }
  return datos;
}

const qs = (obj) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj || {})) {
    if (v !== undefined && v !== null && v !== "") p.set(k, v);
  }
  const s = p.toString();
  return s ? `?${s}` : "";
};

// Cachés simples para datos que casi no cambian.
let cacheCatalogo = null;
let cachePresets = null;

export const api = {
  salud: (o) => pedir("GET", "/api/salud", undefined, o),
  catalogo: async (forzar = false) => {
    if (!cacheCatalogo || forzar) cacheCatalogo = pedir("GET", "/api/catalogo").catch((e) => { cacheCatalogo = null; throw e; });
    return cacheCatalogo;
  },
  presets: async (forzar = false) => {
    if (!cachePresets || forzar) cachePresets = pedir("GET", "/api/presets").catch((e) => { cachePresets = null; throw e; });
    return cachePresets;
  },
  costo: (cuerpo) => pedir("POST", "/api/costo", cuerpo, { silencioso: true }),
  generar: (cuerpo) => pedir("POST", "/api/generar", cuerpo, { callar: [409] }),
  subir: (archivo) => {
    const fd = new FormData();
    fd.append("archivo", archivo);
    return pedir("POST", "/api/subir", fd);
  },
  trabajos: (filtros, o) => pedir("GET", "/api/trabajos" + qs(filtros), undefined, o),
  trabajo: (id) => pedir("GET", `/api/trabajos/${encodeURIComponent(id)}`),
  favorito: (id) => pedir("POST", `/api/trabajos/${encodeURIComponent(id)}/favorito`),
  borrar: (id) => pedir("DELETE", `/api/trabajos/${encodeURIComponent(id)}`),
  repetir: (id, cuerpo) => pedir("POST", `/api/trabajos/${encodeURIComponent(id)}/repetir`, cuerpo, { callar: [409] }),
  mejorar: (cuerpo) => pedir("POST", "/api/prompts/mejorar", cuerpo),
  guardados: () => pedir("GET", "/api/prompts/guardados"),
  guardarPrompt: (cuerpo) => pedir("POST", "/api/prompts/guardados", cuerpo),
  borrarPrompt: (id) => pedir("DELETE", `/api/prompts/guardados/${encodeURIComponent(id)}`),
  higgsfieldEstado: (o) => pedir("GET", "/api/higgsfield/estado", undefined, o),
  higgsfieldDesconectar: () => pedir("POST", "/api/higgsfield/desconectar"),
  higgsfieldAprender: () => pedir("POST", "/api/higgsfield/aprender"),
  higgsfieldPresets: (o) => pedir("GET", "/api/higgsfield/presets", undefined, o),
  higgsfieldGaleria: (q, o) => pedir("GET", "/api/higgsfield/galeria" + qs(q), undefined, o),
  higgsfieldRecrear: (presetId) => pedir("POST", "/api/higgsfield/recrear", { preset_id: presetId }),
  miniaturasCosto: () => pedir("POST", "/api/plantillas/miniaturas/costo", {}, { silencioso: true }),
  miniaturasCrear: () => pedir("POST", "/api/plantillas/miniaturas", {}),
  miniaturasEstado: () => pedir("GET", "/api/plantillas/miniaturas/estado", undefined, { silencioso: true }),
  ollamaModelos: (o) => pedir("GET", "/api/ollama/modelos", undefined, o),
  llaves: (o) => pedir("GET", "/api/llaves", undefined, o),
  guardarLlaves: (cuerpo) => pedir("POST", "/api/llaves", cuerpo),
  rutaConectarHiggsfield: "/api/higgsfield/conectar",
};

// Genera y, si el backend pide confirmar créditos de Higgsfield (409), pregunta y reenvía.
// Devuelve la lista de trabajos creados o null si se canceló.
export async function generarConfirmando(cuerpo, enviar = api.generar) {
  try {
    const r = await enviar({ ...cuerpo, confirmar_creditos: false });
    return r.trabajos || [];
  } catch (e) {
    if (e.estado === 409 && e.datos && e.datos.pide_confirmacion) {
      const n = e.datos.creditos;
      const si = await confirmar({
        titulo: "Esto gasta créditos de Higgsfield",
        texto: (e.datos.error ? e.datos.error + " " : "") +
          (n != null ? `Costo estimado: ${n} créditos de tu cuenta.` : "Higgsfield no dijo cuántos créditos cuesta."),
        aceptar: n != null ? `Gastar ${n} créditos` : "Gastar créditos",
        cancelar: "No generar",
      });
      if (!si) return null;
      const r = await enviar({ ...cuerpo, confirmar_creditos: true });
      return r.trabajos || [];
    }
    if (e.estado === 409) toast(e.message, "error");
    throw e;
  }
}
