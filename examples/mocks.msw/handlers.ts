import { HttpResponse, http, HttpResponseResolver, passthrough, delay } from 'msw'
import { NSDMS } from './utils/types'
import { getMatched, applyFreeDataMutationScenarios, applyItemsMutationScenarios, getSpecificHeaders, getUrlOrigin, mutateObject } from './utils'
// import findByGUID from './fake-data/findByGUID.json'

type TQuery = {
  _addData?: string;
  _makeScenario?: string;
  _responseDelay?: string;
}

const paramsProcessHOC = ({ requestUrl, initialResponse }: { requestUrl: string, initialResponse: any }) => {
  const url = new URL(requestUrl)
  const result = { ...initialResponse, message: 'Hello from ~/mocks.msw/handlers.ts' }
  const _addDataRaw = url.searchParams.get('_addData')
  const _makeScenarioRaw = url.searchParams.get('_makeScenario')
  const _responseDelayRaw = url.searchParams.get('_responseDelay')

  let normalizedAddData: any = null
  let delayMs = 0 // 🌟 Дефолтное значение задержки

  // NOTE: Парсинг задержки
  if (_responseDelayRaw) {
    const parsedDelay = parseInt(_responseDelayRaw, 10)
    if (!isNaN(parsedDelay) && parsedDelay > 0) {
      delayMs = parsedDelay
    }
  }

  // NOTE: 1. Обработка _addData (перезапись)
  try {
    if (_addDataRaw) {
      normalizedAddData = JSON.parse(_addDataRaw)
      mutateObject({
        target: result,
        source: normalizedAddData,
      })
    }
  } catch (err) {
    result.message = ['🚫 _addData parsing error', (err as Error)?.message, result.message].join('; ')
  }

  // NOTE: 2. Обработка сценариев (_makeScenario)
  try {
    if (_makeScenarioRaw) {
      const { _dataItemElementMutation = [], _freeDataMutation = [] } = JSON.parse(_makeScenarioRaw)
      if (Array.isArray(_dataItemElementMutation) && _dataItemElementMutation.length > 0) {
        applyItemsMutationScenarios(result, _dataItemElementMutation)
      }
      if (Array.isArray(_freeDataMutation) && _freeDataMutation.length > 0) {
        applyFreeDataMutationScenarios(result, _freeDataMutation)
      }
    }
  } catch (err) {
    result.message = `MSW handler error: ${(err as Error)?.message} | ${result.message}`
  }

  return { finalData: result, delayMs } // 🌟 Возвращаем и данные, и время задержки
}

// 🌟 Сделали резолвер асинхронным
const specialApiResolver: HttpResponseResolver<TQuery, never, NSDMS.TBaseResponseData> = async ({
  request,
  params: _params,
  cookies: _cookies,
}) => {
  const clientOrigin = request.headers.get('origin') || getUrlOrigin(request.url)

  // 🌟 Извлекаем delayMs для всех методов, чтобы можно было задерживать OPTIONS/GET/POST одинаково
  const url = new URL(request.url)
  const _responseDelayRaw = url.searchParams.get('_responseDelay')
  const delayMs = _responseDelayRaw ? parseInt(_responseDelayRaw, 10) : 0

  // 🌟 Применяем задержку на самом верхнем уровне резолвера (если передана)
  if (!isNaN(delayMs) && delayMs > 0) {
    await delay(delayMs)
  }

  switch (request.method) {
  case 'OPTIONS':
    return new HttpResponse(null, {
      status: 204,
      headers: getSpecificHeaders(clientOrigin),
    })
  case 'GET': {
    switch (true) {
    case getMatched({ pattern: '*/profile/search', testedUrl: request.url }):
    case getMatched({ pattern: '*/profile/accessPolicies', testedUrl: request.url }):
    case getMatched({ pattern: '*/policy', testedUrl: request.url }):
    case getMatched({ pattern: '*/menu', testedUrl: request.url }):
    case getMatched({ pattern: '*/notifications/count', testedUrl: request.url }):
    case getMatched({ pattern: '*/dataProcessingAgreement/exists', testedUrl: request.url }):
    case getMatched({ pattern: '*/dataProcessingAgreement', testedUrl: request.url }):
    case getMatched({ pattern: '*/onlineChat/data', testedUrl: request.url }):
    case getMatched({ pattern: '*/request/administrative/topics', testedUrl: request.url }):
    case getMatched({ pattern: '*/onlineChat/data', testedUrl: request.url }):
    case getMatched({ pattern: '*/notifications/count', testedUrl: request.url }): {
      const { finalData } = paramsProcessHOC({
        requestUrl: request.url,
        initialResponse: { ok: true },
      })
      return HttpResponse.json(finalData, { status: 200, headers: getSpecificHeaders(clientOrigin) })
    }
    default:
      return passthrough()
    }
  }
  case 'POST': {
    switch (true) {
    case getMatched({ pattern: '*/authentication/oldLkdms/frame/syncToken/generate', testedUrl: request.url }):
    case getMatched({ pattern: '*/profile/child/add', testedUrl: request.url }):
    case getMatched({ pattern: '*/request/administrative', testedUrl: request.url }):
    case getMatched({ pattern: '*/notifications/viewed', testedUrl: request.url }):
    case getMatched({ pattern: '*/tmp_file', testedUrl: request.url }): {
      const { finalData } = paramsProcessHOC({
        requestUrl: request.url,
        initialResponse: { ok: true },
      })
      return HttpResponse.json(finalData, { status: 200, headers: getSpecificHeaders(clientOrigin) })
    }
    default:
      return passthrough()
    }
  }
  default:
    return passthrough()
  }
}

