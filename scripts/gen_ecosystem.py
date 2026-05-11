import re

env = {}
with open('/opt/gen-ui/.env') as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            env[k.strip()] = v.strip()

def env_to_js(d):
    lines = []
    for k, v in d.items():
        v2 = v.replace('\\', '\\\\').replace("'", "\\'")
        lines.append(f"        '{k}': '{v2}'")
    return ',\n'.join(lines)

frontend_env = {**env, 'PORT': '3100', 'NODE_ENV': 'production', 'HOSTNAME': '0.0.0.0'}
bff_env = {**env, 'PORT': '4010', 'NODE_ENV': 'production'}
agent_env = {**env, 'PATH': '/home/deploy/.local/bin:/usr/local/bin:/usr/bin:/bin'}

config = """module.exports = {
  apps: [
    {
      name: 'director-frontend',
      script: '/opt/gen-ui/apps/frontend/.next/standalone/apps/frontend/server.js',
      env: {
""" + env_to_js(frontend_env) + """
      },
      error_file: '/opt/gen-ui/logs/frontend-error.log',
      out_file: '/opt/gen-ui/logs/frontend-out.log',
    },
    {
      name: 'director-bff',
      script: '/opt/gen-ui/apps/bff/dist/server.js',
      env: {
""" + env_to_js(bff_env) + """
      },
      error_file: '/opt/gen-ui/logs/bff-error.log',
      out_file: '/opt/gen-ui/logs/bff-out.log',
    },
    {
      name: 'director-agent',
      script: '/home/deploy/.local/bin/uv',
      args: 'run langgraph dev --port 8123 --no-browser',
      cwd: '/opt/gen-ui/apps/agent',
      env: {
""" + env_to_js(agent_env) + """
      },
      error_file: '/opt/gen-ui/logs/agent-error.log',
      out_file: '/opt/gen-ui/logs/agent-out.log',
    },
  ],
};
"""

with open('/opt/gen-ui/ecosystem.config.js', 'w') as f:
    f.write(config)
print('ecosystem.config.js written')
