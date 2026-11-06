import { useContext, type MouseEvent, type ReactNode, type SyntheticEvent } from "react";
import { IconUserPlus } from "@tabler/icons-react";
import type { GitHubPR } from "../types";
import { MergeContext, useReviewStep } from "../context/MergeContext";
import { blurOnPointer } from "../views/workday/pointer";
import { Badge } from "./primitives/Badge";
import "./RequestReview.css";

/** The button sits in clickable rows: its clicks and keys stay its own. */
const stop = (e: SyntheticEvent) => e.stopPropagation();

/**
 * The button that takes the "Request a review" / "Re-request review" chip's
 * place on my own PRs and opens the reviewer picker; `fallback` (the chip)
 * everywhere else.
 */
export function RequestReviewButton({ pr, fallback }: { pr: GitHubPR; fallback: ReactNode }) {
  const step = useReviewStep(pr);
  const api = useContext(MergeContext);
  if (!step || !api) return <>{fallback}</>;

  // Asked from here, and the list hasn't refreshed since: say so instead of asking again.
  if (api.reviewRequested.get(pr.html_url) === pr.updated_at) {
    return (
      <Badge variant="success">
        <span aria-hidden="true">✓ </span>
        <span>Review requested</span>
      </Badge>
    );
  }

  const onClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    // Drop pointer focus, so the deck's next Enter can't press this again.
    blurOnPointer(e);
    api.openReviewRequest(pr);
  };

  return (
    <button type="button" className="review-req-btn" onClick={onClick} onKeyDown={stop}>
      <IconUserPlus size={12} stroke={2.2} aria-hidden="true" />
      {step === "rerequest" ? "Re-request review" : "Request a review"}
    </button>
  );
}
