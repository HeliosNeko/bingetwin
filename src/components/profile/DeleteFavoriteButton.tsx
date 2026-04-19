'use client'

import { useState } from 'react'
import { Trash2, Check, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function DeleteFavoriteButton({ favoriteId }: { favoriteId: string }) {
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading]       = useState(false)
  const router = useRouter()

  async function handleDelete() {
    setLoading(true)
    const supabase = createClient()
    await supabase.from('favorites').delete().eq('id', favoriteId)
    router.refresh()
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-1 flex-shrink-0">
        <span className="text-[11px] text-gray-400 whitespace-nowrap">Supprimer ?</span>
        <button
          onClick={handleDelete}
          disabled={loading}
          className="w-6 h-6 flex items-center justify-center text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors"
          title="Confirmer la suppression"
        >
          <Check size={13} />
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-gray-300 transition-colors"
          title="Annuler"
        >
          <X size={13} />
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="w-6 h-6 flex items-center justify-center text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
      title="Supprimer cette note"
    >
      <Trash2 size={13} />
    </button>
  )
}
