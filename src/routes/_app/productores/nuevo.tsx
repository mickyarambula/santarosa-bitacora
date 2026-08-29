import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageBack } from "@/components/page-back";
import { ProducerForm } from "@/components/producer-form";
import { bootstrap, createProducer } from "@/lib/crm";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { useViewAs } from "@/lib/view-as";

export const Route = createFileRoute("/_app/productores/nuevo")({
  component: NuevoProductor,
});

function NuevoProductor() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const user = useCurrentUser();
  const { captureName } = useViewAs();
  const boot = useQuery({
    queryKey: ["bootstrap", user?.id],
    queryFn: () => bootstrap({ data: { displayName: user?.displayName ?? null } }),
  });
  const save = useMutation({
    mutationFn: createProducer,
    onSuccess: async (r) => {
      toast.success("Productor capturado.");
      await qc.invalidateQueries();
      void nav({ to: "/productores/$id", params: { id: r.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-2xl">
      <PageBack to="/productores" label="Volver" />
      <header className="mb-5">
        <p className="text-sm text-muted">Ciclo 26-27</p>
        <h1 className="font-display text-3xl font-medium tracking-tight">Capturar productor</h1>
        <p className="mt-1 text-sm text-muted">
          {captureName
            ? `Queda a nombre de ${captureName}. Nombre y cultivo bastan.`
            : "Llena lo que sepas. Nombre y cultivo bastan; lo demás se puede completar después."}
        </p>
      </header>
      <ProducerForm
        defaultAgent={captureName || boot.data?.profile.displayName}
        submitLabel="Guardar productor"
        pending={save.isPending}
        onSubmit={(data) => save.mutate({ data })}
      />
    </div>
  );
}
