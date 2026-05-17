import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { pb, type Group, type Student, type Exam, type StudentResult, type StudentAnswer, type ExamTask, examUrl, problemUrl } from '../lib/pb'
import { BookOpen, Users, FileText, AlertTriangle, Upload, ExternalLink, TrendingUp, ChevronRight } from 'lucide-react'
import ScoreTrendChart from '../components/ScoreTrendChart'
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

interface GroupInfo {
  group: Group
  studentCount: number
  examCount: number
  avgGrade: number
  debtCount: number
}

interface DebtorInfo {
  student: Student
  groupName: string
  debtCount: number
}

interface WeakTaskInfo {
  taskNumber: number
  problemId: string
  correct: number
  total: number
  rate: number
}

type AccentKey = 'indigo' | 'emerald' | 'slate' | 'rose' | 'amber'

function MetricCard({
  icon: Icon,
  label,
  value,
  sub,
  accent = 'slate',
  to,
}: {
  icon: React.ElementType
  label: string
  value: number | string
  sub: string
  accent?: AccentKey
  to?: string
}) {
  const accents: Record<AccentKey, { bg: string; fg: string }> = {
    slate:   { bg: 'bg-slate-100',   fg: 'text-slate-500' },
    indigo:  { bg: 'bg-indigo-50',   fg: 'text-indigo-600' },
    emerald: { bg: 'bg-emerald-50',  fg: 'text-emerald-600' },
    amber:   { bg: 'bg-amber-50',    fg: 'text-amber-600' },
    rose:    { bg: 'bg-rose-50',     fg: 'text-rose-600' },
  }
  const { bg, fg } = accents[accent]

  const inner = (
    <div className="card p-5 h-full">
      <div className="flex items-start justify-between">
        <p className="text-[12px] font-medium text-slate-500">{label}</p>
        <div className={`w-7 h-7 rounded-md grid place-items-center shrink-0 ${bg} ${fg}`}>
          <Icon size={14} />
        </div>
      </div>
      <p className="mt-3 text-[28px] font-semibold text-slate-900 tabular-nums tracking-[-0.02em] leading-none">
        {value}
      </p>
      <p className="mt-2 text-[12px] text-slate-500">{sub}</p>
    </div>
  )

  if (to) {
    return (
      <Link to={to} className="block hover:shadow-pop transition-shadow rounded-xl">
        {inner}
      </Link>
    )
  }
  return inner
}

