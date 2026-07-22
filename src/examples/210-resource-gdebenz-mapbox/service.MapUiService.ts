import { BaseREService } from '../../BaseREService'
import { Station } from './service.MapLogic'

export class MapUiService extends BaseREService {
  public createHtmlContent(station: Station): string {
    return `
      <div class="my-station-popup-context" style="font-family: sans-serif; min-width: 170px; display: flex; flex-direction: column; gap: 6px; color: #fff; padding-top: 4px;">
        <p style="margin: 0; font-size: 11px; color: #aaa;">ID: ${station.id}</p>
        <p style="margin: 0; font-size: 11px; color: #aaa; margin-bottom: 4px;">Slug: ${station.slug}</p>
        <button class="map-popup-btn" data-station-id="${station.id}" style="background: #1a73e8; color: white; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 11px; text-align: center; width: 100%;">
          Выбрать АЗС
        </button>
      </div>
    `
  }

  public isSelectButton(target: HTMLElement): boolean {
    return target && target.classList.contains('map-popup-btn')
  }
}
