'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Product, Category, CashRegister, PaymentMethod } from '@/lib/types'
import { checkLimit, getLimitLabel, LimitResult } from '@/lib/limits'
import TicketPreview from './TicketPreview'

interface OrderItem {
    product: Product
    quantity: number
    notes?: string
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

export default function POSPage() {
    const [categories, setCategories] = useState<Category[]>([])
    const [products, setProducts] = useState<Product[]>([])
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
    const [orderItems, setOrderItems] = useState<OrderItem[]>([])
    const [cashRegister, setCashRegister] = useState<CashRegister | null>(null)
    const [loading, setLoading] = useState(true)
    const [showPaymentModal, setShowPaymentModal] = useState(false)
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
    const [processing, setProcessing] = useState(false)
    const [businessId, setBusinessId] = useState<string>('')

    // Estado para modal de personalización
    const [showCustomizeModal, setShowCustomizeModal] = useState(false)
    const [customizingProduct, setCustomizingProduct] = useState<Product | null>(null)
    const [customQuantity, setCustomQuantity] = useState(1)
    const [customNotes, setCustomNotes] = useState('')

    // Estado para panel colapsable en móvil
    const [orderPanelCollapsed, setOrderPanelCollapsed] = useState(false)

    // Fase 1: Nuevos estados
    const [serviceType, setServiceType] = useState<ServiceType>('dine_in')
    const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('percent')
    const [discountValue, setDiscountValue] = useState('')
    const [discountReason, setDiscountReason] = useState('')
    const [cashReceived, setCashReceived] = useState('')
    const [showConfirmation, setShowConfirmation] = useState(false)
    const [completedOrder, setCompletedOrder] = useState<CompletedOrder | null>(null)
    const [operationMode, setOperationMode] = useState<'restaurant' | 'counter'>('restaurant')
    const [businessName, setBusinessName] = useState('')
    const [showDiscountSection, setShowDiscountSection] = useState(false)

    // Estado para toast notification
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
    const [limitInfo, setLimitInfo] = useState<LimitResult | null>(null)
    const [showLimitModal, setShowLimitModal] = useState(false)


    const showToast = (message: string, type: 'success' | 'error' = 'success') => {
        setToast({ message, type })
        setTimeout(() => setToast(null), 3000)
    }

    const supabase = createClient()

    // Calcular subtotal
    const subtotal = orderItems.reduce(
        (sum, item) => sum + item.product.price * item.quantity,
        0
    )

    // Calcular monto de descuento
    const discountAmount = useMemo(() => {
        const value = parseFloat(discountValue) || 0
        if (value <= 0) return 0

        if (discountType === 'percent') {
            return Math.min(subtotal, subtotal * (value / 100))
        } else {
            return Math.min(subtotal, value)
        }
    }, [discountType, discountValue, subtotal])

    const total = subtotal - discountAmount
    const changeAmount = paymentMethod === 'cash'
        ? Math.max(0, (parseFloat(cashReceived) || 0) - total)
        : 0

    const loadData = useCallback(async () => {
        setLoading(true)

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data: membership } = await supabase
            .from('business_memberships')
            .select('business_id')
            .eq('user_id', user.id)
            .single()

        if (!membership) return
        setBusinessId(membership.business_id)

        // Cargar configuración del negocio
        const { data: business } = await supabase
            .from('businesses')
            .select('operation_mode, name')
            .eq('id', membership.business_id)
            .single()

        if (business) {
            setOperationMode((business.operation_mode as 'restaurant' | 'counter') || 'restaurant')
            setBusinessName(business.name || '')
        }

        // Cargar caja abierta del USUARIO actual (turno personal)
        const { data: register } = await supabase
            .from('cash_registers')
            .select('*')
            .eq('business_id', membership.business_id)
            .eq('opened_by', user.id)
            .eq('status', 'open')
            .is('deleted_at', null)
            .single()

        setCashRegister(register)

        // Cargar categorías
        const { data: cats } = await supabase
            .from('categories')
            .select('*')
            .eq('business_id', membership.business_id)
            .order('position')

        setCategories(cats || [])

        // Cargar productos (simplificado - sin join a inventory)
        const { data: prods } = await supabase
            .from('products')
            .select('*')
            .eq('business_id', membership.business_id)
            .is('deleted_at', null)
            .order('name')

        setProducts(prods || [])

        setLoading(false)
    }, [supabase])

