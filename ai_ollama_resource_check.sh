#!/bin/bash

# Он предназначен для динамического анализа вашей Ubuntu-системы (включая дисковое пространство в кэше Ollama, доступную оперативную память RAM и swap-файл), сопоставления этих данных с весом популярных LLM-моделей и выдачи умных рекомендаций, что именно можно запустить прямо сейчас.

# --- ЦВЕТА ДЛЯ ВЫВОДА ДИАГНОСТИКИ ---
GREEN='\033[32m'
BLUE='\033[34m'
YELLOW='\033[33m'
RED='\033[31m'
RESET='\033[0m'

ENV_FILE=".env.development"

echo -e "${BLUE}=== ЗАПУСК АНАЛИЗАТОРА ЛОКАЛЬНЫХ ИИ-РЕСУРСОВ ===${RESET}\n"

# 1. Загрузка параметров конфигурации (чтобы понимать текущую целевую модель)
CURRENT_MODEL="Не задана"
if [ -f "$ENV_FILE" ]; then
    # Бережно извлекаем модель, очищая от кавычек
    AIDER_MODEL_VAL=$(grep -E "^AIDER_MODEL=" "$ENV_FILE" | cut -d'=' -f2- | tr -d "'\"")
    if [ ! -z "$AIDER_MODEL_VAL" ]; then
        CURRENT_MODEL="$AIDER_MODEL_VAL"
    fi
fi

# 2. АНАЛИЗ ОПЕРАТИВНОЙ ПАМЯТИ (RAM)
# Парсим вывод free в мегабайтах для точности вычислений
TOTAL_RAM_MB=$(free -m | awk '/^Mem:/{print $2}')
AVAILABLE_RAM_MB=$(free -m | awk '/^Mem:/{print $7}')
TOTAL_SWAP_MB=$(free -m | awk '/^Swap:/{print $2}')
USED_SWAP_MB=$(free -m | awk '/^Swap:/{print $3}')

# Переводим в гигабайты для красивого вывода
TOTAL_RAM_GB=$(echo "scale=1; $TOTAL_RAM_MB / 1024" | bc)
AVAILABLE_RAM_GB=$(echo "scale=1; $AVAILABLE_RAM_MB / 1024" | bc)
TOTAL_SWAP_GB=$(echo "scale=1; $TOTAL_SWAP_MB / 1024" | bc)

echo -e "${BLUE}[Статус ОЗУ]:${RESET}"
echo -e "  • Всего физической памяти (RAM): ${GREEN}${TOTAL_RAM_GB} ГБ${RESET}"
echo -e "  • Реально доступно для LLM (Available): ${GREEN}${AVAILABLE_RAM_GB} ГБ${RESET}"
echo -e "  • Файл подкачки (Swap): ${YELLOW}${TOTAL_SWAP_GB} ГБ${RESET} (Занято: ${USED_SWAP_MB} МБ)"

# 3. АНАЛИЗ ДИСКОВОГО ПРОСТРАНСТВА (КЭШ OLLAMA)
# По умолчанию Ollama в Ubuntu хранит модели в /usr/share/ollama/.ollama или в домашней директории ~/.ollama
OLLAMA_DIR="$HOME/.ollama"
if [ -d "/usr/share/ollama/.ollama" ]; then
    OLLAMA_DIR="/usr/share/ollama/.ollama"
fi

# Проверяем свободное место на диске, где смонтирована папка Ollama
DISK_FREE_KB=$(df -k "$OLLAMA_DIR" 2>/dev/null | awk 'NR==2 {print $4}')
if [ -z "$DISK_FREE_KB" ]; then
    # Если папки еще нет, берем корень системы
    DISK_FREE_KB=$(df -k / | awk 'NR==2 {print $4}')
fi
DISK_FREE_GB=$(echo "$DISK_FREE_KB / 1024 / 1024" | bc)

echo -e "\n${BLUE}[Статус Диска]:${RESET}"
echo -e "  • Свободно места для скачивания моделей: ${GREEN}${DISK_FREE_GB} ГБ${RESET} (Директория: $OLLAMA_DIR)"

# 4. МАТРИЦА СОВМЕСТИМОСТИ МОДЕЛЕЙ (Вес на диске / RAM при инференсе)
echo -e "\n${BLUE}=== МАТРИЦА АНАЛИЗА ИИ-МОДЕЛЕЙ ДЛЯ ВАШЕГО СЕТАПА ===${RESET}"

