## Работа с `uv`
Основная вкладка:
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
source $HOME/.local/bin/env
```

В соседней вкладке:
```bash
ollama run qwen2.5-coder-long
```

Основная вкладка:
```bash
uv run --python 3.12 --with aider-chat aider --model ollama/qwen2.5-coder-long --edit-format diff --no-auto-commits

diff> /add src/core/core.ts
diff> Оптимизируй метод .destroy() в файле src/core/core.ts для предотвращения утечек памяти в подписках сигналов.

git diff > qwen_refactoring_changes.patch
```
