"""Gemini-oriented tool-schema sanitizer.

Gemini's proto-based function-declaration format does not support JSON Schema
union types such as ``"type": ["string", "null"]``. When LangChain passes tool
schemas through an OpenAI-compatible endpoint that proxies to Gemini, the
request can be rejected with a proto list/type error.

Default DevCut planners (NVIDIA NIM, Venice) use stock ``ChatOpenAI`` and do
not need this. Keep ``GeminiCompatibleChatOpenAI`` for Gemini-backed OpenAI
gateways if you add one later.

* ``sanitize_schema(obj)`` — rewrite list ``type``, drop ``$schema`` /
  ``title`` / ``additionalProperties``, map ``const`` → ``enum``.
* ``GeminiCompatibleChatOpenAI`` — ``ChatOpenAI`` that sanitizes tools.
"""

from __future__ import annotations

import copy
from typing import Any

from langchain_openai import ChatOpenAI


def sanitize_schema(obj: Any) -> Any:  # noqa: ANN401
    """Recursively sanitize a JSON-Schema-like dict for Gemini compatibility."""
    if isinstance(obj, list):
        return [sanitize_schema(item) for item in obj]
    if not isinstance(obj, dict):
        return obj

    result: dict[str, Any] = {}
    for key, value in obj.items():
        # Drop keys Gemini rejects at the top level of a schema object.
        if key in ("$schema", "title", "additionalProperties"):
            continue

        if key == "type" and isinstance(value, list):
            # ["string", "null"] → "string"
            non_null = [t for t in value if t != "null"]
            result[key] = non_null[0] if non_null else "string"
            continue

        if key == "const":
            # Gemini doesn't support "const"; map to single-value enum.
            result["enum"] = [value]
            continue

        result[key] = sanitize_schema(value)

    # Gemini rejects "required" entries that don't appear in "properties".
    # Filter required to only include keys that exist in the sanitized properties.
    if "required" in result and "properties" in result:
        valid_props = set(result["properties"].keys())
        result["required"] = [r for r in result["required"] if r in valid_props]
        if not result["required"]:
            del result["required"]

    return result


def sanitize_tools(tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Sanitize a list of OpenAI-format tool definitions."""
    sanitized = []
    for tool in tools:
        t = copy.deepcopy(tool)
        if "function" in t and "parameters" in t["function"]:
            t["function"]["parameters"] = sanitize_schema(t["function"]["parameters"])
        sanitized.append(t)
    return sanitized


class GeminiCompatibleChatOpenAI(ChatOpenAI):
    """ChatOpenAI that sanitizes tool schemas for Gemini-backed OpenAI gateways."""

    def _get_request_payload(self, input_: Any, *, stop: list[str] | None = None, **kwargs: Any) -> dict[str, Any]:  # type: ignore[override]
        payload = super()._get_request_payload(input_, stop=stop, **kwargs)
        if "tools" in payload and isinstance(payload["tools"], list):
            payload["tools"] = sanitize_tools(payload["tools"])
        return payload
