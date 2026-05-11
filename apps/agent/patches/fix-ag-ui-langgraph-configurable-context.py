"""
Patch ag-ui-langgraph to avoid sending both `configurable` and `context`
to LangGraph >=0.6.0 which rejects the combination.

Run after `uv pip install` / `pip install` in the agent venv:
    python patches/fix-ag-ui-langgraph-configurable-context.py

See: https://github.com/ag-ui-protocol/ag-ui/issues/XXX
"""
import importlib.util, pathlib, sys

spec = importlib.util.find_spec("ag_ui_langgraph")
if spec is None or spec.origin is None:
    print("ag_ui_langgraph not installed – skipping patch")
    sys.exit(0)

agent_py = pathlib.Path(spec.origin)
content = agent_py.read_text()

MARKER = "# LangGraph >=0.6.0 rejects both configurable and context."
if MARKER in content:
    print("ag_ui_langgraph already patched – nothing to do")
    sys.exit(0)

OLD = """\
        if config:
            kwargs['config'] = config"""

NEW = """\
        if config:
            # LangGraph >=0.6.0 rejects both configurable and context.
            # When context is already set, strip configurable from config.
            if 'context' in kwargs and isinstance(config, dict) and 'configurable' in config:
                config = {k: v for k, v in config.items() if k != 'configurable'}
            kwargs['config'] = config"""

if OLD not in content:
    print("WARNING: expected code pattern not found in ag_ui_langgraph/agent.py – patch skipped")
    sys.exit(1)

agent_py.write_text(content.replace(OLD, NEW, 1))
print(f"Patched {agent_py}")
