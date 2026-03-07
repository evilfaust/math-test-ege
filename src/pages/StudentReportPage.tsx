import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { format, parse } from 'date-fns'
import { ru } from 'date-fns/locale'
import { pb, type Exam, type ExamTask, examUrl, filterIn, problemUrl, type Student, type StudentAnswer, type StudentResult } from '../lib/pb'

function parseExamDate(d: string) {
  try {
    return d.includes('-')
      ? parse(d, 'yyyy-MM-dd', new Date())
      : parse(d, 'dd.MM.yyyy', new Date())
  } catch {
    return null
  }
}

function formatDateShort(d: string) {
  const parsed = parseExamDate(d)
  return parsed ? format(parsed, 'd MMM yyyy', { locale: ru }) : d
}

function monthLabelFromDate(date: Date) {
  const label = format(date, 'LLLL yyyy', { locale: ru })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function buildTaskStats(tasks: ExamTask[], answers: StudentAnswer[]) {
  const answerMap = new Map<string, { attempts: number; correct: number }>()
  for (const a of answers) {
    const key = `${a.exam}|${a.task_number}`
    const cur = answerMap.get(key) ?? { attempts: 0, correct: 0 }
    answerMap.set(key, {
      attempts: cur.attempts + 1,
      correct: cur.correct + (a.is_correct ? 1 : 0),
    })
  }

  const taskAgg = new Map<number, { attempts: number; correct: number; problem_id: string }>()
  for (const t of tasks) {
    const key = `${t.exam}|${t.task_number}`
    const stats = answerMap.get(key)
    if (!stats) continue
    const cur = taskAgg.get(t.task_number) ?? {
      attempts: 0,
      correct: 0,
      problem_id: t.problem_id,
    }
    taskAgg.set(t.task_number, {
      attempts: cur.attempts + stats.attempts,
      correct: cur.correct + stats.correct,
      problem_id: t.problem_id,
    })
  }

  return [...taskAgg.entries()]
    .map(([task_number, s]) => ({
      task_number,
      attempts: s.attempts,
      correct: s.correct,
      rate: s.correct / s.attempts,
      problem_id: s.problem_id,
    }))
    .sort((a, b) => a.task_number - b.task_number)
}

export default function StudentReportPage() {
  const { studentId } = useParams<{ studentId: string }>()
  const location = useLocation()
  const [student, setStudent] = useState<Student | null>(null)
  const [results, setResults] = useState<StudentResult[]>([])
  const [exams, setExams] = useState<Map<string, Exam>>(new Map())
  const [tasks, setTasks] = useState<ExamTask[]>([])
  const [answers, setAnswers] = useState<StudentAnswer[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!studentId) return

    async function load() {
      try {
        const std = await pb.collection('students').getOne<Student>(studentId!)
        setStudent(std)

        const allGroupExams = await pb.collection('exams').getFullList<Exam>({
          filter: `group="${std.group}"`,
          sort: 'date',
        })
        const examMap = new Map<string, Exam>()
        for (const e of allGroupExams) examMap.set(e.id, e)
        setExams(examMap)

        const res = await pb.collection('student_results').getFullList<StudentResult>({
          filter: `student="${studentId}"`,
          expand: 'exam',
        })

        const completeResults: StudentResult[] = allGroupExams.map(exam => {
          const existing = res.find(r => r.exam === exam.id)
          if (existing) return existing
          return {
            id: `virtual-${exam.id}`,
            student: std.id,
            exam: exam.id,
            correct_count: 0,
            grade: 0,
            part1_score: 0,
            did_not_take: true,
            is_exempt: false,
          }
        })
        setResults(completeResults)

        const fetchedAnswers = await pb.collection('student_answers').getFullList<StudentAnswer>({
          filter: `student="${studentId}"`,
        })
        setAnswers(fetchedAnswers)

        const examIds = [...examMap.keys()]
        const fetchedTasks = examIds.length > 0
          ? await pb.collection('exam_tasks').getFullList<ExamTask>({
            filter: filterIn('exam', examIds),
          })
          : []
        setTasks(fetchedTasks)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [studentId])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('auto') === '1') {
      const id = window.setTimeout(() => window.print(), 300)
      return () => window.clearTimeout(id)
    }
    return undefined
  }, [location.search])

  const { monthMeta, examMonthKey } = useMemo(() => {
    const meta: { key: string; label: string }[] = []
    const seen = new Set<string>()
    const keyByExam = new Map<string, string>()

    for (const exam of exams.values()) {
      const parsed = parseExamDate(exam.date)
      if (!parsed) continue
      const key = format(parsed, 'yyyy-MM')
      const label = monthLabelFromDate(parsed)
      keyByExam.set(exam.id, key)
      if (!seen.has(key)) {
        seen.add(key)
        meta.push({ key, label })
      }
    }
    return { monthMeta: meta, examMonthKey: keyByExam }
  }, [exams])

  const taskStatsAll = useMemo(() => buildTaskStats(tasks, answers), [tasks, answers])
  const weakTasksAll = useMemo(
    () => taskStatsAll.filter(t => t.rate < 0.6),
    [taskStatsAll],
  )

  const monthlyStats = useMemo(() => {
    return monthMeta.map(m => {
      const filteredAnswers = answers.filter(a => examMonthKey.get(a.exam) === m.key)
      const stats = buildTaskStats(tasks, filteredAnswers)
      return {
        key: m.key,
        label: m.label,
        stats,
        weak: stats.filter(t => t.rate < 0.6),
      }
    })
  }, [answers, examMonthKey, monthMeta, tasks])

  if (loading) {
    return <div className="card p-8 text-center text-gray-400 animate-pulse">Загрузка…</div>
  }

  if (!student) {
    return <div className="card p-8 text-center text-gray-500">Студент не найден</div>
  }

  const takenCount = results.filter(r => !r.did_not_take && !r.is_exempt).length
  const exemptCount = results.filter(r => r.did_not_take && r.is_exempt).length
  const debtCount = results.filter(r => r.did_not_take && !r.is_exempt).length

  return (
    <div className="print-report space-y-6 max-w-5xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Отчет по ученику</h2>
          <p className="text-sm text-gray-500">
            {student.name}
          </p>
          <p className="text-xs text-gray-400">
            Сформировано: {format(new Date(), 'd MMMM yyyy', { locale: ru })}
          </p>
        </div>
        <div className="flex items-center gap-2 print-hidden">
          <Link to={`/student/${student.id}`} className="btn-ghost">Назад</Link>
          <button className="btn-primary" onClick={() => window.print()}>Печать / PDF</button>
        </div>
      </div>

      <div className="card p-4">
        <h3 className="font-semibold text-gray-800 mb-2">Сводка</h3>
        <div className="text-sm text-gray-600">
          Сдано: <strong>{takenCount}</strong>
          {exemptCount > 0 && <span className="ml-1">· Зачтено: <strong className="text-blue-600">{exemptCount}</strong></span>}
          {' '}· Не сдано: <strong className={debtCount > 0 ? 'text-red-600' : ''}>{debtCount}</strong>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800">Все тесты</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Тест</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Дата</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Оценка</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Правильных</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Ссылка</th>
              </tr>
            </thead>
            <tbody>
              {results.map(r => {
                const exam = exams.get(r.exam)
                return (
                  <tr key={r.id} className="border-b border-gray-50">
                    <td className="px-4 py-3">
                      {exam?.label || `Тест #${exam?.exam_id?.slice(-4)}`}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {exam ? formatDateShort(exam.date) : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {r.did_not_take && !r.is_exempt ? '—' : r.is_exempt ? '—' : r.grade}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600">
                      {r.did_not_take && !r.is_exempt ? '—' : r.is_exempt ? '—' : `${r.correct_count} / ${exam?.task_count ?? '?'}`}
                    </td>
                    <td className="px-4 py-3">
                      {exam ? (
                        <a href={examUrl(exam.exam_id)} className="text-brand-700 hover:underline" target="_blank" rel="noopener noreferrer">
                          Открыть тест
                        </a>
                      ) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card p-5">
        <h3 className="font-semibold text-gray-800 mb-3">Все задания — всё время</h3>
        {taskStatsAll.length === 0 ? (
          <p className="text-sm text-gray-400">Нет данных.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-3 py-2 font-medium text-gray-600">№</th>
                <th className="text-center px-3 py-2 font-medium text-gray-600">Попыток</th>
                <th className="text-center px-3 py-2 font-medium text-gray-600">Верно</th>
                <th className="text-center px-3 py-2 font-medium text-gray-600">%</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Ссылка</th>
              </tr>
            </thead>
            <tbody>
              {taskStatsAll.map(t => (
                <tr key={t.task_number} className="border-b border-gray-50">
                  <td className="px-3 py-2 font-semibold">{t.task_number}</td>
                  <td className="px-3 py-2 text-center">{t.attempts}</td>
                  <td className="px-3 py-2 text-center">{t.correct}</td>
                  <td className="px-3 py-2 text-center">{Math.round(t.rate * 100)}%</td>
                  <td className="px-3 py-2">
                    <a href={problemUrl(t.problem_id)} className="text-brand-700 hover:underline" target="_blank" rel="noopener noreferrer">
                      Открыть задание
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card p-5">
        <h3 className="font-semibold text-gray-800 mb-3">Проблемные задания — всё время</h3>
        {weakTasksAll.length === 0 ? (
          <p className="text-sm text-gray-400">Нет проблемных заданий.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-3 py-2 font-medium text-gray-600">№</th>
                <th className="text-center px-3 py-2 font-medium text-gray-600">Верно</th>
                <th className="text-center px-3 py-2 font-medium text-gray-600">Попыток</th>
                <th className="text-center px-3 py-2 font-medium text-gray-600">%</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Ссылка</th>
              </tr>
            </thead>
            <tbody>
              {weakTasksAll.map(t => (
                <tr key={t.task_number} className="border-b border-gray-50">
                  <td className="px-3 py-2 font-semibold">{t.task_number}</td>
                  <td className="px-3 py-2 text-center">{t.correct}</td>
                  <td className="px-3 py-2 text-center">{t.attempts}</td>
                  <td className="px-3 py-2 text-center">{Math.round(t.rate * 100)}%</td>
                  <td className="px-3 py-2">
                    <a href={problemUrl(t.problem_id)} className="text-brand-700 hover:underline" target="_blank" rel="noopener noreferrer">
                      Открыть задание
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {monthlyStats.map(m => (
        <div key={m.key} className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-800">Период: {m.label}</h3>

          <div className="card p-5">
            <h4 className="font-semibold text-gray-800 mb-3">Все задания</h4>
            {m.stats.length === 0 ? (
              <p className="text-sm text-gray-400">Нет данных.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-3 py-2 font-medium text-gray-600">№</th>
                    <th className="text-center px-3 py-2 font-medium text-gray-600">Попыток</th>
                    <th className="text-center px-3 py-2 font-medium text-gray-600">Верно</th>
                    <th className="text-center px-3 py-2 font-medium text-gray-600">%</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Ссылка</th>
                  </tr>
                </thead>
                <tbody>
                  {m.stats.map(t => (
                    <tr key={t.task_number} className="border-b border-gray-50">
                      <td className="px-3 py-2 font-semibold">{t.task_number}</td>
                      <td className="px-3 py-2 text-center">{t.attempts}</td>
                      <td className="px-3 py-2 text-center">{t.correct}</td>
                      <td className="px-3 py-2 text-center">{Math.round(t.rate * 100)}%</td>
                      <td className="px-3 py-2">
                        <a href={problemUrl(t.problem_id)} className="text-brand-700 hover:underline" target="_blank" rel="noopener noreferrer">
                          Открыть задание
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card p-5">
            <h4 className="font-semibold text-gray-800 mb-3">Проблемные задания</h4>
            {m.weak.length === 0 ? (
              <p className="text-sm text-gray-400">Нет проблемных заданий.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-3 py-2 font-medium text-gray-600">№</th>
                    <th className="text-center px-3 py-2 font-medium text-gray-600">Верно</th>
                    <th className="text-center px-3 py-2 font-medium text-gray-600">Попыток</th>
                    <th className="text-center px-3 py-2 font-medium text-gray-600">%</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Ссылка</th>
                  </tr>
                </thead>
                <tbody>
                  {m.weak.map(t => (
                    <tr key={t.task_number} className="border-b border-gray-50">
                      <td className="px-3 py-2 font-semibold">{t.task_number}</td>
                      <td className="px-3 py-2 text-center">{t.correct}</td>
                      <td className="px-3 py-2 text-center">{t.attempts}</td>
                      <td className="px-3 py-2 text-center">{Math.round(t.rate * 100)}%</td>
                      <td className="px-3 py-2">
                        <a href={problemUrl(t.problem_id)} className="text-brand-700 hover:underline" target="_blank" rel="noopener noreferrer">
                          Открыть задание
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
