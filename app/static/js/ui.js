// Componentes de interfaz de PonchoStudio. Sin framework: funciones que devuelven nodos.

/* ---------- Utilidades ---------- */
export function el(tag, props = {}, ...hijos) {
  const nodo = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") nodo.className = v;
    else if (k === "style" && typeof v === "object") {
      // Las variables CSS (--x) solo se aplican con setProperty.
      for (const [prop, val] of Object.entries(v)) {
        if (prop.startsWith("--")) nodo.style.setProperty(prop, val);
        else nodo.style[prop] = val;
      }
    }
    else if (k.startsWith("on") && typeof v === "function") nodo.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "html") nodo.innerHTML = v;
    else if (k in nodo && typeof v !== "string") nodo[k] = v;
    else nodo.setAttribute(k, v === true ? "" : v);
  }
  agregar(nodo, hijos);
  return nodo;
}
function agregar(nodo, hijos) {
  for (const h of hijos.flat(Infinity)) {
    if (h === null || h === undefined || h === false) continue;
    nodo.append(h instanceof Node ? h : document.createTextNode(String(h)));
  }
}
export const limpiar = (nodo, ...hijos) => { nodo.replaceChildren(); agregar(nodo, hijos); return nodo; };

const RUTAS_ICONOS = {
  video: '<rect x="2" y="5" width="14" height="14" rx="2"/><path d="m16 10 6-3v10l-6-3z"/>',
  imagen: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
  audio: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  estudios: '<path d="M3 7h18v13H3z"/><path d="m3 7 3-4h4L7 7m6 0 3-4h4l-3 4"/>',
  subir: '<path d="M12 16V4m0 0-5 5m5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  chispa: '<path d="M12 3v4m0 10v4M3 12h4m10 0h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  corazon: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>',
  descargar: '<path d="M12 4v12m0 0-5-5m5 5 5-5"/><path d="M4 20h16"/>',
  repetir: '<path d="M3 12a9 9 0 0 1 15.5-6.3L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.3L3 16"/><path d="M3 21v-5h5"/>',
  copiar: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  borrar: '<path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14"/>',
  deshacer: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  enlace: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  libro: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
  play: '<path d="m7 4 13 8-13 8z"/>',
  ojo: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  ojoNo: '<path d="M9.9 4.2A10 10 0 0 1 12 4c6.5 0 10 8 10 8a17 17 0 0 1-3 4M6.6 6.6C3.6 8.5 2 12 2 12s3.5 8 10 8a9.7 9.7 0 0 0 5.4-1.6"/><path d="M14.1 14.1a3 3 0 0 1-4.2-4.2M2 2l20 20"/>',
  llave: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.8-9.8M17 6l3 3M14.5 8.5l2 2"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
  abajo: '<path d="m6 9 6 6 6-6"/>',
  ajustes: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  camara: '<path d="M23 7 16 12l7 5z"/><rect x="1" y="5" width="15" height="14" rx="2"/>',
  pincel: '<path d="M9.06 11.9 17.5 3.5a2.12 2.12 0 0 1 3 3l-8.4 8.44"/><path d="M7 14c-1.7 0-3 1.3-3 3 0 1.3-1 2-2 2 1 1.5 2.7 2 4 2 2.2 0 4-1.8 4-4 0-1.7-1.3-3-3-3z"/>',
  guardar: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
};
export function icono(nombre, clase = "icono") {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("class", clase);
  s.setAttribute("aria-hidden", "true");
  s.innerHTML = RUTAS_ICONOS[nombre] || "";
  return s;
}

const fmtUSD = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function usd(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "";
  return "US$" + fmtUSD.format(n);
}
export function fechaCorta(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const seg = (Date.now() - d.getTime()) / 1000;
  if (seg < 60) return "hace un momento";
  if (seg < 3600) return `hace ${Math.round(seg / 60)} min`;
  if (seg < 86400) return `hace ${Math.round(seg / 3600)} h`;
  return d.toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}

export function proporcion(formato, ancho, alto) {
  if (ancho && alto) return `${ancho} / ${alto}`;
  const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(formato || "");
  return m ? `${m[1]} / ${m[2]}` : "16 / 9";
}

