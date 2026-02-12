export default function VerifyPage() {
    return (
        <div className="auth-page">
            <div className="auth-container">
                <div className="auth-brand">
                    <h1 className="auth-title">GastroOS</h1>
                </div>

                <div className="auth-card text-center">
                    <div className="verify-icon">
                        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--color-primary)' }}>
                            <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                    </div>

                    <h2 className="auth-card-title" style={{ marginTop: 'var(--spacing-md)' }}>
                        Verifica tu correo
                    </h2>

                    <p className="text-muted" style={{ lineHeight: 1.6 }}>
                        Te enviamos un enlace de verificación a tu correo electrónico.
                    </p>

                    <p className="text-secondary" style={{ marginTop: 'var(--spacing-md)', lineHeight: 1.6 }}>
                        Revisa tu bandeja de entrada y haz clic en el enlace para activar tu cuenta.
                    </p>

                    <a href="/login" className="btn btn-secondary btn-lg w-full" style={{ marginTop: 'var(--spacing-lg)' }}>
                        Volver al inicio
                    </a>
                </div>

                <p className="auth-footer">
                    © 2026 GastroOS. Todos los derechos reservados.
                </p>
            </div>
        </div>
    )
}
