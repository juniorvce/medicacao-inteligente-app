'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { queueDoseEvent, syncDoseEvents } from '@/lib/doses-sync'

interface Dose {
  id: string
  nome: string
  horario: string
  tomado: boolean
  quem?: string
  hora_tomado?: string
}

type StatusEventoDose = 'pendente' | 'tomado' | 'pulado' | 'atrasado'

interface SupaPlannedRow {
  id: string
  horario: string
  dias_semana: (number | string)[] | null
  medicamentos: {
    nome: string | null
    criancas: { nome: string | null } | null
  } | null
}

interface SupaEventRow {
  id: string
  dose_planejada_id: string | null
  status: StatusEventoDose
  hora_administrada: string | null
}

export default function DashboardPage() {
  const [doses, setDoses] = useState<Dose[]>([])
  const [loading, setLoading] = useState(true)
  const [userEmail, setUserEmail] = useState('')
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    async function init() {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }
      setUserEmail(session.user.email ?? '')

      const hoje = new Date()
      const weekday = hoje.getDay() // 0=dom ... 6=sab
      const hojeISO = hoje.toISOString().slice(0, 10)

      try {
        const [plannedRes, eventsRes] = await Promise.all([
          supabase
            .from('doses_planejadas')
            .select(
              `id, horario, dias_semana, ativo, medicamentos:medicamento_id ( nome, criancas:crianca_id ( nome ) )`,
            )
            .eq('ativo', true),
          supabase
            .from('eventos_dose')
            .select('id, dose_planejada_id, status, hora_administrada')
            .eq('data_prevista', hojeISO),
        ])

        if (plannedRes.error) throw plannedRes.error
        if (eventsRes.error) throw eventsRes.error

        const planned = (plannedRes.data ?? []) as SupaPlannedRow[]
        const events = (eventsRes.data ?? []) as SupaEventRow[]

        const eventsByDose = new Map<string, SupaEventRow>()
        events.forEach((ev) => {
          if (ev.dose_planejada_id) {
            eventsByDose.set(ev.dose_planejada_id, ev)
          }
        })

        const todaysPlanned = planned.filter((row) => {
          const dias = Array.isArray(row.dias_semana)
            ? row.dias_semana.map((n) => Number(n))
            : []
          return dias.includes(weekday)
        })

        const mapped: Dose[] = todaysPlanned.map((row) => {
          const ev = eventsByDose.get(row.id)
          const tomado = ev?.status === 'tomado'

          let horaTomado: string | undefined
          if (tomado && ev?.hora_administrada) {
            const d = new Date(ev.hora_administrada)
            if (!Number.isNaN(d.getTime())) {
              horaTomado = d.toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit',
              })
            }
          }

          const medNome = row.medicamentos?.nome ?? 'Medicacao'
          const criancaNome = row.medicamentos?.criancas?.nome ?? null
          const nome = criancaNome ? `${medNome} · ${criancaNome}` : medNome

          const horarioRaw = row.horario
          const horario =
            typeof horarioRaw === 'string' && horarioRaw.length >= 5
              ? horarioRaw.slice(0, 5)
              : horarioRaw

          return {
            id: row.id,
            nome,
            horario,
            tomado,
            quem: tomado ? 'Responsavel' : undefined,
            hora_tomado: tomado ? horaTomado : undefined,
          }
        })

        setDoses(mapped)
      } catch (error) {
        console.warn('Erro ao carregar doses do dia, exibindo lista vazia', error)
        setDoses([])
      }

      try {
        await syncDoseEvents(supabase)
      } catch (e) {
        console.warn('Falha ao sincronizar eventos locais', e)
      }

      setLoading(false)
    }

    void init()
  }, [supabase, router])

  async function marcarTomado(id: string) {
    const agora = new Date()
    const horaLabel = agora.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    })

    setDoses((prev) =>
      prev.map((d) =>
        d.id === id
          ? {
              ...d,
              tomado: true,
              quem: 'Responsavel',
              hora_tomado: horaLabel,
            }
          : d,
      ),
    )

    try {
      await queueDoseEvent({
        offlineId: crypto.randomUUID(),
        dose_planejada_id: id,
        medicamento_id: null,
        crianca_id: null,
        data_prevista: agora.toISOString().slice(0, 10),
        hora_prevista: `${String(agora.getHours()).padStart(2, '0')}:${String(
          agora.getMinutes(),
        ).padStart(2, '0')}:00`,
        status: 'tomado',
        hora_administrada: agora.toISOString(),
        observacao: null,
      })
    } catch (e) {
      console.warn('Falha ao enfileirar evento local', e)
    }
  }

  const hojeLabel = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  const total = doses.length
  const feitos = doses.filter((d) => d.tomado).length

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
          <h1 className="text-lg font-bold text-brand-700">
            💊 Medicacao Inteligente
          </h1>
          <p className="text-xs text-gray-400 capitalize">{hojeLabel}</p>
        </div>
        <div className="text-right">
          <span className="text-xs text-gray-500">{userEmail}</span>
          <div className="text-xs font-medium text-brand-600 mt-0.5">
            {feitos}/{total} concluidos
          </div>
        </div>
      </header>

      {/* Progress */}
      <div className="mx-4 mt-4">
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex justify-between text-sm mb-2">
            <span className="font-medium text-gray-700">Agenda de hoje</span>
            <span className="text-brand-600 font-semibold">
              {feitos}/{total}
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div
              className="bg-brand-500 h-2 rounded-full transition-all"
              style={{
                width: total > 0 ? `${(feitos / total) * 100}%` : '0%',
              }}
            />
          </div>
        </div>
      </div>

      {/* Lista de doses */}
      <div className="mx-4 mt-4 space-y-3">
        {doses.map((dose) => (
          <div
            key={dose.id}
            className={`bg-white rounded-xl p-4 shadow-sm border-l-4 ${
              dose.tomado ? 'border-brand-400 opacity-75' : 'border-orange-400'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="font-semibold text-gray-800">{dose.nome}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  ⏰ {dose.horario}
                </p>
                {dose.tomado && dose.quem && (
                  <p className="text-xs text-brand-600 mt-1">
                    ✅ {dose.quem} · {dose.hora_tomado}
                  </p>
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

        {doses.length === 0 && (
          <div className="bg-white rounded-xl p-4 shadow-sm text-center text-sm text-gray-500">
            Nenhuma dose planejada para hoje.
          </div>
        )}
      </div>

      {/* Navegacao */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 flex safe-bottom">
        <Link
          href="/dashboard"
          className="flex-1 py-3 text-center text-xs text-brand-600 font-medium"
        >
          🏠 Hoje
        </Link>
        <Link
          href="/criancas"
          className="flex-1 py-3 text-center text-xs text-gray-400"
        >
          👶 Criancas
        </Link>
        <Link
          href="/historico"
          className="flex-1 py-3 text-center text-xs text-gray-400"
        >
          📋 Historico
        </Link>
        <Link
          href="/diagnostico"
          className="flex-1 py-3 text-center text-xs text-gray-400"
        >
          🔍 Status
        </Link>
      </div>
    </main>
  )
}
