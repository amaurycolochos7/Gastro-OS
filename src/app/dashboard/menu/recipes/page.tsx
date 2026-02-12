'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Product, InventoryItem, ProductRecipe } from '@/lib/types'
import { useBusiness } from '@/lib/context/BusinessContext'

interface RecipeIngredient extends ProductRecipe {
    inventory_item: InventoryItem
}

export default function RecipesPage() {
    const searchParams = useSearchParams()
    const productId = searchParams.get('product')

    const { businessId, loading: businessLoading } = useBusiness()
    const [products, setProducts] = useState<Product[]>([])
    const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([])
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
    const [recipe, setRecipe] = useState<RecipeIngredient[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    // Modal para agregar ingrediente
    const [showAddModal, setShowAddModal] = useState(false)
    const [newIngredient, setNewIngredient] = useState({ itemId: '', quantity: '' })

    const supabase = createClient()

    const loadData = useCallback(async () => {
        if (!businessId) return

        // Cargar productos con receta habilitada
        const { data: productsData } = await supabase
            .from('products')
            .select('*')
            .eq('business_id', businessId)
            .eq('has_recipe', true)
            .is('deleted_at', null)
            .order('name')

        setProducts(productsData || [])

        // Cargar items de inventario
        const { data: itemsData } = await supabase
            .from('inventory_items')
            .select('*')
            .eq('business_id', businessId)
            .eq('active', true)
            .is('deleted_at', null)
            .order('name')

        setInventoryItems(itemsData || [])

        // Si hay producto en URL, seleccionarlo
        if (productId && productsData) {
            const product = productsData.find(p => p.id === productId)
            if (product) {
                setSelectedProduct(product)
            }
        }

        setLoading(false)
    }, [businessId, productId, supabase])

    const loadRecipe = useCallback(async (product: Product) => {
        if (!businessId) return

        const { data } = await supabase
            .from('product_recipes')
            .select('*, inventory_item:inventory_items(*)')
            .eq('product_id', product.id)
            .eq('business_id', businessId)

        setRecipe((data as RecipeIngredient[]) || [])
    }, [businessId, supabase])

    useEffect(() => {
        if (!businessLoading && businessId) {
            loadData()
        }
    }, [businessLoading, businessId, loadData])

    useEffect(() => {
        if (selectedProduct) {
            loadRecipe(selectedProduct)
        } else {
            setRecipe([])
        }
    }, [selectedProduct, loadRecipe])

    const handleSelectProduct = (product: Product) => {
        setSelectedProduct(product)
    }

    const handleAddIngredient = async () => {
        if (!selectedProduct || !businessId || !newIngredient.itemId || !newIngredient.quantity) return

        setSaving(true)

        const { error } = await supabase
            .from('product_recipes')
            .insert({
                business_id: businessId,
                product_id: selectedProduct.id,
                inventory_item_id: newIngredient.itemId,
                quantity: parseFloat(newIngredient.quantity)
            })

        if (!error) {
            await loadRecipe(selectedProduct)
            setShowAddModal(false)
            setNewIngredient({ itemId: '', quantity: '' })
        }

        setSaving(false)
    }

    const handleRemoveIngredient = async (recipeId: string) => {
        if (!selectedProduct) return

        await supabase
            .from('product_recipes')
            .delete()
            .eq('id', recipeId)

        await loadRecipe(selectedProduct)
    }

    const handleUpdateQuantity = async (recipeId: string, newQuantity: number) => {
        if (!selectedProduct || newQuantity <= 0) return

        await supabase
            .from('product_recipes')
            .update({ quantity: newQuantity })
            .eq('id', recipeId)

        await loadRecipe(selectedProduct)
    }

    // Items de inventario que aún no están en la receta
    const availableItems = inventoryItems.filter(
        item => !recipe.some(r => r.inventory_item_id === item.id)
    )

    if (businessLoading || loading) {
        return (
            <div className="recipes-page">
                <div className="page-header">
                    <h1>Recetas</h1>
                </div>
                <div className="card">
                    <p className="text-muted">Cargando...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="recipes-page">
            <div className="page-header">
                <div>
                    <Link href="/dashboard/menu" className="breadcrumb-link">
                        ← Volver al Menú
                    </Link>
                    <h1>Recetas</h1>
                    <p className="text-muted">Define los ingredientes por producto</p>
                </div>
            </div>

            {products.length === 0 ? (
                <div className="card empty-state">
                    <div className="empty-icon"></div>
                    <h3>No hay productos con receta</h3>
                    <p className="text-muted">
                        Para agregar recetas, primero activa &quot;Tiene receta&quot; en los productos
                        desde la sección de Menú.
                    </p>
                    <Link href="/dashboard/menu" className="btn btn-primary">
                        Ir al Menú
                    </Link>
                </div>
            ) : (
                <div className="recipes-layout">
                    {/* Lista de productos */}
                    <div className="products-list card">
                        <h3 className="card-title">Productos</h3>
                        <div className="product-items">
                            {products.map(product => (
                                <button
                                    key={product.id}
                                    className={`product-item ${selectedProduct?.id === product.id ? 'active' : ''}`}
                                    onClick={() => handleSelectProduct(product)}
                                >
                                    <span className="product-name">{product.name}</span>
                                    <span className="product-price">${product.price.toFixed(2)}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Receta del producto */}
                    <div className="recipe-detail card">
                        {selectedProduct ? (
                            <>
                                <div className="recipe-header">
                                    <h3>{selectedProduct.name}</h3>
                                    <button
                                        className="btn btn-primary"
                                        onClick={() => setShowAddModal(true)}
                                        disabled={availableItems.length === 0}
                                    >
                                        + Ingrediente
                                    </button>
                                </div>

                                {recipe.length === 0 ? (
                                    <div className="empty-recipe">
                                        <p className="text-muted">
                                            Este producto no tiene ingredientes configurados.
                                        </p>
                                        <button
                                            className="btn btn-secondary"
                                            onClick={() => setShowAddModal(true)}
                                            disabled={availableItems.length === 0}
                                        >
                                            Agregar primer ingrediente
                                        </button>
                                    </div>
                                ) : (
                                    <div className="ingredients-list">
                                        {recipe.map(item => (
                                            <div key={item.id} className="ingredient-row">
                                                <span className="ingredient-name">
                                                    {item.inventory_item?.name || 'Item eliminado'}
                                                </span>
                                                <div className="ingredient-controls">
                                                    <input
                                                        type="number"
                                                        className="form-input quantity-input"
                                                        value={item.quantity}
                                                        min="0.001"
                                                        step="0.001"
                                                        onChange={(e) => handleUpdateQuantity(item.id, parseFloat(e.target.value))}
                                                    />
                                                    <span className="ingredient-unit">
                                                        {item.inventory_item?.unit || 'pz'}
                                                    </span>
                                                    <button
                                                        className="btn btn-icon btn-danger"
                                                        onClick={() => handleRemoveIngredient(item.id)}
                                                        title="Eliminar"
                                                    >
                                                        ✕
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="empty-recipe">
                                <p className="text-muted">
                                    Selecciona un producto para ver o editar su receta
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Modal agregar ingrediente */}
            {showAddModal && (
                <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">Agregar Ingrediente</h3>
                            <button className="btn btn-icon" onClick={() => setShowAddModal(false)}>✕</button>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Ingrediente</label>
                            <select
                                className="form-input"
                                value={newIngredient.itemId}
                                onChange={(e) => setNewIngredient(prev => ({ ...prev, itemId: e.target.value }))}
                            >
                                <option value="">Selecciona un ingrediente</option>
                                {availableItems.map(item => (
                                    <option key={item.id} value={item.id}>
                                        {item.name} ({item.unit})
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Cantidad por unidad de producto</label>
                            <input
                                type="number"
                                className="form-input"
                                placeholder="Ej: 0.250"
                                value={newIngredient.quantity}
                                min="0.001"
                                step="0.001"
                                onChange={(e) => setNewIngredient(prev => ({ ...prev, quantity: e.target.value }))}
                            />
                            <span className="form-hint">
                                {newIngredient.itemId && (
                                    <>
                                        Unidad: {inventoryItems.find(i => i.id === newIngredient.itemId)?.unit || 'pz'}
                                    </>
                                )}
                            </span>
                        </div>

                        <div className="modal-actions">
                            <button
                                className="btn btn-secondary"
                                onClick={() => setShowAddModal(false)}
                            >
                                Cancelar
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={handleAddIngredient}
                                disabled={saving || !newIngredient.itemId || !newIngredient.quantity}
                            >
                                {saving ? 'Guardando...' : 'Agregar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
