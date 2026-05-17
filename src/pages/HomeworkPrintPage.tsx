import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { format } from 'date-fns'
import { ArrowLeft, Printer } from 'lucide-react'
import {
  pb,
  type Exam,
  type ExamTask,
  type Group,
  type Student,
  type StudentAnswer,
  filterIn,
  problemUrl,
} from '../lib/pb'
import { buildHomework, type HomeworkType } from '../lib/homework'

type ContextType = 'student' | 'group'

export default function HomeworkPrintPage() {
  const { contextType, contextId } = useParams<{ contextType: ContextType; contextId: string }>()
  const [searchParams] = useSearchParams()
  const rawType = searchParams.get('type')
  const type: HomeworkType = rawType === 'topics' ? 'topics' : 'tasks'
  const n = Math.max(1, Math.min(20, parseInt(searchParams.get('n') ?? '5', 10) || 5))

  const [tasks, setTasks] = useState<ExamTask[]>([])
  const [answers, setAnswers] = useState<StudentAnswer[]>([])
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!contextId || !contextType) return

    async function load() {
      try {
        if (contextType === 'student') {
          const student = await pb.collection('students').getOne<Student>(contextId!)
          const group = await pb.collection('groups').getOne<Group>(student.group).catch(() => null)
          const groupExams = await pb.collection('exams').getFullList<Exam>({
            filter: `group="${student.group}"`,
          })
          const examIds = groupExams.map((e) => e.id)
          const [ans, ts] = await Promise.all([
            pb.collection('student_answers').getFullList<StudentAnswer>({
              filter: `student="${student.id}"`,
            }),
            examIds.length > 0
              ? pb.collection('exam_tasks').getFullList<ExamTask>({ filter: filterIn('exam', examIds) })
              : Promise.resolve([] as ExamTask[]),
          ])
          setAnswers(ans)
          setTasks(ts)
          setTitle(`Домашнее задание — ${student.name}`)
          setSubtitle(group ? group.name : '')
        } else if (contextType === 'group') {
          const group = await pb.collection('groups').getOne<Group>(contextId!)
          const groupExams = await pb.collection('exams').getFullList<Exam>({
            filter: `group="${group.id}"`,
          })
          const examIds = groupExams.map((e) => e.id)
          const students = await pb.collection('students').getFullList<Student>({
            filter: `group="${group.id}"`,
          })
          const studentIds = students.map((s) => s.id)
          const [ans, ts] = await Promise.all([
            studentIds.length > 0 && examIds.length > 0
              ? pb.collection('student_answers').getFullList<StudentAnswer>({
                filter: `${filterIn('student', studentIds)} && ${filterIn('exam', examIds)}`,
              })
              : Promise.resolve([] as StudentAnswer[]),
            examIds.length > 0
              ? pb.collection('exam_tasks').getFullList<ExamTask>({ filter: filterIn('exam', examIds) })
              : Promise.resolve([] as ExamTask[]),
          ])
          setAnswers(ans)
          setTasks(ts)
          setTitle(`Домашнее задание для группы ${group.name}`)
          setSubtitle('')
        } else {
          setNotFound(true)
        }
      } catch (e) {
        console.error(e)
        setNotFound(true)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [contextType, contextId])

  const homework = useMemo(() => {
    if (!contextType) return null
    return buildHomework({
      mode: contextType,
      type,
      title,
      tasks,
      answers,
      maxPerTopic: n,
    })
  }, [contextType, type, n, title, tasks, answers])

  if (loading) {
    return <div className="card p-8 text-center text-gray-400 animate-pulse">Загрузка…</div>
  }

  if (notFound || !homework) {
    return <div className="card p-8 text-center text-gray-500">Не найдено</div>
  }

  const totalProblems = homework.items.reduce((s, i) => s + i.problemIds.length, 0)

  return (
    <div className="space-y-6 max-w-3xl print-page">
      <div className="flex items-center gap-4 print-hidden">
        <Link to={contextType === 'student' ? `/student/${contextId}` : '/stats'} className="btn-ghost p-2">
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
          {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        <button
          className="btn-primary"
          onClick={() => {
            const prev = document.title
            const stamp = format(new Date(), 'dd.MM.yyyy')
            document.title = `ДЗ ${stamp}`
            window.print()
            window.setTimeout(() => { document.title = prev }, 1000)
          }}
        >
          <Printer size={16} />
          Печать
        </button>
      </div>

      <div className="card p-6 print-no-shadow">
        <div className="mb-5">
          <h1 className="text-xl font-bold text-gray-900">{title}</h1>
          {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
          <p className="text-xs text-gray-400 mt-2">
            Режим: {type === 'tasks' ? 'по слабым заданиям' : 'по слабым темам'} · {totalProblems} задач
            {' · '}
            {format(new Date(), 'dd.MM.yyyy')}
          </p>
        </div>

        {homework.items.length === 0 ? (
          <p className="text-sm text-gray-500">Нет подходящих заданий по выбранному фильтру.</p>
        ) : (
          <ol className="space-y-4 list-none p-0">
            {homework.items.map((item) => (
              <li key={item.taskNumber} className="break-inside-avoid">
                <p className="font-semibold text-gray-800 mb-1.5">
                  Задание {item.taskNumber}
                  <span className="ml-2 text-xs font-normal text-gray-400">
                    {Math.round(item.rate * 100)}% верных ({item.correct}/{item.attempts})
                  </span>
                </p>
                <ul className="space-y-1 ml-4">
                  {item.problemIds.map((pid) => {
                    const url = problemUrl(pid)
                    return (
                      <li key={pid} className="text-sm text-gray-700">
                        <a href={url} target="_blank" rel="noopener noreferrer" className="text-brand-700 hover:underline break-all">
                          {url}
                        </a>
                      </li>
                    )
                  })}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}
