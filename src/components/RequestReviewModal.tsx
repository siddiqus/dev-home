import { useCallback, useEffect, useMemo, useState } from "react";
import Modal from "react-bootstrap/Modal";
import Button from "react-bootstrap/Button";
import { IconCheck, IconRefresh, IconSearch } from "@tabler/icons-react";
import type { GitHubPR } from "../types";
import { toApiError } from "../api/http/errors";
import { loadSettings } from "../services/config";
import { fetchOrgMembers, fetchOrgTeams, type OrgMember, type OrgTeam } from "../services/github";
import { readCached, writeCached } from "../lib/ttlCache";
import { useBackClose } from "../hooks/useBackClose";
import { useIsPhone } from "../hooks/useIsPhone";
import { TeamIcon } from "./primitives/TeamIcon";
import { reviewStep } from "../utils/prAction";
import { repoRef } from "../views/workday/prState";
import "./RequestReview.css";

/** Someone to ask for a review: a person (login) or a team (slug). */
export interface PickedReviewer {
  kind: "user" | "team";
  id: string;
  /** Login, or the team's name. */
  label: string;
}

interface Candidate extends PickedReviewer {
  avatar?: string;
  /** A person's profile name, or a team's slug when it differs from its name. Searched too. */
  sub?: string;
  /** A team's member count. */
  members?: number;
}

interface Props {
  pr: GitHubPR;
  show: boolean;
  onHide(): void;
  /** Sends the request: null once GitHub took it (the modal closes), else why it refused. */
  onSubmit(picked: PickedReviewer[]): Promise<string | null>;
}

const keyOf = (c: PickedReviewer) => `${c.kind}:${c.id.toLowerCase()}`;

/** A load that hasn't settled, settled with data, or failed with a reason. */
type Load<T> = { data: T | null; error: string | null };

/** Org members and teams change rarely: a list saved within the day opens with no fetch. Refresh refetches. */
const LIST_TTL_MS = 24 * 60 * 60 * 1000;

const loadMembers = (force: boolean) => fetchOrgMembers({ force });
const loadTeams = (force: boolean) => fetchOrgTeams({ force });

/**
 * An org list kept in localStorage per org (a switched org never shows the old
 * one). Opening fetches only when no fresh copy is saved; `refresh` refetches.
 */
function useOrgList<T>(
  show: boolean,
  name: string,
  load: (force: boolean) => Promise<T>,
): Load<T> & { refreshing: boolean; refresh(): void } {
  const key = `dev-home-review-${name}-cache:${loadSettings().githubOrg}`;
  const [state, setState] = useState<Load<T>>(() => ({
    data: readCached<{ data: T }>(key, LIST_TTL_MS)?.data ?? null,
    error: null,
  }));
  const [refreshing, setRefreshing] = useState(false);

  const fetchList = useCallback(
    async (force: boolean) => {
      try {
        const data = await load(force);
        writeCached(key, { data });
        setState({ data, error: null });
      } catch (err) {
        setState((prev) => ({ data: prev.data, error: toApiError(err).message }));
      }
    },
    [key, load],
  );

  useEffect(() => {
    if (show && !readCached(key, LIST_TTL_MS)) void fetchList(false);
  }, [show, key, fetchList]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await fetchList(true);
    setRefreshing(false);
  }, [fetchList]);

  return { ...state, refreshing, refresh };
}

/**
 * Pick people and teams to ask for a review of my PR: a search box over the
 * org's members and teams (both cached lists, fetched when the modal opens).
 * A re-request starts with the people who reviewed before already ticked, on
 * top. Full screen on a phone. Opened through MergeContext, never inside a row,
 * so its clicks can't reach a row underneath.
 */
