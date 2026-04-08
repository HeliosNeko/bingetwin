export type MediaType = 'movie' | 'series' | 'book'

export interface Profile {
  id: string
  username: string
  avatar_url: string | null
  bio: string | null
  created_at: string
}

export interface Favorite {
  id: string
  user_id: string
  media_type: MediaType
  external_id: string
  title: string
  poster_url: string | null
  year: string | null
  rating: number | null
  genres: string[]
  created_at: string
}

export type MatchType = 'jumeau' | 'cousin'

export interface Match {
  id: string
  user1_id: string
  user2_id: string
  score: number
  common_favorites: number
  match_type: MatchType
  genre_representativity: number
  created_at: string
  profile?: Profile
}

export interface Message {
  id: string
  match_id: string
  sender_id: string
  content: string
  created_at: string
}

// TMDB types
export interface TMDBMovie {
  id: number
  title: string
  poster_path: string | null
  release_date: string
  overview: string
  vote_average: number
  genre_ids: number[]
}

export interface TMDBSeries {
  id: number
  name: string
  poster_path: string | null
  first_air_date: string
  overview: string
  vote_average: number
  genre_ids: number[]
}

export interface TMDBSearchResult {
  page: number
  results: (TMDBMovie | TMDBSeries)[]
  total_pages: number
  total_results: number
}

// Open Library types
export interface OLBook {
  key: string
  title: string
  author_name?: string[]
  first_publish_year?: number
  cover_i?: number
  isbn?: string[]
}

export interface OLSearchResult {
  numFound: number
  docs: OLBook[]
}
