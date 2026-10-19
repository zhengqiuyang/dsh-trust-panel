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
  /** Translation key for the headline sentence (client renders per locale). */
  titleKey: string;
  /** Interpolation params for {@link titleKey}. */
  titleParams?: Record<string, string | number>;
  /** English fallback for the headline (also used by non-web consumers). */
  title: string;
  /** Translation key for the optional detail sentence. */
  detailKey?: string;
  /** Interpolation params for {@link detailKey}. */
  detailParams?: Record<string, string | number>;
  /** English fallback detail sentence with specifics (paths, URLs, counts). */
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
  /** translation key for the human channel label, e.g. "What the agent reads" */
  labelKey: string;
  /** English fallback label */
  label: string;
  /** translation key for the one-line plain-language state */
  noteKey: string;
  /** interpolation params for {@link noteKey} */
  noteParams?: Record<string, string | number>;
  /** English fallback note */
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
