# PokeCraft

An AI-assisted game prototyping platform that lets creators describe game content and gameplay changes in plain language, applies those edits to a live game workspace, and instantly previews the results in a browser-based emulator.

Built to help indie game developers, fangame creators, and aspiring game designers prototype faster without getting slowed down by low-level tooling, manual map editing, or repetitive playtesting.

<img width="1920" height="1080" alt="image_1" src="https://github.com/user-attachments/assets/951e7190-d712-481d-861f-c0b272c0d4ea" />
<img width="1600" height="945" alt="image_2" src="https://github.com/user-attachments/assets/96d65595-a2a0-4a1d-aaa1-201db13d446f" />


---

## What It Does

**Natural Language Game Design** — A creator can type prompts like “add a forest town with a Poké Center,” “create a cave route with trainers,” or “change this NPC’s dialogue and battle team,” and PokeCraft translates that request into real game-world edits.

**Instant Playable Preview** — Instead of manually rebuilding and reopening the game after every change, PokeCraft hot-reloads the updated ROM in a browser-based emulator so the user can immediately test what changed.

**Rapid Iteration Loop** — The platform is designed for experimentation. Users can keep chatting with the AI, refine previous changes, adjust maps, edit entities, update text, and test everything in one continuous workflow.

**Safer AI-Assisted Editing** — Generated changes are validated before being committed, and modifications stay within safe constraints with backups and approval steps to reduce the risk of corrupting the game workspace.

---

## Problem

Game prototyping and ROM/fangame editing are often slowed down by fragmented workflows:

- complex editors
- low-level modding tools
- manual map editing
- repeated rebuild-and-test cycles
- difficult playtesting after each small change

Many creators have strong ideas, but the tooling overhead makes fast iteration hard. PokeCraft solves this by letting users work at the level of design intent instead of raw technical steps.

---

## Solution

PokeCraft is an AI-assisted prototyping workflow that turns natural-language design requests into playable game changes.

Using plain English prompts, creators can:

- generate maps, locations, and environments
- create buildings, structures, and world layouts
- modify gameplay mechanics and entities
- update dialogue and game text
- rapidly test ideas in a live emulator

The current implementation uses a Pokémon ROM environment, but the overall architecture is designed to generalize beyond Pokémon into a broader AI-assisted game prototyping workflow.

---

## Architecture — Two Main Apps + Game Workspace

```bash
npm run dev:all
     │
     ├── Vite (React frontend)     → http://localhost:5173   ← chat UI + emulator
     ├── Express (Node backend)    → http://localhost:3001   ← agent, ROM, tools, validation
     └── Local game workspace      → project source / ROM    ← editable game files
```

---

## Core Features

| Feature | Description |
|---|---|
| Natural language game design | Describe maps, characters, structures, or mechanics in plain language |
| AI agent workflow | Uses Claude / Gemini-style agent flow for iterative game editing |
| Map and environment generation | Create new playable areas, routes, buildings, and layouts |
| Gameplay modification | Update entities, stats, mechanics, text, and world behavior |
| Validation before applying | Generated maps and structural changes are checked for broken paths or invalid logic |
| MCP-powered tooling | Direct game manipulation through structured tools |
| Browser emulator preview | Test changes instantly in a live playable environment |
| Persistent save states | Preserve progress across emulator sessions |
| Real-time hot reload | Reload updated ROM content after each applied change |
| Conversational iteration | Keep refining the world through chat instead of starting over |

---

## Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| Node.js | 18+ recommended | Frontend and backend runtime |
| npm | recent | Package manager |
| Local game workspace | required | Source files / ROM project to edit |
| Browser | modern | Emulator + chat interface |
| Model provider setup | optional but recommended | AI generation workflow |
| Make / rebuild tooling | depends on workspace | Rebuilding generated game content |

---

## Quick Start

### 1. Clone and install

```bash
git clone <your-repo-url>
cd PokeCraft
npm install
cd server
npm install
cd ..
```

### 2. Configure server environment

