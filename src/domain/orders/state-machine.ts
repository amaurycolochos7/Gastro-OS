import { OrderStatus } from '@/lib/types'

// Transiciones válidas de estado
const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
    'OPEN': ['IN_PREP', 'CANCELLED'],
    'IN_PREP': ['READY', 'CANCELLED'],
    'READY': ['DELIVERED', 'CLOSED'],
    'DELIVERED': ['CLOSED'],
    'CLOSED': [],
    'CANCELLED': [],
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
    return VALID_TRANSITIONS[from].includes(to)
}

export function getNextStates(current: OrderStatus): OrderStatus[] {
    return VALID_TRANSITIONS[current]
}

export function isTerminalState(status: OrderStatus): boolean {
    return status === 'CLOSED' || status === 'CANCELLED'
}

export function requiresReason(from: OrderStatus, to: OrderStatus): boolean {
    return to === 'CANCELLED'
}

// Para Food Truck: puede saltar de READY a CLOSED
export function canSkipDelivered(operationMode: 'counter' | 'restaurant'): boolean {
    return operationMode === 'counter'
}

// Colores para UI
export const STATUS_COLORS: Record<OrderStatus, string> = {
    'OPEN': 'var(--color-primary)',
    'IN_PREP': 'var(--color-warning)',
    'READY': 'var(--color-success)',
    'DELIVERED': 'var(--color-muted)',
    'CLOSED': 'var(--color-muted)',
    'CANCELLED': 'var(--color-danger)',
}

export const STATUS_LABELS: Record<OrderStatus, string> = {
    'OPEN': 'Abierta',
    'IN_PREP': 'En preparación',
    'READY': 'Lista',
    'DELIVERED': 'Entregada',
    'CLOSED': 'Cerrada',
    'CANCELLED': 'Cancelada',
}
