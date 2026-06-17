'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type StatusEventoDose = 'pendente' | 'tomado' | 'pulado' | 'atrasado'

interface HistoricoDoseItem {
  id: string
  data_prevista: string
  hora_prevista: string
  status: StatusEventoDose
  hora_administrada: string | null
  observacao: string | null
  crianca_nome: string | null
  medicamento_nome: string | null
}

export default function HistoricoPage() {
  const [items, setItems] = useState<HistoricoDoseItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

      try {
        const { data, error } = await supabase
          .from('eventos_dose')
          .select(`
            id,
            data_prevista,
            hora_prevista,
            status,
            hora_administrada,
            observacao,
            criancas:crianca_id ( nome ),
            medicamentos:medicamento_id ( nome )
          `)
          .order('data_prevista', { ascending: false })
          .order('hora_prevista', { ascending: false })
          .limit(50)

        if (error) {
          setError(error.message)
        } else {
          const mapped: HistoricoDoseItem[] = (data ?? []).map((row: any) => ({
            id: row.id,
            data_prevista: row.data_prevista,
            hora_prevista: row.hora_prevista,
            status: row.status,
            hora_administrada: row.hora_administrada,
            observacao: row.observacao,
            crianca_nome: row.criancas?.nome ?? null,
            medicamento_nome: row.medicamentos?.nome ?? null,
          }))
          setItems(mapped)
        }
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Erro ao carregar historico'
        setError(msg)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [supabase, router])

  function formatData(data: string) {
    const d = new Date(data)
    if (Number.isNaN(d.getTime())) return data
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  }

  function formatHora(hora: string | null) {
    if (!hora) return ''
    return hora.slice(0, 5)
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <span className="text-gray-400 text-sm">Carregando historico...</span>
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
            <h1 className="text-lg font-bold text-gray-800">📋 Historico</h1>
            <p className="text-xs text-gray-400">Ultimas doses registradas</p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-lg px-4 mt-5 space-y-3">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-2xl p-3">
            {error}
          </div>
        )}

        {items.length === 0 && !error && (
          <div className="bg-white rounded-2xl p-4 shadow-sm text-center text-sm text-gray-500">
            Nenhuma dose registrada ainda.
          </div>
        )}

        {items.map((item) => (
          <div
            key={item.id}
            className="bg-white rounded-2xl p-4 shadow-sm flex items-start justify-between"
          >
            <div className="flex-1">
              <p className="font-semibold text-gray-800 text-sm">
                {item.medicamento_nome ?? 'Medicacao'}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {item.crianca_nome ?? 'Crianca'} · {formatData(item.data_prevista)}{' '}
                {formatHora(item.hora_prevista)}
              </p>
              {item.observacao && (
                <p className="text-xs text-gray-500 mt-1">{item.observacao}</p>
              )}
              {item.hora_administrada && (
                <p className="text-xs text-green-600 mt-1">
                  Tomado em{' '}
                  {new Date(item.hora_administrada).toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              )}
            </div>
            <span
              className={
                item.status === 'tomado'
                  ? 'text-green-600 text-sm font-semibold'
                  : item.status === 'pendente'
                  ? 'text-orange-500 text-sm font-semibold'
                  : 'text-gray-400 text-sm font-semibold'
              }
            >
              {item.status.toUpperCase()}
            </span>
          </div>
        ))}
      </div>
    </main>
  )
}
