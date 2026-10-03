// Ambient typing for the draft WebMCP `document.modelContext` API.
//
// Verified 2026-10-03 (Phase-1 spike) on Chrome 154 with
// `chrome://flags/#enable-webmcp-testing` enabled + full browser restart.
// Observed prototype surface: registerTool, getTools, executeTool, ontoolchange.
// `executeTool(registeredTool, argsJsonString)` — passing a name or an object
// for args throws; `registerTool` accepts our tool shape (name/description/
// inputSchema/annotations/execute) and `getTools()` returns the registered
// descriptors.

export interface WebMcpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
  execute(input: Record<string, unknown>): Promise<unknown>;
}

export interface ModelContext {
  registerTool(tool: WebMcpTool): Promise<void> | void;
  /** Return the tools currently registered on this context (spike-confirmed). */
  getTools?(): Promise<WebMcpTool[]>;
  /** First arg must be a registered-tool descriptor, second a JSON string. */
  executeTool?(tool: WebMcpTool, argumentsJson?: string): Promise<unknown>;
  unregisterTool?(name: string): Promise<void> | void;
  ontoolchange?: ((ev: Event) => void) | null;
}

declare global {
  interface Document {
    modelContext?: ModelContext;
  }
}
