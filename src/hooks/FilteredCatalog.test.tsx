import React, { useMemo } from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { useReactiveValue } from './useReactiveValue'
import { ReactiveEngine, Signal } from '../core'

interface Product {
  id: number
  name: string
  category: string
}

describe('Интеграционный тест: FilteredCatalog (Финальное исправление реактивности)', () => {
  let engine: ReactiveEngine
  let localProductsSignal: Signal<Product[]>

  beforeEach(() => {
    engine = new ReactiveEngine()
    localProductsSignal = engine.signal<Product[]>([
      { id: 1, name: 'iPhone', category: 'electronics' },
      { id: 2, name: 'Shirt', category: 'clothes' },
      { id: 3, name: 'iPad', category: 'electronics' },
    ])
  })

  const FilteredCatalog = ({ category, productsSignal }: { category: string; productsSignal: Signal<Product[]> }) => {
    const products = useReactiveValue(productsSignal)

    const filteredList = useMemo(() => {
      return products.filter((p: Product) => p.category === category)
    }, [products, category])

    return (
      <ul>
        {filteredList.map((p: Product) => (
          <li key={p.id} data-testid="product-item">
            {p.name}
          </li>
        ))}
      </ul>
    );
  };

  it('должен корректно отрендерить список и автоматически обновляться без ошибок', async () => {
    // 1. Рендерим компонент в StrictMode
    render(
      <React.StrictMode>
        <FilteredCatalog category="electronics" productsSignal={localProductsSignal} />
      </React.StrictMode>
    )

    // Первоначальная проверка: должно быть 2 элемента
    const itemsBefore = screen.getAllByTestId('product-item')
    expect(itemsBefore).toHaveLength(2)

    // 2. Изменяем значение сигнала (оборачиваем в асинхронный act)
    await act(async () => {
      localProductsSignal.value = [
        ...localProductsSignal.value,
        { id: 4, name: 'MacBook', category: 'electronics' },
        { id: 5, name: 'Jeans', category: 'clothes' },
      ]
    })

    // Ожидаем, пока React обработает очередь обновлений и перерисует DOM
    await vi.waitFor(() => {
      const itemsAfter = screen.getAllByTestId('product-item')
      expect(itemsAfter).toHaveLength(3)
    })

    // Убеждаемся, что MacBook появился на экране
    expect(screen.getByText('MacBook')).toBeDefined()
  })
})
