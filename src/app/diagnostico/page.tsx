'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

interface Check {
  label: string
  status: 'ok' | 'erro' | 'verificando'
  detalhe?: string
}

export default function DiagnosticoPage() {
  const [checks, setChecks] = useState<Check[]>([
    { label: 'Conexao com internet', status: 'verificando' },
    { label: 'Supabase conectado', status: 'verificando' },
    { label: 'Sessao do usuario', status: 'verificando' },
    { label: 'Service Worker', status: 'verificando' },
    { label: 'Armazenamento local (IndexedDB)', status: 'verificando' },
  ])
  const [versao] = useState(process.env.NEXT_PUBLIC_APP_VERSION ?? '0.1.0')

  function update(index: number, status: Check['status'], detalhe?: string) {
    setChecks(prev => prev.map((c, i) => i === index ? { ...c, status, detalhe } : c))
  }

  useEffect(() => {
    // 1. Internet
    update(0, navigator.onLine ? 'ok' : 'erro', navigator.onLine ? 'Online' : 'Offline')

        // 2. Supabase
    const supabase = createClient()
    
    async function checkSupabase() {
      try {
        const { error } = await supabase.from('_dummy_').select('*').limit(1)
        if (error?.message?.includes('relation') || !error) {
          update(1, 'ok', 'Conexao OK')
        } else {
          update(1, 'erro', error.message)
        }
      } catch {
        update(1, 'erro', 'Nao foi possivel conectar')
      }
    }
    checkSupabase()

    const supabase = createClient()
    supabase.from('_dummy_').select('*').limit(1)
      .then(({ error }) => {
        if (error?.message?.includes('relation') || !error) {
          update(1, 'ok', 'Conexao OK')
        } else {
          update(1, 'erro', error.message)
        }
      })
      .catch(() => update(1, 'erro', 'Nao foi possivel conectar'))

    // 3. Sessao
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        update(2, 'ok', session.user.email ?? 'Logado')
      } else {
        update(2, 'erro', 'Nenhuma sessao ativa')
      }
    })

    // 4. Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then(reg => {
        update(3, reg ? 'ok' : 'erro', reg ? 'Registrado' : 'Nao registrado')
      })
    } else {
      update(3, 'erro', 'Nao suportado')
    }

    // 5. IndexedDB
    try {
      const req = indexedDB.open('med-test', 1)
      req.onsuccess = () => { update(4, 'ok', 'Disponivel'); req.result.close() }
      req.onerror = () => update(4, 'erro', 'Nao disponivel')
    } catch {
      update(4, 'erro', 'Nao suportado')
    }
  }, [])

  function limparCache() {
    if (confirm('Limpar cache local? (nao apaga dados salvos na nuvem)')) {
      localStorage.clear()
      alert('Cache local limpo!')
    }
  }

  const iconMap = { ok: '✅', erro: '❌', verificando: '⏳' }
  const colorMap = { ok: 'text-green-600', erro: 'text-red-500', verificando: 'text-yellow-500' }

  return (
    <main className="min-h-screen bg-gray-50 pb-8">
      <header className="bg-white shadow-sm px-4 py-4 safe-top">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-gray-400 hover:text-gray-600">←</Link>
          <div>
            <h1 className="text-lg font-bold text-gray-800">🔍 Diagnostico</h1>
            <p className="text-xs text-gray-400">Versao {versao}</p>
          </div>
        </div>
      </header>

      <div className="mx-4 mt-4 space-y-3">
        {checks.map((c, i) => (
          <div key={i} className="bg-white rounded-xl p-4 shadow-sm flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-700 text-sm">{c.label}</p>
              {c.detalhe && <p className={`text-xs mt-0.5 ${colorMap[c.status]}`}>{c.detalhe}</p>}
            </div>
            <span className="text-xl">{iconMap[c.status]}</span>
          </div>
        ))}
      </div>

      <div className="mx-4 mt-6 space-y-3">
        <button
          onClick={limparCache}
          className="w-full border border-red-200 text-red-500 py-3 rounded-xl font-medium hover:bg-red-50 active:scale-95 transition-all"
        >
          🗑️ Limpar cache local
        </button>
        <Link
          href="/dashboard"
          className="block w-full bg-brand-600 text-white py-3 rounded-xl font-semibold text-center hover:bg-brand-700 active:scale-95 transition-all"
        >
          Ir para o app
        </Link>
      </div>
    </main>
  )
}
