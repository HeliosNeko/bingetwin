'use client'

import { useState, useRef } from 'react'
import { Upload, Check, Loader2, X, ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

// ── Types ─────────────────────────────────────────────────────────────────────

type Source = 'netflix' | 'letterboxd' | 'imdb' | 'goodreads'
type Step = 'select' | 'searching' | 'review' | 'quickrate' | 'saving' | 'done'

interface ParsedItem {
  cleanTitle: string
  year: string
  importedRating: number | null
  preferredType: 'movie' | 'series' | 'book'
}

interface MatchedItem extends ParsedItem {
  externalId: string
  displayTitle: string
  poster: string | null
  userRating: number | null
}

// ── CSV Parser ────────────────────────────────────────────────────────────────

function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (ch === '"') { quoted = false }
      else { field += ch }
    } else {
      if (ch === '"') { quoted = true }
      else if (ch === ',') { row.push(field); field = '' }
      else if (ch === '\r' || ch === '\n') {
        if (ch === '\r' && text[i + 1] === '\n') i++
        row.push(field); field = ''
        if (row.some(f => f !== '')) rows.push(row)
        row = []
      } else { field += ch }
    }
    i++
  }
  row.push(field)
  if (row.some(f => f !== '')) rows.push(row)
  return rows
}

function csvToObjects(text: string): Record<string, string>[] {
  const rows = parseCSV(text)
  if (rows.length < 2) return []
  const headers = rows[0].map(h => h.trim())
  return rows.slice(1).map(row => {
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => { obj[h] = (row[i] ?? '').trim() })
    return obj
  })
}

// ── Rating Converters ─────────────────────────────────────────────────────────

// Letterboxd: 0.5-5 → 1-5
function fromLetterboxd(r: string): number | null {
  const v = parseFloat(r); if (!v || isNaN(v)) return null
  return Math.max(1, Math.min(5, Math.round(v)))
}
// IMDb: 1-10 → 1-5
function fromIMDb(r: string): number | null {
  const v = parseInt(r, 10); if (!v || isNaN(v)) return null
  return Math.max(1, Math.min(5, Math.ceil(v / 2)))
}
// Goodreads: 1-5 direct (0 = unrated)
function fromGoodreads(r: string): number | null {
  const v = parseInt(r, 10); if (!v || isNaN(v)) return null
  return Math.max(1, Math.min(5, v))
}

// ── Source Definitions ────────────────────────────────────────────────────────

