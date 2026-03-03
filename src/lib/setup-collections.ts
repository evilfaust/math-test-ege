/**
 * Creates PocketBase collections on first run.
 * Safe to call on every startup — skips existing collections.
 */
import { pb } from './pb'

const COLLECTIONS = [
  {
    name: 'groups',
    type: 'base',
    fields: [
      { name: 'name', type: 'text', required: true },
    ],
  },
  {
    name: 'students',
    type: 'base',
    fields: [
      { name: 'name', type: 'text', required: true },
      { name: 'group', type: 'relation', required: true, options: { collectionId: '', cascadeDelete: false, maxSelect: 1, minSelect: 1 } },
    ],
  },
  {
    name: 'exams',
    type: 'base',
    fields: [
      { name: 'exam_id', type: 'text', required: true },
      { name: 'title', type: 'text', required: false },
      { name: 'date', type: 'text', required: false },
      { name: 'label', type: 'text', required: false },
      { name: 'group', type: 'relation', required: true, options: { collectionId: '', cascadeDelete: false, maxSelect: 1, minSelect: 1 } },
      { name: 'task_count', type: 'number', required: false },
    ],
  },
  {
    name: 'exam_tasks',
    type: 'base',
    fields: [
      { name: 'exam', type: 'relation', required: true, options: { collectionId: '', cascadeDelete: true, maxSelect: 1, minSelect: 1 } },
      { name: 'task_number', type: 'number', required: true },
      { name: 'problem_id', type: 'text', required: true },
    ],
  },
  {
    name: 'student_results',
    type: 'base',
    fields: [
      { name: 'student', type: 'relation', required: true, options: { collectionId: '', cascadeDelete: true, maxSelect: 1, minSelect: 1 } },
      { name: 'exam', type: 'relation', required: true, options: { collectionId: '', cascadeDelete: true, maxSelect: 1, minSelect: 1 } },
      { name: 'correct_count', type: 'number', required: false },
      { name: 'grade', type: 'number', required: false },
      { name: 'part1_score', type: 'number', required: false },
      { name: 'did_not_take', type: 'bool', required: false },
    ],
  },
  {
    name: 'student_answers',
    type: 'base',
    fields: [
      { name: 'student', type: 'relation', required: true, options: { collectionId: '', cascadeDelete: true, maxSelect: 1, minSelect: 1 } },
      { name: 'exam', type: 'relation', required: true, options: { collectionId: '', cascadeDelete: true, maxSelect: 1, minSelect: 1 } },
      { name: 'task_number', type: 'number', required: true },
      { name: 'is_correct', type: 'bool', required: false },
    ],
  },
]

export async function ensureCollections() {
  // Check if collections already exist by trying to list groups
  try {
    await pb.collection('groups').getList(1, 1)
    return // already set up
  } catch {
    // Collections don't exist yet — need admin setup
    console.log('Collections not found, attempting setup...')
  }

  // Try to authenticate as superuser (first-run setup)
  const adminEmail = localStorage.getItem('pb_admin_email')
  const adminPassword = localStorage.getItem('pb_admin_password')
  if (adminEmail && adminPassword) {
    try {
      await (pb as unknown as { admins: { authWithPassword: (e: string, p: string) => Promise<unknown> } }).admins.authWithPassword(adminEmail, adminPassword)
    } catch {
      console.error('Failed to authenticate as admin')
    }
  }
}

export { COLLECTIONS }