// Arte de respaldo determinista: degradado oscuro con un tinte frío muy suave.
// Va con la clase "ruido" para que no se vea como un bloque plano.
const TINTES = ["177, 92, 255", "0, 224, 255", "224, 170, 255", "255, 79, 216", "139, 61, 255"];
export function arte(semilla = "") {
  let h = 0;
  for (const c of String(semilla)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const t1 = TINTES[h % TINTES.length];
  const t2 = TINTES[(h >> 4) % TINTES.length];
  const x = 15 + (h % 70), y = 10 + ((h >> 6) % 60);
  return `radial-gradient(80% 70% at ${x}% ${y}%, rgba(${t1}, .16), transparent 70%), ` +
         `radial-gradient(60% 60% at ${100 - x}% ${100 - y / 2}%, rgba(${t2}, .08), transparent 70%), ` +
         `linear-gradient(${h % 360}deg, #0d0d11, #16161c)`;
}

/* ---------- Masonry ---------- */
// Reparte cada elemento en la columna más baja (orden por filas, como un feed).
// columnas(ancho) decide cuántas columnas según el ancho del contenedor.
export function masonry(columnas) {
  const raiz = el("div", { class: "mas" });
  let items = [], n = 0;
  const distribuir = () => {
    const cols = Array.from({ length: n }, () => el("div", { class: "mas-col" }));
    const alturas = new Array(n).fill(0);
    for (const it of items) {
      let i = 0;
      for (let k = 1; k < n; k++) if (alturas[k] < alturas[i] - 0.01) i = k;
      cols[i].append(it);
      alturas[i] += (it.altoRel || 1) + 0.06;
    }
    raiz.replaceChildren(...cols);
  };
  const medir = () => {
    const ancho = raiz.clientWidth;
    if (!ancho) return;
    const nn = Math.max(1, columnas(ancho));
    if (nn !== n) { n = nn; distribuir(); }
  };
  const ro = new ResizeObserver(() => requestAnimationFrame(medir));
  ro.observe(raiz);
  raiz.poner = (lista) => {
    const iguales = lista.length === items.length && lista.every((x, i) => x === items[i]);
    items = lista;
    if (!n) medir(); else if (!iguales) distribuir();
  };
  raiz.soltar = () => ro.disconnect();
  return raiz;
}
export const columnasExplorar = (w) => (w < 360 ? 1 : w < 640 ? 2 : w < 900 ? 3 : w < 1150 ? 4 : 6);
export const columnasFeed = (w) => (w < 560 ? 2 : w < 900 ? 3 : 4);

/* ---------- Popover ---------- */
// Abre un menú anclado a un botón. Cierra con Esc, clic afuera o cerrar().
export function popover(boton, construir, { lado = "arriba", etiqueta = "Menú" } = {}) {
  const ancla = boton.closest(".pop-ancla") || boton.parentElement;
  let caja = null;
  const cerrar = (devolverFoco = true) => {
    if (!caja) return;
    caja.remove(); caja = null;
    boton.setAttribute("aria-expanded", "false");
    document.removeEventListener("mousedown", afuera, true);
    document.removeEventListener("keydown", tecla, true);
    if (devolverFoco) boton.focus();
  };
  const afuera = (e) => { if (caja && !caja.contains(e.target) && !boton.contains(e.target)) cerrar(false); };
  const tecla = (e) => { if (e.key === "Escape") { e.stopPropagation(); cerrar(); } };
  boton.setAttribute("aria-haspopup", "true");
  boton.setAttribute("aria-expanded", "false");
  boton.addEventListener("click", () => {
    if (caja) { cerrar(); return; }
    caja = el("div", { class: `pop pop-${lado}`, role: "dialog", "aria-label": etiqueta });
    agregar(caja, [construir(cerrar)]);
    ancla.append(caja);
    boton.setAttribute("aria-expanded", "true");
    document.addEventListener("mousedown", afuera, true);
    document.addEventListener("keydown", tecla, true);
    const f = caja.querySelector('[aria-selected="true"], [aria-pressed="true"], button, input, select');
    if (f) f.focus();
  });
  return { cerrar };
}

/* ---------- Toast ---------- */
export function toast(mensaje, tipo = "info", ms = 4200) {
  const caja = document.getElementById("toasts");
  if (!caja) return;
  const t = el("div", { class: `toast toast-${tipo}`, role: tipo === "error" ? "alert" : "status" }, el("span", {}, mensaje));
  caja.append(t);
  while (caja.children.length > 3) caja.firstElementChild.remove();
  setTimeout(() => t.remove(), ms);
}

/* ---------- Modal ---------- */
export function modal(contenido, { clase = "", etiqueta = "Ventana", alCerrar } = {}) {
  const previo = document.activeElement;
  const caja = el("div", { class: `modal ${clase}`, role: "dialog", "aria-modal": "true", "aria-label": etiqueta });
  agregar(caja, [contenido]);
  const fondo = el("div", { class: "modal-fondo" }, caja);
  const cerrar = () => {
    fondo.remove();
    document.removeEventListener("keydown", tecla);
    document.body.style.overflow = "";
    if (previo && previo.focus) previo.focus();
    if (alCerrar) alCerrar();
  };
  const tecla = (e) => {
    if (e.key === "Escape") cerrar();
    if (e.key === "Tab") {
      const foc = [...caja.querySelectorAll("button, [href], input, select, textarea, video[controls]")].filter((n) => !n.disabled);
      if (!foc.length) return;
      const pri = foc[0], ult = foc[foc.length - 1];
      if (e.shiftKey && document.activeElement === pri) { e.preventDefault(); ult.focus(); }
      else if (!e.shiftKey && document.activeElement === ult) { e.preventDefault(); pri.focus(); }
    }
  };
  fondo.addEventListener("mousedown", (e) => { if (e.target === fondo) cerrar(); });
  document.addEventListener("keydown", tecla);
  document.body.append(fondo);
  document.body.style.overflow = "hidden";
  requestAnimationFrame(() => {
    const f = caja.querySelector("[data-foco]") || caja.querySelector("button, [href], input, textarea");
    if (f) f.focus();
  });
  return cerrar;
}

export function confirmar({ titulo, texto, aceptar = "Aceptar", cancelar = "Cancelar", peligro = false }) {
  return new Promise((resolver) => {
    let respuesta = false;
    const btnSi = el("button", { class: `btn ${peligro ? "btn-peligro" : "btn-primario"}`, type: "button", "data-foco": "" }, aceptar);
    const btnNo = el("button", { class: "btn", type: "button" }, cancelar);
    const cerrar = modal([
      el("h2", {}, titulo),
      texto ? el("p", {}, texto) : null,
      el("div", { class: "modal-acciones" }, btnNo, btnSi),
    ], { etiqueta: titulo, alCerrar: () => resolver(respuesta) });
    btnSi.onclick = () => { respuesta = true; cerrar(); };
    btnNo.onclick = () => cerrar();
  });
}

/* ---------- Selector segmentado ---------- */
export function segmentado({ etiqueta, opciones, valor, onCambio, deshabilitado = false, nombre }) {
  const id = "seg-" + Math.random().toString(36).slice(2, 8);
  const grupo = el("div", { class: "segmentado", role: "radiogroup", "aria-labelledby": id });
  const botones = opciones.map((o) => {
    const op = typeof o === "object" ? o : { valor: o, texto: String(o) };
    const b = el("button", {
      type: "button", role: "radio", "aria-checked": String(op.valor === valor),
      disabled: deshabilitado || op.deshabilitado, title: op.titulo || null,
    }, op.icono || null, op.texto);
    b.dataset.valor = JSON.stringify(op.valor);
    b.onclick = () => fijar(op.valor, true);
    return b;
  });
  agregar(grupo, botones);
  grupo.addEventListener("keydown", (e) => {
    if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(e.key)) return;
    e.preventDefault();
    const activos = botones.filter((b) => !b.disabled);
    const i = activos.indexOf(document.activeElement);
    const sig = activos[(i + (e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1) + activos.length) % activos.length];
    sig.focus(); sig.click();
  });
  function fijar(v, avisar) {
    botones.forEach((b) => b.setAttribute("aria-checked", String(JSON.parse(b.dataset.valor) === v)));
    if (avisar && onCambio) onCambio(v);
  }
  const caja = el("div", { class: "campo" },
    el("span", { class: "etiqueta", id }, etiqueta, nombre ? el("span", { class: "valor" }, nombre) : null),
    grupo);
  caja.fijar = (v) => fijar(v, false);
  return caja;
}

