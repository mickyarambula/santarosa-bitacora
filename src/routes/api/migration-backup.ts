import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/migration-backup")({
  server: { handlers: {
    POST: async ({ request }) => {
      const headers = { "Cache-Control": "private, no-store" };
      // This temporary route belongs exclusively to the verified Grok source.
      // Its proxy/environment cannot change the trusted browser origin.
      if (import.meta.env.VITE_AUTH_MODE === "standalone") {
        return new Response("No disponible", { status: 404, headers });
      }
      const publicOrigin = "https://crmsantarosa.grok.me";
      if (request.headers.get("origin") !== publicOrigin) {
        return new Response("Solicitud no permitida", { status: 403, headers });
      }
      const { auth } = await import("@/lib/auth/server");
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session?.user) return new Response("Inicia sesión de gerencia antes de la pausa.", { status: 401, headers });
      try {
        const { makeMigrationBackup } = await import("@/lib/migration-backup.server");
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
