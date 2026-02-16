'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

interface PlanInfo {
    plan_name: string
    plan_code: string
    status: string
    price: number
    currency: string
    billing_interval: string
    trial_end: string | null
    current_period_end: string | null
}

interface LimitsInfo {
    products: { used: number; max: number }
    orders_day: { used: number; max: number }
    users: { used: number; max: number }
}

export default function PlanPage() {
    const [plan, setPlan] = useState<PlanInfo | null>(null)
    const [limits, setLimits] = useState<LimitsInfo | null>(null)
    const [loading, setLoading] = useState(true)
    const [businessName, setBusinessName] = useState('')

    const supabase = createClient()

    useEffect(() => {
        loadPlanData()
    }, [])

    const loadPlanData = async () => {
        setLoading(true)

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        // Get business membership
        const { data: membership } = await supabase
            .from('business_memberships')
            .select('business_id')
            .eq('user_id', user.id)
            .single()

        if (!membership) return

        const businessId = membership.business_id

        // Load business info + limits
        const { data: business } = await supabase
            .from('businesses')
            .select('name, limits_products, limits_orders_day, limits_users')
            .eq('id', businessId)
            .single()

        if (business) {
            setBusinessName(business.name || '')

            // Count current usage
            const [productsResult, usersResult] = await Promise.all([
                supabase
                    .from('products')
                    .select('id', { count: 'exact', head: true })
                    .eq('business_id', businessId)
                    .is('deleted_at', null),
                supabase
                    .from('business_memberships')
                    .select('id', { count: 'exact', head: true })
                    .eq('business_id', businessId)
                    .is('deleted_at', null),
            ])

            // Today's orders count
            const todayStart = new Date()
            todayStart.setHours(0, 0, 0, 0)
            const { count: ordersToday } = await supabase
                .from('payments')
                .select('id', { count: 'exact', head: true })
                .eq('business_id', businessId)
                .eq('status', 'paid')
                .gte('paid_at', todayStart.toISOString())
                .is('deleted_at', null)

            setLimits({
                products: { used: productsResult.count || 0, max: business.limits_products || 100 },
                orders_day: { used: ordersToday || 0, max: business.limits_orders_day || 200 },
                users: { used: usersResult.count || 0, max: business.limits_users || 3 },
            })
        }

        // Load subscription
        const { data: sub } = await supabase
            .from('subscriptions')
            .select(`
                status,
                trial_end,
                current_period_end,
                plan_code_snapshot,
                price_snapshot,
                currency,
                billing_interval,
                plan_id,
                plans ( name )
            `)
            .eq('business_id', businessId)
            .single()

        if (sub) {
            const planData = sub.plans as unknown as { name: string } | null
            setPlan({
                plan_name: planData?.name || sub.plan_code_snapshot || 'Sin plan',
                plan_code: sub.plan_code_snapshot || '',
                status: sub.status,
                price: sub.price_snapshot || 0,
                currency: sub.currency || 'MXN',
                billing_interval: sub.billing_interval || '',
                trial_end: sub.trial_end,
                current_period_end: sub.current_period_end,
            })
        }

        setLoading(false)
    }

    const getStatusLabel = (status: string) => {
        const map: Record<string, { label: string; className: string }> = {
            trialing: { label: 'Periodo de prueba', className: 'plan-badge-trial' },
            active: { label: 'Activo', className: 'plan-badge-active' },
            past_due: { label: 'Pago pendiente', className: 'plan-badge-warning' },
            expired: { label: 'Expirado', className: 'plan-badge-expired' },
            canceled: { label: 'Cancelado', className: 'plan-badge-expired' },
        }
        return map[status] || { label: status, className: '' }
    }

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return '—'
        return new Date(dateStr).toLocaleDateString('es-MX', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
        })
    }

    const getDaysRemaining = (dateStr: string | null) => {
        if (!dateStr) return null
        const end = new Date(dateStr)
        const now = new Date()
        const diffMs = end.getTime() - now.getTime()
        const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
        return days
    }

    const getUsagePercent = (used: number, max: number) => {
        if (max <= 0) return 0
        return Math.min(100, Math.round((used / max) * 100))
    }

    const getUsageColor = (percent: number) => {
        if (percent >= 90) return 'var(--color-danger, #ef4444)'
        if (percent >= 70) return 'var(--color-warning, #f59e0b)'
        return 'var(--color-success, #22c55e)'
    }

    if (loading) {
        return (
            <div className="plan-page">
                <div className="page-header">
                    <div>
                        <Link href="/dashboard" className="back-link">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="15 18 9 12 15 6"></polyline>
                            </svg>
                            Volver
                        </Link>
                        <h1>Mi Plan</h1>
                    </div>
                </div>
                <div className="card" style={{ padding: 'var(--spacing-xl)', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    Cargando informacion del plan...
                </div>
            </div>
        )
    }

    const statusInfo = plan ? getStatusLabel(plan.status) : null
    const daysLeft = plan ? getDaysRemaining(plan.status === 'trialing' ? plan.trial_end : plan.current_period_end) : null

    return (
        <div className="plan-page">
            {/* Header */}
            <div className="page-header">
                <div>
                    <Link href="/dashboard" className="back-link">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="15 18 9 12 15 6"></polyline>
                        </svg>
                        Volver
                    </Link>
                    <h1>Mi Plan</h1>
                    <p className="text-muted">{businessName}</p>
                </div>
            </div>

            {/* Plan Card */}
            {plan ? (
                <div className="card plan-card">
                    <div className="plan-card-header">
                        <div className="plan-card-title-row">
                            <div>
                                <h2 className="plan-card-name">{plan.plan_name}</h2>
                                <p className="plan-card-code">{plan.plan_code}</p>
                            </div>
                            <span className={`plan-badge ${statusInfo?.className || ''}`}>
                                {statusInfo?.label}
                            </span>
                        </div>

                        {/* Price */}
                        <div className="plan-price-row">
                            <span className="plan-price">
                                ${plan.price.toFixed(2)} <span className="plan-price-currency">{plan.currency}</span>
                            </span>
                            <span className="plan-price-interval">
                                {plan.billing_interval === 'trial' && '/ prueba gratuita'}
                                {plan.billing_interval === 'monthly' && '/ mes'}
                                {plan.billing_interval === 'annual' && '/ año'}
                            </span>
                        </div>
                    </div>

                    {/* Dates */}
                    <div className="plan-dates">
                        {plan.status === 'trialing' && plan.trial_end && (
                            <div className="plan-date-item">
                                <span className="plan-date-label">Prueba termina</span>
                                <span className="plan-date-value">{formatDate(plan.trial_end)}</span>
                            </div>
                        )}
                        {plan.current_period_end && plan.status !== 'trialing' && (
                            <div className="plan-date-item">
                                <span className="plan-date-label">Proxima renovacion</span>
                                <span className="plan-date-value">{formatDate(plan.current_period_end)}</span>
                            </div>
                        )}
                        {daysLeft !== null && (
                            <div className="plan-date-item">
                                <span className="plan-date-label">Dias restantes</span>
                                <span className={`plan-days-left ${daysLeft <= 2 ? 'urgent' : ''}`}>
                                    {daysLeft <= 0 ? 'Expirado' : `${daysLeft} dia${daysLeft !== 1 ? 's' : ''}`}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Expiration warning */}
                    {plan.status === 'trialing' && daysLeft !== null && daysLeft <= 2 && daysLeft > 0 && (
                        <div className="plan-warning">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="12" y1="8" x2="12" y2="12" />
                                <line x1="12" y1="16" x2="12.01" y2="16" />
                            </svg>
                            Tu prueba gratuita esta por terminar. Contacta al administrador para activar un plan.
                        </div>
                    )}

                    {plan.status === 'expired' && (
                        <div className="plan-warning plan-warning-danger">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="12" y1="8" x2="12" y2="12" />
                                <line x1="12" y1="16" x2="12.01" y2="16" />
                            </svg>
                            Tu plan ha expirado. Contacta al administrador para renovar.
                        </div>
                    )}
                </div>
            ) : (
                <div className="card" style={{ padding: 'var(--spacing-xl)', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    No se encontro informacion de suscripcion.
                </div>
            )}

            {/* Usage / Limits */}
            {limits && (
                <div className="card plan-limits-card">
                    <h3 className="plan-limits-title">Uso del plan</h3>
                    <div className="plan-limits-grid">
                        {/* Products */}
                        <div className="plan-limit-item">
                            <div className="plan-limit-header">
                                <span className="plan-limit-label">Productos</span>
                                <span className="plan-limit-count">
                                    {limits.products.used} / {limits.products.max}
                                </span>
                            </div>
                            <div className="plan-limit-bar">
                                <div
                                    className="plan-limit-fill"
                                    style={{
                                        width: `${getUsagePercent(limits.products.used, limits.products.max)}%`,
                                        backgroundColor: getUsageColor(getUsagePercent(limits.products.used, limits.products.max)),
                                    }}
                                />
                            </div>
                        </div>

                        {/* Daily Orders */}
                        <div className="plan-limit-item">
                            <div className="plan-limit-header">
                                <span className="plan-limit-label">Ventas hoy</span>
                                <span className="plan-limit-count">
                                    {limits.orders_day.used} / {limits.orders_day.max}
                                </span>
                            </div>
                            <div className="plan-limit-bar">
                                <div
                                    className="plan-limit-fill"
                                    style={{
                                        width: `${getUsagePercent(limits.orders_day.used, limits.orders_day.max)}%`,
                                        backgroundColor: getUsageColor(getUsagePercent(limits.orders_day.used, limits.orders_day.max)),
                                    }}
                                />
                            </div>
                        </div>

                        {/* Users */}
                        <div className="plan-limit-item">
                            <div className="plan-limit-header">
                                <span className="plan-limit-label">Usuarios</span>
                                <span className="plan-limit-count">
                                    {limits.users.used} / {limits.users.max}
                                </span>
                            </div>
                            <div className="plan-limit-bar">
                                <div
                                    className="plan-limit-fill"
                                    style={{
                                        width: `${getUsagePercent(limits.users.used, limits.users.max)}%`,
                                        backgroundColor: getUsageColor(getUsagePercent(limits.users.used, limits.users.max)),
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
