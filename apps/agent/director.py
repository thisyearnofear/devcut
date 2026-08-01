"""LangGraph entry point for the DevCut director / storyboard agent.

Sibling to `main.py` (the leads agent). Loaded by `langgraph.json` as the
`director` graph. Planner LLM: NVIDIA → Venice → Gemini (see
`src/llm_providers.py` and `docs/providers.md`).
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path

from dotenv import load_dotenv
from copilotkit import CopilotKitMiddleware

from src.audio_client import boot_status as _audio_boot_status
from src.intelligence_cleanup import wipe_orphan_threads
from src.llm_providers import (
    NOOP_FALLBACK_MESSAGE,
    bind_planner_with_tools,
    provider_inventory,
    resolve_planner_chain,
)
from src.runway_client import boot_status as _runway_boot_status
from src.runway_tools import load_runway_tools
from src.storyboard_prompts import build_director_prompt
from src.storyboard_state import StoryboardStateMiddleware
from src.timing import TimingMiddleware


# Monorepo root .env is the SoT; apps/agent/.env can override for local tweaks.
_ROOT_ENV = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(_ROOT_ENV, override=False)
load_dotenv(override=True)

if os.getenv("WIPE_ORPHAN_THREADS_ON_BOOT") == "1":
    wipe_orphan_threads()


_AGENT_RUNTIME = os.getenv("AGENT_RUNTIME", "nvidia-react")
_LOG_LEVEL = os.getenv("AGENT_LOG_LEVEL", "INFO").upper()


def _log(level: str, msg: str, **extra: object) -> None:
    print(
        json.dumps(
            {
                "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "level": level,
                "logger": "director",
                "msg": msg,
                **extra,
            }
        ),
        flush=True,
    )


_log("INFO", "boot", agent_runtime=_AGENT_RUNTIME, log_level=_LOG_LEVEL)
_log(
    "INFO",
    "planner_inventory",
    providers=[
        {"name": p.name, "model": p.model, "configured": p.configured}
        for p in provider_inventory()
    ],
)
_log("INFO", "runway_status", status=_runway_boot_status())
_log("INFO", "audio_status", status=_audio_boot_status())


backend_tools = load_runway_tools()
SYSTEM_PROMPT = build_director_prompt(_runway_boot_status())


from langgraph.graph.state import CompiledStateGraph
from src.runtime import _build_noop  # type: ignore[attr-defined]


def _build_director_graph() -> CompiledStateGraph:
    """Compose the director graph for the active AGENT_RUNTIME."""
    timing = TimingMiddleware()
    storyboard = StoryboardStateMiddleware()
    copilotkit = CopilotKitMiddleware()
    middleware = [timing, storyboard, copilotkit]

    chain = resolve_planner_chain(_AGENT_RUNTIME)
    if not chain:
        _log("WARN", "planner_missing", fallback="noop", runtime=_AGENT_RUNTIME)
        return _build_noop(NOOP_FALLBACK_MESSAGE)

    llm_with_tools = bind_planner_with_tools(chain, backend_tools, tool_choice="any")
    _log(
        "INFO",
        "graph_build",
        runtime=_AGENT_RUNTIME,
        planner_chain=[{"provider": n, "model": getattr(m, "model_name", None) or getattr(m, "model", None)} for n, m in chain],
        tool_choice="any",
        tools=[t.name for t in backend_tools],
    )

    if _AGENT_RUNTIME.endswith("-deep") or _AGENT_RUNTIME == "gemini-flash-deep":
        from deepagents import create_deep_agent

        return create_deep_agent(
            model=llm_with_tools,
            tools=backend_tools,
            system_prompt=SYSTEM_PROMPT,
            middleware=middleware,
        )

    from langchain.agents import create_agent

    return create_agent(
        model=llm_with_tools,
        tools=backend_tools,
        system_prompt=SYSTEM_PROMPT,
        middleware=middleware,
    )


graph = _build_director_graph()
