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
const ROOT = __dirname;                       // repo root (/opt/gen-ui)
const CURRENT = path.join(ROOT, 'current');  // -> releases/<ts>/
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
      script: path.join(CURRENT, 'apps/frontend/.next/standalone/apps/frontend/server.js'),
      env: serviceEnv({
        PORT: '3100',
        NODE_ENV: 'production',
        HOSTNAME: '0.0.0.0',
      }),
      restart_delay: 3000,
      exp_backoff_restart_delay: 100,
      max_memory_restart: '512M',
      kill_timeout: 8000,
      error_file: path.join(ROOT, 'logs/frontend-error.log'),
      out_file:   path.join(ROOT, 'logs/frontend-out.log'),
    },

    // ── BFF (CopilotKit runtime) ───────────────────────────────────────
    {
      name: 'director-bff',
      script: path.join(CURRENT, 'apps/bff/dist/server.js'),
      env: serviceEnv({
        PORT: '4010',
        NODE_ENV: 'production',
        PUBLIC_INTELLIGENCE_WS_URL: `wss://${DOMAIN}/ws/client`,
      }),
      restart_delay: 3000,
      exp_backoff_restart_delay: 100,
      max_memory_restart: '512M',
      kill_timeout: 8000,
      error_file: path.join(ROOT, 'logs/bff-error.log'),
      out_file:   path.join(ROOT, 'logs/bff-out.log'),
    },

    // ── Agent (LangGraph via uv) ───────────────────────────────────────
    {
      name: 'director-agent',
      script: path.join(CURRENT, 'apps/agent/.venv/bin/langgraph'),
      args: 'dev --host 0.0.0.0 --port 8123 --no-browser',
      cwd: path.join(CURRENT, 'apps/agent'),
      env: serviceEnv({
        PATH: path.join(CURRENT, 'apps/agent/.venv/bin') + ':/home/linuxuser/.local/bin:/usr/local/bin:/usr/bin:/bin',
        VIRTUAL_ENV: path.join(CURRENT, 'apps/agent/.venv'),
        LANGCHAIN_TRACING_V2: 'false',
      }),
      exec_interpreter: 'none',
      restart_delay: 3000,
      exp_backoff_restart_delay: 100,
      max_memory_restart: '512M',
      kill_timeout: 8000,
      error_file: path.join(ROOT, 'logs/agent-error.log'),
      out_file:   path.join(ROOT, 'logs/agent-out.log'),
    },

    // ── MCP Server (mcp-use widgets) ──────────────────────────────────
    {
      name: 'director-mcp',
      script: 'node',
      args: path.join(CURRENT, 'apps/mcp/dist/index.js'),
      cwd: path.join(CURRENT, 'apps/mcp'),
      env: serviceEnv({
        PORT: '3011',
        MCP_PORT: '3011',
        MCP_URL: 'http://localhost:3011',
        NODE_ENV: 'production',
        PATH: '/usr/bin:/bin:/usr/local/bin',
      }),
      restart_delay: 3000,
      exp_backoff_restart_delay: 100,
      kill_timeout: 8000,
      error_file: path.join(ROOT, 'logs/mcp-error.log'),
      out_file:   path.join(ROOT, 'logs/mcp-out.log'),
    },
  ],
};
