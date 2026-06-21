"use client"

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type Medicamento = {
  nome: string
  dose: string | number | null
  unidade: string | null
  frequencia: string | null
  duracao: string | null
  observacao: string | null
}

export default function ReceitaPage() {
  const supabase = createClient()
  const router = useRouter()

  const [sessionChecked, setSessionChecked] = useState(false)
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [medicamentos, setMedicamentos] = useState<Medicamento[] | null>(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!mounted) return
      if (!session) {
        router.push('/login')
        return
      }
      setSessionChecked(true)
    })()

    return () => {
      mounted = false
    }
  }, [supabase, router])

  async function handleAnalyze() {
    setError(null)
    setMedicamentos(null)

    const trimmed = text.trim()
    if (!trimmed) {
      setError('Cole o texto da receita primeiro.')
      return
    }

    setLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke<{
        medicamentos: Medicamento[]
      }>('parse-prescription', {
        body: { text: trimmed },
      })

      if (error) {
        setError(error.message ?? 'Erro ao chamar a funcao')
        return
      }

      if (!data || !Array.isArray(data.medicamentos)) {
        setError('Resposta invalida da funcao')
        return
      }

      setMedicamentos(data.medicamentos)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  if (!sessionChecked) {
    return null
  }

  return (
    <main className="min-h-screen bg-gray-50 pb-16">
      <header className="bg-white shadow-sm px-4 py-4 safe-top">
        <h1 className="text-lg font-bold text-brand-700">🧾 Ler receita com IA</h1>
        <p className="text-xs text-gray-400 mt-1">
          Cole o texto livre da receita e clique em analisar.
        </p>
      </header>

      <div className="mx-4 mt-4">
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <label className="text-xs text-gray-600">Texto da receita</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full h-40 mt-2 p-2 border rounded-md text-sm"
            placeholder="Ex: Amoxicilina 250mg de 8 em 8 horas por 7 dias"
          />

          <div className="flex items-center mt-3 gap-2">
            <button
              onClick={handleAnalyze}
              disabled={loading || text.trim().length === 0}
              className="bg-brand-600 text-white px-4 py-2 rounded-lg font-semibold text-sm disabled:opacity-50"
            >
              {loading ? 'Analisando...' : 'Analisar receita'}
            </button>
            <button
              onClick={() => {
                setText('')
                setMedicamentos(null)
                setError(null)
              }}
              className="bg-gray-100 px-3 py-2 rounded-lg text-sm"
            >
              Limpar
            </button>
          </div>

          {error && <div className="mt-3 text-sm text-red-500">{error}</div>}

          {medicamentos && (
            <div className="mt-4">
              <h2 className="text-sm font-medium text-gray-700 mb-2">Medicamentos</h2>
              <div className="space-y-2">
                {medicamentos.map((m, idx) => (
                  <div key={idx} className="bg-gray-50 p-3 rounded-md border">
                    <div className="text-sm font-semibold">{m.nome}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      Dose: {String(m.dose ?? '—')} {m.unidade ?? ''}
                    </div>
                    <div className="text-xs text-gray-500">
                      Frequência: {m.frequencia ?? '—'}
                    </div>
                    <div className="text-xs text-gray-500">
                      Duração: {m.duracao ?? '—'}
                    </div>
                    {m.observacao && (
                      <div className="text-xs text-gray-500 mt-1">
                        Obs: {m.observacao}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 flex safe-bottom">
        <a href="/dashboard" className="flex-1 py-3 text-center text-xs text-gray-400">
          🏠 Voltar
        </a>
        <a href="/criancas" className="flex-1 py-3 text-center text-xs text-gray-400">
          👶 Criancas
        </a>
        <a href="/historico" className="flex-1 py-3 text-center text-xs text-gray-400">
          📋 Historico
        </a>
        <a href="/diagnostico" className="flex-1 py-3 text-center text-xs text-gray-400">
          🔍 Status
        </a>
      </div>
    </main>
  )
}
