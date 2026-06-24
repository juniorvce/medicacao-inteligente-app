'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { ensureFamiliaAndPerfil } from '@/lib/onboarding'

interface DosePlanejada {
  id: string
  horario: string
}

interface Medicamento {
  id: string
  crianca_id: string | null
  nome: string
  dose: string | null
  unidade: string | null
  instrucoes: string | null
  ativo: boolean
  crianca_nome: string | null
  horarios: string[]
}

// --- tipos crus retornados pelo Supabase (podem vir como objeto, array ou null) ---
type MaybeArray<T> = T | T[] | null

interface SupaCrianca {
  id: string
  nome: string | null
}

interface SupaDosePlanejada {
  id: string
  horario: string
}

interface SupaMedicamentoRow {
  id: string
  crianca_id: string | null
  nome: string
  dose: string | null
  unidade: string | null
  instrucoes: string | null
  ativo: boolean
  criancas: MaybeArray<SupaCrianca>
  doses_planejadas: SupaDosePlanejada[] | null
}

function firstOrNull<T>(value: MaybeArray<T>): T | null {
  if (Array.isArray(value)) return value.length > 0 ? value[0] : null
  return value ?? null
}

function formatHorario(horario: string) {
  return typeof horario === 'string' && horario.length >= 5
    ? horario.slice(0, 5)
    : horario
}

export default function MedicamentosPage() {
  const [medicamentos, setMedicamentos] = useState<Medicamento[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)

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

      await ensureFamiliaAndPerfil(supabase, session.user.id, session.user.email)

      try {
        const { data, error } = await supabase
          .from('medicamentos')
          .select(
            `id, crianca_id, nome, dose, unidade, instrucoes, ativo,
             criancas:crianca_id ( id, nome ),
             doses_planejadas ( id, horario )`,
          )
          .order('nome', { ascending: true })

        if (error) {
          setError(error.message)
        } else {
          const rows = (data ?? []) as SupaMedicamentoRow[]
          const mapped: Medicamento[] = rows.map((row) => {
            const crianca = firstOrNull(row.criancas)
            const horarios = (row.doses_planejadas ?? [])
              .map((d) => formatHorario(d.horario))
              .sort()

            return {
              id: row.id,
              crianca_id: row.crianca_id,
              nome: row.nome,
              dose: row.dose,
              unidade: row.unidade,
              instrucoes: row.instrucoes,
              ativo: row.ativo,
              crianca_nome: crianca?.nome ?? null,
              horarios,
            }
          })
          setMedicamentos(mapped)
        }
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Erro ao carregar remedios'
        setError(msg)
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [supabase, router])

  async function toggleAtivo(id: string, ativoAtual: boolean) {
    setSavingId(id)
    setError(null)

    const novoAtivo = !ativoAtual

    setMedicamentos((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ativo: novoAtivo } : m)),
    )

    try {
      const { error } = await supabase
        .from('medicamentos')
        .update({ ativo: novoAtivo })
        .eq('id', id)

      if (error) {
        throw error
      }
    } catch (err) {
      // reverte em caso de falha
      setMedicamentos((prev) =>
        prev.map((m) => (m.id === id ? { ...m, ativo: ativoAtual } : m)),
      )
      const msg =
        err instanceof Error ? err.message : 'Erro ao atualizar remedio'
      setError(msg)
    } finally {
      setSavingId(null)
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <span className="text-gray-400 text-sm">Carregando remedios...</span>
      </main>
    )
  }

  const ativos = medicamentos.filter((m) => m.ativo)
  const inativos = medicamentos.filter((m) => !m.ativo)

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
            <h1 className="text-lg font-bold text-gray-800">💊 Remedios</h1>
            <p className="text-xs text-gray-400">
              Cadastro de medicamentos da familia
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

        <Link
          href="/adicionar-remedio"
          className="block w-full bg-brand-600 text-white text-sm font-semibold py-2.5 rounded-xl text-center hover:bg-brand-700 active:scale-95 transition-all"
        >
          + Adicionar remedio
        </Link>

        {medicamentos.length === 0 && !error && (
          <div className="bg-white rounded-2xl p-4 shadow-sm text-center text-sm text-gray-500">
            Nenhum remedio cadastrado ainda.
          </div>
        )}

        {ativos.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1">
              Ativos
            </p>
            {ativos.map((m) => (
              <MedicamentoCard
                key={m.id}
                medicamento={m}
                saving={savingId === m.id}
                onToggleAtivo={() => toggleAtivo(m.id, m.ativo)}
              />
            ))}
          </div>
        )}

        {inativos.length > 0 && (
          <div className="space-y-3 pt-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1">
              Inativos
            </p>
            {inativos.map((m) => (
              <MedicamentoCard
                key={m.id}
                medicamento={m}
                saving={savingId === m.id}
                onToggleAtivo={() => toggleAtivo(m.id, m.ativo)}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

function MedicamentoCard({
  medicamento,
  saving,
  onToggleAtivo,
}: {
  medicamento: Medicamento
  saving: boolean
  onToggleAtivo: () => void
}) {
  const doseLabel = [medicamento.dose, medicamento.unidade]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={`bg-white rounded-2xl p-4 shadow-sm border-l-4 ${
        medicamento.ativo ? 'border-brand-400' : 'border-gray-200 opacity-70'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="font-semibold text-gray-800 text-sm">
            {medicamento.nome}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            {doseLabel || 'Dose nao informada'}
            {medicamento.crianca_nome ? ` · ${medicamento.crianca_nome}` : ''}
          </p>
          {medicamento.horarios.length > 0 && (
            <p className="text-xs text-brand-600 mt-1">
              ⏰ {medicamento.horarios.join(' · ')}
            </p>
          )}
          {medicamento.instrucoes && (
            <p className="text-xs text-gray-400 mt-1">
              {medicamento.instrucoes}
            </p>
          )}
        </div>
        <button
          onClick={onToggleAtivo}
          disabled={saving}
          className={`text-xs font-medium px-3 py-1.5 rounded-lg whitespace-nowrap transition-all active:scale-95 disabled:opacity-50 ${
            medicamento.ativo
              ? 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              : 'bg-brand-50 text-brand-700 hover:bg-brand-100'
          }`}
        >
          {saving ? '...' : medicamento.ativo ? 'Desativar' : 'Reativar'}
        </button>
      </div>
    </div>
  )
}