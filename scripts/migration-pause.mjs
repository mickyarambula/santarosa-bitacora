/**
 * Admission control for the old deployment during the final snapshot.
 * @param {string | undefined} mode
 * @param {string} method
 * @param {string} pathname
 */
export function migrationPauseResponse(mode, method, pathname) {
  if (mode !== 'paused' && mode !== 'moved') return null;
  // This one endpoint independently authenticates and authorizes management.
  if (pathname === '/api/migration-backup' && method === 'POST') return null;
  const headers = { 'Cache-Control': 'no-store', 'Content-Type': 'text/html; charset=utf-8' };
  if (mode === 'moved' && ['GET', 'HEAD'].includes(method)) {
    return new Response(null, { status: 302, headers: {
      ...headers, Location: 'https://santarosa-bitacora.vercel.app' + pathname,
    } });
  }
  const message = mode === 'moved'
    ? 'La bitácora ya cambió de dirección. Abre Santa Rosa en el nuevo enlace para continuar.'
    : 'Estamos trasladando la bitácora. La captura está pausada para conservar todos los registros. Vuelve en unos minutos.';
  const action = mode === 'moved'
    ? '<a href="https://santarosa-bitacora.vercel.app">Abrir Santa Rosa</a>'
    : '<form action="/api/migration-backup" method="post"><button>Descargar respaldo final · solo gerencia</button></form>';
  return new Response(`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Santa Rosa CRM</title><body style="font:18px system-ui;max-width:600px;margin:12vh auto;padding:24px;color:#283c2b"><h1>Santa Rosa CRM</h1><p>${message}</p>${action}</body></html>`, {
    status: mode === 'moved' ? 409 : 503, headers: { ...headers, 'Retry-After': '120' },
  });
}
