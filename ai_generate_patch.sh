#!/bin/bash

# --- ЦВЕТА ДЛЯ ЛОГИРОВАНИЯ ---
GREEN='\033[32m'
BLUE='\033[34m'
YELLOW='\033[33m'
RED='\033[31m'
RESET='\033[0m'

ENV_FILE=".env.development"

# 1. Запуск внешней изолированной проверки окружения
if [ -f "./ai_preflight_check.sh" ]; then
    chmod +x ./ai_preflight_check.sh
    ./ai_preflight_check.sh
    if [ $? -ne 0 ]; then
        exit 1
    fi
else
    echo -e "${RED}[Ошибка] Скрипт ai_preflight_check.sh не найден в текущей папке!${RESET}"
    exit 1
fi

# 2. Загрузка параметров конфигурации
export $(grep -v '^#' "$ENV_FILE" | xargs)

# Трансформируем список файлов (удаляем пробелы, меняем запятые на пробелы для Git/Aider)
CLEANED_FILES=$(echo "$AIDER_FILES" | sed 's/[[:space:]]*,[[:space:]]*/,/g' | tr ',' ' ')

# Конфигурируем прокси-переменные для Aider API на основе данных из .env
export OLLAMA_API_BASE="$AIDER_OLLAMA_API_BASE"
export AIDER_MODEL="$AIDER_MODEL"

# Формируем динамический флаг коммитов на основе конфига
AIDER_COMMIT_FLAG="--auto-commits"
if [ "$AIDER_DISABLE_AUTO_COMMITS" = true ]; then
    AIDER_COMMIT_FLAG="--no-auto-commits"
fi

# 3. Валидация существования файлов на диске
for file in $CLEANED_FILES; do
    if [ ! -f "$file" ]; then
        echo -e "${RED}[Ошибка] Файл \"$file\", указанный в $ENV_FILE, отсутствует на диске!${RESET}"
        exit 1
    fi
done

# 4. Подготовка рабочего дерева Git
echo -e "${YELLOW}[Пайплайн] Снимок Git: Сбрасываем старые диффы в целевых файлах...${RESET}"
git checkout -- $CLEANED_FILES &>/dev/null

echo -e "${YELLOW}[Пайплайн] Запуск ИИ-агента Aider в неинтерактивном режиме...${RESET}"

# 5. Вызов Aider через менеджер uv со стабильным Python 3.12
uv run --python 3.12 --with aider-chat aider \
    --model "$AIDER_MODEL" \
    --edit-format "$AIDER_EDIT_FORMAT" \
    "$AIDER_COMMIT_FLAG" \
    --message "$AIDER_TASK" \
    $CLEANED_FILES

if [ $? -eq 0 ]; then
    echo -e "\n${YELLOW}[Пайплайн] Изменения успешно внесены ИИ-агентом.${RESET}"
    echo -e "${YELLOW}[Пайплайн] Сборка артефакта патча силами локального Git...${RESET}"
    
    # Генерируем каноничный патч с реальными хэшами
    git diff $CLEANED_FILES > "$AIDER_OUTPUT_PATCH"
    
    if [ -s "$AIDER_OUTPUT_PATCH" ]; then
        echo -e "${GREEN}[УСПЕХ] Индустриальный патч-файл успешно сформирован:${RESET}"
        echo -e "        ${GREEN}$PWD/$AIDER_OUTPUT_PATCH${RESET}"
        
        # Зачищаем рабочую директорию, оставляя изменения только внутри файла патча
        git checkout -- $CLEANED_FILES &>/dev/null
    else
        echo -e "${RED}[Ошибка] Финальный дифф пуст. Модель не зафиксировала изменений кода.${RESET}"
        exit 1
    fi
else
    echo -e "${RED}[Ошибка] Сбой критического узла ИИ-конвейера Aider.${RESET}"
    exit 1
fi
