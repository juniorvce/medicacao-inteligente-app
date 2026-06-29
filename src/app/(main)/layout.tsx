'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

interface NavItem {
  path: string
  label: string
  icon: string
  emoji: string
}

const NAV_ITEMS: NavItem[] = [
  { path: '/dashboard', label: 'Início',     icon: '🏠', emoji: '🏠' },
  { path: '/medicamentos', label: 'Remédios', icon: '💊', emoji: '💊' },
  { path: '/receita',    label: 'Receita',   icon: '📷', emoji: '📷' },
  { path: '/historico',  label: 'Histórico', icon: '📋', emoji: '📋' },
  { path: '/configuracoes', label: 'Perfil', icon: '👤', emoji: '👤' },
]

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const [sessionChecked, setSessionChecked] = useState(false)
  const [userEmail, setUserEmail] = useState('')
  const router = useRouter()
  const pathname = usePathname()
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current

  useEffect(() => {
    async function checkAuth() {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session) {
        router.push('/login')
        return
      }

      setUserEmail(session.user.email ?? '')
      setSessionChecked(true)
    }

    void checkAuth()
  }, [supabase, router])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  if (!sessionChecked) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-apricot-100">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-brand-500 flex items-center justify-center shadow-coral animate-pulse">
            <span className="text-3xl">🐻</span>
          </div>
          <span className="text-terracotta-500 text-sm font-semibold">
            Carregando sua rotina de saúde...
          </span>
        </div>
      </main>
    )
  }

  return (
    <div className="min-h-screen bg-apricot-100 flex flex-col md:flex-row">
      {/* ---------------------------------------------------------------- */}
      {/* SIDEBAR (Desktop md+)                                            */}
      {/* ---------------------------------------------------------------- */}
      <aside className="hidden md:flex flex-col w-64 bg-white border-r border-apricot-200 shadow-card fixed top-0 bottom-0 left-0 z-20">
        {/* Logo */}
        <div className="p-6 border-b border-apricot-200 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-500 flex items-center justify-center shadow-coral">
            <span className="text-xl">🐻</span>
          </div>
          <div>
            <h1 className="text-base font-extrabold text-brand-600 leading-tight">MedInteligente</h1>
            <p className="text-[10px] text-terracotta-500 font-medium">Rotina Familiar</p>
          </div>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 px-3 py-5 space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname ? (pathname === item.path || pathname.startsWith(item.path + '/')) : false
            return (
              <Link
                key={item.path}
                href={item.path}
                className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl text-sm font-semibold transition-all duration-200 active:scale-[0.97] ${
                  isActive
                    ? 'bg-brand-500 text-white shadow-coral'
                    : 'text-terracotta-500 hover:bg-apricot-100 hover:text-brand-600'
                }`}
              >
                <span className="text-lg">{item.emoji}</span>
                <span>{item.label}</span>
              </Link>
            )
          })}

          {/* Crianças link */}
          <Link
            href="/criancas"
            className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl text-sm font-semibold transition-all duration-200 active:scale-[0.97] ${
              pathname === '/criancas'
                ? 'bg-brand-500 text-white shadow-coral'
                : 'text-terracotta-500 hover:bg-apricot-100 hover:text-brand-600'
            }`}
          >
            <span className="text-lg">👶</span>
            <span>Crianças</span>
          </Link>
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-apricot-200 space-y-2">
          <div className="px-3 py-2 bg-apricot-100 rounded-xl">
            <p className="text-[10px] text-terracotta-400 uppercase font-bold tracking-wider">Conta</p>
            <p className="text-xs text-terracotta-600 font-medium truncate" title={userEmail}>
              {userEmail}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold text-brand-500 hover:bg-brand-50 active:scale-[0.97] transition-all border border-brand-200"
          >
            <span>🚪</span>
            <span>Sair da conta</span>
          </button>
        </div>
      </aside>

      {/* ---------------------------------------------------------------- */}
      {/* MOBILE HEADER                                                    */}
      {/* ---------------------------------------------------------------- */}
      <header className="md:hidden flex items-center justify-between bg-brand-500 px-4 py-3.5 sticky top-0 z-20 shadow-coral">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
            <span className="text-lg">🐻</span>
          </div>
          <div>
            <h1 className="text-sm font-extrabold text-white leading-tight">MedInteligente</h1>
            <p className="text-[10px] text-white/70">Rotina Familiar</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/80 font-medium truncate max-w-[100px]">
            {userEmail.split('@')[0]}
          </span>
          <button
            onClick={handleLogout}
            className="w-8 h-8 rounded-xl bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-all active:scale-90"
            title="Sair"
          >
            🚪
          </button>
        </div>
      </header>

      {/* ---------------------------------------------------------------- */}
      {/* MAIN CONTENT                                                     */}
      {/* ---------------------------------------------------------------- */}
      <main className="flex-1 md:ml-64 pb-24 md:pb-6 flex flex-col">
        <div className="w-full max-w-lg md:max-w-3xl lg:max-w-4xl mx-auto flex-1 flex flex-col">
          {children}
        </div>
      </main>

      {/* ---------------------------------------------------------------- */}
      {/* BOTTOM NAVIGATION (Mobile)                                       */}
      {/* ---------------------------------------------------------------- */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-apricot-200 flex py-2 px-1 justify-around z-20 shadow-[0_-4px_20px_rgba(180,83,9,0.10)]">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname ? (pathname === item.path || pathname.startsWith(item.path + '/')) : false
          return (
            <Link
              key={item.path}
              href={item.path}
              className={`flex flex-col items-center justify-center py-1.5 px-2 rounded-2xl transition-all duration-200 active:scale-[0.88] flex-1 ${
                isActive
                  ? 'text-brand-500'
                  : 'text-terracotta-400 hover:text-brand-400'
              }`}
            >
              <span className={`text-xl mb-0.5 transition-transform duration-200 ${isActive ? 'scale-110' : ''}`}>
                {item.emoji}
              </span>
              <span className={`text-[10px] font-bold tracking-tight ${isActive ? 'text-brand-500' : 'text-terracotta-400'}`}>
                {item.label}
              </span>
              {isActive && (
                <span className="w-1 h-1 rounded-full bg-brand-500 mt-0.5" />
              )}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
