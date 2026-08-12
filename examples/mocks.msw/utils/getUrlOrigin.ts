/**
 * Извлекает origin (протокол + домен + порт) из строки URL,
 * убирая маски пути (например, '/*') и лишние слеши.
 */
export const getUrlOrigin = (urlStr: string): string => {
  try {
    // 1. Очищаем строку от маски '/*', если она есть на конце
    const cleanUrl = urlStr.replace(/\/\*$/, '')

    // 2. Используем встроенный класс URL для разбора
    const url = new URL(cleanUrl)

    // 3. Возвращаем origin (содержит протокол://домен:порт)
    return url.origin
  } catch (err) {
    // На случай, если пришла совсем некорректная строка (не URL)
    console.error('Invalid URL provided:', err)
    return ''
  }
}
