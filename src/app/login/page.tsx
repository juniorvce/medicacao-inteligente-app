'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type AuthMode = 'login' | 'signup'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState({ text: '', type: '' })
  const [mode, setMode] = useState<AuthMode>('login')
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

  const handleSignUp = async () => {
    if (!email) {
      setMessage({ text: 'Informe seu email.', type: 'error' })
      return
    }
    if (!password || password.length < 6) {
      setMessage({ text: 'A senha deve ter pelo menos 6 caracteres.', type: 'error' })
      return
    }

    setLoading(true)
    setMessage({ text: '', type: '' })

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })

      if (error) throw error

      setMessage({
        text: 'Conta criada! Verifique seu email para confirmar.',
        type: 'success',
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao criar conta'
      setMessage({ text: msg, type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-apricot-100 p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Logo / Hero */}
        <div className="text-center space-y-3">
          <div className="w-20 h-20 rounded-3xl bg-brand-500 flex items-center justify-center mx-auto shadow-coral">
            <span className="text-4xl">🐻</span>
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-terracotta-600 leading-tight">
              MedInteligente
            </h1>
            <p className="text-terracotta-400 text-sm mt-1 font-medium">
              {mode === 'login'
                ? 'Bem-vindo de volta! Entre na sua conta.'
                : 'Crie sua conta para começar'}
            </p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl shadow-card border border-apricot-200 p-6 space-y-5">
          {message.text && (
            <div
              className={`p-3.5 rounded-xl text-sm font-medium ${
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
              <label className="block text-xs font-bold text-terracotta-400 uppercase tracking-wider mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-12 border border-apricot-200 bg-apricot-50 rounded-xl px-4 text-sm focus:ring-2 focus:ring-brand-400 focus:border-transparent outline-none transition font-medium"
                placeholder="seu@email.com"
                autoComplete="email"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-terracotta-400 uppercase tracking-wider mb-1.5">
                Senha
                {mode === 'login' && (
                  <span className="text-terracotta-300 font-normal ml-1 normal-case">
                    (opcional para Magic Link)
                  </span>
                )}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-12 border border-apricot-200 bg-apricot-50 rounded-xl px-4 text-sm focus:ring-2 focus:ring-brand-400 focus:border-transparent outline-none transition font-medium"
                placeholder={mode === 'signup' ? 'Mínimo 6 caracteres' : 'Sua senha'}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              />
            </div>
          </div>

          {mode === 'login' ? (
            <div className="space-y-3 pt-1">
              <button
                onClick={() => handleLogin('password')}
                disabled={loading}
                className="w-full h-12 bg-brand-500 text-white font-bold rounded-xl hover:bg-brand-600 disabled:opacity-50 active:scale-[0.98] transition-all text-sm shadow-coral"
              >
                {loading ? 'Aguarde...' : 'Entrar com Senha'}
              </button>

              <div className="flex items-center gap-3">
                <div className="flex-1 border-t border-apricot-200" />
                <span className="text-terracotta-300 text-xs font-semibold">OU</span>
                <div className="flex-1 border-t border-apricot-200" />
              </div>

              <button
                onClick={() => handleLogin('magic_link')}
                disabled={loading}
                className="w-full h-12 bg-white border-2 border-apricot-200 text-terracotta-600 font-bold rounded-xl hover:bg-apricot-50 disabled:opacity-50 active:scale-[0.98] transition-all text-sm"
              >
                {loading ? 'Enviando...' : '🔗 Enviar Magic Link'}
              </button>

              <button
                onClick={() => {
                  setMode('signup')
                  setMessage({ text: '', type: '' })
                }}
                className="w-full text-brand-500 text-sm font-semibold py-2 hover:text-brand-600 transition-all"
              >
                Não tem conta? Criar agora
              </button>
            </div>
          ) : (
            <div className="space-y-3 pt-1">
              <button
                onClick={handleSignUp}
                disabled={loading}
                className="w-full h-12 bg-brand-500 text-white font-bold rounded-xl hover:bg-brand-600 disabled:opacity-50 active:scale-[0.98] transition-all text-sm shadow-coral"
              >
                {loading ? 'Criando conta...' : 'Criar conta'}
              </button>

              <button
                onClick={() => {
                  setMode('login')
                  setMessage({ text: '', type: '' })
                }}
                className="w-full text-brand-500 text-sm font-semibold py-2 hover:text-brand-600 transition-all"
              >
                Já tem conta? Entrar
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-terracotta-300 font-medium">
          Ao entrar, você concorda com o uso seguro dos dados de medicação.
        </p>
      </div>
    </main>
  )
}
