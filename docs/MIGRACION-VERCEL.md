# Migración de Santa Rosa

Estado: preparación en la rama `codex/migracion-vercel`. El equipo continúa
en https://crmsantarosa.grok.me/ hasta verificar el traslado final.

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

Una compilación correcta o un push a GitHub no certifican la publicación ni
el traslado de datos. La base principal y la de pruebas deben estar separadas.
