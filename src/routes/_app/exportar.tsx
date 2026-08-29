import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageBack } from "@/components/page-back";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { exportCsv, exportExcel } from "@/lib/crm";
import { CYCLE } from "@/lib/catalog";
import { useViewAs } from "@/lib/view-as";

export const Route = createFileRoute("/_app/exportar")({ component: ExportPage });

function downloadBlob(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function ExportPage() {
  const { agent, agentLabel } = useViewAs();
  const payload = { data: { agent: agent || undefined } };

  const xls = useMutation({
    mutationFn: () => exportExcel(payload),
    onSuccess: (r) => {
      downloadBlob(r.xml, r.filename, "application/vnd.ms-excel");
      toast.success("Excel listo.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const csv = useMutation({
    mutationFn: () => exportCsv(payload),
    onSuccess: (r) => {
      downloadBlob(r.csv, r.filename, "text/csv;charset=utf-8");
      toast.success("CSV listo.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageBack to="/" label="Inicio" />
      <Card>
        <CardHeader>
          <CardTitle>Bajar captura</CardTitle>
          <CardDescription>
            El mismo formato del Excel de comisionistas: una fila por productor y una hoja de
            totales. Ciclo {CYCLE}
            {agentLabel ? ` · solo ${agentLabel}` : " · todo el equipo"}.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Button onClick={() => xls.mutate()} disabled={xls.isPending}>
            <FileSpreadsheet className="size-4" />
            {xls.isPending ? "Preparando…" : "Descargar Excel"}
          </Button>
          <Button variant="outline" onClick={() => csv.mutate()} disabled={csv.isPending}>
            <Download className="size-4" />
            {csv.isPending ? "Preparando…" : "Descargar CSV"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cómo abrirlo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed text-muted">
          <ol className="grid list-decimal gap-2 pl-4">
            <li>
              Pulsa <span className="font-medium text-fg">Descargar Excel</span>. El archivo se
              llama <span className="font-medium text-fg">SantaRosa_ciclo_{CYCLE}.xls</span>.
            </li>
            <li>
              Ábrelo con Microsoft Excel, LibreOffice o Google Sheets (Archivo → Importar).
            </li>
            <li>
              Verás dos hojas: <span className="font-medium text-fg">Captura {CYCLE}</span> (igual
              que el formato de comisionistas) y{" "}
              <span className="font-medium text-fg">Por comisionista</span> (hectáreas, toneladas y
              financiamiento).
            </li>
            <li>
              Si prefieres CSV: en Excel ve a Datos → Desde texto/CSV, elige UTF-8 y «Delimitado por
              comas». El archivo ya trae la marca UTF-8 para que no se rompan los acentos.
            </li>
          </ol>
          <p>
            Si estás viendo la cartera de un comisionista, el archivo baja solo lo suyo. Vuelve a
            «Todo el equipo» para exportar el ciclo completo.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
