/**
 * Host half: aggregates the trust family's files and live signals, exposes
 * them over an HTTP route for the web client, and side-listens the same
 * harness hooks the read/egress plugins use so the panel works even when
 * those plugins are not installed (their published engines are regular
 * dependencies here).
 */
import { resolve } from 'node:path';
import Schema from '@deepseek-ai/schemastery';
import { TrustBus } from './bus.js';
import { aggregate, DEFAULT_PATHS } from './aggregate.js';
import { egressDeniedEvent, janitorEvent, readFindingEvent } from './translate.js';
// Engines reused from the published family packages.
import { scanToolResult } from 'dsh-read-guard/lib/policy.js';
import { extractText } from 'dsh-read-guard/lib/content.js';
import { checkUrls, urlsFromShellCommand, urlsFromWebArgs } from 'dsh-egress-gate/lib/policy.js';
export const name = 'dsh-trust-panel';
export const inject = ['tools'];
export const Config = Schema.object({
    eventsPath: Schema.string().default('.dsh-trust-panel/events.jsonl').description('panel event log path; empty disables'),
    maxEvents: Schema.number().default(500).description('maximum events kept for display'),
    allow: Schema.array(Schema.string()).default([]).description('allowed egress domains (suffix match)'),
    deny: Schema.array(Schema.string()).default([]).description('always-denied egress domains (suffix match)'),
});
function firstString(args, keys) {
    if (typeof args !== 'object' || args === null)
        return undefined;
    const record = args;
    for (const key of keys) {
        if (typeof record[key] === 'string')
            return record[key];
    }
    return undefined;
}
export function apply(ctx, config) {
    const bus = new TrustBus(config.eventsPath === '' ? '' : resolve(config.eventsPath), config.maxEvents);
    void bus.load();
    const cwd = process.cwd();
    const egressPolicy = {
        ...(config.allow.length > 0 ? { allow: config.allow } : {}),
        ...(config.deny.length > 0 ? { deny: config.deny } : {}),
    };
    /* ---- live listeners (mirror the read-guard / egress-gate hooks) ---- */
    ctx.on('tools/post-execute', async (exec, result, next) => {
        const decision = await next();
        if (result.isError)
            return decision;
        const text = extractText(Array.isArray(result.content) ? result.content : []);
        // read channel: same engine read-guard uses, observation only
        if (text !== '') {
            for (const finding of scanToolResult(text, exec.name, 'neutral')) {
                if (finding.severity === 'high' || finding.severity === 'medium') {
                    bus.report(readFindingEvent(finding.ruleId, finding.severity, finding.evidence, exec.name));
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
    ctx.on('tools/pre-execute', async (exec, next) => {
        // egress channel: outbound destinations in web args and shell fetches
        const urls = [...urlsFromWebArgs(exec.arguments)];
        const command = firstString(exec.arguments, ['command', 'cmd', 'script']);
        if (command !== undefined)
            urls.push(...urlsFromShellCommand(command));
        if (urls.length > 0) {
            const denied = checkUrls(urls, egressPolicy)
                .filter((v) => v.action === 'deny')
                .map((v) => v.url);
            if (denied.length > 0) {
                bus.report(egressDeniedEvent(denied));
            }
        }
        return next();
    });
    const tools = ctx.tools;
    const registerRoute = (webServer) => {
        void webServer.register({
            kind: 'exact',
            path: '/trust-panel/api/summary',
            handler: async (_req, res) => {
                const r = res;
                let current = null;
                try {
                    current = { time: new Date().toISOString(), tools: tools.schemas().map((schema) => ({
                            name: schema.name,
                            description: schema.description,
                            parameters: schema.parameters,
                        })) };
                }
                catch {
                    current = null;
                }
                const summary = await aggregate({ cwd, ...DEFAULT_PATHS }, bus.list(), current);
                r.setHeader('content-type', 'application/json');
                r.end(JSON.stringify(summary));
            },
        });
    };
    ctx.inject(['webServer'], (scoped) => {
        const server = scoped.webServer;
        if (server !== undefined)
            registerRoute(server);
    });
    // Minimal service so family plugins can push their own events without a
    // hard dependency on the panel (present only while the panel is loaded).
    ctx.reflect?.provide('trustPanel', {
        report: (ev) => bus.report(ev),
    });
    console.log('[dsh-trust-panel] watching 9 channels; api at /trust-panel/api/summary');
}
//# sourceMappingURL=index.js.map