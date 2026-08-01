"""Planner LLM factory — NVIDIA → Venice → Gemini.

Canonical docs: ``docs/providers.md``.

Both NVIDIA NIM and Venice are OpenAI-compatible. Gemini uses the Google
GenAI LangChain integration. AISA is not supported.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Literal, Sequence

from langchain_core.language_models.chat_models import BaseChatModel

ProviderName = Literal["nvidia", "venice", "gemini"]

NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"
VENICE_BASE_URL = "https://api.venice.ai/api/v1"

DEFAULT_NVIDIA_MODEL = "nvidia/llama-3.1-nemotron-70b-instruct"
DEFAULT_VENICE_MODEL = "zai-org-glm-5-1"
DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite"

NOOP_FALLBACK_MESSAGE = (
    "Set at least one planner key to enable the agent: "
    "`NVIDIA_API_KEY` (primary), `VENICE_API_KEY`, or `GEMINI_API_KEY`. "
    "See docs/providers.md."
)


def _key_ok(value: str | None) -> bool:
    if not value:
        return False
    v = value.strip()
    if not v:
        return False
    return not v.startswith("stub")


@dataclass(frozen=True)
class ProviderSlot:
    name: ProviderName
    model: str
    configured: bool


def provider_inventory() -> list[ProviderSlot]:
    """Return configured status for each provider in priority order."""
    return [
        ProviderSlot(
            name="nvidia",
            model=os.getenv("NVIDIA_MODEL", DEFAULT_NVIDIA_MODEL),
            configured=_key_ok(os.getenv("NVIDIA_API_KEY")),
        ),
        ProviderSlot(
            name="venice",
            model=os.getenv("VENICE_MODEL", DEFAULT_VENICE_MODEL),
            configured=_key_ok(os.getenv("VENICE_API_KEY")),
        ),
        ProviderSlot(
            name="gemini",
            model=os.getenv("GEMINI_MODEL", DEFAULT_GEMINI_MODEL),
            configured=_key_ok(
                os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
            ),
        ),
    ]


def chain_names_for_runtime(runtime: str) -> tuple[ProviderName, ...]:
    """Which providers participate for a given ``AGENT_RUNTIME``."""
    if runtime.startswith("venice-"):
        return ("venice", "gemini")
    if runtime.startswith("gemini-"):
        return ("gemini",)
    # nvidia-react / nvidia-deep / unknown → full priority chain
    return ("nvidia", "venice", "gemini")


def _make_nvidia() -> BaseChatModel:
    from langchain_openai import ChatOpenAI

    return ChatOpenAI(
        model=os.getenv("NVIDIA_MODEL", DEFAULT_NVIDIA_MODEL),
        temperature=0,
        api_key=os.environ["NVIDIA_API_KEY"],
        base_url=os.getenv("NVIDIA_BASE_URL", NVIDIA_BASE_URL),
    )


def _make_venice() -> BaseChatModel:
    from langchain_openai import ChatOpenAI

    return ChatOpenAI(
        model=os.getenv("VENICE_MODEL", DEFAULT_VENICE_MODEL),
        temperature=0,
        api_key=os.environ["VENICE_API_KEY"],
        base_url=os.getenv("VENICE_BASE_URL", VENICE_BASE_URL),
    )


def _make_gemini() -> BaseChatModel:
    from langchain_google_genai import ChatGoogleGenerativeAI

    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or ""
    return ChatGoogleGenerativeAI(
        model=os.getenv("GEMINI_MODEL", DEFAULT_GEMINI_MODEL),
        temperature=0,
        api_key=api_key,
    )


_BUILDERS = {
    "nvidia": _make_nvidia,
    "venice": _make_venice,
    "gemini": _make_gemini,
}


def resolve_planner_chain(runtime: str) -> list[tuple[ProviderName, BaseChatModel]]:
    """Build concrete chat models for the runtime's fallback chain.

    Skips providers whose API keys are missing or stubs.
    """
    inventory = {p.name: p for p in provider_inventory()}
    out: list[tuple[ProviderName, BaseChatModel]] = []
    for name in chain_names_for_runtime(runtime):
        if not inventory[name].configured:
            continue
        out.append((name, _BUILDERS[name]()))
    return out


def bind_planner_with_tools(
    chain: Sequence[tuple[ProviderName, BaseChatModel]],
    tools: list[Any],
    *,
    tool_choice: str | None = "any",
) -> Any:
    """Bind tools on each model and compose ``with_fallbacks``."""
    if not chain:
        raise ValueError("empty planner chain")

    bound = []
    for _name, llm in chain:
        if tool_choice is None:
            bound.append(llm.bind_tools(tools))
        else:
            bound.append(llm.bind_tools(tools, tool_choice=tool_choice))

    primary = bound[0]
    if len(bound) == 1:
        return primary
    return primary.with_fallbacks(bound[1:])


def planner_display_label(runtime: str | None = None) -> str:
    """Short UI label for the active / first configured provider."""
    runtime = runtime or os.getenv("AGENT_RUNTIME", "nvidia-react")
    for name, _llm in resolve_planner_chain(runtime):
        slot = next(p for p in provider_inventory() if p.name == name)
        if name == "nvidia":
            return f"{slot.model} · NVIDIA"
        if name == "venice":
            return f"{slot.model} · Venice"
        return f"{slot.model} · Gemini"
    return "planner unset"
