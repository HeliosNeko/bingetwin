import { createClient } from '@/lib/supabase/server'
import Navbar from '@/components/layout/Navbar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = user
    ? await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
    : { data: null }

  return (
    <div className="min-h-screen bg-gray-950">
      <Navbar isAdmin={profile?.is_admin ?? false} />
      <main className="md:ml-56 pb-20 md:pb-0 min-h-screen">
        {children}
      </main>
    </div>
  )
}
