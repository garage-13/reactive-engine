import { AbstractService } from '@pravosleva/reactive-engine'
import { UserInfoService } from './service.firstly'

const BASE_API_URL = import.meta.env.VITE_BASE_API_URL

type TResData = {
  for_person_id: string;
}

export class SecondaryService extends AbstractService {
  private userInfoService = this.engine.inject(UserInfoService)

  private isUserDataReceived = this.engine.computed<boolean>(
    () => !this.userInfoService.apiState.loading && !!this.userInfoService.apiState.data,
    'example-201:computed:isUserDataReceived'
  )

  private apiDeps = this.engine.computed<[boolean, string | null]>(() => [
    this.isUserDataReceived.value,
    this.userInfoService.activePersonId.value,
  ])

  public apiState = this.engine.resource<TResData, [boolean, string | null]>(
    async (deps, abortSignal) => {
      const [isDataReceived, personId] = deps;

      if (!isDataReceived) throw new Error('Waiting for user data response...');
      if (!personId) throw new Error('Person id wasnt selected...');

      const queryParams = new URLSearchParams({
        personId: String(personId),
        _responseDelay: '2000',
        _addData: JSON.stringify({ for_person_id: personId } as TResData)
      });

      const res = await fetch(
        `${BASE_API_URL}/profile/accessPolicies?${queryParams}`,
        { signal: abortSignal }
      );
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      return res.json();
    },
    this.apiDeps,
    {
      name: 'example-201:resource:accessPolicies',
      resetDataOnSourceChange: true,
      responseValidate: (res) => {
        // Пример: Бэкенд ответил 200, но ожидаемое поле отсутствует, что для нас критично
        if (!res || typeof res.for_person_id !== 'string') {
          return 'No access policies found for this user'; // Запишется в state.error
        }
        return true; // Всё отлично, запишется в state.data
      }
    }
  )
}
