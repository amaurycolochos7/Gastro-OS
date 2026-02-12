// Database types for GastroOS

export type Role = 'OWNER' | 'ADMIN' | 'CASHIER' | 'KITCHEN' | 'INVENTORY'

export type OrderStatus = 'OPEN' | 'IN_PREP' | 'READY' | 'DELIVERED' | 'CLOSED' | 'CANCELLED'

export type ServiceType = 'dine_in' | 'takeaway' | 'delivery'

export type PaymentMethod = 'cash' | 'card' | 'transfer'

export type PaymentStatus = 'pending' | 'paid' | 'refunded' | 'void'

export type CashRegisterStatus = 'open' | 'closed'

export type InventoryUnit = 'pz' | 'paquete' | 'caja' | 'litro' | 'kg' | 'g' | 'ml'

export type TrackMode = 'manual' | 'auto'

export type MovementType = 'manual_adjustment' | 'purchase' | 'auto_sale' | 'waste'

export type CashMovementType = 'in' | 'out'

export type AuditAction = string

export type AuditEntity = 'order' | 'payment' | 'cash_register' | 'cash_movement' | 'inventory' | 'product'

export type BusinessType = 'taqueria' | 'pizzeria' | 'cafeteria' | 'fast_food' | 'other'

export type OperationMode = 'counter' | 'restaurant'

// Database row types

export interface Business {
    id: string
    name: string
    type: BusinessType
    operation_mode: OperationMode
    logo_url: string | null
    limits_products: number
    limits_orders_day: number
    limits_users: number
    limits_storage_mb: number
    created_at: string
}

export interface BusinessMembership {
    id: string
    business_id: string
    user_id: string
    role: Role
    created_at: string
}

export interface Category {
    id: string
    business_id: string
    name: string
    position: number
    active: boolean
}

export interface Product {
    id: string
    business_id: string
    category_id: string | null
    name: string
    description: string | null
    price: number
    image_url: string | null
    has_recipe: boolean
    active: boolean
    created_at: string
    deleted_at: string | null
    inventory_item_id: string | null
    // Joined from inventory_items
    inventory_item?: {
        id: string
        track_mode: TrackMode
        stock_current: number
        stock_min: number
    } | null
}

export interface InventoryItem {
    id: string
    business_id: string
    name: string
    category: string | null
    unit: InventoryUnit
    stock_current: number
    stock_min: number
    track_mode: TrackMode
    active: boolean
    created_at: string
    deleted_at: string | null
}

export interface CashRegister {
    id: string
    business_id: string
    status: CashRegisterStatus
    opened_by: string
    opened_at: string
    opening_amount: number
    closed_by: string | null
    closed_at: string | null
    expected_cash: number | null
    counted_cash: number | null
    difference: number | null
    keep_float_amount: number | null
    withdrawn_cash: number | null
    closing_notes: string | null
    expected_cash_snapshot: number | null
    requires_review: boolean
    reviewed_by: string | null
    reviewed_at: string | null
    count_breakdown: Record<string, any> | null
    summary_snapshot: CashRegisterSummary | null
    deleted_at: string | null
}

export interface CashRegisterSummary {
    version: number
    generated_at: string
    register_id: string
    period: {
        opened_at: string
        closed_at: string | null
    }
    totals: {
        sales_by_method: Record<string, number>
        cash_in: number
        cash_out: number
        refunds_by_method: Record<string, number>
        voids_by_method: Record<string, number>
    }
    expected_cash: number
    start_amount: number
    warnings: CashRegisterWarning[]
    // Final closing details (added during close_cash_register)
    counted_cash?: number
    difference?: number
    keep_float_amount?: number
    withdrawn_cash?: number
    closing_notes?: string
}

export interface CashRegisterWarning {
    type: string
    severity: 'info' | 'warn' | 'critical'
    message: string
    count?: number
}

export interface Order {
    id: string
    business_id: string
    folio: string
    status: OrderStatus
    service_type: ServiceType
    table_number: string | null
    subtotal_snapshot: number | null
    discount_amount: number
    discount_reason: string | null
    tax_snapshot: number
    total_snapshot: number | null
    notes: string | null
    cancel_reason: string | null
    created_by: string
    created_at: string
    updated_at: string
    deleted_at: string | null
}

export interface OrderItem {
    id: string
    order_id: string
    business_id: string
    product_id: string | null
    name_snapshot: string
    price_snapshot: number
    quantity: number
    notes: string | null
}

export interface Payment {
    id: string
    order_id: string
    business_id: string
    cash_register_id: string
    amount: number
    method: PaymentMethod
    status: PaymentStatus
    paid_at: string | null
    created_by: string
    deleted_at: string | null
}

export interface CashMovement {
    id: string
    cash_register_id: string
    business_id: string
    type: CashMovementType
    amount: number
    reason: string
    created_by: string
    created_at: string
    deleted_at: string | null
}

export interface InventoryMovement {
    id: string
    business_id: string
    item_id: string
    type: MovementType
    delta: number
    reason: string | null
    ref_entity_type: 'order' | 'payment' | null
    ref_entity_id: string | null
    created_by: string
    created_at: string
    deleted_at: string | null
}

export interface Expense {
    id: string
    business_id: string
    category: string
    description: string | null
    amount: number
    created_by: string
    created_at: string
    deleted_at: string | null
}

export interface ProductRecipe {
    id: string
    business_id: string
    product_id: string
    inventory_item_id: string
    quantity: number
    created_at: string
    // Joined from inventory_items
    inventory_item?: InventoryItem
}

export interface AuditLog {
    id: string
    business_id: string
    actor_user_id: string
    action: AuditAction
    entity: AuditEntity
    entity_id: string
    metadata: Record<string, unknown> | null
    created_at: string
}

// Extended types for UI

export interface OrderWithItems extends Order {
    items: OrderItem[]
}

export interface ProductWithCategory extends Product {
    category: Category | null
}

export interface CashRegisterWithTotals extends CashRegister {
    total_cash: number
    total_card: number
    total_transfer: number
    movements_in: number
    movements_out: number
}
