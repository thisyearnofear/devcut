// Ambient typing for the draft WebMCP `document.modelContext` API.
//
// The exact runtime surface is verified during the Phase-1 spike (see
// docs/webmcp-playbook.md §Phase 1). Adjust these shapes to match observed
// reality (e.g. sync vs async `registerTool`, available events) — never assume
// an event name like `ontoolchange` exists without having seen it. The *tool*
// shapes (name/description/inputSchema/execute) stay identical regardless.

export interface WebMcpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
  execute(input: Record<string, unknown>): Promise<unknown>;
}

export interface ModelContext {
  registerTool(tool: WebMcpTool): Promise<void> | void;
  /** Keep only what Phase 1 confirmed exists: */
  unregisterTool?(name: string): Promise<void> | void;
  ontoolchange?: ((ev: Event) => void) | null;
}

declare global {
  interface Document {
    modelContext?: ModelContext;
  }
}
