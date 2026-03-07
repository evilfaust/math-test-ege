import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { pb, type Group, type Student, type Exam, type StudentResult, type StudentAnswer, type ExamTask, examUrl, problemUrl } from '../lib/pb'
import { BookOpen, Users, FileText, AlertTriangle, Upload, ExternalLink, TrendingUp, Target, Radar } from 'lucide-react'
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
  { short: 'Вс', color: 'text-gray-400' },
  { short: 'Пн', color: 'text-blue-500' },
  { short: 'Вт', color: 'text-gray-400' },
  { short: 'Ср', color: 'text-emerald-500' },
  { short: 'Чт', color: 'text-gray-400' },
  { short: 'Пт', color: 'text-violet-500' },
  { short: 'Сб', color: 'text-gray-400' },
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

export default function Dashboard() {
  const [groupInfos, setGroupInfos] = useState<GroupInfo[]>([])
  const [recentExams, setRecentExams] = useState<Exam[]>([])
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

        if (groups.length === 0) {
          setEmpty(true)
          setLoading(false)
          return
        }

        // Quick lookup map: "studentId__examId" → result
        const resultMap = new Map<string, StudentResult>()
        for (const r of results) resultMap.set(`${r.student}__${r.exam}`, r)

        let totalDebts = 0

        const infos: GroupInfo[] = groups.map((group) => {
          const groupStudents = students.filter((s) => s.group === group.id)
          const groupExams = exams.filter((e) => e.group === group.id)

          // Avg grade from results that were actually taken
          const takenResults = results.filter(
            (r) =>
              groupStudents.some((s) => s.id === r.student) &&
              groupExams.some((e) => e.id === r.exam) &&
              !r.did_not_take,
          )
          const avgGrade =
            takenResults.length > 0
              ? takenResults.reduce((s, r) => s + r.grade, 0) / takenResults.length
              : 0

          // Proper debt: no result OR did_not_take, AND not exempt
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
        setTotalStudents(students.length)
        setTotalExams(exams.length)
        setDebtCount(totalDebts)

        const groupById = new Map(groups.map((group) => [group.id, group.name]))
        const debtors: DebtorInfo[] = students
          .map((student) => {
            const studentExams = exams.filter((exam) => exam.group === student.group)
            let studentDebtCount = 0

            for (const exam of studentExams) {
              const result = resultMap.get(`${student.id}__${exam.id}`)
              if ((!result || result.did_not_take) && !result?.is_exempt) {
                studentDebtCount++
              }
            }

            return {
              student,
              groupName: groupById.get(student.group) ?? 'Без группы',
              debtCount: studentDebtCount,
            }
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

          const current = weakTaskMap.get(answer.task_number) ?? {
            taskNumber: answer.task_number,
            problemId,
            correct: 0,
            total: 0,
            rate: 0,
          }

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
    return <div className="card p-8 text-center text-gray-400 animate-pulse">Загрузка…</div>
  }

  if (empty) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-20 h-20 bg-brand-50 rounded-2xl flex items-center justify-center mb-6">
          <BookOpen size={36} className="text-brand-500" />
        </div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Журнал пуст</h2>
        <p className="text-gray-500 max-w-sm mb-8">
          Загрузите файлы экспорта из "Решу ЕГЭ", чтобы начать отслеживать прогресс студентов.
        </p>
        <Link to="/upload" className="btn-primary text-base px-6 py-3">
          <Upload size={18} />
          Загрузить результаты
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="card p-5">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 text-brand-600 bg-brand-50">
            <BookOpen size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-900">{groupInfos.length}</p>
          <p className="text-sm text-gray-500 mt-0.5">Группы</p>
        </div>
        <div className="card p-5">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 text-emerald-600 bg-emerald-50">
            <Users size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-900">{totalStudents}</p>
          <p className="text-sm text-gray-500 mt-0.5">Студентов</p>
        </div>
        <div className="card p-5">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 text-violet-600 bg-violet-50">
            <FileText size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-900">{totalExams}</p>
          <p className="text-sm text-gray-500 mt-0.5">Тестов</p>
        </div>
        <Link to="/stats" className="card p-5 hover:border-amber-200 transition-colors block">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${debtCount > 0 ? 'text-amber-600 bg-amber-50' : 'text-gray-400 bg-gray-50'}`}>
            <AlertTriangle size={20} />
          </div>
          <p className="text-2xl font-bold text-gray-900">{debtCount}</p>
          <p className="text-sm text-gray-500 mt-0.5">Долгов</p>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Groups with stats */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h3 className="font-semibold text-gray-800">Группы</h3>
              <p className="text-xs text-slate-400">Снимок по текущему журналу</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
              {groupInfos.length}
            </span>
          </div>
          <div className="divide-y divide-gray-50">
            {groupInfos.map(({ group, studentCount, examCount, avgGrade, debtCount: gd }) => (
              <Link
                key={group.id}
                to={`/journal/${group.id}`}
                className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors"
              >
                <span className="font-medium text-gray-800 flex-1">{group.name}</span>
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <Users size={11} /> {studentCount}
                </span>
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <FileText size={11} /> {examCount}
                </span>
                {avgGrade > 0 && (
                  <span className={`text-xs font-semibold flex items-center gap-1 ${avgGrade >= 4 ? 'text-emerald-600' : avgGrade >= 3 ? 'text-amber-600' : 'text-red-600'}`}>
                    <TrendingUp size={11} /> {avgGrade.toFixed(1)}
                  </span>
                )}
                {gd > 0 && (
                  <span className="text-xs bg-red-50 text-red-500 px-2 py-0.5 rounded-full font-medium">
                    {gd} долг{gd === 1 ? '' : gd < 5 ? 'а' : 'ов'}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>

        {/* Recent exams */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-800">Последние тесты</h3>
              <p className="text-xs text-slate-400">Быстрый вход в свежие работы</p>
            </div>
            <Link to="/journal" className="text-xs text-brand-600 hover:underline">Все →</Link>
          </div>
          <div className="divide-y divide-gray-50">
            {recentExams.map((exam) => {
              const dow = getDow(exam.date)
              return (
                <div key={exam.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50">
                  <div className="flex-1 min-w-0">
                    <Link
                      to={`/exam/${exam.id}`}
                      className="text-sm font-medium text-gray-800 hover:text-brand-600 block truncate"
                    >
                      {exam.label || exam.title}
                    </Link>
                    <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1.5">
                      <span className="text-gray-400">{exam.expand?.group?.name}</span>
                      <span className="text-gray-300">·</span>
                      {dow && <span className={`font-semibold ${dow.color}`}>{dow.short}</span>}
                      <span>{fmtDate(exam.date)}</span>
                    </p>
                  </div>
                  <a
                    href={examUrl(exam.exam_id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-300 hover:text-brand-500"
                  >
                    <ExternalLink size={14} />
                  </a>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-6">
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div className="flex items-center gap-2">
              <Target size={16} className="text-red-500" />
              <div>
                <h3 className="font-semibold text-slate-800">Требует внимания</h3>
                <p className="text-xs text-slate-400">Студенты с наибольшим числом долгов</p>
              </div>
            </div>
            <Link to="/stats" className="text-xs text-brand-600 hover:underline">
              К статистике →
            </Link>
          </div>
          {topDebtors.length === 0 ? (
            <div className="px-5 py-8 text-sm text-slate-400">Сейчас нет студентов с долгами.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {topDebtors.map(({ student, groupName, debtCount: count }, index) => (
                <Link
                  key={student.id}
                  to={`/student/${student.id}`}
                  className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-slate-50"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-50 text-sm font-bold text-red-600">
                    {index + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-800">{student.name}</p>
                    <p className="text-xs text-slate-500">{groupName}</p>
                  </div>
                  <div className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-600">
                    {count} долг{count === 1 ? '' : count < 5 ? 'а' : 'ов'}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
            <Radar size={16} className="text-amber-500" />
            <div>
              <h3 className="font-semibold text-slate-800">Слабые задания</h3>
              <p className="text-xs text-slate-400">Что стоит разобрать на ближайшем занятии</p>
            </div>
          </div>
          {weakTasks.length === 0 ? (
            <div className="px-5 py-8 text-sm text-slate-400">Недостаточно данных по ответам.</div>
          ) : (
            <div className="grid gap-3 p-4">
              {weakTasks.map((task) => (
                <a
                  key={task.taskNumber}
                  href={problemUrl(task.problemId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-2xl border border-amber-100 bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-3 transition-transform hover:-translate-y-0.5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">Задание {task.taskNumber}</p>
                      <p className="text-xs text-slate-500">
                        {task.correct} из {task.total} верных попыток
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-amber-700">
                        {Math.round(task.rate * 100)}%
                      </p>
                      <p className="text-[11px] uppercase tracking-[0.16em] text-amber-500">
                        точность
                      </p>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-3">
        <Link to="/upload" className="btn-primary">
          <Upload size={16} />
          Загрузить новые результаты
        </Link>
        <Link to="/stats" className="btn-ghost border border-gray-200">
          <AlertTriangle size={16} />
          Посмотреть долги
        </Link>
      </div>
    </div>
  )
}
