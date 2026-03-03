import { useState, useRef, useCallback, type DragEvent, type ChangeEvent } from 'react'
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2, X } from 'lucide-react'
import { parseJournalWorkbook, type ParsedSheet } from '../lib/excel-parser'
import { importSheets, type ImportProgress } from '../lib/import-service'

type FileStatus = 'idle' | 'parsing' | 'importing' | 'done' | 'error'

interface FileState {
  file: File
  status: FileStatus
  error?: string
  sheets?: ParsedSheet[]
  progress?: ImportProgress
}

export default function UploadPage() {
  const [files, setFiles] = useState<FileState[]>([])
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const processFile = useCallback(async (file: File) => {
    const entry: FileState = { file, status: 'parsing' }
    setFiles((prev) => [...prev, entry])

    const update = (patch: Partial<FileState>) =>
      setFiles((prev) =>
        prev.map((f) => (f.file === file ? { ...f, ...patch } : f)),
      )

    try {
      const buffer = await file.arrayBuffer()
      const sheets = parseJournalWorkbook(buffer)

      if (sheets.length === 0) {
        update({ status: 'error', error: 'Не найдено данных. Проверьте формат файла.' })
        return
      }

      update({ status: 'importing', sheets })

      await importSheets(sheets, (p) => update({ progress: p }))

      update({ status: 'done' })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      update({ status: 'error', error: msg })
    }
  }, [])

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const dropped = Array.from(e.dataTransfer.files).filter(
        (f) => f.name.endsWith('.xlsx') || f.name.endsWith('.xls'),
      )
      dropped.forEach(processFile)
    },
    [processFile],
  )

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      Array.from(e.target.files ?? []).forEach(processFile)
      e.target.value = ''
    },
    [processFile],
  )

  const remove = (file: File) =>
    setFiles((prev) => prev.filter((f) => f.file !== file))

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`
          border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all
          ${dragging
            ? 'border-brand-500 bg-brand-50'
            : 'border-gray-300 bg-white hover:border-brand-400 hover:bg-brand-50/40'
          }
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          multiple
          className="hidden"
          onChange={handleChange}
        />
        <Upload
          size={40}
          className={`mx-auto mb-3 ${dragging ? 'text-brand-500' : 'text-gray-400'}`}
        />
        <p className="text-base font-medium text-gray-700">
          Перетащите файлы сюда или{' '}
          <span className="text-brand-600 underline-offset-2 hover:underline">
            выберите
          </span>
        </p>
        <p className="mt-1 text-sm text-gray-400">
          Экспорт из "Решу ЕГЭ" · .xlsx файлы
        </p>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-3">
          {files.map((f) => (
            <div key={f.file.name + f.file.size} className="card p-4 flex items-start gap-4">
              <FileSpreadsheet size={22} className="text-emerald-500 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{f.file.name}</p>

                {f.status === 'parsing' && (
                  <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                    <Loader2 size={12} className="animate-spin" />
                    Разбираем Excel…
                  </div>
                )}

                {f.status === 'importing' && (
                  <div className="mt-1 space-y-1">
                    <div className="flex items-center gap-2 text-xs text-brand-600">
                      <Loader2 size={12} className="animate-spin" />
                      {f.progress?.stage ?? 'Импорт…'}
                    </div>
                    {f.progress && f.progress.total > 0 && (
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-brand-500 rounded-full transition-all"
                          style={{ width: `${(f.progress.current / f.progress.total) * 100}%` }}
                        />
                      </div>
                    )}
                  </div>
                )}

                {f.status === 'done' && f.sheets && (
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    {f.sheets.map((s) => (
                      <span
                        key={s.groupName}
                        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium"
                      >
                        <CheckCircle2 size={11} />
                        {s.groupName} · {s.students.length} уч. · {s.exams.length} тестов
                      </span>
                    ))}
                  </div>
                )}

                {f.status === 'error' && (
                  <div className="flex items-start gap-2 mt-1 text-xs text-red-600">
                    <AlertCircle size={12} className="mt-0.5 shrink-0" />
                    <span>{f.error}</span>
                  </div>
                )}
              </div>

              {(f.status === 'done' || f.status === 'error') && (
                <button
                  onClick={() => remove(f.file)}
                  className="text-gray-400 hover:text-gray-600 shrink-0"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Info */}
      <div className="card p-5 bg-blue-50 border-blue-100">
        <h3 className="text-sm font-semibold text-blue-800 mb-2">Как экспортировать из Решу ЕГЭ</h3>
        <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside">
          <li>Откройте журнал на сайте решу-егэ.рф</li>
          <li>Выберите группу / класс</li>
          <li>Нажмите «Экспорт» → «Excel»</li>
          <li>Загрузите скачанный .xlsx файл сюда</li>
        </ol>
        <p className="text-xs text-blue-500 mt-3">
          Поддерживаются файлы с несколькими листами (разные группы в одном файле).
        </p>
      </div>
    </div>
  )
}
