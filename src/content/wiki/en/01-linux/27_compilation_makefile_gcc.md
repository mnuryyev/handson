---
title: "Compilation, Makefile, gcc flags"
date: "2026-05-11"
---

Compilation is the process of turning C/C++ source code into an executable file. GCC (GNU Compiler Collection) is the standard compiler on Linux. Makefile is a build system that automates compilation and dependency management.

---

## Compilation stages

Compilation goes through 4 stages. Understanding each helps with debugging and optimization.

    # Full cycle in one command
    gcc main.c -o main

    # Split into stages
    gcc -E main.c -o main.i      # 1. Preprocessing
    gcc -S main.i -o main.s      # 2. Compile to assembly
    gcc -c main.s -o main.o      # 3. Assemble to object file
    gcc main.o -o main           # 4. Link into executable

### 1. Preprocessing (-E)

Expands macros, `#include`, `#define`, `#ifdef`. Output is plain C code.

    // main.c
    #include <stdio.h>
    #define MAX 100

    int main() {
        printf("Max: %d\n", MAX);
        return 0;
    }

    gcc -E main.c -o main.i      # inspect the result
    cat main.i                   # thousands of lines - everything from stdio.h

### 2. Compile to assembly (-S)

Transforms C code into assembly text (`.s` file).

    gcc -S main.c                # creates main.s
    cat main.s                   # assembly for current architecture

    # Different architectures
    gcc -S -m32 main.c           # 32-bit assembly
    gcc -S -march=armv8-a main.c # ARMv8 assembly (cross-compilation)

### 3. Assembling (-c)

Produces an object file (`.o`) - machine code without resolved external symbols.

    gcc -c main.c -o main.o      # create object file
    file main.o                  # ELF 64-bit LSB relocatable ...
    nm main.o                    # symbols: U printf, T main
    objdump -d main.o            # disassemble

### 4. Linking

Combines object files and libraries into the final executable.

    gcc main.o utils.o -o program         # multiple objects
    gcc main.o -lm -o program             # with math library
    gcc main.o -L./lib -lmylib -o program # with a local library

---

## Main gcc flags

### Output flags

    gcc main.c -o output         # set output file name
    gcc -c main.c                # compile only, don't link (creates main.o)
    gcc -S main.c                # stop at assembly (creates main.s)
    gcc -E main.c                # preprocessing only (stdout)
    gcc -pipe main.c -o main     # use pipes instead of temp files

### Language standards

    gcc -std=c89 main.c -o main  # C89 / C90 - ANSI C
    gcc -std=c99 main.c -o main  # C99 - VLAs, // comments
    gcc -std=c11 main.c -o main  # C11 - atomics, threads
    gcc -std=c17 main.c -o main  # C17 - current standard (bug fixes)
    gcc -std=c23 main.c -o main  # C23 - latest standard

    gcc -std=c++11 main.cpp -o main  # C++11 - lambda, auto, move semantics
    gcc -std=c++14 main.cpp -o main  # C++14
    gcc -std=c++17 main.cpp -o main  # C++17 - structured bindings
    gcc -std=c++20 main.cpp -o main  # C++20 - concepts, coroutines, modules
    gcc -std=c++23 main.cpp -o main  # C++23

    # GNU extensions (default behavior)
    gcc -std=gnu17 main.c -o main    # C17 + GNU extensions
    gcc -std=gnu++17 main.cpp -o main

### Warnings

    gcc -Wall main.c -o main          # all standard warnings
    gcc -Wextra main.c -o main        # extra warnings
    gcc -Wpedantic main.c -o main     # strict standard conformance
    gcc -Werror main.c -o main        # turn warnings into errors
    gcc -Wshadow main.c -o main       # warn about variable shadowing
    gcc -Wformat=2 main.c -o main     # strict printf/scanf format checks
    gcc -Wconversion main.c -o main   # warn on implicit type conversions
    gcc -Wnull-dereference main.c     # null pointer dereference
    gcc -Wdouble-promotion main.c     # implicit float -> double promotion
    gcc -Wundef main.c -o main        # undefined macros in #if

    # Recommended set for production
    gcc -Wall -Wextra -Wpedantic -Werror -Wshadow -Wformat=2 main.c -o main

    # Disable a specific warning
    gcc -Wall -Wno-unused-variable main.c -o main

