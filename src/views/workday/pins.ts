import type { GitHubPR } from "../../types";

/** Focus pins are stored as "pr:<html_url>" or "ticket:<KEY>". */
export const PINS_KEY = "dev-home-workday-pins";

export const prPin = (pr: GitHubPR) => `pr:${pr.html_url}`;
export const ticketPin = (key: string) => `ticket:${key}`;
