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
    // Grok's published proxy returns 502 for the external HTTP redirect.
    // Serve a small page so the browser performs the approved navigation.
    const target = 'https://santarosa-bitacora.vercel.app' + pathname;
    const attribute = target.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] ?? c));
    const scriptTarget = JSON.stringify(target).replace(/</g, '\\u003c');
    const html = `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=${attribute}"><title>Santa Rosa CRM</title><body><h1>Santa Rosa CRM</h1><p>La bitácora cambió de dirección.</p><a href="${attribute}">Abrir Santa Rosa</a><script>window.location.replace(${scriptTarget});</script></body></html>`;
    return new Response(method === 'HEAD' ? null : html, { status: 200, headers });
  }
  const message = mode === 'moved'
    ? 'La bitácora ya cambió de dirección. Abre Santa Rosa en el nuevo enlace para continuar.'
    : 'Estamos trasladando la bitácora. La captura está pausada para conservar todos los registros. Vuelve en unos minutos.';
  const action = mode === 'moved'
    ? '<a href="https://santarosa-bitacora.vercel.app">Abrir Santa Rosa</a>'
    : '<form action="/api/migration-backup" method="post"><button>Descargar respaldo final · solo gerencia</button></form>';
  const download = mode === 'paused' ? `<p id="status" role="status"></p><script>
document.querySelector('form').addEventListener('submit', async function(event) {
  event.preventDefault();
  const button = this.querySelector('button');
  const status = document.getElementById('status');
  button.disabled = true; status.textContent = 'Preparando respaldo cifrado…';
  try {
    const headers = { 'Content-Type': 'application/json' };
    const token = sessionStorage.getItem('grok-auth.bearer-token');
    if (token) headers.Authorization = 'Bearer ' + token;
    const response = await fetch('/api/migration-backup', { method: 'POST', credentials: 'same-origin', headers, body: '{}' });
    if (!response.ok) throw new Error(await response.text());
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement('a'); anchor.href = url;
    const disposition = response.headers.get('content-disposition') || '';
    anchor.download = disposition.split('filename="')[1]?.split('"')[0] || 'santarosa-final.srbackup';
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    status.textContent = 'Respaldo cifrado descargado.';
  } catch (error) { status.textContent = error.message || 'No se pudo descargar el respaldo.'; }
  finally { button.disabled = false; }
});</script>` : '';
  return new Response(`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Santa Rosa CRM</title><body style="font:18px system-ui;max-width:600px;margin:12vh auto;padding:24px;color:#283c2b"><h1>Santa Rosa CRM</h1><p>${message}</p>${action}${download}</body></html>`, {
    status: mode === 'moved' ? 409 : 503, headers: { ...headers, 'Retry-After': '120' },
  });
}
