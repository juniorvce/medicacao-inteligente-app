'use client'

import { useEffect, useState, useRef } from 'react'
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

interface MedicamentoEditavel {
  nome: string
  dose: string
  unidade: string
  observacao: string
  horarios: string[]
  diasSemana: number[]
  esquemaVariavel: boolean
  fases: {
    dias_duracao: number | null
    vezes_por_dia: number
    descricao: string
    horarios?: string[]
  }[] | null
  duracao: string
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

/** Calcula horários distribuídos de acordo com rotina de sono */
function calcularHorariosComSono(vezes: number, acordar: string, dormir: string, evitarSono: boolean): string[] {
  if (!evitarSono) {
    return gerarHorarios(vezes)
  }

  const [hAcordar, mAcordar] = acordar.split(':').map(Number)
  const [hDormir, mDormir] = dormir.split(':').map(Number)

  const minAcordar = hAcordar * 60 + mAcordar
  let minDormir = hDormir * 60 + mDormir
  if (minDormir < minAcordar) {
    minDormir += 24 * 60 // Dorme após a meia-noite
  }

  const totalMinutosAcordado = minDormir - minAcordar
  const horarios: string[] = []

  if (vezes === 1) {
    // 1 dose ao dia: toma 2 horas após acordar (ex: 9h)
    const t = minAcordar + 120
    horarios.push(minutosParaHHMM(t))
  } else {
    // Divide o tempo acordado em intervalos iguais
    const intervalo = Math.floor(totalMinutosAcordado / (vezes - 1))
    for (let i = 0; i < vezes; i++) {
      const t = minAcordar + i * intervalo
      horarios.push(minutosParaHHMM(t))
    }
  }

  return horarios
}

function minutosParaHHMM(minutos: number): string {
  const normalizado = minutos % (24 * 60)
  const h = Math.floor(normalizado / 60)
  const m = normalizado % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Converte string de frequência em número de doses por dia */
function frequenciaParaVezes(frequencia: string | null): number {
  if (!frequencia) return 1
  const f = frequencia.toLowerCase()
  if (f.includes('6/6') || f.includes('4x') || f.includes('4 x')) return 4
  if (f.includes('8/8') || f.includes('3x') || f.includes('3 x')) return 3
  if (f.includes('12/12') || f.includes('2x') || f.includes('2 x')) return 2
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
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [compressing, setCompressing] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [medicamentos, setMedicamentos] = useState<MedicamentoEditavel[] | null>(null)

  const [horaAcordar, setHoraAcordar] = useState('07:00')
  const [horaDormir, setHoraDormir] = useState('22:00')
  const [evitarSono, setEvitarSono] = useState(true)

  const [dataInicio, setDataInicio] = useState<string>(
    new Date().toISOString().slice(0, 10),
  )
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importCount, setImportCount] = useState<number | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

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
  // Handle Camera Photo Selection & Canvas Resize
  // -------------------------------------------------------------------------
  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setParseError(null)
    setCompressing(true)

    const reader = new FileReader()
    reader.onload = (event) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const MAX_WIDTH = 1200
        const MAX_HEIGHT = 1200
        let width = img.width
        let height = img.height

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width
            width = MAX_WIDTH
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height
            height = MAX_HEIGHT
          }
        }

        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height)
          // 80% JPEG compression is the perfect balance for OCR legibility and weight
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.8)
          setImagePreview(compressedBase64)
          setText('') // clear text when image is loaded
        }
        setCompressing(false)
      }
      img.src = event.target?.result as string
    }
    reader.readAsDataURL(file)
  }

  function handleRemoveImage() {
    setImagePreview(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // -------------------------------------------------------------------------
  // Analyze prescription via Supabase Edge Function
  // -------------------------------------------------------------------------
  async function handleAnalyze() {
    setParseError(null)
    setMedicamentos(null)
    setImportCount(null)
    setImportError(null)

    if (!text.trim() && !imagePreview) {
      setParseError('Cole o texto da receita ou tire uma foto antes de analisar.')
      return
    }

    setAnalyzing(true)
    try {
      const payload = imagePreview
        ? { image: imagePreview }
        : { text: text.trim() }

      const { data, error } = await supabase.functions.invoke<{
        medicamentos: MedicamentoParsed[]
      }>('parse-prescription', { body: payload })

      if (error) {
        setParseError(error.message ?? 'Erro ao chamar a função de IA.')
        return
      }
      if (!data || !Array.isArray(data.medicamentos)) {
        setParseError('Resposta inesperada da IA. Tente novamente.')
        return
      }

      const mapped: MedicamentoEditavel[] = data.medicamentos.map((med) => {
        const vezes = med.esquema_variavel ? 1 : frequenciaParaVezes(med.frequencia)
        const defaultHorarios = med.esquema_variavel
          ? []
          : calcularHorariosComSono(vezes, horaAcordar, horaDormir, evitarSono)

        let fasesMapped = null
        if (med.esquema_variavel && med.fases) {
          fasesMapped = med.fases.map((f) => ({
            ...f,
            horarios: calcularHorariosComSono(f.vezes_por_dia, horaAcordar, horaDormir, evitarSono),
          }))
        }

        return {
          nome: med.nome,
          dose: med.dose != null ? String(med.dose) : '',
          unidade: med.unidade ?? 'ml',
          observacao: med.observacao ?? '',
          horarios: defaultHorarios,
          diasSemana: [0, 1, 2, 3, 4, 5, 6],
          esquemaVariavel: med.esquema_variavel,
          fases: fasesMapped,
          duracao: med.duracao ?? '7 dias',
        }
      })

      setMedicamentos(mapped)
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
        if (med.esquemaVariavel && med.fases && med.fases.length > 0) {
          let cursor = dataInicio
          for (const fase of med.fases) {
            const faseDataInicio = cursor
            const faseDataFim = fase.dias_duracao != null
              ? somarDias(cursor, fase.dias_duracao - 1)
              : null

            const horarios = fase.horarios ?? calcularHorariosComSono(fase.vezes_por_dia, horaAcordar, horaDormir, evitarSono)
            const dosesParaInserir = horarios.map((h) => ({
              medicamento_id: medRow.id,
              horario: h.length === 5 ? `${h}:00` : h,
              dias_semana: med.diasSemana,
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
          const dataFim = calcularDataFim(dataInicio, med.duracao)

          const dosesParaInserir = med.horarios.map((h) => ({
            medicamento_id: medRow.id,
            horario: h.length === 5 ? `${h}:00` : h,
            dias_semana: med.diasSemana,
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
      setImagePreview(null)
    } catch (e) {
      setImportError(e instanceof Error ? e.message : String(e))
    } finally {
      setImporting(false)
    }
  }

  if (!sessionChecked) return null

  return (
    <div className="flex-1 w-full space-y-4 px-4 py-6">
      {/* Page Header */}
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-extrabold text-terracotta-600 tracking-tight">Leitura de Receita 📷</h2>
        <p className="text-xs text-terracotta-400 font-medium">Extraia remédios instantaneamente usando Inteligência Artificial</p>
      </div>

      <div className="space-y-4">
        {/* SUCCESS STATE */}
        {importCount != null && (
          <div className="bg-white rounded-2xl shadow-card border border-apricot-200 overflow-hidden">
            <div className="bg-brand-500 px-5 py-6 text-white text-center flex flex-col items-center gap-2">
              <span className="text-4xl animate-bounce">🎉</span>
              <p className="text-lg font-bold">
                {importCount} medicamento{importCount !== 1 ? 's' : ''} importado{importCount !== 1 ? 's' : ''}!
              </p>
              <p className="text-xs opacity-90">
                Os horários já foram criados na agenda do dashboard.
              </p>
            </div>
            <div className="px-5 py-4 space-y-2.5">
              <Link
                href="/dashboard"
                className="block w-full bg-brand-500 text-white text-sm font-bold h-12 rounded-xl flex items-center justify-center hover:bg-brand-600 active:scale-[0.98] transition-all shadow-coral"
              >
                Ver agenda de hoje →
              </Link>
              <button
                onClick={() => setImportCount(null)}
                className="w-full text-terracotta-400 text-sm py-2 font-medium hover:text-terracotta-600 transition-all"
              >
                Analisar outra receita
              </button>
            </div>
          </div>
        )}

        {/* INPUT + ANALYZE */}
        {importCount == null && (
          <div className="bg-white rounded-2xl p-5 shadow-card border border-apricot-200 space-y-4">
            {/* Hidden Input for Camera/Gallery */}
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              className="hidden"
              onChange={handleImageChange}
            />

            {/* Toggle Modes: Camera vs Text */}
            {!imagePreview && (
              <div className="grid grid-cols-1 gap-3">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={compressing || analyzing}
                  className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-apricot-200 rounded-2xl hover:bg-apricot-50 hover:border-brand-400 transition-all text-terracotta-400 hover:text-brand-500 cursor-pointer active:scale-[0.98] h-32"
                >
                  <span className="text-3xl mb-1.5">📸</span>
                  <span className="text-sm font-bold">Tirar foto da receita</span>
                  <span className="text-xs text-terracotta-300 mt-0.5">Ou selecionar da galeria</span>
                </button>

                <div className="flex items-center gap-3">
                  <div className="flex-1 border-t border-apricot-200" />
                  <span className="text-xs font-semibold text-terracotta-300 uppercase tracking-wider">ou digite</span>
                  <div className="flex-1 border-t border-apricot-200" />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-terracotta-400 uppercase tracking-wider">
                    Copie ou digite o texto da receita
                  </label>
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    className="w-full h-32 border border-apricot-200 bg-apricot-50 rounded-xl p-3.5 text-sm resize-none focus:ring-2 focus:ring-brand-400 focus:border-transparent outline-none transition-all"
                    placeholder={'Ex: Koide D\nDias 1-2: 3x/dia\nDias 3-5: 2x/dia\nDia 6 em diante: 1x/dia e parar'}
                  />
                </div>
              </div>
            )}

            {/* Image Preview Thumbnail */}
            {imagePreview && (
              <div className="relative bg-apricot-50 border border-apricot-200 rounded-2xl p-3 flex items-center gap-4">
                <div className="relative w-16 h-16 rounded-xl overflow-hidden border border-apricot-200 bg-black flex-shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imagePreview} alt="Receita capturada" className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-terracotta-700 truncate">Foto da receita carregada</p>
                  <p className="text-xs text-terracotta-400 mt-0.5">Pronta para leitura por Inteligência Artificial</p>
                </div>
                <button
                  onClick={handleRemoveImage}
                  className="h-9 px-3 bg-red-50 text-red-500 rounded-lg text-xs font-bold hover:bg-red-100 transition-all active:scale-[0.95]"
                >
                  Remover
                </button>
              </div>
            )}

            {parseError && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl p-3.5 font-medium">
                ⚠️ {parseError}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={handleAnalyze}
                disabled={analyzing || compressing || (!text.trim() && !imagePreview)}
                className="flex-1 h-12 bg-brand-500 text-white text-sm font-bold rounded-xl hover:bg-brand-600 disabled:opacity-50 active:scale-[0.98] transition-all shadow-coral"
              >
                {analyzing ? '🧙‍♂️ IA Lendo Receita...' : compressing ? 'Compressão da foto...' : '🤖 Analisar receita'}
              </button>
              {(text.trim().length > 0 || imagePreview) && (
                <button
                  onClick={() => {
                    setText('')
                    handleRemoveImage()
                    setMedicamentos(null)
                    setParseError(null)
                  }}
                  className="h-12 px-4 bg-apricot-100 text-terracotta-500 font-bold text-sm rounded-xl hover:bg-apricot-200 active:scale-[0.98] transition-all"
                >
                  Limpar
                </button>
              )}
            </div>
          </div>
        )}

        {/* RESULTS + CONFIRMATION FORM */}
        {medicamentos && importCount == null && (
          <>
            {/* Child Selector and treatment Start Date */}
            <div className="bg-white rounded-2xl p-5 shadow-card border border-apricot-200 space-y-4">
              <h3 className="text-base font-bold text-terracotta-700">Definições do Tratamento</h3>

              {criancas.length === 0 ? (
                <p className="text-sm text-terracotta-600 bg-apricot-100 border border-apricot-200 rounded-xl p-3.5 font-medium">
                  Nenhuma criança cadastrada.{' '}
                  <Link href="/criancas" className="underline font-bold text-brand-500">
                    Cadastre uma criança aqui
                  </Link>{' '}
                  antes de fazer a importação.
                </p>
              ) : (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-terracotta-400 uppercase tracking-wider">Criança que receberá o remédio</label>
                  <select
                    value={criancaId}
                    onChange={(e) => setCriancaId(e.target.value)}
                    className="w-full h-12 border border-apricot-200 bg-apricot-50 rounded-xl px-3 text-sm focus:ring-2 focus:ring-brand-400 focus:border-transparent outline-none transition-all font-semibold text-terracotta-700"
                  >
                    {criancas.map((c) => (
                      <option key={c.id} value={c.id}>{c.nome}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-bold text-terracotta-400 uppercase tracking-wider">
                  Data de início do tratamento
                </label>
                <input
                  type="date"
                  value={dataInicio}
                  onChange={(e) => setDataInicio(e.target.value)}
                  className="w-full h-12 border border-apricot-200 bg-apricot-50 rounded-xl px-3 text-sm focus:ring-2 focus:ring-brand-400 focus:border-transparent outline-none transition-all font-semibold text-terracotta-700"
                />
              </div>

              {/* Sleep Routine Adjustments */}
              <div className="border-t border-apricot-100 pt-4 space-y-3.5">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="evitarSono"
                    checked={evitarSono}
                    onChange={(e) => {
                      const checked = e.target.checked
                      setEvitarSono(checked)
                      if (medicamentos) {
                        setMedicamentos(medicamentos.map(med => {
                          if (med.esquemaVariavel) {
                            if (med.fases) {
                              const updatedFases = med.fases.map(f => ({
                                ...f,
                                horarios: calcularHorariosComSono(f.vezes_por_dia, horaAcordar, horaDormir, checked)
                              }))
                              return { ...med, fases: updatedFases }
                            }
                            return med
                          }
                          const vezes = med.horarios.length
                          return {
                            ...med,
                            horarios: calcularHorariosComSono(vezes, horaAcordar, horaDormir, checked)
                          }
                        }))
                      }
                    }}
                    className="w-5 h-5 rounded text-brand-500 border-apricot-200 focus:ring-brand-400"
                  />
                  <label htmlFor="evitarSono" className="text-xs font-bold text-terracotta-600 cursor-pointer">
                    🛡️ Ajustar horários para proteger o sono
                  </label>
                </div>

                {evitarSono && (
                  <div className="grid grid-cols-2 gap-3 bg-apricot-50 p-3.5 rounded-xl border border-apricot-200">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-terracotta-400 uppercase">Acordar às</label>
                      <input
                        type="time"
                        value={horaAcordar}
                        onChange={(e) => {
                          const val = e.target.value
                          setHoraAcordar(val)
                          if (medicamentos) {
                            setMedicamentos(medicamentos.map(med => {
                              if (med.esquemaVariavel) {
                                if (med.fases) {
                                  const updatedFases = med.fases.map(f => ({
                                    ...f,
                                    horarios: calcularHorariosComSono(f.vezes_por_dia, val, horaDormir, evitarSono)
                                  }))
                                  return { ...med, fases: updatedFases }
                                }
                                return med
                              }
                              return {
                                ...med,
                                horarios: calcularHorariosComSono(med.horarios.length, val, horaDormir, evitarSono)
                              }
                            }))
                          }
                        }}
                        className="w-full h-10 border border-apricot-200 rounded-lg px-2 text-xs font-bold text-terracotta-700 bg-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-terracotta-400 uppercase">Dormir às</label>
                      <input
                        type="time"
                        value={horaDormir}
                        onChange={(e) => {
                          const val = e.target.value
                          setHoraDormir(val)
                          if (medicamentos) {
                            setMedicamentos(medicamentos.map(med => {
                              if (med.esquemaVariavel) {
                                if (med.fases) {
                                  const updatedFases = med.fases.map(f => ({
                                    ...f,
                                    horarios: calcularHorariosComSono(f.vezes_por_dia, horaAcordar, val, evitarSono)
                                  }))
                                  return { ...med, fases: updatedFases }
                                }
                                return med
                              }
                              return {
                                ...med,
                                horarios: calcularHorariosComSono(med.horarios.length, horaAcordar, val, evitarSono)
                              }
                            }))
                          }
                        }}
                        className="w-full h-10 border border-apricot-200 rounded-lg px-2 text-xs font-bold text-terracotta-700 bg-white"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* List of extracted medications */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-terracotta-400 uppercase tracking-wider px-1">Medicamentos identificados pela IA</h3>
              {medicamentos.map((med, idx) => (
                <div
                  key={idx}
                  className="bg-white rounded-2xl shadow-card overflow-hidden border border-apricot-200 relative group"
                >
                  <div className="p-5 space-y-4">
                    {/* Header: Name input + Remove Button */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <label className="text-[9px] font-bold text-terracotta-400 uppercase block mb-1">Nome do Medicamento</label>
                        <input
                          type="text"
                          value={med.nome}
                          onChange={(e) => {
                            const val = e.target.value
                            setMedicamentos(prev => prev!.map((m, i) => i === idx ? { ...m, nome: val } : m))
                          }}
                          className="font-bold text-terracotta-700 text-base border border-apricot-200 bg-apricot-50 rounded-xl h-10 px-3 outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent w-full transition-all"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setMedicamentos(prev => prev!.filter((_, i) => i !== idx))
                        }}
                        className="h-10 w-10 rounded-xl bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-100 active:scale-90 transition-all self-end"
                        title="Remover medicamento"
                      >
                        🗑️
                      </button>
                    </div>

                    {/* Dosage and duration edit row */}
                    <div className="grid grid-cols-3 gap-2.5">
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-terracotta-400 uppercase">Dose</label>
                        <input
                          type="text"
                          value={med.dose}
                          onChange={(e) => {
                            const val = e.target.value
                            setMedicamentos(prev => prev!.map((m, i) => i === idx ? { ...m, dose: val } : m))
                          }}
                          className="w-full h-10 border border-apricot-200 bg-apricot-50 rounded-xl px-3 text-xs font-semibold text-terracotta-700 outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-terracotta-400 uppercase">Unidade</label>
                        <input
                          type="text"
                          value={med.unidade}
                          onChange={(e) => {
                            const val = e.target.value
                            setMedicamentos(prev => prev!.map((m, i) => i === idx ? { ...m, unidade: val } : m))
                          }}
                          className="w-full h-10 border border-apricot-200 bg-apricot-50 rounded-xl px-3 text-xs font-semibold text-terracotta-700 outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-terracotta-400 uppercase">Duração</label>
                        <input
                          type="text"
                          value={med.duracao}
                          onChange={(e) => {
                            const val = e.target.value
                            setMedicamentos(prev => prev!.map((m, i) => i === idx ? { ...m, duracao: val } : m))
                          }}
                          className="w-full h-10 border border-apricot-200 bg-apricot-50 rounded-xl px-3 text-xs font-semibold text-terracotta-700 outline-none"
                        />
                      </div>
                    </div>

                    {/* Observation input */}
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-terracotta-400 uppercase">Observações / Instruções</label>
                      <input
                        type="text"
                        value={med.observacao}
                        onChange={(e) => {
                          const val = e.target.value
                          setMedicamentos(prev => prev!.map((m, i) => i === idx ? { ...m, observacao: val } : m))
                        }}
                        placeholder="Sem observações"
                        className="w-full h-10 border border-apricot-200 bg-apricot-50 rounded-xl px-3 text-xs font-medium text-terracotta-700 outline-none"
                      />
                    </div>

                    {/* Standard non-variable hours edit */}
                    {!med.esquemaVariavel && (
                      <div className="border-t border-apricot-100 pt-3.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-extrabold text-terracotta-400 uppercase tracking-wider">Horários das Doses</p>
                          <button
                            type="button"
                            onClick={() => {
                              setMedicamentos(prev => prev!.map((m, i) => i === idx ? { ...m, horarios: [...m.horarios, '08:00'] } : m))
                            }}
                            className="h-7 px-2.5 bg-brand-50 hover:bg-brand-100 text-brand-500 rounded-lg text-[10px] font-bold transition-all active:scale-95"
                          >
                            ＋ Horário
                          </button>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {med.horarios.map((h, hIdx) => (
                            <div key={hIdx} className="flex items-center bg-apricot-50 border border-apricot-200 rounded-xl px-3 py-1.5 justify-between gap-2">
                              <input
                                type="time"
                                value={h.slice(0, 5)}
                                onChange={(e) => {
                                  const val = e.target.value
                                  setMedicamentos(prev => prev!.map((m, mI) => mI === idx ? {
                                    ...m,
                                    horarios: m.horarios.map((hour, hI) => hI === hIdx ? val : hour)
                                  } : m))
                                }}
                                className="bg-transparent border-none text-xs font-bold text-terracotta-700 outline-none w-16"
                              />
                              <button
                                type="button"
                                disabled={med.horarios.length <= 1}
                                onClick={() => {
                                  setMedicamentos(prev => prev!.map((m, mI) => mI === idx ? {
                                    ...m,
                                    horarios: m.horarios.filter((_, hI) => hI !== hIdx)
                                  } : m))
                                }}
                                className="text-red-500 hover:bg-red-50 p-1 rounded transition-all disabled:opacity-20 active:scale-90"
                              >
                                🗑️
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Weekdays Selector */}
                    <div className="border-t border-apricot-100 pt-3.5 space-y-2">
                      <p className="text-[10px] font-extrabold text-terracotta-400 uppercase tracking-wider block">Dias da Semana</p>
                      <div className="flex gap-1.5 flex-wrap">
                        {[{v: 0, l: 'D'}, {v: 1, l: 'S'}, {v: 2, l: 'T'}, {v: 3, l: 'Q'}, {v: 4, l: 'Q'}, {v: 5, l: 'S'}, {v: 6, l: 'S'}].map((dia) => {
                          const selecionado = med.diasSemana.includes(dia.v)
                          return (
                            <button
                              key={dia.v}
                              type="button"
                              onClick={() => {
                                const dias = med.diasSemana.includes(dia.v)
                                  ? med.diasSemana.filter(d => d !== dia.v)
                                  : [...med.diasSemana, dia.v]
                                setMedicamentos(prev => prev!.map((m, i) => i === idx ? { ...m, diasSemana: dias } : m))
                              }}
                              className={`w-8 h-8 rounded-lg text-[10px] font-bold border transition-all active:scale-90 ${
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

                  {/* Schema Variable Phases details */}
                  {med.esquemaVariavel && med.fases && med.fases.length > 0 && (
                    <div className="px-5 pb-5 pt-0 space-y-3">
                      <p className="text-xs font-extrabold text-brand-500 mb-1">
                        📉 Esquema Progressivo / Tapering Detectado:
                      </p>
                      <div className="space-y-3">
                        {med.fases.map((fase, fi) => {
                          const faseHorarios = fase.horarios ?? []
                          return (
                            <div
                              key={fi}
                              className="bg-brand-50 rounded-xl p-3 border border-brand-100 space-y-2.5"
                            >
                              <p className="text-xs font-bold text-terracotta-700">
                                {fi + 1}. {fase.descricao}
                              </p>
                              
                              {/* Edit phase times */}
                              <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                  <label className="text-[9px] font-bold text-terracotta-400 uppercase">Horários da Fase</label>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updatedFases = med.fases!.map((f, i) => i === fi ? {
                                        ...f,
                                        horarios: [...(f.horarios ?? []), '08:00']
                                      } : f)
                                      setMedicamentos(prev => prev!.map((m, mI) => mI === idx ? { ...m, fases: updatedFases } : m))
                                    }}
                                    className="text-[9px] font-bold text-brand-500 hover:underline"
                                  >
                                    ＋ Adicionar
                                  </button>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  {faseHorarios.map((h, hIdx) => (
                                    <div key={hIdx} className="flex items-center bg-white border border-brand-100 rounded-lg px-2 py-1 justify-between gap-1">
                                      <input
                                        type="time"
                                        value={h.slice(0, 5)}
                                        onChange={(e) => {
                                          const val = e.target.value
                                          const updatedFases = med.fases!.map((f, i) => i === fi ? {
                                            ...f,
                                            horarios: f.horarios!.map((hour, hI) => hI === hIdx ? val : hour)
                                          } : f)
                                          setMedicamentos(prev => prev!.map((m, mI) => mI === idx ? { ...m, fases: updatedFases } : m))
                                        }}
                                        className="bg-transparent border-none text-xs font-bold text-terracotta-700 outline-none w-16"
                                      />
                                      <button
                                        type="button"
                                        disabled={faseHorarios.length <= 1}
                                        onClick={() => {
                                          const updatedFases = med.fases!.map((f, i) => i === fi ? {
                                            ...f,
                                            horarios: f.horarios!.filter((_, hI) => hI !== hIdx)
                                          } : f)
                                          setMedicamentos(prev => prev!.map((m, mI) => mI === idx ? { ...m, fases: updatedFases } : m))
                                        }}
                                        className="text-red-500 text-xs hover:bg-red-50 p-1 rounded disabled:opacity-20"
                                      >
                                        🗑️
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {importError && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl p-3.5 font-medium">
                ⚠️ {importError}
              </div>
            )}

            <button
              onClick={handleImport}
              disabled={importing || criancas.length === 0}
              className="w-full h-12 bg-brand-500 hover:bg-brand-600 text-white font-bold rounded-xl active:scale-[0.98] transition-all shadow-coral flex items-center justify-center gap-2"
            >
              {importing ? 'Sincronizando com o banco...' : 'Confirmar e Criar Agenda'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