# Функция для вычисления вердикта по модели
analyze_model() {
    local name=$1
    local disk_req=$2
    local ram_req=$3
    local type=$4 # "Standard" или "Reasoning"

    echo -e "\n🤖 ${YELLOW}${name}${RESET} [ Класс: ${type} ]"

    # Проверка диска
    if [ "$DISK_FREE_GB" -lt "$disk_req" ]; then
        echo -e "  ❌ ${RED}Диск:${RESET} Недостаточно места для скачивания. Нужно: ${disk_req} ГБ, доступно: ${DISK_FREE_GB} ГБ."
        return
    else
        echo -e "  ── ${GREEN}Диск:${RESET} Места достаточно (Требуется около ${disk_req} ГБ)."
    fi

    # Проверка RAM
    if [ "$AVAILABLE_RAM_MB" -ge $((ram_req * 1024)) ]; then
        echo -e "  🚀 ${GREEN}RAM: Идеально!${RESET} Запустится в режиме максимальной производительности (Свободно: ${AVAILABLE_RAM_GB} ГБ)."
    elif [ "$TOTAL_RAM_MB" -ge $((ram_req * 1024)) ]; then
        # Памяти в обрез, нужно закрывать приложения
        local shortage=$((ram_req - (AVAILABLE_RAM_MB / 1024)))
        echo -e "  ⚠️ ${YELLOW}RAM: Ограничено!${RESET} Физически помещается, но нужно закрыть тяжелые программы (Браузер, Docker). Освободите еще ~${shortage} ГБ."
    else
        # Памяти физически мало, модель уйдет в Swap
        if [ $((TOTAL_RAM_MB + TOTAL_SWAP_MB)) -ge $((ram_req * 1024)) ]; then
            echo -e "  🐢 ${RED}RAM: Деградация скорости!${RESET} Модель превышает физическую RAM и уйдет в Swap. На CPU Zen 5 инференс сильно замедлится."
        else
            echo -e "  ❌ ${RED}RAM: Критический лимит!${RESET} Не запустится (OOM). Требуется минимум ${ram_req} ГБ оперативной памяти."
        fi
    fi
}

# Запускаем анализ популярных моделей по весам октября 2026 года
analyze_model "qwen2.5-coder:14b" 9 14 "Standard"
analyze_model "deepseek-r1:14b" 9 14 "Reasoning"
analyze_model "qwen3-coder:30b" 19 24 "Standard (MoE)"
analyze_model "deepseek-r1:32b" 20 26 "Reasoning"

# 5. ФИНАЛЬНЫЕ АРХИТЕКТУРНЫЕ РЕКОМЕНДАЦИИ
echo -e "\n${BLUE}======================= РЕЗЮМЕ ТЕХЛИДА =======================${RESET}"
echo -e "Текущая целевая модель в .env: ${YELLOW}${CURRENT_MODEL}${RESET}"

if [ "$AVAILABLE_RAM_MB" -ge 22528 ]; then
    echo -e "${GREEN}[РЕКОМЕНДАЦИЯ]:${RESET} У вас отличный запас свободной памяти (${AVAILABLE_RAM_GB} ГБ). Запускайте тяжелую артиллерию: **deepseek-r1:32b** для рефакторинга архитектуры без any, либо **qwen3-coder:30b** для скоростного переписывания файлов целиком."
elif [ "$AVAILABLE_RAM_MB" -ge 12288 ]; then
    echo -e "${GREEN}[РЕКОМЕНДАЦИЯ]:${RESET} Доступно ${AVAILABLE_RAM_GB} ГБ RAM. Оптимальный выбор прямо сейчас — **deepseek-r1:14b**. Ее встроенный цикл рассуждений <think> идеально вычистит 'any' и комментарии, не перегружая систему. Перед переходом на 32B-модели закройте вкладки Firefox."
else
    echo -e "${YELLOW}[РЕКОМЕНДАЦИЯ]:${RESET} Свободной памяти мало. Продолжайте работу на **qwen2.5-coder:14b** или **deepseek-r1:14b**, но обязательно закройте браузер и сторонний софт, чтобы избежать ухода в жесткий Swap."
fi

# Напоминание про железный апгрейд
if [ "$TOTAL_RAM_MB" -lt 40000 ]; then
    echo -e "${BLUE}[Совет по железу]:${RESET} Обнаружено ${TOTAL_RAM_GB} ГБ общей ОЗУ. При апгрейде до **64 ГБ DDR5 SO-DIMM 5600 МГц** вы сможете запускать deepseek-r1:32b параллельно с открытым браузером и запущенными тестами в фоновом режиме."
fi
echo -e "${BLUE}==============================================================${RESET}"
