# Respaldo previo al traslado de Santa Rosa

Estado al 7 de septiembre de 2026: **preparado y probado localmente; no integrado ni publicado**. No se ha obtenido un respaldo de producción. Rama `codex/respaldo-migracion`, basada en `87999e44c183cfe847d7b3327b2db0b5010a6034`.

## Problema y propuesta

El equipo usa https://crmsantarosa.grok.me/. Grok informa que su plataforma inyecta la conexión Neon únicamente en el proceso publicado y que su vista previa usa PGLite. No hay acceso directo verificado a ese Postgres desde Codex. Tener el repositorio no transfiere la base.

Esta propuesta añade a «Bajar Excel» una descarga temporal, cifrada y restringida a gerencia. Si se publica en la aplicación existente, su servidor intentará leer la misma conexión que ya utiliza el CRM. No revela `DATABASE_URL` ni necesita enviarla al navegador. Es una alternativa pendiente de comprobar en Grok; obtener un `pg_dump` mediante soporte sigue siendo una vía válida.

Publicar esta función modifica la aplicación en uso y requiere autorización de Miguel. **No autoriza cambiar de alojamiento, crear otra producción ni cambiar el enlace del equipo.**

## Alcance del archivo

Incluye todas las filas, sin filtro de ciclo o comisionista, de estas 17 tablas de la aplicación:

`user`, `account`, `session`, `verification`, `profiles`, `producer_groups`, `producers`, `documents`, `visits`, `activity`, `touches`, `office_people`, `office_pings`, `app_lock`, `revoked_users`, `announcements`, `_migrations`.

Incluye nombres y tipos de columnas e historial de migraciones. Conserva las filas como JSON textual de Postgres para mantener precisión numérica y fechas. Los hashes de contraseña están en `account.password` según el esquema del repositorio.

**No es un `pg_dump` ni una copia de toda la infraestructura.** No copia roles de Postgres, extensiones, objetos de otros esquemas, definiciones de vistas, cambios manuales en restricciones o disparadores, archivos externos ni secretos del entorno. La reconstrucción depende de las migraciones del repositorio. Si aparecen diferencias de estructura o permisos en producción, se detiene y se revisa antes de continuar. El origen y la revisión incluidos en el archivo son etiquetas configuradas, no una certificación independiente del despliegue.

## Controles preparados

- La identidad procede del middleware de autenticación existente. El servidor vuelve a comprobar que hay un usuario con perfil activo de gerencia y que no está revocado.
- La lectura usa una única conexión y una transacción `REPEATABLE READ READ ONLY`. No llama a `bootstrap` ni `requireProfile`, que pueden escribir.
- Se rechazan tablas inesperadas, migraciones distintas, columnas generadas, permisos insuficientes o filtrado por políticas de filas. No se entrega un archivo parcial.
- Se rechaza el entorno sin `DATABASE_URL`. No se presenta PGLite como respaldo de producción.
- El archivo se cifra en el servidor con AES-256-GCM; la llave aleatoria se protege con RSA-OAEP-SHA256 y una llave pública fija. El solicitante no puede elegir otro destinatario. Cualquier gerente activo puede pedir el archivo cifrado; solo quien conserve la llave privada puede abrirlo.
- La llave privada se conserva únicamente en `.migration-private/recovery.pem`, con permisos locales restringidos. La carpeta, los archivos `.pem` y `.srbackup` están excluidos de Git. Debe conservarse una copia segura de esta llave antes de publicar: sin ella el respaldo no se recupera.
- La ventana termina el **14 de septiembre de 2026 a las 14:49:12, hora de Mazatlán**. Después se necesita una nueva preparación.
- Límites: 50,000 filas por tabla, 16 MiB antes de cifrar y 3 MiB de respuesta cifrada. Si se rebasan, hace falta revisar otro método. Cada consulta tiene un límite de tiempo.
- La respuesta no se almacena en caché y los errores de base no se devuelven con detalles de registros o conexión.

El respaldo contiene información sensible de autenticación aunque viaje cifrada. No se debe subir el archivo ni su llave al repositorio, chats o issues.

## Cambios revisables

