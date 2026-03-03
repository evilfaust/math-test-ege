#!/usr/bin/env node
/**
 * Setup script for PocketBase collections
 * Runs without user input - creates admin if needed
 */

import http from 'http';

const PB_URL = 'http://127.0.0.1:8090';
const DEFAULT_EMAIL = 'admin@example.com';
const DEFAULT_PASSWORD = 'password123456';

async function request(method, pathname, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathname, PB_URL);
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers,
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, data: parsed });
        } catch {
          resolve({ status: res.statusCode, data: {} });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function checkPocketBase() {
  console.log('🔍 Checking PocketBase...');
  try {
    const res = await request('GET', '/api/health');
    if (res.status === 200) {
      console.log('✅ PocketBase is running\n');
      return true;
    }
  } catch (e) {
    console.log('❌ PocketBase is not running');
    console.log('   Run: ./pocketbase serve');
    console.log('   Then run this script again\n');
    process.exit(1);
  }
}

async function authnAdmin() {
  console.log('🔐 Authenticating as admin...');
  try {
    const res = await request('POST', '/api/collections/_superusers/auth-with-password', {
      identity: DEFAULT_EMAIL,
      password: DEFAULT_PASSWORD,
    });
    if (res.status === 200) {
      console.log('✅ Authenticated\n');
      return res.data.token;
    } else {
      throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
    }
  } catch (e) {
    console.error(`❌ Cannot authenticate: ${e.message}\n`);
    process.exit(1);
  }
}

const COLLECTIONS = [
  {
    name: 'groups',
    fields: [{ name: 'name', type: 'text', required: true }],
  },
  {
    name: 'students',
    fields: [
      { name: 'name', type: 'text', required: true },
      { name: 'group', type: 'text', required: true },
    ],
  },
  {
    name: 'exams',
    fields: [
      { name: 'exam_id', type: 'text', required: true },
      { name: 'title', type: 'text' },
      { name: 'date', type: 'text' },
      { name: 'label', type: 'text' },
      { name: 'group', type: 'text', required: true },
      { name: 'task_count', type: 'number' },
    ],
  },
  {
    name: 'exam_tasks',
    fields: [
      { name: 'exam', type: 'text', required: true },
      { name: 'task_number', type: 'number', required: true },
      { name: 'problem_id', type: 'text', required: true },
    ],
  },
  {
    name: 'student_results',
    fields: [
      { name: 'student', type: 'text', required: true },
      { name: 'exam', type: 'text', required: true },
      { name: 'correct_count', type: 'number' },
      { name: 'grade', type: 'number' },
      { name: 'part1_score', type: 'number' },
      { name: 'did_not_take', type: 'bool' },
    ],
  },
  {
    name: 'student_answers',
    fields: [
      { name: 'student', type: 'text', required: true },
      { name: 'exam', type: 'text', required: true },
      { name: 'task_number', type: 'number', required: true },
      { name: 'is_correct', type: 'bool' },
    ],
  },
];

async function createCollection(token, schema) {
  const body = {
    name: schema.name,
    type: 'base',
    fields: schema.fields,
    listRule: '',
    viewRule: '',
    createRule: '',
    updateRule: '',
    deleteRule: '',
  };

  const res = await request('POST', '/api/collections', body, token);

  if (res.status === 200) {
    console.log(`  ✅ ${schema.name}`);
  } else if (res.status === 400 && res.data.data?.name?.code === 'validation_collection_name_exists') {
    console.log(`  ⚪ ${schema.name} (already exists)`);
  } else {
    console.log(`  ❌ ${schema.name}: ${res.data.message || 'unknown error'}`);
    throw new Error(`Collection creation failed`);
  }
}

async function main() {
  console.clear();
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('   📚 Журнал ЕГЭ — PocketBase Setup');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  await checkPocketBase();

  const token = await authnAdmin();

  console.log('📦 Creating collections...\n');
  for (const schema of COLLECTIONS) {
    await createCollection(token, schema);
  }

  console.log('\n✅ Setup complete!\n');
  console.log('Next steps:');
  console.log('  1. Run: npm run dev');
  console.log('  2. Open: http://localhost:5173\n');
}

main().catch((e) => {
  console.error('\n❌ Setup failed:', e.message, '\n');
  process.exit(1);
});
