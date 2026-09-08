# Bitácora Santa Rosa

CRM de acopio y habilitación de **Granos Santa Rosa** (Los Mochis / Guasave, Sinaloa), ciclo **2026–27**. Conserva TanStack Start, Better Auth y Postgres.

Código: [mickyarambula/santarosa-bitacora](https://github.com/mickyarambula/santarosa-bitacora). Producción: [Santa Rosa CRM](https://santarosa-bitacora.vercel.app), en Vercel con Neon propio. El enlace anterior de Grok redirige a esta aplicación. `docs/HANDOFF-CHATGPT.md` conserva el contexto histórico de la entrega de Grok; las instrucciones vigentes están en `AGENTS.md`.

## Trabajo y publicación

Trabajar en una rama, probar con datos aislados y entregar un PR con ensayo revisable. Integrar y publicar dentro de la autorización del usuario. Distinguir código preparado, integrado en main y aplicación realmente publicada. No volver a publicar desde Grok ni cambiar alojamiento sin autorización. No mezclar archivos, datos o infraestructura de otros proyectos.

La integración de GitHub con Vercel construye los despliegues; un cambio de esquema requiere ensayar y aplicar sus migraciones en la base correspondiente. Un ensayo debe usar una rama de Neon aislada y variables específicas de preview, nunca producción. La guía [Oficina y cartera](docs/OFICINA-Y-CARTERA.md) describe esta entrega y sus comprobaciones pendientes de publicación.

## Estructura

| Ruta                    | Contenido                                                                     |
| ----------------------- | ----------------------------------------------------------------------------- |
| `src/routes/`           | Hoy, Productores, Citas, Papelería, Grupos, Equipo y Avisos                   |
| `src/lib/crm.ts`        | Operaciones, permisos, autorizaciones y datos anteriores                      |
| `src/lib/operations.ts` | Carteras de empresa, atención, tareas, comunicaciones y búsqueda de historial |
| `src/lib/catalog.ts`    | Municipios, cultivos, etapas y papelería                                      |
| `src/lib/datetime.ts`   | Horarios de Sinaloa (`America/Mazatlan`)                                      |
| `migrations/`           | Esquema numerado de Postgres                                                  |
| `scripts/`              | Pruebas y herramientas de verificación                                        |
| `docs/`                 | Guías y entregas                                                              |

## Ensayo local

```bash
npm ci
VITE_AUTH_MODE=standalone VITE_AUTH_ENABLED=true npm run dev
```

El puerto predeterminado es 8080. Sin `DATABASE_URL`, el desarrollo usa PGLite en memoria; los datos desaparecen al reiniciar ese proceso. La primera cuenta ficticia obtiene Gerencia. Para probar Google se requiere la configuración OAuth del entorno correspondiente; no copiar secretos de producción al ensayo.

`npm run check` ejecuta revisión de tipos y pruebas; `npm run lint` revisa código y `npm run build` verifica y compila. `scripts/verify-office-ui.mjs` prueba cuentas ficticias en un servidor aislado en `localhost:8081`, bloqueando destinos externos. Sus sesiones reutilizables se guardan únicamente en `/private/tmp/sr-office-test-auth.json`; retirar ese archivo al reiniciar la base ficticia.

## Junta semanal y mensajes

La guía [Junta semanal y mensajes](docs/JUNTA-SEMANAL-Y-MENSAJES.md) describe la revisión por cartera, el cierre de acuerdos y las listas de mensajes que pueden retomarse. Su estado de publicación se confirma en la entrega del PR correspondiente.

## Datos y seguridad

No subir `.env`, secretos, respaldos sin cifrar, sesiones, capturas con datos reales, teléfonos o cuentas de productores. Respetar las reglas de coincidencias, teléfonos compartidos solo dentro del grupo y papelería individual. No reclasificar «Directo» como cartera de empresa. Los respaldos completos deben cubrir todas las tablas del esquema aplicado.
