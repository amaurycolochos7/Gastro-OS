'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useBusiness } from '@/lib/context/BusinessContext'
import { useDialog } from '@/lib/context/DialogContext'

export default function BusinessSettingsPage() {
    const { businessId, businessName, role } = useBusiness()
    const { alert } = useDialog()
    const supabase = createClient()

    const [operationMode, setOperationMode] = useState<'counter' | 'restaurant'>('restaurant')
    const [kitchenEnabled, setKitchenEnabled] = useState(true)
    const [permissionOverrides, setPermissionOverrides] = useState<Record<string, string[]>>({})
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [savingPermission, setSavingPermission] = useState<string | null>(null)

    const isOwner = role === 'OWNER'

    const loadSettings = useCallback(async () => {
        if (!businessId) return
        setLoading(true)
        const { data } = await supabase
            .from('businesses')
            .select('operation_mode, kitchen_enabled, permission_overrides')
            .eq('id', businessId)
            .single()
        if (data) {
            setOperationMode((data.operation_mode as 'counter' | 'restaurant') || 'restaurant')
            setKitchenEnabled(data.kitchen_enabled ?? true)
            setPermissionOverrides(data.permission_overrides || {})
        }
        setLoading(false)
    }, [businessId, supabase])

    useEffect(() => { loadSettings() }, [loadSettings])

    const handleToggleKitchen = async (checked: boolean) => {
        if (!businessId) return
        const previous = kitchenEnabled
        setKitchenEnabled(checked)
        setSaving(true)
        const { data, error } = await supabase.rpc('set_kitchen_enabled', {
            p_business_id: businessId,
            p_enabled: checked,
        })
        setSaving(false)
        if (error || !data?.success) {
            setKitchenEnabled(previous)
            await alert({
                title: 'No se pudo actualizar',
                message: error?.message || data?.message || 'Intenta de nuevo.',
                variant: 'warning',
            })
        }
    }

    const handleToggleCashierPermission = async (permission: string, checked: boolean) => {
        if (!businessId) return
        const previous = permissionOverrides
        const roles = checked ? ['CASHIER'] : []
        setPermissionOverrides(prev => ({ ...prev, [permission]: roles }))
        setSavingPermission(permission)
        const { data, error } = await supabase.rpc('set_permission_override', {
            p_business_id: businessId,
            p_permission: permission,
            p_roles: roles,
        })
        setSavingPermission(null)
        if (error || !data?.success) {
            setPermissionOverrides(previous)
            await alert({
                title: 'No se pudo actualizar',
                message: error?.message || data?.message || 'Intenta de nuevo.',
                variant: 'warning',
            })
        }
    }

    if (!isOwner) {
        return (
            <div className="team-page">
                <div className="card empty-state">
                    <h3>No tienes acceso</h3>
                    <p className="text-muted">Solo el dueño puede cambiar la configuración del negocio.</p>
                    <Link href="/dashboard" className="btn btn-primary">
                        Volver al inicio
                    </Link>
                </div>
            </div>
        )
    }

    if (loading) {
        return (
            <div className="team-page">
                <div className="page-header">
                    <h1>Configuración del negocio</h1>
                </div>
                <div className="card">
                    <p className="text-muted">Cargando...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="team-page">
            <div className="page-header">
                <div>
                    <Link href="/dashboard" className="back-link">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="15 18 9 12 15 6"></polyline>
                        </svg>
                        Volver
                    </Link>
                    <h1>Configuración del negocio</h1>
                    <p className="text-muted">{businessName}</p>
                </div>
            </div>

            <div className="card">
                <div className="form-group">
                    <label className="toggle-label">
                        <input
                            type="checkbox"
                            checked={kitchenEnabled}
                            disabled={saving}
                            onChange={e => handleToggleKitchen(e.target.checked)}
                        />
                        <span className="toggle-text">
                            <strong>Módulo de Cocina</strong>
                            <small>
                                Actívalo si tu negocio prepara pedidos en cocina antes de servirlos (restaurantes,
                                taquerías). Para ventas directas de barra o mostrador puedes dejarlo apagado — tus
                                órdenes abiertas pasan a llamarse &quot;cuentas&quot; y el flujo de cobro es más directo.
                                {operationMode === 'counter' && !kitchenEnabled && ' Tu negocio está en modo Mostrador/Barra, por eso viene apagado por defecto.'}
                            </small>
                        </span>
                    </label>
                </div>
            </div>

            <div className="card" style={{ marginTop: 'var(--spacing-lg)' }}>
                <h3 style={{ marginBottom: 'var(--spacing-xs)' }}>Permisos del equipo</h3>
                <p className="text-muted" style={{ marginBottom: 'var(--spacing-md)', fontSize: 'var(--font-size-sm)' }}>
                    Por defecto, solo el Dueño y los Administradores pueden cancelar órdenes, anular pagos o hacer
                    reembolsos. Actívalo aquí si quieres que tus Cajeros también puedan hacerlo.
                </p>

                <div className="form-group">
                    <label className="toggle-label">
                        <input
                            type="checkbox"
                            checked={(permissionOverrides['order:cancel'] || []).includes('CASHIER')}
                            disabled={savingPermission === 'order:cancel'}
                            onChange={e => handleToggleCashierPermission('order:cancel', e.target.checked)}
                        />
                        <span className="toggle-text">
                            <strong>El Cajero puede cancelar órdenes</strong>
                            <small>Solo aplica a órdenes que todavía no tienen ningún pago registrado.</small>
                        </span>
                    </label>
                </div>

                <div className="form-group">
                    <label className="toggle-label">
                        <input
                            type="checkbox"
                            checked={(permissionOverrides['payment:void'] || []).includes('CASHIER')}
                            disabled={savingPermission === 'payment:void'}
                            onChange={e => handleToggleCashierPermission('payment:void', e.target.checked)}
                        />
                        <span className="toggle-text">
                            <strong>El Cajero puede anular pagos (void)</strong>
                            <small>Solo pagos del turno de caja que sigue abierto ahora mismo.</small>
                        </span>
                    </label>
                </div>

                <div className="form-group">
                    <label className="toggle-label">
                        <input
                            type="checkbox"
                            checked={(permissionOverrides['payment:refund'] || []).includes('CASHIER')}
                            disabled={savingPermission === 'payment:refund'}
                            onChange={e => handleToggleCashierPermission('payment:refund', e.target.checked)}
                        />
                        <span className="toggle-text">
                            <strong>El Cajero puede hacer reembolsos</strong>
                            <small>Solo pagos de turnos de caja ya cerrados.</small>
                        </span>
                    </label>
                </div>
            </div>
        </div>
    )
}
