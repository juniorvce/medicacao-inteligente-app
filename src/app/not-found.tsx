import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-6">
      <div className="text-center space-y-4">
        <span className="text-6xl">💊</span>
        <h1 className="text-2xl font-bold text-gray-800">Pagina nao encontrada</h1>
        <p className="text-sm text-gray-500">
          A pagina que voce procura nao existe ou foi movida.
        </p>
        <Link
          href="/dashboard"
          className="inline-block bg-brand-600 text-white px-6 py-3 rounded-xl font-semibold text-sm hover:bg-brand-700 active:scale-95 transition-all"
        >
          Ir para o Dashboard
        </Link>
      </div>
    </main>
  )
}
