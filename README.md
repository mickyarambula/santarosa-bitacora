# Bitácora Santa Rosa

CRM de acopio y habilitación de **Granos Santa Rosa** (Los Mochis / Guasave, Sinaloa).

Comisionistas capturan productores (maíz blanco, sorgo, frijol, garbanzo). Gerencia ve el equipo, papelería, citas, grupos y el embudo.

Repo privado: [mickyarambula/santarosa-bitacora](https://github.com/mickyarambula/santarosa-bitacora)

La app publicada vive en Grok (`grok.me`). **Este repo es el código.** Los chats se pesados; de aquí en adelante se trabaja contra GitHub.

---

## Cómo seguirle (chat nuevo de Grok)

Abre un chat **nuevo**. No hace falta este hilo. Pega:

```
Trabaja sobre el repo de GitHub mickyarambula/santarosa-bitacora (privado).

Es el CRM de Granos Santa Rosa: comisionistas, productores, grupos (prestanombres), papelería por persona, citas (America/Mazatlan), financiamiento por ha, candado de cuentas, avisos y WhatsApp.

Reglas:
- Lee el repo antes de tocar nada.
- Un cambio a la vez. No reescribas el proyecto.
- Sube el cambio al mismo repo (branch main).
- No inventes otro app. No borres datos reales.
- Zona horaria: America/Mazatlan.
- Productores: no duplicar por nombre (en distintos comisionistas tampoco). Grupos sí pueden compartir WhatsApp.

Qué hay que hacer:
[ESCRIBE AQUÍ EL ARREGLO O LA FUNCIÓN]
```

Claude, Cursor o Grok Build en la computadora: mismo repo, misma instrucción.

---

## Qué hay adentro

| Carpeta | Qué es |
|---|---|
| `src/routes/` | Pantallas: Hoy, Productores, Citas, Papelería, Grupos, Equipo, Avisos… |
| `src/lib/crm.ts` | Servidor: productores, visitas, grupos, rechazos, candado |
| `src/lib/catalog.ts` | Municipios, cultivos, etapas, papelería, roles |
| `migrations/` | Schema Postgres (Neon en prod, PGLite en preview) |
| `public/brand/` | Logo Santa Rosa |
| `docs/` | Prompt y notas para seguir el proyecto |

Ciclo actual de captura: **2026–27**.

---

## Arranque local (si algún día se abre en una computadora)

```bash
npm install
npm run dev
```

Preview en `http://localhost:8080`. Auth con email/password o Google/X. Primera cuenta = gerencia.

Publicar sigue siendo desde Grok Build (botón de la app) **o** un `git push` si más adelante se enlaza Vercel a este repo.

---

## No subir nunca

- `node_modules`
- `.env` / secretos
- capturas de QA
- cuentas ni teléfonos reales de productores
