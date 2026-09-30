import pkg from "../../../package.json";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ status: "ok", version: pkg.version, timestamp: new Date().toISOString() });
}
