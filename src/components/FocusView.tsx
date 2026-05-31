import { useState } from "react";
import {
  IconTarget,
  IconPin,
  IconPinFilled,
  IconClock,
  IconExternalLink,
  IconAlertTriangle,
  IconAt,
  IconGitPullRequest,
  IconSubtask,
  IconNotes,
  IconEye,
} from "@tabler/icons-react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import ButtonGroup from "react-bootstrap/ButtonGroup";
import Dropdown from "react-bootstrap/Dropdown";
import Badge from "react-bootstrap/Badge";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Popover from "react-bootstrap/Popover";
import {
  snoozePresets,
  type RankedFocusItem,
  type FocusItem,
  type FocusKind,
} from "../services/focus";
import { type FocusGroups } from "../hooks/useFocus";

interface Props {
  groups: FocusGroups;
  loading: boolean;
  offline: boolean;
  onPin: (itemId: string, pinned: boolean) => void;
  onSnooze: (itemId: string, until: number | null) => void;
}

const KIND_ICON: Record<FocusKind, typeof IconTarget> = {
  "pr-mine": IconGitPullRequest,
  "pr-review": IconEye,
  jira: IconSubtask,
  mention: IconAt,
  note: IconNotes,
};

function FocusRow({
  item,
  onPin,
  onSnooze,
}: {
  item: RankedFocusItem | FocusItem;
  onPin: Props["onPin"];
  onSnooze: Props["onSnooze"];
}) {
  const Icon = KIND_ICON[item.kind];
  const presets = snoozePresets();
  const isPinned = item.signals.isPinned;
  return (
    <div className="d-flex align-items-center gap-2 py-2 border-bottom small">
      <Icon size={16} className="flex-shrink-0 text-muted" />
      <div className="flex-grow-1 text-truncate">
        {item.url ? (
          <a href={item.url} target="_blank" rel="noreferrer" className="text-reset">
            {item.title}
          </a>
        ) : (
          item.title
        )}
        <div className="d-flex gap-1 mt-1">
          {Math.floor(item.signals.ageDays) > 0 && (
            <Badge bg="light" text="dark" className="fw-normal">
              age {Math.floor(item.signals.ageDays)}d
            </Badge>
          )}
          {item.signals.ciFailing && (
            <Badge bg="danger" className="fw-normal">
              <IconAlertTriangle size={10} /> CI
            </Badge>
          )}
          {item.signals.jiraPriority && (
            <Badge bg="secondary" className="fw-normal">
              {item.signals.jiraPriority}
            </Badge>
          )}
          {item.signals.isMention && (
            <Badge bg="info" className="fw-normal">
              mention
            </Badge>
          )}
          {item.signals.isReviewRequested && (
            <Badge bg="warning" text="dark" className="fw-normal">
              review
            </Badge>
          )}
        </div>
      </div>
      <ButtonGroup size="sm">
        <Button
          variant={isPinned ? "primary" : "outline-secondary"}
          onClick={() => onPin(item.id, !isPinned)}
          title={isPinned ? "Unpin" : "Pin to top"}
        >
          {isPinned ? <IconPinFilled size={12} /> : <IconPin size={12} />}
        </Button>
        <Dropdown as={ButtonGroup}>
          <Dropdown.Toggle variant="outline-secondary" size="sm" title="Snooze">
            <IconClock size={12} />
          </Dropdown.Toggle>
          <Dropdown.Menu>
            {presets.map((p) => (
              <Dropdown.Item
                key={p.label}
                onClick={() => {
                  if (p.until !== null) onSnooze(item.id, p.until);
                  else {
                    const input = window.prompt("Snooze until (YYYY-MM-DD HH:mm)");
                    if (!input) return;
                    const t = new Date(input).getTime();
                    if (!Number.isFinite(t)) {
                      window.alert("Could not parse date");
                      return;
                    }
                    onSnooze(item.id, t);
                  }
                }}
              >
                {p.label}
              </Dropdown.Item>
            ))}
            {item.signals.snoozedUntil && (
              <>
                <Dropdown.Divider />
                <Dropdown.Item onClick={() => onSnooze(item.id, null)}>Un-snooze</Dropdown.Item>
              </>
            )}
          </Dropdown.Menu>
        </Dropdown>
        {item.url && (
          <Button
            variant="outline-secondary"
            href={item.url}
            target="_blank"
            rel="noreferrer"
            title="Open"
          >
            <IconExternalLink size={12} />
          </Button>
        )}
      </ButtonGroup>
    </div>
  );
}

