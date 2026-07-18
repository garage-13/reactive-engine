import { BaseREService } from '../../BaseREService'
import { UserInfoService } from './service.firstly';

const BASE_API_URL = import.meta.env.VITE_BASE_API_URL

export class SecondaryService extends BaseREService {
  private userInfoService = this.engine.inject(UserInfoService)
  public counter = this.engine.signal<number>(0, 'example-21:SecondaryService:signal:counter');
  private isUserDataReceived = this.engine.computed<boolean>(() => !this.userInfoService.apiState.loading && !!this.userInfoService.apiState.data, 'example-21:computed:counter');

  private apiDeps = this.engine.computed(() => [
    this.userInfoService.activePersonId,
    this.counter,
    this.isUserDataReceived,
  ])
  public apiState = this.engine.resource(
    async (deps, abortSignal) => {
      if (!deps[2].value) {
        throw new Error('Waiting for user data...')
      }
      if (!deps[0].value) {
        throw new Error('Person wasnt detected')
      }
      const res = await fetch(
        [
          `${BASE_API_URL}/profile/accessPolicies`,
          '?',
          [
            `personId=${deps[0].value}`,
            '_responseDelay=2000',
          ].join('&')
        ].join(''),
        { signal: abortSignal }
      );
      return res.json();
    },
    this.apiDeps
  )

  public inc() {
    this.counter.value += 1
  }
}
