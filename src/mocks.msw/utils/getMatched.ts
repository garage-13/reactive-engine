export const getMatched = ({ testedUrl, pattern }: { testedUrl: string; pattern: string }): boolean => {
  const [path] = testedUrl.split('?');
  const escapedPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  const regex = new RegExp(`^${escapedPattern}$`);
  return regex.test(path);
};
