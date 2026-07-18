export const getSpecificHeaders = (origin: string): HeadersInit => ({
  // 1. Динамически разрешаем доступ именно тому origin, который запросил данные
  'Access-Control-Allow-Origin': origin,

  // 2. КРИТИЧЕСКИ ВАЖНО: Разрешаем передачу credentials (куки, сессии)
  'Access-Control-Allow-Credentials': 'true',

  // 3. Разрешаем стандартные методы и заголовки, которые могут быть в запросе
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',

  // 4. Опционально: позволяем браузеру кэшировать preflight-ответ на 10 минут -> 600,
  // чтобы он не спамил OPTIONS-запросами при каждом fetch
  // 'Access-Control-Max-Age': '600',
});
