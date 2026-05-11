"""TimingMiddleware — per-turn wall-time logging for the agent loop.

Wraps the model call and each tool call with `time.perf_counter()` deltas and
prints a single human-readable line per turn:

    [turn 7] model=2.4s tool:fetch_notion_leads=1.1s tool:setLeads=0.04s total=3.6s first_token=0.9s

A "turn" here is one user-message → final-assistant-message cycle. Inside that
turn the model may be called multiple times (each call followed by tool
invocations until the model stops calling tools). We aggregate the model time
across those inner calls and accumulate per-tool wall time per tool name.

We deliberately keep this dependency-free — `time.perf_counter()` and a small
per-thread dict are enough for local dev. Production observability (langsmith /
langfuse / otel) is out of scope for phase 02.

NOTE on `first_token`: ideally this is the wall-clock delta between turn-start
and the first model-output chunk hitting the SSE stream. Hooking into the
streaming chunk boundary cleanly via `wrap_model_call` is non-trivial because
the handler returns a fully-collected `ModelResponse` rather than a stream. As
a stand-in, we report `first_token` = time from turn-start until the FIRST
model-call (or tool-call, whichever comes first) returns. For an agent that
streams tokens immediately as part of the model call, this is roughly
equivalent. For an agent that buffers, this overstates first-token time —
which is the conservative direction for a budget check.
"""

from __future__ import annotations

import threading
import time
from collections.abc import Awaitable, Callable
from typing import Any

from langchain.agents.middleware.types import (
    AgentMiddleware,
    ModelRequest,
    ModelResponse,
    ToolCallRequest,
)
from langchain_core.messages import ToolMessage
from langgraph.types import Command


# Global turn counter, protected by a lock for concurrent runs.
_turn_counter = 0
_turn_counter_lock = threading.Lock()


class _TurnTiming:
    """Mutable per-turn accumulator."""

    __slots__ = (
        "turn_id",
        "turn_start",
        "first_event_at",
        "model_total",
        "tool_totals",
    )

    def __init__(self, turn_id: int) -> None:
        self.turn_id = turn_id
        self.turn_start = time.perf_counter()
        # Wall-clock at which the first inner event (model call or tool call)
        # returned. Used as a stand-in for "first token" — see module docstring.
        self.first_event_at: float | None = None
        self.model_total: float = 0.0
        # name -> total seconds across all calls in this turn
        self.tool_totals: dict[str, float] = {}


class TimingMiddleware(AgentMiddleware):
    """Wraps model + tool calls with `time.perf_counter()` deltas.

    Lifecycle:
      - `before_agent`: bump turn counter, stash a fresh `_TurnTiming`.
      - `wrap_model_call` / `awrap_model_call`: time the model invocation,
        accumulate into `model_total`, capture `first_event_at` if unset.
      - `wrap_tool_call` / `awrap_tool_call`: time the tool invocation,
        accumulate into `tool_totals[name]`, capture `first_event_at` if unset.
      - `after_agent`: emit the one-line summary.
    """

    def __init__(self) -> None:
        super().__init__()
        # Keyed by thread_id so concurrent runs don't clobber each other.
        self._runs: dict[str, _TurnTiming] = {}
        self._lock = threading.Lock()

    # ------------------------------------------------------------------ turn
    @staticmethod
    def _thread_key(state: Any) -> str:
        """Extract a key to disambiguate concurrent runs."""
        # Try configurable.thread_id first (LangGraph standard).
        try:
            from langgraph.config import get_config
            cfg = get_config().get("configurable", {})
            tid = cfg.get("thread_id", "")
            if tid:
                return str(tid)
        except Exception:  # noqa: BLE001
            pass
        # Fallback: use the OS thread id.
        return str(threading.get_ident())

    def before_agent(self, state: Any, runtime: Any) -> dict[str, Any] | None:  # noqa: ARG002
        global _turn_counter
        with _turn_counter_lock:
            _turn_counter += 1
            turn_id = _turn_counter
        key = self._thread_key(state)
        with self._lock:
            self._runs[key] = _TurnTiming(turn_id=turn_id)
        return None

    async def abefore_agent(  # noqa: D401
        self, state: Any, runtime: Any
    ) -> dict[str, Any] | None:
        return self.before_agent(state, runtime)

    def after_agent(self, state: Any, runtime: Any) -> dict[str, Any] | None:  # noqa: ARG002
        key = self._thread_key(state)
        self._emit(key)
        return None

    async def aafter_agent(  # noqa: D401
        self, state: Any, runtime: Any
    ) -> dict[str, Any] | None:
        return self.after_agent(state, runtime)

    # --------------------------------------------------------------- model
    def wrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], ModelResponse],
    ) -> ModelResponse:
        start = time.perf_counter()
        try:
            return handler(request)
        finally:
            elapsed = time.perf_counter() - start
            self._record_model(elapsed)

    async def awrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], Awaitable[ModelResponse]],
    ) -> ModelResponse:
        start = time.perf_counter()
        try:
            return await handler(request)
        finally:
            elapsed = time.perf_counter() - start
            self._record_model(elapsed)

    def _current(self) -> _TurnTiming | None:
        """Return the timing accumulator for the current run."""
        key = self._thread_key(None)
        with self._lock:
            return self._runs.get(key)

    def _record_model(self, elapsed: float) -> None:
        cur = self._current()
        if cur is None:
            return
        cur.model_total += elapsed
        if cur.first_event_at is None:
            cur.first_event_at = time.perf_counter()

    # ---------------------------------------------------------------- tool
    def wrap_tool_call(
        self,
        request: ToolCallRequest,
        handler: Callable[[ToolCallRequest], ToolMessage | Command],
    ) -> ToolMessage | Command:
        name = self._tool_name(request)
        start = time.perf_counter()
        try:
            return handler(request)
        finally:
            elapsed = time.perf_counter() - start
            self._record_tool(name, elapsed)

    async def awrap_tool_call(
        self,
        request: ToolCallRequest,
        handler: Callable[[ToolCallRequest], Awaitable[ToolMessage | Command]],
    ) -> ToolMessage | Command:
        name = self._tool_name(request)
        start = time.perf_counter()
        try:
            return await handler(request)
        finally:
            elapsed = time.perf_counter() - start
            self._record_tool(name, elapsed)

    def _record_tool(self, name: str, elapsed: float) -> None:
        cur = self._current()
        if cur is None:
            return
        cur.tool_totals[name] = cur.tool_totals.get(name, 0.0) + elapsed
        if cur.first_event_at is None:
            cur.first_event_at = time.perf_counter()

    @staticmethod
    def _tool_name(request: ToolCallRequest) -> str:
        try:
            return str(request.tool_call.get("name", "<unknown>"))
        except Exception:  # noqa: BLE001 - never fail the turn for telemetry
            return "<unknown>"

    # --------------------------------------------------------------- emit
    def _emit(self, key: str) -> None:
        with self._lock:
            cur = self._runs.pop(key, None)
        if cur is None:
            return
        total = time.perf_counter() - cur.turn_start
        first_token = (
            cur.first_event_at - cur.turn_start
            if cur.first_event_at is not None
            else total
        )
        tool_parts = " ".join(
            f"tool:{name}={t:.2f}s" for name, t in cur.tool_totals.items()
        )
        line = (
            f"[turn {cur.turn_id}] model={cur.model_total:.2f}s "
            + (tool_parts + " " if tool_parts else "")
            + f"total={total:.2f}s first_token={first_token:.2f}s"
        )
        print(line, flush=True)
