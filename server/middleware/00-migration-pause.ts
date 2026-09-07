import { migrationPauseResponse } from "../../scripts/migration-pause.mjs";

export default function migrationPause(
  event: { req: { method: string }; url: URL }, next: () => unknown,
) {
  const mode = import.meta.env.VITE_AUTH_MODE === "standalone"
    ? undefined : import.meta.env.VITE_MIGRATION_SOURCE_MODE;
  return migrationPauseResponse(mode, event.req.method, event.url.pathname) ?? next();
}
