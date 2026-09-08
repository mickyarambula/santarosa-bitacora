# Santa Rosa — instrucciones para el agente

Repo: `mickyarambula/santarosa-bitacora` (verifica su visibilidad en GitHub).
App: bitácora CRM de Granos Santa Rosa. Remix/TanStack Start + Tailwind + Better Auth + Postgres (Neon / PGLite).

## Negocio

- Acopio y comercialización: maíz blanco, sorgo, frijol, garbanzo.
- Región: Los Mochis, Guasave y alrededores (Sinaloa). Municipios del catálogo; incluye Juan José Ríos.
- Parafinanciera + financiamiento directo: insumos, diésel y dinero. Monto **por hectárea** × ha = préstamo.
- Usuarios de campo: comisionistas (vendedores). UI móvil, clara, en español de Sinaloa. Gerencia ve todo el equipo.

## Roles

- `comisionista`: ve y captura su cartera.
- `gerente`: ve a todos, filtra por identidad de comisionista, avisos, autorizaciones y papelería masiva.
- `oficina`: solo expedientes documentales de carteras asignadas; sin acceso a operaciones comerciales.
- `accessAdmin`: permiso adicional de gerencia para candado, cuentas, roles, invitaciones y carteras de Oficina.
- Un usuario puede ser las dos cosas (gerente de ventas).
- Primera cuenta del equipo = gerencia. Cuentas nuevas respetan el candado; una invitación individual válida concede acceso de comisionista y no evita la revisión de coincidencias.

## Dominio (no romper)

- Etapas: Contacto → Cita → Papelería → Habilitación → Cosecha.
- Relación: `nuevo` | `recurrente` | `recuperacion`.
- Grupos: varios nombres (familia/amigos/prestanombres). Cada ficha tiene su papelería. Un titular. Totales del grupo. Teléfono compartido permitido **dentro** del grupo; bloqueado entre grupos distintos.
- Duplicados: mismo nombre no se da de alta dos veces (tampoco en otro comisionista).
- Papelería por persona (INE, predial, análisis de suelo, etc.). Análisis de suelo: hecho / pendiente / no_hizo.
- Rechazo total o parcial (hectáreas solicitadas vs autorizadas) queda en el expediente.
- Citas: `America/Mazatlan`. `datetime-local` se parsea con offset −07:00. Mostrar con `formatAppTime`.
- No re-sembrar ejemplos. `is_example` y `purgeDemoData` existen para limpiar pruebas.

## Código

- Server: `src/lib/crm.ts` (`createServerFn` + `authMiddleware`). Autorizar siempre. Gerencia vs owner.
- Catálogo: `src/lib/catalog.ts`.
- Match/duplicados: `src/lib/producer-match.ts`.
- Horarios: `src/lib/datetime.ts` (`APP_TZ`).
- Schema: `migrations/0002_*.sql` … numeradas. No editar `migrations/auth/`.
- UI móvil first, fondo blanco, logo en `public/brand/`.

## Al cambiar

1. Un tema por commit.
2. No gold-plating.
3. Typecheck / tests del archivo tocado si existen (`*.test.ts`).
4. Trabajar en una rama y entregar un PR revisable con pruebas aisladas antes de integrar.
5. Producción: https://santarosa-bitacora.vercel.app (Vercel + Neon propio). Integrar y publicar solo dentro de la autorización del usuario; distinguir preparado, integrado y publicado.
6. El enlace viejo de Grok redirige a Vercel. No volver a publicar el CRM antiguo ni cambiar alojamiento sin autorización específica.
7. Nunca usar datos ni infraestructura de Al Pitazo u otros proyectos para estas pruebas.
