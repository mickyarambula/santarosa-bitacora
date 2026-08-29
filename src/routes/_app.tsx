import { Outlet, createFileRoute } from "@tanstack/react-router";
import { AuthGate } from "@/components/auth-gate";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  return (
    <AuthGate>
      <Outlet />
    </AuthGate>
  );
}
