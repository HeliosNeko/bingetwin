'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Film, Users, LayoutDashboard, LogOut, Search, Settings, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Accueil' },
  { href: '/discover', icon: Search, label: 'Découvrir' },
  { href: '/profile', icon: Film, label: 'Mon profil' },
  { href: '/matches', icon: Users, label: 'Matches' },
  { href: '/import', icon: Upload, label: 'Importer' },
]

export default function Navbar({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <>
      {/* Sidebar desktop */}
      <aside className="hidden md:flex flex-col fixed left-0 top-0 h-full w-56 bg-gray-900 border-r border-gray-800 p-4 z-50">
        <Link href="/dashboard" className="text-xl font-bold gradient-text mb-8 px-2">
          BingeTwin
        </Link>

        <nav className="flex-1 space-y-1">
          {navItems.map(({ href, icon: Icon, label }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                pathname === href || pathname.startsWith(href + '/')
                  ? 'bg-violet-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              )}
            >
              <Icon size={18} />
              {label}
            </Link>
          ))}

          {isAdmin && (
            <Link
              href="/admin"
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors mt-2 border-t border-gray-800 pt-3',
                pathname.startsWith('/admin')
                  ? 'bg-amber-600 text-white'
                  : 'text-amber-500 hover:text-amber-300 hover:bg-gray-800'
              )}
            >
              <Settings size={18} />
              Administration
            </Link>
          )}
        </nav>

        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-red-400 hover:bg-gray-800 transition-colors"
        >
          <LogOut size={18} />
          Déconnexion
        </button>
      </aside>

      {/* Bottom nav mobile */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800 z-50">
        <div className="flex">
          {navItems.map(({ href, icon: Icon, label }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex-1 flex flex-col items-center gap-1 py-3 text-xs transition-colors',
                pathname === href
                  ? 'text-violet-400'
                  : 'text-gray-500 hover:text-gray-300'
              )}
            >
              <Icon size={20} />
              <span>{label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </>
  )
}
