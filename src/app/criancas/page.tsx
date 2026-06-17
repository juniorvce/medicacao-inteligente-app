'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

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

    load()
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
