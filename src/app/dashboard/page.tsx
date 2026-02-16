'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useBusiness } from '@/lib/context/BusinessContext'

interface PlanBannerData {
    plan_name: string
    plan_code: string
    status: string
    trial_end: string | null
    current_period_end: string | null
    days_left: number | null
}

export default function DashboardPage() {
    const { businessId, businessName, role, userId, loading: businessLoading } = useBusiness()
    const [stats, setStats] = useState({
        shiftSales: 0,
        shiftOrders: 0,
        todaySales: 0,
        todayOrders: 0,
        pendingOrders: 0,
        cashStatus: 'Cerrada' as 'Abierta' | 'Cerrada',
        cashAmount: 0,
        cashRegisterId: null as string | null,
    })
    const [planData, setPlanData] = useState<PlanBannerData | null>(null)
    const [loading, setLoading] = useState(true)

    const supabase = createClient()

    useEffect(() => {
        if (businessLoading || !businessId || !userId) return
        loadStats()
        if (role === 'OWNER') loadPlanData()
    }, [businessLoading, businessId, userId])

    const loadPlanData = async () => {
        const { data: sub } = await supabase
            .from('subscriptions')
            .select(`
                status,
                trial_end,
                current_period_end,
                plan_code_snapshot,
                plans ( name )
            `)
            .eq('business_id', businessId)
            .single()

        if (sub) {
            const planInfo = sub.plans as unknown as { name: string } | null
            const endDate = sub.status === 'trialing' ? sub.trial_end : sub.current_period_end
            let daysLeft: number | null = null
            if (endDate) {
                const diffMs = new Date(endDate).getTime() - Date.now()
                daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
            }
            setPlanData({
                plan_name: planInfo?.name || sub.plan_code_snapshot || 'Sin plan',
                plan_code: sub.plan_code_snapshot || '',
                status: sub.status,
                trial_end: sub.trial_end,
                current_period_end: sub.current_period_end,
                days_left: daysLeft,
            })
        }
    }

    const loadStats = async () => {
        setLoading(true)

        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const todayISO = today.toISOString()

        try {
            const { data: openRegister } = await supabase
                .from('cash_registers')
                .select('id, opening_amount, opened_at')
                .eq('business_id', businessId)
                .eq('opened_by', userId)
                .eq('status', 'open')
                .is('deleted_at', null)
                .maybeSingle()

            let shiftSales = 0
            let shiftOrders = 0

            if (openRegister) {
                const { data: shiftPayments } = await supabase
                    .from('payments')
                    .select('amount')
                    .eq('cash_register_id', openRegister.id)
                    .eq('status', 'paid')
                    .is('deleted_at', null)

                shiftSales = shiftPayments?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0
                shiftOrders = shiftPayments?.length || 0
            }

            const { data: todayPayments } = await supabase
                .from('payments')
                .select('amount, paid_at')
                .eq('business_id', businessId)
                .eq('status', 'paid')
                .is('deleted_at', null)
                .gte('paid_at', todayISO)

            const todaySales = todayPayments?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0
            const todayOrders = todayPayments?.length || 0

            const { count: pendingCount } = await supabase
                .from('orders')
                .select('id', { count: 'exact', head: true })
                .eq('business_id', businessId)
                .in('status', ['OPEN', 'IN_PREP', 'READY', 'DELIVERED'])
                .is('deleted_at', null)

            setStats({
                shiftSales,
                shiftOrders,
                todaySales,
                todayOrders,
                pendingOrders: pendingCount || 0,
                cashStatus: openRegister ? 'Abierta' : 'Cerrada',
                cashAmount: openRegister?.opening_amount || 0,
                cashRegisterId: openRegister?.id || null,
            })
        } catch (error) {
            console.error('Error loading stats:', error)
        }

        setLoading(false)
    }

    const ticketPromedio = stats.todayOrders > 0
        ? (stats.todaySales / stats.todayOrders).toFixed(2)
        : '0.00'

    const getPlanStatusLabel = (status: string) => {
        const m: Record<string, string> = {
            trialing: 'Prueba',
            active: 'Activo',
            past_due: 'Pago pendiente',
            expired: 'Expirado',
            canceled: 'Cancelado',
        }
        return m[status] || status
    }

    const getPlanBannerClass = () => {
        if (!planData) return ''
        if (planData.status === 'expired' || planData.status === 'canceled') return 'plan-banner-danger'
        if (planData.status === 'past_due') return 'plan-banner-warning'
        if (planData.status === 'trialing' && planData.days_left !== null && planData.days_left <= 2) return 'plan-banner-warning'
        return ''
    }

    if (businessLoading || loading) {
        return (
            <div className="dashboard-page">
                <h1 className="dashboard-title">Bienvenido a GastroOS</h1>
                <div className="dashboard-grid">
                    <div className="dashboard-card skeleton" />
                    <div className="dashboard-card skeleton" />
                    <div className="dashboard-card skeleton" />
                    <div className="dashboard-card skeleton" />
                </div>
            </div>
        )
    }

    return (
        <div className="dashboard-page">
            {/* Plan Banner - only for OWNER */}
            {planData && role === 'OWNER' && (
                <Link href="/dashboard/settings/plan" className={`plan-banner ${getPlanBannerClass()}`}>
                    <div className="plan-banner-left">
                        <span className="plan-banner-name">{planData.plan_name}</span>
                        <span className={`plan-banner-status plan-banner-status--${planData.status}`}>
                            {getPlanStatusLabel(planData.status)}
                        </span>
                    </div>
                    <div className="plan-banner-right">
                        {planData.days_left !== null && (
                            <span className={`plan-banner-days ${planData.days_left <= 2 ? 'urgent' : ''}`}>
                                {planData.days_left <= 0
                                    ? 'Expirado'
                                    : `${planData.days_left} dia${planData.days_left !== 1 ? 's' : ''} restante${planData.days_left !== 1 ? 's' : ''}`
                                }
                            </span>
                        )}
                        <svg className="plan-banner-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="9 18 15 12 9 6"></polyline>
                        </svg>
                    </div>
                </Link>
            )}

            <div className="dashboard-header">
                <div>
                    <h1 className="dashboard-title">
                        {businessName || 'GastroOS'}
                    </h1>
                    <p className="dashboard-subtitle">
                        {new Date().toLocaleDateString('es-MX', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                        })}
                    </p>
                </div>

            </div>

            <div className="dashboard-grid">
                {/* Ventas de hoy - KPI Principal para el dueño */}
                <div
                    className="dashboard-card today-sales primary"
                    title="Total de ventas cobradas desde las 00:00 de hoy"
                >
                    <div className="dashboard-card-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <polyline points="12 6 12 12 16 14" />
                        </svg>
                    </div>
                    <div className="dashboard-card-content">
                        <span className="dashboard-card-label">
                            Ventas de hoy
                        </span>
                        <span className="dashboard-card-value">${stats.todaySales.toFixed(2)}</span>
                        <span className="dashboard-card-subtitle">
                            {stats.todayOrders} {stats.todayOrders === 1 ? 'venta' : 'ventas'} realizadas
                        </span>
                    </div>
                </div>

                {/* Ventas del turno - Para el cajero */}
                <div
                    className="dashboard-card shift-sales"
                    title="Ventas durante tu turno actual de caja"
                >
                    <div className="dashboard-card-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="12" y1="1" x2="12" y2="23" />
                            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                        </svg>
                    </div>
                    <div className="dashboard-card-content">
                        <span className="dashboard-card-label">
                            Ventas del turno
                        </span>
                        <span className="dashboard-card-value">${stats.shiftSales.toFixed(2)}</span>
                        <span className="dashboard-card-subtitle">
                            {stats.cashStatus === 'Abierta'
                                ? `${stats.shiftOrders} ${stats.shiftOrders === 1 ? 'venta' : 'ventas'} en este turno`
                                : 'Abre caja para comenzar'
                            }
                        </span>
                    </div>
                </div>

                {/* Ticket promedio */}
                <div
                    className="dashboard-card ticket"
                    title="Promedio de venta por orden hoy"
                >
                    <div className="dashboard-card-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                        </svg>
                    </div>
                    <div className="dashboard-card-content">
                        <span className="dashboard-card-label">
                            Ticket promedio
                        </span>
                        <span className="dashboard-card-value">${ticketPromedio}</span>
                        <span className="dashboard-card-subtitle">Por venta hoy</span>
                    </div>
                </div>


                {/* Estado de caja */}
                <div
                    className={`dashboard-card cash ${stats.cashStatus === 'Abierta' ? 'open' : 'closed'}`}
                    title={stats.cashStatus === 'Abierta' ? 'Tu caja está abierta' : 'Ve a Caja para abrir tu turno'}
                >
                    <div className="dashboard-card-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="2" y="4" width="20" height="16" rx="2" />
                            <path d="M12 8v8" />
                            <path d="M8 12h8" />
                        </svg>
                    </div>
                    <div className="dashboard-card-content">
                        <span className="dashboard-card-label">
                            Estado de caja
                        </span>
                        <span className="dashboard-card-value">{stats.cashStatus}</span>
                        <span className="dashboard-card-subtitle">
                            {stats.cashStatus === 'Abierta'
                                ? `Apertura: $${stats.cashAmount.toFixed(2)}`
                                : 'Abre caja para vender'
                            }
                        </span>
                    </div>
                </div>
            </div>
        </div>
    )
}
