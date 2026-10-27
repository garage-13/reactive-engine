#!/bin/bash

# --- ЦВЕТА ДЛЯ ЛОГИРОВАНИЯ ---
GREEN='\033[32m'
BLUE='\033[34m'
YELLOW='\033[33m'
RED='\033[31m'
RESET='\033[0m'

ENV_FILE=".env.doc.framework.adapter"
INSTRUCTIONS_FILE=".aider.instructions.framework.adapter.md"
DRY_RUN=false

echo -e "${BLUE}[Адаптеры Фреймворков] Запуск специализированного генератора документации...${RESET}"

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

# 3. Загрузка параметров конфигурации
source "$ENV_FILE"

if [ -z "$DOC_TARGET_FRAMEWORK_ADAPTER" ]; then
    echo -e "${RED}[Ошибка] Переменная DOC_TARGET_FRAMEWORK_ADAPTER в $ENV_FILE не задана!${RESET}"
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
if [ -f "$INSTRUCTIONS_FILE" ]; then
    AIDER_READ_INSTRUCTIONS_FLAG="--read $INSTRUCTIONS_FILE"
fi

# Динамические пути для SSR документов (если задан фреймворк)
GENERATE_SSR=false
if [ -n "$SSR_BASED_ON" ]; then
    GENERATE_SSR=true
    FILE_PATH_SSR_RU="docs/${DOC_TARGET_FRAMEWORK_ADAPTER}/ssr-${SSR_BASED_ON}.md"
    FILE_PATH_SSR_EN="docs/en/${DOC_TARGET_FRAMEWORK_ADAPTER}/ssr-${SSR_BASED_ON}.md"
fi

# 4. Валидация существования базовых файлов и создание заглушек
ALL_OUTPUT_FILES=""
if [ "$GENERATE_SSR" = true ]; then
    ALL_OUTPUT_FILES="$ALL_OUTPUT_FILES $FILE_PATH_SSR_RU $FILE_PATH_SSR_EN"
fi

for file in $CLEANED_FILES $ALL_OUTPUT_FILES; do
    if [ ! -f "$file" ]; then
        if [ "$DRY_RUN" = true ]; then
            echo -e "${YELLOW}[DRY-RUN] Симуляция: Файл отсутствует на диске: $file${RESET}"
        else
            echo -e "${YELLOW}[Сборщик] Создаем заглушку для файла: $file...${RESET}"
            mkdir -p "$(dirname "$file")"
            touch "$file"
        fi
    fi
done

if [ "$GENERATE_SSR" = true ]; then
    TASK_SSR_RU="[LANGUAGE: RUSSIAN] Write a comprehensive Server-Side Rendering (SSR) integration guide for '${DOC_TARGET_FRAMEWORK_ADAPTER}' based on '${SSR_BASED_ON}' framework into '${FILE_PATH_SSR_RU}'. Follow style guidelines from $INSTRUCTIONS_FILE strictly in Russian language. Explain how untrack blocks and store snapshot isolation prevent memory leaks and hydration mismatches on server environment. Show strict TypeScript examples."
    TASK_SSR_EN="[LANGUAGE: ENGLISH] Write a comprehensive Server-Side Rendering (SSR) integration guide for '${DOC_TARGET_FRAMEWORK_ADAPTER}' based on '${SSR_BASED_ON}' framework into '${FILE_PATH_SSR_EN}'. Follow style guidelines from $INSTRUCTIONS_FILE strictly in English language. Explain how untrack blocks and store snapshot isolation prevent memory leaks and hydration mismatches on server environment. Show strict TypeScript examples."
fi

