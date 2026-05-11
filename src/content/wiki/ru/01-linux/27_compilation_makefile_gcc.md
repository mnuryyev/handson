---
title: "Компиляция, Makefile, gcc флаги"
date: "2026-05-11"
---

Компиляция - это процесс превращения исходного кода на C/C++ в исполняемый файл. GCC (GNU Compiler Collection) - стандартный компилятор в Linux. Makefile - система сборки, которая автоматизирует компиляцию и управление зависимостями.

---

## Стадии компиляции

Компиляция проходит 4 этапа. Понимание каждого помогает в отладке и оптимизации.

    # Полный цикл за одну команду
    gcc main.c -o main

    # Разбитый по стадиям
    gcc -E main.c -o main.i      # 1. Препроцессинг
    gcc -S main.i -o main.s      # 2. Компиляция в ассемблер
    gcc -c main.s -o main.o      # 3. Ассемблирование в объектный файл
    gcc main.o -o main           # 4. Линковка в исполняемый файл

### 1. Препроцессинг (-E)

Раскрывает макросы, `#include`, `#define`, `#ifdef`. Результат - чистый C-код.

    // main.c
    #include <stdio.h>
    #define MAX 100

    int main() {
        printf("Max: %d\n", MAX);
        return 0;
    }

    gcc -E main.c -o main.i      # посмотреть результат
    cat main.i                   # тысячи строк - всё что включено из stdio.h

### 2. Компиляция в ассемблер (-S)

Превращает C-код в ассемблерный текст (`.s` файл).

    gcc -S main.c                # создаёт main.s
    cat main.s                   # ассемблерный код для текущей архитектуры

    # Для разных архитектур
    gcc -S -m32 main.c           # 32-битный ассемблер
    gcc -S -march=armv8-a main.c # ARMv8 ассемблер (кросс-компиляция)

### 3. Ассемблирование (-c)

Создаёт объектный файл (`.o`) - машинный код без разрешённых внешних символов.

    gcc -c main.c -o main.o      # создаёт объектный файл
    file main.o                  # ELF 64-bit LSB relocatable ...
    nm main.o                    # показывает символы: U printf, T main
    objdump -d main.o            # дизассемблировать

### 4. Линковка

Собирает объектные файлы и библиотеки в финальный исполняемый файл.

    gcc main.o utils.o -o program         # несколько объектников
    gcc main.o -lm -o program             # с библиотекой math
    gcc main.o -L./lib -lmylib -o program # со своей библиотекой

---

## Основные флаги gcc

### Флаги вывода

    gcc main.c -o output         # задать имя выходного файла
    gcc -c main.c                # только компилировать, не линковать (создаёт main.o)
    gcc -S main.c                # остановиться на ассемблере (создаёт main.s)
    gcc -E main.c                # только препроцессинг (stdout)
    gcc -pipe main.c -o main     # использовать пайпы вместо временных файлов

### Стандарты языка

    gcc -std=c89 main.c -o main  # C89 / C90 - ANSI C
    gcc -std=c99 main.c -o main  # C99 - массивы переменной длины, //комментарии
    gcc -std=c11 main.c -o main  # C11 - атомарность, threads
    gcc -std=c17 main.c -o main  # C17 - актуальный стандарт (bug fixes)
    gcc -std=c23 main.c -o main  # C23 - новейший стандарт

    gcc -std=c++11 main.cpp -o main  # C++11 - lambda, auto, move semantics
    gcc -std=c++14 main.cpp -o main  # C++14
    gcc -std=c++17 main.cpp -o main  # C++17 - структурированные привязки
    gcc -std=c++20 main.cpp -o main  # C++20 - concepts, coroutines, modules
    gcc -std=c++23 main.cpp -o main  # C++23

    # GNU расширения (по умолчанию)
    gcc -std=gnu17 main.c -o main    # C17 + GNU расширения
    gcc -std=gnu++17 main.cpp -o main

