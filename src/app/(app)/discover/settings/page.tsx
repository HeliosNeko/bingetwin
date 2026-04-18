'use client'

import { useState, useEffect } from 'react'
import { ArrowLeft, Check, Loader2 } from 'lucide-react'
import Link from 'next/link'

// ── Genre list (TMDB movie IDs) ───────────────────────────────────────────────

const GENRES = [
  { id: 28,    label: 'Action' },
  { id: 12,    label: 'Aventure' },
  { id: 16,    label: 'Animation' },
  { id: 35,    label: 'Comédie' },
  { id: 80,    label: 'Crime' },
  { id: 99,    label: 'Documentaire' },
  { id: 18,    label: 'Drame' },
  { id: 10751, label: 'Famille' },
  { id: 14,    label: 'Fantastique' },
  { id: 36,    label: 'Histoire' },
  { id: 27,    label: 'Horreur' },
  { id: 10402, label: 'Musique' },
  { id: 9648,  label: 'Mystère' },
  { id: 10749, label: 'Romance' },
  { id: 878,   label: 'Science-Fiction' },
  { id: 53,    label: 'Thriller' },
  { id: 10752, label: 'Guerre' },
  { id: 37,    label: 'Western' },
]

const ALL_GENRE_IDS = GENRES.map(g => g.id)

const PERIODS = [
  { value: 'year',    label: 'Cette année (12 derniers mois)' },
  { value: '5years',  label: 'Depuis 5 ans' },
  { value: '20years', label: 'Depuis 20 ans' },
  { value: 'all',     label: 'Toutes périodes' },
]

const LANG_GROUPS = [
  { value: 'en',       label: 'Anglais' },
  { value: 'fr',       label: 'Français' },
  { value: 'european', label: 'Autres langues européennes', sub: 'es, de, it, pt, nl, pl, sv, da…' },
  { value: 'asian',    label: 'Langues asiatiques',         sub: 'ja, ko, zh, hi, th, id…' },
  { value: 'all',      label: 'Toutes les langues' },
]

// ── Types ─────────────────────────────────────────────────────────────────────

interface Prefs {
  genres:         number[]
  period:         string
  language_group: string
}

const DEFAULT_PREFS: Prefs = { genres: [], period: 'all', language_group: 'all' }

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SuggestionSettingsPage() {
  const [prefs, setPrefs]   = useState<Prefs>(DEFAULT_PREFS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)

  useEffect(() => {
    fetch('/api/suggestion-preferences')
      .then(r => r.ok ? r.json() : null)
      .then((data: Prefs | null) => { if (data) setPrefs(data) })
      .finally(() => setLoading(false))
  }, [])

  function toggleGenre(id: number) {
    setPrefs(prev => {
      const has = prev.genres.includes(id)
      const next = has ? prev.genres.filter(g => g !== id) : [...prev.genres, id]
      return { ...prev, genres: next }
    })
  }

  function selectAllGenres()  { setPrefs(prev => ({ ...prev, genres: [] })) }
  function deselectAllGenres(){ setPrefs(prev => ({ ...prev, genres: ALL_GENRE_IDS })) }

  // genres vide = "tous" (par défaut), genres non vide = sélection partielle
  const isGenreActive = (id: number) =>
    prefs.genres.length === 0 || prefs.genres.includes(id)

  async function handleSave() {
    setSaving(true)
    try {
      await fetch('/api/suggestion-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prefs),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="animate-spin text-violet-400" size={32} />
    </div>
  )

  return (
    <div className="p-6 max-w-2xl mx-auto pb-24">
      {/* Header */}
      <Link
        href="/discover"
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-white transition-colors mb-6"
      >
        <ArrowLeft size={16} />
        Retour à la recherche
      </Link>
      <h1 className="text-2xl font-bold mb-1">Mes préférences de suggestions</h1>
      <p className="text-gray-400 text-sm mb-8">
        Personnalise la mosaïque de suggestions selon tes goûts.
      </p>

      {/* ── Genres ────────────────────────────────────────────────────── */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Genres</h2>
          <div className="flex gap-3 text-xs">
            <button onClick={selectAllGenres} className="text-violet-400 hover:text-violet-300 transition-colors">
              Tous
            </button>
            <button onClick={deselectAllGenres} className="text-gray-500 hover:text-gray-300 transition-colors">
              Aucun
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-500 mb-3">
          {prefs.genres.length === 0 ? 'Tous les genres sélectionnés' : `${prefs.genres.length} genre${prefs.genres.length > 1 ? 's' : ''} sélectionné${prefs.genres.length > 1 ? 's' : ''}`}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {GENRES.map(g => {
            const active = isGenreActive(g.id)
            return (
              <button
                key={g.id}
                onClick={() => toggleGenre(g.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-all border ${
                  active
                    ? 'bg-violet-900/40 border-violet-600/60 text-violet-200'
                    : 'bg-gray-900 border-gray-800 text-gray-500 hover:border-gray-600'
                }`}
              >
                <div className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center border ${
                  active ? 'bg-violet-600 border-violet-600' : 'border-gray-600'
                }`}>
                  {active && <Check size={10} className="text-white" />}
                </div>
                {g.label}
              </button>
            )
          })}
        </div>
      </section>

      {/* ── Période ───────────────────────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="font-semibold mb-3">Période</h2>
        <div className="space-y-2">
          {PERIODS.map(p => (
            <button
              key={p.value}
              onClick={() => setPrefs(prev => ({ ...prev, period: p.value }))}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all text-sm ${
                prefs.period === p.value
                  ? 'bg-violet-900/40 border-violet-600/60 text-violet-200'
                  : 'bg-gray-900 border-gray-800 text-gray-400 hover:border-gray-600'
              }`}
            >
              <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                prefs.period === p.value ? 'border-violet-500' : 'border-gray-600'
              }`}>
                {prefs.period === p.value && (
                  <div className="w-2 h-2 rounded-full bg-violet-500" />
                )}
              </div>
              {p.label}
            </button>
          ))}
        </div>
      </section>

      {/* ── Langue originale ──────────────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="font-semibold mb-3">Langue originale</h2>
        <div className="space-y-2">
          {LANG_GROUPS.map(l => (
            <button
              key={l.value}
              onClick={() => setPrefs(prev => ({ ...prev, language_group: l.value }))}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                prefs.language_group === l.value
                  ? 'bg-violet-900/40 border-violet-600/60'
                  : 'bg-gray-900 border-gray-800 hover:border-gray-600'
              }`}
            >
              <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                prefs.language_group === l.value ? 'border-violet-500' : 'border-gray-600'
              }`}>
                {prefs.language_group === l.value && (
                  <div className="w-2 h-2 rounded-full bg-violet-500" />
                )}
              </div>
              <div>
                <p className={`text-sm ${prefs.language_group === l.value ? 'text-violet-200' : 'text-gray-400'}`}>
                  {l.label}
                </p>
                {l.sub && (
                  <p className="text-[11px] text-gray-600 mt-0.5">{l.sub}</p>
                )}
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* ── Save button (fixed bottom) ────────────────────────────────── */}
      <div className="fixed bottom-16 md:bottom-0 left-0 md:left-56 right-0 px-6 py-4 bg-gray-950/90 backdrop-blur-sm border-t border-gray-800">
        <div className="max-w-2xl mx-auto">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-60 rounded-xl font-medium transition-colors"
          >
            {saving ? (
              <><Loader2 size={16} className="animate-spin" /> Enregistrement…</>
            ) : saved ? (
              <><Check size={16} /> Préférences enregistrées</>
            ) : (
              'Enregistrer mes préférences'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
