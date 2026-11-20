// Ajustes: estado de conexiones, modelo de Ollama y guía de llaves.
import { api } from "../api.js";
import { el, limpiar, icono, toast, confirmar } from "../ui.js";
import { abrirModalLlaves } from "../llaves.js";

/** Punto de color + texto: verde apagado = listo, gris = falta. */
const luz = (si, txtSi = "Listo", txtNo = "Sin configurar") =>
  el("span", { class: `luz ${si ? "luz-si" : "luz-no"}` }, si ? txtSi : txtNo);

function tarjeta({ sigla, nombre, sub, estado, cuerpo = [], acciones = [] }) {
  return el("article", { class: "conexion" },
    el("div", { class: "conexion-cabeza" },
      el("span", { class: "modelo-icono", "aria-hidden": "true" }, sigla),
      el("div", {}, el("h3", {}, nombre), el("small", {}, sub)),
      estado),
    cuerpo,
    acciones.length ? el("div", { class: "conexion-acciones" }, acciones) : null);
}

const fmtNum = new Intl.NumberFormat("es-CO");
const corto = (m) => m.replace(/^hf\.co\//, "");

export async function montar(raiz, ctx) {
  const zona = el("div", { class: "conexiones" });
  const btnRevisar = el("button", { class: "btn btn-chico", type: "button" }, icono("repetir"), "Revisar conexiones");
  const btnLlaves = el("button", { class: "btn btn-primario btn-chico", type: "button" }, icono("llave"), "Pegar mis llaves");
  btnLlaves.onclick = () => abrirModalLlaves({ alGuardar: () => pintar() });
  raiz.append(el("div", { class: "pagina vista pagina-ajustes" },
    el("header", { class: "vista-cabeza" },
      el("h1", { class: "vista-titulo" }, "Ajustes"),
      el("p", { class: "vista-sub" }, "Con qué servicios está conectado PonchoStudio. Las llaves viven en el archivo .env, nunca en la app.")),
    el("section", { class: "seccion", "aria-labelledby": "con-titulo" },
      el("div", { class: "sec-cabeza" },
        el("h2", { class: "sec-titulo", id: "con-titulo" }, "Conexiones"),
        el("div", { class: "conexion-acciones" }, btnLlaves, btnRevisar)),
      zona),
    guia()));

  async function elegirModelo(nombre) {
    try {
      const r = await api.guardarLlaves({ OLLAMA_MODELO: nombre });
      toast("Modelo de Ollama cambiado.", "ok");
      if (r && r.salud) document.dispatchEvent(new CustomEvent("poncho:salud", { detail: r.salud }));
    } catch { /* toast */ }
    pintar();
  }

  async function pintar() {
    if (!zona.children.length) limpiar(zona, el("p", { class: "nota", role: "status" }, "Revisando conexiones…"));
    const [salud, hfEstado, llaves] = await Promise.all([
      ctx.recargarSalud(),
      api.higgsfieldEstado({ silencioso: true }).catch(() => null),
      api.llaves({ silencioso: true }).catch(() => null),
    ]);
    if (!salud) {
      limpiar(zona, el("div", { class: "vista-vacio" },
        el("h2", {}, "No hay respuesta de la app"),
        el("p", {}, "Abre PonchoStudio con ABRIR.bat y toca «Revisar conexiones».")));
      return;
    }
    const p = salud.proveedores || {};
    const sd = p.seedance || {}, sr = p.seedream || {}, orr = p.openrouter || {}, oa = p.openai || {}, ol = p.ollama || {}, hf = p.higgsfield || {};
    const conectado = !!((hfEstado && hfEstado.conectado) || hf.conectado);
    const final = (n) => (llaves && llaves[n] && llaves[n].guardada && llaves[n].final ? `Guardada · termina en …${llaves[n].final}` : null);
    const modeloElegido = (llaves && llaves.OLLAMA_MODELO && llaves.OLLAMA_MODELO.valor) || "";

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

    // Ollama: modelo en uso y lista para cambiarlo.
    const modelos = ol.modelos || [];
    const enUso = modelos.find((m) => modeloElegido && (m === modeloElegido || m === modeloElegido + ":latest")) || "";
    const cuerpoOllama = ol.listo && modelos.length
      ? [
        el("p", { class: "nota" }, enUso ? "Modelo en uso para mejorar prompts:" : "Sin modelo elegido: la app usa el mejor que encuentre. Elige uno:"),
        el("ul", { class: "modelos-lista", "aria-label": "Modelos de Ollama instalados" }, modelos.map((m) => {
          const activo = m === enUso;
          return el("li", { class: activo ? "activo" : "" },
            el("code", { title: m }, corto(m)),
            activo
              ? el("span", { class: "luz luz-si" }, "En uso")
              : el("button", { class: "btn btn-chico", type: "button", "aria-label": `Usar el modelo ${m}`, onclick: () => elegirModelo(m) }, "Usar este"));
        })),
      ]
      : [el("p", { class: "nota" }, ol.listo ? "Ollama está abierto pero sin modelos. Instala uno con ollama pull." : (ol.motivo || "Abre Ollama en este equipo (puerto 11434)."))];

    limpiar(zona,
      tarjeta({
        sigla: "SD", nombre: "Seedance (BytePlus)", sub: "Video directo, sin intermediario", estado: luz(sd.listo),
        cuerpo: [el("p", { class: "nota" }, sd.listo ? (final("ARK_API_KEY") || "Llave ARK_API_KEY encontrada.") : (sd.motivo || "Falta ARK_API_KEY en .env."))],
      }),
      tarjeta({
        sigla: "SR", nombre: "Seedream 5.5 (BytePlus)", sub: "Imágenes directas, con fondo transparente", estado: luz(sr.listo),
        cuerpo: [
          el("p", { class: "nota" }, sr.listo ? "Usa la misma llave de Seedance." : (sr.motivo || "Falta ARK_API_KEY en .env.")),
          sr.modelo ? el("p", { class: "nota" }, "Model ID: ", el("code", { title: sr.modelo }, sr.modelo)) : el("p", { class: "nota" }, "Falta el Model ID: pégalo en «Pegar mis llaves»."),
        ],
      }),
      tarjeta({
        sigla: "OR", nombre: "OpenRouter", sub: "Plan B del video si Seedance directo falla", estado: luz(orr.listo, "Listo", "Opcional"),
        cuerpo: [
          el("p", { class: "nota" }, orr.listo ? (final("OPENROUTER_API_KEY") || "Llave OPENROUTER_API_KEY encontrada.") : "Sin llave. No hace falta: solo entra si BytePlus no deja generar."),
          el("p", { class: "nota" }, "Se usa solo si falta la llave de BytePlus o la cuenta no tiene permiso. Cobra a su propio saldo y lo avisa en el trabajo."),
        ],
      }),
      tarjeta({
        sigla: "OA", nombre: "OpenAI", sub: "Imágenes gpt-image-2 y mejorar prompts", estado: luz(oa.listo),
        cuerpo: [el("p", { class: "nota" }, oa.listo ? (final("OPENAI_API_KEY") || "Llave OPENAI_API_KEY encontrada.") : (oa.motivo || "Falta OPENAI_API_KEY en .env."))],
      }),
      tarjeta({
        sigla: "OL", nombre: "Ollama", sub: "Modelos locales: mejorar prompts gratis", estado: luz(ol.listo, "Abierto", "No responde"),
        cuerpo: cuerpoOllama,
      }),
      tarjeta({
        sigla: "HF", nombre: "Higgsfield", sub: "Aprender prompts y modelos exclusivos", estado: luz(conectado, "Conectado", "Sin conectar"),
        cuerpo: [
          conectado && hfEstado && hfEstado.creditos != null
            ? el("div", { class: "creditos" }, el("strong", {}, fmtNum.format(hfEstado.creditos)), el("span", {}, "créditos disponibles"))
            : null,
          conectado && hfEstado && hfEstado.cuenta ? el("p", { class: "nota" }, `Cuenta: ${hfEstado.cuenta}`) : null,
          el("p", { class: "nota" }, "Aprender solo lee tu historial, modelos y presets. No genera ni gasta créditos."),
        ],
        acciones: conectado
          ? [btnAprender, btnDesconectar]
          : [el("a", { class: "btn btn-primario", href: api.rutaConectarHiggsfield }, icono("enlace"), "Conectar Higgsfield")],
      }));
    if (salud.version) zona.append(el("p", { class: "nota conexiones-pie" }, `PonchoStudio ${salud.version}${salud.demo ? " · modo demostración" : ""}`));
  }
  btnRevisar.onclick = () => pintar();
  await pintar();
}

function guia() {
  return el("section", { class: "seccion guia", "aria-labelledby": "guia-titulo" },
    el("div", {}, el("h2", { class: "sec-titulo", id: "guia-titulo" }, "Dónde sacar cada llave"),
      el("p", { class: "sec-sub" }, "Lo más fácil es «Pegar mis llaves»: solo se muestran los últimos 4 caracteres.")),
    el("ol", {},
      el("li", {}, el("b", {}, "Seedance: "), "entra a la consola de BytePlus ModelArk, activa Seedance 2.5 y crea una API key."),
      el("li", {}, el("b", {}, "Seedream: "), "usa la misma llave de BytePlus. Activa Seedream 5.5 en la consola de ModelArk."),
      el("li", {}, el("b", {}, "OpenRouter (opcional): "), "en openrouter.ai → Keys. Es el plan B si Seedance directo falla."),
      el("li", {}, el("b", {}, "OpenAI: "), "en platform.openai.com → API keys. Es aparte de la suscripción de ChatGPT."),
      el("li", {}, el("b", {}, "Ollama: "), "no lleva llave. Solo ábrelo en este equipo."),
      el("li", {}, el("b", {}, "Higgsfield: "), "no lleva llave. Toca «Conectar Higgsfield» e inicia sesión.")),
    el("p", { class: "nota" }, "A mano: copia ", el("code", {}, "env.ejemplo"), " como ", el("code", {}, ".env"), " en la carpeta de PonchoStudio, escribe las llaves y reinicia la app."),
    el("pre", { class: "codigo" }, "ARK_API_KEY=tu-llave-de-byteplus\nOPENROUTER_API_KEY=tu-llave-de-openrouter\nOPENAI_API_KEY=tu-llave-de-openai"));
}
