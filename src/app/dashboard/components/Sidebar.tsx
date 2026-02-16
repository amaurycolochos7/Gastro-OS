'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Role } from '@/lib/types'
import { hasPermission } from '@/lib/permissions'
import { useDialog } from '@/lib/context/DialogContext'

interface SidebarProps {
    businessName: string
    role: Role
}

// Iconos SVG modernos estilo Lucide
const Icons = {
    home: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
    ),
    pos: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
    ),
    orders: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
        </svg>
    ),
    kitchen: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 13.87A4 4 0 0 1 7.41 6a5 5 0 0 1 9.18 0A4 4 0 0 1 18 13.87V21H6v-7.13z" />
            <line x1="6" y1="17" x2="18" y2="17" />
        </svg>
    ),
    cash: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
            <circle cx="12" cy="12" r="3" />
            <line x1="1" y1="10" x2="4" y2="10" />
            <line x1="20" y1="10" x2="23" y2="10" />
            <line x1="1" y1="14" x2="4" y2="14" />
            <line x1="20" y1="14" x2="23" y2="14" />
        </svg>
    ),
    menu: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3h18v18H3zM3 9h18M3 15h18M9 3v18" />
        </svg>
    ),
    inventory: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
            <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
    ),
    logout: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
    ),
    expand: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
    ),
    collapse: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
    ),
    team: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
    ),
    audit: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <line x1="10" y1="9" x2="8" y2="9" />
        </svg>
    ),
    chevron: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
        </svg>
    ),
}

// Items de navegacion (sin Mi Plan—se movio al header de cuenta)
const NAV_ITEMS = [
    { href: '/dashboard', label: 'Inicio', icon: Icons.home },
    { href: '/dashboard/pos', label: 'Punto de Venta', icon: Icons.pos, permission: 'order:create' as const },
    { href: '/dashboard/orders', label: 'Ordenes', icon: Icons.orders, permission: 'order:create' as const },
    { href: '/dashboard/kitchen', label: 'Cocina', icon: Icons.kitchen, permission: 'order:change_status' as const },
    { href: '/dashboard/cash', label: 'Caja', icon: Icons.cash, permission: 'cash_register:open' as const },
    { href: '/dashboard/menu', label: 'Menu', icon: Icons.menu, permission: 'product:create' as const },
    { href: '/dashboard/inventory', label: 'Inventario', icon: Icons.inventory, permission: 'inventory:adjust' as const },
    { href: '/dashboard/settings/team', label: 'Equipo', icon: Icons.team, ownerOnly: true },
    { href: '/dashboard/audit', label: 'Auditoría', icon: Icons.audit, ownerOnly: true },
]

export function Sidebar({ businessName, role }: SidebarProps) {
    const pathname = usePathname()
    const router = useRouter()
    const supabase = createClient()
    const { confirm } = useDialog()

    // Estado del drawer movil
    const [mobileOpen, setMobileOpen] = useState(false)

    // Cerrar drawer al cambiar de ruta
    useEffect(() => {
        setMobileOpen(false)
    }, [pathname])

    const handleLogout = async () => {
        const confirmed = await confirm({
            title: 'Cerrar sesion',
            message: 'Estas seguro de que quieres salir?',
            confirmText: 'Salir',
            variant: 'danger'
        })

        if (!confirmed) return

        await supabase.auth.signOut()
        router.push('/login')
    }

    const navItems = NAV_ITEMS.filter(item => {
        if ('ownerOnly' in item && item.ownerOnly) {
            return role === 'OWNER'
        }
        if (!item.permission) return true
        return hasPermission(role, item.permission)
    })

    const isAccountPage = pathname === '/dashboard/settings/plan'

    return (
        <>
            {/* Mobile Header con Hamburger */}
            <header className="mobile-header mobile-only">
                <button
                    className="mobile-hamburger"
                    onClick={() => setMobileOpen(true)}
                    aria-label="Abrir menu"
                >
                    {Icons.expand}
                </button>
                <span className="mobile-header-title">{businessName}</span>
            </header>

            {/* Mobile Drawer Overlay */}
            {mobileOpen && (
                <div
                    className="mobile-drawer-overlay mobile-only"
                    onClick={() => setMobileOpen(false)}
                />
            )}

            {/* Mobile Drawer */}
            <aside className={`mobile-drawer mobile-only ${mobileOpen ? 'open' : ''}`}>
                {/* Mobile: Account header clickable */}
                <Link
                    href="/dashboard/settings/plan"
                    className={`mobile-drawer-account ${isAccountPage ? 'mobile-drawer-account--active' : ''}`}
                    onClick={() => setMobileOpen(false)}
                >
                    <div className="mobile-drawer-account__avatar">
                        {businessName.charAt(0).toUpperCase()}
                    </div>
                    <div className="mobile-drawer-account__info">
                        <span className="mobile-drawer-account__name">{businessName}</span>
                        <span className="mobile-drawer-account__label">Mi cuenta y plan</span>
                    </div>
                    <span className="mobile-drawer-account__chevron">{Icons.chevron}</span>
                    <button
                        className="mobile-drawer-close"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMobileOpen(false) }}
                    >
                        {Icons.collapse}
                    </button>
                </Link>

                <nav className="mobile-drawer-nav">
                    {navItems.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`mobile-drawer-link ${pathname === item.href ? 'active' : ''}`}
                            onClick={() => setMobileOpen(false)}
                        >
                            <span className="mobile-drawer-icon">{item.icon}</span>
                            <span className="mobile-drawer-label">{item.label}</span>
                        </Link>
                    ))}
                </nav>

                <div className="mobile-drawer-footer">
                    <button
                        onClick={handleLogout}
                        className="mobile-drawer-link logout"
                    >
                        <span className="mobile-drawer-icon">{Icons.logout}</span>
                        <span className="mobile-drawer-label">Cerrar sesion</span>
                    </button>
                </div>
            </aside>

            {/* Desktop Sidebar - auto-expand on hover */}
            <aside className="sidebar desktop-only sidebar-collapsed">
                {/* Account header — clickable, navigates to account/plan page */}
                <Link
                    href="/dashboard/settings/plan"
                    className={`sidebar-account ${isAccountPage ? 'sidebar-account--active' : ''}`}
                >
                    <div className="sidebar-logo">
                        {businessName.charAt(0).toUpperCase()}
                    </div>
                    <div className="sidebar-account__expanded">
                        <span className="sidebar-account__name">
                            {businessName}
                        </span>
                        <span className="sidebar-account__label">Mi cuenta</span>
                    </div>
                    <span className="sidebar-account__chevron">{Icons.chevron}</span>
                </Link>

                <nav className="sidebar-nav">
                    {navItems.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`sidebar-link ${pathname === item.href ? 'active' : ''}`}
                        >
                            <span className="sidebar-icon">{item.icon}</span>
                            <span className="sidebar-label">{item.label}</span>
                        </Link>
                    ))}
                </nav>

                <div className="sidebar-footer">
                    <button
                        onClick={handleLogout}
                        className="sidebar-link w-full"
                        style={{ border: 'none', background: 'none', cursor: 'pointer' }}
                    >
                        <span className="sidebar-icon">{Icons.logout}</span>
                        <span className="sidebar-label">Cerrar sesion</span>
                    </button>
                </div>
            </aside>
        </>
    )
}
