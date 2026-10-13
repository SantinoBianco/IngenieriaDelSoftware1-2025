# Death on the Cards

**Juego de cartas multijugador — aplicación full stack con sincronización en tiempo real.**

Proyecto grupal desarrollado para **Ingeniería del Software I (FAMAF – UNC, 2025)**, en el equipo ByteaByte. Incluye creación y unión a partidas, lobby y tablero de juego; combina una interfaz en React con una API en FastAPI y comunicación mediante WebSockets.

> **Este repositorio lleva el nombre de la materia**, pero el proyecto principal está en las carpetas `lab-frontend/` y `lab-backend/`.

## Tecnologías

| Componente | Tecnologías |
| --- | --- |
| Frontend | React, JavaScript, Vite, Tailwind CSS |
| Backend | Python, FastAPI, Pydantic |
| Persistencia | SQLite, SQLAlchemy |
| Comunicación | API REST y WebSockets |
| Pruebas | Vitest, Testing Library, Pytest |

## Estructura del repositorio

```text
IngenieriaDelSoftware1-2025/
├── lab-frontend/           # Interfaz web, componentes y pruebas
│   ├── src/
│   ├── package.json
│   └── README.md
├── lab-backend/            # API, lógica de partidas y pruebas
│   ├── src/
│   ├── tests/
│   ├── requirements.txt
│   └── README.md
├── Cartas/                 # Recursos gráficos
└── DotC - Rules.pdf        # Reglas del juego
```

Consulta también las instrucciones originales del [frontend](./lab-frontend/README.md) y del [backend](./lab-backend/README.md), y las [reglas del juego](./DotC%20-%20Rules.pdf).

## Cómo ejecutarlo localmente

Necesitás **Git, Python 3 y Node.js con npm**. El README del frontend recomienda Node.js 18 o superior. Abrí **dos terminales**: una para el backend y otra para el frontend.

### 1. Clonar el repositorio

```bash
git clone https://github.com/SantinoBianco/IngenieriaDelSoftware1-2025.git
cd IngenieriaDelSoftware1-2025
```

### 2. Backend (terminal 1)

Desde la raíz del repositorio:

```bash
cd lab-backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
uvicorn src.main:app --reload
```

- API: **http://localhost:8000/**
- Documentación interactiva de FastAPI: **http://localhost:8000/docs**

> **Importante:** en el código actual, `src/main.py` ejecuta `reset_tables()` al iniciarse. Esto **borra y recrea las tablas** de SQLite en cada arranque del backend. Usá solamente datos de prueba.

En Windows, la activación del entorno virtual cambia (por ejemplo, `.venv\Scripts\activate` en PowerShell/cmd, según la configuración).

### 3. Frontend (terminal 2)

Desde la raíz del repositorio:

```bash
cd lab-frontend
npm install
npm run dev
```

Abrí la dirección indicada por Vite; normalmente es **http://localhost:5173/**.

**Orden recomendado:** primero iniciá el backend, después el frontend. El servicio HTTP del frontend apunta a `http://localhost:8000/api`, por lo que ambos procesos deben estar activos.

Para detenerlos, usá **Ctrl+C** en cada terminal.

## Pruebas

**Backend:** desde `lab-backend/` con el entorno virtual activado:

```bash
make test
```

También existen los objetivos `make test-unit`, `make test-integration` y `make test-all`; el código y la configuración de tests están en `lab-backend/tests/` y en el `Makefile`.

**Frontend:** desde `lab-frontend/`:

```bash
npm test
```

Este comando abre la interfaz de Vitest. Para ejecutar la suite con cobertura, el proyecto incluye:

```bash
npm run test:coverage
```

## Qué demuestra este proyecto

- Desarrollo colaborativo de una aplicación **frontend + backend**.
- Modelado y persistencia de partidas, jugadores y cartas.
- Comunicación **HTTP y WebSocket** entre navegador y servidor.
- Componentes React y pruebas automatizadas.

---

Proyecto académico grupal. Los pasos anteriores se basan en los READMEs y archivos de configuración del repositorio; no se verificó la ejecución completa en todas las plataformas.
