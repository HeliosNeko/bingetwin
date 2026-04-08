import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { MessageCircle, Users, Dna, Trees } from 'lucide-react'

const TIER_CONFIG = {
  jumeau: {
    label: 'Jumeaux culturels',
    description: 'Similarité > 85% — vous notez les mêmes choses pareil',
    icon: Dna,
    iconColor: 'text-violet-400',
    badgeBg: 'bg-violet-900/40 border-violet-700/60 text-violet-300',
    cardBorder: 'hover:border-violet-500/60',
    scoreBg: 'bg-violet-900/30',
    scoreColor: 'text-violet-300',
    avatarGradient: 'from-violet-600 to-pink-600',
  },
  cousin: {
    label: 'Cousins culturels',
    description: 'Similarité entre 60% et 85% — des goûts proches, quelques divergences',
    icon: Trees,
    iconColor: 'text-emerald-400',
    badgeBg: 'bg-emerald-900/40 border-emerald-700/60 text-emerald-300',
    cardBorder: 'hover:border-emerald-500/60',
    scoreBg: 'bg-emerald-900/30',
    scoreColor: 'text-emerald-300',
    avatarGradient: 'from-emerald-600 to-teal-600',
  },
}

export default async function MatchesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: matches } = await supabase
    .from('matches')
    .select('*, user1:profiles!matches_user1_id_fkey(*), user2:profiles!matches_user2_id_fkey(*)')
    .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
    .order('score', { ascending: false })

  const all = (matches ?? []).map(m => ({
    ...m,
    partner: m.user1_id === user.id ? m.user2 : m.user1,
  }))

  const jumeaux = all.filter(m => m.match_type === 'jumeau')
  const cousins  = all.filter(m => m.match_type === 'cousin')

  if (all.length === 0) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">Mes Matches</h1>
        <div className="text-center py-20">
          <Users className="mx-auto text-gray-700 mb-4" size={48} />
          <p className="text-gray-500 font-medium">Aucun match pour l&apos;instant</p>
          <p className="text-gray-600 text-sm mt-2 mb-6">
            Note au moins 2 œuvres pour trouver tes jumeaux culturels
          </p>
          <Link
            href="/discover"
            className="bg-violet-600 hover:bg-violet-500 rounded-lg px-5 py-2.5 font-medium transition-colors"
          >
            Découvrir du contenu
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">Mes Matches</h1>
      <p className="text-gray-400 text-sm mb-8">
        Pearson sur les notes · Jensen-Shannon sur les genres
      </p>

      {(['jumeau', 'cousin'] as const).map(tier => {
        const list = tier === 'jumeau' ? jumeaux : cousins
        if (list.length === 0) return null
        const cfg = TIER_CONFIG[tier]
        const Icon = cfg.icon

        return (
          <section key={tier} className="mb-10">
            {/* Section header */}
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center bg-gray-800`}>
                <Icon size={16} className={cfg.iconColor} />
              </div>
              <div>
                <h2 className="font-semibold text-base">{cfg.label}</h2>
                <p className="text-xs text-gray-500">{cfg.description}</p>
              </div>
              <span className={`ml-auto text-xs font-medium px-2.5 py-1 rounded-full border ${cfg.badgeBg}`}>
                {list.length}
              </span>
            </div>

            <div className="space-y-2">
              {list.map(match => (
                <div
                  key={match.id}
                  className={`bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center justify-between transition-colors ${cfg.cardBorder}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-full bg-gradient-to-br ${cfg.avatarGradient} flex items-center justify-center font-bold`}>
                      {match.partner?.username?.[0]?.toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-sm">@{match.partner?.username}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {match.common_favorites} note{match.common_favorites > 1 ? 's' : ''} en commun
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Score notes (Pearson) */}
                    <div className={`${cfg.scoreBg} rounded-lg px-3 py-1.5 text-center min-w-[56px]`}>
                      <div className={`text-base font-bold ${cfg.scoreColor}`}>{match.score}%</div>
                      <div className="text-[10px] text-gray-500 leading-none">notes</div>
                    </div>
                    {/* Score genres (Jensen-Shannon) */}
                    <div className="bg-gray-800/60 rounded-lg px-2.5 py-1.5 text-center min-w-[52px]">
                      <div className="text-sm font-bold text-gray-300">{match.genre_representativity ?? 100}%</div>
                      <div className="text-[10px] text-gray-600 leading-none">genres</div>
                    </div>
                    <Link
                      href={`/messages/${match.id}`}
                      className="w-9 h-9 bg-gray-800 hover:bg-violet-600 border border-gray-700 hover:border-violet-500 rounded-lg flex items-center justify-center transition-colors"
                    >
                      <MessageCircle size={15} />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
