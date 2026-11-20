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

// Carga perezosa: un video sin poster no pide nada hasta que la tarjeta entra en pantalla
// (margen de 400 px); ahí baja solo los metadatos para mostrar el primer cuadro.
const observador = "IntersectionObserver" in window ? new IntersectionObserver((entradas) => {
  for (const e of entradas) {
    if (!e.isIntersecting) continue;
    const v = e.target;
    observador.unobserve(v);
    if (v.dataset.src) { v.preload = "metadata"; v.src = v.dataset.src + "#t=0.1"; }
  }
}, { rootMargin: "400px" }) : null;

export function medioVista(url, tipo, alt) {
  if (tipo === "video") {
    const v = el("video", { muted: true, loop: true, playsInline: true, preload: "none", "aria-hidden": "true", tabIndex: -1 });
    v.muted = true;
    if (observador) { v.dataset.src = url; observador.observe(v); } else v.src = url;
    return v;
  }
  return el("img", { src: url, alt: alt || "", loading: "lazy", decoding: "async" });
}

// Tarjeta de vista previa (preset, plantilla o generación de Higgsfield). Sin borde: el medio llena la tarjeta.
// Con `miniatura` (poster) solo se baja esa imagen; el video se crea al pasar el mouse o al enfocar,
// y se retira al salir, así la página nunca tiene 200 videos abiertos.
//   formato: "16 / 9" | "9 / 16" | null (null = se ajusta a la proporción real del medio)
//   titulo visible siempre con `tituloSiempre`; si no, aparece al pasar el mouse/enfocar (y siempre en táctil).
export function tarjetaVista({ url, tipo, miniatura, titulo, sub, semilla, onAbrir, onRecrear, etiquetaAbrir, formato = null, tituloSiempre = false, nombreRecrear = "Recrear" }) {
  const tarjeta = el("div", { class: "tj" + (tituloSiempre ? " tj-titulo" : "") });
  const fijo = formato || (tipo === "video" ? "9 / 16" : "4 / 5");
  const caja = el("div", { class: "tj-caja", style: { "--ar": fijo } });
  tarjeta.altoRel = tipo === "video" ? 1.5 : 1.25;
  if (formato) { const [w, h] = formato.split("/").map(Number); tarjeta.altoRel = h / w; }
  let jugar = null, parar = null;
  const ajustar = (w, h) => {
    if (formato || !w || !h) return;
    caja.style.setProperty("--ar", `${w} / ${h}`);
    tarjeta.altoRel = h / w;
    tarjeta.dispatchEvent(new CustomEvent("medida", { bubbles: true }));
  };

  if (tipo === "video" && url) {
    let base = null, video = null, espera = 0;
    if (miniatura) {
      base = medioVista(miniatura, "imagen", "");
      base.addEventListener("load", () => ajustar(base.naturalWidth, base.naturalHeight));
    } else {
      base = medioVista(url, "video");
      base.addEventListener("loadedmetadata", () => ajustar(base.videoWidth, base.videoHeight));
    }
    caja.append(base);
    jugar = () => {
      if (sinMovimiento() || espera) return;
      espera = setTimeout(() => {
        if (!miniatura) { if (!base.src && base.dataset.src) base.src = base.dataset.src; base.play().catch(() => {}); return; }
        if (!video) {
          video = el("video", { muted: true, loop: true, playsInline: true, preload: "auto", "aria-hidden": "true", tabIndex: -1, class: "tj-video" });
          video.muted = true;
          video.addEventListener("playing", () => video && video.classList.add("listo"), { once: true });
          video.src = url;
          caja.append(video);
        }
        video.play().catch(() => {});
      }, 140);
    };
    parar = () => {
      clearTimeout(espera); espera = 0;
      if (!miniatura) { base.pause(); return; }
      if (video) { const v = video; video = null; v.pause(); v.removeAttribute("src"); v.load(); v.remove(); }
    };
  } else if (url || miniatura) {
    const img = medioVista(url || miniatura, "imagen", "");
    img.addEventListener("load", () => ajustar(img.naturalWidth, img.naturalHeight));
    caja.append(img);
  } else {
    caja.classList.add("ruido", "sin-medio");
    caja.style.background = arte(semilla || titulo);
    caja.append(el("div", { class: "tj-pendiente" }, el("span", {}, "Sin vista previa")));
  }

  const abrir = el("button", { class: "tj-abrir", type: "button", "aria-label": etiquetaAbrir || `Ver ${titulo}` });
  abrir.onclick = onAbrir;
  if (jugar) {
    tarjeta.addEventListener("mouseenter", jugar); tarjeta.addEventListener("mouseleave", parar);
    abrir.addEventListener("focus", jugar); abrir.addEventListener("blur", parar);
  }
  const recrear = onRecrear ? el("button", { class: "tj-recrear", type: "button", "aria-label": `${nombreRecrear}: ${titulo}` }, icono("repetir"), nombreRecrear) : null;
  if (recrear) recrear.onclick = (e) => { e.stopPropagation(); onRecrear(recrear); };
  const inf = el("div", { class: "tj-inf" },
    el("p", { class: "tj-nombre" }, titulo),
    sub ? el("small", {}, sub) : null);
  tarjeta.append(caja, abrir, inf, recrear);
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
