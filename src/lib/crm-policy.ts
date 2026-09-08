import { z } from "zod";
import { CROPS, SCHEMES, STAGES, UNITS, ZONES } from "./catalog";

const amount = z.number().finite().nonnegative().max(99999999);
export const producerInputSchema = z.object({
  id: z.string().optional(),
  ownerUserId: z.string().optional(),
  name: z.string().trim().min(1, "Escribe el nombre del productor.").max(250),
  comisionistaName: z.string().max(200).optional(),
  businessUnit: z.enum(UNITS.map((x) => x.id)),
  scheme: z.enum(SCHEMES.map((x) => x.id)),
  crop: z.enum(CROPS.map((x) => x.id)),
  stage: z.enum(STAGES.map((x) => x.id)),
  zone: z.enum(ZONES),
  relation: z.enum(["nuevo", "recurrente", "recuperacion"]),
  isNew: z.boolean().optional(),
  hectares: amount,
  yieldTonHa: amount,
  financingMxn: amount,
  financingPerHa: amount.optional(),
  locality: z.string().max(250).nullish(),
  phone: z.string().max(40).nullish(),
  email: z.union([z.email(), z.literal("")]).nullish(),
  blocker: z.string().max(1000).nullish(),
  notes: z.string().max(10000).nullish(),
  groupId: z.string().nullish(),
  newGroupName: z.string().max(250).nullish(),
  groupRole: z.enum(["titular", "familiar", "amigo", "socio"]).nullish(),
});
