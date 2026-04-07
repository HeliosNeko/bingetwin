import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Film, Tv, BookOpen, Star, Trash2 } from 'lucide-react'
import DeleteFavoriteButton from '@/components/profile/DeleteFavoriteButton'
import type { Favorite } from '@/types'

const mediaIcons = { movie: Film, series: Tv, book: BookOpen }
const mediaLabels = { movie: 'Films', series: 'Séries', book: 'Livres' }

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const { data: favorites } = await supabase
    .from('favorites')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const grouped = {
    movie: (favorites ?? []).filter((f: Favorite) => f.media_type === 'movie'),
    series: (favorites ?? []).filter((f: Favorite) => f.media_type === 'series'),
    book: (favorites ?? []).filter((f: Favorite) => f.media_type === 'book'),
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Profile header */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-8 flex items-center gap-5">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-violet-600 to-pink-600 flex items-center justify-center text-2xl font-bold">
          {profile?.username?.[0]?.toUpperCase() ?? '?'}
        </div>
        <div>
          <h1 className="text-xl font-bold">{profile?.username}</h1>
          <p className="text-gray-400 text-sm">{user.email}</p>
          <p className="text-gray-500 text-sm mt-1">{favorites?.length ?? 0} favoris</p>
        </div>
      </div>

      {/* Favorites by category */}
      {(Object.entries(grouped) as [keyof typeof grouped, Favorite[]][]).map(([type, items]) => {
        const Icon = mediaIcons[type]
        return (
          <div key={type} className="mb-8">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Icon size={18} className="text-violet-400" />
              {mediaLabels[type]}
              <span className="text-gray-500 text-sm font-normal">({items.length})</span>
            </h2>

            {items.length === 0 ? (
              <p className="text-gray-600 text-sm">Aucun {type === 'movie' ? 'film' : type === 'series' ? 'série' : 'livre'} ajouté</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {items.map((fav: Favorite) => (
                  <div key={fav.id} className="relative group bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                    <div className="aspect-[2/3] bg-gray-800">
                      {fav.poster_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={fav.poster_url} alt={fav.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-600">
                          <Icon size={28} />
                        </div>
                      )}
                    </div>
                    <div className="p-2">
                      <p className="text-xs font-medium line-clamp-2">{fav.title}</p>
                      {fav.year && <p className="text-xs text-gray-500">{fav.year}</p>}
                    </div>
                    <DeleteFavoriteButton favoriteId={fav.id} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
