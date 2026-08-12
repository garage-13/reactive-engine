export const getRandomInteger = ({ min, max }: { min: number, max: number }) => Math.round(min - 0.5 + Math.random() * (max - min + 1))
