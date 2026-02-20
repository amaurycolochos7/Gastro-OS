'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useBusiness } from '@/lib/context/BusinessContext'

interface ProductSale {
    name: string
    quantity: number
    revenue: number
}

export default function AnalyticsPage() {
    const { businessId } = useBusiness()
    const supabase = createClient()

    const [productSales, setProductSales] = useState<ProductSale[]>([])
    const [totalRevenue, setTotalRevenue] = useState(0)
    const [totalItemsSold, setTotalItemsSold] = useState(0)
    const [loading, setLoading] = useState(true)

    const now = new Date()
    const monthName = now.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const today = now.toISOString()

    const loadAnalytics = useCallback(async () => {
        if (!businessId) return
        setLoading(true)

        // Obtener payments pagados del mes actual
        const { data: payments } = await supabase
            .from('payments')
            .select('order_id')
            .eq('business_id', businessId)
            .eq('status', 'paid')
            .gte('paid_at', firstDay)
            .lte('paid_at', today)

        if (!payments || payments.length === 0) {
            setProductSales([])
            setTotalRevenue(0)
            setTotalItemsSold(0)
            setLoading(false)
            return
        }

        const orderIds = payments.map(p => p.order_id)

        // Obtener items de esas órdenes
        const { data: items } = await supabase
            .from('order_items')
            .select('name_snapshot, quantity, price_snapshot')
            .in('order_id', orderIds)

        if (!items || items.length === 0) {
            setProductSales([])
            setTotalRevenue(0)
            setTotalItemsSold(0)
            setLoading(false)
            return
        }

        // Agrupar por producto
        const salesMap = new Map<string, { quantity: number; revenue: number }>()
        let totalRev = 0
        let totalItems = 0

        for (const item of items) {
            const key = item.name_snapshot
            const existing = salesMap.get(key) || { quantity: 0, revenue: 0 }
            existing.quantity += item.quantity
            existing.revenue += item.quantity * item.price_snapshot
            salesMap.set(key, existing)

            totalRev += item.quantity * item.price_snapshot
            totalItems += item.quantity
        }

        // Convertir a array y ordenar por cantidad descendente
        const salesArray: ProductSale[] = Array.from(salesMap.entries())
            .map(([name, data]) => ({ name, ...data }))
            .sort((a, b) => b.quantity - a.quantity)

        setProductSales(salesArray)
        setTotalRevenue(totalRev)
        setTotalItemsSold(totalItems)
        setLoading(false)
    }, [businessId, supabase, firstDay, today])

    useEffect(() => {
        loadAnalytics()
    }, [loadAnalytics])

    if (loading) {
        return (
            <div className="analytics-page">
                <div className="analytics-loading">
                    <div className="spinner" />
                    <p>Cargando analítica...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="analytics-page">
            <div className="analytics-header">
                <div>
                    <h1>Analítica de Ventas</h1>
                    <p className="text-muted" style={{ textTransform: 'capitalize' }}>
                        {monthName} — del día 1 al {now.getDate()}
                    </p>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={loadAnalytics}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="23 4 23 10 17 10" />
                        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                    </svg>
                    Actualizar
                </button>
            </div>

            {/* Summary Cards */}
            <div className="analytics-summary">
                <div className="analytics-card-summary">
                    <span className="analytics-card-icon">$</span>
                    <div>
                        <div className="analytics-card-value">${totalRevenue.toFixed(2)}</div>
                        <div className="analytics-card-label">Ingresos del mes</div>
                    </div>
                </div>
                <div className="analytics-card-summary">
                    <span className="analytics-card-icon">#</span>
                    <div>
                        <div className="analytics-card-value">{totalItemsSold}</div>
                        <div className="analytics-card-label">Productos vendidos</div>
                    </div>
                </div>
                <div className="analytics-card-summary">
                    <span className="analytics-card-icon">*</span>
                    <div>
                        <div className="analytics-card-value">{productSales.length}</div>
                        <div className="analytics-card-label">Productos distintos</div>
                    </div>
                </div>
            </div>

            {/* Products Table */}
            <div className="card analytics-table-card">
                <h3 className="analytics-table-title">Ventas por producto</h3>
                {productSales.length === 0 ? (
                    <div className="analytics-empty">
                        <span className="analytics-empty-icon">--</span>
                        <p>No hay ventas registradas este mes.</p>
                        <p className="text-muted text-sm">Las ventas aparecerán a medida que se registren pagos.</p>
                    </div>
                ) : (
                    <div className="analytics-table-wrapper">
                        <table className="analytics-table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Producto</th>
                                    <th style={{ textAlign: 'right' }}>Cantidad</th>
                                    <th style={{ textAlign: 'right' }}>Monto</th>
                                </tr>
                            </thead>
                            <tbody>
                                {productSales.map((product, idx) => (
                                    <tr key={product.name}>
                                        <td className="analytics-rank">
                                            {idx < 3 ? (
                                                <span className={`analytics-medal medal-${idx + 1}`}>
                                                    {idx + 1}
                                                </span>
                                            ) : (
                                                <span className="analytics-rank-number">{idx + 1}</span>
                                            )}
                                        </td>
                                        <td className="analytics-product-name">{product.name}</td>
                                        <td style={{ textAlign: 'right' }}>
                                            <span className="analytics-qty-badge">{product.quantity}</span>
                                        </td>
                                        <td style={{ textAlign: 'right', fontWeight: 600 }}>
                                            ${product.revenue.toFixed(2)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    )
}
