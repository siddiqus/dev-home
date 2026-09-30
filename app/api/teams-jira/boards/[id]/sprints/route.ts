import { nextHandler } from "@server/http/nextHandler";
import { getBoardSprints } from "@server/routes/teamsJira";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = nextHandler(getBoardSprints);