### Optimization

    gcc -O0 main.c -o main       # no optimization (default) - fast compilation
    gcc -O1 main.c -o main       # basic optimization
    gcc -O2 main.c -o main       # recommended balance of speed and size
    gcc -O3 main.c -o main       # aggressive optimization (may be slower than O2)
    gcc -Os main.c -o main       # optimize for size (embedded systems)
    gcc -Oz main.c -o main       # smallest possible size (clang)
    gcc -Og main.c -o main       # optimize for debugging (keeps debug info)
    gcc -Ofast main.c -o main    # O3 + violates IEEE floating point standards

    # Specific optimizations (enabled by -O2/-O3)
    gcc -finline-functions main.c      # function inlining
    gcc -funroll-loops main.c          # loop unrolling
    gcc -fomit-frame-pointer main.c    # drop frame pointer (more registers)
    gcc -fvectorize main.c             # auto-vectorization (SIMD)

### Debugging

    gcc -g main.c -o main        # debug info (DWARF)
    gcc -g0 main.c -o main       # no debug info
    gcc -g1 main.c -o main       # minimal (function names only)
    gcc -g2 main.c -o main       # standard (same as -g)
    gcc -g3 main.c -o main       # maximum (includes macros)
    gcc -ggdb main.c -o main     # GDB-specific, best debug experience
    gcc -gdwarf-4 main.c -o main # explicitly set DWARF format

    # -O3 and -g together? Works, but debug info will be inaccurate
    gcc -O2 -g main.c -o main    # practical compromise

### Headers and libraries

    gcc -I./include main.c -o main            # add header search directory
    gcc -I/usr/local/include main.c -o main   # system directory
    gcc -isystem /opt/lib/include main.c      # system headers (fewer warnings)

    gcc -L./lib main.c -o main                # add library search directory
    gcc -L/usr/local/lib main.c -o main
    gcc -lpthread main.c -o main              # link libpthread
    gcc -lm main.c -o main                    # libm (math)
    gcc -lssl -lcrypto main.c -o main         # OpenSSL

    # pkg-config - automatically get flags for a library
    gcc main.c $(pkg-config --cflags --libs openssl) -o main
    gcc main.c $(pkg-config --cflags --libs gtk4) -o main

### Macros from command line

    gcc -DDEBUG main.c -o main               # define DEBUG macro
    gcc -DVERSION=2 main.c -o main           # define with value
    gcc -DMAX_SIZE=1024 main.c -o main
    gcc -UDEBUG main.c -o main               # undefine macro

    // Usage in code
    #ifdef DEBUG
        printf("debug: value = %d\n", x);
    #endif

### Architecture and platform

    gcc -m32 main.c -o main            # build 32-bit binary
    gcc -m64 main.c -o main            # 64-bit (default on x86_64)
    gcc -march=native main.c -o main   # optimize for current CPU
    gcc -march=x86-64 main.c -o main   # baseline x86-64
    gcc -march=armv8-a main.c -o main  # ARM64
    gcc -mtune=native main.c -o main   # instruction scheduling for current CPU

    # SIMD extensions
    gcc -msse4.2 main.c -o main        # SSE4.2
    gcc -mavx2 main.c -o main          # AVX2
    gcc -mfpu=neon main.c -o main      # ARM NEON

