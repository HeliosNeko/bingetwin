import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { Film, Tv, BookOpen, ArrowLeft, Dna, Trees } from 'lucide-react'
import type { Favorite } from '@/types'

const RATING_EMOJI: Record<number, string> = {
  5: '🤩', 4: '😊', 3: '😐', 2: '😕', 1: '😤',
}
const MEDIA_BADGE: Record<string, { label: string; color: string }> = {
  movie:  { label: 'Film',  color: 'bg-violet-900/80 text-violet-300' },
  series: { label: 'Série', color: 'bg-blue-900/80   text-blue-300'  },
  book:   { label: 'Livre', color: 'bg-amber-900/80  text-amber-300' },
}
const MEDIA_ICON = { movie: Film, series: Tv, book: BookOpen }

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

function buildGenreSections(favorites: Favorite[]): [string, Favorite[]][] {
  const rated = favorites.filter(f => f.rating !== null)
  const map = new Map<string, Favorite[]>()
  const noGenre: Favorite[] = []

  for (const fav of rated) {
    const genres = (fav.genres ?? []).map(g => g.toLowerCase().trim()).filter(Boolean)
    if (genres.length === 0) {
      noGenre.push(fav)
    } else {
      for (const genre of genres) {
        if (!map.has(genre)) map.set(genre, [])
        map.get(genre)!.push(fav)
      }
    }
  }

  const sortByRating = (a: Favorite, b: Favorite) => (b.rating ?? 0) - (a.rating ?? 0)
  for (const items of map.values()) items.sort(sortByRating)
  noGenre.sort(sortByRating)

  const sections = [...map.entries()].sort(([, a], [, b]) => b.length - a.length)
  if (noGenre.length > 0) sections.push(['__no_genre__', noGenre])
  return sections
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export default async function PartnerPage({ params }: { params: Promise<{ partnerId: string }> }) {
  const { partnerId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // Verify a match exists between current user and this partner
  const { data: match } = await supabase
    .from('matches')
    .select('score, match_type, common_favorites, genre_representativity')
    .or(
      `and(user1_id.eq.${user.id},user2_id.eq.${partnerId}),` +
      `and(user1_id.eq.${partnerId},user2_id.eq.${user.id})`
    )
    .single()

  if (!match) notFound()

  const admin = getAdminClient()

  const [{ data: partner }, { data: partnerFavs }, { data: myFavs }] = await Promise.all([
    admin.from('profiles').select('username').eq('id', partnerId).single(),
    admin.from('favorites').select('*').eq('user_id', partnerId).order('created_at', { ascending: false }),
    supabase.from('favorites').select('external_id, media_type, rating').eq('user_id', user.id),
  ])

  if (!partner) notFound()

  // Build a set of items I've rated, with my rating
  const myRatingMap = new Map(
    (myFavs ?? []).map(f => [`${f.media_type}:${f.external_id}`, f.rating as number | null])
  )

  // Compute exact similarity
  const favArr = (partnerFavs ?? []) as Favorite[]
  let identical = 0, common = 0
  for (const f of favArr) {
    const mine = myRatingMap.get(`${f.media_type}:${f.external_id}`)
    if (mine != null) {
      common++
      if (mine === f.rating) identical++
    }
  }
  const exactPct = common > 0 ? Math.round((identical / common) * 100) : null

  const tierCfg = match.match_type === 'jumeau'
    ? { label: 'Jumeau culturel', icon: Dna, color: 'text-violet-400', bg: 'bg-violet-900/30', border: 'border-violet-700/50' }
    : { label: 'Cousin culturel', icon: Trees, color: 'text-emerald-400', bg: 'bg-emerald-900/30', border: 'border-emerald-700/50' }
  const TierIcon = tierCfg.icon

  const ratedCount = favArr.filter(f => f.rating !== null).length
  const sections = buildGenreSections(favArr)

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Back */}
      <Link href="/matches" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-white mb-6 transition-colors">
        <ArrowLeft size={15} /> Mes matches
      </Link>

      {/* Header */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6 flex flex-col sm:flex-row sm:items-center gap-5">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-violet-600 to-pink-600 flex items-center justify-center text-2xl font-bold flex-shrink-0">
          {partner.username?.[0]?.toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold">@{partner.username}</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {ratedCount} produit{ratedCount > 1 ? 's' : ''} noté{ratedCount > 1 ? 's' : ''}
          </p>
        </div>

        {/* Scores */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium ${tierCfg.bg} ${tierCfg.border}`}>
            <TierIcon size={13} className={tierCfg.color} />
            <span className={tierCfg.color}>{tierCfg.label}</span>
          </div>
          <div className="bg-gray-800 rounded-lg px-3 py-1.5 text-center">
            <div className="text-sm font-bold">{match.score}%</div>
            <div className="text-[10px] text-gray-500">Pearson</div>
          </div>
          {exactPct != null && (
            <div className="bg-gray-800 rounded-lg px-3 py-1.5 text-center">
              <div className="text-sm font-bold">{exactPct}%</div>
              <div className="text-[10px] text-gray-500">exact</div>
            </div>
          )}
          <div className="bg-gray-800 rounded-lg px-3 py-1.5 text-center">
            <div className="text-sm font-bold">{match.genre_representativity ?? 100}%</div>
            <div className="text-[10px] text-gray-500">genres</div>
          </div>
          <div className="bg-gray-800 rounded-lg px-3 py-1.5 text-center">
            <div className="text-sm font-bold">{match.common_favorites}</div>
            <div className="text-[10px] text-gray-500">en commun</div>
          </div>
        </div>
      </div>

      {/* Collection by genre */}
      {sections.map(([genre, items]) => {
        const isNoGenre = genre === '__no_genre__'
        const label = isNoGenre ? 'Sans genre' : capitalize(genre)

        return (
          <section key={genre} className="mb-10">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-base font-semibold">{label}</h2>
              <span className="text-xs text-gray-500 bg-gray-800 rounded-full px-2 py-0.5">
                {items.length}
              </span>
              <div className="ml-2 flex items-center gap-0.5 text-sm">
                {[5, 4, 3, 2, 1].map(r => {
                  const count = items.filter(f => f.rating === r).length
                  if (count === 0) return null
                  return (
                    <span key={r} className="opacity-70" title={`${count} × ${RATING_EMOJI[r]}`}>
                      {RATING_EMOJI[r]}
                      <span className="text-[10px] text-gray-500 ml-0.5">{count}</span>
                    </span>
                  )
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {items.map(fav => {
                const FallbackIcon = MEDIA_ICON[fav.media_type as keyof typeof MEDIA_ICON]
                const badge = MEDIA_BADGE[fav.media_type]
                const myRating = myRatingMap.get(`${fav.media_type}:${fav.external_id}`)
                const alsoRated = myRating != null

                return (
                  <div
                    key={`${genre}-${fav.id}`}
                    className={`relative bg-gray-900 border rounded-xl overflow-hidden ${alsoRated ? 'border-violet-700/50' : 'border-gray-800'}`}
                  >
                    {/* Poster */}
                    <div className="aspect-[2/3] bg-gray-800 relative">
                      {fav.poster_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={fav.poster_url} alt={fav.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-600">
                          <FallbackIcon size={28} />
                        </div>
                      )}

                      {/* Media type badge */}
                      <span className={`absolute top-1.5 left-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded ${badge.color}`}>
                        {badge.label}
                      </span>

                      {/* Partner's rating */}
                      {fav.rating !== null && (
                        <span className="absolute bottom-1.5 right-1.5 text-base leading-none" title={`Sa note`}>
                          {RATING_EMOJI[fav.rating]}
                        </span>
                      )}

                      {/* My rating indicator */}
                      {alsoRated && (
                        <span className="absolute bottom-1.5 left-1.5 text-xs leading-none bg-black/60 rounded px-1 py-0.5" title={`Ta note`}>
                          {RATING_EMOJI[myRating!]}
                        </span>
                      )}
                    </div>

                    {/* Text */}
                    <div className="p-2">
                      <p className="text-xs font-medium line-clamp-2">{fav.title}</p>
                      {fav.year && <p className="text-xs text-gray-500">{fav.year}</p>}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}

      {ratedCount === 0 && (
        <p className="text-center text-gray-500 py-16">Ce profil n&apos;a encore rien noté.</p>
      )}
    </div>
  )
}
