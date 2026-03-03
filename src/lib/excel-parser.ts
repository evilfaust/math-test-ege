/**
 * Parser for "Решу ЕГЭ" Excel journal export.
 *
 * Format (from analysis):
 *   Row 0: exam headers merged across 21 cols
 *          "Контрольная работа № {exam_id}, {date}\n{label}"
 *   Row 1: task headers  "B {n} № {problem_id}"
 *   Row 2+: students in PAIRS:
 *     odd row:  col 0 = name, first col of block = "13(4)/4"
 *     even row: 0/1 answers per task (21 values per block)
 *   Last student row: "Среднее" (class average) — skip
 */

import * as XLSX from 'xlsx'

export interface ParsedExam {
  exam_id: string
  title: string
  date: string        // "DD.MM.YYYY"
  label: string
  colStart: number    // column index of first task in this exam block
  taskCount: number
  tasks: ParsedTask[]
}

export interface ParsedTask {
  task_number: number
  problem_id: string
}

export interface ParsedStudent {
  name: string
  results: ParsedResult[]
}

export interface ParsedResult {
  exam_id: string
  correct_count: number | null
  grade: number | null
  part1_score: number | null
  did_not_take: boolean
  answers: boolean[]  // indexed 0…taskCount-1
}

export interface ParsedSheet {
  groupName: string
  exams: ParsedExam[]
  students: ParsedStudent[]
}

// ──────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────

/** Parse score string like "13(4)/4" or "17/5" or null */
function parseScore(val: unknown): { correct: number | null; part1: number | null; grade: number | null } {
  if (val == null || val === '') return { correct: null, part1: null, grade: null }
  const s = String(val).trim()
  // Pattern: digits, optional (digits), /digits
  const m = s.match(/^(\d+)(?:\((\d+)\))?\/(\d+)/)
  if (!m) return { correct: null, part1: null, grade: null }
  return {
    correct: parseInt(m[1] ?? '0'),
    part1: m[2] != null ? parseInt(m[2]) : null,
    grade: parseInt(m[3] ?? '0'),
  }
}

/** Parse exam header cell: "Контрольная работа № 22673694, 02.02.2026\nБАЗА-10-кл-006" */
function parseExamHeader(val: string): { exam_id: string; date: string; title: string; label: string } | null {
  if (!val) return null
  const lines = val.split('\n')
  const line1 = lines[0] ?? ''
  const label = lines[1] ?? ''

  const idMatch = line1.match(/№\s*(\d+)/)
  if (!idMatch) return null

  // Look for date in label first (e.g. БАЗА-10-кл-018-04.03.26)
  let dateStr = ''
  const labelDateMatch = label.match(/(\d{2})\.(\d{2})\.(\d{2}|\d{4})/)
  if (labelDateMatch) {
    const yearStr = labelDateMatch[3]!
    const year = yearStr.length === 2 ? `20${yearStr}` : yearStr
    dateStr = `${year}-${labelDateMatch[2]}-${labelDateMatch[1]}`
  } else {
    // Fallback to date in line 1
    const dateMatch = line1.match(/(\d{2})\.(\d{2})\.(\d{4})/)
    if (dateMatch) {
      dateStr = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`
    }
  }

  return {
    exam_id: idMatch[1] ?? '',
    date: dateStr,
    title: line1.trim(),
    label: label.trim(),
  }
}

/** Parse task header cell: "B 1 № 282847" */
function parseTaskHeader(val: string): { task_number: number; problem_id: string } | null {
  if (!val) return null
  const m = val.match(/B\s*(\d+)\s*№\s*(\d+)/)
  if (!m) return null
  return { task_number: parseInt(m[1] ?? '0'), problem_id: m[2] ?? '' }
}

// ──────────────────────────────────────────
// Main parser
// ──────────────────────────────────────────

export function parseJournalWorkbook(buffer: ArrayBuffer): ParsedSheet[] {
  const wb = XLSX.read(buffer, { type: 'array', cellStyles: false, cellDates: false })
  const results: ParsedSheet[] = []

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName]
    if (!ws) continue

    const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: null,
      blankrows: true,
    }) as unknown[][]

    if (!raw || raw.length < 3) continue

    const sheet = parseSheet(raw, sheetName)
    if (sheet) results.push(sheet)
  }

  return results
}

function parseSheet(raw: unknown[][], sheetName: string): ParsedSheet | null {
  const row0 = raw[0] ?? []  // exam headers
  const row1 = raw[1] ?? []  // task headers

  // ── Detect exam blocks by scanning row 0 ──────────────────
  const exams: ParsedExam[] = []

  for (let col = 1; col < row0.length; col++) {
    const cell = row0[col]
    if (cell == null) continue
    const parsed = parseExamHeader(String(cell))
    if (!parsed) continue

    // Determine end of this block by finding next exam header
    let blockEnd = row0.length
    for (let c = col + 1; c < row0.length; c++) {
      if (row0[c] != null && parseExamHeader(String(row0[c]))) {
        blockEnd = c
        break
      }
    }
    const taskCount = blockEnd - col

    // Parse tasks from row 1
    const tasks: ParsedTask[] = []
    for (let c = col; c < blockEnd; c++) {
      const taskCell = row1[c]
      if (taskCell == null) continue
      const t = parseTaskHeader(String(taskCell))
      if (t) tasks.push(t)
    }

    exams.push({
      ...parsed,
      colStart: col,
      taskCount,
      tasks,
    })
  }

  if (exams.length === 0) return null

  // ── Parse students (pairs of rows from row 2 onwards) ─────
  const students: ParsedStudent[] = []

  let rowIdx = 2
  while (rowIdx + 1 < raw.length) {
    const nameRow = raw[rowIdx]
    const answerRow = raw[rowIdx + 1]

    if (!nameRow || !answerRow) { rowIdx += 2; continue }

    const nameCell = nameRow[0]
    if (nameCell == null) { rowIdx += 2; continue }

    const name = String(nameCell).trim()
    if (!name || name === 'Среднее' || name === '' || /^среднее/i.test(name)) {
      rowIdx += 2
      continue
    }

    const results: ParsedResult[] = []

    for (const exam of exams) {
      // Score string is in the first column of the block in the name row
      const scoreCell = nameRow[exam.colStart]
      const score = parseScore(scoreCell)

      const did_not_take = score.correct === null

      // Answers from the answer row
      const answers: boolean[] = []
      for (let c = exam.colStart; c < exam.colStart + exam.taskCount; c++) {
        const v = answerRow[c]
        answers.push(v === 1 || v === '1' || v === true)
      }

      results.push({
        exam_id: exam.exam_id,
        correct_count: score.correct,
        grade: score.grade,
        part1_score: score.part1,
        did_not_take,
        answers,
      })
    }

    students.push({ name, results })
    rowIdx += 2
  }

  return { groupName: sheetName, exams, students }
}
