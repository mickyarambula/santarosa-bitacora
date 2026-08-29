import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Trash2, ChevronDown, Eye, Lock, Unlock } from "lucide-react";
import { StageChip } from "@/components/stage-chip";
import { PageBack } from "@/components/page-back";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  deleteMember,
  deleteOfficePerson,
  getCartera,
  getLock,
  listOfficePeople,
  listOfficePings,
  listTeam,
  purgeDemoData,
  saveOfficePerson,
  setLock,
  setMemberRole,
  setMemberStatus,
  updateMyProfile,
} from "@/lib/crm";
import { stageMeta } from "@/lib/catalog";
import type { AccountStatus, Role } from "@/lib/types";
import { compactMoney, cn, formatPhone, qty } from "@/lib/utils";
import { useViewAs } from "@/lib/view-as";

export const Route = createFileRoute("/_app/equipo")({ component: EquipoPage });

function EquipoPage() {
  const qc = useQueryClient();
  const team = useQuery({ queryKey: ["team"], queryFn: () => listTeam() });

  const save = useMutation({
    mutationFn: (vars: { displayName: string; phone?: string | null }) =>
      updateMyProfile({ data: vars }),
    onSuccess: () => {
      toast.success("Perfil actualizado.");
      void qc.invalidateQueries({ queryKey: ["team"] });
      void qc.invalidateQueries({ queryKey: ["bootstrap"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const roleMut = useMutation({
    mutationFn: (vars: { userId: string; role: Role }) => setMemberRole({ data: vars }),
    onSuccess: () => {
      toast.success("Rol actualizado.");
      void qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (team.isPending) return <Skeleton className="h-64" />;
  if (!team.data) return null;
  const { me, agents } = team.data;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageBack to="/" label="Inicio" />
      <header>
        <h1 className="font-display text-3xl font-medium tracking-tight">Equipo</h1>
        <p className="text-sm text-muted">
          Cada comisionista y los productores que lleva. Gerencia ve a todo el equipo y también
          captura lo suyo — no hace falta un rol doble. Pueden ser varias personas de gerencia.
        </p>
      </header>

      <CarteraList />

      {me.role === "gerente" ? <PurgeDemoPanel /> : null}

      {me.role === "gerente" ? <LockPanel /> : null}

      <OfficeDesk canEdit={me.role === "gerente"} />

      <Card>
        <CardHeader>
          <CardTitle>Tu ficha</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileForm
            displayName={me.displayName}
            phone={me.phone ?? ""}
            saving={save.isPending}
            onSave={(n, p) => save.mutate({ displayName: n, phone: p })}
          />
        </CardContent>
      </Card>

      <section>
        <h2 className="mb-3 font-display text-xl font-medium">Quién ya entró</h2>
        <div className="overflow-hidden rounded-xl bg-surface shadow-[var(--shadow-border)]">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-subtle">
              <tr className="border-b border-border">
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Rol</th>
                <th className="px-4 py-3 font-medium">Prod.</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">Ha</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">$</th>
                {me.role === "gerente" ? <th className="px-4 py-3 font-medium">Cuenta</th> : null}
              </tr>
            </thead>
            <tbody>
              {agents.map((a) => (
                <tr key={a.userId} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium">
                    {a.displayName}
                    {a.userId === me.userId ? (
                      <span className="ml-2 text-xs text-subtle">tú</span>
                    ) : null}
                    {a.status === "bloqueado" ? (
                      <span className="ml-2 text-xs font-medium text-clay">inhabilitado</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    {me.role === "gerente" ? (
                      <NativeSelect
                        className="h-10 w-52"
                        value={a.role}
                        disabled={roleMut.isPending}
                        onChange={(e) => {
                          const role = e.target.value as Role;
                          if (role === a.role) return;
                          const ok =
                            role === "gerente"
                              ? window.confirm(
                                  `¿Dar gerencia a ${a.displayName}? Va a ver a todo el equipo y sigue llevando su propia cartera. No pierde lo que ya capturó.`,
                                )
                              : window.confirm(
                                  `¿Dejar a ${a.displayName} como comisionista? Solo verá lo suyo.`,
                                );
                          if (!ok) {
                            e.target.value = a.role;
                            return;
                          }
                          roleMut.mutate({ userId: a.userId, role });
                        }}
                      >
                        <option value="comisionista">Comisionista · solo lo suyo</option>
                        <option value="gerente">Gerencia · todo + lo suyo</option>
                      </NativeSelect>
                    ) : (
                      <span>{a.role === "gerente" ? "Gerencia" : "Comisionista"}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 tabular">{a.producers}</td>
                  <td className="hidden px-4 py-3 tabular sm:table-cell">{qty(a.hectares, 0)}</td>
                  <td className="hidden px-4 py-3 tabular sm:table-cell">
                    {compactMoney(a.financing)}
                  </td>
                  {me.role === "gerente" ? (
                    <td className="px-4 py-3">
                      {a.userId === me.userId ? (
                        <span className="text-xs text-subtle">—</span>
                      ) : (
                        <MemberActions
                          name={a.displayName}
                          userId={a.userId}
                          status={a.status}
                        />
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-muted">
          Al crear cuenta todos entran como comisionista, menos el primero. Si alguien captura y
          también necesita ver al equipo, súbelo a Gerencia: no pierde su cartera. El candado evita
          que entre cualquiera con el link. Si se cuela, inhabilítalo o bórralo — te pide escribir
          el nombre completo.
        </p>
      </section>
    </div>
  );
}

function PurgeDemoPanel() {
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: () => purgeDemoData(),
    onSuccess: (r) => {
      toast.success(
        r.producers || r.users
          ? `Quitamos ${r.producers} productores de prueba y ${r.users} cuentas de prueba.`
          : "No había más pruebas.",
      );
      void qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Datos de prueba</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <p className="text-sm text-muted">
          Quita los productores de ejemplo (Luis Cota, María Beltrán, etc.) y las cuentas que se
          abrieron solo para probar. Lo que el equipo capturó de verdad se queda.
        </p>
        <Button
          type="button"
          variant="outline"
          disabled={mut.isPending}
          onClick={() => {
            if (
              window.confirm(
                "¿Quitar solo las pruebas? Los productores reales del equipo no se tocan.",
              )
            ) {
              mut.mutate();
            }
          }}
        >
          {mut.isPending ? "Quitando…" : "Quitar pruebas"}
        </Button>
      </CardContent>
    </Card>
  );
}

function LockPanel() {
  const qc = useQueryClient();
  const lock = useQuery({ queryKey: ["lock"], queryFn: () => getLock() });
  const [code, setCode] = useState("");
  const [confirm, setConfirm] = useState("");
  const mut = useMutation({
    mutationFn: setLock,
    onSuccess: (r) => {
      toast.success(r.enabled ? "Candado puesto. Pásales la clave en el grupo." : "Candado abierto.");
      setCode("");
      setConfirm("");
      void qc.invalidateQueries({ queryKey: ["lock"] });
      void qc.invalidateQueries({ queryKey: ["signup-gate"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const enabled = lock.data?.enabled === true;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {enabled ? <Lock className="size-5" /> : <Unlock className="size-5" />}
          Candado de altas
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <p className="text-sm text-muted">
          {enabled
            ? "Cerrado. Quien cree cuenta tiene que poner la clave del equipo. Sin ella queda inhabilitado."
            : "Abierto. Cualquiera con el link puede crear cuenta. Pon una clave de al menos 4 caracteres."}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Input
            type="password"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={enabled ? "Nueva clave" : "Clave del equipo"}
            autoComplete="off"
          />
          <Input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Confírmala"
            autoComplete="off"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={mut.isPending || code.length < 4 || code !== confirm}
            onClick={() => mut.mutate({ data: { enabled: true, code } })}
          >
            {enabled ? "Cambiar clave" : "Cerrar candado"}
          </Button>
          {enabled ? (
            <Button
              type="button"
              variant="outline"
              disabled={mut.isPending}
              onClick={() => {
                if (window.confirm("¿Abrir el candado? Cualquiera con el link podrá crear cuenta.")) {
                  mut.mutate({ data: { enabled: false } });
                }
              }}
            >
              Abrir candado
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function MemberActions({
  name,
  userId,
  status,
}: {
  name: string;
  userId: string;
  status: AccountStatus;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const statusMut = useMutation({
    mutationFn: setMemberStatus,
    onSuccess: () => {
      toast.success(status === "bloqueado" ? "Cuenta habilitada." : "Cuenta inhabilitada.");
      void qc.invalidateQueries({ queryKey: ["team"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const delMut = useMutation({
    mutationFn: deleteMember,
    onSuccess: () => {
      toast.success("Cuenta eliminada.");
      setOpen(false);
      setConfirm("");
      void qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const [wipe, setWipe] = useState(true);

  return (
    <div className="flex flex-wrap gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={statusMut.isPending}
        onClick={() =>
          statusMut.mutate({
            data: { userId, status: status === "bloqueado" ? "activo" : "bloqueado" },
          })
        }
      >
        {status === "bloqueado" ? "Habilitar" : "Inhabilitar"}
      </Button>
      <Button type="button" variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="Eliminar">
        <Trash2 className="size-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar a {name}</DialogTitle>
            <DialogDescription>
              No se puede deshacer. Si era una cuenta de prueba, deja marcada la casilla para
              borrar también a los productores que capturó. Escribe el nombre tal cual: {name}
            </DialogDescription>
          </DialogHeader>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1 size-4"
              checked={wipe}
              onChange={(e) => setWipe(e.target.checked)}
            />
            <span>Era de prueba: borrar también su cartera (productores y citas).</span>
          </label>
          <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={name} />
          <Button
            type="button"
            variant="destructive"
            disabled={delMut.isPending || confirm.trim().toLowerCase() !== name.trim().toLowerCase()}
            onClick={() => delMut.mutate({ data: { userId, confirmName: confirm, wipeCartera: wipe } })}
          >
            {delMut.isPending ? "Eliminando…" : "Sí, eliminar cuenta"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CarteraList() {
  const cartera = useQuery({ queryKey: ["cartera"], queryFn: () => getCartera() });
  const { setAgent, isGerente } = useViewAs();
  const navigate = useNavigate();
  const [open, setOpen] = useState<string | null>(null);

  if (cartera.isPending) return <Skeleton className="h-48" />;
  const agents = cartera.data?.agents ?? [];
  if (agents.length === 0) return null;

  return (
    <section>
      <h2 className="mb-3 font-display text-xl font-medium">Cartera del ciclo</h2>
      <div className="grid gap-3">
        {agents.map((a) => {
          const expanded = open === a.name;
          return (
            <article key={a.name} className="rounded-xl bg-surface shadow-[var(--shadow-border)]">
              <div className="flex flex-wrap items-center gap-2 px-4 py-3">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  onClick={() => setOpen(expanded ? null : a.name)}
                >
                  <ChevronDown className={cn("size-4 shrink-0 text-muted transition-transform", expanded && "rotate-180")} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{a.name}</span>
                    <span className="block text-xs text-muted">
                      {a.count} productores · {qty(a.hectares, 0)} ha · {qty(a.volume, 0)} t
                    </span>
                  </span>
                </button>
                {isGerente ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setAgent(a.name);
                      void navigate({ to: "/" });
                    }}
                  >
                    <Eye className="size-4" />
                    Ver como
                  </Button>
                ) : null}
              </div>
              {expanded ? (
                <ul className="border-t border-border">
                  {a.items.map((p) => (
                    <li key={p.id} className="border-b border-border last:border-0">
                      <Link
                        to="/productores/$id"
                        params={{ id: p.id }}
                        className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-secondary"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{p.name}</span>
                          <span className="block text-xs text-muted">
                            {p.zone} · {qty(p.hectares, 1)} ha
                          </span>
                        </span>
                        <StageChip stage={p.stage} short />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-4 pb-3 text-xs text-muted">
                  {a.stages.map((s) => `${stageMeta(s.stage).short} ${s.count}`).join(" · ")}
                </p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ProfileForm({
  displayName,
  phone,
  saving,
  onSave,
}: {
  displayName: string;
  phone: string;
  saving: boolean;
  onSave: (name: string, phone: string) => void;
}) {
  const [name, setName] = useState(displayName);
  const [tel, setTel] = useState(phone);

  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(name, tel);
      }}
    >
      <label className="grid gap-1.5">
        <span className="text-sm font-medium">Cómo te dicen</span>
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <label className="grid gap-1.5">
        <span className="text-sm font-medium">Teléfono</span>
        <Input value={tel} onChange={(e) => setTel(e.target.value)} inputMode="tel" />
      </label>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </form>
  );
}

function OfficeDesk({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const people = useQuery({ queryKey: ["office-people"], queryFn: () => listOfficePeople() });
  const pings = useQuery({
    queryKey: ["office-pings"],
    queryFn: () => listOfficePings(),
    enabled: canEdit,
  });
  const save = useMutation({
    mutationFn: saveOfficePerson,
    onSuccess: () => {
      toast.success("Persona de oficina guardada.");
      void qc.invalidateQueries({ queryKey: ["office-people"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteOfficePerson({ data: { id } }),
    onSuccess: () => {
      toast.success("Se quitó de la lista.");
      void qc.invalidateQueries({ queryKey: ["office-people"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const list = people.data?.people ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Oficina — a quién invitar</CardTitle>
        <p className="text-sm font-normal text-muted">
          Director, socios o papá. No necesitan entrar a la app: el comisionista les manda WhatsApp
          y aquí queda el registro.
        </p>
      </CardHeader>
      <CardContent className="grid gap-4">
        {people.isPending ? (
          <Skeleton className="h-20" />
        ) : list.length === 0 ? (
          <p className="text-sm text-muted">
            {canEdit
              ? "Agrega a tu papá, al director o a quien cierre con los productores."
              : "Gerencia aún no carga a nadie de oficina."}
          </p>
        ) : (
          <ul className="grid gap-2">
            {list.map((p) => (
              <li
                key={p.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-border px-3 py-3"
              >
                <div className="min-w-0">
                  <p className="font-medium">{p.name}</p>
                  <p className="text-sm text-muted">
                    {p.title ? `${p.title} · ` : ""}
                    {formatPhone(p.phone)}
                  </p>
                  <p className="mt-1 text-xs text-subtle">
                    {p.forInvite ? "Lo invitan a citas" : null}
                    {p.forInvite && p.forAviso ? " · " : null}
                    {p.forAviso ? "Recibe avisos del avance" : null}
                  </p>
                </div>
                {canEdit ? (
                  <button
                    type="button"
                    className="grid size-11 shrink-0 place-items-center rounded-md text-muted hover:bg-secondary hover:text-rose"
                    aria-label={`Quitar a ${p.name}`}
                    onClick={() => {
                      if (window.confirm(`¿Quitar a ${p.name} de la lista de oficina?`)) del.mutate(p.id);
                    }}
                  >
                    <Trash2 className="size-4" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {canEdit ? (
          <OfficePersonForm
            pending={save.isPending}
            onSave={(data) => save.mutate({ data })}
          />
        ) : null}

        {canEdit && pings.data?.pings.length ? (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-subtle">
              Últimos WhatsApp a oficina
            </p>
            <ol className="grid gap-2">
              {pings.data.pings.slice(0, 6).map((n) => (
                <li key={n.id} className="text-sm text-muted">
                  <span className="font-medium text-fg">{n.personName}</span>
                  {" · "}
                  {n.kind === "aviso" ? "aviso" : "invitación"}
                  {" · "}
                  {new Date(n.createdAt).toLocaleString("es-MX", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function OfficePersonForm({
  pending,
  onSave,
}: {
  pending: boolean;
  onSave: (d: { name: string; title: string; phone: string; forInvite: boolean; forAviso: boolean }) => void;
}) {
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [phone, setPhone] = useState("");
  const [forInvite, setForInvite] = useState(true);
  const [forAviso, setForAviso] = useState(true);

  return (
    <form
      className="grid gap-3 rounded-lg bg-bg p-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ name, title, phone, forInvite, forAviso });
        setName("");
        setTitle("");
        setPhone("");
        setForInvite(true);
        setForAviso(true);
      }}
    >
      <p className="text-sm font-medium">Agregar a alguien</p>
      <label className="grid gap-1.5">
        <span className="text-sm">Nombre</span>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Cómo le dicen" required />
      </label>
      <label className="grid gap-1.5">
        <span className="text-sm">Puesto</span>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Director de operaciones, socio, papá…"
        />
      </label>
      <label className="grid gap-1.5">
        <span className="text-sm">WhatsApp</span>
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" required />
      </label>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-5 accent-primary"
          checked={forInvite}
          onChange={(e) => setForInvite(e.target.checked)}
        />
        Lo invitan cuando hay que cerrar o ir a una cita
      </label>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-5 accent-primary"
          checked={forAviso}
          onChange={(e) => setForAviso(e.target.checked)}
        />
        Le mandan el avance (avisos)
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? "Guardando…" : "Agregar"}
      </Button>
    </form>
  );
}
