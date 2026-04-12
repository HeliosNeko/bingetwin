import { redirect } from 'next/navigation'

// La page d'accueil est maintenant la recherche.
export default function DashboardPage() {
  redirect('/discover')
}
