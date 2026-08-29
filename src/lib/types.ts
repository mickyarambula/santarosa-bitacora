import type {
  BusinessUnit,
  CropId,
  DocStatus,
  GroupRoleId,
  RejectionKind,
  RejectionReasonId,
  RelationId,
  SchemeId,
  StageId,
  VisitStatus,
} from "./catalog";

export type Role = "gerente" | "comisionista";
export type AccountStatus = "activo" | "bloqueado";

export type Profile = {
  userId: string;
  displayName: string;
  role: Role;
  status: AccountStatus;
  phone: string | null;
  createdAt: string;
};

export type Producer = {
  id: string;
  ownerUserId: string;
  comisionistaName: string;
  name: string;
  businessUnit: BusinessUnit;
  scheme: SchemeId;
  relation: RelationId;
  isNew: boolean;
  zone: string;
  locality: string | null;
  crop: CropId;
  hectares: number;
  yieldTonHa: number;
  volumeTon: number;
  financingMxn: number;
  financingPerHa: number;
  phone: string | null;
  email: string | null;
  stage: StageId;
  blocker: string | null;
  notes: string | null;
  cycle: string;
  createdAt: string;
  updatedAt: string;
  isExample?: boolean;
  lastTouchAt: string | null;
  lastTouchChannel: string | null;
  groupId: string | null;
  groupRole: GroupRoleId | null;
  groupName: string | null;
  groupTitularName: string | null;
  rejectionKind: RejectionKind | null;
  rejectionReason: RejectionReasonId | null;
  rejectionNotes: string | null;
  hectaresRequested: number;
  rejectedAt: string | null;
  rejectedBy: string | null;
};

export type DocumentItem = {
  id: string;
  producerId: string;
  docType: string;
  status: DocStatus;
  notes: string | null;
  updatedAt: string;
  label: string;
  required: boolean;
};

export type Visit = {
  id: string;
  producerId: string;
  producerName: string;
  ownerUserId: string;
  scheduledAt: string;
  place: string | null;
  purpose: string | null;
  status: VisitStatus;
  notes: string | null;
  phone: string | null;
  zone: string;
  createdAt: string;
};

export type ActivityItem = {
  id: string;
  producerId: string;
  userId: string;
  kind: string;
  message: string;
  createdAt: string;
};

export type TouchItem = {
  id: string;
  producerId: string;
  channel: string;
  outcome: string | null;
  summary: string | null;
  happenedAt: string;
  createdAt: string;
};

export type ProducerInput = {
  name: string;
  comisionistaName?: string;
  businessUnit: BusinessUnit;
  scheme: SchemeId;
  relation: RelationId;
  isNew?: boolean;
  zone: string;
  locality?: string | null;
  crop: CropId;
  hectares: number;
  yieldTonHa: number;
  financingMxn: number;
  financingPerHa?: number;
  phone?: string | null;
  email?: string | null;
  stage: StageId;
  blocker?: string | null;
  notes?: string | null;
  groupId?: string | null;
  newGroupName?: string | null;
  groupRole?: GroupRoleId | null;
};

export type DocProgress = {
  total: number;
  required: number;
  done: number;
  requiredDone: number;
};

export type AttentionItem = {
  id: string;
  kind: "papeleria" | "visita" | "estancado" | "cita_hoy" | "sin_contacto";
  title: string;
  detail: string;
  producerId: string;
};

export type StageCount = { stage: StageId; count: number; hectares: number; volume: number; financing: number };

export type AgentCount = {
  name: string;
  count: number;
  hectares: number;
  volume: number;
  financing: number;
};

export type Dashboard = {
  profile: Profile;
  kpis: {
    producers: number;
    hectares: number;
    volume: number;
    financing: number;
    pendingDocs: number;
    visitsToday: number;
  };
  stages: StageCount[];
  agents: AgentCount[];
  crops: { crop: string; hectares: number; volume: number }[];
  todayVisits: Visit[];
  upcomingVisits: Visit[];
  attention: AttentionItem[];
  recent: Producer[];
  exampleCount: number;
};

export type ProducerDetail = {
  producer: Producer;
  documents: DocumentItem[];
  progress: DocProgress;
  visits: Visit[];
  activity: ActivityItem[];
  touches: TouchItem[];
  group: ProducerGroup | null;
  roster: GroupMember[];
};

export type GroupMember = {
  producer: Producer;
  progress: DocProgress;
};

export type ProducerGroup = {
  id: string;
  name: string;
  ownerUserId: string;
  comisionistaName: string;
  titularProducerId: string | null;
  titularName: string | null;
  notes: string | null;
  members: number;
  hectares: number;
  financing: number;
  volume: number;
  producers: Producer[];
};

export type Announcement = {
  id: string;
  authorUserId: string;
  authorName: string;
  kind: "equipo" | "productores";
  stage: StageId | null;
  title: string;
  body: string;
  createdAt: string;
};

export type AgentCartera = AgentCount & {
  stages: { stage: StageId; count: number }[];
  items: Producer[];
};

export type ReminderKind = "cita" | "papeleria" | "estancado";

export type ReminderItem = {
  id: string;
  kind: ReminderKind;
  producerId: string;
  producerName: string;
  phone: string | null;
  comisionistaName: string;
  title: string;
  detail: string;
  message: string;
};

export type OfficePerson = {
  id: string;
  name: string;
  title: string;
  phone: string;
  forInvite: boolean;
  forAviso: boolean;
};

export type OfficePing = {
  id: string;
  personName: string;
  kind: "invite" | "aviso";
  producerId: string | null;
  message: string;
  createdAt: string;
};

