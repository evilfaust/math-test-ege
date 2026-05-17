import { useState, useEffect, useMemo } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { pb, type Group, type Student, type Exam, type StudentResult, examUrl, filterIn } from '../lib/pb'
import GradeCell, { gradeClass } from '../components/GradeCell'
import StudentExamModal from '../components/StudentExamModal'
import { ExternalLink, ChevronDown, Users, Trophy, AlertTriangle } from 'lucide-react'
import { format, parse } from 'date-fns'
import { ru } from 'date-fns/locale'

function fmtDate(d: string) {
  try {
    const parsed = d.includes('-')
      ? parse(d, 'yyyy-MM-dd', new Date())
      : parse(d, 'dd.MM.yyyy', new Date())
    return format(parsed, 'd MMM', { locale: ru })
  } catch { return d }
}

function fmtMonth(d: string) {
  try {
    const parsed = d.includes('-')
      ? parse(d, 'yyyy-MM-dd', new Date())
      : parse(d, 'dd.MM.yyyy', new Date())
    return format(parsed, 'MMMM yyyy', { locale: ru })
  } catch { return d }
}

function getMonthKey(d: string) {
  try {
    const parsed = d.includes('-')
      ? parse(d, 'yyyy-MM-dd', new Date())
      : parse(d, 'dd.MM.yyyy', new Date())
    return format(parsed, 'yyyy-MM', { locale: ru })
  } catch { return d }
}

