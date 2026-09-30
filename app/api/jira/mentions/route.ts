import { nextHandler } from "@server/http/nextHandler";
import { getJiraMentions } from "@server/routes/jira";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = nextHandler(getJiraMentions);
