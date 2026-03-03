import PocketBase from 'pocketbase'

export const pb = new PocketBase(
  import.meta.env.DEV ? 'http://127.0.0.1:8090' : window.location.origin,
)
pb.autoCancellation(false)

// ──────────────────────────────────────────
// Types matching PocketBase collections
// ──────────────────────────────────────────

export interface Group {
  id: string
  name: string
  created: string
}

export interface Student {
  id: string
  name: string
  group: string          // relation id
  expand?: { group?: Group }
  created: string
}

export interface Exam {
  id: string
  exam_id: string        // решу-ЕГЭ numeric ID
  title: string
  date: string           // ISO date
  label: string          // teacher label e.g. "БАЗА-10-кл-006-02.02.26"
  group: string          // relation id
  task_count: number
  expand?: { group?: Group }
  created: string
}

export interface ExamTask {
  id: string
  exam: string           // relation id
  task_number: number    // 1–21
  problem_id: string     // решу-ЕГЭ problem ID
}

export interface StudentResult {
  id: string
  student: string        // relation id
  exam: string           // relation id
  correct_count: number
  grade: number          // 2–5
  part1_score: number
  did_not_take: boolean
  is_exempt?: boolean
  expand?: { student?: Student; exam?: Exam }
}

export interface StudentAnswer {
  id: string
  student: string        // relation id
  exam: string           // relation id
  task_number: number
  is_correct: boolean
}

// ──────────────────────────────────────────
// URL helpers
// ──────────────────────────────────────────

export const siteBaseUrl = 'https://mathb-ege.sdamgia.ru'

export function examUrl(examId: string) {
  return `${siteBaseUrl}/test?id=${examId}`
}

export function problemUrl(problemId: string) {
  return `${siteBaseUrl}/problem?id=${problemId}`
}

export function filterIn(field: string, values: string[]): string {
  if (values.length === 0) return 'id="NONE"'
  return '(' + values.map((v) => `${field}="${v}"`).join(' || ') + ')'
}
