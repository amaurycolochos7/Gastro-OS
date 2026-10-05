'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { validatePasswordChecks } from '@/lib/password'
import AuthHeroLayout from '../components/AuthHeroLayout'

const TERMS_VERSION = 'v2026-02-12'

export default function RegisterPage() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [showConfirmPassword, setShowConfirmPassword] = useState(false)
    const [acceptedTerms, setAcceptedTerms] = useState(false)
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const router = useRouter()
    const supabase = createClient()

    const passwordChecks = validatePasswordChecks(password)
    const allChecksPassed = passwordChecks.every(c => c.test)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')

        if (!acceptedTerms) {
            setError('Debes aceptar los términos y condiciones')
            return
        }

        if (password !== confirmPassword) {
            setError('Las contraseñas no coinciden')
            return
        }

        if (!allChecksPassed) {
            setError('La contraseña no cumple los requisitos')
            return
        }

        setLoading(true)

        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                emailRedirectTo: `${window.location.origin}/auth/callback`,
            },
        })

        if (error) {
            setError(error.message)
            setLoading(false)
            return
        }

        // Guardar aceptación de términos en profiles
        if (data.user) {
            await supabase.from('profiles').upsert({
                user_id: data.user.id,
                accepted_terms_at: new Date().toISOString(),
                accepted_terms_version: TERMS_VERSION,
            })
        }

        router.push('/register/verify')
    }

    return (
        <AuthHeroLayout
            heroTitle="Lleva tu negocio al siguiente nivel"
            heroDescription="Configura tu punto de venta en minutos y empieza a cobrar hoy mismo."
            heroFeatures={['Setup rápido, sin complicaciones', 'Caja, inventario y reportes incluidos', 'Funciona en celular, tablet y computadora']}
            brandSubtitle="Crea tu cuenta gratis"
        >
            <div className="auth-card">
                <h2 className="auth-card-title">Registro</h2>

                <form onSubmit={handleSubmit} className="auth-form">
                    <div className="form-group">
                        <label className="form-label">Correo electrónico</label>
                        <div className="login-input-icon-wrapper">
                            <svg className="login-input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></svg>
                            <input
                                type="email"
                                className="form-input login-input-with-icon"
                                placeholder="tu@email.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                autoFocus
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Contraseña</label>
                        <div className="login-input-icon-wrapper">
                            <svg className="login-input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                            <input
                                type={showPassword ? 'text' : 'password'}
                                className="form-input login-input-with-icon"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                style={{ paddingRight: 48 }}
                            />
                            <button
                                type="button"
                                className="password-toggle"
                                onClick={() => setShowPassword(!showPassword)}
                                tabIndex={-1}
                                aria-label={showPassword ? 'Ocultar' : 'Mostrar'}
                            >
                                {showPassword ? (
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                                        <line x1="1" y1="1" x2="23" y2="23" />
                                    </svg>
                                ) : (
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                        <circle cx="12" cy="12" r="3" />
                                    </svg>
                                )}
                            </button>
                        </div>

                        {/* Password strength indicator */}
                        {password && (
                            <div className="password-requirements">
                                {passwordChecks.map((check, i) => (
                                    <div
                                        key={i}
                                        className={`password-check ${check.test ? 'valid' : 'invalid'}`}
                                    >
                                        <span>{check.test ? '✓' : '○'}</span>
                                        {check.label}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="form-group">
                        <label className="form-label">Confirmar contraseña</label>
                        <div className="login-input-icon-wrapper">
                            <svg className="login-input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                            <input
                                type={showConfirmPassword ? 'text' : 'password'}
                                className="form-input login-input-with-icon"
                                placeholder="••••••••"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                                style={{ paddingRight: 48 }}
                            />
                            <button
                                type="button"
                                className="password-toggle"
                                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                tabIndex={-1}
                                aria-label={showConfirmPassword ? 'Ocultar' : 'Mostrar'}
                            >
                                {showConfirmPassword ? (
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                                        <line x1="1" y1="1" x2="23" y2="23" />
                                    </svg>
                                ) : (
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                        <circle cx="12" cy="12" r="3" />
                                    </svg>
                                )}
                            </button>
                        </div>
                        {confirmPassword && password !== confirmPassword && (
                            <span className="form-hint error">Las contraseñas no coinciden</span>
                        )}
                        {confirmPassword && password === confirmPassword && (
                            <span className="form-hint success">✓ Las contraseñas coinciden</span>
                        )}
                    </div>

                    <div className="form-group">
                        <label className="form-checkbox-label" style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={acceptedTerms}
                                onChange={(e) => setAcceptedTerms(e.target.checked)}
                                style={{ marginTop: '0.25rem' }}
                            />
                            <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted, #666)' }}>
                                Acepto los{' '}
                                <a href="/terms" target="_blank" style={{ color: 'var(--color-primary, #6c5ce7)', textDecoration: 'underline' }}>
                                    términos y condiciones
                                </a>
                            </span>
                        </label>
                    </div>

                    {error && (
                        <div className="form-error-box">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        className="btn btn-primary btn-lg w-full"
                        disabled={loading || !allChecksPassed || password !== confirmPassword || !acceptedTerms}
                    >
                        {loading ? (
                            <span className="btn-loading">
                                <span className="spinner"></span>
                                Creando cuenta...
                            </span>
                        ) : 'Crear cuenta'}
                    </button>
                </form>

                <div className="auth-divider">
                    <span>¿Ya tienes cuenta?</span>
                </div>

                <Link href="/login" className="btn btn-secondary btn-lg w-full">
                    Iniciar sesión
                </Link>
            </div>
        </AuthHeroLayout>
    )
}
