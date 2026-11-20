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

function aplicarSalud(salud) {
  estado.salud = salud;
  const demo = !!(salud && salud.demo);
  document.getElementById("franja-demo").hidden = !demo;
  document.body.classList.toggle("con-demo", demo);
  pintarPastilla(salud);
}

// Pastilla de la cabecera: modo demo o créditos de Higgsfield.
async function pintarPastilla(salud) {
  const p = document.getElementById("pastilla-estado");
  const txt = p.querySelector(".txt");
  p.classList.remove("ok");
  p.onclick = null;
  if (!salud) { p.hidden = true; return; }
  if (salud.demo) {
    txt.textContent = "Demo";
    p.title = "Modo demostración: toca para pegar tus llaves";
    p.setAttribute("aria-label", "Modo demostración. Pegar mis llaves");
    p.onclick = (e) => { e.preventDefault(); import("./llaves.js").then((m) => m.abrirModalLlaves({ alGuardar: () => navegar() })); };
    p.hidden = false;
    return;
  }
  const hf = salud.proveedores && salud.proveedores.higgsfield;
  if (hf && hf.conectado) {
    const e = await api.higgsfieldEstado({ silencioso: true }).catch(() => null);
    if (e && e.creditos != null) {
      txt.textContent = `${new Intl.NumberFormat("es-CO").format(e.creditos)} créditos`;
      p.title = "Créditos de tu cuenta de Higgsfield";
      p.setAttribute("aria-label", `${txt.textContent} de Higgsfield. Abrir Ajustes`);
      p.classList.add("ok");
      p.hidden = false;
      return;
    }
  }
  p.hidden = true;
}
// Cuando se guardan llaves, el backend devuelve la salud nueva.
document.addEventListener("poncho:salud", (e) => aplicarSalud(e.detail));

async function cargarSalud() {
  let salud = null;
  try { salud = await api.salud({ silencioso: true }); } catch { salud = null; }
  aplicarSalud(salud);
  return salud;
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
// La primera vez en modo demo se abre "Pegar mis llaves" (una sola vez por navegador).
const CLAVE_LLAVES = "ponchostudio.llaves-ofrecidas";
function ofrecerLlaves() {
  if (!estado.salud || !estado.salud.demo) return;
  let ya = false;
  try { ya = localStorage.getItem(CLAVE_LLAVES) === "1"; } catch { ya = true; }
  if (ya) return;
  try { localStorage.setItem(CLAVE_LLAVES, "1"); } catch { /* sin almacenamiento */ }
  import("./llaves.js").then((m) => m.abrirModalLlaves({ alGuardar: () => navegar() })).catch(() => {});
}

cargarSalud().then(() => { navegar(); ofrecerLlaves(); });
