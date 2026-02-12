'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useBusiness } from '@/lib/context/BusinessContext'
import { useDialog } from '@/lib/context/DialogContext'
import { Role } from '@/lib/types'
import { checkLimit, getLimitLabel, LimitResult } from '@/lib/limits'

interface TeamMember {
    id: string
    user_id: string | null
    role: Role
    status: 'pending' | 'active' | 'disabled'
    invited_email: string | null
    created_at: string
    // Datos del usuario (joined)
    user?: {
        email: string
        raw_user_meta_data?: { full_name?: string }
    }
}

const ROLES_DISPLAY: Record<Role, string> = {
    OWNER: 'Dueño',
    ADMIN: 'Administrador',
    CASHIER: 'Cajero',
    KITCHEN: 'Cocina',
    INVENTORY: 'Inventario'
}

const ROLES_INVITABLE: Role[] = ['ADMIN', 'CASHIER', 'KITCHEN', 'INVENTORY']

const STATUS_DISPLAY = {
    pending: { label: 'Pendiente', color: 'warning' },
    active: { label: 'Activo', color: 'success' },
    disabled: { label: 'Desactivado', color: 'muted' }
}

// MAX_USERS_V1 removed — now using checkLimit() from limits.ts

export default function TeamPage() {
    const { businessId, businessName, role: currentUserRole, userId } = useBusiness()
    const { confirm, alert } = useDialog()
    const [members, setMembers] = useState<TeamMember[]>([])
    const [loading, setLoading] = useState(true)
    const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null)

    // Modal crear empleado
    const [showCreateModal, setShowCreateModal] = useState(false)
    const [newName, setNewName] = useState('')
    const [newEmail, setNewEmail] = useState('')
    const [newPhone, setNewPhone] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [newRole, setNewRole] = useState<Role>('CASHIER')
    const [creating, setCreating] = useState(false)
    const [createError, setCreateError] = useState<string | null>(null)

    // Modal cambiar rol
    const [editingMember, setEditingMember] = useState<TeamMember | null>(null)
    const [editRole, setEditRole] = useState<Role>('CASHIER')


    const supabase = createClient()
    const isOwner = currentUserRole === 'OWNER'

    // Obtener email del usuario actual
    useEffect(() => {
        const fetchCurrentUser = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (user?.email) {
                setCurrentUserEmail(user.email)
            }
        }
        fetchCurrentUser()
    }, [supabase])

    const loadTeam = useCallback(async () => {
        if (!businessId) return

        setLoading(true)

        // Cargar membresías (sin join a auth.users que no está permitido directamente)
        const { data } = await supabase
            .from('business_memberships')
            .select('*')
            .eq('business_id', businessId)
            .is('deleted_at', null)
            .order('created_at')

        setMembers(data || [])
        setLoading(false)
    }, [businessId, supabase])

    useEffect(() => {
        if (businessId) {
            loadTeam()
        }
    }, [businessId, loadTeam])


    const [limitInfo, setLimitInfo] = useState<LimitResult | null>(null)
    const [showLimitModal, setShowLimitModal] = useState(false)

    const handleCreateMember = async () => {
        if (!businessId || !newName || !newPassword) return
        if (!newEmail && !newPhone) {
            setCreateError('Se requiere email o teléfono')
            return
        }

        // Verificar límite de usuarios (dinámico desde BD)
        const result = await checkLimit(supabase, businessId, 'users')
        if (!result.allowed) {
            setLimitInfo(result)
            setShowLimitModal(true)
            return
        }

        // Verificar que no exista ya (por email)
        if (newEmail) {
            const exists = members.some(m =>
                m.invited_email?.toLowerCase() === newEmail.toLowerCase() ||
                (m.user && m.user.email?.toLowerCase() === newEmail.toLowerCase())
            )
            if (exists) {
                setCreateError('Este email ya está en tu equipo')
                return
            }
        }

        setCreating(true)
        setCreateError(null)

        try {
            const response = await fetch('/api/team/create-member', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newName,
                    email: newEmail || null,
                    phone: newPhone || null,
                    password: newPassword,
                    role: newRole,
                    businessId,
                    creatorUserId: userId
                })
            })

            const data = await response.json()

            if (!response.ok) {
                setCreateError(data.error || 'Error al crear empleado')
                setCreating(false)
                return
            }

            // Exito
            setShowCreateModal(false)
            setNewName('')
            setNewEmail('')
            setNewPhone('')
            setNewPassword('')
            setNewRole('CASHIER')
            loadTeam()

            await alert({
                title: 'Empleado agregado',
                message: `${newName} ya puede iniciar sesión con ${newEmail || newPhone}`,
                variant: 'success'
            })
        } catch (error) {
            console.error('Error:', error)
            setCreateError('Error de conexión')
        }

        setCreating(false)
    }


    const handleChangeRole = async () => {
        if (!editingMember) return

        await supabase
            .from('business_memberships')
            .update({ role: editRole })
            .eq('id', editingMember.id)


        setEditingMember(null)
        loadTeam()
    }

    const handleRemoveAccess = async (member: TeamMember) => {
        // Regla: OWNER no puede quitarse a sí mismo
        if (member.user_id === userId && member.role === 'OWNER') {
            await alert({
                title: 'No puedes quitarte a ti mismo',
                message: 'Como dueño del negocio, no puedes quitar tu propio acceso.',
                variant: 'warning'
            })
            return
        }

        // Regla: No quitar al único OWNER
        const owners = members.filter(m => m.role === 'OWNER' && m.status === 'active')
        if (member.role === 'OWNER' && owners.length === 1) {
            await alert({
                title: 'Necesitas al menos un dueño',
                message: 'No puedes quitar al único dueño del negocio.',
                variant: 'warning'
            })
            return
        }

        const memberName = member.invited_email || member.user?.email || 'esta persona'
        const confirmed = await confirm({
            title: 'Quitar acceso',
            message: `¿Quitar acceso a ${memberName}? Ya no podrá entrar al sistema.`,
            confirmText: 'Quitar acceso',
            variant: 'danger'
        })

        if (!confirmed) return

        // Soft delete (desactivar)
        await supabase
            .from('business_memberships')
            .update({
                status: 'disabled',
                deleted_at: new Date().toISOString()
            })
            .eq('id', member.id)

        loadTeam()
    }

    const handleResendInvite = async (member: TeamMember) => {
        // TODO: Implementar reenvío de email
        await alert({
            title: 'Invitación reenviada',
            message: `Se reenviará la invitación a ${member.invited_email}`,
            variant: 'primary'
        })
    }

    const getMemberEmail = (member: TeamMember) => {
        // Si es el usuario actual, usar su email
        if (member.user_id === userId && currentUserEmail) {
            return currentUserEmail
        }
        return member.user?.email || member.invited_email || 'Sin email'
    }

    const getMemberName = (member: TeamMember) => {
        return member.user?.raw_user_meta_data?.full_name || getMemberEmail(member)
    }


    if (!isOwner) {
        return (
            <div className="team-page">
                <div className="card empty-state">
                    <h3>No tienes acceso</h3>
                    <p className="text-muted">Solo el dueño puede gestionar el equipo.</p>
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
                    <h1>Mi Equipo</h1>
                </div>
                <div className="card">
                    <p className="text-muted">Cargando equipo...</p>
                </div>
            </div>
        )
    }

    const activeCount = members.filter(m => m.status !== 'disabled').length

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
                    <h1>Mi Equipo</h1>
                    <p className="text-muted">
                        {businessName} • {activeCount} personas
                    </p>
                </div>
                <button
                    className="btn btn-primary"
                    onClick={() => setShowCreateModal(true)}
                >
                    + Agregar empleado
                </button>

            </div>

            {/* Tabla de equipo */}
            <div className="card">
                <table className="team-table">
                    <thead>
                        <tr>
                            <th>Persona</th>
                            <th>Rol</th>
                            <th>Estado</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {members.filter(m => m.status !== 'disabled').map(member => (
                            <tr key={member.id}>
                                <td>
                                    <div className="member-info">
                                        <span className="member-avatar">
                                            {getMemberName(member).charAt(0).toUpperCase()}
                                        </span>
                                        <div className="member-details">
                                            <span className="member-name">{getMemberName(member)}</span>
                                            <span className="member-email">{getMemberEmail(member)}</span>
                                        </div>
                                    </div>
                                </td>

                                <td>
                                    <span className={`role-badge ${member.role.toLowerCase()}`}>
                                        {ROLES_DISPLAY[member.role]}
                                    </span>
                                </td>
                                <td>
                                    <span className={`status-badge ${STATUS_DISPLAY[member.status].color}`}>
                                        {STATUS_DISPLAY[member.status].label}
                                    </span>
                                </td>
                                <td>
                                    <div className="member-actions">
                                        {member.status === 'pending' ? (
                                            <button
                                                className="btn btn-sm btn-secondary"
                                                onClick={() => handleResendInvite(member)}
                                            >
                                                Reenviar
                                            </button>
                                        ) : member.role !== 'OWNER' ? (
                                            <>
                                                <button
                                                    className="btn btn-sm btn-secondary"
                                                    onClick={() => {
                                                        setEditingMember(member)
                                                        setNewRole(member.role)
                                                    }}
                                                >
                                                    Cambiar rol
                                                </button>
                                                <button
                                                    className="btn btn-sm btn-danger"
                                                    onClick={() => handleRemoveAccess(member)}
                                                >
                                                    Quitar
                                                </button>
                                            </>
                                        ) : (
                                            <span className="text-muted">—</span>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Modal Crear Empleado */}
            {showCreateModal && (
                <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
                    <div className="modal-content modal-md" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Agregar empleado</h2>
                            <button className="modal-close" onClick={() => setShowCreateModal(false)}>&times;</button>
                        </div>

                        <div className="modal-body">
                            {createError && (
                                <div className="alert alert-danger">{createError}</div>
                            )}

                            <div className="form-group">
                                <label className="form-label">Nombre completo</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="Ej: Juan Pérez"
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    autoFocus
                                />
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">Email (opcional)</label>
                                    <input
                                        type="email"
                                        className="form-input"
                                        placeholder="correo@ejemplo.com"
                                        value={newEmail}
                                        onChange={(e) => setNewEmail(e.target.value)}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Teléfono (opcional)</label>
                                    <input
                                        type="tel"
                                        className="form-input"
                                        placeholder="55 1234 5678"
                                        value={newPhone}
                                        onChange={(e) => setNewPhone(e.target.value)}
                                    />
                                </div>
                            </div>
                            <span className="form-hint">Se usa el email o teléfono para iniciar sesión</span>

                            <div className="form-group mt-sm">
                                <label className="form-label">Contraseña</label>
                                <input
                                    type="password"
                                    className="form-input"
                                    placeholder="Mínimo 6 caracteres"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                />
                                <span className="form-hint">El empleado puede cambiarla después</span>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Rol en {businessName}</label>
                                <select
                                    className="form-select"
                                    value={newRole}
                                    onChange={(e) => setNewRole(e.target.value as Role)}
                                >
                                    {ROLES_INVITABLE.map(role => (
                                        <option key={role} value={role}>
                                            {ROLES_DISPLAY[role]}
                                        </option>
                                    ))}
                                </select>
                                <div className="role-description">
                                    {newRole === 'CASHIER' && 'Puede crear órdenes, cobrar y ver la caja'}
                                    {newRole === 'KITCHEN' && 'Solo ve la pantalla de cocina'}
                                    {newRole === 'INVENTORY' && 'Puede gestionar inventario y proveedores'}
                                    {newRole === 'ADMIN' && 'Puede hacer todo excepto gestionar equipo'}
                                </div>
                            </div>
                        </div>

                        <div className="modal-footer">
                            <button
                                className="btn btn-ghost"
                                onClick={() => setShowCreateModal(false)}
                            >
                                Cancelar
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={handleCreateMember}
                                disabled={creating || !newName || !newPassword || (!newEmail && !newPhone)}
                            >
                                {creating ? 'Creando...' : 'Agregar empleado'}
                            </button>
                        </div>
                    </div>
                </div>
            )}


            {/* Modal Cambiar Rol */}
            {editingMember && (
                <div className="modal-overlay" onClick={() => setEditingMember(null)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">Cambiar rol</h3>
                            <button className="btn btn-icon" onClick={() => setEditingMember(null)}>✕</button>
                        </div>
                        <div className="modal-body">
                            <p className="text-muted">
                                {getMemberName(editingMember)} actualmente es <strong>{ROLES_DISPLAY[editingMember.role]}</strong>
                            </p>

                            <div className="form-group">
                                <label className="form-label">Nuevo rol</label>
                                <select
                                    className="form-select"
                                    value={editRole}
                                    onChange={(e) => setEditRole(e.target.value as Role)}
                                >

                                    {ROLES_INVITABLE.map(role => (
                                        <option key={role} value={role}>
                                            {ROLES_DISPLAY[role]}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="modal-footer">
                            <button
                                className="btn btn-ghost"
                                onClick={() => setEditingMember(null)}
                            >
                                Cancelar
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={handleChangeRole}
                            >
                                Guardar cambio
                            </button>
                        </div>
                    </div>
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
                            <h3 className="limit-modal-title">Límite de {getLimitLabel('users')}</h3>
                            <p className="limit-modal-text">Has alcanzado el máximo de tu plan actual.</p>
                            <div className="limit-modal-counter">{limitInfo.current} / {limitInfo.limit}</div>
                            <p className="limit-modal-help">Contacta soporte para ampliar tu plan.</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
