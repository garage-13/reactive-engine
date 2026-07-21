import { BaseREService } from '../../BaseREService'
import { Station } from './service.MapLogic'
import styles from './MapExample.module.scss'

export class MapUiService extends BaseREService {
  public getPopupClassName(): string {
    return styles.customPopup
  }

  public createHtmlContent(station: Station): string {
    return `
      <div class="${styles.popupContent}">
        <h4>${station.title || station.name}</h4>
        <p>ID: ${station.id}</p>
        <p>Slug: ${station.slug}</p>
        <button class="${styles.popupBtn}" data-station-id="${station.id}">
          Выбрать АЗС
        </button>
      </div>
    `
  }

  public isSelectButton(target: HTMLElement): boolean {
    return target && target.classList.contains(styles.popupBtn)
  }
}
