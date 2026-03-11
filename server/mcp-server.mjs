import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXPRESS_BASE = "http://localhost:3001";
const ROM_DIR = path.join(__dirname, "..", "roms");

const server = new McpServer({
  name: "pokecraft",
  version: "1.0.0",
});

// Helper: POST to Express
async function postChat(body) {
  const res = await fetch(`${EXPRESS_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

// Helper: GET from Express
async function getJson(path_) {
  const res = await fetch(`${EXPRESS_BASE}${path_}`);
  return res.json();
}

server.tool(
  "get_rom_info",
  "Returns info about the currently loaded ROM file",
  {},
  async () => {
    const data = await getJson("/api/rom/info");
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

server.tool(
  "replace_rom",
  "Copy a local .gba file into roms/game.gba",
  { file_path: z.string().describe("Absolute path to the .gba file to load") },
  async ({ file_path }) => {
    if (!fs.existsSync(file_path)) {
      return {
        content: [{ type: "text", text: `Error: file not found: ${file_path}` }],
        isError: true,
      };
    }
    if (!file_path.toLowerCase().endsWith(".gba")) {
      return {
        content: [{ type: "text", text: "Error: file must have a .gba extension" }],
        isError: true,
      };
    }
    if (!fs.existsSync(ROM_DIR)) fs.mkdirSync(ROM_DIR, { recursive: true });
    const dest = path.join(ROM_DIR, "game.gba");
    fs.copyFileSync(file_path, dest);
    const stats = fs.statSync(dest);
    return {
      content: [
        {
          type: "text",
          text: `ROM replaced: ${dest} (${stats.size} bytes)`,
        },
      ],
    };
  }
);

server.tool(
  "send_message",
  "Send a message to the PokeCraft chat UI via SSE",
  {
    text: z.string().describe("Message text to display"),
    files: z
      .array(z.string())
      .optional()
      .describe("Optional list of file paths to show as chips"),
  },
  async ({ text, files }) => {
    const data = await postChat({ role: "assistant", text, files });
    return {
      content: [{ type: "text", text: `Message delivered: ${JSON.stringify(data)}` }],
    };
  }
);

server.tool(
  "get_chat_history",
  "Retrieve recent chat messages from the PokeCraft UI",
  {
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe("Max number of messages to return (default 20)"),
  },
  async ({ limit = 20 }) => {
    const data = await getJson(`/api/history?limit=${limit}`);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
