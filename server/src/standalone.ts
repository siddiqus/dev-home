// Entry point for standalone dev usage (yarn dev:server).
// In production, the server is embedded in the Electron main process.
import dotenv from "dotenv";
import path from "path";
import fs from "fs";

const envPath = path.resolve(__dirname, "../../.env");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

import { startServer } from "./index";

startServer();