    useEffect(() => {
        loadData()
    }, [loadData])

    const filteredProducts = selectedCategory
        ? products.filter(p => p.category_id === selectedCategory)
        : products

    // Abrir modal de personalización
    const openCustomizeModal = (product: Product) => {
        setCustomizingProduct(product)
        setCustomQuantity(1)
        setCustomNotes('')
        setShowCustomizeModal(true)
    }

    // Confirmar agregar producto personalizado
    const confirmAddProduct = () => {
        if (!customizingProduct) return

        const newItem: OrderItem = {
            product: customizingProduct,
            quantity: customQuantity,
            notes: customNotes.trim() || undefined,
        }

        setOrderItems(prev => {
            // Si no tiene notas, combinar con existentes
            if (!newItem.notes) {
                const existing = prev.find(i =>
                    i.product.id === customizingProduct.id &&
                    !i.notes
                )
                if (existing) {
                    return prev.map(i =>
                        i === existing
                            ? { ...i, quantity: i.quantity + customQuantity }
                            : i
                    )
                }
            }
            return [...prev, newItem]
        })

        setShowCustomizeModal(false)
        // Expandir panel de orden en móvil
        setOrderPanelCollapsed(false)
    }

    const updateQuantity = (index: number, delta: number) => {
        setOrderItems(prev => {
            return prev
                .map((item, i) =>
                    i === index
                        ? { ...item, quantity: item.quantity + delta }
                        : item
                )
                .filter(item => item.quantity > 0)
        })
    }

    const removeItem = (index: number) => {
        setOrderItems(prev => prev.filter((_, i) => i !== index))
    }

    const itemCount = orderItems.reduce((sum, item) => sum + item.quantity, 0)

    // Formatear notas para guardar en BD
    const formatNotesForDB = (item: OrderItem): string | undefined => {
        return item.notes || undefined
    }

    const handlePayment = async () => {
        if (!cashRegister) {
            showToast('Debes abrir caja antes de cobrar', 'error')
            return
        }

        if (orderItems.length === 0) return

        // Check daily order limit
        const limitResult = await checkLimit(supabase, businessId, 'orders_day')
        if (!limitResult.allowed) {
            setLimitInfo(limitResult)
            setShowLimitModal(true)
            return
        }

        // Validar descuento tiene motivo si hay monto
        if (discountAmount > 0 && !discountReason.trim()) {
            showToast('Ingresa el motivo del descuento', 'error')
            return
        }

        setProcessing(true)

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            setProcessing(false)
            return
        }

        // Obtener folio
        const { data: folioData } = await supabase.rpc('get_next_folio', {
            p_business_id: businessId
        })
        const folio = folioData || `GOS-${Date.now()}`

        // Determinar status inicial según operation_mode
        // Restaurant -> IN_PREP (va a cocina)
        // Counter ->READY (sin cocina, puede cerrarse directo)
        const initialStatus = operationMode === 'restaurant' ? 'IN_PREP' : 'READY'

        // Crear orden
        const { data: order, error: orderError } = await supabase
            .from('orders')
            .insert({
                business_id: businessId,
                folio,
                status: initialStatus,
                service_type: serviceType,
                subtotal_snapshot: subtotal,
                discount_amount: discountAmount,
                discount_reason: discountReason.trim() || null,
                total_snapshot: total,
                created_by: user.id,
            })
            .select()
            .single()

        if (orderError || !order) {
            showToast('Error al crear orden: ' + orderError?.message, 'error')
            setProcessing(false)
            return
        }

        // Crear items con notas formateadas
        const items = orderItems.map(item => ({
            order_id: order.id,
            business_id: businessId,
            product_id: item.product.id,
            name_snapshot: item.product.name,
            price_snapshot: item.product.price,
            quantity: item.quantity,
            notes: formatNotesForDB(item),
        }))

        const { error: itemsError } = await supabase
            .from('order_items')
            .insert(items)

        if (itemsError) {
            showToast('Error al crear items: ' + itemsError.message, 'error')
            setProcessing(false)
            return
        }