### Sanitizers (for bug detection)

    # AddressSanitizer - memory leaks, out-of-bounds, use-after-free
    gcc -fsanitize=address -g main.c -o main
    ./main    # detailed report on memory errors

    # UndefinedBehaviorSanitizer - UB in C
    gcc -fsanitize=undefined -g main.c -o main

    # ThreadSanitizer - data races
    gcc -fsanitize=thread -g main.c -o main

    # LeakSanitizer - memory leaks only
    gcc -fsanitize=leak -g main.c -o main

    # Combo for development
    gcc -fsanitize=address,undefined -g -O1 main.c -o main

### Other useful flags

    gcc -v main.c -o main              # verbose output of each step
    gcc -### main.c -o main            # show commands without executing
    gcc -save-temps main.c -o main     # keep .i .s .o files
    gcc -fPIC main.c -c -o main.o      # Position Independent Code (for .so)
    gcc -shared main.o -o libmain.so   # create shared library
    gcc -static main.c -o main         # static linking (no .so dependencies)
    gcc -fstack-protector-strong main.c # stack canary protection
    gcc -D_FORTIFY_SOURCE=2 -O2 main.c # hardening for libc functions

---

## Multiple files

### Compiling in parts

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

    # Compile
    gcc -c utils.c -o utils.o
    gcc -c main.c -o main.o
    gcc utils.o main.o -o program

    # Or in one shot
    gcc utils.c main.c -o program

### Libraries

    # Static library (.a)
    gcc -c utils.c -o utils.o
    ar rcs libutils.a utils.o           # create archive
    gcc main.c -L. -lutils -o program   # link it

    # Shared library (.so)
    gcc -fPIC -c utils.c -o utils.o
    gcc -shared utils.o -o libutils.so
    gcc main.c -L. -lutils -o program

    # Running with a shared library
    export LD_LIBRARY_PATH=.:$LD_LIBRARY_PATH
    ./program

    # Or embed rpath
    gcc main.c -L. -lutils -Wl,-rpath,'$ORIGIN' -o program

---

## Makefile - basics

Makefile automates the build process: tracks changes and only recompiles what is necessary.

### Rule structure

    target: dependencies
    [TAB] command
    [TAB] command

Important: indentation before a command must be a **TAB character**, not spaces.

### Minimal Makefile

    program: main.o utils.o
    	gcc main.o utils.o -o program

    main.o: main.c utils.h
    	gcc -c main.c -o main.o

    utils.o: utils.c utils.h
    	gcc -c utils.c -o utils.o

    clean:
    	rm -f *.o program

    # Usage
    make           # build (first target = default)
    make program   # explicit target
    make clean     # clean up

### Variables

    CC = gcc                                      # compiler
    CXX = g++                                     # C++ compiler
    CFLAGS = -Wall -Wextra -std=c17 -O2           # compiler flags
    CXXFLAGS = -Wall -Wextra -std=c++17 -O2       # C++ flags
    LDFLAGS = -lm -lpthread                       # linker flags
    TARGET = program
    SRCS = main.c utils.c parser.c
    OBJS = $(SRCS:.c=.o)                          # replace .c with .o

    $(TARGET): $(OBJS)
    	$(CC) $(OBJS) $(LDFLAGS) -o $(TARGET)

    %.o: %.c
    	$(CC) $(CFLAGS) -c $< -o $@

    clean:
    	rm -f $(OBJS) $(TARGET)

### Automatic variables

    $@    # target name
    $<    # first dependency
    $^    # all dependencies
    $?    # dependencies newer than target
    $*    # stem in pattern rules (name without suffix)
    $(@D) # directory part of target
    $(@F) # file name part of target (without directory)

    # Usage example
    main.o: main.c utils.h
    	$(CC) $(CFLAGS) -c $< -o $@
    #                        ^    ^
    #                        |    +-- $@ = main.o
    #                        +------- $< = main.c

### Phony targets (.PHONY)

Phony targets have no corresponding files. Without `.PHONY`, make checks if a file with that name exists.

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

