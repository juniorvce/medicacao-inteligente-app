'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState({ text: '', type: '' })
  const router = useRouter()
  const supabase = createClient()

  const handleLogin = async (type: 'magic_link' | 'password') => {
    if (!email) {
      setMessage({ text: 'Informe seu email.', type: 'error' })
      return
    }

    if (type === 'password' && !password) {
      setMessage({ text: 'Informe sua senha.', type: 'error' })
      return
    }

    setLoading(true)
    setMessage({ text: '', type: '' })

    try {
      if (type === 'magic_link') {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        })

        if (error) throw error

        setMessage({
          text: 'Link enviado! Verifique seu email.',
          type: 'success',
        })
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (error) throw error

        router.push('/dashboard')
        router.refresh()
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao fazer login'
      setMessage({ text: msg, type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm p-6 space-y-5">
        <div className="text-center">
          <span className="text-5xl">💊</span>
          <h1 className="text-2xl font-bold text-gray-900 mt-2">
            Medicacao Inteligente
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Entre com senha ou receba um link magico
          </p>
        </div>

        {message.text && (
          <div
            className={`p-3 rounded-xl text-sm font-medium ${
              message.type === 'success'
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition"
              placeholder="seu@email.com"
              autoComplete="email"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Senha
              <span className="text-gray-400 font-normal ml-1">
                (opcional para Magic Link)
              </span>
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition"
              placeholder="Sua senha"
              autoComplete="current-password"
            />
          </div>
        </div>

        <div className="space-y-3 pt-1">
          <button
            onClick={() => handleLogin('password')}
            disabled={loading}
            className="w-full bg-green-600 text-white font-semibold py-3 rounded-xl hover:bg-green-700 disabled:opacity-50 active:scale-95 transition-all text-sm"
          >
            {loading ? 'Aguarde...' : 'Entrar com Senha'}
          </button>

          <div className="flex items-center gap-3">
            <div className="flex-1 border-t border-gray-200" />
            <span className="text-gray-400 text-xs">OU</span>
            <div className="flex-1 border-t border-gray-200" />
          </div>

          <button
            onClick={() => handleLogin('magic_link')}
            disabled={loading}
            className="w-full bg-white border-2 border-gray-200 text-gray-700 font-semibold py-3 rounded-xl hover:bg-gray-50 disabled:opacity-50 active:scale-95 transition-all text-sm"
          >
            {loading ? 'Enviando...' : '🔗 Enviar Magic Link'}
          </button>
        </div>

        <p className="text-center text-xs text-gray-400">
          Ao entrar, voce concorda com o uso seguro dos dados de medicacao.
        </p>
      </div>
    </main>
  )
}