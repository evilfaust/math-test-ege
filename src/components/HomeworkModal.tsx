import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { X, Copy, Check, Printer, ExternalLink } from 'lucide-react'
import type { ExamTask, StudentAnswer } from '../lib/pb'
import { problemUrl } from '../lib/pb'
import {
  buildHomework,
  homeworkToHtml,
  homeworkToPlainText,
  type HomeworkMode,
  type HomeworkType,
} from '../lib/homework'

interface HomeworkModalProps {
  open: boolean
  onClose: () => void
  mode: HomeworkMode
  title: string
  tasks: ExamTask[]
  answers: StudentAnswer[]
  printUrl: (params: { type: HomeworkType; n: number }) => string
}

const TYPE_OPTIONS: { key: HomeworkType; label: string; hint: string }[] = [
  { key: 'tasks', label: 'По слабым заданиям', hint: 'Конкретные задачи, которые проваливались' },
  { key: 'topics', label: 'По слабым темам', hint: 'Подборка по номерам с низким % верных' },
]

const SIZE_OPTIONS = [3, 5, 8, 10]

export default function HomeworkModal({
  open,
  onClose,
  mode,
  title,
  tasks,
  answers,
  printUrl,
}: HomeworkModalProps) {
  const [type, setType] = useState<HomeworkType>('tasks')
  const [maxPerTopic, setMaxPerTopic] = useState(5)
  const [copied, setCopied] = useState(false)

  const homework = useMemo(
    () =>
      buildHomework({
        mode,
        type,
        title,
        tasks,
        answers,
        maxPerTopic,
      }),
    [mode, type, title, tasks, answers, maxPerTopic],
  )

  if (!open) return null

  function handleCopy() {
    const plain = homeworkToPlainText(homework)
    const html = homeworkToHtml(homework)
    const finish = () => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
    if (typeof ClipboardItem !== 'undefined') {
      navigator.clipboard
        .write([
          new ClipboardItem({
            'text/plain': new Blob([plain], { type: 'text/plain' }),
            'text/html': new Blob([html], { type: 'text/html' }),
          }),
        ])
        .then(finish)
        .catch(() => {
          navigator.clipboard.writeText(plain).then(finish)
        })
      return
    }
    navigator.clipboard.writeText(plain).then(finish)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-semibold text-gray-800">Сборка ДЗ</h3>
            <p className="text-xs text-gray-400 mt-0.5">{title}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 border-b border-gray-100">
          <div className="flex flex-wrap gap-2">
            {TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setType(opt.key)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                  type === opt.key
                    ? 'bg-brand-600 text-white'
                    : 'bg-white border border-gray-200 text-gray-600 hover:border-brand-300'
                }`}
                title={opt.hint}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-gray-500">Задач на тему:</span>
            <div className="flex gap-1.5">
              {SIZE_OPTIONS.map((n) => (
                <button
                  key={n}
                  onClick={() => setMaxPerTopic(n)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                    maxPerTopic === n
                      ? 'bg-gray-900 text-white'
                      : 'bg-gray-50 border border-gray-200 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {homework.items.length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">
              Нет подходящих заданий по выбранному фильтру.
            </p>
          ) : (
            <div className="space-y-4">
              {homework.items.map((item) => (
                <div key={item.taskNumber} className="rounded-xl border border-gray-100 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-gray-800">Задание {item.taskNumber}</p>
                    <span className="text-xs text-gray-400">
                      {Math.round(item.rate * 100)}% · {item.correct}/{item.attempts}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {item.problemIds.map((pid) => (
                      <a
                        key={pid}
                        href={problemUrl(pid)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-brand-50 border border-brand-200 text-brand-700 rounded-md hover:bg-brand-100"
                      >
                        #{pid}
                        <ExternalLink size={10} />
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-gray-100 bg-gray-50">
          <p className="text-xs text-gray-400">
            {homework.items.length > 0
              ? `${homework.items.reduce((s, i) => s + i.problemIds.length, 0)} задач в подборке`
              : 'Пусто'}
          </p>
          <div className="flex items-center gap-2">
            <Link
              to={printUrl({ type, n: maxPerTopic })}
              target="_blank"
              className="btn-ghost border border-gray-200"
              onClick={onClose}
            >
              <Printer size={15} />
              Печать
            </Link>
            <button
              onClick={handleCopy}
              disabled={homework.items.length === 0}
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {copied ? <Check size={15} /> : <Copy size={15} />}
              {copied ? 'Скопировано' : 'Скопировать'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
