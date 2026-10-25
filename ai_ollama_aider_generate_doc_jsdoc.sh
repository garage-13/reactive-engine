#!/bin/bash

# --- ЦВЕТА ДЛЯ ЛОГИРОВАНИЯ ---
GREEN='\033[32m'
BLUE='\033[34m'
YELLOW='\033[33m'
RED='\033[31m'
RESET='\033[0m'

ENV_FILE=".env.doc.jsdoc"
DRY_RUN=false

echo -e "${BLUE}[JSDoc Конвейер] Запуск специализированного инжектора комментариев...${RESET}"

# 1. ОБРАБОТКА ФЛАГОВ КОМАНДНОЙ СТРОКИ
if [ "$1" == "--dry-run" ]; then
    DRY_RUN=true
    echo -e "${YELLOW}[DRY-RUN] Включен режим тестового прогона. Модификация кода будет симулирована!${RESET}\n"
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

if [ -z "$JSDOC_TARGET_METHOD" ]; then
    echo -e "${RED}[Ошибка] Переменная JSDOC_TARGET_METHOD в $ENV_FILE не задана!${RESET}"
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

# Проверяем файл глобальных JSDoc-инструкций
AIDER_READ_INSTRUCTIONS_FLAG=""
if [ -f ".aider.instructions.jsdoc.md" ]; then
    AIDER_READ_INSTRUCTIONS_FLAG="--read .aider.instructions.jsdoc.md"
fi

# 4. Валидация существования базовых файлов
for file in $CLEANED_FILES; do
    if [ ! -f "$file" ]; then
        echo -e "${RED}[Ошибка] Критический файл контекста отсутствует на диске: $file${RESET}"
        exit 1
    fi
done

# Динамическое формирование ТАСК-задачи для внедрения JSDoc
TASK_JSDOC="Integrate comprehensive, multi-line JSDoc comments for the '${JSDOC_TARGET_METHOD}' method inside the provided source files. Follow the style constraints from .aider.instructions.jsdoc.md strictly. Analyze 'src/core/types.ts' to correctly document generic parameters, interfaces like ResourceOptions, ResourceState, and Resource properties. Detail how the method interacts with the reactive graph (edges registration, dependency tracking, suppression of race conditions). Do not change any working code logic, generate only JSDoc injection blocks."

# 5. ОБРАБОТКА РЕЖИМА ХОЛОСТОГО ПРОГОНА
if [ "$DRY_RUN" = true ]; then
    echo -e "\n${BLUE}======================= ОТЛАДОЧНЫЙ СНИМОК JSDOC DRY-RUN ======================="${RESET}
    echo -e "${GREEN}Метод для описания:${RESET}   $JSDOC_TARGET_METHOD"
    echo -e "${GREEN}Файл патча:${RESET}           $AIDER_OUTPUT_PATCH"
    echo -e "${GREEN}Модель (API_BASE):${RESET}    $AIDER_OLLAMA_API_BASE"
    echo -e "${GREEN}Список файлов CLI:${RESET}     $CLEANED_FILES"
    echo -e "${GREEN}Финальный промпт:${RESET}     $TASK_JSDOC"
    echo -e "${BLUE}=========================================================================${RESET}"
    echo -e "${GREEN}[Успех] Тест Dry-Run для JSDoc пройден. Реальный вызов заблокирован.${RESET}"
    exit 0
fi

# 6. Подготовка рабочего дерева Git перед инъекцией
echo -e "${YELLOW}[JSDoc Пайплайн] Снимок Git: Сбрасываем старые незакоммиченные диффы...${RESET}"
git checkout -- . &>/dev/null
git clean -fd &>/dev/null

# Трансформируем список файлов в цепочку индивидуальных CLI флагов --file
AIDER_FILES_ARGS=""
for file in $CLEANED_FILES; do
    AIDER_FILES_ARGS="$AIDER_FILES_ARGS --file $file"
done

echo -e "${YELLOW}[JSDoc Пайплайн] Запуск ИИ-агента Aider в неинтерактивном TDD-режиме...${RESET}"

# 7. Запуск одношаговой сессии Aider для модификации кода
# Отключаем системные прокси, чтобы предотвратить сбои сетевых сокетов локальной Ollama
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
    --message "$TASK_JSDOC" \
    $AIDER_FILES_ARGS

# 8. ОБРАБОТКА РЕЗУЛЬТАТОВ ГЕНЕРАЦИИ И СБОРКА ПАТЧА
if [ $? -eq 0 ]; then
    echo -e "\n${YELLOW}[JSDoc Пайплайн] Изменения успешно внесены ИИ-агентом в исходный код.${RESET}"
    echo -e "${YELLOW}[JSDoc Пайплайн] Фиксируем обновленные файлы в индекс Git...${RESET}"

    # Добавляем все модифицированные файлы в стейджинг для корректного диффа
    git add -A &>/dev/null

    echo -e "${YELLOW}[JSDoc Пайплайн] Сборка артефакта патча силами локального Git...${RESET}"

    # Выгружаем дифф из стейджинга в указанный файл патча
    git diff --staged > "$AIDER_OUTPUT_PATCH"
    if [ -s "$AIDER_OUTPUT_PATCH" ]; then
        echo -e "${GREEN}[УСПЕХ] JSDoc патч-файл успешно сформирован:${RESET}"
        echo -e "        ${GREEN}$PWD/$AIDER_OUTPUT_PATCH${RESET}"

        # Очищаем рабочее дерево, оставляя изменения только внутри файла патча
        git reset --hard HEAD &>/dev/null
        git clean -fd &>/dev/null
    else
        echo -e "${RED}[Ошибка] Финальный дифф пуст. Модель не внесла JSDoc-блоки в код.${RESET}"
        git reset --hard HEAD &>/dev/null
        git clean -fd &>/dev/null
        exit 1
    fi
else
    echo -e "${RED}[Ошибка] Сбой критического узла ИИ-конвейера Aider при генерации JSDoc.${RESET}"
    git reset --hard HEAD &>/dev/null
    git clean -fd &>/dev/null
    exit 1
fi
