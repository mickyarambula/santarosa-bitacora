export const GUIDE_STEPS = [
  {
    n: "1",
    title: "Entra con tu correo",
    body: "Pica Soy nuevo, pon cómo te dicen, correo y contraseña. Si gerencia cerró el candado, pide la clave del equipo. Confírmala y pícale a Ver contraseña para no errarle.",
  },
  {
    n: "2",
    title: "Captura al productor",
    body: "En Hoy o el botón + : nombre, teléfono, municipio, cultivo y hectáreas. El financiamiento es por hectárea — pones el monto por ha y el préstamo se calcula solo.",
  },
  {
    n: "3",
    title: "Si usa varios nombres, es un grupo",
    body: "Hay quien siembra con el suyo, un familiar o un amigo por crédito o apoyos. Cada nombre es ficha aparte y cada uno lleva su papelería. En la captura: «¿Va con otros nombres?» → Sí, es un grupo. Marca quién es el productor real. El mismo WhatsApp sí se vale si van juntos. Si ya los tenías sueltos: Más → Grupos → Armar grupo.",
  },
  {
    n: "4",
    title: "Haz la cita y el contacto",
    body: "En Citas pica Hacer cita. En la ficha puedes llamar, mandar WhatsApp o correo: queda asentado. Si ocupan a oficina para cerrar, Pedir apoyo.",
  },
  {
    n: "5",
    title: "Papelería, que es la lata",
    body: "En la ficha vas marcando INE, predial, cuenta… lo que falte. Desde ahí se lo pides por WhatsApp. Cuando esté completo, se habilita. En un grupo, papeles de CADA nombre, no nada más del real.",
  },
  {
    n: "6",
    title: "Si se traban",
    body: "Más → Cómo se usa. Gerencia ve a todos. El comisionista solo lo suyo. En iPhone: Compartir → Agregar a inicio, para que se vea como app.",
  },
] as const;

export const ONBOARDING_STEPS = [
  {
    title: "Esta es tu bitácora",
    body: "Ya no es el Excel. Aquí capturas productores del ciclo 26-27, ves en qué van y qué les falta.",
  },
  {
    title: "Primero se captura",
    body: "Nombre, teléfono, cultivo, hectáreas y el monto por hectárea. El préstamo se arma solo. Con eso ya quedó prospectado.",
  },
  {
    title: "Varios nombres, un productor",
    body: "Si siembra con el de la esposa, un amigo o el suyo, cada nombre es ficha aparte — papeles de cada uno — y los juntas en un grupo. Marca quién es el productor real. El mismo WhatsApp sí se vale si van en el grupo. Si ya los tenías sueltos: Más → Grupos.",
  },
  {
    title: "Luego la cita y el trato",
    body: "Citas → Hacer cita. En la ficha registras llamada, WhatsApp o correo para saber cómo va, no nada más la visita.",
  },
  {
    title: "La papelería no se te olvide",
    body: "Es lo que más se atora. Márcala en la ficha, de cada nombre del grupo. Si ocupan a un socio o a papá para cerrar, Pedir apoyo por WhatsApp.",
  },
] as const;

export function groupMessage(appUrl: string): string {
  const url = appUrl.replace(/\/$/, "");
  return [
    "Comisionistas, ya está la bitácora de Almacenes Santa Rosa para el ciclo 26-27.",
    "",
    "Entren aquí:",
    url,
    "",
    "Cómo se usa, corto:",
    "",
    "1) Piquen Soy nuevo. Correo, contraseña y confírmenla. Si hay candado, pidan la clave del equipo aquí en el grupo.",
    "",
    "2) En Hoy → Capturar productor. Nombre, teléfono, municipio, cultivo, hectáreas y cuánto se habilita por hectárea. El préstamo se calcula solo.",
    "",
    "3) Si el productor siembra con varios nombres (el suyo, un familiar, un amigo) por crédito o apoyos: cada nombre se captura aparte y van en un GRUPO. En la captura, «¿Va con otros nombres?» → Sí. Marquen quién es el productor real. Cada uno lleva su papelería. El mismo WhatsApp sí se puede si van en el mismo grupo.",
    "",
    "Si ya los tenían sueltos: Más → Grupos. Si salen con el mismo celular, Armar grupo y marquen al productor real. No los borren ni los junten en una sola ficha.",
    "",
    "4) Citas → Hacer cita, cuando vayan a verlo.",
    "",
    "5) En la ficha van marcando papeles y cada llamada / WhatsApp / correo.",
    "",
    "6) Si se traban: Más → Cómo se usa. En el iPhone: Compartir → Agregar a inicio.",
    "",
    "Cualquier duda, aquí en el grupo.",
  ].join("\n");
}

export function gruposMessage(appUrl: string): string {
  const url = appUrl.replace(/\/$/, "");
  return [
    "Comisionistas, una cosa nueva en la bitácora:",
    "",
    "Hay productores que siembran con varios nombres — el suyo, un familiar, un amigo — por crédito, apoyos o facilidades. Eso NO es un duplicado. Son fichas aparte y van en un GRUPO.",
    "",
    "Cómo se hace de aquí en adelante:",
    "1. Capturan CADA nombre como siempre (papeles, hectáreas y préstamo de cada uno).",
    "2. En la captura, donde dice «¿Va con otros nombres?» pican Sí, es un grupo.",
    "3. Lo meten a un grupo o arman uno nuevo (ej. Grupo Ramírez).",
    "4. Marcan quién es el productor real y si los demás son familiar, amigo o socio.",
    "5. El mismo WhatsApp sí se puede usar si van en el mismo grupo.",
    "",
    "Si YA los tenían capturados sueltos:",
    "• Más → Grupos.",
    "• Si salen juntos porque tienen el mismo celular: Armar grupo, le ponen nombre y marcan al productor real.",
    "• Si no salen ahí: abren una ficha → Editar → Sí, es un grupo → eligen el grupo o arman uno nuevo.",
    "",
    "No borren nombres ni los junten en una sola ficha. Hay que verlos uno por uno y también como un todo.",
    "",
    "La bitácora:",
    url,
    "",
    "Cualquier duda, aquí en el grupo.",
  ].join("\n");
}
