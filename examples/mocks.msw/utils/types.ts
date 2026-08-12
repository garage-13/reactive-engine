export type PathValue<T, P extends string> = P extends `${infer Key}.${infer Rest}`
  ? Key extends keyof T
  ? PathValue<T[Key], Rest>
  : unknown
  : P extends keyof T
  ? T[P]
  : unknown;

export type TAbstractedObject =
  | null
  | string
  | number
  | boolean
  | TAbstractedObject[]
  | { [key: string]: TAbstractedObject };
// Уточняем тип для объектов, чтобы избежать постоянных приведений
export type TObject = Record<string, TAbstractedObject>;

export type PathInto<T> = T extends object
  ? {
    [K in keyof T]: K extends string
    ? NonNullable<T[K]> extends object
    ? NonNullable<T[K]> extends unknown[] // Исключаем массивы, если не нужны их методы в путях
    ? `${K}`
    : `${K}` | `${K}.${PathInto<NonNullable<T[K]>>}`
    : `${K}`
    : never;
  }[keyof T]
  : never;

export namespace NSDMS {
  export type TAccessPoliciesData = {
    Items: unknown[];
  }
  export type TAbstractData = {
    [key: string]: unknown;
  }
  export type TBaseResponseData = {
    status?: 'Success' | 'Fail';
    message?: string;
  }
  export enum ETargetMutationCode {
    SET_RANDOM_INT = 'set_random_integer',
    SET_NULL = 'set_null',
    SET_RANDOM_STRING = 'set_random_string',
  }
  export namespace NSDataItemsElementMutation {
    export type TItemScenarioSettings = {
      targetSensorKeyPath: string;
      targetSensorKeyValue: string;
      targetMutationPath: string;
      targetActionCode: ETargetMutationCode;
    }
  }

  export namespace NSFreeDataElementMutation {
    export type TItemScenarioSettings = {
      targetMutationPath: string;
      targetActionCode: ETargetMutationCode;
    }
  }
}
