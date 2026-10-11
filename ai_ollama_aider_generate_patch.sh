#!/bin/bash

# --- ЦВЕТА ДЛЯ ЛОГИРОВАНИЯ ---
GREEN='\033[32m'
BLUE='\033[34m'
YELLOW='\033[33m'
RED='\033[31m'
RESET='\033[0m'

ENV_FILE=".env.development"
DRY_RUN=false

# 1. ОБРАБОТКА ФЛАГОВ КОМАНДНОЙ СТРОКИ
if [ "$1" == "--dry-run" ]; then
    DRY_RUN=true
    echo -e "${YELLOW}[DRY-RUN] Включен режим тестового прогона. Шаги генерации будут симулированы!${RESET}\n"
fi

# 2. Запуск внешней изолированной проверки окружения
if [ -f "./ai_ollama_aider_preflight_check.sh" ]; then
    chmod +x ./ai_ollama_aider_preflight_check.sh
    ./ai_ollama_aider_preflight_check.sh
    if [ $? -ne 0 ]; then
        exit 1
    fi
else
    echo -e "${RED}[Ошибка] Скрипт ai_ollama_aider_preflight_check.sh не найден!${RESET}"
    exit 1
fi

# 3. Загрузка параметров конфигурации
source "$ENV_FILE"

# Трансформируем список файлов (меняем запятые на пробелы)
CLEANED_FILES=$(echo "$AIDER_FILES" | sed 's/[[:space:]]*,[[:space:]]*/,/g' | tr ',' ' ')

# Экспортируем все конфигурационные параметры напрямую в окружение Aider
export OLLAMA_API_BASE="$AIDER_OLLAMA_API_BASE"
export AIDER_MODEL="$AIDER_MODEL"
export AIDER_CHAT_MODE="$AIDER_CHAT_MODE"
export AIDER_MAP_TOKENS="$AIDER_MAP_TOKENS"

# Формируем динамический флаг коммитов
AIDER_COMMIT_FLAG="--auto-commits"
if [ "$AIDER_DISABLE_AUTO_COMMITS" = "true" ]; then
    AIDER_COMMIT_FLAG="--no-auto-commits"
fi

# Проверяем файл глобальных инструкций, если он задан
AIDER_READ_INSTRUCTIONS_FLAG=""
if [ -f ".aider.instructions.md" ]; then
    AIDER_READ_INSTRUCTIONS_FLAG="--read .aider.instructions.md"
fi

# 4. Валидация существования базовых файлов
for file in $CLEANED_FILES; do
    if [ ! -f "$file" ]; then
        if [ "$DRY_RUN" = true ]; then
            echo -e "${YELLOW}[DRY-RUN] Симуляция: Файл контекста на диске отсутствует: $file${RESET}"
        else
            echo -e "${YELLOW}[Пайплайн] Создаем пустую заглушку для файла контекста: $file...${RESET}"
            mkdir -p "$(dirname "$file")"
            touch "$file"
        fi
    fi
done

# 5. ОБРАБОТКА РЕЖИМА ХОЛОСТОГО ПРОГОНА
if [ "$DRY_RUN" = true ]; then
    echo -e "\n${BLUE}======================= ОТЛАДОЧНЫЙ СНИМОК DRY-RUN =======================${RESET}"
    echo -e "${GREEN}Модель (API_BASE):${RESET}  $AIDER_OLLAMA_API_BASE"
    echo -e "${GREEN}Модель (модель):${RESET}    $AIDER_MODEL"
    echo -e "${GREEN}Режим чата (Mode):${RESET}  $AIDER_CHAT_MODE"
    echo -e "${GREEN}Токены карты (Map):${RESET}  $AIDER_MAP_TOKENS"
    echo -e "${GREEN}Файл инструкций:${RESET}    ${AIDER_READ_INSTRUCTIONS_FLAG:-Отсутствует}"
    echo -e "${GREEN}Флаг коммитов:${RESET}      $AIDER_COMMIT_FLAG"
    echo -e "${GREEN}Итоговый патч:${RESET}      $AIDER_OUTPUT_PATCH"
    echo -e "${GREEN}Список файлов:${RESET}      $CLEANED_FILES"
    echo -e "${GREEN}Финальный промпт:${RESET}    $AIDER_TASK"
    echo -e "${BLUE}=========================================================================${RESET}"
    echo -e "${GREEN}[Успех] Тест Dry-Run пройден. Параметры валидны. Реальный вызов заблокирован.${RESET}"
    exit 0
fi

# 6. Подготовка рабочего дерева Git
echo -e "${YELLOW}[Пайплайн] Снимок Git: Сбрасываем старые незакоммиченные диффы...${RESET}"
git checkout -- . &>/dev/null
git clean -fd &>/dev/null

# Трансформируем список файлов в цепочку индивидуальных CLI флагов --file
AIDER_FILES_ARGS=""
for file in $CLEANED_FILES; do
    AIDER_FILES_ARGS="$AIDER_FILES_ARGS --file $file"
done

echo -e "${YELLOW}[Пайплайн] Запуск ИИ-агента Aider в неинтерактивном TDD-режиме...${RESET}"

# 7. Финальный вызов с исправленным флагом --test-cmd
HTTP_PROXY="" HTTPS_PROXY="" ALL_PROXY="" http_proxy="" https_proxy="" all_proxy="" \
uv run --python 3.12 --with aider-chat aider \
    --model "$AIDER_MODEL" \
    --openai-api-base "$AIDER_OLLAMA_API_BASE" \
    --edit-format whole \
    --map-tokens 0 \
    --test-cmd "npx yarn test" \
    $AIDER_READ_INSTRUCTIONS_FLAG \
    "$AIDER_COMMIT_FLAG" \
    --yes-always \
    --no-show-release-notes \
    --message "$AIDER_TASK" \
    $AIDER_FILES_ARGS

if [ $? -eq 0 ]; then
    echo -e "\n${YELLOW}[Пайплайн] Изменения успешно внесены ИИ-агентом.${RESET}"
    echo -e "${YELLOW}[Пайплайн] Фиксируем все созданные новые файлы в индекс Git...${RESET}"

    git add -A &>/dev/null

    echo -e "${YELLOW}[Пайплайн] Сборка артефакта патча силами локального Git...${RESET}"

    git diff --staged > "$AIDER_OUTPUT_PATCH"

    if [ -s "$AIDER_OUTPUT_PATCH" ]; then
        echo -e "${GREEN}[УСПЕХ] Индустриальный патч-файл успешно сформирован:${RESET}"
        echo -e "        ${GREEN}$PWD/$AIDER_OUTPUT_PATCH${RESET}"

        git reset --hard HEAD &>/dev/null
        git clean -fd &>/dev/null
    else
        echo -e "${RED}[Ошибка] Финальный дифф пуст. Модель не записала блоки изменений.${RESET}"
        git reset --hard HEAD &>/dev/null
        git clean -fd &>/dev/null
        exit 1
    fi
else
    echo -e "${RED}[Ошибка] Сбой критического узла ИИ-конвейера Aider.${RESET}"
    git reset --hard HEAD &>/dev/null
    git clean -fd &>/dev/null
    exit 1
fi