export function RequestReviewModal({ pr, show, onHide, onSubmit }: Props) {
  useBackClose(show, onHide);
  const phone = useIsPhone();
  const rerequest = reviewStep(pr) === "rerequest";
  const author = pr.user.login.toLowerCase();

  const members = useOrgList<OrgMember[]>(show, "members", loadMembers);
  const teams = useOrgList<OrgTeam[]>(show, "teams", loadTeams);
  const refreshing = members.refreshing || teams.refreshing;
  const refreshLists = () => {
    members.refresh();
    teams.refresh();
  };

  /** Who reviewed or commented before, on a re-request: listed first, ticked. */
  const previous = useMemo<Candidate[]>(() => {
    if (!rerequest) return [];
    return (pr.participants ?? [])
      .filter((p) => p.login.toLowerCase() !== author)
      .map((p) => ({ kind: "user", id: p.login, label: p.login }));
  }, [rerequest, pr.participants, author]);

  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<ReadonlyMap<string, PickedReviewer>>(
    () => new Map(previous.map((c) => [keyOf(c), c])),
  );
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  const sections = useMemo(() => {
    const byLogin = new Map((members.data ?? []).map((m) => [m.login.toLowerCase(), m]));
    const prevKeys = new Set(previous.map(keyOf));
    const q = query.trim().toLowerCase();
    const matches = (c: Candidate) =>
      !q || c.label.toLowerCase().includes(q) || !!c.sub?.toLowerCase().includes(q);
    const people: Candidate[] = (members.data ?? [])
      .filter((m) => m.login.toLowerCase() !== author)
      .map((m) => ({
        kind: "user" as const,
        id: m.login,
        label: m.login,
        avatar: m.avatar_url,
        sub: m.name ?? undefined,
      }))
      .filter((c) => !prevKeys.has(keyOf(c)));
    const teamRows: Candidate[] = (teams.data ?? []).map((t) => ({
      kind: "team" as const,
      id: t.slug,
      label: t.name,
      sub: t.slug !== t.name ? t.slug : undefined,
      members: t.members.length,
    }));
    return [
      {
        title: "Reviewed before",
        rows: previous
          .map((c) => {
            const m = byLogin.get(c.id.toLowerCase());
            return { ...c, avatar: m?.avatar_url, sub: m?.name ?? undefined };
          })
          .filter(matches),
      },
      { title: "People", rows: people.filter(matches) },
      { title: "Teams", rows: teamRows.filter(matches) },
    ].filter((s) => s.rows.length > 0);
  }, [members.data, teams.data, previous, query, author]);

  const toggle = (c: Candidate) =>
    setPicked((prev) => {
      const next = new Map(prev);
      const k = keyOf(c);
      if (next.has(k)) next.delete(k);
      else next.set(k, { kind: c.kind, id: c.id, label: c.label });
      return next;
    });

  const submit = async () => {
    if (busy || picked.size === 0) return;
    setBusy(true);
    setRefusal(null);
    const reason = await onSubmit([...picked.values()]);
    if (reason === null) return onHide();
    setRefusal(reason);
    setBusy(false);
  };

  const loading = members.data === null && !members.error;
  const title = rerequest ? "Re-request review" : "Request a review";

  return (
    <Modal
      show={show}
      onHide={onHide}
      centered
      scrollable
      fullscreen={phone ? true : undefined}
      className={`rr-modal${phone ? " rr-modal--phone" : ""}`}
      backdropClassName="rr-backdrop"
      aria-labelledby="rr-title"
    >
      <Modal.Header closeButton>
        <div className="rr-head">
          <Modal.Title id="rr-title" as="h2" className="h6 mb-0">
            {title}
          </Modal.Title>
          <div className="rr-pr" title={pr.title}>
            {repoRef(pr)} · {pr.title}
          </div>
        </div>
      </Modal.Header>
      <div className="rr-search">
        <IconSearch size={14} aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people and teams"
          aria-label="Search people and teams"
          autoFocus
        />
        <button
          type="button"
          className="rr-refresh"
          onClick={refreshLists}
          disabled={refreshing}
          aria-label="Refresh people and teams"
          title="Refresh people and teams"
        >
          <IconRefresh size={14} className={refreshing ? "spin" : undefined} aria-hidden="true" />
        </button>
      </div>
      <Modal.Body className="rr-body">
        {members.error && <div className="rr-note">Couldn't load people: {members.error}</div>}
        {teams.error && (
          <div className="rr-note">
            Couldn't load teams: {teams.error}. Listing teams needs org read access on your GitHub
            token.
          </div>
        )}
        {/* GitHub can list no teams, rather than fail, for a token without org read access. */}
        {teams.data?.length === 0 && !query.trim() && (
          <div className="rr-note">
            No teams to show. Listing teams needs org read access on your GitHub token.
          </div>
        )}
        {loading && <div className="rr-note">Loading people and teams…</div>}
        {sections.map((s) => (
          <section key={s.title} aria-label={s.title}>
            <div className="rr-section">{s.title}</div>
            {s.rows.map((c) => {
              const checked = picked.has(keyOf(c));
              return (
                <label key={keyOf(c)} className="rr-row">
                  <input
                    type="checkbox"
                    className="visually-hidden"
                    checked={checked}
                    onChange={() => toggle(c)}
                    aria-label={c.label}
                  />
                  {c.kind === "team" ? (
                    <TeamIcon size={22} />
                  ) : c.avatar ? (
                    <img className="rr-avatar" src={c.avatar} alt="" />
                  ) : (
                    <span className="rr-avatar" aria-hidden="true" />
                  )}
                  <span className="rr-label">
                    {c.label}
                    {c.sub && <span className="rr-sub">{c.sub}</span>}
                  </span>
                  {c.members !== undefined && <span className="rr-members">{c.members}</span>}
                  {checked && <IconCheck size={16} className="rr-check" aria-hidden="true" />}
                </label>
              );
            })}
          </section>
        ))}
        {!loading && sections.length === 0 && (
          <div className="rr-note rr-note--center">
            {query.trim() ? "No matches" : "No one to ask yet"}
          </div>
        )}
      </Modal.Body>
      <Modal.Footer className="rr-foot">
        {refusal && (
          <div className="rr-refusal" role="alert">
            Couldn't request a review: {refusal}
          </div>
        )}
        <span className="rr-count">{picked.size > 0 && `${picked.size} selected`}</span>
        <Button variant="outline-secondary" size="sm" onClick={onHide}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={submit}
          disabled={picked.size === 0 || busy}
          aria-busy={busy || undefined}
        >
          {busy ? "Requesting…" : rerequest ? "Re-request review" : "Request review"}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
