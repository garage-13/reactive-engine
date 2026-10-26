#!/bin/bash

# --- ЦВЕТА ДЛЯ ЛОГИРОВАНИЯ ---
GREEN='\033[32m'
BLUE='\033[34m'
YELLOW='\033[33m'
RED='\033[31m'
RESET='\033[0m'

# Функция вывода справки
show_help() {
    echo -e "${BLUE}Универсальный валидатор плотности контекста для Ollama & Aider${RESET}"
    echo -e "Использование:"
    echo -e "  $0 [опции]"
    echo -p
    echo -e "Опции (можно передавать в любом порядке):"
    echo -e "  ${GREEN}-m, --model${RESET} <name>          Имя модели (например: ollama/qwen2.5-coder-long) [Обязательно]"
    echo -e "  ${GREEN}-p, --prompts-length${RESET} <num>  Суммарная длина строк промптов и инструкций в символах [Обязательно]"
    echo -e "  ${GREEN}-f, --files${RESET} \"<list>\"       Список путей к файлам через пробел или запятую [Обязательно]"
    echo -e "  ${GREEN}-b, --base-url${RESET} <url>       Базовый эндпоинт Ollama API (по умолчанию: http://localhost:11434)"
    echo -e "  ${GREEN}-h, --help${RESET}                  Показать эту справочную информацию"
    echo -p
    echo -e "Пример использования:"
    echo -e "  $0 --model \"ollama/qwen2.5-coder-long\" --prompts-length 4500 --files \"src/core.ts tests/core.test.ts\""
}

# Инициализация переменных по умолчанию
AIDER_OLLAMA_API_BASE="http://localhost:11434"
AIDER_MODEL=""
PROMPTS_LENGTH=""
AIDER_FILES_LIST=""

# Парсинг аргументов командной строки (произвольный порядок флагов)
while [[ $# -gt 0 ]]; do
    case "$1" in
        -h|--help)
            show_help
            exit 0
            ;;
        -m|--model)
            AIDER_MODEL="$2"
            shift 2
            ;;
        -b|--base-url)
            AIDER_OLLAMA_API_BASE="$2"
            shift 2
            ;;
        -p|--prompts-length)
            PROMPTS_LENGTH="$2"
            shift 2
            ;;
        -f|--files)
            AIDER_FILES_LIST="$2"
            shift 2
            ;;
        *)
            echo -e "${RED}[Ошибка] Неизвестный параметр кодовой строки: $1${RESET}"
            show_help
            exit 1
            ;;
    esac
done

# Валидация критических параметров
if [ -z "$AIDER_MODEL" ] || [ -z "$PROMPTS_LENGTH" ] || [ -z "$AIDER_FILES_LIST" ]; then
    echo -e "${RED}[Валидатор: Ошибка] Отсутствуют обязательные параметры (--model, --prompts-length или --files)!${RESET}\n"
    show_help
    exit 1
fi

echo -e "${BLUE}[Валидатор] Анализируем плотность контекста и лимиты модели...${RESET}"

# 1. Извлекаем чистый заголовок модели для Ollama API (убираем префикс ollama/)
PURE_MODEL_NAME=$(echo "$AIDER_MODEL" | sed 's|^ollama/||')

# 2. Запрашиваем инфо о модели у локальной Ollama
OLLAMA_INFO_URL="${AIDER_OLLAMA_API_BASE}/api/show"
MODEL_INFO_JSON=$(curl -s -X POST "$OLLAMA_INFO_URL" -d "{\"name\": \"$PURE_MODEL_NAME\"}")

# Извлекаем размер контекстного окна (num_ctx). Безопасный дефолт 32768
MODEL_CTX_LIMIT=$(echo "$MODEL_INFO_JSON" | grep -o '"num_ctx":[0-9]*' | head -n1 | cut -d':' -f2)
if [ -z "$MODEL_CTX_LIMIT" ] || [ "$MODEL_CTX_LIMIT" -eq 0 ]; then
    MODEL_CTX_LIMIT=32768
fi

# Нормализуем список файлов (меняем возможные запятые на пробелы для безопасного итерирования POSIX)
CLEANED_FILES=$(echo "$AIDER_FILES_LIST" | sed 's/[[:space:]]*,[[:space:]]*/,/g' | tr ',' ' ')

# 3. Считаем суммарный объем файлов на диске в байтах
TOTAL_BYTES=0
for file in $CLEANED_FILES; do
    if [ -f "$file" ]; then
        FILE_SIZE=$(wc -c < "$file")
        TOTAL_BYTES=$((TOTAL_BYTES + FILE_SIZE))
    fi
done

# Добавляем длину промптов и инструкций
TOTAL_BYTES=$((TOTAL_BYTES + PROMPTS_LENGTH))

# Переводим в условные токены (1 токен ≈ 3 символа/байта для кода и кириллицы)
ESTIMATED_TOKENS=$((TOTAL_BYTES / 3))

# Безопасный порог удержания внимания модели — 70% от num_ctx
SAFE_THRESHOLD=$((MODEL_CTX_LIMIT * 70 / 100))

echo -e "  - Выбранная модель: ${GREEN}$PURE_MODEL_NAME${RESET}"
echo -e "  - Лимит контекста модели (num_ctx): ${GREEN}$MODEL_CTX_LIMIT токенов${RESET}"
echo -e "  - Ожидаемый вес текущей сессии: ~${YELLOW}$ESTIMATED_TOKENS токенов${RESET}"

if [ "$ESTIMATED_TOKENS" -gt "$SAFE_THRESHOLD" ]; then
    echo -e "\n${RED}[ВНИМАНИЕ / РИСК КОНТЕКСТА] Объем передаваемых файлов и промптов слишком велик!${RESET}"
    echo -e "${YELLOW}Модель может потерять фокус, выдать неполный или обрезанный Markdown код, либо аварийно сбросить соединение.${RESET}"
    echo -e "${YELLOW}Рекомендуется оптимизировать инструкции или временно урезать файлы контекста.${RESET}"
    
    read -p "Вы хотите продолжить генерацию на свой страх и риск? (y/N): " CONFIRMATION
    if [[ ! "$CONFIRMATION" =~ ^[Yy]$ ]]; then
        echo -e "${RED}[Отмена] Пайплайн остановлен пользователем для снижения объема контекста.${RESET}\n"
        exit 1
    fi
    echo -e "${GREEN}[Риск принят] Запуск генерации вопреки лимитам...${RESET}\n"
else
    echo -e "${GREEN}[Успех] Контекст находится в безопасной зоне (~$((ESTIMATED_TOKENS * 100 / MODEL_CTX_LIMIT))% от num_ctx).${RESET}\n"
fi

exit 0
