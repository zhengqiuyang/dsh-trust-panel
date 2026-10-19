/**
 * Client half of dsh-trust-panel, authored directly in the dsh web
 * module-table format (window.__ModuleLoader__): react is provided by the
 * runtime's module table, not bundled. No build step for this file.
 *
 * i18n follows the DSH pattern: the client attaches the `locale` service
 * (@deepseek-ai/dsh-client-locale); `t()` resolves the active locale from
 * its snapshot and interpolates {params}. Events arrive from the host as
 * translation keys + params (with English fallbacks), so the panel switches
 * languages live without a host restart.
 */
// eslint-disable-next-line no-undef
window.__ModuleLoader__.load({
  id: 'dsh-trust-panel',
  factory: (require) => {
    const react = require('react');
    const h = react.createElement;
    const useState = react.useState;
    const useEffect = react.useEffect;

    const inject = ['slots', 'sessions', 'locale'];

    const POLL_MS = 5000;

    /* ---------------- i18n ---------------- */

    const en = {
      tabTitle: 'Trust',
      loading: 'Loading trust panel…',
      noEvents: 'No events yet.',
      intro: 'This panel is your agent\'s dashcam: it watches what the agent reads, changes, and sends, and reports anything suspicious. Most of the time it should be green.',
      introStatus: 'Status light:',
      introGreen: 'nothing suspicious.',
      introYellow: 'caught something, already handled.',
      introRed: 'one thing needs your decision (see below).',
      introRows: 'Each row is one watched aspect: "—" means all clear this session; "off" means that guard plugin is not installed.',
      introDismiss: 'Got it',
      'status.ok': 'All clear — nothing suspicious reached your agent.',
      'status.activity': 'Caught a few things — all handled, nothing needs you.',
      'status.attention': 'Something needs your decision — see below.',
      'ch.read': 'What the agent reads',
      'ch.write': 'What the agent changes',
      'ch.custody': 'The activity record',
      'ch.toolsurface': 'The tools it can use',
      'ch.leave': 'Leftovers in your workspace',
      'ch.egress': 'Where data is sent',
      'ch.prompt': 'The instructions it starts with',
      'ch.composition': 'The plugins that are loaded',
      'ch.memory': 'What it remembers',
      'note.watching': 'watching',
      'note.notInstalled': 'not installed',
      'note.checkpoint': 'checkpoint taken {time}',
      'note.pinned': 'profile "{profile}" pinned',
      'off': 'off',
      'ago.s': '{n}s ago', 'ago.m': '{n}m ago', 'ago.h': '{n}h ago', 'ago.d': '{n}d ago',
      'ev.read.override': 'Something the agent read tried to override your instructions. It was quarantined — the agent did not follow it.',
      'ev.read.promptExfil': 'Something the agent read asked it to print your system prompt. It was quarantined — the agent did not follow it.',
      'ev.read.credsExfil': 'Something the agent read asked it to send your credentials somewhere. It was quarantined — the agent did not follow it.',
      'ev.read.envProbe': 'Something the agent read asked it to probe your environment variables. It was quarantined — the agent did not follow it.',
      'ev.read.hiddenUnicode': 'Something the agent read hid instructions inside invisible characters. It was quarantined — the agent did not follow it.',
      'ev.read.agentDirective': 'Something the agent read addressed it as if it were the user. It was quarantined — the agent did not follow it.',
      'ev.read.rulesBackdoor': 'Something the agent read tried to rewrite the agent safety rules. It was quarantined — the agent did not follow it.',
      'ev.read.resourceLure': 'Something the agent read lured it toward a resource. It was quarantined — the agent did not follow it.',
      'ev.read.suspicious': 'Something the agent read contained suspicious instructions. It was quarantined — the agent did not follow it.',
      'ev.read.detail': 'Found while reading {tool}. Detail: {rule} ({severity}).',
      'ev.write.denied': 'The agent tried to change a file it promised not to touch. Blocked.',
      'ev.write.deniedDetail': 'Denied write to {path} (rule: {rule}). If this is what you asked for, adjust the rule and retry.',
      'ev.write.residue': 'A completed write left suspicious leftovers behind.',
      'ev.write.residueDetail': '{path}: {kinds} residue detected after writing.',
      'ev.custody.intact': 'The activity record is intact — {count} entries, nothing was altered.',
      'ev.custody.intactDetail': 'Hash chain verified from the first entry to the head ({head}…).',
      'ev.custody.broken': 'The activity record does not add up — an entry may have been altered or removed.',
      'ev.custody.brokenDetail': 'Chain check failed at entry #{seq} ({reason}). Review who could have edited the ledger file.',
      'ev.tools.drift': 'The tools available to your agent changed since the last checkpoint.',
      'ev.tools.driftDetail': '{parts}: {names}. If you did not install or update anything, look into it.',
      'ev.leave.clean': 'Workspace scan found nothing that needs cleanup.',
      'ev.leave.cleanDetail': '{protected} protected items checked.',
      'ev.leave.review': 'Workspace scan found {count} leftover item(s) worth reviewing.',
      'ev.leave.reviewDetail': 'Leftover files from finished work can confuse the agent later. Run the janitor_scan tool for the full list.',
      'ev.egress.denied': 'The agent tried to send data to a website that is not on your allow list. Blocked.',
      'ev.egress.deniedDetail': 'Destination: {urls}. Add it to the allow list if this send was intended.',
      'ev.prompt.drift': 'The instructions your agent starts every session with have changed.',
      'ev.prompt.driftDetail': 'Changed sections: {fields}. This is expected after a plugin update — unexpected if you changed nothing.',
      'ev.composition.drift': 'The set of installed plugins changed since the last checkpoint.',
      'ev.composition.driftDetail': 'Changed: {fields}. Verify you intended this change before continuing.',
      'ev.memory.survived': 'A long conversation was summarized — all {count} of your standing instructions survived.',
      'ev.memory.lost': 'A long conversation was summarized — the agent forgot {lost} of your instructions. They were re-inserted automatically.',
      'ev.memory.lostDetail': '{examples}',
    };

    const zh = {
      tabTitle: '信任',
      loading: '信任面板加载中…',
      noEvents: '还没有事件。',
      intro: '这个面板是你 agent 的行车记录仪:它盯着 agent 读什么、改什么、往哪发,有可疑就报告。大多数时候它应该是绿的。',
      introStatus: '状态灯:',
      introGreen: '没有可疑情况。',
      introYellow: '拦到了什么,已经处理好了。',
      introRed: '有一件事需要你决定(见下方)。',
      introRows: '每一行是一个被监控的方面:"—" 表示本次会话平安无事;"关" 表示对应的防护插件没有安装。',
      introDismiss: '知道了',
      'status.ok': '一切正常——没有可疑内容接触到你的 agent。',
      'status.activity': '拦下了几件事——都已处理,不需要你操作。',
      'status.attention': '有情况需要你决定——见下方。',
      'ch.read': 'Agent 读到的内容',
      'ch.write': 'Agent 改动的内容',
      'ch.custody': '活动记录',
      'ch.toolsurface': '它能用的工具',
      'ch.leave': '工作区里的残留',
      'ch.egress': '数据发往哪里',
      'ch.prompt': '它开场的指令',
      'ch.composition': '加载的插件',
      'ch.memory': '它记住的东西',
      'note.watching': '监控中',
      'note.notInstalled': '未安装',
      'note.checkpoint': '检查点建立于 {time}',
      'note.pinned': '配置 "{profile}" 已锁定',
      'off': '关',
      'ago.s': '{n} 秒前', 'ago.m': '{n} 分钟前', 'ago.h': '{n} 小时前', 'ago.d': '{n} 天前',
      'ev.read.override': 'Agent 读到的内容里有东西想推翻你的指令。已隔离——agent 没有理会它。',
      'ev.read.promptExfil': 'Agent 读到的内容里有东西让它打印系统提示词。已隔离——agent 没有理会它。',
      'ev.read.credsExfil': 'Agent 读到的内容里有东西想把你的密钥发到别处。已隔离——agent 没有理会它。',
      'ev.read.envProbe': 'Agent 读到的内容里有东西想让它探测你的环境变量。已隔离——agent 没有理会它。',
      'ev.read.hiddenUnicode': 'Agent 读到的内容把指令藏在不可见字符里。已隔离——agent 没有理会它。',
      'ev.read.agentDirective': 'Agent 读到的内容里有东西冒充用户对它下指令。已隔离——agent 没有理会它。',
      'ev.read.rulesBackdoor': 'Agent 读到的内容里有东西想改写安全规则。已隔离——agent 没有理会它。',
      'ev.read.resourceLure': 'Agent 读到的内容里有东西诱导它访问某个资源。已隔离——agent 没有理会它。',
      'ev.read.suspicious': 'Agent 读到的内容里含可疑指令。已隔离——agent 没有理会它。',
      'ev.read.detail': '读取 {tool} 时发现。详情:{rule}({severity})。',
      'ev.write.denied': 'Agent 想改它承诺不碰的文件。已拦截。',
      'ev.write.deniedDetail': '对 {path} 的写入被拒(规则:{rule})。如果这正是你要的,调整规则后重试。',
      'ev.write.residue': '一次写入完成后留下了可疑残留。',
      'ev.write.residueDetail': '{path}:写入后检测到 {kinds} 残留。',
      'ev.custody.intact': '活动记录完整——共 {count} 条,没有任何改动。',
      'ev.custody.intactDetail': '哈希链从第一条校验到链头({head}…)。',
      'ev.custody.broken': '活动记录对不上——可能有条目被篡改或删除。',
      'ev.custody.brokenDetail': '链校验在第 #{seq} 条失败({reason})。检查一下谁可能改过台账文件。',
      'ev.tools.drift': '你的 agent 可用的工具相对上次检查点发生了变化。',
      'ev.tools.driftDetail': '{parts}:{names}。如果你没有安装或更新任何东西,需要查一下。',
      'ev.leave.clean': '工作区扫描未发现需要清理的东西。',
      'ev.leave.cleanDetail': '已检查 {protected} 个受保护条目。',
      'ev.leave.review': '工作区扫描发现 {count} 个值得查看的残留。',
      'ev.leave.reviewDetail': '已完成工作的残留文件之后可能干扰 agent。运行 janitor_scan 工具查看完整清单。',
      'ev.egress.denied': 'Agent 想把数据发到不在你允许名单上的网站。已拦截。',
      'ev.egress.deniedDetail': '目的地:{urls}。如果这次发送是你 intended 的,把它加进允许名单。',
      'ev.prompt.drift': '你的 agent 每次会话开场的指令发生了变化。',
      'ev.prompt.driftDetail': '变化的章节:{fields}。插件更新后出现是正常的;你什么都没改过就出现则要留意。',
      'ev.composition.drift': '已安装插件的组合相对上次检查点发生了变化。',
      'ev.composition.driftDetail': '变化:{fields}。继续之前确认这是你主动做的变更。',
      'ev.memory.survived': '一段长对话被摘要压缩——你的 {count} 条常驻指令全部保留。',
      'ev.memory.lost': '一段长对话被摘要压缩——agent 忘了 {lost} 条你的指令。已自动重新注入。',
      'ev.memory.lostDetail': '{examples}',
    };

    let localeService;
    function attachLocale(service) {
      localeService = service;
    }
    function activeLocale() {
      let active = '';
      try {
        active = localeService?.getSnapshot?.().active ?? '';
      } catch {
        active = '';
      }
      if (active.startsWith('zh')) return 'zh';
      if (active.startsWith('en')) return 'en';
      // fall back to the browser language when no service is attached
      const nav = typeof navigator !== 'undefined' ? navigator.language : 'en';
      return nav && nav.toLowerCase().startsWith('zh') ? 'zh' : 'en';
    }
    function t(key, params, fallback) {
      const dict = activeLocale() === 'zh' ? zh : en;
      let text = dict[key] ?? en[key] ?? fallback ?? key;
      if (params !== undefined) {
        for (const [k, v] of Object.entries(params)) {
          text = text.split(`{${k}}`).join(String(v));
        }
      }
      return text;
    }

    /* ---------------- rendering ---------------- */

    const C = {
      ok: '#22c55e',
      activity: '#e59e0b',
      attention: '#ef4444',
      muted: 'rgba(127,127,127,0.85)',
      faint: 'rgba(127,127,127,0.55)',
      line: 'rgba(127,127,127,0.22)',
      card: 'rgba(127,127,127,0.07)',
      cardHover: 'rgba(127,127,127,0.12)',
    };
    const STATUS_DOT = { ok: '●', activity: '●', attention: '▲' };
    const CHANNEL_ICON = {
      read: '👁',
      write: '✏️',
      custody: '🔗',
      toolsurface: '🧰',
      leave: '🧹',
      egress: '📤',
      prompt: '📜',
      composition: '🧩',
      memory: '🧠',
    };

    function timeAgo(iso) {
      const s = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000));
      if (s < 60) return t('ago.s', { n: s });
      if (s < 3600) return t('ago.m', { n: Math.floor(s / 60) });
      if (s < 86400) return t('ago.h', { n: Math.floor(s / 3600) });
      return t('ago.d', { n: Math.floor(s / 86400) });
    }

    function EventCard(ev) {
      const attention = ev.outcome === 'attention';
      const accent = attention ? C.attention : C.activity;
      const icon = attention ? '⚠️' : '🛡️';
      const title = t(ev.titleKey, ev.titleParams, ev.title);
      const detail = ev.detailKey !== undefined ? t(ev.detailKey, ev.detailParams, ev.detail) : ev.detail;
      return h(
        'div',
        {
          key: `${ev.time}-${ev.channel}-${ev.titleKey}`,
          style: {
            position: 'relative',
            padding: '10px 12px 10px 14px',
            marginBottom: 8,
            background: C.card,
            borderRadius: 8,
            border: `1px solid ${attention ? 'rgba(239,68,68,0.35)' : 'rgba(127,127,127,0.15)'}`,
            borderLeft: `3px solid ${accent}`,
            fontSize: 12,
            lineHeight: 1.55,
            transition: 'background .15s',
          },
          onMouseEnter: (e) => { e.currentTarget.style.background = C.cardHover; },
          onMouseLeave: (e) => { e.currentTarget.style.background = C.card; },
        },
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, color: C.faint, fontSize: 10, letterSpacing: 0.2 } },
          h('span', { style: { fontSize: 11 } }, icon),
          h('span', null, timeAgo(ev.time)),
          h('span', null, '·'),
          h('span', null, ev.source),
          CHANNEL_ICON[ev.channel] !== undefined
            ? h('span', { style: { marginLeft: 'auto', fontSize: 10 } }, CHANNEL_ICON[ev.channel])
            : null
        ),
        h('div', { style: { fontWeight: 500 } }, title),
        detail !== undefined
          ? h('div', { style: { color: C.muted, marginTop: 3, fontSize: 11 } }, detail)
          : null
      );
    }

    function ChannelRow(ch) {
      const hasEvents = ch.present && ch.count > 0;
      return h(
        'div',
        {
          key: ch.channel,
          title: t(ch.noteKey, ch.noteParams, ch.note),
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 11,
            padding: '4px 6px',
            borderRadius: 6,
            opacity: ch.present ? 1 : 0.42,
          },
        },
        h('span', { style: { width: 16, textAlign: 'center', fontSize: 11 } }, CHANNEL_ICON[ch.channel] ?? '·'),
        h('span', { style: { flex: 1 } }, t(ch.labelKey, undefined, ch.label)),
        ch.present
          ? hasEvents
            ? h(
                'span',
                {
                  style: {
                    minWidth: 18,
                    textAlign: 'center',
                    padding: '1px 6px',
                    borderRadius: 999,
                    fontSize: 10,
                    fontWeight: 600,
                    color: '#fff',
                    background: C.activity,
                  },
                },
                String(ch.count)
              )
            : h('span', { style: { color: C.faint } }, '—')
          : h(
              'span',
              {
                style: {
                  padding: '1px 6px',
                  borderRadius: 4,
                  fontSize: 10,
                  color: C.muted,
                  border: `1px solid ${C.line}`,
                },
              },
              t('off')
            )
      );
    }

    function StatusHeader(props) {
      const status = props.status;
      const color = C[status] ?? C.muted;
      return h(
        'div',
        {
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 12px',
            borderRadius: 10,
            background: `linear-gradient(135deg, ${color}22, ${color}0a)`,
            border: `1px solid ${color}44`,
            marginBottom: 10,
          },
        },
        h(
          'span',
          {
            style: {
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              height: 28,
              borderRadius: 999,
              fontSize: 15,
              color,
              background: `${color}1f`,
              boxShadow: `0 0 10px ${color}55`,
            },
          },
          STATUS_DOT[status] ?? '●'
        ),
        h(
          'span',
          { style: { fontSize: 13, fontWeight: 600, lineHeight: 1.35 } },
          t(`status.${status}`)
        )
      );
    }

    const INTRO_KEY = 'dsh-trust-panel:intro-dismissed';

    function IntroCard() {
      const [dismissed, setDismissed] = useState(() => {
        try {
          return window.localStorage.getItem(INTRO_KEY) === '1';
        } catch {
          return false;
        }
      });
      if (dismissed) return null;
      return h(
        'div',
        {
          style: {
            border: `1px solid ${C.line}`,
            borderRadius: 10,
            padding: 12,
            marginBottom: 10,
            fontSize: 11,
            lineHeight: 1.65,
            background: C.card,
          },
        },
        h(
          'div',
          { style: { display: 'flex', gap: 8 } },
          h('span', { style: { fontSize: 14 } }, '🛡️'),
          h('div', null,
            h('div', null, t('intro')),
            h(
              'div',
              { style: { marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: '2px 10px' } },
              h('span', null, h('span', { style: { color: C.ok } }, '● '), t('introGreen')),
              h('span', null, h('span', { style: { color: C.activity } }, '● '), t('introYellow')),
              h('span', null, h('span', { style: { color: C.attention } }, '▲ '), t('introRed'))
            ),
            h('div', { style: { marginTop: 6, color: C.muted } }, t('introRows'))
          )
        ),
        h(
          'button',
          {
            onClick: () => {
              try {
                window.localStorage.setItem(INTRO_KEY, '1');
              } catch {
                // private mode — just hide for this session
              }
              setDismissed(true);
            },
            style: {
              marginTop: 8,
              fontSize: 11,
              padding: '3px 14px',
              cursor: 'pointer',
              borderRadius: 6,
              border: `1px solid ${C.line}`,
              background: 'transparent',
              color: 'inherit',
            },
          },
          t('introDismiss')
        )
      );
    }

    function TrustPanel() {
      const [summary, setSummary] = useState(null);

      useEffect(() => {
        let stopped = false;
        const tick = () => {
          fetch('/trust-panel/api/summary')
            .then((r) => (r.ok ? r.json() : null))
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
        return h('div', { style: { padding: 16, fontSize: 12, color: C.muted } }, t('loading'));
      }

      const totalAttention = summary.events.filter((e) => e.outcome === 'attention').length;
      return h(
        'div',
        { style: { padding: 12, fontFamily: 'system-ui, -apple-system, sans-serif' } },
        h(IntroCard),
        h(StatusHeader, { status: summary.status }),
        h(
          'div',
          {
            style: {
              border: `1px solid ${C.line}`,
              borderRadius: 10,
              padding: 6,
              marginBottom: 10,
              background: C.card,
            },
          },
          summary.channels.map((ch) => ChannelRow(ch))
        ),
        totalAttention > 0
          ? h(
              'div',
              { style: { fontSize: 10, color: C.faint, margin: '0 2px 6px', letterSpacing: 0.3 } },
              `${totalAttention} · ${t('status.attention')}`
            )
          : null,
        summary.events.length === 0
          ? h(
              'div',
              {
                style: {
                  padding: '18px 12px',
                  textAlign: 'center',
                  fontSize: 12,
                  color: C.faint,
                  border: `1px dashed ${C.line}`,
                  borderRadius: 10,
                },
              },
              t('noEvents')
            )
          : summary.events.map((ev) => EventCard(ev))
      );
    }

    function apply(ctx) {
      // DSH i18n: attach the locale service so t() follows the host's
      // language preference (falls back to the browser language without it).
      try {
        const service = ctx.get('locale');
        if (service !== undefined) attachLocale(service);
      } catch (error) {
        // no locale service in this composition — browser language is used
      }

      // The tab registry is a service: registering from the slot declaration
      // alone never lands (the declaration fires before the service appears).
      ctx.inject(['sidebarRightTabs'], (injected) => {
        const tabs = injected.get('sidebarRightTabs');
        if (tabs === undefined || ctx.slots === undefined) return;

        const offTab = tabs.register({
          id: 'dsh-trust-panel:main',
          kind: 'trust-panel',
          title: () => t('tabTitle', undefined, 'Trust'),
        });

        const slots = ctx.slots;
        const offSlot = slots.inject('sidebar.right.pane.tab', () =>
          slots.register(
            { name: 'sidebar.right.pane.tab', key: 'dsh-trust-panel:main' },
            () => h('div', { style: { height: '100%', overflowY: 'auto' } }, h(TrustPanel))
          )
        );

        // Native tabs are address-driven: registering a kind does not show
        // anything until the navigation controller opens it. Open the panel
        // once per session so the trust light is visible out of the box.
        try {
          const controller = ctx.get('sidebarRight');
          if (controller !== undefined && typeof controller.openTab === 'function') {
            controller.openTab('trust-panel');
          }
        } catch (error) {
          console.warn('[dsh-trust-panel] could not auto-open tab', error);
        }

        return () => {
          offSlot();
          offTab();
        };
      });
    }

    const exportsObj = {
      name: 'dsh-trust-panel/client',
      inject,
      apply,
      _i18n: { attachLocale, t, hasKey: (key) => key in zh && key in en },
    };
    return exportsObj;
  },
});
