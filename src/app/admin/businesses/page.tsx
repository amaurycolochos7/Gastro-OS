'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Business {
    id: string
    name: string
    type: string
    created_at: string
    limits_products: number
    limits_orders_day: number
    limits_users: number
    owner_email: string | null
    sub_status: string | null
    plan_code: string | null
    plan_price: number | null
    trial_end: string | null
    current_period_end: string | null
    admin_assigned: boolean
}

interface Plan {
    slug: string
    name: string
    price: number
    billing_interval: string
}

type SortField = 'created_at' | 'period_end' | 'mrr' | 'name'
type SortDir = 'asc' | 'desc'

// -- SVG icon components --
const IconUser = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
        <path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" />
    </svg>
)

const IconStore = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
        <path d="M2.879 7.121A3 3 0 007.243 6h5.514a3 3 0 004.364 1.121L18 6.088V14a2 2 0 01-2 2H4a2 2 0 01-2-2V6.088l.879 1.033z" />
        <path fillRule="evenodd" d="M2 3a1 1 0 011-1h14a1 1 0 011 1v1H2V3z" clipRule="evenodd" />
    </svg>
)

const IconCalendar = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75z" clipRule="evenodd" />
    </svg>
)

const IconClock = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" clipRule="evenodd" />
    </svg>
)

const IconPlan = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M1 2.75A.75.75 0 011.75 2h16.5a.75.75 0 010 1.5H18v8.75A2.75 2.75 0 0115.25 15h-1.072l.798 3.06a.75.75 0 01-1.452.38L13.41 18H6.59l-.114.44a.75.75 0 01-1.452-.38L5.823 15H4.75A2.75 2.75 0 012 12.25V3.5h-.25A.75.75 0 011 2.75z" clipRule="evenodd" />
    </svg>
)

const IconCheck = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="12" height="12">
        <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
    </svg>
)

const IconXMark = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
        <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
    </svg>
)

const IconSearch = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
    </svg>
)

const IconDownload = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
        <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" />
        <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
    </svg>
)

const IconSort = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M2 3.75A.75.75 0 012.75 3h11.5a.75.75 0 010 1.5H2.75A.75.75 0 012 3.75zM2 7.5a.75.75 0 01.75-.75h7.508a.75.75 0 010 1.5H2.75A.75.75 0 012 7.5zM14 7a.75.75 0 01.75.75v6.59l1.95-2.1a.75.75 0 111.1 1.02l-3.25 3.5a.75.75 0 01-1.1 0l-3.25-3.5a.75.75 0 111.1-1.02l1.95 2.1V7.75A.75.75 0 0114 7zM2 11.25a.75.75 0 01.75-.75h4.562a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75z" clipRule="evenodd" />
    </svg>
)

const STATUS_LABELS: Record<string, string> = {
    trialing: 'Trial',
    active: 'Activo',
    expired: 'Vencido',
    past_due: 'Pago pendiente',
    canceled: 'Cancelado',
}

const SORT_OPTIONS: { value: SortField; label: string }[] = [
    { value: 'created_at', label: 'Fecha de creación' },
    { value: 'period_end', label: 'Vencimiento' },
    { value: 'mrr', label: 'Precio plan' },
    { value: 'name', label: 'Nombre' },
]

const TYPE_LABELS: Record<string, string> = {
    fast_food: 'Mostrador',
    restaurant: 'Restaurante',
    other: 'Otro',
}

const EXPIRY_OPTIONS = [
    { value: 0, label: 'Todos' },
    { value: 7, label: '7 días' },
    { value: 15, label: '15 días' },
    { value: 30, label: '30 días' },
]

