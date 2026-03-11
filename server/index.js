import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import "./loadEnv.js";
import { generateImage, generateAllSprites } from "./imageGenerator.js";
import { AgentService } from "./agentService.js";
import { REPO_ROOT, SERVER_PORT, WORKSPACE_PATH } from "./config.js";

const app = express();
const agentService = new AgentService();
const PUBLIC_DIR = path.join(REPO_ROOT, "public");

// In-memory chat store (capped at 100 messages)
const messages = [];
const clients = new Set();
const VALID_BUTTONS = new Set([
  "UP",
  "DOWN",
  "LEFT",
  "RIGHT",
  "A",
  "B",
  "START",
  "SELECT",
  "L",
  "R",
]);

function broadcast(event, data) {
  for (const c of clients) {
    c.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }
}

function findRom() {
    if (!fs.existsSync(WORKSPACE_PATH)) return null;
    const queue = [WORKSPACE_PATH];
    while (queue.length > 0) {
        const currentPath = queue.shift();
        const entries = fs.readdirSync(currentPath, { withFileTypes: true });
        for (const entry of entries) {
            const entryPath = path.join(currentPath, entry.name);
            if (entry.isDirectory()) {
                if (entry.name === ".git" || entry.name === "node_modules") continue;
                queue.push(entryPath);
                continue;
            }
            if (entry.isFile() && entry.name.toLowerCase() === "pokefirered.gba") {
                return entryPath;
            }
        }
    }
    return null;
}

app.use(cors());
app.use(express.json({ limit: "32mb" }));

// ─── SSE endpoint — React subscribes here ───
app.get("/api/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  clients.add(res);
  req.on("close", () => clients.delete(res));
});

// ─── Agent / Chat routes ───
app.get("/api/status", async (_req, res) => {
    const status = await agentService.getStatus();
    res.status(status.ok ? 200 : 503).json(status);
});

// Chat message endpoint — agent posts here, UI reads via SSE
app.post("/api/chat", (req, res) => {
  const { role, text, files } = req.body;
  if (!role || !text) {
    return res.status(400).json({ error: "role and text are required" });
  }
  const msg = { role, text, ...(files ? { files } : {}), ts: Date.now() };
  messages.push(msg);
  if (messages.length > 100) messages.shift();
  broadcast("chat", msg);
  res.json({ ok: true });
});

app.post("/api/emulator/input", (req, res) => {
  const commandsInput = Array.isArray(req.body?.commands)
    ? req.body.commands
    : req.body?.button
      ? [{ button: req.body.button }]
      : [];

  const commands = commandsInput
    .map((command) => ({
      button: String(command?.button ?? "").trim().toUpperCase(),
      durationMs: Math.max(20, Math.min(Number(command?.durationMs ?? 120), 5000)),
      gapMs: Math.max(0, Math.min(Number(command?.gapMs ?? 60), 5000)),
    }))
    .filter((command) => VALID_BUTTONS.has(command.button));

  if (commands.length === 0) {
    return res.status(400).json({
      ok: false,
      error: "Provide button or commands with one of: UP, DOWN, LEFT, RIGHT, A, B, START, SELECT, L, R.",
    });
  }

  const payload = {
    commands,
    source: "api",
    issuedAt: Date.now(),
  };
  broadcast("emulator_input", payload);
  res.json({ ok: true, accepted: commands.length, commands });
});

// Chat history endpoint — agent reads context here
app.get("/api/history", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  res.json(messages.slice(-limit));
});

app.post("/api/chat/stream", async (req, res) => {
    const message = req.body?.message ?? "";
    if (!message.trim()) {
        return res.status(400).json({ ok: false, error: "Message is required." });
    }

    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const sendEvent = (event) => {
        res.write(`${JSON.stringify(event)}\n`);
    };

    sendEvent({ type: "start" });

    try {
        const result = await agentService.streamPrompt(message, {
            onTextDelta(delta) {
                sendEvent({ type: "delta", delta });
            },
            onToolStart(tool) {
                sendEvent({ type: "tool_start", tool });
            },
            onToolUpdate(tool) {
                sendEvent({ type: "tool_update", tool });
            },
            onToolEnd(tool) {
                sendEvent({ type: "tool_end", tool });
            },
        });

        if (result.ok) {
            sendEvent({
                type: "done",
                reply: result.reply,
                files: result.files,
                warning: result.warning,
                workspacePath: result.workspacePath,
                toolCalls: result.toolCalls,
            });
        } else {
            sendEvent({
                type: "error",
                error: result.error,
                files: result.files ?? [],
                warning: result.warning ?? null,
                workspacePath: result.workspacePath ?? null,
                toolCalls: result.toolCalls ?? [],
                busy: result.busy ?? false,
            });
        }
    } catch (error) {
        console.error("Streaming chat endpoint failed", error);
        sendEvent({
            type: "error",
            error: error instanceof Error ? error.message : String(error),
            files: [],
            warning: null,
            workspacePath: null,
            toolCalls: [],
            busy: false,
        });
    }

    res.end();
});

// ─── ROM routes (teammate's) ───
app.get("/api/rom", (_req, res) => {
    const romPath = findRom();
    if (!romPath) return res.status(404).json({ error: "No ROM loaded" });
    const stats = fs.statSync(romPath);
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Length", stats.size);
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.sendFile(romPath);
});

app.get("/api/rom/info", (_req, res) => {
    const romPath = findRom();
    if (!romPath) return res.json({ exists: false });
    const stats = fs.statSync(romPath);
    return res.json({
        exists: true,
        size: stats.size,
        lastModified: stats.mtime.toISOString(),
    });
});

app.post(
    "/api/rom/upload",
    express.raw({ type: "application/octet-stream", limit: "32mb" }),
    (req, res) => {
        const romPath = findRom();
        if (!romPath) return res.status(404).json({ error: "Workspace ROM not found" });
        fs.writeFileSync(romPath, req.body);
        return res.json({ success: true, size: req.body.length });
    },
);

app.post("/api/images/generate", async (req, res) => {
    const { prompt, outputPath } = req.body;
    if (!prompt) return res.status(400).json({ error: "prompt is required" });
    try {
        const result = await generateImage(prompt, { outputPath });
        res.json({ success: true, ...result });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post("/api/sprites/generate", async (req, res) => {
    const { description, outputDir } = req.body;
    if (!description) return res.status(400).json({ error: "description is required" });
    try {
        const result = await generateAllSprites(description, outputDir);
        res.json({ success: true, ...result });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: err.message });
    }
});

app.use("/workspace-files", express.static(WORKSPACE_PATH));
app.use(express.static(PUBLIC_DIR));

app.listen(SERVER_PORT, async () => {
    await agentService.init();
    console.log(`PokeCraft server listening on http://localhost:${SERVER_PORT}`);
});
