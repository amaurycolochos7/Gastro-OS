'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Product, Category, CashRegister, PaymentMethod } from '@/lib/types'
import { checkLimit, getLimitLabel, LimitResult } from '@/lib/limits'
import TicketPreview from './TicketPreview'

// ── Types ──

interface OrderItem {
    product: Product
    quantity: number
    notes?: string
}

interface OpenOrderItem {
    name_snapshot: string
    quantity: number
    price_snapshot: number
    notes?: string
    product_id?: string
}

interface OpenOrder {
    id: string
    folio: string
    table_number: string | null
    status: string
    total_snapshot: number | null
    created_at: string
    service_type: string | null
    items: OpenOrderItem[]
}

interface CompletedOrder {
    folio: string
    orderId: string
    items: OrderItem[]
    subtotal: number
    discountAmount: number
    discountReason: string
    total: number
    paymentMethod: PaymentMethod
    serviceType: 'dine_in' | 'takeaway' | 'delivery'
    date: string
    cashReceived?: number
    changeAmount?: number
}

type ServiceType = 'dine_in' | 'takeaway' | 'delivery'
type MobileTab = 'catalog' | 'builder' | 'open-orders'
type RealtimeStatus = 'live' | 'connecting' | 'error'

const OPEN_STATUSES = ['OPEN', 'IN_PREP', 'READY', 'PAID']

// ── Helpers ──

function getSlaClass(createdAt: string, status: string): string {
    if (status === 'READY') return 'sla-blue'
    if (status === 'PAID') return 'sla-green'
    const mins = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000)
    if (mins < 10) return 'sla-green'
    if (mins < 20) return 'sla-amber'
    return 'sla-red'
}

