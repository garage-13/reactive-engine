declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  // Описываем дефолтный экспорт как универсальный компонент Vue 3
  const component: DefineComponent<{}, {}, any>
  export default component
}

declare module '*.module.scss' {
  const classes: { [key: string]: string }
  export default classes
}
