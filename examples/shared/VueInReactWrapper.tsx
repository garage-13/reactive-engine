// VueInReactWrapper.tsx
import { useEffect, useRef } from 'react'
import { createApp } from 'vue'

export const VueInReactWrapper = ({ component }: { component: any }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const vueAppRef = useRef<any>(null)

  useEffect(() => {
    if (containerRef.current && component) {
      // Извлекаем чистый компонент из ES-модуля (Vite export default)
      const vueComponent = component.default ? component.default : component

      // Инициализируем Vue, передавая объект напрямую
      const app = createApp(vueComponent)
      app.mount(containerRef.current)
      vueAppRef.current = app
    }

    return () => {
      if (vueAppRef.current) {
        vueAppRef.current.unmount()
        vueAppRef.current = null
      }
    }
  }, [component])

  return <div ref={containerRef} style={{ width: '100%', minHeight: '50px' }} />
}
