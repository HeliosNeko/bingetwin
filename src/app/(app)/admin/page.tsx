import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Settings, Users, BarChart3, ShieldAlert, Wrench } from 'lucide-react'
import SettingForm from '@/components/admin/SettingForm'
import BackfillButton from '@/components/admin/BackfillButton'

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // Vérification admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('username, is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) {
    return (
      <div className="p-6 max-w-2xl mx-auto flex flex-col items-center justify-center min-h-[60vh] text-center">
        <ShieldAlert className="text-red-500 mb-4" size={48} />
        <h1 className="text-xl font-bold mb-2">Accès refusé</h1>
        <p className="text-gray-400 text-sm">
          Tu n&apos;as pas les droits administrateur pour accéder à cette page.
        </p>
      </div>
    )
  }

  // Récupérer tous les paramètres
  const { data: settings } = await supabase
    .from('app_settings')
    .select('*')
    .order('key')

  // Stats globales
  const [
    { count: totalUsers },
    { count: totalFavorites },
    { count: totalMatches },
  ] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('favorites').select('*', { count: 'exact', head: true }),
    supabase.from('matches').select('*', { count: 'exact', head: true }),
  ])

  const stats = [
    { label: 'Utilisateurs', value: totalUsers ?? 0, icon: Users, color: 'text-violet-400' },
    { label: 'Notes totales', value: totalFavorites ?? 0, icon: BarChart3, color: 'text-blue-400' },
    { label: 'Matches actifs', value: totalMatches ?? 0, icon: Settings, color: 'text-emerald-400' },
  ]

  const settingsMeta: Record<string, { label: string; description: string; type: 'number' | 'text'; min?: number; max?: number }> = {
    minimum_ratings_required: {
      label: 'Seuil de notes minimum',
      description: 'Nombre de produits notés qu\'un utilisateur doit atteindre pour entrer dans le matching. En dessous de ce seuil, son profil est ignoré par l\'algorithme.',
      type: 'number',
      min: 1,
      max: 10000,
    },
    genre_representativity_threshold: {
      label: 'Seuil de représentativité des genres (%)',
      description: 'Pourcentage minimum de similarité Jensen-Shannon (0-100) entre la distribution des genres des items communs et la distribution globale de chaque utilisateur. Exemple : 70 signifie que les items communs doivent couvrir au moins 70 % de la diversité des genres de chaque profil. Un match est rejeté si l\'un des deux utilisateurs ne passe pas ce seuil, même avec une bonne corrélation de Pearson.',
      type: 'number',
      min: 0,
      max: 100,
    },
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 bg-violet-900/50 rounded-xl flex items-center justify-center">
          <Settings className="text-violet-400" size={20} />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Administration</h1>
          <p className="text-gray-500 text-sm">Connecté en tant que @{profile.username}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-10">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <Icon className={`${color} mx-auto mb-2`} size={20} />
            <div className="text-2xl font-bold">{value.toLocaleString('fr-FR')}</div>
            <div className="text-xs text-gray-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Paramètres */}
      <section>
        <h2 className="text-lg font-semibold mb-5 flex items-center gap-2">
          <Settings size={16} className="text-gray-400" />
          Paramètres du matching
        </h2>

        <div className="space-y-4">
          {(settings ?? []).map(setting => {
            const meta = settingsMeta[setting.key]
            if (!meta) return null
            return (
              <div key={setting.key} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-sm">{meta.label}</h3>
                    <code className="text-xs text-gray-600 font-mono">{setting.key}</code>
                  </div>
                  <span className="text-xs text-gray-500">
                    Modifié le {new Date(setting.updated_at).toLocaleDateString('fr-FR')}
                  </span>
                </div>
                <SettingForm
                  settingKey={setting.key}
                  currentValue={setting.value}
                  description={meta.description}
                  type={meta.type}
                  min={meta.min}
                  max={meta.max}
                />
              </div>
            )
          })}
        </div>
      </section>

      {/* Maintenance */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold mb-5 flex items-center gap-2">
          <Wrench size={16} className="text-gray-400" />
          Maintenance des données
        </h2>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="font-semibold text-sm mb-1">Backfill des genres manquants</h3>
          <BackfillButton />
        </div>
      </section>

      {/* Aide */}
      <div className="mt-8 bg-gray-900/50 border border-gray-800 rounded-xl p-5 text-sm text-gray-500 space-y-2">
        <p className="font-medium text-gray-400">Comment désigner un administrateur ?</p>
        <p>Exécute cette requête dans le SQL Editor de Supabase :</p>
        <pre className="bg-gray-950 rounded-lg p-3 text-xs text-gray-400 overflow-x-auto font-mono">
          {`UPDATE public.profiles\nSET is_admin = true\nWHERE id = '<uuid-de-l-utilisateur>';`}
        </pre>
      </div>
    </div>
  )
}
