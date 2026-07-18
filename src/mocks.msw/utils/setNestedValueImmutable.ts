/* eslint-disable @typescript-eslint/no-explicit-any */
import { PathInto, PathValue } from './types';

export const setNestedValueImmutable = <T extends object, P extends PathInto<T>>({ obj, path, value }: {
  obj: T;
  path: P;
  value: PathValue<T, P>;
}): T => {
  const keys = path.split('.');
  const worker = (current: any, pathKeys: string[]): any => {
    const [first, ...rest] = pathKeys;
    // Если ключей больше нет, возвращаем само значение
    if (!first) { return value; }
    // Определяем базу: если текущего узла нет или это не объект, создаем пустой {}
    const base = (current && typeof current === 'object' && !Array.isArray(current))
      ? current
      : {};
    return {
      ...base,
      [first]: rest.length > 0
        ? worker(base[first], rest)
        : value
    };
  };
  return worker(obj, keys);
};
