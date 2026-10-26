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

if [ -z "$TASK_JSDOC" ]; then
    echo -e "${RED}[Ошибка] Ультимативная задача TASK_JSDOC в $ENV_FILE отсутствует или пуста!${RESET}"
    exit 1
fi

# Устраняем лишние запятые и переносим файлы в массивы POSIX
CLEANED_WRITE=$(echo "$AIDER_WRITE_FILES" | sed 's/[[:space:]]*,[[:space:]]*/,/g' | tr ',' ' ')
CLEANED_READ=$(echo "$AIDER_READ_FILES" | sed 's/[[:space:]]*,[[:space:]]*/,/g' | tr ',' ' ')

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

# 4. Валидация существования файлов (обрабатываем оба списка)
CLEANED_WRITE=$(echo "$AIDER_WRITE_FILES" | sed 's/[[:space:]]*,[[:space:]]*/,/g' | tr ',' ' ')
CLEANED_READ=$(echo "$AIDER_READ_FILES" | sed 's/[[:space:]]*,[[:space:]]*/,/g' | tr ',' ' ')

for file in $CLEANED_WRITE $CLEANED_READ; do
    if [ ! -f "$file" ]; then
        echo -e "${RED}[Ошибка] Критический файл контекста отсутствует на диске: $file${RESET}"
        exit 1
    fi
done

