#!/bin/bash

# Останавливать выполнение скрипта при любой ошибке
set -e

# Инициализация флага dry-run
DRY_RUN=false

# Обработка аргументов командной строки
for arg in "$@"; do
    if [ "$arg" == "--dry-run" ]; then
        DRY_RUN=true
        echo "=== DRY RUN MODE ENABLED ==="
    fi
done

# --- БЛОК АВТОПЕРЕКЛЮЧЕНИЯ ВЕРСИИ NODE.JS ---
NODE_REQ_VERSION="22.20.0" # Значение по умолчанию

# Автодетекция версии из .nvmrc
if [ -f ".nvmrc" ]; then
    NODE_REQ_VERSION=$(cat .nvmrc | tr -d '[:space:]')
    echo "--> Detected Node.js version from .nvmrc: $NODE_REQ_VERSION"
else
    echo "--> .nvmrc not found, using default fallback version: $NODE_REQ_VERSION"
fi

echo "--> Setting up Node.js environment..."

# 1. Проверяем fnm
if [ -d "$HOME/.local/share/fnm" ] || command -v fnm &> /dev/null; then
    echo "Using fnm to set Node.js version..."
    eval "$(fnm env --use-on-cd)"
    fnm use "$NODE_REQ_VERSION" || fnm install "$NODE_REQ_VERSION" && fnm use "$NODE_REQ_VERSION"

# 2. Проверяем nvm
elif [ -s "$HOME/.nvm/nvm.sh" ]; then
    echo "Using nvm to set Node.js version..."
    export NVM_DIR="$HOME/.nvm"
    source "$NVM_DIR/nvm.sh"
    nvm use "$NODE_REQ_VERSION" || nvm install "$NODE_REQ_VERSION" && nvm use "$NODE_REQ_VERSION"

else
    echo "WARNING: Neither fnm nor nvm found. Using system Node.js."
fi

echo "Current Node.js version: $(node -v)"
# --------------------------------------------

# Загрузка переменных окружения
source ./_aux.read-env.sh
PROD_TARGET_PATH_BUILD_DIR=$(read_env PROD_TARGET_PATH_BUILD_DIR .env.production.local)

# Читаем ключ аналитики и принудительно экспортируем его в окружение для Node.js
VITE_GA4_KEY_VALUE=$(read_env VITE_GA4_KEY .env.production.local)
export VITE_GA4_KEY="$VITE_GA4_KEY_VALUE"

# Сборка документации
echo '--> Building documentation... 🛠️'
yarn docs:build

# Валидация сборки
if [ ! -d "docs/.vitepress/dist" ] || [ -z "$(ls -A docs/.vitepress/dist)" ]; then
    echo "ERROR: Build folder 'docs/.vitepress/dist' is missing or empty! Deploy aborted." >&2
    exit 1
fi

# Деплой
if [ "$DRY_RUN" = true ]; then
    echo '-- [DRY-RUN] DOC DEPLOY STARTED 🛫 (Simulation)'

    # Флаг -n у rsync показывает, что было бы отправлено, не меняя файлы
    rsync -a --dry-run --delete --itemize-changes docs/.vitepress/dist/ "$PROD_TARGET_PATH_BUILD_DIR" | grep -v '^\.' || true

    echo '-- [DRY-RUN] DOC DEPLOY COMPLETED 🛬 (Simulation)'
else
    echo '-- DOC DEPLOY STARTED 🛫'

    # Чистый живой rsync
    rsync -av --delete docs/.vitepress/dist/ "$PROD_TARGET_PATH_BUILD_DIR"

    echo '-- DOC DEPLOY COMPLETED 🛬'
fi
