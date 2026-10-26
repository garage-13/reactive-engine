#!/bin/bash

# --- ЦВЕТА ДЛЯ ЛОГИРОВАНИЯ ---
GREEN='\033[32m'
BLUE='\033[34m'
YELLOW='\033[33m'
RED='\033[31m'
RESET='\033[0m'

ENV_FILE=".env.doc.entity"
DRY_RUN=false

echo -e "${BLUE}[Параллельный конвейер] Запуск специализированного генератора документации...${RESET}"

# 1. ОБРАБОТКА ФЛАГОВ КОМАНДНОЙ СТРОКИ
if [ "$1" == "--dry-run" ]; then
    DRY_RUN=true
    echo -e "${YELLOW}[DRY-RUN] Включен режим тестового прогона. Генерация будет симулирована!${RESET}\n"
fi

# 2. Проверка наличия конфигурации
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}[Ошибка] Файл конфигурации $ENV_FILE не найден!${RESET}"
    exit 1
fi

# Запуск внешней изолированной проверки окружения
if [ -f "./ai_ollama_aider_preflight_check.sh" ]; then
    chmod +x ./ai_ollama_aider_preflight_check.sh
    ./ai_ollama_aider_preflight_check.sh
    if [ $? -ne 0 ]; then
        exit 1
    fi
fi

# 3. Загрузка параметров конфигурации
source "$ENV_FILE"

if [ -z "$DOC_TARGET_ENTITY_DECORATOR" ]; then
    echo -e "${RED}[Ошибка] Переменная DOC_TARGET_ENTITY_DECORATOR в $ENV_FILE не задана!${RESET}"
    exit 1
fi

# Трансформируем список файлов (меняем запятые на пробелы)
CLEANED_FILES=$(echo "$AIDER_FILES" | sed 's/[[:space:]]*,[[:space:]]*/,/g' | tr ',' ' ')

# Экспортируем параметры в окружение Aider
export OLLAMA_API_BASE="$AIDER_OLLAMA_API_BASE"
export AIDER_MODEL="$AIDER_MODEL"
export AIDER_CHAT_MODE="$AIDER_CHAT_MODE"
export AIDER_MAP_TOKENS="$AIDER_MAP_TOKENS"

# Формируем динамический флаг коммитов
AIDER_COMMIT_FLAG="--auto-commits"
if [ "$AIDER_DISABLE_AUTO_COMMITS" = "true" ]; then
    AIDER_COMMIT_FLAG="--no-auto-commits"
fi

# Проверяем файл глобальных инструкций
AIDER_READ_INSTRUCTIONS_FLAG=""
if [ -f ".aider.instructions.entity.decorator.md" ]; then
    AIDER_READ_INSTRUCTIONS_FLAG="--read .aider.instructions.entity.decorator.md"
fi

# Динамические пути к результирующим md-файлам
FILE_PATH_RU="docs/decorators/${DOC_TARGET_ENTITY_DECORATOR}.md"
FILE_PATH_EN="docs/en/decorators/${DOC_TARGET_ENTITY_DECORATOR}.md"

# 4. Валидация существования базовых файлов и создание заглушек
for file in $CLEANED_FILES; do
    if [ ! -f "$file" ]; then
        if [ "$DRY_RUN" = true ]; then
            echo -e "${YELLOW}[DRY-RUN] Симуляция: Файл отсутствует: $file${RESET}"
        else
            echo -e "${YELLOW}[Сборщик] Создаем заглушку для файла: $file...${RESET}"
            mkdir -p "$(dirname "$file")"
            touch "$file"
        fi
    fi
done

# Динамическое формирование ТАСК-задач для Aider на основе целевого декоратора без тестового мусора
TASK_RU="[LANGUAGE: RUSSIAN] Write the complete documentation page for '${DOC_TARGET_ENTITY_DECORATOR}' decorator into '${FILE_PATH_RU}'. Follow the layout constraints from .aider.instructions.entity.md strictly in Russian language. Inspect edge-cases in the provided test file (cache warming, network error fallbacks, and Proxy-array mutations via .push()). CRITICAL: Convert test cases logic into clean production-ready TypeScript code. Never use Vitest utilities like 'vi.fn()', 'expect()' or mock timers. Show real behavior using console.log() and async/await. Translate headers and code comments to Russian."

TASK_EN="[LANGUAGE: ENGLISH] Write the complete documentation page for '${DOC_TARGET_ENTITY_DECORATOR}' decorator into '${FILE_PATH_EN}'. Follow the layout constraints from .aider.instructions.entity.md strictly in English language. Inspect edge-cases in the provided test file (cache warming, network error fallbacks, and Proxy-array mutations via .push()). CRITICAL: Convert test cases logic into clean production-ready TypeScript code. Never use Vitest utilities like 'vi.fn()', 'expect()' or mock timers. Show real behavior using console.log() and async/await. Write headers and code comments in English."

