// Audio: informativo y honesto. PonchoStudio no genera audio suelto todavía:
// el sonido se pide dentro del video (Seedance). Los modelos de audio dedicados son de Higgsfield y gastan créditos.
import { api } from "../api.js";
import { el, icono, toast, insigniaCreditos } from "../ui.js";

const EJEMPLOS = [
  { que: "Ambiente", frase: "Se oye lluvia fuerte sobre el techo de zinc y, a lo lejos, una moto que pasa." },
  { que: "Voz", frase: "Ella mira a cámara y dice con voz tranquila: «Ya llegué, mami»." },
  { que: "Música", frase: "Suena reguetón suave de fondo y se escuchan risas de la gente en la calle." },
];

async function copiar(texto) {
  try { await navigator.clipboard.writeText(texto); toast("Frase copiada.", "ok"); }
  catch { toast("No pude copiar. Selecciona la frase y cópiala a mano.", "info"); }
}

export async function montar(raiz, ctx) {
  const catalogo = await api.catalogo().catch(() => ({ audio: [] }));
  const modelos = catalogo.audio || [];
  const hf = ctx.salud && ctx.salud.proveedores && ctx.salud.proveedores.higgsfield;
  const conectado = !!(hf && hf.conectado);

  const pasos = [
    ["1", "Activa el audio", "En Video, enciende «Audio» en los ajustes. Seedance 2.5 genera el sonido junto con la imagen."],
    ["2", "Escribe lo que se oye", "Al final del prompt, di el ambiente, los efectos o lo que dice cada persona. Entre comillas va la voz."],
    ["3", "Genera y revisa", "El audio sale dentro del mismo archivo de video, con labios sincronizados cuando hay voz."],
  ];

  raiz.append(el("div", { class: "pagina vista pagina-audio" },
    el("header", { class: "vista-cabeza" },
      el("h1", { class: "vista-titulo" }, "Audio"),
      el("p", { class: "vista-sub" }, "Hoy el sonido se pide dentro del video. No hay un generador de audio suelto en PonchoStudio.")),

    el("section", { class: "seccion", "aria-labelledby": "aud-video" },
      el("div", { class: "sec-cabeza" },
        el("div", {}, el("h2", { class: "sec-titulo", id: "aud-video" }, "Sonido dentro del video"),
          el("p", { class: "sec-sub" }, "Lo más barato: Seedance 2.5 ya incluye el audio.")),
        el("button", { class: "btn btn-primario", type: "button", onclick: () => ctx.irA("video", { ajustes: { audio: true } }) }, icono("video"), "Crear video con audio")),
      el("ol", { class: "audio-pasos" }, pasos.map(([n, t, d]) => el("li", {}, el("span", { class: "audio-n", "aria-hidden": "true" }, n), el("strong", {}, t), el("small", {}, d)))),
      el("div", { class: "audio-ejemplos" }, EJEMPLOS.map((x) => el("div", { class: "audio-ejemplo" },
        el("span", { class: "insignia insignia-violeta" }, x.que),
        el("p", {}, x.frase),
        el("div", { class: "hero-acciones" },
          el("button", { class: "btn btn-chico", type: "button", onclick: () => copiar(x.frase) }, icono("copiar"), "Copiar frase"),
          el("button", { class: "btn btn-chico", type: "button", onclick: () => ctx.irA("video", { prompt: x.frase, ajustes: { audio: true } }) }, icono("video"), "Usar en Video")))))),

    el("section", { class: "seccion", "aria-labelledby": "aud-modelos" },
      el("div", { class: "sec-cabeza" },
        el("div", {}, el("h2", { class: "sec-titulo", id: "aud-modelos" }, "Modelos de audio en Higgsfield"),
          el("p", { class: "sec-sub" }, "Voz, música y más. Corren en tu cuenta de Higgsfield y gastan créditos. Aún no se lanzan desde aquí.")),
        conectado ? el("span", { class: "luz luz-si" }, "Higgsfield conectado") : el("a", { class: "btn btn-chico", href: "#/ajustes" }, "Conectar Higgsfield")),
      modelos.length
        ? el("div", { class: "audio-modelos" }, modelos.map((m) => el("article", { class: "audio-modelo" },
            el("span", { class: "modelo-icono", "aria-hidden": "true" }, icono("audio")),
            el("div", { class: "audio-modelo-txt" },
              el("strong", {}, m.nombre),
              el("small", {}, m.descripcion || m.etiqueta || "Audio")),
            m.gasta_creditos_higgsfield ? insigniaCreditos() : null)))
        : el("div", { class: "vista-vacio" },
            el("span", { class: "vista-vacio-marco", "aria-hidden": "true" }, icono("audio")),
            el("h2", {}, "Sin modelos de audio a la vista"),
            el("p", {}, "Conecta Higgsfield en Ajustes y toca «Aprender de Higgsfield» para traer su lista."),
            el("div", { class: "hero-acciones" }, el("a", { class: "btn btn-primario", href: "#/ajustes" }, "Ir a Ajustes"))))));
}
