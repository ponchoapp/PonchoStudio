// Audio: por ahora informativo. Seedance pone el audio dentro del video;
// los modelos de audio dedicados son de Higgsfield y gastan créditos.
import { api } from "../api.js";
import { el, icono, insigniaCreditos } from "../ui.js";

export async function montar(raiz, ctx) {
  const catalogo = await api.catalogo().catch(() => ({ audio: [] }));
  const modelos = catalogo.audio || [];
  const hf = ctx.salud && ctx.salud.proveedores && ctx.salud.proveedores.higgsfield;
  const conectado = !!(hf && hf.conectado);

  const pagina = el("div", { class: "pagina" },
    el("div", { class: "pagina-cabeza" },
      el("h1", {}, "Audio"),
      el("p", {}, "Voz, música y efectos. Lo más barato es pedir el sonido dentro del video.")),

    el("div", { class: "aviso-caja" },
      el("h2", {}, "Seedance 2.5 ya genera el audio"),
      el("p", {}, "Al generar un video con Audio activado, Seedance crea sonido ambiente, efectos y voces con labios sincronizados. Escribe en el prompt lo que se oye, por ejemplo: «se oye lluvia y una moto que pasa»."),
      el("div", { class: "hero-acciones" },
        el("button", { class: "btn btn-primario", type: "button", onclick: () => ctx.irA("video", { ajustes: { audio: true } }) }, icono("video"), "Crear video con audio"))),

    el("section", { class: "seccion" },
      el("div", { class: "seccion-cabeza" },
        el("h2", {}, "Modelos de audio dedicados"),
        conectado ? el("span", { class: "luz luz-si" }, "Higgsfield conectado") : el("a", { class: "btn btn-chico", href: "#/ajustes" }, "Conectar Higgsfield")),
      el("p", { class: "nota" }, "Estos modelos corren en Higgsfield y gastan créditos de tu cuenta. Todavía no se generan desde PonchoStudio."),
      modelos.length
        ? el("div", { class: "lista-audio" }, modelos.map((m) => el("article", { class: "conexion" },
            el("div", { class: "conexion-cabeza" },
              el("span", { class: "modelo-icono", "aria-hidden": "true" }, icono("audio")),
              el("div", {}, el("strong", {}, m.nombre), el("small", {}, m.etiqueta || m.nota || "Audio")),
              m.gasta_creditos_higgsfield ? insigniaCreditos() : null),
            m.nota && m.etiqueta ? el("p", { class: "nota" }, m.nota) : null)))
        : el("div", { class: "vacio" }, el("strong", {}, "Sin modelos de audio en el catálogo"),
            el("span", {}, "Conecta Higgsfield y toca «Aprender de Higgsfield» en Ajustes para traer sus modelos."))));
  raiz.append(pagina);
}
