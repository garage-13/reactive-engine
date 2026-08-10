export const getExtractedValues = ({
  tested, expectedKey, valueType
}: {
  tested: string[];
  expectedKey: string;
  valueType: 'number' | 'string';
}): string[] => {
  const results: string[] = [];
  if (!tested || !Array.isArray(tested)) return results; // Предохранитель от пустых массивов

  for (let i = 0, max = tested.length; i < max; i++) {
    const t = tested[i];
    if (typeof t !== 'string') continue; // ЗАЩИТА: Пропускаем всё, что не является валидной строкой

    let regex;
    switch (valueType) {
      case 'number':
        regex = new RegExp(`\\[${expectedKey}=(?<value>\\d+)\\]`, 'g');
        break;
      case 'string':
      default:
        regex = new RegExp(`\\[${expectedKey}=(?<value>.*?)\\]`, 'g');
        break;
    }

    for (const n of t.matchAll(regex)) {
      if (n?.groups) { results.push(n.groups.value); }
    }
  }
  return results;
};
