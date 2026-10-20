import { CONFIG } from './config.js';

// ">B3_AM101" -> { letra:'B', num:3, ciclo:'AM101' }.  VM3_SD1 -> letra 'VM'
const RUTA_RE = /^[^A-Za-z0-9]*([A-Za-z]+)(\d+)_([A-Za-z0-9]+)$/;

export function claveRuta(ruta) {
  const m = RUTA_RE.exec(ruta || '');
  return m ? { letra: m[1].toUpperCase(), num: +m[2], ciclo: m[3].toUpperCase() } : null;
}

const lado = (letra) => {
  const i = CONFIG.LADOS.findIndex((g) => g.includes(letra));
  return i < 0 ? CONFIG.LADOS.length : i;
};
const ordenCiclo = (c) => {
  const i = Object.keys(CONFIG.CICLOS).indexOf(c);
  return i < 0 ? 99 : i;
};

// Comparador para Array.sort. Sin ruta -> al final, respetando el orden en que se pegó.
export function comparar(a, b) {
  const ka = claveRuta(a.ruta), kb = claveRuta(b.ruta);
  if (!ka || !kb) return (ka ? 0 : 1) - (kb ? 0 : 1) || a.orden - b.orden;
  if (ka.ciclo !== kb.ciclo) return ordenCiclo(ka.ciclo) - ordenCiclo(kb.ciclo);
  const cfg = CONFIG.CICLOS[ka.ciclo] ?? { lados: false, desc: true };
  const sa = cfg.lados ? lado(ka.letra) : 0;
  const sb = cfg.lados ? lado(kb.letra) : 0;
  return (
    sa - sb ||
    ka.letra.localeCompare(kb.letra) ||
    (cfg.desc ? kb.num - ka.num : ka.num - kb.num)
  );
}
