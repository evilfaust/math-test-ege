#!/bin/bash
# Создаёт коллекции PocketBase через API
# Требует запущенный PocketBase и email/password суперпользователя

set -e
PB_URL="${PB_URL:-http://127.0.0.1:8090}"

echo "PocketBase URL: $PB_URL"
echo -n "Email суперпользователя: "
read -r EMAIL
echo -n "Пароль: "
read -rs PASSWORD
echo ""

# Получаем токен суперпользователя
TOKEN=$(curl -s -X POST "$PB_URL/api/collections/users/auth-with-password" \
  -H "Content-Type: application/json" \
  -d "{\"identity\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" | \
  python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null)

if [ -z "$TOKEN" ]; then
  # Try superuser endpoint
  TOKEN=$(curl -s -X POST "$PB_URL/api/admins/auth-with-password" \
    -H "Content-Type: application/json" \
    -d "{\"identity\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" | \
    python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null)
fi

if [ -z "$TOKEN" ]; then
  echo "❌ Не удалось получить токен. Проверьте email/password."
  exit 1
fi

echo "✅ Аутентификация успешна"

create_collection() {
  local name="$1"
  local schema="$2"
  echo -n "Создание коллекции '$name'... "
  RESULT=$(curl -s -X POST "$PB_URL/api/collections" \
    -H "Authorization: $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$schema")
  if echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); sys.exit(0 if 'id' in d else 1)" 2>/dev/null; then
    echo "✅"
  else
    echo "⚠️  $(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('message',''))" 2>/dev/null)"
  fi
}

create_collection "groups" '{
  "name": "groups",
  "type": "base",
  "fields": [
    {"name": "name", "type": "text", "required": true}
  ]
}'

create_collection "students" '{
  "name": "students",
  "type": "base",
  "fields": [
    {"name": "name", "type": "text", "required": true},
    {"name": "group", "type": "text", "required": true}
  ]
}'

create_collection "exams" '{
  "name": "exams",
  "type": "base",
  "fields": [
    {"name": "exam_id", "type": "text", "required": true},
    {"name": "title", "type": "text"},
    {"name": "date", "type": "text"},
    {"name": "label", "type": "text"},
    {"name": "group", "type": "text", "required": true},
    {"name": "task_count", "type": "number"}
  ]
}'

create_collection "exam_tasks" '{
  "name": "exam_tasks",
  "type": "base",
  "fields": [
    {"name": "exam", "type": "text", "required": true},
    {"name": "task_number", "type": "number", "required": true},
    {"name": "problem_id", "type": "text", "required": true}
  ]
}'

create_collection "student_results" '{
  "name": "student_results",
  "type": "base",
  "fields": [
    {"name": "student", "type": "text", "required": true},
    {"name": "exam", "type": "text", "required": true},
    {"name": "correct_count", "type": "number"},
    {"name": "grade", "type": "number"},
    {"name": "part1_score", "type": "number"},
    {"name": "did_not_take", "type": "bool"}
  ]
}'

create_collection "student_answers" '{
  "name": "student_answers",
  "type": "base",
  "fields": [
    {"name": "student", "type": "text", "required": true},
    {"name": "exam", "type": "text", "required": true},
    {"name": "task_number", "type": "number", "required": true},
    {"name": "is_correct", "type": "bool"}
  ]
}'

echo ""
echo "✅ Коллекции созданы! Можно запускать приложение."
