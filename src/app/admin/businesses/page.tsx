'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Business {
    id: string
    name: string
    type: string
    created_at: string
    deleted_at: string | null
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
    usage_products: number
    usage_orders_day: number
    usage_users: number
    last_activity: string | null
}

interface Plan {
    slug: string
    name: string
    price: number
    billing_interval: string
}

interface DrawerData {
    business: {
        id: string; name: string; type: string; operation_mode: string;
        created_at: string; limits_products: number; limits_orders_day: number;
        limits_users: number; limits_storage_mb: number;
        default_keep_float_amount: number; cash_difference_threshold: number;
    }
    subscription: {
        id: string; status: string; plan_code: string; plan_name: string;
        price: number; billing_interval: string; trial_end: string | null;
        period_start: string; period_end: string | null; notes: string | null;
        admin_assigned: boolean; created_at: string; updated_at: string;
        scheduled_plan_slug: string | null; scheduled_plan_at: string | null;
    } | null
    owner: { email: string; user_id: string } | null
    members_count: number
    audit_logs: {
        action: string; entity: string; entity_id: string;
        metadata: Record<string, unknown>; created_at: string; actor_email: string;
    }[]
}

type SortField = 'created_at' | 'period_end' | 'mrr' | 'name'
type SortDir = 'asc' | 'desc'
type DrawerTab = 'subscription' | 'limits' | 'activity' | 'operation' | 'actions'

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

const IconClose = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
        <path fillRule="evenodd" d="M5.47 5.47a.75.75 0 011.06 0L12 10.94l5.47-5.47a.75.75 0 111.06 1.06L13.06 12l5.47 5.47a.75.75 0 11-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 01-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 010-1.06z" clipRule="evenodd" />
    </svg>
)

const STATUS_LABELS: Record<string, string> = {
    trialing: 'Trial',
    active: 'Activo',
    past_due: 'Vencido',
    expired: 'Expirado',
    canceled: 'Cancelado',
    suspended: 'Suspendido',
}

const STATUS_COLORS: Record<string, string> = {
    trialing: '#f59e0b',
    active: '#22c55e',
    suspended: '#ef4444',
    past_due: '#f97316',
    expired: '#dc2626',
    canceled: '#6b7280',
}

// --- Usage bar color helper ---
const getUsageColor = (used: number, limit: number): string => {
    if (limit <= 0) return '#8b7ee0'
    const pct = (used / limit) * 100
    if (pct >= 90) return '#ef4444' // Red — at limit
    if (pct >= 70) return '#f59e0b' // Amber — getting close
    return '#8b7ee0'               // Normal purple
}

// --- Upsell signal helper ---
type UpsellSignal = 'at_limit' | 'ready_upsell' | null
const getUpsellSignal = (biz: Business): UpsellSignal => {
    const pPct = biz.limits_products > 0 ? biz.usage_products / biz.limits_products : 0
    const oPct = biz.limits_orders_day > 0 ? biz.usage_orders_day / biz.limits_orders_day : 0
    const uPct = biz.limits_users > 0 ? biz.usage_users / biz.limits_users : 0
    if (pPct >= 0.95 || oPct >= 0.95 || uPct >= 0.95) return 'at_limit'
    if (pPct >= 0.7 || oPct >= 0.7) return 'ready_upsell'
    return null
}

// --- Relative time helper ---
const timeAgo = (date: string): string => {
    const now = new Date()
    const d = new Date(date)
    const diffMs = now.getTime() - d.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    if (diffMin < 1) return 'ahora'
    if (diffMin < 60) return `hace ${diffMin}m`
    const diffH = Math.floor(diffMin / 60)
    if (diffH < 24) return `hace ${diffH}h`
    const diffD = Math.floor(diffH / 24)
    if (diffD < 30) return `hace ${diffD}d`
    const diffMo = Math.floor(diffD / 30)
    return `hace ${diffMo}mo`
}

// --- Subscription-related actions for timeline ---
const SUB_ACTIONS = new Set([
    'assign_plan', 'unassign_plan', 'extend_trial',
    'suspend_business', 'unsuspend_business',
    'schedule_plan_change', 'cancel_scheduled_change',
])

const TIMELINE_ICONS: Record<string, string> = {
    assign_plan: '📋',
    unassign_plan: '🚫',
    extend_trial: '⏳',
    suspend_business: '🔒',
    unsuspend_business: '🔓',
    schedule_plan_change: '📅',
    cancel_scheduled_change: '❌',
}

const TIMELINE_COLORS: Record<string, string> = {
    assign_plan: '#6c5ce7',
    unassign_plan: '#ef4444',
    extend_trial: '#f59e0b',
    suspend_business: '#ef4444',
    unsuspend_business: '#22c55e',
    schedule_plan_change: '#3b82f6',
    cancel_scheduled_change: '#6b7280',
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
    taqueria: 'Taquería',
    pizzeria: 'Pizzería',
    cafeteria: 'Cafetería',
    other: 'Otro',
}

const MODE_LABELS: Record<string, string> = {
    counter: 'Mostrador',
    restaurant: 'Restaurante',
}

const TAB_ITEMS: { key: DrawerTab; label: string }[] = [
    { key: 'subscription', label: 'Suscripción' },
    { key: 'limits', label: 'Límites' },
    { key: 'activity', label: 'Actividad' },
    { key: 'operation', label: 'Operación' },
    { key: 'actions', label: 'Acciones' },
]

const ACTION_LABELS: Record<string, string> = {
    create: 'Creación',
    update: 'Actualización',
    delete: 'Eliminación',
    close_register: 'Cierre de caja',
    open_register: 'Apertura de caja',
    auto_sale: 'Venta automática',
    refund_payment: 'Reembolso',
    assign_plan: 'Plan asignado',
    unassign_plan: 'Plan desasignado',
    extend_trial: 'Trial extendido',
    suspend_business: 'Negocio suspendido',
    unsuspend_business: 'Negocio reactivado',
    schedule_plan_change: 'Cambio programado',
    cancel_scheduled_change: 'Cambio cancelado',
    delete_business: 'Negocio eliminado',
    restore_business: 'Negocio restaurado',
}

// Confirmation modal types
interface ActionModal {
    type: 'assign' | 'unassign' | 'extend_trial' | 'suspend' | 'unsuspend' | 'schedule_change' | 'delete' | 'restore'
    businessId: string
    businessName: string
    planSlug?: string
    planName?: string
    planPrice?: number
    extraDays?: number
    warning: string
    requiresNote: boolean
    confirmLabel?: string
    membersCount?: number
}

interface UndoToast {
    message: string
    businessId: string
    previousPlanSlug: string | null
    secondsLeft: number
}

