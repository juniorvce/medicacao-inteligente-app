'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Dose {
  id: string
  nome: string
  horario: string
  tomado: boolean
  quem?: string
  hora_tomado?: string
}

export default function DashboardPage() {
  const [doses, setDoses] = useState<Dose[]>([])
  const [loading, setLoading] = useState(true)
  const [userEmail, setUserEmail] = useState('')
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      setUserEmail(session.user.email ?? '')
      // TODO: buscar doses do Supabase + IndexedDB offline
      // Por ora usa dados mockados para validar UI
      setDoses([
        { id: '1', nome: 'Remedio Exemplo A', horario: '08:00', tomado: false },
        { id: '2', nome: 'Remedio Exemplo B', horario: '12:00', tomado: true, quem: 'Mae', hora_tomado: '12:03' },
        { id: '3', nome: 'Remedio Exemplo C', horario: '20:00', tomado: false },
      ])
      setLoading(false)
    }
    init()
  }, [])

  function marcarTomado(id: string) {
    setDoses(prev => prev.map(d =>
      d.id === id
        ? { ...d, tomado: true, quem: 'Responsavel', hora_tomado: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) }
        : d
    ))
    // TODO: salvar no IndexedDB + sincronizar Supabase
  }

  const hoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
  const total = doses.length
  const feitos = doses.filter(d => d.tomado).length

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <span className="text-gray-400 text-sm">Carregando agenda...</span>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50 pb-8">
      {/* Header */}
      <header className="bg-white shadow-sm px-4 py-4 flex items-center justify-between safe-top">
        <div>
          <h1 className="text-lg font-bold text-brand-700">💊 Medicacao Inteligente</h1>
          <p className="text-xs text-gray-400 capitalize">{hoje}</p>
        </div>
        <div className="text-right">
          <span className="text-xs text-gray-500">{userEmail}</span>
          <div className="text-xs font-medium text-brand-600 mt-0.5">{feitos}/{total} concluidos</div>
        </div>
      </header>

      {/* Progress */}
      <div className="mx-4 mt-4">
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex justify-between text-sm mb-2">
            <span className="font-medium text-gray-700">Agenda de hoje</span>
            <span className="text-brand-600 font-semibold">{feitos}/{total}</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div
              className="bg-brand-500 h-2 rounded-full transition-all"
              style={{ width: total > 0 ? `${(feitos / total) * 100}%` : '0%' }}
            />
          </div>
        </div>
      </div>

      {/* Lista de doses */}
      <div className="mx-4 mt-4 space-y-3">
        {doses.map(dose => (
          <div
            key={dose.id}
            className={`bg-white rounded-xl p-4 shadow-sm border-l-4 ${
              dose.tomado ? 'border-brand-400 opacity-75' : 'border-orange-400'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="font-semibold text-gray-800">{dose.nome}</p>
                <p className="text-xs text-gray-400 mt-0.5">⏰ {dose.horario}</p>
                {dose.tomado && dose.quem && (
                  <p className="text-xs text-brand-600 mt-1">✅ {dose.quem} · {dose.hora_tomado}</p>
                )}
              </div>
              {!dose.tomado && (
                <button
                  onClick={() => marcarTomado(dose.id)}
                  className="ml-3 bg-brand-600 text-white px-4 py-2 rounded-lg font-semibold text-sm hover:bg-brand-700 active:scale-95 transition-all"
                >
                  ✓ Tomado
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Navegacao */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 flex safe-bottom">
        <Link href="/dashboard" className="flex-1 py-3 text-center text-xs text-brand-600 font-medium">🏠 Hoje</Link>
        <Link href="/criancas" className="flex-1 py-3 text-center text-xs text-gray-400">👶 Criancas</Link>
        <Link href="/historico" className="flex-1 py-3 text-center text-xs text-gray-400">📋 Historico</Link>
        <Link href="/diagnostico" className="flex-1 py-3 text-center text-xs text-gray-400">🔍 Status</Link>
      </div>
    </main>
  )
}
