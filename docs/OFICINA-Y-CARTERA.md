# Oficina, carteras y seguimiento compartido

Entrega preparada en `codex/oficina-y-cartera`. Su publicación requiere integrar el PR y aplicar las migraciones 0019–0021 dentro de la autorización correspondiente. Este documento describe el funcionamiento nuevo; no confirma su publicación.

## Quién puede hacer qué

| Función                                               | Comisionista                              | Oficina            | Gerencia                              |
| ----------------------------------------------------- | ----------------------------------------- | ------------------ | ------------------------------------- |
| Consultar y atender productores                       | Su cartera                                | Todas las carteras | Todas las carteras                    |
| Capturar para un comisionista                         | Para sí mismo                             | Sí                 | Sí                                    |
| Capturar cartera de empresa o pendiente               | No                                        | Sí                 | Sí                                    |
| Contactos, tareas y citas                             | En su cartera                             | En todas           | En todas                              |
| Recibir y validar papelería                           | Entregar/recibir, según reglas existentes | Sí                 | Sí                                    |
| Resolver una cartera pendiente                        | No                                        | Sí                 | Sí                                    |
| Cambiar una cartera ya establecida                    | No                                        | No                 | Sí, con motivo y revisión del grupo   |
| Autorizar habilitación/acopio, dictamen y excepciones | No                                        | No                 | Sí                                    |
| Cuentas, roles, invitaciones y candado                | No                                        | No                 | Solo con permiso adicional de accesos |

Oficina tiene acceso operativo general. Las listas anteriores de «carteras asignadas a Oficina» dejan de limitar sus permisos. El endpoint anterior rechaza cambios con una explicación para evitar que una pantalla desactualizada afirme que retiró permisos. Retirar el rol o inhabilitar la cuenta son las vías para retirar ese acceso. Esta entrega no asigna el rol a ninguna cuenta real.

## Recepción de un productor

1. En **Capturar productor**, buscar primero por nombre o teléfono. También aparecen coincidencias archivadas: abrirlas y pedir restauración si corresponde, sin duplicarlas.
2. Si ya existe, abrir su expediente y registrar la atención. La cartera permanece igual.
3. Si es nuevo, elegir **Cartera de empresa**, **Con comisionista** o **Pendiente de asignar**. La oficina como lugar de llegada no determina a quién pertenece la cartera.
4. Elegir la persona de atención. Se conserva por separado quién capturó la ficha.
5. Guardar y agregar los pendientes con persona responsable y fecha. Una ficha sin tareas aparece en **Sin siguiente paso**; una cartera sin identificar aparece en **Pendiente de asignar**.

«Directo» continúa significando la unidad de negocio fuera de la parafinanciera. No significa «sin comisionista». La cartera de empresa no usa una cuenta ficticia, ni reconoce o calcula comisiones económicas.

## Cambios de cartera

**Cartera y atención → Revisar asignación** permite cambiar a la persona que atiende. Oficina puede resolver carteras pendientes. Una transferencia de cartera establecida requiere Gerencia y motivo. Si pertenece a un grupo, se confirma el traslado de todas sus fichas; se conservan titular, documentos individuales e historial. Las tareas de un comisionista que perdería acceso requieren confirmar su traslado a la nueva persona de atención. Las tareas asignadas a Oficina o Gerencia permanecen con su responsable.

No se fusionan ni borran fichas para reasignarlas. La autoría de capturas y movimientos anteriores permanece. Las cuentas actuales de Jorge no se modifican.

## Tareas y bandeja diaria

Cada ficha admite varias tareas: por ejemplo, Oficina revisa INE y su comisionista visita la parcela. Cada una tiene persona responsable, fecha y estado. **Esperando respuesta** también exige una fecha de revisión. Atender o cancelar requiere resultado; ajustar exige motivo y evita sobrescribir una versión que otra persona ya modificó.

En **Hoy**, la bandeja permite elegir para hoy, vencido, esperando respuesta, todas las tareas, asignación pendiente, sin siguiente paso, papelería y decisiones de Gerencia. Oficina y Gerencia alternan entre su atención y todo el equipo. Hay búsqueda y páginas de 25 resultados; no se recorta a 100 tareas.

Las fechas se interpretan y muestran en Sinaloa (`America/Mazatlan`), aunque el teléfono esté configurado en otra zona. Una tarea vinculada a una cita toma su fecha; reprogramarla desde la cita actualiza la tarea. Su resultado se registra desde la cita para no duplicar contactos. Las próximas acciones anteriores se conservan como tareas y siguen sincronizadas con los endpoints anteriores.

## Comunicaciones

En **Comunicaciones**, elegir canal, destinatario y contenido exacto. Hay textos de apoyo para papelería, cita, recordatorio y autorizaciones que ya constan en el expediente. Completar los datos entre corchetes y revisar el texto antes de guardar.

- **Borrador:** queda registrado, pero no equivale a contacto o envío.
- **Envío confirmado manualmente:** la persona que preparó el mensaje declara que lo envió/comunicó e indica el resultado. Abrir WhatsApp o preparar correo no lo confirma.
- **Comunicación recibida:** registra el contenido recibido y quién lo documentó.
- **Fallo / cancelación:** se conserva el registro sin marcar contacto exitoso.

Se conservan contenido, referencia y versión documental indicada, destinatario, canal, actor y fecha del registro/confirmación. La referencia no adjunta un archivo. Los contactos antiguos siguen en la bitácora. La siguiente revisión se programa en Tareas desde el enlace de la sección.

No hay envío automático, lectura/entrega verificada, carga de adjuntos ni integración de mensajería en esta entrega. Ninguna prueba envía mensajes reales.

## Historia y conservación de datos

La bitácora se consulta de lo más reciente a lo más antiguo, con búsqueda por texto/persona, filtro por tipo y páginas de 25 movimientos. Los registros anteriores al límite de 200 continúan disponibles.

Migraciones nuevas:

- **0019:** agrega clasificación de cartera, responsable de atención, capturista y llegada. Conserva todas las carteras existentes como comisionista. Atención inicial = titular actual; capturista solo se recupera cuando consta en la actividad de alta; llegada histórica queda sin inventar. Permite dueño nulo para empresa/pendiente, también en grupos/citas.
- **0020:** crea tareas y traslada las próximas acciones existentes conservando texto, fecha y versión.
- **0021:** crea comunicaciones; comienza sin inventar envíos anteriores.

El respaldo completo incorpora ambas tablas nuevas y sigue reconociendo respaldos de esquemas anteriores. Archivar conserva tareas y comunicaciones; unificar fichas conserva ambos historiales. Unificar cuentas conserva autoría histórica y mueve atención/tareas abiertas solo cuando el destino mantiene acceso.

## Publicación y recuperación

Antes de publicar: revisar el PR, validar ensayo, obtener respaldo completo cifrado actualizado y autorizar integración/publicación. Aplicar las tres migraciones en una transacción, comprobar conservación de filas y carteras, desplegar el SHA revisado y comprobar la aplicación real.

Después de crear carteras de empresa no basta con volver al código anterior: exige un dueño que esas carteras no tienen. Ante un problema, conservar datos, bloquear temporalmente las escrituras si hace falta y corregir hacia delante; una restauración desde respaldo requiere reconciliar las capturas posteriores y autorización. No retirar columnas ni tablas automáticamente.
