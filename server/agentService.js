import fs from "node:fs/promises";
import path from "node:path";
import {
  AGENT_DIR,
  WORKSPACE_PATH,
} from "./config.js";
import {
  createAgentSession,
  createCodingTools,
  DefaultResourceLoader,
} from "@mariozechner/pi-coding-agent";

async function loadWorkspacePrompt(workspacePath) {
  const readmePath = path.join(workspacePath, "README.md");

  try {
    const readme = await fs.readFile(readmePath, "utf8");
    const trimmed = readme.trim();
    if (!trimmed) return "";
    return trimmed;
  } catch {
    return "";
  }
}

function normalizeError(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function extractReply(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("");
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function isWorkspaceReady(workspacePath) {
  if (!(await pathExists(workspacePath))) return false;

  const stats = await fs.stat(workspacePath);
  if (!stats.isDirectory()) return false;

  const entries = await fs.readdir(workspacePath);
  if (entries.length === 0) return false;
  return true;
}

export class AgentService {
  constructor({
    workspacePath = WORKSPACE_PATH,
    agentDir = AGENT_DIR,
  } = {}) {
    this.workspacePath = workspacePath;
    this.agentDir = agentDir;
    this.session = null;
    this.busy = false;
    this.warning = null;
    this.initError = null;
    this.initPromise = null;
  }

  async init() {
    if (this.session) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.#initInternal().finally(() => {
      this.initPromise = null;
    });
    return this.initPromise;
  }

  async #initInternal() {
    const workspaceReady = await isWorkspaceReady(this.workspacePath);

    if (!workspaceReady) {
      this.initError =
        `Workspace is missing or empty at ${this.workspacePath}. ` +
        "Add the Pokemon workspace contents there before starting the agent.";
      this.warning = this.initError;
      return;
    }

    await fs.mkdir(this.agentDir, { recursive: true });

    try {
      const appendSystemPrompt = await loadWorkspacePrompt(this.workspacePath);
      const resourceLoader = new DefaultResourceLoader({
        cwd: this.workspacePath,
        agentDir: this.agentDir,
        appendSystemPrompt,
      });

      await resourceLoader.reload();

      const { session, modelFallbackMessage } = await createAgentSession({
        cwd: this.workspacePath,
        agentDir: this.agentDir,
        tools: createCodingTools(this.workspacePath),
        resourceLoader,
      });

      this.session = session;
      this.warning = modelFallbackMessage ?? null;
      this.initError = null;
    } catch (error) {
      this.initError = normalizeError(error);
      this.warning = this.initError;
    }
  }

  async getStatus() {
    await this.init();

    return {
      ok: !this.initError,
      agentReady: Boolean(this.session) && !this.initError,
      busy: this.busy,
      workspacePath: this.workspacePath,
      warning: this.warning,
    };
  }

  async runPrompt(message) {
    const result = await this.streamPrompt(message);
    if (result.ok) {
      return {
        ok: true,
        busy: false,
        reply: result.reply,
        files: result.files,
        warning: result.warning,
        workspacePath: result.workspacePath,
      };
    }

    return result;
  }

  async streamPrompt(message, handlers = {}) {
    await this.init();

    if (!message || !message.trim()) {
      return {
        ok: false,
        busy: this.busy,
        error: "Message is required.",
      };
    }

    if (!this.session) {
      return {
        ok: false,
        busy: this.busy,
        error: this.initError ?? "Agent is not ready.",
        warning: this.warning,
      };
    }

    if (this.busy) {
      return {
        ok: false,
        busy: true,
        error: "The agent is already working on another request.",
        warning: this.warning,
      };
    }

    this.busy = true;
    let reply = "";
    let turnFinished = false;
    const changedFiles = new Set();
    const toolCalls = [];
    const assistantEventTypes = [];
    let lastAssistantStopReason = null;
    let lastAssistantErrorMessage = null;
    let lastAssistantContent = [];

    const unsubscribe = this.session.subscribe((event) => {
      if (event.type === "message_update") {
        assistantEventTypes.push(event.assistantMessageEvent.type);

        if (event.assistantMessageEvent.partial?.content) {
          lastAssistantContent = event.assistantMessageEvent.partial.content;
        }

        if (event.assistantMessageEvent.partial?.stopReason) {
          lastAssistantStopReason = event.assistantMessageEvent.partial.stopReason;
        }

        if (event.assistantMessageEvent.type === "text_delta") {
          reply += event.assistantMessageEvent.delta;
          handlers.onTextDelta?.(event.assistantMessageEvent.delta);
        }

        if (event.assistantMessageEvent.type === "done") {
          lastAssistantStopReason = event.assistantMessageEvent.message.stopReason;
          lastAssistantContent = event.assistantMessageEvent.message.content;
        }

        if (event.assistantMessageEvent.type === "error") {
          lastAssistantStopReason = event.assistantMessageEvent.error.stopReason;
          lastAssistantErrorMessage = event.assistantMessageEvent.error.errorMessage ?? null;
          lastAssistantContent = event.assistantMessageEvent.error.content;
        }
      }

      if (event.type === "tool_execution_start") {
        toolCalls.push({
          id: event.toolCallId,
          name: event.toolName,
          status: "running",
          args: event.args,
        });

        if ((event.toolName === "edit" || event.toolName === "write") && event.args?.path) {
          changedFiles.add(event.args.path);
        }

        handlers.onToolStart?.({
          id: event.toolCallId,
          name: event.toolName,
          args: event.args,
        });
      }

      if (event.type === "tool_execution_update") {
        handlers.onToolUpdate?.({
          id: event.toolCallId,
          name: event.toolName,
          args: event.args,
          partialResult: event.partialResult,
        });
      }

      if (event.type === "tool_execution_end") {
        const existingTool = toolCalls.find((tool) => tool.id === event.toolCallId);
        if (existingTool) {
          existingTool.status = event.isError ? "error" : "done";
          existingTool.result = event.result;
        }

        handlers.onToolEnd?.({
          id: event.toolCallId,
          name: event.toolName,
          result: event.result,
          isError: event.isError,
        });
      }

      if (event.type === "message_end" && event.message?.role === "assistant") {
        lastAssistantStopReason = event.message.stopReason;
        lastAssistantErrorMessage = event.message.errorMessage ?? null;
        lastAssistantContent = event.message.content;
        const extractedReply = extractReply(event.message.content);
        if (!reply && extractedReply) reply = extractedReply;
      }

      if (event.type === "agent_end") {
        turnFinished = true;
        handlers.onAgentEnd?.();
      }
    });

    try {
      await this.session.prompt(message.trim());

      if (!reply.trim()) {
        const diagnostic = {
          assistantEventTypes,
          stopReason: lastAssistantStopReason,
          errorMessage: lastAssistantErrorMessage,
          contentTypes: lastAssistantContent.map((item) => item.type),
        };
        const result = {
          ok: false,
          busy: false,
          error: `Agent completed without returning assistant text. ${JSON.stringify(diagnostic)}`,
          files: [...changedFiles],
          toolCalls,
          warning: this.warning,
          workspacePath: this.workspacePath,
        };
        handlers.onError?.(result);
        return result;
      }

      const result = {
        ok: true,
        busy: false,
        reply: reply.trim(),
        files: [...changedFiles],
        toolCalls,
        warning: this.warning,
        workspacePath: this.workspacePath,
      };
      handlers.onDone?.(result);
      return result;
    } catch (error) {
      const result = {
        ok: false,
        busy: false,
        error: normalizeError(error),
        warning: this.warning,
        files: [...changedFiles],
        toolCalls,
      };
      handlers.onError?.(result);
      return result;
    } finally {
      unsubscribe();
      this.busy = false;
    }
  }
}
