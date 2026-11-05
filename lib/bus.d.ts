import type { TrustEvent } from './types.js';
export declare class TrustBus {
    private readonly path;
    private events;
    private readonly max;
    constructor(path: string, max?: number);
    /** Load previously persisted events (best effort). */
    load(): Promise<void>;
    report(event: TrustEvent): void;
    list(): TrustEvent[];
    private trim;
}
