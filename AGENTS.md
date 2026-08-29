# Santa Rosa — instrucciones para el agente

Repo: `mickyarambula/santarosa-bitacora` (privado).
App: bitácora CRM de Granos Santa Rosa. Remix/TanStack Start + Tailwind + Better Auth + Postgres (Neon / PGLite).

## Negocio

- Acopio y comercialización: maíz blanco, sorgo, frijol, garbanzo.
- Región: Los Mochis, Guasave y alrededores (Sinaloa). Municipios del catálogo; incluye Juan José Ríos.
- Parafinanciera + financiamiento directo: insumos, diésel y dinero. Monto **por hectárea** × ha = préstamo.
- Usuarios de campo: comisionistas (vendedores). UI móvil, clara, en español de Sinaloa. Gerencia ve todo el equipo.

## Roles

- `comisionista`: ve y captura su cartera.
- `gerente`: ve a todos, filtra por comisionista, candado, avisos, papelería masiva.
- Un usuario puede ser las dos cosas (gerente de ventas).
- Primera cuenta del equipo = gerencia. Cuentas nuevas quedan pendientes del candado.

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
4. Push a `main` de este repo.
5. Publicar la app en Grok (o Vercel si ya está enlazado). El repo no es el servidor de producción por sí solo.
