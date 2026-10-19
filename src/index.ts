/**
 * Host half: aggregates the trust family's files and live signals, exposes
 * them over an HTTP route for the web client, and side-listens the same
 * harness hooks the read/egress plugins use so the panel works even when
 * those plugins are not installed (their published engines are regular
 * dependencies here).
 */
import { resolve } from 'node:path';
import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
import { TrustBus } from './bus.js';
import { aggregate, DEFAULT_PATHS } from './aggregate.js';
import { egressDeniedEvent, janitorEvent, readFindingEvent } from './translate.js';
import type { TrustEvent } from './types.js';

// Engines reused from the published family packages.
import { scanToolResult } from 'dsh-read-guard/lib/policy.js';
import { extractText } from 'dsh-read-guard/lib/content.js';
import { checkUrls, urlsFromShellCommand, urlsFromWebArgs, type EgressPolicy } from 'dsh-egress-gate/lib/policy.js';
import type { ToolSurfaceSnapshot } from 'dsh-mcp-test/lib/diff.js';

export const name = 'dsh-trust-panel';
export const inject = ['webServer', 'tools'];

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

export const Config: Schema<Config> = Schema.object({
  eventsPath: Schema.string().default('.dsh-trust-panel/events.jsonl').description('panel event log path; empty disables'),
  maxEvents: Schema.number().default(500).description('maximum events kept for display'),
  allow: Schema.array(Schema.string()).default([]).description('allowed egress domains (suffix match)'),
  deny: Schema.array(Schema.string()).default([]).description('always-denied egress domains (suffix match)'),
});

// Minimal harness event views; identical shapes merge cleanly in-checkout.
interface ToolExecView {
  readonly name: string;
  readonly arguments?: unknown;
}
interface ToolResultView {
  readonly isError?: boolean;
  readonly content?: unknown;
}

function firstString(args: unknown, keys: string[]): string | undefined {
  if (typeof args !== 'object' || args === null) return undefined;
  const record = args as Record<string, unknown>;
  for (const key of keys) {
    if (typeof record[key] === 'string') return record[key] as string;
  }
  return undefined;
}

// Harness event views restated so the plugin typechecks standalone;
// identical declarations merge cleanly inside the source checkout.
type PreToolDecisionView = { kind: 'allow' } | { kind: 'deny'; reason: string; info?: Record<string, string> };
type PostToolDecisionView = { kind: 'accept'; content?: unknown } | { kind: 'block'; feedback: unknown };

declare module '@deepseek-ai/cordis' {
  interface Events {
    'tools/pre-execute': (
      exec: ToolExecView,
      next: () => Promise<PreToolDecisionView>,
    ) => Promise<PreToolDecisionView>;
    'tools/post-execute': (
      exec: ToolExecView,
      result: Readonly<ToolResultView>,
      next: () => Promise<PostToolDecisionView>,
    ) => Promise<PostToolDecisionView>;
  }
}

export function apply(ctx: Context, config: Config): void {
  const bus = new TrustBus(
    config.eventsPath === '' ? '' : resolve(config.eventsPath),
    config.maxEvents
  );
  void bus.load();

  const cwd = process.cwd();
  const egressPolicy: EgressPolicy = {
    ...(config.allow.length > 0 ? { allow: config.allow } : {}),
    ...(config.deny.length > 0 ? { deny: config.deny } : {}),
  };

  /* ---- live listeners (mirror the read-guard / egress-gate hooks) ---- */

  ctx.on('tools/post-execute', async (exec: ToolExecView, result: ToolResultView, next: () => Promise<PostToolDecisionView>): Promise<PostToolDecisionView> => {
    const decision = await next();
    if (result.isError) return decision;

    const text = extractText(Array.isArray(result.content) ? result.content : []);

    // read channel: same engine read-guard uses, observation only
    if (text !== '') {
      for (const finding of scanToolResult(text, exec.name, 'neutral')) {
        if (finding.severity === 'high' || finding.severity === 'medium') {
          bus.report(readFindingEvent(finding.ruleId as string, finding.severity, finding.evidence, exec.name));
        }
      }
    }

    // leave channel: janitor scans surface as tool results
    if (exec.name === 'janitor_scan' && text !== '') {
      const needsReview = (text.match(/needs-review/g) ?? []).length;
      const protectedCount = (text.match(/protected/g) ?? []).length;
      bus.report(janitorEvent(needsReview, protectedCount, 'dsh-janitor'));
    }
    return decision;
  });

  ctx.on('tools/pre-execute', async (exec: ToolExecView, next: () => Promise<PreToolDecisionView>): Promise<PreToolDecisionView> => {
    // egress channel: outbound destinations in web args and shell fetches
    const urls = [...urlsFromWebArgs(exec.arguments)];
    const command = firstString(exec.arguments, ['command', 'cmd', 'script']);
    if (command !== undefined) urls.push(...urlsFromShellCommand(command));
    if (urls.length > 0) {
      const denied = checkUrls(urls, egressPolicy)
        .filter((v: { action: string }) => v.action === 'deny')
        .map((v: { url: string }) => v.url);
      if (denied.length > 0) {
        bus.report(egressDeniedEvent(denied));
      }
    }
    return next();
  });

  /* ---- HTTP route for the web client ---- */

  const webServer = (ctx as unknown as {
    webServer: { register(route: { kind: string; path: string; handler: (req: unknown, res: unknown) => Promise<void> }): unknown };
  }).webServer;
  const tools = (ctx as unknown as {
    tools: { schemas(): { name: string; description: string; parameters: unknown }[] };
  }).tools;

  const registerRoute = (): void => {
    void webServer.register({
      kind: 'exact',
      path: '/trust-panel/api/summary',
      handler: async (_req: unknown, res: unknown) => {
        const r = res as { setHeader(k: string, v: string): void; end(body: string): void };
        let current: ToolSurfaceSnapshot | null = null;
        try {
          current = { time: new Date().toISOString(), tools: tools.schemas().map((schema) => ({
            name: schema.name,
            description: schema.description,
            parameters: schema.parameters,
          })) };
        } catch {
          current = null;
        }
        const summary = await aggregate({ cwd, ...DEFAULT_PATHS }, bus.list(), current);
        r.setHeader('content-type', 'application/json');
        r.end(JSON.stringify(summary));
      },
    });
  };
  ctx.effect(() => {
    registerRoute();
    return () => undefined;
  });

  // Minimal service so family plugins can push their own events without a
  // hard dependency on the panel (present only while the panel is loaded).
  (ctx as unknown as { reflect?: { provide(n: string, v: unknown): unknown } }).reflect?.provide('trustPanel', {
    report: (ev: TrustEvent) => bus.report(ev),
  });

  console.log('[dsh-trust-panel] watching 9 channels; api at /trust-panel/api/summary');
}
