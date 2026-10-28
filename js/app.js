import { CONFIG } from './config.js';
import { abrir, poner, todos, borrar, obtener, limpiar } from './db.js';
import { parsearPegado } from './parser.js';
import { comparar } from './orden.js';
import { crearSync } from './sync.js';
import { conectar, conectado } from './google.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- Estado ----------
const estado_app = { paquetes: [], fotos: [], actual: null, validador: '', cajaVacia: false, previo: null, stream: null, sync: 'ok', pantalla: 'datos' };
const sync = crearSync(estado_app, () => { renderEstado(); renderTabla(); if (estado_app.pantalla === 'camara') renderCamara(); });

const fotosDe = (id) => estado_app.fotos.filter((f) => f.paqueteId === id);
const porId = (id) => estado_app.paquetes.find((p) => p.id === id);
const validado = (p) => fotosDe(p.id).length > 0;
// Se puede ir a buscar: in_container, o cualquier paquete de segregado / lista de solo IDs
const disponible = (p) => p.tipo === 'segregado' || p.soloId || p.estatus === 'in_container' || p.estatus === 'ready_to_deliver';
const ordenada = () => {
  const o = [...estado_app.paquetes].sort(comparar);
  return [...o.filter(disponible), ...o.filter((p) => !disponible(p))];
};
const cola = () => ordenada().filter(disponible);

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  // Guardamos el temporizador 't' dentro de el propio objeto toast() -- Me acabo de enterar que la funcoines tambien son objetos
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 2500);
}

// ---------- Pantalla de datos ----------
async function cargarLista(reemplazar) {
  const nuevos = parsearPegado($('#pegado').value).map((p) => ({ ...p, tipo: $('#tipo').value }));
  if (!nuevos.length) return toast('No encontré IDs válidas');
  if (reemplazar) { await limpiar('paquetes'); estado_app.paquetes = []; }
  const mapa = new Map(estado_app.paquetes.map((p) => [p.id, p]));
  nuevos.forEach((p) => mapa.set(p.id, p));            // repegar actualiza estatus; las fotos no se tocan
  estado_app.paquetes = [...mapa.values()].map((p, i) => ({ ...p, orden: i }));
  await Promise.all(estado_app.paquetes.map((p) => poner('paquetes', p)));
  $('#pegado').value = '';
  renderTabla();
  toast(`${nuevos.length} paquetes cargados`);
}

function renderTabla() {
  const lista = ordenada();
  $('#resumen').textContent =
    `${lista.length} paquetes · ${lista.filter(validado).length} validados · ` +
    `${cola().filter((p) => !validado(p)).length} por validar`;
  $('#tabla tbody').innerHTML = lista.map((p) =>
    `<tr data-id="${p.id}" class="${validado(p) ? 'valido' : disponible(p) ? 'disp' : ''}">` +
    `<td>${p.id}</td><td>${esc(p.ruta)}</td><td>${esc(p.parada)}</td><td>${esc(p.estatus)}</td>` +
    `<td>${fotosDe(p.id).length || ''}</td></tr>`).join('');
}

// ---------- Cámara ----------
async function iniciarCamara() {
  if (estado_app.stream) return;
  try {
    estado_app.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, aspectRatio: { ideal: 4 / 3 },width: { ideal: 1440 }, height: { ideal: 1080 } },
      audio: false,
    });
    toast(`${$('#video').videoWidth}×${$('#video').videoHeight}`);
    $('#video').srcObject = estado_app.stream;
    await $('#video').play();
  } catch (e) { toast('No se pudo abrir la cámara: ' + e.message); }
}
function detenerCamara() { estado_app.stream?.getTracks().forEach((t) => t.stop()); estado_app.stream = null; }

let urls = [];
function renderCamara() {
  urls.forEach(URL.revokeObjectURL); urls = [];
  const p = porId(estado_app.actual);
  $('#dp-id').textContent = p?.id ?? 'Sin paquete';
  $('#dp-desc').textContent = p?.descripcion ?? '';
  $('#dp-ruta').textContent = p ? [p.ruta, p.parada && `parada ${p.parada}`].filter(Boolean).join(' · ') : '';
  $('#dp-extra').textContent = p ? [p.origen, p.embalaje, p.estatus, p.monto].filter(Boolean).join(' · ') : '';
  $('#dp-validacion').textContent = p ? p.tipo : '';
  $('#chk-vacia').checked = estado_app.cajaVacia;
  const fs = p ? fotosDe(p.id) : [];
  $('#miniaturas').innerHTML = '';
  for (const f of fs) {
    const d = document.createElement('div'); d.className = 'mini';
    if (f.blob) { const u = URL.createObjectURL(f.blob); urls.push(u); d.innerHTML = `<img src="${u}" alt="">`; } else d.textContent = '✓';
    if (f.estado === 'pendiente') d.insertAdjacentHTML('beforeend', `<b data-uid="${f.uid}">✕</b>`); // aún no sube: se puede borrar
    $('#miniaturas').append(d);
  }
  $('#btn-listo').hidden = !fs.length;
}

function ir(id) { estado_app.actual = id; estado_app.cajaVacia = false; renderCamara(); }
function paso(d) {
  const c = cola(); if (!c.length) return;
  let i = c.findIndex((p) => p.id === estado_app.actual);
  i = i < 0 ? (d > 0 ? 0 : c.length - 1) : (i + d + c.length) % c.length;
  ir(c[i].id);
}
function siguientePendiente() {
  const c = cola(); const i = c.findIndex((p) => p.id === estado_app.actual);
  for (let k = 1; k <= c.length; k++) {
    const p = c[(i + k + c.length) % c.length];
    if (!validado(p)) return ir(p.id);
  }
  toast('No quedan pendientes 🎉');
}

