// Ajustes: estado de conexiones y guía de llaves.
import { api } from "../api.js";
import { el, limpiar, icono, toast, confirmar } from "../ui.js";

const luz = (si, txtSi = "Listo", txtNo = "Sin configurar") =>
  el("span", { class: `luz ${si ? "luz-si" : "luz-no"}` }, si ? txtSi : txtNo);

function tarjeta({ sigla, nombre, sub, estado, cuerpo = [], acciones = [] }) {
  return el("article", { class: "conexion" },
    el("div", { class: "conexion-cabeza" },
      el("span", { class: "modelo-icono", "aria-hidden": "true" }, sigla),
      el("div", {}, el("h2", { style: { fontSize: "15px" } }, nombre), el("small", {}, sub)),
      estado),
    cuerpo,
    acciones.length ? el("div", { class: "conexion-acciones" }, acciones) : null);
}

export async function montar(raiz, ctx) {
  const zona = el("div", { class: "conexiones" });
  const btnRevisar = el("button", { class: "btn btn-chico", type: "button" }, icono("repetir"), "Revisar conexiones");
  raiz.append(el("div", { class: "pagina" },
    el("div", { class: "pagina-cabeza" }, el("h1", {}, "Ajustes"), el("p", {}, "Conexiones de PonchoStudio con cada servicio. Las llaves viven en el archivo .env, nunca en la app.")),
    el("section", { class: "seccion", "aria-labelledby": "con-titulo" },
      el("div", { class: "seccion-cabeza" }, el("h2", { id: "con-titulo" }, "Conexiones"), btnRevisar),
      zona),
    guia()));

  async function pintar() {
    const salud = await ctx.recargarSalud();
    const hfEstado = await api.higgsfieldEstado({ silencioso: true }).catch(() => null);
    if (!salud) {
      limpiar(zona, el("div", { class: "vacio" }, el("strong", {}, "No hay respuesta de la app"),
        el("span", {}, "Abre PonchoStudio con ABRIR.bat y toca «Revisar conexiones».")));
      return;
    }
    const p = salud.proveedores || {};
    const sd = p.seedance || {}, oa = p.openai || {}, ol = p.ollama || {}, hf = p.higgsfield || {};
    const conectado = !!((hfEstado && hfEstado.conectado) || hf.conectado);

    const btnAprender = el("button", { class: "btn btn-primario", type: "button" }, icono("libro"), "Aprender de Higgsfield");
    btnAprender.onclick = async () => {
      btnAprender.disabled = true; btnAprender.lastChild.textContent = "Leyendo Higgsfield…";
      try {
        const r = await api.higgsfieldAprender();
        toast(`Listo: ${r.nuevos} prompts nuevos, ${r.total} en total.`, "ok");
        api.presets(true).catch(() => {});
      } catch { /* toast */ } finally { btnAprender.disabled = false; btnAprender.lastChild.textContent = "Aprender de Higgsfield"; }
    };
    const btnDesconectar = el("button", { class: "btn btn-fantasma", type: "button" }, "Desconectar");
    btnDesconectar.onclick = async () => {
      if (!await confirmar({ titulo: "¿Desconectar Higgsfield?", texto: "Se borra el acceso guardado. Para volver, inicias sesión otra vez.", aceptar: "Desconectar" })) return;
      try { await api.higgsfieldDesconectar(); toast("Higgsfield desconectado.", "ok"); pintar(); } catch { /* toast */ }
    };

    limpiar(zona,
      tarjeta({
        sigla: "SD", nombre: "Seedance (BytePlus)", sub: "Video directo, sin intermediario", estado: luz(sd.listo),
        cuerpo: [el("p", { class: "nota" }, sd.listo ? "Llave ARK_API_KEY encontrada." : (sd.motivo || "Falta ARK_API_KEY en .env."))],
      }),
      tarjeta({
        sigla: "OA", nombre: "OpenAI", sub: "Imágenes gpt-image-2 y mejorar prompts", estado: luz(oa.listo),
        cuerpo: [el("p", { class: "nota" }, oa.listo ? "Llave OPENAI_API_KEY encontrada." : (oa.motivo || "Falta OPENAI_API_KEY en .env."))],
      }),
      tarjeta({
        sigla: "OL", nombre: "Ollama", sub: "Modelos locales para mejorar prompts gratis", estado: luz(ol.listo, "Abierto", "No responde"),
        cuerpo: ol.listo && ol.modelos && ol.modelos.length
          ? [el("ul", {}, ol.modelos.map((m) => el("li", {}, el("code", {}, m))))]
          : [el("p", { class: "nota" }, ol.listo ? "Ollama abierto pero sin modelos. Instala uno con ollama pull." : (ol.motivo || "Abre Ollama en este equipo (puerto 11434)."))],
      }),
      tarjeta({
        sigla: "HF", nombre: "Higgsfield", sub: "Para aprender prompts y modelos exclusivos", estado: luz(conectado, "Conectado", "Sin conectar"),
        cuerpo: [
          conectado && hfEstado ? el("p", { class: "nota" },
            hfEstado.cuenta ? `Cuenta: ${hfEstado.cuenta}. ` : "",
            hfEstado.creditos != null ? `Créditos: ${hfEstado.creditos}.` : "") : null,
          el("p", { class: "nota" }, "Aprender solo lee tu historial, modelos y presets. No genera ni gasta créditos."),
        ],
        acciones: conectado
          ? [btnAprender, btnDesconectar]
          : [el("a", { class: "btn btn-primario", href: api.rutaConectarHiggsfield }, icono("enlace"), "Conectar Higgsfield")],
      }));
    if (salud.version) zona.append(el("p", { class: "nota" }, `PonchoStudio ${salud.version}${salud.demo ? " · modo demostración" : ""}`));
  }
  btnRevisar.onclick = () => pintar();
  await pintar();
}

function guia() {
  return el("section", { class: "seccion guia", "aria-labelledby": "guia-titulo" },
    el("h2", { id: "guia-titulo" }, "Dónde sacar cada llave"),
    el("ol", {},
      el("li", {}, el("b", {}, "Seedance: "), "entra a la consola de BytePlus ModelArk, activa Seedance 2.5 y crea una API key."),
      el("li", {}, el("b", {}, "OpenAI: "), "en platform.openai.com → API keys. Es aparte de la suscripción de ChatGPT."),
      el("li", {}, el("b", {}, "Ollama: "), "no lleva llave. Solo ábrelo en este equipo."),
      el("li", {}, el("b", {}, "Higgsfield: "), "no lleva llave. Toca «Conectar Higgsfield» e inicia sesión.")),
    el("p", { class: "nota" }, "Pon las llaves en el archivo ", el("code", {}, ".env"), " en la carpeta de PonchoStudio (copia ", el("code", {}, "env.ejemplo"), ") y reinicia la app:"),
    el("pre", { class: "codigo" }, "ARK_API_KEY=tu-llave-de-byteplus\nOPENAI_API_KEY=tu-llave-de-openai"));
}
