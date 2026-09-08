# Próxima acción y revisión de altas

Continuación de PR 5. Producción permanece en la versión de cuentas unificadas, avisos y citas hasta autorizar este paquete.

## Seguimiento

Cada ficha puede tener una próxima acción, fecha/hora de Sinaloa y responsable (el dueño actual de la cartera). En Hoy se separan pendientes, vencidas y fichas sin próxima acción. Las fichas cerradas y de otros ciclos quedan fuera de esta lista operativa.

Programar una acción no crea una cita, cambia la etapa ni registra un contacto. Cambiarla requiere motivo; atenderla o cancelarla exige resultado/motivo. El historial conserva el estado anterior, la fecha y el autor. Una confirmación obsoleta no puede borrar un seguimiento nuevo. Las acciones siguen a la ficha al reasignar o unificar cuentas.

## Evitar nuevas carteras duplicadas

- El correo ya es único en autenticación; distintos correos pueden pertenecer a una misma persona.
- Al crear el perfil operativo, el servidor toma el nombre guardado en la cuenta de acceso. Compara nombres normalizados, incluyendo diferencias de mayúsculas, acentos, puntuación y títulos como «Ing.».
- Una coincidencia queda inhabilitada y marcada para revisión antes de poder consultar o capturar una cartera. El código general del equipo no la activa.
- Al editar el perfil se rechazan coincidencias nuevas de nombre o teléfono con otra cuenta. Las coincidencias preexistentes no se cambian automáticamente.
- Gerencia ve «Revisar coincidencia». Si son personas distintas, necesita dejar una explicación registrada para habilitar. Si es la misma, se usa la cuenta original o la unificación explícita.
- La autenticación de esa alta puede existir como solicitud, pero no obtiene una segunda cartera activa. No se fusiona por nombre, no se comparten contraseñas y no se modifican cuentas actuales por esta migración.

Un nombre y teléfono distintos no permiten reconocer automáticamente a una misma persona. Esa situación necesita revisión humana; este control evita las coincidencias detectables y su activación silenciosa.

Las dos cuentas existentes de Jorge Quintero se mantienen sin cambios: el usuario decidió consultar primero cuál correo debe conservar.

## Entrega

1. Probar `0014_next_action.sql` y `0015_account_review.sql` en ensayo. Solo agregan columnas, una restricción de coherencia y un índice; no reasignan ni eliminan datos.
2. Revisar PR, pruebas de permisos, concurrencia, historial, retrocompatibilidad de respaldos y recorridos móviles con autenticación real de prueba.
3. Con autorización de publicación, respaldo cifrado nuevo, aplicar únicamente las dos migraciones pendientes y publicar desde main.
4. Comprobar la versión realmente publicada. No crear acciones ni habilitar cuentas reales solo para probarla.

Los respaldos anteriores se verifican contra su versión original de estructura y permanecen recuperables. No restaurar toda la base histórica sobre las capturas nuevas. Para revertir la interfaz se conserva la ampliación de estructura y su historial.
