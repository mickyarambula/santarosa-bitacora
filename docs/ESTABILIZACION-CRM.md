# Estabilización de Santa Rosa — septiembre de 2026

Esta entrega conserva TanStack Start, Better Auth, Vercel, Neon y los datos existentes. No introduce migraciones SQL ni vuelve a restaurar el respaldo: las capturas que haga el equipo siguen en su base actual.

## Comportamiento corregido

- Consultar el tablero o entrar a la aplicación ya no borra ejemplos por nombres/notas ni fusiona productores automáticamente. La limpieza explícita solo reconoce `is_example`.
- Las escrituras del CRM se completan en una transacción. Un error revierte todos los pasos. En Postgres, un bloqueo por transacción evita carreras entre capturas y cambios de grupo en distintas instancias.
- Los grupos se forman explícitamente, pertenecen a una misma cuenta responsable y mantienen un único titular válido. El teléfono compartido se permite únicamente dentro de ese grupo; no se vinculan carteras por coincidencia de teléfono.
- Gerencia elige una cuenta real como responsable. La actividad conserva quién realizó la captura. Reasignar una ficha agrupada mueve todo el grupo y sus citas; el formulario lo advierte.
- Cambiar esquema conserva estados y notas de documentos previos. Solo la lista vigente cuenta en tablero, alertas y papelería. «No lo hizo» sigue pendiente. Un expediente legado con documentos ausentes muestra una advertencia y se completa al guardar explícitamente la ficha.
- Solo gerencia valida documentos, autoriza excepciones, dicta rechazos y cambia habilitación/acopio. Se exige revisar los documentos obligatorios antes de autorizar. Para modificar montos o documentos obligatorios de una autorización, primero se devuelve a evaluación.
- La superficie solicitada se mantiene consistente tras editar, rechazar parcialmente y retirar el dictamen. Una cita creada por gerencia queda en la agenda del responsable del productor. Se conserva America/Mazatlan.
- Un error inicial muestra un mensaje y permite reintentar. La vista de cartera aclara que gerencia conserva sus permisos.
- El acceso directo usa iconos existentes de Santa Rosa y una guía en español. La instalación no implica funcionamiento sin conexión.

## Verificación

Resultado local: 232 pruebas aprobadas, revisión de tipos y compilación standalone correctas. También se comprobó el adaptador real de Postgres contra Neon de ensayo con tablas temporales: commit y rollback correctos.

`npm run typecheck`, `npm test` y `npm run build` son las comprobaciones de entrega. `npm run build` exige primero tipos y pruebas; Vercel las ejecuta en cada compilación. Las pruebas usan datos ficticios aunque el despliegue tenga una conexión configurada. El archivo de GitHub Actions quedó preparado fuera del repositorio: la conexión actual carece del permiso `workflow`.

Las regresiones ejecutan los handlers reales del CRM y sus validadores contra Postgres PGLite temporal, con cuentas y fichas ficticias. Incluyen aislamiento de cartera, rollback provocado a mitad de escritura, concurrencia, cambio de esquema, titularidad, permisos, dictamen, listados de papelería y fechas. Los adaptadores Postgres y la pantalla de error tienen comprobaciones específicas. El arnés sustituye el middleware de sesión: no representa una prueba de OAuth.

La prueba móvil de integración usa el servidor local, su adaptador PGLite real y un navegador de 390 píxeles. Comprueba captura, responsable, validación persistida, consulta, iconos y guía de instalación. Para repetirla, iniciar un servidor local **sin DATABASE_URL** con `VITE_AUTH_ENABLED=false VITE_AUTH_MODE=standalone VITE_GOOGLE_ENABLED=false npm run dev`, y ejecutar `node scripts/verify-local-ui.mjs`. Nunca usar esa configuración en un despliegue.

## Pendientes de siguientes entregas

- Recuperación de contraseña y avisos mediante correo propio.
- Reprogramación de citas, próxima acción con responsable y fecha, y recordatorios operativos.
- Documentos adjuntos, borradores y tratamiento explícito de pérdida de conexión.
- Historial más completo, eliminación recuperable y revisión manual reversible de duplicados.
- Respaldos periódicos, práctica de restauración y alertas de errores.
- Revisar con el dueño las cuentas con rol gerente; esta entrega no cambia roles existentes.

No confundir el PR preparado con main integrado, ni main con una publicación READY. GitHub conectado despliega main automáticamente; la integración se realiza únicamente dentro de la autorización del dueño.
