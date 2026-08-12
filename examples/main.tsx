import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.scss'
import { App as ReactApp } from './App.react'
// Импортируем только функцию инициализации, никакого Vue-кода здесь больше нет!
import { initVueApp } from './bootstrap-vue'

async function enableMocking() {
  if (import.meta.env.DEV) {
    const { worker } = await import('./mocks.msw/browser')

    return worker.start()
  }
}

const rootElement = ReactDOM.createRoot(document.getElementById('root') as HTMLElement)

enableMocking().then(() => {
  // 1. Рендерим React
  rootElement.render(
    <React.StrictMode>
      <ReactApp />
      <small style={{ position: 'fixed', bottom: '8px', left: '8px', border: '1px solid gray', backgroundColor: '#fff', maxWidth: 'calc(100vw - 16px)' }}>
        Use this to run a local development environment of the library for testing
      </small>
    </React.StrictMode>
  )

  // 2. Рендерим Vue через изолированный бутстраппер
  initVueApp('vue-app')
})
