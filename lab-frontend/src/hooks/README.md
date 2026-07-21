# 🔌 Hook WebSocket - useWebSocket

Un hook personalizado para manejar conexiones WebSocket de manera sencilla en React.

## ¿Qué hace este hook?

- **Conecta automáticamente** al WebSocket cuando el componente se monta
- **Reconecta automáticamente** si se pierde la conexión
- **Mantiene el estado** de conexión y mensajes
- **Se limpia solo** cuando el componente se desmonta

## Uso básico

```jsx
import { useWebSocket } from "../hooks/useWebSocket";

function MiComponente() {
  const { isConnected, messages, sendMessage } = useWebSocket(
    "wss://mi-servidor.com"
  );

  const enviarMensaje = () => {
    sendMessage({
      type: "chat",
      text: "Hola mundo",
      user: "usuario123",
    });
  };

  return (
    <div>
      {/* Mostrar estado de conexión */}
      <p>Estado: {isConnected ? "🟢 Conectado" : "🔴 Desconectado"}</p>

      {/* Botón para enviar */}
      <button onClick={enviarMensaje} disabled={!isConnected}>
        Enviar mensaje
      </button>

      {/* Mostrar mensajes recibidos */}
      <div>
        {messages.map((msg, index) => (
          <div key={index}>{JSON.stringify(msg)}</div>
        ))}
      </div>
    </div>
  );
}
```

## API del Hook

### Parámetros

- **`url`** (string): URL del servidor WebSocket (ej: `"wss://mi-servidor.com"`)

### Retorna un objeto con:

- **`isConnected`** (boolean): `true` si está conectado, `false` si no
- **`messages`** (array): Lista de todos los mensajes recibidos
- **`sendMessage`** (function): Función para enviar mensajes al servidor

## 🧪 Testing y Desarrollo

### Para probar el hook SIN backend:

Usamos un servidor de testing público: `wss://ws.postman-echo.com/raw`

```jsx
// Para testing
const { isConnected, messages, sendMessage } = useWebSocket(
  "wss://ws.postman-echo.com/raw"
);
```

### Cuando el backend esté listo:

Solo cambiar la URL por la del servidor real:

```jsx
// Para producción
const { isConnected, messages, sendMessage } = useWebSocket(
  "wss://nuestro-backend.com/ws"
);
```

## Ver el ChatDemo funcionando

1. Ve a la página principal de la app (`npm run dev`)
2. Busca la sección "🔌 WebSocket Test"
3. Presiona "Enviar mensaje de prueba"
4. Deberías ver el mensaje aparecer abajo

## 🔧 Características avanzadas

### ✅ Reconexión automática

Si se pierde la conexión, el hook intenta reconectar cada 3 segundos automáticamente.

### ✅ Manejo de errores

Los errores se logean en la consola para debugging.

### ✅ Cleanup automático

Cuando el componente se desmonta, la conexión se cierra automáticamente.

### ✅ Estado reactivo

Cualquier cambio en la conexión o mensajes re-renderiza el componente.

## 🐛 Debugging

Si algo no funciona, abre las **DevTools** (F12) y revisa la **Consola** para ver logs como:

- `✅ WS conectado` - Conexión exitosa
- `📩 Mensaje recibido:` - Mensaje del servidor
- `🚀 Enviando mensaje:` - Mensaje enviado
- `❌ WS error:` - Errores de conexión

## Para el equipo

### ¿Cómo usar este hook en tu componente?

1. **Importa el hook:**

   ```jsx
   import { useWebSocket } from "../hooks/useWebSocket";
   ```

2. **Úsalo en tu componente:**

   ```jsx
   const { isConnected, messages, sendMessage } =
     useWebSocket("URL_DEL_SERVIDOR");
   ```

3. **¡Ya está!** Tienes WebSocket funcionando.

### ¿Dónde está el código?

- **Hook:** `src/hooks/useWebSocket.js`
- **Ejemplo:** `src/components/ChatDemo.jsx`
- **Documentación:** `src/hooks/README.md` (este archivo)

---

**¿Dudas?** Pregunta al creador del hook o revisa el ejemplo en `ChatDemo.jsx` 🚀
