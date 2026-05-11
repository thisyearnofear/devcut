"""LangGraph entry point for the Director / Storyboard agent.

Sibling to `main.py` (the leads agent). Loaded by `langgraph.json` as the
`director` graph. Same runtime selector pattern, but wires:
- StoryboardStateMiddleware instead of LeadStateMiddleware
- Runway-powered backend tools instead of Notion tools
- The director system prompt (storyboard_prompts.py)

The two graphs share the same Postgres-backed Intelligence threads but
each lives at its own `agentId` on the BFF — `default` for leads,
`director` for the storyboard canvas.
"""

from __future__ import annotations

import os

from dotenv import load_dotenv
from copilotkit import CopilotKitMiddleware

from src.audio_client import boot_status as _audio_boot_status
from src.intelligence_cleanup import wipe_orphan_threads
from src.runway_client import boot_status as _runway_boot_status
from src.runway_tools import load_runway_tools
from src.storyboard_prompts import build_director_prompt
from src.storyboard_state import StoryboardStateMiddleware
from src.timing import TimingMiddleware


load_dotenv()

# Cleanup is idempotent — safe to call from both main.py and director.py.
wipe_orphan_threads()


_AGENT_RUNTIME = os.getenv("AGENT_RUNTIME", "gemini-flash-deep")
print(f"[director] AGENT_RUNTIME={_AGENT_RUNTIME}", flush=True)

_gemini_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or ""
if _AGENT_RUNTIME.startswith("gemini-") and (
    not _gemini_key or _gemini_key.startswith("stub")
):
    print(
        "\n  [director] GEMINI_API_KEY is unset or a stub.\n"
        "   The director will boot but chat will fail on the first turn.\n",
        flush=True,
    )

print(f"[director] {_runway_boot_status()}", flush=True)


backend_tools = load_runway_tools()


SYSTEM_PROMPT = build_director_prompt(_runway_boot_status())


# ----------------------------------------------------------------- build graph

# We can't reuse `runtime.build_graph` directly because that helper hard-codes
# LeadStateMiddleware. The director needs its own middleware chain (TimingMW
# → StoryboardStateMW → CopilotKitMW), so we mirror the runtime selector
# locally — small and explicit.

from langgraph.graph.state import CompiledStateGraph
from src.runtime import _build_noop, NOOP_FALLBACK_MESSAGE  # type: ignore[attr-defined]


def _build_director_graph() -> CompiledStateGraph:
    """Compose the director graph for the active AGENT_RUNTIME."""
    if _AGENT_RUNTIME.startswith("gemini-") and (
        not _gemini_key or _gemini_key.startswith("stub")
    ):
        return _build_noop(NOOP_FALLBACK_MESSAGE)

    timing = TimingMiddleware()
    storyboard = StoryboardStateMiddleware()
    copilotkit = CopilotKitMiddleware()
    middleware = [timing, storyboard, copilotkit]

    if _AGENT_RUNTIME == "gemini-flash-deep":
        from deepagents import create_deep_agent
        from langchain_google_genai import ChatGoogleGenerativeAI

        llm = ChatGoogleGenerativeAI(
            model="gemini-3.1-flash-lite",
            temperature=0,
            api_key=_gemini_key or "stub",
        )
        return create_deep_agent(
            model=llm,
            tools=backend_tools,
            system_prompt=SYSTEM_PROMPT,
            middleware=middleware,
        )

    if _AGENT_RUNTIME == "gemini-flash-react":
        from langchain.agents import create_agent
        from langchain_google_genai import ChatGoogleGenerativeAI

        llm = ChatGoogleGenerativeAI(
            model="gemini-3.1-flash-lite",
            temperature=0,
            api_key=_gemini_key or "stub",
        )
        return create_agent(
            model=llm,
            tools=backend_tools,
            system_prompt=SYSTEM_PROMPT,
            middleware=middleware,
        )

    if _AGENT_RUNTIME == "claude-sonnet-4-6-react":
        from langchain.agents import create_agent
        from langchain_anthropic import ChatAnthropic

        api_key = os.getenv("ANTHROPIC_API_KEY") or "stub"
        llm = ChatAnthropic(
            model="claude-sonnet-4-6",
            temperature=0,
            api_key=api_key,
        )
        return create_agent(
            model=llm,
            tools=backend_tools,
            system_prompt=SYSTEM_PROMPT,
            middleware=middleware,
        )

    # Unknown runtime — degrade to noop with a helpful message.
    print(
        f"[director] WARN: unknown AGENT_RUNTIME={_AGENT_RUNTIME!r}; using noop",
        flush=True,
    )
    return _build_noop(NOOP_FALLBACK_MESSAGE)


graph = _build_director_graph()
