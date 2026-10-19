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

const now = () => new Date().toISOString();

/** Truncate evidence for display. */
export function clip(text: string, max = 120): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : t.slice(0, max - 1) + '…';
}

export function event(
  channel: Channel,
  outcome: Outcome,
  key: string,
  title: string,
  extra?: {
    params?: Record<string, string | number>;
    detailKey?: string;
    detail?: string;
    detailParams?: Record<string, string | number>;
    evidence?: string;
    source?: string;
    time?: string;
  }
): TrustEvent {
  return {
    time: extra?.time ?? now(),
    channel,
    outcome,
    titleKey: key,
    titleParams: extra?.params,
    title,
    detailKey: extra?.detailKey,
    detailParams: extra?.detailParams,
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

const READ_RULE_KEY: Record<string, string> = {
  INSTR_OVERRIDE: 'override',
  system_prompt_exfil: 'promptExfil',
  CREDS_EXFIL: 'credsExfil',
  ENV_PROBE: 'envProbe',
  HIDDEN_UNICODE: 'hiddenUnicode',
  AGENT_DIRECTIVE: 'agentDirective',
  RULES_BACKDOOR: 'rulesBackdoor',
  RESOURCE_LURE: 'resourceLure',
};

export function readFindingEvent(
  ruleId: string,
  severity: string,
  evidence: string,
  toolName: string,
  source = 'dsh-read-guard'
): TrustEvent {
  const what = READ_RULE_TEXT[ruleId] ?? 'contained suspicious instructions';
  const whatKey = READ_RULE_KEY[ruleId] ?? 'suspicious';
  return event(
    'read',
    'handled',
    `ev.read.${whatKey}`,
    `Something the agent read ${what}. It was quarantined — the agent did not follow it.`,
    {
      detailKey: 'ev.read.detail',
      detail: `Found while reading ${toolName}. Detail: ${ruleId} (${severity}).`,
      detailParams: { tool: toolName, rule: ruleId, severity },
      evidence,
      source,
    }
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
    return event('write', 'handled', 'ev.write.denied', `The agent tried to change a file it promised not to touch. Blocked.`, {
      detailKey: 'ev.write.deniedDetail',
      detail: `Denied write to ${line.path ?? 'a file'} (rule: ${line.matchedBy ?? 'policy'}). If this is what you asked for, adjust the rule and retry.`,
      detailParams: { path: line.path ?? '', rule: line.matchedBy ?? 'policy' },
      time: line.time,
      source: 'dsh-pr-gate',
    });
  }
  if (line.residueKinds !== undefined && line.residueKinds.length > 0) {
    return event('write', 'attention', 'ev.write.residue', `A completed write left suspicious leftovers behind.`, {
      detailKey: 'ev.write.residueDetail',
      detail: `${line.path ?? 'a file'}: ${line.residueKinds.join(', ')} residue detected after writing.`,
      detailParams: { path: line.path ?? '', kinds: line.residueKinds.join(', ') },
      time: line.time,
      source: 'dsh-pr-gate',
    });
  }
  return null;
}

/* ---------------- custody channel (dsh-attest-chain) ---------------- */

export function custodyVerifiedEvent(count: number, headDigest: string, source = 'dsh-attest-chain'): TrustEvent {
  return event('custody', 'handled', 'ev.custody.intact', `The activity record is intact — ${count} entries, nothing was altered.`, {
    params: { count },
    detailKey: 'ev.custody.intactDetail',
    detail: `Hash chain verified from the first entry to the head (${headDigest.slice(0, 16)}…).`,
    detailParams: { head: headDigest.slice(0, 16) },
    source,
  });
}

export function custodyBrokenEvent(seq: number, reason: string, source = 'dsh-attest-chain'): TrustEvent {
  return event('custody', 'attention', 'ev.custody.broken', `The activity record does not add up — an entry may have been altered or removed.`, {
    detailKey: 'ev.custody.brokenDetail',
    detail: `Chain check failed at entry #${seq} (${reason}). Review who could have edited the ledger file.`,
    detailParams: { seq, reason },
    source,
  });
}

/* ---------------- toolsurface channel (dsh-mcp-test diff) ---------------- */

export function toolSurfaceEvent(added: number, removed: number, changed: number, names: string[]): TrustEvent {
  const parts: string[] = [];
  if (added > 0) parts.push(`${added} new`);
  if (removed > 0) parts.push(`${removed} removed`);
  if (changed > 0) parts.push(`${changed} changed`);
  return event('toolsurface', 'attention', 'ev.tools.drift', `The tools available to your agent changed since the last checkpoint.`, {
    detailKey: 'ev.tools.driftDetail',
    detail: `${parts.join(', ')}: ${names.slice(0, 5).join(', ')}${names.length > 5 ? '…' : ''}. If you did not install or update anything, look into it.`,
    detailParams: { parts: parts.join(', '), names: names.slice(0, 5).join(', ') },
    source: 'dsh-mcp-test',
  });
}

/* ---------------- leave channel (dsh-janitor) ---------------- */

export function janitorEvent(needsReview: number, protectedCount: number, source = 'dsh-janitor'): TrustEvent {
  if (needsReview === 0) {
    return event('leave', 'handled', 'ev.leave.clean', `Workspace scan found nothing that needs cleanup.`, {
      params: { protected: protectedCount },
      detailKey: 'ev.leave.cleanDetail',
      detail: `${protectedCount} protected items checked.`,
      detailParams: { protected: protectedCount },
      source,
    });
  }
  return event('leave', 'attention', 'ev.leave.review', `Workspace scan found ${needsReview} leftover item(s) worth reviewing.`, {
    params: { count: needsReview },
    detailKey: 'ev.leave.reviewDetail',
    detail: 'Leftover files from finished work can confuse the agent later. Run the janitor_scan tool for the full list.',
    source,
  });
}

/* ---------------- egress channel (dsh-egress-gate) ---------------- */

export function egressDeniedEvent(urls: string[], source = 'dsh-egress-gate'): TrustEvent {
  return event('egress', 'handled', 'ev.egress.denied', `The agent tried to send data to a website that is not on your allow list. Blocked.`, {
    detailKey: 'ev.egress.deniedDetail',
    detail: `Destination: ${urls.join(', ')}. Add it to the allow list if this send was intended.`,
    detailParams: { urls: urls.join(', ') },
    source,
  });
}

/* ---------------- prompt channel (dsh-prompt-drift) ---------------- */

export function promptDriftEvent(fields: string[], source = 'dsh-prompt-drift'): TrustEvent {
  return event('prompt', 'attention', 'ev.prompt.drift', `The instructions your agent starts every session with have changed.`, {
    detailKey: 'ev.prompt.driftDetail',
    detail: `Changed sections: ${fields.join(', ')}. This is expected after a plugin update — unexpected if you changed nothing.`,
    detailParams: { fields: fields.join(', ') },
    source,
  });
}

/* ---------------- composition channel (dsh-freeze) ---------------- */

export function compositionDriftEvent(fields: string[], source = 'dsh-freeze'): TrustEvent {
  return event('composition', 'attention', 'ev.composition.drift', `The set of installed plugins changed since the last checkpoint.`, {
    detailKey: 'ev.composition.driftDetail',
    detail: `Changed: ${fields.join(', ')}. Verify you intended this change before continuing.`,
    detailParams: { fields: fields.join(', ') },
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
    return event('memory', 'handled', 'ev.memory.survived', `A long conversation was summarized — all ${line.constraints} of your standing instructions survived.`, {
      params: { count: line.constraints },
      time: line.time,
      source,
    });
  }
  return event('memory', 'attention', 'ev.memory.lost', `A long conversation was summarized — the agent forgot ${line.lost.length} of your instructions. They were re-inserted automatically.`, {
    params: { lost: line.lost.length },
    detailKey: 'ev.memory.lostDetail',
    detail: line.lost
      .slice(0, 3)
      .map((l) => `“${clip(l.text, 80)}”`)
      .join(' ; '),
    detailParams: { examples: line.lost.slice(0, 3).map((l) => clip(l.text, 80)).join(' ; ') },
    time: line.time,
    source,
  });
}
