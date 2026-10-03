"""Cross-restart snapshot integrity (ADR-0005 verification follow-up).

A langgraph restart wipes the checkpoint, so the canvas is restored from the
B2 snapshot while the agent's own state is empty. Two things must then hold:
publishing must not erase the snapshot it just restored from, and a re-stitch
tool must be able to find the footage again.
"""

from __future__ import annotations

import unittest
from unittest import mock

from src import state_snapshots
from src.state_snapshots import SNAPSHOT_KEYS


class _InlineThread:
    def __init__(self, target=None, args=(), kwargs=None, daemon=None):
        self._target, self._args, self._kwargs = target, args, kwargs or {}

    def start(self):
        self._target(*self._args, **self._kwargs)


PRIOR = {
    "shots": [{"id": "s0", "video_url": "http://x/0.mp4", "duration": 5}],
    "storyboard": {"title": "Recovered"},
    "brand_kit": {"logo_url": "http://x/logo.png"},
    "variants": [{"id": "judge_16x9", "status": "ready"}],
}


class InheritPriorTests(unittest.TestCase):
    def test_fills_keys_the_live_state_cannot(self) -> None:
        values = {"shots": [], "variants": [{"id": "teaser_9x16", "status": "ready"}]}
        with mock.patch(
            "src.recap_sources.fetch_thread_snapshot", return_value=dict(PRIOR)
        ):
            out = state_snapshots._inherit_prior("t1", values)
        self.assertEqual(out["shots"], PRIOR["shots"])
        self.assertEqual(out["storyboard"], PRIOR["storyboard"])
        self.assertEqual(out["brand_kit"], PRIOR["brand_kit"])
        # A key the run did write keeps its own value.
        self.assertEqual(out["variants"], [{"id": "teaser_9x16", "status": "ready"}])

    def test_missing_prior_is_a_no_op(self) -> None:
        with mock.patch("src.recap_sources.fetch_thread_snapshot", return_value=None):
            out = state_snapshots._inherit_prior("t1", {"shots": []})
        self.assertEqual(out, {"shots": []})


class SafePutTests(unittest.TestCase):
    def test_empty_shots_triggers_inherit(self) -> None:
        put = mock.Mock(return_value="http://b/snapshots/t1.json")
        fetch = mock.Mock(return_value=dict(PRIOR))
        with mock.patch.object(state_snapshots, "_put_snapshot", put), mock.patch(
            "src.recap_sources.fetch_thread_snapshot", fetch
        ):
            state_snapshots._safe_put("t1", {"shots": []})
        self.assertEqual(put.call_args[0][1]["shots"], PRIOR["shots"])

    def test_healthy_run_does_not_fetch(self) -> None:
        put = mock.Mock(return_value="http://b/snapshots/t1.json")
        fetch = mock.Mock(return_value=dict(PRIOR))
        shots = [{"id": "s0", "video_url": "http://x/0.mp4"}]
        with mock.patch.object(state_snapshots, "_put_snapshot", put), mock.patch(
            "src.recap_sources.fetch_thread_snapshot", fetch
        ):
            state_snapshots._safe_put("t1", {"shots": shots})
        fetch.assert_not_called()
        self.assertEqual(put.call_args[0][1]["shots"], shots)


class SaveSnapshotTests(unittest.TestCase):
    def _record(self, update, state):
        captured: dict = {}

        def fake_safe_put(tid, values):
            captured.update({"tid": tid, "values": values})

        with (
            mock.patch.object(state_snapshots, "b2_enabled", return_value=True),
            mock.patch.object(state_snapshots, "_snapshot_thread_id", return_value="t1"),
            mock.patch.object(state_snapshots, "_safe_put", fake_safe_put),
            mock.patch.object(state_snapshots.threading, "Thread", _InlineThread),
        ):
            state_snapshots.save_snapshot_async(update, state)
        return captured.get("values")

    def test_wiped_shots_never_reach_the_writer(self) -> None:
        values = self._record({"variants": [{"id": "judge_16x9"}]}, {"shots": []})
        self.assertIsNotNone(values)
        self.assertNotIn("shots", values)
        self.assertEqual(values["variants"], [{"id": "judge_16x9"}])

    def test_real_shots_are_published(self) -> None:
        shots = [{"id": "s0", "video_url": "http://x/0.mp4"}]
        values = self._record({"regenerate_vo": True}, {"shots": shots})
        self.assertEqual(values["shots"], shots)

    def test_b2_disabled_writes_nothing(self) -> None:
        with mock.patch.object(state_snapshots, "b2_enabled", return_value=False):
            with mock.patch.object(state_snapshots, "_safe_put") as put:
                state_snapshots.save_snapshot_async({"variants": [{}]}, None)
        put.assert_not_called()

    def test_every_restorable_key_is_snapshotted(self) -> None:
        self.assertIn("variants", SNAPSHOT_KEYS)
        self.assertIn("brand_kit", SNAPSHOT_KEYS)


class StateOrSnapshotTests(unittest.TestCase):
    def setUp(self) -> None:
        from src import runway_tools

        self.rt = runway_tools

    def test_live_state_short_circuits(self) -> None:
        state = {"shots": [{"id": "s0", "video_url": "http://x/0.mp4"}]}
        with mock.patch("src.recap_sources.fetch_thread_snapshot") as fetch:
            merged, restored = self.rt._state_or_snapshot(state)
        fetch.assert_not_called()
        self.assertEqual(restored, {})
        self.assertEqual(merged["shots"], state["shots"])

    def test_emptied_checkpoint_heals_and_reports_restored(self) -> None:
        with (
            mock.patch(
                "src.recap_sources.fetch_thread_snapshot", return_value=dict(PRIOR)
            ),
            mock.patch.object(
                state_snapshots, "_snapshot_thread_id", return_value="t1"
            ),
        ):
            merged, restored = self.rt._state_or_snapshot({"shots": []})
        self.assertEqual([s["id"] for s in merged["shots"]], ["s0"])
        self.assertEqual(
            sorted(restored), sorted(["shots", "storyboard", "brand_kit", "variants"])
        )

    def test_no_thread_id_returns_state_unchanged(self) -> None:
        with (
            mock.patch("src.recap_sources.fetch_thread_snapshot") as fetch,
            mock.patch.object(state_snapshots, "_snapshot_thread_id", return_value=""),
        ):
            merged, restored = self.rt._state_or_snapshot({"shots": []})
        fetch.assert_not_called()
        self.assertEqual(restored, {})
        self.assertEqual(merged, {"shots": []})


if __name__ == "__main__":
    unittest.main()