### Предупреждения (Warnings)

    gcc -Wall main.c -o main          # все стандартные предупреждения
    gcc -Wextra main.c -o main        # дополнительные предупреждения
    gcc -Wpedantic main.c -o main     # строгое соответствие стандарту
    gcc -Werror main.c -o main        # превратить предупреждения в ошибки
    gcc -Wshadow main.c -o main       # предупреждать о затенении переменных
    gcc -Wformat=2 main.c -o main     # строгая проверка printf/scanf форматов
    gcc -Wconversion main.c -o main   # предупреждать о неявных конверсиях типов
    gcc -Wnull-dereference main.c     # разыменование nullptr
    gcc -Wdouble-promotion main.c     # float -> double неявно
    gcc -Wundef main.c -o main        # undefined макросы в #if

    # Рекомендуемый набор для продакшна
    gcc -Wall -Wextra -Wpedantic -Werror -Wshadow -Wformat=2 main.c -o main

    # Отключить конкретное предупреждение
    gcc -Wall -Wno-unused-variable main.c -o main

### Оптимизация

    gcc -O0 main.c -o main       # без оптимизации (по умолчанию) - быстрая компиляция
    gcc -O1 main.c -o main       # базовая оптимизация
    gcc -O2 main.c -o main       # рекомендуемый баланс скорости и размера
    gcc -O3 main.c -o main       # агрессивная оптимизация (может быть медленнее O2)
    gcc -Os main.c -o main       # оптимизация размера (для embedded)
    gcc -Oz main.c -o main       # максимально маленький размер (clang)
    gcc -Og main.c -o main       # оптимизация для отладки (сохраняет дебаг-инфо)
    gcc -Ofast main.c -o main    # O3 + нарушение стандартов IEEE floating point

    # Примеры конкретных оптимизаций (включаются через -O2/-O3)
    gcc -finline-functions main.c          # инлайнинг функций
    gcc -funroll-loops main.c              # разворачивание циклов
    gcc -fomit-frame-pointer main.c        # убрать frame pointer (больше регистров)
    gcc -fvectorize main.c                 # авто-векторизация (SIMD)

### Отладка

    gcc -g main.c -o main        # отладочная информация (DWARF)
    gcc -g0 main.c -o main       # без отладочной информации
    gcc -g1 main.c -o main       # минимальная (только имена функций)
    gcc -g2 main.c -o main       # стандартная (то же что -g)
    gcc -g3 main.c -o main       # максимальная (включая макросы)
    gcc -ggdb main.c -o main     # специфично для GDB, лучший опыт отладки
    gcc -gdwarf-4 main.c -o main # явно задать формат DWARF

    # Нельзя одновременно -O3 и -g? Можно, но debug-инфо будет неточной
    gcc -O2 -g main.c -o main    # рабочий компромисс

### Включение заголовков и библиотек

    gcc -I./include main.c -o main            # добавить директорию для поиска .h
    gcc -I/usr/local/include main.c -o main   # системная директория
    gcc -isystem /opt/lib/include main.c      # системные заголовки (меньше варнингов)

    gcc -L./lib main.c -o main                # директория для поиска библиотек
    gcc -L/usr/local/lib main.c -o main
    gcc -l pthread main.c -o main             # линковать libpthread
    gcc -lm main.c -o main                    # libm (math)
    gcc -lssl -lcrypto main.c -o main         # OpenSSL

    # pkg-config - автоматически получить флаги для библиотеки
    gcc main.c $(pkg-config --cflags --libs openssl) -o main
    gcc main.c $(pkg-config --cflags --libs gtk4) -o main

### Макросы через командную строку

    gcc -DDEBUG main.c -o main               # определить макрос DEBUG
    gcc -DVERSION=2 main.c -o main           # определить с значением
    gcc -DMAX_SIZE=1024 main.c -o main
    gcc -UDEBUG main.c -o main               # отменить определение макроса

    // Использование в коде
    #ifdef DEBUG
        printf("debug: value = %d\n", x);
    #endif

### Архитектура и платформа

    gcc -m32 main.c -o main            # собрать 32-битный бинарь
    gcc -m64 main.c -o main            # 64-битный (по умолчанию на x86_64)
    gcc -march=native main.c -o main   # оптимизировать для текущего CPU
    gcc -march=x86-64 main.c -o main   # базовый x86-64
    gcc -march=armv8-a main.c -o main  # ARM64
    gcc -mtune=native main.c -o main   # расписание инструкций под текущий CPU

    # SIMD расширения
    gcc -msse4.2 main.c -o main        # SSE4.2
    gcc -mavx2 main.c -o main          # AVX2
    gcc -mfpu=neon main.c -o main      # ARM NEON

