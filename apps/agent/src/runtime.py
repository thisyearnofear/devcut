"""Switchable runtime factory for the lead-triage agent.

Planner LLM: NVIDIA → Venice → Gemini (see ``llm_providers.py`` /
``docs/providers.md``). Same middleware chain for every runtime —
``TimingMiddleware``, ``LeadStateMiddleware``, ``CopilotKitMiddleware``.
"""

from __future__ import annotations

import os
from typing import Literal

from langgraph.graph.state import CompiledStateGraph

from copilotkit import CopilotKitMiddleware

from .lead_state import LeadStateMiddleware
from .llm_providers import (
    NOOP_FALLBACK_MESSAGE,
    bind_planner_with_tools,
    resolve_planner_chain,
)
from .timing import TimingMiddleware


RuntimeName = Literal[
    "nvidia-react",
    "nvidia-deep",
    "venice-react",
    "gemini-flash-deep",
    "gemini-flash-react",
    "claude-sonnet-4-6-react",
    "noop",
]


_VALID_RUNTIMES = (
    "nvidia-react",
    "nvidia-deep",
    "venice-react",
    "gemini-flash-deep",
    "gemini-flash-react",
    "claude-sonnet-4-6-react",
    "noop",
)


def build_graph(
    runtime: str,
    *,
    tools: list,
    system_prompt: str,
) -> CompiledStateGraph:
    """Compile a graph for the named runtime."""
    if runtime not in _VALID_RUNTIMES:
        print(
            f"[runtime] WARN: unknown AGENT_RUNTIME={runtime!r}; "
            f"falling back to nvidia-react",
            flush=True,
        )
        runtime = "nvidia-react"

    timing = TimingMiddleware()
    lead_state = LeadStateMiddleware()
    copilotkit = CopilotKitMiddleware()
    middleware = [timing, lead_state, copilotkit]

    if runtime == "noop":
        return _build_noop(NOOP_FALLBACK_MESSAGE)

    if runtime == "claude-sonnet-4-6-react":
        return _build_claude_react(tools, system_prompt, middleware)

    chain = resolve_planner_chain(runtime)
    if not chain:
        print(
            "[runtime] no planner keys configured — using noop fallback graph.",
            flush=True,
        )
        return _build_noop(NOOP_FALLBACK_MESSAGE)

    # Gemini native bind can be picky about tool_choice; OpenAI-compat
    # providers use tool_choice="any" so the first turn always tools.
    tool_choice = "any"
    llm_with_tools = bind_planner_with_tools(chain, tools, tool_choice=tool_choice)
    print(
        f"[runtime] planner_chain={[n for n, _ in chain]} runtime={runtime}",
        flush=True,
    )

    if runtime.endswith("-deep") or runtime == "gemini-flash-deep":
        from deepagents import create_deep_agent

        return create_deep_agent(
            model=llm_with_tools,
            tools=tools,
            system_prompt=system_prompt,
            middleware=middleware,
        )

    from langchain.agents import create_agent

    return create_agent(
        model=llm_with_tools,
        tools=tools,
        system_prompt=system_prompt,
        middleware=middleware,
    )


# ---------------------------------------------------------------------- noop

from langgraph.graph.message import add_messages as _add_messages
from typing_extensions import Annotated as _Annotated, TypedDict as _TypedDict


class _NoopState(_TypedDict):
    messages: _Annotated[list, _add_messages]


def _build_noop(message: str) -> CompiledStateGraph:
    """No-LLM fallback that replies with ``message`` immediately."""
    from langchain_core.messages import AIMessage
    from langgraph.graph import END, START, StateGraph

    def _respond(_state: _NoopState) -> dict:
        return {"messages": [AIMessage(content=message, id="noop-fallback")]}

    graph = StateGraph(_NoopState)
    graph.add_node("respond", _respond)
    graph.add_edge(START, "respond")
    graph.add_edge("respond", END)
    return graph.compile()


# --------------------------------------------------------------------- claude

def _build_claude_react(
    tools: list, system_prompt: str, middleware: list
) -> CompiledStateGraph:
    """Optional Claude path — not part of the default NVIDIA→Venice→Gemini chain."""
    from langchain.agents import create_agent
    from langchain_anthropic import ChatAnthropic

    api_key = os.getenv("ANTHROPIC_API_KEY") or ""
    if not api_key:
        print(
            "\n  ANTHROPIC_API_KEY is unset.\n"
            "   The agent will boot but the first chat turn will fail.\n",
            flush=True,
        )

    llm = ChatAnthropic(
        model="claude-sonnet-4-6",
        temperature=0,
        api_key=api_key or "stub",
    )
    return create_agent(
        model=llm,
        tools=tools,
        system_prompt=system_prompt,
        middleware=middleware,
    )
