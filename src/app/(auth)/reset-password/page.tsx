'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { validatePasswordChecks } from '@/lib/password'
import AuthHeroLayout from '../components/AuthHeroLayout'

export default function ResetPasswordPage() {
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const [checkingSession, setCheckingSession] = useState(true)
    const [success, setSuccess] = useState(false)
    const router = useRouter()
    const supabase = createClient()

    useEffect(() => {
        const checkSession = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                router.replace('/login')
                return
            }
            setCheckingSession(false)
        }
        checkSession()
    }, [router, supabase])

    const passwordChecks = validatePasswordChecks(password)
    const allChecksPassed = passwordChecks.every(c => c.test)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')

        if (password !== confirmPassword) {
            setError('Las contraseñas no coinciden')
            return
        }

        if (!allChecksPassed) {
            setError('La contraseña no cumple los requisitos')
            return
        }

        setLoading(true)
        const { error } = await supabase.auth.updateUser({ password })
        setLoading(false)

        if (error) {
            setError(error.message)
            return
        }

        setSuccess(true)
        setTimeout(() => router.push('/dashboard'), 1500)
    }

    if (checkingSession) {
        return null
    }

    return (
        <AuthHeroLayout
            heroTitle="Casi listo"
            heroDescription="Elige una nueva contraseña para tu cuenta."
            brandSubtitle="Nueva contraseña"
        >
            <div className="auth-card">
                {success ? (
                    <>
                        <h2 className="auth-card-title">¡Contraseña actualizada!</h2>
                        <p className="text-muted" style={{ textAlign: 'center' }}>Entrando a tu cuenta...</p>
                    </>
                ) : (
                    <>
                        <h2 className="auth-card-title">Elige tu nueva contraseña</h2>

                        <form onSubmit={handleSubmit} className="auth-form">
                            <div className="form-group">
                                <label className="form-label">Nueva contraseña</label>
                                <div className="login-input-icon-wrapper">
                                    <svg className="login-input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        className="form-input login-input-with-icon"
                                        placeholder="••••••••"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                        autoFocus
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
                                {password && (
                                    <div className="password-requirements">
                                        {passwordChecks.map((check, i) => (
                                            <div key={i} className={`password-check ${check.test ? 'valid' : 'invalid'}`}>
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
                                        type="password"
                                        className="form-input login-input-with-icon"
                                        placeholder="••••••••"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        required
                                    />
                                </div>
                                {confirmPassword && password !== confirmPassword && (
                                    <span className="form-hint error">Las contraseñas no coinciden</span>
                                )}
                                {confirmPassword && password === confirmPassword && (
                                    <span className="form-hint success">✓ Las contraseñas coinciden</span>
                                )}
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
                                disabled={loading || !allChecksPassed || password !== confirmPassword}
                            >
                                {loading ? (
                                    <span className="btn-loading">
                                        <span className="spinner"></span>
                                        Guardando...
                                    </span>
                                ) : 'Guardar nueva contraseña'}
                            </button>
                        </form>
                    </>
                )}
            </div>
        </AuthHeroLayout>
    )
}
