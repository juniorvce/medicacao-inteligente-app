'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { queueDoseEvent, syncDoseEvents } from '@/lib/doses-sync'
import { ensureFamiliaAndPerfil } from '@/lib/onboarding'
import { playAlertSound, requestNotificationPermission, showBrowserNotification, unlockAudio } from '@/lib/alertas'

interface Dose {
  id: string
  nome: string
  horario: string
  tomado: boolean
  quem?: string
  hora_tomado?: string
  medicamentoId: string | null
  criancaId: string | null
}

type StatusEventoDose = 'pendente' | 'tomado' | 'pulado' | 'atrasado'

// --- Supabase helper types to handle nested select that may return object, array or null ---
type MaybeArray<T> = T | T[] | null

interface SupaCrianca {
  id: string
  nome: string | null
}

interface SupaMedicamento {
  id: string
  nome: string | null
  criancas: MaybeArray<SupaCrianca>
}

interface SupaPlannedRow {
  id: string
  horario: string
  dias_semana: (number | string)[] | null
  data_inicio: string | null
  data_fim: string | null
  medicamentos: MaybeArray<SupaMedicamento>
}

interface SupaEventRow {
  id: string
  dose_planejada_id: string | null
  status: StatusEventoDose
  hora_administrada: string | null
}

function firstOrNull<T>(value: MaybeArray<T>): T | null {
  if (Array.isArray(value)) return value.length > 0 ? value[0] : null
  return value ?? null
}

export default function DashboardPage() {
  const supabase = createClient()

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const user = session.user

      await ensureFamiliaAndPerfil(supabase, user.id, user.email)

      const hoje = new Date()
      const weekday = hoje.getDay()
      const hojeISO = hoje.toISOString().slice(0, 10)

      try {
        const [plannedRes, eventsRes] = await Promise.all([
          supabase
            .from('doses_planejadas')
            .select(
              `id, horario, dias_semana, ativo, data_inicio, data_fim,
               medicamentos:medicamento_id (
                 id,
                 nome,
                 criancas:crianca_id ( id, nome )
               )`,
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
          if (!dias.includes(weekday)) return false
          // Filtro de data: respeita data_inicio e data_fim de receitas dinamicas
          if (row.data_inicio && row.data_inicio > hojeISO) return false
          if (row.data_fim && row.data_fim < hojeISO) return false
          return true
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

          // normalize medicamento / crianca that can come as object, array or null
          const med = firstOrNull(row.medicamentos)
          const crianca = firstOrNull(med?.criancas ?? null)

          const medNome = med?.nome ?? 'Medicacao'
          const criancaNome = crianca?.nome ?? null
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
            medicamentoId: med?.id ?? null,
            criancaId: crianca?.id ?? null,
          }
        })

        // Play alert sound and show notification for pending doses that match current time
        const nowMinutes = `${String(hoje.getHours()).padStart(2, '0')}:${String(hoje.getMinutes()).padStart(2, '0')}`

        mapped.forEach((d) => {
          if (!d.tomado && d.horario === nowMinutes) {
            // Try playing sound and showing notification; failures are silent inside those helpers
            playAlertSound()
            showBrowserNotification(d.nome)
          }
        })

        // set state in client after processing
        // (we keep a minimal state for this simplified page)

      } catch (error) {
        console.warn('Erro ao carregar doses do dia', error)
      }

      try {
        await syncDoseEvents(supabase)
      } catch (e) {
        console.warn('Falha ao sincronizar eventos locais', e)
      }
    }

    // Unlock audio on first user interaction
    const onFirstInteraction = () => {
      unlockAudio()
      void requestNotificationPermission()
      window.removeEventListener('click', onFirstInteraction)
      window.removeEventListener('touchend', onFirstInteraction)
    }

    window.addEventListener('click', onFirstInteraction)
    window.addEventListener('touchend', onFirstInteraction)

    void init()

    return () => {
      window.removeEventListener('click', onFirstInteraction)
      window.removeEventListener('touchend', onFirstInteraction)
    }
  }, [supabase])

  return (
    <main className="min-h-screen bg-gray-50 pb-8">
      <header className="bg-white shadow-sm px-4 py-4 flex items-center justify-between safe-top">
        <div>
          <h1 className="text-lg font-bold text-brand-700">💊 Medicacao Inteligente</h1>
          <p className="text-xs text-gray-400 capitalize">Hoje</p>
        </div>
        <div className="text-right">
          <span className="text-xs text-gray-500">usuario@exemplo</span>
          <div className="text-xs font-medium text-brand-600 mt-0.5">0/0 concluidos</div>
        </div>
      </header>

      <div className="mx-4 mt-4 space-y-3">
        <div className="bg-white rounded-xl p-4 shadow-sm text-center text-sm text-gray-500">
          Carregando agenda e alertas...
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 flex safe-bottom">
        <Link href="/dashboard" className="flex-1 py-3 text-center text-xs text-brand-600 font-medium">🏠 Hoje</Link>
        <Link href="/criancas" className="flex-1 py-3 text-center text-xs text-gray-400">👶 Criancas</Link>
        <Link href="/medicamentos" className="flex-1 py-3 text-center text-xs text-gray-400">💊 Remedios</Link>
        <Link href="/historico" className="flex-1 py-3 text-center text-xs text-gray-400">📋 Historico</Link>
        <Link href="/diagnostico" className="flex-1 py-3 text-center text-xs text-gray-400">🔍 Status</Link>
      </div>
    </main>
  )
}