### Full template Makefile

    # ============================================
    # Makefile - universal template
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
    # Targets
    # ============================================

    .PHONY: all clean debug release install

    all: $(TARGET)

    # Link
    $(TARGET): $(OBJS)
    	$(CC) $^ $(LDFLAGS) $(LIBS) -o $@
    	@echo "Build successful: $@"

    # Compile object files
    $(OBJ_DIR)/%.o: $(SRC_DIR)/%.c | $(OBJ_DIR)
    	$(CC) $(CFLAGS) -I$(INC_DIR) -c $< -o $@

    # Create obj/ if missing
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

## Makefile - advanced techniques

### Automatic dependencies (.d files)

Problem: you modify a `.h` file and make doesn't know to recompile `.c` files. Solution - generate dependency files.

    CC      = gcc
    CFLAGS  = -Wall -std=c17 -O2
    DEPFLAGS = -MMD -MP              # generate .d files
    TARGET  = program
    SRCS    = main.c utils.c
    OBJS    = $(SRCS:.c=.o)
    DEPS    = $(SRCS:.c=.d)

    $(TARGET): $(OBJS)
    	$(CC) $^ -o $@

    %.o: %.c
    	$(CC) $(CFLAGS) $(DEPFLAGS) -c $< -o $@

    -include $(DEPS)                  # include .d files (- means ignore if missing)

    .PHONY: clean
    clean:
    	rm -f $(OBJS) $(DEPS) $(TARGET)

### Conditionals in Makefile

    # Environment variable with default
    DEBUG ?= 0

    ifeq ($(DEBUG), 1)
    	CFLAGS += -g -O0 -DDEBUG
    else
    	CFLAGS += -O2 -DNDEBUG
    endif

    # Detect platform
    UNAME := $(shell uname)

    ifeq ($(UNAME), Linux)
    	LIBS += -lpthread
    endif
    ifeq ($(UNAME), Darwin)
    	CC = clang
    	LIBS += -framework CoreFoundation
    endif

    # Usage
    make DEBUG=1       # debug build
    make               # release build

### Recursive Makefiles (large projects)

    # Root Makefile
    SUBDIRS = lib src tests

    .PHONY: all $(SUBDIRS) clean

    all: $(SUBDIRS)

    $(SUBDIRS):
    	$(MAKE) -C $@

    clean:
    	for dir in $(SUBDIRS); do $(MAKE) -C $$dir clean; done

