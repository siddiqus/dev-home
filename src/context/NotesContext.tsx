import { createContext, useContext, ReactNode } from "react";
import { useNotes } from "../hooks/useNotes";

export type NotesApi = ReturnType<typeof useNotes>;

const NotesContext = createContext<NotesApi | null>(null);

export function NotesProvider({ value, children }: { value: NotesApi; children: ReactNode }) {
  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>;
}

export function useNotesContext(): NotesApi {
  const ctx = useContext(NotesContext);
  if (ctx === null) {
    throw new Error("useNotesContext must be used within a NotesProvider");
  }
  return ctx;
}

export function useOptionalNotes(): NotesApi | null {
  return useContext(NotesContext);
}
