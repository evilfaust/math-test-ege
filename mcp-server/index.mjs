import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

const PB_URL = process.env.PB_URL || 'http://127.0.0.1:8090'
const SDAM_BASE = 'https://mathb-ege.sdamgia.ru'

function examUrl(exam) {
  return exam.exam_id ? `${SDAM_BASE}/test?id=${exam.exam_id}` : null
}

// ── PocketBase helpers ─────────────────────────────────────────────────────

async function pbAll(collection, filter = '') {
  let page = 1
  const items = []
  while (true) {
    const url = `${PB_URL}/api/collections/${collection}/records?perPage=500&page=${page}${filter ? '&filter=' + encodeURIComponent(filter) : ''}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`PocketBase ${collection}: HTTP ${res.status}`)
    const data = await res.json()
    items.push(...data.items)
    if (items.length >= data.totalItems) break
    page++
  }
  return items
}

async function snapshot() {
  const [groups, students, exams, results, answers] = await Promise.all([
    pbAll('groups'),
    pbAll('students'),
    pbAll('exams'),
    pbAll('student_results'),
    pbAll('student_answers'),
  ])
  return { groups, students, exams, results, answers }
}

// ── Shared logic ───────────────────────────────────────────────────────────

function periodStart(period) {
  const days = { week: 6, month: 29 }
  if (!days[period]) return null
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - days[period])
  return d
}

function parseDate(s) {
  if (!s) return null
  const d = new Date(s + 'T00:00:00')
  return isNaN(d) ? null : (d.setHours(0, 0, 0, 0), d)
}

function fmtDate(s) {
  if (!s) return '?'
  const [y, m, d] = s.split('-')
  return `${d}.${m}.${y?.slice(-2)}`
}

function resolveGroup(groups, q) {
  if (!q) return null
  const n = s => String(s || '').toLowerCase().trim()
  const exact = groups.find(g => n(g.name) === n(q))
  if (exact) return exact
  const hits = groups.filter(g => n(g.name).includes(n(q)))
  return hits.length === 1 ? hits[0] : null
}

function filteredExams(exams, groupId, period) {
  const start = periodStart(period)
  return exams.filter(e => {
    if (e.group !== groupId) return false
    if (!start) return true
    const d = parseDate(e.date)
    return d && d >= start
  })
}

// ── Tool implementations ───────────────────────────────────────────────────

async function toolListGroups() {
  const snap = await snapshot()
  const lines = snap.groups
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
    .map(g => {
      const count = snap.students.filter(s => s.group === g.id).length
      const examCount = snap.exams.filter(e => e.group === g.id).length
      return `• ${g.name} — ${count} уч., ${examCount} работ`
    })
  return lines.length ? lines.join('\n') : 'Групп нет.'
}

async function toolGetDebts({ group: groupQ, period = 'all' }) {
  const snap = await snapshot()
  const group = resolveGroup(snap.groups, groupQ)
  if (!group) return groupQ ? `Группа не найдена: "${groupQ}"` : 'Укажите группу.'

  const exams = filteredExams(snap.exams, group.id, period)
  const students = snap.students.filter(s => s.group === group.id)
  const rmap = Object.fromEntries(snap.results.map(r => [`${r.student}__${r.exam}`, r]))

  const PERIOD_LABEL = { week: 'за неделю', month: 'за месяц', all: 'за всё время' }

  const rows = students
    .map(student => ({
      name: student.name,
      debts: exams.filter(e => {
        const r = rmap[`${student.id}__${e.id}`]
        return (!r || r.did_not_take) && !r?.is_exempt
      }),
    }))
    .filter(r => r.debts.length)
    .sort((a, b) => b.debts.length - a.debts.length || a.name.localeCompare(b.name, 'ru'))

  const header = `Долги по группе "${group.name}" (${PERIOD_LABEL[period] || period}):`
  if (!rows.length) return `${header}\n✅ Долгов нет.`

  const lines = rows.map(({ name, debts }) => {
    const examLinks = debts.map(e => {
      const url = examUrl(e)
      return url ? `${fmtDate(e.date)} ${url}` : fmtDate(e.date)
    })
    return `${name} — ${debts.length} долг(ов):\n${examLinks.map(l => `  ${l}`).join('\n')}`
  })
  return [header, ...lines].join('\n')
}

async function toolGetScores({ group: groupQ, period = 'all' }) {
  const snap = await snapshot()
  const group = resolveGroup(snap.groups, groupQ)
  if (!group) return groupQ ? `Группа не найдена: "${groupQ}"` : 'Укажите группу.'

  const PERIOD_LABEL = { week: 'за неделю', month: 'за месяц', all: 'за всё время' }
  const examIds = new Set(filteredExams(snap.exams, group.id, period).map(e => e.id))

  const rows = snap.students
    .filter(s => s.group === group.id)
    .map(student => {
      const taken = snap.results.filter(r =>
        r.student === student.id && examIds.has(r.exam) && !r.did_not_take && !r.is_exempt && r.grade > 0
      )
      const avg = taken.length ? taken.reduce((s, r) => s + r.grade, 0) / taken.length : null
      const dist = { 2: 0, 3: 0, 4: 0, 5: 0 }
      taken.forEach(r => { if (r.grade in dist) dist[r.grade]++ })
      return { name: student.name, avg, count: taken.length, dist }
    })
    .sort((a, b) => {
      if (a.avg === null && b.avg === null) return a.name.localeCompare(b.name, 'ru')
      if (a.avg === null) return 1
      if (b.avg === null) return -1
      return b.avg - a.avg
    })

  const header = `Оценки группы "${group.name}" (${PERIOD_LABEL[period] || period}):`
  const lines = rows.map(r =>
    r.avg === null
      ? `  ${r.name} — нет данных`
      : `  ${r.name} — ср. ${r.avg.toFixed(2)} (работ: ${r.count}) | ❺${r.dist[5]} ❹${r.dist[4]} ❸${r.dist[3]} ❷${r.dist[2]}`
  )
  return [header, ...lines].join('\n')
}

function renderStudentDetails(student, snap) {
    const group = snap.groups.find(g => g.id === student.group)
    const all = snap.results.filter(r => r.student === student.id && !r.is_exempt)
    const taken = all.filter(r => !r.did_not_take && r.grade > 0)
    const missed = all.filter(r => r.did_not_take)
    const avg = taken.length ? (taken.reduce((s, r) => s + r.grade, 0) / taken.length).toFixed(2) : null
    const dist = { 2: 0, 3: 0, 4: 0, 5: 0 }
    taken.forEach(r => { if (r.grade in dist) dist[r.grade]++ })

    // Error patterns for this student
    const studentAnswers = snap.answers.filter(a => a.student === student.id)
    const taskErrors = {}
    studentAnswers.forEach(a => {
      if (!taskErrors[a.task_number]) taskErrors[a.task_number] = { wrong: 0, total: 0 }
      taskErrors[a.task_number].total++
      if (!a.is_correct) taskErrors[a.task_number].wrong++
    })
    const weakTasks = Object.entries(taskErrors)
      .filter(([, v]) => v.total >= 2 && v.wrong / v.total >= 0.4)
      .sort((a, b) => (b[1].wrong / b[1].total) - (a[1].wrong / a[1].total))
      .slice(0, 5)
      .map(([n, v]) => `задание ${n} (${v.wrong}/${v.total} ошибок)`)

    const last5 = [...taken]
      .sort((a, b) => {
        const da = snap.exams.find(e => e.id === a.exam)?.date ?? ''
        const db = snap.exams.find(e => e.id === b.exam)?.date ?? ''
        return db.localeCompare(da)
      })
      .slice(0, 5)

    const tgLine = student.telegram_id ? ` [tg:${student.telegram_id}]` : ''
    const lines = [`${student.name}${group ? ` (${group.name})` : ''}${tgLine}`]
    if (avg !== null) {
      lines.push(`Средняя оценка: ${avg} | Работ: ${taken.length} | Пропусков: ${missed.length}`)
      lines.push(`Распределение: ❺${dist[5]} ❹${dist[4]} ❸${dist[3]} ❷${dist[2]}`)
    } else {
      lines.push('Нет оценок.')
    }
    if (weakTasks.length) {
      lines.push(`Слабые места: ${weakTasks.join(', ')}`)
    }
    if (last5.length) {
      lines.push('Последние работы:')
      last5.forEach(r => {
        const exam = snap.exams.find(e => e.id === r.exam)
        const url = exam ? examUrl(exam) : null
        const link = url ? ` ${url}` : ''
        lines.push(`  ${fmtDate(exam?.date)}${link} — оценка ${r.grade}, верных: ${r.correct_count}`)
      })
    }

    // Debts with links
    const allExams = snap.exams.filter(e => snap.students.find(s => s.id === student.id)?.group === e.group)
    const rmap = Object.fromEntries(snap.results.map(r => [`${r.student}__${r.exam}`, r]))
    const debts = allExams.filter(e => {
      const r = rmap[`${student.id}__${e.id}`]
      return (!r || r.did_not_take) && !r?.is_exempt
    }).sort((a, b) => b.date.localeCompare(a.date))

    if (debts.length) {
      lines.push(`\nДолги (${debts.length}):`)
      debts.slice(0, 10).forEach(e => {
        const url = examUrl(e)
        lines.push(`  ${fmtDate(e.date)}${url ? ' ' + url : ''}`)
      })
      if (debts.length > 10) lines.push(`  ... и ещё ${debts.length - 10}`)
    }
    return lines.join('\n')
}

async function toolGetStudent({ name: namePart }) {
  if (!namePart) return 'Укажите имя ученика.'
  const q = namePart.toLowerCase().trim()
  const snap = await snapshot()
  const matches = snap.students.filter(s => s.name.toLowerCase().includes(q))

  if (!matches.length) return `Ученик не найден: "${namePart}"`
  if (matches.length > 5) return `Найдено ${matches.length} учеников, уточните:\n` + matches.slice(0, 6).map(s => `• ${s.name}`).join('\n')

  return matches.map(s => renderStudentDetails(s, snap)).join('\n\n---\n\n')
}

async function toolGetStudentByTelegramId({ telegram_id }) {
  if (!telegram_id) return 'Укажите telegram_id.'
  const tg = String(telegram_id).trim()
  if (!/^[0-9]+$/.test(tg)) return `telegram_id должен быть числом, получено: "${telegram_id}"`
  const snap = await snapshot()
  const student = snap.students.find(s => String(s.telegram_id || '') === tg)
  if (!student) return `Ученик с telegram_id=${tg} не найден в журнале.`
  return renderStudentDetails(student, snap)
}

async function toolGetErrorPatterns({ group: groupQ, period = 'all', min_attempts = 3 }) {
  const snap = await snapshot()

  let groupId = null
  let groupName = 'все группы'
  if (groupQ) {
    const group = resolveGroup(snap.groups, groupQ)
    if (!group) return `Группа не найдена: "${groupQ}"`
    groupId = group.id
    groupName = group.name
  }

  const PERIOD_LABEL = { week: 'за неделю', month: 'за месяц', all: 'за всё время' }
  const examIds = new Set(
    filteredExams(snap.exams, groupId || '__all__', period)
      .concat(groupId ? [] : snap.exams.filter(e => {
        if (!period || period === 'all') return true
        const start = periodStart(period)
        const d = parseDate(e.date)
        return d && d >= start
      }))
      .map(e => e.id)
  )

  // If no groupId, use all exams for the period
  const relevantExamIds = groupId
    ? new Set(filteredExams(snap.exams, groupId, period).map(e => e.id))
    : new Set(
        snap.exams.filter(e => {
          if (period === 'all') return true
          const start = periodStart(period)
          const d = parseDate(e.date)
          return d && d >= start
        }).map(e => e.id)
      )

  const relevantStudentIds = groupId
    ? new Set(snap.students.filter(s => s.group === groupId).map(s => s.id))
    : null

  const taskStats = {}
  snap.answers.forEach(a => {
    if (!relevantExamIds.has(a.exam)) return
    if (relevantStudentIds && !relevantStudentIds.has(a.student)) return
    if (!taskStats[a.task_number]) taskStats[a.task_number] = { wrong: 0, total: 0 }
    taskStats[a.task_number].total++
    if (!a.is_correct) taskStats[a.task_number].wrong++
  })

  const rows = Object.entries(taskStats)
    .filter(([, v]) => v.total >= min_attempts)
    .map(([n, v]) => ({
      task: Number(n),
      wrong: v.wrong,
      total: v.total,
      pct: Math.round(v.wrong / v.total * 100),
    }))
    .sort((a, b) => b.pct - a.pct || a.task - b.task)

  if (!rows.length) return 'Недостаточно данных для анализа.'

  const header = `Паттерны ошибок — "${groupName}" (${PERIOD_LABEL[period] || period}):`
  const worst = rows.slice(0, 10).map(r =>
    `  Задание ${r.task}: ${r.pct}% ошибок (${r.wrong}/${r.total})`
  )
  const best = rows.slice(-5).reverse().map(r =>
    `  Задание ${r.task}: ${r.pct}% ошибок (${r.wrong}/${r.total})`
  )

  const lines = [
    header,
    `Топ сложных заданий:`,
    ...worst,
    ``,
    `Лучше всего решают:`,
    ...best,
  ]
  return lines.join('\n')
}

// ── Token usage tool ───────────────────────────────────────────────────────

import { readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

function fmtTokens(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function fmtCost(usd) {
  if (usd < 0.0001) return `${(usd * 100).toFixed(4)}¢`
  if (usd < 1.0) return `${(usd * 100).toFixed(2)}¢`
  return `$${usd.toFixed(4)}`
}

async function toolPicoclaWUsage({ period = 'week' } = {}) {
  const logFile = join(homedir(), '.picoclaw', 'token_usage.jsonl')
  let raw
  try { raw = readFileSync(logFile, 'utf8') } catch { return 'Нет данных об использовании. Лог ещё не создан.' }

  let since
  if (period === 'today') {
    const d = new Date(); d.setHours(0, 0, 0, 0); since = d
  } else if (period === 'all') {
    since = null
  } else {
    const days = period === 'month' ? 30 : 7
    since = new Date(Date.now() - days * 86400_000)
  }

  const entries = raw.split('\n').filter(Boolean).map(l => {
    try { return JSON.parse(l) } catch { return null }
  }).filter(Boolean).filter(e => !since || new Date(e.ts) >= since)

  if (!entries.length) return `Нет данных за период "${period}".`

  const totalIn = entries.reduce((s, e) => s + (e.in || 0), 0)
  const totalOut = entries.reduce((s, e) => s + (e.out || 0), 0)
  const totalCost = entries.reduce((s, e) => s + (e.cost_usd || 0), 0)
  const errors = entries.filter(e => !e.ok).length

  const byModel = {}
  for (const e of entries) {
    const m = (e.model || '?').split('/').pop()
    if (!byModel[m]) byModel[m] = { calls: 0, in: 0, out: 0, cost: 0 }
    byModel[m].calls++
    byModel[m].in += e.in || 0
    byModel[m].out += e.out || 0
    byModel[m].cost += e.cost_usd || 0
  }

  const LABEL = { today: 'Сегодня', week: '7 дней', month: '30 дней', all: 'Всё время' }
  const lines = [
    `📊 Расход токенов — ${LABEL[period] || period}`,
    `Запросов: ${entries.length}${errors ? ` (${errors} ошибок)` : ''}`,
    `Входящие: ${fmtTokens(totalIn)}`,
    `Исходящие: ${fmtTokens(totalOut)}`,
    `Всего: ${fmtTokens(totalIn + totalOut)}`,
    `💰 Стоимость: ${fmtCost(totalCost)}`,
    '',
    'По моделям:',
    ...Object.entries(byModel)
      .sort((a, b) => b[1].cost - a[1].cost)
      .map(([m, s]) => `  ${m}: ${s.calls} запр, ${fmtTokens(s.in + s.out)} токенов, ${fmtCost(s.cost)}`),
  ]
  return lines.join('\n')
}

// ── MCP Server ─────────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'ege_list_groups',
    description: 'Список всех групп с количеством учеников и работ.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'ege_get_debts',
    description: 'Долги учеников (пропущенные/несданные работы) по группе за период.',
    inputSchema: {
      type: 'object',
      properties: {
        group: { type: 'string', description: 'Название или часть названия группы' },
        period: { type: 'string', enum: ['week', 'month', 'all'], description: 'Период: week/month/all (default: all)' },
      },
      required: [],
    },
  },
  {
    name: 'ege_get_scores',
    description: 'Оценки учеников группы за период с распределением по оценкам.',
    inputSchema: {
      type: 'object',
      properties: {
        group: { type: 'string', description: 'Название или часть названия группы' },
        period: { type: 'string', enum: ['week', 'month', 'all'], description: 'Период: week/month/all (default: all)' },
      },
      required: ['group'],
    },
  },
  {
    name: 'ege_get_student',
    description: 'Полная статистика ученика: оценки, пропуски, слабые места, последние работы.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Имя или фамилия (частичное совпадение)' },
      },
      required: ['name'],
    },
  },
  {
    name: 'ege_get_student_by_telegram_id',
    description: 'Найти ученика по его Telegram user_id (точное совпадение). Используй когда нужно идентифицировать отправителя сообщения и понять, привязан ли он к ученику в журнале.',
    inputSchema: {
      type: 'object',
      properties: {
        telegram_id: { type: 'string', description: 'Telegram user_id (числовая строка)' },
      },
      required: ['telegram_id'],
    },
  },
  {
    name: 'picoclaw_usage',
    description: 'Статистика расхода токенов и денег за период. Используй когда спрашивают "сколько потратил", "стоимость", "токены".',
    inputSchema: {
      type: 'object',
      properties: {
        period: { type: 'string', enum: ['today', 'week', 'month', 'all'], description: 'Период: today/week/month/all (default: week)' },
      },
      required: [],
    },
  },
  {
    name: 'ege_get_error_patterns',
    description: 'Анализ ошибок: какие задания вызывают наибольшие трудности у группы или всех учеников.',
    inputSchema: {
      type: 'object',
      properties: {
        group: { type: 'string', description: 'Название группы (если не указано — все группы)' },
        period: { type: 'string', enum: ['week', 'month', 'all'], description: 'Период (default: all)' },
        min_attempts: { type: 'number', description: 'Минимум попыток для учёта задания (default: 3)' },
      },
      required: [],
    },
  },
]

const server = new Server(
  { name: 'ege-journal', version: '1.0.0' },
  { capabilities: { tools: {} } }
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }))

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params
  try {
    let text
    if (name === 'ege_list_groups')      text = await toolListGroups()
    else if (name === 'ege_get_debts')   text = await toolGetDebts(args)
    else if (name === 'ege_get_scores')  text = await toolGetScores(args)
    else if (name === 'ege_get_student') text = await toolGetStudent(args)
    else if (name === 'ege_get_student_by_telegram_id') text = await toolGetStudentByTelegramId(args)
    else if (name === 'ege_get_error_patterns') text = await toolGetErrorPatterns(args)
    else if (name === 'picoclaw_usage')         text = await toolPicoclaWUsage(args)
    else return { content: [{ type: 'text', text: `Неизвестный инструмент: ${name}` }], isError: true }

    return { content: [{ type: 'text', text }] }
  } catch (err) {
    return { content: [{ type: 'text', text: `Ошибка: ${err.message}` }], isError: true }
  }
})

const transport = new StdioServerTransport()
await server.connect(transport)
