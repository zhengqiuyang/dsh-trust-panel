import { type ToolSurfaceSnapshot } from 'dsh-mcp-test/lib/diff.js';
import type { PanelSummary, TrustEvent } from './types.js';
export interface AggregatePaths {
    cwd: string;
    prGateLedger: string;
    attestLedger: string;
    attestKeysDir: string;
    compactionLedger: string;
    mcpBaseline: string;
    promptBaseline: string;
    freezeBaseline: string;
}
export declare const DEFAULT_PATHS: Omit<AggregatePaths, 'cwd'>;
export interface AggregateResult {
    summary: PanelSummary;
}
/**
 * @param liveEvents events collected in-memory this boot (read/egress/janitor side-listeners)
 * @param currentSnapshot current tool-registry snapshot for the toolsurface diff (null = registry unavailable)
 */
export declare function aggregate(paths: AggregatePaths, liveEvents: TrustEvent[], currentSnapshot: ToolSurfaceSnapshot | null): Promise<PanelSummary>;
