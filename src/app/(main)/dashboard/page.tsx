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
  criancaDataNasc: string | null
}

type StatusEventoDose = 'pendente' | 'tomado' | 'pulado' | 'atrasado'

type MaybeArray<T> = T | T[] | null

interface SupaCrianca {
  id: string
  nome: string | null
  data_nasc: string | null
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

// Age-adapted dynamic styling profiles
const EMOJIS_INFANTIL = ['🐻', '🦁', '🐰', '🐼', '🐨', '🦊', '🐸', '🐧']
const EMOJIS_JOVEM = ['🎮', '🚀', '🎧', '⚡', '🪐', '🛹', '🏂', '🎨']
const EMOJIS_ADULTO = ['💊', '🏃', '🥗', '☕', '🧬', '🧘', '🩺', '❤️']

interface AgeProfile {
  category: 'infantil' | 'jovem' | 'adulto'
  mascote: string
  label: string
  emojiList: string[]
}

function getProfileForAge(dataNasc: string | null): AgeProfile {
  if (!dataNasc) {
    return {
      category: 'adulto',
      mascote: '☕',
      label: 'Adulto',
      emojiList: EMOJIS_ADULTO,
    }
  }

  const nascimento = new Date(dataNasc)
  if (Number.isNaN(nascimento.getTime())) {
    return {
      category: 'adulto',
      mascote: '☕',
      label: 'Adulto',
      emojiList: EMOJIS_ADULTO,
    }
  }

  const hoje = new Date()
  let idade = hoje.getFullYear() - nascimento.getFullYear()
  const m = hoje.getMonth() - nascimento.getMonth()
  if (m < 0 || (m === 0 && hoje.getDate() < nascimento.getDate())) {
    idade--
  }

  if (idade <= 10) {
    return {
      category: 'infantil',
      mascote: '🦁',
      label: 'Infantil',
      emojiList: EMOJIS_INFANTIL,
    }
  } else if (idade <= 17) {
    return {
      category: 'jovem',
      mascote: '🚀',
      label: 'Teen',
      emojiList: EMOJIS_JOVEM,
    }
  } else {
    return {
      category: 'adulto',
      mascote: '☕',
      label: 'Adulto',
      emojiList: EMOJIS_ADULTO,
    }
  }
}

function getDoseEmoji(index: number, dataNasc: string | null) {
  const profile = getProfileForAge(dataNasc)
  return profile.emojiList[index % profile.emojiList.length]
}

function getNextDose(doses: Dose[]): Dose | null {
  const now = new Date()
  const nowMins = now.getHours() * 60 + now.getMinutes()

  const pending = doses
    .filter((d) => !d.tomado && !d.pulado)
    .map((d) => {
      const [h, m] = d.horario.split(':').map(Number)
      const mins = h * 60 + m
      return { dose: d, mins }
    })
    .filter(({ mins }) => mins >= nowMins)
    .sort((a, b) => a.mins - b.mins)

  return pending.length > 0 ? pending[0].dose : null
}

function getCountdown(horario: string): string {
  const now = new Date()
  const [h, m] = horario.split(':').map(Number)
  const target = new Date()
  target.setHours(h, m, 0, 0)
  const diffMs = target.getTime() - now.getTime()
  if (diffMs <= 0) return 'Agora!'
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 60) return `${diffMins} min`
  const hrs = Math.floor(diffMins / 60)
  const mins = diffMins % 60
  return mins > 0 ? `${hrs}h ${mins}min` : `${hrs}h`
}

