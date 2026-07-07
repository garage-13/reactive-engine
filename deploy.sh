#!/bin/bash

# Останавливать скрипт при любой ошибке
set -e

echo "🔄 Проверяем авторизацию в NPM..."
if ! npm whoami > /dev/null 2>&1; then
  echo "❌ Ошибка: Вы не авторизованы в npm. Сначала запустите 'npm login'"
  exit 1
fi

echo "🧹 Удаляем старую сборку..."
rm -rf dist

echo "📦 Запуск тестов и сборки пакета..."
npm run test
npm run build

echo "🚀 Публикация в реестр npm..."
# Если пакет находится в scope организации (@pravosleva/...),
# обязательно добавляем флаг --access public
npm publish --access public

echo "✅ Библиотека успешно обновлена и опубликована!"