export default function AdminBusinessesPage() {
    const [businesses, setBusinesses] = useState<Business[]>([])
    const [plans, setPlans] = useState<Plan[]>([])
    const [loading, setLoading] = useState(true)
    const [actionLoading, setActionLoading] = useState<string | null>(null)
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

    // Smart confirmation modal
    const [actionModal, setActionModal] = useState<ActionModal | null>(null)
    const [actionNote, setActionNote] = useState('')

    // Undo toast
    const [undoToast, setUndoToast] = useState<UndoToast | null>(null)
    const undoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const undoRevertRef = useRef<(() => Promise<void>) | null>(null)

    // Toolbar state
    const [search, setSearch] = useState('')
    const [filterStatus, setFilterStatus] = useState<string>('all')
    const [filterPlan, setFilterPlan] = useState<string>('all')
    const [filterType, setFilterType] = useState<string>('all')
    const [filterExpiry, setFilterExpiry] = useState<number>(0)
    const [sortField, setSortField] = useState<SortField>('created_at')
    const [sortDir, setSortDir] = useState<SortDir>('desc')
    const [showDeleted, setShowDeleted] = useState(false)

    // Drawer state
    const [drawerOpen, setDrawerOpen] = useState(false)
    const [drawerLoading, setDrawerLoading] = useState(false)
    const [drawerData, setDrawerData] = useState<DrawerData | null>(null)
    const [drawerTab, setDrawerTab] = useState<DrawerTab>('subscription')
    const [selectedBizId, setSelectedBizId] = useState<string | null>(null)

    // Delete confirmation state
    const [deleteConfirmName, setDeleteConfirmName] = useState('')

    const supabase = createClient()

    useEffect(() => { loadData() }, [])

    const loadData = async () => {
        const { data } = await supabase.rpc('admin_list_businesses', {
            p_include_deleted: showDeleted,
        })
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

    // Reload when showDeleted changes
    useEffect(() => { loadData() }, [showDeleted])

    const openDrawer = async (bizId: string) => {
        setSelectedBizId(bizId)
        setDrawerOpen(true)
        setDrawerLoading(true)
        setDrawerTab('subscription')
        setDrawerData(null)

        const { data } = await supabase.rpc('admin_get_business_detail', {
            p_business_id: bizId,
        })

        if (data?.success) {
            setDrawerData(data)
        }
        setDrawerLoading(false)
    }

    const closeDrawer = () => {
        setDrawerOpen(false)
        setSelectedBizId(null)
        setDrawerData(null)
    }

    // Filtering + Sorting (same as before)
    const filteredBusinesses = useMemo(() => {
        let result = [...businesses]
        if (search.trim()) {
            const q = search.toLowerCase()
            result = result.filter((b) =>
                b.name.toLowerCase().includes(q) ||
                (b.owner_email || '').toLowerCase().includes(q) ||
                b.id.toLowerCase().includes(q)
            )
        }
        if (filterStatus !== 'all') {
            result = result.filter((b) => (b.sub_status || 'none') === filterStatus)
        }
        if (filterPlan !== 'all') {
            result = result.filter((b) => b.plan_code === filterPlan)
        }
        if (filterType !== 'all') {
            result = result.filter((b) => b.type === filterType)
        }
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
        result.sort((a, b) => {
            let cmp = 0
            switch (sortField) {
                case 'created_at':
                    cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime(); break
                case 'period_end': {
                    const aEnd = a.trial_end || a.current_period_end || ''
                    const bEnd = b.trial_end || b.current_period_end || ''
                    cmp = (aEnd ? new Date(aEnd).getTime() : 0) - (bEnd ? new Date(bEnd).getTime() : 0); break
                }
                case 'mrr':
                    cmp = (a.plan_price || 0) - (b.plan_price || 0); break
                case 'name':
                    cmp = a.name.localeCompare(b.name); break
            }
            return sortDir === 'desc' ? -cmp : cmp
        })
        return result
    }, [businesses, search, filterStatus, filterPlan, filterType, filterExpiry, sortField, sortDir])

    // CSV export
    const exportCSV = () => {
        const headers = ['Nombre', 'Owner', 'Tipo', 'Estado', 'Plan', 'Precio', 'Creado', 'Vence/Hasta', 'Productos', 'Órdenes/día', 'Usuarios']
        const rows = filteredBusinesses.map((b) => [
            b.name, b.owner_email || '', TYPE_LABELS[b.type] || b.type,
            STATUS_LABELS[b.sub_status || ''] || 'Sin plan', b.plan_code || '',
            b.plan_price?.toString() || '0', formatDate(b.created_at),
            formatDate(b.trial_end || b.current_period_end),
            b.limits_products.toString(), b.limits_orders_day.toString(), b.limits_users.toString(),
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

    // ======= Safe Action Helpers =======

    // Build smart warning message based on context
    const buildWarning = (type: 'assign' | 'unassign', biz: Business, plan?: Plan): string => {
        if (type === 'unassign') {
            return `Esto cancelará la suscripción de "${biz.name}" y podría bloquear funcionalidades activas del negocio (productos, órdenes, usuarios).`
        }
        // Assign — check if downgrade
        if (plan && biz.plan_price && plan.price < biz.plan_price) {
            return `Estás cambiando a un plan de menor precio ($${plan.price} vs $${biz.plan_price}). Esto cambiará los límites y podría bloquear funciones que excedan el nuevo plan.`
        }
        if (plan && (plan.slug.includes('premium'))) {
            return `Vas a activar Premium para "${biz.name}". Esto aplicará nuevos límites y el negocio tendrá acceso completo.`
        }
        return `Esto cambiará el plan y los límites de "${biz.name}". Cualquier funcionalidad que exceda los nuevos límites se verá afectada.`
    }

    // Determine if note is required
    const isNoteRequired = (type: 'assign' | 'unassign', planSlug?: string): boolean => {
        if (type === 'unassign') return true
        if (planSlug?.includes('premium')) return true
        return false
    }

    // Open smart confirmation modal for assigning
    const requestAssignPlan = (businessId: string, plan: Plan) => {
        const biz = businesses.find((b) => b.id === businessId)
        if (!biz) return
        setActionNote('')
        setActionModal({
            type: 'assign',
            businessId,
            businessName: biz.name,
            planSlug: plan.slug,
            planName: plan.name,
            planPrice: plan.price,
            warning: buildWarning('assign', biz, plan),
            requiresNote: isNoteRequired('assign', plan.slug),
        })
    }

    // Open smart confirmation modal for unassigning
    const requestUnassignPlan = (businessId: string, businessName: string) => {
        const biz = businesses.find((b) => b.id === businessId)
        if (!biz) return
        setActionNote('')
        setActionModal({
            type: 'unassign',
            businessId,
            businessName,
            warning: buildWarning('unassign', biz),
            requiresNote: true,
        })
    }

    // Extend trial
    const requestExtendTrial = (businessId: string, businessName: string, days: number) => {
        setActionNote('')
        setActionModal({
            type: 'extend_trial',
            businessId,
            businessName,
            extraDays: days,
            warning: `Se extenderá el trial de "${businessName}" por ${days} días. El negocio mantendrá acceso completo durante ese tiempo.`,
            requiresNote: true,
            confirmLabel: `Sí, extender ${days} días`,
        })
    }

    // Suspend
    const requestSuspend = (businessId: string, businessName: string) => {
        setActionNote('')
        setActionModal({
            type: 'suspend',
            businessId,
            businessName,
            warning: `Vas a SUSPENDER el acceso de "${businessName}". El negocio no podrá operar hasta que se reactive manualmente.`,
            requiresNote: true,
            confirmLabel: 'Sí, suspender',
        })
    }

    // Unsuspend
    const requestUnsuspend = (businessId: string, businessName: string) => {
        setActionNote('')
        setActionModal({
            type: 'unsuspend',
            businessId,
            businessName,
            warning: `Se reactivará "${businessName}". El estado se restaurará según sus fechas de suscripción.`,
            requiresNote: false,
            confirmLabel: 'Sí, reactivar',
        })
    }

    // Schedule plan change
    const requestScheduleChange = (businessId: string, businessName: string, plan: Plan) => {
        setActionNote('')
        setActionModal({
            type: 'schedule_change',
            businessId,
            businessName,
            planSlug: plan.slug,
            planName: plan.name,
            planPrice: plan.price,
            warning: `El cambio a "${plan.name}" se aplicará al final del periodo actual, sin interrumpir el servicio.`,
            requiresNote: false,
            confirmLabel: `Programar cambio a ${plan.name}`,
        })
    }

    // Cancel scheduled change (direct, no modal needed)
    const cancelScheduledChange = async (businessId: string) => {
        setActionLoading(businessId)
        setMessage(null)
        const { data } = await supabase.rpc('admin_cancel_scheduled_change', {
            p_business_id: businessId,
        })
        if (data?.success) {
            setMessage({ type: 'success', text: data.message })
            loadData()
            if (selectedBizId === businessId) openDrawer(businessId)
        } else {
            setMessage({ type: 'error', text: data?.message || 'Error desconocido' })
        }
        setActionLoading(null)
    }

    // Delete business (danger zone — double confirmation)
    const requestDeleteBusiness = (businessId: string, businessName: string) => {
        const biz = businesses.find((b) => b.id === businessId)
        if (!biz) return
        setActionNote('')
        setDeleteConfirmName('')
        setActionModal({
            type: 'delete',
            businessId,
            businessName,
            warning: `Esto ELIMINARÁ "${businessName}" permanentemente. Se desactivarán todos los usuarios, se cancelará la suscripción y se bloqueará el acceso al sistema.`,
            requiresNote: true,
            confirmLabel: 'Eliminar negocio',
            membersCount: biz.usage_users,
        })
    }

    // Restore business
    const requestRestoreBusiness = (businessId: string, businessName: string) => {
        setActionNote('')
        setActionModal({
            type: 'restore',
            businessId,
            businessName,
            warning: `Se restaurará "${businessName}". Se reactivarán las membresías desactivadas por eliminación y se restaurará la suscripción según las fechas vigentes.`,
            requiresNote: false,
            confirmLabel: 'Restaurar negocio',
        })
    }

    // Clear undo timer
    const clearUndoTimer = useCallback(() => {
        if (undoTimerRef.current) {
            clearInterval(undoTimerRef.current)
            undoTimerRef.current = null
        }
        undoRevertRef.current = null
        setUndoToast(null)
    }, [])

    // Start undo countdown
    const startUndoTimer = useCallback((message: string, businessId: string, previousPlanSlug: string | null, revertFn: () => Promise<void>) => {
        clearUndoTimer()
        undoRevertRef.current = revertFn
        setUndoToast({ message, businessId, previousPlanSlug, secondsLeft: 10 })

        undoTimerRef.current = setInterval(() => {
            setUndoToast((prev) => {
                if (!prev || prev.secondsLeft <= 1) {
                    clearUndoTimer()
                    return null
                }
                return { ...prev, secondsLeft: prev.secondsLeft - 1 }
            })
        }, 1000)
    }, [clearUndoTimer])

    // Execute undo (revert)
    const handleUndo = useCallback(async () => {
        const revert = undoRevertRef.current
        clearUndoTimer()
        if (revert) {
            await revert()
        }
    }, [clearUndoTimer])

    // Execute confirmed action
    const executeAction = async () => {
        if (!actionModal) return
        if (actionModal.requiresNote && !actionNote.trim()) return

        const { type, businessId, planSlug } = actionModal
        const previousPlan = businesses.find((b) => b.id === businessId)?.plan_code || null
        const note = actionNote.trim() || 'Acción desde admin panel'

        setActionModal(null)
        setActionNote('')
        setActionLoading(businessId)
        setMessage(null)

        if (type === 'assign' && planSlug) {
            const { data } = await supabase.rpc('admin_assign_plan', {
                p_business_id: businessId,
                p_plan_slug: planSlug,
                p_notes: note,
            })
            if (data?.success) {
                setMessage({ type: 'success', text: data.message })
                loadData()
                if (selectedBizId === businessId) openDrawer(businessId)

                // Start undo timer — revert = reassign previous plan or unassign
                const bizName = actionModal.businessName
                startUndoTimer(
                    `Plan asignado a ${bizName}`,
                    businessId,
                    previousPlan,
                    async () => {
                        if (previousPlan) {
                            await supabase.rpc('admin_assign_plan', {
                                p_business_id: businessId,
                                p_plan_slug: previousPlan,
                                p_notes: `Undo: revertido desde ${planSlug} a ${previousPlan}`,
                            })
                        } else {
                            await supabase.rpc('admin_unassign_plan', {
                                p_business_id: businessId,
                                p_notes: `Undo: revertido (se removió ${planSlug})`,
                            })
                        }
                        setMessage({ type: 'success', text: 'Acción revertida correctamente' })
                        loadData()
                        if (selectedBizId === businessId) openDrawer(businessId)
                    }
                )
            } else {
                setMessage({ type: 'error', text: data?.message || 'Error desconocido' })
            }
        }

        if (type === 'unassign') {
            const { data } = await supabase.rpc('admin_unassign_plan', {
                p_business_id: businessId,
                p_notes: note,
            })
            if (data?.success) {
                setMessage({ type: 'success', text: data.message })
                loadData()
                if (selectedBizId === businessId) openDrawer(businessId)

                // Start undo timer — revert = reassign previous plan
                if (previousPlan) {
                    const bizName = actionModal.businessName
                    startUndoTimer(
                        `Plan desasignado de ${bizName}`,
                        businessId,
                        previousPlan,
                        async () => {
                            await supabase.rpc('admin_assign_plan', {
                                p_business_id: businessId,
                                p_plan_slug: previousPlan,
                                p_notes: `Undo: re-asignado ${previousPlan}`,
                            })
                            setMessage({ type: 'success', text: 'Acción revertida correctamente' })
                            loadData()
                            if (selectedBizId === businessId) openDrawer(businessId)
                        }
                    )
                }
            } else {
                setMessage({ type: 'error', text: data?.message || 'Error desconocido' })
            }
        }

        // Extend trial
        if (type === 'extend_trial' && actionModal.extraDays) {
            const { data } = await supabase.rpc('admin_extend_trial', {
                p_business_id: businessId,
                p_days: actionModal.extraDays,
                p_notes: note,
            })
            if (data?.success) {
                setMessage({ type: 'success', text: data.message })
                loadData()
                if (selectedBizId === businessId) openDrawer(businessId)
            } else {
                setMessage({ type: 'error', text: data?.message || 'Error desconocido' })
            }
        }

        // Suspend
        if (type === 'suspend') {
            const { data } = await supabase.rpc('admin_suspend_business', {
                p_business_id: businessId,
                p_notes: note,
            })
            if (data?.success) {
                setMessage({ type: 'success', text: data.message })
                loadData()
                if (selectedBizId === businessId) openDrawer(businessId)
            } else {
                setMessage({ type: 'error', text: data?.message || 'Error desconocido' })
            }
        }

        // Unsuspend
        if (type === 'unsuspend') {
            const { data } = await supabase.rpc('admin_unsuspend_business', {
                p_business_id: businessId,
                p_notes: note,
            })
            if (data?.success) {
                setMessage({ type: 'success', text: data.message })
                loadData()
                if (selectedBizId === businessId) openDrawer(businessId)
            } else {
                setMessage({ type: 'error', text: data?.message || 'Error desconocido' })
            }
        }

        // Schedule plan change
        if (type === 'schedule_change' && planSlug) {
            const { data } = await supabase.rpc('admin_schedule_plan_change', {
                p_business_id: businessId,
                p_plan_slug: planSlug,
                p_notes: note,
            })
            if (data?.success) {
                setMessage({ type: 'success', text: data.message })
                loadData()
                if (selectedBizId === businessId) openDrawer(businessId)
            } else {
                setMessage({ type: 'error', text: data?.message || 'Error desconocido' })
            }
        }

        // Delete business
        if (type === 'delete') {
            const { data } = await supabase.rpc('admin_delete_business', {
                p_business_id: businessId,
                p_notes: note,
            })
            if (data?.success) {
                setMessage({ type: 'success', text: data.message })
                closeDrawer()
                loadData()
            } else {
                setMessage({ type: 'error', text: data?.message || 'Error desconocido' })
            }
        }

        // Restore business
        if (type === 'restore') {
            const { data } = await supabase.rpc('admin_restore_business', {
                p_business_id: businessId,
                p_notes: note || 'Restaurado desde admin panel',
            })
            if (data?.success) {
                setMessage({ type: 'success', text: data.message })
                closeDrawer()
                loadData()
            } else {
                setMessage({ type: 'error', text: data?.message || 'Error desconocido' })
            }
        }

        setActionLoading(null)
    }

    // Cleanup timer on unmount
    useEffect(() => {
        return () => { if (undoTimerRef.current) clearInterval(undoTimerRef.current) }
    }, [])

    const formatDate = (d: string | null) => {
        if (!d) return '—'
        return new Date(d).toLocaleDateString('es-MX', {
            day: 'numeric', month: 'short', year: 'numeric',
        })
    }

    const formatDateTime = (d: string | null) => {
        if (!d) return '—'
        return new Date(d).toLocaleString('es-MX', {
            day: 'numeric', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
        })
    }

    const uniqueTypes = useMemo(() => Array.from(new Set(businesses.map((b) => b.type))), [businesses])
    const uniquePlans = useMemo(() => Array.from(new Set(businesses.map((b) => b.plan_code).filter(Boolean) as string[])), [businesses])

    const activeFilters = [
        filterStatus !== 'all', filterPlan !== 'all', filterType !== 'all',
        filterExpiry > 0, search.trim() !== '',
    ].filter(Boolean).length

    const clearFilters = () => {
        setSearch(''); setFilterStatus('all'); setFilterPlan('all')
        setFilterType('all'); setFilterExpiry(0)
        setSortField('created_at'); setSortDir('desc')
    }

    // Get business data for drawer actions
    const selectedBiz = businesses.find((b) => b.id === selectedBizId)

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
                    <span className="admin-page-title__count">
                        ({filteredBusinesses.length}{filteredBusinesses.length !== businesses.length ? ` de ${businesses.length}` : ''})
                    </span>
                </h2>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <button
                        className={`admin-toolbar__select ${showDeleted ? 'admin-toolbar__select--active' : ''}`}
                        onClick={() => setShowDeleted(!showDeleted)}
                        style={{ cursor: 'pointer', padding: '0.4rem 0.8rem', borderRadius: '8px', border: '1px solid var(--admin-border)', background: showDeleted ? '#fef2f2' : 'transparent', color: showDeleted ? '#dc2626' : 'inherit', fontSize: '0.8rem', fontWeight: 500 }}
                    >
                        Papelera
                    </button>
                    <button className="admin-export-btn" onClick={exportCSV}>
                        <IconDownload />
                        Exportar CSV
                    </button>
                </div>
            </div>

            {/* Operator Toolbar */}
            <div className="admin-toolbar">
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
                <div className="admin-toolbar__filters">
                    <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
                        className={`admin-toolbar__select ${filterStatus !== 'all' ? 'admin-toolbar__select--active' : ''}`}>
                        <option value="all">Estado: Todos</option>
                        <option value="trialing">Trial</option>
                        <option value="active">Activo</option>
                        <option value="expired">Vencido</option>
                        <option value="past_due">Pago pendiente</option>
                        <option value="canceled">Cancelado</option>
                        <option value="none">Sin plan</option>
                    </select>
                    <select value={filterPlan} onChange={(e) => setFilterPlan(e.target.value)}
                        className={`admin-toolbar__select ${filterPlan !== 'all' ? 'admin-toolbar__select--active' : ''}`}>
                        <option value="all">Plan: Todos</option>
                        {uniquePlans.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
                        className={`admin-toolbar__select ${filterType !== 'all' ? 'admin-toolbar__select--active' : ''}`}>
                        <option value="all">Modo: Todos</option>
                        {uniqueTypes.map((t) => <option key={t} value={t}>{TYPE_LABELS[t] || t}</option>)}
                    </select>
                    <select value={filterExpiry} onChange={(e) => setFilterExpiry(Number(e.target.value))}
                        className={`admin-toolbar__select ${filterExpiry > 0 ? 'admin-toolbar__select--active' : ''}`}>
                        <option value={0}>Vence en: —</option>
                        <option value={7}>Vence en 7 días</option>
                        <option value={15}>Vence en 15 días</option>
                        <option value={30}>Vence en 30 días</option>
                    </select>
                    <div className="admin-toolbar__divider" />
                    <div className="admin-toolbar__sort">
                        <IconSort />
                        <select value={sortField} onChange={(e) => setSortField(e.target.value as SortField)}
                            className="admin-toolbar__select admin-toolbar__select--sort">
                            {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                        <button className="admin-toolbar__sort-dir"
                            onClick={() => setSortDir((d) => d === 'asc' ? 'desc' : 'asc')}
                            title={sortDir === 'asc' ? 'Ascendente' : 'Descendente'}>
                            {sortDir === 'asc' ? '↑' : '↓'}
                        </button>
                    </div>
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

            {/* Business list — simplified cards, click to open drawer */}
            <div className="admin-biz-list">
                {filteredBusinesses.map((biz) => (
                    <div
                        key={biz.id}
                        className={`admin-biz-card ${selectedBizId === biz.id ? 'admin-biz-card--selected' : ''}`}
                        onClick={() => openDrawer(biz.id)}
                        style={{ cursor: 'pointer' }}
                    >
                        <div className="admin-biz-card__inner">
                            <div className="admin-biz-card__info">
                                <div className="admin-biz-card__header">
                                    <h3 className="admin-biz-card__name">{biz.name}</h3>
                                    {biz.deleted_at ? (
                                        <span className="admin-badge" style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>
                                            ELIMINADO
                                        </span>
                                    ) : (
                                        <span className={`admin-badge admin-badge--${biz.sub_status || 'none'}`}>
                                            {STATUS_LABELS[biz.sub_status || ''] || 'Sin plan'}
                                        </span>
                                    )}
                                </div>
                                <div className="admin-biz-card__meta">
                                    <span className="admin-biz-card__meta-item">
                                        <IconUser /> {biz.owner_email || 'Sin owner'}
                                    </span>
                                    <span className="admin-biz-card__meta-item">
                                        <IconStore /> {TYPE_LABELS[biz.type] || biz.type}
                                    </span>
                                    <span className="admin-biz-card__meta-item">
                                        <IconCalendar /> {formatDate(biz.created_at)}
                                    </span>
                                    {biz.plan_code && (
                                        <span className="admin-biz-card__meta-item">
                                            <IconPlan /> {biz.plan_code}
                                        </span>
                                    )}
                                    {biz.trial_end && biz.sub_status === 'trialing' && (
                                        <span className="admin-biz-card__meta-item">
                                            <IconClock /> Vence: {formatDate(biz.trial_end)}
                                        </span>
                                    )}
                                    {biz.current_period_end && biz.sub_status === 'active' && (
                                        <span className="admin-biz-card__meta-item">
                                            <IconClock /> Hasta: {formatDate(biz.current_period_end)}
                                        </span>
                                    )}
                                </div>

                                {/* SaaS Insights: MRR & Activity + Upsell signal */}
                                <div className="admin-biz-card__insights">
                                    <div className="admin-insight-item">
                                        <span className="admin-insight-label">MRR</span>
                                        <span className="admin-insight-value">
                                            {biz.plan_price ? `$${biz.plan_price}` : '$0'}
                                        </span>
                                    </div>
                                    <div className="admin-insight-item">
                                        <span className="admin-insight-label">Actividad</span>
                                        <span className="admin-insight-value" title={biz.last_activity ? formatDateTime(biz.last_activity) : ''}>
                                            {biz.last_activity ? timeAgo(biz.last_activity) : '—'}
                                        </span>
                                    </div>
                                    {(() => {
                                        const signal = getUpsellSignal(biz)
                                        if (signal === 'at_limit') return (
                                            <span className="admin-upsell-badge admin-upsell-badge--limit" title="Al menos un recurso al 95%+">
                                                🔥 Al límite
                                            </span>
                                        )
                                        if (signal === 'ready_upsell') return (
                                            <span className="admin-upsell-badge admin-upsell-badge--ready" title="Uso alto, listo para upgrade">
                                                ⬆️ Upsell
                                            </span>
                                        )
                                        return null
                                    })()}
                                </div>

                                {/* Usage Bars — color-coded */}
                                <div className="admin-biz-card__usage">
                                    {/* Products */}
                                    <div className="admin-usage-item">
                                        <div className="admin-usage-header">
                                            <span>Prod</span>
                                            <span>{biz.usage_products}/{biz.limits_products}</span>
                                        </div>
                                        <div className="admin-usage-bar">
                                            <div
                                                className="admin-usage-fill"
                                                style={{
                                                    width: `${Math.min((biz.usage_products / biz.limits_products) * 100, 100)}%`,
                                                    background: getUsageColor(biz.usage_products, biz.limits_products),
                                                }}
                                            />
                                        </div>
                                    </div>
                                    {/* Orders */}
                                    <div className="admin-usage-item">
                                        <div className="admin-usage-header">
                                            <span>Ventas/día</span>
                                            <span>{biz.usage_orders_day}/{biz.limits_orders_day}</span>
                                        </div>
                                        <div className="admin-usage-bar">
                                            <div
                                                className="admin-usage-fill"
                                                style={{
                                                    width: `${Math.min((biz.usage_orders_day / biz.limits_orders_day) * 100, 100)}%`,
                                                    background: getUsageColor(biz.usage_orders_day, biz.limits_orders_day),
                                                }}
                                            />
                                        </div>
                                    </div>
                                    {/* Users */}
                                    <div className="admin-usage-item">
                                        <div className="admin-usage-header">
                                            <span>Usuarios</span>
                                            <span>{biz.usage_users}/{biz.limits_users}</span>
                                        </div>
                                        <div className="admin-usage-bar">
                                            <div
                                                className="admin-usage-fill"
                                                style={{
                                                    width: `${Math.min((biz.usage_users / biz.limits_users) * 100, 100)}%`,
                                                    background: getUsageColor(biz.usage_users, biz.limits_users),
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>
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

            {/* =================== DRAWER =================== */}
            {drawerOpen && (
                <>
                    <div className="admin-drawer-backdrop" onClick={closeDrawer} />
                    <div className="admin-drawer">
                        {/* Drawer header */}
                        <div className="admin-drawer__header">
                            <div>
                                <h3 className="admin-drawer__title">{selectedBiz?.name || 'Negocio'}</h3>
                                {selectedBiz && (
                                    <span className={`admin-badge admin-badge--${selectedBiz.sub_status || 'none'}`}>
                                        {STATUS_LABELS[selectedBiz.sub_status || ''] || 'Sin plan'}
                                    </span>
                                )}
                            </div>
                            <button className="admin-drawer__close" onClick={closeDrawer}>
                                <IconClose />
                            </button>
                        </div>

                        {/* Tabs */}
                        <div className="admin-drawer__tabs">
                            {TAB_ITEMS.map((tab) => (
                                <button
                                    key={tab.key}
                                    className={`admin-drawer__tab ${drawerTab === tab.key ? 'admin-drawer__tab--active' : ''}`}
                                    onClick={() => setDrawerTab(tab.key)}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {/* Tab content */}
                        <div className="admin-drawer__content">
                            {drawerLoading ? (
                                <div className="admin-loading" style={{ padding: '3rem' }}>
                                    <div className="admin-loading__spinner" />
                                    Cargando...
                                </div>
                            ) : drawerData ? (
                                <>
                                    {/* Suscripción tab */}
                                    {drawerTab === 'subscription' && (
                                        <div className="admin-drawer__section">
                                            {drawerData.subscription ? (
                                                <>
                                                    <div className="admin-detail-grid">
                                                        <div className="admin-detail-item">
                                                            <span className="admin-detail-label">Plan</span>
                                                            <span className="admin-detail-value">{drawerData.subscription.plan_name || drawerData.subscription.plan_code}</span>
                                                        </div>
                                                        <div className="admin-detail-item">
                                                            <span className="admin-detail-label">Estado</span>
                                                            <span className={`admin-badge admin-badge--${drawerData.subscription.status}`}>
                                                                {STATUS_LABELS[drawerData.subscription.status]}
                                                            </span>
                                                        </div>
                                                        <div className="admin-detail-item">
                                                            <span className="admin-detail-label">Precio</span>
                                                            <span className="admin-detail-value">${drawerData.subscription.price} MXN/{drawerData.subscription.billing_interval === 'annual' ? 'año' : drawerData.subscription.billing_interval === 'trial' ? 'trial' : 'mes'}</span>
                                                        </div>
                                                        <div className="admin-detail-item">
                                                            <span className="admin-detail-label">Asignado por admin</span>
                                                            <span className="admin-detail-value">{drawerData.subscription.admin_assigned ? 'Sí' : 'No (auto)'}</span>
                                                        </div>
                                                    </div>
                                                    <h4 className="admin-drawer__subtitle">Periodos</h4>
                                                    <div className="admin-detail-grid">
                                                        <div className="admin-detail-item">
                                                            <span className="admin-detail-label">Inicio período</span>
                                                            <span className="admin-detail-value">{formatDate(drawerData.subscription.period_start)}</span>
                                                        </div>
                                                        <div className="admin-detail-item">
                                                            <span className="admin-detail-label">Fin período</span>
                                                            <span className="admin-detail-value">{formatDate(drawerData.subscription.period_end)}</span>
                                                        </div>
                                                        {drawerData.subscription.trial_end && (
                                                            <div className="admin-detail-item">
                                                                <span className="admin-detail-label">Fin trial</span>
                                                                <span className="admin-detail-value">{formatDate(drawerData.subscription.trial_end)}</span>
                                                            </div>
                                                        )}
                                                        <div className="admin-detail-item">
                                                            <span className="admin-detail-label">Creado</span>
                                                            <span className="admin-detail-value">{formatDateTime(drawerData.subscription.created_at)}</span>
                                                        </div>
                                                        <div className="admin-detail-item">
                                                            <span className="admin-detail-label">Última actualización</span>
                                                            <span className="admin-detail-value">{formatDateTime(drawerData.subscription.updated_at)}</span>
                                                        </div>
                                                    </div>
                                                    {drawerData.subscription.notes && (
                                                        <>
                                                            <h4 className="admin-drawer__subtitle">Notas</h4>
                                                            <p className="admin-detail-notes">{drawerData.subscription.notes}</p>
                                                        </>
                                                    )}

                                                    {/* Subscription Timeline */}
                                                    {(() => {
                                                        const subLogs = drawerData.audit_logs.filter(l => SUB_ACTIONS.has(l.action))
                                                        if (subLogs.length === 0) return null
                                                        return (
                                                            <>
                                                                <h4 className="admin-drawer__subtitle">Historial de cambios</h4>
                                                                <div className="admin-sub-timeline">
                                                                    {subLogs.map((log, idx) => (
                                                                        <div key={idx} className="admin-timeline-item">
                                                                            <div className="admin-timeline-dot" style={{ background: TIMELINE_COLORS[log.action] || '#6b7280' }}>
                                                                                <span className="admin-timeline-icon">{TIMELINE_ICONS[log.action] || '•'}</span>
                                                                            </div>
                                                                            <div className="admin-timeline-body">
                                                                                <div className="admin-timeline-header">
                                                                                    <span className="admin-timeline-action">
                                                                                        {ACTION_LABELS[log.action] || log.action}
                                                                                    </span>
                                                                                    <span className="admin-timeline-time" title={formatDateTime(log.created_at)}>
                                                                                        {timeAgo(log.created_at)}
                                                                                    </span>
                                                                                </div>
                                                                                <div className="admin-timeline-actor">
                                                                                    {log.actor_email || 'Sistema'}
                                                                                </div>
                                                                                {log.metadata && (() => {
                                                                                    const meta = log.metadata as Record<string, unknown>
                                                                                    const notes = meta.notes as string | undefined
                                                                                    const details: string[] = []
                                                                                    if (meta.days_added) details.push(`+${meta.days_added} días`)
                                                                                    if (meta.new_trial_end) details.push(`hasta ${formatDate(meta.new_trial_end as string)}`)
                                                                                    if (meta.previous_status) details.push(`de: ${STATUS_LABELS[meta.previous_status as string] || meta.previous_status}`)
                                                                                    if (meta.restored_status) details.push(`a: ${STATUS_LABELS[meta.restored_status as string] || meta.restored_status}`)
                                                                                    if (meta.scheduled_plan) details.push(`→ ${meta.scheduled_plan}`)
                                                                                    if (meta.canceled_plan) details.push(`cancelado: ${meta.canceled_plan}`)
                                                                                    return (
                                                                                        <>
                                                                                            {details.length > 0 && (
                                                                                                <div className="admin-timeline-details">
                                                                                                    {details.join(' · ')}
                                                                                                </div>
                                                                                            )}
                                                                                            {notes && (
                                                                                                <div className="admin-timeline-note">
                                                                                                    💬 {notes}
                                                                                                </div>
                                                                                            )}
                                                                                        </>
                                                                                    )
                                                                                })()}
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </>
                                                        )
                                                    })()}
                                                </>
                                            ) : (
                                                <p className="admin-detail-empty">Sin suscripción activa.</p>
                                            )}
                                        </div>
                                    )}

                                    {/* Límites tab */}
                                    {drawerTab === 'limits' && (
                                        <div className="admin-drawer__section">
                                            <div className="admin-detail-grid">
                                                <div className="admin-detail-item">
                                                    <span className="admin-detail-label">Productos</span>
                                                    <span className="admin-detail-value admin-detail-value--lg">{drawerData.business.limits_products}</span>
                                                </div>
                                                <div className="admin-detail-item">
                                                    <span className="admin-detail-label">Órdenes/día</span>
                                                    <span className="admin-detail-value admin-detail-value--lg">{drawerData.business.limits_orders_day}</span>
                                                </div>
                                                <div className="admin-detail-item">
                                                    <span className="admin-detail-label">Usuarios</span>
                                                    <span className="admin-detail-value admin-detail-value--lg">{drawerData.business.limits_users}</span>
                                                </div>
                                                <div className="admin-detail-item">
                                                    <span className="admin-detail-label">Storage (MB)</span>
                                                    <span className="admin-detail-value admin-detail-value--lg">{drawerData.business.limits_storage_mb}</span>
                                                </div>
                                            </div>
                                            <h4 className="admin-drawer__subtitle">Configuración de caja</h4>
                                            <div className="admin-detail-grid">
                                                <div className="admin-detail-item">
                                                    <span className="admin-detail-label">Fondo fijo (keep float)</span>
                                                    <span className="admin-detail-value">${drawerData.business.default_keep_float_amount}</span>
                                                </div>
                                                <div className="admin-detail-item">
                                                    <span className="admin-detail-label">Umbral de diferencia</span>
                                                    <span className="admin-detail-value">${drawerData.business.cash_difference_threshold}</span>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Actividad tab */}
                                    {drawerTab === 'activity' && (
                                        <div className="admin-drawer__section">
                                            {drawerData.audit_logs.length > 0 ? (
                                                <div className="admin-audit-list">
                                                    {drawerData.audit_logs.map((log, idx) => (
                                                        <div key={idx} className="admin-audit-item">
                                                            <div className="admin-audit-item__header">
                                                                <span className="admin-audit-item__action">
                                                                    {ACTION_LABELS[log.action] || log.action}
                                                                </span>
                                                                <span className="admin-audit-item__entity">{log.entity}</span>
                                                            </div>
                                                            <div className="admin-audit-item__meta">
                                                                <span>{log.actor_email || 'Sistema'}</span>
                                                                <span>{formatDateTime(log.created_at)}</span>
                                                            </div>
                                                            {log.metadata && Object.keys(log.metadata).length > 0 && (
                                                                <div className="admin-audit-item__metadata">
                                                                    {Object.entries(log.metadata).slice(0, 4).map(([k, v]) => (
                                                                        <span key={k}>{k}: {String(v)}</span>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="admin-detail-empty">Sin actividad registrada.</p>
                                            )}
                                        </div>
                                    )}

                                    {/* Operación tab */}
                                    {drawerTab === 'operation' && (
                                        <div className="admin-drawer__section">
                                            <div className="admin-detail-grid">
                                                <div className="admin-detail-item">
                                                    <span className="admin-detail-label">Modo de operación</span>
                                                    <span className="admin-detail-value">{MODE_LABELS[drawerData.business.operation_mode] || drawerData.business.operation_mode}</span>
                                                </div>
                                                <div className="admin-detail-item">
                                                    <span className="admin-detail-label">Tipo de negocio</span>
                                                    <span className="admin-detail-value">{TYPE_LABELS[drawerData.business.type] || drawerData.business.type}</span>
                                                </div>
                                                <div className="admin-detail-item">
                                                    <span className="admin-detail-label">Fecha de registro</span>
                                                    <span className="admin-detail-value">{formatDateTime(drawerData.business.created_at)}</span>
                                                </div>
                                            </div>

                                            <h4 className="admin-drawer__subtitle">Owner</h4>
                                            <div className="admin-detail-grid">
                                                <div className="admin-detail-item">
                                                    <span className="admin-detail-label">Email</span>
                                                    <span className="admin-detail-value">{drawerData.owner?.email || 'Sin owner'}</span>
                                                </div>
                                                <div className="admin-detail-item">
                                                    <span className="admin-detail-label">Miembros del equipo</span>
                                                    <span className="admin-detail-value">{drawerData.members_count}</span>
                                                </div>
                                            </div>

                                            {drawerData.owner?.user_id && (
                                                <>
                                                    <h4 className="admin-drawer__subtitle">IDs</h4>
                                                    <div className="admin-detail-grid">
                                                        <div className="admin-detail-item">
                                                            <span className="admin-detail-label">Business ID</span>
                                                            <span className="admin-detail-value admin-detail-value--mono">{drawerData.business.id}</span>
                                                        </div>
                                                        <div className="admin-detail-item">
                                                            <span className="admin-detail-label">Owner User ID</span>
                                                            <span className="admin-detail-value admin-detail-value--mono">{drawerData.owner.user_id}</span>
                                                        </div>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    )}

                                    {/* Acciones tab */}
                                    {drawerTab === 'actions' && selectedBiz && (
                                        <div className="admin-drawer__section">
                                            {/* --- Extender Trial --- */}
                                            {(selectedBiz.sub_status === 'trialing' || selectedBiz.sub_status === 'expired' || selectedBiz.sub_status === 'canceled') && (
                                                <>
                                                    <h4 className="admin-drawer__subtitle">Extender trial</h4>
                                                    <div className="admin-drawer__action-row">
                                                        {[3, 7, 14].map((days) => (
                                                            <button
                                                                key={days}
                                                                onClick={() => requestExtendTrial(selectedBiz.id, selectedBiz.name, days)}
                                                                disabled={actionLoading === selectedBiz.id}
                                                                className="admin-plan-btn"
                                                            >
                                                                +{days} días
                                                            </button>
                                                        ))}
                                                    </div>
                                                </>
                                            )}

                                            {/* --- Asignar plan (inmediato) --- */}
                                            <h4 className="admin-drawer__subtitle">Asignar plan (inmediato)</h4>
                                            <div className="admin-drawer__action-grid">
                                                {plans.map((plan) => {
                                                    const isCurrent = selectedBiz.plan_code === plan.slug
                                                    return (
                                                        <button
                                                            key={plan.slug}
                                                            onClick={() => requestAssignPlan(selectedBiz.id, plan)}
                                                            disabled={actionLoading === selectedBiz.id || isCurrent}
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
                                            </div>

                                            {/* --- Programar cambio de plan (al siguiente periodo) --- */}
                                            {selectedBiz.sub_status && !['canceled', 'suspended'].includes(selectedBiz.sub_status) && (
                                                <>
                                                    <h4 className="admin-drawer__subtitle" style={{ marginTop: '1.5rem' }}>Cambiar plan al siguiente periodo</h4>
                                                    {drawerData?.subscription?.scheduled_plan_slug ? (
                                                        <div className="admin-action-scheduled">
                                                            <span>Cambio programado a <strong>{drawerData.subscription.scheduled_plan_slug}</strong></span>
                                                            <button
                                                                onClick={() => cancelScheduledChange(selectedBiz.id)}
                                                                disabled={actionLoading === selectedBiz.id}
                                                                className="admin-plan-btn admin-plan-btn--danger"
                                                                style={{ marginTop: '0.5rem' }}
                                                            >
                                                                <IconXMark /> Cancelar cambio programado
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div className="admin-drawer__action-grid">
                                                            {plans.filter((p) => p.slug !== selectedBiz.plan_code).map((plan) => (
                                                                <button
                                                                    key={`schedule-${plan.slug}`}
                                                                    onClick={() => requestScheduleChange(selectedBiz.id, selectedBiz.name, plan)}
                                                                    disabled={actionLoading === selectedBiz.id}
                                                                    className="admin-plan-btn admin-plan-btn--outline"
                                                                >
                                                                    {plan.name}
                                                                    <span className="admin-plan-btn__price">
                                                                        ${plan.price}/{plan.billing_interval === 'annual' ? 'año' : 'mes'}
                                                                    </span>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </>
                                            )}

                                            {/* --- Acciones peligrosas --- */}
                                            {selectedBiz.sub_status && (
                                                <>
                                                    <h4 className="admin-drawer__subtitle" style={{ marginTop: '1.5rem' }}>Acciones peligrosas</h4>
                                                    <div className="admin-drawer__action-grid">
                                                        {/* Suspend / Unsuspend */}
                                                        {selectedBiz.sub_status === 'suspended' ? (
                                                            <button
                                                                onClick={() => requestUnsuspend(selectedBiz.id, selectedBiz.name)}
                                                                disabled={actionLoading === selectedBiz.id}
                                                                className="admin-plan-btn"
                                                            >
                                                                Reactivar negocio
                                                            </button>
                                                        ) : (
                                                            <button
                                                                onClick={() => requestSuspend(selectedBiz.id, selectedBiz.name)}
                                                                disabled={actionLoading === selectedBiz.id}
                                                                className="admin-plan-btn admin-plan-btn--danger"
                                                            >
                                                                Suspender acceso
                                                            </button>
                                                        )}
                                                        {/* Unassign */}
                                                        <button
                                                            onClick={() => requestUnassignPlan(selectedBiz.id, selectedBiz.name)}
                                                            disabled={actionLoading === selectedBiz.id}
                                                            className="admin-plan-btn admin-plan-btn--danger"
                                                        >
                                                            <IconXMark />
                                                            Desasignar plan actual
                                                        </button>
                                                    </div>
                                                </>
                                            )}

                                            {/* --- ELIMINAR NEGOCIO (DANGER ZONE) --- */}
                                            <h4 className="admin-drawer__subtitle" style={{ marginTop: '2rem', color: '#dc2626' }}>
                                                Zona de peligro
                                            </h4>
                                            {selectedBiz.deleted_at ? (
                                                <button
                                                    onClick={() => requestRestoreBusiness(selectedBiz.id, selectedBiz.name)}
                                                    disabled={actionLoading === selectedBiz.id}
                                                    className="admin-plan-btn"
                                                    style={{ background: '#22c55e', color: '#fff', border: 'none' }}
                                                >
                                                    Restaurar negocio
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => requestDeleteBusiness(selectedBiz.id, selectedBiz.name)}
                                                    disabled={actionLoading === selectedBiz.id}
                                                    className="admin-plan-btn admin-plan-btn--danger"
                                                    style={{ background: '#dc2626', color: '#fff', border: 'none' }}
                                                >
                                                    Eliminar negocio
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </>
                            ) : (
                                <p className="admin-detail-empty">Error cargando datos.</p>
                            )}
                        </div>
                    </div>
                </>
            )}

            {/* Smart Confirmation Modal */}
            {actionModal && actionModal.type !== 'delete' && actionModal.type !== 'restore' && (
                <div className="admin-modal-backdrop" onClick={() => setActionModal(null)}>
                    <div className="admin-modal admin-modal--wide" onClick={(e) => e.stopPropagation()}>
                        <div className={`admin-modal__icon ${['unassign', 'suspend'].includes(actionModal.type) ? 'admin-modal__icon--danger' : 'admin-modal__icon--warning'}`}>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                <path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
                            </svg>
                        </div>
                        <h3 className="admin-modal__title">
                            {actionModal.confirmLabel || (actionModal.type === 'assign'
                                ? `Asignar ${actionModal.planName}`
                                : 'Desasignar plan')}
                        </h3>

                        {/* Smart warning */}
                        <div className="admin-modal__warning">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                            </svg>
                            <span>{actionModal.warning}</span>
                        </div>

                        {/* Mandatory note */}
                        <div className="admin-modal__note-section">
                            <label className="admin-modal__note-label">
                                {actionModal.requiresNote ? 'Nota (obligatoria)' : 'Nota (opcional)'}
                            </label>
                            <textarea
                                className="admin-modal__note-input"
                                placeholder="Razón del cambio..."
                                value={actionNote}
                                onChange={(e) => setActionNote(e.target.value)}
                                rows={2}
                            />
                        </div>

                        <div className="admin-modal__actions">
                            <button className="admin-modal__btn admin-modal__btn--cancel" onClick={() => { setActionModal(null); setActionNote('') }}>
                                Cancelar
                            </button>
                            <button
                                className={`admin-modal__btn ${['unassign', 'suspend'].includes(actionModal.type) ? 'admin-modal__btn--confirm' : 'admin-modal__btn--primary'}`}
                                onClick={executeAction}
                                disabled={actionModal.requiresNote && !actionNote.trim()}
                            >
                                {actionModal.confirmLabel || (actionModal.type === 'assign'
                                    ? `Sí, asignar ${actionModal.planName}`
                                    : 'Sí, desasignar')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Business Modal — Double Confirmation */}
            {actionModal && actionModal.type === 'delete' && (
                <div className="admin-modal-backdrop" onClick={() => setActionModal(null)}>
                    <div className="admin-modal admin-modal--wide" onClick={(e) => e.stopPropagation()}>
                        <div className="admin-modal__icon admin-modal__icon--danger">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                <path fillRule="evenodd" d="M16.5 4.478v.227a48.816 48.816 0 013.878.512.75.75 0 11-.256 1.478l-.209-.035-1.005 13.07a3 3 0 01-2.991 2.77H8.084a3 3 0 01-2.991-2.77L4.087 6.66l-.209.035a.75.75 0 01-.256-1.478A48.567 48.567 0 017.5 4.705v-.227c0-1.564 1.213-2.9 2.816-2.951a52.662 52.662 0 013.369 0c1.603.051 2.815 1.387 2.815 2.951zm-6.136-1.452a51.196 51.196 0 013.273 0C14.39 3.05 15 3.684 15 4.478v.113a49.488 49.488 0 00-6 0v-.113c0-.794.609-1.428 1.364-1.452zm-.355 5.945a.75.75 0 10-1.5.058l.347 9a.75.75 0 101.499-.058l-.346-9zm5.48.058a.75.75 0 10-1.498-.058l-.347 9a.75.75 0 001.5.058l.345-9z" clipRule="evenodd" />
                            </svg>
                        </div>
                        <h3 className="admin-modal__title" style={{ color: '#dc2626' }}>
                            Eliminar negocio
                        </h3>

                        {/* Impact preview */}
                        <div style={{ background: '#fef2f2', borderRadius: '10px', padding: '0.8rem 1rem', marginBottom: '1rem', fontSize: '0.85rem', color: '#991b1b', lineHeight: 1.6 }}>
                            <strong>Impacto:</strong>
                            <ul style={{ margin: '0.3rem 0 0 1rem', padding: 0 }}>
                                <li>Se desactivarán <strong>{actionModal.membersCount || 0} usuarios</strong></li>
                                <li>Se cancelará la suscripción</li>
                                <li>Se bloqueará el acceso al sistema</li>
                            </ul>
                        </div>

                        {/* Warning */}
                        <div className="admin-modal__warning" style={{ background: '#fef2f2', borderColor: '#fecaca', color: '#991b1b' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                            </svg>
                            <span>{actionModal.warning}</span>
                        </div>

                        {/* Mandatory note */}
                        <div className="admin-modal__note-section">
                            <label className="admin-modal__note-label">Motivo de eliminación (obligatorio)</label>
                            <textarea
                                className="admin-modal__note-input"
                                placeholder="¿Por qué se elimina este negocio?"
                                value={actionNote}
                                onChange={(e) => setActionNote(e.target.value)}
                                rows={2}
                            />
                        </div>

                        {/* Double confirmation — type business name */}
                        <div className="admin-modal__note-section">
                            <label className="admin-modal__note-label">
                                Escribe <strong>“{actionModal.businessName}”</strong> para confirmar:
                            </label>
                            <input
                                type="text"
                                className="admin-modal__note-input"
                                placeholder={actionModal.businessName}
                                value={deleteConfirmName}
                                onChange={(e) => setDeleteConfirmName(e.target.value)}
                                style={{ fontFamily: 'monospace' }}
                            />
                        </div>

                        <div className="admin-modal__actions">
                            <button className="admin-modal__btn admin-modal__btn--cancel" onClick={() => { setActionModal(null); setActionNote(''); setDeleteConfirmName('') }}>
                                Cancelar
                            </button>
                            <button
                                className="admin-modal__btn admin-modal__btn--confirm"
                                onClick={executeAction}
                                disabled={!actionNote.trim() || deleteConfirmName !== actionModal.businessName}
                                style={{ background: '#dc2626' }}
                            >
                                Eliminar definitivamente
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Restore Business Modal */}
            {actionModal && actionModal.type === 'restore' && (
                <div className="admin-modal-backdrop" onClick={() => setActionModal(null)}>
                    <div className="admin-modal admin-modal--wide" onClick={(e) => e.stopPropagation()}>
                        <div className="admin-modal__icon admin-modal__icon--warning" style={{ background: '#f0fdf4', color: '#22c55e' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                <path fillRule="evenodd" d="M4.755 10.059a7.5 7.5 0 0112.548-3.364l1.903 1.903h-3.183a.75.75 0 000 1.5h4.992a.75.75 0 00.75-.75V4.356a.75.75 0 00-1.5 0v3.18l-1.9-1.9A9 9 0 003.306 9.67a.75.75 0 101.45.388zm15.408 3.352a.75.75 0 00-.919.53 7.5 7.5 0 01-12.548 3.364l-1.902-1.903h3.183a.75.75 0 000-1.5H3.984a.75.75 0 00-.75.75v4.992a.75.75 0 001.5 0v-3.18l1.9 1.9a9 9 0 0015.059-4.035.75.75 0 00-.53-.918z" clipRule="evenodd" />
                            </svg>
                        </div>
                        <h3 className="admin-modal__title" style={{ color: '#22c55e' }}>
                            Restaurar negocio
                        </h3>

                        <div className="admin-modal__warning" style={{ background: '#f0fdf4', borderColor: '#bbf7d0', color: '#166534' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                            </svg>
                            <span>{actionModal.warning}</span>
                        </div>

                        <div className="admin-modal__note-section">
                            <label className="admin-modal__note-label">Nota (opcional)</label>
                            <textarea
                                className="admin-modal__note-input"
                                placeholder="Razón de la restauración..."
                                value={actionNote}
                                onChange={(e) => setActionNote(e.target.value)}
                                rows={2}
                            />
                        </div>

                        <div className="admin-modal__actions">
                            <button className="admin-modal__btn admin-modal__btn--cancel" onClick={() => { setActionModal(null); setActionNote('') }}>
                                Cancelar
                            </button>
                            <button
                                className="admin-modal__btn admin-modal__btn--primary"
                                onClick={executeAction}
                                style={{ background: '#22c55e' }}
                            >
                                ✅ Restaurar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Undo Toast */}
            {undoToast && (
                <div className="admin-undo-toast">
                    <div className="admin-undo-toast__content">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                        </svg>
                        <span>{undoToast.message}</span>
                        <button className="admin-undo-toast__btn" onClick={handleUndo}>
                            Deshacer ({undoToast.secondsLeft}s)
                        </button>
                        <button className="admin-undo-toast__dismiss" onClick={clearUndoTimer}>
                            <IconXMark />
                        </button>
                    </div>
                    <div className="admin-undo-toast__bar">
                        <div
                            className="admin-undo-toast__bar-fill"
                            style={{ width: `${(undoToast.secondsLeft / 10) * 100}%` }}
                        />
                    </div>
                </div>
            )}
        </div>
    )
}
