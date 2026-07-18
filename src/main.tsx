import React from 'react'
import ReactDOM from 'react-dom/client'
import './examples/index.scss'
import { App } from './examples'

async function enableMocking() {
  if (import.meta.env.DEV) {
    const { worker } = await import('./mocks.msw/browser')

    return worker.start();
  }
}

const rootElement = ReactDOM.createRoot(document.getElementById('root') as HTMLElement)

enableMocking().then(() => {
  rootElement.render(
    <React.StrictMode>
      <App />
      <small style={{ position: 'fixed', bottom: '8px', left: '8px', border: '1px solid gray', backgroundColor: '#fff', maxWidth: 'calc(100vw - 16px)' }}>Use this to run a local development environment of the library for testing</small>
    </React.StrictMode>
  )
});