// Icono de proporción (rectángulo) para formatos como 9:16.
export function formaIcono(formato) {
  const m = /^(\d+):(\d+)$/.exec(formato);
  if (!m) return null;
  const a = +m[1], b = +m[2], base = 14;
  const w = a >= b ? base : Math.max(6, Math.round(base * a / b));
  const h = b >= a ? base : Math.max(6, Math.round(base * b / a));
  return el("i", { class: "forma", style: { width: w + "px", height: h + "px" }, "aria-hidden": "true" });
}

/* ---------- Slider de duración ---------- */
export function sliderDuracion({ min = 4, max = 30, valor = 5, onCambio, etiqueta = "Duración" }) {
  const id = "dur-" + Math.random().toString(36).slice(2, 8);
  const salida = el("span", { class: "valor" }, `${valor} s`);
  const input = el("input", { type: "range", id, min, max, step: 1, value: valor, "aria-valuetext": `${valor} segundos` });
  const pintar = () => {
    const v = +input.value;
    salida.textContent = `${v} s`;
    input.setAttribute("aria-valuetext", `${v} segundos`);
    input.style.setProperty("--p", `${((v - min) / (max - min || 1)) * 100}%`);
  };
  input.addEventListener("input", () => { pintar(); onCambio && onCambio(+input.value); });
  pintar();
  const caja = el("div", { class: "slider" },
    el("label", { class: "etiqueta", for: id }, etiqueta, salida),
    input,
    el("div", { class: "slider-marcas", "aria-hidden": "true" }, el("span", {}, `${min} s`), el("span", {}, `${max} s`)));
  caja.fijarRango = (nmin, nmax, v) => {
    input.min = nmin; input.max = nmax; input.value = v;
    min = nmin; max = nmax;
    caja.querySelector(".slider-marcas").replaceChildren(el("span", {}, `${nmin} s`), el("span", {}, `${nmax} s`));
    pintar();
  };
  return caja;
}

