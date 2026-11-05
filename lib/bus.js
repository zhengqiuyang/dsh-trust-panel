/**
 * In-memory event bus with JSONL persistence. The host half pushes events
 * here (its own side-listeners, plus any plugin that wants to report
 * through the exported service); the HTTP route drains it for the client.
 */
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
export class TrustBus {
    path;
    events = [];
    max;
    constructor(path, max = 500) {
        this.path = path;
        this.max = max;
    }
    /** Load previously persisted events (best effort). */
    async load() {
        if (this.path === '')
            return;
        try {
            const text = await readFile(this.path, 'utf8');
            for (const line of text.split('\n')) {
                const t = line.trim();
                if (t === '')
                    continue;
                try {
                    this.events.push(JSON.parse(t));
                }
                catch {
                    // skip malformed lines
                }
            }
            this.trim();
        }
        catch {
            // no ledger yet
        }
    }
    report(event) {
        this.events.push(event);
        this.trim();
        if (this.path === '')
            return;
        void (async () => {
            try {
                await mkdir(dirname(this.path), { recursive: true });
                await appendFile(this.path, JSON.stringify(event) + '\n');
            }
            catch {
                // persistence is best-effort; the panel still shows live state
            }
        })();
    }
    list() {
        return [...this.events].sort((a, b) => (a.time < b.time ? 1 : -1));
    }
    trim() {
        if (this.events.length > this.max) {
            this.events = this.events.slice(this.events.length - this.max);
        }
    }
}
//# sourceMappingURL=bus.js.map