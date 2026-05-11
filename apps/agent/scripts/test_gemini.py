#!/usr/bin/env python3
"""Standalone Gemini integration test.

Tests:
1. Basic text generation (no tools)
2. Tool-calling with tool_choice="any" (the critical path for director)
3. Streaming tool call (mirrors what the director graph does)

Usage:
    uv run python scripts/test_gemini.py
    GEMINI_API_KEY=... uv run python scripts/test_gemini.py
"""

from __future__ import annotations

import json
import os
import sys
import time
from typing import Any

from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or ""
MODEL = os.getenv("GEMINI_TEST_MODEL", "gemini-3.1-flash-lite")

PASS = "\033[32m✓\033[0m"
FAIL = "\033[31m✗\033[0m"
WARN = "\033[33m⚠\033[0m"


def _hdr(title: str) -> None:
    print(f"\n{'─'*60}")
    print(f"  {title}")
    print(f"{'─'*60}")


def _result(ok: bool, label: str, detail: str = "") -> None:
    icon = PASS if ok else FAIL
    print(f"  {icon}  {label}", f"  → {detail}" if detail else "")


# ── 1. Key check ─────────────────────────────────────────────────────────────

_hdr("0. Pre-flight")
if not GEMINI_API_KEY:
    print(f"  {FAIL}  GEMINI_API_KEY is not set — aborting")
    sys.exit(1)
_result(True, "GEMINI_API_KEY present", f"...{GEMINI_API_KEY[-6:]}")
_result(True, "Model", MODEL)

try:
    from langchain_google_genai import ChatGoogleGenerativeAI
    _result(True, "langchain_google_genai importable")
except ImportError as e:
    _result(False, "langchain_google_genai import failed", str(e))
    sys.exit(1)

# ── 2. Basic text generation ──────────────────────────────────────────────────

_hdr("1. Basic text generation (no tools)")
try:
    llm = ChatGoogleGenerativeAI(model=MODEL, temperature=0, api_key=GEMINI_API_KEY)
    t0 = time.perf_counter()
    resp = llm.invoke("Reply with exactly: PONG")
    elapsed = time.perf_counter() - t0
    content = resp.content if hasattr(resp, "content") else str(resp)
    ok = "PONG" in content.upper()
    _result(ok, "Got response", f"{elapsed:.2f}s — {content[:80]!r}")
except Exception as e:
    _result(False, "Exception", str(e))

# ── 3. Tool-calling (no tool_choice) ─────────────────────────────────────────

_hdr("2. Tool-calling — no tool_choice (baseline)")

from langchain_core.tools import tool  # noqa: E402


@tool
def generate_storyboard_plan(shots: list[dict[str, Any]]) -> str:
    """Generate a storyboard plan with a list of shots."""
    return json.dumps({"status": "ok", "shots": shots})


tools = [generate_storyboard_plan]

try:
    llm_base = ChatGoogleGenerativeAI(model=MODEL, temperature=0, api_key=GEMINI_API_KEY)
    llm_with_tools = llm_base.bind_tools(tools)
    t0 = time.perf_counter()
    resp = llm_with_tools.invoke(
        "Create a 2-shot storyboard plan for a sci-fi short film. "
        "You MUST call generate_storyboard_plan."
    )
    elapsed = time.perf_counter() - t0
    called = bool(getattr(resp, "tool_calls", None))
    tool_name = resp.tool_calls[0]["name"] if called else "—"
    _result(called, "Tool was called", f"{elapsed:.2f}s — {tool_name}")
    if not called:
        print(f"     content: {resp.content[:120]!r}")
        print(f"     {WARN}  Without tool_choice='any' the model may ignore tools")
except Exception as e:
    _result(False, "Exception", str(e))

# ── 4. Tool-calling with tool_choice="any" ────────────────────────────────────

_hdr("3. Tool-calling — tool_choice='any' (production path)")
try:
    llm_base2 = ChatGoogleGenerativeAI(model=MODEL, temperature=0, api_key=GEMINI_API_KEY)
    llm_forced = llm_base2.bind_tools(tools, tool_choice="any")
    t0 = time.perf_counter()
    resp2 = llm_forced.invoke(
        "Create a 2-shot storyboard plan for a sci-fi short film."
    )
    elapsed = time.perf_counter() - t0
    called = bool(getattr(resp2, "tool_calls", None))
    tool_name = resp2.tool_calls[0]["name"] if called else "—"
    args_preview = json.dumps(resp2.tool_calls[0].get("args", {}))[:120] if called else ""
    _result(called, "Tool was called with tool_choice='any'", f"{elapsed:.2f}s — {tool_name}")
    if called:
        _result(True, "Tool args", args_preview)
    else:
        print(f"     content: {resp2.content[:120]!r}")
        print(f"     {FAIL}  tool_choice='any' did NOT force a tool call — this is a regression")
except Exception as e:
    _result(False, "Exception", str(e))

# ── 5. Streaming tool call ────────────────────────────────────────────────────

_hdr("4. Streaming tool call (mirrors director graph)")
try:
    llm_base3 = ChatGoogleGenerativeAI(model=MODEL, temperature=0, api_key=GEMINI_API_KEY)
    llm_stream = llm_base3.bind_tools(tools, tool_choice="any")
    t0 = time.perf_counter()
    chunks = []
    for chunk in llm_stream.stream("Create a 1-shot storyboard plan for a horror film."):
        chunks.append(chunk)
    elapsed = time.perf_counter() - t0
    final = chunks[-1] if chunks else None
    called = bool(getattr(final, "tool_calls", None)) if final else False
    _result(len(chunks) > 0, f"Received {len(chunks)} chunks", f"{elapsed:.2f}s")
    _result(called, "Final chunk has tool_calls")
except Exception as e:
    _result(False, "Exception", str(e))

# ── 6. Fallback provider check ────────────────────────────────────────────────

_hdr("5. Fallback provider availability")

anthropic_key = os.getenv("ANTHROPIC_API_KEY", "")
openai_key = os.getenv("OPENAI_API_KEY", "")

if anthropic_key:
    try:
        from langchain_anthropic import ChatAnthropic
        llm_claude = ChatAnthropic(model="claude-haiku-3-5", temperature=0, api_key=anthropic_key)
        t0 = time.perf_counter()
        r = llm_claude.invoke("Reply with exactly: PONG")
        elapsed = time.perf_counter() - t0
        ok = "PONG" in (r.content if hasattr(r, "content") else str(r)).upper()
        _result(ok, "Anthropic Claude Haiku reachable", f"{elapsed:.2f}s")
    except Exception as e:
        _result(False, "Anthropic error", str(e)[:100])
else:
    print(f"  {WARN}  ANTHROPIC_API_KEY not set — skipping Claude fallback test")

if openai_key:
    try:
        from langchain_openai import ChatOpenAI
        llm_oai = ChatOpenAI(model="gpt-4o-mini", temperature=0, api_key=openai_key)
        t0 = time.perf_counter()
        r = llm_oai.invoke("Reply with exactly: PONG")
        elapsed = time.perf_counter() - t0
        ok = "PONG" in (r.content if hasattr(r, "content") else str(r)).upper()
        _result(ok, "OpenAI GPT-4o-mini reachable", f"{elapsed:.2f}s")
    except Exception as e:
        _result(False, "OpenAI error", str(e)[:100])
else:
    print(f"  {WARN}  OPENAI_API_KEY not set — skipping OpenAI fallback test")

print(f"\n{'─'*60}")
print("  Done.")
print(f"{'─'*60}\n")