Create a `.env` file in `server/` and add the environment variables your local model / workspace setup needs.

Example:

```env
PORT=3001
# Add your provider or local model settings here
# Example:
# ANTHROPIC_API_KEY=...
# GOOGLE_API_KEY=...
# WORKSPACE_PATH=...
```

### 3. Make sure your local game workspace is available

PokeCraft expects access to a local editable workspace that contains the ROM or source project files it will modify and rebuild.

### 4. Start the app

```bash
npm run dev:all
```

Then open:

```bash
http://localhost:5173
```

---

## Individual Start Commands

```bash
# Frontend only
npm run dev

# Backend only
cd server
npm run dev

# MCP server only
cd server
npm run mcp

# Full dev flow
npm run dev:all
```

---

## Project Structure

```bash
PokeCraft/
├── public/                         # Static frontend assets
├── scripts/                        # Dev helpers
├── src/                            # React frontend
│   ├── App.jsx                     # Main chat + emulator interface
│   ├── main.jsx                    # Frontend entry point
│   └── ...
│
├── server/                         # Express backend + MCP tooling
│   ├── workspace/                  # Local editable game workspace
│   ├── index.js                    # Main backend server
│   ├── agentService.js             # AI agent orchestration
│   ├── config.js                   # Runtime config
│   ├── imageGenerator.js           # Image / asset generation helpers
│   ├── removeBackground.js         # Asset cleanup pipeline
│   ├── loadEnv.js                  # Environment bootstrap
│   ├── mcp-server.mjs              # MCP server
│   └── package.json
│
├── package.json                    # Root scripts
├── vite.config.js                  # Frontend config
├── eslint.config.js
└── README.md
```

---

## Frontend Stack

| Library | Version | Used For |
|---|---|---|
| React | 19 | UI framework |
| Vite | 7 | Dev server and build pipeline |
| react-markdown | 10 | Rendering streamed AI output |
| remark-gfm | 4 | GitHub-flavored markdown |
| lucide-react | 0.577 | Icons |
| vite-plugin-pwa | 1.2 | PWA support |

### Frontend Experience

The frontend acts like an interactive design console for game creation:

- conversational prompt input
- streamed AI responses
- visible tool activity
- file / change feedback
- embedded browser emulator
- fast test-and-iterate loop

This makes the workflow feel much more like “describe → apply → playtest → refine” than a traditional ROM-hacking toolchain.

---

## Backend Stack

| Library | Version | Used For |
|---|---|---|
| Express | 5.2 | HTTP API server |
| cors | 2.8 | Frontend/backend communication |
| zod | 3.23 | Request validation |
| dotenv | 17.3 | Environment loading |
| @modelcontextprotocol/sdk | 1.0 | MCP tool integration |
| @google/genai | 1.44 | Gemini integration |
| @google-cloud/vertexai | 1.10 | Vertex AI integration |
| sharp | 0.34 | Image processing |
| @imgly/background-removal-node | 1.4 | Asset cleanup |

### What the Backend Does

The backend is responsible for:

- receiving user prompts
- orchestrating the AI agent workflow
- modifying workspace files
- rebuilding / reloading game content
- validating structural changes
- serving ROM data to the frontend
- forwarding emulator commands
- exposing MCP tools for agent control

---

## How the Workflow Works

```text
User describes a game change in chat
    → frontend sends prompt to backend
    → AI agent interprets the request
    → MCP / workspace tools inspect and modify files
    → generated maps / changes are validated
    → approved changes are applied to the workspace
    → ROM is rebuilt or refreshed
    → emulator hot-reloads updated content
    → user immediately playtests the result
```

This is the main idea behind PokeCraft: reducing the gap between imagination and playable prototype.

---

## Main Capabilities

### Natural Language Content Generation

PokeCraft lets creators work at the design level instead of the implementation level. Users can ask for:

- new locations and routes
- buildings and structures
- world layout changes
- dialogue and text edits
- gameplay and mechanic tweaks
- entity and stat changes

