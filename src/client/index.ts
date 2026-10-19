/**
 * Client half: registers a native right-sidebar tab and renders the
 * plain-language trust dashboard. Plain createElement (no JSX) so the
 * package builds with stock tsc and no bundler step.
 */
import { createElement as h, useEffect, useState } from 'react';
import type { Context } from '@deepseek-ai/cordis';
import type { PanelSummary, TrustEvent } from '../types.js';

export const name = 'dsh-trust-panel/client';

// Minimal client-half surface, structurally typed so the package
// typechecks without the (browser-only) dsh client UI packages installed.
interface TabRegistry {
  register(def: Record<string, unknown>): () => void;
}
interface SlotsService {
  inject(slot: string, factory: () => { (): unknown; dispose?(): void }): () => void;
  register(
    target: { name: string; key: string },
    component: () => ReturnType<typeof h>
  ): { (): unknown; dispose?(): void };
}
type ClientContext = Context & {
  inject(deps: string[], cb: (injected: { get(name: string): unknown }) => (() => void) | void): unknown;
  slots?: SlotsService;
};

const POLL_MS = 5000;

const STATUS_COLOR: Record<string, string> = {
  ok: '#22c55e',
  activity: '#eab308',
  attention: '#ef4444',
};
const STATUS_DOT: Record<string, string> = {
  ok: '●',
  activity: '●',
  attention: '▲',
};

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function EventCard(ev: TrustEvent): ReturnType<typeof h> {
  const color = ev.outcome === 'attention' ? '#ef4444' : '#6b7280';
  return h(
    'div',
    {
      key: `${ev.time}-${ev.channel}-${ev.title}`,
      style: {
        borderLeft: `3px solid ${color}`,
        padding: '8px 10px',
        marginBottom: 6,
        background: 'rgba(127,127,127,0.08)',
        borderRadius: 4,
        fontSize: 12,
        lineHeight: 1.5,
      },
    },
    h('div', { style: { color: '#9ca3af', fontSize: 10 } }, `${timeAgo(ev.time)} · ${ev.source}`),
    h('div', { style: { marginTop: 2 } }, ev.title),
    ev.detail !== undefined ? h('div', { style: { color: '#9ca3af', marginTop: 2 } }, ev.detail) : null
  );
}

function ChannelRow(ch: PanelSummary['channels'][number]): ReturnType<typeof h> {
  return h(
    'div',
    {
      key: ch.channel,
      style: { display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 0', opacity: ch.present ? 1 : 0.4 },
    },
    h('span', null, ch.label),
    h('span', { style: { color: ch.count > 0 ? '#eab308' : '#6b7280' } }, ch.present ? (ch.count > 0 ? String(ch.count) : '—') : 'off')
  );
}

function TrustPanel(): ReturnType<typeof h> {
  const [summary, setSummary] = useState<PanelSummary | null>(null);

  useEffect(() => {
    let stopped = false;
    const tick = (): void => {
      void fetch('/trust-panel/api/summary')
        .then((r) => (r.ok ? (r.json() as Promise<PanelSummary>) : null))
        .then((s) => {
          if (!stopped && s !== null) setSummary(s);
        })
        .catch(() => undefined);
    };
    tick();
    const timer = setInterval(tick, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, []);

  if (summary === null) {
    return h('div', { style: { padding: 12, fontSize: 12, color: '#6b7280' } }, 'Loading trust panel…');
  }

  const color = STATUS_COLOR[summary.status] ?? '#6b7280';
  return h(
    'div',
    { style: { padding: 12, fontFamily: 'system-ui, sans-serif' } },
    // status light
    h(
      'div',
      { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 } },
      h('span', { style: { color, fontSize: 18 } }, STATUS_DOT[summary.status] ?? '●'),
      h('span', { style: { fontSize: 13, fontWeight: 600 } }, summary.statusText)
    ),
    // channel grid
    h(
      'div',
      { style: { borderBottom: '1px solid rgba(127,127,127,0.25)', paddingBottom: 6, marginBottom: 8 } },
      summary.channels.map((ch) => ChannelRow(ch))
    ),
    // events, newest first
    summary.events.length === 0
      ? h('div', { style: { fontSize: 12, color: '#6b7280' } }, 'No events yet.')
      : summary.events.map((ev) => EventCard(ev))
  );
}

export function apply(context: Context): void {
  const ctx = context as ClientContext;
  // The tab registry is a service: registering from the slot declaration
  // alone never lands (the declaration fires before the service appears).
  ctx.inject(['sidebarRightTabs'], (injected: { get(name: string): unknown }) => {
    const tabs = injected.get('sidebarRightTabs') as TabRegistry | undefined;
    if (tabs === undefined || ctx.slots === undefined) return;

    const offTab = tabs.register({
      id: 'dsh-trust-panel:main',
      kind: 'trust-panel',
      title: () => 'Trust',
    });

    const slots = ctx.slots;
    const offSlot = slots.inject('sidebar.right.pane.tab', () =>
      slots.register(
        { name: 'sidebar.right.pane.tab', key: 'dsh-trust-panel:main' },
        () => h('div', { style: { height: '100%', overflowY: 'auto' } }, h(TrustPanel))
      )
    );

    return () => {
      offSlot();
      offTab();
    };
  });
}