/* ---------- Interruptor ---------- */
export function interruptor({ texto, ayuda, valor, onCambio }) {
  const input = el("input", { type: "checkbox", role: "switch", checked: !!valor });
  input.addEventListener("change", () => onCambio && onCambio(input.checked));
  const caja = el("label", { class: "interruptor" }, el("span", {}, texto, ayuda ? el("small", {}, ayuda) : null), input);
  caja.fijar = (v) => { input.checked = !!v; };
  return caja;
}

/* ---------- Dropzone de subida ---------- */
export function dropzone({ texto = "Subir imagen", acepta = "image/*", valor = null, onCambio, subir, chico = false }) {
  const caja = el("div", { class: "dropzone" });
  let actual = valor;
  const pintar = () => {
    caja.classList.toggle("dropzone-lleno", !!actual);
    if (actual) {
      const esVideo = /\.(mp4|webm|mov)(\?|$)/i.test(actual);
      const quitar = el("button", { class: "btn-icono dropzone-quitar", type: "button", "aria-label": `Quitar ${texto.toLowerCase()}` }, icono("x"));
      quitar.onclick = (e) => { e.stopPropagation(); actual = null; pintar(); onCambio && onCambio(null); };
      limpiar(caja, esVideo ? el("video", { src: actual, muted: true, playsInline: true }) : el("img", { src: actual, alt: texto }), quitar);
    } else {
      const input = el("input", { type: "file", accept: acepta, "aria-label": texto });
      input.addEventListener("change", () => input.files[0] && manejar(input.files[0]));
      limpiar(caja, el("div", {}, icono("subir"), el("span", {}, texto), chico ? null : el("div", { class: "nota" }, "Arrastra o toca")), input);
    }
  };
  async function manejar(archivo) {
    if (archivo.size > 50 * 1024 * 1024) { toast("El archivo pesa más de 50 MB.", "error"); return; }
    caja.classList.add("dropzone-cargando");
    try {
      const r = await subir(archivo);
      actual = r.url;
      pintar();
      onCambio && onCambio(r.url);
    } catch { /* el toast ya salió */ } finally {
      caja.classList.remove("dropzone-cargando");
    }
  }
  caja.addEventListener("dragover", (e) => { e.preventDefault(); caja.classList.add("encima"); });
  caja.addEventListener("dragleave", () => caja.classList.remove("encima"));
  caja.addEventListener("drop", (e) => {
    e.preventDefault(); caja.classList.remove("encima");
    const f = e.dataTransfer.files[0];
    if (f && !actual) manejar(f);
  });
  caja.fijar = (v) => { actual = v; pintar(); };
  pintar();
  return caja;
}