export default function Dashboard() {
  const [groupInfos, setGroupInfos] = useState<GroupInfo[]>([])
  const [recentExams, setRecentExams] = useState<Exam[]>([])
  const [trendExams, setTrendExams] = useState<Exam[]>([])
  const [trendResults, setTrendResults] = useState<StudentResult[]>([])
  const [topDebtors, setTopDebtors] = useState<DebtorInfo[]>([])
  const [weakTasks, setWeakTasks] = useState<WeakTaskInfo[]>([])
  const [totalStudents, setTotalStudents] = useState(0)
  const [totalExams, setTotalExams] = useState(0)
  const [debtCount, setDebtCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [empty, setEmpty] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const [groups, exams, students, results, answers, tasks] = await Promise.all([
          pb.collection('groups').getFullList<Group>({ sort: 'name' }),
          pb.collection('exams').getFullList<Exam>({ sort: '-date', expand: 'group' }),
          pb.collection('students').getFullList<Student>(),
          pb.collection('student_results').getFullList<StudentResult>(),
          pb.collection('student_answers').getFullList<StudentAnswer>(),
          pb.collection('exam_tasks').getFullList<ExamTask>(),
        ])

        if (groups.length === 0) { setEmpty(true); setLoading(false); return }

        const resultMap = new Map<string, StudentResult>()
        for (const r of results) resultMap.set(`${r.student}__${r.exam}`, r)

        let totalDebts = 0
        const infos: GroupInfo[] = groups.map((group) => {
          const groupStudents = students.filter((s) => s.group === group.id)
          const groupExams    = exams.filter((e) => e.group === group.id)
          const takenResults  = results.filter(
            (r) =>
              groupStudents.some((s) => s.id === r.student) &&
              groupExams.some((e) => e.id === r.exam) &&
              !r.did_not_take,
          )
          const avgGrade = takenResults.length > 0
            ? takenResults.reduce((s, r) => s + r.grade, 0) / takenResults.length : 0

          let groupDebts = 0
          for (const student of groupStudents) {
            for (const exam of groupExams) {
              const r = resultMap.get(`${student.id}__${exam.id}`)
              if ((!r || r.did_not_take) && !r?.is_exempt) groupDebts++
            }
          }
          totalDebts += groupDebts
          return { group, studentCount: groupStudents.length, examCount: groupExams.length, avgGrade, debtCount: groupDebts }
        })

        setGroupInfos(infos)
        setRecentExams(exams.slice(0, 6))

        const recentTrendExams = exams.slice(0, 12)
        setTrendExams(recentTrendExams)
        const trendExamIds = new Set(recentTrendExams.map((e) => e.id))
        setTrendResults(results.filter((r) => trendExamIds.has(r.exam)))

        setTotalStudents(students.length)
        setTotalExams(exams.length)
        setDebtCount(totalDebts)

        const groupById = new Map(groups.map((g) => [g.id, g.name]))
        const debtors: DebtorInfo[] = students
          .map((student) => {
            const studentExams = exams.filter((exam) => exam.group === student.group)
            let studentDebtCount = 0
            for (const exam of studentExams) {
              const result = resultMap.get(`${student.id}__${exam.id}`)
              if ((!result || result.did_not_take) && !result?.is_exempt) studentDebtCount++
            }
            return { student, groupName: groupById.get(student.group) ?? 'Без группы', debtCount: studentDebtCount }
          })
          .filter((item) => item.debtCount > 0)
          .sort((a, b) => b.debtCount - a.debtCount || a.student.name.localeCompare(b.student.name))
          .slice(0, 5)
        setTopDebtors(debtors)

        const problemByExamTask = new Map<string, string>()
        for (const task of tasks) {
          problemByExamTask.set(`${task.exam}__${task.task_number}`, task.problem_id)
        }
        const weakTaskMap = new Map<number, WeakTaskInfo>()
        for (const answer of answers) {
          const key = `${answer.exam}__${answer.task_number}`
          const problemId = problemByExamTask.get(key)
          if (!problemId) continue
          const current = weakTaskMap.get(answer.task_number) ?? { taskNumber: answer.task_number, problemId, correct: 0, total: 0, rate: 0 }
          current.total += 1
          current.correct += answer.is_correct ? 1 : 0
          current.rate = current.total > 0 ? current.correct / current.total : 0
          weakTaskMap.set(answer.task_number, current)
        }
        setWeakTasks(
          [...weakTaskMap.values()]
            .filter((task) => task.total >= 5)
            .sort((a, b) => a.rate - b.rate || a.taskNumber - b.taskNumber)
            .slice(0, 6),
        )
      } catch (e) {
        console.error(e)
        setEmpty(true)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="card p-8 text-center text-slate-400 text-[14px] animate-pulse">Загрузка…</div>
    )
  }

  if (empty) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mb-5">
          <BookOpen size={28} className="text-indigo-500" />
        </div>
        <h2 className="text-[22px] font-semibold text-slate-900 mb-2">Журнал пуст</h2>
        <p className="text-[14px] text-slate-500 max-w-sm mb-8">
          Загрузите файлы экспорта из «Решу ЕГЭ», чтобы начать отслеживать прогресс студентов.
        </p>
        <Link to="/upload" className="btn-primary text-[14px] px-5 py-2.5">
          <Upload size={16} />
          Загрузить результаты
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricCard icon={BookOpen}       label="Группы"    value={groupInfos.length} sub="активных журналов" accent="indigo" />
        <MetricCard icon={Users}          label="Студенты"  value={totalStudents}     sub="по всем группам"   accent="emerald" />
        <MetricCard icon={FileText}       label="Тесты"     value={totalExams}        sub="всего проведено"   accent="slate" />
        <MetricCard icon={AlertTriangle}  label="Долги"     value={debtCount}         sub="нужно разобрать"   accent="rose" to="/stats" />
      </div>

      {/* Trend chart */}
      <div className="card p-5">
        <div className="mb-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Динамика</p>
          <h3 className="text-[15px] font-semibold text-slate-900 mt-0.5">Средний балл по всем группам</h3>
          <p className="text-[12px] text-slate-500">Последние 12 тестов</p>
        </div>
        <ScoreTrendChart
          results={trendResults}
          exams={trendExams}
          emptyHint="Нужно минимум два теста с оценками, чтобы построить тренд."
        />
      </div>

      {/* Groups + Recent exams */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h3 className="text-[15px] font-semibold text-slate-900">Группы</h3>
              <p className="text-[12px] text-slate-500">Снимок по текущему журналу</p>
            </div>
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 tabular-nums">
              {groupInfos.length}
            </span>
          </div>
          <div className="divide-y divide-slate-100">
            {groupInfos.map(({ group, studentCount, examCount, avgGrade, debtCount: gd }) => (
              <Link
                key={group.id}
                to={`/journal/${group.id}`}
                className="flex items-center px-5 py-3.5 hover:bg-slate-50 transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-medium text-slate-900 group-hover:text-indigo-600 transition-colors">
                    {group.name}
                  </p>
                  <p className="text-[12px] text-slate-500 mt-0.5 flex items-center gap-3">
                    <span className="inline-flex items-center gap-1"><Users size={11} /> {studentCount}</span>
                    <span className="inline-flex items-center gap-1"><FileText size={11} /> {examCount}</span>
                    {avgGrade > 0 && (
                      <span className={`inline-flex items-center gap-1 font-semibold ${avgGrade >= 4 ? 'text-emerald-600' : avgGrade >= 3 ? 'text-amber-600' : 'text-rose-600'}`}>
                        <TrendingUp size={11} /> {avgGrade.toFixed(1)}
                      </span>
                    )}
                  </p>
                </div>
                {gd > 0 && (
                  <div className="text-right">
                    <p className="text-[13px] font-semibold text-rose-600 tabular-nums">{gd}</p>
                    <p className="text-[10px] uppercase tracking-wider text-slate-400">долгов</p>
                  </div>
                )}
              </Link>
            ))}
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h3 className="text-[15px] font-semibold text-slate-900">Последние тесты</h3>
              <p className="text-[12px] text-slate-500">Быстрый вход в свежие работы</p>
            </div>
            <Link to="/journal" className="text-[12px] font-medium text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-0.5">
              Все <ChevronRight size={13} />
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {recentExams.map((exam) => {
              const dow = getDow(exam.date)
              return (
                <div key={exam.id} className="flex items-center px-5 py-3 hover:bg-slate-50 transition-colors group">
                  <div className="flex-1 min-w-0">
                    <Link to={`/exam/${exam.id}`} className="text-[13.5px] font-medium text-slate-900 group-hover:text-indigo-600 transition-colors block truncate">
                      {exam.label || exam.title}
                    </Link>
                    <p className="text-[12px] text-slate-500 mt-0.5 flex items-center gap-1.5">
                      <span className="text-slate-400">{exam.expand?.group?.name}</span>
                      {exam.expand?.group?.name && <span className="text-slate-200">·</span>}
                      {dow && <span className={`font-semibold ${dow.color}`}>{dow.short}</span>}
                      <span>{fmtDate(exam.date)}</span>
                    </p>
                  </div>
                  <a
                    href={examUrl(exam.exam_id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-slate-300 hover:text-indigo-500 transition-colors p-1"
                  >
                    <ExternalLink size={13} />
                  </a>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Top debtors + Weak tasks */}
      <div className="grid grid-cols-1 xl:grid-cols-[1.3fr_0.7fr] gap-4">
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Требует внимания</p>
              <h3 className="text-[15px] font-semibold text-slate-900 mt-0.5">Топ должников</h3>
              <p className="text-[12px] text-slate-500">Студенты с наибольшим числом пропусков</p>
            </div>
            <Link to="/stats" className="text-[12px] font-medium text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-0.5 shrink-0">
              К статистике <ChevronRight size={13} />
            </Link>
          </div>
          {topDebtors.length === 0 ? (
            <div className="px-5 py-8 text-[13px] text-slate-400">Сейчас нет студентов с долгами.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {topDebtors.map(({ student, groupName, debtCount: count }, index) => (
                <Link
                  key={student.id}
                  to={`/student/${student.id}`}
                  className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors"
                >
                  <div className="w-6 h-6 grid place-items-center rounded-md bg-slate-100 text-slate-500 text-[11px] font-semibold tabular-nums shrink-0">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13.5px] font-medium text-slate-900 truncate">{student.name}</p>
                    <p className="text-[11px] text-slate-500">{groupName}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-1 w-20 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-rose-400 rounded-full" style={{ width: `${Math.min((count / 30) * 100, 100)}%` }} />
                    </div>
                    <span className="text-[12px] font-semibold text-rose-600 tabular-nums w-14 text-right">
                      {count} долг{count === 1 ? '' : count < 5 ? 'а' : 'ов'}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="card overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Слабые задания</p>
            <h3 className="text-[15px] font-semibold text-slate-900 mt-0.5">Что разобрать</h3>
            <p className="text-[12px] text-slate-500">Меньше 60% верных ответов</p>
          </div>
          {weakTasks.length === 0 ? (
            <div className="px-5 py-8 text-[13px] text-slate-400">Недостаточно данных по ответам.</div>
          ) : (
            <div className="p-3 space-y-1">
              {weakTasks.map((task) => (
                <a
                  key={task.taskNumber}
                  href={problemUrl(task.problemId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 grid place-items-center rounded-md bg-amber-50 text-amber-700 font-semibold text-[12px] tabular-nums shrink-0">
                      {task.taskNumber}
                    </div>
                    <div>
                      <p className="text-[13px] font-medium text-slate-900">Задание {task.taskNumber}</p>
                      <p className="text-[11px] text-slate-500">{task.correct} из {task.total} верных</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-[15px] font-semibold tabular-nums ${task.rate < 0.4 ? 'text-rose-600' : task.rate < 0.6 ? 'text-amber-600' : 'text-slate-700'}`}>
                      {Math.round(task.rate * 100)}%
                    </p>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-3">
        <Link to="/upload" className="btn-primary text-[13.5px] px-4 py-2.5">
          <Upload size={15} />
          Загрузить новые результаты
        </Link>
        <Link to="/stats" className="btn-ghost border border-slate-200 text-[13.5px] px-4 py-2.5">
          <AlertTriangle size={15} />
          Посмотреть долги
        </Link>
      </div>
    </div>
  )
}

