// Biblioteca: todos los trabajos con filtros y visor.
import { api } from "../api.js";
import { el, limpiar, tarjetaMedio, abrirVisor } from "../ui.js";
import { accionesVisor } from "../generador.js";

const FILTROS = [
  { id: "todo", texto: "Todo", q: {} },
  { id: "video", texto: "Video", q: { tipo: "video" } },
  { id: "imagen", texto: "Imagen", q: { tipo: "imagen" } },
  { id: "favoritos", texto: "Favoritos", q: { favoritos: 1 } },
];

export async function montar(raiz, ctx) {
  const demo = !!(ctx.salud && ctx.salud.demo);
  let filtro = FILTROS.some((f) => f.id === ctx.params.get("filtro")) ? ctx.params.get("filtro") : "todo";
  let siguiente = null;
  let lista = [];
  const cache = new Map();

  const grupo = el("div", { class: "filtros", role: "group", "aria-label": "Filtrar biblioteca" });
  const grilla = el("div", { class: "masonry" });
  const zonaVacia = el("div", {});
  const btnMas = el("button", { class: "btn", type: "button", hidden: true }, "Cargar más");
  const contador = el("span", { class: "nota", "aria-live": "polite" });

  const acc = accionesVisor({ alCambiar: () => cargar(true) });
  const abrir = (t) => abrirVisor(t, { ...acc, demo });

  function pintarFiltros() {
    limpiar(grupo, FILTROS.map((f) => el("button", {
      class: "chip", type: "button", "aria-pressed": String(f.id === filtro),
      onclick: () => { if (filtro === f.id) return; filtro = f.id; pintarFiltros(); cargar(true); },
    }, f.texto)));
  }

  async function cargar(reiniciar) {
    const q = { ...FILTROS.find((f) => f.id === filtro).q, limite: 60 };
    if (!reiniciar && siguiente) q.antes = siguiente;
    btnMas.disabled = true;
    try {
      const r = await api.trabajos(q);
      lista = reiniciar ? (r.trabajos || []) : lista.concat(r.trabajos || []);
      siguiente = r.siguiente || null;
    } catch {
      if (reiniciar) lista = [];
    }
    btnMas.disabled = false;
    btnMas.hidden = !siguiente;
    if (reiniciar) for (const id of [...cache.keys()]) if (!lista.some((t) => t.id === id)) cache.delete(id);
    grilla.replaceChildren(...lista.map((t) => {
      let tj = cache.get(t.id);
      if (tj) tj.actualizar(t); else { tj = tarjetaMedio(t, { demo, onAbrir: abrir }); cache.set(t.id, tj); }
      return tj;
    }));
    contador.textContent = lista.length ? `${lista.length} ${lista.length === 1 ? "trabajo" : "trabajos"}${siguiente ? " (hay más)" : ""}` : "";
    const textos = {
      todo: ["Tu biblioteca está vacía", "Lo que generes en Video o Imagen queda aquí.", "Crear un video", "#/video"],
      video: ["Aún no hay videos", "Genera tu primer video con Seedance 2.5.", "Crear un video", "#/video"],
      imagen: ["Aún no hay imágenes", "Genera tu primera imagen con gpt-image-2.", "Crear una imagen", "#/imagen"],
      favoritos: ["Sin favoritos", "Abre un trabajo y toca «Marcar favorito» para verlo aquí.", "Ver todo", "#/biblioteca"],
    }[filtro];
    limpiar(zonaVacia, lista.length ? null : el("div", { class: "vacio" },
      el("strong", {}, textos[0]), el("span", {}, textos[1]),
      el("a", { class: "btn", href: textos[3], onclick: filtro === "favoritos" ? (e) => { e.preventDefault(); filtro = "todo"; pintarFiltros(); cargar(true); } : null }, textos[2])));
  }
  btnMas.onclick = () => cargar(false);

  pintarFiltros();
  raiz.append(el("div", { class: "pagina" },
    el("div", { class: "pagina-cabeza" }, el("h1", {}, "Biblioteca"), el("p", {}, "Todo lo que has generado. Toca un trabajo para verlo, descargarlo o repetirlo.")),
    el("div", { class: "seccion" },
      el("div", { class: "seccion-cabeza" }, grupo, contador),
      zonaVacia,
      el("div", { class: "explora-caja" }, grilla),
      el("div", {}, btnMas))));
  await cargar(true);

  // Refresca mientras haya trabajos pendientes.
  const t = setInterval(() => {
    if (!document.hidden && lista.some((x) => x.estado === "en_cola" || x.estado === "generando")) cargar(true);
  }, 3000);
  return () => clearInterval(t);
}