/* ---------- Insignias y estado ---------- */
export const insigniaCreditos = () => el("span", { class: "insignia insignia-creditos", title: "Este modelo gasta créditos de tu cuenta de Higgsfield" }, "Créditos Higgsfield");
export const insigniaDemo = () => el("span", { class: "insignia insignia-demo" }, "Demo");

const TEXTO_ESTADO = { en_cola: "En cola", generando: "Generando", listo: "Listo", fallo: "Falló", cancelado: "Cancelado" };
export function chipEstado(estado, progreso) {
  const txt = TEXTO_ESTADO[estado] || estado;
  return el("span", { class: `estado estado-${estado}` }, estado === "generando" && progreso ? `${txt} ${progreso}%` : txt);
}

/* ---------- Modelo: sigla, ícono e insignia ---------- */
export const insigniaDirecto = () => el("span", { class: "insignia insignia-directo", title: "Va directo al proveedor con tu llave" }, "Directo");
export function iconoModelo(m) {
  // Sigla corta: inicial + versión + inicial extra (Seedance 2.0 Fast → S2.0F).
  const palabras = String(m.nombre || m.id).split(/\s+/).filter(Boolean);
  const iv = palabras.findIndex((w) => /^\d/.test(w));
  let sigla = palabras[0][0];
  if (iv >= 0) sigla += palabras[iv] + (palabras[iv + 1] ? palabras[iv + 1][0] : "");
  else sigla += palabras[1] ? palabras[1][0] : (palabras[0][1] || "");
  sigla = sigla.slice(0, 5).toUpperCase();
  return el("span", { class: "modelo-icono" + (sigla.length > 3 ? " modelo-icono-largo" : ""), "aria-hidden": "true" }, sigla);
}
export const insigniaModelo = (m) => (m.gasta_creditos_higgsfield ? insigniaCreditos() : insigniaDirecto());

