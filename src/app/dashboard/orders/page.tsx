'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useBusiness } from '@/lib/context/BusinessContext'
import TicketPreview from '../pos/TicketPreview'

interface OrderItem {
    id: string
    name_snapshot: string
    price_snapshot: number
    quantity: number
    notes: string | null
}

interface Order {
    id: string
    folio: string
    status: string
    total_snapshot: number | null
    subtotal_snapshot: number | null
    discount_amount: number | null
    service_type: string
    table_number: string | null
    notes: string | null
    created_at: string
}

interface Payment {
    id: string
    order_id: string
    amount: number
    method: string
    status: string
    cash_register_id: string
    created_at: string
}

interface CashRegister {
    id: string
    status: string
}

export default function OrdersPage() {
    const { businessId, loading: businessLoading } = useBusiness()
    const [orders, setOrders] = useState<Order[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
    const [orderItems, setOrderItems] = useState<OrderItem[]>([])
    const [loadingItems, setLoadingItems] = useState(false)

    // Payments and actions
    const [payments, setPayments] = useState<Payment[]>([])
    const [paidPayment, setPaidPayment] = useState<Payment | null>(null)
    const [currentCashRegister, setCurrentCashRegister] = useState<CashRegister | null>(null)
    const [actionProcessing, setActionProcessing] = useState(false)

    // Modals
    const [showCancelModal, setShowCancelModal] = useState(false)
    const [showVoidModal, setShowVoidModal] = useState(false)
    const [showRefundModal, setShowRefundModal] = useState(false)
    const [cancelReason, setCancelReason] = useState('')
    const [voidReason, setVoidReason] = useState('')
    const [refundReason, setRefundReason] = useState('')

    // Ticket reprint
    const [businessName, setBusinessName] = useState('')
    const [showTicketPreview, setShowTicketPreview] = useState(false)

    const supabase = createClient()

    useEffect(() => {
        if (businessLoading || !businessId) return

        loadOrders()
    }, [businessLoading, businessId])

    // Cargar cash register actual
    useEffect(() => {
        if (!businessId) return

        const loadCashRegister = async () => {
            const { data } = await supabase
                .from('cash_registers')
                .select('id, status')
                .eq('business_id', businessId)
                .eq('status', 'open')
                .limit(1)
                .single()

            setCurrentCashRegister(data)
        }

        loadCashRegister()
    }, [businessId])

    // Cargar business name para ticket
    useEffect(() => {
        if (!businessId) return

        const loadBusinessName = async () => {
            const { data } = await supabase
                .from('businesses')
                .select('name')
                .eq('id', businessId)
                .single()

            if (data) setBusinessName(data.name)
        }

        loadBusinessName()
    }, [businessId])

    const loadOrders = async () => {
        if (!businessId) return

        const { data } = await supabase
            .from('orders')
            .select('*')
            .eq('business_id', businessId)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .limit(50)

        setOrders(data || [])
        setLoading(false)
    }

    const openOrderDetail = async (order: Order) => {
        setSelectedOrder(order)
        setLoadingItems(true)

        // Cargar items
        const { data: items } = await supabase
            .from('order_items')
            .select('*')
            .eq('order_id', order.id)

        // Cargar payments (TODOS, no single)
        const { data: paymentList } = await supabase
            .from('payments')
            .select('*')
            .eq('order_id', order.id)
            .order('created_at', { ascending: false })

        setOrderItems(items || [])
        setPayments(paymentList || [])

        // Derivar paidPayment
        const paid = paymentList?.find(p => p.status === 'paid') || null
        setPaidPayment(paid)

        setLoadingItems(false)
    }

    const closeOrderDetail = () => {
        setSelectedOrder(null)
        setOrderItems([])
        setPayments([])
        setPaidPayment(null)
        setShowTicketPreview(false)
    }

    // Toast helper
    const showToast = (message: string) => {
        alert(message) // Temporal - reemplazar con tu sistema de toasts
    }

    // Condiciones de visibilidad (CORREGIDAS para operación real)
    const canCancel = (selectedOrder?.status === 'OPEN' || selectedOrder?.status === 'IN_PREP') && !paidPayment
    const canVoid = !!paidPayment && !!currentCashRegister && paidPayment.cash_register_id === currentCashRegister.id
    const canRefund = !!paidPayment && (!currentCashRegister || paidPayment.cash_register_id !== currentCashRegister.id)
    const canReprint = selectedOrder?.status !== 'CANCELLED' && paidPayment

    // Acción: Cancelar orden (RPC)
    const handleCancelOrder = async () => {
        if (!selectedOrder || !cancelReason.trim()) {
            showToast('Ingresa el motivo de cancelación')
            return
        }

        setActionProcessing(true)

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            setActionProcessing(false)
            return
        }

        const { data, error } = await supabase.rpc('cancel_order', {
            p_order_id: selectedOrder.id,
            p_cancel_reason: cancelReason.trim(),
            p_user_id: user.id
        })

        if (error) {
            showToast('Error al cancelar: ' + error.message)
            setActionProcessing(false)
            return
        }

        showToast(`Orden ${data.folio} cancelada`)
        setShowCancelModal(false)
        setCancelReason('')
        setActionProcessing(false)
        closeOrderDetail()
        loadOrders()
    }

    // Acción: Void payment (RPC)
    const handleVoidPayment = async () => {
        if (!paidPayment || !voidReason.trim()) {
            showToast('Ingresa el motivo del void')
            return
        }

        setActionProcessing(true)

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            setActionProcessing(false)
            return
        }

        const { data, error } = await supabase.rpc('void_payment', {
            p_payment_id: paidPayment.id,
            p_void_reason: voidReason.trim(),
            p_user_id: user.id
        })

        if (error) {
            showToast('Error al void: ' + error.message)
            setActionProcessing(false)
            return
        }

        showToast(`Pago anulado - ${data.folio}`)
        setShowVoidModal(false)
        setVoidReason('')
        setActionProcessing(false)
        closeOrderDetail()
        loadOrders()
    }

    // Acción: Refund payment (RPC)
    const handleRefundPayment = async () => {
        if (!paidPayment || !refundReason.trim()) {
            showToast('Ingresa el motivo del refund')
            return
        }

        setActionProcessing(true)

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            setActionProcessing(false)
            return
        }

        const { data, error } = await supabase.rpc('refund_payment', {
            p_payment_id: paidPayment.id,
            p_refund_reason: refundReason.trim(),
            p_user_id: user.id
        })

        if (error) {
            showToast('Error al refund: ' + error.message)
            setActionProcessing(false)
            return
        }

        showToast(`Reembolso procesado - ${data.folio}`)
        setShowRefundModal(false)
        setRefundReason('')
        setActionProcessing(false)
        closeOrderDetail()
        loadOrders()
    }

    // Acción: Reimprimir ticket (CORREGIDO: renderiza ticket real)
    const handleReprintTicket = () => {
        // Mostrar el TicketPreview y luego imprimir
        setShowTicketPreview(true)

        // Esperar render y luego imprimir
        setTimeout(() => {
            window.print()
        }, 100)
    }

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'OPEN': return 'var(--color-primary)'
            case 'IN_PREP': return 'var(--color-warning)'
            case 'READY': return 'var(--color-success)'
            case 'DELIVERED': return 'var(--color-success)'
            case 'CLOSED': return 'var(--text-muted)'
            case 'CANCELLED': return 'var(--color-danger)'
            default: return 'var(--text-muted)'
        }
    }

    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'OPEN': return 'Abierta'
            case 'IN_PREP': return 'Preparando'
            case 'READY': return 'Lista'
            case 'DELIVERED': return 'Entregada'
            case 'CLOSED': return 'Cerrada'
            case 'CANCELLED': return 'Cancelada'
            default: return status
        }
    }

    const getServiceTypeLabel = (type: string) => {
        switch (type) {
            case 'dine_in': return 'En local'
            case 'takeaway': return 'Para llevar'
            case 'delivery': return 'Domicilio'
            default: return type
        }
    }

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr)
        return date.toLocaleDateString('es-MX', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        })
    }

    if (businessLoading || loading) {
        return (
            <div className="page-loading">
                <p className="text-muted">Cargando órdenes...</p>
            </div>
        )
    }

    return (
        <div className="page-container">
            <div className="page-header">
                <h1 className="page-title">Órdenes</h1>
            </div>

            {orders.length === 0 ? (
                <div className="empty-state">
                    <p className="text-muted">No hay órdenes</p>
                    <p className="text-sm text-muted">Las órdenes aparecerán aquí</p>
                </div>
            ) : (
                <div className="product-list">
                    {orders.map((order) => (
                        <div
                            key={order.id}
                            className="product-card"
                            onClick={() => openOrderDetail(order)}
                            style={{ cursor: 'pointer' }}
                        >
                            <div className="product-info">
                                <span className="product-name">#{order.folio}</span>
                                <span
                                    className="product-category"
                                    style={{ color: getStatusColor(order.status) }}
                                >
                                    {getStatusLabel(order.status)} • {formatDate(order.created_at)}
                                </span>
                            </div>
                            <div className="product-price">
                                ${(order.total_snapshot ?? 0).toFixed(2)}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Modal de detalle de orden */}
            {selectedOrder && (
                <div className="modal-overlay" onClick={closeOrderDetail}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <div>
                                <h2 className="modal-title">#{selectedOrder.folio}</h2>
                                <span
                                    className="text-sm"
                                    style={{ color: getStatusColor(selectedOrder.status) }}
                                >
                                    {getStatusLabel(selectedOrder.status)}
                                </span>
                            </div>
                            <button className="btn-close" onClick={closeOrderDetail}>
                                ×
                            </button>
                        </div>

                        <div className="modal-body">
                            {/* Info de la orden */}
                            <div className="flex gap-md text-sm text-muted" style={{ marginBottom: 'var(--spacing-md)' }}>
                                <span>{getServiceTypeLabel(selectedOrder.service_type)}</span>
                                {selectedOrder.table_number && (
                                    <span>• Mesa {selectedOrder.table_number}</span>
                                )}
                                <span>• {formatDate(selectedOrder.created_at)}</span>
                            </div>

                            {/* Items de la orden */}
                            {loadingItems ? (
                                <p className="text-muted text-center">Cargando...</p>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
                                    {orderItems.map(item => (
                                        <div key={item.id} className="order-item">
                                            <div className="order-item-info">
                                                <div className="order-item-name">
                                                    {item.quantity}x {item.name_snapshot}
                                                </div>
                                                {item.notes && (
                                                    <div className="order-item-notes">{item.notes}</div>
                                                )}
                                            </div>
                                            <div className="order-item-price">
                                                ${(item.price_snapshot * item.quantity).toFixed(2)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Notas de la orden */}
                            {selectedOrder.notes && (
                                <div style={{
                                    marginTop: 'var(--spacing-md)',
                                    padding: 'var(--spacing-sm)',
                                    background: 'var(--bg-tertiary)',
                                    borderRadius: 'var(--border-radius)',
                                    fontSize: 'var(--font-size-sm)'
                                }}>
                                    <strong>Notas:</strong> {selectedOrder.notes}
                                </div>
                            )}

                            {/* Total */}
                            <div className="order-total" style={{ marginTop: 'var(--spacing-lg)' }}>
                                <span>Total</span>
                                <span>${(selectedOrder.total_snapshot ?? 0).toFixed(2)}</span>
                            </div>

                            {/* Botones de acción */}
                            {(canCancel || canVoid || canRefund || canReprint) && (
                                <div style={{
                                    marginTop: 'var(--spacing-lg)',
                                    paddingTop: 'var(--spacing-md)',
                                    borderTop: '1px solid var(--border-color)',
                                    display: 'flex',
                                    gap: 'var(--spacing-sm)',
                                    flexWrap: 'wrap'
                                }}>
                                    {canCancel && (
                                        <button
                                            className="btn-secondary"
                                            onClick={() => setShowCancelModal(true)}
                                            disabled={actionProcessing}
                                        >
                                            Cancelar orden
                                        </button>
                                    )}
                                    {canVoid && (
                                        <button
                                            className="btn-secondary"
                                            onClick={() => setShowVoidModal(true)}
                                            disabled={actionProcessing}
                                        >
                                            Void (Anular)
                                        </button>
                                    )}
                                    {canRefund && (
                                        <button
                                            className="btn-secondary"
                                            onClick={() => setShowRefundModal(true)}
                                            disabled={actionProcessing}
                                        >
                                            Refund (Reembolso)
                                        </button>
                                    )}
                                    {canReprint && (
                                        <button
                                            className="btn-primary"
                                            onClick={handleReprintTicket}
                                            disabled={actionProcessing}
                                        >
                                            Reimprimir ticket
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: Cancelar orden */}
            {showCancelModal && (
                <div className="modal-overlay" onClick={() => setShowCancelModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
                        <div className="modal-header">
                            <h2 className="modal-title">Cancelar orden</h2>
                            <button className="btn-close" onClick={() => setShowCancelModal(false)}>×</button>
                        </div>
                        <div className="modal-body">
                            <p className="text-sm text-muted" style={{ marginBottom: 'var(--spacing-md)' }}>
                                Orden: <strong>#{selectedOrder?.folio}</strong>
                            </p>
                            <label className="form-label">Motivo (obligatorio)</label>
                            <textarea
                                className="form-input"
                                value={cancelReason}
                                onChange={e => setCancelReason(e.target.value)}
                                placeholder="Explica por qué se cancela esta orden..."
                                rows={3}
                                style={{ width: '100%', resize: 'none' }}
                            />
                            <div style={{ marginTop: 'var(--spacing-md)', display: 'flex', gap: 'var(--spacing-sm)' }}>
                                <button
                                    className="btn-secondary"
                                    onClick={() => setShowCancelModal(false)}
                                    disabled={actionProcessing}
                                    style={{ flex: 1 }}
                                >
                                    Volver
                                </button>
                                <button
                                    className="btn-primary"
                                    onClick={handleCancelOrder}
                                    disabled={actionProcessing || !cancelReason.trim()}
                                    style={{ flex: 1 }}
                                >
                                    {actionProcessing ? 'Procesando...' : 'Confirmar cancelación'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: Void payment */}
            {showVoidModal && (
                <div className="modal-overlay" onClick={() => setShowVoidModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
                        <div className="modal-header">
                            <h2 className="modal-title">Void (Anular pago)</h2>
                            <button className="btn-close" onClick={() => setShowVoidModal(false)}>×</button>
                        </div>
                        <div className="modal-body">
                            <p className="text-sm text-muted" style={{ marginBottom: 'var(--spacing-md)' }}>
                                Orden: <strong>#{selectedOrder?.folio}</strong><br />
                                Monto: <strong>${paidPayment?.amount.toFixed(2)}</strong>
                            </p>
                            <label className="form-label">Motivo (obligatorio)</label>
                            <textarea
                                className="form-input"
                                value={voidReason}
                                onChange={e => setVoidReason(e.target.value)}
                                placeholder="Explica por qué se anula este pago..."
                                rows={3}
                                style={{ width: '100%', resize: 'none' }}
                            />
                            <div style={{ marginTop: 'var(--spacing-md)', display: 'flex', gap: 'var(--spacing-sm)' }}>
                                <button
                                    className="btn-secondary"
                                    onClick={() => setShowVoidModal(false)}
                                    disabled={actionProcessing}
                                    style={{ flex: 1 }}
                                >
                                    Volver
                                </button>
                                <button
                                    className="btn-primary"
                                    onClick={handleVoidPayment}
                                    disabled={actionProcessing || !voidReason.trim()}
                                    style={{ flex: 1 }}
                                >
                                    {actionProcessing ? 'Procesando...' : 'Confirmar void'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: Refund payment */}
            {showRefundModal && (
                <div className="modal-overlay" onClick={() => setShowRefundModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
                        <div className="modal-header">
                            <h2 className="modal-title">Refund (Reembolso)</h2>
                            <button className="btn-close" onClick={() => setShowRefundModal(false)}>×</button>
                        </div>
                        <div className="modal-body">
                            <p className="text-sm text-muted" style={{ marginBottom: 'var(--spacing-md)' }}>
                                Orden: <strong>#{selectedOrder?.folio}</strong><br />
                                Monto: <strong>${paidPayment?.amount.toFixed(2)}</strong>
                            </p>
                            <label className="form-label">Motivo (obligatorio)</label>
                            <textarea
                                className="form-input"
                                value={refundReason}
                                onChange={e => setRefundReason(e.target.value)}
                                placeholder="Explica por qué se reembolsa este pago..."
                                rows={3}
                                style={{ width: '100%', resize: 'none' }}
                            />
                            <div style={{ marginTop: 'var(--spacing-md)', display: 'flex', gap: 'var(--spacing-sm)' }}>
                                <button
                                    className="btn-secondary"
                                    onClick={() => setShowRefundModal(false)}
                                    disabled={actionProcessing}
                                    style={{ flex: 1 }}
                                >
                                    Volver
                                </button>
                                <button
                                    className="btn-primary"
                                    onClick={handleRefundPayment}
                                    disabled={actionProcessing || !refundReason.trim()}
                                    style={{ flex: 1 }}
                                >
                                    {actionProcessing ? 'Procesando...' : 'Confirmar refund'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* TicketPreview para reimprimir */}
            {showTicketPreview && selectedOrder && paidPayment && (
                <TicketPreview
                    businessName={businessName}
                    folio={selectedOrder.folio}
                    date={selectedOrder.created_at}
                    serviceType={selectedOrder.service_type as 'dine_in' | 'takeaway' | 'delivery'}
                    items={orderItems.map(item => ({
                        name: item.name_snapshot,
                        quantity: item.quantity,
                        price: item.price_snapshot,
                        notes: item.notes || undefined
                    }))}
                    subtotal={selectedOrder.subtotal_snapshot ?? 0}
                    discountAmount={selectedOrder.discount_amount ?? 0}
                    total={selectedOrder.total_snapshot ?? 0}
                    paymentMethod={paidPayment.method as 'cash' | 'card' | 'transfer'}
                    cashierName="Sistema"
                />
            )}
        </div>
    )
}