export default function AdminBusinessesPage() {
    const [businesses, setBusinesses] = useState<Business[]>([])
    const [plans, setPlans] = useState<Plan[]>([])
    const [loading, setLoading] = useState(true)
    const [actionLoading, setActionLoading] = useState<string | null>(null)
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
    const [confirmModal, setConfirmModal] = useState<{ businessId: string; businessName: string } | null>(null)

    // --- Toolbar state ---
    const [search, setSearch] = useState('')
    const [filterStatus, setFilterStatus] = useState<string>('all')
    const [filterPlan, setFilterPlan] = useState<string>('all')
    const [filterType, setFilterType] = useState<string>('all')
    const [filterExpiry, setFilterExpiry] = useState<number>(0)
    const [sortField, setSortField] = useState<SortField>('created_at')
    const [sortDir, setSortDir] = useState<SortDir>('desc')

    const supabase = createClient()

    useEffect(() => {
        loadData()
    }, [])

    const loadData = async () => {
        const { data } = await supabase.rpc('admin_list_businesses')
        if (data?.success) {
            setBusinesses(data.businesses || [])
        }

        const { data: plansData } = await supabase
            .from('plans')
            .select('slug, name, price, billing_interval')
            .eq('active', true)
            .neq('slug', 'demo')
            .order('price')

        if (plansData) setPlans(plansData)
        setLoading(false)
    }

    // --- Filtering + Sorting ---
    const filteredBusinesses = useMemo(() => {
        let result = [...businesses]

        // Search
        if (search.trim()) {
            const q = search.toLowerCase()
            result = result.filter((b) =>
                b.name.toLowerCase().includes(q) ||
                (b.owner_email || '').toLowerCase().includes(q) ||
                b.id.toLowerCase().includes(q)
            )
        }

        // Status filter
        if (filterStatus !== 'all') {
            result = result.filter((b) => (b.sub_status || 'none') === filterStatus)
        }

        // Plan filter
        if (filterPlan !== 'all') {
            result = result.filter((b) => b.plan_code === filterPlan)
        }

        // Type/mode filter
        if (filterType !== 'all') {
            result = result.filter((b) => b.type === filterType)
        }

        // Expiry filter (vence en X días)
        if (filterExpiry > 0) {
            const now = new Date()
            const limit = new Date(now.getTime() + filterExpiry * 24 * 60 * 60 * 1000)
            result = result.filter((b) => {
                const end = b.trial_end || b.current_period_end
                if (!end) return false
                const endDate = new Date(end)
                return endDate <= limit && endDate >= now
            })
        }

        // Sorting
        result.sort((a, b) => {
            let cmp = 0
            switch (sortField) {
                case 'created_at':
                    cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                    break
                case 'period_end': {
                    const aEnd = a.trial_end || a.current_period_end || ''
                    const bEnd = b.trial_end || b.current_period_end || ''
                    cmp = (aEnd ? new Date(aEnd).getTime() : 0) - (bEnd ? new Date(bEnd).getTime() : 0)
                    break
                }
                case 'mrr':
                    cmp = (a.plan_price || 0) - (b.plan_price || 0)
                    break
                case 'name':
                    cmp = a.name.localeCompare(b.name)
                    break
            }
            return sortDir === 'desc' ? -cmp : cmp
        })

        return result
    }, [businesses, search, filterStatus, filterPlan, filterType, filterExpiry, sortField, sortDir])

    // --- CSV Export ---
    const exportCSV = () => {
        const headers = ['Nombre', 'Owner', 'Tipo', 'Estado', 'Plan', 'Precio', 'Creado', 'Vence/Hasta', 'Productos', 'Órdenes/día', 'Usuarios']
        const rows = filteredBusinesses.map((b) => [
            b.name,
            b.owner_email || '',
            TYPE_LABELS[b.type] || b.type,
            STATUS_LABELS[b.sub_status || ''] || 'Sin plan',
            b.plan_code || '',
            b.plan_price?.toString() || '0',
            formatDate(b.created_at),
            formatDate(b.trial_end || b.current_period_end),
            b.limits_products.toString(),
            b.limits_orders_day.toString(),
            b.limits_users.toString(),
        ])

        const csv = [headers, ...rows]
            .map((row) => row.map((c) => `"${c.replace(/"/g, '""')}"`).join(','))
            .join('\n')

        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `gastro-negocios-${new Date().toISOString().slice(0, 10)}.csv`
        a.click()
        URL.revokeObjectURL(url)
    }

    const handleAssignPlan = async (businessId: string, planSlug: string) => {
        setActionLoading(businessId)
        setMessage(null)

        const { data } = await supabase.rpc('admin_assign_plan', {
            p_business_id: businessId,
            p_plan_slug: planSlug,
            p_notes: 'Asignado desde admin panel',
        })

        if (data?.success) {
            setMessage({ type: 'success', text: data.message })
            loadData()
        } else {
            setMessage({ type: 'error', text: data?.message || 'Error desconocido' })
        }

        setActionLoading(null)
    }

    const openUnassignModal = (businessId: string, businessName: string) => {
        setConfirmModal({ businessId, businessName })
    }

    const executeUnassign = async () => {
        if (!confirmModal) return

        const { businessId } = confirmModal
        setConfirmModal(null)
        setActionLoading(businessId)
        setMessage(null)

        const { data } = await supabase.rpc('admin_unassign_plan', {
            p_business_id: businessId,
            p_notes: 'Desasignado desde admin panel',
        })

        if (data?.success) {
            setMessage({ type: 'success', text: data.message })
            loadData()
        } else {
            setMessage({ type: 'error', text: data?.message || 'Error desconocido' })
        }

        setActionLoading(null)
    }

    const formatDate = (d: string | null) => {
        if (!d) return '—'
        return new Date(d).toLocaleDateString('es-MX', {
            day: 'numeric', month: 'short', year: 'numeric',
        })
    }

    // Unique types from data
    const uniqueTypes = useMemo(() => {
        const types = new Set(businesses.map((b) => b.type))
        return Array.from(types)
    }, [businesses])

    // Unique plan codes from data
    const uniquePlans = useMemo(() => {
        const codes = new Set(businesses.map((b) => b.plan_code).filter(Boolean) as string[])
        return Array.from(codes)
    }, [businesses])

    // Active filters count
    const activeFilters = [
        filterStatus !== 'all',
        filterPlan !== 'all',
        filterType !== 'all',
        filterExpiry > 0,
        search.trim() !== '',
    ].filter(Boolean).length

    const clearFilters = () => {
        setSearch('')
        setFilterStatus('all')
        setFilterPlan('all')
        setFilterType('all')
        setFilterExpiry(0)
        setSortField('created_at')
        setSortDir('desc')
    }

    if (loading) {
        return (
            <div className="admin-loading">
                <div className="admin-loading__spinner" />
                Cargando negocios...
            </div>
        )
    }

    return (
        <div>
            {/* Page header */}
            <div className="admin-page-header">
                <h2 className="admin-page-title">
                    Negocios
                    <span className="admin-page-title__count">({filteredBusinesses.length}{filteredBusinesses.length !== businesses.length ? ` de ${businesses.length}` : ''})</span>
                </h2>
                <button className="admin-export-btn" onClick={exportCSV}>
                    <IconDownload />
                    Exportar CSV
                </button>
            </div>

            {/* Operator Toolbar */}
            <div className="admin-toolbar">
                {/* Search */}
                <div className="admin-toolbar__search">
                    <IconSearch />
                    <input
                        type="text"
                        placeholder="Buscar por nombre, email o ID..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="admin-toolbar__search-input"
                    />
                    {search && (
                        <button className="admin-toolbar__search-clear" onClick={() => setSearch('')}>
                            <IconXMark />
                        </button>
                    )}
                </div>

                {/* Filters row */}
                <div className="admin-toolbar__filters">
                    {/* Status */}
                    <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className={`admin-toolbar__select ${filterStatus !== 'all' ? 'admin-toolbar__select--active' : ''}`}
                    >
                        <option value="all">Estado: Todos</option>
                        <option value="trialing">Trial</option>
                        <option value="active">Activo</option>
                        <option value="expired">Vencido</option>
                        <option value="past_due">Pago pendiente</option>
                        <option value="canceled">Cancelado</option>
                        <option value="none">Sin plan</option>
                    </select>

                    {/* Plan */}
                    <select
                        value={filterPlan}
                        onChange={(e) => setFilterPlan(e.target.value)}
                        className={`admin-toolbar__select ${filterPlan !== 'all' ? 'admin-toolbar__select--active' : ''}`}
                    >
                        <option value="all">Plan: Todos</option>
                        {uniquePlans.map((p) => (
                            <option key={p} value={p}>{p}</option>
                        ))}
                    </select>

                    {/* Mode/Type */}
                    <select
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                        className={`admin-toolbar__select ${filterType !== 'all' ? 'admin-toolbar__select--active' : ''}`}
                    >
                        <option value="all">Modo: Todos</option>
                        {uniqueTypes.map((t) => (
                            <option key={t} value={t}>{TYPE_LABELS[t] || t}</option>
                        ))}
                    </select>

                    {/* Expiry */}
                    <select
                        value={filterExpiry}
                        onChange={(e) => setFilterExpiry(Number(e.target.value))}
                        className={`admin-toolbar__select ${filterExpiry > 0 ? 'admin-toolbar__select--active' : ''}`}
                    >
                        <option value={0}>Vence en: —</option>
                        {EXPIRY_OPTIONS.filter(o => o.value > 0).map((o) => (
                            <option key={o.value} value={o.value}>Vence en {o.label}</option>
                        ))}
                    </select>

                    {/* Divider */}
                    <div className="admin-toolbar__divider" />

                    {/* Sort */}
                    <div className="admin-toolbar__sort">
                        <IconSort />
                        <select
                            value={sortField}
                            onChange={(e) => setSortField(e.target.value as SortField)}
                            className="admin-toolbar__select admin-toolbar__select--sort"
                        >
                            {SORT_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                        </select>
                        <button
                            className="admin-toolbar__sort-dir"
                            onClick={() => setSortDir((d) => d === 'asc' ? 'desc' : 'asc')}
                            title={sortDir === 'asc' ? 'Ascendente' : 'Descendente'}
                        >
                            {sortDir === 'asc' ? '↑' : '↓'}
                        </button>
                    </div>

                    {/* Clear filters */}
                    {activeFilters > 0 && (
                        <button className="admin-toolbar__clear" onClick={clearFilters}>
                            Limpiar filtros ({activeFilters})
                        </button>
                    )}
                </div>
            </div>

            {/* Toast messages */}
            {message && (
                <div className={`admin-toast admin-toast--${message.type}`}>
                    {message.text}
                </div>
            )}

            {/* Business list */}
            <div className="admin-biz-list">
                {filteredBusinesses.map((biz) => (
                    <div key={biz.id} className="admin-biz-card">
                        <div className="admin-biz-card__inner">
                            {/* Left: info */}
                            <div className="admin-biz-card__info">
                                <div className="admin-biz-card__header">
                                    <h3 className="admin-biz-card__name">{biz.name}</h3>
                                    <span className={`admin-badge admin-badge--${biz.sub_status || 'none'}`}>
                                        {STATUS_LABELS[biz.sub_status || ''] || 'Sin plan'}
                                    </span>
                                </div>

                                <div className="admin-biz-card__meta">
                                    <span className="admin-biz-card__meta-item">
                                        <IconUser />
                                        {biz.owner_email || 'Sin owner'}
                                    </span>
                                    <span className="admin-biz-card__meta-item">
                                        <IconStore />
                                        {TYPE_LABELS[biz.type] || biz.type}
                                    </span>
                                    <span className="admin-biz-card__meta-item">
                                        <IconCalendar />
                                        {formatDate(biz.created_at)}
                                    </span>
                                    {biz.plan_code && (
                                        <span className="admin-biz-card__meta-item">
                                            <IconPlan />
                                            {biz.plan_code}
                                        </span>
                                    )}
                                    {biz.trial_end && biz.sub_status === 'trialing' && (
                                        <span className="admin-biz-card__meta-item">
                                            <IconClock />
                                            Vence: {formatDate(biz.trial_end)}
                                        </span>
                                    )}
                                    {biz.current_period_end && biz.sub_status === 'active' && (
                                        <span className="admin-biz-card__meta-item">
                                            <IconClock />
                                            Hasta: {formatDate(biz.current_period_end)}
                                        </span>
                                    )}
                                </div>

                                <div className="admin-biz-card__limits">
                                    <span>{biz.limits_products} productos</span>
                                    <span>{biz.limits_orders_day} órdenes/día</span>
                                    <span>{biz.limits_users} usuarios</span>
                                </div>
                            </div>

                            {/* Right: plan actions */}
                            <div className="admin-biz-card__actions">
                                {plans.map((plan) => {
                                    const isCurrent = biz.plan_code === plan.slug
                                    return (
                                        <button
                                            key={plan.slug}
                                            onClick={() => handleAssignPlan(biz.id, plan.slug)}
                                            disabled={actionLoading === biz.id || isCurrent}
                                            className={`admin-plan-btn ${isCurrent ? 'admin-plan-btn--current' : ''}`}
                                        >
                                            {isCurrent && <IconCheck />}
                                            {plan.name}
                                            <span className="admin-plan-btn__price">
                                                ${plan.price}/{plan.billing_interval === 'annual' ? 'año' : 'mes'}
                                            </span>
                                        </button>
                                    )
                                })}
                                {biz.sub_status && biz.sub_status !== 'canceled' && (
                                    <button
                                        onClick={() => openUnassignModal(biz.id, biz.name)}
                                        disabled={actionLoading === biz.id}
                                        className="admin-plan-btn admin-plan-btn--danger"
                                    >
                                        <IconXMark />
                                        Desasignar
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                ))}

                {filteredBusinesses.length === 0 && businesses.length > 0 && (
                    <div className="admin-empty">
                        <IconSearch />
                        <div style={{ marginTop: '0.5rem' }}>No se encontraron negocios con los filtros actuales.</div>
                        <button className="admin-toolbar__clear" onClick={clearFilters} style={{ marginTop: '0.75rem' }}>
                            Limpiar filtros
                        </button>
                    </div>
                )}

                {businesses.length === 0 && (
                    <div className="admin-empty">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                            <path fillRule="evenodd" d="M7.5 5.25a3 3 0 013-3h3a3 3 0 013 3v.205c.933.085 1.857.197 2.774.334 1.454.218 2.476 1.483 2.476 2.917v3.033c0 1.211-.734 2.352-1.936 2.752A24.726 24.726 0 0112 15.75c-2.73 0-5.357-.442-7.814-1.259-1.202-.4-1.936-1.541-1.936-2.752V8.706c0-1.434 1.022-2.7 2.476-2.917A48.814 48.814 0 017.5 5.455V5.25zm7.5 0v.09a49.488 49.488 0 00-6 0v-.09a1.5 1.5 0 011.5-1.5h3a1.5 1.5 0 011.5 1.5zm-3 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
                            <path d="M3 18.4v-2.796a4.3 4.3 0 00.713.31A26.226 26.226 0 0012 17.25c2.892 0 5.68-.468 8.287-1.335.252-.084.49-.189.713-.311V18.4c0 1.452-1.047 2.728-2.523 2.923-2.12.282-4.282.427-6.477.427a49.19 49.19 0 01-6.477-.427C4.047 21.128 3 19.852 3 18.4z" />
                        </svg>
                        No hay negocios registrados.
                    </div>
                )}
            </div>

            {/* Confirmation Modal */}
            {confirmModal && (
                <div className="admin-modal-backdrop" onClick={() => setConfirmModal(null)}>
                    <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="admin-modal__icon admin-modal__icon--danger">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                <path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
                            </svg>
                        </div>
                        <h3 className="admin-modal__title">Desasignar plan</h3>
                        <p className="admin-modal__text">
                            ¿Estás seguro de desasignar el plan de <strong>{confirmModal.businessName}</strong>?
                            Esto cancelará su suscripción activa.
                        </p>
                        <div className="admin-modal__actions">
                            <button
                                className="admin-modal__btn admin-modal__btn--cancel"
                                onClick={() => setConfirmModal(null)}
                            >
                                Cancelar
                            </button>
                            <button
                                className="admin-modal__btn admin-modal__btn--confirm"
                                onClick={executeUnassign}
                            >
                                Sí, desasignar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