        // Crear pago
        const { error: paymentError } = await supabase
            .from('payments')
            .insert({
                order_id: order.id,
                business_id: businessId,
                cash_register_id: cashRegister.id,
                amount: total,
                method: paymentMethod,
                status: 'paid',
                paid_at: new Date().toISOString(),
                created_by: user.id,
            })

        if (paymentError) {
            showToast('Error al crear pago: ' + paymentError.message, 'error')
            setProcessing(false)
            return
        }

        // Inventario: el trigger DB trg_auto_inventory_on_payment ya lo hizo
        // al insertar el payment con status='paid' arriba. NO hacemos nada aquí.

        // Mostrar pantalla de confirmación con ticket
        setCompletedOrder({
            folio,
            orderId: order.id,
            items: [...orderItems],
            subtotal,
            discountAmount,
            discountReason: discountReason.trim(),
            total,
            paymentMethod,
            serviceType,
            date: new Date().toISOString(),
            cashReceived: paymentMethod === 'cash' ? parseFloat(cashReceived) || undefined : undefined,
            changeAmount: paymentMethod === 'cash' ? changeAmount : undefined,
        })
        setShowConfirmation(true)
        setOrderItems([])
        setShowPaymentModal(false)
        setProcessing(false)

        // Resetear descuento y form para próxima venta
        setDiscountValue('')
        setDiscountReason('')
        setDiscountType('percent')
        setCashReceived('')
        setShowDiscountSection(false)
    }

    if (loading) {
        return <div className="p-lg">Cargando...</div>
    }

    // Sin caja abierta
    if (!cashRegister) {
        return (
            <div className="flex flex-col items-center justify-center" style={{ height: 'calc(100vh - 100px)' }}>
                <div className="card text-center" style={{ maxWidth: 400 }}>
                    <h2 className="text-xl font-bold mb-md">Sin turno abierto</h2>
                    <p className="text-muted mb-md">
                        Debes abrir tu turno de caja para poder cobrar
                    </p>
                    <a href="/dashboard/cash" className="btn btn-primary btn-lg">
                        Ir a Caja
                    </a>
                </div>
            </div>
        )
    }

    return (
        <div className="pos-layout">
            {/* Productos */}
            <div className="pos-products">
                {/* Header con navegación */}
                {selectedCategory && (
                    <div className="pos-nav-header">
                        <button
                            className="pos-back-btn"
                            onClick={() => setSelectedCategory(null)}
                            title="Volver a categorías"
                        >
                            ‹
                        </button>
                        <span className="category-title">
                            {categories.find(c => c.id === selectedCategory)?.name || 'Productos'}
                        </span>
                    </div>
                )}

                {/* Grid de contenido */}
                <div className="pos-products-scroll">
                    {!selectedCategory ? (
                        /* Vista de categorías */
                        <div className="grid-categories">
                            {categories.map(cat => (
                                <div
                                    key={cat.id}
                                    className="category-card"
                                    onClick={() => setSelectedCategory(cat.id)}
                                >
                                    <div className="category-icon">
                                        {cat.name.charAt(0).toUpperCase()}
                                    </div>
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
                        /* Vista de productos */
                        <div className="grid-products">
                            {filteredProducts.map(product => (
                                <div
                                    key={product.id}
                                    className="pos-product-card"
                                    onClick={() => openCustomizeModal(product)}
                                >
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

            {/* Panel de orden */}
            <div className={`pos-order-panel ${orderPanelCollapsed ? 'collapsed' : ''}`}>
                <div
                    className="pos-order-header"
                    onClick={() => setOrderPanelCollapsed(!orderPanelCollapsed)}
                >
                    <div className="flex items-center gap-sm">
                        <h3 className="font-bold">Orden</h3>
                        {itemCount > 0 && (
                            <span className="text-muted text-sm">({itemCount})</span>
                        )}
                    </div>
                    <div className="flex items-center gap-sm">
                        {orderItems.length > 0 && !orderPanelCollapsed && (
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    setOrderItems([])
                                }}
                            >
                                Limpiar
                            </button>
                        )}
                        <span className="pos-order-toggle mobile-only">
                            {orderPanelCollapsed ? '▲' : '▼'}
                        </span>
                    </div>
                </div>

                <div className="pos-order-items">
                    {orderItems.length === 0 ? (
                        <p className="text-muted text-center">Toca un producto para agregar</p>
                    ) : (
                        orderItems.map((item, index) => (
                            <div key={index} className="order-item">
                                <div className="order-item-info">
                                    <div className="order-item-name">{item.product.name}</div>
                                    {item.notes && (
                                        <div className="order-item-notes">
                                            {item.notes}
                                        </div>
                                    )}
                                    <div className="order-item-price">
                                        ${(item.product.price * item.quantity).toFixed(2)}
                                    </div>
                                </div>
                                <div className="order-item-qty">
                                    <button
                                        className="btn btn-icon btn-secondary"
                                        onClick={() => updateQuantity(index, -1)}
                                    >
                                        −
                                    </button>
                                    <span>{item.quantity}</span>
                                    <button
                                        className="btn btn-icon btn-secondary"
                                        onClick={() => updateQuantity(index, 1)}
                                    >
                                        +
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                <div className="pos-order-footer">
                    <div className="order-total">
                        <span>Total</span>
                        <span>${subtotal.toFixed(2)}</span>
                    </div>
                    <button
                        className="btn btn-primary btn-lg w-full mt-md"
                        disabled={orderItems.length === 0}
                        onClick={() => setShowPaymentModal(true)}
                    >
                        Cobrar
                    </button>
                </div>
            </div>

            {/* Modal de personalización */}
            {showCustomizeModal && customizingProduct && (
                <div className="modal-overlay" onClick={() => setShowCustomizeModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2 className="modal-title">{customizingProduct.name}</h2>
                            <button
                                className="btn-close"
                                onClick={() => setShowCustomizeModal(false)}
                            >
                                ×
                            </button>
                        </div>

                        <div className="modal-body">
                            {/* Precio y cantidad */}
                            <div className="flex justify-between items-center">
                                <span className="text-xl font-bold" style={{ color: 'var(--color-primary)' }}>
                                    ${customizingProduct.price.toFixed(2)}
                                </span>
                                <div className="flex items-center gap-md">
                                    <button
                                        className="btn btn-icon btn-secondary"
                                        onClick={() => setCustomQuantity(Math.max(1, customQuantity - 1))}
                                    >
                                        −
                                    </button>
                                    <span className="text-xl font-bold">{customQuantity}</span>
                                    <button
                                        className="btn btn-icon btn-secondary"
                                        onClick={() => setCustomQuantity(customQuantity + 1)}
                                    >
                                        +
                                    </button>
                                </div>
                            </div>

                            {/* Notas especiales */}
                            <div className="form-group">
                                <label className="form-label">Notas especiales</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="Ej: sin cebolla, extra queso, término 3/4..."
                                    value={customNotes}
                                    onChange={e => setCustomNotes(e.target.value)}
                                />
                            </div>

                            {/* Total */}
                            <div className="flex justify-between items-center" style={{
                                padding: 'var(--spacing-md)',
                                background: 'var(--bg-tertiary)',
                                borderRadius: 'var(--border-radius)',
                                marginTop: 'var(--spacing-sm)'
                            }}>
                                <span>Subtotal</span>
                                <span className="text-xl font-bold">
                                    ${(customizingProduct.price * customQuantity).toFixed(2)}
                                </span>
                            </div>

                            {/* Botón agregar */}
                            <button
                                className="btn btn-primary btn-lg w-full"
                                onClick={confirmAddProduct}
                            >
                                Agregar a la orden
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de pago */}
            {showPaymentModal && (
                <div className="modal-overlay" onClick={() => setShowPaymentModal(false)}>
                    <div className="payment-modal" onClick={e => e.stopPropagation()}>
                        {/* Header con monto */}
                        <div className="payment-modal-header">
                            <button
                                className="payment-close-btn"
                                onClick={() => setShowPaymentModal(false)}
                            >
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18" />
                                    <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            </button>
                            <div className="payment-amount-label">Total a cobrar</div>
                            <div className="payment-amount">${total.toFixed(2)}</div>
                            {discountAmount > 0 && (
                                <div className="payment-discount-badge">
                                    ${discountAmount.toFixed(2)} descuento
                                </div>
                            )}
                        </div>

                        <div className="payment-modal-body">
                            {/* Tipo de servicio */}
                            <div className="pos-service-type">
                                <label className="service-type-label">Tipo de servicio</label>
                                <div className="service-type-buttons">
                                    <button
                                        className={`service-type-btn ${serviceType === 'dine_in' ? 'active' : ''}`}
                                        onClick={() => setServiceType('dine_in')}
                                    >
                                        En local
                                    </button>
                                    <button
                                        className={`service-type-btn ${serviceType === 'takeaway' ? 'active' : ''}`}
                                        onClick={() => setServiceType('takeaway')}
                                    >
                                        Para llevar
                                    </button>
                                    <button
                                        className={`service-type-btn ${serviceType === 'delivery' ? 'active' : ''}`}
                                        onClick={() => setServiceType('delivery')}
                                    >
                                        Domicilio
                                    </button>
                                </div>
                            </div>

                            {/* Sección de descuento */}
                            <div className="pos-discount-section">
                                <button
                                    className="discount-toggle-btn"
                                    onClick={() => setShowDiscountSection(!showDiscountSection)}
                                >
                                    <span>Descuento</span>
                                    <svg
                                        width="20"
                                        height="20"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        style={{ transform: showDiscountSection ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}
                                    >
                                        <polyline points="6 9 12 15 18 9" />
                                    </svg>
                                </button>

                                {showDiscountSection && (
                                    <div className="discount-content">
                                        <div className="discount-type-toggle">
                                            <button
                                                className={`discount-type-btn ${discountType === 'percent' ? 'active' : ''}`}
                                                onClick={() => setDiscountType('percent')}
                                            >
                                                %
                                            </button>
                                            <button
                                                className={`discount-type-btn ${discountType === 'fixed' ? 'active' : ''}`}
                                                onClick={() => setDiscountType('fixed')}
                                            >
                                                $
                                            </button>
                                        </div>
                                        <input
                                            type="number"
                                            className="discount-value-input"
                                            placeholder={discountType === 'percent' ? 'Porcentaje' : 'Monto'}
                                            value={discountValue}
                                            onChange={e => setDiscountValue(e.target.value)}
                                            min="0"
                                            max={discountType === 'percent' ? '100' : subtotal.toString()}
                                            step="0.01"
                                        />
                                        <input
                                            type="text"
                                            className="discount-reason-input"
                                            placeholder="Motivo del descuento (obligatorio)"
                                            value={discountReason}
                                            onChange={e => setDiscountReason(e.target.value)}
                                        />
                                        {discountAmount > 0 && (
                                            <div className="discount-preview">
                                                Subtotal: ${subtotal.toFixed(2)} - ${discountAmount.toFixed(2)} = ${total.toFixed(2)}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Métodos de pago */}
                            <div className="payment-methods">
                                <div className="payment-methods-label">Metodo de pago</div>
                                <div className="payment-methods-grid">
                                    <button
                                        className={`payment-method-card ${paymentMethod === 'cash' ? 'active' : ''}`}
                                        onClick={() => setPaymentMethod('cash')}
                                    >
                                        <div className="payment-method-icon">
                                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                                <rect x="2" y="6" width="20" height="12" rx="2" />
                                                <circle cx="12" cy="12" r="3" />
                                                <path d="M6 12h.01M18 12h.01" />
                                            </svg>
                                        </div>
                                        <span className="payment-method-name">Efectivo</span>
                                        {paymentMethod === 'cash' && (
                                            <div className="payment-method-check">
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                                                </svg>
                                            </div>
                                        )}
                                    </button>

                                    <button
                                        className={`payment-method-card ${paymentMethod === 'card' ? 'active' : ''}`}
                                        onClick={() => setPaymentMethod('card')}
                                    >
                                        <div className="payment-method-icon">
                                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                                <rect x="2" y="5" width="20" height="14" rx="2" />
                                                <line x1="2" y1="10" x2="22" y2="10" />
                                            </svg>
                                        </div>
                                        <span className="payment-method-name">Tarjeta</span>
                                        {paymentMethod === 'card' && (
                                            <div className="payment-method-check">
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                                                </svg>
                                            </div>
                                        )}
                                    </button>

                                    <button
                                        className={`payment-method-card ${paymentMethod === 'transfer' ? 'active' : ''}`}
                                        onClick={() => setPaymentMethod('transfer')}
                                    >
                                        <div className="payment-method-icon">
                                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" />
                                                <circle cx="12" cy="12" r="3" />
                                            </svg>
                                        </div>
                                        <span className="payment-method-name">Transferencia</span>
                                        {paymentMethod === 'transfer' && (
                                            <div className="payment-method-check">
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                                                </svg>
                                            </div>
                                        )}
                                    </button>
                                </div>
                            </div>

                            {/* Calculadora de cambio (solo efectivo) */}
                            {paymentMethod === 'cash' && (
                                <div className="pos-change-calc">
                                    <label className="change-calc-label">Efectivo recibido</label>
                                    <input
                                        type="number"
                                        className="change-calc-input"
                                        placeholder="0.00"
                                        value={cashReceived}
                                        onChange={e => setCashReceived(e.target.value)}
                                        min="0"
                                        step="0.01"
                                    />
                                    {parseFloat(cashReceived) >= total && (
                                        <div className="change-calc-result">
                                            Cambio: <span className="change-amount">${changeAmount.toFixed(2)}</span>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Botón confirmar */}
                            <button
                                className="payment-confirm-btn"
                                onClick={handlePayment}
                                disabled={processing}
                            >
                                {processing ? (
                                    <>
                                        <svg className="payment-spinner" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <circle cx="12" cy="12" r="10" opacity="0.25" />
                                            <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
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
            )}

            {/* Pantalla de confirmación post-pago */}
            {showConfirmation && completedOrder && (
                <div className="modal-overlay" style={{ zIndex: 9999 }}>
                    <div className="pos-confirmation">
                        <div className="pos-confirmation-check">
                            <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                <polyline points="22 4 12 14.01 9 11.01" />
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
                            <div className="confirmation-total-row">
                                <span>Subtotal</span>
                                <span>${completedOrder.subtotal.toFixed(2)}</span>
                            </div>
                            {completedOrder.discountAmount > 0 && (
                                <div className="confirmation-total-row">
                                    <span>Descuento ({completedOrder.discountReason})</span>
                                    <span>-${completedOrder.discountAmount.toFixed(2)}</span>
                                </div>
                            )}
                            <div className="confirmation-total-row total">
                                <span>TOTAL</span>
                                <span>${completedOrder.total.toFixed(2)}</span>
                            </div>
                            <div className="confirmation-payment-info">
                                Metodo: {completedOrder.paymentMethod === 'cash' ? 'Efectivo' : completedOrder.paymentMethod === 'card' ? 'Tarjeta' : 'Transferencia'}
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
                                    <polyline points="6 9 6 2 18 2 18 9" />
                                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                                    <rect x="6" y="14" width="12" height="8" />
                                </svg>
                                Imprimir ticket
                            </button>
                            <button className="btn-confirmation-new" onClick={() => { setShowConfirmation(false); setCompletedOrder(null); }}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <line x1="12" y1="5" x2="12" y2="19" />
                                    <line x1="5" y1="12" x2="19" y2="12" />
                                </svg>
                                Nueva venta
                            </button>
                        </div>

                        <Link href={`/dashboard/orders?open=${completedOrder.orderId}`} className="pos-confirmation-link">
                            Ver orden en detalle
                        </Link>
                    </div>
                </div>
            )}

            {/* Ticket para impresión (hidden, solo visible con @media print) */}
            {completedOrder && (
                <TicketPreview
                    businessName={businessName}
                    folio={completedOrder.folio}
                    date={completedOrder.date}
                    serviceType={completedOrder.serviceType}
                    items={completedOrder.items.map(item => ({
                        name: item.product.name,
                        quantity: item.quantity,
                        price: item.product.price,
                        notes: item.notes,
                    }))}
                    subtotal={completedOrder.subtotal}
                    discountAmount={completedOrder.discountAmount}
                    discountReason={completedOrder.discountReason}
                    total={completedOrder.total}
                    paymentMethod={completedOrder.paymentMethod}
                    cashReceived={completedOrder.cashReceived}
                    changeAmount={completedOrder.changeAmount}
                />
            )}

            {/* Toast notification */}
            {toast && (
                <div className={`toast ${toast.type === 'error' ? 'toast-error' : 'toast-success'}`}>
                    {toast.message}
                </div>
            )}
            {showLimitModal && limitInfo && (
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
            )}
        </div>
    )
}
