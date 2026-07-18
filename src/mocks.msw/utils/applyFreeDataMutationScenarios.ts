/* eslint-disable indent */

/* eslint-disable no-restricted-syntax */

import { NSDMS } from './types';
// import { mutateObject } from './mutateObject';
import { getNestedValue } from './getNestedValue';
import { setNestedValueImmutable } from './setNestedValueImmutable';
import { getRandomString } from './getRandomString';
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

export const applyFreeDataMutationScenarios = <T>(
  result: { data?: T; message?: string },
  mutations: NSDMS.NSFreeDataElementMutation.TItemScenarioSettings[],
): void => {
  for (const scenarioItem of mutations) {
    switch (true) {
      case (
        !!scenarioItem
        && !!scenarioItem?.targetMutationPath
        && !!scenarioItem?.targetActionCode
        // && typeof getNestedValue({ obj: result.data, path: scenarioItem.targetMutationPath } as NestedValueParams) !== 'undefined'
      ): {
          const oldValue = getNestedValue({
            obj: result.data,
            path: scenarioItem.targetMutationPath
          } as NestedValueParams);

          if (['boolean', 'number', 'string', 'object', 'undefined'].includes(typeof oldValue)) {
            switch (true) {
              case scenarioItem.targetActionCode === 'set_random_integer': {
                const __val = getRandomInteger({ min: 1000, max: 9999 });
                console.log(`🟢 case 2.3.1 set_random_integer: "${scenarioItem.targetMutationPath}" -> ${__val}`);
                // setNestedValue(targetResponse.data, scenarioItem.targetMutationPath, __val);
                result.data = setNestedValueImmutable({
                  obj: result.data,
                  path: scenarioItem.targetMutationPath,
                  value: __val,
                } as SetNestedValueParams) as T;
                break;
              }
              case scenarioItem.targetActionCode === 'set_null':
                console.log(`🟢 case 2.3.2 set_null: "${scenarioItem.targetMutationPath}" -> null`);
                // setNestedValue(targetResponse.data, scenarioItem.targetMutationPath, null);
                result.data = setNestedValueImmutable({
                  obj: result.data,
                  path: scenarioItem.targetMutationPath,
                  value: null,
                } as SetNestedValueParams) as T;
                break;
              case scenarioItem.targetActionCode === 'set_random_string': {
                const __val = getRandomString(5);
                console.log(`🟢 case 2.3.3 set_random_string: "${scenarioItem.targetMutationPath}" -> ${__val}`);
                // setNestedValue(targetResponse.data, scenarioItem.targetMutationPath, __val);
                result.data = setNestedValueImmutable({
                  obj: result.data,
                  path: scenarioItem.targetMutationPath,
                  value: __val,
                } as SetNestedValueParams) as T;
                break;
              }
              default:
                break;
            }
          } else {
            console.log('case 2.2 ⭕ Element not modified');
          }
          break;
        }
      default:
        break;
    }
  }
};
