"""LangGraph entry point for the leads agent (`langgraph.json` → `default`).

Planner: NVIDIA → Venice → Gemini via ``src.runtime`` / ``src.llm_providers``.
"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

from src.intelligence_cleanup import wipe_orphan_threads
from src.lead_store import boot_status as _lead_store_boot_status
from src.llm_providers import resolve_planner_chain
from src.notion_tools import load_notion_tools
from src.prompts import build_system_prompt
from src.runtime import build_graph


_ROOT_ENV = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(_ROOT_ENV, override=False)
load_dotenv(override=True)

if os.getenv("WIPE_ORPHAN_THREADS_ON_BOOT") == "1":
    wipe_orphan_threads()


def _format_integration_status() -> str:
    try:
        line = _lead_store_boot_status()
    except Exception as e:  # noqa: BLE001
        print(f"[lead_store] FAILED: {e}", flush=True)
        return f"error: lead_store boot_status raised: {e}"

    print(f"[lead_store] {line}", flush=True)
    return line


_AGENT_RUNTIME = os.getenv("AGENT_RUNTIME", "nvidia-react")
print(f"[runtime] AGENT_RUNTIME={_AGENT_RUNTIME}", flush=True)

backend_tools = load_notion_tools()
_integration_status = _format_integration_status()
SYSTEM_PROMPT = build_system_prompt(_integration_status)

_chain = resolve_planner_chain(_AGENT_RUNTIME)
_use_noop = _AGENT_RUNTIME != "claude-sonnet-4-6-react" and not _chain
if _use_noop:
    print(
        "\n[runtime] No planner API keys — using noop fallback graph.\n"
        "          Set NVIDIA_API_KEY (or VENICE_API_KEY / GEMINI_API_KEY).\n",
        flush=True,
    )

graph = build_graph(
    "noop" if _use_noop else _AGENT_RUNTIME,
    tools=backend_tools,
    system_prompt=SYSTEM_PROMPT,
)


def main() -> None:
    import subprocess

    subprocess.run(
        ["langgraph", "dev", "--port", "8133"],
        check=True,
    )


if __name__ == "__main__":
    main()
