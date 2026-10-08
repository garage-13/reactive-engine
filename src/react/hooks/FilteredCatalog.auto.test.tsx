import React, { useMemo } from 'react'
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { useReactiveValue } from './useReactiveValue'
// Импортируем автоматическую версию ядра для проверки асингулярных таймингов
import { ReactiveEngineAutomatic, Signal } from '../../core'

interface Product {
  id: number
  name: string
  category: string
}

describe('Интеграционный тест: FilteredCatalog (Automatic Async Flow)', () => {
  let engine: ReactiveEngineAutomatic
  let localProductsSignal: Signal<Product[]>

  beforeEach(() => {
    engine = new ReactiveEngineAutomatic()
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
    )
  }

  it('должен отрендерить список и автоматически обновляться на выходе в микрозадачу Event Loop', async () => {
    // 1. Рендерим компонент в StrictMode
    render(
      <React.StrictMode>
        <FilteredCatalog category="electronics" productsSignal={localProductsSignal} />
      </React.StrictMode>
    )

    const itemsBefore = screen.getAllByTestId('product-item')
    expect(itemsBefore).toHaveLength(2)

    // 2. Изменяем значение сигнала внутри АСИНХРОННОГО блока act
    await act(async () => {
      localProductsSignal.value.push({ id: 4, name: 'MacBook', category: 'electronics' })
      localProductsSignal.value = [...localProductsSignal.value]

      // КРИТИЧЕСКИЙ ШАГ: Проталкиваем Event Loop. Наше автоматическое ядро проснется,
      // соберет микрозадачи queueMicrotask и синхронизирует состояние до закрытия act()
      await Promise.resolve()
    })

    // Ожидаем, что React успешно поймал асинхронный пуш ядра и перерисовал шаблон
    const itemsAfter = screen.getAllByTestId('product-item')
    expect(itemsAfter).toHaveLength(3)

    expect(screen.getByText('MacBook')).toBeDefined()
  })
})
