import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { MessageCircle } from 'lucide-react'

export default async function MessagesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: matches } = await supabase
    .from('matches')
    .select('*, user1:profiles!matches_user1_id_fkey(*), user2:profiles!matches_user2_id_fkey(*)')
    .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
    .order('created_at', { ascending: false })

  const conversations = (matches ?? []).map(m => ({
    ...m,
    partner: m.user1_id === user.id ? m.user2 : m.user1,
  }))

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-8">Messages</h1>

      {conversations.length === 0 ? (
        <div className="text-center py-20">
          <MessageCircle className="mx-auto text-gray-700 mb-4" size={48} />
          <p className="text-gray-500">Aucune conversation pour l&apos;instant</p>
          <p className="text-gray-600 text-sm mt-2">
            Obtiens des matches pour pouvoir discuter
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {conversations.map(conv => (
            <Link
              key={conv.id}
              href={`/messages/${conv.id}`}
              className="flex items-center gap-4 bg-gray-900 border border-gray-800 hover:border-violet-600/50 rounded-xl p-4 transition-colors"
            >
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-600 to-pink-600 flex items-center justify-center font-bold text-lg flex-shrink-0">
                {conv.partner?.username?.[0]?.toUpperCase()}
              </div>
              <div>
                <p className="font-semibold">@{conv.partner?.username}</p>
                <p className="text-xs text-gray-500 mt-0.5">{conv.common_favorites} favoris en commun</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
