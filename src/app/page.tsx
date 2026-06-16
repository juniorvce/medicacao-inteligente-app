import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-brand-50 to-white px-6">
      <div className="w-full max-w-sm text-center space-y-6">
        {/* Logo */}
        <div className="flex flex-col items-center gap-2">
          <span className="text-6xl">💊</span>
          <h1 className="text-2xl font-bold text-brand-700">Medicacao Inteligente</h1>
          <p className="text-sm text-gray-500">Rotina de medicacao para sua familia</p>
          <span className="text-xs bg-brand-100 text-brand-700 px-2 py-1 rounded-full font-medium">v0.1.0 MVP</span>
        </div>

        {/* Botoes */}
        <div className="space-y-3">
          <Link
            href="/login"
            className="block w-full bg-brand-600 text-white py-3 rounded-xl font-semibold text-center hover:bg-brand-700 active:scale-95 transition-all"
          >
            Entrar
          </Link>
          <Link
            href="/diagnostico"
            className="block w-full border border-gray-200 text-gray-600 py-3 rounded-xl font-medium text-center hover:bg-gray-50 active:scale-95 transition-all"
          >
            🔍 Diagnostico do App
          </Link>
        </div>

        {/* Info */}
        <p className="text-xs text-gray-400">
          Funciona offline · Dados seguros · Suporte familiar
        </p>
      </div>
    </main>
  )
}
