# Blocks Translation MCP

> An MCP server that finds new UI translation keys in your codebase, dedup-checks them against a **Blocks/UILM** tenant, and generates the JSON the Blocks portal expects for import — for **any** project, framework, or language set, driven by a single per-project config file.

It never guesses tenant IDs, module names, or supported languages — those are resolved live from your config and the tenant itself. Translation text is inferred/authored by the agent; this server does the deterministic parts (diff scanning, dedupe, exact JSON stamping) in code so they're fast, cheap, and reliable.

- **Works in any MCP client** — Claude Code, Cursor, Codex, Google Antigravity, Pi, Windsurf, Cline, VS Code, Zed, …
- **Any frontend framework** — built-in `ngx-translate` and `react-i18next` extractors, plus a `generic` regex mode for anything else.
- **Zero hardcoded languages** — cultures come from the tenant's own `Language/Gets` API and are cached per project.
- **Per-project config** — one `.env.blocks-translation` file at each consuming repo's root; no secrets ever live in this server.

## Contents

- [Quick start](#quick-start)
- [Tools](#tools)
- [Install](#install)
- [Add to your AI tool](#add-to-your-ai-tool) — Claude Code · Cursor · Codex · Antigravity · Pi · Windsurf · Cline · VS Code · Zed · generic
- [Configure your project](#configure-your-project)
- [How it works](#how-it-works)
- [How the server finds your project](#how-the-server-finds-your-project)
- [Troubleshooting](#troubleshooting)

## Quick start

```bash
# 1. Build the server (once)
git clone <repo-url> blocks-translation-mcp
cd blocks-translation-mcp && npm install && npm run build

# 2. Configure a project that uses Blocks
cp .env.blocks-translation.example /path/to/your/project/.env.blocks-translation
#    …then fill in BLOCKS_TENANT_ID, BLOCKS_PORTAL_KEY, BLOCKS_USERNAME, BLOCKS_PASSWORD

# 3. Register the server in your AI tool (see "Add to your AI tool"), then just ask:
#    "sync the translation keys"
```

## Tools

| Tool | What it does |
| --- | --- |
| **`prepare_sync`** | **The one prep call.** Scans the project diff (working-tree + staged + **untracked**), groups keys by their own module, fetches the tenant cultures, and exact-dedupes — all in code. Returns `{ cultures, modules: [{ module, newKeys, existingSkip }] }`. Replaces `find_keys`+`list_modules`+`list_cultures`+`search_keys`. |
| **`sync_keys`** | Dedup-check + build + write the upload JSON in one call (one file per module). Reports `skippedExisting` and `duplicateWarnings` (same English under a different key). |
| `find_keys` | Standalone: extract translation keys from the git diff for the configured framework (`ngx-translate` \| `react-i18next` \| `generic`). |
| `list_cultures` | The tenant's supported cultures (from the Blocks Language API, cached). `refresh:true` re-fetches. |
| `list_modules` | Modules in the tenant (name + id). |
| `search_keys` | Dedup-check keys against a module (+ any `BLOCKS_DEDUP_MODULES`) — both exact-key and same-text. |
| `build_upload_entries` | Pure JSON assembly of already-translated keys into the portal's import shape. |

Most of the time the agent only needs **`prepare_sync` → `sync_keys`**; the rest are composable building blocks.

## Install

### Recommended: one command (auto-detects your AI tools)

```bash
npx -y github:mahmudul006/blocks-translation-mcp install
```

This detects the AI tools installed on your machine (Claude Code, Cursor, Codex, Antigravity, Pi, Windsurf, Cline, VS Code, Zed…), asks **global vs project**, and registers the server into each — using each tool's own CLI or config format. It backs up any file before editing and only ever touches its own `blocks-translation` entry.

Flags (all optional — omit them to be prompted):

| Flag | Effect |
| --- | --- |
| `--print` | Dry run: show every planned change, write nothing. |
| `--scope global\|project` | Skip the scope prompt. |
| `--root <path>` | Project root for a project install (default: current dir). |
| `--clients all\|1,3,5` | Skip the client picker. |
| `--yes` | Accept all defaults (non-interactive). |

Requires Node ≥ 18; no clone or build. Then [configure your project](#configure-your-project) (the `.env.blocks-translation`) and restart your tool.

### Uninstall / re-try

```bash
npx -y github:mahmudul006/blocks-translation-mcp uninstall           # prompts for scope
npx -y github:mahmudul006/blocks-translation-mcp uninstall --scope global --yes
```

Removes only the `blocks-translation` entry from each tool (via its remove-CLI or by editing its config, backing up first), and lists any you must remove by hand. Accepts the same `--scope` / `--root` / `--print` flags.

> **Re-fetching a new version:** `npx github:` caches the cloned repo, so after the server is updated on GitHub, clear the cache before re-running: `rm -rf ~/.npm/_npx`.

### Manual / from source

If you'd rather not use `npx github:`, clone and build, then use the per-client blocks below with `node /abs/path/to/dist/index.js` instead of the `npx` command:

```bash
git clone https://github.com/mahmudul006/blocks-translation-mcp
cd blocks-translation-mcp && npm install && npm run build
```

## Add to your AI tool

The installer above does this for you. To do it by hand, every client runs the **same** stdio command:

```
npx -y github:mahmudul006/blocks-translation-mcp
```

Only two things differ per client: **where** the config lives and its **wrapper key** (`mcpServers` JSON, VS Code's `servers`, Zed's `context_servers`, or Codex's TOML). If your client doesn't start the server with its working directory set to your project root, add `"BLOCKS_PROJECT_ROOT": "/abs/path/to/your/project"` to the server's `env` (see [How the server finds your project](#how-the-server-finds-your-project)).

> **GUI clients + nvm:** the one-command installer handles this, but if you configure a **GUI** client (Antigravity, Cursor, Windsurf, VS Code) by hand and Node is installed via **nvm**, also add your Node bin dir to `env.PATH` — otherwise the tool can't find `npx`/`node`. See [Troubleshooting](#troubleshooting). Command-line clients (Claude Code, Codex) don't need it.

### Claude Code

```bash
claude mcp add blocks-translation -- npx -y github:mahmudul006/blocks-translation-mcp
```

or in `.mcp.json` (project) / `~/.claude.json` (global):

```json
{ "mcpServers": { "blocks-translation": {
  "command": "npx",
  "args": ["-y", "github:mahmudul006/blocks-translation-mcp"]
} } }
```

Claude Code sets the server's `cwd` to your project root, so `.env.blocks-translation` is found automatically — no `BLOCKS_PROJECT_ROOT` needed.

### Cursor

`.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global):

```json
{ "mcpServers": { "blocks-translation": {
  "command": "npx",
  "args": ["-y", "github:mahmudul006/blocks-translation-mcp"],
  "env": { "BLOCKS_PROJECT_ROOT": "/abs/path/to/your/project" }
} } }
```

### Codex (OpenAI Codex CLI)

`~/.codex/config.toml` (or a project `.codex/config.toml`):

```toml
[mcp_servers.blocks-translation]
command = "npx"
args = ["-y", "github:mahmudul006/blocks-translation-mcp"]

[mcp_servers.blocks-translation.env]
BLOCKS_PROJECT_ROOT = "/abs/path/to/your/project"
```

or via CLI:

```bash
codex mcp add blocks-translation --env BLOCKS_PROJECT_ROOT=/abs/path/to/your/project -- npx -y github:mahmudul006/blocks-translation-mcp
```

### Google Antigravity

In the IDE: **Manage MCP Servers → View raw config**, or edit `.agents/mcp_config.json` (workspace) / `~/.gemini/config/mcp_config.json` (global):

```json
{ "mcpServers": { "blocks-translation": {
  "command": "npx",
  "args": ["-y", "github:mahmudul006/blocks-translation-mcp"],
  "env": { "BLOCKS_PROJECT_ROOT": "/abs/path/to/your/project" }
} } }
```

### Pi (pi coding agent)

`.mcp.json` in your project (or the pi agent directory). Pi supports a `cwd` field, so you can point the server at your repo directly:

```json
{ "mcpServers": { "blocks-translation": {
  "command": "npx",
  "args": ["-y", "github:mahmudul006/blocks-translation-mcp"],
  "cwd": "/abs/path/to/your/project"
} } }
```

Because Pi loads `.mcp.json` from the project cwd, a project-local config also finds `.env.blocks-translation` automatically.

### Windsurf

`~/.codeium/windsurf/mcp_config.json`:

```json
{ "mcpServers": { "blocks-translation": {
  "command": "npx",
  "args": ["-y", "github:mahmudul006/blocks-translation-mcp"],
  "env": { "BLOCKS_PROJECT_ROOT": "/abs/path/to/your/project" }
} } }
```

### Cline (VS Code extension)

Cline → **MCP Servers → Configure** (`cline_mcp_settings.json`):

```json
{ "mcpServers": { "blocks-translation": {
  "command": "npx",
  "args": ["-y", "github:mahmudul006/blocks-translation-mcp"],
  "env": { "BLOCKS_PROJECT_ROOT": "/abs/path/to/your/project" }
} } }
```

### VS Code (Copilot agent mode)

`.vscode/mcp.json` — note VS Code uses `servers` (not `mcpServers`) and an explicit `type`:

```json
{ "servers": { "blocks-translation": {
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "github:mahmudul006/blocks-translation-mcp"],
  "env": { "BLOCKS_PROJECT_ROOT": "${workspaceFolder}" }
} } }
```

### Zed

`settings.json` — Zed uses `context_servers`:

```json
{ "context_servers": { "blocks-translation": {
  "source": "custom",
  "command": "npx",
  "args": ["-y", "github:mahmudul006/blocks-translation-mcp"],
  "env": { "BLOCKS_PROJECT_ROOT": "/abs/path/to/your/project" }
} } }
```

### Any other MCP client (generic stdio)

Any client that speaks MCP over stdio works. Register a stdio server with:

- **command:** `npx`
- **args:** `["-y", "github:mahmudul006/blocks-translation-mcp"]`
- **env (optional):** `BLOCKS_PROJECT_ROOT` (if the client doesn't set `cwd` to your repo), or the full `BLOCKS_*` set instead of a `.env` file.

## Configure your project

Copy the example into **your** project's repo root (not this server's directory) and fill it in:

```bash
cp /abs/path/to/blocks-translation-mcp/.env.blocks-translation.example \
   /abs/path/to/your/project/.env.blocks-translation
```

Add `.env.blocks-translation` (and `.blocks-translation-cache.json`) to your project's `.gitignore` — the config holds credentials.

Config is read lazily, only when a tool runs, with this precedence per key: **explicit `BLOCKS_*` env vars** (e.g. from your client's `env` block) win over values in `.env.blocks-translation`.

| Variable | Required? | Default | Meaning |
| --- | --- | --- | --- |
| `BLOCKS_TENANT_ID` | Yes | — | Your tenant GUID. Required for every tool. |
| `BLOCKS_PORTAL_KEY` | For login / modules / languages | — | Portal app key used to authenticate the admin surface. |
| `BLOCKS_USERNAME` | For login / modules / languages | — | Admin username for the login-required endpoints. |
| `BLOCKS_PASSWORD` | For login / modules / languages | — | Admin password. If it contains `#`, wrap the value in double quotes. |
| `BLOCKS_BASE_URL` | No | `https://api.seliseblocks.com` | Blocks API base URL. |
| `BLOCKS_ORIGIN` | No | `https://cloud.seliseblocks.com` | Origin/Referer the admin surface requires. Override only for a non-cloud Blocks deployment. |
| `BLOCKS_FRAMEWORK` | No | `ngx-translate` | Key extraction: `ngx-translate` \| `react-i18next` \| `generic`. |
| `BLOCKS_KEY_REGEX` | Only if `BLOCKS_FRAMEWORK=generic` | — | Regex whose first capture group is the key. |
| `BLOCKS_OUTPUT_PATH_PATTERN` | No | `blocks-translation-helper/blocks-upload.{module}.generated.json` | Output path template; `{module}` is substituted. |
| `BLOCKS_DEDUP_MODULES` | No | *(empty)* | Comma-separated shared modules to also dedup-check alongside the target (e.g. `root,generic-app` if your tenant has them). Missing modules are tolerated. |
| `BLOCKS_PROJECT_ROOT` | Only if your client doesn't set `cwd` to your repo | current working directory | Points the server at your project's root. |

## How it works

The lean, token-cheap flow for adding or syncing translation keys — usually **two tool calls**:

1. **`prepare_sync`** — one call. Scans the diff (working-tree + staged + untracked), groups keys by their own module, fetches the tenant's cultures, and exact-dedupes each module's keys. Returns `{ cultures, modules: [{ module, newKeys, existingSkip }] }`.
2. **Translate** — for each module's `newKeys` only, the agent infers English from the key name and translates into the returned cultures. (This server does not translate for you, and does not read your local i18n files — the portal is the source of truth.)
3. **`sync_keys`** — once per module, writes `blocks-translation-helper/blocks-upload.<module>.generated.json` (path configurable) and reports any `duplicateWarnings` (same English under a *different* existing key) for you to decide on.
4. **Manual portal import** — importing the generated JSON into the Blocks portal is a step you do yourself; this server never calls a write/import endpoint.

In clients that surface MCP server `instructions` (e.g. Claude Code), this workflow is injected automatically. In clients that don't, just ask for a tool by name (e.g. "run prepare_sync").

**Languages:** on first use the server logs in, calls `Language/Gets` for your tenant, and caches the result to `.blocks-translation-cache.json` at your project root (with a module-name → id cache). Pass `refresh:true` to `prepare_sync`/`list_cultures` if the tenant later adds a language.

## How the server finds your project

The server needs your project's root to read `.env.blocks-translation`, run `git diff`, and place the cache. It resolves it with this precedence:

1. Explicit `BLOCKS_*` env vars set in your client's server config (highest priority).
2. `BLOCKS_PROJECT_ROOT/.env.blocks-translation` if `BLOCKS_PROJECT_ROOT` is set.
3. `<cwd>/.env.blocks-translation` — the zero-config default when the client sets `cwd` to your project (Claude Code, project-local Pi).

So: on Claude Code (and project-local Pi) it just works; on other clients, set `BLOCKS_PROJECT_ROOT` (or put the `BLOCKS_*` vars straight in the `env` block).

## Troubleshooting

**"No Blocks config found for this project"** — `BLOCKS_TENANT_ID` isn't set. Create `.env.blocks-translation` at your project root (copy the example) or set `BLOCKS_PROJECT_ROOT` / the `BLOCKS_*` vars in your client's `env` block.

**Missing admin credentials** (`BLOCKS_USERNAME`/`BLOCKS_PASSWORD`/`BLOCKS_PORTAL_KEY` not set) — `prepare_sync`, `list_modules`, and language lookups use the admin surface. Set all three.

**`406 Invalid_Origin_Or_Referer`** — your Blocks deployment isn't the default cloud host. Set `BLOCKS_ORIGIN` to your portal's origin.

**`exec: "npx": executable file not found in $PATH`** / **`/usr/bin/env: 'node': No such file or directory`** — a GUI-launched client (Antigravity, Cursor, Windsurf, VS Code) spawned the server without your shell's `PATH`, so `node`/`npx` aren't found. This is common when Node is installed via **nvm** (its bin dir is only on `PATH` inside a shell that sourced nvm). The one-command installer fixes this automatically by writing a `PATH` into the server's `env`. If you configured the client by hand, add your Node bin dir to the entry's `env.PATH` (find it with `dirname $(readlink -f $(which npx))`):

```json
"blocks-translation": {
  "command": "npx",
  "args": ["-y", "github:mahmudul006/blocks-translation-mcp"],
  "env": { "PATH": "/home/you/.nvm/versions/node/vX.Y.Z/bin:/usr/bin:/bin" }
}
```

CLI-installed clients (Claude Code, Codex) don't need this — they inherit your shell `PATH`.

**`find_keys`/`prepare_sync` git error** — they run `git` in the project root. Ensure the project is a git repo and `git` is on `PATH`; if your client doesn't set `cwd`, set `BLOCKS_PROJECT_ROOT`.

**Admin vs. public surface** — the *admin* surface (`prepare_sync` language/module lookups, `list_modules`, `list_cultures`) requires the login vars. The *public* surface (`search_keys`, the dedupe fetches) needs only `BLOCKS_TENANT_ID`.

**Cultures look stale** (a newly-added tenant language is missing) — call `prepare_sync`/`list_cultures` with `refresh:true`, or delete `.blocks-translation-cache.json`.
