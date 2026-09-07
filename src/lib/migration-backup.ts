import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";

export const downloadMigrationBackup = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { setResponseHeader } = await import("@tanstack/react-start/server");
    setResponseHeader("Cache-Control", "private, no-store");
    setResponseHeader("Pragma", "no-cache");
    const { makeMigrationBackup } = await import("./migration-backup.server");
    return makeMigrationBackup(context.userId);
  });
