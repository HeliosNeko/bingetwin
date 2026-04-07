const BASE_URL = 'https://openlibrary.org'

export async function searchBooks(query: string, page = 1) {
  const offset = (page - 1) * 20
  const res = await fetch(
    `${BASE_URL}/search.json?q=${encodeURIComponent(query)}&limit=20&offset=${offset}&fields=key,title,author_name,first_publish_year,cover_i,isbn`
  )
  if (!res.ok) throw new Error(`OpenLibrary error: ${res.status}`)
  return res.json()
}

export async function getTrendingBooks() {
  const res = await fetch(`${BASE_URL}/trending/daily.json?limit=20`)
  if (!res.ok) throw new Error(`OpenLibrary error: ${res.status}`)
  return res.json()
}

export function getCoverUrl(coverId: number, size: 'S' | 'M' | 'L' = 'M') {
  return `https://covers.openlibrary.org/b/id/${coverId}-${size}.jpg`
}
