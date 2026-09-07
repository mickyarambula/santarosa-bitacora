import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";

export const downloadMigrationBackup = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { makeMigrationBackup } = await import("./migration-backup.server");
    return makeMigrationBackup(context.userId);
  });
