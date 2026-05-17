import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Cell } from 'recharts'
import { pb, type Exam, type Student, type StudentResult, type StudentAnswer, type ExamTask, examUrl, problemUrl } from '../lib/pb'
import GradeCell from '../components/GradeCell'
import { ExternalLink, AlertTriangle, Trash2, Loader2, CheckCircle2, Target, TrendingUp, Users } from 'lucide-react'

interface TaskAccuracy {
  task_number: number
  problem_id: string
  correct: number
  total: number
  rate: number
}

const GRADE_COLORS: Record<number, string> = { 2: '#fca5a5', 3: '#fde68a', 4: '#bef264', 5: '#6ee7b7' }
const taskRateColor = (r: number) => r >= 0.8 ? '#10b981' : r >= 0.6 ? '#84cc16' : r >= 0.4 ? '#f59e0b' : '#f43f5e'

export default function ExamPage() {
  const { examId } = useParams<{ examId: string }>()
  const navigate = useNavigate()
  const [exam, setExam] = useState<Exam | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [results, setResults] = useState<Map<string, StudentResult>>(new Map())
  const [taskAccuracy, setTaskAccuracy] = useState<TaskAccuracy[]>([])
  const [examAnswers, setExamAnswers] = useState<StudentAnswer[]>([])
  const [examTasks, setExamTasks] = useState<ExamTask[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function deleteExam() {
    if (!exam) return
    setDeleting(true)
    try {
      await pb.collection('exams').delete(exam.id)
      navigate('/journal')
    } catch (e) {
      console.error(e)
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  useEffect(() => {
    if (!examId) return
    async function load() {
      try {
        const ex = await pb.collection('exams').getOne<Exam>(examId!, { expand: 'group' })
        setExam(ex)
        const [stds, res, answers, tasks] = await Promise.all([
          pb.collection('students').getFullList<Student>({ filter: `group="${ex.group}"`, sort: 'name' }),
          pb.collection('student_results').getFullList<StudentResult>({ filter: `exam="${examId}"` }),
          pb.collection('student_answers').getFullList<StudentAnswer>({ filter: `exam="${examId}"` }),
          pb.collection('exam_tasks').getFullList<ExamTask>({ filter: `exam="${examId}"`, sort: 'task_number' }),
        ])
        setStudents(stds)
        setExamAnswers(answers)
        setExamTasks(tasks)
        const resMap = new Map<string, StudentResult>()
        for (const r of res) resMap.set(r.student, r)
        setResults(resMap)
        const accuracy: TaskAccuracy[] = tasks.map((t) => {
          const taskAnswers = answers.filter((a) => a.task_number === t.task_number)
          const correct = taskAnswers.filter((a) => a.is_correct).length
          return { task_number: t.task_number, problem_id: t.problem_id, correct, total: taskAnswers.length, rate: taskAnswers.length > 0 ? correct / taskAnswers.length : 0 }
        })
        setTaskAccuracy(accuracy)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [examId])

  if (loading) return <div className="card p-8 text-center text-slate-400 text-[14px] animate-pulse">Загрузка…</div>
  if (!exam) return <div className="card p-8 text-center text-slate-500 text-[14px]">Тест не найден</div>

  const taskProblemMap = new Map<number, string>()
  for (const t of examTasks) taskProblemMap.set(t.task_number, t.problem_id)

  const studentFailedTasks = new Map<string, { task_number: number; problem_id: string }[]>()
  for (const s of students) {
    const failed = examAnswers
      .filter((a) => a.student === s.id && !a.is_correct)
      .map((a) => ({ task_number: a.task_number, problem_id: taskProblemMap.get(a.task_number) ?? '' }))
      .filter((f) => f.problem_id)
      .sort((a, b) => a.task_number - b.task_number)
    studentFailedTasks.set(s.id, failed)
  }

  const taken = students.filter((s) => { const r = results.get(s.id); return r && !r.did_not_take })
  const notTaken = students.filter((s) => { const r = results.get(s.id); return !r || r.did_not_take })
  const gradeDist = [2, 3, 4, 5].map((g) => ({
    grade: `Оценка ${g}`, count: taken.filter((s) => results.get(s.id)?.grade === g).length, g,
  }))
  const avgScore = taken.length > 0
    ? taken.reduce((s, st) => s + (results.get(st.id)?.correct_count ?? 0), 0) / taken.length : 0
  const successRate = taken.length > 0
    ? Math.round((taken.filter((s) => (results.get(s.id)?.grade ?? 0) >= 3).length / taken.length) * 100) : 0

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Header card */}
      <div className="card p-5">
        <div className="flex items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-[22px] font-semibold text-slate-900 tracking-[-0.01em]">
                {exam.label || exam.title}
              </h2>
              <a
                href={examUrl(exam.exam_id)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[12px] font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-md transition-colors"
              >
                Открыть тест <ExternalLink size={11} />
              </a>
            </div>
            <p className="text-[12.5px] text-slate-500 mt-1.5">
              <span className="text-slate-700 font-medium">{exam.date}</span>
              <span className="mx-1.5 text-slate-300">·</span>
              {exam.task_count} заданий
              <span className="mx-1.5 text-slate-300">·</span>
              ID <span className="tabular-nums">{exam.exam_id}</span>
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {confirmDelete ? (
              <>
                <span className="text-[13px] text-rose-600">Удалить без возврата?</span>
                <button
                  onClick={() => void deleteExam()}
                  disabled={deleting}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[12.5px] font-medium transition-colors"
                >
                  {deleting && <Loader2 size={13} className="animate-spin" />}
                  Да, удалить
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="inline-flex items-center px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-[12.5px] font-medium transition-colors"
                >
                  Отмена
                </button>
              </>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 bg-white text-rose-600 hover:bg-rose-50 text-[12.5px] font-medium transition-colors"
              >
                <Trash2 size={13} /> Удалить
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Metric strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { icon: CheckCircle2, label: 'Сдали',        value: `${taken.length}`,       sub: `из ${students.length}`,   accent: 'emerald' },
          { icon: AlertTriangle, label: 'Не сдали',    value: `${notTaken.length}`,    sub: 'должники',                accent: notTaken.length > 0 ? 'rose' : 'slate' },
          { icon: Target,        label: 'Средний балл', value: avgScore.toFixed(1),    sub: `из ${exam.task_count}`,   accent: 'indigo' },
          { icon: TrendingUp,    label: 'Успеваемость', value: `${successRate}%`,      sub: 'оценка ≥ 3',              accent: 'slate' },
        ].map(({ icon: Icon, label, value, sub, accent }) => {
          const accents: Record<string, { bg: string; fg: string }> = {
            slate:   { bg: 'bg-slate-100',  fg: 'text-slate-500' },
            indigo:  { bg: 'bg-indigo-50',  fg: 'text-indigo-600' },
            emerald: { bg: 'bg-emerald-50', fg: 'text-emerald-600' },
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

      {/* Two charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <h3 className="text-[15px] font-semibold text-slate-900 mb-1">Распределение оценок</h3>
          <p className="text-[12px] text-slate-500 mb-4">По числу студентов</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={gradeDist} barSize={42} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="grade" tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} formatter={(v) => [v, 'студентов']} />
              <Bar dataKey="count" radius={[6, 6, 0, 0]} name="Студенты">
                {gradeDist.map((d) => <Cell key={d.g} fill={GRADE_COLORS[d.g] ?? '#94a3b8'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5">
          <h3 className="text-[15px] font-semibold text-slate-900 mb-1">Успешность по заданиям</h3>
          <p className="text-[12px] text-slate-500 mb-4">Процент правильных ответов</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={taskAccuracy} barSize={10} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="task_number" tick={{ fontSize: 10, fill: '#94a3b8' }} />
              <YAxis tickFormatter={(v) => `${Math.round(v * 100)}%`} tick={{ fontSize: 10, fill: '#94a3b8' }} domain={[0, 1]} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                formatter={(v: number) => [`${Math.round(v * 100)}%`, 'Верно']}
                labelFormatter={(n) => `Задание ${n}`}
              />
              <Bar dataKey="rate" radius={[3, 3, 0, 0]}>
                {taskAccuracy.map((t) => <Cell key={t.task_number} fill={taskRateColor(t.rate)} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Results table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-[15px] font-semibold text-slate-900">Результаты студентов</h3>
            <p className="text-[12px] text-slate-500">{students.length} учеников в группе</p>
          </div>
          {notTaken.length > 0 && (
            <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-amber-700 bg-amber-50 px-2.5 py-1 rounded-md">
              <AlertTriangle size={12} /> {notTaken.length} должник{notTaken.length === 1 ? '' : notTaken.length < 5 ? 'а' : 'ов'}
            </span>
          )}
        </div>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500">
              <th className="text-left px-5 py-2.5 font-semibold">Студент</th>
              <th className="text-center px-4 py-2.5 font-semibold">Оценка</th>
              <th className="text-center px-4 py-2.5 font-semibold">Правильных</th>
              <th className="text-left px-4 py-2.5 font-semibold">Ошибки</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {students.map((s) => {
              const r = results.get(s.id)
              const failed = studentFailedTasks.get(s.id) ?? []
              const didNotTake = !r || r.did_not_take
              return (
                <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-2.5">
                    <Link to={`/student/${s.id}`} className="font-medium text-slate-900 hover:text-indigo-600 transition-colors">
                      {s.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {r ? (
                      <GradeCell grade={r.grade} correct={r.correct_count} didNotTake={r.did_not_take} isExempt={r.is_exempt} />
                    ) : (
                      <span className="gabsent inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-center text-slate-600 tabular-nums">
                    {r && !r.did_not_take ? `${r.correct_count} / ${exam.task_count}` : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    {didNotTake ? (
                      <span className="text-slate-300 text-[11px]">—</span>
                    ) : failed.length === 0 ? (
                      <span className="text-emerald-600 text-[12px] font-medium">Все верно</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {failed.map((f) => (
                          <a
                            key={f.task_number}
                            href={problemUrl(f.problem_id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={`Задание ${f.task_number}`}
                            className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-md text-[11.5px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-colors"
                          >
                            {f.task_number}
                          </a>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Weak tasks */}
      {taskAccuracy.filter((t) => t.rate < 0.5).length > 0 && (
        <div className="card p-5">
          <h3 className="text-[15px] font-semibold text-slate-900 mb-1">Задания, вызвавшие затруднения</h3>
          <p className="text-[12px] text-slate-500 mb-4">&lt;50% верных ответов</p>
          <div className="flex flex-wrap gap-2">
            {taskAccuracy
              .filter((t) => t.rate < 0.5)
              .sort((a, b) => a.rate - b.rate)
              .map((t) => (
                <a
                  key={t.task_number}
                  href={problemUrl(t.problem_id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-rose-200 bg-rose-50/60 hover:bg-rose-50 text-rose-700 text-[13px] font-medium transition-colors"
                >
                  <span className="font-semibold">Задание {t.task_number}</span>
                  <span className="text-rose-500">{Math.round(t.rate * 100)}%</span>
                  <ExternalLink size={11} className="opacity-50" />
                </a>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}

