import { useState, useEffect } from 'react'
import { X, ExternalLink, CheckCircle2, XCircle } from 'lucide-react'
import { pb, type ExamTask, type StudentAnswer, type Exam, type Student, problemUrl } from '../lib/pb'

interface ModalProps {
    isOpen: boolean
    onClose: () => void
    studentId: string
    examId: string
}

export default function StudentExamModal({ isOpen, onClose, studentId, examId }: ModalProps) {
    const [tasks, setTasks] = useState<ExamTask[]>([])
    const [answers, setAnswers] = useState<Map<number, boolean>>(new Map())
    const [exam, setExam] = useState<Exam | null>(null)
    const [student, setStudent] = useState<Student | null>(null)
    const [loading, setLoading] = useState(false)

    // Prevent scroll when modal is open
    useEffect(() => {
        if (isOpen) document.body.style.overflow = 'hidden'
        else document.body.style.overflow = 'unset'
        return () => { document.body.style.overflow = 'unset' }
    }, [isOpen])

    // Fetch data when modal opens
    useEffect(() => {
        if (!isOpen || !studentId || !examId) return

        let isMounted = true
        setLoading(true)

        async function load() {
            try {
                const [examData, studentData, taskData, answerData] = await Promise.all([
                    pb.collection('exams').getOne<Exam>(examId),
                    pb.collection('students').getOne<Student>(studentId),
                    pb.collection('exam_tasks').getFullList<ExamTask>({
                        filter: `exam="${examId}"`,
                        sort: 'task_number',
                    }),
                    pb.collection('student_answers').getFullList<StudentAnswer>({
                        filter: `exam="${examId}" && student="${studentId}"`,
                    }),
                ])

                if (!isMounted) return

                setExam(examData)
                setStudent(studentData)
                setTasks(taskData)

                const ansMap = new Map<number, boolean>()
                for (const a of answerData) ansMap.set(a.task_number, a.is_correct)
                setAnswers(ansMap)
            } catch (err) {
                console.error(err)
            } finally {
                if (isMounted) setLoading(false)
            }
        }

        load()
        return () => { isMounted = false }
    }, [isOpen, studentId, examId])

    if (!isOpen) return null

    // Format date if possible
    const displayDate = exam ? (exam.label.match(/\d{2}\.\d{2}\.\d{2,4}/) ? exam.label.match(/\d{2}\.\d{2}\.\d{2,4}/)![0] : exam.date) : ''

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-fade-in">
            <div
                className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col transform transition-all animate-slide-up"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <div>
                        <h3 className="text-lg font-bold text-gray-900 leading-tight">
                            {exam?.title || 'Детализация теста'}
                        </h3>
                        {student && (
                            <p className="text-sm text-gray-500 mt-1">
                                {student.name} {displayDate && <span className="text-gray-300 mx-1">|</span>} {displayDate}
                            </p>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {loading ? (
                        <div className="flex flex-col space-y-3 animate-pulse">
                            {[...Array(5)].map((_, i) => (
                                <div key={i} className="h-12 bg-gray-100 rounded-xl w-full"></div>
                            ))}
                        </div>
                    ) : tasks.length === 0 ? (
                        <div className="text-center py-8 text-gray-400">
                            <p>Нет данных о заданиях для этого теста</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <div className="flex text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 pb-2">
                                <div className="w-16">№</div>
                                <div className="flex-1">Результат</div>
                                <div className="w-12 text-right">Сайт</div>
                            </div>

                            {tasks.map((t) => {
                                const isCorrect = answers.get(t.task_number)
                                const isMissing = isCorrect === undefined

                                return (
                                    <div
                                        key={t.id}
                                        className="flex items-center px-4 py-3 bg-gray-50/50 hover:bg-gray-50 border border-gray-100 rounded-xl transition-colors group"
                                    >
                                        <div className="w-16 font-medium text-gray-500">
                                            {t.task_number}
                                        </div>
                                        <div className="flex-1 flex items-center gap-2">
                                            {isMissing ? (
                                                <span className="text-sm text-gray-400">—</span>
                                            ) : isCorrect ? (
                                                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-emerald-50 text-emerald-700 text-sm font-medium">
                                                    <CheckCircle2 size={16} /> Верно
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-red-50 text-red-700 text-sm font-medium">
                                                    <XCircle size={16} /> Ошибка
                                                </span>
                                            )}
                                        </div>
                                        <div className="w-12 text-right">
                                            <a
                                                href={problemUrl(t.problem_id)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                title="Открыть задачу на Решу ЕГЭ"
                                                onClick={(e) => e.stopPropagation()}
                                                className="inline-flex p-2 text-gray-300 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                                            >
                                                <ExternalLink size={16} />
                                            </a>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
