import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useState, type ReactNode } from "react";
import { MINE_SCOPE, listAgentNames } from "@/lib/crm";
import type { Profile } from "@/lib/types";

const STORAGE_KEY = "sr-view-as";

type ViewAsContextValue = {
  agent: string | null;
  agentLabel: string | null;
  setAgent: (name: string | null) => void;
  names: string[];
  isGerente: boolean;
  displayName: string;
  captureName: string;
};

const ViewAsContext = createContext<ViewAsContextValue>({
  agent: null,
  agentLabel: null,
  setAgent: () => {},
  names: [],
  isGerente: false,
  displayName: "",
  captureName: "",
});

export { MINE_SCOPE };

export function ViewAsProvider({
  profile,
  children,
}: {
  profile: Profile;
  children: ReactNode;
}) {
  const isGerente = profile.role === "gerente";
  const [agent, setAgentState] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      return sessionStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });

  const namesQ = useQuery({
    queryKey: ["agent-names"],
    queryFn: () => listAgentNames(),
    enabled: isGerente,
  });

  function setAgent(name: string | null) {
    const next = name?.trim() || null;
    setAgentState(next);
    try {
      if (next) sessionStorage.setItem(STORAGE_KEY, next);
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  const scoped = isGerente ? agent : null;
  const agentLabel = scoped === MINE_SCOPE ? "tu cartera" : scoped;
  const captureName =
    scoped && scoped !== MINE_SCOPE ? scoped : profile.displayName;

  return (
    <ViewAsContext.Provider
      value={{
        agent: scoped,
        agentLabel,
        setAgent,
        names: namesQ.data?.names ?? [],
        isGerente,
        displayName: profile.displayName,
        captureName,
      }}
    >
      {children}
    </ViewAsContext.Provider>
  );
}

export function useViewAs() {
  return useContext(ViewAsContext);
}
