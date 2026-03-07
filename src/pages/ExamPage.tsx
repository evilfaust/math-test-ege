import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Cell } from 'recharts'
import { pb, type Exam, type Student, type StudentResult, type StudentAnswer, type ExamTask, examUrl, problemUrl } from '../lib/pb'
import GradeCell from '../components/GradeCell'
import { ExternalLink, ArrowLeft, AlertTriangle } from 'lucide-react'

interface TaskAccuracy {
  task_number: number
  problem_id: string
  correct: number
  total: number
  rate: number
}

export default function ExamPage() {
  const { examId } = useParams<{ examId: string }>()
  const [exam, setExam] = useState<Exam | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [results, setResults] = useState<Map<string, StudentResult>>(new Map())
  const [taskAccuracy, setTaskAccuracy] = useState<TaskAccuracy[]>([])
  const [examAnswers, setExamAnswers] = useState<StudentAnswer[]>([])
  const [examTasks, setExamTasks] = useState<ExamTask[]>([])
  const [loading, setLoading] = useState(true)

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

        // Task accuracy
        const accuracy: TaskAccuracy[] = tasks.map((t) => {
          const taskAnswers = answers.filter((a) => a.task_number === t.task_number)
          const correct = taskAnswers.filter((a) => a.is_correct).length
          return {
            task_number: t.task_number,
            problem_id: t.problem_id,
            correct,
            total: taskAnswers.length,
            rate: taskAnswers.length > 0 ? correct / taskAnswers.length : 0,
          }
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

  if (loading) return <div className="card p-8 text-center text-gray-400 animate-pulse">Загрузка…</div>
  if (!exam) return <div className="card p-8 text-center text-gray-500">Тест не найден</div>

  // task_number → problem_id lookup
  const taskProblemMap = new Map<number, string>()
  for (const t of examTasks) taskProblemMap.set(t.task_number, t.problem_id)

  // studentId → failed tasks sorted by number
  const studentFailedTasks = new Map<string, { task_number: number; problem_id: string }[]>()
  for (const s of students) {
    const failed = examAnswers
      .filter((a) => a.student === s.id && !a.is_correct)
      .map((a) => ({ task_number: a.task_number, problem_id: taskProblemMap.get(a.task_number) ?? '' }))
      .filter((f) => f.problem_id)
      .sort((a, b) => a.task_number - b.task_number)
    studentFailedTasks.set(s.id, failed)
  }

  const taken = students.filter((s) => {
    const r = results.get(s.id)
    return r && !r.did_not_take
  })
  const notTaken = students.filter((s) => {
    const r = results.get(s.id)
    return !r || r.did_not_take
  })

  const gradeDist = [2, 3, 4, 5].map((g) => ({
    grade: `Оценка ${g}`,
    count: taken.filter((s) => results.get(s.id)?.grade === g).length,
    g,
  }))

  const avgScore =
    taken.length > 0
      ? taken.reduce((s, st) => s + (results.get(st.id)?.correct_count ?? 0), 0) / taken.length
      : 0

  const gradeColors: Record<number, string> = { 2: '#fca5a5', 3: '#fde68a', 4: '#bef264', 5: '#6ee7b7' }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link to="/journal" className="btn-ghost p-2 mt-1">
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-2xl font-bold text-gray-900">{exam.label || exam.title}</h2>
            <a
              href={examUrl(exam.exam_id)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-800 bg-brand-50 px-2 py-1 rounded"
            >
              Открыть тест <ExternalLink size={11} />
            </a>
          </div>
          <p className="text-sm text-gray-500 mt-0.5">
            {exam.date} · {exam.task_count} заданий · ID {exam.exam_id}
          </p>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Сдали', value: taken.length, sub: `из ${students.length}` },
          { label: 'Не сдали', value: notTaken.length, sub: 'должники', red: notTaken.length > 0 },
          { label: 'Средний балл', value: avgScore.toFixed(1), sub: `из ${exam.task_count}` },
          { label: 'Успеваемость', value: `${taken.length > 0 ? Math.round((taken.filter((s) => (results.get(s.id)?.grade ?? 0) >= 3).length / taken.length) * 100) : 0}%`, sub: 'оценка ≥ 3' },
        ].map(({ label, value, sub, red }) => (
          <div key={label} className="card p-4">
            <p className="text-xs text-gray-500">{label}</p>
            <p className={`text-2xl font-bold mt-0.5 ${red ? 'text-red-600' : 'text-gray-900'}`}>{value}</p>
            <p className="text-xs text-gray-400">{sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Grade distribution */}
        <div className="card p-5">
          <h3 className="font-semibold text-gray-800 mb-4">Распределение оценок</h3>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={gradeDist} barSize={40}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="grade" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v) => [v, 'студентов']} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {gradeDist.map((d) => (
                  <Cell key={d.g} fill={gradeColors[d.g] ?? '#94a3b8'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Task accuracy chart */}
        <div className="card p-5">
          <h3 className="font-semibold text-gray-800 mb-4">Успешность по заданиям</h3>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={taskAccuracy} barSize={12}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="task_number" tick={{ fontSize: 10 }} label={{ value: '№', position: 'insideRight', offset: -5, fontSize: 10 }} />
              <YAxis tickFormatter={(v) => `${Math.round(v * 100)}%`} tick={{ fontSize: 10 }} domain={[0, 1]} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
                formatter={(v: number) => [`${Math.round(v * 100)}%`, 'Верно']}
                labelFormatter={(n) => `Задание ${n}`}
              />
              <Bar dataKey="rate" radius={[3, 3, 0, 0]}>
                {taskAccuracy.map((t) => (
                  <Cell
                    key={t.task_number}
                    fill={t.rate >= 0.8 ? '#6ee7b7' : t.rate >= 0.6 ? '#bef264' : t.rate >= 0.4 ? '#fde68a' : '#fca5a5'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Student results table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">Результаты студентов</h3>
          {notTaken.length > 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 px-3 py-1 rounded-full">
              <AlertTriangle size={12} />
              {notTaken.length} должников
            </span>
          )}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left px-4 py-3 font-medium text-gray-600">Студент</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Оценка</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Правильных</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Ошибки</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => {
              const r = results.get(s.id)
              const failed = studentFailedTasks.get(s.id) ?? []
              const didNotTake = !r || r.did_not_take
              return (
                <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link to={`/student/${s.id}`} className="font-medium text-gray-800 hover:text-brand-600">
                      {s.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {r ? (
                      <GradeCell grade={r.grade} correct={r.correct_count} didNotTake={r.did_not_take} />
                    ) : (
                      <span className="grade-absent px-2 py-0.5 rounded text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-600">
                    {r && !r.did_not_take ? `${r.correct_count} / ${exam.task_count}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {didNotTake ? (
                      <span className="text-gray-300 text-xs">—</span>
                    ) : failed.length === 0 ? (
                      <span className="text-emerald-500 text-xs font-medium">Все верно</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {failed.map((f) => (
                          <a
                            key={f.task_number}
                            href={problemUrl(f.problem_id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={`Задание ${f.task_number} (задача ${f.problem_id})`}
                            className="inline-flex items-center justify-center w-6 h-6 rounded text-xs font-semibold bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-800 transition-colors"
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

      {/* Problem links for weak tasks */}
      {taskAccuracy.filter((t) => t.rate < 0.5).length > 0 && (
        <div className="card p-5">
          <h3 className="font-semibold text-gray-800 mb-3">
            Задания, вызвавшие затруднения
            <span className="ml-2 text-xs font-normal text-gray-400">(&lt;50% верных ответов)</span>
          </h3>
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
                  className="inline-flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm hover:bg-red-100 transition-colors group"
                >
                  <span className="font-bold">Задание {t.task_number}</span>
                  <span className="text-red-400">{Math.round(t.rate * 100)}%</span>
                  <ExternalLink size={11} className="opacity-50 group-hover:opacity-100" />
                </a>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
