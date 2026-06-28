'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { queueDoseEvent, syncDoseEvents } from '@/lib/doses-sync'
import { ensureFamiliaAndPerfil } from '@/lib/onboarding'
import {
  unlockAudio,
  playAlertSound,
  requestNotificationPermission,
  showBrowserNotification,
} from '@/lib/alertas'

interface Dose {
  id: string
  nome: string
  horario: string
  tomado: boolean
  pulado: boolean
  quem?: string
  hora_tomado?: string
  medicamentoId: string | null
  criancaId: string | null
  criancaNome: string | null
}

type StatusEventoDose = 'pendente' | 'tomado' | 'pulado' | 'atrasado'

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
  const [doses, setDoses] = useState<Dose[]>([])
  const [loading, setLoading] = useState(true)
  const [userEmail, setUserEmail] = useState('')
  const [notifGranted, setNotifGranted] = useState(false)
  const supabaseRef = useRef(createClient())
  const router = useRouter()
  const alertedRef = useRef<Set<string>>(new Set())
  const audioUnlockedRef = useRef(false)

  const supabase = supabaseRef.current

  // Unlock audio on first user gesture
  const handleFirstGesture = useCallback(() => {
    if (!audioUnlockedRef.current) {
      unlockAudio()
      audioUnlockedRef.current = true
    }
  }, [])

  useEffect(() => {
    document.addEventListener('click', handleFirstGesture, { once: true })
    document.addEventListener('touchend', handleFirstGesture, { once: true })
    return () => {
      document.removeEventListener('click', handleFirstGesture)
      document.removeEventListener('touchend', handleFirstGesture)
    }
  }, [handleFirstGesture])

  useEffect(() => {
    async function init() {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }

      const user = session.user
      setUserEmail(user.email ?? '')

      await ensureFamiliaAndPerfil(supabase, user.id, user.email)

      // Request notification permission
      const granted = await requestNotificationPermission()
      setNotifGranted(granted)

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
          if (row.data_inicio && row.data_inicio > hojeISO) return false
          if (row.data_fim && row.data_fim < hojeISO) return false
          return true
        })

        const mapped: Dose[] = todaysPlanned.map((row) => {
          const ev = eventsByDose.get(row.id)
          const tomado = ev?.status === 'tomado'
          const pulado = ev?.status === 'pulado'

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
            pulado,
            quem: tomado ? 'Responsavel' : undefined,
            hora_tomado: tomado ? horaTomado : undefined,
            medicamentoId: med?.id ?? null,
            criancaId: crianca?.id ?? null,
            criancaNome,
          }
        })

        setDoses(mapped)
      } catch (error) {
        console.warn('Erro ao carregar doses do dia', error)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Alert timer: check every 30s if any dose matches the current time
  useEffect(() => {
    if (loading || doses.length === 0) return

    function checkAlerts() {
      const now = new Date()
      const nowHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

      doses.forEach((dose) => {
        if (dose.tomado || dose.pulado) return
        if (dose.horario !== nowHHMM) return
        if (alertedRef.current.has(dose.id)) return

        alertedRef.current.add(dose.id)
        playAlertSound()

        const medName = dose.nome.split(' · ')[0]
        showBrowserNotification(medName, dose.criancaNome)
      })
    }

    checkAlerts()
    const interval = setInterval(checkAlerts, 30_000)
    return () => clearInterval(interval)
  }, [loading, doses])

  async function registrarEvento(id: string, status: StatusEventoDose) {
    const agora = new Date()
    const horaLabel = agora.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    })

    const alvo = doses.find((d) => d.id === id) ?? null

    setDoses((prev) =>
      prev.map((d) =>
        d.id === id
          ? {
              ...d,
              tomado: status === 'tomado',
              pulado: status === 'pulado',
              quem: status === 'tomado' ? 'Responsavel' : undefined,
              hora_tomado: status === 'tomado' ? horaLabel : undefined,
            }
          : d,
      ),
    )

    const dataPrevista = agora.toISOString().slice(0, 10)
    const horaPrevista = `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}:00`

    try {
      const { error } = await supabase.from('eventos_dose').insert({
        dose_planejada_id: id,
        medicamento_id: alvo?.medicamentoId ?? null,
        crianca_id: alvo?.criancaId ?? null,
        data_prevista: dataPrevista,
        hora_prevista: horaPrevista,
        status,
        hora_administrada: status === 'tomado' ? agora.toISOString() : null,
        observacao: status === 'pulado' ? 'Dose pulada pelo responsavel' : null,
      })

      if (error) throw error
    } catch (e) {
      console.warn('Falha ao gravar evento online, enfileirando offline', e)
      try {
        await queueDoseEvent({
          offlineId: crypto.randomUUID(),
          dose_planejada_id: id,
          medicamento_id: alvo?.medicamentoId ?? null,
          crianca_id: alvo?.criancaId ?? null,
          data_prevista: dataPrevista,
          hora_prevista: horaPrevista,
          status,
          hora_administrada: status === 'tomado' ? agora.toISOString() : null,
          observacao: status === 'pulado' ? 'Dose pulada pelo responsavel' : null,
        })
      } catch (e2) {
        console.warn('Falha ao enfileirar evento local', e2)
      }
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const hojeLabel = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  const total = doses.length
  const feitos = doses.filter((d) => d.tomado).length
  const pulados = doses.filter((d) => d.pulado).length

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <span className="text-gray-400 text-sm">Carregando agenda...</span>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50 pb-24">
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
            {pulados > 0 && (
              <span className="text-gray-400 ml-1">· {pulados} pulado{pulados !== 1 ? 's' : ''}</span>
            )}
          </div>
          <button
            onClick={handleLogout}
            className="text-xs text-red-400 hover:text-red-600 mt-1 font-medium"
          >
            Sair
          </button>
        </div>
      </header>

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

      <div className="mx-4 mt-4 space-y-3">
        {doses.map((dose) => (
          <div
            key={dose.id}
            className={`bg-white rounded-xl p-4 shadow-sm border-l-4 ${
              dose.tomado
                ? 'border-brand-400 opacity-75'
                : dose.pulado
                ? 'border-gray-300 opacity-60'
                : 'border-orange-400'
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
                {dose.pulado && (
                  <p className="text-xs text-gray-400 mt-1">
                    ⏭️ Dose pulada
                  </p>
                )}
              </div>
              {!dose.tomado && !dose.pulado && (
                <div className="flex gap-2 ml-3">
                  <button
                    onClick={() => registrarEvento(dose.id, 'pulado')}
                    className="bg-gray-100 text-gray-500 px-3 py-2 rounded-lg font-medium text-xs hover:bg-gray-200 active:scale-95 transition-all"
                  >
                    Pular
                  </button>
                  <button
                    onClick={() => registrarEvento(dose.id, 'tomado')}
                    className="bg-brand-600 text-white px-4 py-2 rounded-lg font-semibold text-sm hover:bg-brand-700 active:scale-95 transition-all"
                  >
                    ✓ Tomado
                  </button>
                </div>
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

      {/* Bottom navigation */}
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
          href="/medicamentos"
          className="flex-1 py-3 text-center text-xs text-gray-400"
        >
          💊 Remedios
        </Link>
        <Link
          href="/receita"
          className="flex-1 py-3 text-center text-xs text-gray-400"
        >
          🧾 Receita
        </Link>
        <Link
          href="/historico"
          className="flex-1 py-3 text-center text-xs text-gray-400"
        >
          📋 Historico
        </Link>
      </div>
    </main>
  )
}
