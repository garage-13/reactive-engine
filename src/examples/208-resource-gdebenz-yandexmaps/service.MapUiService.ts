import { BaseREService } from '../../BaseREService'
import styles from './MapExample.module.scss'

export interface Station {
  id: number
  name: string
  title: string
  lat: number
  lng: number
  slug: string
}

export class MapUiService extends BaseREService {
  public createHtmlContent(station: Station): string {
    return `
      <div class="${styles.popupContent}" style="font-family: sans-serif; min-width: 180px; display: flex; flex-direction: column; gap: 8px; color: #333;">
        <h4 style="margin: 0; font-size: 14px; font-weight: 600; color: #4caf50;">${station.title || station.name}</h4>
        <p style="margin: 0; font-size: 12px; color: #666;">ID: ${station.id}</p>
        <p style="margin: 0; font-size: 12px; color: #666;">Slug: ${station.slug}</p>
        <button class="ymaps-popup-btn" data-station-id="${station.id}" style="background: #4caf50; color: white; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 11px; text-align: center;">
          Выбрать АЗС
        </button>
      </div>
    `
  }

  public isSelectButton(target: HTMLElement): boolean {
    return target && target.classList.contains('ymaps-popup-btn')
  }
}
