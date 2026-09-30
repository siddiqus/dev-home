import { nextHandler } from "@server/http/nextHandler";
import { getOrgMembers } from "@server/routes/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = nextHandler(getOrgMembers);
