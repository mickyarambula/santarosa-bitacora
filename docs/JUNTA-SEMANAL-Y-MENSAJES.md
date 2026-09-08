# Junta semanal y mensajes preparados

Entrega en la rama `codex/junta-semanal-y-mensajes`. Este documento describe código preparado; no confirma que ya esté publicado en el enlace oficial.

## Qué cambia

- **Hoy:** acceso principal por función. En escritorio, las herramientas secundarias y la administración se agrupan en secciones desplegables; en celular permanecen dentro de Más. Gerencia tiene Junta semanal y decisiones; Oficina, recepción y papelería; Comisionista, Registrar seguimiento y sus pendientes. Los totales y las etapas se consultan desplegando sus secciones. Se elimina el bloque duplicado «Qué urge» del inicio; sus herramientas siguen en el CRM.
- **Junta semanal / Mi semana:** elegir una fecha selecciona lunes–domingo en Sinaloa. Gerencia y Oficina ven todas las carteras; Comisionista solo la suya. Empresa y pendientes de asignar permanecen separados de los comisionistas. Los nombres iguales no fusionan cuentas: la agrupación usa identificadores.
- **Avisos:** pestañas separadas para el equipo y para productores. Los mensajes nuevos pasan por destinatarios, revisión y guardado antes de abrir WhatsApp.

## Cómo llevar una junta

1. Abrir **Junta semanal**, elegir la semana y la cartera. Tocar una cifra para consultar los registros que la respaldan.
2. Revisar **Lo trabajado**: contactos, altas, movimientos de papelería, cambios de etapa y citas marcadas cumplidas. Cada entrada muestra productor, autor y fecha.
3. Revisar **Compromisos**: tareas atendidas durante la semana, canceladas durante la semana y tareas que siguen abiertas al corte. Filtrar atendidas, vencidas o próximas. Las tareas vinculadas a citas conservan su relación; no son visitas adicionales.
4. Revisar **Trabas y próximos pasos**: falta de tarea, bloqueo declarado y evaluación pendiente. Los compromisos nuevos se guardan desde esta pantalla usando las tareas del expediente, con responsable y fecha; no hay doble captura.
5. Gerencia escribe los acuerdos generales y confirma **Cerrar junta**. Se guarda una copia del informe completo del equipo, con las tareas y acuerdos al cierre. Una junta por ciclo y semana; el resumen cerrado no se sobrescribe. Seleccionar esa semana permite consultar el resumen o la situación actual. Oficina puede consultarlo; Comisionista consulta únicamente su informe en vivo, sin acceder al resumen general.

### Qué significan las cifras

- **Productores atendidos:** productores distintos con contactos registrados (incluidos intentos) o citas marcadas cumplidas en la semana. Abrir WhatsApp, notas internas, borradores, fallos y cancelaciones no cuentan.
- **Movimientos de la semana:** registros de contacto, altas, cambios de etapa y movimientos documentales, además de citas marcadas cumplidas. No es una calificación de desempeño ni un conteo de ventas.
- **Tareas atendidas:** tareas con resultado y fecha de conclusión dentro de la semana. No implica que todas se hayan concluido a tiempo.
- **Vencidas al corte:** tareas abiertas cuya fecha límite ya pasó al consultar o cerrar la junta. En semanas anteriores, no se reconstruye automáticamente el estado que tenían al domingo: para ello se conserva el resumen cerrado.

Los contactos usan su fecha registrada de ocurrencia; documentos, cambios de etapa y confirmación de citas usan la fecha en que se registró la acción. La semana tiene inicio incluido y siguiente lunes excluido (`America/Mazatlan`, UTC−07:00); se excluyen eventos futuros.

La asignación de cartera es la vigente al consultar o guardar el informe, no una reconstrucción de quién tenía esa cartera cuando ocurrió cada hecho. La persona que registró la acción sí se conserva. Sin actividad registrada no significa que no hubo trabajo. Los movimientos de papelería incluyen recepción y validación, y pueden incluir varios cambios sobre un documento; no equivalen a expedientes completos. Los cambios de etapa incluyen avances y regresos. Datos antiguos sin trazabilidad suficiente no se inventan.

Los detalles se muestran por páginas de 20. Si el informe supera 10,000 registros de cualquiera de sus conjuntos, se detiene con un aviso: no entrega totales truncados.

## Cómo preparar mensajes

1. En **Avisos → Mensajes a productores**, elegir una etapa. Se muestran de inmediato destinatarios con teléfono y excluidos, con sus motivos. «Papelería» significa esa etapa; el módulo Papelería conserva la búsqueda por documento faltante.
2. Escribir el recado y pulsar **Revisar mensaje y destinatarios**. La vista previa identifica al gerente que prepara el envío; no se presenta como si fuera el comisionista.
3. **Guardar lista preparada** guarda mensajes individuales con nombre, teléfono y contenido exactos. Todavía no envía ni acredita un contacto. Si cambian los destinatarios desde la revisión, exige revisarlos otra vez. Reintentar el mismo guardado no crea otra lista.
4. Abrir WhatsApp, revisar y enviar personalmente; regresar y pulsar **Ya lo envié**. La confirmación es manual, sin prueba automática de entrega o lectura. **Omitir · no enviar** cancela ese borrador y no registra contacto.
5. Volver a **Mis listas preparadas** permite retomar lo pendiente después de salir, recargar o cambiar de dispositivo. Solo quien preparó la lista puede confirmar sus mensajes. Los borradores y sus resultados también aparecen en Comunicaciones del productor.

No se abren ni envían mensajes automáticamente. Se crea un mensaje por ficha, incluso si varios integrantes del mismo grupo comparten teléfono; el usuario puede omitir destinatarios. No se incluyen ejemplos, archivados, otros ciclos, cerrados ni rechazos totales. Límite: 500 fichas por preparación; si se supera, hay que elegir una etapa más pequeña.

Las listas del flujo anterior no tenían destinatarios ni progreso persistidos: no se reconstruyen inventando envíos. Sus avisos originales y los contactos manualmente confirmados se conservan en la base e historial. Esta entrega permite retomar las listas creadas con el flujo nuevo.

## Ensayo y publicación

Migración aditiva **0022_weekly_and_broadcasts.sql**: `weekly_meetings`, `broadcast_batches`, `broadcast_recipients` e índices para consultas semanales. No reclasifica productores ni modifica roles. El respaldo completo incorpora las tres tablas y mantiene compatibilidad con esquemas anteriores.

Pruebas: `npm run check`, `npm run lint`, compilación y `scripts/verify-weekly-ui.mjs` con cuentas ficticias en PGLite local. Este último usa las sesiones creadas por `scripts/verify-office-ui.mjs` en `/private/tmp/sr-office-test-auth.json`; el servidor debe usar `BETTER_AUTH_URL=http://localhost:8081` y un secreto exclusivamente de prueba. Los navegadores bloquean destinos externos. Eliminar las sesiones de ensayo al detener esa base.

Antes de producción: revisar el PR, autorizar integración y publicación, obtener respaldo cifrado actual, aplicar la migración y verificar que se conserva la información previa. Una reversión de código no debe borrar tablas nuevas ni sobrescribir trabajo posterior. Mantener el alojamiento actual de Santa Rosa.
