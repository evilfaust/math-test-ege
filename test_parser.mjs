function parseScore(val) {
    if (val == null || val === '') return { correct: null, part1: null, grade: null }
    const s = String(val).trim()
    const m = s.match(/^(\d+)(?:\((\d+)\))?\/(\d+)/)
    if (!m) return { correct: null, part1: null, grade: null }
    return {
        correct: parseInt(m[1] ?? '0'),
        part1: m[2] != null ? parseInt(m[2]) : null,
        grade: parseInt(m[3] ?? '0'),
    }
}

console.log("parseScore('13(4)/4') =", parseScore('13(4)/4'))
console.log("parseScore('11/3') =", parseScore('11/3'))

function parseExamHeader(val) {
    if (!val) return null
    const lines = val.split('\n')
    const line1 = lines[0] ?? ''
    const label = lines[1] ?? ''
    const idMatch = line1.match(/№\s*(\d+)/)
    const dateMatch = line1.match(/(\d{2}\.\d{2}\.\d{4})/)
    if (!idMatch) return null
    return {
        exam_id: idMatch[1] ?? '',
        date: dateMatch ? (dateMatch[1] ?? '') : '',
        title: line1.trim(),
        label: label.trim(),
    }
}

console.log("parseExamHeader:", parseExamHeader("Контрольная работа № 22885995, 25.02.2026\nБАЗА-10-кл-015-25.02.26"))
console.log("parseExamHeader with return:", parseExamHeader("Контрольная работа № 22885995, 25.02.2026\r\nБАЗА-10-кл-015-25.02.26"))

function parseTaskHeader(val) {
    if (!val) return null
    const m = val.match(/B\s*(\d+)\s*№\s*(\d+)/)
    if (!m) return null
    return { task_number: parseInt(m[1] ?? '0'), problem_id: m[2] ?? '' }
}

console.log("parseTaskHeader:", parseTaskHeader("B 1 № 505158"))