### Санитайзеры (для поиска багов)

    # AddressSanitizer - утечки памяти, out-of-bounds, use-after-free
    gcc -fsanitize=address -g main.c -o main
    ./main    # будет подробный отчёт при ошибке

    # UndefinedBehaviorSanitizer - UB в C
    gcc -fsanitize=undefined -g main.c -o main

    # ThreadSanitizer - гонки данных
    gcc -fsanitize=thread -g main.c -o main

    # LeakSanitizer - только утечки памяти
    gcc -fsanitize=leak -g main.c -o main

    # Комбо для разработки
    gcc -fsanitize=address,undefined -g -O1 main.c -o main

### Прочие полезные флаги

    gcc -v main.c -o main              # подробный вывод о каждом шаге
    gcc -### main.c -o main            # показать команды без выполнения
    gcc -save-temps main.c -o main     # сохранить .i .s .o файлы
    gcc -fPIC main.c -c -o main.o      # Position Independent Code (для .so)
    gcc -shared main.o -o libmain.so   # создать динамическую библиотеку
    gcc -static main.c -o main         # статическая линковка (без .so зависимостей)
    gcc -fstack-protector-strong main.c # защита стека (canary)
    gcc -D_FORTIFY_SOURCE=2 -O2 main.c # hardening для libc функций

---

## Несколько файлов

### Компиляция по частям

    // utils.h
    int add(int a, int b);
    void print_result(int result);

    // utils.c
    #include <stdio.h>
    #include "utils.h"

    int add(int a, int b) { return a + b; }
    void print_result(int result) { printf("Result: %d\n", result); }

    // main.c
    #include "utils.h"

    int main() {
        print_result(add(3, 4));
        return 0;
    }

    # Компиляция
    gcc -c utils.c -o utils.o
    gcc -c main.c -o main.o
    gcc utils.o main.o -o program

    # Или за один шаг
    gcc utils.c main.c -o program

### Библиотеки

    # Статическая библиотека (.a)
    gcc -c utils.c -o utils.o
    ar rcs libutils.a utils.o           # создать архив
    gcc main.c -L. -lutils -o program   # слинковать

    # Динамическая библиотека (.so)
    gcc -fPIC -c utils.c -o utils.o
    gcc -shared utils.o -o libutils.so
    gcc main.c -L. -lutils -o program

    # Запуск с динамической библиотекой
    export LD_LIBRARY_PATH=.:$LD_LIBRARY_PATH
    ./program

    # Или прописать rpath
    gcc main.c -L. -lutils -Wl,-rpath,'$ORIGIN' -o program

---

## Makefile - основы

Makefile автоматизирует сборку: отслеживает изменения, пересобирает только то, что нужно.

### Структура правила

    target: dependencies
    [TAB] command
    [TAB] command

Важно: отступ перед командой - **только TAB**, не пробелы.

### Минимальный Makefile

    program: main.o utils.o
    	gcc main.o utils.o -o program

    main.o: main.c utils.h
    	gcc -c main.c -o main.o

    utils.o: utils.c utils.h
    	gcc -c utils.c -o utils.o

    clean:
    	rm -f *.o program

    # Запуск
    make           # собрать (первая цель = default)
    make program   # явно указать цель
    make clean     # очистить

### Переменные

    CC = gcc                                      # компилятор
    CXX = g++                                     # C++ компилятор
    CFLAGS = -Wall -Wextra -std=c17 -O2           # флаги компилятора
    CXXFLAGS = -Wall -Wextra -std=c++17 -O2       # C++ флаги
    LDFLAGS = -lm -lpthread                       # флаги линковщика
    TARGET = program
    SRCS = main.c utils.c parser.c
    OBJS = $(SRCS:.c=.o)                          # заменить .c на .o

    $(TARGET): $(OBJS)
    	$(CC) $(OBJS) $(LDFLAGS) -o $(TARGET)

    %.o: %.c
    	$(CC) $(CFLAGS) -c $< -o $@

    clean:
    	rm -f $(OBJS) $(TARGET)

