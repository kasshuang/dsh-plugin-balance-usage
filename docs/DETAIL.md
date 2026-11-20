# 余额与用量 / Balance & usage

在 DeepSeek Harness 左侧栏底部加一个入口：直接显示账户余额和今日 Token 用量，点开是一个面板，可以看累计用量、近 14 天走势、按运营商 / 模型分组（可折叠），并把任意模型设为「主线」。面板底部按钮打开官方 Token 用量详情页——桌面版在应用内直接打开，浏览器里退回新标签页。

## 数据从哪里来

| 数据 | 来源 | 说明 |
| --- | --- | --- |
| 账户余额 / 赠送余额 | `ctx.remote.account.getState()` + `getBalance()` | 与「设置 → 账户」相同的平台接口；未登录时只显示提示 |
| 官方用量页地址 | `AccountView.links.usageUrl` | 默认 `https://platform.deepseek.com/usage`，账号换了 origin 也跟着换 |
| Token 用量 | 本插件 Host 半扫描 `$DSH_HOME/sessions/**/session.v4.jsonl.zstd` | 读取每条 `assistant/message` 的 `usage` 与 `message.source`（provider / model），按天、按模型汇总 |

用量是本机日志的汇总：不会上传、也不需要额外 npm 依赖。日志是「多帧拼接的 zstd」，`zlib.zstdDecompress` 只会解第一帧，所以 Host 半自带一个帧表扫描器逐帧解码，末帧被截断时用 `ZSTD_e_flush` 抢救。

## 两个半边

- **Host（`index.js`）**：注册只读路由 `GET /plugins/balance-usage/summary`（只接受同源请求），扫描并缓存会话日志，20 秒 TTL；启动 2 秒后预热一次缓存。
  - bundle 插件无法给 Client 新增 Remote namespace，所以用 `webServer` 路由把汇总数据交给前端。
- **Client（`client.js`）**：
  - `sidebar.footer.action`：侧栏底部的入口，展开/收起时自动切换紧凑图标形态（`ownerProps.wide`）。
  - `shell.overlay`：浮层面板，挂在侧栏列右侧（窄轨时正好让开 56px 轨道），按 Esc 或点击空白处关闭。

## 交互与可访问性

- 打开面板时焦点移入面板（`role="dialog"` + `aria-labelledby`），Tab 在面板内首尾循环，Esc 关闭后焦点回到入口按钮；入口带 `aria-haspopup="dialog"` / `aria-controls` / `aria-expanded`，星标是 `aria-pressed` 的切换按钮。
- 折叠行用 `aria-expanded` + `aria-controls` 关联模型列表；图表是 `role="img"`，用一句汇总文案代替逐柱朗读。
- Esc 监听挂在冒泡阶段且尊重 `defaultPrevented`，不抢占设置弹窗等更上层浮层的按键。
- 应用内用量页是主内容区里的一页：Esc 或标签栏的 × 关闭，打开时焦点落在关闭按钮上；侧栏保持可见可点，点侧栏任意位置就把页面交还。
- 首次加载显示骨架条而不是「没有记录」；请求 8 秒超时；失败时保留上一次的「更新于」并标注「（未更新）」，错误块内带「重试」。
- 侧栏入口的数字会自己走：面板关着时每 30 秒、开着时每 15 秒刷新一次，窗口重新获得焦点或标签页切回前台时还会立刻补一次，所以不用点开就能看到余额和今日用量在变。定时器每 5 秒醒一次，只在数据超过对应间隔时才真的发请求。
- 颜色只用主题 token：`--dsw-alias-bg-skeleton`（hover / 胶囊底）、`--dsw-alias-chart-messages`（柱状图与主线标记）、`--dsw-alias-state-warn-label`（星标激活）、`--dsw-alias-label-tertiary`（星标静止态）；浅色、深色两套主题都实测过。

## 在应用内打开官方用量页

- 桌面版渲染进程暴露了 `window.dshPlatform`（`open(page, bounds)` / `setBounds(bounds)` / `close()`），只在 `location.protocol === 'dsh-app:' && location.hostname === 'app'` 时注入。宿主会在页面之上用 `WebContentsView` 加载 `https://platform.deepseek.com/usage`，账号会话由主进程注入，所以不需要再开浏览器、也不会遇到登录态问题。
- 检测到桥时，底部 CTA 是 `<button>`：点击后关闭浮层，在主内容区（侧栏右侧、窗口顶到窗口底）显示一条 44px 的页面标签栏（`● Token 用量 ×`）加剩余矩形作为原生视图的位置，并调用 `bridge.open('usage', bounds)`；窗口尺寸或侧栏宽度变化时 `ResizeObserver` 调 `setBounds`；点 × / 按 Esc / 点侧栏任意位置都会调 `bridge.close()` 并回到面板、顺手刷新一次余额。
- 视口矩形由「侧栏列的右边缘」算出（从入口向上找宽度 ≤480 的祖先列），展开态约 `x=280`，窄轨态 `x=56`；因此原生页面不会盖住侧栏，也不会盖住页面标签栏。
- 没有桥（普通浏览器标签页、`dsh web`）时仍是 `<a target="_blank">` 外链，因此不会出现「点了没反应」。
- 平台页加载失败会显示错误文案 + 「重试」+ 「在浏览器打开」兜底；iframe 不可行（平台用 CSP / `X-Frame-Options` 拒绝被嵌入），所以只能走宿主的原生视图。

