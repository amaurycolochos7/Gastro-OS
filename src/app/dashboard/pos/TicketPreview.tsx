'use client'

interface TicketProps {
    businessName: string
    folio: string
    date: string
    cashierName?: string
    serviceType: 'dine_in' | 'takeaway' | 'delivery'
    items: {
        name: string
        quantity: number
        price: number
        notes?: string
    }[]
    subtotal: number
    discountAmount: number
    discountReason?: string
    total: number
    paymentMethod: 'cash' | 'card' | 'transfer'
    cashReceived?: number
    changeAmount?: number
}

export default function TicketPreview({
    businessName,
    folio,
    date,
    cashierName,
    serviceType,
    items,
    subtotal,
    discountAmount,
    discountReason,
    total,
    paymentMethod,
    cashReceived,
    changeAmount,
}: TicketProps) {
    const formatDate = (isoString: string) => {
        const d = new Date(isoString)
        return `${d.toLocaleDateString('es-MX')} ${d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`
    }

    const serviceTypeLabel = {
        dine_in: 'En local',
        takeaway: 'Para llevar',
        delivery: 'Domicilio',
    }[serviceType]

    const paymentMethodLabel = {
        cash: 'Efectivo',
        card: 'Tarjeta',
        transfer: 'Transferencia',
    }[paymentMethod]

    return (
        <div id="ticket-root" style={{ display: 'none' }}>
            <div style={{
                fontFamily: "'Courier New', monospace",
                width: '302px',
                padding: '10px',
                fontSize: '12px',
                lineHeight: '1.4',
                backgroundColor: 'white',
                color: 'black',
            }}>
                {/* Header */}
                <div style={{ textAlign: 'center', borderBottom: '1px dashed #000', paddingBottom: '8px', marginBottom: '8px' }}>
                    <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '4px' }}>
                        {businessName}
                    </div>
                </div>

                {/* Info */}
                <div style={{ borderBottom: '1px dashed #000', paddingBottom: '8px', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Folio: {folio}</span>
                        <span>{formatDate(date)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                        {cashierName && <span>Atendió: {cashierName}</span>}
                        <span>Tipo: {serviceTypeLabel}</span>
                    </div>
                </div>

                {/* Items */}
                <div style={{ borderBottom: '1px dashed #000', paddingBottom: '8px', marginBottom: '8px' }}>
                    {items.map((item, idx) => {
                        const lineTotal = item.price * item.quantity
                        return (
                            <div key={`item-${idx}`} style={{ marginBottom: '6px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span>{item.quantity}x  {item.name}</span>
                                    <span>${lineTotal.toFixed(2)}</span>
                                </div>
                                {item.notes && (
                                    <div style={{ paddingLeft: '20px', fontSize: '10px', color: '#555' }}>
                                        &gt; {item.notes}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>

                {/* Totals */}
                <div style={{ textAlign: 'right', borderBottom: '1px dashed #000', paddingBottom: '8px', marginBottom: '8px' }}>
                    <div style={{ marginBottom: '4px' }}>
                        Subtotal: ${subtotal.toFixed(2)}
                    </div>
                    {discountAmount > 0 && (
                        <>
                            <div style={{ marginBottom: '4px' }}>
                                Descuento: -${discountAmount.toFixed(2)}
                            </div>
                            {discountReason && (
                                <div style={{ fontSize: '10px', color: '#555', marginBottom: '4px' }}>
                                    ({discountReason})
                                </div>
                            )}
                        </>
                    )}
                    <div style={{ fontSize: '14px', fontWeight: 'bold' }}>
                        TOTAL: ${total.toFixed(2)}
                    </div>
                </div>

                {/* Payment */}
                <div style={{ marginBottom: '8px' }}>
                    <div>Metodo: {paymentMethodLabel}</div>
                    {paymentMethod === 'cash' && cashReceived !== undefined && (
                        <>
                            <div>Recibido: ${cashReceived.toFixed(2)}</div>
                            {changeAmount !== undefined && changeAmount > 0 && <div>Cambio: ${changeAmount.toFixed(2)}</div>}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div style={{ textAlign: 'center', borderTop: '1px dashed #000', paddingTop: '8px' }}>
                    <div>Gracias por su compra!</div>
                    <div style={{ fontSize: '10px', marginTop: '4px' }}>www.gastro-os.com</div>
                </div>
            </div>
        </div>
    )
}
