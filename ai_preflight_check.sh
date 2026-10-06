#!/bin/bash

# --- ЦВЕТА ДЛЯ ВЫВОДА ДИАГНОСТИКИ ---
GREEN='\033[32m'
BLUE='\033[34m'
YELLOW='\033[33m'
RED='\033[31m'
RESET='\033[0m'

ENV_FILE=".env.development"

echo -e "${BLUE}=== ЗАПУСК ПРЕДСТАРТОВОЙ ПРОВЕРКИ ОКРУЖЕНИЯ ===${RESET}"
FAILED_CHECK=0

# 1. Загрузка конфигурационного файла
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}[КРИТИЧЕСКАЯ ОШИБКА] Конфигурационный файл $ENV_FILE не найден в корне проекта!${RESET}"
    exit 1
fi

# Экспортируем переменные, очищая от комментариев
export $(grep -v '^#' "$ENV_FILE" | xargs)

# Выставляем дефолтные значения, если они не заданы в .env
API_BASE="${AIDER_OLLAMA_API_BASE:-http://127.0.0.1:11434}"
MODEL_NAME="${AIDER_MODEL:-ollama/qwen2.5-coder-long}"
# Очищаем префикс провайдера (например, "ollama/qwen2.5..." -> "qwen2.5-coder-long")
PURE_MODEL=$(echo "$MODEL_NAME" | sed 's|^[^/]*/||')

# 2. Проверка утилиты Git и репозитория
if ! command -v git &> /dev/null; then
    echo -e "${RED}[КРИТИЧЕСКОЕ ПОЛОЖЕНИЕ] Git не установлен в системе Ubuntu! Выполните: sudo apt install git${RESET}"
    FAILED_CHECK=1
else
    if ! git rev-parse --is-inside-work-tree &> /dev/null; then
        echo -e "${RED}[КРИТИЧЕСКОЕ ПОЛОЖЕНИЕ] Текущая директория не является Git-репозиторием! Выполните 'git init'${RESET}"
        FAILED_CHECK=1
    fi
fi

# 3. Проверка менеджера пакетов uv от Astral
if ! command -v uv &> /dev/null; then
    echo -e "${RED}[КРИТИЧЕСКОЕ ПОЛОЖЕНИЕ] Менеджер пакетов 'uv' на Rust не найден!${RESET}"
    echo -e "${YELLOW}👉 Выполните установку: curl -LsSf https://astral.sh | sh${RESET}"
    FAILED_CHECK=1
fi

# 4. Проверка и пинг LLM-сервера на основе параметров из конфига
echo -e "${BLUE}[Диагностика] Проверяем подключение к ИИ-серверу по адресу: $API_BASE...${RESET}"

if ! curl -s --connect-timeout 3 "$API_BASE/api/tags" > /dev/null; then
    echo -e "${RED}[ОШИБКА ПОДКЛЮЧЕНИЯ] ИИ-сервер по адресу $API_BASE недоступен!${RESET}"
    echo -e "${YELLOW}👉 Убедитесь, что Ollama запущена, или проверьте параметр AIDER_OLLAMA_API_BASE в $ENV_FILE.${RESET}"
    FAILED_CHECK=1
else
    # Проверяем наличие конкретной скачанной модели, указанной в конфиге
    if ! curl -s "$API_BASE/api/tags" | grep -q "$PURE_MODEL"; then
        echo -e "${RED}[ВНИМАНИЕ] Модель '$PURE_MODEL' не найдена в кэше вашего сервера $API_BASE!${RESET}"
        echo -e "${YELLOW}👉 Выполните скачивание: ollama pull $PURE_MODEL${RESET}"
        FAILED_CHECK=1
    fi
fi

# 5. Финальный вердикт
if [ $FAILED_CHECK -eq 1 ]; then
    echo -e "\n${RED}=== ЗАПУСК ПРЕРВАН: Исправьте конфигурационные ошибки выше ===${RESET}"
    exit 1
else
    echo -e "${GREEN}[УСПЕХ] Все системные зависимости и ИИ-эндпоинты проверены. Окружение стабильно!${RESET}\n"
    exit 0
fi
