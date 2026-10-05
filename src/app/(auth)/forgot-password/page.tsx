'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import AuthHeroLayout from '../components/AuthHeroLayout'

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const [sent, setSent] = useState(false)
    const supabase = createClient()

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        setLoading(true)

        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
        })

        setLoading(false)

        if (error) {
            setError(error.message)
            return
        }

        setSent(true)
    }

    return (
        <AuthHeroLayout
            heroTitle="Recupera el acceso a tu cuenta"
            heroDescription="Te enviamos un enlace seguro para que puedas elegir una nueva contraseña."
            brandSubtitle="Recuperar contraseña"
        >
            <div className="auth-card">
                {sent ? (
                    <>
                        <h2 className="auth-card-title">Revisa tu correo</h2>
                        <p className="text-muted" style={{ textAlign: 'center', marginBottom: 'var(--spacing-lg)' }}>
                            Si existe una cuenta con <strong>{email}</strong>, te enviamos un enlace para restablecer tu contraseña.
                        </p>
                        <Link href="/login" className="btn btn-secondary btn-lg w-full">
                            Volver a iniciar sesión
                        </Link>
                    </>
                ) : (
                    <>
                        <h2 className="auth-card-title">¿Olvidaste tu contraseña?</h2>
                        <p className="text-muted" style={{ textAlign: 'center', marginBottom: 'var(--spacing-lg)' }}>
                            Ingresa tu correo y te mandamos un enlace para restablecerla.
                        </p>

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

                            {error && (
                                <div className="form-error-box">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
                                    {error}
                                </div>
                            )}

                            <button
                                type="submit"
                                className="btn btn-primary btn-lg w-full"
                                disabled={loading}
                            >
                                {loading ? (
                                    <span className="btn-loading">
                                        <span className="spinner"></span>
                                        Enviando...
                                    </span>
                                ) : 'Enviar enlace'}
                            </button>
                        </form>

                        <div className="auth-divider">
                            <span>¿Ya la recordaste?</span>
                        </div>

                        <Link href="/login" className="btn btn-secondary btn-lg w-full">
                            Volver a iniciar sesión
                        </Link>
                    </>
                )}
            </div>
        </AuthHeroLayout>
    )
}
