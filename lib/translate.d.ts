/**
 * The translation layer: engine jargon in, plain sentences out.
 * Every mapping here answers the same four questions in order —
 * who, what they tried, what we did about it, whether you must act.
 *
 * Events carry a translation key + params (rendered per locale by the web
 * client) alongside an English fallback sentence (used by tests and any
 * non-web consumer of the JSON API).
 */
import type { Channel, Outcome, TrustEvent } from './types.js';
/** Truncate evidence for display. */
export declare function clip(text: string, max?: number): string;
export declare function event(channel: Channel, outcome: Outcome, key: string, title: string, extra?: {
    key?: string;
    params?: Record<string, string | number>;
    detailKey?: string;
    detail?: string;
    detailParams?: Record<string, string | number>;
    evidence?: string;
    source?: string;
    time?: string;
}): TrustEvent;
export declare function readFindingEvent(ruleId: string, severity: string, evidence: string, toolName: string, source?: string): TrustEvent;
export interface PrGateLine {
    time: string;
    tool: string;
    action: 'written' | 'denied';
    path?: string;
    matchedBy?: string;
    residueKinds?: string[];
}
export declare function prGateEvent(line: PrGateLine): TrustEvent | null;
export declare function custodyVerifiedEvent(count: number, headDigest: string, source?: string): TrustEvent;
export declare function custodyDigestOnlyEvent(count: number, headDigest: string, source?: string): TrustEvent;
export declare function custodyBrokenEvent(seq: number, reason: string, source?: string): TrustEvent;
export declare function toolSurfaceEvent(added: number, removed: number, changed: number, names: string[]): TrustEvent;
export declare function janitorEvent(needsReview: number, protectedCount: number, source?: string): TrustEvent;
export declare function egressDeniedEvent(urls: string[], source?: string): TrustEvent;
export declare function promptDriftEvent(fields: string[], source?: string): TrustEvent;
export declare function compositionDriftEvent(fields: string[], source?: string): TrustEvent;
export interface CompactionLine {
    time: string;
    constraints: number;
    kept: number;
    lost: {
        seq: number;
        text: string;
    }[];
}
export declare function compactionEvent(line: CompactionLine, source?: string): TrustEvent;