function getTimeSince(date: string): string {
    const mins = Math.floor((Date.now() - new Date(date).getTime()) / 60000)
    return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`
}

// ── Component ──

export default function POSPage() {
    const supabase = createClient()

    // Core data
    const [categories, setCategories] = useState<Category[]>([])
    const [products, setProducts] = useState<Product[]>([])
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
    const [cashRegister, setCashRegister] = useState<CashRegister | null>(null)
    const [loading, setLoading] = useState(true)
    const [businessId, setBusinessId] = useState<string>('')
    const [operationMode, setOperationMode] = useState<'restaurant' | 'counter'>('restaurant')
    const [businessName, setBusinessName] = useState('')

    // Builder state
    const [orderItems, setOrderItems] = useState<OrderItem[]>([])
    const [editingOrderId, setEditingOrderId] = useState<string | null>(null)
    const [editingOrderLabel, setEditingOrderLabel] = useState('')
    const [editingOrderItems, setEditingOrderItems] = useState<OpenOrderItem[]>([])
    const [tableNumber, setTableNumber] = useState('')

    // Payment
    const [showPaymentModal, setShowPaymentModal] = useState(false)
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
    const [processing, setProcessing] = useState(false)
    const [serviceType, setServiceType] = useState<ServiceType>('dine_in')
    const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('percent')
    const [discountValue, setDiscountValue] = useState('')
    const [discountReason, setDiscountReason] = useState('')
    const [cashReceived, setCashReceived] = useState('')
    const [showDiscountSection, setShowDiscountSection] = useState(false)
    const [showConfirmation, setShowConfirmation] = useState(false)
    const [completedOrder, setCompletedOrder] = useState<CompletedOrder | null>(null)
    // Paying an open order directly
    const [payingOpenOrderId, setPayingOpenOrderId] = useState<string | null>(null)
    const [alreadyPaidAmount, setAlreadyPaidAmount] = useState(0)

    // Customize product modal
    const [showCustomizeModal, setShowCustomizeModal] = useState(false)
    const [customizingProduct, setCustomizingProduct] = useState<Product | null>(null)
    const [customQuantity, setCustomQuantity] = useState(1)
    const [customNotes, setCustomNotes] = useState('')

    // Open orders sidebar
    const [openOrders, setOpenOrders] = useState<OpenOrder[]>([])
    const [loadingOpenOrders, setLoadingOpenOrders] = useState(false)
    const [sidebarFilter, setSidebarFilter] = useState<'all' | 'dine_in' | 'takeaway'>('all')

    // Cancel order
    const [cancellingOrder, setCancellingOrder] = useState<OpenOrder | null>(null)
    const [cancelReason, setCancelReason] = useState('')

    // Realtime
    const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>('connecting')
    const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const slaTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const [, setSlaTickForceUpdate] = useState(0)

    // Mobile
    const [mobileTab, setMobileTab] = useState<MobileTab>('catalog')

    // Limits
    const [limitInfo, setLimitInfo] = useState<LimitResult | null>(null)
    const [showLimitModal, setShowLimitModal] = useState(false)

    // Toast
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
    const showToast = (message: string, type: 'success' | 'error' = 'success') => {
        setToast({ message, type })
        setTimeout(() => setToast(null), 3000)
    }

    // ── Computed values ──

    const subtotal = orderItems.reduce(
        (sum, item) => sum + item.product.price * item.quantity, 0
    )

    const discountAmount = useMemo(() => {
        const value = parseFloat(discountValue) || 0
        if (value <= 0) return 0
        return discountType === 'percent'
            ? Math.min(subtotal, subtotal * (value / 100))
            : Math.min(subtotal, value)
    }, [discountType, discountValue, subtotal])

    const total = subtotal - discountAmount
    const changeAmount = paymentMethod === 'cash'
        ? Math.max(0, (parseFloat(cashReceived) || 0) - total) : 0
    const itemCount = orderItems.reduce((sum, item) => sum + item.quantity, 0)

    const filteredProducts = selectedCategory
        ? products.filter(p => p.category_id === selectedCategory) : products

    // ── Data loading ──

    const loadData = useCallback(async () => {
        setLoading(true)
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data: membership } = await supabase
            .from('business_memberships').select('business_id')
            .eq('user_id', user.id).single()
        if (!membership) return
        setBusinessId(membership.business_id)
        const { data: business } = await supabase
            .from('businesses').select('operation_mode, name')
            .eq('id', membership.business_id).single()
        if (business) {
            setOperationMode((business.operation_mode as 'restaurant' | 'counter') || 'restaurant')
            setBusinessName(business.name || '')
        }
        const { data: register } = await supabase
            .from('cash_registers').select('*')
            .eq('business_id', membership.business_id)
            .eq('opened_by', user.id).eq('status', 'open')
            .is('deleted_at', null).single()
        setCashRegister(register)
        const { data: cats } = await supabase
            .from('categories').select('*')
            .eq('business_id', membership.business_id).order('position')
        setCategories(cats || [])
        const { data: prods } = await supabase
            .from('products').select('*')
            .eq('business_id', membership.business_id)
            .is('deleted_at', null).order('name')
        setProducts(prods || [])
        setLoading(false)
    }, [supabase])

    const loadOpenOrders = useCallback(async () => {
        if (!businessId) return
        setLoadingOpenOrders(true)
        const { data: orders } = await supabase
            .from('orders')
            .select('id, folio, table_number, status, total_snapshot, created_at, service_type')
            .eq('business_id', businessId)
            .in('status', OPEN_STATUSES)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })

        if (orders && orders.length > 0) {
            const orderIds = orders.map(o => o.id)
            const { data: items } = await supabase
                .from('order_items')
                .select('order_id, name_snapshot, quantity, price_snapshot, notes, product_id')
                .in('order_id', orderIds)

            const ordersWithItems: OpenOrder[] = orders.map(o => ({
                ...o,
                items: (items || []).filter(i => i.order_id === o.id)
            }))
            setOpenOrders(ordersWithItems)
        } else {
            setOpenOrders([])
        }
        setLoadingOpenOrders(false)
    }, [businessId, supabase])

    useEffect(() => { loadData() }, [loadData])
    useEffect(() => { if (businessId) loadOpenOrders() }, [businessId, loadOpenOrders])

    // ── Realtime ──

    const scheduleReload = useCallback(() => {
        if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current)
        reloadTimerRef.current = setTimeout(() => loadOpenOrders(), 300)
    }, [loadOpenOrders])

    useEffect(() => {
        if (!businessId) return
        const channel = supabase
            .channel('pos-open-orders')
            .on('postgres_changes', {
                event: 'INSERT', schema: 'public', table: 'orders',
                filter: `business_id=eq.${businessId}`,
            }, () => scheduleReload())
            .on('postgres_changes', {
                event: 'UPDATE', schema: 'public', table: 'orders',
                filter: `business_id=eq.${businessId}`,
            }, () => scheduleReload())
            .on('postgres_changes', {
                event: 'INSERT', schema: 'public', table: 'payments',
                filter: `business_id=eq.${businessId}`,
            }, () => scheduleReload())
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') setRealtimeStatus('live')
                else if (status === 'CHANNEL_ERROR') setRealtimeStatus('error')
                else setRealtimeStatus('connecting')
            })
        return () => {
            supabase.removeChannel(channel)
            if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current)
            if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current)
        }
    }, [businessId, scheduleReload, supabase])

    // Polling fallback
    useEffect(() => {
        if (realtimeStatus === 'error') {
            pollingIntervalRef.current = setInterval(loadOpenOrders, 10000)
        } else {
            if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current)
                pollingIntervalRef.current = null
            }
        }
        return () => {
            if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current)
                pollingIntervalRef.current = null
            }
        }
    }, [realtimeStatus, loadOpenOrders])

    // SLA timer: force re-render every 60s to update badges
    useEffect(() => {
        slaTimerRef.current = setInterval(() => setSlaTickForceUpdate(t => t + 1), 60000)
        return () => { if (slaTimerRef.current) clearInterval(slaTimerRef.current) }
    }, [])

    // ── Builder actions ──

    const openCustomizeModal = (product: Product) => {
        setCustomizingProduct(product)
        setCustomQuantity(1)
        setCustomNotes('')
        setShowCustomizeModal(true)
    }

    const confirmAddProduct = () => {
        if (!customizingProduct) return
        const newItem: OrderItem = {
            product: customizingProduct, quantity: customQuantity,
            notes: customNotes.trim() || undefined,
        }
        setOrderItems(prev => {
            if (!newItem.notes) {
                const existing = prev.find(i => i.product.id === customizingProduct.id && !i.notes)
                if (existing) {
                    return prev.map(i => i === existing
                        ? { ...i, quantity: i.quantity + customQuantity } : i)
                }
            }
            return [...prev, newItem]
        })
        setShowCustomizeModal(false)
        setMobileTab('builder')
    }

    const updateQuantity = (index: number, delta: number) => {
        setOrderItems(prev => prev
            .map((item, i) => i === index ? { ...item, quantity: item.quantity + delta } : item)
            .filter(item => item.quantity > 0))
    }

    const removeItem = (index: number) => {
        setOrderItems(prev => prev.filter((_, i) => i !== index))
    }

    const formatNotesForDB = (item: OrderItem): string | undefined => item.notes || undefined

    // ── Retomar (select open order) ──

    const handleRetomar = async (order: OpenOrder) => {
        setEditingOrderId(order.id)
        setEditingOrderLabel(order.table_number || order.folio)
        setEditingOrderItems(order.items)
        setTableNumber(order.table_number || '')
        setOrderItems([]) // New items to add start empty
        setPayingOpenOrderId(null)
        setMobileTab('builder')
        showToast(`Orden ${order.table_number || order.folio} seleccionada`)
    }

    const cancelEditingOrder = () => {
        setEditingOrderId(null)
        setEditingOrderLabel('')
        setEditingOrderItems([])
        setOrderItems([])
        setTableNumber('')
        setPayingOpenOrderId(null)
    }

    // ── Cancel order ──

    const handleCancelOrder = async () => {
        if (!cancellingOrder || !cancelReason.trim()) return
        setProcessing(true)
        const { error } = await supabase
            .from('orders')
            .update({ status: 'CANCELLED', cancel_reason: cancelReason.trim() })
            .eq('id', cancellingOrder.id)
        if (error) {
            showToast('Error al cancelar: ' + error.message, 'error')
        } else {
            showToast(`Orden ${cancellingOrder.table_number || cancellingOrder.folio} cancelada`)
            // If we were editing this order, exit builder
            if (editingOrderId === cancellingOrder.id) cancelEditingOrder()
        }
        setCancellingOrder(null)
        setCancelReason('')
        setProcessing(false)
        loadOpenOrders()
    }

    // ── Send to Kitchen (new or add to existing) ──

    const handleSendToKitchen = async () => {
        if (orderItems.length === 0) return
        setProcessing(true)
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setProcessing(false); return }

        if (editingOrderId) {
            // Add items to existing order
            const newItems = orderItems.map(item => ({
                order_id: editingOrderId, business_id: businessId,
                product_id: item.product.id, name_snapshot: item.product.name,
                price_snapshot: item.product.price, quantity: item.quantity,
                notes: formatNotesForDB(item),
            }))
            const { error: itemsError } = await supabase.from('order_items').insert(newItems)
            if (itemsError) {
                showToast('Error: ' + itemsError.message, 'error')
                setProcessing(false); return
            }
            // Recalculate totals
            const { data: allItems } = await supabase
                .from('order_items').select('price_snapshot, quantity')
                .eq('order_id', editingOrderId)
            const newTotal = (allItems || []).reduce(
                (sum, i) => sum + i.price_snapshot * i.quantity, 0)
            // If order was PAID (adding items after payment), revert to OPEN
            const currentOrder = openOrders.find(o => o.id === editingOrderId)
            if (currentOrder && currentOrder.status === 'PAID') {
                await supabase.from('orders')
                    .update({ subtotal_snapshot: newTotal, total_snapshot: newTotal, status: 'OPEN' })
                    .eq('id', editingOrderId)
            } else {
                await supabase.from('orders')
                    .update({ subtotal_snapshot: newTotal, total_snapshot: newTotal })
                    .eq('id', editingOrderId)
            }
            showToast(`Orden ${editingOrderLabel} actualizada`)
            cancelEditingOrder()
        } else {
            // Create new open order
            const limitResult = await checkLimit(supabase, businessId, 'orders_day')
            if (!limitResult.allowed) {
                setLimitInfo(limitResult); setShowLimitModal(true)
                setProcessing(false); return
            }
            const { data: folioData } = await supabase.rpc('get_next_folio', { p_business_id: businessId })
            const folio = folioData || `GOS-${Date.now()}`
            const { data: order, error: orderError } = await supabase
                .from('orders').insert({
                    business_id: businessId, folio, status: 'OPEN',
                    service_type: serviceType,
                    table_number: tableNumber.trim() || null,
                    subtotal_snapshot: subtotal, total_snapshot: total,
                    created_by: user.id,
                }).select().single()
            if (orderError || !order) {
                showToast('Error: ' + orderError?.message, 'error')
                setProcessing(false); return
            }
            const items = orderItems.map(item => ({
                order_id: order.id, business_id: businessId,
                product_id: item.product.id, name_snapshot: item.product.name,
                price_snapshot: item.product.price, quantity: item.quantity,
                notes: formatNotesForDB(item),
            }))
            await supabase.from('order_items').insert(items)
            showToast(`Orden ${tableNumber.trim() || folio} enviada a cocina`)
            setOrderItems([]); setTableNumber(''); setServiceType('dine_in')
        }
        setProcessing(false)
        loadOpenOrders()
    }

    // ── Payment (direct or for open order) ──

    const handleFinalizeOrder = async (order: OpenOrder) => {
        setProcessing(true)
        await supabase.from('orders').update({ status: 'CLOSED' }).eq('id', order.id)
        showToast(`Orden ${order.table_number || order.folio} finalizada`)
        setProcessing(false)
        loadOpenOrders()
    }

    const handleOpenPaymentForOrder = async (order: OpenOrder) => {
        // Fetch sum of existing paid payments for this order
        const { data: payments } = await supabase
            .from('payments')
            .select('amount')
            .eq('order_id', order.id)
            .eq('status', 'paid')
            .is('deleted_at', null)
        const paidSoFar = (payments || []).reduce((s: number, p: { amount: number }) => s + Number(p.amount), 0)
        setAlreadyPaidAmount(paidSoFar)

        setPayingOpenOrderId(order.id)
        setEditingOrderId(order.id)
        setEditingOrderLabel(order.table_number || order.folio)
        setEditingOrderItems(order.items)
        setOrderItems([])
        setCashReceived('')
        setPaymentMethod('cash')
        setShowPaymentModal(true)
    }

    const handlePayment = async () => {
        if (!cashRegister) { showToast('Debes abrir caja antes de cobrar', 'error'); return }

        // If paying an open order
        if (payingOpenOrderId) {
            setProcessing(true)
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) { setProcessing(false); return }
            const order = openOrders.find(o => o.id === payingOpenOrderId)
            if (!order) { setProcessing(false); return }
            const orderTotal = order.items.reduce((s, i) => s + i.price_snapshot * i.quantity, 0)

            // Calculate remaining amount
            const remaining = orderTotal - alreadyPaidAmount

            if (remaining > 0) {
                // Create payment for remaining amount only
                const { error: payErr } = await supabase.from('payments').insert({
                    order_id: payingOpenOrderId, business_id: businessId,
                    cash_register_id: cashRegister.id, amount: remaining,
                    method: paymentMethod, status: 'paid',
                    paid_at: new Date().toISOString(), created_by: user.id,
                })
                if (payErr) { showToast('Error: ' + payErr.message, 'error'); setProcessing(false); return }
            }

            await supabase.from('orders').update({ status: 'PAID' }).eq('id', payingOpenOrderId)
            showToast(`Orden ${order.table_number || order.folio} cobrada - pendiente de entrega`)
            setShowPaymentModal(false)
            cancelEditingOrder()
            setProcessing(false)
            loadOpenOrders()
            return
        }

        // Direct payment (new order)
        if (orderItems.length === 0) return
        const limitResult = await checkLimit(supabase, businessId, 'orders_day')
        if (!limitResult.allowed) { setLimitInfo(limitResult); setShowLimitModal(true); return }
        if (discountAmount > 0 && !discountReason.trim()) {
            showToast('Ingresa el motivo del descuento', 'error'); return
        }
        setProcessing(true)
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setProcessing(false); return }
        const { data: folioData } = await supabase.rpc('get_next_folio', { p_business_id: businessId })
        const folio = folioData || `GOS-${Date.now()}`
        const initialStatus = operationMode === 'restaurant' ? 'IN_PREP' : 'READY'
        const { data: order, error: orderError } = await supabase
            .from('orders').insert({
                business_id: businessId, folio, status: initialStatus,
                service_type: serviceType, subtotal_snapshot: subtotal,
                discount_amount: discountAmount,
                discount_reason: discountReason.trim() || null,
                total_snapshot: total, created_by: user.id,
            }).select().single()
        if (orderError || !order) { showToast('Error: ' + orderError?.message, 'error'); setProcessing(false); return }
        const items = orderItems.map(item => ({
            order_id: order.id, business_id: businessId,
            product_id: item.product.id, name_snapshot: item.product.name,
            price_snapshot: item.product.price, quantity: item.quantity,
            notes: formatNotesForDB(item),
        }))
        await supabase.from('order_items').insert(items)
        const { error: payErr } = await supabase.from('payments').insert({
            order_id: order.id, business_id: businessId,
            cash_register_id: cashRegister.id, amount: total,
            method: paymentMethod, status: 'paid',
            paid_at: new Date().toISOString(), created_by: user.id,
        })
        if (payErr) { showToast('Error: ' + payErr.message, 'error'); setProcessing(false); return }
        setCompletedOrder({
            folio, orderId: order.id, items: [...orderItems], subtotal,
            discountAmount, discountReason: discountReason.trim(), total,
            paymentMethod, serviceType, date: new Date().toISOString(),
            cashReceived: paymentMethod === 'cash' ? parseFloat(cashReceived) || undefined : undefined,
            changeAmount: paymentMethod === 'cash' ? changeAmount : undefined,
        })
        setShowConfirmation(true)
        setOrderItems([]); setShowPaymentModal(false); setProcessing(false)
        setDiscountValue(''); setDiscountReason(''); setDiscountType('percent')
        setCashReceived(''); setShowDiscountSection(false)
    }

    // ── Render ──

    if (loading) return <div className="p-lg">Cargando...</div>

    if (!cashRegister) {
        return (
            <div className="flex flex-col items-center justify-center" style={{ height: 'calc(100vh - 100px)' }}>
                <div className="card text-center" style={{ maxWidth: 400 }}>
                    <h2 className="text-xl font-bold mb-md">Sin turno abierto</h2>
                    <p className="text-muted mb-md">Debes abrir tu turno de caja para poder cobrar</p>
                    <a href="/dashboard/cash" className="btn btn-primary btn-lg">Ir a Caja</a>
                </div>
            </div>
        )
    }

    // ── Payment total for open order
    const payingOrder = payingOpenOrderId ? openOrders.find(o => o.id === payingOpenOrderId) : null
    const payingTotal = payingOrder
        ? payingOrder.items.reduce((s, i) => s + i.price_snapshot * i.quantity, 0) - alreadyPaidAmount : total

    return (
        <div className="pos-layout-v2">
            {/* ═══ LEFT: Catalog ═══ */}
            <div className={`pos-products ${mobileTab === 'catalog' ? 'pos-tab-active' : ''}`}>
                {selectedCategory && (
                    <div className="pos-nav-header">
                        <button className="pos-back-btn" onClick={() => setSelectedCategory(null)}>‹</button>
                        <span className="category-title">
                            {categories.find(c => c.id === selectedCategory)?.name || 'Productos'}
                        </span>
                    </div>
                )}
                <div className="pos-products-scroll">
                    {!selectedCategory ? (
                        <div className="grid-categories">
                            {categories.map(cat => (
                                <div key={cat.id} className="category-card" onClick={() => setSelectedCategory(cat.id)}>
                                    <div className="category-icon">{cat.name.charAt(0).toUpperCase()}</div>
                                    <div className="category-name">{cat.name}</div>
                                    <div className="category-count">
                                        {products.filter(p => p.category_id === cat.id).length} productos
                                    </div>
                                </div>
                            ))}
                            {categories.length === 0 && (
                                <div className="text-muted text-center p-lg" style={{ gridColumn: '1 / -1' }}>
                                    No hay categorías. Agrégalas en Productos.
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="grid-products">
                            {filteredProducts.map(product => (
                                <div key={product.id} className="pos-product-card" onClick={() => openCustomizeModal(product)}>
                                    <div className="product-name">{product.name}</div>
                                    <div className="product-price">${product.price.toFixed(2)}</div>
                                </div>
                            ))}
                            {filteredProducts.length === 0 && (
                                <div className="text-muted p-md">No hay productos en esta categoría</div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* ═══ CENTER: Order Builder ═══ */}
            <div className={`pos-order-panel ${mobileTab === 'builder' ? 'pos-tab-active' : ''}`}>
                <div className="pos-order-header">
                    <div className="flex items-center gap-sm" style={{ flexWrap: 'wrap' }}>
                        {editingOrderId ? (
                            <span className="pos-builder-status status-editing">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                                Editando: {editingOrderLabel}
                            </span>
                        ) : (
                            <span className="pos-builder-status status-new">Nueva orden</span>
                        )}
                        {!editingOrderId && (
                            <input
                                type="text" className="pos-builder-table-input"
                                placeholder="Mesa / nombre..."
                                value={tableNumber}
                                onChange={e => setTableNumber(e.target.value)}
                            />
                        )}
                    </div>
                    <div className="flex items-center gap-sm">
                        {!editingOrderId && (
                            <div className="pos-service-toggle">
                                <button
                                    className={`pos-service-btn ${serviceType === 'dine_in' ? 'active' : ''}`}
                                    onClick={() => setServiceType('dine_in')}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l19-9-9 19-2-8-8-2z" /></svg>
                                    Aqui
                                </button>
                                <button
                                    className={`pos-service-btn ${serviceType === 'takeaway' ? 'active' : ''}`}
                                    onClick={() => setServiceType('takeaway')}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" /></svg>
                                    Llevar
                                </button>
                            </div>
                        )}
                        {editingOrderId && (
                            <button className="pos-builder-exit-btn"
                                onClick={cancelEditingOrder}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                                Salir
                            </button>
                        )}
                        {orderItems.length > 0 && !editingOrderId && (
                            <button className="btn btn-secondary btn-sm"
                                onClick={() => setOrderItems([])}>Limpiar</button>
                        )}
                    </div>
                </div>

                {/* Existing items (when editing) */}
                <div className="pos-order-items">
                    {editingOrderId && editingOrderItems.length > 0 && (
                        <div style={{ marginBottom: 'var(--spacing-sm)', paddingBottom: 'var(--spacing-sm)', borderBottom: '2px dashed var(--border-color)' }}>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>ITEMS EN ORDEN</div>
                            {editingOrderItems.map((item, idx) => (
                                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                    <span>{item.quantity}x {item.name_snapshot}</span>
                                    <span>${(item.price_snapshot * item.quantity).toFixed(2)}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* New items being added */}
                    {orderItems.length === 0 && !editingOrderId ? (
                        <p className="text-muted text-center">Toca un producto para agregar</p>
                    ) : orderItems.length === 0 && editingOrderId ? (
                        <p className="text-muted text-center" style={{ fontSize: '0.8rem' }}>Agrega productos nuevos a esta orden</p>
                    ) : (
                        <>
                            {editingOrderId && orderItems.length > 0 && (
                                <div style={{ fontSize: '0.7rem', color: 'var(--color-primary)', marginBottom: 4, fontWeight: 600 }}>+ NUEVOS</div>
                            )}
                            {orderItems.map((item, index) => (
                                <div key={index} className="order-item">
                                    <div className="order-item-info">
                                        <div className="order-item-name">{item.product.name}</div>
                                        {item.notes && <div className="order-item-notes">{item.notes}</div>}
                                        <div className="order-item-price">${(item.product.price * item.quantity).toFixed(2)}</div>
                                    </div>
                                    <div className="order-item-qty">
                                        <button className="btn btn-icon btn-secondary" onClick={() => updateQuantity(index, -1)}>−</button>
                                        <span>{item.quantity}</span>
                                        <button className="btn btn-icon btn-secondary" onClick={() => updateQuantity(index, 1)}>+</button>
                                    </div>
                                </div>
                            ))}
                        </>
                    )}
                </div>

                <div className="pos-order-footer">
                    <div className="pos-total-section">
                        <div className="pos-total-row pos-total-items">
                            <span>{editingOrderId ? editingOrderItems.length + orderItems.length : orderItems.length} items</span>
                            <span>Subtotal</span>
                        </div>
                        <div className="pos-total-row pos-total-amount">
                            <span className="pos-total-label">TOTAL</span>
                            <span className="pos-total-value">
                                ${editingOrderId
                                    ? (editingOrderItems.reduce((s, i) => s + i.price_snapshot * i.quantity, 0) + subtotal).toFixed(2)
                                    : subtotal.toFixed(2)
                                }
                            </span>
                        </div>
                    </div>
                    <div className="pos-footer-buttons">
                        <button className="pos-action-btn pos-action-kitchen"
                            disabled={orderItems.length === 0 || processing}
                            onClick={handleSendToKitchen}>
                            <span className="pos-action-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a4 4 0 0 0-4 4c0 2 1.5 3 3 4.5S12 13 12 14" /><path d="M12 14c0-1 .5-2 1-2.5S16 8 16 6a4 4 0 0 0-4-4" /><path d="M2 18h20l-2 4H4l-2-4z" /></svg></span>
                            <span className="pos-action-text">
                                {editingOrderId ? 'Actualizar orden' : 'Enviar a cocina'}
                            </span>
                        </button>
                        {!editingOrderId ? (
                            <button className="pos-action-btn pos-action-pay"
                                disabled={orderItems.length === 0}
                                onClick={() => setShowPaymentModal(true)}>
                                <span className="pos-action-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg></span>
                                <span className="pos-action-text">Cobrar directo</span>
                            </button>
                        ) : (
                            <button className="pos-action-btn pos-action-pay"
                                onClick={() => handleOpenPaymentForOrder(openOrders.find(o => o.id === editingOrderId)!)}>
                                <span className="pos-action-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg></span>
                                <span className="pos-action-text">Cobrar</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* ═══ RIGHT: Open Orders Sidebar ═══ */}
            <div className={`pos-open-sidebar ${mobileTab === 'open-orders' ? 'pos-tab-active' : ''}`}>
                <div className="pos-sidebar-header">
                    <div className="pos-sidebar-title">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                        </svg>
                        Órdenes abiertas
                        {openOrders.length > 0 && <span className="pos-sidebar-count">{openOrders.length}</span>}
                        <div className="pos-rt-dot" style={{
                            backgroundColor: realtimeStatus === 'live' ? '#16a34a' : realtimeStatus === 'connecting' ? '#ca8a04' : '#dc2626',
                            boxShadow: `0 0 4px ${realtimeStatus === 'live' ? '#16a34a' : realtimeStatus === 'connecting' ? '#ca8a04' : '#dc2626'}`
                        }} title={realtimeStatus === 'live' ? 'En vivo' : realtimeStatus === 'connecting' ? 'Conectando...' : 'Polling'} />
                    </div>
                </div>

                <div className="pos-sidebar-body">
                    {loadingOpenOrders ? (
                        <p className="text-muted text-center" style={{ padding: 'var(--spacing-lg)' }}>Cargando...</p>
                    ) : openOrders.length === 0 ? (
                        <div className="pos-sidebar-empty">
                            <div className="pos-sidebar-empty-icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" ry="1" /></svg></div>
                            <div className="pos-sidebar-empty-title">No hay órdenes abiertas</div>
                            <div className="pos-sidebar-empty-tip">Las órdenes aparecen aquí cuando las envías a cocina o las guardas abiertas.</div>
                        </div>
                    ) : (
                        openOrders.map(order => {
                            const orderTotal = order.items.reduce((s, i) => s + i.price_snapshot * i.quantity, 0)
                            const slaClass = getSlaClass(order.created_at, order.status)
                            const isSelected = editingOrderId === order.id
                            const statusLabel = order.status === 'PAID' ? 'Pagada' : order.status === 'READY' ? 'Lista' : order.status === 'IN_PREP' ? 'Preparando' : 'Abierta'
                            const statusIcon = order.status === 'PAID'
                                ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
                                : order.status === 'READY'
                                    ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                                    : order.status === 'IN_PREP'
                                        ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" /></svg>
                                        : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>

                            return (
                                <div key={order.id}
                                    className={`pos-sidebar-card ${slaClass} ${isSelected ? 'card-selected' : ''}`}
                                    onClick={() => handleRetomar(order)}>

                                    {/* Status strip header */}
                                    <div className={`pos-card-status-strip ${slaClass}`}>
                                        <span className="pos-card-status-label">{statusIcon} {statusLabel}</span>
                                        <span className={`pos-time-badge ${slaClass}`}>
                                            {getTimeSince(order.created_at)}
                                        </span>
                                    </div>

                                    {/* Order identity */}
                                    <div className="pos-card-identity">
                                        <span className="pos-card-folio">
                                            {order.table_number || `#${order.folio}`}
                                        </span>
                                        <span className="pos-card-item-count">{order.items.length} productos</span>
                                    </div>

                                    {/* Item list */}
                                    <div className="pos-card-items-list">
                                        {order.items.slice(0, 3).map((item, idx) => (
                                            <div key={idx} className="pos-card-item-row">
                                                <span className="pos-card-item-qty">{item.quantity}×</span>
                                                <span className="pos-card-item-name">{item.name_snapshot}</span>
                                                <span className="pos-card-item-price">${(item.price_snapshot * item.quantity).toFixed(2)}</span>
                                            </div>
                                        ))}
                                        {order.items.length > 3 && (
                                            <div className="pos-card-items-more">+{order.items.length - 3} más...</div>
                                        )}
                                    </div>

                                    {/* Total row */}
                                    <div className="pos-card-total-row">
                                        <span className="pos-card-total-label">Total</span>
                                        <span className="pos-card-total-amount">${orderTotal.toFixed(2)}</span>
                                    </div>

                                    {/* Actions */}
                                    <div className="pos-card-actions-row">
                                        <button className="pos-card-action-btn pos-card-action-retomar"
                                            onClick={(e) => { e.stopPropagation(); handleRetomar(order) }}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" ry="1" /></svg> Retomar
                                        </button>
                                        {order.status === 'PAID' ? (
                                            <button className="pos-card-action-btn pos-card-action-finalizar"
                                                onClick={(e) => { e.stopPropagation(); handleFinalizeOrder(order) }}
                                                disabled={processing}>
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg> Finalizar
                                            </button>
                                        ) : (
                                            <>
                                                {operationMode === 'counter' && (
                                                    <button className="pos-card-action-btn pos-card-action-cobrar"
                                                        onClick={(e) => { e.stopPropagation(); handleOpenPaymentForOrder(order) }}
                                                        disabled={processing}>
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg> Cobrar
                                                    </button>
                                                )}
                                            </>
                                        )}
                                        {order.status !== 'PAID' && (order.status === 'OPEN' || order.status === 'IN_PREP' || order.status === 'READY') && (
                                            <button className="pos-card-action-btn pos-card-action-cancel"
                                                onClick={(e) => { e.stopPropagation(); setCancellingOrder(order); setCancelReason('') }}
                                                title="Cancelar orden">
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )
                        })
                    )}
                </div>
            </div>

            {/* ═══ Mobile Tabs ═══ */}
            <div className="pos-tabs-mobile">
                <button className={`pos-tab ${mobileTab === 'catalog' ? 'active' : ''}`} onClick={() => setMobileTab('catalog')}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>
                    Productos
                </button>
                <button className={`pos-tab ${mobileTab === 'builder' ? 'active' : ''}`} onClick={() => setMobileTab('builder')}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                    Orden
                    {itemCount > 0 && <span className="pos-tab-badge">{itemCount}</span>}
                </button>
                <button className={`pos-tab ${mobileTab === 'open-orders' ? 'active' : ''}`} onClick={() => setMobileTab('open-orders')}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                    Abiertas
                    {openOrders.length > 0 && <span className="pos-tab-badge amber">{openOrders.length}</span>}
                </button>
            </div >

            {/* ═══ Modals ═══ */}

            {/* Customize product */}
            {
                showCustomizeModal && customizingProduct && (
                    <div className="modal-overlay" onClick={() => setShowCustomizeModal(false)}>
                        <div className="modal-content" onClick={e => e.stopPropagation()}>
                            <div className="modal-header">
                                <h2 className="modal-title">{customizingProduct.name}</h2>
                                <button className="btn-close" onClick={() => setShowCustomizeModal(false)}>×</button>
                            </div>
                            <div className="modal-body">
                                <div className="flex justify-between items-center">
                                    <span className="text-xl font-bold" style={{ color: 'var(--color-primary)' }}>
                                        ${customizingProduct.price.toFixed(2)}
                                    </span>
                                    <div className="flex items-center gap-md">
                                        <button className="btn btn-icon btn-secondary" onClick={() => setCustomQuantity(Math.max(1, customQuantity - 1))}>−</button>
                                        <span className="text-xl font-bold">{customQuantity}</span>
                                        <button className="btn btn-icon btn-secondary" onClick={() => setCustomQuantity(customQuantity + 1)}>+</button>
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Notas especiales</label>
                                    <input type="text" className="form-input"
                                        placeholder="Ej: sin cebolla, extra queso..."
                                        value={customNotes} onChange={e => setCustomNotes(e.target.value)} />
                                </div>
                                <div className="flex justify-between items-center" style={{ padding: 'var(--spacing-md)', background: 'var(--bg-tertiary)', borderRadius: 'var(--border-radius)' }}>
                                    <span>Subtotal</span>
                                    <span className="text-xl font-bold">${(customizingProduct.price * customQuantity).toFixed(2)}</span>
                                </div>
                                <button className="btn btn-primary btn-lg w-full" onClick={confirmAddProduct}>Agregar a la orden</button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Payment modal */}
            {
                showPaymentModal && (
                    <div className="modal-overlay" onClick={() => { setShowPaymentModal(false); setPayingOpenOrderId(null) }}>
                        <div className="payment-modal" onClick={e => e.stopPropagation()}>
                            <div className="payment-modal-header">
                                <button className="payment-close-btn" onClick={() => { setShowPaymentModal(false); setPayingOpenOrderId(null) }}>
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                    </svg>
                                </button>
                                <div className="payment-amount-label">{alreadyPaidAmount > 0 ? 'Restante a cobrar' : 'Total a cobrar'}</div>
                                <div className="payment-amount">${payingTotal.toFixed(2)}</div>
                                {payingOrder && alreadyPaidAmount > 0 && (
                                    <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.8)', marginTop: 2 }}>
                                        Total: ${(payingTotal + alreadyPaidAmount).toFixed(2)} — Ya pagado: ${alreadyPaidAmount.toFixed(2)}
                                    </div>
                                )}
                                {payingOrder && <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>Orden: {payingOrder.table_number || payingOrder.folio}</div>}
                            </div>
                            <div className="payment-modal-body">
                                {!payingOpenOrderId && (
                                    <div className="pos-service-type">
                                        <label className="service-type-label">Tipo de servicio</label>
                                        <div className="service-type-buttons">
                                            <button className={`service-type-btn ${serviceType === 'dine_in' ? 'active' : ''}`} onClick={() => setServiceType('dine_in')}>En local</button>
                                            <button className={`service-type-btn ${serviceType === 'takeaway' ? 'active' : ''}`} onClick={() => setServiceType('takeaway')}>Para llevar</button>
                                            <button className={`service-type-btn ${serviceType === 'delivery' ? 'active' : ''}`} onClick={() => setServiceType('delivery')}>Domicilio</button>
                                        </div>
                                    </div>
                                )}
                                {!payingOpenOrderId && (
                                    <div className="pos-discount-section">
                                        <button className="discount-toggle-btn" onClick={() => setShowDiscountSection(!showDiscountSection)}>
                                            <span>Descuento</span>
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                                                style={{ transform: showDiscountSection ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>
                                                <polyline points="6 9 12 15 18 9" />
                                            </svg>
                                        </button>
                                        {showDiscountSection && (
                                            <div className="discount-content">
                                                <div className="discount-type-toggle">
                                                    <button className={`discount-type-btn ${discountType === 'percent' ? 'active' : ''}`} onClick={() => setDiscountType('percent')}>%</button>
                                                    <button className={`discount-type-btn ${discountType === 'fixed' ? 'active' : ''}`} onClick={() => setDiscountType('fixed')}>$</button>
                                                </div>
                                                <input type="number" className="discount-value-input"
                                                    placeholder={discountType === 'percent' ? 'Porcentaje' : 'Monto'}
                                                    value={discountValue} onChange={e => setDiscountValue(e.target.value)}
                                                    min="0" max={discountType === 'percent' ? '100' : subtotal.toString()} step="0.01" />
                                                <input type="text" className="discount-reason-input"
                                                    placeholder="Motivo del descuento (obligatorio)"
                                                    value={discountReason} onChange={e => setDiscountReason(e.target.value)} />
                                                {discountAmount > 0 && (
                                                    <div className="discount-preview">Subtotal: ${subtotal.toFixed(2)} - ${discountAmount.toFixed(2)} = ${total.toFixed(2)}</div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                                <div className="payment-methods">
                                    <div className="payment-methods-label">Método de pago</div>
                                    <div className="payment-methods-grid">
                                        <button className={`payment-method-card ${paymentMethod === 'cash' ? 'active' : ''}`} onClick={() => setPaymentMethod('cash')}>
                                            <div className="payment-method-icon">
                                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="3" /><path d="M6 12h.01M18 12h.01" /></svg>
                                            </div>
                                            <span className="payment-method-name">Efectivo</span>
                                        </button>
                                        <button className={`payment-method-card ${paymentMethod === 'card' ? 'active' : ''}`} onClick={() => setPaymentMethod('card')}>
                                            <div className="payment-method-icon">
                                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /></svg>
                                            </div>
                                            <span className="payment-method-name">Tarjeta</span>
                                        </button>
                                        <button className={`payment-method-card ${paymentMethod === 'transfer' ? 'active' : ''}`} onClick={() => setPaymentMethod('transfer')}>
                                            <div className="payment-method-icon">
                                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" /><circle cx="12" cy="12" r="3" /></svg>
                                            </div>
                                            <span className="payment-method-name">Transferencia</span>
                                        </button>
                                    </div>
                                </div>
                                {paymentMethod === 'cash' && (
                                    <div className="pos-change-calc">
                                        <label className="change-calc-label">Efectivo recibido</label>
                                        <input type="text" inputMode="decimal" className="change-calc-input" placeholder="0.00"
                                            value={cashReceived} onChange={e => { const v = e.target.value.replace(/[^0-9.]/g, ''); setCashReceived(v) }} />
                                        {parseFloat(cashReceived) >= payingTotal && (
                                            <div className="change-calc-result">
                                                Cambio: <span className="change-amount">${(parseFloat(cashReceived) - payingTotal).toFixed(2)}</span>
                                            </div>
                                        )}
                                    </div>
                                )}
                                <button className="payment-confirm-btn" onClick={handlePayment} disabled={processing}>
                                    {processing ? (
                                        <>
                                            <svg className="payment-spinner" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <circle cx="12" cy="12" r="10" opacity="0.25" /><path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
                                            </svg>
                                            Procesando...
                                        </>
                                    ) : (
                                        <>
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <polyline points="20 6 9 17 4 12" />
                                            </svg>
                                            Confirmar pago
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Post-payment confirmation */}
            {
                showConfirmation && completedOrder && (
                    <div className="modal-overlay" style={{ zIndex: 9999 }}>
                        <div className="pos-confirmation">
                            <div className="pos-confirmation-check">
                                <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                                </svg>
                            </div>
                            <h2 className="pos-confirmation-title">Venta completada</h2>
                            <div className="pos-confirmation-folio">{completedOrder.folio}</div>
                            <div className="pos-confirmation-date">
                                {new Date(completedOrder.date).toLocaleDateString('es-MX')} {new Date(completedOrder.date).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                            <div className="pos-confirmation-summary">
                                {completedOrder.items.map((item, idx) => (
                                    <div key={idx} className="confirmation-item">
                                        <span className="item-qty">{item.quantity}x</span>
                                        <span className="item-name">{item.product.name}</span>
                                        <span className="item-total">${(item.product.price * item.quantity).toFixed(2)}</span>
                                    </div>
                                ))}
                                <div className="confirmation-divider" />
                                <div className="confirmation-total-row"><span>Subtotal</span><span>${completedOrder.subtotal.toFixed(2)}</span></div>
                                {completedOrder.discountAmount > 0 && (
                                    <div className="confirmation-total-row">
                                        <span>Descuento ({completedOrder.discountReason})</span>
                                        <span>-${completedOrder.discountAmount.toFixed(2)}</span>
                                    </div>
                                )}
                                <div className="confirmation-total-row total"><span>TOTAL</span><span>${completedOrder.total.toFixed(2)}</span></div>
                                <div className="confirmation-payment-info">
                                    Método: {completedOrder.paymentMethod === 'cash' ? 'Efectivo' : completedOrder.paymentMethod === 'card' ? 'Tarjeta' : 'Transferencia'}
                                </div>
                                {completedOrder.paymentMethod === 'cash' && completedOrder.cashReceived && (
                                    <div className="confirmation-payment-info">
                                        Recibido: ${completedOrder.cashReceived.toFixed(2)} | Cambio: ${(completedOrder.changeAmount || 0).toFixed(2)}
                                    </div>
                                )}
                            </div>
                            <div className="pos-confirmation-actions">
                                <button className="btn-confirmation-print" onClick={() => window.print()}>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" />
                                    </svg>
                                    Imprimir ticket
                                </button>
                                <button className="btn-confirmation-new" onClick={() => { setShowConfirmation(false); setCompletedOrder(null) }}>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                                    </svg>
                                    Nueva venta
                                </button>
                            </div>
                            <Link href={`/dashboard/orders?open=${completedOrder.orderId}`} className="pos-confirmation-link">
                                Ver orden en detalle
                            </Link>
                        </div>
                    </div>
                )
            }

            {/* Ticket for printing */}
            {
                completedOrder && (
                    <TicketPreview businessName={businessName} folio={completedOrder.folio} date={completedOrder.date}
                        serviceType={completedOrder.serviceType}
                        items={completedOrder.items.map(item => ({ name: item.product.name, quantity: item.quantity, price: item.product.price, notes: item.notes }))}
                        subtotal={completedOrder.subtotal} discountAmount={completedOrder.discountAmount}
                        discountReason={completedOrder.discountReason} total={completedOrder.total}
                        paymentMethod={completedOrder.paymentMethod}
                        cashReceived={completedOrder.cashReceived} changeAmount={completedOrder.changeAmount} />
                )
            }

            {/* Toast */}
            {
                toast && (
                    <div className={`toast ${toast.type === 'error' ? 'toast-error' : 'toast-success'}`}>{toast.message}</div>
                )
            }

            {/* Limit modal */}
            {
                showLimitModal && limitInfo && (
                    <div className="modal-overlay" onClick={() => setShowLimitModal(false)}>
                        <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
                            <div className="modal-header">
                                <h2 className="modal-title">Límite alcanzado</h2>
                                <button className="btn-close" onClick={() => setShowLimitModal(false)}>×</button>
                            </div>
                            <div className="limit-modal-body">
                                <div className="limit-modal-icon">🚫</div>
                                <h3 className="limit-modal-title">Límite de {getLimitLabel('orders_day')}</h3>
                                <p className="limit-modal-text">Has alcanzado el máximo de ventas diarias de tu plan.</p>
                                <div className="limit-modal-counter">{limitInfo.current} / {limitInfo.limit}</div>
                                <p className="limit-modal-help">Contacta soporte para ampliar tu plan.</p>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Cancel order confirmation */}
            {
                cancellingOrder && (
                    <div className="modal-overlay" onClick={() => setCancellingOrder(null)}>
                        <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px' }}>
                            <div className="modal-header">
                                <h2 className="modal-title">Cancelar orden</h2>
                                <button className="btn-close" onClick={() => setCancellingOrder(null)}>×</button>
                            </div>
                            <div className="modal-body">
                                <div style={{ textAlign: 'center', marginBottom: 'var(--spacing-md)' }}>
                                    <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>⚠️</div>
                                    <p style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text-primary)' }}>
                                        {cancellingOrder.table_number || `#${cancellingOrder.folio}`}
                                    </p>
                                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                        {cancellingOrder.items.length} items · ${cancellingOrder.items.reduce((s, i) => s + i.price_snapshot * i.quantity, 0).toFixed(2)}
                                    </p>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Motivo de cancelación (obligatorio)</label>
                                    <input type="text" className="form-input"
                                        placeholder="Ej: cliente canceló, error de captura..."
                                        value={cancelReason}
                                        onChange={e => setCancelReason(e.target.value)}
                                        autoFocus />
                                </div>
                                <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
                                    <button className="btn btn-secondary w-full" onClick={() => setCancellingOrder(null)}>
                                        No, volver
                                    </button>
                                    <button className="btn w-full"
                                        style={{ background: '#dc2626', color: '#fff', border: 'none' }}
                                        disabled={!cancelReason.trim() || processing}
                                        onClick={handleCancelOrder}>
                                        {processing ? 'Cancelando...' : 'Sí, cancelar orden'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    )
}
