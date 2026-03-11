import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Building2,
  LoaderCircle,
  FileCode2,
  HeartPulse,
  Leaf,
  Map,
  Send,
  Swords,
  Trees,
  Trophy,
  Wrench,
  Zap,
} from "lucide-react";

const SUGGESTIONS = [
  { text: "Add a forest map with wild Pikachu spawns", icon: Trees },
  { text: "Create an NPC nurse that heals your team", icon: HeartPulse },
  { text: "Add a rival battle at Route 3", icon: Swords },
  { text: "Create a Pokémon Center with a healing station", icon: Building2 },
  { text: "Add tall grass with random encounters", icon: Leaf },
  { text: "Create a gym leader with 3 Pokémon", icon: Trophy },
];

const INITIAL_STATUS = {
  ok: false,
  agentReady: false,
  busy: false,
  workspacePath: "",
  warning: null,
};

const INITIAL_ROM_INFO = {
  exists: false,
  lastModified: null,
};

function summarizeText(text, maxLength = 140) {
  if (!text) return "";
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 1)}…`;
}

function extractToolText(value) {
  if (!value || typeof value !== "object") return "";
  if (Array.isArray(value.content)) {
    const textParts = value.content
      .filter((item) => item?.type === "text" && typeof item.text === "string")
      .map((item) => item.text);
    if (textParts.length > 0) return textParts.join("\n");
  }
  if (typeof value.text === "string") return value.text;
  return "";
}

function summarizePathList(text) {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return "";
  if (lines.length === 1) return summarizeText(lines[0], 120);
  const preview = lines.slice(0, 2).join(" • ");
  return `${summarizeText(preview, 120)} +${lines.length - 2} more`;
}

function formatToolResult(toolName, value) {
  const text = extractToolText(value);
  if (!text) return formatToolPreview(value);

  if (toolName === "bash" || toolName === "find" || toolName === "ls" || toolName === "grep") {
    return summarizePathList(text);
  }

  if (toolName === "read") {
    return summarizeText(text, 160);
  }

  return summarizeText(text, 140);
}

function normalizeErrorMessage(error, fallback) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return fallback;
}

function formatToolPreview(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value !== "object") return String(value);

  if (typeof value.path === "string") return value.path;
  if (typeof value.command === "string") return value.command;
  if (typeof value.description === "string") return value.description;

  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function createAssistantEntry(overrides = {}) {
  return {
    role: "assistant",
    text: "",
    files: [],
    streaming: true,
    error: false,
    ...overrides,
  };
}

export default function App() {
  const [prompt, setPrompt] = useState("");
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(INITIAL_STATUS);
  const [romInfo, setRomInfo] = useState(INITIAL_ROM_INFO);
  const [emulatorVersion, setEmulatorVersion] = useState(0);
  const emulatorFrameRef = useRef(null);
  const emulatorReadyRef = useRef(false);
  const pendingEmulatorCommandsRef = useRef([]);
  const textareaRef = useRef(null);
  const historyEndRef = useRef(null);

  useEffect(() => {
    if (historyEndRef.current) {
      historyEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [history, loading]);

  useEffect(() => {
    let cancelled = false;

    async function loadStatus() {
      try {
        const response = await fetch("/api/status");
        const data = await response.json();
        if (!cancelled) {
          setStatus(data);
        }
      } catch (error) {
        console.error("Failed to load status", error);
        if (!cancelled) {
          setStatus({
            ...INITIAL_STATUS,
            warning: normalizeErrorMessage(
              error,
              "Backend unavailable. Start the server in /server to enable editing.",
            ),
          });
        }
      }
    }

    loadStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadRomInfo() {
      try {
        const response = await fetch("/api/rom/info");
        const data = await response.json();
        if (!cancelled) {
          setRomInfo({
            exists: Boolean(data.exists),
            lastModified: data.lastModified ?? null,
          });
        }
      } catch (error) {
        console.error("Failed to load ROM info", error);
        if (!cancelled) {
          setRomInfo(INITIAL_ROM_INFO);
        }
      }
    }

    loadRomInfo();
    return () => {
      cancelled = true;
    };
  }, [emulatorVersion]);

  useEffect(() => {
    function flushPendingCommands() {
      if (!emulatorReadyRef.current || !emulatorFrameRef.current?.contentWindow) return;
      while (pendingEmulatorCommandsRef.current.length > 0) {
        const commands = pendingEmulatorCommandsRef.current.shift();
        emulatorFrameRef.current.contentWindow.postMessage(
          { type: "pokecraft-emulator-input", commands },
          "http://localhost:3001",
        );
      }
    }

    function sendCommandsToEmulator(commands) {
      if (!Array.isArray(commands) || commands.length === 0) return;
      if (!emulatorReadyRef.current || !emulatorFrameRef.current?.contentWindow) {
        pendingEmulatorCommandsRef.current.push(commands);
        return;
      }

      emulatorFrameRef.current.contentWindow.postMessage(
        { type: "pokecraft-emulator-input", commands },
        "http://localhost:3001",
      );
    }

    function handleWindowMessage(event) {
      if (event.origin !== "http://localhost:3001") return;
      if (event.data?.type === "pokecraft-emulator-ready") {
        emulatorReadyRef.current = true;
        flushPendingCommands();
      }
    }

    const eventSource = new EventSource("/api/events");
    eventSource.addEventListener("emulator_input", (event) => {
      try {
        const payload = JSON.parse(event.data);
        sendCommandsToEmulator(payload.commands);
      } catch (error) {
        console.error("Failed to parse emulator input event", error);
      }
    });
    eventSource.onerror = (error) => {
      console.error("Event stream connection failed", error);
    };

    window.addEventListener("message", handleWindowMessage);

    return () => {
      eventSource.close();
      window.removeEventListener("message", handleWindowMessage);
    };
  }, []);

  const handleSubmit = async () => {
    if (!prompt.trim() || loading) return;
    const text = prompt.trim();
    setPrompt("");
    setLoading(true);
    setStatus((current) => ({ ...current, busy: true }));
    setHistory((messages) => [...messages, { role: "user", text }]);

    try {
      const response = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });

      if (!response.ok || !response.body) {
        const responseText = await response.text();
        let data = {};
        try {
          data = responseText ? JSON.parse(responseText) : {};
        } catch (error) {
          console.error("Failed to parse error response", error, responseText);
          data = {
            error: responseText || `Request failed with status ${response.status}`,
          };
        }
        setHistory((messages) => {
          const next = [...messages];
          next.push({
            ...createAssistantEntry({
            text: data.error || "The backend could not complete that request.",
            error: true,
            files: data.files || [],
            streaming: false,
            }),
          });
          return next;
        });
        setStatus((current) => ({
          ...current,
          busy: false,
          warning: data.warning ?? current.warning,
          workspacePath: data.workspacePath ?? current.workspacePath,
          agentReady: false,
          ok: false,
        }));
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const updateAssistant = (updater) => {
        setHistory((messages) => {
          const next = [...messages];
          const index = [...next].reverse().findIndex(
            (entry) => entry.role === "assistant" && entry.streaming,
          );
          if (index === -1) {
            next.push(updater(createAssistantEntry()));
            return next;
          }

          const actualIndex = next.length - 1 - index;
          next[actualIndex] = updater(next[actualIndex]);
          return next;
        });
      };

      const closeStreamingAssistant = () => {
        setHistory((messages) =>
          messages.map((entry, index) => {
            if (entry.role !== "assistant" || !entry.streaming) return entry;
            if (
              messages
                .slice(index + 1)
                .some((candidate) => candidate.role === "assistant" && candidate.streaming)
            ) {
              return entry;
            }
            return { ...entry, streaming: false };
          }),
        );
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          let event;
          try {
            event = JSON.parse(line);
          } catch (error) {
            console.error("Failed to parse stream event", error, line);
            throw new Error(`Invalid stream event: ${line}`);
          }

          if (event.type === "delta") {
            updateAssistant((currentAssistant) => ({
              ...currentAssistant,
              text: `${currentAssistant.text}${event.delta}`,
            }));
          }

          if (event.type === "tool_start") {
            closeStreamingAssistant();
            setHistory((messages) => [
              ...messages,
              {
                role: "tool",
                id: event.tool.id,
                name: event.tool.name,
                status: "running",
                preview: formatToolPreview(event.tool.args),
              },
            ]);
          }

          if (event.type === "tool_update") {
            setHistory((messages) =>
              messages.map((entry) =>
                entry.role === "tool" && entry.id === event.tool.id
                  ? {
                      ...entry,
                      preview: formatToolPreview(event.tool.partialResult) || entry.preview,
                    }
                  : entry,
              ),
            );
          }

          if (event.type === "tool_end") {
            setHistory((messages) =>
              messages.map((entry) =>
                entry.role === "tool" && entry.id === event.tool.id
                  ? {
                      ...entry,
                      status: event.tool.isError ? "error" : "done",
                      preview: formatToolResult(entry.name, event.tool.result) || entry.preview,
                    }
                  : entry,
              ),
            );
          }

          if (event.type === "done") {
            let attached = false;
            setHistory((messages) => {
              const next = [...messages];
              for (let i = next.length - 1; i >= 0; i -= 1) {
                if (next[i].role === "assistant") {
                  next[i] = {
                    ...next[i],
                    text: next[i].text || event.reply,
                    files: event.files || [],
                    streaming: false,
                  };
                  attached = true;
                  break;
                }
              }
              if (!attached) {
                next.push(
                  createAssistantEntry({
                    text: event.reply,
                    files: event.files || [],
                    streaming: false,
                  }),
                );
              }
              return next;
            });

            setStatus((current) => ({
              ...current,
              busy: false,
              warning: event.warning ?? current.warning,
              workspacePath: event.workspacePath ?? current.workspacePath,
              agentReady: true,
              ok: true,
            }));

            if ((event.files || []).length > 0) {
              reloadEmulator();
            }
          }

          if (event.type === "error") {
            let attached = false;
            setHistory((messages) => {
              const next = [...messages];
              for (let i = next.length - 1; i >= 0; i -= 1) {
                if (next[i].role === "assistant" && next[i].streaming) {
                  next[i] = {
                    ...next[i],
                    text: event.error || "The backend could not complete that request.",
                    files: event.files || [],
                    error: true,
                    streaming: false,
                  };
                  attached = true;
                  break;
                }
              }
              if (!attached) {
                next.push(
                  createAssistantEntry({
                    text: event.error || "The backend could not complete that request.",
                    files: event.files || [],
                    error: true,
                    streaming: false,
                  }),
                );
              }
              return next;
            });

            setStatus((current) => ({
              ...current,
              busy: false,
              warning: event.warning ?? current.warning,
              workspacePath: event.workspacePath ?? current.workspacePath,
              ok: false,
            }));
          }
        }
      }
    } catch (error) {
      console.error("Streaming chat failed", error);
      setHistory((messages) => {
        const next = [...messages];
        next.push({
          ...createAssistantEntry({
          text: normalizeErrorMessage(
            error,
            "Could not reach the backend. Start the server and try again.",
          ),
          error: true,
          files: [],
          streaming: false,
          }),
        });
        return next;
      });
      setStatus((current) => ({
        ...current,
        busy: false,
        ok: false,
        agentReady: false,
        warning: normalizeErrorMessage(
          error,
          "Backend unavailable. Start the server in /server to enable editing.",
        ),
      }));
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  function handleSuggestion(suggestion) {
    setPrompt(suggestion);
    textareaRef.current?.focus();
  }

  function reloadEmulator() {
    emulatorReadyRef.current = false;
    pendingEmulatorCommandsRef.current = [];
    setEmulatorVersion((version) => version + 1);
  }

  const romTimestamp = romInfo.lastModified
    ? new Date(romInfo.lastModified).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
      })
    : "ROM not found";
  const romVersion = encodeURIComponent(romInfo.lastModified ?? "unknown");

  const badgeText = !status.ok
    ? "Backend offline"
    : status.busy
      ? "Agent working"
      : status.agentReady
        ? "Agent ready"
        : "Needs setup";

  return (
    <div style={styles.wrapper}>
      <div style={styles.bgOrb1} />
      <div style={styles.bgOrb2} />
      <div style={styles.bgOrb3} />

      <div style={styles.splitLayout}>
        <div className="pokecraft-shell" style={styles.container}>
          <div style={styles.header}>
            <div style={styles.logoRow}>
              <div style={styles.pokeball}>
                <div style={styles.pokeballTop} />
                <div style={styles.pokeballLine} />
                <div style={styles.pokeballCenter}>
                  <div style={styles.pokeballButton} />
                </div>
              </div>
              <div>
                <h1 style={styles.title}>PokeCraft</h1>
                <p style={styles.subtitle}>AI-Powered Pokémon Modder</p>
              </div>
            </div>
            <div style={styles.headerMeta}>
              <div style={styles.badge}>
                <span
                  style={{
                    ...styles.badgeDot,
                    background: status.ok ? "#22c55e" : "#f87171",
                    boxShadow: status.ok
                      ? "0 0 8px rgba(34,197,94,0.5)"
                      : "0 0 8px rgba(248,113,113,0.5)",
                  }}
                />
                {badgeText}
              </div>
            </div>
          </div>

          <div style={styles.historyArea}>
            {history.length === 0 ? (
              <div style={styles.emptyState}>
                <div style={styles.emptyIcon}>
                  <Map size={30} strokeWidth={2.2} />
                </div>
                <h2 style={styles.emptyTitle}>What do you want to build?</h2>
                <p style={styles.emptyText}>
                  Describe maps, NPCs, battles, or any game feature — and we'll
                  modify the Pokémon source code for you.
                </p>
                <div style={styles.suggestionsGrid}>
                  {SUGGESTIONS.map((suggestion, i) => {
                    const Icon = suggestion.icon;
                    return (
                      <button
                        key={i}
                        style={styles.suggestionChip}
                        onClick={() => handleSuggestion(suggestion.text)}
                        onMouseEnter={(e) => {
                          e.target.style.borderColor = "var(--accent-red)";
                          e.target.style.background = "var(--bg-chip-hover)";
                        }}
                        onMouseLeave={(e) => {
                          e.target.style.borderColor = "var(--border-subtle)";
                          e.target.style.background = "var(--bg-chip)";
                        }}
                      >
                        <span style={styles.chipIcon}>
                          <Icon size={16} strokeWidth={2.1} />
                        </span>
                        {suggestion.text}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div style={styles.messages}>
                {history.map((msg, i) => (
                  <div
                    key={i}
                    style={msg.role === "user" ? styles.userMsg : styles.assistantMsg}
                  >
                    {msg.role === "assistant" && (
                      <div style={styles.assistantAvatar}>
                        <Zap size={16} strokeWidth={2.2} />
                      </div>
                    )}
                    {msg.role === "tool" && (
                      <div style={styles.toolAvatar}>
                        {msg.status === "running" ? (
                          <LoaderCircle size={15} strokeWidth={2.1} style={styles.toolSpinner} />
                        ) : (
                          <Wrench size={15} strokeWidth={2.1} />
                        )}
                      </div>
                    )}
                    <div
                      style={
                        msg.role === "user"
                          ? styles.userBubble
                          : msg.role === "tool"
                            ? styles.toolBubble
                          : styles.assistantBubble
                      }
                    >
                      {msg.role === "user" ? (
                        <p style={styles.msgText}>{msg.text}</p>
                      ) : msg.role === "tool" ? (
                        <div style={styles.toolRow}>
                          <span style={styles.toolName}>{msg.name}</span>
                          <span
                            style={{
                              ...styles.toolStatus,
                              color:
                                msg.status === "error"
                                  ? "var(--text-tool-error)"
                                  : msg.status === "done"
                                    ? "var(--text-tool-done)"
                                    : "var(--text-tool-running)",
                            }}
                          >
                            {msg.status}
                          </span>
                          {msg.preview && (
                            <span style={styles.toolPreview}>{msg.preview}</span>
                          )}
                        </div>
                      ) : msg.streaming && !msg.text ? (
                        <div style={styles.loadingDots}>
                          <span style={{ ...styles.dot, animationDelay: "0s" }} />
                          <span style={{ ...styles.dot, animationDelay: "0.2s" }} />
                          <span style={{ ...styles.dot, animationDelay: "0.4s" }} />
                        </div>
                      ) : (
                        <div className="markdown-body" style={styles.markdownBody}>
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {msg.text}
                          </ReactMarkdown>
                        </div>
                      )}
                      {msg.files?.length > 0 && (
                        <div style={styles.filesList}>
                          {msg.files.map((f, j) => (
                            <div key={j} style={styles.fileChip}>
                              <span style={styles.fileIcon}>
                                <FileCode2 size={13} strokeWidth={2} />
                              </span>
                              {f}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={historyEndRef} />
              </div>
            )}
          </div>

          <div style={styles.inputArea}>
            <div style={styles.inputBox}>
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe what to add... e.g. 'Add a water route with swimmer NPCs'"
                style={styles.textarea}
                rows={2}
              />
              <div style={styles.inputFooter}>
                <span style={styles.hint}>
                  {status.warning || "Shift + Enter for new line"}
                </span>
                <button
                  onClick={handleSubmit}
                  disabled={!prompt.trim() || loading}
                  style={{
                    ...styles.sendBtn,
                    opacity: !prompt.trim() || loading ? 0.4 : 1,
                    cursor: !prompt.trim() || loading ? "not-allowed" : "pointer",
                  }}
                >
                  {loading ? (
                    <span style={styles.spinner} />
                  ) : (
                    <Send size={18} strokeWidth={2.4} color="white" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div style={styles.emulatorPanel}>
          <div style={styles.emulatorHeader}>
            <div style={styles.emulatorHeaderMeta}>
              <span style={styles.emulatorLabel}>Game Preview</span>
              <span style={styles.emulatorTimestamp}>ROM modified {romTimestamp}</span>
            </div>
            <div style={styles.emulatorHeaderActions}>
              <span style={styles.emulatorHint}>Arrow keys • Z=A • X=B • Enter=Start</span>
              <button
                style={styles.reloadButton}
                onClick={reloadEmulator}
                title="Reload game"
                aria-label="Reload game"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                  <polyline points="21 3 21 9 15 9" />
                </svg>
              </button>
            </div>
          </div>
          <iframe
            ref={emulatorFrameRef}
            src={`http://localhost:3001/emulator.html?reload=${emulatorVersion}&rom=${romVersion}`}
            style={styles.emulatorFrame}
            allow="autoplay"
            title="GBA Emulator"
          />
        </div>
      </div>

      <style>{`
        @keyframes float1 { 0%,100%{transform:translate(0,0)} 50%{transform:translate(30px,-40px)} }
        @keyframes float2 { 0%,100%{transform:translate(0,0)} 50%{transform:translate(-20px,30px)} }
        @keyframes float3 { 0%,100%{transform:translate(0,0)} 50%{transform:translate(15px,25px)} }
        @keyframes dotPulse { 0%,80%,100%{opacity:0.3;transform:scale(0.8)} 40%{opacity:1;transform:scale(1)} }
        @keyframes spin { to{transform:rotate(360deg)} }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        textarea:focus { outline: none; }
        button:focus { outline: none; }
        textarea::placeholder { color: var(--text-tertiary); }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--border-subtle); border-radius: 3px; }
        .markdown-body { color: var(--text-primary); font-size: 13.5px; line-height: 1.6; }
        .markdown-body > :first-child { margin-top: 0; }
        .markdown-body > :last-child { margin-bottom: 0; }
        .markdown-body p,
        .markdown-body ul,
        .markdown-body ol,
        .markdown-body pre,
        .markdown-body table,
        .markdown-body blockquote,
        .markdown-body h1,
        .markdown-body h2,
        .markdown-body h3,
        .markdown-body h4 { margin: 0 0 12px; }
        .markdown-body ul,
        .markdown-body ol { padding-left: 20px; }
        .markdown-body li + li { margin-top: 4px; }
        .markdown-body code {
          font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
          font-size: 0.92em;
          background: var(--bg-code-inline);
          border: 1px solid var(--border-code-inline);
          border-radius: 6px;
          padding: 0.15em 0.4em;
        }
        .markdown-body pre {
          overflow-x: auto;
          background: var(--bg-code-block);
          border: 1px solid var(--border-code-block);
          border-radius: 12px;
          padding: 14px 16px;
        }
        .markdown-body pre code {
          display: block;
          padding: 0;
          border: 0;
          background: transparent;
          white-space: pre;
        }
        .markdown-body table {
          width: 100%;
          border-collapse: collapse;
          overflow: hidden;
          border-radius: 10px;
          border-style: hidden;
          box-shadow: 0 0 0 1px var(--border-table);
        }
        .markdown-body th,
        .markdown-body td {
          padding: 8px 10px;
          text-align: left;
          border: 1px solid var(--border-table);
          vertical-align: top;
        }
        .markdown-body th { background: var(--bg-table-header); }
        .markdown-body hr {
          border: 0;
          border-top: 1px solid var(--border-rule);
          margin: 16px 0;
        }
        .markdown-body a { color: var(--text-link); }
        .markdown-body img {
          display: block;
          max-width: min(100%, 320px);
          height: auto;
          margin: 10px 0;
          border-radius: 12px;
          border: 1px solid var(--border-subtle);
          background: var(--bg-panel);
        }
        .markdown-body blockquote {
          border-left: 3px solid var(--border-blockquote);
          padding-left: 12px;
          color: var(--text-blockquote);
        }
        @media (max-width: 1200px) {
          .pokecraft-shell {
            width: min(720px, calc(100vw - 32px)) !important;
          }
        }
        @media (max-width: 1100px) {
          .pokecraft-layout {
            flex-direction: column !important;
            height: auto !important;
          }
          .pokecraft-shell {
            width: min(760px, calc(100vw - 32px)) !important;
            height: 760px !important;
            max-height: calc(100dvh - 320px) !important;
          }
          .pokecraft-emulator {
            width: min(760px, calc(100vw - 32px)) !important;
            height: 260px !important;
            flex: none !important;
          }
        }
        @media (max-width: 640px) {
          .pokecraft-shell {
            width: 100% !important;
            height: calc(100dvh - 300px) !important;
            max-height: calc(100dvh - 300px) !important;
            border-radius: 18px !important;
          }
          .pokecraft-emulator {
            width: 100% !important;
            height: 220px !important;
          }
        }
      `}</style>
    </div>
  );
}

