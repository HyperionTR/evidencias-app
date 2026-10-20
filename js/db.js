// IndexedDB mínimo. Stores:
//  paquetes (keyPath id)   -> la lista pegada
//  fotos    (keyPath uid)  -> cada foto + su estado de subida (cola persistente)
//  meta     (clave/valor)  -> validador elegido, etc.
let _db;
export const abrir = () =>
  (_db ??= new Promise((ok, mal) => {
    const r = indexedDB.open('evidencias', 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore('paquetes', { keyPath: 'id' });
      d.createObjectStore('fotos', { keyPath: 'uid', autoIncrement: true });
      d.createObjectStore('meta');
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => mal(r.error);
  }));

function op(store, modo, fn) {
  return abrir().then(
    (db) =>
      new Promise((ok, mal) => {
        const t = db.transaction(store, modo);
        const req = fn(t.objectStore(store));
        t.oncomplete = () => ok(req?.result);
        t.onerror = t.onabort = () => mal(t.error);
      })
  );
}

export const obtener = (s, k) => op(s, 'readonly', (o) => o.get(k));
export const poner = (s, v, k) => op(s, 'readwrite', (o) => o.put(v, k)); // devuelve la clave
export const todos = (s) => op(s, 'readonly', (o) => o.getAll());
export const borrar = (s, k) => op(s, 'readwrite', (o) => o.delete(k));
export const limpiar = (s) => op(s, 'readwrite', (o) => o.clear());
