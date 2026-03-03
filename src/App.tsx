import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  BookOpen,
  BarChart2,
  Upload,
  GraduationCap,
} from 'lucide-react'
import Dashboard from './pages/Dashboard'
import Journal from './pages/Journal'
import StudentPage from './pages/StudentPage'
import StudentReportPage from './pages/StudentReportPage'
import ExamPage from './pages/ExamPage'
import StatsPage from './pages/StatsPage'
import UploadPage from './pages/UploadPage'
import SetupGuard from './components/SetupGuard'

function Sidebar() {
  const nav = [
    { to: '/', icon: LayoutDashboard, label: 'Обзор', end: true },
    { to: '/journal', icon: BookOpen, label: 'Журнал' },
    { to: '/stats', icon: BarChart2, label: 'Статистика' },
    { to: '/upload', icon: Upload, label: 'Загрузить' },
  ]

  return (
    <aside className="fixed inset-y-0 left-0 w-56 bg-white border-r border-gray-200 flex flex-col z-10">
      <div className="flex items-center gap-2 px-5 py-5 border-b border-gray-100">
        <GraduationCap className="text-brand-600" size={22} />
        <span className="font-bold text-gray-800 text-lg leading-tight">
          Журнал ЕГЭ
        </span>
      </div>
      <nav className="flex-1 p-3 space-y-0.5">
        {nav.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="p-4 border-t border-gray-100">
        <p className="text-xs text-gray-400">Решу ЕГЭ · Журнал</p>
      </div>
    </aside>
  )
}

function PageTitle() {
  const location = useLocation()
  const titles: Record<string, string> = {
    '/': 'Обзор',
    '/journal': 'Журнал',
    '/stats': 'Статистика',
    '/upload': 'Загрузить результаты',
  }
  const title =
    Object.entries(titles).find(([path]) =>
      path === '/'
        ? location.pathname === '/'
        : location.pathname.startsWith(path),
    )?.[1] ?? 'Журнал ЕГЭ'

  return <>{title}</>
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <SetupGuard>
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex-1 ml-56 flex flex-col min-h-screen">
            <header className="sticky top-0 z-10 bg-white border-b border-gray-200 px-8 py-4">
              <h1 className="text-xl font-semibold text-gray-800">
                <PageTitle />
              </h1>
            </header>
            <main className="flex-1 p-8">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/journal" element={<Journal />} />
                <Route path="/journal/:groupId" element={<Journal />} />
                <Route path="/student/:studentId" element={<StudentPage />} />
                <Route path="/student/:studentId/print" element={<StudentReportPage />} />
                <Route path="/exam/:examId" element={<ExamPage />} />
                <Route path="/stats" element={<StatsPage />} />
                <Route path="/upload" element={<UploadPage />} />
              </Routes>
            </main>
          </div>
        </div>
      </SetupGuard>
    </BrowserRouter>
  )
}