- `src/lib/backup-core.server.ts`: lectura, comprobaciones y cifrado; descifrado para verificación local.
- `src/lib/backup-recipient.server.ts`: llave pública y caducidad. No contiene la llave privada.
- `src/lib/migration-backup.ts` y `migration-backup.server.ts`: función autenticada y conexión al Postgres del despliegue.
- `src/routes/_app/exportar.tsx`: tarjeta para gerencia, conservando CSV y Excel.
- `scripts/verify-migration-backup.mjs`: recuperación exclusivamente en una base nueva en memoria; no acepta destinos remotos ni guarda filas descifradas en disco.
- `scripts/migration-backup.test.mjs`: pruebas con datos ficticios.
- `package.json`: para esta publicación temporal, `build` solo compila. Se separó la ejecución automática de `db:migrate` para evitar que publicar el respaldo aplique migraciones pendientes. El comando explícito continúa existiendo. Hay que revisar también cualquier comando externo que configure Grok al publicar.

## Verificación realizada

- Compilación de producción sin `DATABASE_URL`: pasó, sin ejecutar migraciones.
- Revisión de tipos: pasó.
- Ocho pruebas nuevas: pasaron. Cubren cifrado y restauración de las 17 tablas; otro ciclo; relaciones; precisión numérica; fechas; rechazo de usuarios sin permiso, esquemas incompatibles, filtrado RLS, archivos alterados, llave incorrecta y entorno de vista previa.
- Se comprobó que el proceso de exportación de prueba no cambia los registros de origen.
- En navegador local con base vacía se revisaron la tarjeta de gerencia y la confirmación de descarga. **No se verificó una descarga real desde Grok.**
- La suite general no está totalmente verde: 157 pruebas, 143 correctas y 14 fallidas. En una copia intacta de `main` se reprodujeron los mismos 14 fallos (149 pruebas, 135 correctas), relacionados con supuestos de la plantilla y archivos de marca.
- La segunda etapa de pruebas, ejecutada aparte porque la anterior interrumpe `npm test`, tuvo 26 correctas y un fallo de resolución del alias de `reminders`. También se reprodujo en `main`. Estos fallos previos no se modificaron en esta propuesta.

## Procedimiento pendiente

1. Miguel autoriza integrar y publicar **únicamente el respaldo temporal** en la aplicación Grok existente, y descargar el archivo cifrado a su equipo. Antes de integrar, comprobar nuevamente `main` y el estado del proyecto Grok para no sobrescribir cambios posteriores.
2. Conservar la llave privada fuera de Git. Revisar la diferencia propuesta y trasladarla al proyecto Build correcto. Subir a GitHub por sí solo no demuestra que Grok haya recibido o publicado el cambio; confirmar el código en Build y el comando de compilación antes de pulsar «Publicar cambios».
3. En el mismo dominio, entrar como gerencia → Bajar Excel → Descargar respaldo cifrado. Si falla, conservar el sitio actual y analizar el mensaje sin habilitar exportaciones anónimas ni imprimir secretos.
4. Guardar el `.srbackup` en `.migration-private/` y comprobarlo localmente:

   ```sh
   node --experimental-strip-types scripts/verify-migration-backup.mjs .migration-private/archivo.srbackup .migration-private/recovery.pem
   ```

   La herramienta descifra y reconstruye en memoria; compara todas las filas y devuelve solo conteos. Esta comprobación todavía está pendiente con datos reales.

5. Revisar el resultado, los accesos y el plan de traslado antes de crear o conectar otro alojamiento. Registrar qué servicios serán de Miguel y cómo se recuperaría el servicio si falla el cambio.
6. Preparar autenticación independiente de Grok y un destino aislado con autorización específica. Preservar los hashes existentes no garantiza que las cuentas que usaban exclusivamente Google/X tengan contraseña. Resolver vinculación o recuperación antes de cambiar de dominio. No reutilizar automáticamente sesiones ni tokens antiguos.
7. Para el corte definitivo, acordar una pausa de captura y obtener un respaldo final: el archivo inicial no incluye registros añadidos después de su transacción. Verificar cuentas, roles, productores, grupos, papelería, citas, candado y avisos en el destino antes de cambiar el enlace del equipo.
8. Retirar la función temporal y definir por separado el procedimiento normal de migraciones de esquema. Su retirada requiere otra publicación; la caducidad solo impide generar nuevos archivos.

La marcha atrás de esta propuesta consiste en retirar sus archivos y la tarjeta, revisando por separado el cambio de `build`. No requiere restaurar datos porque la función de respaldo no escribe. La navegación normal y la autenticación conservan el comportamiento existente de la aplicación.

Después del traslado, el flujo de trabajo acordado será: rama de trabajo → pruebas aisladas → entrega revisable → integración autorizada → publicación autorizada → comprobación en la aplicación publicada. Cada entrega debe indicar por separado qué está preparado, integrado y realmente publicado.
