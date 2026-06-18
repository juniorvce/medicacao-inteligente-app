'use client'

import { useEffect, useState } from 'react'
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
          .select('id, nome, data_nasc, foto_url, medico')
          .order('nome', { ascending: true })

        if (error) {
          setError(error.message)
        } else {
          setCriancas(data ?? [])
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

  function formatIdade(dataNasc: string | null) {
    if (!dataNasc) return ''
    const nasc = new Date(dataNasc)
    const hoje = new Date()
    let anos = hoje.getFullYear() - nasc.getFullYear()
    const m = hoje.getMonth() - nasc.getMonth()
    if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) {
      anos -= 1
    }
    return `${anos} ano${anos !== 1 ? 's' : ''}`
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!familiaId) {
      setError('Nao foi possivel identificar a familia do usuario.')
      return
    }
    if (!novoNome.trim()) {
      setError('Informe o nome da crianca.')
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
        setCriancas((prev) => [...prev, data])
        setNovoNome('')
        setNovaData('')
        setNovoMedico('')
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Erro ao criar crianca'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <span className="text-gray-400 text-sm">Carregando criancas...</span>
      </main>
    )
  }

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
            <h1 className="text-lg font-bold text-gray-800">👶 Criancas</h1>
            <p className="text-xs text-gray-400">Dependentes da sua familia</p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-lg px-4 mt-5 space-y-3">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-2xl p-3">
            {error}
          </div>
        )}

        <form
          onSubmit={handleCreate}
          className="bg-white rounded-2xl p-4 shadow-sm space-y-3"
        >
          <p className="text-sm font-semibold text-gray-700">
            Nova crianca
          </p>
          <input
            type="text"
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            placeholder="Nome"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={novaData}
            onChange={(e) => setNovaData(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
          />
          <input
            type="text"
            value={novoMedico}
            onChange={(e) => setNovoMedico(e.target.value)}
            placeholder="Medico (opcional)"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={saving}
            className="w-full bg-green-600 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-green-700 disabled:opacity-50 active:scale-95 transition-all"
          >
            {saving ? 'Salvando...' : 'Adicionar crianca'}
          </button>
        </form>

        {criancas.length === 0 && !error && (
          <div className="bg-white rounded-2xl p-4 shadow-sm text-center text-sm text-gray-500">
            Nenhuma crianca cadastrada ainda.
          </div>
        )}

        {criancas.map((c) => (
          <div
            key={c.id}
            className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3"
          >
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-100 to-green-50 flex items-center justify-center text-lg">
              {c.nome.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1">
              <p className="font-medium text-gray-800 text-sm">{c.nome}</p>
              <p className="text-xs text-gray-400">
                {formatIdade(c.data_nasc)} {c.medico ? `· ${c.medico}` : ''}
              </p>
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}