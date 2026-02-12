'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Product, Category, InventoryItem } from '@/lib/types'
import { useBusiness } from '@/lib/context/BusinessContext'
import { useDialog } from '@/lib/context/DialogContext'
import { checkLimit, getLimitLabel, LimitResult } from '@/lib/limits'

// Iconos SVG inline
const Icons = {
    plus: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
    ),
    edit: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
    ),
    trash: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
    ),
    folder: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
    ),
    package: (
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
            <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
    ),
    close: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
    ),
}

export default function MenuPage() {
    const { businessId, loading: businessLoading } = useBusiness()
    const { confirm, alert } = useDialog()
    const [categories, setCategories] = useState<Category[]>([])
    const [products, setProducts] = useState<Product[]>([])
    const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

    // Form states
    const [showProductModal, setShowProductModal] = useState(false)
    const [showCategoryModal, setShowCategoryModal] = useState(false)
    const [editingProduct, setEditingProduct] = useState<Product | null>(null)
    const [productName, setProductName] = useState('')
    const [productPrice, setProductPrice] = useState('')
    const [productCategory, setProductCategory] = useState('')
    const [productInventoryItemId, setProductInventoryItemId] = useState('')
    const [categoryName, setCategoryName] = useState('')

    const supabase = createClient()

    const loadData = useCallback(async () => {
        if (!businessId) return

        setLoading(true)

        const [catsResult, prodsResult, invResult] = await Promise.all([
            supabase
                .from('categories')
                .select('*')
                .eq('business_id', businessId)
                .order('position'),
            supabase
                .from('products')
                .select('*')
                .eq('business_id', businessId)
                .is('deleted_at', null)
                .order('name'),
            supabase
                .from('inventory_items')
                .select('*')
                .eq('business_id', businessId)
                .eq('active', true)
                .is('deleted_at', null)
                .order('name')
        ])

        setCategories(catsResult.data || [])
        setProducts(prodsResult.data || [])
        setInventoryItems(invResult.data || [])
        setLoading(false)
    }, [businessId, supabase])

    useEffect(() => {
        if (!businessLoading && businessId) {
            loadData()
        }
    }, [businessLoading, businessId, loadData])

    // Estado para modal de límite
    const [limitInfo, setLimitInfo] = useState<LimitResult | null>(null)
    const [showLimitModal, setShowLimitModal] = useState(false)

    const handleSaveProduct = async () => {
        if (!productName || !productPrice || !businessId) return

        // Check product limit only when creating (not editing)
        if (!editingProduct) {
            const result = await checkLimit(supabase, businessId, 'products')
            if (!result.allowed) {
                setLimitInfo(result)
                setShowLimitModal(true)
                return
            }
        }

        if (editingProduct) {
            const { error } = await supabase
                .from('products')
                .update({
                    name: productName,
                    price: parseFloat(productPrice),
                    category_id: productCategory || null,
                    inventory_item_id: productInventoryItemId || null,
                })
                .eq('id', editingProduct.id)
            if (error) {
                console.error('[Menu] Error al actualizar producto:', error)
            } else {
                console.log('[Menu] Producto actualizado, inventory_item_id:', productInventoryItemId || null)
            }
        } else {
            const { error } = await supabase
                .from('products')
                .insert({
                    business_id: businessId,
                    name: productName,
                    price: parseFloat(productPrice),
                    category_id: productCategory || null,
                    inventory_item_id: productInventoryItemId || null,
                    active: true,
                })
            if (error) {
                console.error('[Menu] Error al crear producto:', error)
            } else {
                console.log('[Menu] Producto creado, inventory_item_id:', productInventoryItemId || null)
            }
        }

        resetProductForm()
        loadData()
    }

    const handleDeleteProduct = async (id: string, name: string) => {
        const confirmed = await confirm({
            title: 'Eliminar producto',
            message: `¿Estás seguro de eliminar "${name}"?`,
            confirmText: 'Eliminar',
            variant: 'danger'
        })

        if (!confirmed) return

        await supabase
            .from('products')
            .update({ deleted_at: new Date().toISOString(), active: false })
            .eq('id', id)

        loadData()
    }

    const handleSaveCategory = async () => {
        if (!categoryName || !businessId) return

        await supabase
            .from('categories')
            .insert({
                business_id: businessId,
                name: categoryName,
                position: categories.length,
            })

        setCategoryName('')
        setShowCategoryModal(false)
        loadData()
    }

    const handleDeleteCategory = async (id: string, name: string) => {
        const productsInCategory = products.filter(p => p.category_id === id)

        if (productsInCategory.length > 0) {
            await alert({
                title: 'No se puede eliminar',
                message: `La categoría "${name}" tiene ${productsInCategory.length} producto(s) asignados. Mueve o elimina los productos primero.`,
                variant: 'warning'
            })
            return
        }

        const confirmed = await confirm({
            title: 'Eliminar categoría',
            message: `¿Eliminar la categoría "${name}"?`,
            confirmText: 'Eliminar',
            variant: 'danger'
        })

        if (!confirmed) return

        await supabase
            .from('categories')
            .delete()
            .eq('id', id)

        loadData()
    }

    const resetProductForm = () => {
        setProductName('')
        setProductPrice('')
        setProductCategory('')
        setProductInventoryItemId('')
        setEditingProduct(null)
        setShowProductModal(false)
    }

    const openEditProduct = (product: Product) => {
        setEditingProduct(product)
        setProductName(product.name)
        setProductPrice(product.price.toString())
        setProductCategory(product.category_id || '')
        setProductInventoryItemId(product.inventory_item_id || '')
        setShowProductModal(true)
    }

    // Filtrar productos por categoría seleccionada
    const filteredProducts = selectedCategory
        ? products.filter(p => p.category_id === selectedCategory)
        : products

    // Contar productos por categoría
    const getProductCount = (categoryId: string) => {
        return products.filter(p => p.category_id === categoryId).length
    }

    // Productos sin categoría
    const uncategorizedProducts = products.filter(p => !p.category_id)

    if (businessLoading || loading) {
        return (
            <div className="menu-loading">
                <div className="menu-loading-spinner"></div>
                <p>Cargando menú...</p>
            </div>
        )
    }

    return (
        <div className="menu-page">
            {/* Header */}
            <header className="menu-header">
                <div className="menu-header-content">
                    <h1 className="menu-title">Menú</h1>
                    <p className="menu-subtitle">
                        {products.length} producto{products.length !== 1 ? 's' : ''} • {categories.length} categoría{categories.length !== 1 ? 's' : ''}
                    </p>
                </div>
                <div className="menu-header-actions">
                    <button
                        className="menu-btn menu-btn-secondary"
                        onClick={() => setShowCategoryModal(true)}
                    >
                        {Icons.folder}
                        <span className="menu-btn-text">Categoría</span>
                    </button>
                    <button
                        className="menu-btn menu-btn-primary"
                        onClick={() => setShowProductModal(true)}
                    >
                        {Icons.plus}
                        <span className="menu-btn-text">Producto</span>
                    </button>
                </div>
            </header>

            {/* Filtros de categoría */}
            <div className="menu-filters">
                <button
                    className={`menu-filter-chip ${selectedCategory === null ? 'active' : ''}`}
                    onClick={() => setSelectedCategory(null)}
                >
                    Todos ({products.length})
                </button>
                {categories.map(cat => (
                    <button
                        key={cat.id}
                        className={`menu-filter-chip ${selectedCategory === cat.id ? 'active' : ''}`}
                        onClick={() => setSelectedCategory(cat.id)}
                    >
                        {cat.name} ({getProductCount(cat.id)})
                        <span
                            className="menu-filter-delete"
                            onClick={(e) => {
                                e.stopPropagation()
                                handleDeleteCategory(cat.id, cat.name)
                            }}
                        >
                            ×
                        </span>
                    </button>
                ))}
                {uncategorizedProducts.length > 0 && (
                    <button
                        className={`menu-filter-chip ${selectedCategory === 'none' ? 'active' : ''}`}
                        onClick={() => setSelectedCategory('none')}
                    >
                        Sin categoría ({uncategorizedProducts.length})
                    </button>
                )}
            </div>

            {/* Grid de productos */}
            {filteredProducts.length === 0 && (selectedCategory === 'none' ? uncategorizedProducts.length === 0 : true) ? (
                <div className="menu-empty">
                    <div className="menu-empty-icon">{Icons.package}</div>
                    <h3>No hay productos</h3>
                    <p>Crea tu primer producto para comenzar</p>
                    <button
                        className="menu-btn menu-btn-primary"
                        onClick={() => setShowProductModal(true)}
                    >
                        {Icons.plus}
                        Agregar producto
                    </button>
                </div>
            ) : (
                <div className="menu-grid">
                    {(selectedCategory === 'none' ? uncategorizedProducts : filteredProducts).map(product => {
                        const category = categories.find(c => c.id === product.category_id)
                        return (
                            <div
                                key={product.id}
                                className={`menu-product-card ${!product.active ? 'inactive' : ''}`}
                            >
                                <div className="menu-product-row">
                                    <div className="menu-product-avatar">
                                        {product.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="menu-product-info">
                                        <span className="menu-product-name">{product.name}</span>
                                        <div className="menu-product-meta">
                                            {category && (
                                                <span className="menu-product-category">{category.name}</span>
                                            )}
                                            {product.inventory_item_id && (
                                                <span className="menu-product-inventory-badge">
                                                    📦 {inventoryItems.find(i => i.id === product.inventory_item_id)?.track_mode === 'auto' ? 'auto' : 'manual'}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <span className="menu-product-price">${product.price.toFixed(2)}</span>
                                </div>
                                <div className="menu-product-actions">
                                    <button
                                        className="menu-product-action"
                                        onClick={() => openEditProduct(product)}
                                        title="Editar"
                                    >
                                        {Icons.edit}
                                    </button>
                                    <button
                                        className="menu-product-action danger"
                                        onClick={() => handleDeleteProduct(product.id, product.name)}
                                        title="Eliminar"
                                    >
                                        {Icons.trash}
                                    </button>
                                </div>
                                {!product.active && (
                                    <span className="menu-product-badge inactive">Inactivo</span>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Modal producto */}
            {
                showProductModal && (
                    <div className="menu-modal-overlay" onClick={resetProductForm}>
                        <div className="menu-modal" onClick={e => e.stopPropagation()}>
                            <div className="menu-modal-header">
                                <h2>{editingProduct ? 'Editar producto' : 'Nuevo producto'}</h2>
                                <button className="menu-modal-close" onClick={resetProductForm}>
                                    {Icons.close}
                                </button>
                            </div>

                            <div className="menu-modal-body">
                                <div className="menu-form-group">
                                    <label>Nombre del producto</label>
                                    <input
                                        type="text"
                                        value={productName}
                                        onChange={(e) => setProductName(e.target.value)}
                                        placeholder="Ej: Taco de pastor"
                                        autoFocus
                                    />
                                </div>

                                <div className="menu-form-group">
                                    <label>Precio</label>
                                    <div className="menu-input-price">
                                        <span className="menu-input-prefix">$</span>
                                        <input
                                            type="number"
                                            value={productPrice}
                                            onChange={(e) => setProductPrice(e.target.value)}
                                            placeholder="0.00"
                                            step="0.01"
                                            inputMode="decimal"
                                        />
                                    </div>
                                </div>

                                <div className="menu-form-group">
                                    <label>Categoría</label>
                                    <select
                                        value={productCategory}
                                        onChange={(e) => setProductCategory(e.target.value)}
                                    >
                                        <option value="">Sin categoría</option>
                                        {categories.map(cat => (
                                            <option key={cat.id} value={cat.id}>{cat.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="menu-form-group">
                                    <label>Inventario vinculado</label>
                                    <select
                                        value={productInventoryItemId}
                                        onChange={(e) => setProductInventoryItemId(e.target.value)}
                                    >
                                        <option value="">Sin inventario</option>
                                        {inventoryItems.map(item => (
                                            <option key={item.id} value={item.id}>
                                                {item.name} — {item.stock_current} {item.unit} {item.track_mode === 'auto' ? '(auto)' : ''}
                                            </option>
                                        ))}
                                    </select>
                                    <span className="menu-form-hint">Si vinculas un item con descuento automático, el stock se descuenta al cobrar.</span>
                                </div>


                            </div>

                            <div className="menu-modal-footer">
                                <button
                                    className="menu-btn menu-btn-secondary"
                                    onClick={resetProductForm}
                                >
                                    Cancelar
                                </button>
                                <button
                                    className="menu-btn menu-btn-primary"
                                    onClick={handleSaveProduct}
                                    disabled={!productName || !productPrice}
                                >
                                    {editingProduct ? 'Guardar cambios' : 'Crear producto'}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Modal categoría */}
            {
                showCategoryModal && (
                    <div className="menu-modal-overlay" onClick={() => { setCategoryName(''); setShowCategoryModal(false) }}>
                        <div className="menu-modal" onClick={e => e.stopPropagation()}>
                            <div className="menu-modal-header">
                                <h2>Nueva categoría</h2>
                                <button
                                    className="menu-modal-close"
                                    onClick={() => { setCategoryName(''); setShowCategoryModal(false) }}
                                >
                                    {Icons.close}
                                </button>
                            </div>

                            <div className="menu-modal-body">
                                <div className="menu-form-group">
                                    <label>Nombre de la categoría</label>
                                    <input
                                        type="text"
                                        value={categoryName}
                                        onChange={(e) => setCategoryName(e.target.value)}
                                        placeholder="Ej: Tacos, Bebidas, Postres..."
                                        autoFocus
                                    />
                                </div>
                            </div>

                            <div className="menu-modal-footer">
                                <button
                                    className="menu-btn menu-btn-secondary"
                                    onClick={() => { setCategoryName(''); setShowCategoryModal(false) }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    className="menu-btn menu-btn-primary"
                                    onClick={handleSaveCategory}
                                    disabled={!categoryName}
                                >
                                    Crear categoría
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
            {showLimitModal && limitInfo && (
                <div className="modal-overlay" onClick={() => setShowLimitModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
                        <div className="modal-header">
                            <h2 className="modal-title">Límite alcanzado</h2>
                            <button className="btn-close" onClick={() => setShowLimitModal(false)}>×</button>
                        </div>
                        <div className="limit-modal-body">
                            <div className="limit-modal-icon">🚫</div>
                            <h3 className="limit-modal-title">Límite de {getLimitLabel('products')}</h3>
                            <p className="limit-modal-text">Has alcanzado el máximo de tu plan actual.</p>
                            <div className="limit-modal-counter">{limitInfo.current} / {limitInfo.limit}</div>
                            <p className="limit-modal-help">Contacta soporte para ampliar tu plan.</p>
                        </div>
                    </div>
                </div>
            )}
        </div >
    )
}