## 设置

- **主线模型**：在面板中点击任意模型右侧的星标。若没设过主线，自动取累计用量最高的模型（列表里用 2px 蓝色左条标出）；再点一次星标取消，回到自动。
- **折叠**：点击运营商一行折叠/展开它的模型列表。
- 两者都存在 `localStorage`：`dsh.balance-usage.primary`、`dsh.balance-usage.collapsed`。

## 接入要点（踩过的坑）

- Client 半调用 `ctx.remote.account.*` 时，`inject` 必须同时声明 `'remote'` 和 `'remote.account'`，否则运行时报 `cannot get property "remote.account" without inject`。
- `ctx.locale.getLocale()` 返回的是 `{ active, locales, revision }` 快照，不是字符串；语言切换通过 `ctx.on('locale/change', …)` 订阅后重绘。
- `account.getBalance(meta)` 需要 `{ version, locale, timezoneOffsetSeconds }`，`version` 取 `process.env.DSH_CLIENT_VERSION`，缺省时退回 `'web'`。
- 底部链接必须是真 `<a target="_blank">`：`window.open(url, '_blank', 'noopener')` 会返回 `null`，任何「打不开就 `location.assign`」的兜底都会把整个 DSH 页面导航走。
- 入口按钮是内容宽度（约 100px），面板定位要向上找更宽的祖先列作为侧栏右边缘，否则面板会压住侧栏会话列表。

## 已验证

在 `http://127.0.0.1:54218` 的真实页面上逐项点过（2026-11-19，桌面版客户端）：

- 侧栏展开态入口显示 `余额与用量 ¥8.48 今日 36.92M`；窄轨态退化为 32×32 钱包图标 + 右上角小圆点，位置在账号行上方。
- 面板中文 / 英文文案、余额（账户 / 赠送）、今日 / 累计 / 输入 / 输出 / 缓存读取（含命中率）、近 14 天柱状图、「近 14 天 · N 次请求」全部正确。
- 点星标写入 `dsh.balance-usage.primary` 并即时改入口数字；再点一次取消并回到自动主线（自动态星标为空心，`aria-pressed=false`）。
- 折叠运营商行写入 `dsh.balance-usage.collapsed`，刷新页面后仍保持折叠。
- 底部 CTA 在浏览器里是 `https://platform.deepseek.com/usage` 的外链（`target="_blank" rel="noopener noreferrer"`），点击不会把 DSH 页面导航走；桌面版是按钮，走 `window.dshPlatform`。
- 用注入的假桥验证过应用内页面：CTA 变 `<button>`，展开态 `open` 收到 `{ page: 'usage', bounds: { x: 280, y: 44, width: 888, height: 398 } }`、窄轨态 `x: 56`，标签栏 44px、视口紧贴其下，侧栏始终可见；窗口缩到 1184×571 后 `setBounds` 收到新的 `{ width: 896, height: 398 }`；点侧栏、点 ×、按 Esc 都会 `close()` 并回到面板；失败时显示「应用内页面打开失败」+ 重试 + 浏览器兜底。
- Escape 关闭面板且焦点回到入口；浅色与深色主题下都检查过对比度与图形可见性。
- `node --check` 通过 Host / Client 两个入口文件。

## 已知限制

- 面板里的用量只统计会话日志里带 `usage` 的模型消息，工具调用等其它事件不计入 Token；因此本机数字会小于平台账单（平台把每次请求都算进去）。
- 缓存 TTL 20 秒：刚发完消息立刻看到面板，数字可能仍是上一轮扫描的结果（入口最长 30 秒内也会跟上）；想立刻看最新就点面板右上角的刷新。
- 后台标签页会被浏览器节流，定时器可能拉长到 60 秒以上；切回前台时会立刻补一次刷新。
- 窄窗口（<760px）下面板改为贴左的宽浮层，会盖住部分内容。
- 应用内用量页只有桌面版有（依赖 `window.dshPlatform`）；`dsh web` 或普通浏览器里仍是新标签页。
- Electron 桌面版的页面从 `file://` 加载、`fetch` 走 IPC bridge；该版本下自建路由可能不可达，此时面板只显示余额与官方链接，并提示「用量统计服务未就绪」。Web 版（`dsh web`）不受影响。
