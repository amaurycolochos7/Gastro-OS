'use client'

import { CashRegisterSummary } from '@/lib/types'

interface CashClosingPreviewProps {
    businessName: string
    registerId: string
    openedAt: string
    closedAt: string
    closedBy: string
    summary: CashRegisterSummary
    countedCash: number
    calculatedDifference: number
    closingNotes?: string
}

export default function CashClosingPreview({
    businessName,
    registerId,
    openedAt,
    closedAt,
    closedBy,
    summary,
    countedCash,
    calculatedDifference,
    closingNotes
}: CashClosingPreviewProps) {
    const formatDate = (isoString: string) => {
        if (!isoString) return '-'
        const d = new Date(isoString)
        return `${d.toLocaleDateString('es-MX')} ${d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`
    }

    return (
        <div id="closing-ticket-root" style={{ display: 'none' }}>
            <div style={{
                fontFamily: "'Courier New', monospace",
                width: '100%',
                maxWidth: '80mm',
                padding: '0',
                margin: '0',
                fontSize: '12px',
                lineHeight: '1.2',
                backgroundColor: 'white',
                color: 'black',
            }}>
                {/* Header */}
                <div style={{ textAlign: 'center', borderBottom: '1px dashed #000', paddingBottom: '8px', marginBottom: '8px' }}>
                    <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '4px' }}>
                        {businessName}
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 'bold' }}>CORTE DE CAJA</div>
                    <div style={{ fontSize: '10px' }}>ID: {registerId.slice(0, 8)}</div>
                </div>

                {/* Periodo */}
                <div style={{ borderBottom: '1px dashed #000', paddingBottom: '8px', marginBottom: '8px' }}>
                    <div style={{ marginBottom: '4px' }}>
                        <strong>Apertura:</strong><br />
                        {formatDate(openedAt)}
                    </div>
                    <div style={{ marginBottom: '4px' }}>
                        <strong>Cierre:</strong><br />
                        {formatDate(closedAt)} by {closedBy}
                    </div>
                </div>

                {/* Resumen Financiero */}
                <div style={{ borderBottom: '1px dashed #000', paddingBottom: '8px', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Fondo Inicial:</span>
                        <span>${summary.start_amount.toFixed(2)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>+ Ventas (Efec):</span>
                        <span>${(summary.totals.sales_by_method.cash || 0).toFixed(2)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>+ Entradas:</span>
                        <span>${summary.totals.cash_in.toFixed(2)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>- Salidas:</span>
                        <span>${summary.totals.cash_out.toFixed(2)}</span>
                    </div>

                    <div style={{ borderTop: '1px dotted #000', margin: '4px 0' }} />

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                        <span>Esperado:</span>
                        <span>${summary.expected_cash.toFixed(2)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Contado:</span>
                        <span>${countedCash.toFixed(2)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                        <span>Diferencia:</span>
                        <span style={{ fontWeight: 'bold' }}>
                            {calculatedDifference > 0 ? '+' : ''}{calculatedDifference.toFixed(2)}
                        </span>
                    </div>
                </div>

                {/* Otros Métodos */}
                <div style={{ borderBottom: '1px dashed #000', paddingBottom: '8px', marginBottom: '8px' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>Otros Métodos:</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Tarjeta:</span>
                        <span>${(summary.totals.sales_by_method.card || 0).toFixed(2)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Transfer:</span>
                        <span>${(summary.totals.sales_by_method.transfer || 0).toFixed(2)}</span>
                    </div>
                </div>

                {/* Notas/Warnings */}
                {(closingNotes || summary.warnings.length > 0) && (
                    <div style={{ borderBottom: '1px dashed #000', paddingBottom: '8px', marginBottom: '8px' }}>
                        {summary.warnings.length > 0 && (
                            <div style={{ marginBottom: '4px' }}>
                                <strong>Advertencias:</strong>
                                {summary.warnings.map((w, i) => (
                                    <div key={i} style={{ fontSize: '10px' }}>- {w.message}</div>
                                ))}
                            </div>
                        )}
                        {closingNotes && (
                            <div>
                                <strong>Notas:</strong><br />
                                <span style={{ fontSize: '10px' }}>{closingNotes}</span>
                            </div>
                        )}
                    </div>
                )}

                {/* Footer */}
                <div style={{ textAlign: 'center', paddingTop: '4px' }}>
                    <div style={{ fontSize: '10px' }}>Firma del Cajero</div>
                    <div style={{ borderBottom: '1px solid #000', width: '150px', margin: '30px auto 4px' }} />
                </div>
            </div>
        </div>
    )
}
