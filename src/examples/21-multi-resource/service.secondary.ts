import { BaseREService } from '../../BaseREService'
import { UserInfoService } from './service.firstly';

const BASE_API_URL = import.meta.env.VITE_BASE_API_URL

export class SecondaryService extends BaseREService {
  private userInfoService = this.engine.inject(UserInfoService)
  private isUserDataReceived = this.engine.computed<boolean>(() => !this.userInfoService.apiState.loading && !!this.userInfoService.apiState.data, 'example-21:computed:counter');

  private apiDeps = this.engine.computed(() => [
    this.isUserDataReceived,
    this.userInfoService.activePersonId,
  ])
  public apiState = this.engine.resource(
    async (deps, abortSignal) => {
      if (!deps[0].value) {
        throw new Error('Waiting for user data response...')
      }
      if (!deps[1].value) {
        throw new Error('Person id wasnt selected...')
      }
      const res = await fetch(
        [
          `${BASE_API_URL}/profile/accessPolicies`,
          '?',
          [
            `personId=${deps[0].value}`,
            '_responseDelay=2000',
            `_addData=${encodeURIComponent(JSON.stringify({
              for_id: deps[1].value,
            } as { for_id: string }))}`
          ].join('&')
        ].join(''),
        { signal: abortSignal }
      );
      return res.json();
    },
    this.apiDeps
  )
}
