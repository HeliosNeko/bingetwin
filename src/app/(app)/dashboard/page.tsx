import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Film, BookOpen, Users, Search, TrendingUp } from 'lucide-react'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const { count: favCount } = await supabase
    .from('favorites')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)

  const { count: matchCount } = await supabase
    .from('matches')
    .select('*', { count: 'exact', head: true })
    .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)

  const stats = [
    { label: 'Favoris', value: favCount ?? 0, icon: Film, color: 'text-violet-400', bg: 'bg-violet-900/30' },
    { label: 'Matches', value: matchCount ?? 0, icon: Users, color: 'text-pink-400', bg: 'bg-pink-900/30' },
  ]

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Welcome */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold">
          Salut, <span className="gradient-text">{profile?.username ?? 'toi'}</span> 👋
        </h1>
        <p className="text-gray-400 mt-1">Prêt à trouver ton jumeau culturel ?</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        {stats.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className={`${bg} border border-gray-800 rounded-xl p-5 flex items-center gap-4`}>
            <div className={`${bg} rounded-lg p-3`}>
              <Icon className={color} size={24} />
            </div>
            <div>
              <div className="text-2xl font-bold">{value}</div>
              <div className="text-gray-400 text-sm">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <TrendingUp size={18} className="text-violet-400" />
        Actions rapides
      </h2>
      <div className="grid md:grid-cols-3 gap-4">
        <Link
          href="/discover"
          className="bg-gray-900 border border-gray-800 hover:border-violet-600 rounded-xl p-5 transition-colors card-hover group"
        >
          <Search className="text-violet-400 mb-3" size={24} />
          <h3 className="font-semibold mb-1">Découvrir</h3>
          <p className="text-gray-400 text-sm">Explore films, séries et livres</p>
        </Link>
        <Link
          href="/matches"
          className="bg-gray-900 border border-gray-800 hover:border-pink-600 rounded-xl p-5 transition-colors card-hover"
        >
          <Users className="text-pink-400 mb-3" size={24} />
          <h3 className="font-semibold mb-1">Mes matches</h3>
          <p className="text-gray-400 text-sm">Voir tes jumeaux culturels</p>
        </Link>
        <Link
          href="/profile"
          className="bg-gray-900 border border-gray-800 hover:border-emerald-600 rounded-xl p-5 transition-colors card-hover"
        >
          <BookOpen className="text-emerald-400 mb-3" size={24} />
          <h3 className="font-semibold mb-1">Mon profil</h3>
          <p className="text-gray-400 text-sm">Gère tes favoris</p>
        </Link>
      </div>

      {/* CTA if no favorites */}
      {(favCount ?? 0) === 0 && (
        <div className="mt-8 bg-violet-900/20 border border-violet-700/50 rounded-xl p-6 text-center">
          <p className="text-violet-300 font-medium mb-2">Commence par ajouter tes favoris !</p>
          <p className="text-gray-400 text-sm mb-4">Plus tu en ajoutes, meilleures seront tes compatibilités.</p>
          <Link
            href="/discover"
            className="inline-block bg-violet-600 hover:bg-violet-500 rounded-lg px-5 py-2.5 font-medium transition-colors"
          >
            Explorer maintenant
          </Link>
        </div>
      )}
    </div>
  )
}
