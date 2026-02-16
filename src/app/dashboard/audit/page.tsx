'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useBusiness } from '@/lib/context/BusinessContext'
import { AuditLog, AuditEntity } from '@/lib/types'

const PAGE_SIZE = 25

const ACTION_OPTIONS = ['create', 'update', 'delete', 'close_register', 'open_register', 'auto_sale', 'refund_payment']
const ENTITY_OPTIONS: AuditEntity[] = ['order', 'payment', 'cash_register', 'cash_movement', 'inventory', 'product']

const ENTITY_LABELS: Record<string, string> = {
    order: 'Orden',
    payment: 'Pago',
    cash_register: 'Caja',
    cash_movement: 'Mov. Caja',
    inventory: 'Inventario',
    product: 'Producto',
}

const ACTION_LABELS: Record<string, string> = {
    create: 'Crear',
    update: 'Actualizar',
    delete: 'Eliminar',
    close_register: 'Cerrar caja',
    open_register: 'Abrir caja',
    auto_sale: 'Venta auto',
    refund_payment: 'Reembolso',
}

export default function AuditPage() {
    const { businessId, businessName, role, loading: bizLoading } = useBusiness()
    const supabase = createClient()

    const [logs, setLogs] = useState<AuditLog[]>([])
    const [loading, setLoading] = useState(true)
    const [page, setPage] = useState(0)
    const [totalCount, setTotalCount] = useState(0)

    const [actionFilter, setActionFilter] = useState('')
    const [entityFilter, setEntityFilter] = useState('')
    const [dateRange, setDateRange] = useState('7')

    const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null)
    const [copied, setCopied] = useState(false)

    const totalPages = Math.ceil(totalCount / PAGE_SIZE)

    const loadLogs = useCallback(async () => {
        if (!businessId) return
        setLoading(true)

        let query = supabase
            .from('audit_logs')
            .select('*', { count: 'exact' })
            .eq('business_id', businessId)
            .order('created_at', { ascending: false })
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

        if (actionFilter) query = query.eq('action', actionFilter)
        if (entityFilter) query = query.eq('entity', entityFilter)

        if (dateRange) {
            const days = parseInt(dateRange)
            const from = new Date()
            from.setDate(from.getDate() - days)
            from.setHours(0, 0, 0, 0)
            query = query.gte('created_at', from.toISOString())
        }

        const { data, count } = await query
        setLogs(data || [])
        setTotalCount(count || 0)
        setLoading(false)
    }, [businessId, page, actionFilter, entityFilter, dateRange])

    useEffect(() => {
        if (!bizLoading && businessId) loadLogs()
    }, [bizLoading, businessId, loadLogs])

    useEffect(() => {
        setPage(0)
    }, [actionFilter, entityFilter, dateRange])

    const getActorName = (log: AuditLog) => {
        const meta = log.metadata as Record<string, unknown> | null
        if (meta?.actor_name) return meta.actor_name as string
        if (meta?.actor_email) return (meta.actor_email as string).split('@')[0]
        return log.actor_user_id.substring(0, 8) + '...'
    }

    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr)
        return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    }

    const handleCopyJSON = async (metadata: Record<string, unknown> | null) => {
        if (!metadata) return
        await navigator.clipboard.writeText(JSON.stringify(metadata, null, 2))
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    if (!bizLoading && role !== 'OWNER' && role !== 'ADMIN') {
        return (
            <div className="audit-page">
                <div className="card" style={{ textAlign: 'center', padding: 'var(--spacing-xl)' }}>
                    <p className="text-muted">No tienes permisos para ver esta página.</p>
                    <Link href="/dashboard" className="btn btn-primary" style={{ marginTop: 'var(--spacing-md)' }}>Volver al inicio</Link>
                </div>
            </div>
        )
    }

    return (
        <div className="audit-page">
            {/* Header — same pattern as team page */}
            <div className="page-header">
                <div>
                    <Link href="/dashboard" className="back-link">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="15 18 9 12 15 6"></polyline>
                        </svg>
                        Volver
                    </Link>
                    <h1>Registro de Auditoría</h1>
                    <p className="text-muted">
                        {businessName} &middot; {totalCount} registro{totalCount !== 1 ? 's' : ''}
                    </p>
                </div>
            </div>

            {/* Filters */}
            <div className="audit-filters">
                <select
                    className="form-input"
                    value={actionFilter}
                    onChange={(e) => setActionFilter(e.target.value)}
                >
                    <option value="">Todas las acciones</option>
                    {ACTION_OPTIONS.map(a => (
                        <option key={a} value={a}>{ACTION_LABELS[a] || a}</option>
                    ))}
                </select>

                <select
                    className="form-input"
                    value={entityFilter}
                    onChange={(e) => setEntityFilter(e.target.value)}
                >
                    <option value="">Todas las entidades</option>
                    {ENTITY_OPTIONS.map(e => (
                        <option key={e} value={e}>{ENTITY_LABELS[e] || e}</option>
                    ))}
                </select>

                <select
                    className="form-input"
                    value={dateRange}
                    onChange={(e) => setDateRange(e.target.value)}
                >
                    <option value="1">Hoy</option>
                    <option value="7">Últimos 7 días</option>
                    <option value="30">Últimos 30 días</option>
                    <option value="">Todo el historial</option>
                </select>
            </div>

            {/* Table Card */}
            <div className="card audit-card">
                {loading ? (
                    <div className="audit-empty">Cargando registros...</div>
                ) : logs.length === 0 ? (
                    <div className="audit-empty">
                        No se encontraron registros con estos filtros.
                    </div>
                ) : (
                    <>
                        {/* Desktop table */}
                        <table className="audit-table desktop-only">
                            <thead>
                                <tr>
                                    <th>Fecha</th>
                                    <th>Usuario</th>
                                    <th>Acción</th>
                                    <th>Entidad</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.map((log) => (
                                    <tr key={log.id} onClick={() => setSelectedLog(log)} className="audit-row-clickable">
                                        <td className="audit-cell-date">{formatDate(log.created_at)}</td>
                                        <td className="audit-cell-user">{getActorName(log)}</td>
                                        <td>
                                            <span className={`audit-badge action-${log.action}`}>
                                                {ACTION_LABELS[log.action] || log.action}
                                            </span>
                                        </td>
                                        <td>
                                            <span className="audit-badge entity">
                                                {ENTITY_LABELS[log.entity] || log.entity}
                                            </span>
                                        </td>
                                        <td>
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M9 18l6-6-6-6" />
                                            </svg>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        {/* Mobile cards */}
                        <div className="audit-mobile-list mobile-only">
                            {logs.map((log) => (
                                <div key={log.id} className="audit-mobile-item" onClick={() => setSelectedLog(log)}>
                                    <div className="audit-mobile-top">
                                        <span className="audit-mobile-date">{formatDate(log.created_at)}</span>
                                        <span className="audit-mobile-user">{getActorName(log)}</span>
                                    </div>
                                    <div className="audit-mobile-badges">
                                        <span className={`audit-badge action-${log.action}`}>
                                            {ACTION_LABELS[log.action] || log.action}
                                        </span>
                                        <span className="audit-badge entity">
                                            {ENTITY_LABELS[log.entity] || log.entity}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="audit-pagination">
                    <span className="audit-pagination-info">
                        {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} de {totalCount}
                    </span>
                    <div className="audit-pagination-controls">
                        <button
                            className="btn btn-secondary"
                            disabled={page === 0}
                            onClick={() => setPage(p => p - 1)}
                        >
                            Anterior
                        </button>
                        <span className="audit-pagination-page">
                            {page + 1} / {totalPages}
                        </span>
                        <button
                            className="btn btn-secondary"
                            disabled={page >= totalPages - 1}
                            onClick={() => setPage(p => p + 1)}
                        >
                            Siguiente
                        </button>
                    </div>
                </div>
            )}

            {/* Detail Modal */}
            {selectedLog && (
                <div className="modal-overlay" onClick={() => setSelectedLog(null)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
                        <div className="modal-header">
                            <h2 className="modal-title">Detalle de registro</h2>
                            <button className="modal-close" onClick={() => setSelectedLog(null)}>&times;</button>
                        </div>
                        <div className="modal-body">
                            <div className="audit-detail-grid">
                                <div className="audit-detail-row">
                                    <span className="audit-detail-label">Acción</span>
                                    <span className={`audit-badge action-${selectedLog.action}`}>
                                        {ACTION_LABELS[selectedLog.action] || selectedLog.action}
                                    </span>
                                </div>
                                <div className="audit-detail-row">
                                    <span className="audit-detail-label">Entidad</span>
                                    <span className="audit-badge entity">
                                        {ENTITY_LABELS[selectedLog.entity] || selectedLog.entity}
                                    </span>
                                </div>
                                <div className="audit-detail-row">
                                    <span className="audit-detail-label">ID</span>
                                    <span className="audit-detail-id">{selectedLog.entity_id}</span>
                                </div>
                                <div className="audit-detail-row">
                                    <span className="audit-detail-label">Fecha</span>
                                    <span>{new Date(selectedLog.created_at).toLocaleString('es-MX')}</span>
                                </div>
                                <div className="audit-detail-row">
                                    <span className="audit-detail-label">Usuario</span>
                                    <span style={{ fontWeight: 500 }}>{getActorName(selectedLog)}</span>
                                </div>
                            </div>

                            {selectedLog.metadata && (
                                <div className="audit-metadata-section">
                                    <div className="audit-metadata-header">
                                        <span className="audit-detail-label">Metadata</span>
                                        <button
                                            className="audit-copy-btn"
                                            onClick={() => handleCopyJSON(selectedLog.metadata as Record<string, unknown>)}
                                        >
                                            {copied ? 'Copiado' : 'Copiar JSON'}
                                        </button>
                                    </div>
                                    <pre className="audit-metadata-pre">
                                        {JSON.stringify(selectedLog.metadata, null, 2)}
                                    </pre>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
