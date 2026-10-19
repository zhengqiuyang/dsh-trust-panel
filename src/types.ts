/**
 * Shared event model for the trust panel. One shape for every channel:
 * what happened, how bad it is, and one plain sentence about it.
 */
export type Channel =
  | 'read' // dsh-read-guard: what the agent read
  | 'write' // dsh-pr-gate: what the agent wrote / tried to write
  | 'custody' // dsh-attest-chain: tamper-evident record
  | 'toolsurface' // dsh-mcp-test: registered tools changed
  | 'leave' // dsh-janitor: leftover files
  | 'egress' // dsh-egress-gate: where output is sent
  | 'prompt' // dsh-prompt-drift: system prompt changed
  | 'composition' // dsh-freeze: profile composition changed
  | 'memory'; // dsh-compaction-guard: what compaction forgot

/**
 * Outcome tiers, deliberately coarse — a non-security user needs
 * "handled" vs "look at this", not a taxonomy.
 * - handled: something was caught; no user action needed
 * - attention: the user should decide or be aware (rare)
 */
export type Outcome = 'handled' | 'attention';

export interface TrustEvent {
  /** ISO timestamp. */
  time: string;
  channel: Channel;
  outcome: Outcome;
  /** One short plain-language sentence, already translated. */
  title: string;
  /** Optional second sentence with specifics (paths, URLs, counts). */
  detail?: string;
  /** Truncated raw evidence for the expandable detail view. */
  evidence?: string;
  /** Which component produced it (plugin name or 'dsh-trust-panel'). */
  source: string;
}

export interface ChannelStatus {
  channel: Channel;
  /** true if the underlying plugin/data source was found and working */
  present: boolean;
  /** human channel label, e.g. "What the agent reads" */
  label: string;
  /** one-line plain-language state */
  note: string;
  /** events in the current window for this channel */
  count: number;
}

export interface PanelSummary {
  /** green when no attention events and at least custody present; yellow when handled events; red on attention */
  status: 'ok' | 'activity' | 'attention';
  statusText: string;
  generatedAt: string;
  channels: ChannelStatus[];
  /** newest first, capped */
  events: TrustEvent[];
}
