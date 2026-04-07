import Link from 'next/link'
import { Film, BookOpen, Users, Sparkles } from 'lucide-react'

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-950 flex flex-col">
      {/* Header */}
      <header className="px-6 py-4 flex items-center justify-between border-b border-gray-800">
        <div className="text-xl font-bold gradient-text">BingeTwin</div>
        <div className="flex gap-3">
          <Link
            href="/auth/login"
            className="px-4 py-2 text-sm text-gray-300 hover:text-white transition-colors"
          >
            Connexion
          </Link>
          <Link
            href="/auth/register"
            className="px-4 py-2 text-sm bg-violet-600 hover:bg-violet-500 rounded-lg transition-colors font-medium"
          >
            S&apos;inscrire
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center px-6 py-24 text-center">
        <div className="inline-flex items-center gap-2 bg-violet-900/30 border border-violet-700/50 rounded-full px-4 py-1.5 text-sm text-violet-300 mb-8">
          <Sparkles size={14} />
          Trouve ton double culturel
        </div>

        <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
          Rencontre des gens qui
          <br />
          <span className="gradient-text">regardent comme toi</span>
        </h1>

        <p className="text-xl text-gray-400 max-w-2xl mb-10">
          Partage tes films, séries et livres préférés. BingeTwin calcule ta compatibilité
          culturelle et te connecte avec tes vrais jumeaux culturels.
        </p>

        <div className="flex flex-col sm:flex-row gap-4">
          <Link
            href="/auth/register"
            className="px-8 py-4 bg-violet-600 hover:bg-violet-500 rounded-xl font-semibold text-lg transition-colors"
          >
            Commencer gratuitement
          </Link>
          <Link
            href="/auth/login"
            className="px-8 py-4 bg-gray-800 hover:bg-gray-700 rounded-xl font-semibold text-lg transition-colors"
          >
            J&apos;ai déjà un compte
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-16 border-t border-gray-800">
        <div className="max-w-4xl mx-auto grid md:grid-cols-3 gap-8">
          <div className="text-center p-6">
            <div className="w-12 h-12 bg-violet-900/50 rounded-xl flex items-center justify-center mx-auto mb-4">
              <Film className="text-violet-400" size={24} />
            </div>
            <h3 className="font-semibold text-lg mb-2">Films & Séries</h3>
            <p className="text-gray-400 text-sm">
              Des millions de titres via TMDB. Note ce que tu as vu et adoré.
            </p>
          </div>
          <div className="text-center p-6">
            <div className="w-12 h-12 bg-pink-900/50 rounded-xl flex items-center justify-center mx-auto mb-4">
              <BookOpen className="text-pink-400" size={24} />
            </div>
            <h3 className="font-semibold text-lg mb-2">Livres</h3>
            <p className="text-gray-400 text-sm">
              Open Library pour tous tes romans, essais et BD préférés.
            </p>
          </div>
          <div className="text-center p-6">
            <div className="w-12 h-12 bg-emerald-900/50 rounded-xl flex items-center justify-center mx-auto mb-4">
              <Users className="text-emerald-400" size={24} />
            </div>
            <h3 className="font-semibold text-lg mb-2">Matchmaking</h3>
            <p className="text-gray-400 text-sm">
              Notre algorithme trouve tes compatibilités et te connecte.
            </p>
          </div>
        </div>
      </section>
    </main>
  )
}