// Резолвер асинхронный
const coreApiResolver: HttpResponseResolver = async ({ request, params: _params, cookies: _cookies }): Promise<any> => {
  const origin = getUrlOrigin(request.url)

  // Добавлена поддержка задержки и во второй резолвер
  const url = new URL(request.url)
  const _responseDelayRaw = url.searchParams.get('_responseDelay')
  const delayMs = _responseDelayRaw ? parseInt(_responseDelayRaw, 10) : 0

  if (!isNaN(delayMs) && delayMs > 0) {
    await delay(delayMs)
  }

  switch (request.method) {
  case 'OPTIONS':
    return new HttpResponse(null, {
      status: 204,
      headers: getSpecificHeaders(origin),
    })
  case 'GET': {
    switch (true) {
    // case getMatched({ pattern: '*/user/findByGUID', testedUrl: request.url }):
    //   return HttpResponse.json(findByGUID, { status: 200, headers: getSpecificHeaders(origin) });
    default:
      return passthrough()
    }
  }
  case 'POST':
    switch (true) {
    case getMatched({ pattern: '*/logger/sendLog', testedUrl: request.url }):
      return HttpResponse.json({ message: 'Log is sent', code: '200' }, { status: 204, headers: getSpecificHeaders(origin) })
    default:
      return passthrough()
    }
  default:
    return passthrough()
  }
}

const coreApiHack = http.all(
  'http://local.core.ru:8080/*',
  coreApiResolver,
)
const specialApiHack = http.all<TQuery, never, NSDMS.TBaseResponseData>(
  'http://local.devtool-1.ru/express-helper/mg/mocks/*',
  specialApiResolver,
)
const _gdeBenzApiResolver = http.get('/gdebenzin-vite-proxy/api/v1/stations/*', ({ request }) => {
  const url = new URL(request.url)
  const bbox = url.searchParams.get('bbox')

  // Возвращаем фейковый массив АЗС для тестов
  return HttpResponse.json([
    { id: 1, name: 'Тестовая АЗС', title: 'Тестовая АЗС', lat: 45.0, lng: 34.0, slug: 'test' }
  ])
})
const fakeFeedApiResolver = http.post('/fake-feed-vite-proxy/*', ({ request }) => {
  const clientOrigin = request.headers.get('origin') || getUrlOrigin(request.url)
  const { finalData } = paramsProcessHOC({
    requestUrl: request.url,
    initialResponse: { ok: true },
  })
  return HttpResponse.json(finalData, { status: 200, headers: getSpecificHeaders(clientOrigin) })
})

export const handlers = [
  coreApiHack,
  specialApiHack,
  // gdeBenzApiResolver,
  fakeFeedApiResolver,
]
