# Frontend ByteaByte

Proyecto frontend desarrollado con React y Vite para el laboratorio de Ingeniería de Software I.

## 📋 Prerrequisitos

Antes de comenzar, asegúrate de tener instalado en tu sistema:

- **Node.js** (versión 18 o superior) - [Descargar aquí](https://nodejs.org/)
- **npm** (viene incluido con Node.js) o **yarn**
- **Git** - [Descargar aquí](https://git-scm.com/)

## 🚀 Instalación y configuración

### 1. Clonar el repositorio

```bash
git clone https://github.com/IngSoft1-ByteaByte/lab-frontend.git
cd lab-frontend
```

### 2. Instalar dependencias

```bash
npm install
```

O si prefieres usar yarn:

```bash  
yarn install
```

### 3. Ejecutar el proyecto en modo desarrollo

```bash
npm run dev
```

O con yarn:

```bash
yarn dev
```

El proyecto se ejecutará en `http://localhost:5173` por defecto.

## 📦 Scripts disponibles

- `npm run dev` - Inicia el servidor de desarrollo
- `npm run build` - Crea la versión de producción
- `npm run preview` - Previsualiza la versión de producción
- `npm run lint` - Ejecuta el linter para verificar el código

## 🛠️ Tecnologías utilizadas

- **React** 19.1.1 - Biblioteca para construir interfaces de usuario
- **Vite** 7.1.6 - Build tool y servidor de desarrollo
- **ESLint** - Herramienta de linting para mantener calidad de código

## 📁 Estructura del proyecto

```
lab-frontend/
├── public/          # Archivos estáticos
├── src/             # Código fuente
│   ├── assets/      # Recursos (imágenes, iconos, etc.)
│   ├── App.jsx      # Componente principal
│   ├── main.jsx     # Punto de entrada
│   └── ...
├── index.html       # Plantilla HTML
├── package.json     # Dependencias y scripts
└── vite.config.js   # Configuración de Vite
```

## 🤝 Contribución

1. Crear una nueva rama desde `dev`:

   ```bash
   git checkout dev
   git pull origin dev
   git checkout -b feature/nombre-de-tu-feature
   ```

2. Realizar los cambios y hacer commit:

   ```bash
   git add .
   git commit -m "Descripción de los cambios"
   ```

3. Subir la rama:

   ```bash
   git push origin feature/nombre-de-tu-feature
   ```

4. Crear un Pull Request hacia la rama `dev`

## 🔧 Solución de problemas

### Error: "Cannot find module..."

```bash
rm -rf node_modules package-lock.json
npm install
```

### Puerto 5173 ocupado

Vite automáticamente buscará el siguiente puerto disponible, o puedes especificar uno:

```bash
npm run dev -- --port 3000
```

### Problemas con permisos en Windows

Ejecutar la terminal como administrador o usar:

```bash
npm config set fund false
npm config set audit-level moderate
```

## 🧪 Ejecutar tests

Este proyecto utiliza [Vitest](https://vitest.dev/) y [Testing Library](https://testing-library.com/) para pruebas unitarias.

Para correr los tests, ejecuta el siguiente comando en la raíz del proyecto::
```bash
npm test
```
o
```bash
npm run test -- --watch
```
Esto abrirá la interfaz interactiva de Vitest(Vitest UI), donde podrás ver los test manualmente.

Los archivos de test se encuentran en la carpeta `src/__tests__/`.

## 📞 Contacto

Si tienes problemas para levantar el proyecto, contacta al equipo ByteaByte.

---

**Nota**: Este proyecto usa Vite con React y SWC para Fast Refresh. Para más información sobre la configuración, consulta la [documentación de Vite](https://vitejs.dev/).
