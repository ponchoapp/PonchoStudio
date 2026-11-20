// PonchoStudio · rutas por hash y navegación.
// Cada vista exporta montar(raiz, ctx) y puede devolver una función de limpieza.
import { api } from "./api.js";
import { el } from "./ui.js";

const VISTAS = {
  inicio: () => import("./vistas/inicio.js"),
  video: () => import("./vistas/video.js"),
  imagen: () => import("./vistas/imagen.js"),
  audio: () => import("./vistas/audio.js"),
  estudios: () => import("./vistas/estudios.js"),
  biblioteca: () => import("./vistas/biblioteca.js"),
  ajustes: () => import("./vistas/ajustes.js"),
};
const TITULOS = {
  inicio: "Explorar", video: "Video", imagen: "Imagen", audio: "Audio",
  estudios: "Estudios", biblioteca: "Biblioteca", ajustes: "Ajustes",
};

const estado = {
  salud: null,
  precarga: null, // datos que una vista deja para la siguiente (plantilla, estudio, repetir)
};
let limpiarVista = null;
let turno = 0;

export function irA(ruta, precarga = null) {
  estado.precarga = precarga;
  const destino = "#/" + (ruta === "inicio" ? "" : ruta);
  if (location.hash === destino) navegar();
  else location.hash = destino;
}

function leerRuta() {
  const h = location.hash.replace(/^#\/?/, "");
  const [ruta, query] = h.split("?");
  const nombre = ruta || "inicio";
  return { nombre: VISTAS[nombre] ? nombre : "inicio", params: new URLSearchParams(query || "") };
}

async function cargarSalud() {
  try {
    estado.salud = await api.salud({ silencioso: true });
  } catch {
    estado.salud = null;
  }
  const demo = !!(estado.salud && estado.salud.demo);
  document.getElementById("franja-demo").hidden = !demo;
  document.body.classList.toggle("con-demo", demo);
  return estado.salud;
}

async function navegar() {
  const mio = ++turno;
  const { nombre, params } = leerRuta();
  if (limpiarVista) { try { limpiarVista(); } catch { /* nada */ } limpiarVista = null; }

  document.querySelectorAll("[data-ruta]").forEach((a) => {
    if (a.dataset.ruta === nombre) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  document.title = nombre === "inicio" ? "PonchoStudio" : `${TITULOS[nombre]} · PonchoStudio`;

  const raiz = document.getElementById("contenido");
  raiz.replaceChildren(el("div", { class: "pagina" }, el("div", { class: "cargando-bloque", "aria-label": "Cargando" })));
  const precarga = estado.precarga;
  estado.precarga = null;

  try {
    const modulo = await VISTAS[nombre]();
    if (mio !== turno) return;
    raiz.replaceChildren();
    const ctx = { salud: estado.salud, irA, params, precarga, recargarSalud: cargarSalud, vigente: () => mio === turno };
    const limpieza = await modulo.montar(raiz, ctx);
    if (mio !== turno) { if (typeof limpieza === "function") limpieza(); return; }
    limpiarVista = typeof limpieza === "function" ? limpieza : null;
  } catch (e) {
    console.error(e);
    if (mio !== turno) return;
    raiz.replaceChildren(el("div", { class: "pagina" },
      el("div", { class: "vacio" },
        el("strong", {}, "Esta sección no cargó"),
        el("span", {}, e && e.message ? e.message : "Revisa que PonchoStudio esté abierto y vuelve a intentar."),
        el("button", { class: "btn", type: "button", onclick: () => navegar() }, "Volver a intentar"))));
  }
  window.scrollTo({ top: 0 });
}

window.addEventListener("hashchange", navegar);
// El enlace "Saltar al contenido" no debe cambiar la ruta.
document.querySelector(".saltar").addEventListener("click", (e) => {
  e.preventDefault();
  document.getElementById("contenido").focus();
});
cargarSalud().then(navegar);
