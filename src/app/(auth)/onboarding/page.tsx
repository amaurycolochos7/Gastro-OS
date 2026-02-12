'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BusinessType, OperationMode } from '@/lib/types'

const BUSINESS_TYPES: { value: BusinessType; label: string }[] = [
    { value: 'taqueria', label: 'Taquería' },
    { value: 'pizzeria', label: 'Pizzería' },
    { value: 'cafeteria', label: 'Cafetería' },
    { value: 'fast_food', label: 'Comida Rápida' },
    { value: 'other', label: 'Otro' },
]

const OPERATION_MODES: { value: OperationMode; label: string; description: string }[] = [
    { value: 'counter', label: 'Mostrador / Food Truck', description: 'Pedidos directos, sin mesas' },
    { value: 'restaurant', label: 'Restaurante', description: 'Con servicio a mesas' },
]

export default function OnboardingPage() {
    const [step, setStep] = useState(1)
    const [name, setName] = useState('')
    const [type, setType] = useState<BusinessType>('taqueria')
    const [mode, setMode] = useState<OperationMode>('counter')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const router = useRouter()
    const supabase = createClient()

    const handleCreateBusiness = async () => {
        if (!name.trim()) {
            setError('El nombre es requerido')
            return
        }

        setLoading(true)
        setError('')

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            router.push('/login')
            return
        }

        const { data: business, error: bizError } = await supabase
            .from('businesses')
            .insert({
                name: name.trim(),
                type,
                operation_mode: mode,
            })
            .select()
            .single()

        if (bizError) {
            setError(bizError.message)
            setLoading(false)
            return
        }

        const { error: memberError } = await supabase
            .from('business_memberships')
            .insert({
                business_id: business.id,
                user_id: user.id,
                role: 'OWNER',
            })

        if (memberError) {
            setError(memberError.message)
            setLoading(false)
            return
        }

        router.push('/dashboard')
    }

    return (
        <div className="auth-page">
            <div className="auth-container">
                <div className="auth-brand">
                    <h1 className="auth-title">GastroOS</h1>
                    <p className="auth-subtitle">Configurar negocio</p>
                </div>

                <div className="auth-card">
                    {/* Progress */}
                    <div className="flex gap-sm mb-md">
                        {[1, 2, 3].map((s) => (
                            <div
                                key={s}
                                style={{
                                    flex: 1,
                                    height: 4,
                                    borderRadius: 2,
                                    background: s <= step ? 'var(--color-primary)' : 'var(--border-color)',
                                }}
                            />
                        ))}
                    </div>

                    {step === 1 && (
                        <div className="flex flex-col gap-lg">
                            <h2 className="auth-card-title">¿Cómo se llama tu negocio?</h2>
                            <div className="form-group">
                                <label className="form-label">Nombre del negocio</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="Mi Taquería"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    autoFocus
                                />
                            </div>
                            <button
                                className="btn btn-primary btn-lg w-full"
                                onClick={() => name.trim() && setStep(2)}
                                disabled={!name.trim()}
                            >
                                Continuar
                            </button>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="flex flex-col gap-lg">
                            <h2 className="auth-card-title">¿Qué tipo de negocio es?</h2>
                            <div className="flex flex-col gap-sm">
                                {BUSINESS_TYPES.map((t) => (
                                    <button
                                        key={t.value}
                                        className={`btn ${type === t.value ? 'btn-primary' : 'btn-secondary'} btn-lg`}
                                        onClick={() => setType(t.value)}
                                    >
                                        {t.label}
                                    </button>
                                ))}
                            </div>
                            <button
                                className="btn btn-primary btn-lg w-full"
                                onClick={() => setStep(3)}
                            >
                                Continuar
                            </button>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="flex flex-col gap-lg">
                            <h2 className="auth-card-title">¿Cómo operas?</h2>
                            <div className="flex flex-col gap-sm">
                                {OPERATION_MODES.map((m) => (
                                    <button
                                        key={m.value}
                                        className="card"
                                        onClick={() => setMode(m.value)}
                                        style={{
                                            cursor: 'pointer',
                                            border: mode === m.value ? '2px solid var(--color-primary)' : undefined,
                                            textAlign: 'left',
                                        }}
                                    >
                                        <div className="font-bold">{m.label}</div>
                                        <div className="text-sm text-muted">{m.description}</div>
                                    </button>
                                ))}
                            </div>

                            {error && (
                                <div className="form-error-box">
                                    <span>!</span> {error}
                                </div>
                            )}

                            <button
                                className="btn btn-primary btn-lg w-full"
                                onClick={handleCreateBusiness}
                                disabled={loading}
                            >
                                {loading ? 'Creando...' : 'Crear negocio'}
                            </button>
                        </div>
                    )}

                    {step > 1 && (
                        <button
                            className="btn btn-secondary w-full mt-md"
                            onClick={() => setStep(step - 1)}
                        >
                            Atrás
                        </button>
                    )}
                </div>

                <p className="auth-footer">
                    © 2026 GastroOS
                </p>
            </div>
        </div>
    )
}
