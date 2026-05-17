import { useState, useEffect, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from 'recharts'
import { pb, type Group, type Student, type Exam, type StudentResult, type StudentAnswer, problemUrl, examUrl, filterIn } from '../lib/pb'
import { AlertTriangle, TrendingDown, Users, Copy, Check, X, BookOpen, ExternalLink } from 'lucide-react'
import ScoreTrendChart from '../components/ScoreTrendChart'
import HomeworkModal from '../components/HomeworkModal'

interface DebtItem {
  student: Student
  exam: Exam
}

interface GroupStat {
  group: Group
  examCount: number
  studentCount: number
  avgGrade: number
  passRate: number
}

function fmtDate(d: string) {
  if (!d) return ''
  const dt = new Date(d)
  return dt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
}

function getExamDebtDate(exam: Exam) {
  return exam.label.match(/\d{2}\.\d{2}\.\d{2,4}/)?.[0] || fmtDate(exam.date)
}

interface DebtModalState {
  student: Student
  exams: Exam[]
}

function taskRateColor(rate: number) {
  if (rate >= 0.6) return '#bef264'
  if (rate >= 0.4) return '#fde68a'
  return '#fca5a5'
}

export default function StatsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialGroup = searchParams.get('group') || 'all'

  const [groups, setGroups] = useState<Group[]>([])
  const [selectedGroup, setSelectedGroup] = useState<string>(initialGroup)
  const [debts, setDebts] = useState<DebtItem[]>([])
  const [debtModal, setDebtModal] = useState<DebtModalState | null>(null)
  const [copied, setCopied] = useState(false)
  const [homeworkOpen, setHomeworkOpen] = useState(false)

  const [tasks, setTasks] = useState<{ id: string; exam: string; task_number: number; problem_id: string }[]>([])
  const [answers, setAnswers] = useState<StudentAnswer[]>([])
  const [results, setResults] = useState<StudentResult[]>([])
  const selectedMonth = 'all'
  const [exams, setExams] = useState<Exam[]>([])

  const [groupStats, setGroupStats] = useState<GroupStat[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    pb.collection('groups').getFullList<Group>({ sort: 'name' }).then(setGroups).catch(console.error)
  }, [])

  useEffect(() => {
    const urlGroup = searchParams.get('group')
    if (urlGroup && urlGroup !== selectedGroup) {
      setSelectedGroup(urlGroup)
    }
  }, [searchParams])

  useEffect(() => {
    load()
  }, [selectedGroup])

  async function load() {
    setLoading(true)
    try {
      const groupFilter = selectedGroup !== 'all' ? `group="${selectedGroup}"` : ''

      const [students, exams] = await Promise.all([
        pb.collection('students').getFullList<Student>({
          filter: groupFilter,
          sort: 'name',
          expand: 'group',
        }),
        pb.collection('exams').getFullList<Exam>({
          filter: groupFilter,
          sort: '-date',
          expand: 'group',
        }),
      ])

      if (students.length === 0 || exams.length === 0) {
        setDebts([])
        setTasks([])
        setAnswers([])
        setResults([])
        setLoading(false)
        return
      }

      const studentIds = students.map((s) => s.id)
      const examIds = exams.map((e) => e.id)

      const [results, answers, tasks] = await Promise.all([
        pb.collection('student_results').getFullList<StudentResult>({
          filter: `${filterIn('student', studentIds)} && ${filterIn('exam', examIds)}`,
        }),
        pb.collection('student_answers').getFullList<StudentAnswer>({
          filter: `${filterIn('student', studentIds)} && ${filterIn('exam', examIds)}`,
        }),
        pb.collection('exam_tasks').getFullList<{ id: string; exam: string; task_number: number; problem_id: string }>({
          filter: filterIn('exam', examIds),
        }),
      ])

      const resultMap = new Map<string, StudentResult>()
      for (const r of results) resultMap.set(`${r.student}__${r.exam}`, r)

      const debtList: DebtItem[] = []
      for (const student of students) {
        for (const exam of exams.filter((e) => e.group === student.group)) {
          const r = resultMap.get(`${student.id}__${exam.id}`)
          if ((!r || r.did_not_take) && !r?.is_exempt) {
            debtList.push({ student, exam })
          }
        }
      }
      setDebts(debtList)

      setTasks(tasks)
      setAnswers(answers)
      setExams(exams)
      setResults(results)

      const gs: GroupStat[] = []
      const allGroups = selectedGroup === 'all' ? groups : groups.filter((g) => g.id === selectedGroup)
      for (const group of allGroups) {
        const groupStudents = students.filter((s) => s.group === group.id)
        const groupExams = exams.filter((e) => e.group === group.id)
        const groupResults = results.filter(
          (r) =>
            groupStudents.some((s) => s.id === r.student) &&
            groupExams.some((e) => e.id === r.exam) &&
            !r.did_not_take,
        )
        const avgGrade =
          groupResults.length > 0
            ? groupResults.reduce((s, r) => s + r.grade, 0) / groupResults.length
            : 0
        const passRate =
          groupResults.length > 0
            ? groupResults.filter((r) => r.grade >= 3).length / groupResults.length
            : 0

        gs.push({
          group,
          examCount: groupExams.length,
          studentCount: groupStudents.length,
          avgGrade,
          passRate,
        })
      }
      setGroupStats(gs)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const debtsByStudent = new Map<string, { student: Student; count: number }>()
  for (const d of debts) {
    const cur = debtsByStudent.get(d.student.id) ?? { student: d.student, count: 0 }
    debtsByStudent.set(d.student.id, { ...cur, count: cur.count + 1 })
  }
  const sortedDebtors = [...debtsByStudent.values()].sort((a, b) => b.count - a.count)
  const maxDebtCount = sortedDebtors[0]?.count ?? 1

  const weakTasks = useMemo(() => {
    const filteredAnswers = selectedMonth === 'all' ? answers : answers.filter(a => {
      const e = exams.find(ex => ex.id === a.exam)
      if (!e) return false
      const dateStr = fmtDate(e.date)
      const parts = dateStr.split(' ')
      const monthYear = parts.length >= 3 ? `${parts[1]} ${parts[2]}` : parts.length === 2 ? `${parts[0]} ${parts[1]}` : dateStr
      return monthYear === selectedMonth
    })

    const taskMap = new Map<number, { correct: number; total: number; problem_id: string }>()
    for (const t of tasks) {
      const taskAnswers = filteredAnswers.filter(
        (a) => a.task_number === t.task_number && a.exam === t.exam,
      )
      if (taskAnswers.length === 0) continue
      const cur = taskMap.get(t.task_number) ?? { correct: 0, total: 0, problem_id: t.problem_id }
      taskMap.set(t.task_number, {
        correct: cur.correct + taskAnswers.filter((a) => a.is_correct).length,
        total: cur.total + taskAnswers.length,
        problem_id: t.problem_id,
      })
    }

    return [...taskMap.entries()]
      .map(([n, s]) => ({ task_number: n, ...s, rate: s.total > 0 ? s.correct / s.total : 0 }))
      .sort((a, b) => a.rate - b.rate)
  }, [tasks, answers, selectedMonth, exams])

  const top10Weak = weakTasks.slice(0, 10)

  function openDebtModal(student: Student) {
    const studentExams = debts.filter((d) => d.student.id === student.id).map((d) => d.exam)
    setDebtModal({ student, exams: studentExams })
    setCopied(false)
  }

  function copyDebtList() {
    if (!debtModal) return
    const lines = debtModal.exams.map((e) => {
      return `${getExamDebtDate(e)} ${examUrl(e.exam_id)}`
    })
    const text = `Долги ${debtModal.student.name}:\n${lines.join('\n')}`
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const selectedGroupObj = selectedGroup === 'all' ? null : groups.find((g) => g.id === selectedGroup) ?? null

  return (
    <div className="space-y-5">
      {/* Group filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex bg-slate-100 rounded-lg p-0.5 gap-0.5">
          <button
            onClick={() => { setSelectedGroup('all'); setSearchParams({}) }}
            className={`px-3.5 py-1.5 rounded-md text-[13px] font-medium transition-colors ${
              selectedGroup === 'all'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Все группы
          </button>
          {groups.map((g) => (
            <button
              key={g.id}
              onClick={() => { setSelectedGroup(g.id); setSearchParams({ group: g.id }) }}
              className={`px-3.5 py-1.5 rounded-md text-[13px] font-medium transition-colors ${
                selectedGroup === g.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {g.name}
            </button>
          ))}
        </div>

        {selectedGroupObj && (
          <button
            onClick={() => setHomeworkOpen(true)}
            className="ml-auto inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-[13px] font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            <BookOpen size={14} />
            Собрать ДЗ группе
          </button>
        )}
      </div>

      {loading ? (
        <div className="card p-10 text-center text-slate-400 text-[13px] animate-pulse">Загрузка…</div>
      ) : (
        <>
          {/* Group summary cards */}
          {groupStats.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {groupStats.map(({ group, examCount, studentCount, avgGrade, passRate }) => (
                <div key={group.id} className="card p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-[14px] font-semibold text-slate-900">{group.name}</h3>
                    <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                      <Users size={11} /> {studentCount}
                    </span>
                  </div>
                  <div className="space-y-2 text-[13px]">
                    <div className="flex justify-between text-slate-500">
                      <span>Тестов проведено</span>
                      <span className="font-semibold text-slate-800">{examCount}</span>
                    </div>
                    <div className="flex justify-between text-slate-500">
                      <span>Средняя оценка</span>
                      <span className={`font-semibold ${avgGrade >= 4 ? 'text-emerald-600' : avgGrade >= 3 ? 'text-amber-600' : 'text-rose-600'}`}>
                        {avgGrade.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-500">
                      <span>Успеваемость</span>
                      <span className="font-semibold text-slate-800">{Math.round(passRate * 100)}%</span>
                    </div>
                  </div>
                  <div className="mt-3.5 h-1 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-indigo-500 transition-all"
                      style={{ width: `${passRate * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Score trend chart */}
          <ScoreTrendChart
            results={results}
            exams={exams}
            title={selectedGroup === 'all' ? 'Динамика среднего балла (все группы)' : 'Динамика среднего балла группы'}
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Debtors */}
            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
                <AlertTriangle size={15} className="text-rose-500" />
                <span className="text-[13.5px] font-semibold text-slate-900">Должники</span>
                <span className="ml-auto text-[11px] text-slate-400">{sortedDebtors.length} студентов</span>
              </div>
              {sortedDebtors.length === 0 ? (
                <div className="p-10 text-center text-slate-400 text-[13px]">Долгов нет</div>
              ) : (
                <div className="divide-y divide-slate-50 max-h-96 overflow-y-auto">
                  {sortedDebtors.map(({ student, count }, i) => (
                    <div key={student.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors">
                      <span className="w-5 text-[12px] text-slate-400 tabular-nums shrink-0">{i + 1}</span>
                      <Link
                        to={`/student/${student.id}`}
                        className="flex-1 text-[13.5px] font-medium text-slate-900 hover:text-indigo-600 transition-colors truncate"
                      >
                        {student.name}
                      </Link>
                      <div className="flex items-center gap-2">
                        <div className="h-1 w-20 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-rose-400 rounded-full"
                            style={{ width: `${(count / maxDebtCount) * 100}%` }}
                          />
                        </div>
                        <button
                          onClick={() => openDebtModal(student)}
                          className="text-[11.5px] font-semibold text-rose-600 tabular-nums w-14 text-right hover:text-rose-700 transition-colors cursor-pointer"
                        >
                          {count} тест{count === 1 ? '' : count < 5 ? 'а' : 'ов'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Weak tasks bar chart */}
            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
                <TrendingDown size={15} className="text-amber-500" />
                <span className="text-[13.5px] font-semibold text-slate-900">Сложные задания</span>
                <span className="ml-auto text-[11px] text-slate-400">топ-10 по ошибкам</span>
              </div>
              {top10Weak.length === 0 ? (
                <div className="p-10 text-center text-slate-400 text-[13px]">Данных нет</div>
              ) : (
                <div className="px-4 py-4">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart
                      data={top10Weak}
                      layout="vertical"
                      margin={{ top: 4, right: 20, bottom: 4, left: 16 }}
                      barSize={14}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                      <XAxis
                        type="number"
                        tickFormatter={(v) => `${Math.round(v * 100)}%`}
                        tick={{ fontSize: 11, fill: '#94a3b8' }}
                        domain={[0, 1]}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="task_number"
                        tickFormatter={(v) => `Зад. ${v}`}
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        width={60}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0', boxShadow: '0 4px 12px -2px rgba(15,23,42,0.08)' }}
                        formatter={(v: number) => [`${Math.round(v * 100)}%`, 'Верно']}
                        labelFormatter={(v) => `Задание ${v}`}
                        cursor={{ fill: '#f8fafc' }}
                      />
                      <Bar dataKey="rate" radius={[0, 4, 4, 0]}>
                        {top10Weak.map((t) => (
                          <Cell key={t.task_number} fill={taskRateColor(t.rate)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* Problem links */}
          {weakTasks.filter((t) => t.rate < 0.5).length > 0 && (
            <div className="card p-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 mb-1">Слабые места</p>
              <h3 className="text-[14px] font-semibold text-slate-900 mb-3">
                Ссылки на задания с &lt;50% верных ответов
              </h3>
              <div className="flex flex-wrap gap-2">
                {weakTasks
                  .filter((t) => t.rate < 0.5)
                  .map((t) => (
                    <a
                      key={t.task_number}
                      href={problemUrl(t.problem_id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-rose-200 bg-rose-50/60 hover:bg-rose-50 text-rose-700 text-[13px] font-medium transition-colors"
                    >
                      <span className="font-semibold">Задание {t.task_number}</span>
                      <span className="text-rose-500 text-[12px]">{Math.round(t.rate * 100)}%</span>
                      <ExternalLink size={11} className="opacity-50" />
                    </a>
                  ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Debt modal */}
      {debtModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setDebtModal(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-pop w-full max-w-md mx-4 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <h3 className="text-[14px] font-semibold text-slate-900">{debtModal.student.name}</h3>
                <p className="text-[12px] text-slate-400 mt-0.5">
                  {debtModal.exams.length} незданных тест{debtModal.exams.length === 1 ? '' : debtModal.exams.length < 5 ? 'а' : 'ов'}
                </p>
              </div>
              <button
                onClick={() => setDebtModal(null)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-5 py-2 max-h-72 overflow-y-auto divide-y divide-slate-50">
              {debtModal.exams.map((exam) => (
                <div key={exam.id} className="flex items-center justify-between py-2.5 gap-3">
                  <span className="text-[13px] text-slate-700 truncate">{getExamDebtDate(exam)}</span>
                  <a
                    href={examUrl(exam.exam_id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[12px] text-indigo-600 hover:text-indigo-700 hover:underline whitespace-nowrap transition-colors"
                  >
                    Открыть →
                  </a>
                </div>
              ))}
            </div>

            <div className="px-5 py-4 border-t border-slate-100">
              <button
                onClick={copyDebtList}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-slate-50 hover:bg-slate-100 text-[13px] font-medium text-slate-700 transition-colors"
              >
                {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                {copied ? 'Скопировано!' : 'Скопировать список со ссылками'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedGroupObj && (
        <HomeworkModal
          open={homeworkOpen}
          onClose={() => setHomeworkOpen(false)}
          mode="group"
          title={`ДЗ для группы ${selectedGroupObj.name}`}
          tasks={tasks}
          answers={answers}
          printUrl={({ type, n }) => `/homework/group/${selectedGroupObj.id}?type=${type}&n=${n}`}
        />
      )}
    </div>
  )
}
