import type { ExamTask, StudentAnswer } from './pb'
import { problemUrl } from './pb'

export type HomeworkMode = 'student' | 'group'
export type HomeworkType = 'tasks' | 'topics'

export interface HomeworkItem {
  taskNumber: number
  attempts: number
  correct: number
  rate: number
  problemIds: string[]
}

export interface HomeworkData {
  mode: HomeworkMode
  type: HomeworkType
  title: string
  items: HomeworkItem[]
}

export interface BuildHomeworkInput {
  mode: HomeworkMode
  type: HomeworkType
  title: string
  tasks: ExamTask[]
  answers: StudentAnswer[]
  threshold?: number
  maxPerTopic?: number
}

export function buildHomework({
  mode,
  type,
  title,
  tasks,
  answers,
  threshold = 0.6,
  maxPerTopic = 5,
}: BuildHomeworkInput): HomeworkData {
  // exam|task -> problem_id
  const problemByKey = new Map<string, string>()
  for (const t of tasks) {
    problemByKey.set(`${t.exam}|${t.task_number}`, t.problem_id)
  }

  // Aggregate stats per task_number, and collect per-task problem sets
  const agg = new Map<
    number,
    {
      attempts: number
      correct: number
      allProblems: Set<string>
      failedProblems: Set<string>
    }
  >()

  for (const a of answers) {
    const key = `${a.exam}|${a.task_number}`
    const problemId = problemByKey.get(key)
    if (!problemId) continue
    const cur = agg.get(a.task_number) ?? {
      attempts: 0,
      correct: 0,
      allProblems: new Set<string>(),
      failedProblems: new Set<string>(),
    }
    cur.attempts += 1
    if (a.is_correct) {
      cur.correct += 1
    } else {
      cur.failedProblems.add(problemId)
    }
    cur.allProblems.add(problemId)
    agg.set(a.task_number, cur)
  }

  const items: HomeworkItem[] = []
  for (const [taskNumber, s] of agg.entries()) {
    const rate = s.attempts > 0 ? s.correct / s.attempts : 1

    let problemIds: string[]
    if (type === 'tasks') {
      // Только задачи, которые проваливались
      if (s.failedProblems.size === 0) continue
      problemIds = [...s.failedProblems].slice(0, maxPerTopic)
    } else {
      // Слабые темы: только номера с rate ниже порога
      if (rate >= threshold) continue
      problemIds = [...s.allProblems].slice(0, maxPerTopic)
    }

    items.push({
      taskNumber,
      attempts: s.attempts,
      correct: s.correct,
      rate,
      problemIds,
    })
  }

  items.sort((a, b) => a.rate - b.rate || a.taskNumber - b.taskNumber)

  return { mode, type, title, items }
}

export function homeworkToPlainText(data: HomeworkData): string {
  if (data.items.length === 0) {
    return `${data.title}\n\nНет подходящих заданий — отличный результат!`
  }
  const lines: string[] = [data.title, '']
  for (const item of data.items) {
    lines.push(
      `Задание ${item.taskNumber} — ${Math.round(item.rate * 100)}% верных (${item.correct}/${item.attempts})`,
    )
    for (const pid of item.problemIds) {
      lines.push(`  • ${problemUrl(pid)}`)
    }
    lines.push('')
  }
  return lines.join('\n').trimEnd()
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function homeworkToHtml(data: HomeworkData): string {
  if (data.items.length === 0) {
    return `<div><strong>${escapeHtml(data.title)}</strong></div><div>Нет подходящих заданий — отличный результат!</div>`
  }
  const parts: string[] = [`<div><strong>${escapeHtml(data.title)}</strong></div><br/>`]
  for (const item of data.items) {
    parts.push(
      `<div><strong>Задание ${item.taskNumber}</strong> — ${Math.round(item.rate * 100)}% верных (${item.correct}/${item.attempts})</div>`,
    )
    for (const pid of item.problemIds) {
      const url = problemUrl(pid)
      parts.push(`<div>• <a href="${url}">${escapeHtml(url)}</a></div>`)
    }
    parts.push('<br/>')
  }
  return parts.join('')
}
