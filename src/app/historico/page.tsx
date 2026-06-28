'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type StatusEventoDose = 'pendente' | 'tomado' | 'pulado' | 'atrasado'

type MaybeArray<T> = T | T[] | null

interface SupaNome {
  nome: string | null
}

interface SupaHistoricoRow {
  id: string
  data_prevista: string
  hora_prevista: string
  status: StatusEventoDose
  hora_administrada: string | null
  observacao: string | null
  criancas: MaybeArray<SupaNome>
  medicamentos: MaybeArray<SupaNome>
}

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

function firstOrNull<T>(value: MaybeArray<T>): T | null {
  if (Array.isArray(value)) return value.length > 0 ? value[0] : null
  return value ?? null
}

type FiltroStatus = 'todos' | StatusEventoDose

export default function HistoricoPage() {
  const [items, setItems] = useState<HistoricoDoseItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>('todos')

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
          .limit(100)

        if (error) {
          setError(error.message)
        } else {
          const rows = (data ?? []) as SupaHistoricoRow[]
          const mapped: HistoricoDoseItem[] = rows.map((row) => {
            const crianca = firstOrNull(row.criancas)
            const medicamento = firstOrNull(row.medicamentos)
            return {
              id: row.id,
              data_prevista: row.data_prevista,
              hora_prevista: row.hora_prevista,
              status: row.status,
              hora_administrada: row.hora_administrada,
              observacao: row.observacao,
              crianca_nome: crianca?.nome ?? null,
              medicamento_nome: medicamento?.nome ?? null,
            }
          })
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function formatData(data: string) {
    const d = new Date(data + 'T12:00:00')
    if (Number.isNaN(d.getTime())) return data
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  }

  function formatHora(hora: string | null) {
    if (!hora) return ''
    return hora.slice(0, 5)
  }

  const filteredItems =
    filtroStatus === 'todos'
      ? items
      : items.filter((i) => i.status === filtroStatus)

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <span className="text-gray-400 text-sm">Carregando historico...</span>
      </main>
    )
  }

  const statusOptions: { value: FiltroStatus; label: string }[] = [
    { value: 'todos', label: 'Todos' },
    { value: 'tomado', label: 'Tomado' },
    { value: 'pendente', label: 'Pendente' },
    { value: 'pulado', label: 'Pulado' },
    { value: 'atrasado', label: 'Atrasado' },
  ]

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

        {/* Filtro por status */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {statusOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFiltroStatus(opt.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all active:scale-95 ${
                filtroStatus === opt.value
                  ? 'bg-brand-600 text-white'
                  : 'bg-white text-gray-500 border border-gray-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {filteredItems.length === 0 && !error && (
          <div className="bg-white rounded-2xl p-4 shadow-sm text-center text-sm text-gray-500">
            {filtroStatus === 'todos'
              ? 'Nenhuma dose registrada ainda.'
              : `Nenhuma dose com status "${filtroStatus}".`}
          </div>
        )}

        {filteredItems.map((item) => (
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
                  ? 'text-green-600 text-xs font-semibold'
                  : item.status === 'pendente'
                  ? 'text-orange-500 text-xs font-semibold'
                  : item.status === 'pulado'
                  ? 'text-gray-400 text-xs font-semibold'
                  : 'text-red-400 text-xs font-semibold'
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
