import { useState, useEffect, useMemo } from "react";
import { searchJiraUsers } from "../../services/teams";
import { fetchOrgMembers, type OrgMember } from "../../services/github";
import { SearchableDropdown, type DropdownItem } from "../../components/SearchableDropdown";
import type { JiraUserResult } from "../../types/teams";

const normName = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/** The one org member whose GitHub profile name is this Jira name; null if none or several. */
export function suggestGithubMember(members: OrgMember[], jiraName: string): OrgMember | null {
  const want = normName(jiraName);
  if (!want) return null;
  const found = members.filter((m) => m.name && normName(m.name) === want);
  return found.length === 1 ? found[0] : null;
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

  const [ghMembers, setGhMembers] = useState<OrgMember[]>([]);
  const [selectedGh, setSelectedGh] = useState<OrgMember | null>(null);
  // The GitHub pick came from the Jira name, not the user: a new Jira pick may replace it.
  const [ghSuggested, setGhSuggested] = useState(false);

  const pickJira = (user: JiraUserResult | null) => {
    setSelectedJira(user);
    if (selectedGh && !ghSuggested) return;
    const match = user ? suggestGithubMember(ghMembers, user.displayName) : null;
    setSelectedGh(match);
    setGhSuggested(!!match);
  };

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
    fetchOrgMembers()
      .then((members) => {
        if (!cancelled) setGhMembers(members || []);
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
    () =>
      ghMembers.map((m) => ({
        value: m.login,
        label: m.login,
        hint: m.name ?? undefined,
        icon: m.avatar_url,
      })),
    [ghMembers],
  );

  const canAdd = selectedJira && selectedGh;

  return (
    <div className="d-flex gap-2 align-items-start flex-wrap">
      <SearchableDropdown
        items={jiraItems}
        value={selectedJira?.accountId || ""}
        selectedLabel={selectedJira?.emailAddress || selectedJira?.displayName}
        onChange={(v) => pickJira(jiraResults.find((u) => u.accountId === v) || null)}
        onSearchChange={runJiraSearch}
        placeholder="Search Jira user…"
        allLabel="Select Jira user"
        hideAllOption
        width={350}
      />
      <SearchableDropdown
        items={ghItems}
        value={selectedGh?.login || ""}
        onChange={(v) => {
          setSelectedGh(ghMembers.find((m) => m.login === v) || null);
          setGhSuggested(false);
        }}
        placeholder="Search login or name…"
        allLabel="Select GitHub member"
        hideAllOption
        width={280}
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
          setGhSuggested(false);
          setJiraResults([]);
        }}
      >
        Add
      </button>
    </div>
  );
}
