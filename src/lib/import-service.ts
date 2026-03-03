/**
 * Imports parsed Excel data into PocketBase collections.
 * Handles deduplication: existing groups/students/exams are reused.
 */

import { pb } from './pb'
import type { ParsedSheet, ParsedExam, ParsedStudent } from './excel-parser'

export interface ImportProgress {
  stage: string
  current: number
  total: number
}

type ProgressCallback = (p: ImportProgress) => void

export async function importSheets(
  sheets: ParsedSheet[],
  onProgress?: ProgressCallback,
) {
  for (const sheet of sheets) {
    await importSheet(sheet, onProgress)
  }
}

async function importSheet(sheet: ParsedSheet, onProgress?: ProgressCallback) {
  const report = (stage: string, current: number, total: number) =>
    onProgress?.({ stage, current, total })

  // ── 1. Upsert group ───────────────────────────────────────
  report('Группа: ' + sheet.groupName, 0, 1)
  const group = await upsertGroup(sheet.groupName)

  // ── 2. Upsert exams ───────────────────────────────────────
  report('Импорт тестов…', 0, sheet.exams.length)
  const examIdMap: Record<string, string> = {} // решу-ЕГЭ id → pb record id

  for (let i = 0; i < sheet.exams.length; i++) {
    const e = sheet.exams[i]
    if (!e) continue
    report('Тест ' + e.date, i, sheet.exams.length)
    const pbExam = await upsertExam(e, group.id)
    examIdMap[e.exam_id] = pbExam.id

    // upsert tasks
    await upsertTasks(e, pbExam.id)
  }

  // ── 3. Upsert students + results ──────────────────────────
  report('Импорт студентов…', 0, sheet.students.length)

  for (let i = 0; i < sheet.students.length; i++) {
    const s = sheet.students[i]
    if (!s) continue
    report('Студент: ' + s.name, i, sheet.students.length)
    const student = await upsertStudent(s.name, group.id)
    await upsertResults(s, student.id, examIdMap)
  }

  report('Готово!', 1, 1)
}

// ──────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────

async function upsertGroup(name: string) {
  try {
    const list = await pb.collection('groups').getList(1, 1, {
      filter: `name="${name.replace(/"/g, '\\"')}"`,
    })
    if (list.items.length > 0) return list.items[0]!
  } catch { /* not found */ }
  return pb.collection('groups').create({ name })
}

async function upsertExam(e: ParsedExam, groupId: string) {
  try {
    const list = await pb.collection('exams').getList(1, 1, {
      filter: `exam_id="${e.exam_id}" && group="${groupId}"`,
    })
    if (list.items.length > 0) {
      const existing = list.items[0]!
      if (existing.date !== e.date || existing.label !== e.label || existing.title !== e.title) {
        return pb.collection('exams').update(existing.id, {
          title: e.title,
          date: e.date,
          label: e.label,
        })
      }
      return existing
    }
  } catch { /* not found */ }

  return pb.collection('exams').create({
    exam_id: e.exam_id,
    title: e.title,
    date: e.date,
    label: e.label,
    group: groupId,
    task_count: e.taskCount,
  })
}

async function upsertTasks(e: ParsedExam, examPbId: string) {
  // Check if tasks already imported
  try {
    const existing = await pb.collection('exam_tasks').getList(1, 1, {
      filter: `exam="${examPbId}"`,
    })
    if (existing.items.length > 0) return // already imported
  } catch { /* ok */ }

  const BATCH = 25
  for (let start = 0; start < e.tasks.length; start += BATCH) {
    await Promise.all(
      e.tasks.slice(start, start + BATCH).map((t) =>
        pb.collection('exam_tasks').create({
          exam: examPbId,
          task_number: t.task_number,
          problem_id: t.problem_id,
        }),
      ),
    )
  }
}

async function upsertStudent(name: string, groupId: string) {
  // normalize trailing spaces
  const cleanName = name.trim()
  try {
    const list = await pb.collection('students').getList(1, 1, {
      filter: `name="${cleanName.replace(/"/g, '\\"')}" && group="${groupId}"`,
    })
    if (list.items.length > 0) return list.items[0]!
  } catch { /* not found */ }
  return pb.collection('students').create({ name: cleanName, group: groupId })
}

async function upsertResults(
  s: ParsedStudent,
  studentPbId: string,
  examIdMap: Record<string, string>,
) {
  for (const r of s.results) {
    const examPbId = examIdMap[r.exam_id]
    if (!examPbId) continue

    let existingResultId: string | null = null

    // Check if result already exists
    try {
      const existing = await pb.collection('student_results').getList(1, 1, {
        filter: `student="${studentPbId}" && exam="${examPbId}"`,
      })
      if (existing.items.length > 0) {
        const item = existing.items[0]!
        // If it was previously marked as "did not take" but now the student took it, we should update it
        if (item.did_not_take && !r.did_not_take) {
          existingResultId = item.id
        } else {
          continue // skip duplicate or unchanged
        }
      }
    } catch { /* ok */ }

    if (existingResultId) {
      // Update existing result that was previously "did not take"
      await pb.collection('student_results').update(existingResultId, {
        correct_count: r.correct_count ?? 0,
        grade: r.grade ?? 0,
        part1_score: r.part1_score ?? 0,
        did_not_take: false,
      })
    } else {
      // Create new
      await pb.collection('student_results').create({
        student: studentPbId,
        exam: examPbId,
        correct_count: r.correct_count ?? 0,
        grade: r.grade ?? 0,
        part1_score: r.part1_score ?? 0,
        did_not_take: r.did_not_take,
      })
    }

    // Answers in batches
    if (!r.did_not_take && r.answers.length > 0) {
      const BATCH = 25
      for (let start = 0; start < r.answers.length; start += BATCH) {
        await Promise.all(
          r.answers.slice(start, start + BATCH).map((isCorrect, offset) =>
            pb.collection('student_answers').create({
              student: studentPbId,
              exam: examPbId,
              task_number: start + offset + 1,
              is_correct: isCorrect,
            }),
          ),
        )
      }
    }
  }
}
