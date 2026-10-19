// Structural declarations for family packages that ship without type files.
// Kept in sync with their src definitions.
declare module 'dsh-egress-gate/lib/policy.js' {
  export interface EgressPolicy {
    allow?: string[];
    deny?: string[];
  }
  export interface UrlVerdict {
    url: string;
    host: string;
    action: 'allow' | 'deny';
    matchedBy?: string;
  }
  export function checkUrl(rawUrl: string, policy: EgressPolicy): UrlVerdict;
  export function checkUrls(urls: readonly string[], policy: EgressPolicy): UrlVerdict[];
  export function urlsFromWebArgs(args: unknown): string[];
  export function urlsFromShellCommand(command: string): string[];
}
declare module 'dsh-mcp-test/lib/store.js' {
  export interface ToolSurfaceSnapshot {
    time: string;
    tools: { name: string; description: string; parameters: unknown }[];
  }
  export function saveSnapshot(path: string, tools: ToolSurfaceSnapshot['tools'], time: string): Promise<void>;
  export function loadSnapshot(path: string): Promise<ToolSurfaceSnapshot | null>;
}
declare module 'dsh-mcp-test/lib/diff.js' {
  export interface ToolSurfaceEntry {
    name: string;
    parameters: unknown;
    description: string;
  }
  export interface ToolSurfaceSnapshot {
    time: string;
    tools: ToolSurfaceEntry[];
  }
  export type SurfaceChange =
    | { kind: 'added'; name: string; entry: ToolSurfaceEntry }
    | { kind: 'removed'; name: string; entry: ToolSurfaceEntry }
    | { kind: 'changed'; name: string; field: 'description' | 'parameters' };
  export interface SurfaceDiff {
    baselineTools: number;
    currentTools: number;
    changes: SurfaceChange[];
  }
  export function diffSurfaces(
    baseline: ToolSurfaceSnapshot,
    current: ToolSurfaceSnapshot,
    ignore?: ReadonlySet<string>
  ): SurfaceDiff;
}
