'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { ensureFamiliaAndPerfil } from '@/lib/onboarding'

interface Crianca {
  id: string
  nome: string
  data_nasc: string | null
  foto_url: string | null
  medico: string | null
}

export default function CriancasPage() {
  const [criancas, setCriancas] = useState<Crianca[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [familiaId, setFamiliaId] = useState<string | null>(null)
  const [novoNome, setNovoNome] = useState('')
  const [novaData, setNovaData] = useState('')
  const [novoMedico, setNovoMedico] = useState('')
  const [saving, setSaving] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

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
          .select('id, nome, data_nasc, foto_url, medico')
          .order('nome', { ascending: true })

        if (error) {
          setError(error.message)
        } else {
          setCriancas(data ?? [])
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

  function formatIdade(dataNasc: string | null) {
    if (!dataNasc) return ''
    const nasc = new Date(dataNasc)
    const hoje = new Date()
    let anos = hoje.getFullYear() - nasc.getFullYear()
    const m = hoje.getMonth() - nasc.getMonth()
    if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) {
      anos -= 1
    }
    if (anos === 0) {
      // Calculate months instead if less than 1 year
      const meses = (hoje.getFullYear() - nasc.getFullYear()) * 12 + hoje.getMonth() - nasc.getMonth()
      return `${meses} ${meses !== 1 ? 'meses' : 'mês'}`
    }
    return `${anos} ano${anos !== 1 ? 's' : ''}`
  }

  function getAgeBadge(dataNasc: string | null) {
    if (!dataNasc) return null
    const nasc = new Date(dataNasc)
    const hoje = new Date()
    let anos = hoje.getFullYear() - nasc.getFullYear()
    const m = hoje.getMonth() - nasc.getMonth()
    if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) {
      anos -= 1
    }
    
    if (anos <= 10) {
      return { label: 'Infantil 🦁', class: 'bg-brand-50 text-brand-500 border border-brand-100' }
    } else if (anos <= 17) {
      return { label: 'Teen 🚀', class: 'bg-indigo-50 text-indigo-500 border border-indigo-100' }
    } else {
      return { label: 'Adulto ☕', class: 'bg-emerald-50 text-emerald-600 border border-emerald-100' }
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!familiaId) {
      setError('Não foi possível identificar a família do usuário.')
      return
    }
    if (!novoNome.trim()) {
      setError('Informe o nome da criança.')
      return
    }
    setError(null)
    setSaving(true)

    try {
      const { data, error } = await supabase
        .from('criancas')
        .insert({
          familia_id: familiaId,
          nome: novoNome.trim(),
          data_nasc: novaData || null,
          medico: novoMedico || null,
        })
        .select('id, nome, data_nasc, foto_url, medico')
        .single<Crianca>()

      if (error) {
        setError(error.message)
      } else if (data) {
        setCriancas((prev) => [...prev, data].sort((a, b) => a.nome.localeCompare(b.nome)))
        setNovoNome('')
        setNovaData('')
        setNovoMedico('')
        setShowAddForm(false)
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Erro ao criar criança'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  function handleStartEditChild(c: Crianca) {
    setEditingId(c.id)
    setNovoNome(c.nome)
    setNovaData(c.data_nasc ?? '')
    setNovoMedico(c.medico ?? '')
    setShowAddForm(true)
  }

  async function handleSaveEditChild(e: React.FormEvent) {
    e.preventDefault()
    if (!editingId) return
    if (!novoNome.trim()) {
      setError('Informe o nome.')
      return
    }

    setError(null)
    setSaving(true)

    try {
      const { data, error } = await supabase
        .from('criancas')
        .update({
          nome: novoNome.trim(),
          data_nasc: novaData || null,
          medico: novoMedico || null,
        })
        .eq('id', editingId)
        .select('id, nome, data_nasc, foto_url, medico')
        .single<Crianca>()

      if (error) {
        setError(error.message)
      } else if (data) {
        setCriancas((prev) =>
          prev.map((c) => (c.id === editingId ? data : c)).sort((a, b) => a.nome.localeCompare(b.nome))
        )
        setNovoNome('')
        setNovaData('')
        setNovoMedico('')
        setEditingId(null)
        setShowAddForm(false)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar alterações')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Deseja realmente remover esta criança e todas as suas medicações vinculadas? Esta ação não pode ser desfeita.')) {
      return
    }

    try {
      const { error } = await supabase.from('criancas').delete().eq('id', id)
      if (error) throw error
      setCriancas((prev) => prev.filter((c) => c.id !== id))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao remover criança'
      alert(msg)
    }
  }

  if (loading) {
    return (
      <div className="flex-1 w-full flex items-center justify-center bg-apricot-100 min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <span className="text-3xl animate-bounce">👶</span>
          <span className="text-terracotta-500 text-sm font-semibold animate-pulse">Carregando perfil familiar...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 w-full space-y-4 px-4 py-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-extrabold text-terracotta-600 tracking-tight">Crianças 👶</h2>
          <p className="text-xs text-terracotta-400 font-medium">Gerencie os dependentes da sua família</p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className={`h-11 px-4 text-xs font-bold rounded-xl transition-all duration-300 active:scale-95 flex items-center gap-1.5 ${
            showAddForm
              ? 'bg-apricot-100 text-terracotta-500 border border-apricot-200 hover:bg-apricot-200'
              : 'bg-brand-500 text-white shadow-coral hover:bg-brand-600'
          }`}
        >
          {showAddForm ? 'Fechar' : '＋ Nova Criança'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl p-3.5 font-medium">
          ⚠️ {error}
        </div>
      )}

      {/* FORM: Create Child */}
      {showAddForm && (
        <form
          onSubmit={editingId ? handleSaveEditChild : handleCreate}
          className="bg-white rounded-2xl p-5 shadow-card border border-apricot-200 space-y-4"
        >
          <p className="text-base font-bold text-terracotta-700">
            {editingId ? 'Editar Dependente' : 'Nova Criança'}
          </p>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-terracotta-400 uppercase tracking-wider">Nome</label>
              <input
                type="text"
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
                placeholder="Ex: Joãozinho"
                className="w-full h-12 border border-apricot-200 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent transition-all font-medium bg-apricot-50"
              />
            </div>
            
            <div className="space-y-1">
              <label className="text-xs font-bold text-terracotta-400 uppercase tracking-wider">Data de Nascimento</label>
              <input
                type="date"
                value={novaData}
                onChange={(e) => setNovaData(e.target.value)}
                className="w-full h-12 border border-apricot-200 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent transition-all font-semibold text-terracotta-700 bg-apricot-50"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-terracotta-400 uppercase tracking-wider">Médico Pediatra (Opcional)</label>
              <input
                type="text"
                value={novoMedico}
                onChange={(e) => setNovoMedico(e.target.value)}
                placeholder="Ex: Dr. Silva"
                className="w-full h-12 border border-apricot-200 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent transition-all font-medium bg-apricot-50"
              />
            </div>
          </div>

          <div className="flex gap-2.5">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 h-12 bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold rounded-xl disabled:opacity-50 active:scale-[0.98] transition-all shadow-coral flex items-center justify-center"
            >
              {saving ? 'Salvando...' : editingId ? 'Salvar Alterações' : 'Adicionar'}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={() => {
                  setNovoNome('')
                  setNovaData('')
                  setNovoMedico('')
                  setEditingId(null)
                  setShowAddForm(false)
                }}
                className="px-4 h-12 bg-apricot-100 text-terracotta-500 font-bold rounded-xl hover:bg-apricot-200 active:scale-[0.98] transition-all text-sm"
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
      )}

      {/* Children list */}
      <div className="space-y-3">
        {criancas.map((c) => (
          <div
            key={c.id}
            className="bg-white rounded-2xl p-4 shadow-card border border-apricot-200 flex items-center gap-4 hover:border-brand-200 transition-all group"
          >
            <div className="w-14 h-14 rounded-2xl bg-brand-500 flex items-center justify-center text-2xl font-extrabold text-white flex-shrink-0 shadow-coral">
              {c.nome.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-bold text-terracotta-700 text-base truncate">{c.nome}</p>
                {c.data_nasc && (
                  (() => {
                    const badge = getAgeBadge(c.data_nasc)
                    if (!badge) return null
                    return (
                      <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${badge.class}`}>
                        {badge.label}
                      </span>
                    )
                  })()
                )}
              </div>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {c.data_nasc && (
                  <span className="text-xs text-terracotta-500 bg-apricot-100 px-2 py-1 rounded-lg font-semibold">
                    🎂 {formatIdade(c.data_nasc)}
                  </span>
                )}
                {c.medico && (
                  <span className="text-xs text-brand-500 bg-brand-50 px-2 py-1 rounded-lg font-semibold">
                    🩺 {c.medico}
                  </span>
                )}
              </div>
            </div>
            {/* Edit Profile Button */}
            <button
              onClick={() => handleStartEditChild(c)}
              className="h-9 w-9 rounded-xl bg-brand-50 text-brand-500 flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all hover:bg-brand-100 active:scale-90"
              title="Editar cadastro"
            >
              ✏️
            </button>
            <button
              onClick={() => handleDelete(c.id)}
              className="h-9 w-9 rounded-xl bg-red-50 text-red-500 flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all hover:bg-red-100 active:scale-90"
              title="Excluir dependente"
            >
              🗑️
            </button>
          </div>
        ))}

        {criancas.length === 0 && (
          <div className="bg-white rounded-2xl p-8 shadow-card border border-apricot-200 text-center flex flex-col items-center justify-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-brand-50 flex items-center justify-center">
              <span className="text-4xl">👶</span>
            </div>
            <div>
              <p className="font-bold text-terracotta-700 text-base">Nenhum dependente cadastrado</p>
              <p className="text-xs text-terracotta-400 mt-1">Cadastre suas crianças clicando no botão acima.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
