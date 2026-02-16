import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from './components/Sidebar'
import { Role } from '@/lib/types'
import { BusinessProvider } from '@/lib/context/BusinessContext'
import { DialogProvider } from '@/lib/context/DialogContext'
import { SubscriptionGuard } from './components/SubscriptionGuard'

const TERMS_VERSION = 'v2026-02-12'

export const dynamic = 'force-dynamic'

interface MembershipWithBusiness {
    role: Role
    businesses: {
        name: string
        deleted_at: string | null
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
        .select('role, business_id, businesses(name, deleted_at)')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('created_at', { ascending: true })
        .limit(1)
        .single()

    if (!membership) {
        // Si es admin de plataforma, redirigir al panel admin en vez de onboarding
        const { data: isAdmin } = await supabase.rpc('is_admin')
        if (isAdmin) {
            redirect('/admin')
        }
        redirect('/onboarding')
    }

    // Verificar si el negocio fue eliminado (soft-delete)
    const typedMembership = membership as unknown as MembershipWithBusiness
    if (typedMembership.businesses?.deleted_at) {
        redirect('/account/blocked')
    }

    // Verificar subscription activa (trial válido o plan activo)
    const { data: subStatus } = await supabase.rpc('get_subscription_status', {
        p_business_id: (membership as any).business_id,
    })

    if (!subStatus?.is_active) {
        if (subStatus?.status === 'suspended') {
            redirect('/account/suspended')
        }
        redirect('/billing/upgrade')
    }

    return (
        <BusinessProvider>
            <DialogProvider>
                <SubscriptionGuard businessId={(membership as any).business_id} />
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
