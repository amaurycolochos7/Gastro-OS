import { Role } from './types'

// Mapa de permisos por rol
export const PERMISSIONS = {
    // Productos
    'product:create': ['OWNER', 'ADMIN'],
    'product:edit': ['OWNER', 'ADMIN'],
    'product:delete': ['OWNER', 'ADMIN'],

    // Categorías
    'category:create': ['OWNER', 'ADMIN'],
    'category:edit': ['OWNER', 'ADMIN'],

    // Caja
    'cash_register:open': ['OWNER', 'ADMIN', 'CASHIER'],
    'cash_register:close': ['OWNER', 'ADMIN', 'CASHIER'],
    'cash_movement:create': ['OWNER', 'ADMIN', 'CASHIER'],

    // Órdenes
    'order:create': ['OWNER', 'ADMIN', 'CASHIER'],
    'order:cancel': ['OWNER', 'ADMIN'],
    'order:discount': ['OWNER', 'ADMIN'],
    'order:reprint': ['OWNER', 'ADMIN', 'CASHIER'],

    // Cocina
    'order:change_status': ['OWNER', 'ADMIN', 'KITCHEN'],

    // Inventario
    'inventory:adjust': ['OWNER', 'ADMIN', 'INVENTORY'],
    'inventory:waste': ['OWNER', 'ADMIN', 'INVENTORY'],
    'recipe:edit': ['OWNER', 'ADMIN', 'INVENTORY'],
    'purchase:register': ['OWNER', 'ADMIN', 'INVENTORY'],

    // Reportes
    'report:sales': ['OWNER', 'ADMIN'],
    'report:inventory': ['OWNER', 'ADMIN', 'INVENTORY'],

    // Usuarios y configuración
    'user:create': ['OWNER'],
    'user:edit_role': ['OWNER'],
    'business:config': ['OWNER'],
    'data:export': ['OWNER'],
} as const

export type Permission = keyof typeof PERMISSIONS

export function hasPermission(role: Role, permission: Permission): boolean {
    const allowedRoles = PERMISSIONS[permission] as readonly string[]
    return allowedRoles.includes(role)
}

export function getAllPermissions(role: Role): Permission[] {
    return Object.entries(PERMISSIONS)
        .filter(([, roles]) => (roles as readonly string[]).includes(role))
        .map(([permission]) => permission as Permission)
}
