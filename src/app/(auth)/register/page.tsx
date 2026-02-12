'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

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

    const validatePassword = (pass: string) => {
        const checks = [
            { test: pass.length >= 8, label: 'Mínimo 8 caracteres' },
            { test: /[A-Z]/.test(pass), label: 'Una mayúscula' },
            { test: /[0-9]/.test(pass), label: 'Un número' },
        ]
        return checks
    }

    const passwordChecks = validatePassword(password)
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
        <div className="auth-page">
            <div className="auth-container">
                {/* Branding */}
                <div className="auth-brand">
                    <h1 className="auth-title">GastroOS</h1>
                    <p className="auth-subtitle">Crea tu cuenta gratis</p>
                </div>

                <div className="auth-card">
                    <h2 className="auth-card-title">Registro</h2>

                    <form onSubmit={handleSubmit} className="auth-form">
                        <div className="form-group">
                            <label className="form-label">Correo electrónico</label>
                            <input
                                type="email"
                                className="form-input"
                                placeholder="tu@email.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                autoFocus
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Contraseña</label>
                            <div className="input-password-wrapper">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    className="form-input"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                />
                                <button
                                    type="button"
                                    className="password-toggle"
                                    onClick={() => setShowPassword(!showPassword)}
                                    tabIndex={-1}
                                    aria-label={showPassword ? 'Ocultar' : 'Mostrar'}
                                >
                                    {showPassword ? (
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                                            <line x1="1" y1="1" x2="23" y2="23" />
                                        </svg>
                                    ) : (
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
                            <div className="input-password-wrapper">
                                <input
                                    type={showConfirmPassword ? 'text' : 'password'}
                                    className="form-input"
                                    placeholder="••••••••"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    required
                                />
                                <button
                                    type="button"
                                    className="password-toggle"
                                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                    tabIndex={-1}
                                    aria-label={showConfirmPassword ? 'Ocultar' : 'Mostrar'}
                                >
                                    {showConfirmPassword ? (
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                                            <line x1="1" y1="1" x2="23" y2="23" />
                                        </svg>
                                    ) : (
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
                                <span>!</span> {error}
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

                <p className="auth-footer">
                    © 2026 GastroOS. Todos los derechos reservados.
                </p>
            </div>
        </div>
    )
}
