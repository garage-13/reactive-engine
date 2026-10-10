import { ReactiveEngineAutomatic } from './core.automatic'
import { Computed } from './types'

/**
 * 📊 REACTIVE ENGINE AUTOLOG (core.autolog)
 * Расширяет автоматический шедулер. Добавляет Enterprise-логирование,
 * замер производительности и Pull Duration каскадов графа.
 */
export class ReactiveEngineAutolog extends ReactiveEngineAutomatic {
  public autoLogQueue: Array<any> = []
  public isHardFlushScheduled = false

  public queueLog(type: string, name: string, meta?: any): void {
    this.autoLogQueue.push({ type, name, meta, timestamp: Date.now() })
    if (!this.isHardFlushScheduled) {
      this.isHardFlushScheduled = true
      queueMicrotask(() => this.flushLogs())
    }
  }

  public flushLogs(): void {
    this.isHardFlushScheduled = false
    if (this.autoLogQueue.length === 0) return
    if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'test') {
      console.group(`📊 [Autolog] Срез транзакций: ${this.autoLogQueue.length} операций`)
      this.autoLogQueue.forEach(log => console.log(`[${log.type.toUpperCase()}] ${log.name}`, log.meta || ''))
      console.groupEnd()
    }
    this.autoLogQueue = []
  }

  public override computed<T>(fn: () => T, signalName?: string): Computed<T> {
    const engine = this
    const name = signalName || 'unnamed_computed'
    const originalComputed = super.computed(fn, signalName)
    let isDestroyed = false

    const autologComputedInstance: Computed<T> = {
      get value(): T {
        if (isDestroyed) return originalComputed.value
        const startTime = typeof performance !== 'undefined' ? performance.now() : 0
        const val = originalComputed.value

        if (startTime) {
          engine.queueLog('computed', name, { value: val, duration: `${(performance.now() - startTime).toFixed(3)}ms` })
        }
        return val
      },
      subscribe: (cb) => originalComputed.subscribe(cb),
      destroy() {
        isDestroyed = true
        originalComputed.destroy()
      }
    }

    if ('_node' in originalComputed) {
      Object.defineProperty(autologComputedInstance, '_node', {
        value: (originalComputed as any)._node,
        enumerable: false
      })
    }

    return autologComputedInstance
  }
}
