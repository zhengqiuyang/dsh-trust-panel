/**
 * The translation layer: engine jargon in, plain sentences out.
 * Every mapping here answers the same four questions in order —
 * who, what they tried, what we did about it, whether you must act.
 */
import type { Channel, Outcome, TrustEvent } from './types.js';

const now = () => new Date().toISOString();

/** Truncate evidence for display. */
export function clip(text: string, max = 120): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : t.slice(0, max - 1) + '…';
}

export function event(
  channel: Channel,
  outcome: Outcome,
  title: string,
  extra?: { detail?: string; evidence?: string; source?: string; time?: string }
): TrustEvent {
  return {
    time: extra?.time ?? now(),
    channel,
    outcome,
    title,
    detail: extra?.detail,
    evidence: extra?.evidence === undefined ? undefined : clip(extra.evidence),
    source: extra?.source ?? 'dsh-trust-panel',
  };
}

/* ---------------- read channel (dsh-read-guard findings) ---------------- */

const READ_RULE_TEXT: Record<string, string> = {
  INSTR_OVERRIDE: 'tried to override your instructions',
  system_prompt_exfil: 'asked the agent to print your system prompt',
  CREDS_EXFIL: 'asked the agent to send your credentials somewhere',
  ENV_PROBE: 'asked the agent to probe your environment variables',
  HIDDEN_UNICODE: 'hid instructions inside invisible characters',
  AGENT_DIRECTIVE: 'addressed the agent as if it were the user',
  RULES_BACKDOOR: 'tried to rewrite the agent safety rules',
  RESOURCE_LURE: 'lured the agent toward a resource',
};

export function readFindingEvent(
  ruleId: string,
  severity: string,
  evidence: string,
  toolName: string,
  source = 'dsh-read-guard'
): TrustEvent {
  const what = READ_RULE_TEXT[ruleId] ?? 'contained suspicious instructions';
  return event(
    'read',
    'handled',
    `Something the agent read ${what}. It was quarantined — the agent did not follow it.`,
    { detail: `Found while reading ${toolName}. Detail: ${ruleId} (${severity}).`, evidence, source }
  );
}

/* ---------------- write channel (dsh-pr-gate ledger lines) ---------------- */

export interface PrGateLine {
  time: string;
  tool: string;
  action: 'written' | 'denied';
  path?: string;
  matchedBy?: string;
  residueKinds?: string[];
}

export function prGateEvent(line: PrGateLine): TrustEvent | null {
  if (line.action === 'denied') {
    return event('write', 'handled', `The agent tried to change a file it promised not to touch. Blocked.`, {
      detail: `Denied write to ${line.path ?? 'a file'} (rule: ${line.matchedBy ?? 'policy'}). If this is what you asked for, adjust the rule and retry.`,
      time: line.time,
      source: 'dsh-pr-gate',
    });
  }
  // Writes themselves are routine; only surface residue findings.
  if (line.residueKinds !== undefined && line.residueKinds.length > 0) {
    return event('write', 'attention', `A completed write left suspicious leftovers behind.`, {
      detail: `${line.path ?? 'a file'}: ${line.residueKinds.join(', ')} residue detected after writing.`,
      time: line.time,
      source: 'dsh-pr-gate',
    });
  }
  return null;
}

/* ---------------- custody channel (dsh-attest-chain) ---------------- */

export function custodyVerifiedEvent(count: number, headDigest: string, source = 'dsh-attest-chain'): TrustEvent {
  return event('custody', 'handled', `The activity record is intact — ${count} entries, nothing was altered.`, {
    detail: `Hash chain verified from the first entry to the head (${headDigest.slice(0, 16)}…).`,
    source,
  });
}

export function custodyBrokenEvent(seq: number, reason: string, source = 'dsh-attest-chain'): TrustEvent {
  return event('custody', 'attention', `The activity record does not add up — an entry may have been altered or removed.`, {
    detail: `Chain check failed at entry #${seq} (${reason}). Review who could have edited the ledger file.`,
    source,
  });
}

/* ---------------- toolsurface channel (dsh-mcp-test diff) ---------------- */

export function toolSurfaceEvent(added: number, removed: number, changed: number, names: string[]): TrustEvent {
  const parts: string[] = [];
  if (added > 0) parts.push(`${added} new`);
  if (removed > 0) parts.push(`${removed} removed`);
  if (changed > 0) parts.push(`${changed} changed`);
  return event('toolsurface', 'attention', `The tools available to your agent changed since the last checkpoint.`, {
    detail: `${parts.join(', ')}: ${names.slice(0, 5).join(', ')}${names.length > 5 ? '…' : ''}. If you did not install or update anything, look into it.`,
    source: 'dsh-mcp-test',
  });
}

/* ---------------- leave channel (dsh-janitor) ---------------- */

export function janitorEvent(needsReview: number, protectedCount: number, source = 'dsh-janitor'): TrustEvent {
  if (needsReview === 0) {
    return event('leave', 'handled', `Workspace scan found nothing that needs cleanup.`, {
      detail: `${protectedCount} protected items checked.`,
      source,
    });
  }
  return event('leave', 'attention', `Workspace scan found ${needsReview} leftover item(s) worth reviewing.`, {
    detail: 'Leftover files from finished work can confuse the agent later. Run the janitor_scan tool for the full list.',
    source,
  });
}

/* ---------------- egress channel (dsh-egress-gate) ---------------- */

export function egressDeniedEvent(urls: string[], source = 'dsh-egress-gate'): TrustEvent {
  return event('egress', 'handled', `The agent tried to send data to a website that is not on your allow list. Blocked.`, {
    detail: `Destination: ${urls.join(', ')}. Add it to the allow list if this send was intended.`,
    source,
  });
}

/* ---------------- prompt channel (dsh-prompt-drift) ---------------- */

export function promptDriftEvent(fields: string[], source = 'dsh-prompt-drift'): TrustEvent {
  return event('prompt', 'attention', `The instructions your agent starts every session with have changed.`, {
    detail: `Changed sections: ${fields.join(', ')}. This is expected after a plugin update — unexpected if you changed nothing.`,
    source,
  });
}

/* ---------------- composition channel (dsh-freeze) ---------------- */

export function compositionDriftEvent(fields: string[], source = 'dsh-freeze'): TrustEvent {
  return event('composition', 'attention', `The set of installed plugins changed since the last checkpoint.`, {
    detail: `Changed: ${fields.join(', ')}. Verify you intended this change before continuing.`,
    source,
  });
}

/* ---------------- memory channel (dsh-compaction-guard ledger) ---------------- */

export interface CompactionLine {
  time: string;
  constraints: number;
  kept: number;
  lost: { seq: number; text: string }[];
}

export function compactionEvent(line: CompactionLine, source = 'dsh-compaction-guard'): TrustEvent {
  if (line.lost.length === 0) {
    return event('memory', 'handled', `A long conversation was summarized — all ${line.constraints} of your standing instructions survived.`, {
      time: line.time,
      source,
    });
  }
  return event('memory', 'attention', `A long conversation was summarized — the agent forgot ${line.lost.length} of your instructions. They were re-inserted automatically.`, {
    detail: line.lost
      .slice(0, 3)
      .map((l) => `“${clip(l.text, 80)}”`)
      .join(' ; '),
    time: line.time,
    source,
  });
}
