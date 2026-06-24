'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { ensureFamiliaAndPerfil } from '@/lib/onboarding'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Fase {
  dias_duracao: number | null
  vezes_por_dia: number
  descricao: string
}

interface MedicamentoParsed {
  nome: string
  dose: string | number | null
  unidade: string | null
  frequencia: string | null
  duracao: string | null
  observacao: string | null
  requires_confirmation: boolean
  esquema_variavel: boolean
  fases: Fase[] | null
}

interface Crianca {
  id: string
  nome: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Horários padrão por frequência diária */
function gerarHorarios(vezesPorDia: number): string[] {
  const mapa: Record<number, string[]> = {
    1: ['08:00'],
    2: ['08:00', '20:00'],
    3: ['08:00', '14:00', '20:00'],
    4: ['08:00', '12:00', '16:00', '20:00'],
    5: ['07:00', '10:00', '13:00', '16:00', '19:00'],
    6: ['06:00', '09:00', '12:00', '15:00', '18:00', '21:00'],
  }
  return mapa[vezesPorDia] ?? mapa[1]
}

/** Converte string de frequência em número de doses por dia */
function frequenciaParaVezes(frequencia: string | null): number {
  if (!frequencia) return 1
  const f = frequencia.toLowerCase()
  if (f.includes('6/6') || f.includes('4x') || f.includes('4 x')) return 4
  if (f.includes('8/8') || f.includes('3x') || f.includes('3 x')) return 3
  if (f.includes('12/12') || f.includes('2x') || f.includes('2 x')) return 2
  if (f.includes('6/6') || f.includes('4x')) return 4
  return 1
}

/** Soma N dias a uma data ISO (YYYY-MM-DD) */
function somarDias(dataISO: string, dias: number): string {
  const d = new Date(dataISO + 'T12:00:00')
  d.setDate(d.getDate() + dias)
  return d.toISOString().slice(0, 10)
}

/** Calcula data_fim a partir da duração texto ("7 dias", "1 semana") */
function calcularDataFim(dataInicioISO: string, duracao: string | null): string | null {
  if (!duracao) return null
  const d = duracao.toLowerCase()
  const match = /(\d+)\s*(dia|semana|mes)/i.exec(d)
  if (!match) return null
  const n = parseInt(match[1], 10)
  const unit = match[2].toLowerCase()
  if (unit.startsWith('semana')) return somarDias(dataInicioISO, n * 7)
  if (unit.startsWith('mes')) return somarDias(dataInicioISO, n * 30)
  return somarDias(dataInicioISO, n)
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ReceitaPage() {
  const supabase = createClient()
  const router = useRouter()

  const [sessionChecked, setSessionChecked] = useState(false)
  const [criancas, setCriancas] = useState<Crianca[]>([])
  const [criancaId, setCriancaId] = useState('')

  const [text, setText] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [medicamentos, setMedicamentos] = useState<MedicamentoParsed[] | null>(null)

  const [dataInicio, setDataInicio] = useState<string>(
    new Date().toISOString().slice(0, 10),
  )
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importCount, setImportCount] = useState<number | null>(null)

  // -------------------------------------------------------------------------
  // Auth + load children
  // -------------------------------------------------------------------------
  useEffect(() => {
    let mounted = true
    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!mounted) return
      if (!session) {
        router.push('/login')
        return
      }

      await ensureFamiliaAndPerfil(supabase, session.user.id, session.user.email)

      const { data } = await supabase
        .from('criancas')
        .select('id, nome')
        .order('nome', { ascending: true })

      if (!mounted) return
      const lista = (data ?? []) as Crianca[]
      setCriancas(lista)
      if (lista.length > 0) setCriancaId(lista[0].id)
      setSessionChecked(true)
    })()
    return () => { mounted = false }
  }, [supabase, router])

  // -------------------------------------------------------------------------
  // Analyze prescription
  // -------------------------------------------------------------------------
  async function handleAnalyze() {
    setParseError(null)
    setMedicamentos(null)
    setImportCount(null)
    setImportError(null)

    const trimmed = text.trim()
    if (!trimmed) {
      setParseError('Cole o texto da receita antes de analisar.')
      return
    }

    setAnalyzing(true)
    try {
      const { data, error } = await supabase.functions.invoke<{
        medicamentos: MedicamentoParsed[]
      }>('parse-prescription', { body: { text: trimmed } })

      if (error) {
        setParseError(error.message ?? 'Erro ao chamar a função de IA.')
        return
      }
      if (!data || !Array.isArray(data.medicamentos)) {
        setParseError('Resposta inesperada da IA. Tente novamente.')
        return
      }
      setMedicamentos(data.medicamentos)
    } catch (e) {
      setParseError(e instanceof Error ? e.message : String(e))
    } finally {
      setAnalyzing(false)
    }
  }

  // -------------------------------------------------------------------------
  // Import to database
  // -------------------------------------------------------------------------
  async function handleImport() {
    if (!medicamentos || medicamentos.length === 0) return
    if (!criancaId) {
      setImportError('Selecione a criança antes de importar.')
      return
    }

    setImportError(null)
    setImporting(true)

    let importados = 0

    try {
      for (const med of medicamentos) {
        // 1. Create medicamento record
        const { data: medRow, error: medErr } = await supabase
          .from('medicamentos')
          .insert({
            crianca_id: criancaId,
            nome: med.nome,
            dose: med.dose != null ? String(med.dose) : null,
            unidade: med.unidade,
            instrucoes: med.observacao,
            ativo: true,
          })
          .select('id')
          .single<{ id: string }>()

        if (medErr || !medRow) {
          throw new Error(`Erro ao criar medicamento "${med.nome}": ${medErr?.message}`)
        }

        // 2. Build doses_planejadas rows
        if (med.esquema_variavel && med.fases && med.fases.length > 0) {
          // Dynamic scheme — one set of rows per phase with data_inicio/data_fim
          let cursor = dataInicio
          for (const fase of med.fases) {
            const faseDataInicio = cursor
            const faseDataFim = fase.dias_duracao != null
              ? somarDias(cursor, fase.dias_duracao - 1)
              : null

            const horarios = gerarHorarios(fase.vezes_por_dia)
            const dosesParaInserir = horarios.map((h) => ({
              medicamento_id: medRow.id,
              horario: `${h}:00`,
              dias_semana: [0, 1, 2, 3, 4, 5, 6],
              ativo: true,
              data_inicio: faseDataInicio,
              data_fim: faseDataFim,
            }))

            const { error: doseErr } = await supabase
              .from('doses_planejadas')
              .insert(dosesParaInserir)
            if (doseErr) {
              throw new Error(`Erro ao criar doses da fase "${fase.descricao}": ${doseErr.message}`)
            }

            if (fase.dias_duracao != null) {
              cursor = somarDias(cursor, fase.dias_duracao)
            }
          }
        } else {
          // Static scheme
          const vezes = frequenciaParaVezes(med.frequencia)
          const horarios = gerarHorarios(vezes)
          const dataFim = calcularDataFim(dataInicio, med.duracao)

          const dosesParaInserir = horarios.map((h) => ({
            medicamento_id: medRow.id,
            horario: `${h}:00`,
            dias_semana: [0, 1, 2, 3, 4, 5, 6],
            ativo: true,
            data_inicio: dataInicio,
            data_fim: dataFim,
          }))

          const { error: doseErr } = await supabase
            .from('doses_planejadas')
            .insert(dosesParaInserir)
          if (doseErr) {
            throw new Error(`Erro ao criar doses de "${med.nome}": ${doseErr.message}`)
          }
        }

        importados++
      }

      setImportCount(importados)
      setMedicamentos(null)
      setText('')
    } catch (e) {
      setImportError(e instanceof Error ? e.message : String(e))
    } finally {
      setImporting(false)
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  if (!sessionChecked) return null

  return (
    <main className="min-h-screen bg-gray-50 pb-10">
      <header className="bg-white shadow-sm px-4 py-4 safe-top">
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <Link href="/dashboard" className="text-gray-400 hover:text-gray-600 text-xl">
            ←
          </Link>
          <div>
            <h1 className="text-lg font-bold text-brand-700">🧾 Ler receita com IA</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              Cole o texto e a IA extrai os medicamentos
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-lg px-4 mt-5 space-y-4">

        {/* ---------------------------------------------------------------- */}
        {/* SUCCESS STATE                                                     */}
        {/* ---------------------------------------------------------------- */}
        {importCount != null && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="bg-brand-600 px-5 py-4 text-white text-center">
              <p className="text-3xl">✅</p>
              <p className="text-base font-bold mt-1">
                {importCount} medicamento{importCount !== 1 ? 's' : ''} importado{importCount !== 1 ? 's' : ''}!
              </p>
              <p className="text-xs opacity-80 mt-0.5">
                Já estão na agenda do dashboard
              </p>
            </div>
            <div className="px-5 py-4 space-y-2">
              <Link
                href="/dashboard"
                className="block w-full bg-brand-600 text-white text-sm font-semibold py-2.5 rounded-xl text-center hover:bg-brand-700 active:scale-95 transition-all"
              >
                Ver agenda de hoje →
              </Link>
              <button
                onClick={() => setImportCount(null)}
                className="w-full text-gray-400 text-sm py-2"
              >
                Analisar outra receita
              </button>
            </div>
          </div>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* INPUT + ANALYZE                                                   */}
        {/* ---------------------------------------------------------------- */}
        {importCount == null && (
          <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
            <label className="text-xs font-semibold text-gray-500">
              Texto da receita (pode ser cópia de foto ou digitado)
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full h-36 border border-gray-200 rounded-xl p-3 text-sm resize-none"
              placeholder={'Ex: Koide D\nDias 1-2: 3x/dia\nDias 3-5: 2x/dia\nDia 6 em diante: 1x/dia e parar'}
            />

            {parseError && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl p-3">
                {parseError}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={handleAnalyze}
                disabled={analyzing || text.trim().length === 0}
                className="flex-1 bg-brand-600 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-brand-700 disabled:opacity-50 active:scale-95 transition-all"
              >
                {analyzing ? 'Analisando…' : '🤖 Analisar receita'}
              </button>
              {text.trim().length > 0 && (
                <button
                  onClick={() => { setText(''); setMedicamentos(null); setParseError(null) }}
                  className="px-3 py-2.5 bg-gray-100 text-gray-500 text-sm rounded-xl"
                >
                  Limpar
                </button>
              )}
            </div>
          </div>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* RESULTS + IMPORT                                                  */}
        {/* ---------------------------------------------------------------- */}
        {medicamentos && importCount == null && (
          <>
            {/* Child + start date selectors */}
            <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
              <p className="text-xs font-semibold text-gray-500">Para quem é a receita?</p>

              {criancas.length === 0 ? (
                <p className="text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-xl p-3">
                  Nenhuma criança cadastrada.{' '}
                  <Link href="/criancas" className="underline font-medium">
                    Cadastre aqui
                  </Link>{' '}
                  antes de importar.
                </p>
              ) : (
                <select
                  value={criancaId}
                  onChange={(e) => setCriancaId(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                >
                  {criancas.map((c) => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </select>
              )}

              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500">
                  Data de início do tratamento
                </label>
                <input
                  type="date"
                  value={dataInicio}
                  onChange={(e) => setDataInicio(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                />
              </div>
            </div>

            {/* Parsed medications */}
            {medicamentos.map((med, idx) => (
              <div
                key={idx}
                className={`bg-white rounded-2xl shadow-sm overflow-hidden border-l-4 ${
                  med.requires_confirmation ? 'border-yellow-400' : 'border-brand-400'
                }`}
              >
                <div className="px-4 pt-4 pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-bold text-gray-800 text-base">{med.nome}</p>
                    {med.requires_confirmation && (
                      <span className="text-yellow-600 bg-yellow-50 border border-yellow-200 text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap">
                        ⚠️ Confirmar
                      </span>
                    )}
                  </div>

                  {(med.dose || med.unidade) && (
                    <p className="text-sm text-gray-500 mt-0.5">
                      {[med.dose != null ? String(med.dose) : null, med.unidade]
                        .filter(Boolean)
                        .join(' ')}
                    </p>
                  )}

                  {!med.esquema_variavel && (
                    <div className="mt-2 space-y-0.5">
                      {med.frequencia && (
                        <p className="text-xs text-gray-400">⏰ {med.frequencia}</p>
                      )}
                      {med.duracao && (
                        <p className="text-xs text-gray-400">📅 {med.duracao}</p>
                      )}
                    </div>
                  )}

                  {med.observacao && (
                    <p className="text-xs text-gray-400 mt-1 italic">{med.observacao}</p>
                  )}
                </div>

                {/* Dynamic scheme phases */}
                {med.esquema_variavel && med.fases && med.fases.length > 0 && (
                  <div className="px-4 pb-4">
                    <p className="text-xs font-semibold text-brand-700 mb-2 mt-1">
                      📉 Esquema progressivo detectado
                    </p>
                    <div className="space-y-1.5">
                      {med.fases.map((fase, fi) => {
                        // Calculate display dates
                        let faseDataInicio = dataInicio
                        for (let i = 0; i < fi; i++) {
                          const prev = med.fases![i]
                          if (prev.dias_duracao != null) {
                            faseDataInicio = somarDias(faseDataInicio, prev.dias_duracao)
                          }
                        }
                        const faseDataFim = fase.dias_duracao != null
                          ? somarDias(faseDataInicio, fase.dias_duracao - 1)
                          : null

                        return (
                          <div
                            key={fi}
                            className="flex items-start gap-2 bg-brand-50 rounded-xl px-3 py-2"
                          >
                            <span className="text-brand-600 font-bold text-xs mt-0.5 min-w-[16px]">
                              {fi + 1}.
                            </span>
                            <div className="flex-1">
                              <p className="text-xs font-medium text-gray-700">
                                {fase.descricao}
                              </p>
                              <p className="text-xs text-gray-400 mt-0.5">
                                {gerarHorarios(fase.vezes_por_dia).join(' · ')}
                                {' · '}
                                {faseDataInicio}
                                {faseDataFim ? ` → ${faseDataFim}` : ' em diante'}
                              </p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Import button */}
            {importError && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-2xl p-3">
                {importError}
              </div>
            )}

            <button
              onClick={handleImport}
              disabled={importing || criancas.length === 0}
              className="w-full bg-brand-600 text-white text-sm font-bold py-3 rounded-xl hover:bg-brand-700 disabled:opacity-50 active:scale-95 transition-all"
            >
              {importing
                ? 'Importando…'
                : `✅ Importar ${medicamentos.length} medicamento${medicamentos.length !== 1 ? 's' : ''} para o app`}
            </button>

            <button
              onClick={() => { setMedicamentos(null); setImportError(null) }}
              className="w-full text-gray-400 text-sm py-2"
            >
              ← Editar receita
            </button>
          </>
        )}
      </div>
    </main>
  )
}