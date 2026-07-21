# Variables
PYTHONPATH := .
PYTEST := pytest
PYTHONWARNINGS := ignore::DeprecationWarning
INTEGRATION_DIR := tests/integration
UNIT_DIR := tests/unit


.PHONY: test test-unit test-integration test-all test-coverage test-fast clean

# Test principal - ejecuta todos los tests
test: test-unit test-integration

# Tests unitarios

test-unit:
	@echo "=== Ejecutando Tests Unitarios ==="
	PYTHONPATH=$(PYTHONPATH) PYTHONWARNINGS=$(PYTHONWARNINGS) $(PYTEST) $(UNIT_DIR)/ -v --cov=src

# Tests de integración 

test-integration:
	@echo "=== Ejecutando Tests de Integración ==="
	PYTHONPATH=$(PYTHONPATH) PYTHONWARNINGS=$(PYTHONWARNINGS) $(PYTEST) $(INTEGRATION_DIR)/ -v --cov=src

# Todos los tests en una sola ejecución con reporte HTML

test-all:
	@echo "=== Ejecutando Todos los Tests ==="
	PYTHONPATH=$(PYTHONPATH) PYTHONWARNINGS=$(PYTHONWARNINGS) $(PYTEST) tests/ -v --cov=src

# Limpiar cache y reportes
clean:
	@echo "=== Limpiando archivos temporales ==="
	rm -rf .pytest_cache/
	rm -rf htmlcov/
	rm -f .coverage
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true

# Help
help:
	@echo "Comandos disponibles:"
	@echo "  test-unit        - Tests unitarios"
	@echo "  test-integration - Tests de integración"
	@echo "  test-all         - Todos los tests"
	@echo "  test             - Todos los tests: primero unitarios, luego integración"
	@echo "  clean            - Limpiar cache y reportes"