// examples/bootstrap-vue.ts
import { createApp, h } from 'vue'
import VueApp from './App.vue'

export function initVueApp(elementId: string) {
  const vueRootEl = document.getElementById(elementId)
  if (vueRootEl) {
    // Используем функцию h(), чтобы принудительно заставить Vue
    // скомпилировать импортированный модуль в правильный корневой узел
    const vueApp = createApp({
      render: () => h(VueApp)
    })

    vueApp.mount(vueRootEl)
    return vueApp
  }
  return null
}
