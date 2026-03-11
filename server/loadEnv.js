import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_ROOT = path.resolve(__dirname, "..");

// Load the repo root env first so values like API_KEY are available to the
// server process and inherited by the coding agent the server launches.
dotenv.config({ path: path.join(REPO_ROOT, ".env") });
dotenv.config({ path: path.join(__dirname, ".env") });

