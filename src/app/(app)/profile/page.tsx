import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Film, Tv, BookOpen, Tag } from 'lucide-react'
import DeleteFavoriteButton from '@/components/profile/DeleteFavoriteButton'
import RatingProgress from '@/components/profile/RatingProgress'
import type { Favorite } from '@/types'

// ── Constantes d'affichage ────────────────────────────────────────────────
const RATING_EMOJI: Record<number, string> = {
  5: '🤩', 4: '😊', 3: '😐', 2: '😕', 1: '😤',
}
const MEDIA_BADGE: Record<string, { label: string; color: string }> = {
  movie:  { label: 'Film',   color: 'bg-violet-900/80 text-violet-300' },
  series: { label: 'Série',  color: 'bg-blue-900/80   text-blue-300'   },
  book:   { label: 'Livre',  color: 'bg-amber-900/80  text-amber-300'  },
}
const MEDIA_ICON = { movie: Film, series: Tv, book: BookOpen }

// ── Construit les sections genres triées ─────────────────────────────────
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

  // Tri interne : rating décroissant (adoré → détesté)
  const sortByRating = (a: Favorite, b: Favorite) => (b.rating ?? 0) - (a.rating ?? 0)
  for (const items of map.values()) items.sort(sortByRating)
  noGenre.sort(sortByRating)

  // Tri des genres : plus peuplé en premier
  const sections = [...map.entries()].sort(([, a], [, b]) => b.length - a.length)

  if (noGenre.length > 0) sections.push(['__no_genre__', noGenre])
  return sections
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// ── Page ──────────────────────────────────────────────────────────────────
export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [
    { data: profile },
    { data: favorites },
    { data: settingRow },
  ] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('favorites').select('*').eq('user_id', user.id),
    supabase.from('app_settings').select('value').eq('key', 'minimum_ratings_required').single(),
  ])

  const all = favorites ?? []
  const threshold = Number(settingRow?.value ?? 500)
  const ratedCount = all.filter(f => f.rating !== null).length

  // Nombre de genres distincts dans la collection notée
  const genreSet = new Set(
    all.flatMap(f => (f.genres ?? []).map((g: string) => g.toLowerCase().trim())).filter(Boolean)
  )

  const sections = buildGenreSections(all)

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* En-tête profil */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-4 flex items-center gap-5">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-violet-600 to-pink-600 flex items-center justify-center text-2xl font-bold flex-shrink-0">
          {profile?.username?.[0]?.toUpperCase() ?? '?'}
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-bold">{profile?.username}</h1>
          <p className="text-gray-400 text-sm">{user.email}</p>
          <p className="text-gray-500 text-sm mt-1">
            {ratedCount} produit{ratedCount > 1 ? 's' : ''} noté{ratedCount > 1 ? 's' : ''}
            {genreSet.size > 0 && <> · {genreSet.size} genre{genreSet.size > 1 ? 's' : ''}</>}
          </p>
        </div>
      </div>

      {/* Barre de progression matching */}
      <div className="mb-8">
        <RatingProgress ratedCount={ratedCount} threshold={threshold} />
      </div>

      {/* CTA si rien de noté */}
      {ratedCount === 0 && (
        <div className="text-center py-16 text-gray-500">
          <Tag className="mx-auto mb-3 text-gray-700" size={40} />
          <p className="font-medium">Aucun produit noté</p>
          <p className="text-sm mt-1">Note des films, séries ou livres pour voir ta collection par genre</p>
        </div>
      )}

      {/* Sections par genre */}
      {sections.map(([genre, items]) => {
        const isNoGenre = genre === '__no_genre__'
        const label = isNoGenre ? 'Sans genre' : capitalize(genre)

        return (
          <section key={genre} className="mb-10">
            {/* Titre du genre */}
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-base font-semibold">{label}</h2>
              <span className="text-xs text-gray-500 bg-gray-800 rounded-full px-2 py-0.5">
                {items.length}
              </span>
              {/* Mini-répartition des notes dans ce genre */}
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

            {/* Grille de produits */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {items.map(fav => {
                const FallbackIcon = MEDIA_ICON[fav.media_type]
                const badge = MEDIA_BADGE[fav.media_type]
                return (
                  <div
                    key={`${genre}-${fav.id}`}
                    className="relative group bg-gray-900 border border-gray-800 rounded-xl overflow-hidden"
                  >
                    {/* Poster */}
                    <div className="aspect-[2/3] bg-gray-800 relative">
                      {fav.poster_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={fav.poster_url}
                          alt={fav.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-600">
                          <FallbackIcon size={28} />
                        </div>
                      )}

                      {/* Badge type (Film / Série / Livre) */}
                      <span className={`absolute top-1.5 left-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded ${badge.color}`}>
                        {badge.label}
                      </span>

                      {/* Emoji note en bas à droite */}
                      {fav.rating !== null && (
                        <span className="absolute bottom-1.5 right-1.5 text-base leading-none">
                          {RATING_EMOJI[fav.rating]}
                        </span>
                      )}
                    </div>

                    {/* Infos texte */}
                    <div className="p-2">
                      <p className="text-xs font-medium line-clamp-2">{fav.title}</p>
                      {fav.year && <p className="text-xs text-gray-500">{fav.year}</p>}
                    </div>

                    <DeleteFavoriteButton favoriteId={fav.id} />
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
