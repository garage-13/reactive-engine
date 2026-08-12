export const mutateObject = <T extends Record<string, unknown>>({
  target,
  source,
  removeIfUndefined
}: {
  target: T;
  source: Record<string, unknown>; // Заменили any на unknown
  removeIfUndefined?: boolean;
}): T => {
  // Для обхода ограничения дженерика на запись используем Record<string, unknown>
  const targetObj: Record<string, unknown> = target

  for (const key in source) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) { continue }

    const sourceValue = source[key]
    const targetValue = targetObj[key]

    if (Array.isArray(sourceValue)) {
      // 1. Обработка массивов
      if (Array.isArray(targetValue)) {
        // Объединяем массивы и убираем дубликаты
        targetObj[key] = Array.from(new Set([...targetValue, ...sourceValue]))
      } else {
        targetObj[key] = sourceValue
      }
    } else if (sourceValue !== null && typeof sourceValue === 'object') {
      // 2. Обработка объектов (рекурсия)
      if (targetValue !== null && typeof targetValue === 'object' && !Array.isArray(targetValue)) {
        mutateObject({
          target: targetValue as Record<string, unknown>, // Приведение к базовому типу для рекурсии
          source: sourceValue as Record<string, unknown>,
          removeIfUndefined
        })
      } else {
        targetObj[key] = sourceValue
      }
    } else {
      // 3. Примитивы
      targetObj[key] = sourceValue
    }
  }

  if (removeIfUndefined) {
    for (const key in targetObj) {
      if (Object.prototype.hasOwnProperty.call(targetObj, key) && !(key in source)) {
        delete targetObj[key]
      }
    }
  }

  return target
}
