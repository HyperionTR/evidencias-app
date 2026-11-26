// Convierte el texto pegado desde Sheets en paquetes.
// Columnas (separadas por TAB): id, ruta, parada, monto, descripcion, origen, embalaje, estatus
// Solo la ID es obligatoria; el resto puede faltar o venir como #N/A.
const ID_RE = /^\d{6,}$/;
const RUTA_RE = /^>?[A-Za-z]+\d+_[A-Za-z0-9]+$/;
const limpiar = (s) => {
  s = (s ?? '').trim();
  return s === '#N/A' ? '' : s;
};
const sorting_statuses = [
  "in_container", "sorting", "buffered", 'ready_to_deliver'
]

export function parsearPegado(texto) {
  const paquetes = [];
  const vistos = new Set();
  for (const linea of texto.split(/\r?\n/)) {
    let c;
    if (linea.includes('\t')) {
      c = linea.split('\t').map(limpiar);
    } else {
      // Sin tabulaciones (WhatsApp a veces las convierte en espacios): ID y, si se puede, ruta.
      const t = linea.trim().split(/\s+/);
      c = [t[0] ?? '', RUTA_RE.test(t[1] ?? '') ? t[1] : ''];
    }
    const id = c[0];
    if (!ID_RE.test(id) || vistos.has(id)) continue; // ignora encabezados, "--- Validación", vacíos, duplicados
    vistos.add(id);

    // Validamos si el estatus se encuentra en alguna de las 3 columnas
    let estatus = c[7]; 
    if (sorting_statuses.includes(c[5])){
      estatus = c[5]; c[5] = '';
    }
    else if (sorting_statuses.includes(c[6])){
      estatus = c[6]; c[6] = '';
    }

    paquetes.push({
      id,
      ruta: c[1] || '',
      parada: c[2] || '',
      monto: c[3] || '',          // texto tal cual ("2518,92"); no lo necesitas para operar
      descripcion: c[4] || '',
      origen: c[5] || '',
      embalaje: c[6] || '',
      estatus: (estatus || '').toLowerCase(),
      soloId: c.filter(Boolean).length === 1,
      orden: paquetes.length,
    });
  }
  return paquetes;
}