const whyPopover = (
  <Popover>
    <Popover.Header>How items are ranked</Popover.Header>
    <Popover.Body className="small">
      <strong>Base score</strong> by kind: review-requested PR 50, mention 45, JIRA 10–60 by
      priority, your PR 30, note 20.
      <br />
      <strong>+ age × 2</strong> (capped at +40), <strong>+30</strong> if CI failing on your PR,
      <strong> +1000</strong> if pinned.
    </Popover.Body>
  </Popover>
);

export function FocusView({ groups, loading, offline, onPin, onSnooze }: Props) {
  const [snoozedOpen, setSnoozedOpen] = useState(false);

  const totalActive = groups.pinned.length + groups.topPriority.length + groups.rest.length;

  if (loading && totalActive === 0) {
    return <div className="text-muted small p-3">Loading…</div>;
  }

  if (totalActive === 0 && groups.snoozed.length === 0) {
    return (
      <div className="text-center text-muted p-5">
        <IconTarget size={48} className="mb-2" />
        <div>Nothing urgent. 🎯</div>
      </div>
    );
  }

  return (
    <div>
      <div className="d-flex align-items-center gap-2 mb-3">
        <IconTarget size={20} />
        <h5 className="mb-0">Focus</h5>
        <span className="text-muted small">({totalActive})</span>
        <OverlayTrigger trigger="click" placement="bottom" overlay={whyPopover} rootClose>
          <Button variant="link" size="sm" className="text-muted ms-auto">
            Why these?
          </Button>
        </OverlayTrigger>
      </div>

      {offline && (
        <Alert variant="warning" className="small py-2">
          Saved locally — will sync when backend reconnects.
        </Alert>
      )}

      <section>
        <h6 className="text-uppercase text-muted small">📌 Pinned ({groups.pinned.length})</h6>
        {groups.pinned.length === 0 ? (
          <div className="text-muted small py-2">Pin items you want to focus on today.</div>
        ) : (
          groups.pinned.map((i) => (
            <FocusRow key={i.id} item={i} onPin={onPin} onSnooze={onSnooze} />
          ))
        )}
      </section>

      {groups.topPriority.length > 0 && (
        <section className="mt-3">
          <h6 className="text-uppercase text-muted small">🔥 Top priority</h6>
          {groups.topPriority.map((i) => (
            <FocusRow key={i.id} item={i} onPin={onPin} onSnooze={onSnooze} />
          ))}
        </section>
      )}

      {groups.rest.length > 0 && (
        <section className="mt-3">
          <h6 className="text-uppercase text-muted small">Everything else</h6>
          {groups.rest.map((i) => (
            <FocusRow key={i.id} item={i} onPin={onPin} onSnooze={onSnooze} />
          ))}
        </section>
      )}

      {groups.snoozed.length > 0 && (
        <section className="mt-3">
          <Button
            variant="link"
            size="sm"
            className="text-muted ps-0"
            onClick={() => setSnoozedOpen((o) => !o)}
          >
            💤 Snoozed ({groups.snoozed.length}) {snoozedOpen ? "▾" : "▸"}
          </Button>
          {snoozedOpen &&
            groups.snoozed.map((i) => (
              <FocusRow key={i.id} item={i} onPin={onPin} onSnooze={onSnooze} />
            ))}
        </section>
      )}
    </div>
  );
}
