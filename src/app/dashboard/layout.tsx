import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from './components/Sidebar'
import { Role } from '@/lib/types'
import { BusinessProvider } from '@/lib/context/BusinessContext'
import { DialogProvider } from '@/lib/context/DialogContext'

const TERMS_VERSION = 'v2026-02-12'

export const dynamic = 'force-dynamic'

interface MembershipWithBusiness {
    role: Role
    businesses: {
        name: string
    }
}

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    // Verificar aceptación de términos (maybeSingle evita PGRST116 si no existe)
    const { data: profile } = await supabase
        .from('profiles')
        .select('accepted_terms_at, accepted_terms_version')
        .eq('user_id', user.id)
        .maybeSingle()

    if (!profile?.accepted_terms_at || profile.accepted_terms_version !== TERMS_VERSION) {
        redirect('/terms/accept')
    }

    // Obtener membresía y negocio (usar limit(1) por si tiene múltiples membresías)
    const { data: membership } = await supabase
        .from('business_memberships')
        .select('role, businesses(name)')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('created_at', { ascending: true })
        .limit(1)
        .single()

    if (!membership) {
        redirect('/onboarding')
    }

    const typedMembership = membership as unknown as MembershipWithBusiness

    return (
        <BusinessProvider>
            <DialogProvider>
                <div>
                    <Sidebar
                        businessName={typedMembership.businesses.name}
                        role={typedMembership.role}
                    />
                    <main className="main-content">
                        {children}
                    </main>
                </div>
            </DialogProvider>
        </BusinessProvider>
    )
}
