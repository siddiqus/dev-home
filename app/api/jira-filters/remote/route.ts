import { nextHandler } from "@server/http/nextHandler";
import { getRemoteFilters } from "@server/routes/jiraFilters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = nextHandler(getRemoteFilters);