export default function DashboardPage() {
  const [doses, setDoses] = useState<Dose[]>([])
  const [loading, setLoading] = useState(true)
  const [, setUserEmail] = useState('')
  const [, setNotifGranted] = useState(false)
  const [countdown, setCountdown] = useState('')
  const supabaseRef = useRef(createClient())
  const router = useRouter()
  const alertedRef = useRef<Set<string>>(new Set())
  const audioUnlockedRef = useRef(false)

  const supabase = supabaseRef.current

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
                 criancas:crianca_id ( id, nome, data_nasc )
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
          const criancaDataNasc = crianca?.data_nasc ?? null
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
            criancaDataNasc,
          }
        })

        // Sort by horario
        mapped.sort((a, b) => a.horario.localeCompare(b.horario))
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

  // Alert timer
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

  // Countdown timer
  useEffect(() => {
    const nextDose = getNextDose(doses)
    if (!nextDose) return

    function tick() {
      if (!nextDose) return
      setCountdown(getCountdown(nextDose.horario))
    }
    tick()
    const interval = setInterval(tick, 30_000)
    return () => clearInterval(interval)
  }, [doses])

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

  const hojeLabel = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  const total = doses.length
  const feitos = doses.filter((d) => d.tomado).length
  const pulados = doses.filter((d) => d.pulado).length
  const pendentes = total - feitos - pulados
  const nextDose = getNextDose(doses)

  if (loading) {
    return (
      <div className="flex-1 w-full flex items-center justify-center bg-apricot-100 min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-brand-500 flex items-center justify-center shadow-coral animate-bounce">
            <span className="text-2xl">🐻</span>
          </div>
          <span className="text-terracotta-500 text-sm font-semibold animate-pulse">
            Carregando sua rotina...
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 w-full space-y-4 px-4 py-5">

      {/* ── HERO HEADER ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-extrabold text-terracotta-600 leading-tight">
            Olá, cuidador! 👋
          </h2>
          <p className="text-xs text-terracotta-400 font-medium capitalize mt-0.5">{hojeLabel}</p>
        </div>
        <Link
          href="/criancas"
          className="w-12 h-12 rounded-2xl bg-brand-500 flex items-center justify-center shadow-coral active:scale-90 transition-all"
        >
          <span className="text-2xl">👶</span>
        </Link>
      </div>

      {/* ── NEXT DOSE BANNER ────────────────────────────────────────── */}
      {nextDose ? (
        <div className="relative bg-brand-500 rounded-3xl p-5 shadow-coral overflow-hidden">
          {/* Decorative mascot */}
          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-6xl opacity-20 select-none pointer-events-none">
            {getProfileForAge(nextDose.criancaDataNasc).mascote}
          </div>
          <p className="text-white/80 text-xs font-semibold uppercase tracking-widest mb-1">
            Próxima Dose
          </p>
          <p className="text-white font-extrabold text-lg leading-tight truncate pr-16">
            {nextDose.nome.split(' · ')[0]}
          </p>
          {nextDose.criancaNome && (
            <p className="text-white/70 text-xs font-medium mt-0.5">
              para {nextDose.criancaNome}{' '}
              <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full font-bold ml-1">
                {getProfileForAge(nextDose.criancaDataNasc).label}
              </span>
            </p>
          )}
          <div className="flex items-center gap-3 mt-3">
            <div className="bg-white/20 rounded-xl px-3 py-1.5 flex items-center gap-1.5">
              <span className="text-white text-sm">⏰</span>
              <span className="text-white font-bold text-sm">{nextDose.horario}</span>
            </div>
            <div className="bg-white/20 rounded-xl px-3 py-1.5">
              <span className="text-white font-bold text-sm">em {countdown}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-brand-500 rounded-3xl p-5 shadow-coral text-center">
          <span className="text-3xl">🎉</span>
          <p className="text-white font-extrabold text-base mt-1">Tudo em dia!</p>
          <p className="text-white/70 text-xs mt-0.5">Nenhuma dose pendente hoje</p>
        </div>
      )}

      {/* ── PROGRESS STATS ──────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl p-3.5 shadow-card text-center border border-apricot-200">
          <p className="text-2xl font-extrabold text-terracotta-600">{total}</p>
          <p className="text-[10px] text-terracotta-400 font-semibold uppercase tracking-wide mt-0.5">Total</p>
        </div>
        <div className="bg-white rounded-2xl p-3.5 shadow-card text-center border border-apricot-200">
          <p className="text-2xl font-extrabold text-brand-500">{feitos}</p>
          <p className="text-[10px] text-brand-400 font-semibold uppercase tracking-wide mt-0.5">Tomados</p>
        </div>
        <div className="bg-white rounded-2xl p-3.5 shadow-card text-center border border-apricot-200">
          <p className="text-2xl font-extrabold text-terracotta-500">{pendentes}</p>
          <p className="text-[10px] text-terracotta-400 font-semibold uppercase tracking-wide mt-0.5">Pendentes</p>
        </div>
      </div>

      {/* Progress bar */}
      {total > 0 && (
        <div className="bg-white rounded-2xl px-4 py-3 shadow-card border border-apricot-200">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-bold text-terracotta-600">Progresso do dia</span>
            <span className="text-xs font-extrabold text-brand-500">
              {Math.round((feitos / total) * 100)}%
              {pulados > 0 && <span className="text-terracotta-400 font-medium"> · {pulados} pulados</span>}
            </span>
          </div>
          <div className="w-full bg-apricot-200 rounded-full h-2.5">
            <div
              className="bg-brand-500 h-2.5 rounded-full transition-all duration-700"
              style={{ width: `${(feitos / total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* ── QUICK ACTIONS ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/receita"
          className="bg-white rounded-2xl p-4 shadow-card border border-apricot-200 flex flex-col items-center gap-2 active:scale-[0.96] transition-all hover:border-brand-300"
        >
          <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center">
            <span className="text-xl">📷</span>
          </div>
          <span className="text-xs font-bold text-terracotta-600 text-center">Ler Receita</span>
        </Link>
        <Link
          href="/adicionar-remedio"
          className="bg-white rounded-2xl p-4 shadow-card border border-apricot-200 flex flex-col items-center gap-2 active:scale-[0.96] transition-all hover:border-brand-300"
        >
          <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center">
            <span className="text-xl">➕</span>
          </div>
          <span className="text-xs font-bold text-terracotta-600 text-center">Novo Remédio</span>
        </Link>
        <Link
          href="/criancas"
          className="bg-white rounded-2xl p-4 shadow-card border border-apricot-200 flex flex-col items-center gap-2 active:scale-[0.96] transition-all hover:border-brand-300"
        >
          <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center">
            <span className="text-xl">👶</span>
          </div>
          <span className="text-xs font-bold text-terracotta-600 text-center">Crianças</span>
        </Link>
        <Link
          href="/historico"
          className="bg-white rounded-2xl p-4 shadow-card border border-apricot-200 flex flex-col items-center gap-2 active:scale-[0.96] transition-all hover:border-brand-300"
        >
          <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center">
            <span className="text-xl">📋</span>
          </div>
          <span className="text-xs font-bold text-terracotta-600 text-center">Histórico</span>
        </Link>
      </div>

      {/* ── DOSES LIST ──────────────────────────────────────────────── */}
      <div>
        <h3 className="text-sm font-extrabold text-terracotta-600 mb-3 uppercase tracking-wide">
          Agenda de Hoje
        </h3>
        <div className="space-y-3">
          {doses.map((dose, idx) => (
            <div
              key={dose.id}
              className={`bg-white rounded-2xl p-4 shadow-card border transition-all ${
                dose.tomado
                  ? 'border-brand-200 opacity-75'
                  : dose.pulado
                  ? 'border-apricot-200 opacity-60'
                  : 'border-apricot-200 border-l-4 border-l-brand-400'
              }`}
            >
              <div className="flex items-center gap-3">
                {/* Animal / Teen / Adult avatar based on recipient age */}
                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                  dose.tomado
                    ? 'bg-brand-100'
                    : dose.pulado
                    ? 'bg-apricot-100'
                    : 'bg-brand-50'
                }`}>
                  <span className="text-2xl">{getDoseEmoji(idx, dose.criancaDataNasc)}</span>
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-bold text-terracotta-700 text-sm truncate">
                    {dose.nome.split(' · ')[0]}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <span className="text-[11px] text-terracotta-400 bg-apricot-100 px-2 py-0.5 rounded-lg font-semibold">
                      ⏰ {dose.horario}
                    </span>
                    {dose.criancaNome && (
                      <span className="text-[11px] text-brand-500 bg-brand-50 px-2 py-0.5 rounded-lg font-semibold">
                        👶 {dose.criancaNome}
                      </span>
                    )}
                  </div>
                  {dose.tomado && (
                    <p className="text-[11px] text-brand-500 font-bold mt-1.5 flex items-center gap-1">
                      ✅ Administrado às {dose.hora_tomado}
                    </p>
                  )}
                  {dose.pulado && (
                    <p className="text-[11px] text-terracotta-400 font-medium mt-1.5">
                      ⏭️ Dose pulada
                    </p>
                  )}
                </div>

                {!dose.tomado && !dose.pulado && (
                  <div className="flex flex-col gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => registrarEvento(dose.id, 'tomado')}
                      className="h-10 px-4 bg-brand-500 text-white rounded-xl font-bold text-xs shadow-coral hover:bg-brand-600 active:scale-[0.93] transition-all"
                    >
                      ✓ Tomar
                    </button>
                    <button
                      onClick={() => registrarEvento(dose.id, 'pulado')}
                      className="h-8 px-3 bg-apricot-100 text-terracotta-500 rounded-xl font-semibold text-[11px] border border-apricot-200 hover:bg-apricot-200 active:scale-[0.93] transition-all"
                    >
                      Pular
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {doses.length === 0 && (
            <div className="bg-white rounded-3xl p-8 shadow-card border border-apricot-200 text-center flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-2xl bg-brand-50 flex items-center justify-center">
                <span className="text-4xl">🎉</span>
              </div>
              <div>
                <p className="font-extrabold text-terracotta-700 text-base">Tudo limpo por aqui!</p>
                <p className="text-xs text-terracotta-400 mt-1">Nenhuma dose planejada para hoje.</p>
              </div>
              <Link
                href="/adicionar-remedio"
                className="mt-1 px-5 py-2.5 bg-brand-500 text-white rounded-xl font-bold text-sm shadow-coral active:scale-95 transition-all"
              >
                + Adicionar Remédio
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* ── MOTIVATIONAL FOOTER CARD ────────────────────────────────── */}
      {total > 0 && feitos === total && (
        <div className="bg-brand-500 rounded-3xl p-5 shadow-coral text-center">
          <span className="text-3xl">🏆</span>
          <p className="text-white font-extrabold text-base mt-2">Parabéns!</p>
          <p className="text-white/80 text-xs mt-1">
            Todas as doses de hoje foram administradas com sucesso!
          </p>
        </div>
      )}

      {/* Bottom spacer for safe area */}
      <div className="h-2" />
    </div>
  )
}
