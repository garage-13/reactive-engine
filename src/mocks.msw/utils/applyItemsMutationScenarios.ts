
/* eslint-disable no-restricted-syntax */

import { NSDMS } from './types';
import { mutateObject } from './mutateObject';
import { getNestedValue } from './getNestedValue';
import { setNestedValueImmutable } from './setNestedValueImmutable';
import { getRandomInteger } from './getRandomInteger';

interface NestedValueParams {
  obj: Record<string, unknown>;
  path: string;
}

interface SetNestedValueParams {
  obj: Record<string, unknown>;
  path: string;
  value: unknown;
}

// Ограничиваем T: теперь TypeScript гарантированно знает, что внутри T есть массив Items
export const applyItemsMutationScenarios = <T extends { Items: Record<string, unknown>[] }>(
  result: { data?: T; message?: string },
  mutations: NSDMS.NSDataItemsElementMutation.TItemScenarioSettings[],
  // normalizedAddData: { data: T } | null
): void => {

  // NOTE: 1. Базовая мутация; Теперь ts понимает, что target и source — это совместимые структуры объектов.
  mutateObject({
    target: result,
    source: { data: { Items: [] } },
    removeIfUndefined: false,
  });

  // NOTE: 2. Итерация по сценариям
  const items = result.data?.Items;
  if (Array.isArray(items)) {
    for (const scenarioItem of mutations) {
      if (
        scenarioItem?.targetSensorKeyPath &&
        scenarioItem?.targetMutationPath &&
        scenarioItem?.targetActionCode &&
        scenarioItem?.targetSensorKeyValue
      ) {
        const targetIndex = items.findIndex((e) => {
          const value = getNestedValue({
            obj: e,
            path: scenarioItem.targetSensorKeyPath,
          } as NestedValueParams);
          return value === scenarioItem.targetSensorKeyValue;
        });

        if (targetIndex !== -1) {
          // Создаем поверхностную копию элемента (убран @ts-ignore)
          const mutatedItem = { ...items[targetIndex] };

          switch (scenarioItem.targetActionCode) {
            case NSDMS.ETargetMutationCode.SET_RANDOM_INT:
              setNestedValueImmutable({
                obj: mutatedItem,
                path: scenarioItem.targetMutationPath,
                value: getRandomInteger({ min: 1000, max: 9999 }),
              } as SetNestedValueParams);
              break;
            default:
              break;
          }

          // Записываем измененный элемент обратно в массив
          items[targetIndex] = mutatedItem;
        }
      }
    }
  }
};

