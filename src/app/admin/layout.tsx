import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import './admin.css'

export const dynamic = 'force-dynamic'

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        redirect('/login')
    }

    // Verificar que es admin
    const { data: isAdmin } = await supabase.rpc('is_admin')
    if (!isAdmin) {
        redirect('/dashboard')
    }

    return (
        <div className="admin-shell">
            <header className="admin-header">
                <div className="admin-header__brand">
                    <div className="admin-header__logo">G</div>
                    <h1 className="admin-header__title">GastroOS Admin</h1>
                    <nav className="admin-header__nav">
                        <a href="/admin/businesses" className="admin-header__link admin-header__link--active">
                            Negocios
                        </a>
                    </nav>
                </div>
                <a href="/dashboard" className="admin-header__link admin-header__link--back">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
                    </svg>
                    Dashboard
                </a>
            </header>
            <main className="admin-main">
                {children}
            </main>
        </div>
    )
}
