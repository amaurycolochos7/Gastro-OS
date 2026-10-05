import Image from 'next/image'

interface AuthHeroLayoutProps {
    heroTitle: string
    heroDescription: string
    heroFeatures?: string[]
    brandSubtitle: string
    children: React.ReactNode
}

export default function AuthHeroLayout({ heroTitle, heroDescription, heroFeatures, brandSubtitle, children }: AuthHeroLayoutProps) {
    return (
        <div className="login-split">
            {/* Left - Hero Image */}
            <div className="login-hero">
                <Image
                    src="/login-hero.png"
                    alt="GastroOS - Sistema de punto de venta para restaurantes"
                    fill
                    priority
                    style={{ objectFit: 'cover' }}
                />
                <div className="login-hero-overlay">
                    <div className="login-hero-content">
                        <h2 className="login-hero-title">{heroTitle}</h2>
                        <p className="login-hero-desc">{heroDescription}</p>
                        {heroFeatures && heroFeatures.length > 0 && (
                            <div className="login-hero-features">
                                {heroFeatures.map((feature, i) => (
                                    <div key={i} className="login-hero-feature">
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                                        <span>{feature}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Right - Form */}
            <div className="login-form-side">
                <div className="login-form-wrapper">
                    <div className="auth-brand">
                        <h1 className="auth-title">GastroOS</h1>
                        <p className="auth-subtitle">{brandSubtitle}</p>
                    </div>

                    {children}

                    <div className="login-footer">
                        <div className="login-ssl-badge">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                            Conexión segura SSL
                        </div>
                        <p className="auth-footer">
                            © 2026 GastroOS. Todos los derechos reservados.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}
