import { ReactiveEngine } from '~/core';
import { BaseREService } from '../../BaseREService'

const BASE_API_URL = import.meta.env.VITE_BASE_API_URL

type TPerson = {
  id: string;
  name: string;
}

export class UserInfoService extends BaseREService {
  // -- NOTE: DERTY_MISTAKE 2/3 ✅ Correct way (variant 2)
  // constructor(engine: ReactiveEngine) {
  //   super(engine);

  //   this.engine.effect(() => {
  //     // Подписываемся на изменение counter
  //     const _ = this.counter.value;

  //     // Синхронно сбрасываем выбранного пользователя при каждом изменении счетчика
  //     this.engine.untrack(() => this.resetActivePersonId());
  //   });
  // }
  // --

  public counter = this.engine.signal<number>(0, 'example-21:UserInfoService:signal:counter');
  public doubledCounter = this.engine.computed<number>(() => this.counter.value * 2, 'example-21:UserInfoService:computed:counter');

  public activePersonId = this.engine.signal<string | null>(null)

  public setActivePersonId = (val: string) => this.activePersonId.value = val
  private resetActivePersonId = () => this.activePersonId.value = null

  public apiState = this.engine.resource<{ items: TPerson[] }, number>(
    async (source, abortSignal) => {
      // -- NOTE: DERTY_MISTAKE 1/3 ⛔ Dont do that here!
      // this.resetActivePersonId()
      // --

      const res = await fetch(
        [
          `${BASE_API_URL}/profile/search`,
          '?',
          [
            `counter=${source}`,
            '_responseDelay=3000',
            `_addData=${encodeURIComponent(JSON.stringify({
              items: [
                {
                  id: 'person-id-1',
                  name: 'John Doe'
                },
                {
                  id: 'person-id-2',
                  name: 'Jane Doe'
                }
              ]
            } as { items: TPerson[] }))}`
          ].join('&')
        ].join(''),
        { signal: abortSignal }
      );
      return res.json();
    },
    this.counter
  )

  public inc() {
    this.resetActivePersonId() // NOTE: DERTY_MISTAKE 2/3 ✅ Correct way (variant 1)
    this.counter.value += 1
  }

  public personList = this.engine.computed(
    () => !this.apiState.loading && Array.isArray(this.apiState.data?.items) && this.apiState.data?.items?.length > 0
      ? this.apiState.data.items
      : []
  )
}
