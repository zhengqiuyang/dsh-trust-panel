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
import { diffSurfaces, type ToolSurfaceSnapshot } from 'dsh-mcp-test/lib/diff.js';
import type { ChannelStatus, PanelSummary, TrustEvent } from './types.js';
import {
  compositionDriftEvent,
  compactionEvent,
  custodyBrokenEvent,
  custodyVerifiedEvent,
  prGateEvent,
  promptDriftEvent,
  toolSurfaceEvent,
  type CompactionLine,
  type PrGateLine,
} from './translate.js';

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

export const DEFAULT_PATHS: Omit<AggregatePaths, 'cwd'> = {
  prGateLedger: '.dsh-pr-gate/session.jsonl',
  attestLedger: '.dsh-attest-chain/session.jsonl',
  attestKeysDir: '.dsh-attest-chain/keys',
  compactionLedger: '.dsh-compaction-guard/ledger.jsonl',
  mcpBaseline: '.dsh-mcp-test/baseline.json',
  promptBaseline: '.dsh-prompt-drift/baseline.json',
  freezeBaseline: '.dsh-freeze/baseline.json',
};

async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
}

async function readJsonLines<T>(path: string): Promise<T[] | null> {
  const text = await readText(path);
  if (text === null) return null;
  const out: T[] = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (t === '') continue;
    try {
      out.push(JSON.parse(t) as T);
    } catch {
      // skip malformed
    }
  }
  return out;
}

async function readJson<T>(path: string): Promise<T | null> {
  const text = await readText(path);
  if (text === null) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

const CHANNEL_LABELS: Record<string, string> = {
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

export interface AggregateResult {
  summary: PanelSummary;
}

/**
 * @param liveEvents events collected in-memory this boot (read/egress/janitor side-listeners)
 * @param currentSnapshot current tool-registry snapshot for the toolsurface diff (null = registry unavailable)
 */
export async function aggregate(
  paths: AggregatePaths,
  liveEvents: TrustEvent[],
  currentSnapshot: ToolSurfaceSnapshot | null
): Promise<PanelSummary> {
  const events: TrustEvent[] = [...liveEvents];

  /* write channel */
  const prLines = await readJsonLines<PrGateLine>(join(paths.cwd, paths.prGateLedger));
  if (prLines !== null) {
    for (const line of prLines) {
      const ev = prGateEvent(line);
      if (ev !== null) events.push(ev);
    }
  }

  /* custody channel */
  const attestText = await readText(join(paths.cwd, paths.attestLedger));
  const custodyPresent = attestText !== null && attestText.trim() !== '';
  if (custodyPresent) {
    const lines = attestText!
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l !== '')
      .map((l) => {
        try {
          return parseLineText(l);
        } catch {
          return null;
        }
      })
      .filter((l): l is NonNullable<typeof l> => l !== null);
    const publicPem = (await readText(join(paths.cwd, paths.attestKeysDir, 'session_ed25519.pub.pem'))) ?? undefined;
    const verification = verifyChain(lines, publicPem);
    if (verification.ok) {
      events.push(custodyVerifiedEvent(lines.length, verification.headDigest));
    } else if (verification.firstBad !== undefined) {
      events.push(custodyBrokenEvent(verification.firstBad.seq, verification.firstBad.reason));
    }
  }

  /* memory channel */
  const compLines = await readJsonLines<CompactionLine>(join(paths.cwd, paths.compactionLedger));
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
  } else if (baseline !== null) {
    toolsurfacePresent = true;
  }

  /* prompt + composition: baseline presence only in v0.1 */
  const promptBaseline = await readJson<{ time?: string }>(join(paths.cwd, paths.promptBaseline));
  const freezeBaseline = await readJson<{ profile?: string; fingerprint?: string; time?: string }>(
    join(paths.cwd, paths.freezeBaseline)
  );

  /* order newest first */
  events.sort((a, b) => (a.time < b.time ? 1 : -1));

  const counts = new Map<string, number>();
  for (const ev of events) counts.set(ev.channel, (counts.get(ev.channel) ?? 0) + 1);
  const hasAttention = events.some((e) => e.outcome === 'attention');

  const channels: ChannelStatus[] = (Object.keys(CHANNEL_LABELS) as Array<keyof typeof CHANNEL_LABELS>).map(
    (ch) => {
      const present =
        ch === 'write'
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
      const freezeProfile =
        ch === 'composition' && freezeBaseline?.profile !== undefined ? freezeBaseline.profile : undefined;
      return {
        channel: ch as ChannelStatus['channel'],
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
        noteParams: promptTime !== undefined ? ({ time: promptTime } as Record<string, string | number>) : freezeProfile !== undefined ? ({ profile: freezeProfile } as Record<string, string | number>) : undefined,
        note: !present
          ? 'not installed'
          : promptTime !== undefined
            ? `checkpoint taken ${promptTime}`
            : freezeProfile !== undefined
              ? `profile "${freezeProfile}" pinned`
              : 'watching',
        count: counts.get(ch) ?? 0,
      };
    }
  );

  const status: PanelSummary['status'] = hasAttention ? 'attention' : events.length > 0 ? 'activity' : 'ok';
  const statusText =
    status === 'ok'
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
