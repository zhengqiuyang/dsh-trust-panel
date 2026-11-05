/**
 * Aggregation: turn the family's files (JSONL ledgers, baselines) plus a
 * live tool-registry snapshot into channel statuses and events. Pure
 * filesystem reads + engine calls — no harness context needed, which is
 * what makes it unit-testable.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseLineText, verifyChain } from 'dsh-attest-chain/lib/chain.js';
import { loadSnapshot } from 'dsh-mcp-test/lib/store.js';
import { diffSurfaces } from 'dsh-mcp-test/lib/diff.js';
import { compactionEvent, custodyBrokenEvent, custodyVerifiedEvent, prGateEvent, toolSurfaceEvent, } from './translate.js';
export const DEFAULT_PATHS = {
    prGateLedger: '.dsh-pr-gate/session.jsonl',
    attestLedger: '.dsh-attest-chain/session.jsonl',
    attestKeysDir: '.dsh-attest-chain/keys',
    compactionLedger: '.dsh-compaction-guard/ledger.jsonl',
    mcpBaseline: '.dsh-mcp-test/baseline.json',
    promptBaseline: '.dsh-prompt-drift/baseline.json',
    freezeBaseline: '.dsh-freeze/baseline.json',
};
async function readText(path) {
    try {
        return await readFile(path, 'utf8');
    }
    catch {
        return null;
    }
}
async function readJsonLines(path) {
    const text = await readText(path);
    if (text === null)
        return null;
    const out = [];
    for (const line of text.split('\n')) {
        const t = line.trim();
        if (t === '')
            continue;
        try {
            out.push(JSON.parse(t));
        }
        catch {
            // skip malformed
        }
    }
    return out;
}
async function readJson(path) {
    const text = await readText(path);
    if (text === null)
        return null;
    try {
        return JSON.parse(text);
    }
    catch {
        return null;
    }
}
const CHANNEL_LABELS = {
    read: 'What the agent reads',
    write: 'What the agent changes',
    custody: 'The activity record',
    toolsurface: 'The tools it can use',
    leave: 'Leftovers in your workspace',
    egress: 'Where data is sent',
    prompt: 'The instructions it starts with',
    composition: 'The plugins that are loaded',
    memory: 'What it remembers',
};
/**
 * @param liveEvents events collected in-memory this boot (read/egress/janitor side-listeners)
 * @param currentSnapshot current tool-registry snapshot for the toolsurface diff (null = registry unavailable)
 */
export async function aggregate(paths, liveEvents, currentSnapshot) {
    const events = [...liveEvents];
    /* write channel */
    const prLines = await readJsonLines(join(paths.cwd, paths.prGateLedger));
    if (prLines !== null) {
        for (const line of prLines) {
            const ev = prGateEvent(line);
            if (ev !== null)
                events.push(ev);
        }
    }
    /* custody channel */
    const attestText = await readText(join(paths.cwd, paths.attestLedger));
    const custodyPresent = attestText !== null && attestText.trim() !== '';
    if (custodyPresent) {
        const lines = attestText
            .split('\n')
            .map((l) => l.trim())
            .filter((l) => l !== '')
            .map((l) => {
            try {
                return parseLineText(l);
            }
            catch {
                return null;
            }
        })
            .filter((l) => l !== null);
        const publicPem = (await readText(join(paths.cwd, paths.attestKeysDir, 'session_ed25519.pub.pem'))) ?? undefined;
        const verification = verifyChain(lines, publicPem);
        if (verification.ok) {
            events.push(custodyVerifiedEvent(lines.length, verification.headDigest));
        }
        else if (verification.firstBad !== undefined) {
            events.push(custodyBrokenEvent(verification.firstBad.seq, verification.firstBad.reason));
        }
    }
    /* memory channel */
    const compLines = await readJsonLines(join(paths.cwd, paths.compactionLedger));
    if (compLines !== null) {
        for (const line of compLines) {
            events.push(compactionEvent(line));
        }
    }
    /* toolsurface channel */
    let toolsurfacePresent = false;
    const baseline = await loadSnapshot(join(paths.cwd, paths.mcpBaseline)).catch(() => null);
    if (baseline !== null && currentSnapshot !== null) {
        toolsurfacePresent = true;
        const diff = diffSurfaces(baseline, currentSnapshot);
        if (diff.changes.length > 0) {
            const added = diff.changes.filter((c) => c.kind === 'added').length;
            const removed = diff.changes.filter((c) => c.kind === 'removed').length;
            const changed = diff.changes.filter((c) => c.kind === 'changed').length;
            const names = diff.changes.map((c) => 'name' in c ? c.name : 'tool');
            events.push(toolSurfaceEvent(added, removed, changed, names));
        }
    }
    else if (baseline !== null) {
        toolsurfacePresent = true;
    }
    /* prompt + composition: baseline presence only in v0.1 */
    const promptBaseline = await readJson(join(paths.cwd, paths.promptBaseline));
    const freezeBaseline = await readJson(join(paths.cwd, paths.freezeBaseline));
    /* order newest first */
    events.sort((a, b) => (a.time < b.time ? 1 : -1));
    const counts = new Map();
    for (const ev of events)
        counts.set(ev.channel, (counts.get(ev.channel) ?? 0) + 1);
    const hasAttention = events.some((e) => e.outcome === 'attention');
    const channels = Object.keys(CHANNEL_LABELS).map((ch) => {
        const present = ch === 'write'
            ? prLines !== null
            : ch === 'custody'
                ? custodyPresent
                : ch === 'memory'
                    ? compLines !== null
                    : ch === 'toolsurface'
                        ? toolsurfacePresent
                        : ch === 'prompt'
                            ? promptBaseline !== null
                            : ch === 'composition'
                                ? freezeBaseline !== null
                                : true; // read/egress/leave are live listeners, always on
        const promptTime = ch === 'prompt' && promptBaseline?.time !== undefined ? promptBaseline.time : undefined;
        const freezeProfile = ch === 'composition' && freezeBaseline?.profile !== undefined ? freezeBaseline.profile : undefined;
        return {
            channel: ch,
            present,
            labelKey: `ch.${ch}`,
            label: CHANNEL_LABELS[ch],
            noteKey: !present
                ? 'note.notInstalled'
                : promptTime !== undefined
                    ? 'note.checkpoint'
                    : freezeProfile !== undefined
                        ? 'note.pinned'
                        : 'note.watching',
            noteParams: promptTime !== undefined ? { time: promptTime } : freezeProfile !== undefined ? { profile: freezeProfile } : undefined,
            note: !present
                ? 'not installed'
                : promptTime !== undefined
                    ? `checkpoint taken ${promptTime}`
                    : freezeProfile !== undefined
                        ? `profile "${freezeProfile}" pinned`
                        : 'watching',
            count: counts.get(ch) ?? 0,
        };
    });
    const status = hasAttention ? 'attention' : events.length > 0 ? 'activity' : 'ok';
    const statusText = status === 'ok'
        ? 'All clear — nothing suspicious reached your agent.'
        : status === 'activity'
            ? 'Caught a few things — all handled, nothing needs you.'
            : 'Something needs your decision — see below.';
    return {
        status,
        statusText,
        generatedAt: new Date().toISOString(),
        channels,
        events: events.slice(0, 100),
    };
}
//# sourceMappingURL=aggregate.js.map