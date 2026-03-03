/**
 * Checks PocketBase connectivity on mount.
 * Shows a setup screen if PocketBase is not running or not configured.
 */
import { useState, useEffect, type ReactNode } from 'react'
import { pb } from '../lib/pb'
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react'

type Status = 'checking' | 'ok' | 'error'

export default function SetupGuard({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('checking')
  const [error, setError] = useState('')

  async function check() {
    setStatus('checking')
    try {
      await pb.collection('groups').getList(1, 1)
      setStatus('ok')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      // If it's a 404 (collection not found) → need first-time setup via admin
      if (msg.includes('404') || msg.includes('collection')) {
        setError('Collections not created yet. Open PocketBase admin at http://127.0.0.1:8090/_/ to create them, or wait — auto-setup coming soon.')
      } else {
        setError('PocketBase не запущен. Запустите: ./pocketbase serve')
      }
      setStatus('error')
    }
  }

  useEffect(() => { check() }, [])

  if (status === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3 text-gray-500">
          <Loader2 size={32} className="animate-spin text-brand-500" />
          <p className="text-sm">Подключение к базе данных…</p>
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="card p-8 max-w-lg w-full space-y-4">
          <div className="flex items-center gap-3 text-amber-600">
            <AlertTriangle size={24} />
            <h2 className="text-lg font-semibold">Нет подключения</h2>
          </div>
          <p className="text-sm text-gray-600">{error}</p>
          <div className="bg-gray-50 rounded-lg p-4 text-xs font-mono text-gray-700 space-y-1">
            <p className="font-semibold text-gray-500">Запуск:</p>
            <p>1. Скачайте pocketbase с pocketbase.io</p>
            <p>2. Положите рядом с папкой проекта</p>
            <p>3. <span className="text-brand-600">./pocketbase serve</span></p>
            <p>4. Откройте <span className="text-brand-600">http://127.0.0.1:8090/_/</span></p>
            <p>5. Создайте аккаунт админа</p>
            <p>6. Нажмите "Пересоздать коллекции" ниже</p>
          </div>
          <button onClick={check} className="btn-primary w-full justify-center">
            <RefreshCw size={16} />
            Проверить снова
          </button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
