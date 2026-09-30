import { nextHandler } from "@server/http/nextHandler";
import { getOrgRepos } from "@server/routes/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = nextHandler(getOrgRepos);
