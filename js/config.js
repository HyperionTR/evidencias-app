// Todo lo que cambia entre equipos/entornos vive aquí. Edita sin miedo.
export const CONFIG = {
  // --- Google (ver pasos de configuración) ---
  GOOGLE_CLIENT_ID: 'PEGA_AQUI_TU_CLIENT_ID.apps.googleusercontent.com',
  ROOT_FOLDER_ID: 'PEGA_AQUI_ID_CARPETA_Evidencias_de_validacion', // carpeta compartida con el equipo (editor)
  SHEET_ID: 'PEGA_AQUI_ID_HOJA_REGISTRO',                          // hoja NUEVA, no la del formulario
  SHEET_TAB: 'Registro',

  VALIDADORES: [
    'Margarita Paredes', 'Fernando Espinoza', 'Pamela Pedraza',
    'Marco Manrique', 'Emmanuel Hernandez', 'Aldair Alvarez',
  ],

  // Valor que se escribe en la columna "Tipo de validacion"
  TIPOS: { validacion: 'auditoria', segregado: 'segregado' },

  FOTO_MAX_PX: 1600,   // lado mayor
  FOTO_CALIDAD: 0.8,   // JPEG

  // --- Orden de rutas ---
  // El orden de las claves = orden en que se agrupan ciclos si llegan mezclados.
  // lados: true  -> las rutas se recorren por "lados" (ver LADOS)
  // desc:  true  -> número de mayor a menor (A7, A6, ... A1)
  CICLOS: {
    SD2:   { lados: false, desc: false },
    SD1:   { lados: false, desc: true },
    AM2:   { lados: true,  desc: true },
    AM0:   { lados: true,  desc: true },
    AM1:   { lados: true,  desc: true },
    AM101: { lados: true,  desc: true },   // SUPUESTO: confirma tu regla real
    AM201: { lados: true,  desc: true },   // SUPUESTO: confirma tu regla real
  },
  // Letras de cada lado, en el orden en que se recorren. COMPLÉTALAS con tus letras reales.
  // Una letra que no esté aquí cae en un lado extra al final.
  LADOS: [
    ['A', 'C', 'F', 'H', 'J', 'L', 'VN', 'VQ', 'VS', 'VU'],
    ['B', 'D', 'G', 'I', 'K', 'M', 'VP', 'VR', 'VT'],
  ],
};
