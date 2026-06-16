'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`
      }
    })

    if (error) {
      setError(error.message)
    } else {
      setSent(true)
    }
    setLoading(false)
  }

  if (sent) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm text-center space-y-4">
          <span className="text-5xl">📬</span>
          <h2 className="text-xl font-bold text-gray-800">Verifique seu e-mail</h2>
          <p className="text-gray-500 text-sm">
            Enviamos um link de acesso para <strong>{email}</strong>.
            Abra o e-mail e clique no link para entrar.
          </p>
          <button
            onClick={() => setSent(false)}
            className="text-brand-600 text-sm underline"
          >
            Usar outro e-mail
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <span className="text-5xl">💊</span>
          <h1 className="text-2xl font-bold text-gray-800 mt-2">Entrar</h1>
          <p className="text-sm text-gray-500 mt-1">Digite seu e-mail para receber o link de acesso</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <input
            type="email"
            placeholder="seu@email.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-600 text-white py-3 rounded-xl font-semibold hover:bg-brand-700 disabled:opacity-50 active:scale-95 transition-all"
          >
            {loading ? 'Enviando...' : 'Enviar link de acesso'}
          </button>
        </form>

        <div className="text-center">
          <Link href="/" className="text-sm text-gray-400 hover:text-gray-600">
            Voltar ao inicio
          </Link>
        </div>
      </div>
    </main>
  )
}
