import { useEffect, useState } from "react";
import Button from "react-bootstrap/Button";
import Spinner from "react-bootstrap/Spinner";
import { IconChevronDown, IconFilter } from "@tabler/icons-react";
import type { GitHubPR } from "../../types";
import { EmptyState } from "../../components/EmptyState";
import { PRDetailModal } from "../../components/PRDetailModal";
import { SegmentedTabs } from "../../components/SegmentedTabs";
import { Toast } from "../../components/Toast";
import { usePRCopyActions } from "../../hooks/usePRCopyActions";
import { CopyPRLinkContext } from "../workday/CompactRow";
import { DeckPRRow } from "../workday/DeckPRRow";
import { PhoneFilterSheet } from "./PhoneFilterSheet";
import { searchPR } from "./searchPR";
import { useOrgPRSearch } from "./useOrgPRSearch";
// The Workday card's styles; Workday loads them too, but a phone can open here first.
import "../workday/deck.css";
import "./PhonePRSearch.css";

interface Props {
  configured: boolean;
  jiraBaseUrl: string;
  /** The app's refresh (top bar, pull to refresh) bumps it: reload the results. */
  refreshKey?: number;
  /** Results loading, for the top bar's spinner and the pull-to-refresh indicator. */
  onLoadingChange?(loading: boolean): void;
}

const noop = () => {};

/** "Anyone" / "shunjid" / "3 authors". */
function picksLabel(values: string[], none: string, noun: string, name = (v: string) => v) {
  if (values.length === 0) return none;
  if (values.length === 1) return name(values[0]);
  return `${values.length} ${noun}`;
}

/**
 * PR search on a phone: All PRs' search (authors and repos, open or recently
 * merged) with results as Workday PR cards, the author always shown. No saved
 * filters: they aren't synced across devices.
 */
export function PhonePRSearch({ configured, jiraBaseUrl, refreshKey, onLoadingChange }: Props) {
  const search = useOrgPRSearch({ configured, refreshKey });
  const { authors, selectedRepos, subTab, members, orgRepos } = search;
  const [sheet, setSheet] = useState<"authors" | "repos" | null>(null);
  const [selectedPR, setSelectedPR] = useState<GitHubPR | null>(null);
  const { onCopyLink, toast } = usePRCopyActions();
  const now = new Date();

  const merged = subTab === "merged";
  const list = merged ? search.mergedPRs : search.prs;
  const loading = merged ? search.mergedPRsLoading : search.loading;
  useEffect(() => onLoadingChange?.(loading), [loading, onLoadingChange]);

  const picked = authors.length > 0 || selectedRepos.length > 0;
  const repoName = (fullName: string) => fullName.split("/").pop() ?? fullName;
  const authorsLabel = picksLabel(authors, "Anyone", "authors");
  const reposLabel = picksLabel(selectedRepos, "All repos", "repos", repoName);

  const chip = (kind: "authors" | "repos", title: string, label: string, set: boolean) => (
    <button
      type="button"
      className={`phone-pr-search__chip${set ? " is-set" : ""}`}
      aria-label={`${title}: ${label}`}
      onClick={() => setSheet(kind)}
    >
      <span className="phone-pr-search__chip-label">{label}</span>
      <IconChevronDown size={12} aria-hidden="true" />
    </button>
  );

  return (
    <CopyPRLinkContext.Provider value={onCopyLink}>
      <div className="phone-pr-search">
        <h1 className="phone-pr-search__title">PR search</h1>
        <div className="phone-pr-search__toolbar">
          <div className="phone-pr-search__chips">
            {chip("authors", "Authors", authorsLabel, authors.length > 0)}
            {chip("repos", "Repos", reposLabel, selectedRepos.length > 0)}
          </div>
          <SegmentedTabs
            className="inline-control"
            activeKey={subTab}
            onChange={(k) => search.setSubTab(k as "open" | "merged")}
            tabs={[
              { key: "open", label: "Open" },
              { key: "merged", label: "Merged" },
            ]}
          />
        </div>

        {!picked ? (
          <EmptyState
            icon={<IconFilter size={28} stroke={1.4} />}
            title="Pick authors or repos to search"
            description="Tap Anyone or All repos above."
          />
        ) : (
          <>
            <div className="phone-pr-search__count">
              {loading && list.length === 0 ? (
                <Spinner animation="border" size="sm" variant="secondary" />
              ) : (
                // "Showing", since the search returns the most recent page, not every match.
                `Showing ${list.length} ${merged ? "recently merged" : "recent"} ${list.length === 1 ? "PR" : "PRs"}`
              )}
            </div>
            <div
              role="listbox"
              aria-label="Pull requests"
              className={`phone-pr-search__list${loading && list.length > 0 ? " is-stale" : ""}`}
            >
              {list.map((pr) => (
                <DeckPRRow
                  key={pr.html_url}
                  id={`pr-search-${pr.number}-${pr.repo_full_name}`}
                  item={searchPR(pr, now)}
                  ticketKey={null}
                  selected={false}
                  now={now}
                  onSelect={noop}
                  onOpen={setSelectedPR}
                  alwaysShowAuthor
                />
              ))}
            </div>
            {!merged && search.hasNextPage && !search.isMultiMode && (
              <div className="phone-pr-search__more">
                <Button
                  variant="outline-secondary"
                  size="sm"
                  onClick={search.fetchNextPage}
                  disabled={search.loadingMore}
                >
                  {search.loadingMore ? "Loading…" : "Load more"}
                </Button>
              </div>
            )}
          </>
        )}

        <PhoneFilterSheet
          show={sheet === "authors"}
          onHide={() => setSheet(null)}
          title="Authors"
          searchPlaceholder="Search people…"
          items={members.map((m) => ({ value: m.login, label: m.login, avatar: m.avatar_url }))}
          values={authors}
          onChange={search.setAuthors}
        />
        <PhoneFilterSheet
          show={sheet === "repos"}
          onHide={() => setSheet(null)}
          title="Repos"
          searchPlaceholder="Search repos…"
          items={orgRepos.map((r) => ({ value: r.full_name, label: r.name }))}
          values={selectedRepos}
          onChange={search.setSelectedRepos}
        />
        <PRDetailModal
          pr={selectedPR}
          onHide={() => setSelectedPR(null)}
          jiraBaseUrl={jiraBaseUrl}
        />
        <Toast message={toast.message} visible={toast.visible} />
      </div>
    </CopyPRLinkContext.Provider>
  );
}
