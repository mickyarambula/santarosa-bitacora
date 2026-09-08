# Junta semanal y mensajes preparados

Reorganización en la rama `codex/junta-por-comisionista`. Este documento describe el funcionamiento preparado; la publicación se confirma por separado en el PR y en el enlace oficial. La versión inicial de junta y mensajes ya se publicó con el PR 9.

## Qué cambia

- **Hoy:** acceso principal por función. En escritorio, las herramientas secundarias y la administración se agrupan en secciones desplegables; en celular permanecen dentro de Más. Gerencia tiene Junta semanal y decisiones; Oficina, recepción y papelería; Comisionista, Registrar seguimiento y sus pendientes. Los totales y las etapas se consultan desplegando sus secciones. Se elimina el bloque duplicado «Qué urge» del inicio; sus herramientas siguen en el CRM.
- **Junta semanal / Mi semana:** elegir una fecha selecciona lunes–domingo en Sinaloa. Gerencia y Oficina ven todas las carteras; Comisionista solo la suya. Empresa y pendientes de asignar permanecen separados de los comisionistas. Los nombres iguales no fusionan cuentas: la agrupación usa identificadores.
- **Avisos:** pestañas separadas para el equipo y para productores. Los mensajes nuevos pasan por destinatarios, revisión y guardado antes de abrir WhatsApp.

## Cómo llevar una junta

1. Abrir **Junta semanal** y elegir la semana. La junta usa sus propios filtros y oculta el selector general de cartera para evitar selecciones contradictorias. Los filtros aparecen antes de la lista: **Comisionistas**, **Clientes de la empresa**, **Pendientes de asignar** o **Todo el equipo**. Se puede buscar por nombre; en cuentas coincidentes también por el correo que las distingue. Los filtros **Con actividad**, **Sin actividad registrada** y **Con pendientes vencidos** se combinan con la búsqueda. «Todos» conserva visibles las carteras sin movimientos.
2. Pulsar **Revisar semana →** junto al nombre. El resumen general se oculta y aparece únicamente la cartera elegida. **Siguiente cartera →** recorre la lista filtrada; **Volver al equipo** recupera los filtros. Las cuentas no se fusionan ni se cambian sus roles.
3. En **Qué hizo**, revisar registros y tocar **Ver movimiento →**. El expediente muestra el movimiento exacto, su autor y fecha, y un acceso a su sección. Para papelería y citas se abre y resalta el documento o cita concretos. Para contactos se abre su seguimiento; para altas y etapas, la bitácora. La evidencia de esa fecha se distingue del estado actual de la ficha. **Volver a la revisión semanal** recupera semana, cartera, filtros, pestaña y página; también se conservan al recargar o usar Atrás.
4. En **Qué tiene pendiente**, revisar tareas atendidas durante la semana y pendientes al corte; filtrar atendidas, vencidas o próximas. En **Qué necesita apoyo**, revisar bloqueos y fichas sin siguiente paso. En **Qué acordamos**, guardar tareas del expediente con responsable y fecha, sin doble captura.
5. Volver al equipo y desplegar **Cerrar junta y conservar resumen**. Gerencia escribe los acuerdos generales y confirma el cierre. Se guarda una copia del informe completo del equipo; una por ciclo y semana, sin sobrescribirla. Puede alternar entre resumen guardado y situación actual. Oficina consulta el cierre; Comisionista solo ve su informe en vivo. Los resúmenes antiguos sin clasificación por rol se abren como **Todo el equipo**, conservando los datos originales.

### Qué significan las cifras

- **Productores con actividad:** productores distintos con alguno de los movimientos incluidos en el informe. Varias acciones sobre un productor lo cuentan una sola vez. El filtro de detalle **Productores atendidos · contactos y citas cumplidas** restringe a contactos registrados (incluidos intentos) y citas cumplidas. Abrir WhatsApp, notas internas, borradores, fallos y cancelaciones no cuentan como contacto.
- **Con actividad / Sin actividad registrada:** considera movimientos y tareas atendidas. Una cartera sin actividad puede tener pendientes vencidos; permanece disponible para rendir cuentas.
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

Esta reorganización no necesita una migración ni cambios de datos. La entrega anterior ya aplicó **0022_weekly_and_broadcasts.sql**: `weekly_meetings`, `broadcast_batches`, `broadcast_recipients` e índices para consultas semanales. No reclasifica productores ni modifica roles. El respaldo completo incorpora las tres tablas y mantiene compatibilidad con esquemas anteriores.

Pruebas: `npm run check`, `npm run lint`, compilación y `scripts/verify-weekly-ui.mjs` con cuentas ficticias en PGLite local. Este último usa las sesiones creadas por `scripts/verify-office-ui.mjs` en `/private/tmp/sr-office-test-auth.json`; el servidor debe usar `BETTER_AUTH_URL=http://localhost:8081` y un secreto exclusivamente de prueba. Los navegadores bloquean destinos externos. Eliminar las sesiones de ensayo al detener esa base.

Antes de producción: revisar el PR, autorizar integración y publicación, obtener respaldo cifrado actual y verificar que se conserva la información previa. Una reversión de código no debe borrar tablas nuevas ni sobrescribir trabajo posterior. Mantener el alojamiento actual de Santa Rosa.
