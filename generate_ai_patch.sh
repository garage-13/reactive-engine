#!/bin/bash

# --- ЦВЕТА ДЛЯ ЛОГИРОВАНИЯ ---
GREEN='\033[32m'
BLUE='\033[34m'
YELLOW='\033[33m'
RED='\033[31m'
RESET='\033[0m'

ENV_FILE=".env.development"

echo -e "${BLUE}=== ЗАПУСК АВТОНОМНОГО ИИ-ГЕНЕРАТОРА ПАТЧЕЙ ===${RESET}"

# 1. Проверяем и загружаем конфигурацию .env.development
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}[Ошибка] Файл конфигурации $ENV_FILE не найден!${RESET}"
    exit 1
fi

echo -e "${YELLOW}[Конфиг] Загружаем переменные из $ENV_FILE...${RESET}"
export $(grep -v '^#' "$ENV_FILE" | xargs)

# 🔄 ПРЕОБРАЗОВАНИЕ ЗАПЯТЫХ В ПРОБЕЛЫ ДЛЯ BASH
# Удаляем лишние пробелы вокруг запятых, а затем заменяем запятые на пробелы
CLEANED_FILES=$(echo "$AIDER_FILES" | sed 's/[[:space:]]*,[[:space:]]*/,/g' | tr ',' ' ')

# Переменные окружения для локальной Ollama
export OLLAMA_API_BASE="http://127.0.0.1:11434"
export AIDER_MODEL="ollama/qwen2.5-coder-long"

# 2. Валидация окружения и параметров
if ! curl -s http://127.0.0 > /dev/null; then
    echo -e "${RED}[Ошибка] Локальный сервер Ollama не запущен! Запустите модель в другой вкладке.${RESET}"
    exit 1
fi

if [ -z "$AIDER_FILES" ] || [ -z "$AIDER_OUTPUT_PATCH" ] || [ -z "$AIDER_TASK" ]; then
    echo -e "${RED}[Ошибка] В файле $ENV_FILE отсутствуют обязательные переменные.${RESET}"
    exit 1
fi

# Проверяем существование каждого файла из очищенного списка
for file in $CLEANED_FILES; do
    if [ ! -f "$file" ]; then
        echo -e "${RED}[Ошибка] Целевой файл \"$file\" из переменной AIDER_FILES не найден на диске!${RESET}"
        exit 1
    fi
done

# 3. Подготовка репозитория
echo -e "${YELLOW}[Пайплайн] Сбрасываем старые изменения в целевых файлах Git...${RESET}"
git checkout -- $CLEANED_FILES &>/dev/null

echo -e "${YELLOW}[Пайплайн] Инициализация Aider. Анализ графа вызовов проекта...${RESET}"

# 4. Фоновый запуск ИИ-агента без открытия интерактивного чата
# Передаем очищенную строку файлов — они раскроются как отдельные аргументы для Aider
uv run --python 3.12 --with aider-chat aider \
    --model "$AIDER_MODEL" \
    --edit-format diff \
    --no-auto-commits \
    --message "$AIDER_TASK" \
    $CLEANED_FILES

if [ $? -eq 0 ]; then
    echo -e "\n${YELLOW}[Пайплайн] Изменения успешно внесены в код на диске.${RESET}"
    echo -e "${YELLOW}[Пайплайн] Генерируем легитимный патч силами локального Git...${RESET}"
    
    # Выгружаем дифф строго для тех файлов, которые были указаны в массиве
    git diff $CLEANED_FILES > "$AIDER_OUTPUT_PATCH"
    
    if [ -s "$AIDER_OUTPUT_PATCH" ]; then
        echo -e "${GREEN}[УСПЕХ] Кристально чистый патч успешно создан и сохранен:${RESET}"
        echo -e "        ${GREEN}$PWD/$AIDER_OUTPUT_PATCH${RESET}"
        
        # СБРОС КОДА: Возвращаем файлы проекта в исходное чистое состояние
        git checkout -- $CLEANED_FILES &>/dev/null
    else
        echo -e "${RED}[Ошибка] Патч-файл $AIDER_OUTPUT_PATCH оказался пустым.${RESET}"
        exit 1
    fi
else
    echo -e "${RED}[Ошибка] Сбой во время работы ИИ-агента Aider.${RESET}"
    exit 1
fi
