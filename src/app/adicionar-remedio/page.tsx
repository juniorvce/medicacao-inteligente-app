'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { ensureFamiliaAndPerfil } from '@/lib/onboarding'

interface Crianca {
  id: string
  nome: string
}

const UNIDADES = ['mg', 'ml', 'comprimido(s)', 'gota(s)', 'sache(s)'] as const

const DIAS_SEMANA = [
  { valor: 0, label: 'Dom' },
  { valor: 1, label: 'Seg' },
  { valor: 2, label: 'Ter' },
  { valor: 3, label: 'Qua' },
  { valor: 4, label: 'Qui' },
  { valor: 5, label: 'Sex' },
  { valor: 6, label: 'Sab' },
]

// Lista apenas para sugestao de digitacao (autocomplete). O app nao define dose
// nem orientacao clinica - quem preenche e o responsavel, com base na prescricao.
const SUGESTOES_NOME = [
  'Paracetamol',
  'Dipirona',
  'Ibuprofeno',
  'Amoxicilina',
  'Azitromicina',
  'Prednisolona',
  'Loratadina',
  'Salbutamol',
  'Omeprazol',
  'Vitamina D',
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
          err instanceof Error ? err.message : 'Erro ao carregar criancas'
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
      setError('Nao foi possivel identificar a familia do usuario.')
      return
    }
    if (criancas.length === 0) {
      setError('Cadastre uma crianca antes de adicionar um remedio.')
      return
    }
    if (!criancaId) {
      setError('Selecione a crianca.')
      return
    }
    if (!nome.trim()) {
      setError('Informe o nome do remedio.')
      return
    }
    const horariosValidos = horarios
      .map((h) => h.trim())
      .filter((h) => h.length > 0)
    if (horariosValidos.length === 0) {
      setError('Informe ao menos um horario.')
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
        throw medError ?? new Error('Erro ao criar remedio')
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
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Erro ao salvar remedio'
      setError(msg)
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <span className="text-gray-400 text-sm">Carregando...</span>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50 pb-10">
      <header className="bg-white shadow-sm px-4 py-4">
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <Link
            href="/medicamentos"
            className="text-gray-400 hover:text-gray-600 text-xl"
          >
            ←
          </Link>
          <div>
            <h1 className="text-lg font-bold text-gray-800">
              + Adicionar remedio
            </h1>
            <p className="text-xs text-gray-400">
              Organize o que esta na prescricao
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-lg px-4 mt-5 space-y-3">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-2xl p-3">
            {error}
          </div>
        )}

        {criancas.length === 0 && !error && (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 text-sm rounded-2xl p-3">
            Nenhuma crianca cadastrada.{' '}
            <Link href="/criancas" className="underline font-medium">
              Cadastre uma crianca primeiro
            </Link>
            .
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl p-4 shadow-sm space-y-4"
        >
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-500">
              Crianca
            </label>
            <select
              value={criancaId}
              onChange={(e) => setCriancaId(e.target.value)}
              disabled={criancas.length === 0}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm disabled:bg-gray-50"
            >
              {criancas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-500">
              Nome do remedio
            </label>
            <input
              type="text"
              list="sugestoes-remedio"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Amoxicilina"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
            />
            <datalist id="sugestoes-remedio">
              {SUGESTOES_NOME.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-500">
                Dose (conforme prescricao)
              </label>
              <input
                type="text"
                value={dose}
                onChange={(e) => setDose(e.target.value)}
                placeholder="Ex: 5"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-500">
                Unidade
              </label>
              <select
                value={unidade}
                onChange={(e) => setUnidade(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              >
                {UNIDADES.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-500">
              Instrucoes (texto da prescricao)
            </label>
            <textarea
              value={instrucoes}
              onChange={(e) => setInstrucoes(e.target.value)}
              placeholder="Ex: Tomar apos as refeicoes"
              rows={2}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-500">
              Horarios
            </label>
            <div className="space-y-2">
              {horarios.map((h, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="time"
                    value={h}
                    onChange={(e) => updateHorario(i, e.target.value)}
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  />
                  {horarios.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeHorario(i)}
                      className="text-gray-400 hover:text-red-500 text-sm px-2"
                    >
                      remover
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addHorario}
              className="text-brand-600 text-xs font-medium hover:text-brand-700"
            >
              + Adicionar horario
            </button>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-500">
              Dias da semana
            </label>
            <div className="flex flex-wrap gap-2">
              {DIAS_SEMANA.map((d) => {
                const ativo = diasSelecionados.includes(d.valor)
                return (
                  <button
                    key={d.valor}
                    type="button"
                    onClick={() => toggleDia(d.valor)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all active:scale-95 ${
                      ativo
                        ? 'bg-brand-600 text-white'
                        : 'bg-gray-100 text-gray-400'
                    }`}
                  >
                    {d.label}
                  </button>
                )
              })}
            </div>
          </div>

          <button
            type="submit"
            disabled={saving || criancas.length === 0}
            className="w-full bg-brand-600 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-brand-700 disabled:opacity-50 active:scale-95 transition-all"
          >
            {saving ? 'Salvando...' : 'Salvar remedio'}
          </button>
        </form>
      </div>
    </main>
  )
}