# =========================================================================
# 4.5. ВЫЗОВ ВНЕШНЕГО УНИВЕРСАЛЬНОГО ВАЛИДАТОРА ТОКЕНОВ
# =========================================================================
if [ "$DRY_RUN" = false ]; then
    # Вычисляем общий вес текстовых строк промптов и инструкций
    PROMPTS_WEIGHT=$(( ${#TASK_QS_RU} + ${#TASK_QS_EN} ))
    if [ "$GENERATE_SSR" = true ]; then
        PROMPTS_WEIGHT=$(( PROMPTS_WEIGHT + ${#TASK_SSR_RU} + ${#TASK_SSR_EN} ))
    fi
    if [ -f "$INSTRUCTIONS_FILE" ]; then
        INSTR_SIZE=$(wc -c < "$INSTRUCTIONS_FILE")
        PROMPTS_WEIGHT=$(( PROMPTS_WEIGHT + INSTR_SIZE ))
    fi

    if [ -f "./ai_ollama_aider_token_limits_check.sh" ]; then
        chmod +x ./ai_ollama_aider_token_limits_check.sh

        # Вызов с именованными параметрами в любом порядке
        ./ai_ollama_aider_token_limits_check.sh \
            --base-url "$AIDER_OLLAMA_API_BASE" \
            --model "$AIDER_MODEL" \
            --prompts-length "$PROMPTS_WEIGHT" \
            --files "$CLEANED_FILES"

        if [ $? -ne 0 ]; then
            exit 1
        fi
    else
        echo -e "${YELLOW}[Предупреждение] Универсальный скрипт валидации токенов не найден. Пропуск...${RESET}"
    fi
fi

# 5. ОБРАБОТКА РЕЖИМА ХОЛОСТОГО ПРОГОНА
if [ "$DRY_RUN" = true ]; then
    echo -e "\n${BLUE}======================= ОТЛАДОЧНЫЙ СНИМОК ADAPTER DRY-RUN =======================${RESET}"
    echo -e "${GREEN}Целевой адаптер:${RESET}       $DOC_TARGET_FRAMEWORK_ADAPTER"
    echo -e "${GREEN}Фреймворк SSR:${RESET}         ${SSR_BASED_ON:-Нет}"
    echo -e "${GREEN}Файл патча:${RESET}            $AIDER_OUTPUT_PATCH"
    echo -e "${GREEN}Список файлов CLI:${RESET}     $CLEANED_FILES"
    if [ "$GENERATE_SSR" = true ]; then
        echo -e "${GREEN}Промпт SSR RU:${RESET}         $TASK_SSR_RU"
        echo -e "${GREEN}Промпт SSR EN:${RESET}         $TASK_SSR_EN"
    fi
    echo -e "${BLUE}=========================================================================${RESET}"
    echo -e "${GREEN}[Успех] Тест Dry-Run пройден. Реальный вызов заблокирован.${RESET}"
    exit 0
fi

# 6. Подготовка рабочего дерева Git перед мульти-генерацией
echo -e "${YELLOW}[Сборщик] Снимок Git: Сбрасываем старые незакоммиченные диффы...${RESET}"
git checkout -- . &>/dev/null
git clean -fd &>/dev/null

# Формируем индивидуальные аргументы --file
AIDER_FILES_ARGS=""
for file in $CLEANED_FILES; do
    AIDER_FILES_ARGS="$AIDER_FILES_ARGS --file $file"
done

# =========================================================================
# СЕССИИ ГЕНЕРАЦИИ (БЕЗОПАСНЫЙ ARCHITECT РЕЖИМ ДЛЯ ЛОКАЛЬНЫХ LLM)
# =========================================================================

if [ "$GENERATE_SSR" = false ]; then
    echo -e "${RED}[Ошибка] Переменная SSR_BASED_ON не задана, а генерация Quick Start отключена.${RESET}"
    exit 1
fi

# Переходим на индустриальный формат architect, исключающий сбои разметки у локальных моделей
AIDER_EDIT_FORMAT="architect"

run_aider_session() {
    local target_file="$1"
    local message="$2"
    local local_args="$AIDER_FILES_ARGS --file $target_file"

    HTTP_PROXY="" HTTPS_PROXY="" ALL_PROXY="" http_proxy="" https_proxy="" all_proxy="" \
    OLLAMA_API_BASE="$AIDER_OLLAMA_API_BASE" \
    uv run --offline --python 3.12 --with aider-chat aider \
        --model "$AIDER_MODEL" \
        --edit-format "$AIDER_EDIT_FORMAT" \
        --auto-accept-architect \
        --map-tokens 0 \
        --test-cmd "npx yarn test" \
        --no-suggest-shell-commands \
        $AIDER_READ_INSTRUCTIONS_FLAG \
        "$AIDER_COMMIT_FLAG" \
        --yes-always \
        --no-show-release-notes \
        --message "$message" \
        $local_args
    return $?
}

# Шаг 1: SSR Документация (RU)
echo -e "${YELLOW}[Конвейер: Шаг 1/2] Формируем руководство SSR для ${SSR_BASED_ON} (RU) -> ${FILE_PATH_SSR_RU}...${RESET}"
run_aider_session "$FILE_PATH_SSR_RU" "$TASK_SSR_RU"
if [ $? -ne 0 ]; then echo -e "${RED}[Ошибка] Сбой на этапе генерации русской версии.${RESET}"; exit 1; fi

# Шаг 2: SSR Документация (EN)
echo -e "\n${YELLOW}[Конвейер: Шаг 2/2] Формируем руководство SSR для ${SSR_BASED_ON} (EN) -> ${FILE_PATH_SSR_EN}...${RESET}"
run_aider_session "$FILE_PATH_SSR_EN" "$TASK_SSR_EN"
if [ $? -ne 0 ]; then echo -e "${RED}[Ошибка] Сбой на этапе генерации английской версии.${RESET}"; exit 1; fi

# ==========================================
# СБОРКА ЕДИНОГО АРТЕФАКТА ПАТЧА
# ==========================================
echo -e "\n${YELLOW}[Сборщик] Обе локализации успешно сформированы. Сборка общего патча...${RESET}"
git add -A &>/dev/null
git diff --staged > "$AIDER_OUTPUT_PATCH"

if [ -s "$AIDER_OUTPUT_PATCH" ]; then
    echo -e "${GREEN}[УСПЕХ] Мульти-язычный патч SSR-адаптеров успешно сформирован:${RESET}"
    echo -e "        ${GREEN}$PWD/$AIDER_OUTPUT_PATCH${RESET}"
    git reset --hard HEAD &>/dev/null
    git clean -fd &>/dev/null
else
    echo -e "${RED}[Ошибка] Финальный дифф пуст. Изменения не зафиксированы.${RESET}"
    git reset --hard HEAD &>/dev/null; git clean -fd &>/dev/null; exit 1
fi