# =========================================================================
# 4.5. ДИНАМИЧЕСКИЙ РАСЧЕТ ТОКЕНОВ И ИНТЕРАКТИВНЫЙ АНАЛИЗ РИСКОВ
# =========================================================================
if [ "$DRY_RUN" = false ]; then
    echo -e "${BLUE}[Валидатор] Анализируем плотность контекста и лимиты модели для JSDoc...${RESET}"

    # 1. Извлекаем чистый заголовок модели для Ollama API (убираем префикс ollama/)
    PURE_MODEL_NAME=$(echo "$AIDER_MODEL" | sed 's|^ollama/||')

    # 2. Запрашиваем инфо о модели у локальной Ollama
    OLLAMA_INFO_URL="${AIDER_OLLAMA_API_BASE:-http://localhost:11434}/api/show"
    MODEL_INFO_JSON=$(curl -s -X POST "$OLLAMA_INFO_URL" -d "{\"name\": \"$PURE_MODEL_NAME\"}")

    # Извлекаем размер контекстного окна (num_ctx). Если пустой, ставим безопасный дефолт 32768
    MODEL_CTX_LIMIT=$(echo "$MODEL_INFO_JSON" | grep -o '"num_ctx":[0-9]*' | head -n1 | cut -d':' -f2)
    if [ -z "$MODEL_CTX_LIMIT" ] || [ "$MODEL_CTX_LIMIT" -eq 0 ]; then
        MODEL_CTX_LIMIT=32768
    fi

    # 3. Считаем суммарный объем контекста (Размер изменяемых файлов + файлов чтения + инструкции + промпт в байтах)
    TOTAL_BYTES=0
    for file in $CLEANED_WRITE $CLEANED_READ; do
        if [ -f "$file" ]; then
            FILE_SIZE=$(wc -c < "$file")
            TOTAL_BYTES=$((TOTAL_BYTES + FILE_SIZE))
        fi
    done

    # Учитываем файл глобальных JSDoc-инструкций, если он задан и существует на диске
    if [ -f ".aider.instructions.jsdoc.md" ]; then
        INSTR_SIZE=$(wc -c < ".aider.instructions.jsdoc.md")
        TOTAL_BYTES=$((TOTAL_BYTES + INSTR_SIZE))
    fi

    # Добавляем длину строки основной JSDoc-задачи (TASK_JSDOC)
    TOTAL_BYTES=$((TOTAL_BYTES + ${#TASK_JSDOC}))

    # Консервативный перевод байтов в токены (для смешанного кода и кириллицы: 1 токен ≈ 3 байта)
    ESTIMATED_TOKENS=$((TOTAL_BYTES / 3))

    # Безопасный порог удержания внимания модели — 70% от num_ctx
    SAFE_THRESHOLD=$((MODEL_CTX_LIMIT * 70 / 100))

    echo -e "  - Выбранная модель: ${GREEN}$PURE_MODEL_NAME${RESET}"
    echo -e "  - Лимит контекста модели (num_ctx): ${GREEN}$MODEL_CTX_LIMIT токенов${RESET}"
    echo -e "  - Ожидаемый вес JSDoc сессии: ~${YELLOW}$ESTIMATED_TOKENS токенов${RESET}"

    if [ "$ESTIMATED_TOKENS" -gt "$SAFE_THRESHOLD" ]; then
        echo -e "\n${RED}[ВНИМАНИЕ / РИСК КОНТЕКСТА] Объем файлов контекста (Write + Read) и промпта слишком велик!${RESET}"
        echo -e "${YELLOW}Модель может потерять фокус, сгенерировать неполные JSDoc-блоки или сломать исходный код.${RESET}"
        echo -e "${YELLOW}Рекомендуется временно сократить список справочных файлов в AIDER_READ_FILES.${RESET}"

        read -p "Вы хотите продолжить инъекцию комментариев на свой страх и риск? (y/N): " CONFIRMATION
        if [[ ! "$CONFIRMATION" =~ ^[Yy]$ ]]; then
            echo -e "${RED}[Отмена] Пайплайн инъекции JSDoc остановлен пользователем для снижения объема контекста.${RESET}"
            exit 1
        fi
        echo -e "${GREEN}[Риск принят] Запуск генерации JSDoc комментариев...${RESET}\n"
    else
        echo -e "${GREEN}[Успех] Контекст JSDoc сессии в безопасной зоне (~$((ESTIMATED_TOKENS * 100 / MODEL_CTX_LIMIT))% от num_ctx).${RESET}\n"
    fi
fi

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

echo -e "\n${BLUE}┌────────────────── РАСПРЕДЕЛЕНИЕ КОНТЕКСТА ИИ ──────────────────┐${RESET}"

# Инициализируем CLI аргументы для ИИ-агента
AIDER_FILES_ARGS=""

# === 1. ОБРАБОТКА ФАЙЛОВ ДЛЯ ЗАПИСИ (MUTABLE) ===
echo -e "${BLUE}│${RESET} ${GREEN}[РЕЖИМ: ЗАПИСЬ / МОДИФИКАЦИЯ]${RESET}"

# Преобразуем очищенную строку в массив bash для точного подсчета индексов
write_array=($CLEANED_WRITE)
write_total=${#write_array[@]}

for i in "${!write_array[@]}"; do
    file="${write_array[$i]}"
    # Если элемент последний в списке — ставим └──, иначе ├──
    if [ $((i + 1)) -eq $write_total ]; then
        echo -e "${BLUE}│${RESET}  └── 📝 $file"
    else
        echo -e "${BLUE}│${RESET}  ├── 📝 $file"
    fi
    AIDER_FILES_ARGS="$AIDER_FILES_ARGS --file $file"
done

echo -e "${BLUE}│${RESET}"

# === 2. ОБРАБОТКА ФАЙЛОВ СТРОГО ДЛЯ ЧТЕНИЯ (READ-ONLY) ===
echo -e "${BLUE}│${RESET} ${YELLOW}[РЕЖИМ: ТОЛЬКО ЧТЕНИЕ / АНАЛИЗ]${RESET}"

read_array=($CLEANED_READ)
read_total=${#read_array[@]}

for i in "${!read_array[@]}"; do
    file="${read_array[$i]}"
    # Если элемент последний в списке — ставим └──, иначе ├──
    if [ $((i + 1)) -eq $read_total ]; then
        echo -e "${BLUE}│${RESET}  └── 🔍 $file"
    else
        echo -e "${BLUE}│${RESET}  ├── 🔍 $file"
    fi
    AIDER_FILES_ARGS="$AIDER_FILES_ARGS --read $file"
done

echo -e "${BLUE}└────────────────────────────────────────────────────────────────┘${RESET}\n"

echo -e "${YELLOW}[JSDoc Пайплайн] Запуск ИИ-агента Aider в неинтерактивном TDD-режиме...${RESET}"

# 7. Финальный вызов ИИ-агента (Переменные прокси сброшены для стабильности Ollama)
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
