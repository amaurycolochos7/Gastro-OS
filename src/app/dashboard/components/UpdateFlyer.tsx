'use client'

import { useState, useEffect } from 'react'

const FLYER_KEY = 'gastro_update_print_v2'
const MAX_VIEWS = 3

export default function UpdateFlyer() {
    const [show, setShow] = useState(false)

    useEffect(() => {
        const raw = localStorage.getItem(FLYER_KEY)
        const count = raw ? parseInt(raw, 10) : 0
        if (count < MAX_VIEWS) {
            setShow(true)
            localStorage.setItem(FLYER_KEY, String(count + 1))
        }
    }, [])

    const dismiss = () => setShow(false)
    const dismissForever = () => {
        localStorage.setItem(FLYER_KEY, String(MAX_VIEWS))
        setShow(false)
    }

    if (!show) return null

    return (
        <div className="update-flyer-overlay" onClick={dismiss}>
            <div className="update-flyer-card" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="update-flyer-header">
                    <div className="update-flyer-badge">NUEVO</div>
                    <svg className="update-flyer-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="6 9 6 2 18 2 18 9" />
                        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                        <rect x="6" y="14" width="12" height="8" />
                    </svg>
                    <h2 className="update-flyer-title">¡Impresión de Tickets!</h2>
                    <p className="update-flyer-subtitle">Conecta tu impresora y empieza a imprimir</p>
                </div>

                {/* Body */}
                <div className="update-flyer-body">
                    <div className="update-flyer-feature">
                        <div className="update-flyer-feature-icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6c3ce0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
                        </div>
                        <div>
                            <strong>Tickets de venta</strong>
                            <p>Imprime el recibo automáticamente al cobrar cada orden</p>
                        </div>
                    </div>
                    <div className="update-flyer-feature">
                        <div className="update-flyer-feature-icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6c3ce0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
                        </div>
                        <div>
                            <strong>Reimpresión</strong>
                            <p>Reimprime tickets desde las órdenes pagadas en el POS</p>
                        </div>
                    </div>
                    <div className="update-flyer-feature">
                        <div className="update-flyer-feature-icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6c3ce0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
                        </div>
                        <div>
                            <strong>Corte de caja</strong>
                            <p>Imprime el resumen financiero al cerrar tu caja</p>
                        </div>
                    </div>

                    <div className="update-flyer-setup">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="16" x2="12" y2="12" />
                            <line x1="12" y1="8" x2="12.01" y2="8" />
                        </svg>
                        <span>Conecta una impresora térmica de 80mm via USB o red para mejores resultados</span>
                    </div>
                </div>

                {/* Footer */}
                <div className="update-flyer-footer">
                    <button className="update-flyer-btn" onClick={dismiss}>
                        ¡Entendido!
                    </button>
                    <button className="update-flyer-dismiss-link" onClick={dismissForever}>
                        No mostrar de nuevo
                    </button>
                </div>
            </div>
        </div>
    )
}
