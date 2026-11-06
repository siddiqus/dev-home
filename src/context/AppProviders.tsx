import { ReactNode } from "react";
import { NotesApi, NotesProvider } from "./NotesContext";
import { JiraDrawerProvider } from "./JiraDrawerContext";
import { ViewerLoginContext } from "./ViewerLoginContext";
import { MergeProvider } from "./MergeContext";

/** App-wide context providers, composed so App's JSX stays a single wrapper deep. */
export function AppProviders({
  notesApi,
  jiraBaseUrl,
  githubUsername,
  onMerged,
  onApproved,
  onReviewRequested,
  children,
}: {
  notesApi: NotesApi;
  jiraBaseUrl?: string;
  githubUsername?: string;
  /** After a Merge button merges (or queues) a PR: refresh the open PRs. */
  onMerged?: () => void;
  /** After an Approve button approves a PR: refresh the reviews. */
  onApproved?: () => void;
  /** After a Request review button asks for reviews: refresh the open PRs. */
  onReviewRequested?: () => void;
  children: ReactNode;
}) {
  return (
    <NotesProvider value={notesApi}>
      <JiraDrawerProvider baseUrl={jiraBaseUrl}>
        <ViewerLoginContext.Provider value={githubUsername ?? ""}>
          <MergeProvider
            onMerged={onMerged}
            onApproved={onApproved}
            onReviewRequested={onReviewRequested}
          >
            {children}
          </MergeProvider>
        </ViewerLoginContext.Provider>
      </JiraDrawerProvider>
    </NotesProvider>
  );
}
