import { ReactNode } from "react";
import { NotesApi, NotesProvider } from "./NotesContext";
import { JiraDrawerProvider } from "./JiraDrawerContext";

/** App-wide context providers, composed so App's JSX stays a single wrapper deep. */
export function AppProviders({
  notesApi,
  jiraBaseUrl,
  children,
}: {
  notesApi: NotesApi;
  jiraBaseUrl?: string;
  children: ReactNode;
}) {
  return (
    <NotesProvider value={notesApi}>
      <JiraDrawerProvider baseUrl={jiraBaseUrl}>{children}</JiraDrawerProvider>
    </NotesProvider>
  );
}
