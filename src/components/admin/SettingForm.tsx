'use client'

import { useState, useTransition } from 'react'
import { updateSetting } from '@/lib/actions/settings'
import { Loader2, Check, AlertCircle } from 'lucide-react'

interface Props {
  settingKey: string
  currentValue: string
  description: string
  type?: 'number' | 'text'
  min?: number
  max?: number
}

export default function SettingForm({
  settingKey,
  currentValue,
  description,
  type = 'text',
  min,
  max,
}: Props) {
  const [value, setValue] = useState(currentValue)
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [isPending, startTransition] = useTransition()

  const isDirty = value !== currentValue

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('idle')

    startTransition(async () => {
      try {
        await updateSetting(settingKey, value)
        setStatus('success')
        setTimeout(() => setStatus('idle'), 3000)
      } catch (err) {
        setStatus('error')
        setErrorMsg(err instanceof Error ? err.message : 'Erreur inconnue')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="text-sm text-gray-400">{description}</p>

      <div className="flex gap-3 items-center">
        <input
          type={type}
          value={value}
          onChange={e => { setValue(e.target.value); setStatus('idle') }}
          min={min}
          max={max}
          className="w-48 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-violet-500 transition-colors text-sm font-mono"
        />
        <button
          type="submit"
          disabled={isPending || !isDirty}
          className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
        >
          {isPending && <Loader2 size={14} className="animate-spin" />}
          Sauvegarder
        </button>

        {status === 'success' && (
          <span className="flex items-center gap-1.5 text-sm text-emerald-400">
            <Check size={14} /> Sauvegardé
          </span>
        )}
        {status === 'error' && (
          <span className="flex items-center gap-1.5 text-sm text-red-400">
            <AlertCircle size={14} /> {errorMsg}
          </span>
        )}
      </div>

      {type === 'number' && (
        <p className="text-xs text-gray-600">
          Valeur actuelle en base : <span className="text-gray-400 font-mono">{currentValue}</span>
        </p>
      )}
    </form>
  )
}
