'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useBusiness } from '@/lib/context/BusinessContext'
import { useDialog } from '@/lib/context/DialogContext'
import { InventoryItem, InventoryUnit, TrackMode, MovementType } from '@/lib/types'

// Categorias sugeridas
const CATEGORY_SUGGESTIONS = ['Bebidas', 'Empaques', 'Extras', 'Limpieza', 'Insumos']

// Unidades disponibles
const UNIT_OPTIONS: { value: InventoryUnit; label: string }[] = [
    { value: 'pz', label: 'Pieza' },
    { value: 'paquete', label: 'Paquete' },
    { value: 'caja', label: 'Caja' },
    { value: 'litro', label: 'Litro' },
    { value: 'kg', label: 'Kilogramo' },
    { value: 'g', label: 'Gramo' },
    { value: 'ml', label: 'Mililitro' },
]

export default function InventoryPage() {
    const { businessId, loading: businessLoading } = useBusiness()
    const { confirm } = useDialog()
    const [items, setItems] = useState<InventoryItem[]>([])
    const [loading, setLoading] = useState(true)
    const [showNewModal, setShowNewModal] = useState(false)
    const [showMovementModal, setShowMovementModal] = useState(false)
    const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null)
    const [movementType, setMovementType] = useState<'adjustment' | 'entry' | 'waste'>('adjustment')
    const supabase = createClient()

    const loadInventory = useCallback(async () => {
        if (!businessId) return

        const { data } = await supabase
            .from('inventory_items')
            .select('*')
            .eq('business_id', businessId)
            .eq('active', true)
            .is('deleted_at', null)
            .order('name')

        setItems(data || [])
        setLoading(false)
    }, [businessId, supabase])

    useEffect(() => {
        if (businessLoading || !businessId) return
        loadInventory()
    }, [businessLoading, businessId, loadInventory])

    const getStockStatus = (item: InventoryItem) => {
        if (item.stock_current <= 0) return { color: 'var(--color-danger)', label: 'Agotado', class: 'status-danger' }
        if (item.stock_current <= item.stock_min) return { color: 'var(--color-warning)', label: 'Bajo', class: 'status-warning' }
        return { color: 'var(--color-success)', label: 'OK', class: 'status-success' }
    }

    const openMovementModal = (item: InventoryItem, type: 'adjustment' | 'entry' | 'waste') => {
        setSelectedItem(item)
        setMovementType(type)
        setShowMovementModal(true)
    }

    const handleDeleteItem = async (item: InventoryItem) => {
        const confirmed = await confirm({
            title: `¿Eliminar "${item.name}"?`,
            message: 'Se eliminará este item del inventario. Esta acción no se puede deshacer.',
            confirmText: 'Eliminar',
            variant: 'danger',
        })
        if (!confirmed) return

        await supabase
            .from('inventory_items')
            .update({ deleted_at: new Date().toISOString(), active: false })
            .eq('id', item.id)

        loadInventory()
    }

    if (businessLoading || loading) {
        return (
            <div className="page-loading">
                <p className="text-muted">Cargando inventario...</p>
            </div>
        )
    }

    return (
        <div className="page-container">
            <div className="page-header">
                <h1 className="page-title">Inventario</h1>
                <div className="page-actions">
                    <button
                        className="btn btn-primary btn-sm"
                        onClick={() => setShowNewModal(true)}
                    >
                        + Nuevo Item
                    </button>
                </div>
            </div>

            {items.length === 0 ? (
                <div className="empty-state">
                    <p className="text-muted">No hay items de inventario</p>
                    <p className="text-sm text-muted">Agrega items para controlar tu stock</p>
                </div>
            ) : (
                <div className="inventory-list">
                    {items.map((item) => {
                        const status = getStockStatus(item)
                        return (
                            <div key={item.id} className="inventory-card">
                                <div className="inventory-info">
                                    <div className="inventory-header">
                                        <span className="inventory-name">{item.name}</span>
                                        {item.track_mode === 'auto' && (
                                            <span className="badge badge-auto">auto</span>
                                        )}
                                    </div>
                                    <div className="inventory-meta">
                                        {item.category && (
                                            <span className="inventory-category">{item.category}</span>
                                        )}
                                        <span
                                            className={`inventory-status ${status.class}`}
                                            style={{ color: status.color }}
                                        >
                                            {status.label}
                                        </span>
                                    </div>
                                </div>
                                <div className="inventory-stock">
                                    <span className="stock-value">{item.stock_current}</span>
                                    <span className="stock-unit">{item.unit}</span>
                                </div>
                                <div className="inventory-actions">
                                    <button
                                        className="inv-action-btn inv-action-adjust"
                                        onClick={() => openMovementModal(item, 'adjustment')}
                                    >
                                        Ajustar
                                    </button>
                                    <button
                                        className="inv-action-btn inv-action-entry"
                                        onClick={() => openMovementModal(item, 'entry')}
                                    >
                                        Entrada
                                    </button>
                                    <button
                                        className="inv-action-btn inv-action-waste"
                                        onClick={() => openMovementModal(item, 'waste')}
                                    >
                                        Merma
                                    </button>
                                    <button
                                        className="inv-action-btn inv-action-delete"
                                        onClick={() => handleDeleteItem(item)}
                                    >
                                        Eliminar
                                    </button>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Modal Nuevo Item */}
            {showNewModal && (
                <NewItemModal
                    businessId={businessId!}
                    onClose={() => setShowNewModal(false)}
                    onSaved={() => {
                        setShowNewModal(false)
                        loadInventory()
                    }}
                />
            )}

            {/* Modal Movimiento */}
            {showMovementModal && selectedItem && (
                <MovementModal
                    item={selectedItem}
                    type={movementType}
                    businessId={businessId!}
                    onClose={() => {
                        setShowMovementModal(false)
                        setSelectedItem(null)
                    }}
                    onSaved={() => {
                        setShowMovementModal(false)
                        setSelectedItem(null)
                        loadInventory()
                    }}
                />
            )}
        </div>
    )
}

// Modal para crear nuevo item
function NewItemModal({
    businessId,
    onClose,
    onSaved
}: {
    businessId: string
    onClose: () => void
    onSaved: () => void
}) {
    const [name, setName] = useState('')
    const [category, setCategory] = useState('')
    const [customCategory, setCustomCategory] = useState('')
    const [unit, setUnit] = useState<InventoryUnit>('pz')
    const [stockInitial, setStockInitial] = useState('')
    const [stockMin, setStockMin] = useState('')
    const [trackMode, setTrackMode] = useState<TrackMode>('manual')
    const [saving, setSaving] = useState(false)
    const supabase = createClient()

    const handleSave = async () => {
        if (!name.trim()) return

        setSaving(true)
        const finalCategory = category === 'Otro' ? customCategory : category

        const { error } = await supabase
            .from('inventory_items')
            .insert({
                business_id: businessId,
                name: name.trim(),
                category: finalCategory || null,
                unit,
                stock_current: stockInitial === '' ? 0 : Number(stockInitial),
                stock_min: stockMin === '' ? 0 : Number(stockMin),
                track_mode: trackMode,
            })

        if (!error) {
            onSaved()
        }
        setSaving(false)
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content modal-md" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>Nuevo Item de Inventario</h2>
                    <button className="modal-close" onClick={onClose}>&times;</button>
                </div>
                <div className="modal-body">
                    <div className="form-group">
                        <label className="form-label">Nombre</label>
                        <input
                            type="text"
                            className="form-input"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="Ej: Coca-Cola 600ml"
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">Categoria</label>
                        <select
                            className="form-select"
                            value={category}
                            onChange={e => setCategory(e.target.value)}
                        >
                            <option value="">Sin categoria</option>
                            {CATEGORY_SUGGESTIONS.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                            <option value="Otro">Otro...</option>
                        </select>
                        {category === 'Otro' && (
                            <input
                                type="text"
                                className="form-input mt-sm"
                                value={customCategory}
                                onChange={e => setCustomCategory(e.target.value)}
                                placeholder="Nombre de la categoria"
                            />
                        )}
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label">Unidad</label>
                            <select
                                className="form-select"
                                value={unit}
                                onChange={e => setUnit(e.target.value as InventoryUnit)}
                            >
                                {UNIT_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Stock Inicial</label>
                            <input
                                type="number"
                                className="form-input"
                                value={stockInitial}
                                onChange={e => setStockInitial(e.target.value)}
                                min="0"
                                placeholder="0"
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Stock Minimo</label>
                        <input
                            type="number"
                            className="form-input"
                            value={stockMin}
                            onChange={e => setStockMin(e.target.value)}
                            min="0"
                            placeholder="0"
                        />
                        <span className="form-helper">Te avisamos cuando llegue a este nivel</span>
                    </div>

                    <div className="form-group">
                        <label className="toggle-label">
                            <input
                                type="checkbox"
                                checked={trackMode === 'auto'}
                                onChange={e => setTrackMode(e.target.checked ? 'auto' : 'manual')}
                            />
                            <span className="toggle-text">
                                <strong>Descontar automatico (avanzado)</strong>
                                <small>Ideal para refrescos, cervezas y empaques. Se descuenta al vender.</small>
                            </span>
                        </label>
                    </div>
                </div>
                <div className="modal-footer">
                    <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
                    <button
                        className="btn btn-primary"
                        onClick={handleSave}
                        disabled={saving || !name.trim()}
                    >
                        {saving ? 'Guardando...' : 'Guardar'}
                    </button>
                </div>
            </div>
        </div>
    )
}

// Modal para movimientos
function MovementModal({
    item,
    type,
    businessId,
    onClose,
    onSaved
}: {
    item: InventoryItem
    type: 'adjustment' | 'entry' | 'waste'
    businessId: string
    onClose: () => void
    onSaved: () => void
}) {
    const [quantity, setQuantity] = useState(0)
    const [reason, setReason] = useState('')
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const supabase = createClient()

    const getMovementType = (): MovementType => {
        switch (type) {
            case 'entry': return 'purchase'
            case 'waste': return 'waste'
            default: return 'manual_adjustment'
        }
    }

    const getDelta = (): number => {
        if (type === 'waste') return -Math.abs(quantity)
        if (type === 'entry') return Math.abs(quantity)
        return quantity // adjustment puede ser positivo o negativo
    }

    const getTitle = () => {
        switch (type) {
            case 'entry': return 'Entrada de Stock'
            case 'waste': return 'Registrar Merma'
            default: return 'Ajustar Stock'
        }
    }

    const handleSave = async () => {
        if (quantity === 0) return

        setSaving(true)
        setError(null)

        const { data: user } = await supabase.auth.getUser()
        if (!user.user) {
            setError('Usuario no autenticado')
            setSaving(false)
            return
        }

        const delta = getDelta()
        const movType = getMovementType()

        // 1. Actualizar stock directamente
        const { error: updateError } = await supabase
            .from('inventory_items')
            .update({ stock_current: item.stock_current + delta })
            .eq('id', item.id)

        if (updateError) {
            setError('Error al actualizar stock: ' + updateError.message)
            setSaving(false)
            return
        }

        // 2. Registrar movimiento
        const { error: movError } = await supabase
            .from('inventory_movements')
            .insert({
                item_id: item.id,
                business_id: businessId,
                type: movType,
                delta: delta,
                reason: reason || null,
                created_by: user.user.id,
            })

        if (movError) {
            console.error('[Inventario] Error al registrar movimiento:', movError)
            // No bloquear - el stock ya se actualizó
        }

        onSaved()
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content modal-sm" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>{getTitle()}</h2>
                    <button className="modal-close" onClick={onClose}>&times;</button>
                </div>
                <div className="modal-body">
                    <div className="movement-item-info">
                        <strong>{item.name}</strong>
                        <span className="text-muted">Stock actual: {item.stock_current} {item.unit}</span>
                    </div>

                    {error && (
                        <div className="alert alert-danger">{error}</div>
                    )}

                    <div className="form-group">
                        <label className="form-label">
                            {type === 'adjustment' ? 'Cantidad (+/-)' : 'Cantidad'}
                        </label>
                        <input
                            type="number"
                            className="form-input"
                            value={quantity}
                            onChange={e => setQuantity(Number(e.target.value))}
                            min={type === 'adjustment' ? undefined : 0}
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">Razon (opcional)</label>
                        <input
                            type="text"
                            className="form-input"
                            value={reason}
                            onChange={e => setReason(e.target.value)}
                            placeholder="Ej: Conteo fisico, producto danado..."
                        />
                    </div>

                    <div className="movement-preview">
                        <span>Nuevo stock:</span>
                        <strong>{item.stock_current + getDelta()} {item.unit}</strong>
                    </div>
                </div>
                <div className="modal-footer">
                    <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
                    <button
                        className="btn btn-primary"
                        onClick={handleSave}
                        disabled={saving || quantity === 0}
                    >
                        {saving ? 'Guardando...' : 'Aplicar'}
                    </button>
                </div>
            </div>
        </div>
    )
}
