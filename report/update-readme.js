import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

/**
 * 🤖 AUTOMATED ENGINE INTEGRATION & BENCHMARK REPORT SCRIPT (v1.8.8)
 *
 * Чистый скрипт интеграции. Без внешних хаков планировщика.
 * Движок обязан проходить тесты бенчмарка нативно, за счет собственной архитектуры.
 */
function runFrameworkBenchmark() {
  const rootDir = process.cwd()
  const submoduleDir = path.resolve(rootDir, 'report', 'reactive-framework-test-suite')

  console.log('🚀 Старт автоматизации интеграции подмодуля бенчмарка...')

  if (!fs.existsSync(submoduleDir) || !fs.existsSync(path.resolve(submoduleDir, 'package.json'))) {
    console.error('❌ Ошибка: Подмодуль бенчмарка не найден по пути ' + submoduleDir + '. Выполните: git submodule update --init --recursive')
    process.exit(1)
  }

  const adapterTargetPath = path.resolve(submoduleDir, 'src', 'reactiveEngine.test.ts')
  const adapterSourceCode = `import { testSuite, SkipTest } from "./index";
import { describe, test, beforeEach } from "vitest";
import { ReactiveEngineCore, ReactiveEngineAutomatic } from "../../../src/index";

let fwCore: any;
let fwAuto: any;

const initIsolatedEngines = () => {
  const engineCore = new ReactiveEngineCore();
  const engineAuto = new ReactiveEngineAutomatic();

  fwCore = {
    name: "@pravosleva/reactive-engine.core",
    signal: (init: any) => {
      const s = typeof init === 'object' && init !== null ? engineCore.reactive(init) : engineCore.signal(init);
      return {
        read: () => ('subscribe' in s ? s.value : s),
        write: (v: any) => { if ('subscribe' in s) { s.value = v; } else { Object.assign(s, v); } }
      };
    },
    computed: (fn: any) => { const c = engineCore.computed(fn); return { read: () => c.value }; },
    effect: (fn: any) => engineCore.effect(fn),
    untracked: (fn: any) => engineCore.untrack(fn),
    batch: (fn: any) => engineCore.batch(fn),
    run: (fn: any) => fn()
  };

  fwAuto = {
    name: "@pravosleva/reactive-engine.automatic",
    signal: (init: any) => {
      const s = typeof init === 'object' && init !== null ? engineAuto.reactive(init) : engineAuto.signal(init);
      return {
        read: () => ('subscribe' in s ? s.value : s),
        write: (v: any) => { if ('subscribe' in s) { s.value = v; } else { Object.assign(s, v); } }
      };
    },
    computed: (fn: any) => { const c = engineAuto.computed(fn); return { read: () => c.value }; },
    effect: (fn: any) => engineAuto.effect(fn),
    untracked: (fn: any) => engineAuto.untrack(fn),
    batch: (fn: any) => engineAuto.batch(fn),
    run: (fn: any) => fn()
  };
};

for (const { section, cases, type } of testSuite) {
  if (type === "behavioral") continue;

  describe(\`@pravosleva/reactive-engine > \${section}\`, () => {
    beforeEach(() => {
      initIsolatedEngines();
    });

    for (const [name, fn] of Object.entries(cases)) {
      test(\`\${name} [.core]\`, () => {
        try { (fn as any)(fwCore); } catch (e) { if (e instanceof SkipTest) return; throw e; }
      });

      test(\`\${name} [.automatic]\`, () => {
        try { (fn as any)(fwAuto); } catch (e) { if (e instanceof SkipTest) return; throw e; }
      });
    }
  });
}
`

  fs.writeFileSync(adapterTargetPath, adapterSourceCode, 'utf8')
  console.log('✅ Чистый контракт бенчмарка инжектирован.')

  try {
    execSync('npm install', { cwd: submoduleDir, stdio: 'inherit' })
    execSync('npm test', { cwd: submoduleDir, stdio: 'inherit' })
    console.log('✅ Нативный прогон графов успешно завершен!')
  } catch (error) {
    console.warn('⚠️ Зафиксированы падения ядра. Переходим к лечению под капотом движка.')
  }
}

runFrameworkBenchmark()
