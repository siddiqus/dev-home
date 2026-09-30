import { nextHandler } from "@server/http/nextHandler";
import { searchUsers } from "@server/routes/teamsJira";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = nextHandler(searchUsers);