const SOURCES: Record<Source, {
  name: string; emoji: string; color: string; selected: string
  instructions: string[]
  parse(text: string): ParsedItem[]
}> = {
  netflix: {
    name: 'Netflix', emoji: '🎬',
    color: 'border-red-800/50 hover:border-red-600/70',
    selected: 'border-red-500 bg-red-900/10',
    instructions: [
      'Sur Netflix → Menu → Compte',
      '→ Historique de visionnage',
      '→ Télécharger tout',
    ],
    parse(text) {
      const rows = csvToObjects(text)
      const seen = new Set<string>()
      const out: ParsedItem[] = []
      for (const row of rows) {
        const raw = row['Title'] ?? row['Titre'] ?? ''; if (!raw) continue
        const seriesM = raw.match(/^(.+?):\s*(?:Season|Saison|Partie|Part)\s*\d+/i)
        const cleanTitle = seriesM ? seriesM[1].trim() : raw.trim()
        const key = cleanTitle.toLowerCase()
        if (seen.has(key)) continue; seen.add(key)
        out.push({ cleanTitle, year: '', importedRating: null, preferredType: seriesM ? 'series' : 'movie' })
      }
      return out.slice(0, 300)
    },
  },
  letterboxd: {
    name: 'Letterboxd', emoji: '🎞',
    color: 'border-green-800/50 hover:border-green-600/70',
    selected: 'border-green-500 bg-green-900/10',
    instructions: [
      'Sur Letterboxd → Profil',
      '→ Import & Export → Export your data',
      '→ télécharger watched.csv',
    ],
    parse(text) {
      const rows = csvToObjects(text)
      const seen = new Set<string>()
      const out: ParsedItem[] = []
      for (const row of rows) {
        const title = row['Name'] ?? ''; if (!title) continue
        const key = title.toLowerCase()
        if (seen.has(key)) continue; seen.add(key)
        out.push({ cleanTitle: title, year: row['Year'] ?? '', importedRating: fromLetterboxd(row['Rating'] ?? ''), preferredType: 'movie' })
      }
      return out.slice(0, 300)
    },
  },
  imdb: {
    name: 'IMDb', emoji: '⭐',
    color: 'border-yellow-800/50 hover:border-yellow-600/70',
    selected: 'border-yellow-500 bg-yellow-900/10',
    instructions: [
      'Sur IMDb → Votre activité → Notes',
      '→ ••• → Exporter',
    ],
    parse(text) {
      const rows = csvToObjects(text)
      const SKIP = new Set(['tvEpisode', 'tvSpecial', 'videoGame'])
      const out: ParsedItem[] = []
      for (const row of rows) {
        const title = row['Title'] ?? ''; if (!title) continue
        const tt = row['Title Type'] ?? row['title_type'] ?? 'movie'
        if (SKIP.has(tt)) continue
        const isSeries = tt.toLowerCase().includes('series') || tt.toLowerCase().includes('mini')
        out.push({ cleanTitle: title, year: row['Year'] ?? '', importedRating: fromIMDb(row['Your Rating'] ?? ''), preferredType: isSeries ? 'series' : 'movie' })
      }
      return out.slice(0, 300)
    },
  },
  goodreads: {
    name: 'Goodreads', emoji: '📚',
    color: 'border-amber-800/50 hover:border-amber-600/70',
    selected: 'border-amber-500 bg-amber-900/10',
    instructions: [
      'Sur Goodreads → Mon profil',
      '→ Importer et exporter',
      '→ Exporter ma bibliothèque',
    ],
    parse(text) {
      const rows = csvToObjects(text)
      const out: ParsedItem[] = []
      for (const row of rows) {
        const title = row['Title'] ?? ''; if (!title) continue
        const shelf = row['Exclusive Shelf'] ?? ''
        if (shelf && shelf !== 'read') continue
        out.push({ cleanTitle: title, year: row['Original Publication Year'] ?? row['Year Published'] ?? '', importedRating: fromGoodreads(row['My Rating'] ?? ''), preferredType: 'book' })
      }
      return out.slice(0, 300)
    },
  },
}

// ── TMDB / OL Direct Search ───────────────────────────────────────────────────

const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY!
const IMG = 'https://image.tmdb.org/t/p/w154'

async function searchTMDB(type: 'movie' | 'tv', query: string, year?: string): Promise<{ id: string; title: string; poster: string | null; year: string } | null> {
  const url = new URL(`https://api.themoviedb.org/3/search/${type}`)
  url.searchParams.set('api_key', TMDB_KEY)
  url.searchParams.set('query', query)
  url.searchParams.set('language', 'fr-FR')
  if (year) url.searchParams.set(type === 'movie' ? 'year' : 'first_air_date_year', year)
  try {
    const res = await fetch(url.toString())
    if (!res.ok) return null
    const data = await res.json()
    const results: Record<string, unknown>[] = data.results ?? []
    if (!results.length) return null
    // Prefer year match
    let best = results[0]
    if (year) {
      const match = results.find(r => String(r.release_date ?? r.first_air_date ?? '').startsWith(year))
      if (match) best = match
    }
    return {
      id: String(best.id),
      title: (best.title ?? best.name) as string,
      poster: best.poster_path ? `${IMG}${best.poster_path}` : null,
      year: String(best.release_date ?? best.first_air_date ?? '').slice(0, 4),
    }
  } catch { return null }
}

