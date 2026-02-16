'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function BlockedAccountPage() {
    const router = useRouter()

    const handleLogout = async () => {
        const supabase = createClient()
        await supabase.auth.signOut()
        router.push('/login')
    }

    return (
        <div style={styles.container}>
            <div style={styles.card}>
                {/* Lock icon */}
                <div style={styles.iconWrap}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="40" height="40">
                        <path fillRule="evenodd" d="M12 1.5a5.25 5.25 0 00-5.25 5.25v3a3 3 0 00-3 3v6.75a3 3 0 003 3h10.5a3 3 0 003-3v-6.75a3 3 0 00-3-3v-3c0-2.9-2.35-5.25-5.25-5.25zm3.75 8.25v-3a3.75 3.75 0 10-7.5 0v3h7.5z" clipRule="evenodd" />
                    </svg>
                </div>

                <h1 style={styles.title}>Cuenta eliminada</h1>
                <p style={styles.description}>
                    Tu cuenta de negocio ha sido desactivada por un administrador.
                    Ya no tienes acceso al sistema.
                </p>

                <div style={styles.divider} />

                <p style={styles.contactText}>
                    Si crees que esto es un error, contacta a soporte:
                </p>

                <a
                    href="https://wa.me/529618720544?text=Hola%2C%20mi%20cuenta%20fue%20eliminada%20y%20necesito%20ayuda"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={styles.whatsappBtn}
                >
                    <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                    </svg>
                    Contactar por WhatsApp
                </a>

                <button onClick={handleLogout} style={styles.logoutBtn}>
                    Cerrar sesión
                </button>
            </div>
        </div>
    )
}

const styles: Record<string, React.CSSProperties> = {
    container: {
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0f0c29, #1a1a2e, #16213e)',
        padding: '1.5rem',
    },
    card: {
        background: '#fff',
        borderRadius: '20px',
        padding: '3rem 2.5rem',
        maxWidth: '420px',
        width: '100%',
        textAlign: 'center' as const,
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
    },
    iconWrap: {
        width: '72px',
        height: '72px',
        borderRadius: '50%',
        background: '#fef2f2',
        color: '#dc2626',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 auto 1.5rem',
    },
    title: {
        fontSize: '1.5rem',
        fontWeight: 700,
        color: '#1a1a2e',
        margin: '0 0 0.75rem',
    },
    description: {
        fontSize: '0.95rem',
        color: '#6b7280',
        lineHeight: 1.6,
        margin: 0,
    },
    divider: {
        height: '1px',
        background: '#e5e7eb',
        margin: '1.5rem 0',
    },
    contactText: {
        fontSize: '0.85rem',
        color: '#9ca3af',
        margin: '0 0 1rem',
    },
    whatsappBtn: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.75rem 1.5rem',
        borderRadius: '12px',
        background: '#25D366',
        color: '#fff',
        fontSize: '0.9rem',
        fontWeight: 600,
        textDecoration: 'none',
        transition: 'transform 0.15s',
    },
    logoutBtn: {
        display: 'block',
        width: '100%',
        marginTop: '1rem',
        padding: '0.7rem',
        borderRadius: '10px',
        border: '1px solid #e5e7eb',
        background: 'transparent',
        color: '#6b7280',
        fontSize: '0.85rem',
        fontWeight: 500,
        cursor: 'pointer',
    },
}
