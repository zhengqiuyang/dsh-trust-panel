import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
export declare const name = "dsh-trust-panel";
export declare const inject: string[];
export interface Config {
    /** Where the panel persists its own event log; empty disables persistence. */
    eventsPath: string;
    /** Maximum events kept for display. */
    maxEvents: number;
    /** Allowed egress domains (suffix match); same semantics as dsh-egress-gate. */
    allow: string[];
    /** Always-denied egress domains; deny wins over allow. */
    deny: string[];
}
export declare const Config: Schema<Config>;
interface ToolExecView {
    readonly name: string;
    readonly arguments?: unknown;
}
interface ToolResultView {
    readonly isError?: boolean;
    readonly content?: unknown;
}
type PreToolDecisionView = {
    kind: 'allow';
} | {
    kind: 'deny';
    reason: string;
    info?: Record<string, string>;
};
type PostToolDecisionView = {
    kind: 'accept';
    content?: unknown;
} | {
    kind: 'block';
    feedback: unknown;
};
declare module '@deepseek-ai/cordis' {
    interface Events {
        'tools/pre-execute': (exec: ToolExecView, next: () => Promise<PreToolDecisionView>) => Promise<PreToolDecisionView>;
        'tools/post-execute': (exec: ToolExecView, result: Readonly<ToolResultView>, next: () => Promise<PostToolDecisionView>) => Promise<PostToolDecisionView>;
    }
}
export declare function apply(ctx: Context, config: Config): void;
export {};
