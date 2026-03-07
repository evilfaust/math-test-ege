import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Command, FileText, Loader2, Search, Users } from 'lucide-react'
import { format, parse } from 'date-fns'
import { ru } from 'date-fns/locale'
import { pb, type Exam, type Group, type Student } from '../lib/pb'

function fmtDate(d: string) {
  try {
    const parsed = d.includes('-')
      ? parse(d, 'yyyy-MM-dd', new Date())
      : parse(d, 'dd.MM.yyyy', new Date())
    return format(parsed, 'd MMM', { locale: ru })
  } catch {
    return d
  }
}

type SearchState = {
  groups: Group[]
  students: Student[]
  exams: Exam[]
}

export default function GlobalSearch() {
  const navigate = useNavigate()
  const location = useLocation()
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [data, setData] = useState<SearchState>({ groups: [], students: [], exams: [] })

  const deferredQuery = useDeferredValue(query.trim().toLowerCase())

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      const activeTag = document.activeElement?.tagName
      const typingIntoField =
        activeTag === 'INPUT' ||
        activeTag === 'TEXTAREA' ||
        document.activeElement?.getAttribute('contenteditable') === 'true'

      if ((event.key === 'k' && (event.metaKey || event.ctrlKey)) || (event.key === '/' && !typingIntoField)) {
        event.preventDefault()
        setOpen(true)
        inputRef.current?.focus()
        inputRef.current?.select()
      }

      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  async function ensureLoaded() {
    if (loaded || loading) return

    setLoading(true)
    try {
      const [groups, students, exams] = await Promise.all([
        pb.collection('groups').getFullList<Group>({ sort: 'name' }),
        pb.collection('students').getFullList<Student>({ sort: 'name', expand: 'group' }),
        pb.collection('exams').getFullList<Exam>({ sort: '-date', expand: 'group' }),
      ])
      setData({ groups, students, exams })
      setLoaded(true)
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    if (!deferredQuery) {
      return {
        groups: data.groups.slice(0, 4),
        students: data.students.slice(0, 5),
        exams: data.exams.slice(0, 5),
      }
    }

    const matches = (value: string) => value.toLowerCase().includes(deferredQuery)

    return {
      groups: data.groups.filter((group) => matches(group.name)).slice(0, 4),
      students: data.students.filter((student) => matches(student.name)).slice(0, 6),
      exams: data.exams.filter((exam) => {
        const groupName = exam.expand?.group?.name ?? ''
        return matches(exam.label || exam.title) || matches(groupName) || matches(exam.exam_id)
      }).slice(0, 6),
    }
  }, [data.exams, data.groups, data.students, deferredQuery])

  const totalMatches = filtered.groups.length + filtered.students.length + filtered.exams.length

  function handleSelect(to: string) {
    setOpen(false)
    setQuery('')
    navigate(to)
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-xl">
      <label className="relative block">
        <Search
          size={16}
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          ref={inputRef}
          value={query}
          onFocus={() => {
            setOpen(true)
            void ensureLoaded()
          }}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Поиск по ученикам, группам и тестам"
          className="search-input w-full pl-11 pr-24"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 rounded-full border border-slate-200 bg-white/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
          <Command size={10} />
          K
        </span>
      </label>

      {open && (
        <div className="search-panel absolute left-0 right-0 top-[calc(100%+0.75rem)] z-30 overflow-hidden rounded-3xl border border-white/70 bg-white/95 shadow-[0_24px_80px_rgba(15,23,42,0.16)] backdrop-blur">
          <div className="border-b border-slate-100 px-4 py-3 text-xs text-slate-500">
            {deferredQuery ? 'Быстрый переход по найденным совпадениям' : 'Недавние группы, ученики и тесты'}
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-slate-500">
              <Loader2 size={16} className="animate-spin" />
              Загружаю индекс поиска…
            </div>
          ) : totalMatches === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-slate-400">
              Ничего не найдено
            </div>
          ) : (
            <div className="grid gap-1 p-2">
              <SearchSection title="Группы" icon={Users} items={filtered.groups.length}>
                {filtered.groups.map((group) => (
                  <SearchItem
                    key={group.id}
                    title={group.name}
                    subtitle="Открыть журнал группы"
                    onClick={() => handleSelect(`/journal/${group.id}`)}
                  />
                ))}
              </SearchSection>

              <SearchSection title="Ученики" icon={Users} items={filtered.students.length}>
                {filtered.students.map((student) => (
                  <SearchItem
                    key={student.id}
                    title={student.name}
                    subtitle={student.expand?.group?.name ?? 'Профиль ученика'}
                    onClick={() => handleSelect(`/student/${student.id}`)}
                  />
                ))}
              </SearchSection>

              <SearchSection title="Тесты" icon={FileText} items={filtered.exams.length}>
                {filtered.exams.map((exam) => (
                  <SearchItem
                    key={exam.id}
                    title={exam.label || exam.title}
                    subtitle={`${exam.expand?.group?.name ?? 'Без группы'} · ${fmtDate(exam.date)}`}
                    onClick={() => handleSelect(`/exam/${exam.id}`)}
                  />
                ))}
              </SearchSection>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SearchSection({
  title,
  icon: Icon,
  items,
  children,
}: {
  title: string
  icon: typeof Users
  items: number
  children: ReactNode
}) {
  if (items === 0) return null

  return (
    <section className="rounded-2xl border border-slate-100 bg-slate-50/70 p-2">
      <div className="flex items-center gap-2 px-2 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
        <Icon size={12} />
        {title}
      </div>
      <div className="grid gap-1">{children}</div>
    </section>
  )
}

function SearchItem({
  title,
  subtitle,
  onClick,
}: {
  title: string
  subtitle: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-between gap-3 rounded-2xl px-3 py-3 text-left transition-colors hover:bg-white"
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-slate-800">{title}</div>
        <div className="truncate text-xs text-slate-500">{subtitle}</div>
      </div>
      <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
        Enter
      </span>
    </button>
  )
}
