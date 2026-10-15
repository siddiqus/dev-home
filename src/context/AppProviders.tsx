import { ReactNode } from "react";
import { NotesApi, NotesProvider } from "./NotesContext";
import { JiraDrawerProvider } from "./JiraDrawerContext";
import { ViewerLoginContext } from "./ViewerLoginContext";

/** App-wide context providers, composed so App's JSX stays a single wrapper deep. */
export function AppProviders({
  notesApi,
  jiraBaseUrl,
  githubUsername,
  children,
}: {
  notesApi: NotesApi;
  jiraBaseUrl?: string;
  githubUsername?: string;
  children: ReactNode;
}) {
  return (
    <NotesProvider value={notesApi}>
      <JiraDrawerProvider baseUrl={jiraBaseUrl}>
        <ViewerLoginContext.Provider value={githubUsername ?? ""}>
          {children}
        </ViewerLoginContext.Provider>
      </JiraDrawerProvider>
    </NotesProvider>
  );
}
