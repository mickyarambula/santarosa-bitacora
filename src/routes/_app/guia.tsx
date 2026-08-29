import { createFileRoute, Link } from "@tanstack/react-router";
import { PageBack } from "@/components/page-back";
import { ShareGuide } from "@/components/share-guide";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CYCLE, COMPANY } from "@/lib/catalog";
import { GUIDE_STEPS } from "@/lib/guide";

export const Route = createFileRoute("/_app/guia")({ component: GuiaPage });

function GuiaPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageBack to="/" label="Inicio" />
      <header>
        <p className="text-xs font-medium uppercase tracking-wider text-subtle">
          {COMPANY} · ciclo {CYCLE}
        </p>
        <h1 className="mt-1 font-display text-3xl font-medium tracking-tight">Cómo se usa</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Para el grupo de comisionistas. Léanlo una vez y después es captura, cita y papeles.
        </p>
      </header>

      <Card>
        <CardContent className="grid gap-3 pt-5">
          <p className="font-medium">Pasarlo al grupo</p>
          <p className="text-sm text-muted">
            Copia el recado o ábrelo en WhatsApp. Lleva el link de esta bitácora.
          </p>
          <ShareGuide />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-3 pt-5">
          <p className="font-medium">Avisar de los grupos (varios nombres)</p>
          <p className="text-sm text-muted">
            Para cuando un productor siembra con familiares o amigos. Incluye cómo arreglar los que
            ya tenían sueltos.
          </p>
          <ShareGuide kind="grupos" />
        </CardContent>
      </Card>

      <ol className="grid gap-3">
        {GUIDE_STEPS.map((s) => (
          <li key={s.n} className="flex gap-3 rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 font-display text-lg font-medium text-primary">
              {s.n}
            </span>
            <div>
              <p className="font-medium">{s.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link to="/productores/nuevo">Capturar productor</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/citas">Ir a citas</Link>
        </Button>
      </div>
    </div>
  );
}

