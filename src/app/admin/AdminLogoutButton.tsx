'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export function AdminLogoutButton() {
    const supabase = createClient()
    const router = useRouter()

    const handleLogout = async () => {
        const confirmed = window.confirm('¿Cerrar sesión del panel de administrador?')
        if (!confirmed) return

        await supabase.auth.signOut()
        router.push('/login')
    }

    return (
        <button onClick={handleLogout} className="admin-header__logout" title="Cerrar sesión">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span>Salir</span>
        </button>
    )
}