# 5. ОБРАБОТКА РЕЖИМА ХОЛОСТОГО ПРОГОНА
if [ "$DRY_RUN" = true ]; then
    echo -e "\n${BLUE}======================= ОТЛАДОЧНЫЙ СНИМОК DOC DRY-RUN =======================${RESET}"
    echo -e "${GREEN}Сущность для описания:${RESET} $DOC_TARGET_ENTITY_DECORATOR"
    echo -e "${GREEN}Файл патча:${RESET}            $AIDER_OUTPUT_PATCH"
    echo -e "${GREEN}Список файлов CLI:${RESET}     $CLEANED_FILES"
    echo -e "${GREEN}Промпт RU:${RESET}             $TASK_RU"
    echo -e "${GREEN}Промпт EN:${RESET}             $TASK_EN"
    echo -e "${BLUE}=========================================================================${RESET}"
    echo -e "${GREEN}[Успех] Тест Dry-Run для документации пройден. Реальный вызов заблокирован.${RESET}"
    exit 0
fi

# 6. Подготовка рабочего дерева Git перед мульти-генерацией
echo -e "${YELLOW}[Сборщик] Снимок Git: Сбрасываем старые незакоммиченные диффы...${RESET}"
git checkout -- . &>/dev/null
git clean -fd &>/dev/null

# Трансформируем список файлов в цепочку индивидуальных CLI флагов --file
AIDER_FILES_ARGS=""
for file in $CLEANED_FILES; do
    AIDER_FILES_ARGS="$AIDER_FILES_ARGS --file $file"
done

# ==========================================
# СЕССИЯ №1: Русская документация
# ==========================================
echo -e "${YELLOW}[Сборщик: Шаг 1/2] Запуск Aider для РУССКОЙ локализации (${FILE_PATH_RU})...${RESET}"

HTTP_PROXY="" HTTPS_PROXY="" ALL_PROXY="" http_proxy="" https_proxy="" all_proxy="" \
OLLAMA_API_BASE="$AIDER_OLLAMA_API_BASE" \
uv run --python 3.12 --with aider-chat aider \
    --model "$AIDER_MODEL" \
    --edit-format whole \
    --map-tokens 0 \
    --test-cmd "npx yarn test" \
    $AIDER_READ_INSTRUCTIONS_FLAG \
    "$AIDER_COMMIT_FLAG" \
    --yes-always \
    --no-show-release-notes \
    --message "$TASK_RU" \
    $AIDER_FILES_ARGS

if [ $? -ne 0 ]; then
    echo -e "${RED}[Ошибка] Сбой во время генерации русской документации.${RESET}"
    git reset --hard HEAD &>/dev/null; git clean -fd &>/dev/null; exit 1
fi

# ==========================================
# СЕССИЯ №2: Английская документация
# ==========================================
echo -e "\n${YELLOW}[Сборщик: Шаг 2/2] Запуск Aider для АНГЛИЙСКОЙ локализации (${FILE_PATH_EN})...${RESET}"

HTTP_PROXY="" HTTPS_PROXY="" ALL_PROXY="" http_proxy="" https_proxy="" all_proxy="" \
OLLAMA_API_BASE="$AIDER_OLLAMA_API_BASE" \
uv run --python 3.12 --with aider-chat aider \
    --model "$AIDER_MODEL" \
    --edit-format whole \
    --map-tokens 0 \
    --test-cmd "npx yarn test" \
    $AIDER_READ_INSTRUCTIONS_FLAG \
    "$AIDER_COMMIT_FLAG" \
    --yes-always \
    --no-show-release-notes \
    --message "$TASK_EN" \
    $AIDER_FILES_ARGS

if [ $? -ne 0 ]; then
    echo -e "${RED}[Ошибка] Сбой во время генерации английской документации.${RESET}"
    git reset --hard HEAD &>/dev/null; git clean -fd &>/dev/null; exit 1
fi

# ==========================================
# СБОРКА ЕДИНОГО АРТЕФАКТА ПАТЧА
# ==========================================
echo -e "\n${YELLOW}[Сборщик] Обе локализации успешно сформированы. Сборка патча...${RESET}"
git add -A &>/dev/null
git diff --staged > "$AIDER_OUTPUT_PATCH"

if [ -s "$AIDER_OUTPUT_PATCH" ]; then
    echo -e "${GREEN}[УСПЕХ] Мульти-язычный патч-файл успешно сформирован:${RESET}"
    echo -e "        ${GREEN}$PWD/$AIDER_OUTPUT_PATCH${RESET}"

    # Очищаем рабочую директорию, так как изменения теперь упакованы в patch
    git reset --hard HEAD &>/dev/null
    git clean -fd &>/dev/null
else
    echo -e "${RED}[Ошибка] Финальный дифф пуст. Модель не внесла изменений в markdown файлы.${RESET}"
    git reset --hard HEAD &>/dev/null; git clean -fd &>/dev/null; exit 1
fi
