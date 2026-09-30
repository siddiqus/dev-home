import { nextHandler } from "@server/http/nextHandler";
import { postIssuesBulk } from "@server/routes/jira";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = nextHandler(postIssuesBulk);
