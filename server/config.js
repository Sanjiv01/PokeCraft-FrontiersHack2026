/* global process */
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const SERVER_PORT = Number(process.env.PORT || 3001);
export const REPO_ROOT = path.resolve(__dirname, "..");
export const WORKSPACE_PATH = path.resolve(__dirname, "workspace");
export const AGENT_DIR = path.resolve(__dirname, ".pi");
