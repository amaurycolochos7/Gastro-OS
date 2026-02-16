'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BusinessType, OperationMode } from '@/lib/types'

const BUSINESS_TYPES: { value: BusinessType; label: string; emoji: string }[] = [
    { value: 'taqueria', label: 'Taquería', emoji: '🌮' },
    { value: 'pizzeria', label: 'Pizzería', emoji: '🍕' },
    { value: 'cafeteria', label: 'Cafetería', emoji: '☕' },
    { value: 'fast_food', label: 'Comida Rápida', emoji: '🍔' },
    { value: 'other', label: 'Otro', emoji: '🍽️' },
]

export default function OnboardingPage() {
    const [step, setStep] = useState(1)
    const [name, setName] = useState('')
    const [type, setType] = useState<BusinessType>('other')
    const [mode, setMode] = useState<OperationMode | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [checking, setChecking] = useState(true)

    const router = useRouter()
    const supabase = createClient()

    // Verificar si el usuario está bloqueado antes de mostrar onboarding
    useEffect(() => {
        const checkBlocked = async () => {
            const { data: isBlocked } = await supabase.rpc('is_user_blocked')
            if (isBlocked) {
                router.replace('/account/blocked')
                return
            }
            setChecking(false)
        }
        checkBlocked()
    }, [])

    // Counter: 2 pasos (modo → nombre → crear)
    // Restaurant: 3 pasos (modo → nombre → tipo → crear)
    const totalSteps = mode === 'counter' ? 2 : 3

    const handleSelectMode = (selectedMode: OperationMode) => {
        setMode(selectedMode)
        setStep(2)
    }

    const handleCreateBusiness = async () => {
        const finalName = name.trim() || 'Mi negocio'
        const finalType = mode === 'counter' ? 'other' : type

        setLoading(true)
        setError('')

        const { data, error: rpcError } = await supabase.rpc(
            'create_business_and_owner_membership',
            {
                p_name: finalName,
                p_type: finalType,
                p_operation_mode: mode,
            }
        )

        if (rpcError) {
            console.error('[Onboarding] RPC network error:', rpcError)
            setError('Error de conexión. Intenta de nuevo.')
            setLoading(false)
            return
        }

        if (!data?.success) {
            console.warn('[Onboarding] RPC rejected:', data)
            const code = data?.code || 'UNKNOWN'
            if (code === 'ALREADY_HAS_BUSINESS') {
                setError('Ya tienes un negocio registrado. Redirigiendo...')
                setTimeout(() => router.push('/dashboard'), 1500)
            } else if (code === 'ACCOUNT_BLOCKED') {
                router.replace('/account/blocked')
            } else {
                setError(data?.message || 'Error al crear el negocio. Intenta de nuevo.')
            }
            setLoading(false)
            return
        }

        router.push('/dashboard')
    }

    if (checking) return null

    return (
        <div className="auth-page">
            <div className="auth-container">
                <div className="auth-brand">
                    <h1 className="auth-title">GastroOS</h1>
                    <p className="auth-subtitle">
                        {step === 1
                            ? 'Empecemos'
                            : mode === 'counter'
                                ? 'Casi listo'
                                : 'Configurar negocio'}
                    </p>
                </div>

                <div className="auth-card">
                    {/* Progress bar */}
                    <div className="flex gap-sm mb-md">
                        {Array.from({ length: totalSteps }, (_, i) => i + 1).map((s) => (
                            <div
                                key={s}
                                style={{
                                    flex: 1,
                                    height: 4,
                                    borderRadius: 2,
                                    background: s <= step ? 'var(--color-primary)' : 'var(--border-color)',
                                    transition: 'background 0.2s',
                                }}
                            />
                        ))}
                    </div>

                    {/* Step 1: ¿Cómo vendes? */}
                    {step === 1 && (
                        <div className="flex flex-col gap-lg">
                            <h2 className="auth-card-title">¿Cómo vendes?</h2>
                            <div className="flex flex-col gap-sm">
                                <button
                                    className="card"
                                    onClick={() => handleSelectMode('counter')}
                                    style={{
                                        cursor: 'pointer',
                                        textAlign: 'left',
                                        padding: '1.25rem',
                                        fontFamily: 'inherit',
                                    }}
                                >
                                    <div style={{ fontWeight: 600, fontSize: 'var(--font-size-base)', color: 'var(--text-primary)' }}>Mostrador / Food Truck / Bar</div>
                                    <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)', marginTop: '4px' }}>Pedidos directos, sin mesas · Setup rápido</div>
                                </button>
                                <button
                                    className="card"
                                    onClick={() => handleSelectMode('restaurant')}
                                    style={{
                                        cursor: 'pointer',
                                        textAlign: 'left',
                                        padding: '1.25rem',
                                        fontFamily: 'inherit',
                                    }}
                                >
                                    <div style={{ fontWeight: 600, fontSize: 'var(--font-size-base)', color: 'var(--text-primary)' }}>Restaurante</div>
                                    <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)', marginTop: '4px' }}>Con servicio a mesas</div>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step 2: Nombre (ambos paths) */}
                    {step === 2 && (
                        <div className="flex flex-col gap-lg">
                            <h2 className="auth-card-title">
                                {mode === 'counter' ? '¿Cómo se llama tu negocio?' : 'Nombre de tu restaurante'}
                            </h2>
                            <div className="form-group">
                                <label className="form-label">
                                    Nombre {mode === 'counter' && (
                                        <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>(puedes cambiarlo después)</span>
                                    )}
                                </label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder={mode === 'counter' ? 'Mi negocio' : 'Nombre del restaurante'}
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    autoFocus
                                />
                            </div>

                            {error && (
                                <div className="form-error-box">
                                    <span>!</span> {error}
                                </div>
                            )}

                            {mode === 'counter' ? (
                                /* Counter: crear directo desde aquí */
                                <button
                                    className="btn btn-primary btn-lg w-full"
                                    onClick={handleCreateBusiness}
                                    disabled={loading}
                                >
                                    {loading ? 'Creando...' : '¡Empezar a vender!'}
                                </button>
                            ) : (
                                /* Restaurant: un paso más */
                                <button
                                    className="btn btn-primary btn-lg w-full"
                                    onClick={() => setStep(3)}
                                >
                                    Continuar
                                </button>
                            )}
                        </div>
                    )}

                    {/* Step 3: Tipo de negocio (solo restaurant) */}
                    {step === 3 && mode === 'restaurant' && (
                        <div className="flex flex-col gap-lg">
                            <h2 className="auth-card-title">¿Qué tipo de comida?</h2>
                            <div className="flex flex-col gap-sm">
                                {BUSINESS_TYPES.map((t) => (
                                    <button
                                        key={t.value}
                                        className={`btn ${type === t.value ? 'btn-primary' : 'btn-secondary'} btn-lg`}
                                        onClick={() => setType(t.value)}
                                        style={{ textAlign: 'left' }}
                                    >
                                        {t.emoji} {t.label}
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
                                {loading ? 'Creando...' : 'Crear restaurante'}
                            </button>
                        </div>
                    )}

                    {step > 1 && !loading && (
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
