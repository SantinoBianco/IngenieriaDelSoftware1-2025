# Makefile
NPM_RUN = npm run
TEST_CMD = $(NPM_RUN) test:coverage
TEST_COMPONENTS = $(TEST_CMD) src/components
TEST_CONTAINERS = $(TEST_CMD) src/containers
TEST_ALL = $(TEST_CMD)

# Colores para output
GREEN = \033[0;32m
BLUE = \033[0;34m
YELLOW = \033[0;33m
RED = \033[0;31m
NC = \033[0m

# Targets principales
.PHONY: all test components containers help clean

# Target por defecto
all: test

# Ejecutar todos los tests con coverage
test:
	@echo "$(BLUE)🧪 Ejecutando todos los tests con coverage...$(NC)"
	@$(TEST_ALL)

# componentes
components:
	@echo "$(BLUE)🧪 Ejecutando tests de componentes...$(NC)"
	@$(TEST_COMPONENTS)

# containers
containers:
	@echo "$(BLUE)🧪 Ejecutando tests de containers...$(NC)"
	@$(TEST_CONTAINERS)

# Ejecutar tests de un archivo específico
# Uso: make file FILE=src/components/ChooseSecretModal/ChooseSecretModal.test.jsx
file:
ifndef FILE
	@echo "$(RED)❌ Error: Debes especificar el archivo con FILE=path/to/file.test.jsx$(NC)"
	@echo "   Ejemplo: make file FILE=src/components/ChooseSecretModal/ChooseSecretModal.test.jsx"
	@exit 1
endif
	@echo "$(BLUE)🧪 Ejecutando test específico: $(FILE)$(NC)"
	@$(TEST_CMD) $(FILE)

# Ejecutar tests en modo watch (útil durante desarrollo)
watch:
	@echo "$(YELLOW)👀 Ejecutando tests en modo watch...$(NC)"
	@$(NPM_RUN) test -- --watch

clean:
	@echo "$(YELLOW)🧹 Limpiando cache de tests...$(NC)"
	@$(NPM_RUN) test -- --clearCache

help:
	@echo "$(GREEN)🎯 Comandos disponibles:$(NC)"
	@echo ""
	@echo "$(BLUE)  all$(NC)        - Ejecutar todos los tests (target por defecto)"
	@echo "$(BLUE)  test$(NC)       - Ejecutar todos los tests con coverage"
	@echo "$(BLUE)  components$(NC) - Ejecutar tests solo de la carpeta src/components"
	@echo "$(BLUE)  containers$(NC) - Ejecutar tests solo de la carpeta src/containers"
	@echo "$(BLUE)  file$(NC)       - Ejecutar test de un archivo específico"
	@echo "           Ejemplo: make file FILE=src/components/Componente/Componente.test.jsx"
	@echo "$(BLUE)  watch$(NC)      - Ejecutar tests en modo watch (desarrollo)"
	@echo "$(BLUE)  clean$(NC)      - Limpiar cache de tests"
	@echo "$(BLUE)  help$(NC)       - Mostrar esta ayuda"
	@echo ""
	@echo "$(YELLOW)💡 Uso rápido:$(NC)"
	@echo "  make           # Ejecuta todos los tests"
	@echo "  make components"
	@echo "  make containers"
	@echo "  make file FILE=src/components/MiComponente/MiComponente.test.jsx"