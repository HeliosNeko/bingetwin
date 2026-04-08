import { Zap, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  ratedCount: number
  threshold: number
}

export default function RatingProgress({ ratedCount, threshold }: Props) {
  const pct = Math.min(100, Math.round((ratedCount / threshold) * 100))
  const remaining = Math.max(0, threshold - ratedCount)
  const isEligible = ratedCount >= threshold

  return (
    <div className={cn(
      'rounded-xl p-4 border',
      isEligible
        ? 'bg-emerald-900/20 border-emerald-700/50'
        : 'bg-gray-900 border-gray-800'
    )}>
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          {isEligible
            ? <Zap size={15} className="text-emerald-400" />
            : <Lock size={15} className="text-gray-500" />
          }
          <span className="text-sm font-medium">
            {isEligible ? 'Profil éligible au matching' : 'Matching non activé'}
          </span>
        </div>
        <span className="text-sm font-mono font-bold tabular-nums">
          <span className={isEligible ? 'text-emerald-400' : 'text-white'}>
            {ratedCount.toLocaleString('fr-FR')}
          </span>
          <span className="text-gray-600"> / {threshold.toLocaleString('fr-FR')}</span>
        </span>
      </div>

      {/* Barre de progression */}
      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            isEligible
              ? 'bg-emerald-500'
              : pct >= 75
                ? 'bg-violet-500'
                : pct >= 40
                  ? 'bg-blue-500'
                  : 'bg-gray-600'
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Message sous la barre */}
      <p className="text-xs mt-2">
        {isEligible ? (
          <span className="text-emerald-400">
            Ton profil est inclus dans l&apos;algorithme de matching ✓
          </span>
        ) : (
          <span className="text-gray-500">
            Il te reste{' '}
            <span className="text-gray-300 font-semibold">
              {remaining.toLocaleString('fr-FR')} note{remaining > 1 ? 's' : ''}
            </span>
            {' '}pour entrer dans le matching ({pct}% atteint)
          </span>
        )}
      </p>
    </div>
  )
}
