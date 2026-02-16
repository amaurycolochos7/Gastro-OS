'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function SuspendedPage() {
    const [reason, setReason] = useState<string>('')
    const [userEmail, setUserEmail] = useState<string>('')
    const [businessName, setBusinessName] = useState<string>('')
    const [loading, setLoading] = useState(true)
    const supabase = createClient()
    const businessIdRef = useRef<string | null>(null)

    useEffect(() => {
        loadReason()
    }, [])

    // Auto-polling: verificar cada 10s si la suspensión fue levantada
    useEffect(() => {
        const interval = setInterval(async () => {
            if (!businessIdRef.current) return
            const { data: status } = await supabase.rpc('get_subscription_status', {
                p_business_id: businessIdRef.current,
            })
            if (status && status.status !== 'suspended') {
                clearInterval(interval)
                window.location.href = '/dashboard'
            }
        }, 10000)

        return () => clearInterval(interval)
    }, [])

    const loadReason = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
            setUserEmail(user.email || '')

            const { data: membership } = await supabase
                .from('business_memberships')
                .select('business_id')
                .eq('user_id', user.id)
                .maybeSingle()

            if (membership) {
                businessIdRef.current = membership.business_id

                // Obtener nombre del negocio
                const { data: business } = await supabase
                    .from('businesses')
                    .select('name')
                    .eq('id', membership.business_id)
                    .maybeSingle()

                if (business?.name) {
                    setBusinessName(business.name)
                }

                const { data: status } = await supabase.rpc('get_subscription_status', {
                    p_business_id: membership.business_id,
                })

                // Si ya no está suspendido, redirigir de inmediato
                if (status && status.status !== 'suspended') {
                    window.location.href = '/dashboard'
                    return
                }

                if (status?.notes) {
                    setReason(status.notes)
                }
            }
        }
        setLoading(false)
    }

    const handleLogout = async () => {
        await supabase.auth.signOut()
        window.location.href = '/login'
    }

    // Construir URL de WhatsApp con mensaje pre-llenado
    const buildWhatsappUrl = () => {
        const lines = [
            '*Cuenta Suspendida — Solicitud de Soporte*',
            '',
            `Correo: ${userEmail || 'No disponible'}`,
            `Negocio: ${businessName || 'No disponible'}`,
            `Motivo de suspensión: ${reason || 'No especificado'}`,
            '',
            'Solicito revisión de mi cuenta. Gracias.',
        ].join('\n')
        return `https://wa.me/529618720544?text=${encodeURIComponent(lines)}`
    }

    if (loading) return null

    return (
        <div className="suspended-container">
            {/* Background blurred screenshot effect */}
            <div className="suspended-bg">
                <div className="fake-sidebar"></div>
                <div className="fake-header"></div>
                <div className="fake-content">
                    <div className="fake-card"></div>
                    <div className="fake-card"></div>
                    <div className="fake-card"></div>
                </div>
            </div>

            <div className="suspended-content">
                <div className="suspended-card">
                    <div className="suspended-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                            <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zm-1.72 6.97a.75.75 0 10-1.06 1.06L10.94 12l-1.72 1.72a.75.75 0 101.06 1.06L12 13.06l1.72 1.72a.75.75 0 101.06-1.06L13.06 12l1.72-1.72a.75.75 0 10-1.06-1.06L12 10.94l-1.72-1.72z" clipRule="evenodd" />
                        </svg>
                    </div>
                    <h1 className="suspended-title">Cuenta Suspendida</h1>
                    <p className="suspended-message">
                        El acceso a tu cuenta ha sido suspendido temporalmente por un administrador.
                    </p>

                    {reason && (
                        <div className="suspended-reason">
                            <span className="suspended-reason-label">Motivo de suspensión:</span>
                            <p className="suspended-reason-text">"{reason}"</p>
                        </div>
                    )}

                    <div className="suspended-actions">
                        <button onClick={handleLogout} className="suspended-btn-secondary">
                            Cerrar sesión
                        </button>
                        <a href={buildWhatsappUrl()} target="_blank" rel="noreferrer" className="suspended-btn-primary">
                            Contactar Soporte
                        </a>
                    </div>
                </div>
            </div>

            <style jsx>{`
                .suspended-container {
                    position: fixed;
                    inset: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: #f3f4f6;
                    overflow: hidden;
                    z-index: 9999;
                }

                .suspended-bg {
                    position: absolute;
                    inset: 0;
                    filter: blur(8px) grayscale(0.5);
                    opacity: 0.6;
                    background: white;
                    display: flex;
                    pointer-events: none;
                }

                .fake-sidebar {
                    width: 250px;
                    height: 100%;
                    background: #1f2937;
                }

                .fake-header {
                    position: absolute;
                    top: 0;
                    left: 250px;
                    right: 0;
                    height: 64px;
                    background: white;
                    border-bottom: 1px solid #e5e7eb;
                }

                .fake-content {
                    flex: 1;
                    padding: 84px 24px 24px;
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 24px;
                    background: #f3f4f6;
                }

                .fake-card {
                    height: 200px;
                    background: white;
                    border-radius: 8px;
                    border: 1px solid #e5e7eb;
                }

                .suspended-content {
                    position: relative;
                    z-index: 10;
                    width: 100%;
                    max-width: 480px;
                    padding: 0 20px;
                    animation: slideUp 0.3s ease-out;
                }

                @keyframes slideUp {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                .suspended-card {
                    background: white;
                    border-radius: 16px;
                    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
                    padding: 40px;
                    text-align: center;
                    border: 1px solid #e5e7eb;
                }

                .suspended-icon {
                    width: 64px;
                    height: 64px;
                    background: #fef2f2;
                    color: #dc2626;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin: 0 auto 24px;
                }

                .suspended-icon svg {
                    width: 32px;
                    height: 32px;
                }

                .suspended-title {
                    font-size: 24px;
                    font-weight: 700;
                    color: #111827;
                    margin-bottom: 12px;
                }

                .suspended-message {
                    color: #6b7280;
                    margin-bottom: 24px;
                    line-height: 1.5;
                }

                .suspended-reason {
                    background: #fff1f2;
                    border: 1px solid #fecaca;
                    border-radius: 8px;
                    padding: 16px;
                    margin-bottom: 24px;
                    text-align: left;
                }

                .suspended-reason-label {
                    display: block;
                    font-size: 12px;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    color: #991b1b;
                    font-weight: 600;
                    margin-bottom: 4px;
                }

                .suspended-reason-text {
                    color: #7f1d1d;
                    font-style: italic;
                    margin: 0;
                    font-weight: 500;
                }

                .suspended-actions {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }

                .suspended-btn-primary {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    padding: 12px 24px;
                    background: #dc2626;
                    color: white;
                    border-radius: 8px;
                    font-weight: 600;
                    text-decoration: none;
                    transition: background 0.2s;
                }

                .suspended-btn-primary:hover {
                    background: #b91c1c;
                }

                .suspended-btn-secondary {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    padding: 12px 24px;
                    background: white;
                    color: #4b5563;
                    border: 1px solid #d1d5db;
                    border-radius: 8px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .suspended-btn-secondary:hover {
                    background: #f9fafb;
                    border-color: #9ca3af;
                }
            `}</style>
        </div>
    )
}
