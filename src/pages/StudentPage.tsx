import { useState, useEffect, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { pb, type Student, type Exam, type StudentResult, type StudentAnswer, type ExamTask, examUrl, problemUrl, filterIn } from '../lib/pb'
import GradeCell from '../components/GradeCell'
import StudentExamModal from '../components/StudentExamModal'
import { ExternalLink, TrendingUp, Settings2, FileDown, BookOpen, CheckCircle2, AlertTriangle, Star, Send, Check, X as XIcon, Pencil } from 'lucide-react'
import HomeworkModal from '../components/HomeworkModal'
import { format, parse } from 'date-fns'
import { ru } from 'date-fns/locale'

function fmtDate(d: string) {
  try {
    const parsed = d.includes('-')
      ? parse(d, 'yyyy-MM-dd', new Date())
      : parse(d, 'dd.MM.yyyy', new Date())
    return format(parsed, 'd MMM yy', { locale: ru })
  } catch { return d }
}

const DOW = [
  { short: 'Вс', color: 'text-slate-400' },
  { short: 'Пн', color: 'text-blue-500' },
  { short: 'Вт', color: 'text-slate-400' },
  { short: 'Ср', color: 'text-emerald-500' },
  { short: 'Чт', color: 'text-slate-400' },
  { short: 'Пт', color: 'text-violet-500' },
  { short: 'Сб', color: 'text-slate-400' },
]

function getDow(d: string) {
  try {
    const parsed = d.includes('-')
      ? parse(d, 'yyyy-MM-dd', new Date())
      : parse(d, 'dd.MM.yyyy', new Date())
    return DOW[parsed.getDay()]
  } catch { return null }
}

function parseExamDate(d: string) {
  try {
    return d.includes('-') ? parse(d, 'yyyy-MM-dd', new Date()) : parse(d, 'dd.MM.yyyy', new Date())
  } catch { return null }
}

function monthLabelFromDate(date: Date) {
  const label = format(date, 'LLLL yyyy', { locale: ru })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

type TaskStat = {
  task_number: number
  attempts: number
  correct: number
  rate: number
  problem_id: string
  failed_problem_ids: string[]
}

function buildTaskStats(tasks: ExamTask[], answers: StudentAnswer[]): TaskStat[] {
  const taskProblemByKey = new Map<string, string>()
  for (const t of tasks) taskProblemByKey.set(`${t.exam}|${t.task_number}`, t.problem_id)

  const failedByTask = new Map<number, Set<string>>()
  for (const a of answers) {
    if (a.is_correct) continue
    const problemId = taskProblemByKey.get(`${a.exam}|${a.task_number}`)
    if (!problemId) continue
    const cur = failedByTask.get(a.task_number) ?? new Set<string>()
    cur.add(problemId)
    failedByTask.set(a.task_number, cur)
  }

  const answerMap = new Map<string, { attempts: number; correct: number }>()
  for (const a of answers) {
    const key = `${a.exam}|${a.task_number}`
    const cur = answerMap.get(key) ?? { attempts: 0, correct: 0 }
    answerMap.set(key, { attempts: cur.attempts + 1, correct: cur.correct + (a.is_correct ? 1 : 0) })
  }

  const taskAgg = new Map<number, { attempts: number; correct: number; problem_id: string }>()
  for (const t of tasks) {
    const key = `${t.exam}|${t.task_number}`
    const stats = answerMap.get(key)
    if (!stats) continue
    const cur = taskAgg.get(t.task_number) ?? { attempts: 0, correct: 0, problem_id: t.problem_id }
    taskAgg.set(t.task_number, { attempts: cur.attempts + stats.attempts, correct: cur.correct + stats.correct, problem_id: t.problem_id })
  }

  return [...taskAgg.entries()]
    .map(([task_number, s]) => ({
      task_number, attempts: s.attempts, correct: s.correct, rate: s.correct / s.attempts,
      problem_id: s.problem_id, failed_problem_ids: [...(failedByTask.get(task_number) ?? new Set<string>())],
    }))
    .sort((a, b) => a.task_number - b.task_number)
}

export default function StudentPage() {
  const { studentId } = useParams<{ studentId: string }>()
  const [student, setStudent] = useState<Student | null>(null)
  const [results, setResults] = useState<StudentResult[]>([])
  const [exams, setExams] = useState<Map<string, Exam>>(new Map())
  const [tasks, setTasks] = useState<ExamTask[]>([])
  const [answers, setAnswers] = useState<StudentAnswer[]>([])
  const [availableMonths, setAvailableMonths] = useState<string[]>([])
  const [selectedMonth, setSelectedMonth] = useState<string>('all')
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null)
  const [homeworkOpen, setHomeworkOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [groupName, setGroupName] = useState('')
  const [tgEditing, setTgEditing] = useState(false)
  const [tgDraft, setTgDraft] = useState('')
  const [tgSaving, setTgSaving] = useState(false)
  const [tgError, setTgError] = useState<string | null>(null)

  useEffect(() => {
    if (!studentId) return
    async function load() {
      try {
        const std = await pb.collection('students').getOne<Student>(studentId!)
        setStudent(std)

        const [group, allGroupExams] = await Promise.all([
          pb.collection('groups').getOne(std.group).catch(() => null),
          pb.collection('exams').getFullList<Exam>({ filter: `group="${std.group}"`, sort: 'date' }),
        ])
        if (group) setGroupName((group as { name: string }).name)

        const examMap = new Map<string, Exam>()
        for (const e of allGroupExams) examMap.set(e.id, e)
        setExams(examMap)

        const res = await pb.collection('student_results').getFullList<StudentResult>({
          filter: `student="${studentId}"`, expand: 'exam',
        })

        const completeResults: StudentResult[] = allGroupExams.map((exam) => {
          const existing = res.find((r) => r.exam === exam.id)
          if (existing) return existing
          return { id: `virtual-${exam.id}`, student: std.id, exam: exam.id, correct_count: 0, grade: 0, part1_score: 0, did_not_take: true, is_exempt: false }
        })
        setResults(completeResults)

        const [fetchedAnswers, fetchedTasks] = await Promise.all([
          pb.collection('student_answers').getFullList<StudentAnswer>({ filter: `student="${studentId}"` }),
          allGroupExams.length > 0
            ? pb.collection('exam_tasks').getFullList<ExamTask>({ filter: filterIn('exam', [...examMap.keys()]) })
            : Promise.resolve([]),
        ])
        setTasks(fetchedTasks)
        setAnswers(fetchedAnswers)

        const months = new Set<string>()
        allGroupExams.forEach((e) => {
          const dateStr = fmtDate(e.date)
          const parts = dateStr.split(' ')
          if (parts.length >= 3) months.add(`${parts[1]} ${parts[2]}`)
          else if (parts.length === 2) months.add(`${parts[0]} ${parts[1]}`)
        })
        setAvailableMonths(Array.from(months))
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [studentId])

  const taskStats = useMemo(() => {
    const filteredAnswers = selectedMonth === 'all' ? answers : answers.filter((a) => {
      const e = exams.get(a.exam)
      if (!e) return false
      const dateStr = fmtDate(e.date)
      const parts = dateStr.split(' ')
      const monthYear = parts.length >= 3 ? `${parts[1]} ${parts[2]}` : parts.length === 2 ? `${parts[0]} ${parts[1]}` : dateStr
      return monthYear === selectedMonth
    })
    return buildTaskStats(tasks, filteredAnswers)
  }, [tasks, answers, selectedMonth, exams])

  const taskStatsAll = useMemo(() => buildTaskStats(tasks, answers), [tasks, answers])

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
      if (!seen.has(key)) { seen.add(key); meta.push({ key, label }) }
    }
    return { monthMeta: meta, examMonthKey: keyByExam }
  }, [exams])

  const monthlyStats = useMemo(() => {
    return monthMeta.map((m) => {
      const filteredAnswers = answers.filter((a) => examMonthKey.get(a.exam) === m.key)
      const stats = buildTaskStats(tasks, filteredAnswers)
      return { key: m.key, label: m.label, stats, weak: stats.filter((t) => t.rate < 0.6) }
    })
  }, [answers, examMonthKey, monthMeta, tasks])

  if (loading) return <div className="card p-8 text-center text-slate-400 text-[14px] animate-pulse">Загрузка…</div>
  if (!student) return <div className="card p-8 text-center text-slate-500 text-[14px]">Студент не найден</div>

  const chartData = results
    .filter((r) => !r.did_not_take || r.is_exempt)
    .sort((a, b) => (exams.get(a.exam)?.date || '').localeCompare(exams.get(b.exam)?.date || ''))
    .map((r) => {
      const exam = exams.get(r.exam)
      return { date: exam ? fmtDate(exam.date) : r.exam, grade: r.is_exempt ? null : r.grade, correct: r.correct_count, label: exam?.label ?? '' }
    })
    .filter((d) => d.grade !== null)

  const weakTasks = taskStats.filter((t) => t.rate < 0.6).sort((a, b) => a.rate - b.rate)
  const takenCount = results.filter((r) => !r.did_not_take && !r.is_exempt).length
  const exemptCount = results.filter((r) => r.did_not_take && r.is_exempt).length
  const debtCount = results.filter((r) => r.did_not_take && !r.is_exempt).length
  const total = takenCount + debtCount + exemptCount

  const takenGrades = results.filter((r) => !r.did_not_take && !r.is_exempt && r.grade > 0)
  const avgGrade = takenGrades.length > 0
    ? (takenGrades.reduce((s, r) => s + r.grade, 0) / takenGrades.length).toFixed(1)
    : '—'
  const bestGrade = takenGrades.length > 0
    ? Math.max(...takenGrades.map((r) => r.grade))
    : '—'

  const initials = student.name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()

  const startEditTg = () => {
    setTgDraft(student?.telegram_id ?? '')
    setTgError(null)
    setTgEditing(true)
  }

  const cancelEditTg = () => {
    setTgEditing(false)
    setTgError(null)
  }

  const saveTelegramId = async () => {
    if (!studentId || !student) return
    const trimmed = tgDraft.trim()
    if (trimmed && !/^[0-9]+$/.test(trimmed)) {
      setTgError('Только цифры (Telegram user_id)')
      return
    }
    setTgSaving(true)
    setTgError(null)
    try {
      const updated = await pb.collection('students').update<Student>(student.id, {
        telegram_id: trimmed,
      })
      setStudent(updated)
      setTgEditing(false)
    } catch (e) {
      console.error(e)
      setTgError((e as Error).message)
    } finally {
      setTgSaving(false)
    }
  }

  const toggleExempt = async (r: StudentResult) => {
    if (!studentId) return
    try {
      if (r.id.startsWith('virtual-')) {
        const newRecord = await pb.collection('student_results').create<StudentResult>({
          student: studentId, exam: r.exam, correct_count: 0, grade: 0, part1_score: 0, did_not_take: true, is_exempt: true,
        })
        setResults((prev) => prev.map((pr) => pr.exam === r.exam ? newRecord : pr))
      } else {
        const updated = await pb.collection('student_results').update<StudentResult>(r.id, { is_exempt: !r.is_exempt })
        setResults((prev) => prev.map((pr) => pr.id === r.id ? updated : pr))
      }
    } catch (e) { console.error(e) }
  }

  return (
    <div className="space-y-5 max-w-5xl print-page">
      {/* Profile header */}
      <div className="card p-6">
        <div className="flex items-start gap-5">
          {/* Avatar */}
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 text-white grid place-items-center font-semibold text-[18px] shadow-sm shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              Студент{groupName ? ` · ${groupName}` : ''}
            </p>
            <h2 className="text-[24px] font-semibold text-slate-900 tracking-[-0.01em] mt-0.5">{student.name}</h2>
            {/* Telegram ID */}
            <div className="mt-1.5 flex items-center gap-2 text-[12px] text-slate-500 print-hidden">
              <Send size={12} className="text-slate-400" />
              {!tgEditing ? (
                <>
                  <span className="font-mono">
                    {student.telegram_id ? student.telegram_id : <span className="italic text-slate-400">не привязан</span>}
                  </span>
                  <button
                    onClick={startEditTg}
                    className="text-slate-400 hover:text-indigo-600 p-0.5"
                    title="Изменить Telegram ID"
                  >
                    <Pencil size={11} />
                  </button>
                </>
              ) : (
                <>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={tgDraft}
                    onChange={(e) => setTgDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveTelegramId()
                      if (e.key === 'Escape') cancelEditTg()
                    }}
                    placeholder="напр. 328497552"
                    autoFocus
                    disabled={tgSaving}
                    className="px-2 py-0.5 border border-slate-300 rounded text-[12px] font-mono w-44 focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    onClick={saveTelegramId}
                    disabled={tgSaving}
                    className="text-emerald-600 hover:text-emerald-700 p-0.5 disabled:opacity-50"
                    title="Сохранить"
                  >
                    <Check size={13} />
                  </button>
                  <button
                    onClick={cancelEditTg}
                    disabled={tgSaving}
                    className="text-slate-400 hover:text-slate-600 p-0.5 disabled:opacity-50"
                    title="Отмена"
                  >
                    <XIcon size={13} />
                  </button>
                  {tgError && <span className="text-rose-600 text-[11px] ml-1">{tgError}</span>}
                </>
              )}
            </div>
            {/* Progress bar */}
            <div className="mt-4 max-w-md">
              <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1.5">
                <span><span className="font-semibold text-slate-700">{takenCount}</span> сдано</span>
                {total > 0 && <span>{Math.round((takenCount / total) * 100)}% покрытие</span>}
                <span><span className={`font-semibold ${debtCount > 0 ? 'text-rose-600' : 'text-slate-700'}`}>{debtCount}</span> не сдано</span>
              </div>
              {total > 0 && (
                <div className="flex h-1.5 rounded-full overflow-hidden bg-slate-100">
                  <div className="bg-emerald-400" style={{ width: `${(takenCount / total) * 100}%` }} />
                  {exemptCount > 0 && <div className="bg-indigo-300" style={{ width: `${(exemptCount / total) * 100}%` }} />}
                  <div className="bg-rose-400" style={{ width: `${(debtCount / total) * 100}%` }} />
                </div>
              )}
            </div>
          </div>
          {/* Action buttons */}
          <div className="flex items-center gap-2 shrink-0 print-hidden">
            <button
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[12.5px] font-medium transition-colors"
              onClick={() => setHomeworkOpen(true)}
            >
              <BookOpen size={13} /> Собрать ДЗ
            </button>
            <button
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[12.5px] font-medium transition-colors"
              onClick={() => {
                const prev = document.title
                const stamp = format(new Date(), 'dd.MM.yyyy')
                document.title = `${student.name} ${stamp}`
                window.print()
                window.setTimeout(() => { document.title = prev }, 1000)
              }}
            >
              <FileDown size={13} /> Экспорт PDF
            </button>
            <Link
              to={`/student/${student.id}/print`}
              className="inline-flex items-center px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[12.5px] font-medium transition-colors"
            >
              Отчет
            </Link>
          </div>
        </div>
      </div>

      {/* Mini stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { icon: CheckCircle2, label: 'Сдано тестов',  value: takenCount, sub: 'всего работ',       accent: 'emerald' },
          { icon: AlertTriangle, label: 'Не сдано',     value: debtCount,  sub: 'долгов',             accent: debtCount > 0 ? 'rose' : 'slate' },
          { icon: TrendingUp,   label: 'Средний балл',  value: avgGrade,   sub: 'по всем работам',    accent: 'indigo' },
          { icon: Star,         label: 'Лучший балл',   value: bestGrade,  sub: `из ${total} тестов`, accent: 'amber' },
        ].map(({ icon: Icon, label, value, sub, accent }) => {
          const accents: Record<string, { bg: string; fg: string }> = {
            slate:   { bg: 'bg-slate-100',  fg: 'text-slate-500' },
            indigo:  { bg: 'bg-indigo-50',  fg: 'text-indigo-600' },
            emerald: { bg: 'bg-emerald-50', fg: 'text-emerald-600' },
            amber:   { bg: 'bg-amber-50',   fg: 'text-amber-600' },
            rose:    { bg: 'bg-rose-50',    fg: 'text-rose-600' },
          }
          const { bg, fg } = accents[accent] ?? accents.slate
          return (
            <div key={label} className="card p-5">
              <div className="flex items-start justify-between">
                <p className="text-[12px] font-medium text-slate-500">{label}</p>
                <div className={`w-7 h-7 rounded-md grid place-items-center shrink-0 ${bg} ${fg}`}>
                  <Icon size={14} />
                </div>
              </div>
              <p className="mt-3 text-[28px] font-semibold text-slate-900 tabular-nums tracking-[-0.02em] leading-none">{value}</p>
              <p className="mt-2 text-[12px] text-slate-500">{sub}</p>
            </div>
          )
        })}
      </div>

      {/* Trend chart */}
      {chartData.length > 1 && (
        <div className="card p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Прогресс</p>
          <h3 className="text-[15px] font-semibold text-slate-900 mt-0.5 mb-4">Динамика оценок</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} />
              <YAxis domain={[2, 5]} ticks={[2, 3, 4, 5]} tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <ReferenceLine y={3} stroke="#fbbf24" strokeDasharray="3 3" />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                formatter={(v) => [`Оценка: ${v}`, '']}
              />
              <Line
                type="monotone"
                dataKey="grade"
                stroke="#4f46e5"
                strokeWidth={2.5}
                dot={{ r: 4, fill: '#4f46e5', stroke: '#fff', strokeWidth: 2 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tests table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-[15px] font-semibold text-slate-900">Все тесты</h3>
          <p className="text-[12px] text-slate-500">{results.length} работ</p>
        </div>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500">
              <th className="text-left px-5 py-2.5 font-semibold">Тест</th>
              <th className="text-left px-4 py-2.5 font-semibold">Дата</th>
              <th className="text-center px-4 py-2.5 font-semibold">Результат</th>
              <th className="text-center px-4 py-2.5 font-semibold">Правильных</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {results.map((r) => {
              const exam = exams.get(r.exam)
              const isExempt = r.did_not_take && r.is_exempt
              return (
                <tr key={r.id} className={`hover:bg-slate-50 transition-colors ${isExempt ? 'print-hidden-row' : ''}`}>
                  <td className="px-5 py-2.5">
                    <Link to={`/exam/${r.exam}`} className="font-medium text-indigo-600 hover:text-indigo-700">
                      {exam?.label || `Тест #${exam?.exam_id?.slice(-4)}`}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">
                    {exam ? (
                      <span className="flex items-center gap-1.5">
                        {(() => { const dow = getDow(exam.date); return dow ? <span className={`font-semibold ${dow.color}`}>{dow.short}</span> : null })()}
                        <span className="text-slate-500 text-[12px]">{fmtDate(exam.date)}</span>
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <button onClick={() => setSelectedExamId(r.exam)} className="hover:scale-105 transition-transform" disabled={r.did_not_take && !r.is_exempt}>
                      <GradeCell grade={r.grade} correct={r.correct_count} didNotTake={r.did_not_take && !r.is_exempt} isExempt={r.is_exempt} />
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-center text-slate-600 tabular-nums">
                    {r.did_not_take && !r.is_exempt ? <span className="text-slate-300">—</span> : r.is_exempt ? <span className="text-slate-300">—</span> : `${r.correct_count} / ${exam?.task_count ?? '?'}`}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-2">
                      {r.did_not_take && (
                        <button
                          onClick={() => toggleExempt(r)}
                          className={`p-1.5 rounded-md transition-colors ${r.is_exempt ? 'text-indigo-600 bg-indigo-50' : 'text-slate-300 hover:text-indigo-500 hover:bg-slate-50'}`}
                          title={r.is_exempt ? 'Снять отметку' : 'Назначить зачёт'}
                        >
                          <Settings2 size={14} />
                        </button>
                      )}
                      {exam && (
                        <a
                          href={examUrl(exam.exam_id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-slate-300 hover:text-indigo-600 p-1.5 transition-colors"
                        >
                          <ExternalLink size={13} />
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Month filter */}
      {availableMonths.length > 0 && (
        <div className="flex gap-2 flex-wrap items-center print-hidden">
          <span className="text-[12px] font-medium text-slate-500 mr-1">Период:</span>
          <div className="inline-flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            <button
              onClick={() => setSelectedMonth('all')}
              className={`px-3 py-1.5 text-[12px] font-medium rounded-md transition-all ${selectedMonth === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Всё время
            </button>
            {availableMonths.map((m) => (
              <button
                key={m}
                onClick={() => setSelectedMonth(m)}
                className={`px-3 py-1.5 text-[12px] font-medium rounded-md transition-all capitalize ${selectedMonth === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Task heatmap */}
      {taskStats.length > 0 && (
        <div className="card p-5 task-all-card print-hidden">
          <h3 className="text-[15px] font-semibold text-slate-900 mb-1">Все задания</h3>
          <p className="text-[12px] text-slate-500 mb-4">Процент верных ответов по каждому номеру</p>
          <div className="flex flex-wrap gap-1.5">
            {taskStats.map((t) => {
              const cls = t.rate >= 0.8
                ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                : t.rate >= 0.6 ? 'bg-lime-100 text-lime-800 border-lime-200'
                : t.rate >= 0.4 ? 'bg-amber-100 text-amber-800 border-amber-200'
                : 'bg-rose-100 text-rose-800 border-rose-200'
              return (
                <a
                  key={t.task_number}
                  href={problemUrl(t.problem_id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`Задание ${t.task_number}: ${t.correct}/${t.attempts} (${Math.round(t.rate * 100)}%)`}
                  className={`flex flex-col items-center justify-center w-12 h-12 rounded-lg border ${cls} hover:scale-105 transition-transform`}
                >
                  <span className="text-[14px] font-semibold tabular-nums leading-none">{t.task_number}</span>
                  <span className="text-[10px] opacity-70 mt-0.5 tabular-nums">{Math.round(t.rate * 100)}%</span>
                </a>
              )
            })}
          </div>
        </div>
      )}

      {/* Weak tasks */}
      {weakTasks.length > 0 && (
        <div className="card p-5 task-weak-card print-hidden">
          <h3 className="text-[15px] font-semibold text-slate-900 mb-1">Проблемные задания</h3>
          <p className="text-[12px] text-slate-500 mb-4">&lt;60% правильных ответов</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {weakTasks.map((t) => (
              <div key={t.task_number} className="weak-item rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between">
                  <p className="text-[13.5px] font-semibold text-slate-900">Задание {t.task_number}</p>
                  <span className={`text-[12px] font-semibold tabular-nums ${t.rate < 0.4 ? 'text-rose-600' : 'text-amber-600'}`}>
                    {Math.round(t.rate * 100)}%
                  </span>
                </div>
                <div className="mt-1.5 h-1 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`${t.rate < 0.4 ? 'bg-rose-400' : 'bg-amber-400'} h-full rounded-full`} style={{ width: `${t.rate * 100}%` }} />
                </div>
                {t.failed_problem_ids.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2 text-[10px] text-slate-500">
                    {t.failed_problem_ids.map((pid) => (
                      <a key={pid} href={problemUrl(pid)} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-indigo-600">{pid}</a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Print-only: monthly blocks */}
      <div className="print-only space-y-6">
        {monthlyStats.map((m, idx) => (
          <div key={m.key} className={`space-y-4 ${idx === 0 ? 'print-break-before' : ''}`}>
            <h3 className="text-lg font-semibold text-gray-800">Период: {m.label}</h3>
            <div className="card p-5 task-all-card">
              <h4 className="font-semibold text-gray-800 mb-3">Все задания</h4>
              {m.stats.length === 0 ? (
                <p className="text-sm text-gray-400">Нет данных.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {m.stats.map((t) => {
                    const pct = t.rate
                    const bg = pct >= 0.8 ? 'print-tile-green' : pct >= 0.6 ? 'print-tile-lime' : pct >= 0.4 ? 'print-tile-amber' : 'print-tile-red'
                    return (
                      <div key={t.task_number} className={`print-tile ${bg}`}>
                        <span className="print-tile-num">{t.task_number}</span>
                        <span className="print-tile-pct">{Math.round(pct * 100)}%</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            <div className="card p-5 task-weak-card">
              <h4 className="font-semibold text-gray-800 mb-3">Проблемные задания</h4>
              {m.weak.length === 0 ? (
                <p className="text-sm text-gray-400">Нет проблемных заданий.</p>
              ) : (
                <div className="print-weak-grid">
                  {m.weak.map((t) => (
                    <div key={t.task_number} className="print-weak-item">
                      <p className="print-weak-title">Задание {t.task_number}</p>
                      <p className="print-weak-score">{t.correct}/{t.attempts} ({Math.round(t.rate * 100)}%)</p>
                      {t.failed_problem_ids.length > 0 && (
                        <div className="print-weak-ids">
                          {t.failed_problem_ids.map((pid) => (
                            <a key={pid} href={problemUrl(pid)} target="_blank" rel="noopener noreferrer" className="print-weak-id">{pid}</a>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-800">Период: Всё время</h3>
          {taskStatsAll.length > 0 && (
            <div className="card p-5 task-all-card">
              <h4 className="font-semibold text-gray-800 mb-3">Все задания</h4>
              <div className="flex flex-wrap gap-1.5">
                {taskStatsAll.map((t) => {
                  const pct = t.rate
                  const bg = pct >= 0.8 ? 'print-tile-green' : pct >= 0.6 ? 'print-tile-lime' : pct >= 0.4 ? 'print-tile-amber' : 'print-tile-red'
                  return (
                    <div key={t.task_number} className={`print-tile ${bg}`}>
                      <span className="print-tile-num">{t.task_number}</span>
                      <span className="print-tile-pct">{Math.round(pct * 100)}%</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          {taskStatsAll.filter((t) => t.rate < 0.6).length > 0 && (
            <div className="card p-5 task-weak-card">
              <h4 className="font-semibold text-gray-800 mb-3">Проблемные задания</h4>
              <div className="print-weak-grid">
                {taskStatsAll.filter((t) => t.rate < 0.6).map((t) => (
                  <div key={t.task_number} className="print-weak-item">
                    <p className="print-weak-title">Задание {t.task_number}</p>
                    <p className="print-weak-score">{t.correct}/{t.attempts} ({Math.round(t.rate * 100)}%)</p>
                    {t.failed_problem_ids.length > 0 && (
                      <div className="print-weak-ids">
                        {t.failed_problem_ids.map((pid) => (
                          <a key={pid} href={problemUrl(pid)} target="_blank" rel="noopener noreferrer" className="print-weak-id">{pid}</a>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {selectedExamId && (
        <StudentExamModal
          isOpen={!!selectedExamId}
          onClose={() => setSelectedExamId(null)}
          studentId={studentId!}
          examId={selectedExamId}
        />
      )}

      <HomeworkModal
        open={homeworkOpen}
        onClose={() => setHomeworkOpen(false)}
        mode="student"
        title={`ДЗ для ${student.name}`}
        tasks={tasks}
        answers={answers}
        printUrl={({ type, n }) => `/homework/student/${student.id}?type=${type}&n=${n}`}
      />
    </div>
  )
}
