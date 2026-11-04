import { useContext, useState } from "react";
import type { GitHubPR } from "../types";
import { MergeContext, useCanApprove } from "../context/MergeContext";
import { repoRef } from "../views/workday/prState";
import { Badge } from "./primitives/Badge";
import "./MergeButton.css";

/** The Approve button on PRs I review; nothing on PRs it doesn't apply to. */
export function ApproveButton({ pr }: { pr: GitHubPR }) {
  return useCanApprove(pr) ? <ApproveControl pr={pr} /> : null;
}

/** Merge's look, without its caret; approves after an "are you sure" confirm. */
function ApproveControl({ pr }: { pr: GitHubPR }) {
  const api = useContext(MergeContext)!;
  const [busy, setBusy] = useState(false);

  if (api.approved.has(pr.html_url)) {
    return (
      <Badge variant="success">
        <span aria-hidden="true">✓ </span>
        <span>Approved</span>
      </Badge>
    );
  }

  const onClick = async () => {
    if (busy) return;
    if (!window.confirm(`Are you sure you want to approve this PR?\n\n${repoRef(pr)} ${pr.title}`))
      return;
    setBusy(true);
    if (!(await api.approve(pr))) setBusy(false);
  };

  return (
    <span className={`merge-btn${busy ? " merge-btn--busy" : ""}`}>
      <button
        type="button"
        className="merge-btn-main"
        aria-busy={busy || undefined}
        onClick={onClick}
      >
        {busy ? (
          "Approving…"
        ) : (
          <>
            <span aria-hidden="true">✓ </span>Approve
          </>
        )}
      </button>
    </span>
  );
}
