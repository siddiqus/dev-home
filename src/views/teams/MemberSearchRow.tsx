import { useState, useRef } from "react";
import { searchJiraUsers } from "../../services/teams";
import { apiClient } from "../../services/config";
import type { JiraUserResult } from "../../types/teams";

interface GhMember {
  login: string;
  avatar_url: string;
}

interface Props {
  onAdd: (member: {
    displayName: string;
    jiraAccountId: string;
    jiraEmail: string | null;
    githubUsername: string;
  }) => void;
}

export function MemberSearchRow({ onAdd }: Props) {
  const [jiraQuery, setJiraQuery] = useState("");
  const [jiraResults, setJiraResults] = useState<JiraUserResult[]>([]);
  const [selectedJira, setSelectedJira] = useState<JiraUserResult | null>(null);

  const [ghQuery, setGhQuery] = useState("");
  const [ghResults, setGhResults] = useState<GhMember[]>([]);
  const [selectedGh, setSelectedGh] = useState<GhMember | null>(null);
  const ghMembersCache = useRef<GhMember[] | null>(null);

  const runJiraSearch = async (q: string) => {
    setJiraQuery(q);
    if (q.trim().length < 2) return setJiraResults([]);
    try {
      setJiraResults(await searchJiraUsers(q));
    } catch {
      setJiraResults([]);
    }
  };

  const runGhSearch = async (q: string) => {
    setGhQuery(q);
    if (q.trim().length < 1) return setGhResults([]);
    try {
      if (!ghMembersCache.current) {
        const { data } = await apiClient.get("/github/org-members");
        ghMembersCache.current = data.members || [];
      }
      const cached = ghMembersCache.current ?? [];
      setGhResults(
        cached.filter((m) => m.login.toLowerCase().includes(q.toLowerCase())).slice(0, 10),
      );
    } catch {
      setGhResults([]);
    }
  };

  const canAdd = selectedJira && selectedGh;

  return (
    <div className="d-flex gap-2 align-items-start flex-wrap">
      <div style={{ flex: 1, minWidth: 200 }}>
        <input
          className="form-control form-control-sm"
          placeholder="Search Jira user…"
          value={selectedJira ? selectedJira.displayName : jiraQuery}
          onChange={(e) => {
            setSelectedJira(null);
            runJiraSearch(e.target.value);
          }}
        />
        {!selectedJira &&
          jiraResults.map((u) => (
            <div
              key={u.accountId}
              className="p-1 small"
              style={{ cursor: "pointer" }}
              onClick={() => {
                setSelectedJira(u);
                setJiraResults([]);
              }}
            >
              {u.displayName} {u.emailAddress ? `· ${u.emailAddress}` : ""}
            </div>
          ))}
      </div>
      <div style={{ flex: 1, minWidth: 200 }}>
        <input
          className="form-control form-control-sm"
          placeholder="Search GitHub member…"
          value={selectedGh ? selectedGh.login : ghQuery}
          onChange={(e) => {
            setSelectedGh(null);
            runGhSearch(e.target.value);
          }}
        />
        {!selectedGh &&
          ghResults.map((m) => (
            <div
              key={m.login}
              className="p-1 small"
              style={{ cursor: "pointer" }}
              onClick={() => {
                setSelectedGh(m);
                setGhResults([]);
              }}
            >
              {m.login}
            </div>
          ))}
      </div>
      <button
        className="btn btn-sm btn-primary"
        disabled={!canAdd}
        onClick={() => {
          if (!selectedJira || !selectedGh) return;
          onAdd({
            displayName: selectedJira.displayName,
            jiraAccountId: selectedJira.accountId,
            jiraEmail: selectedJira.emailAddress,
            githubUsername: selectedGh.login,
          });
          setSelectedJira(null);
          setSelectedGh(null);
          setJiraQuery("");
          setGhQuery("");
        }}
      >
        Add
      </button>
    </div>
  );
}