const styles = {
  wrapper: {
    height: "100vh",
    background: "var(--bg-gradient-app)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    position: "relative",
    overflow: "hidden",
    padding: "16px",
  },
  splitLayout: {
    display: "flex",
    gap: 16,
    width: "100%",
    height: "92vh",
    maxWidth: 1400,
    position: "relative",
    zIndex: 1,
  },
  bgOrb1: {
    position: "absolute",
    top: "10%",
    left: "15%",
    width: 300,
    height: 300,
    borderRadius: "50%",
    background: "radial-gradient(circle, var(--orb-1) 0%, transparent 70%)",
    animation: "float1 8s ease-in-out infinite",
    pointerEvents: "none",
  },
  bgOrb2: {
    position: "absolute",
    bottom: "20%",
    right: "10%",
    width: 250,
    height: 250,
    borderRadius: "50%",
    background: "radial-gradient(circle, var(--orb-2) 0%, transparent 70%)",
    animation: "float2 10s ease-in-out infinite",
    pointerEvents: "none",
  },
  bgOrb3: {
    position: "absolute",
    top: "50%",
    right: "30%",
    width: 200,
    height: 200,
    borderRadius: "50%",
    background: "radial-gradient(circle, var(--orb-3) 0%, transparent 70%)",
    animation: "float3 12s ease-in-out infinite",
    pointerEvents: "none",
  },
  container: {
    width: 560,
    minWidth: 460,
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    background: "var(--bg-panel)",
    border: "1px solid var(--border-panel)",
    borderRadius: 20,
    overflow: "hidden",
    backdropFilter: "blur(20px)",
  },
  emulatorPanel: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    background: "var(--bg-panel)",
    border: "1px solid var(--border-panel)",
    borderRadius: 20,
    overflow: "hidden",
  },
  emulatorHeader: {
    padding: "14px 20px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: "1px solid var(--border-panel)",
    background: "var(--bg-header)",
    gap: 12,
  },
  emulatorHeaderMeta: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    minWidth: 0,
  },
  emulatorLabel: {
    fontSize: 13,
    color: "var(--text-secondary)",
    textTransform: "uppercase",
    letterSpacing: 2,
    fontWeight: 600,
  },
  emulatorTimestamp: {
    fontSize: 12,
    color: "var(--text-secondary)",
    whiteSpace: "nowrap",
  },
  emulatorHeaderActions: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  emulatorHint: {
    fontSize: 11,
    color: "var(--text-tertiary)",
    whiteSpace: "nowrap",
  },
  reloadButton: {
    border: "1px solid var(--border-panel)",
    background: "var(--bg-input)",
    color: "var(--text-secondary)",
    borderRadius: 999,
    width: 34,
    height: 34,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    cursor: "pointer",
  },
  emulatorFrame: {
    flex: 1,
    width: "100%",
    border: "none",
    background: "#000",
    borderRadius: "0 0 20px 20px",
  },
  header: {
    padding: "20px 24px",
    borderBottom: "1px solid var(--border-panel)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    background: "var(--bg-header)",
    gap: 16,
  },
  headerMeta: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 8,
  },
  logoRow: { display: "flex", alignItems: "center", gap: 14 },
  pokeball: {
    width: 38,
    height: 38,
    borderRadius: "50%",
    position: "relative",
    overflow: "hidden",
    border: "2px solid var(--border-icon)",
    flexShrink: 0,
  },
  pokeballTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "50%",
    background: "var(--accent-red)",
  },
  pokeballLine: {
    position: "absolute",
    top: "50%",
    left: 0,
    right: 0,
    height: 3,
    background: "var(--bg-icon-line)",
    transform: "translateY(-50%)",
    zIndex: 2,
  },
  pokeballCenter: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%,-50%)",
    width: 12,
    height: 12,
    borderRadius: "50%",
    background: "#fff",
    border: "2px solid var(--border-icon-center)",
    zIndex: 3,
  },
  pokeballButton: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%,-50%)",
    width: 5,
    height: 5,
    borderRadius: "50%",
    background: "var(--accent-red)",
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
    color: "var(--text-primary)",
    letterSpacing: "-0.02em",
    lineHeight: 1.2,
  },
  subtitle: { fontSize: 12, color: "var(--text-secondary)", marginTop: 2 },
  badge: {
    fontSize: 11,
    color: "var(--text-secondary)",
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 12px",
    background: "var(--bg-input)",
    borderRadius: 20,
    border: "1px solid var(--border-panel)",
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "var(--accent-green)",
    boxShadow: "var(--shadow-badge)",
  },
  historyArea: {
    flex: 1,
    overflowY: "auto",
    padding: "24px",
  },
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    textAlign: "center",
    gap: 8,
  },
  emptyIcon: { fontSize: 48, marginBottom: 8 },
  emptyTitle: {
    fontSize: 22,
    fontWeight: 600,
    color: "var(--text-primary)",
    letterSpacing: "-0.02em",
  },
  emptyText: {
    fontSize: 14,
    color: "var(--text-secondary)",
    maxWidth: 400,
    lineHeight: 1.6,
    marginBottom: 16,
  },
  suggestionsGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 8,
    width: "100%",
    maxWidth: 520,
  },
  suggestionChip: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 14px",
    background: "var(--bg-chip)",
    border: "1px solid var(--border-subtle)",
    borderRadius: 12,
    color: "var(--text-secondary)",
    fontSize: 12.5,
    cursor: "pointer",
    textAlign: "left",
    transition: "all 0.2s ease",
    lineHeight: 1.4,
  },
  chipIcon: {
    width: 18,
    height: 18,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  messages: { display: "flex", flexDirection: "column", gap: 16 },
  userMsg: { display: "flex", justifyContent: "flex-end" },
  assistantMsg: { display: "flex", gap: 10, alignItems: "flex-start" },
  assistantAvatar: {
    width: 32,
    height: 32,
    borderRadius: 10,
    background: "var(--bg-assistant-avatar)",
    border: "1px solid var(--border-assistant-avatar)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 14,
    flexShrink: 0,
  },
  toolAvatar: {
    width: 32,
    height: 32,
    borderRadius: 10,
    background: "var(--bg-tool-item)",
    border: "1px solid var(--border-tool-item)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    fontWeight: 700,
    color: "var(--text-tool-name)",
    flexShrink: 0,
  },
  toolSpinner: {
    animation: "spin 0.8s linear infinite",
  },
  userBubble: {
    background: "var(--bg-bubble-user)",
    borderRadius: "16px 16px 4px 16px",
    padding: "10px 16px",
    maxWidth: "80%",
  },
  assistantBubble: {
    background: "var(--bg-bubble-assistant)",
    border: "1px solid var(--border-subtle)",
    borderRadius: "16px 16px 16px 4px",
    padding: "10px 16px",
    maxWidth: "80%",
  },
  toolBubble: {
    background: "var(--bg-tool-item)",
    border: "1px solid var(--border-tool-item)",
    borderRadius: "14px 14px 14px 4px",
    padding: "8px 12px",
    maxWidth: "80%",
  },
  markdownBody: { minWidth: 0 },
  msgText: { fontSize: 13.5, color: "var(--text-primary)", lineHeight: 1.5 },
  toolRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    flexWrap: "wrap",
  },
  toolName: {
    fontSize: 11.5,
    fontWeight: 700,
    color: "var(--text-tool-name)",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  toolStatus: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  toolPreview: {
    fontSize: 11.5,
    color: "var(--text-tool-preview)",
    fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
    lineHeight: 1.45,
    wordBreak: "break-word",
    flex: "1 1 100%",
  },
  filesList: { display: "flex", flexDirection: "column", gap: 4, marginTop: 8 },
  fileChip: {
    fontSize: 11.5,
    color: "var(--text-secondary)",
    background: "var(--bg-input)",
    padding: "4px 10px",
    borderRadius: 6,
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontFamily: "monospace",
  },
  fileIcon: {
    width: 14,
    height: 14,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    opacity: 0.75,
    flexShrink: 0,
  },
  loadingDots: { display: "flex", gap: 4, padding: "4px 0" },
  dot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "var(--text-secondary)",
    animation: "dotPulse 1.2s ease-in-out infinite",
  },
  inputArea: {
    padding: "16px 24px 20px",
    borderTop: "1px solid var(--border-panel)",
    background: "var(--bg-header)",
  },
  inputBox: {
    background: "var(--bg-input)",
    border: "1px solid var(--border-input)",
    borderRadius: 16,
    overflow: "hidden",
    transition: "border-color 0.2s",
  },
  textarea: {
    width: "100%",
    background: "transparent",
    border: "none",
    color: "var(--text-primary)",
    fontSize: 14,
    padding: "14px 16px 4px",
    resize: "none",
    lineHeight: 1.5,
    fontFamily: "inherit",
  },
  inputFooter: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "4px 8px 8px 16px",
    gap: 12,
  },
  hint: {
    fontSize: 11,
    color: "var(--text-tertiary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    background: "var(--accent-red)",
    border: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.2s",
    flexShrink: 0,
  },
  spinner: {
    width: 16,
    height: 16,
    border: "2px solid rgba(255,255,255,0.3)",
    borderTopColor: "#fff",
    borderRadius: "50%",
    animation: "spin 0.6s linear infinite",
    display: "inline-block",
  },
};
