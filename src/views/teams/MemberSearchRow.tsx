import { useState, useEffect, useMemo } from "react";
import { searchJiraUsers } from "../../services/teams";
import { apiClient } from "../../services/config";
import { SearchableDropdown, type DropdownItem } from "../../components/SearchableDropdown";
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
  const [jiraResults, setJiraResults] = useState<JiraUserResult[]>([]);
  const [selectedJira, setSelectedJira] = useState<JiraUserResult | null>(null);

  const [ghMembers, setGhMembers] = useState<GhMember[]>([]);
  const [selectedGh, setSelectedGh] = useState<GhMember | null>(null);

  const runJiraSearch = async (q: string) => {
    if (q.trim().length < 2) return setJiraResults([]);
    try {
      setJiraResults(await searchJiraUsers(q));
    } catch {
      setJiraResults([]);
    }
  };

  // GitHub org members are a bounded static list — load once and let the
  // dropdown filter client-side.
  useEffect(() => {
    let cancelled = false;
    apiClient
      .get("/github/org-members")
      .then(({ data }) => {
        if (!cancelled) setGhMembers(data.members || []);
      })
      .catch(() => {
        if (!cancelled) setGhMembers([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const jiraItems: DropdownItem[] = useMemo(
    () =>
      jiraResults.map((u) => ({
        value: u.accountId,
        label: u.emailAddress ? `${u.displayName} · ${u.emailAddress}` : u.displayName,
        icon: u.avatarUrl,
      })),
    [jiraResults],
  );

  const ghItems: DropdownItem[] = useMemo(
    () => ghMembers.map((m) => ({ value: m.login, label: m.login, icon: m.avatar_url })),
    [ghMembers],
  );

  const canAdd = selectedJira && selectedGh;

  return (
    <div className="d-flex gap-2 align-items-start flex-wrap">
      <SearchableDropdown
        items={jiraItems}
        value={selectedJira?.accountId || ""}
        selectedLabel={selectedJira?.emailAddress || selectedJira?.displayName}
        onChange={(v) => setSelectedJira(jiraResults.find((u) => u.accountId === v) || null)}
        onSearchChange={runJiraSearch}
        placeholder="Search Jira user…"
        allLabel="Select Jira user"
        hideAllOption
        width={350}
      />
      <SearchableDropdown
        items={ghItems}
        value={selectedGh?.login || ""}
        onChange={(v) => setSelectedGh(ghMembers.find((m) => m.login === v) || null)}
        placeholder="Search GitHub member…"
        allLabel="Select GitHub member"
        hideAllOption
        width={220}
      />
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
          setJiraResults([]);
        }}
      >
        Add
      </button>
    </div>
  );
}
