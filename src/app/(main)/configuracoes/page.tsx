'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { requestNotificationPermission } from '@/lib/alertas'

export default function ConfiguracoesPage() {
  const [userEmail, setUserEmail] = useState('')
  const [notifStatus, setNotifStatus] = useState<string>('verificando')
  const [loading, setLoading] = useState(true)
  const [familiaId, setFamiliaId] = useState<string | null>(null)
  const [inputFamiliaId, setInputFamiliaId] = useState('')
  const [updatingFamilia, setUpdatingFamilia] = useState(false)
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
      setUserEmail(session.user.email ?? '')

      const { data: perfilData } = await supabase
        .from('perfis')
        .select('familia_id')
        .eq('id', session.user.id)
        .maybeSingle()

      if (perfilData?.familia_id) {
        setFamiliaId(perfilData.familia_id)
      }

      if (typeof window !== 'undefined' && 'Notification' in window) {
        setNotifStatus(Notification.permission)
      } else {
        setNotifStatus('nao-suportado')
      }

      setLoading(false)
    }

    void load()
  }, [supabase, router])

  async function handleJoinFamilia() {
    if (!inputFamiliaId.trim()) {
      alert('Por favor, informe o código da família.')
      return
    }

    setUpdatingFamilia(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const userId = sessionData.session?.user.id
      if (!userId) throw new Error('Sessão expirada.')

      const { error } = await supabase
        .from('perfis')
        .update({ familia_id: inputFamiliaId.trim() })
        .eq('id', userId)

      if (error) throw error

      setFamiliaId(inputFamiliaId.trim())
      setInputFamiliaId('')
      alert('Você entrou na família com sucesso!')
      router.refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao entrar na família')
    } finally {
      setUpdatingFamilia(false)
    }
  }

  async function handleRequestNotif() {
    const granted = await requestNotificationPermission()
    setNotifStatus(granted ? 'granted' : 'denied')
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  function handleClearCache() {
    localStorage.clear()
    sessionStorage.clear()
    setNotifStatus((prev) => prev) // force re-render
    alert('Cache local limpo com sucesso!')
  }

  if (loading) {
    return (
      <div className="flex-1 w-full flex items-center justify-center bg-apricot-100 min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <span className="text-3xl animate-bounce">⚙️</span>
          <span className="text-terracotta-500 text-sm font-semibold animate-pulse">Carregando ajustes...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 w-full space-y-4 px-4 py-6">
      {/* Page Header */}
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-extrabold text-terracotta-600 tracking-tight">Perfil & Ajustes ⚙️</h2>
        <p className="text-xs text-terracotta-400 font-medium">Gerencie o seu aplicativo e preferências</p>
      </div>

      <div className="space-y-4">
        {/* Section: Account Info */}
        <div className="bg-white rounded-2xl p-5 shadow-card border border-apricot-200 space-y-3">
          <p className="text-xs font-bold text-terracotta-400 uppercase tracking-wider">
            Sua Conta
          </p>
          <div className="flex items-center justify-between gap-4 py-1">
            <div className="min-w-0">
              <p className="text-sm font-bold text-terracotta-700">E-mail do responsável</p>
              <p className="text-xs text-terracotta-400 truncate mt-0.5">{userEmail}</p>
            </div>
            <span className="text-xs text-brand-500 bg-brand-50 px-2.5 py-1 rounded-full font-bold border border-brand-100 flex-shrink-0">
              Ativo ✓
            </span>
          </div>
        </div>

        {/* Section: Caregiver Sync */}
        <div className="bg-white rounded-2xl p-5 shadow-card border border-apricot-200 space-y-4">
          <div>
            <p className="text-xs font-bold text-terracotta-400 uppercase tracking-wider mb-1">
              Sincronização de Cuidadores (Multi-Caregiver)
            </p>
            <p className="text-xs text-terracotta-400">
              Compartilhe o código abaixo para que outros cuidadores (mães, pais, avós, babás) visualizem e registrem doses em tempo real na mesma conta familiar.
            </p>
          </div>

          {familiaId && (
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-terracotta-400 uppercase tracking-wider">Seu Código de Compartilhamento</label>
              <div className="flex gap-2 bg-apricot-50 border border-apricot-200 rounded-xl p-2.5 items-center justify-between">
                <code className="text-xs font-mono font-bold text-terracotta-600 truncate flex-1 pr-2 select-all">
                  {familiaId}
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(familiaId)
                    alert('Código copiado para a área de transferência!')
                  }}
                  className="px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-xs font-bold active:scale-95 transition-all shadow-coral"
                >
                  📋 Copiar
                </button>
              </div>
            </div>
          )}

          <div className="border-t border-apricot-100 pt-3 space-y-2.5">
            <label className="text-[10px] font-bold text-terracotta-400 uppercase tracking-wider">Entrar em Família Existente</label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Cole o código do outro cuidador..."
                value={inputFamiliaId}
                onChange={(e) => setInputFamiliaId(e.target.value)}
                className="flex-1 h-11 border border-apricot-200 bg-apricot-50 rounded-xl px-3.5 text-xs font-medium text-terracotta-700 outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent transition-all"
              />
              <button
                onClick={handleJoinFamilia}
                disabled={updatingFamilia}
                className="px-4 h-11 bg-white border border-apricot-200 text-brand-500 rounded-xl text-xs font-bold hover:bg-apricot-50 active:scale-95 transition-all"
              >
                {updatingFamilia ? 'Entrando...' : '🔗 Entrar'}
              </button>
            </div>
          </div>
        </div>

        {/* Section: Notifications */}
        <div className="bg-white rounded-2xl p-5 shadow-card border border-apricot-200 space-y-3">
          <p className="text-xs font-bold text-terracotta-400 uppercase tracking-wider">
            Notificações & Lembretes
          </p>
          <div className="flex items-center justify-between gap-4 py-1">
            <div>
              <p className="text-sm font-bold text-terracotta-700">Alertas sonoros e visuais</p>
              <p className="text-xs text-terracotta-400 mt-1">
                {notifStatus === 'granted'
                  ? 'Permissão concedida. Lembretes ativados.'
                  : notifStatus === 'denied'
                  ? 'Notificações bloqueadas nas configurações do seu navegador.'
                  : notifStatus === 'nao-suportado'
                  ? 'Seu navegador atual não suporta notificações locais.'
                  : 'Ative para receber avisos de horários dos remédios.'}
              </p>
            </div>
            {notifStatus !== 'granted' && notifStatus !== 'nao-suportado' && (
              <button
                onClick={handleRequestNotif}
                className="h-10 px-4 bg-brand-500 text-white hover:bg-brand-600 rounded-xl font-bold text-xs transition-all active:scale-95 flex-shrink-0 shadow-coral"
              >
                Ativar
              </button>
            )}
            {notifStatus === 'granted' && (
              <span className="text-xs text-green-600 font-bold bg-green-50 px-2.5 py-1 rounded-full border border-green-100 flex-shrink-0">
                Ativo ✅
              </span>
            )}
          </div>
        </div>

        {/* Section: Cache / Offline Data */}
        <div className="bg-white rounded-2xl p-5 shadow-card border border-apricot-200 space-y-3">
          <p className="text-xs font-bold text-terracotta-400 uppercase tracking-wider">
            Sincronização & Armazenamento
          </p>
          <div>
            <p className="text-sm font-bold text-terracotta-700">Limpeza de cache temporário</p>
            <p className="text-xs text-terracotta-400 mt-1">
              Útil em caso de inconsistência de carregamento local ou lentidão. Nenhum dado na nuvem será excluído.
            </p>
          </div>
          <button
            onClick={handleClearCache}
            className="w-full h-11 border border-apricot-200 text-terracotta-500 py-2 rounded-xl font-bold hover:bg-apricot-100 active:scale-[0.98] transition-all text-xs"
          >
            Limpar Cache Local do PWA
          </button>
        </div>

        {/* Section: About */}
        <div className="bg-white rounded-2xl p-5 shadow-card border border-apricot-200 space-y-3">
          <p className="text-xs font-bold text-terracotta-400 uppercase tracking-wider">
            Sobre o Aplicativo
          </p>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-brand-500 flex items-center justify-center shadow-coral flex-shrink-0">
              <span className="text-2xl">🐻</span>
            </div>
            <div>
              <p className="text-sm font-bold text-terracotta-700">
                MedInteligente PWA
              </p>
              <p className="text-xs text-terracotta-400">
                Versão {process.env.NEXT_PUBLIC_APP_VERSION ?? '0.1.0'}
              </p>
            </div>
          </div>
          <p className="text-xs text-terracotta-400 border-t border-apricot-100 pt-2.5 leading-relaxed">
            Desenvolvido focado em acessibilidade, usabilidade ágil de uma mão (Mobile First) e leitura automatizada de receitas por inteligência artificial. Ideal para pais, cuidadores e controle pessoal de saúde.
          </p>
        </div>

        {/* Logout Button */}
        <button
          onClick={handleLogout}
          className="w-full h-12 bg-brand-500 text-white rounded-2xl font-bold hover:bg-brand-600 active:scale-[0.98] transition-all text-sm flex items-center justify-center gap-1.5 shadow-coral"
        >
          <span>🚪</span> Sair da Conta
        </button>
      </div>
    </div>
  )
}
