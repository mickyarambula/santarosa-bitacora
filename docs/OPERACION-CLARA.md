# Operación clara: campo, oficina y gerencia

Paquete posterior al PR 6. Trabajado en `codex/operacion-clara`, con base publicada `5fb2760`. Preparado para revisión antes de integrar o publicar; no modifica las cuentas reales durante el desarrollo.

## Comportamiento

- La baja de un productor archiva su ficha con motivo e historial. Conserva documentos, citas, contactos y grupos. Desaparece de listas operativas, agenda y seguimientos; gerencia puede restaurarla. Campo no archiva habilitaciones ni acopios autorizados.
- La baja de una cuenta no permite borrar su cartera. Primero debe reasignarse/unificarse y después inhabilitarse; la referencia histórica se conserva. La unificación sigue exigiendo revisión y confirmación de origen/destino.
- Preparar apoyo de oficina comprueba la pertenencia de la cita y la coherencia del productor. Abrir WhatsApp/teléfono/correo no registra contacto. El usuario confirma el envío o registra el resultado de la gestión.
- Una visita cumplida requiere resultado y registra una interacción vinculada a la visita, sin duplicarla al reintentar. Las notas internas no reinician el último contacto; un contacto antiguo no desplaza uno reciente.
- «No aplica» requiere motivo de gerencia y queda auditado. Campo marca papeles reunidos; Oficina puede recibirlos y validarlos. La papelería muestra reunidos y validados/autorizados por separado.
- Los indicadores identifican expedientes activos y montos/toneladas estimados. Los cerrados y archivados quedan fuera de la cartera activa. La edad de etapa se registra independientemente de las ediciones del teléfono u otros datos.
- El cierre distingue trato concretado, perdido o cancelado, con explicación. No convierte estimaciones en dinero entregado ni grano recibido. Los cierres históricos sin clasificación mantienen esa condición explícita.
- Los filtros y resúmenes distinguen las identidades de cuenta, incluso con nombres iguales. La interfaz nueva usa el identificador; se conserva la compatibilidad con filtros por nombre de pestañas antiguas.

## Experiencia móvil

- Navegación de campo: Hoy, Mis productores, Agenda y Más. El avance por etapas sigue disponible en Más.
- Hoy prioriza próximas acciones y citas; los totales quedan en un resumen. Se retiran del inicio los paneles permanentes de compartir la guía y probar filtros.
- Captura en dos pasos: datos básicos y servicio/revisión. Municipio, cultivo y servicio requieren elección. Relación/grupos y contexto adicional se despliegan cuando corresponden. Se conservan los esquemas, las cantidades por hectárea y los expedientes por persona.
- Borrador local por usuario, recuperable por decisión explícita, con vencimiento de siete días. El guardado definitivo borra el borrador. Los errores de guardado lo conservan. Es una recuperación de captura, no sincronización sin conexión.
- Ficha con papelería, citas e historial desplegables; los accesos abren su sección. Un documento muestra su estado y despliega las opciones al tocarlo.
- Registrar resultado abre la posibilidad de definir la próxima acción dentro del mismo recorrido. Son guardados explícitos separados: un contacto guardado no autoriza un documento, ni una tarea terminada cambia una habilitación.

## Roles y accesos

| Perfil                    | Alcance                         | Funciones                                                                |
| ------------------------- | ------------------------------- | ------------------------------------------------------------------------ |
| Comisionista              | Su cartera                      | Captura, contacto, agenda, próximos pasos, papeles reunidos              |
| Oficina                   | Carteras asignadas expresamente | Recepción y validación documental, observaciones; interfaz dedicada      |
| Gerencia                  | Equipo y cartera propia         | Supervisión, asignación de responsables, autorizaciones y excepciones    |
| Administración de accesos | Permiso adicional de gerencia   | Candado, cuentas, roles, invitaciones y asignación de carteras a Oficina |

Las gerencias existentes conservan la administración de accesos. Promover a alguien a gerencia no le concede automáticamente ese permiso. No se puede retirar el propio acceso administrativo, inhabilitarse ni convertir en Oficina una cuenta que todavía lleva productores. Ningún usuario real se reasigna por esta entrega.

Oficina no puede invocar los servicios comerciales existentes aunque manipule la navegación. Sus servicios específicos comprueban la asignación en cada solicitud. No se concede acceso financiero completo mediante la vista documental. Las revocaciones y cambios de asignación se aplican en el servidor, aunque una pestaña esté abierta.

Las invitaciones son individuales, vinculadas al correo, de un uso y válidas siete días. Solo se almacena el hash del token. Se pueden cancelar y no permiten saltarse la revisión de coincidencias. La invitación crea un acceso de comisionista; los permisos posteriores se asignan en Equipo. El enlace se copia para compartirlo manualmente: la aplicación no envía mensajes automáticamente.

Las cuentas de Jorge permanecen sin unificar hasta que el usuario confirme el correo que debe conservarse.

## Estructura y despliegue

Migraciones nuevas, sin restaurar ni resembrear producción:

1. `0016_operational_integrity.sql`: archivo, reloj de etapas, cierres, resultado de visitas y confirmación de apoyo. Los antiguos mensajes no se marcan retrospectivamente como confirmados.
2. `0017_office_permissions.sql`: permiso administrativo y carteras asignadas a Oficina. Conserva facultades de gerencias existentes.
3. `0018_team_invitations.sql`: invitaciones con token protegido y vencimiento.

La ampliación del respaldo incluye invitaciones y conserva la restauración de respaldos anteriores contra su esquema original. Antes de producción: respaldo cifrado y verificación, migraciones revisadas, integración autorizada y despliegue del mismo código comprobado. Después: confirmar dominio, versión y datos sin crear registros de prueba.

No revertir ciegamente al PR 6 después de usar archivo, Oficina o invitaciones: la versión antigua no conoce estas funciones ni el nuevo inventario de tablas del respaldo. Conservar datos y aplicar una corrección compatible o una reversión que mantenga los nuevos controles de acceso.

## Verificación

- Casos de permisos y lógica: `scripts/operational-integrity.test.mjs`, además de la batería existente.
- Navegador con autenticación real y personas ficticias: `scripts/verify-operational-ui.mjs`, contra `localhost:8081`, base PGLite desechable y bloqueo de tráfico externo.
- Compilación aprobada con 274 pruebas (222 de integración y herramientas, 52 de TypeScript); revisión de código sin errores de lint (cuatro advertencias existentes).
- Recorrido móvil aprobado con sesiones reales de prueba: gerencia, comisionista y Oficina; captura/borrador, contacto explícito, excepción documental, carteras ajenas denegadas y archivo/restauración. Sin errores de página ni desbordamiento horizontal.
- Las tres migraciones se aplicaron únicamente en la base de ensayo; se verificó que conservaron los conteos de productores, documentos, usuarios, perfiles, cuentas, actividad, citas y contactos.

La validación con dos o tres comisionistas del equipo sigue siendo necesaria: esta entrega deja una versión revisable para probar captura, resultado de una gestión y localización del siguiente pendiente sin ayuda. La elección de quién ejercerá Oficina y qué carteras atenderá corresponde al usuario; no se infiere de los nombres actuales.

La evolución a varios cultivos por persona y a nuevos ciclos requiere una decisión posterior de modelo operativo. Este paquete mantiene el ciclo 26-27 y los datos existentes.
