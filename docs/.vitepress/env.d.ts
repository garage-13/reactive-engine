// Декларация для обычных CSS-импортов
declare module '*.css' {
  const content: unknown;
  export default content;
}

// Расширяем глобальный объект Window
interface Window {
  gtag?: (...args: unknown[]) => void;
}