### Useful make functions

    # wildcard - find files by pattern
    SRCS = $(wildcard src/*.c)
    HDRS = $(wildcard include/*.h)

    # patsubst - substitution in a list
    OBJS = $(patsubst src/%.c, obj/%.o, $(SRCS))

    # subst - simple string replacement
    NEW = $(subst .c,.o,$(SRCS))

    # filter - filter a list
    C_SRCS   = $(filter %.c, $(ALL_SRCS))
    CPP_SRCS = $(filter %.cpp, $(ALL_SRCS))

    # dir, notdir, basename, suffix
    $(dir src/main.c)        # -> src/
    $(notdir src/main.c)     # -> main.c
    $(basename src/main.c)   # -> src/main
    $(suffix src/main.c)     # -> .c

    # shell - execute a command
    GIT_HASH := $(shell git rev-parse --short HEAD)
    BUILD_DATE := $(shell date +%Y-%m-%d)

    CFLAGS += -DGIT_HASH=\"$(GIT_HASH)\"
    CFLAGS += -DBUILD_DATE=\"$(BUILD_DATE)\"

### Silent mode and @echo

    # @ prefix - don't print the command itself, only its output
    build: $(TARGET)
    	@echo "Linking..."
    	@$(CC) $^ -o $@
    	@echo "Done: $@"

    # Run silently
    make -s        # silent mode (all commands quiet)
    make --quiet

---

## Real project examples

### C project with tests

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

    # Tests (link with object files except main.o)
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

### C++ project with sanitizers

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

## Debugging the build

    # See what make would do (without executing)
    make -n                 # dry run
    make --just-print       # same thing

    # Verbose output
    make VERBOSE=1
    make V=1

    # Debug Makefile decisions
    make -d                 # debug: all decisions make makes
    make -p                 # print make database (all variables, rules)
    make -p | grep "^CC"    # find value of variable CC

    # Parallel build
    make -j4                # 4 parallel jobs
    make -j$(nproc)         # one job per CPU core

    # Show dependencies of a file
    gcc -MM main.c          # print Makefile-style dependencies
    gcc -M main.c           # include system headers too

---

## Ecosystem tools

### nm - symbols in object files

    nm program              # all symbols
    nm -u program           # undefined only (external)
    nm -D program           # dynamic symbols
    nm --demangle program    # C++ demangling

    # Symbol types in nm
    # T - function in .text (code)
    # D - global variable in .data
    # B - uninitialized variable (.bss)
    # U - undefined (needed from another .o or .so)
    # t, d, b - same, but local (static)

### objdump - disassembler

    objdump -d program            # disassemble .text
    objdump -D program            # disassemble everything
    objdump -s program            # hex dump of all sections
    objdump -x program            # all headers
    objdump -t program            # symbol table
    objdump -R program            # relocation table

    # Just one function
    objdump -d program | grep -A 20 "<main>:"

### ldd - dynamic dependencies

    ldd program                   # list .so libraries
    ldd -v program                # verbose
    ldd /usr/bin/ls               # for system utilities

    # If library not found
    export LD_LIBRARY_PATH=/path/to/lib:$LD_LIBRARY_PATH
    ldconfig -p | grep libname    # find library in system

### readelf - ELF file info

    readelf -h program            # ELF header
    readelf -S program            # sections (.text, .data, .bss...)
    readelf -l program            # program segments
    readelf -s program            # symbol table
    readelf -d program            # dynamic tags (.so deps)
    readelf -r program            # relocation table

### size - section sizes

    size program                  # text, data, bss sizes
    size -A program               # detailed, all sections

### strip - remove debug symbols

    strip program                 # remove everything unnecessary (reduces size)
    strip --strip-debug program   # only strip debug symbols
    strip --strip-unneeded program

---

## Cheat sheet

    # Basic commands
    gcc main.c -o main                   # build
    gcc -c main.c -o main.o              # compile only
    gcc main.o utils.o -o program        # link only

    # Development flags (recommended)
    gcc -Wall -Wextra -Wpedantic -std=c17 -g -O0 main.c -o main

    # Production flags
    gcc -Wall -Werror -std=c17 -O2 -march=native main.c -o main

    # With asan (development)
    gcc -Wall -std=c17 -g -O1 -fsanitize=address,undefined main.c -o main

    # Headers and libraries
    gcc -I./include -L./lib -lmylib main.c -o main

    # make commands
    make              # build (first target)
    make clean        # clean up
    make -j$(nproc)   # parallel build
    make debug        # if such target exists
    make -n           # dry run

    # Binary analysis
    nm program              # symbols
    ldd program             # .so dependencies
    objdump -d program      # disassemble
    readelf -S program      # ELF sections
    size program            # section sizes
    file program            # file type

---

## References

- [GCC Manual](https://gcc.gnu.org/onlinedocs/gcc/) - official documentation
- [GNU Make Manual](https://www.gnu.org/software/make/manual/) - make documentation
- [GCC Optimization Options](https://gcc.gnu.org/onlinedocs/gcc/Optimize-Options.html) - all optimization flags
- [GCC Warning Options](https://gcc.gnu.org/onlinedocs/gcc/Warning-Options.html) - all warnings
- [Compiler Explorer](https://godbolt.org/) - view assembly output online
- [AddressSanitizer](https://clang.llvm.org/docs/AddressSanitizer.html) - asan documentation
