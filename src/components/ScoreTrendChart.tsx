import { useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { TrendingUp } from 'lucide-react'
import { format, parse } from 'date-fns'
import { ru } from 'date-fns/locale'
import type { Exam, StudentResult } from '../lib/pb'

interface ScoreTrendChartProps {
  results: StudentResult[]
  exams: Exam[]
  title?: string
  emptyHint?: string
  height?: number
}

function parseExamDate(d: string): Date | null {
  try {
    return d.includes('-')
      ? parse(d, 'yyyy-MM-dd', new Date())
      : parse(d, 'dd.MM.yyyy', new Date())
  } catch {
    return null
  }
}

function fmtShort(d: string) {
  const parsed = parseExamDate(d)
  if (!parsed) return d
  return format(parsed, 'd MMM', { locale: ru })
}

export default function ScoreTrendChart({
  results,
  exams,
  title = 'Динамика среднего балла',
  emptyHint = 'Недостаточно данных для графика',
  height = 220,
}: ScoreTrendChartProps) {
  const data = useMemo(() => {
    const examById = new Map(exams.map((e) => [e.id, e]))
    const byExam = new Map<string, { sum: number; count: number }>()
    for (const r of results) {
      if (r.did_not_take) continue
      const exam = examById.get(r.exam)
      if (!exam) continue
      const cur = byExam.get(r.exam) ?? { sum: 0, count: 0 }
      cur.sum += r.grade
      cur.count += 1
      byExam.set(r.exam, cur)
    }

    return [...byExam.entries()]
      .map(([examId, { sum, count }]) => {
        const exam = examById.get(examId)!
        return {
          examId,
          date: exam.date,
          display: fmtShort(exam.date),
          avg: Math.round((sum / count) * 100) / 100,
          count,
          label: exam.label || exam.title,
        }
      })
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [results, exams])

  if (data.length < 2) {
    return (
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp size={16} className="text-brand-500" />
          <h3 className="font-semibold text-gray-800">{title}</h3>
        </div>
        <p className="text-sm text-gray-400">{emptyHint}</p>
      </div>
    )
  }

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp size={16} className="text-brand-500" />
        <h3 className="font-semibold text-gray-800">{title}</h3>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="display" stroke="#94a3b8" fontSize={12} />
          <YAxis domain={[2, 5]} ticks={[2, 3, 4, 5]} stroke="#94a3b8" fontSize={12} />
          <Tooltip
            contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
            formatter={(value: number, _name, item) => {
              const count = (item?.payload as { count?: number })?.count ?? 0
              return [`${value.toFixed(2)} (${count} оценок)`, 'Среднее']
            }}
            labelFormatter={(label, items) => {
              const p = items?.[0]?.payload as { label?: string } | undefined
              return p?.label ? `${label} · ${p.label}` : label
            }}
          />
          <ReferenceLine y={3} stroke="#fbbf24" strokeDasharray="4 4" />
          <Line
            type="monotone"
            dataKey="avg"
            stroke="#0ea5e9"
            strokeWidth={2.5}
            dot={{ r: 3, fill: '#0ea5e9' }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
