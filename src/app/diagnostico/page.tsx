'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

interface Check {
  label: string
  status: 'ok' | 'erro' | 'verificando'
  detalhe?: string
}

export default function DiagnosticoPage() {
  const versao = process.env.NEXT_PUBLIC_APP_VERSION ?? '0.1.0'

  const [checks, setChecks] = useState<Check[]>([
    { label: 'Conexao com internet',          status: 'verificando' },
    { label: 'Supabase conectado',             status: 'verificando' },
    { label: 'Sessao do usuario',              status: 'verificando' },
    { label: 'Service Worker',                 status: 'verificando' },
    { label: 'Armazenamento local (IndexedDB)', status: 'verificando' },
  ])

  function update(index: number, status: Check['status'], detalhe?: string) {
    setChecks(prev =>
      prev.map((c, i) => (i === index ? { ...c, status, detalhe } : c))
    )
  }

  useEffect(() => {
    // 1. Internet
    update(0,
      navigator.onLine ? 'ok' : 'erro',
      navigator.onLine ? 'Online' : 'Offline'
    )

    // 2. Supabase + 3. Sessao — UMA única instancia
    const supabase = createClient()

    async function runChecks() {
      // 2. Conexao
      try {
        const { error } = await supabase
          .from('_dummy_')
          .select('*')
          .limit(1)
        if (!error || error.message.includes('relation')) {
          update(1, 'ok', 'Conexao OK')
        } else {
          update(1, 'erro', error.message)
        }
      } catch {
        update(1, 'erro', 'Nao foi possivel conectar')
      }

      // 3. Sessao
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          update(2, 'ok', session.user.email ?? 'Logado')
        } else {
          update(2, 'erro', 'Nenhuma sessao ativa')
        }
      } catch {
        update(2, 'erro', 'Erro ao verificar sessao')
      }
    }

    runChecks()

    // 4. Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .getRegistration()
        .then(reg =>
          update(3, reg ? 'ok' : 'erro', reg ? 'Registrado' : 'Nao registrado')
        )
        .catch(() => update(3, 'erro', 'Erro ao verificar SW'))
    } else {
      update(3, 'erro', 'Nao suportado neste navegador')
    }

    // 5. IndexedDB
    try {
      const req = indexedDB.open('med-diag-test', 1)
      req.onsuccess = () => {
        update(4, 'ok', 'Disponivel')
        req.result.close()
        indexedDB.deleteDatabase('med-diag-test')
      }
      req.onerror = () => update(4, 'erro', 'Nao disponivel')
    } catch {
      update(4, 'erro', 'Nao suportado')
    }
  }, [])

  function limparCache() {
    if (confirm('Limpar cache local? (dados na nuvem nao serao apagados)')) {
      localStorage.clear()
      sessionStorage.clear()
      alert('Cache local limpo com sucesso!')
    }
  }

  const iconMap  = { ok: '✅', erro: '❌', verificando: '⏳' }
  const colorMap = {
    ok:          'text-green-600',
    erro:        'text-red-500',
    verificando: 'text-yellow-500',
  }

  return (
    <main className="min-h-screen bg-gray-50 pb-10">
      <header className="bg-white shadow-sm px-4 py-4">
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <Link href="/" className="text-gray-400 hover:text-gray-600 text-lg">←</Link>
          <div>
            <h1 className="text-lg font-bold text-gray-800">🔍 Diagnostico do App</h1>
            <p className="text-xs text-gray-400">Versao {versao}</p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-lg px-4 mt-5 space-y-3">
        {checks.map((c, i) => (
          <div key={i} className="bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-700 text-sm">{c.label}</p>
              {c.detalhe && (
                <p className={`text-xs mt-0.5 ${colorMap[c.status]}`}>
                  {c.detalhe}
                </p>
              )}
            </div>
            <span className="text-2xl">{iconMap[c.status]}</span>
          </div>
        ))}
      </div>

      <div className="mx-auto max-w-lg px-4 mt-6 space-y-3">
        <button
          onClick={limparCache}
          className="w-full border border-red-200 text-red-500 py-3 rounded-2xl font-medium hover:bg-red-50 active:scale-95 transition-all text-sm"
        >
          🗑️ Limpar cache local
        </button>
        <Link
          href="/dashboard"
          className="block w-full bg-blue-600 text-white py-3 rounded-2xl font-semibold text-center hover:bg-blue-700 active:scale-95 transition-all text-sm"
        >
          Ir para o Dashboard →
        </Link>
      </div>
    </main>
  )
}
