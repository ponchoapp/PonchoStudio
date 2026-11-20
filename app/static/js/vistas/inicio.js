// Explorar: hero, accesos, plantillas en masonry y últimas generaciones.
import { api } from "../api.js";
import { el, icono, arte, tarjetaMedio, abrirVisor } from "../ui.js";
import { accionesVisor } from "../generador.js";

const ACCESOS = [
  { ruta: "video", icono: "video", titulo: "Video", texto: "Seedance 2.5 directo, 4 a 30 s" },
  { ruta: "imagen", icono: "imagen", titulo: "Imagen", texto: "gpt-image-2 con referencias" },
  { ruta: "audio", icono: "audio", titulo: "Audio", texto: "Sonido dentro del video" },
  { ruta: "estudios", icono: "estudios", titulo: "Estudios", texto: "Cine, producto, videoclip, retrato" },
];
const PROPORCIONES = ["4 / 3", "1 / 1", "16 / 10", "3 / 4", "3 / 2", "5 / 4"];

export async function montar(raiz, ctx) {
  const demo = !!(ctx.salud && ctx.salud.demo);
  const hero = el("section", { class: "hero", "aria-labelledby": "hero-titulo" },
    el("div", { class: "hero-tejido", "aria-hidden": "true" }, el("i"), el("i"), el("i"), el("i")),
    el("h1", { id: "hero-titulo" }, "Video e imagen, directo y sin intermediarios."),
    el("p", {}, "Seedance 2.5 para video, OpenAI para imagen y tus modelos de Ollama para pulir el prompt gratis."),
    el("div", { class: "hero-acciones" },
      el("a", { class: "btn btn-primario", href: "#/video" }, icono("video"), "Crear video"),
      el("a", { class: "btn", href: "#/imagen" }, icono("imagen"), "Crear imagen")));

  const accesos = el("nav", { class: "accesos", "aria-label": "Herramientas" },
    ACCESOS.map((a) => el("a", { class: "acceso", href: `#/${a.ruta}` },
      el("span", { class: "acceso-icono" }, icono(a.icono)),
      el("span", {}, el("strong", {}, a.titulo), el("span", {}, a.texto)))));

  const zonaRecientes = el("section", { class: "seccion", "aria-labelledby": "rec-titulo" });
  const zonaPlantillas = el("section", { class: "seccion", "aria-labelledby": "pla-titulo" });
  raiz.append(el("div", { class: "pagina" }, hero, accesos, zonaRecientes, zonaPlantillas));

  // Últimas generaciones
  const cargarRecientes = async () => {
    let lista = [];
    try { lista = ((await api.trabajos({ limite: 12 }, { silencioso: true })).trabajos) || []; } catch { /* sin datos */ }
    const acc = accionesVisor({ alCambiar: cargarRecientes });
    zonaRecientes.replaceChildren(
      el("div", { class: "seccion-cabeza" }, el("h2", { id: "rec-titulo" }, "Tus últimas generaciones"),
        lista.length ? el("a", { class: "btn btn-fantasma btn-chico", href: "#/biblioteca" }, "Ver todo") : null),
      lista.length
        ? el("div", { class: "explora-caja" }, el("div", { class: "masonry" },
            lista.map((t) => tarjetaMedio(t, { demo, onAbrir: (tt) => abrirVisor(tt, { ...acc, demo }) }))))
        : el("div", { class: "vacio" }, el("strong", {}, "Todavía no has generado nada"),
            el("span", {}, "Empieza con una plantilla de abajo o abre el generador de video."),
            el("a", { class: "btn btn-primario", href: "#/video" }, "Crear mi primer video")));
  };

  // Plantillas
  const cargarPlantillas = async () => {
    let plantillas = [];
    try { plantillas = ((await api.presets()).plantillas) || []; } catch { /* toast ya salió */ }
    zonaPlantillas.replaceChildren(
      el("div", { class: "seccion-cabeza" }, el("h2", { id: "pla-titulo" }, "Plantillas para empezar")),
      plantillas.length
        ? el("div", { class: "explora-caja" }, el("div", { class: "masonry" }, plantillas.map((p, i) => tarjetaPlantilla(p, i, ctx))))
        : el("div", { class: "vacio" }, el("strong", {}, "Sin plantillas"), el("span", {}, "Conecta Higgsfield en Ajustes y toca «Aprender de Higgsfield» para traer prompts.")));
  };

  await Promise.all([cargarRecientes(), cargarPlantillas()]);
}

function tarjetaPlantilla(p, i, ctx) {
  const destino = p.categoria === "imagen" ? "imagen" : "video";
  const b = el("button", { class: "plantilla", type: "button", "aria-label": `Usar plantilla ${p.nombre} en ${destino === "video" ? "Video" : "Imagen"}` },
    el("div", { class: "plantilla-arte", style: { "--ar": PROPORCIONES[i % PROPORCIONES.length], background: arte(p.id || p.nombre) } },
      el("span", { class: "insignia" }, destino === "video" ? "Video" : "Imagen")),
    el("strong", {}, p.nombre),
    el("p", {}, p.prompt),
    el("span", { class: "plantilla-pie" }, "Usar plantilla",
      p.origen === "higgsfield" ? el("span", { class: "insignia insignia-violeta" }, "Aprendida") : null));
  b.onclick = () => ctx.irA(destino, { prompt: p.prompt, modelo: p.modelo_sugerido || undefined });
  return b;
}
