'use client'

import { useEffect, useState, useRef } from 'react'
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

  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current
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
          err instanceof Error ? err.message : 'Erro ao carregar histórico'
        setError(msg)
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [supabase, router])

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
      <div className="flex-1 w-full flex items-center justify-center bg-apricot-100 min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <span className="text-3xl animate-bounce">📋</span>
          <span className="text-terracotta-500 text-sm font-semibold animate-pulse">Carregando histórico familiar...</span>
        </div>
      </div>
    )
  }

  const statusOptions: { value: FiltroStatus; label: string }[] = [
    { value: 'todos', label: 'Todos' },
    { value: 'tomado', label: 'Tomados' },
    { value: 'pendente', label: 'Pendentes' },
    { value: 'pulado', label: 'Pulados' },
    { value: 'atrasado', label: 'Atrasados' },
  ]

  return (
    <div className="flex-1 w-full space-y-4 px-4 py-6">
      {/* Page Header */}
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-extrabold text-terracotta-600 tracking-tight">Histórico 📋</h2>
        <p className="text-xs text-terracotta-400 font-medium">Histórico de doses e tratamentos passados</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl p-3.5 font-medium">
          ⚠️ {error}
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1.5 scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-0">
        {statusOptions.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setFiltroStatus(opt.value)}
            className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all duration-200 active:scale-95 ${
              filtroStatus === opt.value
                ? 'bg-brand-500 text-white shadow-coral'
                : 'bg-white text-terracotta-500 border border-apricot-200 hover:border-brand-300'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* List items */}
      <div className="space-y-3">
        {filteredItems.map((item) => {
          let statusBadgeClass = ''
          let statusLabel = ''

          switch (item.status) {
            case 'tomado':
              statusBadgeClass = 'bg-green-50 text-green-700 border-green-200'
              statusLabel = 'Tomado'
              break
            case 'pendente':
              statusBadgeClass = 'bg-apricot-100 text-terracotta-600 border-apricot-200'
              statusLabel = 'Pendente'
              break
            case 'pulado':
              statusBadgeClass = 'bg-gray-100 text-gray-500 border-gray-200'
              statusLabel = 'Pulado'
              break
            case 'atrasado':
              statusBadgeClass = 'bg-red-50 text-red-600 border-red-200'
              statusLabel = 'Atrasado'
              break
          }

          return (
            <div
              key={item.id}
              className="bg-white rounded-2xl p-4 shadow-card border border-apricot-200 flex items-start justify-between gap-4"
            >
              <div className="flex-1 min-w-0">
                <p className="font-extrabold text-terracotta-700 text-base truncate">
                  {item.medicamento_nome ?? 'Medicamento'}
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                  <span className="text-xs text-brand-500 bg-brand-50 px-2 py-0.5 rounded-lg font-bold">
                    👶 {item.crianca_nome ?? 'Sem Criança'}
                  </span>
                  <span className="text-xs text-terracotta-400 bg-apricot-100 px-2 py-0.5 rounded-lg font-medium">
                    📅 {formatData(item.data_prevista)} às {formatHora(item.hora_prevista)}
                  </span>
                </div>

                {item.observacao && (
                  <p className="text-xs text-terracotta-400 mt-2 bg-apricot-50 px-3 py-2 rounded-xl italic">
                    Nota: {item.observacao}
                  </p>
                )}

                {item.hora_administrada && (
                  <p className="text-xs text-green-600 font-semibold mt-2 flex items-center gap-1.5">
                    ✅ Administrado em{' '}
                    {new Date(item.hora_administrada).toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                )}
              </div>

              <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border flex-shrink-0 ${statusBadgeClass}`}>
                {statusLabel}
              </span>
            </div>
          )
        })}

        {filteredItems.length === 0 && !error && (
          <div className="bg-white rounded-2xl p-8 shadow-card border border-apricot-200 text-center flex flex-col items-center justify-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-brand-50 flex items-center justify-center">
              <span className="text-4xl">📋</span>
            </div>
            <div>
              <p className="font-bold text-terracotta-700 text-base">Nenhum registro encontrado</p>
              <p className="text-xs text-terracotta-400 mt-1">
                {filtroStatus === 'todos'
                  ? 'Nenhuma dose registrada ainda.'
                  : `Nenhuma dose com status "${filtroStatus}".`}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
