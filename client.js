/**
 * Client half of the balance & usage bundle.
 *
 * Registers one sidebar footer action and one floating panel. Balance and the
 * official usage link come from existing account Remotes; token usage comes
 * from this bundle's own Host route (see index.js).
 */
window.__ModuleLoader__.load({
  id: 'dsh-plugin-balance-usage',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useEffect, useRef, useState } = React
    const nativeSyncExternalStore = React.useSyncExternalStore

    function useSyncExternalStore(subscribe, getSnapshot) {
      if (nativeSyncExternalStore) return nativeSyncExternalStore(subscribe, getSnapshot)
      /* Fallback for a React build without the hook: same contract, coarser. */
      const [value, setValue] = useState(getSnapshot)
      useEffect(() => {
        const unsubscribe = subscribe(() => setValue(getSnapshot()))
        setValue(getSnapshot())
        return unsubscribe
      }, [])
      return value
    }

    const ROUTE = '/plugins/balance-usage/summary'
    const PREFS_ROUTE = '/plugins/balance-usage/prefs'
    const FALLBACK_USAGE_URL = 'https://platform.deepseek.com/usage'
    const KEY_PRIMARY = 'dsh.balance-usage.primary'
    const KEY_COLLAPSED = 'dsh.balance-usage.collapsed'
    const PANEL_ID = 'dbu-panel'
    const PANEL_TITLE_ID = 'dbu-panel-title'
    const PLATFORM_BACK_ID = 'dbu-platform-back'
    /* The footer numbers are glanceable, so they refresh on their own: often while the
       panel is open, less often while it is closed, and immediately when the window
       comes back to the foreground. */
    const REFRESH_OPEN_MS = 15_000
    const REFRESH_IDLE_MS = 30_000
    const TICK_MS = 5_000
    const STALE_MS = 8_000

    /* ---------------------------------------------------------------- *
     * Copy
     * ---------------------------------------------------------------- */

    const COPY = {
      zh: {
        entry: '余额与用量',
        title: '余额与用量',
        refresh: '刷新',
        close: '关闭',
        balance: '账户余额',
        bonus: '赠送余额',
        signedOut: '尚未登录 DeepSeek 账号，登录后可读取余额。',
        signedOutShort: '未登录',
        accountUnavailable: '账户服务不可用',
        usage: 'Token 用量',
        today: '今日',
        total: '累计',
        input: '输入',
        output: '输出',
        cache: '缓存读取',
        requests: '请求',
        primary: '主线',
        auto: '自动',
        setPrimary: '设为主线',
        clearPrimary: '取消主线',
        groups: '模型 / 运营商',
        empty: '还没有用量记录，发送一条消息后再看看。',
        openUsage: '打开官方 Token 用量详情',
        loading: '读取中…',
        failed: '数据读取失败',
        noUsageRoute: '用量统计服务未就绪',
        updated: '更新于',
        last14: '近 14 天',
        sessions: '个会话',
        entryTitle: '余额与用量',
        requestsSuffix: '次请求',
        retry: '重试',
        starHint: '星标 = 侧栏显示的主线',
        stale: '（未更新）',
        composition: '累计构成',
        newWindow: '新窗口',
        back: '返回',
        usagePage: 'Token 用量',
        platformLoading: '正在打开官方页面…',
        platformFailed: '应用内页面打开失败',
        browser: '在浏览器打开',
      },
      en: {
        entry: 'Balance & usage',
        title: 'Balance & usage',
        refresh: 'Refresh',
        close: 'Close',
        balance: 'Account balance',
        bonus: 'Bonus balance',
        signedOut: 'Not signed in to a DeepSeek account. Sign in to read the balance.',
        signedOutShort: 'Signed out',
        accountUnavailable: 'Account service unavailable',
        usage: 'Token usage',
        today: 'Today',
        total: 'Total',
        input: 'Input',
        output: 'Output',
        cache: 'Cache read',
        requests: 'requests',
        primary: 'Main',
        auto: 'Auto',
        setPrimary: 'Set as main',
        clearPrimary: 'Clear main',
        groups: 'Models / providers',
        empty: 'No usage recorded yet. Send a message first.',
        openUsage: 'Open the official token usage page',
        loading: 'Loading…',
        failed: 'Could not load data',
        noUsageRoute: 'Usage service not available',
        updated: 'Updated',
        last14: 'Last 14 days',
        sessions: 'sessions',
        entryTitle: 'Balance & usage',
        requestsSuffix: 'requests',
        retry: 'Retry',
        starHint: 'Star picks the line the sidebar shows',
        stale: ' (not updated)',
        composition: 'Total breakdown',
        newWindow: 'new window',
        back: 'Back',
        usagePage: 'Token usage',
        platformLoading: 'Opening the official page…',
        platformFailed: 'Could not open the page in the app',
        browser: 'Open in browser',
      },
    }

    const PROVIDERS = {
      'deepseek-account': { zh: 'DeepSeek 账号', en: 'DeepSeek account' },
      deepseek: { zh: 'DeepSeek', en: 'DeepSeek' },
      openrouter: { zh: 'OpenRouter', en: 'OpenRouter' },
    }

    /* getLocale() returns the locale snapshot ({ active, locales, revision }), not a tag. */
    function activeLocale() {
      const snapshot = clientCtx?.locale?.getLocale?.()
      return typeof snapshot?.active === 'string' ? snapshot.active : ''
    }

    function isChinese() {
      return activeLocale().toLowerCase().startsWith('zh')
    }

    function copy() {
      return isChinese() ? COPY.zh : COPY.en
    }

    function providerLabel(id) {
      const entry = PROVIDERS[id]
      if (!entry) return id
      return isChinese() ? entry.zh : entry.en
    }

    /* ---------------------------------------------------------------- *
     * Formatting
     * ---------------------------------------------------------------- */

    function fmtTokens(value) {
      const number = Number(value) || 0
      if (number <= 0) return '0'
      if (number >= 1e9) return `${(number / 1e9).toFixed(2)}B`
      if (number >= 1e6) return `${(number / 1e6).toFixed(2)}M`
      if (number >= 1e3) return `${(number / 1e3).toFixed(1)}K`
      return String(Math.round(number))
    }

    function walletNumber(wallet) {
      const parsed = Number(wallet?.balance)
      return Number.isFinite(parsed) ? parsed : null
    }

    function fmtWallet(wallet) {
      if (!wallet) return '—'
      const number = walletNumber(wallet)
      const currency = wallet.currency === 'USD' ? 'USD' : 'CNY'
      if (number === null) return `${currency === 'USD' ? '$' : '¥'}${wallet.balance}`
      try {
        return new Intl.NumberFormat(isChinese() ? 'zh-CN' : 'en-US', {
          style: 'currency',
          currency,
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(number)
      } catch {
        return `${currency === 'USD' ? '$' : '¥'}${number.toFixed(2)}`
      }
    }

    function mainWallet(wallets) {
      if (!Array.isArray(wallets) || wallets.length === 0) return null
      /* CNY is the primary wallet when both currencies are present; otherwise the
         largest usable balance stands in. */
      const cny = wallets.find((wallet) => wallet.currency === 'CNY' && walletNumber(wallet) !== null)
      if (cny) return cny
      const usable = wallets.filter((wallet) => walletNumber(wallet) !== null)
      if (usable.length === 0) return wallets[0]
      return usable.sort((a, b) => walletNumber(b) - walletNumber(a))[0]
    }

    function bonusTotal(wallets) {
      if (!Array.isArray(wallets) || wallets.length === 0) return null
      const usable = wallets.filter((wallet) => walletNumber(wallet) !== null)
      if (usable.length === 0) return null
      const currency = usable[0].currency === 'USD' ? 'USD' : 'CNY'
      const total = usable
        .filter((wallet) => (wallet.currency === 'USD' ? 'USD' : 'CNY') === currency)
        .reduce((sum, wallet) => sum + walletNumber(wallet), 0)
      return { currency, total }
    }

    function fmtClock(ms) {
      if (!ms) return ''
      const date = new Date(ms)
      return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
    }

    function fmtRelative(ms) {
      if (!ms) return ''
      const diff = Date.now() - ms
      const locale = isChinese() ? 'zh-CN' : 'en-US'
      try {
        const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
        const minutes = Math.round(diff / 60_000)
        if (minutes < 1) return rtf.format(0, 'minute')
        if (minutes < 60) return rtf.format(-minutes, 'minute')
        const hours = Math.round(minutes / 60)
        if (hours < 24) return rtf.format(-hours, 'hour')
        const days = Math.round(hours / 24)
        if (days < 15) return rtf.format(-days, 'day')
        return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(new Date(ms))
      } catch {
        const hours = Math.round(diff / 3_600_000)
        return hours < 1 ? '<1h' : `${hours}h`
      }
    }

    /* ---------------------------------------------------------------- *
     * Small persisted settings
     * ---------------------------------------------------------------- */

    function readPrimary() {
      try {
        const raw = globalThis.localStorage?.getItem(KEY_PRIMARY)
        if (!raw) return null
        const value = JSON.parse(raw)
        if (value && typeof value.provider === 'string' && typeof value.model === 'string') return value
      } catch {
        /* ignore a corrupt preference */
      }
      return null
    }

    function writePrimary(value) {
      try {
        if (value) globalThis.localStorage?.setItem(KEY_PRIMARY, JSON.stringify(value))
        else globalThis.localStorage?.removeItem(KEY_PRIMARY)
      } catch {
        /* storage may be unavailable */
      }
      pushPrefs({ primary: value })
    }

    function readCollapsed() {
      try {
        const raw = globalThis.localStorage?.getItem(KEY_COLLAPSED)
        const value = raw ? JSON.parse(raw) : null
        if (Array.isArray(value)) return value.filter((item) => typeof item === 'string')
      } catch {
        /* ignore */
      }
      return []
    }

    function writeCollapsed(value) {
      try {
        globalThis.localStorage?.setItem(KEY_COLLAPSED, JSON.stringify(value))
      } catch {
        /* ignore */
      }
      pushPrefs({ collapsed: value })
    }

    /* The Host keeps the same two settings in `~/.dsh/plugin-settings/balance-usage.json`
       so the profile-sync plugin can carry them to another machine. localStorage stays
       as the offline fallback. */
    async function pushPrefs(patch) {
      try {
        const values = {
          primary: patch.primary !== undefined ? patch.primary : state.primary,
          collapsed: patch.collapsed !== undefined ? patch.collapsed : state.collapsed,
        }
        await fetch(PREFS_ROUTE, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ values }),
          cache: 'no-store',
        })
      } catch {
        /* the Host route may be absent in an older install */
      }
    }

    async function readPrefs() {
      try {
        const options = { headers: { accept: 'application/json' }, cache: 'no-store' }
        if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
          options.signal = AbortSignal.timeout(4000)
        }
        const response = await fetch(PREFS_ROUTE, options)
        if (!response.ok) return null
        const body = await response.json()
        return body && body.ok === true && body.values ? body.values : null
      } catch {
        return null
      }
    }

    /* ---------------------------------------------------------------- *
     * Shared store
     * ---------------------------------------------------------------- */

    let clientCtx = null
    let state = {
      open: false,
      wide: true,
      anchor: null,
      entryEl: null,
      platform: null,
      collapsed: readCollapsed(),
      primary: readPrimary(),
      status: 'idle',
      error: null,
      usage: null,
      usageError: null,
      account: null,
      accountError: null,
      updatedAt: 0,
    }
    const listeners = new Set()

    function setState(patch) {
      state = { ...state, ...patch }
      for (const listener of [...listeners]) listener()
    }

    function subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }

    const getState = () => state
    const useSnapshot = () => useSyncExternalStore(subscribe, getState)

    /* The Desktop shell exposes a native Platform view over the page; a plain browser
       has no such bridge, so the CTA falls back to an ordinary new tab. */
    function platformBridge() {
      const bridge = globalThis.dshPlatform
      return bridge && typeof bridge.open === 'function' ? bridge : null
    }

    let inflight = null
    let timer = null

    function errorText(reason) {
      if (!reason) return null
      if (typeof reason === 'string') return reason
      return String(reason.message || reason)
    }

    async function fetchUsage() {
      const options = { headers: { accept: 'application/json' }, cache: 'no-store' }
      /* A hung Host route must not leave the panel spinning forever. */
      if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
        options.signal = AbortSignal.timeout(8000)
      }
      const response = await fetch(ROUTE, options)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const body = await response.json()
      if (!body || body.ok !== true) throw new Error(body?.error || 'bad payload')
      return body
    }

    function clientVersion() {
      try {
        const env = typeof process !== 'undefined' ? process.env : undefined
        if (env && typeof env.DSH_CLIENT_VERSION === 'string' && env.DSH_CLIENT_VERSION) return env.DSH_CLIENT_VERSION
      } catch {
        /* no process shim */
      }
      const boot = globalThis.__DSH_BOOT__
      const candidate = boot?.clientVersion || boot?.version
      if (typeof candidate === 'string' && candidate) return candidate
      return 'web'
    }

    function clientMetadata() {
      return {
        version: clientVersion(),
        locale: activeLocale() || 'zh_CN',
        timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
      }
    }

    async function fetchAccount(ctx) {
      const remote = ctx?.get?.('remote')
      const account = remote?.account
      if (!account) throw new Error(copy().accountUnavailable)

      const meta = clientMetadata()
      const view = await account.getState()
      const snapshot = view && view.ok ? view.value : null
      const signedIn = snapshot?.status === 'credential-stored'
      const result = {
        signedIn,
        usageUrl: snapshot?.links?.usageUrl || null,
        topUpUrl: snapshot?.links?.topUpUrl || null,
        wallets: [],
        bonusWallets: [],
      }
      if (!signedIn) return result

      const balance = await account.getBalance(meta)
      if (balance && balance.ok && balance.value && balance.value.status === 'ready') {
        result.wallets = balance.value.value || []
        result.bonusWallets = balance.value.bonusWallets || []
      }
      return result
    }

    function load(ctx, options = {}) {
      if (inflight) return inflight
      const fresh = state.status === 'ready' && Date.now() - state.updatedAt < STALE_MS
      if (!options.force && fresh) return Promise.resolve()

      inflight = (async () => {
        if (state.status !== 'ready') setState({ status: 'loading' })
        const [usage, account] = await Promise.allSettled([fetchUsage(), fetchAccount(ctx)])
        const patch = {}
        /* Only a successful round refreshes the freshness stamp; a failed refresh keeps
           the previous "updated at" so the panel never claims newer data than it has. */
        if (usage.status === 'fulfilled' || account.status === 'fulfilled') patch.updatedAt = Date.now()

        if (usage.status === 'fulfilled') {
          patch.usage = usage.value
          patch.usageError = null
        } else {
          patch.usageError = errorText(usage.reason)
        }

        if (account.status === 'fulfilled') {
          patch.account = account.value
          patch.accountError = null
        } else {
          patch.accountError = errorText(account.reason)
        }

        const failed = patch.usageError && patch.accountError
        patch.status = failed ? 'error' : 'ready'
        patch.error = failed ? patch.usageError : null
        setState(patch)
      })().finally(() => {
        inflight = null
      })

      return inflight
    }

    /* ---------------------------------------------------------------- *
     * Derived data
     * ---------------------------------------------------------------- */

    function allModels(usage) {
      if (!usage || !Array.isArray(usage.groups)) return []
      const rows = []
      for (const group of usage.groups) {
        for (const model of group.models || []) {
          rows.push({ ...model, provider: group.provider })
        }
      }
      return rows
    }

    function resolveMain(usage, primary) {
      const rows = allModels(usage)
      if (rows.length === 0) return null
      if (primary) {
        const hit = rows.find((row) => row.provider === primary.provider && row.model === primary.model)
        if (hit) return { row: hit, explicit: true }
      }
      rows.sort((a, b) => b.tokens - a.tokens || b.lastUsed - a.lastUsed)
      return { row: rows[0], explicit: false }
    }

    /* ---------------------------------------------------------------- *
     * Styles
     * ---------------------------------------------------------------- */

    const CSS = `
.dbu-entry{flex:0 1 auto;display:flex;align-items:center;gap:8px;min-width:0;max-width:100%;box-sizing:border-box;margin-top:4px;padding:4px 8px;border:0;border-radius:8px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer;transition:background-color .12s ease,color .12s ease}
.dbu-entry:hover{background:var(--dsw-alias-bg-skeleton)}
.dbu-entry[data-wide="false"]{width:32px;height:32px;padding:0;justify-content:center;position:relative}
.dbu-entry__icon{flex:none;display:inline-flex;align-items:center;color:var(--dsw-alias-label-secondary)}
.dbu-entry:hover .dbu-entry__icon{color:var(--dsw-alias-label-primary)}
.dbu-entry__body{display:flex;flex-direction:column;min-width:0;line-height:1.3}
.dbu-entry__money{font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dbu-entry__meta{font-size:11px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dbu-entry__dot{position:absolute;top:1px;right:1px;width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-chart-messages);box-shadow:0 0 0 2px var(--dsw-alias-bg-layer-1)}
.dbu-entry__dot[data-state="error"]{background:var(--dsw-alias-state-error-primary)}
.dbu-scrim{position:fixed;inset:0;z-index:998;background:transparent}
.dbu-platform{position:fixed;top:0;bottom:0;z-index:1100;box-sizing:border-box;display:flex;flex-direction:column;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);box-shadow:-1px 0 0 0 var(--dsw-alias-border-l1)}
.dbu-platform__bar{flex:none;display:flex;align-items:center;gap:8px;height:44px;box-sizing:border-box;padding:0 12px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base)}
.dbu-platform__tab{display:inline-flex;align-items:center;gap:6px;max-width:100%;height:28px;box-sizing:border-box;padding:0 4px 0 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1)}
.dbu-platform__tabdot{flex:none;width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-chart-messages)}
.dbu-platform__tablabel{font-size:12px;font-weight:550;color:var(--dsw-alias-label-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dbu-platform__close{flex:none;display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border:0;border-radius:5px;background:transparent;color:var(--dsw-alias-label-primary);opacity:.7;cursor:pointer}
.dbu-platform__close:hover{background:var(--dsw-alias-bg-skeleton);opacity:1}
.dbu-platform__close:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.dbu-platform__viewport{position:relative;flex:1;min-height:0}
.dbu-platform__status{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:24px;text-align:center;font-size:12px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base)}
.dbu-platform__fail{opacity:.85}
.dbu-platform__actions{display:flex;align-items:center;gap:8px}
.dbu-platform__actions .dbu-retry{text-decoration:none}
.dbu-platform__spinner{width:18px;height:18px;border-radius:50%;border:2px solid var(--dsw-alias-bg-skeleton);border-top-color:var(--dsw-alias-brand-primary);animation:dbu-spin .9s linear infinite}
.dbu-panel{position:fixed;z-index:999;box-sizing:border-box;display:flex;flex-direction:column;width:336px;max-width:calc(100vw - 24px);max-height:72vh;border-radius:14px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-overlay);box-shadow:0 18px 48px rgba(0,0,0,.32);color:var(--dsw-alias-label-primary);font:inherit;overflow:hidden}
.dbu-panel:focus{outline:none}
.dbu-panel:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.dbu-head{display:flex;align-items:center;gap:6px;padding:12px 12px 6px 14px}
.dbu-head__title{font-size:13px;font-weight:600;margin:0}
.dbu-head__time{font-size:11px;color:var(--dsw-alias-label-primary);opacity:.8;margin:0 auto 0 6px;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dbu-iconbtn{flex:none;display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-primary);opacity:.75;cursor:pointer}
.dbu-iconbtn:hover{background:var(--dsw-alias-bg-skeleton);opacity:1}
.dbu-iconbtn[data-busy="true"]{opacity:1;cursor:progress}
.dbu-iconbtn[data-busy="true"] svg{animation:dbu-spin .9s linear infinite}
@keyframes dbu-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion: reduce){.dbu-iconbtn[data-busy="true"] svg{animation:none}}
.dbu-body{display:flex;flex-direction:column;gap:10px;padding:2px 14px 14px;overflow-y:auto;scrollbar-width:thin}
.dbu-card{border-radius:10px;background:var(--dsw-alias-bg-layer-1);padding:10px 12px}
.dbu-card__label{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--dsw-alias-label-primary);opacity:.8;margin-bottom:4px}
.dbu-money{font-size:22px;font-weight:650;letter-spacing:-.01em;font-variant-numeric:tabular-nums;line-height:1.2}
.dbu-chip{font-size:11px;padding:1px 7px;border-radius:999px;background:var(--dsw-alias-bg-skeleton);color:var(--dsw-alias-label-primary);white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}
.dbu-chip--main{background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base)}
.dbu-muted{font-size:11px;color:var(--dsw-alias-label-primary);opacity:.88}
.dbu-big{font-size:18px;font-weight:600;font-variant-numeric:tabular-nums;line-height:1.25}
.dbu-big--sub{font-size:15px;font-weight:500;color:var(--dsw-alias-label-primary);opacity:.85}
.dbu-row{display:flex;align-items:baseline;gap:8px}
.dbu-row--between{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
.dbu-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:8px}
.dbu-stat{font-size:10px;color:var(--dsw-alias-label-primary);opacity:.8}
.dbu-stat b{display:block;font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums}
.dbu-chart{display:flex;align-items:flex-end;gap:3px;height:32px;margin-top:10px}
.dbu-chart i{flex:1;border-radius:2px 2px 0 0;background:var(--dsw-alias-chart-messages);opacity:.55}
.dbu-chart i[data-empty="true"]{height:2px!important;background:var(--dsw-alias-bg-skeleton);opacity:1;border-radius:1px}
.dbu-chart i[data-today="true"]{opacity:1}
.dbu-section{display:flex;flex-direction:column;gap:2px}
.dbu-section__head{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--dsw-alias-label-primary);opacity:.8;padding:0 2px 2px}
.dbu-section__hint{font-size:10.5px;color:var(--dsw-alias-label-primary);opacity:.6}
.dbu-group__row{display:flex;align-items:center;gap:6px;width:100%;box-sizing:border-box;padding:5px 6px;border:0;border-radius:6px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.dbu-group__row:hover{background:var(--dsw-alias-bg-skeleton)}
.dbu-group__name{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dbu-group__val{margin-left:auto;font-size:11px;color:var(--dsw-alias-label-primary);opacity:.8;font-variant-numeric:tabular-nums;white-space:nowrap}
.dbu-chevron{flex:none;display:inline-flex;color:var(--dsw-alias-label-primary);opacity:.6;transition:transform .12s ease}
.dbu-chevron[data-open="true"]{transform:rotate(90deg)}
.dbu-models{display:flex;flex-direction:column;padding-left:12px}
.dbu-model{display:flex;align-items:center;gap:6px;width:100%;box-sizing:border-box;padding:5px 6px;border-radius:6px;color:inherit;font:inherit;text-align:left;cursor:default}
.dbu-model[data-main="true"]{box-shadow:inset 2px 0 0 0 var(--dsw-alias-chart-messages)}
.dbu-model__name{font-size:11px;color:var(--dsw-alias-label-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dbu-model[data-main="true"] .dbu-model__name{font-weight:600}
.dbu-model__val{margin-left:auto;font-size:11px;color:var(--dsw-alias-label-primary);opacity:.75;font-variant-numeric:tabular-nums;white-space:nowrap}
.dbu-star{flex:none;display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer}
.dbu-star:hover{background:var(--dsw-alias-bg-skeleton);color:var(--dsw-alias-label-secondary)}
.dbu-star[data-active="true"]{color:var(--dsw-alias-state-warn-label)}
.dbu-cta{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;box-sizing:border-box;padding:8px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);font-size:12px;font-family:inherit;cursor:pointer;text-decoration:none}
.dbu-cta:hover{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}
.dbu-note{font-size:11px;color:var(--dsw-alias-label-primary);opacity:.8;padding:2px}
.dbu-danger{display:flex;align-items:flex-start;gap:6px;font-size:11.5px;font-weight:500;line-height:1.5;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-skeleton);border-left:2px solid var(--dsw-alias-state-error-primary);border-radius:4px;padding:5px 7px}
.dbu-danger b{color:var(--dsw-alias-state-error-primary);font-weight:600;flex:none}
.dbu-retry{flex:none;margin-left:auto;padding:1px 7px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:11px;cursor:pointer}
.dbu-retry:hover{border-color:var(--dsw-alias-brand-primary)}
.dbu-skel{border-radius:6px;background:var(--dsw-alias-bg-skeleton);animation:dbu-pulse 1.4s ease-in-out infinite}
.dbu-skel--line{height:18px}
.dbu-skel--line-lg{height:26px}
@keyframes dbu-pulse{0%,100%{opacity:.6}50%{opacity:1}}
@media (prefers-reduced-motion: reduce){.dbu-skel{animation:none}}
.dbu-sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.dbu-entry:focus-visible,.dbu-iconbtn:focus-visible,.dbu-group__row:focus-visible,.dbu-star:focus-visible,.dbu-cta:focus-visible,.dbu-retry:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
`

    function installStyles() {
      const existing = document.getElementById('dsh-balance-usage-style')
      if (existing) return () => {}
      const style = document.createElement('style')
      style.id = 'dsh-balance-usage-style'
      style.textContent = CSS
      document.head.appendChild(style)
      return () => style.remove()
    }

    /* ---------------------------------------------------------------- *
     * Icons
     * ---------------------------------------------------------------- */

    function Svg({ size = 16, children, ...rest }) {
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
          focusable: false,
          ...rest,
        },
        children,
      )
    }

    function WalletIcon({ size = 16 }) {
      return h(
        Svg,
        { size },
        h('path', { d: 'M3.5 8.2A2.7 2.7 0 0 1 6.2 5.5h11.3a3 3 0 0 1 3 3v7.2a2.8 2.8 0 0 1-2.8 2.8H6.3a2.8 2.8 0 0 1-2.8-2.8z' }),
        h('path', { d: 'M3.5 9.4h14.6' }),
        h('circle', { cx: 17.1, cy: 14.1, r: 1.15, fill: 'currentColor', stroke: 'none' }),
      )
    }

    function RefreshIcon() {
      return h(Svg, { size: 14 }, h('path', { d: 'M20 11.5a8 8 0 1 0-2.3 5.7' }), h('path', { d: 'M20 5.5v6h-6' }))
    }

    function CloseIcon() {
      return h(Svg, { size: 14 }, h('path', { d: 'M6 6l12 12M18 6L6 18' }))
    }

    function ChevronIcon({ open }) {
      return h(Svg, { size: 12, className: 'dbu-chevron', 'data-open': open ? 'true' : 'false', style: { transform: open ? 'rotate(90deg)' : 'none' } }, h('path', { d: 'M9 6l6 6-6 6' }))
    }

    function ExternalIcon() {
      return h(Svg, { size: 13 }, h('path', { d: 'M14 4h6v6' }), h('path', { d: 'M20 4l-8.5 8.5' }), h('path', { d: 'M18.5 14v4.5a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2V7.5a2 2 0 0 1 2-2H10' }))
    }

    function StarIcon({ filled }) {
      return h(
        Svg,
        { size: 12, fill: filled ? 'currentColor' : 'none' },
        h('path', { d: 'M12 4.2l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 9.9l5.4-.8z' }),
      )
    }

    /* ---------------------------------------------------------------- *
     * Sidebar footer entry
     * ---------------------------------------------------------------- */

    function FooterAction(props) {
      const snapshot = useSnapshot()
      const t = copy()
      const wide = props?.wide !== false
      const usage = snapshot.usage
      const account = snapshot.account
      const wallet = mainWallet(account?.wallets)
      const todayTokens = usage?.today?.tokens || 0

      const money = wallet ? fmtWallet(wallet) : account?.signedIn === false ? t.signedOutShort : '—'
      const meta = usage ? `${t.today} ${fmtTokens(todayTokens)}` : snapshot.status === 'loading' ? t.loading : snapshot.status === 'error' ? t.failed : '—'
      const dotState = snapshot.status === 'error' ? 'error' : 'ok'

      const title = [t.entryTitle, wallet ? `${t.balance} ${fmtWallet(wallet)}` : null, usage ? `${t.total} ${fmtTokens(usage.totals?.tokens || 0)} tok` : null]
        .filter(Boolean)
        .join('\n')

      function onClick(event) {
        const rect = event.currentTarget.getBoundingClientRect()
        /* The entry is content-sized, so hang the panel off the sidebar column it sits in.
           Only ancestors that still look like a sidebar count: a full-width shell row
           would push the panel off-screen. */
        let columnRight = rect.right
        let node = event.currentTarget.parentElement
        for (let depth = 0; node && depth < 8; depth += 1) {
          const bounds = node.getBoundingClientRect()
          if (bounds.width > 520) break
          if (bounds.right > columnRight + 16) {
            columnRight = bounds.right
            break
          }
          node = node.parentElement
        }
        const next = !state.open
        setState({
          open: next,
          wide,
          entryEl: next ? event.currentTarget : state.entryEl,
          anchor: next ? { left: rect.left, right: columnRight, top: rect.top, bottom: rect.bottom, width: rect.width } : state.anchor,
        })
        if (next) load(clientCtx, { force: Date.now() - state.updatedAt > STALE_MS })
      }

      return h(
        'button',
        {
          type: 'button',
          className: 'dbu-entry',
          'data-wide': wide ? 'true' : 'false',
          title,
          'aria-label': `${t.entry} ${money} ${meta}`,
          'aria-haspopup': 'dialog',
          'aria-controls': PANEL_ID,
          'aria-expanded': snapshot.open ? 'true' : 'false',
          onClick,
        },
        h('span', { className: 'dbu-entry__icon' }, h(WalletIcon, { size: wide ? 16 : 18 })),
        wide
          ? h(
              'span',
              { className: 'dbu-entry__body' },
              h('span', { className: 'dbu-entry__money' }, money),
              h('span', { className: 'dbu-entry__meta' }, meta),
            )
          : todayTokens > 0
            ? h('span', { className: 'dbu-entry__dot', 'data-state': dotState })
            : null,
      )
    }

    /* ---------------------------------------------------------------- *
     * Panel
     * ---------------------------------------------------------------- */

    function Stat({ label, value }) {
      return h('div', { className: 'dbu-stat' }, h('b', null, value), label)
    }

    function MiniChart({ series, label }) {
      if (!Array.isArray(series) || series.length === 0) return null
      const max = Math.max(...series.map((point) => point.tokens || 0), 1)
      const last = series.length - 1
      return h(
        'div',
        { className: 'dbu-chart', role: 'img', 'aria-label': label || undefined },
        series.map((point, index) => {
          const tokens = point.tokens || 0
          // Square-root scaling keeps small days visible next to a heavy today bar;
          // empty days keep a 2px track so the band reads as a day axis, not a rule.
          const height = tokens === 0 ? 0 : Math.max(4, Math.round(Math.sqrt(tokens / max) * 28))
          return h('i', {
            key: point.date,
            'data-today': index === last ? 'true' : 'false',
            'data-empty': tokens === 0 ? 'true' : 'false',
            style: { height: `${height}px` },
            title: `${point.date} · ${fmtTokens(tokens)}`,
          })
        }),
      )
    }

    function GroupRow({ group, collapsed, onToggle, main, primary, onStar, condensed }) {
      const regionId = `dbu-models-${group.provider}`
      /* With a single provider/model the totals would just repeat the headline number,
         so the row keeps only the name and the pin control. */
      const showTotals = condensed !== true
      return h(
        'div',
        null,
        h(
          'button',
          {
            type: 'button',
            className: 'dbu-group__row',
            'aria-expanded': collapsed ? 'false' : 'true',
            'aria-controls': regionId,
            onClick: onToggle,
          },
          h(ChevronIcon, { open: !collapsed }),
          h('span', { className: 'dbu-group__name' }, providerLabel(group.provider)),
          showTotals ? h('span', { className: 'dbu-group__val' }, fmtTokens(group.tokens)) : null,
        ),
        collapsed
          ? null
          : h(
              'div',
              { className: 'dbu-models', id: regionId },
              (group.models || []).map((model) => {
                const isMain = Boolean(main && main.model === model.model && main.provider === group.provider)
                /* The star is an explicit choice: auto resolution keeps it hollow so the
                   click still reads as "make this the main line". */
                const pinned = Boolean(primary && primary.model === model.model && primary.provider === group.provider)
                const starLabel = pinned ? copy().clearPrimary : copy().setPrimary
                return h(
                  'div',
                  { key: model.model, className: 'dbu-model', 'data-main': isMain ? 'true' : 'false' },
                  h('span', { className: 'dbu-model__name', title: `${model.model} · ${fmtTokens(model.tokens)}` }, model.model),
                  showTotals
                    ? h('span', { className: 'dbu-model__val' }, `${fmtTokens(model.tokens)} · ${fmtRelative(model.lastUsed)}`)
                    : null,
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'dbu-star',
                      'data-active': pinned ? 'true' : 'false',
                      'aria-pressed': pinned ? 'true' : 'false',
                      'aria-label': starLabel,
                      title: starLabel,
                      onClick: (event) => {
                        event.stopPropagation()
                        onStar(group.provider, model.model)
                      },
                    },
                    h(StarIcon, { filled: pinned }),
                  ),
                )
              }),
            ),
      )
    }

    function panelFocusables(node) {
      if (!node) return []
      return [...node.querySelectorAll('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')].filter(
        (element) => element.offsetParent !== null || element.getClientRects().length > 0,
      )
    }

    function Panel() {
      const snapshot = useSnapshot()
      const t = copy()
      const [, forceViewport] = useState(0)

      useEffect(() => {
        if (!snapshot.open) {
          /* Returning focus keeps the keyboard loop closed when the popover closes. */
          const entry = state.entryEl
          if (entry && typeof entry.focus === 'function') entry.focus()
          return undefined
        }
        const panel = () => document.getElementById(PANEL_ID)
        const onKey = (event) => {
          if (event.defaultPrevented) return
          if (event.key === 'Escape') {
            setState({ open: false })
            return
          }
          if (event.key !== 'Tab') return
          const items = panelFocusables(panel())
          if (items.length === 0) return
          const first = items[0]
          const last = items[items.length - 1]
          const active = document.activeElement
          if (event.shiftKey && (active === first || active === panel())) {
            event.preventDefault()
            last.focus()
          } else if (!event.shiftKey && active === last) {
            event.preventDefault()
            first.focus()
          }
        }
        const onResize = () => forceViewport((value) => value + 1)
        window.addEventListener('keydown', onKey)
        window.addEventListener('resize', onResize)
        load(clientCtx)
        /* Move focus into the popover so Escape and Tab act on it, not on the page behind. */
        const focusTimer = window.setTimeout(() => {
          const node = panel()
          if (node) {
            node.focus()
            if (document.activeElement !== node) panelFocusables(node)[0]?.focus()
          }
        }, 0)
        return () => {
          window.removeEventListener('keydown', onKey)
          window.removeEventListener('resize', onResize)
          window.clearTimeout(focusTimer)
        }
      }, [snapshot.open])

      if (!snapshot.open) return snapshot.platform ? h(PlatformSurface, { page: snapshot.platform }) : null

      const account = snapshot.account
      const usage = snapshot.usage
      const main = resolveMain(usage, snapshot.primary)
      const wallet = mainWallet(account?.wallets)
      const bonus = bonusTotal(account?.bonusWallets)
      const totals = usage?.totals
      const today = usage?.today

      const anchor = snapshot.anchor
      const viewportWidth = window.innerWidth || 1280
      const viewportHeight = window.innerHeight || 800
      const compact = viewportWidth < 760
      const width = compact ? Math.max(240, viewportWidth - 16) : Math.min(336, viewportWidth - 24)
      /* Wide sidebar: hang the panel off the entry's right edge so the session list
         stays readable. Narrow rail: the same rule clears the 56px rail. Falls back
         to covering the entry when neither side has room. */
      const gutters = 8
      const beside = anchor ? anchor.right + gutters : gutters
      const above = anchor ? Math.max(gutters, viewportHeight - anchor.top + gutters) : 72
      const besideFits = beside + width + gutters <= viewportWidth
      const left = compact ? 8 : besideFits ? beside : Math.max(gutters, Math.min(anchor ? anchor.left : 12, viewportWidth - width - gutters))
      const bottom = compact ? gutters : above
      const maxHeight = Math.max(200, Math.min(viewportHeight * (compact ? 0.62 : 0.68), viewportHeight - bottom - 12))

      function toggleGroup(provider) {
        const collapsed = state.collapsed.includes(provider)
          ? state.collapsed.filter((item) => item !== provider)
          : [...state.collapsed, provider]
        writeCollapsed(collapsed)
        setState({ collapsed })
      }

      function onStar(provider, model) {
        const active = state.primary && state.primary.provider === provider && state.primary.model === model
        const next = active ? null : { provider, model }
        writePrimary(next)
        setState({ primary: next })
      }

      const loadingFirst = !usage && (snapshot.status === 'loading' || snapshot.status === 'idle')

      function retryButton() {
        return h('button', {
          type: 'button',
          className: 'dbu-retry',
          onClick: () => load(clientCtx, { force: true }),
        }, t.retry)
      }

      const statusNote = () => {
        if (!snapshot.usageError) return null
        const routeMissing = /HTTP 404|HTTP 405|Failed to fetch|NetworkError/i.test(snapshot.usageError)
        return h(
          'div',
          { className: 'dbu-danger', role: 'status' },
          h('b', null, routeMissing ? t.noUsageRoute : t.failed),
          h('span', { style: { minWidth: 0, wordBreak: 'break-word' } }, snapshot.usageError),
          retryButton(),
        )
      }

      const accountErrorBlock = () =>
        snapshot.accountError
          ? h(
              'div',
              { className: 'dbu-danger', style: { marginTop: '6px' }, role: 'status' },
              h('b', null, t.failed),
              h('span', { style: { minWidth: 0, wordBreak: 'break-word' } }, snapshot.accountError),
              retryButton(),
            )
          : null

      const cacheShare = totals && totals.tokens ? Math.round(((totals.cacheReadTokens || 0) / totals.tokens) * 100) : 0
      const chartsLabel = `${t.last14}: ${t.today} ${fmtTokens(today?.tokens || 0)} · ${t.total} ${fmtTokens(totals?.tokens || 0)}`

      return h(
        React.Fragment,
        null,
        h('div', { className: 'dbu-scrim', onPointerDown: () => setState({ open: false }) }),
        h(
          'section',
          {
            id: PANEL_ID,
            className: 'dbu-panel',
            role: 'dialog',
            tabIndex: -1,
            'aria-modal': 'true',
            'aria-labelledby': PANEL_TITLE_ID,
            style: { left: `${left}px`, bottom: `${bottom}px`, width: `${width}px`, maxHeight: `${maxHeight}px` },
          },
          h(
            'header',
            { className: 'dbu-head' },
            h('h2', { className: 'dbu-head__title', id: PANEL_TITLE_ID }, t.title),
            h(
              'span',
              { className: 'dbu-head__time' },
              snapshot.updatedAt ? `${t.updated} ${fmtClock(snapshot.updatedAt)}` : '',
              snapshot.updatedAt && (snapshot.usageError || snapshot.accountError) ? t.stale : '',
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'dbu-iconbtn',
                title: t.refresh,
                'aria-label': t.refresh,
                'aria-busy': snapshot.status === 'loading' ? 'true' : 'false',
                'data-busy': snapshot.status === 'loading' ? 'true' : 'false',
                onClick: () => load(clientCtx, { force: true }),
              },
              h(RefreshIcon),
            ),
            h(
              'button',
              { type: 'button', className: 'dbu-iconbtn', title: t.close, 'aria-label': t.close, onClick: () => setState({ open: false }) },
              h(CloseIcon),
            ),
          ),
          h(
            'div',
            { className: 'dbu-body' },
            h(
              'div',
              { className: 'dbu-card' },
              h('div', { className: 'dbu-card__label' }, t.balance),
              account?.signedIn === false
                ? h('div', { className: 'dbu-muted', style: { lineHeight: 1.45 } }, t.signedOut)
                : loadingFirst
                  ? h('div', { className: 'dbu-skel dbu-skel--line-lg', style: { width: '52%' } })
                  : h(
                      React.Fragment,
                      null,
                      h('div', { className: 'dbu-money' }, wallet ? fmtWallet(wallet) : '—'),
                      bonus && bonus.total > 0
                        ? h(
                            'div',
                            { className: 'dbu-row', style: { marginTop: '4px' } },
                            h('span', { className: 'dbu-muted' }, t.bonus),
                            h('span', { className: 'dbu-muted', style: { marginLeft: 'auto' } }, fmtWallet({ currency: bonus.currency, balance: String(bonus.total) })),
                          )
                        : null,
                      accountErrorBlock(),
                    ),
            ),
            h(
              'div',
              { className: 'dbu-card' },
              h(
                'div',
                { className: 'dbu-card__label' },
                t.usage,
                main
                  ? h('span', { className: 'dbu-chip', title: `${providerLabel(main.row.provider)} · ${main.row.model}` }, `${providerLabel(main.row.provider)} · ${main.row.model}`)
                  : h('span', { className: 'dbu-chip' }, t.auto),
              ),
              loadingFirst
                ? h(
                    React.Fragment,
                    null,
                    h('div', { className: 'dbu-skel dbu-skel--line-lg', style: { width: '38%' } }),
                    h('div', { className: 'dbu-skel dbu-skel--line', style: { marginTop: '10px', width: '100%' } }),
                    h('div', { className: 'dbu-skel dbu-skel--line', style: { marginTop: '6px', width: '100%', height: '32px' } }),
                  )
                : usage
                  ? h(
                      React.Fragment,
                      null,
                      h(
                        'div',
                        { className: 'dbu-row--between' },
                        h('div', null, h('div', { className: 'dbu-big' }, fmtTokens(today?.tokens || 0)), h('div', { className: 'dbu-muted' }, t.today)),
                        h(
                          'div',
                          { style: { textAlign: 'right' } },
                          h('div', { className: 'dbu-big--sub' }, fmtTokens(totals?.tokens || 0)),
                          h('div', { className: 'dbu-muted' }, t.total),
                        ),
                      ),
                      h(
                        'div',
                        { className: 'dbu-stats' },
                        h(Stat, { label: t.input, value: fmtTokens(totals?.inputTokens || 0) }),
                        h(Stat, { label: t.output, value: fmtTokens(totals?.outputTokens || 0) }),
                        h(Stat, { label: cacheShare ? `${t.cache} ${cacheShare}%` : t.cache, value: fmtTokens(totals?.cacheReadTokens || 0) }),
                      ),
                      h(MiniChart, { series: usage.series, label: chartsLabel }),
                      h(
                        'div',
                        { className: 'dbu-muted', style: { marginTop: '4px' } },
                        `${t.last14} · ${(totals?.requests || 0).toLocaleString()} ${t.requestsSuffix}`,
                      ),
                    )
                  : h('div', { className: 'dbu-note' }, t.empty),
            ),
            statusNote(),
            usage && usage.groups && usage.groups.length > 0
              ? h(
                  'div',
                  { className: 'dbu-section' },
                  h(
                    'div',
                    { className: 'dbu-section__head' },
                    t.groups,
                    h('span', { className: 'dbu-section__hint' }, t.starHint),
                  ),
                  usage.groups.map((group) =>
                    h(GroupRow, {
                      key: group.provider,
                      group,
                      main: main?.row,
                      primary: snapshot.primary,
                      condensed: usage.groups.length === 1 && (group.models || []).length === 1,
                      collapsed: snapshot.collapsed.includes(group.provider),
                      onToggle: () => toggleGroup(group.provider),
                      onStar,
                    }),
                  ),
                )
              : null,
            platformBridge()
              ? h(
                  'button',
                  {
                    type: 'button',
                    className: 'dbu-cta',
                    title: t.openUsage,
                    onClick: () => setState({ open: false, platform: 'usage' }),
                  },
                  h(ExternalIcon),
                  t.openUsage,
                )
              : h(
                  'a',
                  {
                    className: 'dbu-cta',
                    href: account?.usageUrl || FALLBACK_USAGE_URL,
                    target: '_blank',
                    rel: 'noopener noreferrer',
                    title: `${t.openUsage} · ${account?.usageUrl || FALLBACK_USAGE_URL}`,
                  },
                  h(ExternalIcon),
                  t.openUsage,
                  h('span', { className: 'dbu-sr' }, ` (${t.newWindow})`),
                ),
          ),
        ),
        snapshot.platform ? h(PlatformSurface, { page: snapshot.platform }) : null,
      )
    }

    /* ---------------------------------------------------------------- *
     * Native Platform page (Desktop only)
     * ---------------------------------------------------------------- */

    /* The Desktop shell owns one WebContentsView that renders the official Platform
       document above the page, with the account session injected by the main process.
       The view takes the main content area beside the sidebar — the strip on top is
       dressed as a page tab, so the sidebar and the rest of the shell stay usable. */
    function contentAreaRect() {
      const entry = state.entryEl
      let left = 0
      if (entry) {
        left = entry.getBoundingClientRect().right
        /* Walk out to the sidebar column, but stop before the column that spans the
           whole window (that is the app shell, not the sidebar). */
        let node = entry.parentElement
        for (let depth = 0; node && depth < 8; depth += 1) {
          const bounds = node.getBoundingClientRect()
          if (bounds.width > 480) break
          if (bounds.right > left) left = bounds.right
          node = node.parentElement
        }
      }
      const viewport = window.innerWidth || 1280
      return { left, width: Math.max(320, viewport - left) }
    }

    function PlatformSurface({ page }) {
      const t = copy()
      const hostRef = useRef(null)
      const [status, setStatus] = useState('loading')
      const [attempt, setAttempt] = useState(0)
      const [area, setArea] = useState(contentAreaRect)
      const bridge = platformBridge()
      const usageUrl = state.account?.usageUrl || FALLBACK_USAGE_URL

      function closePlatform() {
        setState({ platform: null, open: true })
        load(clientCtx, { force: true })
      }

      /* Keep clearing the sidebar when the window is resized or the sidebar toggles. */
      useEffect(() => {
        const onResize = () => setArea(contentAreaRect())
        window.addEventListener('resize', onResize)
        return () => window.removeEventListener('resize', onResize)
      }, [])

      useEffect(() => {
        const node = hostRef.current
        if (!node || !bridge) return undefined
        let closed = false
        const bounds = () => {
          const rect = node.getBoundingClientRect()
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
        }
        const fail = () => {
          if (!closed) setStatus('failed')
        }
        setStatus('loading')
        Promise.resolve()
          .then(() => bridge.open(page, bounds()))
          .then(() => {
            if (!closed) setStatus('loaded')
          })
          .catch(fail)
        const observer = typeof ResizeObserver === 'function'
          ? new ResizeObserver(() => {
              Promise.resolve(bridge.setBounds(bounds())).catch(fail)
            })
          : null
        observer?.observe(node)
        return () => {
          closed = true
          observer?.disconnect()
          /* The window teardown may drop the IPC receiver before React unmounts. */
          Promise.resolve(bridge.close()).catch(() => {})
        }
      }, [bridge, page, attempt])

      useEffect(() => {
        const onKey = (event) => {
          if (event.defaultPrevented || event.key !== 'Escape') return
          event.preventDefault()
          closePlatform()
        }
        window.addEventListener('keydown', onKey)
        const focusTimer = window.setTimeout(() => {
          const close = document.getElementById(PLATFORM_BACK_ID)
          if (close) close.focus()
        }, 0)
        return () => {
          window.removeEventListener('keydown', onKey)
          window.clearTimeout(focusTimer)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])

      /* Clicking anywhere else in the shell hands the page back to the app. */
      useEffect(() => {
        const onPointer = (event) => {
          const surface = document.querySelector('.dbu-platform')
          if (!surface || surface.contains(event.target)) return
          closePlatform()
        }
        window.addEventListener('pointerdown', onPointer, true)
        return () => window.removeEventListener('pointerdown', onPointer, true)
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])

      return h(
        'div',
        {
          className: 'dbu-platform',
          style: { left: `${area.left}px`, width: `${area.width}px` },
          role: 'region',
          'aria-label': t.usagePage,
        },
        h(
          'div',
          { className: 'dbu-platform__bar' },
          h(
            'div',
            { className: 'dbu-platform__tab' },
            h('span', { className: 'dbu-platform__tabdot', 'aria-hidden': 'true' }),
            h('span', { className: 'dbu-platform__tablabel' }, t.usagePage),
            h(
              'button',
              {
                id: PLATFORM_BACK_ID,
                type: 'button',
                className: 'dbu-platform__close',
                title: t.close,
                'aria-label': t.close,
                onClick: closePlatform,
              },
              h(CloseIcon),
            ),
          ),
        ),
        h(
          'div',
          { ref: hostRef, className: 'dbu-platform__viewport' },
          status === 'loaded'
            ? null
            : h(
                'div',
                { className: 'dbu-platform__status', role: 'status' },
                status === 'failed'
                  ? h(
                      React.Fragment,
                      null,
                      h('span', { className: 'dbu-platform__fail' }, t.platformFailed),
                      h(
                        'div',
                        { className: 'dbu-platform__actions' },
                        h(
                          'button',
                          { type: 'button', className: 'dbu-retry', onClick: () => setAttempt((value) => value + 1) },
                          t.retry,
                        ),
                        h(
                          'a',
                          { className: 'dbu-retry', href: usageUrl, target: '_blank', rel: 'noopener noreferrer' },
                          t.browser,
                        ),
                      ),
                    )
                  : h(
                      React.Fragment,
                      null,
                      h('span', { className: 'dbu-platform__spinner', 'aria-hidden': 'true' }),
                      h('span', null, t.platformLoading),
                    ),
              ),
        ),
      )
    }

    /* ---------------------------------------------------------------- *
     * Plugin
     * ---------------------------------------------------------------- */

    return {
      inject: ['slots', 'locale', 'remote', 'remote.account'],

      apply(ctx) {
        clientCtx = ctx

        ctx.effect(installStyles)

        /* Repaint copy when the reader switches the UI language. */
        ctx.effect(() => {
          if (typeof ctx.on !== 'function') return () => {}
          const dispose = ctx.on('locale/change', () => setState({}))
          return () => dispose()
        })

        ctx.slots.inject('sidebar.footer.action', () =>
          ctx.slots.register(
            {
              name: 'sidebar.footer.action',
              id: 'balance-usage',
              order: 40,
              label: () => copy().entryTitle,
            },
            FooterAction,
          ),
        )

        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register({ name: 'shell.overlay', id: 'balance-usage-panel', order: 40 }, Panel),
        )

        /* Settings are authoritative on the Host; localStorage is only the fallback
           for a build whose Host half predates the prefs route. */
        ctx.effect(() => {
          let alive = true
          readPrefs()
            .then((values) => {
              if (!alive || !values) return
              const patch = {}
              if (values.primary && typeof values.primary.provider === 'string') {
                patch.primary = values.primary
                try {
                  globalThis.localStorage?.setItem(KEY_PRIMARY, JSON.stringify(values.primary))
                } catch {
                  /* ignore */
                }
              }
              if (Array.isArray(values.collapsed)) {
                patch.collapsed = values.collapsed
                try {
                  globalThis.localStorage?.setItem(KEY_COLLAPSED, JSON.stringify(values.collapsed))
                } catch {
                  /* ignore */
                }
              }
              if (Object.keys(patch).length > 0) setState(patch)
            })
            .catch(() => {})
          return () => {
            alive = false
          }
        })

        ctx.effect(() => {
          const warm = setTimeout(() => load(ctx).catch(() => {}), 1_500)

          const due = () => Date.now() - state.updatedAt >= (state.open ? REFRESH_OPEN_MS : REFRESH_IDLE_MS)

          timer = setInterval(() => {
            if (due()) load(ctx).catch(() => {})
          }, TICK_MS)

          /* Coming back to the app should never show numbers from the last time it was
             in front, even if the interval has not elapsed yet. */
          const wake = () => {
            if (document.visibilityState === 'hidden') return
            if (Date.now() - state.updatedAt < 2_000) return
            load(ctx, { force: true }).catch(() => {})
          }
          window.addEventListener('focus', wake)
          document.addEventListener('visibilitychange', wake)

          return () => {
            clearTimeout(warm)
            if (timer) clearInterval(timer)
            timer = null
            window.removeEventListener('focus', wake)
            document.removeEventListener('visibilitychange', wake)
          }
        })
      },
    }
  },
})