async function searchOL(query: string): Promise<{ id: string; title: string; poster: string | null; year: string } | null> {
  try {
    const res = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=3&fields=key,title,first_publish_year,cover_i`)
    if (!res.ok) return null
    const data = await res.json()
    const docs: Record<string, unknown>[] = data.docs ?? []
    if (!docs.length) return null
    const item = docs[0]
    return {
      id: (item.key as string).replace('/works/', ''),
      title: item.title as string,
      poster: item.cover_i ? `https://covers.openlibrary.org/b/id/${item.cover_i}-S.jpg` : null,
      year: String(item.first_publish_year ?? ''),
    }
  } catch { return null }
}

async function findItem(parsed: ParsedItem): Promise<MatchedItem | null> {
  let found: { id: string; title: string; poster: string | null; year: string } | null = null

  if (parsed.preferredType === 'book') {
    found = await searchOL(parsed.cleanTitle)
  } else {
    const primaryType = parsed.preferredType === 'series' ? 'tv' : 'movie'
    const fallbackType = parsed.preferredType === 'series' ? 'movie' : 'tv'
    found = await searchTMDB(primaryType, parsed.cleanTitle, parsed.year || undefined)
    if (!found) found = await searchTMDB(fallbackType, parsed.cleanTitle, parsed.year || undefined)
  }

  if (!found) return null
  return { ...parsed, externalId: found.id, displayTitle: found.title, poster: found.poster, year: found.year || parsed.year, userRating: parsed.importedRating }
}

// ── Emoji constants ───────────────────────────────────────────────────────────

