import { nextHandler } from "@server/http/nextHandler";
import { postTeamDashboard } from "@server/routes/teams";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const POST = nextHandler(postTeamDashboard);
