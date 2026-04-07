import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { MessageCircle, Users, Zap } from 'lucide-react'

export default async function MatchesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: matches } = await supabase
    .from('matches')
    .select('*, user1:profiles!matches_user1_id_fkey(*), user2:profiles!matches_user2_id_fkey(*)')
    .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
    .order('score', { ascending: false })

  const enrichedMatches = (matches ?? []).map(m => ({
    ...m,
    partner: m.user1_id === user.id ? m.user2 : m.user1,
  }))

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Mes Matches</h1>
      <p className="text-gray-400 text-sm mb-8">
        Utilisateurs qui partagent tes goûts culturels
      </p>

      {enrichedMatches.length === 0 ? (
        <div className="text-center py-20">
          <Users className="mx-auto text-gray-700 mb-4" size={48} />
          <p className="text-gray-500 font-medium">Aucun match pour l&apos;instant</p>
          <p className="text-gray-600 text-sm mt-2 mb-6">
            Ajoute des favoris pour trouver tes jumeaux culturels
          </p>
          <Link
            href="/discover"
            className="bg-violet-600 hover:bg-violet-500 rounded-lg px-5 py-2.5 font-medium transition-colors"
          >
            Découvrir du contenu
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {enrichedMatches.map(match => (
            <div
              key={match.id}
              className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center justify-between hover:border-violet-600/50 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-600 to-pink-600 flex items-center justify-center font-bold text-lg">
                  {match.partner?.username?.[0]?.toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold">@{match.partner?.username}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Zap size={12} className="text-yellow-400" />
                    <span className="text-xs text-gray-400">
                      {match.common_favorites} favori{match.common_favorites > 1 ? 's' : ''} en commun
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-lg font-bold gradient-text">{match.score}</div>
                  <div className="text-xs text-gray-500">pts</div>
                </div>
                <Link
                  href={`/messages/${match.id}`}
                  className="w-9 h-9 bg-violet-600/20 hover:bg-violet-600 border border-violet-600/50 rounded-lg flex items-center justify-center transition-colors"
                >
                  <MessageCircle size={16} />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
