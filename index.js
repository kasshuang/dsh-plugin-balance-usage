/**
 * Host half of the balance & usage bundle.
 *
 * The Client half renders a sidebar footer entry plus a floating panel. It needs
 * two kinds of data that no existing Remote namespace offers:
 *
 *  - account balance: available through `ctx.remote.account.getBalance()` from
 *    the Client, so it stays there;
 *  - whole-history token usage: only recoverable by reading the persisted
 *    session logs. This half scans `$DSH_HOME/sessions/**\/session.v4.jsonl.zstd`
 *    and serves the aggregate over one read-only HTTP route.
 *
 * A bundle may not extend the Client's Remote capability set, so a plain
 * `webServer` route is the supported way to hand Host-side numbers to the
 * Client too.
 */
import { readdir, readFile, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'

const ROUTE = '/plugins/balance-usage/summary'
const LOG_FILE = 'session.v4.jsonl.zstd'
const SCAN_TTL_MS = 20_000
const MAX_FILE_BYTES = 64 * 1024 * 1024
const ZSTD_MAGIC = 0xfd2fb528
const DAYS_SHOWN = 14

/* ------------------------------------------------------------------ *
 * zstd container: a session log is a concatenation of independent
 * frames, and `zlib.zstdDecompress` stops after the first one, so the
 * frame table has to be walked by hand before decoding.
 * ------------------------------------------------------------------ */

function scanZstdFrames(buffer) {
  const frames = []
  let offset = 0
  let tornStart

  while (offset + 4 <= buffer.length) {
    if (buffer.readUInt32LE(offset) !== ZSTD_MAGIC) break

    const start = offset
    offset += 4
    const descriptor = buffer[offset++]
    const contentSizeFlag = descriptor >>> 6
    const singleSegment = (descriptor & 0x20) !== 0
    const hasChecksum = (descriptor & 0x04) !== 0
    const dictionaryFlag = descriptor & 0x03
    const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag
    const contentSizeBytes = contentSizeFlag === 0 ? (singleSegment ? 1 : 0) : 1 << contentSizeFlag
    offset += (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes

    let complete = false
    while (offset + 3 <= buffer.length) {
      const header = buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16)
      offset += 3
      const lastBlock = (header & 1) !== 0
      const blockType = (header >>> 1) & 0x03
      const blockSize = header >>> 3
      if (blockType === 0x03) break
      offset += blockType === 0x01 ? 1 : blockSize
      if (lastBlock) {
        complete = true
        break
      }
    }

    if (!complete) {
      tornStart = start
      break
    }
    if (hasChecksum) offset += 4
    if (offset > buffer.length) {
      tornStart = start
      break
    }
    frames.push({ start, end: offset })
  }

  return { frames, tornStart }
}

function decodeZstdLog(buffer) {
  const { frames, tornStart } = scanZstdFrames(buffer)
  const parts = []

  for (const frame of frames) {
    try {
      parts.push(zlib.zstdDecompressSync(buffer.subarray(frame.start, frame.end)))
    } catch {
      /* skip an undecodable frame instead of losing the whole log */
    }
  }

  if (tornStart !== undefined) {
    /* A live session may end in a partially written frame: salvage what is
       there rather than dropping the newest events. */
    try {
      parts.push(
        zlib.zstdDecompressSync(buffer.subarray(tornStart), {
          finishFlush: zlib.constants.ZSTD_e_flush,
        }),
      )
    } catch {
      /* nothing salvageable */
    }
  }

  return Buffer.concat(parts).toString('utf8')
}

/* ------------------------------------------------------------------ *
 * Aggregation
 * ------------------------------------------------------------------ */

function emptyCounters() {
  return { tokens: 0, requests: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }
}

function addCounters(target, source) {
  target.tokens += source.tokens || 0
  target.requests += source.requests || 0
  target.inputTokens += source.inputTokens || 0
  target.outputTokens += source.outputTokens || 0
  target.cacheReadTokens += source.cacheReadTokens || 0
  target.cacheWriteTokens += source.cacheWriteTokens || 0
  return target
}

function counterFromUsage(usage) {
  const inputTokens = numberOrZero(usage.inputTokens)
  const outputTokens = numberOrZero(usage.outputTokens)
  const cacheReadTokens = numberOrZero(usage.cacheReadTokens)
  const cacheWriteTokens = numberOrZero(usage.cacheWriteTokens)
  const total = numberOrZero(usage.totalTokens) || inputTokens + outputTokens
  return { tokens: total, requests: 1, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens }
}

function numberOrZero(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

function dayKey(ms) {
  const date = new Date(ms)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function aggregateLog(text) {
  const models = new Map()
  const days = new Map()
  const totals = emptyCounters()

  for (const line of text.split('\n')) {
    if (line.length === 0) continue

    let event
    try {
      event = JSON.parse(line)
    } catch {
      continue
    }

    if (event.type !== 'assistant/message') continue
    const usage = event.data?.usage
    if (!usage) continue

    const source = event.data?.message?.source
    if (source?.kind !== 'model') continue

    const counters = counterFromUsage(usage)
    const provider = typeof source.provider === 'string' ? source.provider : 'unknown'
    const model = typeof source.model === 'string' ? source.model : 'unknown'
    const key = `${provider}\u0000${model}`
    const at = typeof event.time === 'number' ? event.time : Date.now()
    const day = dayKey(at)

    addCounters(totals, counters)

    const entry = models.get(key) || {
      provider,
      model,
      ...emptyCounters(),
      lastUsed: 0,
      firstUsed: at,
    }
    addCounters(entry, counters)
    entry.lastUsed = Math.max(entry.lastUsed, at)
    entry.firstUsed = Math.min(entry.firstUsed, at)
    models.set(key, entry)

    const bucket = days.get(day) || emptyCounters()
    addCounters(bucket, counters)
    days.set(day, bucket)
  }

  return { totals, models: [...models.values()], days: Object.fromEntries(days) }
}

/* ------------------------------------------------------------------ *
 * Scanning
 * ------------------------------------------------------------------ */

function sessionsRoot() {
  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  return path.join(home, 'sessions')
}

async function listLogFiles(root) {
  const files = []
  let workspaces
  try {
    workspaces = await readdir(root, { withFileTypes: true })
  } catch {
    return files
  }

  for (const workspace of workspaces) {
    if (!workspace.isDirectory()) continue
    const workspaceDir = path.join(root, workspace.name)
    let sessions
    try {
      sessions = await readdir(workspaceDir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const session of sessions) {
      if (!session.isDirectory()) continue
      const file = path.join(workspaceDir, session.name, LOG_FILE)
      try {
        const info = await stat(file)
        if (info.isFile() && info.size <= MAX_FILE_BYTES) {
          files.push({ file, mtimeMs: info.mtimeMs, size: info.size })
        }
      } catch {
        continue
      }
    }
  }

  return files
}

async function aggregateFile(entry) {
  const buffer = await readFile(entry.file)
  const text = decodeZstdLog(buffer)
  return { ...aggregateLog(text), size: buffer.length, mtimeMs: entry.mtimeMs }
}

function mergeAll(aggregates) {
  const totals = emptyCounters()
  const today = emptyCounters()
  const models = new Map()
  const days = new Map()
  const todayLabel = dayKey(Date.now())

  for (const aggregate of aggregates) {
    addCounters(totals, aggregate.totals)

    const bucket = aggregate.days[todayLabel]
    if (bucket) addCounters(today, bucket)

    for (const model of aggregate.models) {
      const key = `${model.provider}\u0000${model.model}`
      const entry = models.get(key) || {
        provider: model.provider,
        model: model.model,
        ...emptyCounters(),
        firstUsed: model.firstUsed,
        lastUsed: model.lastUsed,
      }
      addCounters(entry, model)
      entry.firstUsed = Math.min(entry.firstUsed, model.firstUsed)
      entry.lastUsed = Math.max(entry.lastUsed, model.lastUsed)
      models.set(key, entry)
    }

    for (const [day, counters] of Object.entries(aggregate.days)) {
      const bucket = days.get(day) || emptyCounters()
      addCounters(bucket, counters)
      days.set(day, bucket)
    }
  }

  const groups = new Map()
  for (const model of models.values()) {
    const group = groups.get(model.provider) || {
      provider: model.provider,
      ...emptyCounters(),
      lastUsed: 0,
      models: [],
    }
    addCounters(group, model)
    group.lastUsed = Math.max(group.lastUsed, model.lastUsed)
    group.models.push({
      model: model.model,
      ...emptyCounters(),
      tokens: model.tokens,
      requests: model.requests,
      inputTokens: model.inputTokens,
      outputTokens: model.outputTokens,
      cacheReadTokens: model.cacheReadTokens,
      cacheWriteTokens: model.cacheWriteTokens,
      firstUsed: model.firstUsed,
      lastUsed: model.lastUsed,
    })
    groups.set(model.provider, group)
  }

  const groupList = [...groups.values()]
    .map((group) => ({
      ...group,
      models: group.models.sort((a, b) => b.tokens - a.tokens || b.lastUsed - a.lastUsed),
    }))
    .sort((a, b) => b.tokens - a.tokens || b.lastUsed - a.lastUsed)

  const series = []
  for (let index = DAYS_SHOWN - 1; index >= 0; index -= 1) {
    const date = new Date()
    date.setHours(0, 0, 0, 0)
    date.setDate(date.getDate() - index)
    const key = dayKey(date.getTime())
    series.push({ date: key, tokens: days.get(key)?.tokens || 0 })
  }

  return { totals, today, groups: groupList, series }
}

/* ------------------------------------------------------------------ *
 * Route
 * ------------------------------------------------------------------ */

function sameOrigin(request) {
  const site = request.headers.get('sec-fetch-site')
  if (site && site !== 'same-origin' && site !== 'none') return false

  const origin = request.headers.get('origin')
  if (origin) {
    try {
      if (new URL(origin).host !== request.headers.get('host')) return false
    } catch {
      return false
    }
  }

  return true
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

export const name = 'balance-usage'
export const inject = ['webServer']

export function apply(ctx) {
  const files = new Map()
  let scanning = null
  let cached = null
  let cachedAt = 0

  async function scan() {
    const listing = await listLogFiles(sessionsRoot())
    const present = new Set(listing.map((entry) => entry.file))

    for (const known of [...files.keys()]) {
      if (!present.has(known)) files.delete(known)
    }

    const queue = listing.filter((entry) => {
      const cachedEntry = files.get(entry.file)
      return !cachedEntry || cachedEntry.mtimeMs !== entry.mtimeMs || cachedEntry.size !== entry.size
    })

    for (const entry of queue) {
      try {
        files.set(entry.file, await aggregateFile(entry))
      } catch {
        /* unreadable log: keep whatever the previous scan had, if anything */
      }
    }

    const merged = mergeAll([...files.values()])
    return {
      ...merged,
      sessions: listing.length,
      generatedAt: new Date().toISOString(),
    }
  }

  async function summary() {
    if (cached && Date.now() - cachedAt < SCAN_TTL_MS) return cached
    if (!scanning) {
      scanning = scan()
        .then((result) => {
          cached = result
          cachedAt = Date.now()
          return result
        })
        .finally(() => {
          scanning = null
        })
    }
    return scanning
  }

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: ROUTE,
        resource: async (request) => {
          if (!sameOrigin(request)) return json({ ok: false, error: 'forbidden' }, 403)
          try {
            const result = await summary()
            return json({ ok: true, ...result })
          } catch (error) {
            ctx.logger?.warn?.(error)
            return json({ ok: false, error: String(error?.message ?? error) }, 500)
          }
        },
      }),
    'balance-usage: summary route',
  )

  /* Warm the cache once so the first open of the panel is instant. */
  ctx.effect(() => {
    const timer = setTimeout(() => {
      summary().catch(() => {})
    }, 2_000)
    return () => clearTimeout(timer)
  }, 'balance-usage: warm scan')

  ctx.logger?.info?.(`[balance-usage] serving ${ROUTE}`)
}
