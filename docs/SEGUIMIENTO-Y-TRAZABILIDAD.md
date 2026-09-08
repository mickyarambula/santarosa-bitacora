# Seguimiento y trazabilidad

Este bloque continúa sobre TanStack Start, Better Auth y Postgres. La preparación y las pruebas se hacen en una rama de trabajo y una base de ensayo. Integrar en `main` dispara Vercel: una versión de ensayo no equivale a producción.

## Cambios de operación

- **Cuentas duplicadas:** gerencia elige la duplicada y la cuenta que conservará el acceso. La revisión muestra correos y cantidad de productores; exige confirmar el correo. Reasigna productores, grupos y citas dentro de una transacción. Conserva usuarios de autenticación, contraseñas, documentos y autores de actividades anteriores. Inhabilita la duplicada, invalida sus sesiones y registra quién realizó la unificación. No compara nombres para fusionar automáticamente.
- **Avisos al equipo:** editar título, mensaje y vencimiento; retirar de Hoy; consultar cambios y restaurar. Retirar conserva el contenido. Un aviso vencido deja de aparecer en Hoy; restaurarlo no cambia su vencimiento. Una edición concurrente se rechaza para evitar sobrescribir a otra persona.
- **Citas:** reprogramar una cita pendiente con motivo obligatorio. Conserva su identificador y deja fecha anterior/nueva y responsable en la bitácora. Una cita cumplida o cancelada mantiene su fecha; se agenda otra. Los formularios muestran hora de Sinaloa aunque el dispositivo use otra zona.
- **WhatsApp por lista:** abrir el chat no escribe un contacto. Después de enviarlo, la persona pulsa «Ya lo envié». Se guarda una confirmación manual, sin inventar respuesta, entrega, lectura ni compromiso del productor. La lista y el mensaje de cada recorrido se conservan mientras se procesa.
- **Fichas y equipo:** la bitácora muestra autores y cambios relevantes antes/después; los correos ayudan a distinguir cuentas. Cambiar el nombre del perfil actualiza los nombres de su cartera. «Ver cartera» aclara que gerencia conserva sus permisos.

## Estructura y publicación

`0013_traceability.sql` agrega columnas para cuentas unificadas y vigencia de avisos, y la tabla `crm_audit`. No borra ni restaura datos. Los respaldos nuevos incluyen esta tabla; los respaldos de la migración original siguen verificándose con sus doce migraciones y diecisiete tablas originales.

Orden de entrega:

1. Respaldo cifrado y verificación aislada de restauración.
2. Aplicar y probar `0013_traceability.sql` en ensayo; comprobar la operación completa y la interfaz móvil.
3. PR revisable, compilación y pruebas aprobadas.
4. Con autorización para publicar, aplicar únicamente la migración pendiente en producción, antes de desplegar código que utiliza las columnas nuevas. No repetir migraciones históricas.
5. Integrar el PR y comprobar SHA, estado READY y recorridos publicados.
6. Ejecutar las operaciones de cuentas/avisos que se hayan autorizado, con revisión fresca y constancia del resultado. No restaurar el respaldo completo sobre una base que recibe capturas nuevas.

La versión anterior funciona con la ampliación de estructura. Una reversión de código conserva las columnas nuevas; no elimina la auditoría. Una unificación de datos no se revierte restaurando todo el CRM: necesita una operación puntual con revisión de los movimientos posteriores.

## Límites y siguientes mejoras

La dinámica se entiende: cada comisionista lleva una cartera; cada productor conserva expediente y papelería propios, incluso en un grupo; el seguimiento comercial, la validación y el dictamen llevan hacia habilitación y acopio. La autorización no demuestra entrega de dinero ni recepción física del grano.

Priorizar después:

1. Próxima acción con fecha y responsable, separada de notas y de la última edición. Distinguir seguimiento atrasado de una cita pendiente de cerrar.
2. Recuperación de acceso y verificación de correo completas, con envío de correo configurado.
3. Borradores y estado de guardado para trabajo con señal inestable.
4. Adjuntos, vigencia y comentarios de documentos si el equipo necesita guardar los archivos, además del checklist.
5. Historial consultable de decisiones de acceso y de grupos, paginación de actividad y reportes por identificador de cuenta, en vez de agrupar por nombre visible.
6. Registro de entregas y recepción de grano cuando se requiera medir realizado frente a solicitado/autorizado/proyectado.
7. Respaldos periódicos con pruebas de recuperación y consulta de ciclos anteriores.

La actividad histórica anterior no se reconstruye retroactivamente: solo puede mostrar los datos que se registraron. No se han agregado mensajes automáticos, sincronización sin conexión ni archivos de documentos en este bloque.
