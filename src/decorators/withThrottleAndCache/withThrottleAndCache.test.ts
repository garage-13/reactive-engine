import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withThrottleAndCache } from './withThrottleAndCache';

describe('withThrottleAndCache decorator', () => {
  let fakeNow = 1000;

  beforeEach(() => {
    fakeNow = 1000;
    // Подменяем системный метод управляемой переменной fakeNow
    vi.spyOn(Date, 'now').mockImplementation(() => fakeNow);
    // Нативные таймеры гарантируют мгновенное разрешение async/await внутри setTimeout
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('должен пропустить первый вызов мгновенно и сохранить результат в кэш', async () => {
    const mockFetcher = vi.fn().mockResolvedValue('data-1');
    // Ограничение частоты 300мс, время жизни кэша 5 секунд
    const optimizedFetcher = withThrottleAndCache(mockFetcher, { limit: 300, ttl: 5000 });
    const controller = new AbortController();

    const result = await optimizedFetcher('query-A', controller.signal);

    // Первый вызов (Leading edge) пробивается в сеть сразу
    expect(mockFetcher).toHaveBeenCalledTimes(1);
    expect(result).toBe('data-1');
  });

  it('должен заблокировать частые вызовы по правилам троттлинга, но вернуть данные из кэша, если они там есть', async () => {
    const mockFetcher = vi.fn().mockResolvedValue('cached-response');
    const optimizedFetcher = withThrottleAndCache(mockFetcher, { limit: 300, ttl: 5000 });

    const c1 = new AbortController();
    const c2 = new AbortController();

    // 1. Первый вызов (отметка 1000мс) -> Инициализирует кэш для 'query-A'
    await optimizedFetcher('query-A', c1.signal);
    expect(mockFetcher).toHaveBeenCalledTimes(1);

    // Смещаем время вперед, но остаемся внутри окна блокировки (отметка 1100мс)
    fakeNow += 100;

    // 2. Второй вызов с ТЕМ ЖЕ ключом -> Срабатывает троттлинг Trailing edge (встает в хвост)
    const promise = optimizedFetcher('query-A', c2.signal);

    // Перематываем время к окончанию лимита троттлинга (отметка 1300мс)
    fakeNow = 1300;

    // Дожидаемся срабатывания хвостового вызова
    const result = await promise;

    // ПРОВЕРКА КЭША: Троттлинг пропустил вызов на хвосте, но декоратор взял данные
    // из оперативной памяти. Сетевой fetcher НЕ вызывался повторно.
    expect(mockFetcher).toHaveBeenCalledTimes(1);
    expect(result).toBe('cached-response');
  });

  it('должен сходить в сеть повторно, если лимит троттлинга прошел, но TTL кэша уже истек', async () => {
    let callCount = 0;
    // Фетчер на каждый вызов отдает инкрементированную строку
    const mockFetcher = vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve(`data-${callCount}`);
    });

    // Настраиваем короткий TTL кэша в 1000мс
    const optimizedFetcher = withThrottleAndCache(mockFetcher, { limit: 300, ttl: 1000 });
    const c1 = new AbortController();
    const c2 = new AbortController();

    // 1. Первый вызов (отметка 1000мс) -> Срабатывает сеть (data-1)
    const res1 = await optimizedFetcher('query-B', c1.signal);
    expect(res1).toBe('data-1');

    // Перематываем виртуальное время далеко вперед, перешагивая и лимит, и TTL (отметка 2500мс)
    fakeNow = 2500;

    // 2. Второй вызов -> Окно троттлинга открыто, но кэш протух
    const res2 = await optimizedFetcher('query-B', c2.signal);

    // Декоратор сделал повторный честный сетевой запрос
    expect(mockFetcher).toHaveBeenCalledTimes(2);
    expect(res2).toBe('data-2');
  });

  it('при быстром вводе разных ключей должен корректно отработать троттлинг последнего значения', async () => {
    const mockFetcher = vi.fn().mockImplementation((val) => Promise.resolve(`res-${val}`));
    const optimizedFetcher = withThrottleAndCache(mockFetcher, { limit: 300, ttl: 5000 });

    const c1 = new AbortController();
    const c2 = new AbortController();
    const c3 = new AbortController();

    // 1. Первый мгновенный вызов (0мс) -> Leading edge
    optimizedFetcher('key-1', c1.signal);
    expect(mockFetcher).toHaveBeenCalledTimes(1);

    fakeNow += 100; // отметка 1100мс

    // 2. Промежуточный вызов -> Встает в хвост, но будет перебит
    const p2 = optimizedFetcher('key-2', c2.signal);

    fakeNow += 50; // отметка 1150мс

    // 3. Последний вызов -> Перебивает прошлый хвост и фиксируется как финальный
    const p3 = optimizedFetcher('key-3', c3.signal);

    // Проверяем, что промежуточный промис отклонен декоратором с AbortError
    await expect(p2).rejects.toThrow('Aborted due to newer throttled value');

    // Имитируем окончание лимита троттлинга (отметка 1300мс)
    fakeNow = 1300;

    const finalResult = await p3;

    // На хвосте выполнился запрос именно для последнего актуального ключа
    expect(mockFetcher).toHaveBeenCalledTimes(2);
    expect(mockFetcher).toHaveBeenLastCalledWith('key-3', c3.signal);
    expect(finalResult).toBe('res-key-3');
  });
});
