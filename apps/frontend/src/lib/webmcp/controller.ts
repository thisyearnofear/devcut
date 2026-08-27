import type { StoryboardState } from "@/lib/storyboard/types";

/**
 * Actions the director page exposes to consumers outside React (e.g. WebMCP
 * tools registered on `document.modelContext`). These mirror the existing
 * in-page callbacks one-for-one; the page keeps using its own handlers so there
 * is zero UX regression.
 */
export interface DirectorActions {
  /** Equivalent of injectPrompt/handleComposeSend — starts an agent run. */
  startRun(brief: string): void;
  /** Regenerate a single shot (mirrors handleRegenerate). */
  regenerateShot(shotId: string): void;
  /** Mirrors handleCancel → agent.abortRun(). */
  cancelRun(): void;
  /** True while copilotkit.runAgent is in flight. Must read a *fresh* value
   *  (ref-backed), not state captured at effect-registration time. */
  isRunning(): boolean;
}

/**
 * Plain singleton holding getters/setters that both the director page and the
 * WebMCP tools use. Browser-context tools cannot reach into React component
 * closures, so the page publishes its handlers + latest storyboard snapshot
 * here and the tools read them back at execute time.
 */
class DirectorController {
  private actions: DirectorActions | null = null;
  private lastKnownState: StoryboardState | null = null;

  setActions(actions: DirectorActions | null) { this.actions = actions; }
  setStateSnapshot(state: StoryboardState) { this.lastKnownState = state; }

  hasActions() { return this.actions !== null; }
  requireActions(): DirectorActions {
    if (!this.actions) throw new Error("Director canvas not mounted");
    return this.actions;
  }
  snapshot(): StoryboardState | null { return this.lastKnownState; }
}

export const directorController = new DirectorController();
