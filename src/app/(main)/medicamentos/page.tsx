'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { ensureFamiliaAndPerfil } from '@/lib/onboarding'

type MaybeArray<T> = T | T[] | null

interface DosePlanejada {
  id: string
  horario: string
  dias_semana: number[] | null
}

interface Medicamento {
  id: string
  nome: string
  dose: string | null
  unidade: string | null
  instrucoes: string | null
  ativo: boolean
  crianca_id: string
  crianca_nome: string | null
  doses_planejadas?: DosePlanejada[]
}

function firstOrNull<T>(value: MaybeArray<T>): T | null {
  if (Array.isArray(value)) return value.length > 0 ? value[0] : null
  return value ?? null
}

const DIAS_SIGLAS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

export default function MedicamentosPage() {
  const [medicamentos, setMedicamentos] = useState<Medicamento[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current
  const router = useRouter()

  // Editing state variables
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editNome, setEditNome] = useState('')
  const [editDose, setEditDose] = useState('')
  const [editUnidade, setEditUnidade] = useState('')
  const [editInstrucoes, setEditInstrucoes] = useState('')
  const [editHorarios, setEditHorarios] = useState<string[]>([])
  const [editDiasSemana, setEditDiasSemana] = useState<number[]>([])

  useEffect(() => {
    async function load() {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }

      await ensureFamiliaAndPerfil(supabase, session.user.id, session.user.email)

      try {
        const { data, error } = await supabase
          .from('medicamentos')
          .select(`
            id, nome, dose, unidade, instrucoes, ativo, crianca_id,
            criancas:crianca_id ( nome ),
            doses_planejadas ( id, horario, dias_semana )
          `)
          .order('nome', { ascending: true })

        if (error) {
          setError(error.message)
        } else {
          const mapped = (data ?? []).map((row: any) => {
            const crianca = firstOrNull(row.criancas)
            return {
              id: row.id,
              nome: row.nome,
              dose: row.dose,
              unidade: row.unidade,
              instrucoes: row.instrucoes,
              ativo: row.ativo,
              crianca_id: row.crianca_id,
              crianca_nome: crianca?.nome ?? null,
              doses_planejadas: row.doses_planejadas ?? []
            }
          })
          setMedicamentos(mapped)
        }
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Erro ao carregar remédios'
        setError(msg)
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [supabase, router])

  async function toggleAtivo(id: string, atualAtivo: boolean) {
    const novoStatus = !atualAtivo

    // Optimistic UI update
    setMedicamentos((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ativo: novoStatus } : m))
    )

    try {
      const { error } = await supabase
        .from('medicamentos')
        .update({ ativo: novoStatus })
        .eq('id', id)

      if (error) {
        throw error
      }
    } catch (err) {
      // Revert if error
      setMedicamentos((prev) =>
        prev.map((m) => (m.id === id ? { ...m, ativo: atualAtivo } : m))
      )
      alert(err instanceof Error ? err.message : 'Erro ao atualizar remédio')
    }
  }

  function handleStartEdit(m: Medicamento) {
    setEditingId(m.id)
    setEditNome(m.nome)
    setEditDose(m.dose ?? '')
    setEditUnidade(m.unidade ?? 'ml')
    setEditInstrucoes(m.instrucoes ?? '')
    const hList = (m.doses_planejadas ?? []).map((d) => d.horario.slice(0, 5))
    setEditHorarios(hList.length > 0 ? hList : ['08:00'])

    const daysSet = new Set<number>()
    ;(m.doses_planejadas ?? []).forEach((d) => {
      if (Array.isArray(d.dias_semana)) {
        d.dias_semana.forEach((day) => daysSet.add(Number(day)))
      }
    })
    setEditDiasSemana(daysSet.size > 0 ? Array.from(daysSet) : [0, 1, 2, 3, 4, 5, 6])
  }

  async function handleSaveEdit(id: string) {
    if (!editNome.trim()) {
      alert('O nome do remédio é obrigatório.')
      return
    }

    try {
      setError(null)
      // 1. Update parent medicamento
      const { error: medErr } = await supabase
        .from('medicamentos')
        .update({
          nome: editNome.trim(),
          dose: editDose.trim() || null,
          unidade: editUnidade.trim() || null,
          instrucoes: editInstrucoes.trim() || null,
        })
        .eq('id', id)

      if (medErr) throw medErr

      // 2. Delete old doses_planejadas
      const { error: delErr } = await supabase
        .from('doses_planejadas')
        .delete()
        .eq('medicamento_id', id)

      if (delErr) throw delErr

      // 3. Insert new doses_planejadas starting today
      const dataInicio = new Date().toISOString().slice(0, 10)
      const dosesParaInserir = editHorarios.map((h) => ({
        medicamento_id: id,
        horario: h.length === 5 ? `${h}:00` : h,
        dias_semana: editDiasSemana,
        ativo: true,
        data_inicio: dataInicio,
        data_fim: null,
      }))

      const { error: doseErr } = await supabase
        .from('doses_planejadas')
        .insert(dosesParaInserir)

      if (doseErr) throw doseErr

      // 4. Read back new planned doses
      const { data: updatedDoses } = await supabase
        .from('doses_planejadas')
        .select('id, horario, dias_semana')
        .eq('medicamento_id', id)

      setMedicamentos((prev) =>
        prev.map((m) =>
          m.id === id
            ? {
                ...m,
                nome: editNome.trim(),
                dose: editDose.trim() || null,
                unidade: editUnidade.trim() || null,
                instrucoes: editInstrucoes.trim() || null,
                doses_planejadas: (updatedDoses ?? []).map((row: any) => ({
                  id: row.id,
                  horario: row.horario,
                  dias_semana: row.dias_semana,
                })),
              }
            : m
        )
      )

      setEditingId(null)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao salvar alterações')
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Deseja realmente excluir este medicamento e todos os seus horários agendados? Esta ação não pode ser desfeita.')) {
      return
    }

    try {
      const { error } = await supabase.from('medicamentos').delete().eq('id', id)
      if (error) throw error
      setMedicamentos((prev) => prev.filter((m) => m.id !== id))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao excluir remédio')
    }
  }

  function formatHorario(h: string) {
    return h.slice(0, 5)
  }

  if (loading) {
    return (
      <div className="flex-1 w-full flex items-center justify-center bg-apricot-100 min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <span className="text-3xl animate-bounce">💊</span>
          <span className="text-terracotta-500 text-sm font-semibold animate-pulse">Carregando seus medicamentos...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 w-full space-y-4 px-4 py-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-extrabold text-terracotta-600 tracking-tight">Remédios 💊</h2>
          <p className="text-xs text-terracotta-400 font-medium">Controle de receitas e horários ativos</p>
        </div>
        <Link
          href="/adicionar-remedio"
          className="h-11 px-4 text-xs font-bold rounded-xl transition-all bg-brand-500 hover:bg-brand-600 text-white shadow-coral flex items-center gap-1.5 active:scale-95"
        >
          ＋ Novo Remédio
        </Link>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl p-3.5 font-medium">
          ⚠️ {error}
        </div>
      )}

      {/* Medications list */}
      <div className="space-y-4">
        {medicamentos.map((m) => {
          const criancaNome = m.crianca_nome ?? 'Sem criança'
          const doses = m.doses_planejadas ?? []
          const isEditing = editingId === m.id

          if (isEditing) {
            return (
              <div
                key={m.id}
                className="bg-white rounded-2xl p-5 shadow-card border-2 border-brand-400 flex flex-col gap-4 relative"
              >
                <div className="flex justify-between items-center pb-2 border-b border-apricot-100">
                  <span className="text-xs font-bold text-brand-500 bg-brand-55 px-2.5 py-1 rounded-full border border-brand-100">
                    👶 {criancaNome}
                  </span>
                  <span className="text-xs font-extrabold text-terracotta-500">Editando Remédio</span>
                </div>

                <div className="space-y-4">
                  {/* Name Input */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-terracotta-400 uppercase tracking-wider block">Nome do Remédio</label>
                    <input
                      type="text"
                      value={editNome}
                      onChange={(e) => setEditNome(e.target.value)}
                      className="w-full h-11 border border-apricot-200 bg-apricot-50 rounded-xl px-4 text-sm font-semibold text-terracotta-700 outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent transition-all"
                    />
                  </div>

                  {/* Dose and Unit Row */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-terracotta-400 uppercase block">Dose</label>
                      <input
                        type="text"
                        value={editDose}
                        onChange={(e) => setEditDose(e.target.value)}
                        className="w-full h-11 border border-apricot-200 bg-apricot-50 rounded-xl px-3 text-sm font-semibold text-terracotta-700 outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-terracotta-400 uppercase block">Unidade</label>
                      <input
                        type="text"
                        value={editUnidade}
                        onChange={(e) => setEditUnidade(e.target.value)}
                        className="w-full h-11 border border-apricot-200 bg-apricot-50 rounded-xl px-3 text-sm font-semibold text-terracotta-700 outline-none"
                      />
                    </div>
                  </div>

                  {/* Instructions */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-terracotta-400 uppercase block">Instruções</label>
                    <input
                      type="text"
                      value={editInstrucoes}
                      onChange={(e) => setEditInstrucoes(e.target.value)}
                      className="w-full h-11 border border-apricot-200 bg-apricot-50 rounded-xl px-4 text-sm font-semibold text-terracotta-700 outline-none"
                    />
                  </div>

                  {/* Hours Selector */}
                  <div className="border-t border-apricot-100 pt-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-terracotta-400 uppercase tracking-wider block">Horários das Doses</label>
                      <button
                        type="button"
                        onClick={() => setEditHorarios([...editHorarios, '08:00'])}
                        className="h-7 px-2.5 bg-brand-50 hover:bg-brand-100 text-brand-500 rounded-lg text-xs font-bold transition-all active:scale-95"
                      >
                        ＋ Horário
                      </button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {editHorarios.map((h, index) => (
                        <div key={index} className="flex items-center bg-apricot-50 border border-apricot-200 rounded-xl px-3 py-1.5 justify-between gap-2">
                          <input
                            type="time"
                            value={h}
                            onChange={(e) => {
                              const updated = editHorarios.map((hour, idx) => idx === index ? e.target.value : hour)
                              setEditHorarios(updated)
                            }}
                            className="bg-transparent border-none text-sm font-bold text-terracotta-700 outline-none w-16"
                          />
                          <button
                            type="button"
                            disabled={editHorarios.length <= 1}
                            onClick={() => setEditHorarios(editHorarios.filter((_, idx) => idx !== index))}
                            className="text-red-500 hover:bg-red-50 p-1 rounded disabled:opacity-20 active:scale-90 transition-all"
                          >
                            🗑️
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Weekdays Selector */}
                  <div className="border-t border-apricot-100 pt-3.5 space-y-2">
                    <label className="text-xs font-bold text-terracotta-400 uppercase tracking-wider block">Dias da Semana</label>
                    <div className="flex gap-1.5 flex-wrap">
                      {[{v: 0, l: 'D'}, {v: 1, l: 'S'}, {v: 2, l: 'T'}, {v: 3, l: 'Q'}, {v: 4, l: 'Q'}, {v: 5, l: 'S'}, {v: 6, l: 'S'}].map((dia) => {
                        const selecionado = editDiasSemana.includes(dia.v)
                        return (
                          <button
                            key={dia.v}
                            type="button"
                            onClick={() => {
                              const updated = editDiasSemana.includes(dia.v)
                                ? editDiasSemana.filter((d) => d !== dia.v)
                                : [...editDiasSemana, dia.v]
                              setEditDiasSemana(updated)
                            }}
                            className={`w-8 h-8 rounded-lg text-xs font-bold border transition-all active:scale-90 ${
                              selecionado
                                ? 'bg-brand-500 border-transparent text-white shadow-coral'
                                : 'bg-apricot-50 border-apricot-200 text-terracotta-300'
                            }`}
                          >
                            {dia.l}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>

                {/* Edit Form Buttons */}
                <div className="flex gap-2.5 pt-4 border-t border-apricot-100">
                  <button
                    onClick={() => handleSaveEdit(m.id)}
                    className="flex-1 h-11 bg-brand-500 text-white font-bold rounded-xl hover:bg-brand-600 active:scale-[0.98] transition-all shadow-coral text-sm"
                  >
                    Salvar Alterações
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="px-4 h-11 bg-apricot-100 text-terracotta-500 font-bold rounded-xl hover:bg-apricot-200 active:scale-[0.98] transition-all text-sm"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )
          }

          return (
            <div
              key={m.id}
              className={`bg-white rounded-2xl p-5 shadow-card border border-apricot-200 flex flex-col gap-4 transition-all relative group ${
                !m.ativo ? 'opacity-60' : ''
              }`}
            >
              {/* Header inside Card */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-brand-500 bg-brand-50 px-2.5 py-1 rounded-full font-bold border border-brand-100">
                      👶 {criancaNome}
                    </span>
                    {!m.ativo && (
                      <span className="text-[10px] text-terracotta-400 bg-apricot-100 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                        Inativo
                      </span>
                    )}
                  </div>
                  <h3 className="font-extrabold text-terracotta-700 text-lg mt-2 truncate">
                    {m.nome}
                  </h3>
                  {(m.dose || m.unidade) && (
                    <p className="text-sm text-terracotta-500 font-semibold mt-1">
                      Dose: {m.dose} {m.unidade}
                    </p>
                  )}
                  {m.instrucoes && (
                    <p className="text-xs text-terracotta-400 mt-1 italic line-clamp-2">
                      &ldquo;{m.instrucoes}&rdquo;
                    </p>
                  )}
                </div>

                {/* Switch Button (Touch friendly) */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleAtivo(m.id, m.ativo)}
                    className={`w-14 h-8 rounded-full transition-all duration-300 relative flex items-center p-1 cursor-pointer focus:outline-none ${
                      m.ativo ? 'bg-brand-500' : 'bg-apricot-200'
                    }`}
                    title={m.ativo ? 'Desativar medicação' : 'Ativar medicação'}
                  >
                    <div
                      className={`bg-white w-6 h-6 rounded-full shadow-md transition-all duration-300 transform ${
                        m.ativo ? 'translate-x-6' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Doses Details */}
              {doses.length > 0 && (
                <div className="border-t border-apricot-100 pt-3.5 space-y-3">
                  <p className="text-[10px] font-extrabold text-terracotta-400 uppercase tracking-wider">
                    Horários Planejados
                  </p>
                  <div className="flex flex-col gap-2.5">
                    {doses.map((dose) => {
                      const dias = dose.dias_semana ?? []
                      return (
                        <div
                          key={dose.id}
                          className="flex items-center justify-between gap-3 bg-apricot-100 px-3.5 py-2.5 rounded-xl border border-apricot-200"
                        >
                          <span className="text-sm font-bold text-terracotta-600">
                            ⏰ {formatHorario(dose.horario)}
                          </span>

                          {/* Days of week circles */}
                          <div className="flex gap-1">
                            {DIAS_SIGLAS.map((sigla, idx) => {
                              const selecionado = dias.includes(idx)
                              return (
                                <span
                                  key={idx}
                                  className={`w-5 h-5 rounded-md text-[9px] font-extrabold flex items-center justify-center border transition-all ${
                                    selecionado
                                      ? 'bg-brand-500 border-transparent text-white'
                                      : 'bg-white border-apricot-200 text-terracotta-300'
                                  }`}
                                >
                                  {sigla}
                                </span>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Edit Button */}
              <button
                onClick={() => handleStartEdit(m)}
                className="absolute top-4 right-32 md:top-5 md:right-36 md:opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all h-9 w-9 bg-brand-50 text-brand-500 rounded-xl flex items-center justify-center hover:bg-brand-100 active:scale-90"
                title="Editar medicação"
              >
                ✏️
              </button>

              {/* Delete Button */}
              <button
                onClick={() => handleDelete(m.id)}
                className="absolute top-4 right-20 md:top-5 md:right-24 md:opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all h-9 w-9 bg-red-50 text-red-500 rounded-xl flex items-center justify-center hover:bg-red-100 active:scale-90"
                title="Excluir medicação"
              >
                🗑️
              </button>
            </div>
          )
        })}

        {medicamentos.length === 0 && (
          <div className="bg-white rounded-2xl p-8 shadow-card border border-apricot-200 text-center flex flex-col items-center justify-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-brand-50 flex items-center justify-center">
              <span className="text-4xl">💊</span>
            </div>
            <div>
              <p className="font-bold text-terracotta-700 text-base">Nenhum remédio cadastrado</p>
              <p className="text-xs text-terracotta-400 mt-1">Cadastre seus remédios no botão acima.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