### Автоматические переменные

    $@    # имя цели (target)
    $<    # первая зависимость
    $^    # все зависимости
    $?    # зависимости новее цели
    $*    # имя без суффикса (stem в pattern rules)
    $(@D) # директория цели
    $(@F) # файловое имя цели (без директории)

    # Пример использования
    main.o: main.c utils.h
    	$(CC) $(CFLAGS) -c $< -o $@
    #                        ^    ^
    #                        |    +-- $@ = main.o
    #                        +------- $< = main.c

### Специальные цели (.PHONY)

Phony targets - цели без файлов. Без `.PHONY` make проверит, существует ли файл с таким именем.

    .PHONY: all clean install test run

    all: $(TARGET)

    clean:
    	rm -f $(OBJS) $(TARGET)

    install: $(TARGET)
    	cp $(TARGET) /usr/local/bin/

    test: $(TARGET)
    	./$(TARGET) --test

    run: $(TARGET)
    	./$(TARGET)

### Полный шаблонный Makefile

    # ============================================
    # Makefile - универсальный шаблон
    # ============================================

    CC      = gcc
    CXX     = g++
    CFLAGS  = -Wall -Wextra -Wpedantic -std=c17 -O2
    LDFLAGS =
    LIBS    = -lm

    TARGET  = program
    SRC_DIR = src
    OBJ_DIR = obj
    INC_DIR = include

    SRCS = $(wildcard $(SRC_DIR)/*.c)
    OBJS = $(patsubst $(SRC_DIR)/%.c, $(OBJ_DIR)/%.o, $(SRCS))

    # ============================================
    # Цели
    # ============================================

    .PHONY: all clean debug release install

    all: $(TARGET)

    # Линковка
    $(TARGET): $(OBJS)
    	$(CC) $^ $(LDFLAGS) $(LIBS) -o $@
    	@echo "Build successful: $@"

    # Компиляция объектников
    $(OBJ_DIR)/%.o: $(SRC_DIR)/%.c | $(OBJ_DIR)
    	$(CC) $(CFLAGS) -I$(INC_DIR) -c $< -o $@

    # Создать obj/ если нет
    $(OBJ_DIR):
    	mkdir -p $(OBJ_DIR)

    clean:
    	rm -rf $(OBJ_DIR) $(TARGET)
    	@echo "Cleaned"

    debug: CFLAGS += -g -DDEBUG -O0 -fsanitize=address,undefined
    debug: LDFLAGS += -fsanitize=address,undefined
    debug: all

    release: CFLAGS += -O3 -DNDEBUG -march=native
    release: all

    install: $(TARGET)
    	install -m 755 $(TARGET) /usr/local/bin/

---

## Makefile - продвинутые техники

### Автоматические зависимости (.d файлы)

Проблема: изменил `.h` - make не знает, что надо пересобирать `.c`. Решение - генерировать файлы зависимостей.

    CC      = gcc
    CFLAGS  = -Wall -std=c17 -O2
    DEPFLAGS = -MMD -MP              # генерировать .d файлы
    TARGET  = program
    SRCS    = main.c utils.c
    OBJS    = $(SRCS:.c=.o)
    DEPS    = $(SRCS:.c=.d)

    $(TARGET): $(OBJS)
    	$(CC) $^ -o $@

    %.o: %.c
    	$(CC) $(CFLAGS) $(DEPFLAGS) -c $< -o $@

    -include $(DEPS)                  # включить .d файлы (- означает игнорить если нет)

    .PHONY: clean
    clean:
    	rm -f $(OBJS) $(DEPS) $(TARGET)

### Условия в Makefile

    # Переменная окружения
    DEBUG ?= 0           # значение по умолчанию если не задана

    ifeq ($(DEBUG), 1)
    	CFLAGS += -g -O0 -DDEBUG
    else
    	CFLAGS += -O2 -DNDEBUG
    endif

    # Определить платформу
    UNAME := $(shell uname)

    ifeq ($(UNAME), Linux)
    	LIBS += -lpthread
    endif
    ifeq ($(UNAME), Darwin)
    	CC = clang
    	LIBS += -framework CoreFoundation
    endif

    # Запуск
    make DEBUG=1       # дебаг-сборка
    make               # релиз-сборка

### Рекурсивные Makefile (для больших проектов)

    # Корневой Makefile
    SUBDIRS = lib src tests

    .PHONY: all $(SUBDIRS) clean

    all: $(SUBDIRS)

    $(SUBDIRS):
    	$(MAKE) -C $@

    clean:
    	for dir in $(SUBDIRS); do $(MAKE) -C $$dir clean; done

### Полезные функции make

    # wildcard - найти файлы по паттерну
    SRCS = $(wildcard src/*.c)
    HDRS = $(wildcard include/*.h)

    # patsubst - замена в списке
    OBJS = $(patsubst src/%.c, obj/%.o, $(SRCS))

    # subst - простая замена строк
    NEW = $(subst .c,.o,$(SRCS))

    # filter - фильтрация списка
    C_SRCS   = $(filter %.c, $(ALL_SRCS))
    CPP_SRCS = $(filter %.cpp, $(ALL_SRCS))

    # dir, notdir, basename, suffix
    $(dir src/main.c)        # -> src/
    $(notdir src/main.c)     # -> main.c
    $(basename src/main.c)   # -> src/main
    $(suffix src/main.c)     # -> .c

    # shell - выполнить команду
    GIT_HASH := $(shell git rev-parse --short HEAD)
    BUILD_DATE := $(shell date +%Y-%m-%d)

    CFLAGS += -DGIT_HASH=\"$(GIT_HASH)\"
    CFLAGS += -DBUILD_DATE=\"$(BUILD_DATE)\"

### Тихий режим и @echo

    # @ перед командой - не выводить саму команду, только результат
    build: $(TARGET)
    	@echo "Linking..."
    	@$(CC) $^ -o $@
    	@echo "Done: $@"

    # Запуск без вывода команд
    make -s        # silent mode (все команды тихие)
    make --quiet

---

## Примеры реальных проектов

### Проект на C с тестами

    CC      = gcc
    CFLAGS  = -Wall -Wextra -std=c17 -Iinclude
    SRCS    = $(wildcard src/*.c)
    OBJS    = $(SRCS:src/%.c=obj/%.o)
    TARGET  = bin/program

    TEST_SRCS = $(wildcard tests/*.c)
    TEST_OBJS = $(TEST_SRCS:tests/%.c=obj/test_%.o)
    TEST_BIN  = bin/test_runner

    .PHONY: all test clean valgrind

    all: $(TARGET)

    $(TARGET): $(OBJS) | bin
    	$(CC) $^ -o $@

    obj/%.o: src/%.c | obj
    	$(CC) $(CFLAGS) -MMD -MP -c $< -o $@

    # Тесты (линкуем с объектниками без main.o)
    $(TEST_BIN): $(filter-out obj/main.o, $(OBJS)) $(TEST_OBJS) | bin
    	$(CC) $(CFLAGS) $^ -o $@

    obj/test_%.o: tests/%.c | obj
    	$(CC) $(CFLAGS) -c $< -o $@

    test: $(TEST_BIN)
    	./$(TEST_BIN)

    valgrind: $(TARGET)
    	valgrind --leak-check=full --track-origins=yes ./$(TARGET)

    bin obj:
    	mkdir -p $@

    clean:
    	rm -rf obj bin

    -include $(wildcard obj/*.d)

### Проект на C++ с Sanitizers

    CXX      = g++
    CXXFLAGS = -Wall -Wextra -std=c++17 -Iinclude

    TARGET = program
    SRCS   = $(wildcard src/*.cpp)
    OBJS   = $(SRCS:src/%.cpp=obj/%.o)

    .PHONY: all debug asan ubsan clean

    all: CXXFLAGS += -O2 -DNDEBUG
    all: $(TARGET)

    debug: CXXFLAGS += -g -O0 -DDEBUG
    debug: $(TARGET)

    asan: CXXFLAGS += -g -O1 -fsanitize=address,undefined
    asan: LDFLAGS  += -fsanitize=address,undefined
    asan: $(TARGET)

    ubsan: CXXFLAGS += -g -O1 -fsanitize=undefined
    ubsan: LDFLAGS  += -fsanitize=undefined
    ubsan: $(TARGET)

    $(TARGET): $(OBJS)
    	$(CXX) $^ $(LDFLAGS) -o $@

    obj/%.o: src/%.cpp | obj
    	$(CXX) $(CXXFLAGS) -MMD -MP -c $< -o $@

    obj:
    	mkdir -p obj

    clean:
    	rm -rf obj $(TARGET)

    -include $(wildcard obj/*.d)

---

## Отладка сборки

    # Посмотреть что делает make (без выполнения)
    make -n                 # dry run
    make --just-print       # то же самое

    # Подробный вывод
    make VERBOSE=1
    make V=1

    # Отладка Makefile
    make -d                 # debug: всё о принятых решениях
    make -p                 # распечатать базу данных make (все переменные, правила)
    make -p | grep "^CC"    # найти значение переменной CC

    # Параллельная сборка
    make -j4                # 4 параллельных задания
    make -j$(nproc)         # столько сколько ядер процессора

    # Посмотреть зависимости файла
    gcc -MM main.c          # вывести зависимости для Makefile
    gcc -M main.c           # включая системные заголовки

---

## Инструменты экосистемы

### nm - символы в объектных файлах

    nm program              # все символы
    nm -u program           # только undefined (внешние)
    nm -D program           # динамические символы
    nm --demangle program    # C++ деманглинг

    # Типы символов в nm
    # T - функция в .text (код)
    # D - глобальная переменная в .data
    # B - неинициализированная переменная (.bss)
    # U - undefined (нужна из другого .o или .so)
    # t, d, b - то же самое, но локальные (static)

### objdump - дизассемблер

    objdump -d program            # дизассемблировать .text
    objdump -D program            # дизассемблировать всё
    objdump -s program            # hex dump всех секций
    objdump -x program            # все заголовки
    objdump -t program            # таблица символов
    objdump -R program            # таблица релокаций

    # Только одна функция
    objdump -d program | grep -A 20 "<main>:"

### ldd - динамические зависимости

    ldd program                   # список .so библиотек
    ldd -v program                # подробно
    ldd /usr/bin/ls               # для системных утилит

    # Если библиотека не найдена
    export LD_LIBRARY_PATH=/path/to/lib:$LD_LIBRARY_PATH
    ldconfig -p | grep libname    # найти библиотеку в системе

### readelf - информация об ELF файле

    readelf -h program            # ELF заголовок
    readelf -S program            # секции (.text, .data, .bss...)
    readelf -l program            # программные сегменты
    readelf -s program            # таблица символов
    readelf -d program            # динамические теги (.so зависимости)
    readelf -r program            # таблица релокаций

### size - размер секций

    size program                  # text, data, bss размеры
    size -A program               # подробно по всем секциям

### strip - убрать отладочные символы

    strip program                 # убрать всё лишнее (уменьшает размер)
    strip --strip-debug program   # убрать только debug символы
    strip --strip-unneeded program

---

## Шпаргалка

    # Базовые команды
    gcc main.c -o main                   # собрать
    gcc -c main.c -o main.o              # только компилировать
    gcc main.o utils.o -o program        # только линковать

    # Флаги разработки (рекомендуемые)
    gcc -Wall -Wextra -Wpedantic -std=c17 -g -O0 main.c -o main

    # Флаги продакшна
    gcc -Wall -Werror -std=c17 -O2 -march=native main.c -o main

    # С asan (разработка)
    gcc -Wall -std=c17 -g -O1 -fsanitize=address,undefined main.c -o main

    # Включить заголовки и библиотеки
    gcc -I./include -L./lib -lmylib main.c -o main

    # make команды
    make              # сборка (первая цель)
    make clean        # очистить
    make -j$(nproc)   # параллельная сборка
    make debug        # если есть такая цель
    make -n           # dry run

    # Анализ бинаря
    nm program              # символы
    ldd program             # .so зависимости
    objdump -d program      # дизассемблер
    readelf -S program      # секции ELF
    size program            # размер секций
    file program            # тип файла

---

## Ссылки

- [GCC Manual](https://gcc.gnu.org/onlinedocs/gcc/) - официальная документация
- [GNU Make Manual](https://www.gnu.org/software/make/manual/) - документация make
- [GCC Optimization Options](https://gcc.gnu.org/onlinedocs/gcc/Optimize-Options.html) - все флаги оптимизации
- [GCC Warning Options](https://gcc.gnu.org/onlinedocs/gcc/Warning-Options.html) - все предупреждения
- [Compiler Explorer](https://godbolt.org/) - смотреть ассемблер онлайн
- [AddressSanitizer](https://clang.llvm.org/docs/AddressSanitizer.html) - документация asan
