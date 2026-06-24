/**
 * alertas.ts — utilitários de alerta para doses de medicação
 *
 * Três camadas independentes (cada uma falha silenciosamente):
 * 1. Som via Web Audio API (funciona sem arquivo de áudio)
 * 2. Browser Notifications (requer permissão do usuário)
 * 3. Overlay visual (gerenciado pelo dashboard — não depende daqui)
 *
 * Nota sobre iOS Safari: o AudioContext só é desbloqueado após gesto do
 * usuário. Chamamos unlockAudio() no primeiro toque/clique da página para
 * garantir que o som funcione quando o alerta disparar.
 */

// ---------------------------------------------------------------------------
// Audio unlock (iOS/Safari exige gesto do usuário antes do AudioContext)
// ---------------------------------------------------------------------------

let audioCtx: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null

  try {
    const AudioContextClass =
      window.AudioContext ??
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).webkitAudioContext
    if (!AudioContextClass) return null

    if (!audioCtx) {
      audioCtx = new AudioContextClass() as AudioContext
    }

    return audioCtx
  } catch {
    return null
  }
}

/**
 * Deve ser chamado no primeiro gesto do usuário (onClick/onTouchEnd na página)
 * para desbloquear o AudioContext em iOS/Safari.
 */
export function unlockAudio(): void {
  const ctx = getAudioContext()
  if (!ctx) return

  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {
      // silencioso
    })
  }
}

// ---------------------------------------------------------------------------
// Som de alerta (sequência de beeps ascendentes, 2× repetições)
// ---------------------------------------------------------------------------

export function playAlertSound(): void {
  try {
    const ctx = getAudioContext()
    if (!ctx) return

    // Retoma contexto suspenso (caso unlockAudio ainda não tivesse sido chamado)
    const play = () => {
      // Sequência: C5 (523 Hz) → E5 (659 Hz) → G5 (784 Hz), repetida 2×
      const notas: Array<{ freq: number; t: number }> = [
        { freq: 523, t: 0.0 },
        { freq: 659, t: 0.28 },
        { freq: 784, t: 0.56 },
        { freq: 523, t: 1.1 },
        { freq: 659, t: 1.38 },
        { freq: 784, t: 1.66 },
      ]

      notas.forEach(({ freq, t }) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)

        osc.type = 'sine'
        osc.frequency.value = freq

        const start = ctx.currentTime + t
        gain.gain.setValueAtTime(0, start)
        gain.gain.linearRampToValueAtTime(0.35, start + 0.05)
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.22)

        osc.start(start)
        osc.stop(start + 0.25)
      })
    }

    if (ctx.state === 'suspended') {
      ctx.resume().then(play).catch(() => {
        // silencioso
      })
    } else {
      play()
    }
  } catch {
    // Falha silenciosa — o overlay visual já é o alerta principal
  }
}

// ---------------------------------------------------------------------------
// Browser Notifications API
// ---------------------------------------------------------------------------

/**
 * Solicita permissão de notificação ao usuário.
 * Deve ser chamado em resposta a um gesto (clique/toque) para funcionar
 * em todos os navegadores.
 * Retorna true se a permissão foi concedida.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  if (!('Notification' in window)) return false

  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false

  try {
    const result = await Notification.requestPermission()
    return result === 'granted'
  } catch {
    return false
  }
}

/**
 * Exibe uma notificação do sistema para a dose que está no horário.
 * Só executa se a permissão já estiver concedida.
 */
export function showBrowserNotification(
  medNome: string,
  criancaNome?: string | null,
): void {
  if (typeof window === 'undefined') return
  if (!('Notification' in window)) return
  if (Notification.permission !== 'granted') return

  try {
    const body = criancaNome
      ? `Hora de dar ${medNome} para ${criancaNome}`
      : `Hora de tomar ${medNome}`

    new Notification('💊 Medicação Inteligente', {
      body,
      icon: '/icon-192.png',
      tag: `dose-${medNome}`, // evita empilhar notificações do mesmo remédio
      requireInteraction: true, // mantém a notificação visível até o usuário agir
    })
  } catch {
    // silencioso
  }
}
