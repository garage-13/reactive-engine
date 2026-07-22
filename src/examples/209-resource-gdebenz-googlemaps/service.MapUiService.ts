import { BaseREService } from '../../BaseREService'
import { Station } from './service.MapLogic'

export class MapUiService extends BaseREService {
  /**
   * Возвращает готовый DOM-элемент для InfoWindow.
   * Google Maps v3 автоматически берет атрибут 'title' этой ноды
   * и вставляет его текст внутрь заголовка .gm-style-iw-ch
   */
  public createHtmlContent(station: Station): string {
    return `
      <div class="my-station-popup-context" style="font-family: sans-serif; min-width: 170px; display: flex; flex-direction: column; gap: 6px; color: #333;">
        <p style="margin: 0; font-size: 11px; color: #666;">ID: ${station.id}</p>
        <p style="margin: 0; font-size: 11px; color: #666; margin-bottom: 4px;">Slug: ${station.slug}</p>
        <button class="map-popup-btn" data-station-id="${station.id}" style="background: #1a73e8; color: white; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 11px; text-align: center; width: 100%;">
          Выбрать АЗС
        </button>
      </div>
    `
  }

  public createHeaderDiv(station: Station): HTMLDivElement {
    const headerDiv = document.createElement('div');
    headerDiv.style.display = 'flex';
    headerDiv.style.alignItems = 'center';
    headerDiv.style.gap = '8px';
    headerDiv.innerHTML = `
      <span style="font-size: 16px;">⛽</span>
      <span style="color: inherit; font-weight: bold;">${station.title || station.name}</span>
    `;
    headerDiv.style.marginBottom = '8px'
    return headerDiv
  }

  public isSelectButton(target: HTMLElement): boolean {
    return target && target.classList.contains('map-popup-btn')
  }
}
