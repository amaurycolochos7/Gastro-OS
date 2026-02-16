'use client'

import { useState, useEffect, useRef } from 'react'
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

interface StatusContent {
    title: string
    subtitle: string
    accent: string
    showDataSafe: boolean
}

export default function BillingUpgradePage() {
    const [plans, setPlans] = useState<Plan[]>([])
    const [subStatus, setSubStatus] = useState<string>('expired')
    const [trialEnd, setTrialEnd] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [userEmail, setUserEmail] = useState('')
    const [businessName, setBusinessName] = useState('')

    const supabase = createClient()
    const businessIdRef = useRef<string | null>(null)

    useEffect(() => { loadData() }, [])

    // Polling: auto-redirect to dashboard when subscription becomes active
    useEffect(() => {
        if (loading) return

        const interval = setInterval(async () => {
            if (!businessIdRef.current) return

            const { data: status } = await supabase.rpc('get_subscription_status', {
                p_business_id: businessIdRef.current,
            })

            if (status?.is_active) {
                clearInterval(interval)
                window.location.href = '/dashboard'
            }
        }, 5000)

        return () => clearInterval(interval)
    }, [loading])

    const loadData = async () => {
        const { data: plansData } = await supabase
            .from('plans')
            .select('*')
            .eq('active', true)
            .neq('slug', 'demo')
            .order('price', { ascending: true })

        if (plansData) setPlans(plansData)

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
                businessIdRef.current = membership.business_id
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

    const handleLogout = async () => {
        await supabase.auth.signOut()
        window.location.href = '/login'
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

    const getStatusContent = (): StatusContent => {
        switch (subStatus) {
            case 'expired':
                return {
                    title: 'Tu prueba gratuita terminó',
                    subtitle: trialEnd
                        ? `Finalizó el ${new Date(trialEnd).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}. Para seguir usando GastroOS, elige un plan.`
                        : 'Para seguir usando GastroOS, elige un plan.',
                    accent: 'var(--color-primary, #6c5ce7)',
                    showDataSafe: true,
                }
            case 'canceled':
                return {
                    title: 'Tu suscripción fue cancelada',
                    subtitle: 'Tu plan fue dado de baja. Elige un nuevo plan para reactivar tu acceso.',
                    accent: '#dc2626',
                    showDataSafe: true,
                }
            case 'past_due':
                return {
                    title: 'Pago pendiente',
                    subtitle: 'Tu plan tiene un pago pendiente. Contáctanos para resolverlo.',
                    accent: '#f59e0b',
                    showDataSafe: false,
                }
            case 'suspended':
                return {
                    title: 'Cuenta suspendida',
                    subtitle: 'Tu cuenta fue suspendida por un administrador. Contacta soporte.',
                    accent: '#dc2626',
                    showDataSafe: false,
                }
            default:
                return {
                    title: 'Necesitas un plan activo',
                    subtitle: 'Elige un plan para comenzar a usar GastroOS.',
                    accent: 'var(--color-primary, #6c5ce7)',
                    showDataSafe: false,
                }
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
            <div className="upgrade-page">
                <style>{upgradeStyles}</style>
                <div className="upgrade-loading">
                    <div className="upgrade-spinner" />
                    <span>Cargando planes...</span>
                </div>
            </div>
        )
    }

    const content = getStatusContent()

    return (
        <div className="upgrade-page">
            <style>{upgradeStyles}</style>

            <div className="upgrade-container">
                {/* Header */}
                <header className="upgrade-header">
                    <div className="upgrade-header__icon" style={{ color: content.accent }}>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="40" height="40">
                            {subStatus === 'canceled' || subStatus === 'suspended' ? (
                                <path fillRule="evenodd" d="M12 1.5a5.25 5.25 0 00-5.25 5.25v3a3 3 0 00-3 3v6.75a3 3 0 003 3h10.5a3 3 0 003-3v-6.75a3 3 0 00-3-3v-3c0-2.9-2.35-5.25-5.25-5.25zm3.75 8.25v-3a3.75 3.75 0 10-7.5 0v3h7.5z" clipRule="evenodd" />
                            ) : (
                                <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zM12.75 6a.75.75 0 00-1.5 0v6c0 .414.336.75.75.75h4.5a.75.75 0 000-1.5h-3.75V6z" clipRule="evenodd" />
                            )}
                        </svg>
                    </div>

                    <h1 className="upgrade-header__title" style={{ color: content.accent }}>
                        {content.title}
                    </h1>

                    {businessName && (
                        <p className="upgrade-header__business">{businessName}</p>
                    )}

                    <p className="upgrade-header__subtitle">
                        {content.subtitle}
                    </p>

                    {content.showDataSafe && (
                        <div className="upgrade-header__safe">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                                <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
                            </svg>
                            Tus datos están guardados. Al activar un plan, vuelves exactamente donde te quedaste.
                        </div>
                    )}
                </header>

                {/* Plans Grid */}
                <div className="upgrade-plans">
                    {plans.map((plan) => {
                        const isPremium = plan.slug.startsWith('premium')
                        const isAnnual = plan.billing_interval === 'annual'
                        return (
                            <div
                                key={plan.id}
                                className={`upgrade-plan-card ${isPremium ? 'upgrade-plan-card--featured' : ''}`}
                            >
                                {isPremium && (
                                    <div className="upgrade-plan-card__badge">
                                        {isAnnual ? 'Mayor ahorro' : 'Más popular'}
                                    </div>
                                )}

                                <h3 className="upgrade-plan-card__name">{plan.name}</h3>

                                <div className="upgrade-plan-card__price">
                                    <span className="upgrade-plan-card__amount" style={isPremium ? { color: 'var(--color-primary, #6c5ce7)' } : {}}>
                                        {formatPrice(plan.price)}
                                    </span>
                                    <span className="upgrade-plan-card__interval">
                                        {getIntervalLabel(plan.billing_interval)}
                                    </span>
                                </div>

                                <ul className="upgrade-plan-card__features">
                                    <li>
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                                            <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                                        </svg>
                                        {plan.features.limits_products || '∞'} productos
                                    </li>
                                    <li>
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                                            <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                                        </svg>
                                        {plan.features.limits_orders_day || '∞'} órdenes/día
                                    </li>
                                    <li>
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                                            <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                                        </svg>
                                        {plan.features.limits_users || '∞'} usuarios
                                    </li>
                                </ul>

                                <a
                                    href={buildWhatsappUrl(plan.name)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`upgrade-plan-card__cta ${isPremium ? 'upgrade-plan-card__cta--primary' : ''}`}
                                >
                                    {isPremium ? 'Contratar plan' : 'Activar plan'}
                                </a>
                            </div>
                        )
                    })}
                </div>

                {/* Footer */}
                <footer className="upgrade-footer">
                    <a
                        href={buildWhatsappUrl()}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="upgrade-footer__wa"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                        </svg>
                        ¿Necesitas ayuda? Escríbenos
                    </a>

                    <button onClick={handleLogout} className="upgrade-footer__logout">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                            <path fillRule="evenodd" d="M3 4.25A2.25 2.25 0 015.25 2h5.5A2.25 2.25 0 0113 4.25v2a.75.75 0 01-1.5 0v-2a.75.75 0 00-.75-.75h-5.5a.75.75 0 00-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 00.75-.75v-2a.75.75 0 011.5 0v2A2.25 2.25 0 0110.75 18h-5.5A2.25 2.25 0 013 15.75V4.25z" clipRule="evenodd" />
                            <path fillRule="evenodd" d="M19 10a.75.75 0 00-.75-.75H8.704l1.048-.943a.75.75 0 10-1.004-1.114l-2.5 2.25a.75.75 0 000 1.114l2.5 2.25a.75.75 0 101.004-1.114l-1.048-.943h9.546A.75.75 0 0019 10z" clipRule="evenodd" />
                        </svg>
                        Cerrar sesión
                    </button>

                    <p className="upgrade-footer__copy">© 2026 GastroOS. Todos los derechos reservados.</p>
                </footer>
            </div>
        </div>
    )
}

const upgradeStyles = `
    .upgrade-page {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(135deg, #f8f9fc 0%, #eef0f8 100%);
        padding: 1.5rem;
        font-family: var(--font-sans, 'Inter', -apple-system, sans-serif);
    }

    .upgrade-loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1rem;
        color: #888;
        font-size: 0.9rem;
    }

    .upgrade-spinner {
        width: 32px;
        height: 32px;
        border: 3px solid #e8e8f0;
        border-top-color: var(--color-primary, #6c5ce7);
        border-radius: 50%;
        animation: upgrade-spin 0.7s linear infinite;
    }

    @keyframes upgrade-spin {
        to { transform: rotate(360deg); }
    }

    .upgrade-container {
        max-width: 880px;
        width: 100%;
    }

    /* ── Header ── */
    .upgrade-header {
        text-align: center;
        margin-bottom: 2.5rem;
    }

    .upgrade-header__icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 64px;
        height: 64px;
        border-radius: 50%;
        background: rgba(108, 92, 231, 0.08);
        margin-bottom: 1.25rem;
    }

    .upgrade-header__title {
        font-size: 1.6rem;
        font-weight: 700;
        margin: 0 0 0.35rem;
        letter-spacing: -0.02em;
    }

    .upgrade-header__business {
        font-size: 1rem;
        font-weight: 600;
        color: var(--color-primary, #6c5ce7);
        margin: 0 0 0.6rem;
    }

    .upgrade-header__subtitle {
        color: #6b7280;
        font-size: 0.95rem;
        margin: 0 auto;
        max-width: 460px;
        line-height: 1.55;
    }

    .upgrade-header__safe {
        display: inline-flex;
        align-items: center;
        gap: 0.45rem;
        margin-top: 1rem;
        padding: 0.5rem 1rem;
        border-radius: 8px;
        background: #f0fdf4;
        color: #15803d;
        font-size: 0.8rem;
        font-weight: 500;
        border: 1px solid #bbf7d0;
    }

    /* ── Plans Grid ── */
    .upgrade-plans {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 1.25rem;
        margin-bottom: 2.5rem;
    }

    .upgrade-plan-card {
        background: #fff;
        border-radius: 16px;
        padding: 1.75rem 1.5rem;
        border: 1px solid #e5e7eb;
        position: relative;
        transition: transform 0.2s, box-shadow 0.2s;
    }

    .upgrade-plan-card:hover {
        transform: translateY(-3px);
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.08);
    }

    .upgrade-plan-card--featured {
        border: 2px solid var(--color-primary, #6c5ce7);
        box-shadow: 0 4px 20px rgba(108, 92, 231, 0.12);
    }

    .upgrade-plan-card__badge {
        position: absolute;
        top: -11px;
        left: 50%;
        transform: translateX(-50%);
        background: var(--color-primary, #6c5ce7);
        color: #fff;
        padding: 3px 14px;
        border-radius: 20px;
        font-size: 0.7rem;
        font-weight: 600;
        letter-spacing: 0.02em;
        white-space: nowrap;
    }

    .upgrade-plan-card__name {
        font-size: 1.05rem;
        font-weight: 600;
        color: #1f2937;
        margin: 0 0 0.75rem;
    }

    .upgrade-plan-card__price {
        display: flex;
        align-items: baseline;
        gap: 0.2rem;
        margin-bottom: 1.25rem;
    }

    .upgrade-plan-card__amount {
        font-size: 2.2rem;
        font-weight: 800;
        color: #1f2937;
        letter-spacing: -0.03em;
        line-height: 1;
    }

    .upgrade-plan-card__interval {
        font-size: 0.85rem;
        color: #9ca3af;
        font-weight: 500;
    }

    .upgrade-plan-card__features {
        list-style: none;
        padding: 0;
        margin: 0 0 1.5rem;
    }

    .upgrade-plan-card__features li {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.35rem 0;
        font-size: 0.85rem;
        color: #4b5563;
    }

    .upgrade-plan-card__features svg {
        flex-shrink: 0;
        color: #22c55e;
    }

    .upgrade-plan-card__cta {
        display: block;
        width: 100%;
        padding: 0.7rem 1rem;
        border-radius: 10px;
        border: 1.5px solid #d1d5db;
        background: #fff;
        color: #374151;
        text-align: center;
        text-decoration: none;
        font-size: 0.9rem;
        font-weight: 600;
        transition: all 0.2s;
        cursor: pointer;
    }

    .upgrade-plan-card__cta:hover {
        background: #f3f4f6;
        border-color: #9ca3af;
    }

    .upgrade-plan-card__cta--primary {
        background: var(--color-primary, #6c5ce7);
        color: #fff;
        border-color: var(--color-primary, #6c5ce7);
    }

    .upgrade-plan-card__cta--primary:hover {
        background: #5a4bd1;
        border-color: #5a4bd1;
    }

    /* ── Footer ── */
    .upgrade-footer {
        text-align: center;
        padding: 1rem 0;
    }

    .upgrade-footer__wa {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        color: #25D366;
        text-decoration: none;
        font-weight: 600;
        font-size: 0.88rem;
        padding: 0.55rem 1.25rem;
        border-radius: 10px;
        border: 1.5px solid #25D366;
        transition: all 0.2s;
    }

    .upgrade-footer__wa:hover {
        background: #25D366;
        color: #fff;
    }

    .upgrade-footer__logout {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        margin-top: 0.75rem;
        padding: 0.45rem 1rem;
        border-radius: 8px;
        border: 1px solid #e5e7eb;
        background: transparent;
        color: #6b7280;
        font-size: 0.82rem;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
    }

    .upgrade-footer__logout:hover {
        background: #f3f4f6;
        color: #374151;
        border-color: #d1d5db;
    }

    .upgrade-footer__copy {
        margin-top: 1rem;
        color: #9ca3af;
        font-size: 0.75rem;
    }

    /* ── Responsive ── */
    @media (max-width: 640px) {
        .upgrade-page {
            padding: 1rem 0.75rem;
            align-items: flex-start;
            padding-top: 2rem;
        }

        .upgrade-header__icon {
            width: 52px;
            height: 52px;
            margin-bottom: 1rem;
        }

        .upgrade-header__icon svg {
            width: 28px;
            height: 28px;
        }

        .upgrade-header__title {
            font-size: 1.3rem;
        }

        .upgrade-header__subtitle {
            font-size: 0.85rem;
        }

        .upgrade-header__safe {
            font-size: 0.75rem;
            padding: 0.4rem 0.75rem;
        }

        .upgrade-plans {
            grid-template-columns: 1fr;
            gap: 1rem;
        }

        .upgrade-plan-card {
            padding: 1.25rem;
        }

        .upgrade-plan-card__amount {
            font-size: 1.8rem;
        }

        .upgrade-footer__wa {
            font-size: 0.82rem;
            padding: 0.5rem 1rem;
        }
    }

    @media (min-width: 641px) and (max-width: 900px) {
        .upgrade-plans {
            grid-template-columns: repeat(2, 1fr);
        }
    }
`
