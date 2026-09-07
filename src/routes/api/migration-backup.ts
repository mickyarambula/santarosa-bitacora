import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/lib/auth/server";
import { makeMigrationBackup } from "@/lib/migration-backup.server";

export const Route = createFileRoute("/api/migration-backup")({
  server: { handlers: {
    POST: async ({ request }) => {
      const headers = { "Cache-Control": "private, no-store" };
      if (request.headers.get("origin") !== new URL(request.url).origin) {
        return new Response("Solicitud no permitida", { status: 403, headers });
      }
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session?.user) return new Response("Inicia sesión de gerencia antes de la pausa.", { status: 401, headers });
      try {
        // collectBackup checks active management, revocation and complete schema.
        const result = await makeMigrationBackup(session.user.id);
        return new Response(result.encrypted, { headers: {
          ...headers, "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="${result.filename}"`,
        } });
      } catch {
        return new Response("Respaldo no disponible. Revisa permisos de gerencia y vigencia.", { status: 403, headers });
      }
    },
  } },
});
