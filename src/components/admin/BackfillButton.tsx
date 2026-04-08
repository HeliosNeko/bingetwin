'use client'

import { useState } from 'react'
import { RefreshCw, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'

type Status = 'idle' | 'running' | 'done' | 'error'

interface Result {
  updated: number
  failed:  number
  total:   number
  message: string
}

export default function BackfillButton() {
  const [status, setStatus]   = useState<Status>('idle')
  const [result, setResult]   = useState<Result | null>(null)
  const [errMsg, setErrMsg]   = useState('')

  async function run() {
    setStatus('running')
    setResult(null)

    try {
      const res = await fetch('/api/admin/backfill-genres', { method: 'POST' })
      const data = await res.json()

      if (!res.ok) {
        setStatus('error')
        setErrMsg(data.error ?? 'Erreur inconnue')
        return
      }
      setResult(data)
      setStatus('done')
    } catch (e) {
      setStatus('error')
      setErrMsg(e instanceof Error ? e.message : 'Erreur réseau')
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-400">
        Récupère les genres manquants depuis TMDB (films/séries) et Open Library (livres)
        pour tous les items existants en base. Respecte les limites de taux des APIs.
      </p>

      <div className="flex items-center gap-4">
        <button
          onClick={run}
          disabled={status === 'running'}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
        >
          {status === 'running'
            ? <Loader2 size={14} className="animate-spin" />
            : <RefreshCw size={14} />}
          {status === 'running' ? 'Traitement en cours…' : 'Lancer le backfill'}
        </button>

        {status === 'done' && result && (
          <span className="flex items-center gap-1.5 text-sm text-emerald-400">
            <CheckCircle size={14} />
            {result.updated}/{result.total} items mis à jour
            {result.failed > 0 && (
              <span className="text-gray-500 ml-1">({result.failed} échoués)</span>
            )}
          </span>
        )}

        {status === 'error' && (
          <span className="flex items-center gap-1.5 text-sm text-red-400">
            <AlertCircle size={14} /> {errMsg}
          </span>
        )}
      </div>

      {status === 'running' && (
        <p className="text-xs text-gray-500 animate-pulse">
          Les appels TMDB sont limités à 40/10 s — le traitement peut prendre quelques secondes…
        </p>
      )}
    </div>
  )
}