/* ---------- Tarjeta de medio ---------- */
// div.medio > caja del medio + botón que cubre todo (abrir) + capa con prompt y "Recrear".
export function tarjetaMedio(t, { onAbrir, onRecrear, demo = false } = {}) {
  const tarjeta = el("div", { class: "medio" });
  let firma = "";
  tarjeta.trabajo = t;
  tarjeta.actualizar = (nt) => {
    const f = [nt.estado, nt.progreso, nt.favorito, nt.resultado && nt.resultado.url, nt.resultado && nt.resultado.miniatura].join("|");
    tarjeta.trabajo = nt;
    if (f === firma) return;
    firma = f;
    t = nt;
    pintar();
  };

  function pintar() {
    const r = t.resultado || {};
    const ar = proporcion(t.ajustes && t.ajustes.formato, r.ancho, r.alto);
    const [aw, ah] = ar.split("/").map((x) => parseFloat(x));
    tarjeta.altoRel = aw && ah ? ah / aw : 0.6;
    const caja = el("div", { class: "medio-caja", style: { "--ar": ar } });
    const esDemo = demo || t.demo === true || t.proveedor === "demo";
    let video = null;
    const sinPreview = (hijos, clase = "") => {
      caja.classList.add("sin-medio", "ruido");
      caja.style.background = arte(t.id);
      tarjeta.altoRel = Math.max(tarjeta.altoRel, 0.75);
      return el("div", { class: `medio-pendiente ${clase}` }, ...hijos);
    };
    if (t.estado === "listo" && r.url && t.tipo === "video") {
      const poster = r.miniatura || null;
      video = el("video", { muted: true, loop: true, playsInline: true, preload: poster ? "none" : "metadata", poster, src: r.url, "aria-hidden": "true", tabIndex: -1 });
      video.muted = true;
      caja.append(video);
      if (t.ajustes && t.ajustes.duracion) caja.append(el("span", { class: "insignia medio-duracion" }, `${t.ajustes.duracion} s`));
    } else if (t.estado === "listo" && (r.url || r.miniatura)) {
      caja.append(el("img", { src: r.miniatura || r.url, alt: "", loading: "lazy" }));
    } else if (t.estado === "listo") {
      caja.append(sinPreview([el("strong", {}, "Listo"), el("span", {}, t.nota || "Sin vista previa.")]));
    } else if (t.estado === "fallo" || t.estado === "cancelado") {
      caja.append(sinPreview([el("strong", {}, t.estado === "fallo" ? "No se pudo generar" : "Cancelado"), t.error ? el("span", {}, t.error) : null], "medio-fallo"));
    } else {
      const p = Math.max(0, Math.min(100, t.progreso || 0));
      caja.append(sinPreview([
        el("span", { class: "porc" }, `${p}%`),
        el("div", { class: "progreso", role: "progressbar", "aria-valuenow": p, "aria-valuemin": 0, "aria-valuemax": 100, "aria-label": "Progreso" }, el("i", { style: { "--v": `${p}%` } })),
        el("span", {}, t.estado === "en_cola" ? "En cola" : "Generando…")]));
    }
    const abrir = el("button", { class: "medio-abrir", type: "button",
      "aria-label": `${t.tipo === "video" ? "Video" : "Imagen"}: ${(t.prompt || "sin prompt").slice(0, 80)}. ${TEXTO_ESTADO[t.estado] || ""}. Abrir` });
    abrir.onclick = () => onAbrir && onAbrir(t, tarjeta);
    if (video) {
      // Sin reproducción automática si el sistema pide menos movimiento.
      const jugar = () => { if (!matchMedia("(prefers-reduced-motion: reduce)").matches) video.play().catch(() => {}); };
      const parar = () => { video.pause(); };
      tarjeta.onmouseenter = jugar; tarjeta.onmouseleave = parar;
      abrir.onfocus = jugar; abrir.onblur = parar;
    }
    const sup = el("div", { class: "medio-sup" },
      t.estado !== "listo" ? chipEstado(t.estado, t.progreso) : null,
      esDemo ? insigniaDemo() : null,
      t.proveedor === "higgsfield" ? insigniaCreditos() : null,
      t.favorito ? el("span", { class: "fav", title: "Favorito" }, icono("corazon")) : null);
    const recrear = onRecrear && t.prompt ? el("button", { class: "btn", type: "button", "aria-label": `Recrear con este prompt y ajustes` }, icono("repetir"), "Recrear") : null;
    if (recrear) recrear.onclick = (e) => { e.stopPropagation(); onRecrear(t); };
    const inf = el("div", { class: "medio-inf" },
      el("p", {}, t.prompt || "Sin prompt"),
      recrear ? el("div", { class: "medio-acciones" }, recrear) : null);
    const check = el("span", { class: "medio-check", "aria-hidden": "true" }, icono("check"));
    limpiar(tarjeta, caja, sup, abrir, inf, check);
  }
  tarjeta.actualizar(t);
  return tarjeta;
}

// Datos de un trabajo para volver a cargarlo en el generador ("Recrear").
export function precargaDeTrabajo(t) {
  const a = { ...(t.ajustes || {}) };
  delete a.semilla;
  return { prompt: t.prompt || "", modelo: t.modelo, ajustes: a, estilo: t.estilo || null, camara: t.camara || null };
}