const EMOJIS: Record<number, string> = { 5: '😍', 4: '🙂', 3: '😶', 2: '😬', 1: '🤮' }
const LABELS: Record<number, string> = {
  5: "J'ai adoré", 4: "J'ai aimé", 3: "Pas d'avis", 2: "Je n'ai pas aimé", 1: "J'ai détesté",
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ImportPage() {
  const [source, setSource]           = useState<Source | null>(null)
  const [step, setStep]               = useState<Step>('select')
  const [progress, setProgress]       = useState({ current: 0, total: 0 })
  const [matched, setMatched]         = useState<MatchedItem[]>([])
  const [notFound, setNotFound]       = useState(0)
  const [quickIndex, setQuickIndex]   = useState(0)
  const [savedCount, setSavedCount]   = useState(0)
  const [totalRated, setTotalRated]   = useState(0)
  const [threshold, setThreshold]     = useState(500)
  // one hidden input per source so re-uploads always trigger onChange
  const fileRefs                      = useRef<Record<Source, HTMLInputElement | null>>({ netflix: null, letterboxd: null, imdb: null, goodreads: null })

  // ── File processing ──────────────────────────────────────────────────────

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>, src: Source) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = '' // allow re-upload of same file
    setSource(src)

    const text = await file.text()
    const parsed = SOURCES[src].parse(text)

    if (parsed.length === 0) {
      alert('Aucun titre trouvé dans ce fichier. Vérifie le format CSV.')
      return
    }

    setStep('searching')
    setProgress({ current: 0, total: parsed.length })

    const results: MatchedItem[] = []
    const BATCH = 5

    for (let i = 0; i < parsed.length; i += BATCH) {
      const batch = parsed.slice(i, i + BATCH)
      const batchResults = await Promise.all(batch.map(item => findItem(item)))
      for (const r of batchResults) {
        if (r) results.push(r)
      }
      setProgress({ current: Math.min(i + BATCH, parsed.length), total: parsed.length })
      if (i + BATCH < parsed.length) await new Promise(r => setTimeout(r, 100))
    }

    setMatched(results)
    setNotFound(parsed.length - results.length)

    const allUnrated = results.every(m => m.userRating === null)
    if (allUnrated && results.length > 0) {
      setQuickIndex(0)
      setStep('quickrate')
    } else {
      setStep('review')
    }
  }

  function setRating(index: number, rating: number | null) {
    setMatched(prev => prev.map((m, i) => i === index ? { ...m, userRating: rating } : m))
  }

  function quickRate(rating: number) {
    setMatched(prev => prev.map((m, i) => i === quickIndex ? { ...m, userRating: rating } : m))
    if (quickIndex < matched.length - 1) setQuickIndex(q => q + 1)
    else setStep('review')
  }

  // ── Save ─────────────────────────────────────────────────────────────────

  async function saveAll() {
    setStep('saving')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const toSave = matched.filter(m => m.userRating !== null)

    if (toSave.length > 0) {
      await supabase.from('favorites').upsert(
        toSave.map(m => ({
          user_id:     user.id,
          media_type:  m.preferredType,
          external_id: m.externalId,
          title:       m.displayTitle,
          poster_url:  m.poster,
          year:        m.year,
          rating:      m.userRating,
          genres:      [] as string[],
        })),
        { onConflict: 'user_id,media_type,external_id' }
      )
      supabase.rpc('compute_matches', { target_user_id: user.id }) // fire-and-forget
    }

    const [{ count }, { data: settingRow }] = await Promise.all([
      supabase.from('favorites').select('*', { count: 'exact', head: true }).eq('user_id', user.id).not('rating', 'is', null),
      supabase.from('app_settings').select('value').eq('key', 'minimum_ratings_required').single(),
    ])

    setSavedCount(toSave.length)
    setTotalRated(count ?? 0)
    setThreshold(Number(settingRow?.value ?? 500))
    setStep('done')
  }

  // ── RENDER: Select ────────────────────────────────────────────────────────

  if (step === 'select') return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">Importer mon historique</h1>
      <p className="text-gray-400 text-sm mb-8">
        Exporte ton historique depuis ta plateforme, puis charge le fichier CSV ici.
      </p>

      <div className="grid sm:grid-cols-2 gap-4">
        {(Object.entries(SOURCES) as [Source, typeof SOURCES[Source]][]).map(([key, cfg]) => (
          <div
            key={key}
            className={`p-5 bg-gray-900 border rounded-xl transition-all ${cfg.color} border-gray-800`}
          >
            <div className="text-3xl mb-3">{cfg.emoji}</div>
            <h2 className="font-semibold mb-2">{cfg.name}</h2>
            <ol className="list-none space-y-0.5 mb-5">
              {cfg.instructions.map((line, i) => (
                <li key={i} className="text-xs text-gray-500">{line}</li>
              ))}
            </ol>

            {/* Upload button — directly on the card */}
            <label className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm font-medium cursor-pointer transition-colors w-fit">
              <Upload size={14} />
              Choisir le fichier CSV
              <input
                ref={el => { fileRefs.current[key] = el }}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={e => handleFile(e, key)}
              />
            </label>
          </div>
        ))}
      </div>
    </div>
  )

  // ── RENDER: Searching ─────────────────────────────────────────────────────

  if (step === 'searching') {
    const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0
    return (
      <div className="p-6 max-w-xl mx-auto flex flex-col items-center justify-center min-h-[60vh] text-center">
        <Loader2 className="animate-spin text-violet-400 mb-6" size={40} />
        <h2 className="text-lg font-semibold mb-2">Recherche en cours…</h2>
        <p className="text-gray-400 text-sm mb-6">
          {progress.current} / {progress.total} titres identifiés
        </p>
        <div className="w-full max-w-sm bg-gray-800 rounded-full h-2">
          <div className="bg-violet-500 h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
    )
  }

  // ── RENDER: Quick rate (one at a time) ────────────────────────────────────

  if (step === 'quickrate') {
    const item = matched[quickIndex]
    if (!item) { setStep('review'); return null }
    const pct = Math.round((quickIndex / matched.length) * 100)

    return (
      <div className="p-6 max-w-sm mx-auto">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setStep('review')} className="text-xs text-gray-500 hover:text-white transition-colors">
            Passer en liste →
          </button>
          <span className="text-xs text-gray-500">{quickIndex + 1} / {matched.length}</span>
        </div>

        <div className="w-full bg-gray-800 rounded-full h-1 mb-6">
          <div className="bg-violet-500 h-1 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>

        {/* Poster */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden mb-6">
          {item.poster
            ? <img src={item.poster} alt={item.displayTitle} className="w-full aspect-[2/3] object-cover" /> // eslint-disable-line @next/next/no-img-element
            : <div className="w-full aspect-[2/3] bg-gray-800 flex items-center justify-center text-5xl">
                {item.preferredType === 'book' ? '📚' : '🎬'}
              </div>
          }
          <div className="p-4">
            <p className="font-semibold">{item.displayTitle}</p>
            {item.year && <p className="text-sm text-gray-500 mt-0.5">{item.year}</p>}
          </div>
        </div>

        {/* Emoji buttons */}
        <div className="flex justify-center gap-4 mb-5">
          {[5, 4, 3, 2, 1].map(v => (
            <button
              key={v}
              onClick={() => quickRate(v)}
              title={LABELS[v]}
              style={{ fontSize: '36px', lineHeight: 1 }}
              className={`p-2 rounded-xl transition-all hover:scale-110 hover:bg-gray-800 ${item.userRating === v ? 'bg-gray-800 ring-2 ring-violet-500' : ''}`}
            >
              {EMOJIS[v]}
            </button>
          ))}
        </div>

        <div className="flex justify-center">
          <button
            onClick={() => quickIndex < matched.length - 1 ? setQuickIndex(q => q + 1) : setStep('review')}
            className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
          >
            Passer →
          </button>
        </div>
      </div>
    )
  }

  // ── RENDER: Review list ───────────────────────────────────────────────────

  if (step === 'review') {
    const ratedCount = matched.filter(m => m.userRating !== null).length
    const unratedCount = matched.length - ratedCount

    return (
      <div className="p-6 max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-xl font-bold">Confirme ta sélection</h2>
            <p className="text-gray-400 text-sm mt-0.5">
              {matched.length} reconnus
              {notFound > 0 && <> · <span className="text-gray-500">{notFound} non trouvés</span></>}
              {' · '}<span className="text-violet-300">{ratedCount} noté{ratedCount > 1 ? 's' : ''}</span>
            </p>
          </div>
          <button
            onClick={saveAll}
            disabled={ratedCount === 0}
            className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
          >
            <Check size={16} />
            Valider ({ratedCount})
          </button>
        </div>

        {/* Quick rate mode CTA */}
        {unratedCount > 0 && (
          <button
            onClick={() => {
              const first = matched.findIndex(m => m.userRating === null)
              setQuickIndex(first >= 0 ? first : 0)
              setStep('quickrate')
            }}
            className="mb-5 text-sm text-violet-400 hover:text-violet-300 transition-colors flex items-center gap-1"
          >
            ⚡ Mode rapide — noter les {unratedCount} titres sans note un par un
          </button>
        )}

        {/* List */}
        <div className="divide-y divide-gray-800/60">
          {matched.map((item, idx) => (
            <div key={`${item.externalId}-${idx}`} className="flex items-center gap-3 py-3">
              {/* Thumbnail */}
              <div className="w-9 h-[52px] flex-shrink-0 rounded-md overflow-hidden bg-gray-800">
                {item.poster
                  ? <img src={item.poster} alt={item.displayTitle} className="w-full h-full object-cover" /> // eslint-disable-line @next/next/no-img-element
                  : <div className="w-full h-full flex items-center justify-center text-gray-600 text-lg">{item.preferredType === 'book' ? '📚' : '🎬'}</div>
                }
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{item.displayTitle}</p>
                {item.year && <p className="text-xs text-gray-500">{item.year}</p>}
              </div>

              {/* Rating row */}
              <div className="flex items-center gap-3 flex-shrink-0">
                <div className="flex gap-2">
                  {[5, 4, 3, 2, 1].map(v => (
                    <button
                      key={v}
                      onClick={() => setRating(idx, v)}
                      title={LABELS[v]}
                      style={{ fontSize: '24px', lineHeight: 1 }}
                      className={`transition-all hover:scale-110 ${item.userRating === v ? 'ring-2 ring-violet-500 rounded-md' : 'opacity-40 hover:opacity-100'}`}
                    >
                      {EMOJIS[v]}
                    </button>
                  ))}
                </div>
                {item.userRating !== null && (
                  <button
                    onClick={() => setRating(idx, null)}
                    className="text-gray-600 hover:text-gray-400 transition-colors"
                    title="Effacer"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Bottom CTA */}
        <div className="mt-6 pt-4 border-t border-gray-800 flex justify-end">
          <button
            onClick={saveAll}
            disabled={ratedCount === 0}
            className="flex items-center gap-2 px-6 py-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl font-medium transition-colors"
          >
            <Check size={18} />
            Importer {ratedCount} produit{ratedCount > 1 ? 's' : ''}
          </button>
        </div>
      </div>
    )
  }

  // ── RENDER: Saving ────────────────────────────────────────────────────────

  if (step === 'saving') return (
    <div className="p-6 max-w-xl mx-auto flex flex-col items-center justify-center min-h-[60vh] text-center">
      <Loader2 className="animate-spin text-violet-400 mb-4" size={36} />
      <p className="text-gray-400">Enregistrement en cours…</p>
    </div>
  )

  // ── RENDER: Done ──────────────────────────────────────────────────────────

  if (step === 'done') {
    const remaining = Math.max(0, threshold - totalRated)
    const pct = Math.min(100, Math.round((totalRated / threshold) * 100))

    return (
      <div className="p-6 max-w-xl mx-auto">
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">🎉</div>
          <h2 className="text-2xl font-bold mb-2">Import terminé !</h2>
          <p className="text-gray-400">
            <span className="text-white font-semibold">{savedCount}</span>{' '}
            produit{savedCount > 1 ? 's' : ''} importé{savedCount > 1 ? 's' : ''} avec succès
          </p>
          {notFound > 0 && (
            <p className="text-gray-500 text-sm mt-1">
              {notFound} titre{notFound > 1 ? 's' : ''} non reconnu{notFound > 1 ? 's' : ''} (introuvable sur TMDB/OL)
            </p>
          )}
        </div>

        {/* Progress bar */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
          <div className="flex items-end justify-between mb-3">
            <div>
              <p className="text-3xl font-bold">
                {totalRated}
                <span className="text-gray-500 text-xl font-normal"> / {threshold}</span>
              </p>
              <p className="text-sm text-gray-400 mt-0.5">notes pour le matching</p>
            </div>
            <span className="text-sm font-semibold text-violet-300">{pct}%</span>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-2.5">
            <div
              className="bg-gradient-to-r from-violet-500 to-pink-500 h-2.5 rounded-full transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-xs mt-3">
            {remaining > 0
              ? <span className="text-gray-400">Encore <span className="text-white font-semibold">{remaining}</span> note{remaining > 1 ? 's' : ''} pour trouver tes premiers jumeaux !</span>
              : <span className="text-emerald-400">✓ Seuil atteint — tes jumeaux culturels t&apos;attendent !</span>
            }
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => { setStep('select'); setSource(null); setMatched([]) }}
            className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 rounded-xl text-sm font-medium transition-colors"
          >
            Importer une autre source
          </button>
          <Link
            href="/matches"
            className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-500 rounded-xl text-sm font-medium transition-colors text-center"
          >
            Voir mes matches
          </Link>
        </div>
      </div>
    )
  }

  return null
}