export default function Journal() {
  const { groupId } = useParams()
  const navigate = useNavigate()

  const [groups, setGroups] = useState<Group[]>([])
  const [activeGroup, setActiveGroup] = useState<Group | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [exams, setExams] = useState<Exam[]>([])
  const [results, setResults] = useState<Map<string, StudentResult>>(new Map())
  const [selectedCell, setSelectedCell] = useState<{ studentId: string; examId: string } | null>(null)
  const [loading, setLoading] = useState(true)

  const examsByMonth = useMemo(() => {
    const groups: Record<string, Exam[]> = {}
    const sorted = [...exams].sort((a, b) => a.date.localeCompare(b.date))
    for (const exam of sorted) {
      const key = getMonthKey(exam.date)
      if (!groups[key]) groups[key] = []
      groups[key].push(exam)
    }
    return groups
  }, [exams])

  const availableMonths = useMemo(() => {
    return Object.keys(examsByMonth).sort((a, b) => a.localeCompare(b))
  }, [examsByMonth])

  const [selectedMonth, setSelectedMonth] = useState<string>('')

  useEffect(() => {
    if (availableMonths.length > 0 && !selectedMonth) {
      setSelectedMonth(availableMonths[0]!)
    }
  }, [availableMonths, selectedMonth])

  const visibleExams = useMemo(() => {
    if (!selectedMonth) return exams
    return examsByMonth[selectedMonth] || []
  }, [selectedMonth, examsByMonth, exams])

  useEffect(() => {
    pb.collection('groups')
      .getFullList<Group>({ sort: 'name' })
      .then((gs) => {
        setGroups(gs)
        if (!groupId && gs.length > 0) {
          navigate(`/journal/${gs[0]!.id}`, { replace: true })
        }
      })
      .catch(console.error)
  }, [groupId, navigate])

  useEffect(() => {
    if (!groupId) return
    setLoading(true)
    const group = groups.find((g) => g.id === groupId) ?? null
    setActiveGroup(group)

    Promise.all([
      pb.collection('students').getFullList<Student>({ filter: `group="${groupId}"`, sort: 'name' }),
      pb.collection('exams').getFullList<Exam>({ filter: `group="${groupId}"`, sort: 'date' }),
    ])
      .then(async ([stds, exs]) => {
        setStudents(stds)
        setExams(exs)
        if (stds.length === 0 || exs.length === 0) { setLoading(false); return }

        const allResults = await pb.collection('student_results').getFullList<StudentResult>({
          filter: `${filterIn('student', stds.map((s) => s.id))} && ${filterIn('exam', exs.map((e) => e.id))}`,
        })
        const map = new Map<string, StudentResult>()
        for (const r of allResults) map.set(`${r.student}__${r.exam}`, r)
        setResults(map)
        setLoading(false)
      })
      .catch((e) => { console.error(e); setLoading(false) })
  }, [groupId, groups])

  const getResult = (studentId: string, examId: string) => results.get(`${studentId}__${examId}`)

  if (loading && groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-slate-400">
        <Users size={36} className="mb-3 opacity-30" />
        <p className="text-[15px] font-medium">Нет данных</p>
        <p className="text-[13px] mt-1">
          <Link to="/upload" className="text-indigo-600 hover:underline">Загрузите результаты тестов</Link>{' '}
          чтобы начать
        </p>
      </div>
    )
  }

  // Доска почёта и должники
  let honorStudents: Student[] = []
  let debtors: { student: Student; count: number }[] = []
  if (!loading && exams.length > 0 && students.length > 0) {
    honorStudents = students.filter((student) => {
      const res = visibleExams.map((e) => getResult(student.id, e.id))
      const hasTaken = res.some((r) => r && !r.did_not_take)
      if (!hasTaken) return false
      return !res.some((r) => r && r.did_not_take && !r.is_exempt)
    })

    const debtorMap = new Map<string, { student: Student; count: number }>()
    for (const student of students) {
      const res = visibleExams.map((e) => getResult(student.id, e.id))
      const debts = res.filter((r) => r && r.did_not_take && !r.is_exempt)
      if (debts.length > 0) debtorMap.set(student.id, { student, count: debts.length })
    }
    debtors = Array.from(debtorMap.values()).sort((a, b) => b.count - a.count)
  }

  return (
    <div className="space-y-4">
      {/* Group tabs */}
      {groups.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {groups.map((g) => (
            <Link
              key={g.id}
              to={`/journal/${g.id}`}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-[13px] font-medium whitespace-nowrap transition-colors ${
                g.id === groupId
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300'
              }`}
            >
              {g.name}
            </Link>
          ))}
        </div>
      )}

      {/* Honor board + Debtors */}
      {!loading && (honorStudents.length > 0 || debtors.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {honorStudents.length > 0 && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-md bg-emerald-100 text-emerald-700 grid place-items-center shrink-0">
                  <Trophy size={14} />
                </div>
                <h3 className="text-[14px] font-semibold text-emerald-900">Доска почёта</h3>
                <span className="text-[11px] text-emerald-700/60">{honorStudents.length} студентов</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {honorStudents.map((s) => (
                  <Link
                    key={s.id}
                    to={`/student/${s.id}`}
                    className="inline-flex items-center px-2.5 py-1 bg-white border border-emerald-200 rounded-md text-[12px] font-medium text-emerald-900 hover:border-emerald-400 transition-colors"
                  >
                    {s.name}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {debtors.length > 0 && (
            <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-md bg-rose-100 text-rose-700 grid place-items-center shrink-0">
                  <AlertTriangle size={14} />
                </div>
                <h3 className="text-[14px] font-semibold text-rose-900">Должники</h3>
                <span className="text-[11px] text-rose-700/60">{debtors.length} студентов</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {debtors.map(({ student, count }) => (
                  <Link
                    key={student.id}
                    to={`/student/${student.id}`}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-rose-200 rounded-md text-[12px] font-medium text-rose-900 hover:border-rose-400 transition-colors"
                  >
                    {student.name}
                    <span className="bg-rose-100 text-rose-700 px-1.5 rounded text-[10px] tabular-nums">{count}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Legend + Month filter */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-1.5 text-[11px]">
          {[
            { cls: 'g5', label: 'Отлично' },
            { cls: 'g4', label: 'Хорошо' },
            { cls: 'g3', label: 'Удовл.' },
            { cls: 'g2', label: 'Неуд.' },
            { cls: 'gabsent', label: 'Не сдал' },
            { cls: 'gexempt', label: 'Зачтено' },
          ].map(({ cls, label }) => (
            <span key={cls} className={`${cls} inline-flex items-center px-2 py-0.5 rounded font-medium`}>
              {label}
            </span>
          ))}
        </div>

        {availableMonths.length > 1 && (
          <div className="inline-flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            {availableMonths.map((month) => (
              <button
                key={month}
                onClick={() => setSelectedMonth(month)}
                className={`px-3 py-1.5 text-[12px] font-medium rounded-md transition-all ${
                  selectedMonth === month
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {fmtMonth(examsByMonth[month]?.[0]?.date || month)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Journal table */}
      {loading ? (
        <div className="card p-8 text-center text-slate-400 text-[13px] animate-pulse">Загрузка…</div>
      ) : students.length === 0 ? (
        <div className="card p-8 text-center text-slate-400 text-[13px]">Нет студентов в этой группе</div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-auto scrollbar-thin" style={{ maxHeight: 'calc(100vh - 340px)' }}>
            <table className="text-[13px] border-collapse">
              <thead>
                <tr className="bg-slate-50 sticky top-0 z-30">
                  {/* Sticky name column header */}
                  <th className="sticky left-0 z-40 bg-slate-50 text-left px-4 py-2.5 font-semibold text-slate-600 min-w-[200px] border-b border-slate-200 shadow-[1px_0_0_0_#e2e8f0]">
                    <div className="flex items-center gap-1">
                      Студент <ChevronDown size={12} className="text-slate-400" />
                    </div>
                  </th>
                  {visibleExams.map((exam) => (
                    <th key={exam.id} className="text-center px-2 py-2.5 font-medium min-w-[88px] border-b border-slate-200">
                      <div className="flex flex-col items-center gap-0.5">
                        <Link
                          to={`/exam/${exam.id}`}
                          className="text-[12px] font-semibold text-slate-700 hover:text-indigo-600 transition-colors"
                          title="Статистика по тесту"
                        >
                          {fmtDate(exam.date)}
                        </Link>
                        <a
                          href={examUrl(exam.exam_id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-slate-400 hover:text-indigo-500 inline-flex items-center gap-0.5"
                          title={exam.title}
                        >
                          #{exam.exam_id.slice(-4)} <ExternalLink size={9} />
                        </a>
                      </div>
                    </th>
                  ))}
                  <th className="text-center px-3 py-2.5 font-medium min-w-[64px] border-b border-slate-200">
                    <div className="flex items-center justify-center gap-1 text-slate-500 text-[12px]">
                      <ChevronDown size={12} /> Ср.
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => {
                  const studentResults = visibleExams.map((e) => getResult(student.id, e.id))
                  const taken = studentResults.filter((r) => r && !r.did_not_take)
                  const avgGrade = taken.length > 0
                    ? taken.reduce((s, r) => s + (r?.grade ?? 0), 0) / taken.length
                    : null

                  return (
                    <tr key={student.id} className="bg-white hover:bg-slate-50 border-b border-slate-100 transition-colors group">
                      {/* Sticky name cell */}
                      <td className="sticky left-0 z-10 px-4 py-2 bg-white group-hover:bg-slate-50 shadow-[1px_0_0_0_#e2e8f0]">
                        <Link
                          to={`/student/${student.id}`}
                          className="text-[13px] font-medium text-slate-800 hover:text-indigo-600 transition-colors"
                        >
                          {student.name}
                        </Link>
                      </td>

                      {visibleExams.map((exam) => {
                        const r = getResult(student.id, exam.id)
                        return (
                          <td key={exam.id} className="px-2 py-1.5 text-center">
                            {r ? (
                              <button
                                onClick={() => setSelectedCell({ studentId: student.id, examId: exam.id })}
                                className="hover:scale-[1.04] transition-transform"
                                disabled={r.did_not_take && !r.is_exempt}
                              >
                                <GradeCell
                                  grade={r.grade}
                                  correct={r.correct_count}
                                  didNotTake={r.did_not_take && !r.is_exempt}
                                  isExempt={r.is_exempt}
                                  compact
                                />
                              </button>
                            ) : (
                              <span className="text-slate-300 text-[11px]">—</span>
                            )}
                          </td>
                        )
                      })}

                      <td className="px-3 py-1.5 text-center">
                        {avgGrade != null ? (
                          <span className={`inline-flex items-center justify-center rounded px-2 py-0.5 text-[12px] font-bold ${gradeClass(Math.round(avgGrade))}`}>
                            {avgGrade.toFixed(1)}
                          </span>
                        ) : (
                          <span className="text-slate-300 text-[11px]">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          {!loading && visibleExams.length > 0 && (
            <div className="px-5 py-3 border-t border-slate-100 flex items-center gap-5 text-[12px] text-slate-500 bg-white">
              <span><strong className="text-slate-800 font-semibold">{students.length}</strong> студентов</span>
              <span>
                <strong className="text-slate-800 font-semibold">{visibleExams.length}</strong> тестов
                <span className="text-slate-400"> (из {exams.length})</span>
              </span>
              {activeGroup && (
                <span className="text-slate-400">
                  Группа: <strong className="text-slate-600 font-medium">{activeGroup.name}</strong>
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {selectedCell && (
        <StudentExamModal
          isOpen={!!selectedCell}
          onClose={() => setSelectedCell(null)}
          studentId={selectedCell.studentId}
          examId={selectedCell.examId}
        />
      )}
    </div>
  )
}
