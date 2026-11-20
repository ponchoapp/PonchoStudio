// Tarjetas de medios externos (presets y generaciones de Higgsfield) y la "referencia" que viaja
// de Explorar al generador. Módulo compartido: lo usan Explorar (vistas/inicio.js) y el generador.
//
// Contrato de la referencia (precarga.referencia y localStorage):
//   { id, nombre, tipo: "video"|"imagen", url, miniatura|null, origen: "preset"|"higgsfield"|"plantilla",
//     categoria|null }
// Se guarda por tipo de generador en localStorage "ponchostudio.referencia.video" / ".imagen",
// para que no se pierda al cambiar de vista. La X la borra.
import { el, icono, arte, modal } from "./ui.js";

const CLAVE_REF = (tipo) => `ponchostudio.referencia.${tipo === "imagen" ? "imagen" : "video"}`;

export function guardarReferencia(tipoGenerador, ref) {
  try { localStorage.setItem(CLAVE_REF(tipoGenerador), JSON.stringify(ref)); } catch { /* sin almacenamiento */ }
}
export function leerReferencia(tipoGenerador) {
  try { const v = JSON.parse(localStorage.getItem(CLAVE_REF(tipoGenerador)) || "null"); return v && v.url ? v : null; } catch { return null; }
}
export function quitarReferencia(tipoGenerador) {
  try { localStorage.removeItem(CLAVE_REF(tipoGenerador)); } catch { /* nada */ }
}
export function referenciaDe({ id, nombre, tipo, url, miniatura = null, origen = "preset", categoria = null }) {
  return { id: String(id || url), nombre: nombre || "Referencia", tipo: tipo === "imagen" || tipo === "image" ? "imagen" : "video",
           url, miniatura: miniatura || null, origen, categoria: categoria || null };
}

export const sinMovimiento = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Carga perezosa: el video no pide nada hasta que la tarjeta entra en pantalla;
// ahí baja solo los metadatos para mostrar el primer cuadro.
const observador = "IntersectionObserver" in window ? new IntersectionObserver((entradas) => {
  for (const e of entradas) {
    if (!e.isIntersecting) continue;
    const v = e.target;
    observador.unobserve(v);
    if (v.dataset.src) { v.preload = "metadata"; v.src = v.dataset.src + "#t=0.1"; }
  }
}, { rootMargin: "300px" }) : null;

export function medioVista(url, tipo, alt) {
  if (tipo === "video") {
    const v = el("video", { muted: true, loop: true, playsInline: true, preload: "none", "aria-hidden": "true", tabIndex: -1 });
    v.muted = true;
    if (observador) { v.dataset.src = url; observador.observe(v); } else v.src = url;
    return v;
  }
  return el("img", { src: url, alt: alt || "", loading: "lazy" });
}

// Tarjeta de vista previa (preset o galería): mismo aspecto que las tarjetas de trabajo.
export function tarjetaVista({ url, tipo, titulo, sub, semilla, onAbrir, onRecrear, etiquetaAbrir }) {
  const tarjeta = el("div", { class: "medio" });
  const caja = el("div", { class: "medio-caja", style: { "--ar": tipo === "video" ? "9 / 16" : "4 / 5" } });
  tarjeta.altoRel = tipo === "video" ? 1.5 : 1.25;
  let medio = null;
  if (url) {
    medio = medioVista(url, tipo, titulo);
    const ajustarProporcion = (w, h) => { if (w && h) caja.style.setProperty("--ar", `${w} / ${h}`); };
    if (tipo === "video") medio.addEventListener("loadedmetadata", () => ajustarProporcion(medio.videoWidth, medio.videoHeight));
    else medio.addEventListener("load", () => ajustarProporcion(medio.naturalWidth, medio.naturalHeight));
    caja.append(medio);
  } else {
    caja.classList.add("ruido", "sin-medio");
    caja.style.background = arte(semilla || titulo);
    caja.append(el("div", { class: "medio-pendiente" }, el("span", {}, "Sin vista previa")));
  }
  const abrir = el("button", { class: "medio-abrir", type: "button", "aria-label": etiquetaAbrir });
  abrir.onclick = onAbrir;
  if (medio && tipo === "video") {
    const jugar = () => { if (!sinMovimiento()) { if (!medio.src && medio.dataset.src) medio.src = medio.dataset.src; medio.play().catch(() => {}); } };
    const parar = () => medio.pause();
    tarjeta.onmouseenter = jugar; tarjeta.onmouseleave = parar;
    abrir.onfocus = jugar; abrir.onblur = parar;
  }
  const recrear = onRecrear ? el("button", { class: "btn", type: "button", "aria-label": `Recrear ${titulo}` }, icono("repetir"), "Recrear") : null;
  if (recrear) recrear.onclick = (e) => { e.stopPropagation(); onRecrear(recrear); };
  const sup = el("div", { class: "medio-sup" }, sub ? el("span", { class: "insignia insignia-demo" }, sub) : null);
  const inf = el("div", { class: "medio-inf" }, el("p", {}, el("strong", {}, titulo)), recrear ? el("div", { class: "medio-acciones" }, recrear) : null);
  tarjeta.append(caja, sup, abrir, inf);
  return tarjeta;
}

// Visor simple para medios de Higgsfield (no son trabajos locales).
export function verMedio({ url, tipo, titulo, texto, onRecrear }) {
  const medio = el("div", { class: "visor-medio" },
    url ? (tipo === "video"
      ? el("video", { src: url, controls: true, autoplay: !sinMovimiento(), loop: true, muted: true, playsInline: true })
      : el("img", { src: url, alt: titulo })) : el("p", { class: "nota" }, "Sin vista previa"));
  const cerrarBtn = el("button", { class: "btn-icono visor-cerrar", type: "button", "aria-label": "Cerrar visor" }, icono("x"));
  const btnRecrear = onRecrear ? el("button", { class: "btn btn-primario", type: "button" }, icono("repetir"), "Recrear en PonchoStudio") : null;
  const info = el("div", { class: "visor-info" },
    el("h2", {}, titulo),
    texto ? el("div", { class: "visor-prompt" }, texto) : null,
    el("div", { class: "visor-acciones" }, btnRecrear,
      url ? el("a", { class: "btn", href: url, target: "_blank", rel: "noopener" }, icono("enlace"), "Abrir original") : null));
  const cerrar = modal([cerrarBtn, medio, info], { clase: "visor", etiqueta: titulo });
  cerrarBtn.onclick = cerrar;
  if (btnRecrear) btnRecrear.onclick = () => { cerrar(); onRecrear(btnRecrear); };
}
