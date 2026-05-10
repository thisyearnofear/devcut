# Setup

Detailed setup for the kit — prerequisites, API keys, Notion configuration, model switching, threads, and a manual setup path if you can't use the CopilotKit CLI.

## Prerequisites

- Node.js 20+
- Python 3.10+
- [uv](https://docs.astral.sh/uv/getting-started/installation/) for Python deps
- Docker (required for Intelligence — see [Docker-free mode](#removing-intelligence-docker-free-mode) for the no-Docker path)
- A package manager: `pnpm` (recommended), `npm`, `yarn`, or `bun`
- API keys: Gemini (required), Notion integration token (required for the lead-form demo), CopilotKit license (issued by the CLI or `npm run license`)

> Lock files are gitignored so you can use any package manager. Generate one locally with your tool of choice.

---

## Get a Gemini API key (required)

This kit defaults to **Gemini 3.1 Flash-Lite**. You need a Gemini API key for chat to work.

1. Go to [aistudio.google.com](https://aistudio.google.com) and sign in with a Google Account.
2. In the left sidebar, click **Get API key**.
3. Click **Create API key** — choose **Create API key in new project** or **in existing project**.
4. Copy the key (starts with `AIza`). You can retrieve it later from the same dashboard.

Full docs: https://ai.google.dev/gemini-api/docs/api-key

Then drop it into both env files:

```bash
# .env (root, used by the BFF + Next.js)
GEMINI_API_KEY=AIza...

# apps/agent/.env (used by langgraph dev)
GEMINI_API_KEY=AIza...
```

Prefer a different model? See [model switching](#switching-to-a-different-model) below.

---

## Notion MCP setup (lead-form demo)

The kit calls Notion through the official [Notion MCP server](https://github.com/makenotion/notion-mcp-server) — a standalone process spawned on demand via `npx -y @notionhq/notion-mcp-server`. Auth is a single Notion integration token plus an explicit per-database share. No global install, no OAuth flow, no third-party broker.

The kit is wired against an "AI Workshop Provider Community" lead-form database. The fastest path is to duplicate the public sample into your own workspace; you can also re-import a CSV/ZIP if you'd rather start from a snapshot.

### 1. Get the database into your workspace

**Option A — duplicate the public sample (recommended).**
1. Open the public template: [AI Workshop Provider Community](https://assorted-stomach-b12.notion.site/a274791c4e1e826d882d01562af74de9?v=0e04791c4e1e83ca834988083174d19e&source=copy_link).
2. In the top-right of the page, click the **Duplicate** icon (two overlapping squares, next to the share icon and the `…` menu). Notion will prompt you to pick a destination workspace and copy the database — schema, views, and seed rows all come along.
3. Once Notion drops you into the duplicated copy, **bookmark its URL** — you'll need the database id from it in step 3.

**Option B — re-import the bundled snapshot.**
1. In Notion, **Settings → Workspace → Import → Notion (CSV/ZIP)** and upload [`data/notion-leads-sample/ai-workshop-provider-community.zip`](../data/notion-leads-sample/ai-workshop-provider-community.zip). A quick-look CSV lives next to it at [`ai-workshop-provider-community.csv`](../data/notion-leads-sample/ai-workshop-provider-community.csv).

### 2. Create an integration and share it with the database

1. Go to [notion.so/profile/integrations/internal](https://www.notion.so/profile/integrations/internal) → **New integration** → name it (e.g. "genai-starterkit") → copy the **Internal Integration Token** (starts with `ntn_…` or `secret_…`). Bookmark this page — it's also where you'll come back to rotate the token or audit which databases the integration can see.
2. Open the duplicated database in Notion. Click the `…` menu in the top-right → **Connections** (count badge will read `0`) → **Add connection** → pick the integration you just created. The panel will flip to **Active connections** with your integration listed.

   > Notion's permission model is per-database — a fresh integration token sees zero databases until it's been shared into them. **Forgetting this share step is the most common point of failure.** If `npm run dev` boots cleanly but `Import the leads` fails with "object not found", come back here.

> **Learn more:** Notion's [Getting started with the Notion API](https://developers.notion.com/guides/get-started/overview) covers integration types, the per-database share model, and the API surface the official MCP server wraps.

### 3. Paste the credentials into `.env`

Pull the database id from the URL of your duplicated copy: it's the 32-char hex string between the workspace slug and the `?v=` query (e.g. `a274791c4e1e826d882d01562af74de9`).

Paste both into `apps/agent/.env` (and `.env` at the repo root):

```bash
NOTION_TOKEN=<paste the Internal Integration Token>
NOTION_LEADS_DATABASE_ID=<paste the database id from its Notion URL>
```

### 4. Restart the agent

```bash
npm run dev
```

Then try: **"Import the workshop leads."**

To use a different MCP server (Linear, Slack, GitHub, …), see [customization](customization.md#swap-the-integration-mcp-server).

---

## Manual setup (alternative to the CLI)

If you can't or don't want to use `npx @copilotkit/cli@latest init`:

1. Get a license token: `npx copilotkit license -n hackathon-kit` — paste into `.env` as `COPILOTKIT_LICENSE_TOKEN`.
2. Bring up infra:
   ```bash
   docker compose up -d --wait
   ```
   This pulls `ghcr.io/copilotkit/intelligence/composite` and starts Postgres + Redis alongside.
3. Copy env templates: `cp .env.example .env` and `cp apps/agent/.env.example apps/agent/.env`. Paste your keys.
4. Install + run:
   ```bash
   npm install
   npm run dev
   ```

The intelligence env vars (`INTELLIGENCE_API_URL`, `INTELLIGENCE_GATEWAY_WS_URL`, `INTELLIGENCE_API_KEY`) match `deployment/docker-compose.yml`'s defaults — no manual editing needed for local dev.

---

## Switching to a different model

This kit ships **Gemini 3.1 Flash-Lite + deepagents** as the default. Two pre-wired Gemini runtimes are selectable via the `AGENT_RUNTIME` env var — no code edit needed:

| `AGENT_RUNTIME`        | Model                   | Planner                          |
|------------------------|-------------------------|----------------------------------|
| `gemini-flash-deep`    | `gemini-3.1-flash-lite` | `deepagents`                     |
| `gemini-flash-react`   | `gemini-3.1-flash-lite` | `langchain.create_agent` (react) |

Set in **both** `.env` and `apps/agent/.env` (the agent reads its own copy):

```bash
AGENT_RUNTIME=gemini-flash-deep
```

A third runtime (`claude-sonnet-4-6-react`) is also wired in [`apps/agent/src/runtime.py`](../apps/agent/src/runtime.py) (`_build_claude_react`) if you'd rather run Claude — set `ANTHROPIC_API_KEY` in `apps/agent/.env` and flip `AGENT_RUNTIME` to it. Use it as a template for any other LangChain provider.

Restart the agent (`npm run dev:agent`) and you should see `[runtime] AGENT_RUNTIME=...` in the agent log.

Want a different Gemini tier (`gemini-3-pro-preview`, `gemini-3-flash`) or a different provider entirely (OpenAI, etc.)? Edit `apps/agent/src/runtime.py` — `_gemini_llm()` is the single place the model id lives, and `_build_*` factories show the LangChain provider import pattern to copy for a new provider. Re-run `cd apps/agent && uv sync` if you add a new LangChain integration package.

---

## Threads / Intelligence

The threads drawer surfaces every conversation the user has had with the agent on this machine. Threads live in the **Intelligence composite container** (Postgres-backed). When you reload, the active thread is restored.

- **Search** the loaded set client-side; click "Load more" or "Search older threads" to paginate further.
- **Archive** to hide threads you're done with; toggle the filter to view archived.
- **Restore** brings them back; **Delete** is permanent.
- **Theme toggle** in the drawer footer.

To wipe all threads and start fresh:

```bash
npm run dev:infra:down
docker volume rm $(docker volume ls -q | grep intelligence)
npm run dev:infra
```

---

## Removing Intelligence (Docker-free mode)

If you can't run Docker, strip Intelligence and use the kit as a plain CopilotKit + Deep Agents demo. Threads won't persist across reloads, but everything else works.

| Action | Path |
|---|---|
| Edit | `apps/bff/src/server.ts` — remove `intelligence`, `identifyUser`, `licenseToken` from the `CopilotRuntime` constructor (and the `CopilotKitIntelligence` import + instantiation) |
| Edit | `apps/frontend/src/app/leads/page.tsx` — remove `<ThreadsDrawer>` wrapper |
| Delete | `apps/frontend/src/components/threads-drawer/` |
| Delete | `deployment/docker-compose.yml`, `deployment/init-db/` |
| Edit | `.env.example` — remove `COPILOTKIT_LICENSE_TOKEN` and `INTELLIGENCE_*` |