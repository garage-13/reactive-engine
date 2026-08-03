#!/bin/bash

# Останавливать выполнение скрипта при любой ошибке
set -e

source ./_aux.read-env.sh

PROD_TARGET_PATH_BUILD_DIR=$(read_env PROD_TARGET_PATH_BUILD_DIR .env.production.local)

# 1. Запуск сборки документации
echo '--> Building documentation... 🛠️'
yarn docs:build

# 2. Проверка, что папка дистрибутива существует и не пуста
if [ ! -d "docs/.vitepress/dist" ] || [ -z "$(ls -A docs/.vitepress/dist)" ]; then
    echo "ERROR: Build folder 'docs/.vitepress/dist' is missing or empty! Deploy aborted." >&2
    exit 1
fi

# 3. Деплой на удаленный сервер
echo '-- DOC DEPLOY STARTED 🛫'

rsync -av --delete docs/.vitepress/dist/ "$PROD_TARGET_PATH_BUILD_DIR"

echo '-- DOC DEPLOY COMPLETED 🛬'
