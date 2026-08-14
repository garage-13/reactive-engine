#!/bin/bash

# Останавливать выполнение при любой ошибке
set -e

# Проверяем, что передано как минимум 2 аргумента (КУДА и хотя бы один файл ЧТО)
if [ "$#" -lt 2 ]; then
    echo "ERROR: Invalid number of arguments." >&2
    echo "Usage: $0 <target_dir> <source_file_1> [<source_file_2> ...]" >&2
    exit 1
fi

# 1. Извлекаем первый аргумент — КУДА
TARGET_DIR="$1"
shift # Сдвигаем аргументы влево, теперь в $@ остались только файлы ЧТО

echo "--> Copying UMD artifacts to documentation bundle..."

# 2. Проверяем, что целевая папка сборки существует
if [ ! -d "$TARGET_DIR" ]; then
    echo "ERROR: Target directory does not exist: $TARGET_DIR" >&2
    exit 1
fi

# 3. Итерируемся по оставшимся аргументам (файлам)
for SRC_FILE in "$@"; do
    # Проверяем физическое наличие каждого файла перед копированием
    if [ ! -f "$SRC_FILE" ]; then
        echo "ERROR: Source file missing: $SRC_FILE" >&2
        exit 1
    fi

    # Копируем файл в целевую директорию
    cp "$SRC_FILE" "$TARGET_DIR/"
    echo "✅ Successfully copied $(basename "$SRC_FILE") to $TARGET_DIR/"
done

echo "🎉 All artifacts successfully copied to $TARGET_DIR/"
