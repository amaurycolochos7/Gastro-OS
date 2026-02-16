'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Plan {
    id: string
    slug: string
    name: string
    price: number
    currency: string
    billing_interval: string
    features: {
        limits_products?: number
        limits_orders_day?: number
        limits_users?: number
        limits_storage_mb?: number
    }
}

export default function BillingUpgradePage() {
    const [plans, setPlans] = useState<Plan[]>([])
    const [subStatus, setSubStatus] = useState<string>('expired')
    const [trialEnd, setTrialEnd] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [userEmail, setUserEmail] = useState('')
    const [businessName, setBusinessName] = useState('')

    const supabase = createClient()

    useEffect(() => {
        loadData()
    }, [])

    const loadData = async () => {
        // Load plans (excluding demo since you can't buy demo)
        const { data: plansData } = await supabase
            .from('plans')
            .select('*')
            .eq('active', true)
            .neq('slug', 'demo')
            .order('price', { ascending: true })

        if (plansData) setPlans(plansData)

        // Load subscription status
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
            setUserEmail(user.email || '')

            const { data: membership } = await supabase
                .from('business_memberships')
                .select('business_id')
                .eq('user_id', user.id)
                .eq('status', 'active')
                .limit(1)
                .maybeSingle()

            if (membership) {
                // Cargar nombre del negocio
                const { data: bizData } = await supabase
                    .from('businesses')
                    .select('name')
                    .eq('id', membership.business_id)
                    .single()
                if (bizData) setBusinessName(bizData.name)

                const { data: status } = await supabase.rpc('get_subscription_status', {
                    p_business_id: membership.business_id,
                })
                if (status) {
                    setSubStatus(status.status)
                    setTrialEnd(status.trial_end)
                }
            }
        }

        setLoading(false)
    }

    const formatPrice = (price: number) => {
        return new Intl.NumberFormat('es-MX', {
            style: 'currency',
            currency: 'MXN',
            minimumFractionDigits: 0,
        }).format(price)
    }

    const getIntervalLabel = (interval: string) => {
        switch (interval) {
            case 'monthly': return '/mes'
            case 'annual': return '/año'
            default: return ''
        }
    }

    const getStatusMessage = () => {
        switch (subStatus) {
            case 'expired':
                return 'Tu prueba gratuita ha terminado'
            case 'past_due':
                return 'Tu plan tiene un pago pendiente'
            case 'canceled':
                return 'Tu suscripción fue cancelada'
            default:
                return 'Necesitas un plan activo para continuar'
        }
    }

    const whatsappNumber = '529618720544'

    const buildWhatsappUrl = (planName?: string) => {
        const lines = [
            `Hola, quiero activar ${planName ? `el plan *${planName}*` : 'un plan'} en GastroOS.`,
            businessName ? `Negocio: ${businessName}` : '',
            userEmail ? `Correo: ${userEmail}` : '',
        ].filter(Boolean).join('\n')
        return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(lines)}`
    }

    if (loading) {
        return (
            <div style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--bg-page, #f0f0f5)',
            }}>
                <div style={{ textAlign: 'center', color: 'var(--color-text-muted, #888)' }}>
                    Cargando planes...
                </div>
            </div>
        )
    }

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--bg-page, #f0f0f5)',
            padding: '1rem',
        }}>
            <div style={{ maxWidth: '800px', width: '100%' }}>
                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>

                    <h1 style={{
                        fontSize: '1.75rem',
                        fontWeight: 700,
                        color: 'var(--color-text, #1a1a2e)',
                        marginBottom: '0.5rem',
                    }}>
                        {getStatusMessage()}
                    </h1>
                    {trialEnd && subStatus === 'expired' && (
                        <p style={{
                            color: 'var(--color-text-muted, #888)',
                            fontSize: '0.95rem',
                        }}>
                            Tu prueba venció el {new Date(trialEnd).toLocaleDateString('es-MX', {
                                day: 'numeric', month: 'long', year: 'numeric'
                            })}
                        </p>
                    )}
                    <p style={{
                        color: 'var(--color-text-muted, #888)',
                        fontSize: '0.95rem',
                        marginTop: '0.5rem',
                    }}>
                        Elige un plan para seguir usando GastroOS
                    </p>
                </div>

                {/* Plans Grid */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '1rem',
                    marginBottom: '2rem',
                }}>
                    {plans.map((plan) => {
                        const isPremium = plan.slug.startsWith('premium')
                        return (
                            <div
                                key={plan.id}
                                style={{
                                    background: 'var(--bg-card, #fff)',
                                    borderRadius: '16px',
                                    padding: '1.5rem',
                                    border: isPremium
                                        ? '2px solid var(--color-primary, #6c5ce7)'
                                        : '1px solid var(--border-color, #e8e8f0)',
                                    position: 'relative',
                                    boxShadow: isPremium
                                        ? '0 4px 24px rgba(108, 92, 231, 0.15)'
                                        : '0 2px 12px rgba(0,0,0,0.06)',
                                }}
                            >
                                {isPremium && (
                                    <div style={{
                                        position: 'absolute',
                                        top: '-10px',
                                        right: '16px',
                                        background: 'var(--color-primary, #6c5ce7)',
                                        color: '#fff',
                                        padding: '2px 12px',
                                        borderRadius: '20px',
                                        fontSize: '0.75rem',
                                        fontWeight: 600,
                                    }}>
                                        Popular
                                    </div>
                                )}

                                <h3 style={{
                                    fontSize: '1.1rem',
                                    fontWeight: 600,
                                    color: 'var(--color-text, #1a1a2e)',
                                    marginBottom: '0.5rem',
                                }}>
                                    {plan.name}
                                </h3>

                                <div style={{ marginBottom: '1rem' }}>
                                    <span style={{
                                        fontSize: '2rem',
                                        fontWeight: 800,
                                        color: isPremium
                                            ? 'var(--color-primary, #6c5ce7)'
                                            : 'var(--color-text, #1a1a2e)',
                                    }}>
                                        {formatPrice(plan.price)}
                                    </span>
                                    <span style={{
                                        fontSize: '0.85rem',
                                        color: 'var(--color-text-muted, #888)',
                                    }}>
                                        {getIntervalLabel(plan.billing_interval)}
                                    </span>
                                </div>

                                <ul style={{
                                    listStyle: 'none',
                                    padding: 0,
                                    margin: 0,
                                    fontSize: '0.85rem',
                                    color: 'var(--color-text-secondary, #555)',
                                }}>
                                    <li style={{ padding: '0.3rem 0' }}>
                                        ✓ {plan.features.limits_products || '∞'} productos
                                    </li>
                                    <li style={{ padding: '0.3rem 0' }}>
                                        ✓ {plan.features.limits_orders_day || '∞'} órdenes/día
                                    </li>
                                    <li style={{ padding: '0.3rem 0' }}>
                                        ✓ {plan.features.limits_users || '∞'} usuarios
                                    </li>
                                </ul>

                                <a
                                    href={buildWhatsappUrl(plan.name)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                        display: 'block',
                                        width: '100%',
                                        padding: '0.75rem',
                                        marginTop: '1rem',
                                        background: isPremium
                                            ? 'var(--color-primary, #6c5ce7)'
                                            : 'var(--bg-page, #f0f0f5)',
                                        color: isPremium ? '#fff' : 'var(--color-text, #1a1a2e)',
                                        border: 'none',
                                        borderRadius: '10px',
                                        fontSize: '0.9rem',
                                        fontWeight: 600,
                                        textAlign: 'center',
                                        textDecoration: 'none',
                                        cursor: 'pointer',
                                    }}
                                >
                                    {isPremium ? 'Activar Premium' : 'Activar Plan'}
                                </a>
                            </div>
                        )
                    })}
                </div>

                {/* Footer */}
                <div style={{
                    textAlign: 'center',
                    padding: '1.5rem 1rem',
                    fontSize: '0.85rem',
                }}>
                    <a
                        href={buildWhatsappUrl()}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            color: '#25D366',
                            textDecoration: 'none',
                            fontWeight: 600,
                            fontSize: '0.9rem',
                            padding: '0.6rem 1.2rem',
                            borderRadius: '10px',
                            border: '1px solid #25D366',
                            transition: 'all 0.2s',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = '#25D366'
                            e.currentTarget.style.color = '#fff'
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent'
                            e.currentTarget.style.color = '#25D366'
                        }}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                        </svg>
                        ¿Necesitas ayuda? Escríbenos
                    </a>
                    <p style={{ marginTop: '1rem', color: 'var(--color-text-muted, #888)', fontSize: '0.8rem' }}>
                        © 2026 GastroOS. Todos los derechos reservados.
                    </p>
                </div>
            </div>
        </div>
    )
}
