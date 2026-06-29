'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { ensureFamiliaAndPerfil } from '@/lib/onboarding'

interface Crianca {
  id: string
  nome: string
}

const UNIDADES = ['mg', 'ml', 'comprimido(s)', 'gota(s)', 'sache(s)', 'aplicação(ões)'] as const

const DIAS_SEMANA = [
  { valor: 0, label: 'D' },
  { valor: 1, label: 'S' },
  { valor: 2, label: 'T' },
  { valor: 3, label: 'Q' },
  { valor: 4, label: 'Q' },
  { valor: 5, label: 'S' },
  { valor: 6, label: 'S' },
]

export default function AdicionarRemedioPage() {
  const [criancas, setCriancas] = useState<Crianca[]>([])
  const [familiaId, setFamiliaId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [criancaId, setCriancaId] = useState('')
  const [nome, setNome] = useState('')
  const [dose, setDose] = useState('')
  const [unidade, setUnidade] = useState<string>(UNIDADES[0])
  const [instrucoes, setInstrucoes] = useState('')
  const [horarios, setHorarios] = useState<string[]>(['08:00'])
  const [diasSelecionados, setDiasSelecionados] = useState<number[]>([
    0, 1, 2, 3, 4, 5, 6,
  ])

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

      const famId = await ensureFamiliaAndPerfil(
        supabase,
        session.user.id,
        session.user.email,
      )
      setFamiliaId(famId)

      try {
        const { data, error } = await supabase
          .from('criancas')
          .select('id, nome')
          .order('nome', { ascending: true })

        if (error) {
          setError(error.message)
        } else {
          const lista = data ?? []
          setCriancas(lista)
          if (lista.length > 0) {
            setCriancaId(lista[0].id)
          }
        }
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Erro ao carregar crianças'
        setError(msg)
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [supabase, router])

  function addHorario() {
    setHorarios((prev) => [...prev, ''])
  }

  function removeHorario(index: number) {
    if (horarios.length <= 1) return // Keep at least one
    setHorarios((prev) => prev.filter((_, i) => i !== index))
  }

  function updateHorario(index: number, valor: string) {
    setHorarios((prev) => prev.map((h, i) => (i === index ? valor : h)))
  }

  function toggleDia(valor: number) {
    setDiasSelecionados((prev) =>
      prev.includes(valor)
        ? prev.filter((d) => d !== valor)
        : [...prev, valor].sort(),
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!familiaId) {
      setError('Não foi possível identificar a família do usuário.')
      return
    }
    if (criancas.length === 0) {
      setError('Cadastre uma criança antes de adicionar um remédio.')
      return
    }
    if (!criancaId) {
      setError('Selecione a criança.')
      return
    }
    if (!nome.trim()) {
      setError('Informe o nome do remédio.')
      return
    }
    const horariosValidos = horarios
      .map((h) => h.trim())
      .filter((h) => h.length > 0)
    if (horariosValidos.length === 0) {
      setError('Informe ao menos um horário.')
      return
    }
    if (diasSelecionados.length === 0) {
      setError('Selecione ao menos um dia da semana.')
      return
    }

    setSaving(true)

    try {
      const { data: medicamento, error: medError } = await supabase
        .from('medicamentos')
        .insert({
          crianca_id: criancaId,
          nome: nome.trim(),
          dose: dose.trim() || null,
          unidade: dose.trim() ? unidade : null,
          instrucoes: instrucoes.trim() || null,
          ativo: true,
        })
        .select('id')
        .single<{ id: string }>()

      if (medError || !medicamento) {
        throw medError ?? new Error('Erro ao criar remédio')
      }

      const dosesParaInserir = horariosValidos.map((horario) => ({
        medicamento_id: medicamento.id,
        horario: `${horario}:00`,
        dias_semana: diasSelecionados,
        ativo: true,
      }))

      const { error: dosesError } = await supabase
        .from('doses_planejadas')
        .insert(dosesParaInserir)

      if (dosesError) {
        throw dosesError
      }

      router.push('/medicamentos')
      router.refresh()
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Erro ao salvar remédio'
      setError(msg)
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex-1 w-full flex items-center justify-center bg-apricot-100 min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <span className="text-3xl animate-bounce">💊</span>
          <span className="text-terracotta-500 text-sm font-semibold animate-pulse">Carregando formulário...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 w-full space-y-4 px-4 py-6">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/medicamentos"
          className="h-10 w-10 rounded-xl bg-white border border-apricot-200 flex items-center justify-center text-terracotta-500 hover:text-brand-500 transition-all hover:border-brand-300"
        >
          ←
        </Link>
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-extrabold text-terracotta-600 tracking-tight">Novo Remédio 💊</h2>
          <p className="text-xs text-terracotta-400 font-medium">Cadastre uma receita de forma manual</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl p-3.5 font-medium">
          ⚠️ {error}
        </div>
      )}

      {/* Main form */}
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-5 shadow-card border border-apricot-200 space-y-5">
        
        {/* Child Selector */}
        <div className="space-y-1">
          <label className="text-xs font-bold text-terracotta-400 uppercase tracking-wider">Criança vinculada</label>
          {criancas.length === 0 ? (
            <div className="p-3 bg-apricot-100 border border-apricot-200 text-terracotta-600 text-xs rounded-xl font-semibold flex items-center justify-between">
              <span>Nenhuma criança cadastrada ainda.</span>
              <Link href="/criancas" className="underline font-bold text-brand-500">Cadastrar 👶</Link>
            </div>
          ) : (
            <select
              value={criancaId}
              onChange={(e) => setCriancaId(e.target.value)}
              className="w-full h-12 border border-apricot-200 bg-apricot-50 rounded-xl px-4 text-sm font-semibold text-terracotta-700 outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent transition-all"
            >
              {criancas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Medicine Name */}
        <div className="space-y-1">
          <label className="text-xs font-bold text-terracotta-400 uppercase tracking-wider">Nome do Remédio</label>
          <input
            type="text"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex: Paracetamol Infantil"
            className="w-full h-12 border border-apricot-200 bg-apricot-50 rounded-xl px-4 text-sm outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent transition-all font-medium"
            required
          />
        </div>

        {/* Dosage and Unit */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-bold text-terracotta-400 uppercase tracking-wider">Dose (Opcional)</label>
            <input
              type="text"
              value={dose}
              onChange={(e) => setDose(e.target.value)}
              placeholder="Ex: 5"
              className="w-full h-12 border border-apricot-200 bg-apricot-50 rounded-xl px-4 text-sm outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent transition-all font-medium"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-terracotta-400 uppercase tracking-wider">Unidade</label>
            <select
              value={unidade}
              onChange={(e) => setUnidade(e.target.value)}
              className="w-full h-12 border border-apricot-200 bg-apricot-50 rounded-xl px-3 text-sm outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent transition-all font-semibold text-terracotta-700"
              disabled={!dose.trim()}
            >
              {UNIDADES.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Instructions */}
        <div className="space-y-1">
          <label className="text-xs font-bold text-terracotta-400 uppercase tracking-wider">Instruções / Observações (Opcional)</label>
          <textarea
            value={instrucoes}
            onChange={(e) => setInstrucoes(e.target.value)}
            placeholder="Ex: Tomar após as refeições, não diluir em água"
            className="w-full h-20 border border-apricot-200 bg-apricot-50 rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent transition-all resize-none font-medium"
          />
        </div>

        {/* Hours Selector */}
        <div className="space-y-3.5 border-t border-apricot-100 pt-4">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-terracotta-400 uppercase tracking-wider">Horários das Doses</label>
            <button
              type="button"
              onClick={addHorario}
              className="h-9 px-3.5 bg-brand-50 hover:bg-brand-100 text-brand-500 rounded-lg text-xs font-bold flex items-center gap-1 transition-all active:scale-95"
            >
              ＋ Horário
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {horarios.map((horario, index) => (
              <div
                key={index}
                className="flex items-center bg-apricot-50 border border-apricot-200 rounded-xl px-3.5 py-1.5 justify-between gap-2"
              >
                <input
                  type="time"
                  value={horario}
                  onChange={(e) => updateHorario(index, e.target.value)}
                  className="bg-transparent border-none text-sm font-bold text-terracotta-700 outline-none w-20 focus:text-brand-500"
                  required
                />
                <button
                  type="button"
                  onClick={() => removeHorario(index)}
                  disabled={horarios.length <= 1}
                  className="w-8 h-8 rounded-lg bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-100 transition-all disabled:opacity-30 active:scale-90"
                  title="Remover horário"
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Weekdays Selector */}
        <div className="space-y-3 border-t border-apricot-100 pt-4">
          <label className="text-xs font-bold text-terracotta-400 uppercase tracking-wider block">Dias da Semana</label>
          <div className="flex gap-1.5 justify-between sm:justify-start">
            {DIAS_SEMANA.map((dia) => {
              const selecionado = diasSelecionados.includes(dia.valor)
              return (
                <button
                  key={dia.valor}
                  type="button"
                  onClick={() => toggleDia(dia.valor)}
                  className={`w-10 h-10 rounded-xl text-xs font-bold border transition-all active:scale-90 flex items-center justify-center ${
                    selecionado
                      ? 'bg-brand-500 border-transparent text-white shadow-coral'
                      : 'bg-apricot-50 border-apricot-200 text-terracotta-400 hover:border-brand-300'
                  }`}
                >
                  {dia.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Action Button */}
        <button
          type="submit"
          disabled={saving || criancas.length === 0}
          className="w-full h-12 bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold rounded-xl disabled:opacity-50 active:scale-[0.98] transition-all shadow-coral flex items-center justify-center gap-2"
        >
          {saving ? 'Salvando...' : 'Confirmar e Cadastrar Remédio'}
        </button>
      </form>
    </div>
  )
}
