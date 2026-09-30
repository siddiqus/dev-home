import { nextHandler } from "@server/http/nextHandler";
import { searchBoards } from "@server/routes/teamsJira";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = nextHandler(searchBoards);
