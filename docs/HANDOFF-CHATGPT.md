# Handoff — Bitácora Santa Rosa → ChatGPT / Codex

> Actualización después del traslado del 7 de septiembre de 2026: producción
> está en https://santarosa-bitacora.vercel.app/, con Neon y Google propios.
> Consultar [MIGRACION-VERCEL.md](MIGRACION-VERCEL.md) para el estado y flujo
> actuales. El contenido siguiente conserva la entrega histórica de Grok;
> sus referencias a alojamiento y accesos ya no describen la producción nueva.

Fecha de este documento: **7 septiembre 2026**.
Dueño: Miguel Arambula (`mickyarambula` en GitHub). Empresa: **Almacenes / Granos Santa Rosa**, Los Mochis y Guasave, Sinaloa, México.

**No reescribas la app. No cambies de stack. Clona el repo y trabaja encima.**

---

## 1. Dónde está cada cosa

| Qué | Dónde | Notas |
|---|---|---|
| **Código (fuente de verdad)** | GitHub privado [`mickyarambula/santarosa-bitacora`](https://github.com/mickyarambula/santarosa-bitacora) | Branch `main`. Único commit al exportar: `0706bad` (29 ago 2026). Si hay commits posteriores, esos ganan. |
| **App en producción (equipo usándola)** | Grok Build → URL `*.grok.me` | Mismo link desde que se publicó. **ChatGPT no puede publicar ahí.** |
| **Base de datos prod** | Postgres **Neon**, inyectada por la plataforma Grok (`DATABASE_URL`) | Datos reales de comisionistas y productores. No borrar. |
| **Preview / dev** | PGLite local si no hay `DATABASE_URL` | No es la base de producción. |
| **Excel original** | `attachments/Formato_Captura_Comisionista_26-27.xlsx` | Formato de captura ciclo 26-27 con el que nació el CRM. |
| **Logos** | `public/brand/` y `attachments/LOGO SANTA ROSA…` | Imagotipo / isotipo / logotipo blanco y negro. |
| **Este handoff** | `docs/HANDOFF-CHATGPT.md` | Léelo completo antes de tocar código. |
| **Reglas de dominio** | `AGENTS.md` (raíz del repo) | Obligatorio. |

Este chat de Grok Build (`project_id` `01a0247a-a9eb-70b2-bdf1-e93628c48f02`) es donde nació la app y donde está el botón **Publicar** hacia grok.me. Un chat de ChatGPT **no** reemplaza ese botón.

---

## 2. Qué es el producto

CRM / bitácora para **acopio y habilitación** de grano.

- Cultivos: maíz blanco, sorgo, frijol, garbanzo (también maíz amarillo en catálogo).
- Ciclo actual: **26-27** (`CYCLE` en `src/lib/catalog.ts`).
- Comisionistas (vendedores de campo) prospectan y capturan productores.
- Se habilita con **insumos, diésel y dinero** vía **parafinanciera** o **financiamiento directo**.
- El financiamiento es **monto por hectárea × hectáreas** = préstamo (`financingPerHa` × `hectares`).
- Gerencia ve a todo el equipo. Comisionista ve su cartera.
- Usuarios de campo, **móvil first**, español de Sinaloa, UI clara, fondo blanco, logo Santa Rosa.
- Papá de Miguel trata con clientes y no es afin a la tecnología: hay avisos, invitaciones WhatsApp a dirección/socios (`office` people). WhatsApp es **`wa.me`** (el usuario manda el mensaje). No hay WhatsApp Business API.

Roles:

- `comisionista` — captura y ve lo suyo.
- `gerente` — ve todo, filtra por comisionista, candado, avisos, papelería masiva, duplicados.
- Un usuario puede ser las dos (gerente de ventas).
- Primera cuenta del equipo = gerencia. Cuentas nuevas quedan **pendientes del candado** (`activo` / `bloqueado`).

---

## 3. Stack (no cambiar)

- **TanStack Start** (React 19 + TanStack Router) + Vite + Tailwind v4.
- Server functions: `createServerFn` + `authMiddleware` en `src/lib/crm.ts`.
- Auth: **Better Auth** en `/api/auth/*`. Email/password + Google/X vía broker de Grok. Flag `VITE_AUTH_ENABLED`.
- DB: `getSql()` en `src/lib/db.ts` — `pg` si hay `DATABASE_URL`, si no **PGLite**.
- Migraciones: `migrations/0001_auth.sql` … `0012_purge_demo.sql`. `npm run build` corre `db:migrate`. **No editar `migrations/auth/`.**
- Deploy Grok: Nitro preset Vercel. Dev: puerto **8080**. No tocar contratos de `vite.config.ts` (puertos, nitro `serverDir: ./server`, `grokPwaPlugin`) si la app sigue publicándose en Grok.

Arranque local:

```bash
npm install
npm run dev          # :8080
npm run typecheck
npm test
```

---

## 4. Mapa de código

```
src/routes/_app/           pantallas (una por módulo)
  index.tsx                Hoy (dashboard, KPIs, avisos)
  productores/index.tsx    lista + filtro comisionista
  productores/nuevo.tsx    alta
  productores/$id.tsx      ficha (papelería, grupo, rechazo)
  citas.tsx                visitas
  papeleria.tsx            checklist + filtro doc faltante + WhatsApp masivo
  grupos.tsx               grupos / prestanombres
  equipo.tsx               equipo, candado, oficina, quitar pruebas (~700 líneas)
  avisos.tsx               anuncios gerencia
  embudo.tsx               pipeline
  duplicados.tsx           conflictos de nombre
  exportar.tsx             CSV / Excel
  recordatorios.tsx
  guia.tsx                 cómo se usa
src/routes/login.tsx
src/lib/crm.ts             TODO el servidor (~2777 líneas) ← archivo gordo
src/lib/catalog.ts         municipios, cultivos, etapas, papelería, roles
src/lib/producer-match.ts  duplicados (nombre; teléfono compartido en grupo)
src/lib/datetime.ts        America/Mazatlan, parseLocalDateTime (−07:00)
src/lib/reminders.ts       textos WhatsApp
src/lib/excel.ts           export
src/lib/lock.ts            candado de acceso
src/lib/types.ts
src/lib/utils.ts           loanOf, volumeOf, teléfonos
src/components/            producer-form, visit-form, mass-whatsapp, onboarding…
public/brand/              logos
migrations/                schema
```

Pantallas y catálogo están bien partidos. **`crm.ts` es un god-file** (productores, visitas, grupos, candado, avisos, Excel, rechazos, purge). Partirlo es deuda técnica, no urgente. No reestructurar el repo “porque sí”.

Código muerto de plantilla Grok (no usar): `src/lib/multiplayer/`.

---

## 5. Dominio — no romper

Etapas reales en código (`STAGES`), no las del pitch inicial:

`prospecto` → `visita` → `interesado` (Convencido) → `papeleria` → `evaluacion` → `habilitado` → `acopio` → `cerrado`

Relación: `nuevo` | `recurrente` | `recuperacion`.

Unidades: `parafinanciero` | `directo`.

Esquemas: `financiamiento` | `cobertura_fira` | `acopio`. Papelería distinta por esquema (`DOC_CATALOG`).

Análisis de suelo: `pendiente` | `recibido`/`validado` | `no_hizo` | `no_aplica`.

Municipios (`ZONES`): Ahome, Guasave, **Juan José Ríos**, Sinaloa, El Fuerte, Choix, Salvador Alvarado, Angostura, Mocorito, Navolato, Culiacán.

**Grupos (prestanombres):** varios nombres (familia/amigos) para crédito/apoyos. Cada nombre = ficha con **su** papelería. Un `titular` (productor real). Totales del grupo. WhatsApp compartido **solo dentro del grupo**. Entre grupos distintos, no.

**Duplicados:** mismo nombre no se da de alta dos veces, ni entre comisionistas. Match por nombre (`producer-match.ts`), no fusionar por teléfono (rompe grupos).

**Citas:** `APP_TZ = America/Mazatlan`. `datetime-local` se guarda con offset `-07:00`. Mostrar con `formatAppTime`. Hubo un bug de “2:00 a.m.” por parsear UTC; ya está resuelto. No volver a usar `toLocaleString` sin `timeZone`.

**Rechazo:** `total` | `parcial`. Razones: crédito, garantía, se fue con otro, superficie, otro + texto. Queda en expediente. Hectáreas solicitadas vs autorizadas. Rechazo total no entra a KPIs “vivos”.

**Candado:** gerencia aprueba / inhabilita / elimina cuentas (con confirmación). Código de acceso opcional.

**Ejemplos / pruebas:** `is_example`, `purgeDemoData`. No volver a sembrar Felipe Montoya ni @example.com. Equipo tiene “Quitar pruebas”.

Tablas (evolución): `profiles`, `producers`, `documents`, `visits`, `activity`, office people/pings, touches, lock, relation, soil, `producer_groups`, announcements, rejection fields, visit tz. Ver `migrations/0002`–`0012`.

---

## 6. Qué ya está hecho (producción, gente usándola)

- Auth email/password + roles gerente/comisionista + dual-rol.
- Candado de altas, bloquear / eliminar cuenta (opción wipe cartera).
- Alta de productor móvil, pipeline, ficha.
- Financiamiento por ha con cálculo de préstamo.
- Toques CRM: llamada, WhatsApp, mensaje, correo, visita, nota.
- Citas con botón claro + WhatsApp de invitación (hora Mazatlán correcta).
- Papelería por esquema + análisis de suelo + filtro “a quién le falta X” + WhatsApp masivo (gerencia).
- Grupos / prestanombres + papelería por nombre + titular.
- Antiduplicados + pantalla de conflictos + merge.
- Filtro por comisionista (gerencia) + KPIs al filtrar.
- Avisos al equipo / por etapa.
- Rechazo total/parcial en expediente.
- Invitar a dirección/socios por WhatsApp (oficina).
- Export CSV/Excel ciclo 26-27.
- Onboarding + guía en la app.
- Logo Santa Rosa, fondo blanco, PWA / “Agregar a inicio”.
- Limpieza de datos de ejemplo.

---

## 7. En qué vamos (sept 2026)

1. App **publicada y en uso** por comisionistas. No está en prototipo.
2. Código respaldado en GitHub `0706bad` (o más reciente si Codex/Grok ya empujó).
3. Grok Build sigue siendo el único camino para **actualizar grok.me**.
4. Deuda: partir `crm.ts`; no re-sembrar demos; no hay WhatsApp API (a propósito, `wa.me`).
5. Backlog que se mencionó y **no** se implementó como producto aparte:
   - Automatización real de recordatorios WhatsApp (API).
   - Enlazar Vercel al repo para que `git push` = deploy (hoy no está).
   - Ciclo 27-28 cuando toque.

Si ChatGPT va a **seguir desarrollando**: un cambio por commit a `main`.
Si ChatGPT va a **hospedar fuera de Grok**: hace falta Neon propio + env de Better Auth + Vercel. Eso es migración de infra, no de features. No mezclar las dos en el mismo PR.

---

## 8. Cómo debe trabajar ChatGPT

1. Clonar `mickyarambula/santarosa-bitacora`. Leer `AGENTS.md` + este archivo + `src/lib/catalog.ts`.
2. Un tema por tarea. No “mejorar la arquitectura” de paso.
3. Autorizar siempre server functions. Gerencia vs `owner_user_id`. Nunca confiar un user id del cliente.
4. Migraciones nuevas: siguiente número (`0013_…sql`). No editar `migrations/auth/`.
5. UI móvil, copy en español de Sinaloa, sin jerga de Silicon Valley.
6. Tests del archivo tocado si existen (`src/lib/*.test.ts`).
7. **No borrar datos de producción. No seed de ejemplos.**
8. Push a `main`. Decirle a Miguel: “para que el equipo lo vea hay que publicar otra vez en Grok Build” **salvo** que ya hayan migrado el hosting a Vercel.

---

## 9. Qué NO hacer

- No crear otro CRM, otro stack (Next, Firebase, Supabase, Clerk) ni “versión limpia”.
- No fusionar productores por teléfono.
- No quitar grupos, candado, análisis de suelo, Juan José Ríos, recuperación.
- No cambiar `America/Mazatlan` ni parsear citas como UTC.
- No commitear `.env`, teléfonos reales, ni `node_modules`.
- No asumir que el push a GitHub actualiza grok.me. **No lo hace.**

---

## 10. Primer mensaje para pegar en ChatGPT

```
Vas a continuar un CRM real en producción, no a inventar uno.

Repo privado: github.com/mickyarambula/santarosa-bitacora
Branch: main
Lee en este orden: docs/HANDOFF-CHATGPT.md, AGENTS.md, README.md, src/lib/catalog.ts.
No reescribas el proyecto. No cambies el stack (TanStack Start + Better Auth + Postgres).
No borres datos. Un cambio a la vez. Commit a main.

Es la bitácora de Granos Santa Rosa (Los Mochis / Guasave): comisionistas capturan productores
de maíz blanco, sorgo, frijol y garbanzo. Ciclo 26-27. La app publicada está en grok.me;
este repo es el código. Publicar grok.me no es tu trabajo salvo que te pida migrar hosting.

Confirma SHA de main, que leíste el handoff, y espera mi instrucción concreta.
```
