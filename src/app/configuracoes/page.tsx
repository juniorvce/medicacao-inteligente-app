'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { requestNotificationPermission } from '@/lib/alertas'

export default function ConfiguracoesPage() {
  const [userEmail, setUserEmail] = useState('')
  const [notifStatus, setNotifStatus] = useState<string>('verificando')
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    async function load() {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }
      setUserEmail(session.user.email ?? '')

      if (typeof window !== 'undefined' && 'Notification' in window) {
        setNotifStatus(Notification.permission)
      } else {
        setNotifStatus('nao-suportado')
      }

      setLoading(false)
    }

    void load()
  }, [supabase, router])

  async function handleRequestNotif() {
    const granted = await requestNotificationPermission()
    setNotifStatus(granted ? 'granted' : 'denied')
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  function handleClearCache() {
    localStorage.clear()
    sessionStorage.clear()
    setNotifStatus((prev) => prev) // force re-render
    alert('Cache local limpo com sucesso!')
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <span className="text-gray-400 text-sm">Carregando...</span>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50 pb-10">
      <header className="bg-white shadow-sm px-4 py-4">
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <Link
            href="/dashboard"
            className="text-gray-400 hover:text-gray-600 text-xl"
          >
            ←
          </Link>
          <div>
            <h1 className="text-lg font-bold text-gray-800">⚙️ Configuracoes</h1>
            <p className="text-xs text-gray-400">Ajustes do aplicativo</p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-lg px-4 mt-5 space-y-3">
        {/* Conta */}
        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Conta
          </p>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700">Email</p>
              <p className="text-xs text-gray-400">{userEmail}</p>
            </div>
          </div>
        </div>

        {/* Notificacoes */}
        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Notificacoes
          </p>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700">
                Alertas de medicacao
              </p>
              <p className="text-xs text-gray-400">
                {notifStatus === 'granted'
                  ? 'Ativado'
                  : notifStatus === 'denied'
                  ? 'Bloqueado pelo navegador'
                  : notifStatus === 'nao-suportado'
                  ? 'Nao suportado neste navegador'
                  : 'Nao ativado'}
              </p>
            </div>
            {notifStatus !== 'granted' && notifStatus !== 'nao-suportado' && (
              <button
                onClick={handleRequestNotif}
                className="text-xs bg-brand-50 text-brand-700 px-3 py-1.5 rounded-lg font-medium hover:bg-brand-100"
              >
                Ativar
              </button>
            )}
            {notifStatus === 'granted' && (
              <span className="text-xs text-green-600 font-medium">✅ Ativo</span>
            )}
          </div>
        </div>

        {/* Dados */}
        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Dados
          </p>
          <button
            onClick={handleClearCache}
            className="w-full border border-gray-200 text-gray-500 py-2.5 rounded-xl font-medium hover:bg-gray-50 active:scale-95 transition-all text-sm"
          >
            Limpar cache local
          </button>
          <p className="text-xs text-gray-400">
            Remove dados temporarios. Seus dados na nuvem nao sao afetados.
          </p>
        </div>

        {/* App */}
        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Sobre
          </p>
          <p className="text-sm text-gray-600">
            Medicacao Inteligente v{process.env.NEXT_PUBLIC_APP_VERSION ?? '0.1.0'}
          </p>
          <p className="text-xs text-gray-400">
            Controle de medicacao para criancas e familias. Offline-first com
            sincronizacao segura.
          </p>
        </div>

        {/* Sair */}
        <button
          onClick={handleLogout}
          className="w-full border border-red-200 text-red-500 py-3 rounded-2xl font-medium hover:bg-red-50 active:scale-95 transition-all text-sm"
        >
          Sair da conta
        </button>
      </div>
    </main>
  )
}
