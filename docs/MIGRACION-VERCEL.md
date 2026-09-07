# Migración de Santa Rosa

Estado al 7 de septiembre de 2026: migración restaurada, integrada por PR 2
y publicada en https://santarosa-bitacora.vercel.app/. Se verificó el acceso
real con Google como la misma gerencia y la conservación de las 18 cuentas,
61 productores, 15 grupos, 645 registros de papelería y 25 citas.
Las 13 tablas de CRM/configuración coinciden íntegramente con el respaldo
final; las 11 contraseñas se conservaron. Las sesiones antiguas se invalidaron.
El usuario debe volver a entrar con su mismo correo o cuenta Google.

Vercel: proyecto `santarosa-bitacora`, cuenta `mickyarambulas-projects`.
Neon propio: `santarosa-bitacora-db`, proyecto `soft-sun-73911653`, rama `main`.
Google propio: `abiding-aspect-507922-i6`, OAuth en producción.
La base original de Grok se conserva; no debe recibir nuevas capturas.
El respaldo final es del 7 de septiembre a las 23:29:24 UTC, cifrado y privado.
No subirlo ni subir su llave a GitHub.

Para mejoras futuras: rama de trabajo, pruebas con base aislada, PR revisable,
integración autorizada en `main` y comprobación de la publicación de Vercel.
GitHub ya está conectado: integrar en `main` dispara el despliegue de producción.
No integrar para “solo guardar código” si todavía no se debe publicar.
La vista de ensayo usa una rama Neon independiente; las credenciales de ensayo
están limitadas a `codex/migracion-vercel`, no a todos los previews.
Para otra rama, preparar su entorno aislado antes de probarla.

## Accesos

`VITE_AUTH_MODE=standalone` utiliza Better Auth con correo/contraseña y Google
propio, sin broker ni gate de Grok. `VITE_AUTH_ENABLED=true` es obligatorio.
Configurar `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET` y `DATABASE_URL` en el destino.
Para mostrar Google: `VITE_GOOGLE_ENABLED=true`, `GOOGLE_CLIENT_ID` y
`GOOGLE_CLIENT_SECRET`. Callback: `/api/auth/callback/google` en cada origen
autorizado. No subir secretos ni respaldos al repositorio.

Las cuentas de Google se vinculan por correo verificado por Google al mismo
usuario existente. No renombrar `grok-google` a `google`: sus identificadores
no son intercambiables. Las contraseñas existentes están en `account.password`
y se conservan sin transformación. Las sesiones se reinician.

## Recuperación

`scripts/restore-migration-backup.mjs` descifra en memoria, comprueba el respaldo
en una base temporal, exige el proyecto y host de destino explícitos y rechaza
una base con tablas existentes. Reconstruye las migraciones y compara todos los
registros antes de confirmar una única transacción. Después invalida las sesiones
y tokens del intermediario en el destino; el respaldo original permanece intacto.

Argumentos: archivo cifrado, llave privada, archivo de entorno privado, host
directo esperado y ruta de comprobante privado. El entorno incluye
`DATABASE_URL_UNPOOLED` y `NEON_PROJECT_ID`. No ejecutar contra Grok.

## Publicación

1. Probar la restauración en una rama de base separada y el acceso en una vista
   previa protegida de Vercel. Sus secretos se limitan a la rama de migración.
2. Revisar los cambios y las pruebas antes de integrarlos.
3. Preparar una pausa de captura en el origen; obtener un respaldo final para
   evitar que las capturas posteriores queden fuera.
4. Restaurar ese respaldo en el destino vacío y cotejar usuarios, permisos,
   productores, grupos, papelería, citas, candado y avisos.
5. Publicar el código integrado, comprobar los accesos y comunicar el enlace
   definitivo. Mantener el origen y respaldo para recuperación.

### Pausa y cambio del enlace viejo

Solo en la compilación del origen Grok, `VITE_MIGRATION_SOURCE_MODE=paused`
detiene todas las solicitudes dinámicas, incluidas las enviadas por pestañas
abiertas, antes de ejecutar el CRM. Mantiene únicamente el POST de
`/api/migration-backup`, que exige origen correcto, sesión y gerencia activa.
Iniciar sesión de gerencia antes de publicar la pausa. La página de pausa
contiene el formulario para descargar el respaldo final.

Tras confirmar el destino, `VITE_MIGRATION_SOURCE_MODE=moved` sirve una página
que lleva el navegador al dominio definitivo y conserva la ruta. Usa HTML con
enlace, meta refresh y `location.replace`, porque el proxy de Grok devolvió 502
con la redirección HTTP externa. Rechaza escrituras viejas sin reenviarlas.
Para revertir una pausa antes del cambio, quitar esta variable y republicar el
origen. El modo `standalone` ignora esta variable, incluso si se hereda.

La pausa está probada tanto en pruebas unitarias como en la salida compilada.
No se activa al integrar el código: requiere configurar y publicar el origen.

Una compilación correcta o un push a GitHub no certifican la publicación ni
el traslado de datos. La base principal y la de pruebas deben estar separadas.