function capturar() {
  const v = $('#video'); if (!v.videoWidth) return;
  const k = Math.min(1, CONFIG.FOTO_MAX_PX / Math.max(v.videoWidth, v.videoHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k);
  c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
  c.toBlob((b) => {
    estado_app.previo = b;
    URL.revokeObjectURL($('#previo-img').src);
    $('#previo-img').src = URL.createObjectURL(b);
    $('#previo').hidden = false;
  }, 'image/jpeg', CONFIG.FOTO_CALIDAD);
}

async function aceptar() {
  const p = porId(estado_app.actual);
  if (!p || !estado_app.previo) return;
  if (!estado_app.validador) { $('#previo').hidden = true; return toast('Elige tu nombre arriba'); }
  const n = Math.max(0, ...fotosDe(p.id).map((f) => f.n)) + 1; // 2ª foto = re-validación o foto extra
  const f = {
    paqueteId: p.id, n, nombre: n === 1 ? `${p.id}.jpg` : `${p.id}_${n}.jpg`,
    blob: estado_app.previo, ts: Date.now(), validador: estado_app.validador,
    tipo: CONFIG.TIPOS[p.tipo] ?? p.tipo, cajaVacia: estado_app.cajaVacia, estado: 'pendiente',
  };
  f.uid = await poner('fotos', f);      // guardado local primero: nada se pierde sin internet
  estado_app.fotos.push(f); estado_app.previo = null;
  $('#previo').hidden = true;
  renderCamara(); renderTabla(); renderEstado();
  sync.procesar();                       // sube en segundo plano, sin esperar
}

async function mostrar(pantalla) {
  if (pantalla === 'camara' && !estado_app.actual) {
    const c = cola(); const p = c.find((x) => !validado(x)) ?? c[0];
    if (!p) return toast('Primero carga una lista');
    estado_app.actual = p.id;
  }
  estado_app.pantalla = pantalla;
  $('#pantalla-datos').hidden = pantalla !== 'datos';
  $('#pantalla-camara').hidden = pantalla !== 'camara';
  document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('activo', b.dataset.ir === pantalla));
  if (pantalla === 'camara') { renderCamara(); iniciarCamara(); } else detenerCamara();
}

// ---------- Estado de sincronización ----------
function renderEstado() {
  const n = sync.pendientes().length; let t, c;
  if (!navigator.onLine) { t = `Sin conexión${n ? ` · ${n} pendientes` : ''}`; c = 'warn'; }
  else if (!conectado()) { t = n ? `Conectar Google · ${n} pendientes` : 'Conectar Google'; c = 'bad'; }
  else if (estado_app.sync === 'error') { t = `Reintentando · ${n}`; c = 'warn'; }
  else if (n) { t = `Subiendo ${n}…`; c = 'info'; }
  else { t = 'Todo subido ✓'; c = 'ok'; }
  $('#estado').textContent = t; $('#estado').className = 'pill ' + c;
}

// ---------- Arranque ----------
async function iniciar() {
  await abrir();
  estado_app.paquetes = await todos('paquetes');
  estado_app.fotos = await todos('fotos');
  estado_app.validador = (await obtener('meta', 'validador')) || '';

  const sel = $('#validador');
  sel.innerHTML = '<option value="">— ¿Quién valida? —</option>' + CONFIG.VALIDADORES.map((v) => `<option>${v}</option>`).join('');
  sel.value = estado_app.validador;
  sel.onchange = () => { estado_app.validador = sel.value; poner('meta', estado_app.validador, 'validador'); };

  $('#btn-reemplazar').onclick = () => cargarLista(true);
  $('#btn-agregar').onclick = () => cargarLista(false);
  $('#tabla').onclick = (e) => { const tr = e.target.closest('tr'); if (tr) { ir(tr.dataset.id); mostrar('camara'); } };
  document.querySelectorAll('nav button').forEach((b) => (b.onclick = () => mostrar(b.dataset.ir)));
  $('#btn-disparo').onclick = capturar;
  $('#btn-aceptar').onclick = aceptar;
  $('#btn-rechazar').onclick = () => { estado_app.previo = null; $('#previo').hidden = true; };
  $('#btn-prev').onclick = () => paso(-1);
  $('#btn-next').onclick = () => paso(1);
  $('#btn-listo').onclick = siguientePendiente;
  $('#chk-vacia').onchange = (e) => (estado_app.cajaVacia = e.target.checked);
  $('#miniaturas').onclick = async (e) => {
    const uid = +e.target.dataset.uid; if (!uid) return;
    await borrar('fotos', uid); estado_app.fotos = estado_app.fotos.filter((f) => f.uid !== uid);
    renderCamara(); renderTabla(); renderEstado();
  };
  $('#estado').onclick = async () => {
    try { await conectar(); } catch { toast('No se pudo conectar con Google'); }
    renderEstado(); sync.procesar();
  };

  window.addEventListener('online', () => { renderEstado(); sync.procesar(); });
  window.addEventListener('offline', renderEstado);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) detenerCamara();
    else { if (estado_app.pantalla === 'camara') iniciarCamara(); sync.procesar(); }
  });
  setInterval(renderEstado, 30000);

  navigator.storage?.persist?.();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
  renderTabla(); renderEstado();
  sync.procesar();
}
iniciar();
