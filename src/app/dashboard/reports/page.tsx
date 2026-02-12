'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useBusiness } from '@/lib/context/BusinessContext'

interface DailySales {
    date: string
    total: number
    orders: number
}

interface TopProduct {
    name: string
    quantity: number
    revenue: number
}

interface ExpenseCategory {
    name: string
    total: number
    percentage: number
}

export default function ReportsPage() {
    const { businessId, loading: businessLoading } = useBusiness()
    const [loading, setLoading] = useState(true)
    const [dailySales, setDailySales] = useState<DailySales[]>([])
    const [topProducts, setTopProducts] = useState<TopProduct[]>([])
    const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([])

    // Financial Metrics
    const [financials, setFinancials] = useState({
        revenue: 0,
        expenses: 0,
        netIncome: 0,
        margin: 0,
        salesCount: 0,
        avgTicket: 0
    })

    const [openOrdersCount, setOpenOrdersCount] = useState(0)

    const supabase = createClient()

    const loadReports = useCallback(async () => {
        if (!businessId) return

        setLoading(true)

        try {
            // Calcular fechas (últimos 7 días) basados en la fecha actual del cliente
            const dates: string[] = []
            for (let i = 6; i >= 0; i--) {
                const date = new Date()
                date.setDate(date.getDate() - i)
                const dateStr = date.toISOString().split('T')[0] // YYYY-MM-DD local approx
                dates.push(dateStr)
            }

            // Fecha de inicio para la query (hace 7 días)
            const startDate = new Date()
            startDate.setDate(startDate.getDate() - 6)
            startDate.setHours(0, 0, 0, 0)
            const startDateStr = startDate.toISOString()

            // ─────────────────────────────────────────────────────────────
            // 1. FUENTE DE VERDAD: Payments (status='paid') -> Ingresos
            // ─────────────────────────────────────────────────────────────
            const { data: payments, error: paymentsError } = await supabase
                .from('payments')
                .select('amount, paid_at, order_id, method')
                .eq('business_id', businessId)
                .eq('status', 'paid')
                .is('deleted_at', null)
                .gte('paid_at', startDateStr)

            if (paymentsError) throw paymentsError

            // Agrupar por día (usando paid_at)
            const salesByDay: Record<string, DailySales> = {}
            dates.forEach(date => {
                salesByDay[date] = { date, total: 0, orders: 0 }
            })

            const paidOrderIds = new Set<string>()
            let totalRevenue = 0

            payments?.forEach(payment => {
                if (!payment.paid_at) return
                const date = payment.paid_at.split('T')[0]

                if (salesByDay[date]) {
                    salesByDay[date].total += payment.amount || 0
                    salesByDay[date].orders += 1
                }

                totalRevenue += payment.amount || 0
                if (payment.order_id) paidOrderIds.add(payment.order_id)
            })

            setDailySales(Object.values(salesByDay))

            // ─────────────────────────────────────────────────────────────
            // 2. GASTOS (Expenses) -> Egresos
            // ─────────────────────────────────────────────────────────────
            const { data: expenses, error: expensesError } = await supabase
                .from('expenses')
                .select('amount, category, created_at')
                .eq('business_id', businessId)
                .is('deleted_at', null)
                .gte('created_at', startDateStr)

            if (expensesError) throw expensesError

            let totalExpenses = 0
            const expensesByCatMap: Record<string, number> = {}

            expenses?.forEach(exp => {
                totalExpenses += exp.amount || 0
                const cat = exp.category || 'Sin categoría'
                expensesByCatMap[cat] = (expensesByCatMap[cat] || 0) + (exp.amount || 0)
            })

            // Calcular porcentajes y ordenar categorías
            const expenseCats: ExpenseCategory[] = Object.entries(expensesByCatMap)
                .map(([name, total]) => ({
                    name,
                    total,
                    percentage: totalExpenses > 0 ? (total / totalExpenses) * 100 : 0
                }))
                .sort((a, b) => b.total - a.total)
                .slice(0, 5) // Top 5 categorías

            setExpenseCategories(expenseCats)

            // ─────────────────────────────────────────────────────────────
            // 3. CALCULO DE UTILIDAD Y MARGENES
            // ─────────────────────────────────────────────────────────────
            const netIncome = totalRevenue - totalExpenses
            const margin = totalRevenue > 0 ? (netIncome / totalRevenue) * 100 : 0
            const totalOrders = payments?.length || 0
            const avgTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0

            setFinancials({
                revenue: totalRevenue,
                expenses: totalExpenses,
                netIncome,
                margin,
                salesCount: totalOrders,
                avgTicket
            })

            // ─────────────────────────────────────────────────────────────
            // 4. TOP PRODUCTOS (Basado en paidOrderIds)
            // ─────────────────────────────────────────────────────────────
            if (paidOrderIds.size > 0) {
                const idsArray = Array.from(paidOrderIds)

                const { data: orderItems, error: itemsError } = await supabase
                    .from('order_items')
                    .select('quantity, price_snapshot, name_snapshot')
                    .in('order_id', idsArray)

                if (itemsError) throw itemsError

                const productStats: Record<string, TopProduct> = {}

                orderItems?.forEach(item => {
                    const name = item.name_snapshot || 'Desconocido'
                    if (!productStats[name]) {
                        productStats[name] = { name, quantity: 0, revenue: 0 }
                    }
                    productStats[name].quantity += item.quantity || 0
                    productStats[name].revenue += (item.quantity || 0) * (item.price_snapshot || 0)
                })

                const sortedProducts = Object.values(productStats)
                    .sort((a, b) => b.quantity - a.quantity)
                    .slice(0, 10)

                setTopProducts(sortedProducts)

                // ─────────────────────────────────────────────────────────────
                // 5. DATA HEALTH
                // ─────────────────────────────────────────────────────────────
                const { count, error: healthError } = await supabase
                    .from('orders')
                    .select('id', { count: 'exact', head: true })
                    .in('id', idsArray)
                    .neq('status', 'CLOSED')
                    .neq('status', 'CANCELLED')

                if (!healthError) {
                    setOpenOrdersCount(count || 0)
                }

            } else {
                setTopProducts([])
                setOpenOrdersCount(0)
            }

        } catch (error) {
            console.error('Error loading reports:', error)
        } finally {
            setLoading(false)
        }
    }, [businessId, supabase])

    useEffect(() => {
        if (!businessLoading && businessId) {
            loadReports()
        }
    }, [businessLoading, businessId, loadReports])

    const getMaxSales = () => Math.max(...dailySales.map(d => d.total), 1)

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr + 'T12:00:00')
        return date.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric' })
    }

    if (businessLoading || loading) {
        return (
            <div className="reports-page">
                <div className="page-header">
                    <h1>Reportes</h1>
                </div>
                <div className="card">
                    <p className="text-muted">Cargando reportes...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="reports-page">
            <div className="page-header">
                <div>
                    <Link href="/dashboard" className="breadcrumb-link">
                        ← Volver al Dashboard
                    </Link>
                    <h1>Reportes</h1>
                    <p className="text-muted">Últimos 7 días</p>
                </div>
            </div>

            {/* Resumen Financiero Expandido */}
            <div className="reports-summary" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                <div className="report-stat-card">
                    <span className="report-stat-label">Ingresos</span>
                    <span className="report-stat-value text-success">${financials.revenue.toFixed(2)}</span>
                    <span className="report-stat-sub">{financials.salesCount} ventas</span>
                </div>
                <div className="report-stat-card">
                    <span className="report-stat-label">Gastos</span>
                    <span className="report-stat-value text-danger">-${financials.expenses.toFixed(2)}</span>
                </div>
                <div className="report-stat-card" style={{ background: financials.netIncome >= 0 ? '#ecfdf5' : '#fef2f2' }}>
                    <span className="report-stat-label">Utilidad Neta</span>
                    <span className="report-stat-value" style={{ color: financials.netIncome >= 0 ? '#16a34a' : '#dc2626' }}>
                        ${financials.netIncome.toFixed(2)}
                    </span>
                    <span className="report-stat-sub">
                        Margen: <strong>{financials.margin.toFixed(1)}%</strong>
                    </span>
                </div>
                <div className="report-stat-card">
                    <span className="report-stat-label">Ticket Promedio</span>
                    <span className="report-stat-value">${financials.avgTicket.toFixed(2)}</span>
                </div>
            </div>

            {openOrdersCount > 0 && (
                <div style={{
                    marginTop: '1rem',
                    padding: '0.75rem 1rem',
                    background: '#fff7ed',
                    border: '1px solid #fed7aa',
                    borderRadius: '8px',
                    color: '#c2410c',
                    fontSize: '0.9rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                }}>
                    <span>⚠️</span>
                    <strong>Atención operativa:</strong>
                    <span>Tienes {openOrdersCount} venta(s) cobrada(s) que aún no se han cerrado en cocina.</span>
                </div>
            )}

            <div className="reports-grid">
                {/* Ventas por día */}
                <div className="card report-section">
                    <h3 className="report-section-title">Ventas por dia</h3>
                    <div className="daily-chart">
                        {dailySales.map(day => (
                            <div key={day.date} className="daily-bar-container">
                                <div className="daily-bar-wrapper">
                                    <div
                                        className="daily-bar"
                                        style={{ height: `${(day.total / getMaxSales()) * 100}%` }}
                                        title={`$${day.total.toFixed(2)} - ${day.orders} ventas`}
                                    />
                                </div>
                                <span className="daily-label">{formatDate(day.date)}</span>
                                <span className="daily-amount">${day.total.toFixed(0)}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Gastos por categoría */}
                <div className="card report-section">
                    <h3 className="report-section-title">Gastos por categoría</h3>
                    {expenseCategories.length === 0 ? (
                        <p className="text-muted empty-message">No hay gastos registrados</p>
                    ) : (
                        <div className="expenses-list" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {expenseCategories.map(cat => (
                                <div key={cat.name} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', fontWeight: 500 }}>
                                        <span>{cat.name}</span>
                                        <span>${cat.total.toFixed(2)} ({cat.percentage.toFixed(0)}%)</span>
                                    </div>
                                    <div style={{ width: '100%', height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                                        <div style={{
                                            width: `${cat.percentage}%`,
                                            height: '100%',
                                            background: '#ef4444',
                                            borderRadius: '4px'
                                        }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Productos más vendidos */}
                <div className="card report-section" style={{ gridColumn: '1 / -1' }}>
                    <h3 className="report-section-title">Productos mas vendidos (Top 10)</h3>
                    {topProducts.length === 0 ? (
                        <p className="text-muted empty-message">No hay ventas en este período</p>
                    ) : (
                        <div className="top-products-list">
                            {topProducts.map((product, index) => (
                                <div key={product.name} className="top-product-row">
                                    <span className="top-product-rank">{index + 1}.</span>
                                    <span className="top-product-name">{product.name}</span>
                                    <span className="top-product-qty">{product.quantity} uds</span>
                                    <span className="top-product-revenue text-success">+${product.revenue.toFixed(2)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
