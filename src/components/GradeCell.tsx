interface GradeCellProps {
  grade?: number | null
  correct?: number | null
  didNotTake?: boolean
  className?: string
  compact?: boolean
}

export function gradeClass(grade: number | null | undefined, didNotTake?: boolean, isExempt?: boolean): string {
  if (isExempt) return 'grade-exempt text-blue-600 bg-blue-50 border border-blue-200'
  if (didNotTake || grade == null || grade === 0) return 'grade-absent'
  if (grade >= 5) return 'grade-5'
  if (grade >= 4) return 'grade-4'
  if (grade >= 3) return 'grade-3'
  return 'grade-2'
}

export default function GradeCell({ grade, correct, didNotTake, isExempt, className = '', compact }: GradeCellProps & { isExempt?: boolean }) {
  const cls = gradeClass(grade, didNotTake, isExempt)

  if (isExempt) {
    return (
      <span className={`inline-flex items-center justify-center rounded text-xs ${cls} ${compact ? 'px-1.5 py-0.5' : 'px-2 py-1'} ${className}`}>
        Зачтено
      </span>
    )
  }

  if (didNotTake || grade == null || grade === 0) {
    return (
      <span className={`inline-flex items-center justify-center rounded text-xs ${cls} ${compact ? 'px-1.5 py-0.5' : 'px-2 py-1'} ${className}`}>
        —
      </span>
    )
  }

  return (
    <span className={`inline-flex items-center justify-center rounded text-xs ${cls} ${compact ? 'px-1.5 py-0.5' : 'px-2 py-1'} ${className}`}>
      {correct != null ? `${correct}` : ''}{correct != null ? <span className="opacity-60 ml-0.5">/{grade}</span> : grade}
    </span>
  )
}
