import { nextHandler } from "@server/http/nextHandler";
import { getGithubMentions } from "@server/routes/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const GET = nextHandler(getGithubMentions);
