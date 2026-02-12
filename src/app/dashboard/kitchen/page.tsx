'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Order, OrderItem, OrderStatus } from '@/lib/types'
import { STATUS_COLORS, STATUS_LABELS, getNextStates } from '@/domain/orders/state-machine'
import { useBusiness } from '@/lib/context/BusinessContext'

interface OrderWithItems extends Order {
    order_items: OrderItem[]
}

type RealtimeStatus = 'live' | 'connecting' | 'error'

const STATUS_INDICATOR: Record<RealtimeStatus, { icon: string; label: string; color: string }> = {
    live: { icon: '🟢', label: 'En vivo', color: '#16a34a' },
    connecting: { icon: '🟡', label: 'Reconectando…', color: '#ca8a04' },
    error: { icon: '🔴', label: 'Polling', color: '#dc2626' },
}

export default function KitchenPage() {
    const { businessId } = useBusiness()
    const [orders, setOrders] = useState<OrderWithItems[]>([])
    const [loading, setLoading] = useState(true)
    const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>('connecting')
    const [soundEnabled, setSoundEnabled] = useState(false)
    const [newOrderIds, setNewOrderIds] = useState<Set<string>>(new Set())

    const supabase = createClient()

    // Refs for cleanup
    const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const audioCtxRef = useRef<AudioContext | null>(null)

    // ──────────────────────────────────────
    // Load orders
    // ──────────────────────────────────────
    const loadOrders = useCallback(async () => {
        if (!businessId) return

        const { data } = await supabase
            .from('orders')
            .select('*, order_items(*)')
            .eq('business_id', businessId)
            .in('status', ['OPEN', 'IN_PREP', 'READY'])
            .is('deleted_at', null)
            .order('created_at', { ascending: true })

        setOrders(data || [])
        setLoading(false)
    }, [businessId, supabase])

    // ──────────────────────────────────────
    // Debounced reload (300ms)
    // ──────────────────────────────────────
    const scheduleReload = useCallback(() => {
        if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current)
        reloadTimerRef.current = setTimeout(() => loadOrders(), 300)
    }, [loadOrders])

    // ──────────────────────────────────────
    // Audio: persistent AudioContext + Magic Activation
    // ──────────────────────────────────────
    useEffect(() => {
        // Create context if not exists
        if (!audioCtxRef.current) {
            audioCtxRef.current = new AudioContext()
        }

        const handleSubsequentInteraction = () => {
            const ctx = audioCtxRef.current
            if (ctx && ctx.state === 'suspended') {
                ctx.resume().then(() => setSoundEnabled(true))
            } else {
                setSoundEnabled(true)
            }
        }

        // Try to resume immediately (works if user navigated here)
        handleSubsequentInteraction()

        // Fallback: Resume on first interaction
        const unlockAudio = () => {
            handleSubsequentInteraction()
            // Clean up listeners once activated
            document.removeEventListener('click', unlockAudio)
            document.removeEventListener('touchstart', unlockAudio)
            document.removeEventListener('keydown', unlockAudio)
        }

        document.addEventListener('click', unlockAudio)
        document.addEventListener('touchstart', unlockAudio)
        document.addEventListener('keydown', unlockAudio)

        return () => {
            document.removeEventListener('click', unlockAudio)
            document.removeEventListener('touchstart', unlockAudio)
            document.removeEventListener('keydown', unlockAudio)
        }
    }, [])

    const playBeep = useCallback(() => {
        // Ensure context exists
        if (!audioCtxRef.current) audioCtxRef.current = new AudioContext()
        const ctx = audioCtxRef.current

        // If suspended, try to resume (might fail if no interaction yet)
        if (ctx.state === 'suspended') ctx.resume().catch(() => { })

        if (ctx.state !== 'running') return

        try {
            // Beep 1: 800Hz
            const osc1 = ctx.createOscillator()
            const gain1 = ctx.createGain()
            osc1.connect(gain1)
            gain1.connect(ctx.destination)
            osc1.frequency.value = 800
            osc1.type = 'sine'
            gain1.gain.value = 0.3
            osc1.start()
            setTimeout(() => osc1.stop(), 200)

            // Beep 2: 1000Hz (300ms later)
            setTimeout(() => {
                const osc2 = ctx.createOscillator()
                const gain2 = ctx.createGain()
                osc2.connect(gain2)
                gain2.connect(ctx.destination)
                osc2.frequency.value = 1000
                osc2.type = 'sine'
                gain2.gain.value = 0.3
                osc2.start()
                setTimeout(() => osc2.stop(), 200)
            }, 300)
        } catch (e) {
            console.warn('[Kitchen] Audio error:', e)
        }
    }, [])

    // ──────────────────────────────────────
    // New order handler (Set-based)
    // ──────────────────────────────────────
    const handleNewOrder = useCallback((id: string) => {
        setNewOrderIds(prev => new Set(prev).add(id))
        playBeep()
        setTimeout(() => {
            setNewOrderIds(prev => {
                const next = new Set(prev)
                next.delete(id)
                return next
            })
        }, 3000)
    }, [playBeep])

    // ──────────────────────────────────────
    // Realtime + fallback polling
    // ──────────────────────────────────────
    useEffect(() => {
        if (!businessId) return

        // Initial load
        loadOrders()

        // Subscribe to Realtime (scoped: INSERT + UPDATE only)
        const channel = supabase
            .channel('kitchen-orders')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'orders',
                filter: `business_id=eq.${businessId}`,
            }, (payload) => {
                handleNewOrder(payload.new.id as string)
                scheduleReload()
            })
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'orders',
                filter: `business_id=eq.${businessId}`,
            }, () => {
                scheduleReload()
            })
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    setRealtimeStatus('live')
                } else if (status === 'CHANNEL_ERROR') {
                    setRealtimeStatus('error')
                } else {
                    // TIMED_OUT, CLOSED, etc.
                    setRealtimeStatus('connecting')
                }
            })

        // Cleanup
        return () => {
            supabase.removeChannel(channel)
            if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current)
            if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current)
        }
    }, [businessId, loadOrders, scheduleReload, handleNewOrder, supabase])

    // ──────────────────────────────────────
    // Fallback polling (only when Realtime fails)
    // ──────────────────────────────────────
    useEffect(() => {
        if (realtimeStatus === 'error') {
            // Start polling fallback
            pollingIntervalRef.current = setInterval(loadOrders, 10000)
        } else {
            // Stop polling when Realtime is back
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
    }, [realtimeStatus, loadOrders])

    // ──────────────────────────────────────
    // Update status
    // ──────────────────────────────────────
    const updateStatus = async (orderId: string, newStatus: OrderStatus) => {
        await supabase
            .from('orders')
            .update({ status: newStatus })
            .eq('id', orderId)

        // Optimistic: Realtime will also trigger scheduleReload
        scheduleReload()
    }

    const getTimeSince = (date: string) => {
        const mins = Math.floor((Date.now() - new Date(date).getTime()) / 60000)
        return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`
    }

    const indicator = STATUS_INDICATOR[realtimeStatus]

    if (loading) {
        return <div className="p-lg">Cargando...</div>
    }

    return (
        <div className="kds-layout" style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            overflow: 'hidden',
            backgroundColor: '#f8fafc'
        }}>
            {/* Header minimalista y fijo */}
            <div className="kds-header" style={{
                flexShrink: 0,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.75rem 1rem',
                borderBottom: '1px solid #e2e8f0',
                background: '#fff',
                zIndex: 10
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>Cocina</h2>
                    <div
                        title={`Estado: ${indicator.label}`}
                        style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            backgroundColor: indicator.color,
                            boxShadow: `0 0 5px ${indicator.color}`,
                            cursor: 'help'
                        }}
                    />
                </div>

                {!soundEnabled && (
                    <button
                        onClick={() => {
                            const ctx = audioCtxRef.current
                            if (ctx && ctx.state === 'suspended') {
                                ctx.resume().then(() => setSoundEnabled(true))
                            } else {
                                setSoundEnabled(true)
                            }
                        }}
                        style={{
                            background: '#fee2e2',
                            color: '#ef4444',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '0.25rem 0.5rem',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                        }}
                    >
                        🔇 Activar
                    </button>
                )}
            </div>

            {/* Contenedor Grid Responsivo con Scroll */}
            <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: '1rem',
                display: orders.length === 0 ? 'flex' : 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gridAutoRows: 'min-content',
                alignContent: 'start',
                gap: '1rem',
                justifyContent: orders.length === 0 ? 'center' : 'start',
                alignItems: orders.length === 0 ? 'center' : 'stretch'
            }}>
                {orders.length === 0 ? (
                    <div className="text-center text-muted" style={{ padding: '2rem' }}>
                        <p style={{ fontSize: '1.1rem', color: '#94a3b8' }}>Todo limpio en cocina</p>
                    </div>
                ) : (
                    orders.map(order => {
                        const nextStates = getNextStates(order.status)
                        const primaryAction = nextStates[0]
                        const isNew = newOrderIds.has(order.id)
                        const borderColor = STATUS_COLORS[order.status]

                        return (
                            <div
                                key={order.id}
                                className={`kds-order ${isNew ? 'kds-order-new' : ''}`}
                                style={{
                                    borderTop: `4px solid ${borderColor}`,
                                    background: '#fff',
                                    borderRadius: '8px',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    height: '100%',
                                    position: 'relative'
                                }}
                            >
                                {/* Order Header Compact */}
                                <div style={{
                                    padding: '0.5rem 0.75rem',
                                    borderBottom: '1px solid #f1f5f9',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'baseline',
                                    background: order.status === 'READY' ? '#ecfdf5' : 'transparent'
                                }}>
                                    <span style={{ fontWeight: 700, fontSize: '1.1rem', color: '#0f172a' }}>
                                        #{order.folio}
                                    </span>
                                    <span style={{ fontSize: '0.85rem', color: '#64748b', fontFamily: 'monospace' }}>
                                        {getTimeSince(order.created_at)}
                                    </span>
                                </div>

                                {/* Items List */}
                                <div className="kds-order-items" style={{
                                    padding: '0.75rem',
                                    flex: 1,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '0.35rem'
                                }}>
                                    {order.order_items.map(item => (
                                        <div key={item.id} className="kds-order-item" style={{ fontSize: '0.95rem', lineHeight: '1.4' }}>
                                            <span style={{ fontWeight: 600, marginRight: '8px', color: '#334155' }}>
                                                {item.quantity}
                                            </span>
                                            <span style={{ color: '#1e293b' }}>
                                                {item.name_snapshot}
                                            </span>
                                            {item.notes && (
                                                <div style={{ fontSize: '0.8rem', color: '#d97706', marginLeft: '1.25rem', fontStyle: 'italic' }}>
                                                    {item.notes}
                                                </div>
                                            )}
                                        </div>
                                    ))}

                                    {order.notes && (
                                        <div style={{
                                            marginTop: '0.5rem',
                                            fontSize: '0.8rem',
                                            background: '#fef3c7',
                                            padding: '0.25rem 0.5rem',
                                            borderRadius: '4px',
                                            color: '#b45309'
                                        }}>
                                            📝 {order.notes}
                                        </div>
                                    )}
                                </div>

                                {/* Action Button Compact */}
                                {primaryAction && (
                                    <div style={{ padding: '0.5rem 0.75rem', borderTop: '1px solid #f1f5f9' }}>
                                        <button
                                            className="btn"
                                            onClick={() => updateStatus(order.id, primaryAction)}
                                            style={{
                                                width: '100%',
                                                padding: '0.6rem',
                                                fontSize: '0.95rem',
                                                fontWeight: 600,
                                                background: STATUS_COLORS[primaryAction] || '#3b82f6',
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: '6px',
                                                cursor: 'pointer',
                                                transition: 'opacity 0.2s',
                                                display: 'flex',
                                                justifyContent: 'center',
                                                alignItems: 'center'
                                            }}
                                        >
                                            {STATUS_LABELS[primaryAction]}
                                        </button>
                                    </div>
                                )}
                            </div>
                        )
                    })
                )}
            </div>
        </div>
    )
}
