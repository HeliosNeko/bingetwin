'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function updateSetting(key: string, value: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non authentifié')

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) throw new Error('Accès refusé')

  const { error } = await supabase
    .from('app_settings')
    .update({ value, updated_at: new Date().toISOString() })
    .eq('key', key)

  if (error) throw new Error(error.message)

  revalidatePath('/admin')
  revalidatePath('/profile')
}