### Validation Before Changes Are Applied

A key part of the system is that generated maps and structural edits are analyzed for issues such as broken paths or invalid logic before the user moves forward. This makes the workflow more reliable than blindly applying generated edits.

### Browser-Based Emulator Testing

The updated ROM is previewed directly inside an in-browser emulator with persistent save states, enabling fast experimentation after each change.

### MCP Tooling

The system includes direct manipulation tools for game data, including support for editing:

- entity stats and attributes
- moves and gameplay mechanics
- game text and dialogue
- binary data

The concept brief describes 19 MCP tools for direct ROM manipulation.

---

## Example API Endpoints

```bash
GET  /api/status
     → backend health / runtime status

GET  /api/events
     → live event stream for chat and emulator updates

GET  /api/history?limit=20
     → recent conversation history

POST /api/chat/stream
     Body: { message }
     → streamed AI response with tool execution

GET  /api/rom
     → serve currently loaded ROM

GET  /api/rom/info
     → ROM metadata

POST /api/rom/upload
     → replace active ROM

POST /api/emulator/input
     → send button commands to emulator

POST /api/images/generate
     → create asset images

POST /api/sprites/generate
     → generate sprite assets
```

---

## MCP Server

PokeCraft includes an MCP server so external agents can interact with the game editing workflow in a structured way.

### Example MCP Usage

Possible MCP interactions include:

- reading ROM metadata
- replacing the current ROM
- sending messages into the app
- reading recent chat history
- invoking structured game-editing tools

### Run MCP Server

```bash
cd server
npm run mcp
```

---

## Why This Project Matters

PokeCraft is interesting because it moves game prototyping closer to natural creative iteration.

Instead of spending most of the time inside fragmented editors, manual scripts, and rebuild loops, creators can stay focused on questions like:

- what should this area feel like
- how should this NPC behave
- what kind of battle should happen here
- how should the player move through this space

That is a much more accessible workflow for indie developers, fangame creators, and aspiring designers who have ideas but do not want tooling complexity to block them.

---

## Challenges Solved

| Challenge | Solution |
|---|---|
| Game prototyping tools are too manual | Added natural-language AI workflow |
| Small edits take too long to test | Hot-reload changes into a browser emulator |
| Generated maps can break gameplay flow | Added validation before applying edits |
| Direct low-level modding is hard for beginners | Exposed structured MCP-powered tools |
| Rapid iteration needs context, not one-off prompts | Built conversational chat interface with iterative refinement |

---

## Known Architectural Decisions

**Pokémon is the current demo environment** — the present implementation uses a Pokémon ROM workflow, but the broader architecture is meant to extend to other games and engines.

**Human approval remains in the loop** — AI accelerates world-building, but users stay in control of what gets accepted and tested.

**Validation is a first-class step** — generated maps and structural changes are checked for invalid logic before being finalized.

**Persistent save states improve iteration** — the emulator is not just for display; it supports continuous testing across sessions.

**Safe constrained personalization** — users can customize game content while staying within valid data ranges, with backups to prevent corruption.

---

## Ethics / Safety

PokeCraft is designed with a human-in-the-loop workflow:

- AI-generated modifications are reviewed before being applied
- emulator reloads happen after explicit approval
- generated structural edits are checked for issues
- customization stays within valid ranges
- backups help prevent workspace corruption

This keeps AI as an accelerator for creativity rather than a fully uncontrolled editor.

---

## Future Improvements

- support for more game engines beyond the current Pokémon ROM workflow
- stronger diff views for file-by-file change inspection
- automated regression testing through scripted emulator input
- richer asset generation for tilesets, characters, and environment art
- reusable prompt templates for quests, NPCs, and encounters
- one-click rollback between workspace versions

---

## Team

Sanjiv Sridhar, Nathan Cloos, Ahmad Bishara, Soham Patwardhan 

Built as PokeCraft - an AI-assisted game prototyping platform for faster world-building, gameplay iteration, and browser-based playtesting.
