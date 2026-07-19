export const getExtractedValues = ({
  tested, expectedKey, valueType
}: {
  tested: string[];
  expectedKey: string;
  valueType: 'number' | 'string';
}): string[] => {
  const results: string[] = [];
  for (let i = 0, max = tested.length; i < max; i++) {
    const t = tested[i];
    let regex;
    switch (valueType) {
      case 'number':
        regex = new RegExp(`\\[${expectedKey}=(?<value>\\d+)\\]`, 'g');
        break;
      case 'string':
      default:
        // NOTE: "Ленивый" квантификатор -> ".*?" будет искать минимальное количество символов до следующего экранированного "]"
        regex = new RegExp(`\\[${expectedKey}=(?<value>.*?)\\]`, 'g');
        break;
    }

    // eslint-disable-next-line no-restricted-syntax
    for (const n of t.matchAll(regex)) {
      if (n?.groups) { results.push(n.groups.value); }
    }
  }
  return results;
};
