'use client'

import { useState, useRef, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const EMOJIS: Record<number, string> = {
  5: '😍', 4: '🙂', 3: '😶', 2: '😬', 1: '🤮',
}
const LABELS: Record<number, string> = {
  5: "J'ai adoré", 4: "J'ai aimé", 3: "Pas d'avis", 2: "Je n'ai pas aimé", 1: "J'ai détesté",
}

export default function InlineRatingPicker({
  favoriteId,
  initialRating,
}: {
  favoriteId: string
  initialRating: number
}) {
  const [rating, setRating]   = useState(initialRating)
  const [open, setOpen]       = useState(false)
  const [saving, setSaving]   = useState(false)
  const ref                   = useRef<HTMLDivElement>(null)
  const router                = useRouter()

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open])

  async function changeRating(value: number) {
    if (value === rating) { setOpen(false); return }
    setSaving(true)
    const supabase = createClient()
    await supabase.from('favorites').update({ rating: value }).eq('id', favoriteId)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) supabase.rpc('compute_matches', { target_user_id: user.id }) // fire-and-forget
    setRating(value)
    setOpen(false)
    setSaving(false)
    router.refresh()
  }

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        onClick={() => setOpen(o => !o)}
        disabled={saving}
        className="leading-none hover:scale-110 transition-transform disabled:opacity-50"
        style={{ fontSize: '32px' }}
        title="Modifier la note"
      >
        {saving
          ? <Loader2 size={24} className="animate-spin text-gray-400" />
          : EMOJIS[rating]}
      </button>

      {open && (
        <div className="absolute right-0 bottom-full mb-2 bg-gray-800 border border-gray-700 rounded-xl p-3 flex gap-4 z-20 shadow-xl">
          {[5, 4, 3, 2, 1].map(v => (
            <button
              key={v}
              onClick={() => changeRating(v)}
              title={LABELS[v]}
              style={{ fontSize: '32px' }}
              className={`leading-none p-1 rounded-lg hover:bg-gray-700 transition-colors ${v === rating ? 'ring-1 ring-violet-500 bg-gray-700' : ''}`}
            >
              {EMOJIS[v]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
