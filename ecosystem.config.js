/**
 * PM2 Ecosystem Configuration
 *
 * Reads all secrets from /opt/gen-ui/.env at startup — no credentials are
 * stored in this file.  Run `pm2 start ecosystem.config.js --env production`
 * or use `scripts/deploy.sh` which does this automatically.
 */

const path = require('path');
const fs   = require('fs');

// ---------------------------------------------------------------------------
// Load .env from the project root (works both locally and on the server)
// ---------------------------------------------------------------------------
const ROOT = __dirname;                       // repo root
const ENV_PATH = path.join(ROOT, '.env');

function loadEnv(filePath) {
  const vars = {};
  if (!fs.existsSync(filePath)) return vars;
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    // Strip surrounding quotes if present
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    vars[key] = val;
  }
  return vars;
}

const env = loadEnv(ENV_PATH);

// Derived / override values
const DOMAIN = env.DOMAIN || 'localhost';

// ---------------------------------------------------------------------------
// Shared env block — every service gets the full .env plus its overrides
// ---------------------------------------------------------------------------
function serviceEnv(overrides) {
  return { ...env, ...overrides };
}

module.exports = {
  apps: [
    // ── Frontend (Next.js standalone) ──────────────────────────────────
    {
      name: 'director-frontend',
      script: path.join(ROOT, 'apps/frontend/.next/standalone/apps/frontend/server.js'),
      env: serviceEnv({
        PORT: '3100',
        NODE_ENV: 'production',
        HOSTNAME: '0.0.0.0',
      }),
      error_file: path.join(ROOT, 'logs/frontend-error.log'),
      out_file:   path.join(ROOT, 'logs/frontend-out.log'),
    },

    // ── BFF (CopilotKit runtime) ───────────────────────────────────────
    {
      name: 'director-bff',
      script: path.join(ROOT, 'apps/bff/dist/server.js'),
      env: serviceEnv({
        PORT: '4010',
        NODE_ENV: 'production',
        PUBLIC_INTELLIGENCE_WS_URL: `wss://${DOMAIN}/ws`,
      }),
      error_file: path.join(ROOT, 'logs/bff-error.log'),
      out_file:   path.join(ROOT, 'logs/bff-out.log'),
    },

    // ── Agent (LangGraph via uv) ───────────────────────────────────────
    {
      name: 'director-agent',
      script: '/home/deploy/.local/bin/uv',
      // --no-reload is critical in production: without it, langgraph's
      // watchfiles loop restarts the agent on every __pycache__ touch,
      // killing in-flight runs mid-stream. The Intelligence thread lock
      // is never released, so all subsequent requests on the same thread
      // hang on 409 THREAD_LOCK_FAILED until the lock TTL expires.
      args: 'run langgraph dev --port 8123 --no-browser --no-reload',
      cwd: path.join(ROOT, 'apps/agent'),
      env: serviceEnv({
        PATH: '/home/deploy/.local/bin:/usr/local/bin:/usr/bin:/bin',
      }),
      error_file: path.join(ROOT, 'logs/agent-error.log'),
      out_file:   path.join(ROOT, 'logs/agent-out.log'),
    },

    // ── MCP Server (mcp-use widgets) ──────────────────────────────────
    {
      name: 'director-mcp',
      script: 'npm',
      args: 'run start',
      cwd: path.join(ROOT, 'apps/mcp'),
      env: serviceEnv({
        MCP_PORT: '3011',
        NODE_ENV: 'production',
      }),
      error_file: path.join(ROOT, 'logs/mcp-error.log'),
      out_file:   path.join(ROOT, 'logs/mcp-out.log'),
    },
  ],
};
