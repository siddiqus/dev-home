import { nextHandler } from "@server/http/nextHandler";
import { postJqlSearch } from "@server/routes/jiraFilters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = nextHandler(postJqlSearch);
