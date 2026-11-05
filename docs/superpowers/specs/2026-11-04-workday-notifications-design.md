# Workday notifications

Date: 2026-11-04 · Status: **parked**. Decisions below are agreed. Picked up after the API call
reduction (`2026-11-04-api-call-reduction-design.md`) lands. The open questions get settled, and
the implementation plan written, then.

## Goal

Tell me when something on my Workday needs me, without opening the page, and keep a list of what
happened in the last 24 hours. Only actionable changes count, not every change, and this must
cost (almost) no extra API calls.

## Agreed

- **Delivery:** a bell in the top bar, right side, with an unread count and a list panel. Each new
  event also fires a desktop notification (browser `Notification`, permission already handled in
  Settings → `NotificationsStatus`). Desktop pop-ups work while the Dev Home tab is hidden.
- **Events (actionable only):**
  - **Review asks:** someone requests my review, or re-requests it.
  - **Comments & mentions:** new comments or mentions on my PRs, grouped per PR ("3 new comments on
    repo#123"). New Jira mentions on my tickets.
  - **Review outcomes on my PRs:** approved, changes requested, ready to merge, merged by someone
    else.
  - **Out:** CI results, merge conflicts, labels, pushes, and everything else.
- **Retention:** 24 hours, in localStorage, synced across tabs through the `storage` event (the
  `commentsRead` store pattern).
- **Catch-up after the app was closed:** compare against the last saved snapshot (if under 24 h
  old). Missed events go into the bell quietly. At most one summary pop-up, e.g. "5 updates while
  you were away".

## Approach

- **Events come from diffs:** a pure `diffWorkday(prev, next)` over a small normalized snapshot.
  Per PR it records review-requested, re-review, review state / approvals and ready-to-merge. It
  also records the IDs of my GitHub mentions and the IDs of my Jira mentions. The output is typed
  events. The snapshot is saved, which is what makes catch-up work.
- **No extra polling of the big sources.** GitHub's notifications endpoint is the doorbell. A
  conditional request (`If-Modified-Since`) answers 304 when nothing changed, and a 304 doesn't
  count against the rate limit. GitHub suggests the poll interval (`X-Poll-Interval`, usually 60 s).
  - Poll it every couple of minutes, including while the tab is hidden.
  - Only when it returns new threads with an actionable reason (`review_requested`, `mention`,
    `team_mention`, `author`, `comment`, `state_change`), refetch the one source that changed (my
    PRs or reviews), then diff.
  - Jira mentions and "new commits since my review" re-reviews have no doorbell. They're found on
    the normal 10-minute poll.
  - Reuses the mentions source's persisted notification cache from API-reduction cut 5.
- **One tab does the work.** A Web Locks (`navigator.locks`) leader polls the doorbell and fires
  pop-ups. The other tabs only read the store.
- **Merged by someone else** shows up as my PR leaving `openPRs`. It's confirmed against the shared
  60-day merged list (API-reduction cut 2), with no per-PR fetch.

## Open questions (settle when picked up)

1. **Bell panel layout.** Show 2–3 browser mockups first (house rule). Row anatomy, grouping
   (by PR? by time?), empty state, phone.
2. **Clicking a notification.** Follow the links-not-rows rule: the key opens the Jira drawer and
   repo#PR opens the PR modal. Decide whether a desktop pop-up click focuses the tab and opens the
   same modal.
3. **Read state.** Does opening the panel mark everything read, or does each item clear on click?
   Does acting on the thing (submitting the review) clear it?
4. **Settings toggle** to turn the doorbell polling and pop-ups off.
5. **Doorbell cadence while hidden.** Respect `X-Poll-Interval`. Browsers throttle hidden-tab
   timers to about once a minute, which is fine.
