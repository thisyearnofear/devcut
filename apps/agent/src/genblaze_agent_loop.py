"""Genblaze AgentLoop — quality gate for the Winning artifact clip.

Envelope feature for the Backblaze hackathon: judges see Genblaze iterate
until the clip is hash-bound and the provenance manifest verifies, with all
takes landing on B2 via ObjectStorageSink.
"""

from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass
from typing import Any, Optional

from .media_storage import b2_enabled


def _log(level: str, msg: str, **fields) -> None:
    record = {"ts": time.time(), "level": level, "logger": "genblaze_agent_loop", "msg": msg}
    record.update(fields)
    print(json.dumps(record), flush=True)


@dataclass
class AgentLoopOutcome:
    """UI-facing summary of the AgentLoop run."""

    passed: bool
    iterations: int
    feedback: Optional[str]
    url: Optional[str]
    sha256: Optional[str]
    manifest_uri: Optional[str]
    canonical_hash: Optional[str]
    total_cost_usd: Optional[float] = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "passed": self.passed,
            "iterations": self.iterations,
            "feedback": self.feedback,
            "url": self.url,
            "sha256": self.sha256,
            "manifest_uri": self.manifest_uri,
            "canonical_hash": self.canonical_hash,
            "total_cost_usd": self.total_cost_usd,
        }


def agent_loop_enabled() -> bool:
    """Opt-out with GENBLAZE_AGENT_LOOP=0. Default on when Genblaze video is on."""
    raw = os.getenv("GENBLAZE_AGENT_LOOP", "1").strip().lower()
    if raw in ("0", "false", "no", "off"):
        return False
    return True


def is_winning_beat(beat: str | None) -> bool:
    b = (beat or "").lower()
    return "winning" in b or "artifact" in b


def refine_winning_clip(
    image_url: str,
    prompt: str,
    duration: int = 5,
    ratio: str = "1280:720",
    *,
    shot_id: Optional[str] = None,
    max_iterations: int = 2,
) -> AgentLoopOutcome:
    """Run Genblaze AgentLoop around image→video until manifest verifies.

    Falls back to a single ``run_shot_video`` pass when AgentLoop cannot run
    (no live key / MOCK).
    """
    from genblaze_core import (
        AgentContext,
        AgentLoop,
        CallableEvaluator,
        EvaluationResult,
        Modality,
        Pipeline,
    )
    from genblaze_core.providers import RetryPolicy
    from genblaze_runway import RunwayProvider

    from .genblaze_bridge import (
        _cap_duration,
        _reference_asset,
        _video_model,
        genblaze_video_enabled,
        run_shot_video,
    )
    from .runway_client import _current_thread_id, _effective_api_key

    if not genblaze_video_enabled() or not agent_loop_enabled():
        bridge = run_shot_video(
            image_url, prompt, duration=duration, ratio=ratio, shot_id=shot_id
        )
        return AgentLoopOutcome(
            passed=bool(bridge.sha256),
            iterations=1,
            feedback=None,
            url=bridge.url,
            sha256=bridge.sha256,
            manifest_uri=bridge.manifest_uri,
            canonical_hash=bridge.canonical_hash,
        )

    api_secret = _effective_api_key()
    model = _video_model()
    capped = _cap_duration(duration, model)
    thread_id = _current_thread_id() or "director"
    reference = _reference_asset(image_url)
    provider = RunwayProvider(
        api_secret=api_secret,
        retry_policy=RetryPolicy.conservative(),
    )

    def build_pipeline(ctx: AgentContext) -> Pipeline:
        p = prompt
        if ctx.last_evaluation and ctx.last_evaluation.feedback:
            p = f"{prompt}. Refinement: {ctx.last_evaluation.feedback}"
        name = f"winning-take-{shot_id or 'anon'}-i{ctx.iteration}"
        return (
            Pipeline(name, tenant_id=thread_id)
            .step(
                provider,
                model=model,
                prompt=p,
                modality=Modality.VIDEO,
                duration=capped,
                ratio=ratio,
                external_inputs=[reference],
            )
        )

    def evaluate(result) -> EvaluationResult:
        try:
            if not result.run.steps or not result.run.steps[0].assets:
                return EvaluationResult(
                    passed=False,
                    score=0.0,
                    feedback="no assets — regenerate with stable reference still",
                )
            asset = result.run.steps[0].assets[0]
            verified = bool(asset.sha256) and bool(result.manifest.verify())
            if verified:
                return EvaluationResult(passed=True, score=1.0, feedback=None)
            return EvaluationResult(
                passed=False,
                score=0.3,
                feedback="ensure hash-bound durable output and verifiable manifest",
            )
        except Exception as exc:  # noqa: BLE001
            return EvaluationResult(
                passed=False,
                score=0.0,
                feedback=f"verify failed: {exc}",
            )

    loop = AgentLoop(build_pipeline, CallableEvaluator(evaluate), max_iterations=max_iterations)
    # Do not pass a shared sink into AgentLoop — Genblaze sinks are single-use
    # and closed after each pipeline.run(). Persist the winning take afterward.
    out = loop.run(timeout=600)

    last = out.iterations[-1] if out.iterations else None
    url = sha = manifest_uri = canonical = None
    feedback = None
    if last and last.result and last.result.run.steps and last.result.run.steps[0].assets:
        asset = last.result.run.steps[0].assets[0]
        url = asset.url
        sha = asset.sha256
        manifest_uri = getattr(last.result.manifest, "manifest_uri", None)
        canonical = getattr(last.result.manifest, "canonical_hash", None)
    if last and last.evaluation:
        feedback = last.evaluation.feedback

    if url and b2_enabled():
        from .media_storage import persist_url

        stored = persist_url(
            url,
            content_type="video/mp4",
            tenant_id=thread_id,
            strategy="hierarchical",
        )
        if stored:
            url = stored.url
            sha = stored.sha256 or sha

    outcome = AgentLoopOutcome(
        passed=bool(out.passed),
        iterations=len(out.iterations),
        feedback=feedback,
        url=url,
        sha256=sha,
        manifest_uri=manifest_uri,
        canonical_hash=canonical,
        total_cost_usd=getattr(out, "total_cost_usd", None),
    )
    _log(
        "INFO",
        "winning_loop_done",
        passed=outcome.passed,
        iterations=outcome.iterations,
        url=(outcome.url or "")[:120],
    )
    return outcome
