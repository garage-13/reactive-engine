import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './examples'

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
    <small style={{ position: 'fixed', bottom: '8px', left: '8px', border: '1px solid gray', backgroundColor: '#fff', maxWidth: 'calc(100vw - 16px)' }}>Use this to run a local development environment of the library for testing</small>
  </React.StrictMode>,
);
