import {
  createContext,
  useContext,
  type MouseEvent,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import { IconUserPlus } from "@tabler/icons-react";
import type { GitHubPR } from "../types";
import { MergeContext, useCanRequestReview, useReviewStep } from "../context/MergeContext";
import { blurOnPointer } from "../views/workday/pointer";
import { repoRef } from "../views/workday/prState";
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
  return <RequestReviewControl pr={pr} rerequest={step === "rerequest"} />;
}

/**
 * The PR modal's Request a review on any open, non-draft PR, mine or anyone's,
 * whatever its next step (failing CI included). Nothing where the step chip is
 * already the Request review button.
 */
export function ModalRequestReviewButton({ pr }: { pr: GitHubPR }) {
  const step = useReviewStep(pr);
  const can = useCanRequestReview(pr);
  return can && !step ? <RequestReviewControl pr={pr} rerequest={false} /> : null;
}

/** Whether PR rows show RequestReviewIcon: on in PR search's results only. */
export const RequestReviewIconContext = createContext(false);

/**
 * An add-reviewer icon beside a row's copy / open-on-GitHub icons, under
 * RequestReviewIconContext: opens the picker (a plain request) on any PR the
 * PR modal's Request a review would take.
 */
export function RequestReviewIcon({
  pr,
  className,
  size = 13,
}: {
  pr: GitHubPR;
  className: string;
  size?: number;
}) {
  const on = useContext(RequestReviewIconContext);
  const can = useCanRequestReview(pr);
  const api = useContext(MergeContext);
  if (!on || !can || !api) return null;
  const onClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    blurOnPointer(e);
    api.openReviewRequest(pr);
  };
  return (
    <button
      type="button"
      className={className}
      title="Request a review"
      aria-label={`Request a review on ${repoRef(pr)}`}
      onClick={onClick}
      onKeyDown={stop}
    >
      <IconUserPlus size={size} stroke={1.8} aria-hidden="true" />
    </button>
  );
}

function RequestReviewControl({ pr, rerequest }: { pr: GitHubPR; rerequest: boolean }) {
  const api = useContext(MergeContext)!;

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
    api.openReviewRequest(pr, rerequest);
  };

  return (
    <button type="button" className="review-req-btn" onClick={onClick} onKeyDown={stop}>
      <IconUserPlus size={12} stroke={2.2} aria-hidden="true" />
      {rerequest ? "Re-request review" : "Request a review"}
    </button>
  );
}
