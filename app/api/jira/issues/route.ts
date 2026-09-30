import { nextHandler } from "@server/http/nextHandler";
import { getIssues } from "@server/routes/jira";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const GET = nextHandler(getIssues);