/* ---------- Visor de trabajo ---------- */
export function abrirVisor(t, { onFavorito, onRepetir, onBorrar, onRecrear, demo }) {
  const r = t.resultado || {};
  const medio = el("div", { class: "visor-medio" });
  if (t.estado === "listo" && r.url) {
    medio.append(t.tipo === "video"
      ? el("video", { src: r.url, controls: true, autoplay: true, loop: true, playsInline: true, poster: r.miniatura || null })
      : el("img", { src: r.url, alt: t.prompt || "Imagen generada" }));
  } else if (t.estado === "listo" && r.miniatura) {
    medio.append(el("img", { src: r.miniatura, alt: t.prompt || "Vista previa" }));
  } else {
    medio.classList.add("ruido");
    medio.style.background = arte(t.id);
    medio.append(el("div", { class: "medio-pendiente", style: { position: "static" } },
      chipEstado(t.estado, t.progreso), t.error ? el("span", {}, t.error) : null));
  }
  const ext = t.tipo === "video" ? "mp4" : "png";
  const btnFav = el("button", { class: "btn", type: "button", "aria-pressed": String(!!t.favorito) }, icono("corazon"), el("span", {}, t.favorito ? "Quitar favorito" : "Favorito"));
  const btnCopiar = el("button", { class: "btn", type: "button" }, icono("copiar"), "Copiar prompt");
  const btnRepetir = el("button", { class: "btn", type: "button", title: "Mismos ajustes, semilla nueva" }, icono("repetir"), "Repetir");
  const btnRecrear = onRecrear ? el("button", { class: "btn", type: "button", title: "Cargar prompt y ajustes en el generador" }, icono("pincel"), "Recrear") : null;
  const btnBorrar = el("button", { class: "btn btn-peligro", type: "button" }, icono("borrar"), t.estado === "en_cola" ? "Cancelar" : "Borrar");
  const descargar = r.url ? el("a", { class: "btn btn-primario", href: r.url, download: `ponchostudio-${t.id}.${ext}` }, icono("descargar"), "Descargar") : null;
  const cerrarBtn = el("button", { class: "btn-icono visor-cerrar", type: "button", "aria-label": "Cerrar visor" }, icono("x"));
  const a = t.ajustes || {};
  const datos = [
    ["Modelo", t.modelo],
    ["Estado", TEXTO_ESTADO[t.estado] || t.estado],
    a.resolucion ? ["Resolución", a.resolucion] : null,
    a.formato ? ["Formato", a.formato] : null,
    a.duracion ? ["Duración", `${a.duracion} s`] : null,
    a.calidad ? ["Calidad", { low: "Baja", medium: "Media", high: "Alta" }[a.calidad] || a.calidad] : null,
    t.costo_usd != null ? ["Costo", usd(t.costo_usd)] : null,
    ["Creado", fechaCorta(t.creado)],
  ].filter(Boolean);
  const info = el("div", { class: "visor-info" },
    el("div", { class: "chips" }, chipEstado(t.estado, t.progreso), demo || t.demo || t.proveedor === "demo" ? insigniaDemo() : null),
    el("div", { class: "visor-prompt" }, t.prompt || "Sin prompt"),
    t.nota ? el("p", { class: "nota" }, t.nota) : null,
    el("div", { class: "visor-acciones" }, descargar, btnRecrear, btnRepetir, btnFav, btnCopiar, btnBorrar),
    el("dl", { class: "visor-datos" }, datos.map(([k, v]) => [el("dt", {}, k), el("dd", {}, v)])));
  const cerrar = modal([cerrarBtn, medio, info], { clase: "visor", etiqueta: "Visor de trabajo" });
  cerrarBtn.onclick = cerrar;
  btnCopiar.onclick = async () => {
    try { await navigator.clipboard.writeText(t.prompt || ""); toast("Prompt copiado.", "ok"); }
    catch { toast("No se pudo copiar. Selecciona el texto a mano.", "error"); }
  };
  btnFav.onclick = async () => {
    const nt = await onFavorito(t).catch(() => null);
    if (nt) { t = nt; btnFav.setAttribute("aria-pressed", String(!!nt.favorito)); btnFav.lastChild.textContent = nt.favorito ? "Quitar favorito" : "Favorito"; }
  };
  btnRepetir.onclick = async () => { const ok = await onRepetir(t).catch(() => false); if (ok) cerrar(); };
  if (btnRecrear) btnRecrear.onclick = () => { cerrar(); onRecrear(t); };
  btnBorrar.onclick = async () => {
    const si = await confirmar({ titulo: "¿Borrar este trabajo?", texto: "Se quita de la biblioteca. El archivo queda guardado en data/medios.", aceptar: "Borrar", peligro: true });
    if (si && await onBorrar(t).catch(() => false)) cerrar();
  };
  return cerrar;
}
