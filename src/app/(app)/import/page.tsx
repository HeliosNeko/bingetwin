'use client'

import { useState, useRef, useEffect } from 'react'
import { Upload, Check, Loader2, X, ArrowLeft, Trash2, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

// ── Types ─────────────────────────────────────────────────────────────────────

type Source = 'netflix' | 'letterboxd' | 'imdb' | 'goodreads'
type Step = 'select' | 'profile' | 'searching' | 'review' | 'quickrate' | 'saving' | 'done'

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
  // Strip UTF-8 BOM (\uFEFF) that Windows/Mac exports often prepend
  const clean = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text
  const rows = parseCSV(clean)
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
  parse(text: string, profile?: string): ParsedItem[]
  parseProfiles?(text: string): string[]
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
    // Retourne les profils distincts si le CSV multi-profils (colonne "Profile Name")
    parseProfiles(text) {
      const rows = csvToObjects(text)
      const col = Object.keys(rows[0] ?? {}).find(k =>
        k.toLowerCase().includes('profile') || k.toLowerCase().includes('profil')
      )
      if (!col) return []
      return [...new Set(rows.map(r => r[col]).filter(Boolean))] as string[]
    },
    parse(text, profile) {
      const rows = csvToObjects(text)

      // Détection des colonnes disponibles
      const cols = Object.keys(rows[0] ?? {})
      const profileCol = cols.find(k => k.toLowerCase().includes('profile') || k.toLowerCase().includes('profil'))
      const durCol     = cols.find(k => k.toLowerCase().includes('duration') || k.toLowerCase().includes('durée'))
      const suppCol    = cols.find(k => k.toLowerCase().includes('supplemental'))

      console.log('[Netflix CSV] Colonnes :', cols, '| profil:', profileCol, '| durée:', durCol)

      const seen = new Set<string>()
      const out: ParsedItem[] = []

      for (const row of rows) {
        // Filtre par profil si demandé
        if (profile && profileCol && row[profileCol] !== profile) continue
        // Exclure bandes-annonces / clips (colonne "Supplemental Video Type")
        if (suppCol && row[suppCol]) continue
        // Exclure visionnages < 5 min si colonne Duration présente (format "h:mm:ss")
        if (durCol) {
          const parts = (row[durCol] ?? '').split(':').map(Number)
          const secs = parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : 0
          if (secs > 0 && secs < 300) continue
        }

        const raw = row['Title'] ?? row['Titre'] ?? row['title'] ?? row['titre'] ?? ''
        if (!raw) continue

        const norm = normalizeStr(raw)
        let cleanTitle = norm
        let isSeries = false

        // 1. Mot-clé de saison/épisode (FR + EN) avec ou sans espace avant ":"
        const seasonM = norm.match(/^(.+?)\s*:\s*(?:Saison|Partie|Épisode|Episode|Chapitre|Season|Part|Chapter|Volume|S\d{1,2}\b)/i)
        // 2. Format "Show : Sous-titre" avec espaces autour du ":"
        const spaceColonM = norm.match(/^(.+?)\s+:\s+/)

        if (seasonM) {
          cleanTitle = normalizeStr(seasonM[1]); isSeries = true
        } else if (spaceColonM) {
          cleanTitle = normalizeStr(spaceColonM[1]); isSeries = true
        }

        // ── Déduplication par titre principal (avant le premier " : ") ──────────
        // Évite d'avoir 103× "American Horror Story: Saison X: Épisode Y" dans la liste.
        // La clé est ce qui précède le premier ": " — si cleanTitle n'a pas de ": ", on
        // utilise cleanTitle directement.
        const colonIdx = cleanTitle.indexOf(': ')
        const dedupKey = colonIdx > 0
          ? cleanTitle.slice(0, colonIdx).toLowerCase()
          : cleanTitle.toLowerCase()

        if (seen.has(dedupKey)) continue
        seen.add(dedupKey)

        out.push({ cleanTitle, year: '', importedRating: null, preferredType: isSeries ? 'series' : 'movie' })
      }

      console.log('[Netflix] Titres uniques :', out.length,
        '— 20 premiers :', out.slice(0, 20).map(o => `"${o.cleanTitle}" (${o.preferredType})`))
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

// ── String normalization ──────────────────────────────────────────────────────

// Normalise TOUS les types d'espaces non-standard que Netflix insère :
// \u00a0 espace insécable, \u202f espace fine insécable, \u2009 espace fine,
// \u2007 espace de chiffre, \u200b espace de largeur zéro, \u00ad tiret conditionnel
function normalizeStr(s: string): string {
  return s.replace(/[\u00a0\u202f\u2009\u2007\u200b\u00ad]/g, ' ').replace(/\s{2,}/g, ' ').trim()
}

// ── Server-side search via API route ─────────────────────────────────────────
// La recherche TMDB/OL se fait côté SERVEUR pour éviter tout problème de cache
// navigateur ou de CORS. L'API route /api/import est toujours fraîche.

// ── DB-backed session cache — persistance de la liste importée ────────────────
// Toutes les opérations sur import_sessions utilisent le client Supabase
// côté navigateur (jamais l'API route serveur) pour éviter les problèmes
// de session SSR et garantir que l'utilisateur est toujours authentifié.

interface ImportSession {
  items: MatchedItem[]
  totalParsed: number
  notFound: string[]
}

async function searchBatch(titles: ParsedItem[]): Promise<{ matched: MatchedItem[]; notFound: string[] }> {
  const res = await fetch('/api/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ titles }),
  })
  if (!res.ok) return { matched: [], notFound: titles.map(t => t.cleanTitle) }
  return res.json()
}

// ── Existing-ratings merge ────────────────────────────────────────────────────
// Vérifie pour chaque MatchedItem si l'utilisateur l'a déjà noté dans ses
// favoris, et pré-remplit userRating. Retourne aussi l'ensemble des clés
// pré-notées pour affichage visuel dans la liste.

async function mergeExistingRatings(
  items: MatchedItem[],
): Promise<{ items: MatchedItem[]; preRatedKeys: Set<string> }> {
  const preRatedKeys = new Set<string>()

  // ── LOG 1 : entrée dans la fonction ──────────────────────────────────────
  console.log('[merge] début, nb titres:', items.length)

  if (items.length === 0) {
    console.log('[merge] liste vide — abandon')
    return { items, preRatedKeys }
  }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // ── LOG 2 : état de la session utilisateur ────────────────────────────────
  console.log('[merge] user:', user?.id ?? 'NON CONNECTÉ')
  if (!user) return { items, preRatedKeys }

  const externalIds = [...new Set(items.map(m => String(m.externalId)))]

  // ── LOG 3 : IDs envoyés à Supabase ───────────────────────────────────────
  console.log('[merge] externalIds (3 premiers):', externalIds.slice(0, 3), '— total:', externalIds.length)

  const { data, error } = await supabase
    .from('favorites')
    .select('external_id, media_type, rating')
    .eq('user_id', user.id)
    .in('external_id', externalIds)
    .not('rating', 'is', null)

  // ── LOG 4 : résultat Supabase ─────────────────────────────────────────────
  console.log('[merge] favoris:', data?.length ?? 0, 'erreur:', error?.message ?? null)
  if (data && data.length > 0) {
    console.log('[merge] 3 premiers favoris:', data.slice(0, 3).map(f => `${f.external_id}::${f.media_type}→${f.rating}`))
  }

  if (!data || data.length === 0) return { items, preRatedKeys }

  const ratingMap = new Map<string, number>()
  for (const fav of data) {
    ratingMap.set(`${String(fav.external_id)}::${fav.media_type}`, fav.rating as number)
  }

  const merged = items.map(item => {
    const key = `${String(item.externalId)}::${item.preferredType}`
    const existing = ratingMap.get(key)
    if (existing != null) {
      preRatedKeys.add(key)
      return { ...item, userRating: existing }
    }
    return item
  })

  // ── LOG 5 : résultat final ────────────────────────────────────────────────
  console.log('[merge] prénotés:', preRatedKeys.size, 'sur', items.length)
  return { items: merged, preRatedKeys }
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
  const [notFoundTitles, setNotFoundTitles] = useState<string[]>([])
  const [debugLines, setDebugLines]         = useState<string[]>([])
  const [parsedTitles, setParsedTitles]     = useState<string[]>([])
  const [totalParsed, setTotalParsed]       = useState(0)
  const [quickIndex, setQuickIndex]   = useState(0)
  const [savedCount, setSavedCount]   = useState(0)
  const [totalRated, setTotalRated]   = useState(0)
  const [threshold, setThreshold]     = useState(500)
  // Profils Netflix multi-comptes
  const [profiles, setProfiles]       = useState<string[]>([])
  const [pendingText, setPendingText] = useState('')
  // Persistance : sessions d'import sauvegardées en base par source
  const [sessions, setSessions]       = useState<Partial<Record<Source, ImportSession>>>({})
  const [savedCounts, setSavedCounts] = useState<Partial<Record<Source, number>>>({})
  // Clés des titres déjà notés en favoris (pour affichage visuel "déjà noté")
  const [preRatedKeys, setPreRatedKeys] = useState<Set<string>>(new Set())
  // one hidden input per source so re-uploads always trigger onChange
  const fileRefs                      = useRef<Record<Source, HTMLInputElement | null>>({ netflix: null, letterboxd: null, imdb: null, goodreads: null })

  // Chargement des sessions sauvegardées au montage de la page
  // Utilise le client Supabase navigateur (session cookie déjà disponible).
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      console.log('[sessions] user au montage:', user?.id ?? 'NON CONNECTÉ')
      if (!user) return
      supabase
        .from('import_sessions')
        .select('source, items, total_parsed, not_found')
        .eq('user_id', user.id)
        .then(({ data, error }) => {
          console.log('[sessions] chargées:', data?.length ?? 0, 'erreur:', error?.message ?? null)
          const map: Partial<Record<Source, ImportSession>> = {}
          const counts: Partial<Record<Source, number>> = {}
          for (const row of (data ?? [])) {
            const src = row.source as Source
            map[src] = { items: row.items as MatchedItem[], totalParsed: row.total_parsed, notFound: row.not_found as string[] }
            counts[src] = (row.items as MatchedItem[]).length
          }
          setSessions(map)
          setSavedCounts(counts)
        })
    })
  }, [])

  // ── File processing ──────────────────────────────────────────────────────

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>, src: Source) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = '' // allow re-upload of same file
    setSource(src)

    const text = await file.text()

    // Store first 20 raw lines for diagnostic
    const rawLines = text.split(/\r?\n/).slice(0, 20).filter(l => l.trim())
    setDebugLines(rawLines)

    // Détecter les profils Netflix multi-comptes
    if (src === 'netflix' && SOURCES.netflix.parseProfiles) {
      const detected = SOURCES.netflix.parseProfiles(text)
      if (detected.length > 1) {
        setProfiles(detected)
        setPendingText(text)
        setStep('profile')
        return
      }
    }

    await runImport(src, text, undefined)
  }

  async function handleProfileSelect(profile: string | undefined) {
    setStep('searching')
    await runImport(source!, pendingText, profile)
  }

  async function runImport(src: Source, text: string, profile: string | undefined) {
    const parsed = SOURCES[src].parse(text, profile)
    // Store first 20 parsed titles for diagnostic display
    setParsedTitles(parsed.slice(0, 20).map(p => `${p.cleanTitle} [${p.preferredType}]`))
    setTotalParsed(parsed.length)

    if (parsed.length === 0) {
      alert('Aucun titre trouvé dans ce fichier. Vérifie le format CSV et les noms de colonnes (voir console).')
      setStep('select')
      return
    }

    setStep('searching')
    setProgress({ current: 0, total: parsed.length })


    const results: MatchedItem[] = []
    const failed: string[] = []
    // Batches de 30 vers l'API serveur — chaque appel reste sous 10s (timeout Vercel)
    const BATCH = 30

    for (let i = 0; i < parsed.length; i += BATCH) {
      const batch = parsed.slice(i, i + BATCH)
      const { matched: batchMatched, notFound: batchFailed } = await searchBatch(batch)
      results.push(...batchMatched)
      failed.push(...batchFailed)
      setProgress({ current: Math.min(i + BATCH, parsed.length), total: parsed.length })
    }

    console.log('[Import] Reconnus :', results.length, '/ Non trouvés :', failed.length)

    // Pré-remplir les notes depuis les favoris existants
    console.log('[Import] → appel mergeExistingRatings après CSV')
    const { items: mergedResults, preRatedKeys: keys } = await mergeExistingRatings(results)
    setMatched(mergedResults)
    setPreRatedKeys(keys)
    setNotFoundTitles(failed)

    // Sauvegarde en base pour ne pas avoir à re-uploader le CSV
    const session: ImportSession = { items: results, totalParsed: parsed.length, notFound: failed }
    const supabaseSave = createClient()
    const { data: { user: saveUser } } = await supabaseSave.auth.getUser()
    if (saveUser) {
      const { data: saveData, error: saveErr } = await supabaseSave.from('import_sessions').upsert(
        { user_id: saveUser.id, source: src, items: results, total_parsed: parsed.length, not_found: failed, saved_at: new Date().toISOString() },
        { onConflict: 'user_id,source' }
      ).select('source, total_parsed')
      console.log('[save] session sauvegardée:', saveData, 'erreur:', saveErr)
    }
    setSessions(prev => ({ ...prev, [src]: session }))
    setSavedCounts(prev => ({ ...prev, [src]: results.length }))

    setStep('review')
  }

  // Charger une session sauvegardée sans re-uploader le CSV
  async function loadFromCache(src: Source) {
    console.log('[loadFromCache] src:', src, '— session en mémoire:', sessions[src] ? `${sessions[src]!.items.length} titres` : 'NULLE')
    const session = sessions[src]
    if (!session) {
      console.log('[loadFromCache] session introuvable — abandon')
      return
    }
    setSource(src)
    // Pré-remplir les notes depuis les favoris existants
    console.log('[loadFromCache] → appel mergeExistingRatings, session items:', session.items.length)
    const { items: mergedItems, preRatedKeys: keys } = await mergeExistingRatings(session.items)
    setMatched(mergedItems)
    setPreRatedKeys(keys)
    setNotFoundTitles(session.notFound)
    setTotalParsed(session.totalParsed)
    setParsedTitles([])
    setDebugLines([])
    setStep('review')
  }

  // Réinitialiser une source (supprime la session en base + revient à l'upload)
  async function resetSource(src: Source) {
    const supabaseDel = createClient()
    const { data: { user: delUser } } = await supabaseDel.auth.getUser()
    if (delUser) {
      await supabaseDel.from('import_sessions').delete().eq('user_id', delUser.id).eq('source', src)
    }
    setSessions(prev => { const n = { ...prev }; delete n[src]; return n })
    setSavedCounts(prev => { const n = { ...prev }; delete n[src]; return n })
  }

  function setRating(index: number, rating: number | null) {
    setMatched(prev => prev.map((m, i) => i === index ? { ...m, userRating: rating } : m))
  }

  function removeItem(index: number) {
    setMatched(prev => prev.filter((_, i) => i !== index))
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
    // Session supprimée après sauvegarde réussie en base
    if (source) {
      const supabaseDel2 = createClient()
      const { data: { user: delUser2 } } = await supabaseDel2.auth.getUser()
      if (delUser2) {
        await supabaseDel2.from('import_sessions').delete().eq('user_id', delUser2.id).eq('source', source)
      }
      setSessions(prev => { const n = { ...prev }; delete n[source!]; return n })
      setSavedCounts(prev => { const n = { ...prev }; delete n[source!]; return n })
    }
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
        {(Object.entries(SOURCES) as [Source, typeof SOURCES[Source]][]).map(([key, cfg]) => {
          const saved = savedCounts[key]
          return (
            <div
              key={key}
              className={`p-5 bg-gray-900 border rounded-xl transition-all ${cfg.color} border-gray-800`}
            >
              <div className="flex items-start justify-between mb-3">
                <span className="text-3xl">{cfg.emoji}</span>
                {saved != null && (
                  <span className="text-xs bg-violet-900/50 text-violet-300 border border-violet-700/50 px-2 py-0.5 rounded-full">
                    {saved} titres sauvegardés
                  </span>
                )}
              </div>
              <h2 className="font-semibold mb-2">{cfg.name}</h2>

              {saved != null ? (
                /* Source avec données sauvegardées */
                <div className="space-y-2">
                  <button
                    onClick={() => loadFromCache(key)}
                    className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm font-medium transition-colors w-full justify-center"
                  >
                    <Check size={14} />
                    Continuer ({saved} titres)
                  </button>
                  <label className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-400 hover:text-white cursor-pointer transition-colors w-full justify-center">
                    <Upload size={13} />
                    Réimporter un nouveau CSV
                    <input
                      ref={el => { fileRefs.current[key] = el }}
                      type="file"
                      accept=".csv"
                      className="hidden"
                      onChange={e => { resetSource(key); handleFile(e, key) }}
                    />
                  </label>
                </div>
              ) : (
                /* Source vierge */
                <>
                  <ol className="list-none space-y-0.5 mb-4">
                    {cfg.instructions.map((line, i) => (
                      <li key={i} className="text-xs text-gray-500">{line}</li>
                    ))}
                  </ol>
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
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )

  // ── RENDER: Profile selector ─────────────────────────────────────────────

  if (step === 'profile') return (
    <div className="p-6 max-w-md mx-auto">
      <button onClick={() => setStep('select')} className="flex items-center gap-2 text-sm text-gray-500 hover:text-white transition-colors mb-6">
        <ArrowLeft size={16} /> Retour
      </button>
      <div className="flex items-center gap-3 mb-2">
        <Users size={22} className="text-violet-400" />
        <h2 className="text-xl font-bold">Plusieurs profils détectés</h2>
      </div>
      <p className="text-gray-400 text-sm mb-6">
        Ce CSV contient l&apos;historique de plusieurs profils du compte Netflix.
        Choisis le profil dont tu veux importer l&apos;historique.
      </p>
      <div className="space-y-2">
        {profiles.map(p => (
          <button
            key={p}
            onClick={() => handleProfileSelect(p)}
            className="w-full flex items-center gap-3 px-4 py-3 bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-violet-500 rounded-xl text-left transition-all"
          >
            <span className="text-lg">👤</span>
            <span className="font-medium">{p}</span>
          </button>
        ))}
        <button
          onClick={() => handleProfileSelect(undefined)}
          className="w-full flex items-center gap-3 px-4 py-3 bg-gray-900 hover:bg-gray-800 border border-gray-800 rounded-xl text-left text-gray-400 hover:text-white transition-all text-sm"
        >
          Importer tous les profils
        </button>
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
          {[1, 2, 3, 4, 5].map(v => (
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
            <div className="flex items-center gap-3 mb-0.5">
              <h2 className="text-xl font-bold">Confirme ta sélection</h2>
              {source && (
                <label className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 cursor-pointer transition-colors">
                  <Upload size={12} />
                  Réimporter
                  <input
                    type="file" accept=".csv" className="hidden"
                    onChange={e => { if (source) resetSource(source); handleFile(e, source!) }}
                  />
                </label>
              )}
            </div>
            <p className="text-gray-400 text-sm mt-0.5">
              {totalParsed > 0 && (
                <span className={matched.length / totalParsed >= 0.8 ? 'text-emerald-400' : 'text-amber-400'}>
                  {Math.round(matched.length / totalParsed * 100)}% reconnus
                </span>
              )}
              {' · '}{matched.length} trouvés
              {notFoundTitles.length > 0 && <> · <span className="text-gray-500">{notFoundTitles.length} non trouvés</span></>}
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

        {/* Avertissement visionnages courts (Netflix uniquement) */}
        {source === 'netflix' && (
          <div className="mb-4 flex gap-3 items-start px-4 py-3 bg-amber-950/30 border border-amber-800/40 rounded-xl text-sm text-amber-300/80">
            <span className="text-lg leading-none mt-0.5">⚡</span>
            <div>
              <p className="font-medium text-amber-200 mb-0.5">Certains titres ont peut-être été regardés brièvement</p>
              <p className="text-xs text-amber-400/70">
                Netflix inclut tout contenu lancé, même 1 minute. Clique sur 🗑 pour retirer les titres que tu ne reconnais pas.
              </p>
            </div>
          </div>
        )}

        {/* Not-found report */}
        {notFoundTitles.length > 0 && (
          <details className="mb-4 bg-gray-900/60 border border-gray-800 rounded-xl overflow-hidden">
            <summary className="px-4 py-2.5 text-sm text-gray-400 cursor-pointer hover:text-white transition-colors list-none flex items-center justify-between">
              <span>⚠️ {notFoundTitles.length} titre{notFoundTitles.length > 1 ? 's' : ''} non reconnu{notFoundTitles.length > 1 ? 's' : ''} sur TMDB/OL</span>
              <span className="text-xs text-gray-600">▾ afficher</span>
            </summary>
            <div className="px-4 pb-3 pt-1 space-y-1">
              {notFoundTitles.slice(0, 20).map((t, i) => (
                <p key={i} className="text-xs text-gray-500 font-mono">— {t}</p>
              ))}
              {notFoundTitles.length > 20 && (
                <p className="text-xs text-gray-600">…et {notFoundTitles.length - 20} autres</p>
              )}
            </div>
          </details>
        )}

        {/* Debug: raw CSV lines + parsed titles */}
        <details className="mb-4">
          <summary className="text-xs text-gray-600 cursor-pointer hover:text-gray-400 transition-colors list-none">
            🔍 Diagnostic CSV (20 premières lignes brutes + titres extraits)
          </summary>
          <div className="mt-2 space-y-3">
            {debugLines.length > 0 && (
              <div className="bg-gray-950 border border-gray-800 rounded-lg p-3 space-y-1">
                <p className="text-xs text-gray-600 mb-1 font-semibold">Lignes brutes CSV :</p>
                {debugLines.map((line, i) => (
                  <p key={i} className="text-xs text-gray-500 font-mono truncate">{line}</p>
                ))}
              </div>
            )}
            {parsedTitles.length > 0 && (
              <div className="bg-gray-950 border border-gray-800 rounded-lg p-3 space-y-1">
                <p className="text-xs text-gray-600 mb-1 font-semibold">Titres extraits (20 premiers) :</p>
                {parsedTitles.map((t, i) => (
                  <p key={i} className="text-xs text-gray-500 font-mono">{i + 1}. {t}</p>
                ))}
              </div>
            )}
          </div>
        </details>

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
          {matched.map((item, idx) => {
            const itemKey = `${item.externalId}::${item.preferredType}`
            const isPreRated = preRatedKeys.has(itemKey)
            return (
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
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium truncate">{item.displayTitle}</p>
                  {isPreRated && (
                    <span className="flex-shrink-0 text-[10px] font-medium text-emerald-400/80 bg-emerald-900/30 border border-emerald-700/30 px-1.5 py-0.5 rounded-full leading-none">
                      déjà noté
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500">
                  {item.year && <span>{item.year}</span>}
                  {item.year && <span className="mx-1">·</span>}
                  <span>{item.preferredType === 'movie' ? 'Film' : item.preferredType === 'series' ? 'Série' : 'Livre'}</span>
                </p>
              </div>

              {/* Rating row */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map(v => (
                    <button
                      key={v}
                      onClick={() => setRating(idx, v)}
                      title={LABELS[v]}
                      style={{ fontSize: '24px', lineHeight: 1 }}
                      className={`transition-all hover:scale-110 ${
                        item.userRating === v
                          ? isPreRated
                            ? 'ring-2 ring-emerald-500 rounded-md'
                            : 'ring-2 ring-violet-500 rounded-md'
                          : 'opacity-40 hover:opacity-100'
                      }`}
                    >
                      {EMOJIS[v]}
                    </button>
                  ))}
                </div>
                {item.userRating !== null && (
                  <button
                    onClick={() => setRating(idx, null)}
                    className="text-gray-600 hover:text-gray-400 transition-colors"
                    title="Effacer la note"
                  >
                    <X size={13} />
                  </button>
                )}
                <button
                  onClick={() => removeItem(idx)}
                  className="text-gray-700 hover:text-red-500 transition-colors ml-1"
                  title="Retirer de la liste"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            )
          })}
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
            produit{savedCount > 1 ? 's' : ''} importé{savedCount > 1 ? 's' : ''}
            {totalParsed > 0 && (
              <span className="text-gray-500 text-xs ml-2">
                ({Math.round((matched.length / totalParsed) * 100)}% du CSV reconnu)
              </span>
            )}
          </p>
          {notFoundTitles.length > 0 && (
            <details className="mt-2 text-left">
              <summary className="text-gray-500 text-sm cursor-pointer hover:text-gray-300 transition-colors list-none">
                {notFoundTitles.length} titre{notFoundTitles.length > 1 ? 's' : ''} non reconnu{notFoundTitles.length > 1 ? 's' : ''} ▾
              </summary>
              <div className="mt-2 bg-gray-900/60 border border-gray-800 rounded-xl p-3 space-y-1 max-h-48 overflow-y-auto">
                {notFoundTitles.map((t, i) => (
                  <p key={i} className="text-xs text-gray-500 font-mono">— {t}</p>
                ))}
              </div>
            </details>
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
