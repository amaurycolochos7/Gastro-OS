'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CashRegister, CashMovement, CashRegisterSummary, CashRegisterWarning } from '@/lib/types'
import { useBusiness } from '@/lib/context/BusinessContext'
import CashClosingPreview from './CashClosingPreview'

export default function CashPage() {
    const { businessId, userId, loading: businessLoading } = useBusiness()
    const [register, setRegister] = useState<CashRegister | null>(null)
    const [movements, setMovements] = useState<CashMovement[]>([])
    const [loading, setLoading] = useState(true)

    // Business Config
    const [config, setConfig] = useState({
        defaultKeepFloat: 150,
        differenceThreshold: 20
    })

    // Abrir caja state
    const [openingAmount, setOpeningAmount] = useState('')

    // Movimientos state
    const [movementAmount, setMovementAmount] = useState('')
    const [movementReason, setMovementReason] = useState('')

    // Wizard Cierre State
    const [showCloseModal, setShowCloseModal] = useState(false)
    const [closeStep, setCloseStep] = useState(1) // 1: Resumen, 2: Arqueo, 3: Retiro
    const [closingSummary, setClosingSummary] = useState<CashRegisterSummary | null>(null)
    const [countedCash, setCountedCash] = useState('')
    const [keepFloat, setKeepFloat] = useState('')
    const [closingNotes, setClosingNotes] = useState('')
    const [isClosing, setIsClosing] = useState(false)
    const [difference, setDifference] = useState(0)

    // Success State
    const [closureSuccess, setClosureSuccess] = useState(false)

    const [selectedMovement, setSelectedMovement] = useState<CashMovement | null>(null)

    const supabase = createClient()

    useEffect(() => {
        if (businessLoading || !userId || !businessId) return
        loadCashRegister()
        loadBusinessConfig()
    }, [businessLoading, userId, businessId])

    // Resetear wizard al cerrar modal
    useEffect(() => {
        if (!showCloseModal) {
            setCloseStep(1)
            setCountedCash('')
            setClosingNotes('')
            setClosingSummary(null)
            setDifference(0)
        } else if (register) {
            loadClosingSummary()
            setKeepFloat(config.defaultKeepFloat.toString())
        }
    }, [showCloseModal])

    // Calcular diferencia en tiempo real
    useEffect(() => {
        if (closingSummary) {
            const counted = parseFloat(countedCash) || 0
            setDifference(counted - closingSummary.expected_cash)
        }
    }, [countedCash, closingSummary])

    const loadBusinessConfig = async () => {
        if (!businessId) return
        const { data } = await supabase
            .from('businesses')
            .select('default_keep_float_amount, cash_difference_threshold')
            .eq('id', businessId)
            .single()

        if (data) {
            setConfig({
                defaultKeepFloat: data.default_keep_float_amount || 150,
                differenceThreshold: data.cash_difference_threshold || 20
            })
        }
    }

    const loadCashRegister = async () => {
        if (!userId) return
        setLoading(true)

        const { data: openRegister } = await supabase
            .from('cash_registers')
            .select('*')
            .eq('opened_by', userId)
            .eq('status', 'open')
            .is('deleted_at', null)
            .single()

        if (openRegister) {
            setRegister(openRegister)
            // Cargar movimientos
            const { data: movs } = await supabase
                .from('cash_movements')
                .select('*')
                .eq('cash_register_id', openRegister.id)
                .is('deleted_at', null)
                .order('created_at', { ascending: false })
            setMovements(movs || [])
        } else {
            setRegister(null)
            setMovements([])
        }
        setLoading(false)
    }

    const loadClosingSummary = async () => {
        if (!register) return

        const { data, error } = await supabase.rpc('get_cash_register_summary', {
            p_cash_register_id: register.id
        })

        if (error) {
            alert('Error al cargar resumen: ' + error.message)
            return
        }

        setClosingSummary(data as CashRegisterSummary)
    }

    const handleOpenCash = async () => {
        const amount = parseFloat(openingAmount) || 0
        if (!userId || !businessId) return

        const { error } = await supabase
            .from('cash_registers')
            .insert({
                business_id: businessId,
                status: 'open',
                opened_by: userId,
                opening_amount: amount,
            })

        if (!error) {
            setOpeningAmount('')
            loadCashRegister()
        }
    }

    const handleAddMovement = async (type: 'in' | 'out') => {
        if (!register || !movementAmount || !movementReason || !userId) return

        const { error } = await supabase
            .from('cash_movements')
            .insert({
                cash_register_id: register.id,
                business_id: register.business_id,
                type,
                amount: parseFloat(movementAmount),
                reason: movementReason,
                created_by: userId,
            })

        if (!error) {
            setMovementAmount('')
            setMovementReason('')
            // Recargar para actualizar movimientos
            const { data: movs } = await supabase
                .from('cash_movements')
                .select('*')
                .eq('cash_register_id', register.id)
                .is('deleted_at', null)
                .order('created_at', { ascending: false })
            setMovements(movs || [])
        }
    }

    const handleFinalClose = async () => {
        if (!register || !userId || !closingSummary) return

        // Validar notas si hay diferencia grande
        const threshold = config.differenceThreshold
        const hasCriticalWarning = closingSummary.warnings.some(w => w.severity === 'critical')
        const isDiffSignificant = Math.abs(difference) > threshold

        if ((isDiffSignificant || hasCriticalWarning) && !closingNotes.trim()) {
            alert(`Se requieren notas aclaratorias debido a ${hasCriticalWarning ? 'advertencias críticas' : `diferencia mayor a $${threshold}`}.`)
            return
        }

        setIsClosing(true)

        const { error } = await supabase.rpc('close_cash_register', {
            p_cash_register_id: register.id,
            p_counted_cash: parseFloat(countedCash) || 0,
            p_keep_float_amount: parseFloat(keepFloat) || 0,
            p_closing_notes: closingNotes
            // breakdown param optional (not implemented in UI yet)
        })

        if (error) {
            alert('Error al cerrar caja: ' + error.message)
            setIsClosing(false)
            return
        }

        // Éxito
        setIsClosing(false)
        setShowCloseModal(false)
        setClosureSuccess(true)
        // No recargamos loadCashRegister() inmediatamente para mantener los datos para el ticket
    }

    if (businessLoading || loading) {
        return (
            <div className="page-loading">
                <p className="text-muted">Cargando caja...</p>
            </div>
        )
    }

    // Caja cerrada - mostrar pantalla para abrir turno
    if (!register) {
        return (
            <div className="cash-open-container">
                <div className="cash-open-card">
                    {/* Icono animado */}
                    <div className="cash-open-icon">
                        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="2" y="4" width="20" height="16" rx="2" />
                            <path d="M12 8v8" />
                            <path d="M8 12h8" />
                        </svg>
                    </div>

                    <h1 className="cash-open-title">Iniciar turno</h1>
                    <p className="cash-open-subtitle">Ingresa el monto inicial de efectivo en caja</p>

                    {/* Input con símbolo de moneda */}
                    <div className="cash-open-input-wrapper">
                        <span className="cash-open-currency">$</span>
                        <input
                            type="number"
                            className="cash-open-input"
                            placeholder="0.00"
                            value={openingAmount}
                            onChange={(e) => setOpeningAmount(e.target.value)}
                            inputMode="decimal"
                            autoFocus
                        />
                    </div>

                    <button
                        className="cash-open-btn"
                        onClick={handleOpenCash}
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                            <polyline points="10 17 15 12 10 7" />
                            <line x1="15" y1="12" x2="3" y2="12" />
                        </svg>
                        Abrir caja
                    </button>

                    <p className="cash-open-hint">
                        Al abrir la caja podrás registrar ventas y movimientos de efectivo
                    </p>
                </div>
            </div>
        )
    }

    // Caja abierta
    const totalIn = movements.filter(m => m.type === 'in').reduce((sum, m) => sum + m.amount, 0)
    const totalOut = movements.filter(m => m.type === 'out').reduce((sum, m) => sum + m.amount, 0)
    const currentBalance = register.opening_amount + totalIn - totalOut

    return (
        <div className="cash-page">
            {/* Header con estado activo */}
            <div className="cash-header">
                <div className="cash-header-info">
                    <div className="cash-status-badge">
                        <span className="cash-status-dot"></span>
                        Turno activo
                    </div>
                    <span className="cash-header-time">
                        Desde {new Date(register.opened_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                </div>
                <button
                    className="cash-close-btn"
                    onClick={() => setShowCloseModal(true)}
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    Cerrar caja
                </button>
            </div>

            {/* Balance principal */}
            <div className="cash-balance-card">
                <span className="cash-balance-label">Balance actual</span>
                <span className="cash-balance-value">${currentBalance.toFixed(2)}</span>
            </div>

            {/* Stats grid */}
            <div className="cash-stats-grid">
                <div className="cash-stat opening">
                    <div className="cash-stat-icon">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="2" y="4" width="20" height="16" rx="2" />
                            <path d="M12 8v8" />
                            <path d="M8 12h8" />
                        </svg>
                    </div>
                    <div className="cash-stat-content">
                        <span className="cash-stat-label">Apertura</span>
                        <span className="cash-stat-value">${register.opening_amount.toFixed(2)}</span>
                    </div>
                </div>

                <div className="cash-stat income">
                    <div className="cash-stat-icon">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="12" y1="19" x2="12" y2="5" />
                            <polyline points="5 12 12 5 19 12" />
                        </svg>
                    </div>
                    <div className="cash-stat-content">
                        <span className="cash-stat-label">Entradas</span>
                        <span className="cash-stat-value">+${totalIn.toFixed(2)}</span>
                    </div>
                </div>

                <div className="cash-stat expense">
                    <div className="cash-stat-icon">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <polyline points="19 12 12 19 5 12" />
                        </svg>
                    </div>
                    <div className="cash-stat-content">
                        <span className="cash-stat-label">Salidas</span>
                        <span className="cash-stat-value">-${totalOut.toFixed(2)}</span>
                    </div>
                </div>
            </div>

            {/* Formulario de movimiento */}
            <div className="cash-movement-form">
                <h3 className="cash-section-title">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="16" />
                        <line x1="8" y1="12" x2="16" y2="12" />
                    </svg>
                    Registrar movimiento
                </h3>

                <div className="cash-movement-inputs">
                    <div className="cash-input-group">
                        <span className="cash-input-prefix">$</span>
                        <input
                            type="number"
                            className="cash-movement-input"
                            placeholder="0.00"
                            value={movementAmount}
                            onChange={(e) => setMovementAmount(e.target.value)}
                            inputMode="decimal"
                        />
                    </div>
                    <input
                        type="text"
                        className="cash-movement-input reason"
                        placeholder="Razón del movimiento..."
                        value={movementReason}
                        onChange={(e) => setMovementReason(e.target.value)}
                    />
                </div>

                <div className="cash-movement-actions">
                    <button
                        className="cash-action-btn income"
                        onClick={() => handleAddMovement('in')}
                        disabled={!movementAmount || !movementReason}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="12" y1="19" x2="12" y2="5" />
                            <polyline points="5 12 12 5 19 12" />
                        </svg>
                        Entrada
                    </button>
                    <button
                        className="cash-action-btn expense"
                        onClick={() => handleAddMovement('out')}
                        disabled={!movementAmount || !movementReason}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <polyline points="19 12 12 19 5 12" />
                        </svg>
                        Salida
                    </button>
                </div>
            </div>

            {/* Lista de movimientos */}
            <div className="cash-movements-section">
                <h3 className="cash-section-title">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                    </svg>
                    Movimientos del turno
                </h3>

                {movements.length === 0 ? (
                    <div className="cash-movements-empty">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="18" height="18" rx="2" />
                            <path d="M3 9h18" />
                            <path d="M9 21V9" />
                        </svg>
                        <span>No hay movimientos registrados</span>
                    </div>
                ) : (
                    <div className="cash-movements-list">
                        {movements.map((m) => (
                            <div
                                key={m.id}
                                className={`cash-movement-item ${m.type} clickable`}
                                onClick={() => setSelectedMovement(m)}
                            >
                                <div className="cash-movement-icon">
                                    {m.type === 'in' ? (
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <line x1="12" y1="19" x2="12" y2="5" />
                                            <polyline points="5 12 12 5 19 12" />
                                        </svg>
                                    ) : (
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <line x1="12" y1="5" x2="12" y2="19" />
                                            <polyline points="19 12 12 19 5 12" />
                                        </svg>
                                    )}
                                </div>
                                <div className="cash-movement-info">
                                    <span className="cash-movement-reason">{m.reason}</span>
                                    <span className="cash-movement-time">
                                        {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                                <span className={`cash-movement-amount ${m.type}`}>
                                    {m.type === 'in' ? '+' : '-'}${m.amount.toFixed(2)}
                                </span>
                                <svg className="cash-movement-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="9 18 15 12 9 6" />
                                </svg>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Modal cerrar caja (Wizard) */}
            {showCloseModal && (
                <div className="modal-overlay">
                    <div className="modal-content cw-modal" style={{ maxWidth: '500px' }}>
                        {/* Header */}
                        <div className="cw-header">
                            <div className="cw-header-icon">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                </svg>
                            </div>
                            <div className="cw-header-text">
                                <h2 className="cw-header-title">Cerrar caja</h2>
                                <p className="cw-header-subtitle">
                                    {closeStep === 1 ? 'Resumen financiero' : closeStep === 2 ? 'Arqueo de efectivo' : 'Retiro y cierre'}
                                </p>
                            </div>
                            <button className="cw-close" onClick={() => setShowCloseModal(false)}>×</button>
                        </div>

                        {/* Step Indicator */}
                        <div className="cw-steps">
                            <div className={`cw-step ${closeStep === 1 ? 'active' : closeStep > 1 ? 'completed' : ''}`}>
                                <span className="cw-step-circle">{closeStep > 1 ? '✓' : '1'}</span>
                                <span className="cw-step-label">Resumen</span>
                            </div>
                            <div className={`cw-step-line ${closeStep > 1 ? 'filled' : ''}`} />
                            <div className={`cw-step ${closeStep === 2 ? 'active' : closeStep > 2 ? 'completed' : ''}`}>
                                <span className="cw-step-circle">{closeStep > 2 ? '✓' : '2'}</span>
                                <span className="cw-step-label">Arqueo</span>
                            </div>
                            <div className={`cw-step-line ${closeStep > 2 ? 'filled' : ''}`} />
                            <div className={`cw-step ${closeStep === 3 ? 'active' : ''}`}>
                                <span className="cw-step-circle">3</span>
                                <span className="cw-step-label">Cierre</span>
                            </div>
                        </div>

                        {/* Body */}
                        <div className="cw-body">
                            {!closingSummary ? (
                                <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando resumen...</div>
                            ) : (
                                <>
                                    {/* Paso 1: Resumen */}
                                    {closeStep === 1 && (
                                        <>
                                            {/* Advertencias */}
                                            {closingSummary.warnings.length > 0 && (
                                                <div className="cw-warnings">
                                                    <div className="cw-warnings-title">
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                                                        Advertencias
                                                    </div>
                                                    {closingSummary.warnings.map((w: CashRegisterWarning, i: number) => (
                                                        <div key={i} className="cw-warning-item">
                                                            <span className={`cw-badge ${w.severity}`}>{w.severity}</span>
                                                            {w.message}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Summary Grid */}
                                            <div className="cw-summary-grid">
                                                <div className="cw-summary-row">
                                                    <span>Fondo inicial</span>
                                                    <span>${closingSummary.start_amount.toFixed(2)}</span>
                                                </div>
                                                <div className="cw-summary-row highlight">
                                                    <span>Ventas (Efectivo)</span>
                                                    <span>+${(closingSummary.totals.sales_by_method.cash || 0).toFixed(2)}</span>
                                                </div>
                                                <div className="cw-summary-row muted">
                                                    <span>Ventas (Tarjeta)</span>
                                                    <span>${(closingSummary.totals.sales_by_method.card || 0).toFixed(2)}</span>
                                                </div>
                                                <div className="cw-summary-row muted">
                                                    <span>Ventas (Transferencia)</span>
                                                    <span>${(closingSummary.totals.sales_by_method.transfer || 0).toFixed(2)}</span>
                                                </div>
                                                <div className="cw-summary-divider" />
                                                <div className="cw-summary-row highlight">
                                                    <span>Entradas (Movs)</span>
                                                    <span>+${closingSummary.totals.cash_in.toFixed(2)}</span>
                                                </div>
                                                <div className="cw-summary-row">
                                                    <span>Salidas (Movs)</span>
                                                    <span>-${closingSummary.totals.cash_out.toFixed(2)}</span>
                                                </div>
                                                <div className="cw-summary-row muted">
                                                    <span>Devoluciones/Anulaciones (Efec)</span>
                                                    <span>-${((closingSummary.totals.refunds_by_method.cash || 0) + (closingSummary.totals.voids_by_method.cash || 0)).toFixed(2)}</span>
                                                </div>
                                            </div>

                                            {/* Expected Cash — Hero Card */}
                                            <div className="cw-expected-card">
                                                <span className="cw-expected-label">Efectivo Esperado</span>
                                                <span className="cw-expected-value">${closingSummary.expected_cash.toFixed(2)}</span>
                                            </div>
                                        </>
                                    )}

                                    {/* Paso 2: Arqueo */}
                                    {closeStep === 2 && (
                                        <>
                                            <div className="cw-arqueo-expected">
                                                <span className="cw-arqueo-expected-label">Efectivo Esperado</span>
                                                <span className="cw-arqueo-expected-value">${closingSummary.expected_cash.toFixed(2)}</span>
                                            </div>

                                            <div className="cw-input-group">
                                                <label>Efectivo Contado (Real)</label>
                                                <div className="cw-input-wrap">
                                                    <span className="cw-prefix">$</span>
                                                    <input
                                                        type="number"
                                                        placeholder="0.00"
                                                        value={countedCash}
                                                        onChange={(e) => setCountedCash(e.target.value)}
                                                        inputMode="decimal"
                                                        autoFocus
                                                    />
                                                </div>
                                            </div>

                                            {countedCash && (() => {
                                                const diffState = difference === 0 ? 'exact' : Math.abs(difference) <= config.differenceThreshold ? 'within' : 'over';
                                                const diffLabel = diffState === 'exact' ? '¡Cuadra perfecto!' : diffState === 'within' ? 'Diferencia aceptable' : 'Diferencia fuera de umbral';
                                                return (
                                                    <div className={`cw-difference-card ${diffState}`}>
                                                        <div className="cw-difference-label">{diffLabel}</div>
                                                        <div className="cw-difference-value">
                                                            {difference > 0 ? '+' : ''}{difference.toFixed(2)}
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                        </>
                                    )}

                                    {/* Paso 3: Retiro y Cierre */}
                                    {closeStep === 3 && (() => {
                                        const diffState = difference === 0 ? 'exact' : Math.abs(difference) <= config.differenceThreshold ? 'within' : 'over';
                                        const needsNotes = Math.abs(difference) > config.differenceThreshold || closingSummary.warnings.some(w => w.severity === 'critical');
                                        return (
                                            <>
                                                <div className="cw-totals-grid">
                                                    <div className="cw-total-card">
                                                        <span className="cw-total-label">Total en Caja</span>
                                                        <span className="cw-total-value">${(parseFloat(countedCash) || 0).toFixed(2)}</span>
                                                    </div>
                                                    <div className="cw-total-card">
                                                        <span className="cw-total-label">Diferencia</span>
                                                        <span className={`cw-total-value ${diffState === 'exact' ? 'success' : diffState === 'within' ? 'warning' : 'danger'}`}>
                                                            {difference > 0 ? '+' : ''}{difference.toFixed(2)}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="cw-input-group">
                                                    <label>Dejar fondo para siguiente turno</label>
                                                    <div className="cw-float-row">
                                                        <div className="cw-input-wrap">
                                                            <span className="cw-prefix">$</span>
                                                            <input
                                                                type="number"
                                                                value={keepFloat}
                                                                onChange={(e) => setKeepFloat(e.target.value)}
                                                            />
                                                        </div>
                                                        <button
                                                            className="cw-float-default"
                                                            onClick={() => setKeepFloat(config.defaultKeepFloat.toString())}
                                                        >
                                                            Default (${config.defaultKeepFloat})
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="cw-withdrawal-card">
                                                    <span className="cw-withdrawal-label">Se retirará ahora</span>
                                                    <span className="cw-withdrawal-value">
                                                        ${Math.max(0, (parseFloat(countedCash) || 0) - (parseFloat(keepFloat) || 0)).toFixed(2)}
                                                    </span>
                                                    <span className="cw-withdrawal-note">
                                                        * Este monto se registrará como salida automáticamente
                                                    </span>
                                                </div>

                                                <div className="cw-notes-group">
                                                    <label>
                                                        Notas de cierre
                                                        {needsNotes && <span className="required-tag">Requerido</span>}
                                                    </label>
                                                    <textarea
                                                        className={needsNotes && !closingNotes.trim() ? 'cw-notes-required' : ''}
                                                        rows={2}
                                                        placeholder={needsNotes ? 'Explica la diferencia para poder cerrar...' : 'Comentarios opcionales...'}
                                                        value={closingNotes}
                                                        onChange={(e) => setClosingNotes(e.target.value)}
                                                    />
                                                </div>
                                            </>
                                        );
                                    })()}
                                </>
                            )}
                        </div>

                        {/* Footer */}
                        {closingSummary && (
                            <div className="cw-footer">
                                {closeStep === 1 && (
                                    <button className="btn btn-primary" onClick={() => setCloseStep(2)}>
                                        Continuar al Arqueo
                                    </button>
                                )}
                                {closeStep === 2 && (
                                    <>
                                        <button className="btn btn-secondary" onClick={() => setCloseStep(1)}>Atrás</button>
                                        <button className="btn btn-primary" onClick={() => setCloseStep(3)} disabled={!countedCash}>
                                            Continuar
                                        </button>
                                    </>
                                )}
                                {closeStep === 3 && (
                                    <>
                                        <button className="btn btn-secondary" onClick={() => setCloseStep(2)} disabled={isClosing}>Atrás</button>
                                        <button
                                            className="btn btn-danger"
                                            onClick={handleFinalClose}
                                            disabled={isClosing || ((Math.abs(difference) > config.differenceThreshold || closingSummary.warnings.some(w => w.severity === 'critical')) && !closingNotes.trim())}
                                        >
                                            {isClosing ? 'Cerrando...' : 'FINALIZAR TURNO'}
                                        </button>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Success & Print Modal */}
            {closureSuccess && register && closingSummary && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ maxWidth: '400px' }}>
                        <div className="cw-success">
                            <div className="cw-success-icon">
                                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                    <polyline className="check-path" points="22 4 12 14.01 9 11.01" />
                                </svg>
                            </div>
                            <h2>¡Corte Correcto!</h2>
                            <p>El turno ha sido cerrado exitosamente.</p>

                            <div className="cw-success-actions">
                                <button className="btn btn-primary" onClick={() => window.print()}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="6 9 6 2 18 2 18 9" />
                                        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                                        <rect x="6" y="14" width="12" height="8" />
                                    </svg>
                                    Imprimir Ticket
                                </button>
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => {
                                        setClosureSuccess(false)
                                        setRegister(null)
                                        setMovements([])
                                    }}
                                >
                                    Cerrar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Hidden Print Preview Component */}
            {closureSuccess && register && closingSummary && (
                <CashClosingPreview
                    businessName="GastroOS Business" // TODO: Get from regex/context
                    registerId={register.id}
                    openedAt={register.opened_at}
                    closedAt={new Date().toISOString()}
                    closedBy="Cajero Actual" // TODO: Get name
                    summary={closingSummary}
                    countedCash={parseFloat(countedCash) || 0}
                    calculatedDifference={difference}
                    closingNotes={closingNotes}
                />
            )}

            {/* Modal detalles de movimiento */}
            {selectedMovement && (
                <div className="modal-overlay" onClick={() => setSelectedMovement(null)}>
                    <div className="movement-detail-modal" onClick={(e) => e.stopPropagation()}>
                        <button
                            className="movement-detail-close"
                            onClick={() => setSelectedMovement(null)}
                        >
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>

                        <div className={`movement-detail-icon ${selectedMovement.type}`}>
                            {selectedMovement.type === 'in' ? (
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="12" y1="19" x2="12" y2="5" />
                                    <polyline points="5 12 12 5 19 12" />
                                </svg>
                            ) : (
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="12" y1="5" x2="12" y2="19" />
                                    <polyline points="19 12 12 19 5 12" />
                                </svg>
                            )}
                        </div>

                        <span className="movement-detail-type">
                            {selectedMovement.type === 'in' ? 'Entrada' : 'Salida'}
                        </span>

                        <span className={`movement-detail-amount ${selectedMovement.type}`}>
                            {selectedMovement.type === 'in' ? '+' : '-'}${selectedMovement.amount.toFixed(2)}
                        </span>

                        <div className="movement-detail-reason">
                            <span className="movement-detail-label">Razón</span>
                            <p className="movement-detail-text">{selectedMovement.reason}</p>
                        </div>

                        <div className="movement-detail-date">
                            <span className="movement-detail-label">Fecha y hora</span>
                            <p className="movement-detail-text">
                                {new Date(selectedMovement.created_at).toLocaleString('es-MX', {
                                    weekday: 'long',
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                })}
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

