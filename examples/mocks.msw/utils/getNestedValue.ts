import { PathInto } from './types';

export const getNestedValue = <T extends object, P extends PathInto<T>>({ obj, path }: {
  obj: T;
  path: P;
}): unknown => {
  const keys = path.split('.') as string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return keys.reduce((acc: any, key) => (acc ? acc[key] : undefined), obj);
};
