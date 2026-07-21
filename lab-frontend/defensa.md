# Defensa del módulo `src`

Este documento recorre cada archivo bajo `src/` y documenta todas las funciones declaradas, explicando qué hacen, por qué están implementadas de esa manera, qué interacción tienen con WebSocket u `HttpService`, y posibles mejoras.

## `src/App.jsx`

- `App`
  - **Qué hace:** componente raíz que simplemente renderiza `InicioContainer`, delegando toda la lógica de la app a ese contenedor.
  - **Por qué es así:** mantiene el entry-point limpio y permite que `InicioContainer` controle la navegación y estado global sin prop drilling desde `App`.
  - **WebSocket/HTTP:** no interactúa directamente con WebSocket ni `HttpService`.
  - **Mejoras:** podría convertirse en un punto para declarar `Context providers` (por ejemplo `GameProvider`) y preparar el árbol para futuras rutas usando React Router; actualmente es suficiente.

## `src/main.jsx`

- `createRoot(...).render`
  - **Qué hace:** arranca la app montando `<App />` dentro de `<StrictMode>` y configura `react-hot-toast` con un `Toaster` global.
  - **Por qué es así:** Vite crea esta entrada por defecto; envolver en `StrictMode` ayuda a detectar efectos secundarios y el `Toaster` proporciona notificaciones en vez de `alert`.
  - **WebSocket/HTTP:** no hace llamadas.
  - **Mejoras:** si se añaden contextos globales (por ejemplo `GameProvider`), deberían envolverse aquí. También conviene extraer la configuración del `Toaster` a un módulo compartido para pruebas.

## `src/contexts/GameContext.jsx`

- `GameProvider`
  - **Qué hace:** crea un contexto con estado `game` (id, jugadores, estado), el arreglo `playerCards` y expone actualizadores.
  - **Por qué es así:** pretende centralizar el estado compartido del juego para evitar prop drilling; usa `useState` para crear un mock hasta que exista backend.
  - **WebSocket/HTTP:** no se conecta.
  - **Mejoras:** el `value` referencia funciones `startGame` y `resetGame` que no existen; habría que implementarlas o eliminarlas para evitar errores. También conviene hidratar `game` usando datos reales (de WebSocket/HTTP) y exponer reducers para evitar múltiples `setState`.
- `updatePlayerCards`
  - **Qué hace:** helper que loguea y actualiza el arreglo `playerCards` dentro del contexto.
  - **Por qué es así:** aisla la mutación de `playerCards` para mantener consistencia desde componentes consumidores.
  - **WebSocket/HTTP:** ninguno.
  - **Mejoras:** podría validar la estructura de `cards` o hacerla inmutable para reducir errores.
- `useGame`
  - **Qué hace:** custom hook que retorna el valor del `GameContext`.
  - **Por qué es así:** patrón estándar para evitar importar `useContext` y el contexto por separado.
  - **WebSocket/HTTP:** ninguno.
  - **Mejoras:** se puede lanzar un error si se usa fuera del `GameProvider` para ayudar al debugging.

## `src/hooks/useWebSocket.js`

- `useWebSocket`
  - **Qué hace:** hook que crea un `WebSocket`, persiste su ref, lleva el estado de conexión, acumula mensajes entrantes y expone `sendMessage` junto con setters para cartas.
  - **Por qué es así:** encapsula la lógica de reconexión y parsing de mensajes (`JSON.parse`) en un solo lugar para que los contenedores sólo reaccionen a cambios en `messages`.
  - **WebSocket/HTTP:** abre un `WebSocket` al `url` recibido y reconecta tras 3 s cuando se cierra; no usa HTTP.
  - **Mejoras:** conviene limpiar el timeout de reconexión, soportar autenticación (headers o token), y permitir pasar callbacks para filtrar mensajes en vez de acumularlos indefinidamente.
- `connect` (definida dentro del `useEffect`)
  - **Qué hace:** instancia el `WebSocket`, configura manejadores (`onopen`, `onclose`, `onmessage`, `onerror`) y guarda la referencia global.
  - **Por qué es así:** mantiene la lógica separada para poder reutilizarla en el reintento post cierre.
  - **WebSocket/HTTP:** es el lugar que crea la conexión y planifica un `setTimeout(connect, 3000)` al cerrarse.
  - **Mejoras:** guardar el id del timeout para limpiarlo al desmontar y soportar backoff progresivo.
- `sendMessage`
  - **Qué hace:** serializa a JSON el `msg` recibido y lo envía si el socket está en estado `OPEN`.
  - **Por qué es así:** previene fallos silenciosos al revisar `readyState` antes de enviar y loguear errores.
  - **WebSocket/HTTP:** usa el `WebSocket` abierto; no toca HTTP.
  - **Mejoras:** devolver un `Promise` que rechace si el socket no está listo; que acepte una cola para reintentos.

## `src/services/HttpService.js`

- `request`
  - **Qué hace:** wrapper genérico sobre `fetch` que apunta a `BASE_URL`, fija cabeceras JSON, parsea respuesta según `content-type`, lanza errores enriquecidos y devuelve JSON/Texto o `null` en 204.
  - **Por qué es así:** concentra manejo de errores HTTP (incluye payload) para que `get/post/...` sean livianas.
  - **WebSocket/HTTP:** solo HTTP, usando `fetch`.
  - **Mejoras:** permitir abort controllers, credenciales, y mover `BASE_URL` a env vars.
- `get`, `post`, `put`
  - **Qué hacen:** atajos que llaman `request` con el método apropiado y serializan `body` en JSON en los verbos que lo requieren.
  - **Por qué es así:** patrón DRY para no repetir `request(endpoint, { method })` por todas partes.
  - **WebSocket/HTTP:** usan HTTP (`fetch`).
  - **Mejoras:** aceptar `options` extra (headers personalizados, params) y soportar formularios.
- `del`
  - **Qué hace:** envía un `DELETE` directo con `fetch`, chequea `ok` y lanza un `Error` con el texto del backend.
  - **Por qué es así:** algunas rutas devuelven 204 y no necesitan parseo; se prefirió un manejo explícito.
  - **WebSocket/HTTP:** HTTP puro.
  - **Mejoras:** podría reutilizar `request` para mantener consistencia (manejo de content-type, logs y `BASE_URL`).

## `src/utils/CardImageMapper.jsx`

- `getCardImage`
  - **Qué hace:** recibe un nombre de carta y devuelve la ruta de imagen según `CARD_IMAGE_MAP`, con búsqueda parcial y fallback.
  - **Por qué es así:** evita hardcodear `import` individuales en cada componente y tolera nombres similares.
  - **WebSocket/HTTP:** ninguno; solo mapea assets.
  - **Mejoras:** normalizar nombres con un diccionario más robusto (por id) para reducir `console.warn`.
- `getCardInfo`
  - **Qué hace:** infiere metadata (tipo, color y flags como `requiresSecretId`) según el nombre de la carta, devolviendo objetos con claves usadas por la UI.
  - **Por qué es así:** sirve como fuente única para reglas condicionales (eventos, detectives, instantáneas) sin repetir `if`s.
  - **WebSocket/HTTP:** ninguno.
  - **Mejoras:** mover configuración a JSON y añadir identificadores canónicos para evitar `includes` frágiles.

## `src/utils/detectiveRules.js`

- `normalize`
  - **Qué hace:** helper local para poner strings en minúscula y sin espacios extra.
  - **Por qué es así:** asegura comparaciones case-insensitive para nombres de cartas.
  - **WebSocket/HTTP:** ninguno.
  - **Mejoras:** moverlo a util compartido y evitar crear funciones internas en cada import.
- `isHarleyCard`, `isAriadneCard`
  - **Qué hacen:** verifican por nombre si la carta corresponde a Harley Quin o Ariadne Oliver.
  - **Por qué es así:** varias reglas dependen específicamente de esos detectives.
  - **WebSocket/HTTP:** ninguno.
  - **Mejoras:** aceptar `id`s en vez de comparar strings.
- `isDetectiveCard`
  - **Qué hace:** consulta `getCardInfo` para determinar si una carta es de tipo detective.
  - **Por qué es así:** reutiliza la metadata ya centralizada en lugar de repetir listas.
  - **WebSocket/HTTP:** ninguno.
  - **Mejoras:** delegar directamente en `card.type` si el backend ya envía esa info.
- `isWildcardName`
  - **Qué hace:** detecta si el nombre contiene la palabra `wildcard`.
  - **Por qué es así:** algunas reglas especiales se habilitan para comodines como Harley.
  - **Mejoras:** considerar un flag explícito en el objeto carta.
- `getBaseDetectiveNameForSet`
  - **Qué hace:** limpia el prefijo “Set de …” y devuelve el detective base, con excepciones como “Beresford”.
  - **Por qué es así:** permite verificar compatibilidad carta-set.
  - **Mejoras:** usar tablas de correspondencia para sets especiales.
- `setHasRealDetective`
  - **Qué hace:** valida si un set contiene el detective “real” requerido, manejando el caso Beresford aparte.
  - **Por qué es así:** Harley no puede puntuar si no acompaña a un detective genuino.
  - **WebSocket/HTTP:** ninguno.
  - **Mejoras:** aceptar sets vacíos temprano para reducir loops.
- `canCardJoinSet`
  - **Qué hace:** determina si una carta se puede sumar a un set según dueño, tipo de carta y reglas especiales.
  - **Por qué es así:** centraliza la lógica de validación antes de permitir acciones en el tablero.
  - **WebSocket/HTTP:** ninguno.
  - **Mejoras:** dividir la lógica en sub-funciones para mejorar legibilidad y agregar mensajes de error específicos.
- `isUnblockableCombination`
  - **Qué hace:** detecta la dupla Tommy/Tuppence dentro del set Beresford para marcarla como imparable.
  - **Por qué es así:** algunas defensas (ej. “Not So Fast”) no aplican a combos especiales.
  - **Mejoras:** devolver también qué carta falta para completar el combo y mostrarlo en UI.
- `harleyViolatesRule`
  - **Qué hace:** retorna `true` si Harley intenta unirse a un set donde aún no hay un detective real.
  - **Por qué es así:** se usa para mostrar errores antes de confirmar la jugada.
  - **WebSocket/HTTP:** ninguno.
  - **Mejoras:** devolver un objeto con motivo para que la UI lo explique mejor.

## `src/components/PartidaItem/PartidaItem.jsx`

- `PartidaItem`
  - **Qué hace:** muestra una tarjeta con nombre de partida, cupos, indicador de privacidad y botón para unirse; calcula jugadores actuales según `cantidad_jugadores` o `players`.
  - **Por qué es así:** aisla la UI repetitiva de la lista de partidas y normaliza datos heterogéneos del backend.
  - **WebSocket/HTTP:** no lanza solicitudes; sólo invoca `onClick` que normalmente abre el formulario de unión.
  - **Mejoras:** bloquear el botón si la partida está en estado distinto de `lobby` y mostrar `tooltip` con detalles, además de optimizar con `memo` si se renderizan muchas partidas.

## `src/components/CreateGameForm/CreateGameForm.jsx`

- `CreateGameForm`
  - **Qué hace:** modal controlado que permite configurar nombre de partida, host, fecha, privacidad y contraseña.
  - **Por qué es así:** encapsula validaciones y reseteo de formulario, comunicándose con `InicioContainer` vía `onCreateGame`.
  - **WebSocket/HTTP:** no llama directamente; delega la creación al contenedor.
  - **Mejoras:** dividir en componentes más pequeños y extraer mensajes de error para i18n.
- `handleInputChange`
  - **Qué hace:** sincroniza `formData` y limpia errores específicos al escribir.
  - **Por qué es así:** reduce rerenders controlando inputs con estado único y casting a número cuando corresponde (`maxJugadores`).
  - **WebSocket/HTTP:** ninguno.
  - **Mejoras:** validar en caliente usando un esquema (Yup/Zod) para evitar lógica manual.
- `handlePrivadaChange`
  - **Qué hace:** alterna el flag `privada`, limpia la contraseña y errores cuando se desmarca.
  - **Por qué es así:** evita enviar contraseñas residuales cuando se vuelve pública.
  - **WebSocket/HTTP:** ninguno.
  - **Mejoras:** sincronizar con un `useEffect` para mantener la UI cuando `isOpen` cambia.
- `validateForm`
  - **Qué hace:** ejecuta reglas de negocio (longitudes mínimas, rango de jugadores, fechas no futuras, contraseña obligatoria) y devuelve `true/false` con `errors` poblado.
  - **Por qué es así:** mantiene toda la validación en un solo punto antes de llamar a `onCreateGame`.
  - **WebSocket/HTTP:** ninguno.
  - **Mejoras:** regresar un objeto con mensajes para reutilizarlos en tests y mostrar errores agrupados.
- `handleSubmit`
  - **Qué hace:** previene submit, corre `validateForm`, construye el payload normalizado y llama `onCreateGame`; luego resetea el formulario.
  - **Por qué es así:** centraliza la transición entre la UI controlada y la API HTTP del contenedor.
  - **WebSocket/HTTP:** no hace llamadas; `onCreateGame` suele consumir `HttpService.post`.
  - **Mejoras:** mostrar feedback mientras la promesa se resuelve y capturar errores asíncronos.
- `handleClose`
  - **Qué hace:** resetea el formulario y dispara `onClose`.
  - **Por qué es así:** garantiza que cada apertura comience limpia.
  - **WebSocket/HTTP:** ninguno.
  - **Mejoras:** aceptar una bandera para evitar resetear cuando el cierre es por submit exitoso (ya se hace en `handleSubmit` pero podría unificarse).

## `src/components/JoinGameForm/JoinGameForm.jsx`

- `buildInitialFormState`
  - **Qué hace:** devuelve el objeto inicial con campos vacíos.
  - **Por qué es así:** facilita resets consistentes sin duplicar estructuras.
  - **Mejoras:** aceptar parámetros para precargar datos del jugador si ya existe sesión.
- `JoinGameForm`
  - **Qué hace:** modal para unirse a una partida pública/privada con manejo de bloqueos tras intentos fallidos.
  - **Por qué es así:** integra validaciones, tracking de intentos (`attempts`, `blockedUntil`) y mensajes de feedback.
  - **WebSocket/HTTP:** no llama directamente; delega en `onJoinGame` (que usa HTTP) y sólo maneja errores devueltos.
  - **Mejoras:** persistir intentos en `localStorage` para evitar resets al recargar y mostrar tiempo restante con un contador visual.
- `resetForm`
  - **Qué hace:** vuelve a estado inicial, borra errores/feedback y desbloquea.
  - **Por qué es así:** se reutiliza al abrir/cerrar y tras un join exitoso.
  - **WebSocket/HTTP:** ninguno.
  - **Mejoras:** usar `useReducer` para evitar múltiples `setState`.
- `handleInputChange`
  - **Qué hace:** actualiza campos controlados, limpia errores y mensajes cuando el usuario corrige datos.
  - **Por qué es así:** mantiene el formulario reactivo.
  - **WebSocket/HTTP:** ninguno.
  - **Mejoras:** recortar espacios automáticamente y forzar formato de fecha válido.
- `validateForm`
  - **Qué hace:** verifica nombre, fecha no futura y contraseña obligatoria en privadas.
  - **Por qué es así:** se necesita antes de llamar a `onJoinGame` para evitar round-trips innecesarios.
  - **WebSocket/HTTP:** ninguno.
  - **Mejoras:** asegurarse de calcular edad real (el código actual calcula pero no usa `edadActual`).
- `handleSubmit`
  - **Qué hace:** aplica bloqueo temporal tras demasiados intentos, valida y llama `onJoinGame`; maneja errores 401/403 diferenciando contraseñas.
  - **Por qué es así:** combina UX (feedback) con reglas anti fuerza bruta.
  - **WebSocket/HTTP:** consume la promesa de `onJoinGame` que llega del contenedor (HTTP) y no usa WebSocket.
  - **Mejoras:** mostrar spinner y permitir reintentos automáticos cuando el bloqueo vence mediante `setInterval` existente.
- `handleClose`
  - **Qué hace:** llama a `resetForm` y `onClose`.
  - **Mejoras:** ninguna crítica; opcionalmente recordar último `partidaId` para reabrir más rápido.

## `src/components/Lobby/Lobby.jsx`

- `Lobby`
  - **Qué hace:** renderiza la sala de espera, lista jugadores, botones de iniciar/cancelar/salir y un overlay cuando el host cancela.
  - **Por qué es así:** separa la vista de lobby del contenedor, manteniendo solo lógica de presentación y callbacks.
  - **WebSocket/HTTP:** no llama directamente; usa `onStartGame`/`onLeaveGame`/`onCancelGame` que a su vez disparan HTTP o mensajes WebSocket desde el contenedor.
  - **Mejoras:** memorizar la lista de jugadores con `memo` y mostrar estados de conexión individuales.
- `handleStartClick`
  - **Qué hace:** dispara `onStartGame`.
  - **Por qué es así:** facilita tests y mantiene JSX limpio.
  - **Mejoras:** deshabilitar mientras `onStartGame` está en progreso.
- `handleLeaveClick`
  - **Qué hace:** llama a `onLeaveGame`.
  - **Por qué es así:** igual que `handleStartClick`.
  - **Mejoras:** mostrar confirmación al host antes de salir.

## `src/components/TimeoutModal/TimeoutModal.jsx`

- `TimeoutModal`
  - **Qué hace:** componente que muestra el contador de turno o un overlay de “tiempo agotado”. Calcula progreso y colores según segundos restantes.
  - **Por qué es así:** separa la preocupación UX del contenedor (`TableroContainer`), reutilizando los helpers de formato declarados dentro.
  - **WebSocket/HTTP:** no interactúa directamente.
  - **Mejoras:** aceptar duración máxima como prop (120 está hardcodeado). También usar `useMemo` para evitar recalcular colores en cada render.
- `getTimerColor`, `getProgressColor`
  - **Qué hacen:** devuelven clases tailwind basadas en thresholds de tiempo.
  - **Por qué es así:** simplifica el JSX principal y mantiene la lógica en funciones puras.
  - **Mejoras:** consolidar ambas en un objeto config para que los thresholds sean consistentes.
- `formatTime`
  - **Qué hace:** convierte segundos a `mm:ss`.
  - **Por qué es así:** evita repetir lógica de formateo.
  - **Mejoras:** internacionalizar (agregar etiquetas “min/seg”) o delegar a `Intl.DateTimeFormat`.

## `src/containers/InicioContainer/InicioContainer.jsx`

- `InicioContainer`
  - **Qué hace:** coordina la pantalla inicial: carga partidas vía `get('/partidas')`, abre modales de crear/unirse, gestiona vista actual (`menu`, `lobby`, `tablero`) y reenvía `WebSocket` (`useWebSocket`) a subcontendores.
  - **Por qué es así:** actúa como router manual antes de integrar un router formal y mantiene el estado compartido (`gameConfig`, `currentUser`, `partidas`).
  - **WebSocket/HTTP:** usa `useWebSocket('ws://localhost:8000/ws/lobby')` para escuchar eventos y `HttpService.get/post` para sincronizar con el backend.
  - **Mejoras:** extraer el manejo de mensajes WebSocket a un reducer para evitar múltiples `switch` y duplicación de `get('/partidas')` en distintos casos.
- `handleClick`
  - **Qué hace:** cuando se selecciona una partida, guarda su referencia y abre el modal de unión.
  - **Por qué es así:** permite pasar datos al formulario sin recargar la lista.
  - **WebSocket/HTTP:** ninguno.
  - **Mejoras:** validar si la partida sigue disponible antes de abrir el modal.
- `handleCreateGame`
  - **Qué hace:** llama `post('/partidas')` con los datos del formulario, notifica vía WebSocket (`crear_partida`), setea el usuario actual y navega al lobby.
  - **Por qué es así:** combina la creación de partida y jugador host en una sola acción.
  - **WebSocket/HTTP:** usa HTTP (`post`) y, si el socket está conectado, envía un mensaje para que otros clientes refresquen.
  - **Mejoras:** manejar estados de carga y reintentar cuando el WebSocket no esté listo; también centralizar la creación de usuario (ahora deriva de la respuesta del backend).
- `crearPartida`
  - **Qué hace:** abre el modal de creación.
  - **Por qué es así:** mantiene el JSX limpio con una función pequeña.
  - **WebSocket/HTTP:** ninguno.
  - **Mejoras:** renombrar a `openCreateGameForm` para mayor claridad.
- `handleJoinGame`
  - **Qué hace:** envía `post('/partidas/:id/join')`, crea el objeto `usuario`, arma `gameConfiguration` y navega al lobby.
  - **Por qué es así:** necesita combinar datos del formulario con la partida seleccionada y manejar contraseñas.
  - **WebSocket/HTTP:** usa HTTP (`post`); no emite por WebSocket aquí (el backend emite `jugador_unido`).
  - **Mejoras:** capturar y mostrar mensajes específicos del backend (ej. partida llena) y guardar un token del jugador para reanudaciones.
- `closeJoinForm`
  - **Qué hace:** cierra el modal y limpia la partida seleccionada.
  - **Por qué es así:** evita que quede un id obsoleto.
  - **Mejoras:** ninguna crítica.
- `handleBackToMenu`
  - **Qué hace:** resetea vista, usuario y partida, y vuelve a cargar partidas del backend filtrando solo las que están en lobby.
  - **Por qué es así:** asegura que al volver al menú se vea un listado actualizado.
  - **WebSocket/HTTP:** usa HTTP `get('/partidas')`.
  - **Mejoras:** usar `abortController` para cancelar la petición si el componente desmonta.
- `handleGoToTablero`
  - **Qué hace:** setea `gameConfig` con los datos recibidos desde `LobbyContainer` y cambia `currentView` a “tablero”.
  - **Por qué es así:** la transición al tablero depende de un evento del lobby.
  - **WebSocket/HTTP:** ninguno directo (recibe datos ya sincronizados).
  - **Mejoras:** validar que `gameData` incluya `players` para evitar montar el tablero incompleto.

## `src/containers/LobbyContainer/LobbyContainer.jsx`

- `LobbyContainer`
  - **Qué hace:** sincroniza la sala de espera: normaliza `gameConfig`, reutiliza el WebSocket del padre o abre uno nuevo, escucha eventos (`jugador_unido`, `juego_iniciado`, etc.), y renderiza `<Lobby />`.
  - **Por qué es así:** necesita mantener un espejo del estado del lobby sin recargar continuamente desde HTTP, reaccionando a eventos push.
  - **WebSocket/HTTP:** usa `useWebSocket` (cuando no recibe uno externo) para enviar mensajes (`conectar_lobby`, `partida_iniciada`, `jugador_manual_salida`) y escucha `messages`. Usa HTTP `post('/start')` y `del` para abandonar/cancelar partidas.
  - **Mejoras:** separar la lógica de normalización de mensajes en un reducer y evitar `console.log` en producción.
- `handleStartGame`
  - **Qué hace:** llama `post('/partidas/:id/start')`, emite por WebSocket `partida_iniciada` y navega al tablero.
  - **Por qué es así:** el host inicia la partida desde aquí; necesita sincronizar con todos los clientes.
  - **Mejoras:** deshabilitar el botón mientras la llamada está en curso e informar errores específicos.
- `handleLeaveGame`
  - **Qué hace:** intenta `del('/partidas/:id/jugadores/:currentUser')`, envía mensaje `jugador_manual_salida` y vuelve al menú.
  - **Por qué es así:** permite que cualquier jugador abandone y actualice la lista para otros.
  - **Mejoras:** confirmar si el host abandona para evitar partidas huérfanas y manejar errores HTTP en detalle.

## `src/containers/TableroContainer/TableroContainer.jsx`

### Componente principal

- `TableroContainer`
  - **Qué hace:** es el núcleo del juego: combina datos de `gameData` con estado local, se conecta al WebSocket (o reutiliza el del padre), carga secretos/cartas/sets vía `HttpService`, maneja timers, eventos (Dead Card Folly, Point Your Suspicious, Not So Fast, Card Trade, etc.) y renderiza `<Tablero />` junto con modales auxiliares.
  - **Por qué es así:** centraliza toda la orquestación porque el tablero necesita sincronizar múltiples fuentes (HTTP inicial, eventos push, timers locales) antes de pintar la UI.
  - **WebSocket/HTTP:** intensivo en ambos: escucha `messages` para reflejar estados de partida y usa `get/post/put/del` para operaciones que requieren confirmación del backend.
  - **Mejoras:** dividir en hooks especializados (`useDeadCardFolly`, `usePointSuspicion`, `useMazos`) para reducir las ~7 k líneas y hacer que los efectos sean testeables.

### Utilidades de normalización y ayuda

*(Las funciones de esta subsección no interactúan directamente con WebSocket ni con `HttpService`; únicamente preparan datos locales.)*

- `normalizePlayers`
  - **Qué hace:** castea los `id` de los jugadores a números y asegura campos como `secretsRevealed` y `secretsCount` con defaults.
  - **WebSocket/HTTP:** no; procesa datos recibidos.
  - **Mejoras:** moverlo a `utils` y memoizar para no recalcular en cada render.
- `normalizeSecrets`
  - **Qué hace:** recibe respuestas heterogéneas de secretos (arrays, objetos anidados, claves diferentes) y devuelve solo los del jugador actual con flags `revelado/revealed` consistentes.
  - **Mejoras:** aceptar un schema y validar estructuras inesperadas para loggear una sola vez.
- `normalizeRevealedSecretsByPlayer`
  - **Qué hace:** construye un mapa `playerId -> secretos revelados` a partir de estructuras variadas.
  - **Mejoras:** evitar recursiones profundas con tail recursion y exponerlo para pruebas unitarias.
- `normalizeDraft`
  - **Qué hace:** colapsa distintas formas en que llega el mazo de draft (`cards`, `draft`, `mazoDraft`, etc.) a un único array.
  - **Mejoras:** permitir pasar un predicate para elegir sólo campos válidos.
- `findCardInPayload` / `getCardIdFromObject` / `normalizeCardFromPayload`
  - **Qué hacen:** buscan en payloads anidados objetos que representen cartas, extraen su id y devuelven una versión normalizada con `carta_id` numérico.
  - **Mejoras:** usar `structuredClone` o utilidades compartidas y evitar visitar el mismo objeto varias veces con un `WeakSet` (ya usa `visited`, pero podrían abstraerse).
- `createInitialDeadCardFollyState`
  - **Qué hace:** devuelve el objeto inicial del flujo Dead Card Folly.
  - **Mejoras:** convertirlo en constante exportable para usar en tests.
- `computePendingDeadCardPlayers`
  - **Qué hace:** calcula qué jugadores aún no eligieron carta durante Dead Card Folly.
  - **Mejoras:** aceptar ids como strings sin convertir múltiples veces.
- `getPlayerNameById`
  - **Qué hace:** busca el nombre del jugador, tolerando ids numéricos o string.
  - **Mejoras:** reemplazar por un `Map` precomputado.
- `createInitialPointSuspicionsState`
  - **Qué hace:** devuelve el estado base del evento Point Your Suspicious.
  - **Mejoras:** igual que Dead Card Folly: exportarlo para usarlo en validaciones.

### Hooks y helpers memorizados

*(Aquí sí hay mezcla: algunas funciones sólo procesan estado y otras llaman HTTP/WS; se detalla caso por caso.)*

- `loadCurrentPlayerSecrets` (`useCallback`)
  - **Qué hace:** `get /partidas/:id/secretos` para el jugador actual y actualiza `gameState.secrets`.
  - **WebSocket/HTTP:** HTTP `get`.
  - **Mejoras:** cachear resultados y añadir reintentos exponenciales.
- `mergePlayersWithKnownReveals`
  - **Qué hace:** combina jugadores entrantes con info previa de secretos revelados, usando el mapa `revealedSecretsByPlayer`.
  - **Mejoras:** mover al reducer que procesa mensajes para garantizar consistencia en un solo paso.
- `pushEventLog`
  - **Qué hace:** agrega entradas al historial de eventos con deduplicación temporal.
  - **Mejoras:** limitar por jugador y persistir en `sessionStorage` para debugging.
- `announceEventInProgress` / `announceEventCancelled`
  - **Qué hacen:** notifican al backend y a otros clientes que un jugador está resolviendo / canceló una carta de evento, actualizando el `statusMessage` local.
  - **WebSocket/HTTP:** `announceEventInProgress` usa HTTP `get` (estado del jugador) y ambos envían mensajes WebSocket (para cancelación) cuando procede.
  - **Mejoras:** mover estas llamadas a un servicio para reutilizar en modales.
- `submitDeadCardFollySelections`
  - **Qué hace:** toma la selección de cada participante, valida que todos hayan elegido, marca el estado como `submitting` y hace `post /dead-card-folly`.
  - **WebSocket/HTTP:** HTTP `post` y fallback WS para errores.
  - **Mejoras:** permitir reintento automático si hay fallo de red e impedir múltiples envíos.
- `loadAllPlayerSets`
  - **Qué hace:** `get /partidas/:id/sets`, aplana distintas respuestas y guarda tanto todos los sets como los del jugador actual.
  - **Mejoras:** extraer el aplanado a una función pura y cachear resultados para no descargarlo cada vez que llega un mensaje.
- `playEventPointSuspicion`
  - **Qué hace:** activa el evento `Point Your Suspicion` vía `post` y, si tiene éxito, llama `startPointSuspicionsEvent`.
  - **WebSocket/HTTP:** HTTP `post`.
  - **Mejoras:** manejar el caso en que el backend ya tenga un evento en curso haciendo polling antes de permitir otro `post`.
- `updateMazosState`
  - **Qué hace:** sincroniza el mazo en mano, descarte y draft consultando endpoints específicos si es necesario.
  - **WebSocket/HTTP:** HTTP (usa `get` desde helpers `loadSecretos`, `loadDraft`).
  - **Mejoras:** evitar llamadas redundantes cuando el backend envía el estado completo por WebSocket.
- `syncRevealedSecretsByPlayer`
  - **Qué hace:** usa `normalizeRevealedSecretsByPlayer` para poblar `revealedSecretsByPlayer` y `gameState.players.*Revealed`.
  - **Mejoras:** guardar timestamp para saber si hace falta re-sincronizar.
- `checkSocialDisgraceStatus` / `detectSocialDisgraceChanges` / `handleSocialDisgraceNotifications`
  - **Qué hacen:** detectan jugadores con todos los secretos revelados y controlan notificaciones de entrada/salida de “Desgracia Social”.
  - **Mejoras:** consolidar en un solo hook y usar `toast` controlados por `Set` para evitar spam.
- `isCurrentPlayerInSocialDisgrace`
  - **Qué hace:** consulta el set `playersInSocialDisgrace`.
  - **Mejoras:** renombrar a `getIsCurrentPlayer...` para evitar confusión (ahora retorna bool pero se usa como función).
- `openPlayDetectiveModal` / `closePlayDetectiveModal`
  - **Qué hacen:** controlan el modal para agregar detectives, precargando `presetDetectiveCardId` y evitando cerrar mientras se envía.
  - **Mejoras:** manejar `focus` y limpiar al cerrar para evitar estados obsoletos.
- `cancelRevealSecretModal`
  - **Qué hace:** oculta el modal de revelar secreto y limpia acciones pendientes (ej. agregar detective).
  - **Mejoras:** separar por tipo de modal para no mezclar responsabilidades.
- `clearPendingReaction` / `executePendingAction`
  - **Qué hacen:** administran la ventana de reacción “Not So Fast”. Limpian timers, payloads y ejecutores, o disparan la acción original cuando expira la ventana.
  - **WebSocket/HTTP:** trabajan con los mensajes WS generados en `sendRevealRequestForAction`.
  - **Mejoras:** usar `useReducer` para almacenar el estado de reacción y evitar manipular refs manualmente.
- `sendRevealRequestForAction`
  - **Qué hace:** arma un payload con `reactionId`, actor, acción y vencimiento; lo envía por WebSocket para avisar que se puede reaccionar.
  - **WebSocket/HTTP:** WebSocket.
  - **Mejoras:** confirmar recepción (ACK) del backend antes de asumir que la reacción está en curso.
- `getNormalizedSetId` / `getNormalizedSetOwnerId` / `isOwnerCurrentUser`
  - **Qué hacen:** normalizan ids de sets/propietarios provenientes del backend para compararlos con el jugador actual.
  - **Mejoras:** unificar en una utilidad `normalizeId` global.
- `applyRevealToState` / `applyHideToState`
  - **Qué hacen:** actualizan estructuras locales cuando alguien revela/oculta un secreto, manteniendo consistencia entre `gameState`, `revealedSecretsByPlayer` y mapas auxiliares.
  - **WebSocket/HTTP:** se usan en handlers de eventos WS.
  - **Mejoras:** devolver el nuevo estado en vez de llamar `setState` dentro (para facilitar testing).
- `applyMazosState`
  - **Qué hace:** con ayuda de `loadSecretos` y `loadDraft`, refresca mano, secretos y mazo según flags (prefetched, allowDraftUpdate).
  - **WebSocket/HTTP:** HTTP `get` múltiples.
  - **Mejoras:** parametrizar qué se debe refrescar para no hacer llamadas innecesarias.
- `loadSecretos`, `loadDraft`
  - **Qué hacen:** wrappers con reintentos para obtener secretos y mazo de draft, aceptan `maxRetries` y `delay`.
  - **Mejoras:** exponer `AbortController` y permitir cancelar cuando el componente desmonta.
- `initializeGame`
  - **Qué hace:** rutina inicial que carga jugadores, secretos, mazos y sets al entrar al tablero.
  - **Mejoras:** dividir en pasos y mostrar estado de carga al usuario.
- `handleCardTradeProposalPayload`
  - **Qué hace:** procesa mensajes de `card_trade_*` para establecer propuestas pendientes y mostrar los modales adecuados.
  - **Mejoras:** separar los casos de iniciador y receptor para que la función sea más corta.

### Acciones de red y handlers del juego

- `eliminarPartida`
  - **Qué hace:** llama `del('/partidas/:id')` y usa `toast` para informar; se usa al terminar la partida o por error.
  - **WebSocket/HTTP:** HTTP `del` + envíos WS en otros handlers.
  - **Mejoras:** confirmar antes de borrar y manejar estados 404 (partida ya eliminada).
- `handleRevealSecret` / `handleHideSecret`
  - **Qué hacen:** responden a eventos WebSocket de secretos revelados/ocultos, usando los helpers `applyRevealToState`/`applyHideToState` y mostrando modales.
  - **Mejoras:** validar payloads antes de mutar el estado para evitar datos corruptos.
- `handleDrawCard`
  - **Qué hace:** hace `post('/mazo/robar')`, actualiza la mano y resetea selección; también controla el timer de turno.
  - **WebSocket/HTTP:** HTTP `post`, notificaciones via WebSocket vienen aparte.
  - **Mejoras:** evitar múltiples clics mientras la petición está activa y mostrar una animación.
- `handlePassTurn`
  - **Qué hace:** valida si ya se descartó, hace `post('/turno/pasar')`, ajusta timers y estado.
  - **Mejoras:** permitir pasar turno automáticamente cuando se acaba el tiempo (ya existe `handleAutomaticDiscard` pero se puede integrar mejor).
- `handleAutomaticDiscard`
  - **Qué hace:** cuando expira el turno, descarta la primera carta automáticamente (HTTP `post`) y muestra modal indicando lo ocurrido.
  - **Mejoras:** permitir elegir cuál carta descartar si el usuario vuelve antes de que se ejecute la acción.
- `handleTimeUpAcknowledge`
  - **Qué hace:** cierra el modal de tiempo agotado y limpia estados relacionados.
  - **Mejoras:** reiniciar el temporizador de turno siguiente aquí para asegurar sincronía.
- `toggleSelectCard`, `cancelSelection`
  - **Qué hacen:** manejan la selección de cartas en mano (`selectedIds` set).
  - **Mejoras:** mover a `<Tablero />` si sólo afectan la UI.
- `openDiscardModal`, `closeDiscardModal`
  - **Qué hacen:** controlan la visibilidad del modal de descarte.
  - **Mejoras:** renombrar a `setDiscardModalOpen(true/false)` para claridad.
- `discardSelected`
  - **Qué hace:** envía `post('/cartas/descartar')` con las cartas seleccionadas y actualiza la mano; valida reglas de descarte por turno.
  - **Mejoras:** mostrar confirmación cuando se descarta automáticamente.
- `refreshPlayerHand`
  - **Qué hace:** vuelve a cargar las cartas del jugador actual desde el backend.
  - **Mejoras:** usar la respuesta del evento WS en vez de siempre pegarle al backend.
- `handlePickDraftCard`
  - **Qué hace:** realiza `post('/draft/pick')`, actualiza la mano y draft local.
  - **Mejoras:** manejar conflictos cuando otro jugador ya tomó la misma carta.
- `getPointSuspicionsParticipants`
  - **Qué hace:** normaliza la lista de participantes a partir del payload del backend.
  - **Mejoras:** mover lógica al handler que recibe el evento para mantenerlo cerca de la fuente.
- `startPointSuspicionsEvent`
  - **Qué hace:** inicializa estado y modal del evento con participantes y carta que lo disparó.
  - **Mejoras:** desacoplar UI-legible (mensajes) de estado puro para internacionalización.
- `handlePointSuspicionsStart` / `handlePointSuspicionsVoteEvent` / `confirmPointSuspicionsVote` / `handlePointSuspicionsCompleteEvent` / `handlePointSuspicionsSecretSelected`
  - **Qué hacen:** coordinan todo el ciclo del evento (inicio, registro de votos, confirmación del usuario local, procesamiento de resultados y revelación de secreto del perdedor).
  - **WebSocket/HTTP:** escuchan WebSocket y envían `post` cuando el jugador vota o debe revelar.
  - **Mejoras:** consolidar en hook `usePointSuspicionEvent` con reducer.
- `playSelectedSet`
  - **Qué hace:** envía `post('/sets')` con las cartas seleccionadas y actualiza `playerSets` y `gameState`.
  - **Mejoras:** validar al frente la compatibilidad de cartas para evitar rechazos del backend.
- `determineSetName`
  - **Qué hace:** genera un nombre amigable para el set basado en las cartas en selección.
  - **Mejoras:** mover a `utils/detectiveRules` para aprovechar la metadata centralizada.
- `openEventModal` / `closeEventModal`
  - **Qué hacen:** abre/cierra el modal contextual para cartas de evento, pidiendo confirmación antes de ejecutar `confirmPlayEvent`.
  - **WebSocket/HTTP:** el cierre opcional envía un mensaje a otros jugadores via `sendMessage` al indicar cancelación.
  - **Mejoras:** trackear qué jugador abrió el modal para evitar condiciones de carrera cuando llegan eventos externos.
- `fetchPlayerSecrets`
  - **Qué hace:** `get('/partidas/:id/secretos?jugadorId=...)`, normaliza listas y las expone a modales que necesitan secretos ajenos.
  - **Mejoras:** cachear por jugador y evadir llamadas duplicadas durante el mismo evento.
- `handleRevealSecretAction`
  - **Qué hace:** orquesta acciones que terminan en revelar/ocultar secretos según la carta/evento en ejecución; usa modales y actualiza estado local.
  - **WebSocket/HTTP:** según el modo, llama endpoints y envía WS para informar a otros.
  - **Mejoras:** separar en handlers por carta para reducir la cantidad de condicionales.
- `playEventCardsOff`, `playEventDelayMurderer`, `playEventLookIntoTheAshes`, `playEventAnotherVictim`, `playEventEarlyTrain`, `playEventCardTrade`
  - **Qué hacen:** encapsulan la llamada HTTP correspondiente a cada evento (p. ej. `post('/eventos/cards-off')`, `post('/delay-murderer')`, etc.), armando payloads específicos (target player, discard seleccionada, set objetivo, etc.).
  - **WebSocket/HTTP:** HTTP `post`; la difusión a los demás llega por WS.
  - **Mejoras:** unificar en un diccionario `eventHandlers` para que añadir nuevas cartas no implique añadir más `if/else`.
- `finalizeCardTradeResponse`
  - **Qué hace:** confirma o rechaza propuestas de Card Trade, haciendo `post`/`put` y limpiando estado local.
  - **Mejoras:** manejar `optimistic UI` para mostrar al usuario el resultado antes del round-trip.
- `confirmPlayEvent`
  - **Qué hace:** es la entrada única del modal de eventos: decide qué helper (de la lista anterior) ejecutar según `eventCardData.actionKey` y, si corresponde, orquesta reacciones “Not So Fast”.
  - **WebSocket/HTTP:** HTTP + WebSocket (vía `sendRevealRequestForAction`).
  - **Mejoras:** factorizar en un `switch` basado en un mapa `actionKey -> handler` para hacerlo escalable.
- `closeEventModal`
  - **Qué hace:** cierra el modal local y, si recibe `{cancelled: true}`, llama `announceEventCancelled` para notificar a otros.
  - **Mejoras:** aceptar un motivo para mejorar los mensajes que ven los otros jugadores.
- `enqueueRevealModal`
  - **Qué hace:** registra un modal pendiente (ej. para mostrar un secreto revelado en privado) y actualiza `secretoEnModal`.
  - **Mejoras:** controlar duplicados para que no se solapen modales cuando llegan varios eventos consecutivos.
- `onSkipNotSoFast`
  - **Qué hace:** cierra el modal de reacción y, si existe un executor pendiente, lo ejecuta inmediatamente.
  - **WebSocket/HTTP:** informa al backend si es necesario (p.ej. enviando `event: not_so_fast_skipped`).
  - **Mejoras:** mostrar un mensaje de confirmación para feedback del usuario.
- `onPlayNotSoFast`
  - **Qué hace:** si el jugador posee la carta, llama al backend para bloquear la acción (HTTP `post /eventos/not-so-fast`) y emite un mensaje por WebSocket.
  - **Mejoras:** verificar que la carta sigue en mano antes de intentar jugarla y mostrar qué acción se bloqueó.

### Flujo "Not So Fast" (detalle)

1. **Solicitud desde la acción original (`src/containers/TableroContainer/TableroContainer.jsx:5201`, `6483`, `6616`, `6739`).**
   - Antes de ejecutar acciones bloqueables (bajar un set, Card Trade, eventos como Early Train), el contenedor llama a `sendRevealRequestForAction` con un `payload` que describe la jugada y un `executor` con la lógica original. Así se congela la acción localmente mientras se espera la ventana de reacción.
   - Si el WebSocket no está disponible, algunas rutas (Card Trade) envían el mensaje original como fallback, pero en condiciones normales siempre se usa la vía WS.

2. **Emisión WebSocket y espera local (`src/containers/TableroContainer/TableroContainer.jsx:1153-1224`).**
   - `sendRevealRequestForAction` genera un `reactionId`, almacena el `payload` en refs, programa un `setTimeout` que ejecuta el `executor` si expira el plazo, y manda `sendMessage({ event: "pedir_revelar_secreto", data: requestPayload })` al backend/lobby.
   - También abre el prompt local (`setReactionPrompt`) para que el actor vea el countdown inmediato y marca `isWaitingForResponse`/`waitingMessage` para cubrir otros modales mientras se resuelve.

3. **Recepción de la invitación (`src/containers/TableroContainer/TableroContainer.jsx:2846-2868`).**
   - Todos los clientes escuchan `messages` y, al recibir `pedir_revelar_secreto` con `reactionId`, guardan el `payload` y llaman `setReactionPrompt`. Si el mensaje no trae `reactionId`, se trata de la semántica clásica de “revelar secreto” y se abre el `ChooseSecretModal` en lugar del prompt de reacción.

4. **Render del modal (`src/components/Tablero/Tablero.jsx:214-219` + `src/components/NotSoFastReactionModal/NotSoFastReactionModal.jsx`).**
   - El contenedor pasa `reactionPrompt`, `onPlayNotSoFast`, `onSkipNotSoFast` e `isSubmittingNotSoFast` como props al componente `<Tablero>`, que a su vez renderiza `<NotSoFastReactionModal>` encima de los demás modales (z-index alto). Así, aunque Dead Card Folly o EventModal estén abiertos, la reacción siempre aparece arriba.

5. **Responder a la ventana:**
   - `onSkipNotSoFast` (`src/containers/TableroContainer/TableroContainer.jsx:6779-6792`) limpia el prompt. Si quien omite la reacción es el mismo actor que inició la jugada, llama `executePendingAction` para correr el `executor` inmediatamente; los demás sólo cierran el modal y dejan que el flujo siga al expirar.
   - `onPlayNotSoFast` (`src/containers/TableroContainer/TableroContainer.jsx:6796-6828`) primero usa HTTP `get('/partidas/:id/cartas/estado')` para confirmar que el jugador todavía tiene la carta “Not So Fast…”. Luego hace `post('/partidas/:id/eventos/not-so-fast', {..., reactionId})`. Al completar, invoca `clearPendingReaction()` para cerrar prompts y timers.

6. **Broadcast y sincronización (`src/containers/TableroContainer/TableroContainer.jsx:2911-2946`).**
   - El backend puede enviar dos eventos: `not_so_fast` y `not_so_fast_jugado`. Ambos hacen `clearPendingReaction()`, muestran un toast con quién bloqueó a quién y, si la jugada era un flujo especial (Dead Card Folly), llaman `resetDeadCardFolly()` y limpian `waitingMessage` para que modales anteriores no queden congelados.

7. **Tareas pendientes si nadie reacciona.**
   - Cuando el countdown termina sin bloqueos, `executePendingAction` ejecuta el `executor` original (ej. `post('/jugar-y-resolver-set')`, envío WS del Card Trade). Así se evita duplicar lógica HTTP: se empaqueta en un `executor` y sólo se corre si nadie jugó la carta instantánea.

8. **Integración con otros modales.**
   - `TableroContainer` mantiene `isWaitingForResponse` para cubrir la UI con un overlay mientras la acción está pendiente, evitando que el usuario interactúe con modales como `EventModal` o `DeadCardFollyModal` después de haber pedido la reacción.
   - Al recibir `not_so_fast`, se invocan helpers como `resetDeadCardFolly` o `closeEventModal` para que los modales correspondientes desaparezcan y el tablero vuelva al estado neutro.

### Flujo para bajar un set de detectives

1. **Selección en la UI (`src/components/Tablero/Tablero.jsx`).** La vista mantiene `selectedIds` y detecta cuándo el jugador marca exactamente las cartas que quiere bajar. Sólo entonces habilita el botón de “Bajar set”.
2. **Validaciones previas (`src/containers/TableroContainer/TableroContainer.jsx:5150-5200`).** `playSelectedSet` comprueba turno activo, estado “Desgracia Social” y que las cartas seleccionadas formen un conjunto válido mediante `determineSetName` (que verifica cantidad, tipos y detecta sets especiales como Beresford).
3. **Efectos adicionales.** Si el set dispara un efecto (`getDetectiveEffect`, ej. Parker Pyne), se abre inmediatamente `ChooseSecretModal` para resolver la revelación/ocultamiento antes de tocar el backend.
4. **Ventana Not So Fast.** Para sets normales, se limpia la selección y se invoca `sendRevealRequestForAction` con `actionType: "play_set"`. El `executor` asociado hace `post('/partidas/:id/jugar-y-resolver-set', payload)` si nadie bloquea. Durante la espera se muestra el overlay general y se registran los datos para reintentar.
5. **Notificación por WebSocket.** Tras lanzar la solicitud, y siempre que `showSetNotifications` esté activo, se emite `set_notification` vía `sendMessage` para que el resto de clientes actualice HUDs o logs en tiempo real.
6. **Recuperación ante errores.** Si el backend rechaza la jugada, se muestra `toast.error` y se vuelve a pedir la mano actual con `get('/partidas/:id/cartas/estado')` para que la UI quede sincronizada.

### Flujo para agregar un detective a un set existente

1. **Apertura del modal (`openPlayDetectiveModal`, `src/containers/TableroContainer/TableroContainer.jsx:1064-1085`).** Tablero pasa `onOpenPlayDetectiveModal` a botones/contextuales; cuando no hay detectives disponibles se alerta al jugador.
2. **Selección y reglas (`handlePlayDetectiveConfirm`, líneas ~1390-1470).** El modal recopila carta y set. Antes de hacer llamadas se valida con `canCardJoinSet`, `harleyViolatesRule` e `isUnblockableCombination` para respetar reglas (Ariadne puede apuntar sets ajenos, Harley necesita detective real, Tommy/Tuppence forman combos imbatibles).
3. **Interacciones con secretos.** Si el set elegido requiere efectos extra (`getDetectiveEffect`), se activa `ChooseSecretModal` con `source: "add_detective"` y se guarda `pendingDetectiveAction`, de modo que al confirmar la revelación el flujo retome el payload original.
4. **POST al backend (`playDetectiveOnSet`, líneas ~1330-1390).** Una vez validados los ids, se arma el payload (`carta_id`, `set_id`, opcionalmente `jugador_id_objetivo`/`secreto_id_objetivo`) y se llama `post('/partidas/:id/agregar-carta-a-set', payload)`. Cualquier error 400 se muestra en toasts y se resetea `pendingDetectiveAction`.
5. **Cierre y estado.** `handlePlayDetectiveConfirm` siempre cierra el modal (`setShowPlayDetectiveModal(false)`) y, si la llamada falla, deja que `playDetectiveOnSet` arroje para que el usuario reintente o cambie de selección.

### Flujo general de cartas de evento

1. **Detección y apertura (`openEventModal`).** Cuando el jugador selecciona una carta clasificada como evento (`selectedIsEvent` en `Tablero.jsx`), se llama al callback `openEventModal(cartaId, cartaNombre)`, que guarda `eventCardData` y activa `showEventModal` en el contenedor.
2. **Configuración en `EventModal` (`src/components/EventModal/EventModal.jsx`).** El modal recibe la metadata de la carta (type, `actionKey`, requisitos de objetivo, descarte, sets o secretos) junto con `players`, `playersSets`, `discardTopFive`, etc. Desde aquí se recogen los datos específicos: jugador objetivo, secreto, carta del descarte, dirección de Dead Card Folly, etc.
3. **Confirmación (`confirmPlayEvent`, `src/containers/TableroContainer/TableroContainer.jsx:6602+`).** Al aceptar, el contenedor
   - Llama `announceEventInProgress` para actualizar el banner de estado y notificar al backend que el jugador está resolviendo una carta.
   - Dependiendo de `actionKey`, decide si necesita pedir Not So Fast (`sendRevealRequestForAction`) o si puede ejecutar directo (algunos eventos como `another victim` pueden deshabilitar bloqueos según payload).
   - Deriva en el helper correspondiente (ver lista abajo). Cada helper se encarga del `post`/`put` HTTP y de validar precondiciones locales (ej. cartas en el descarte).
4. **Integración con otros modales.** Eventos que requieren interacción con secretos (`cards-off-the-table`, `card trade`, `dead card folly`) disparan `ChooseSecretModal`, `DeadCardFollyModal`, `NotSoFastReactionModal` o `PointSuspicionsModal` según corresponda. Todos comparten el flag `isWaitingForResponse` para que la UI no permita acciones paralelas.
5. **Finalización.** Al completar o cancelar, `closeEventModal` limpia `eventCardData` y, si fue cancelado manualmente, envía `evento_cancelado` por WebSocket para que el resto de la mesa actualice su mensaje de estado.

**Helpers específicos de eventos (todos en `src/containers/TableroContainer/TableroContainer.jsx`):**

- `playEventCardsOff` (~6145): `post('/eventos/cards-off-the-table')` con jugador objetivo; no bloquea localmente salvo mostrar toast ante error.
- `playEventDelayMurderer` (~6161): valida que haya cartas en descarte y luego `post('/eventos/delay-the-murderer')`; si no hay descarte lanza error con `toastHandled` para evitar mensajes duplicados.
- `playEventPointSuspicion` (~898): activa `/eventos/point-your-suspicion/activar`, y al éxito llama `startPointSuspicionsEvent` para mostrar el modal de votación.
- `startDeadCardFollyFlow` y `submitDeadCardFollySelections` (sección inicial del archivo): preparan `DeadCardFollyModal`, recolectan cartas y finalmente `post('/eventos/dead-card-folly')` cuando todos confirman.
- `playEventLookIntoTheAshes` (~6310): espera la carta elegida del descarte y `post('/eventos/look-into-the-ashes')`, validando que haya suficientes cartas y actualizando el modal de descarte.
- `playEventAnotherVictim` (~6351): requiere `setId` objetivo; envía `post('/eventos/another-victim')` y actualiza `Set`/secretos mediante eventos WebSocket.
- `playEventEarlyTrain` (~6407): mueve cartas del mazo al descarte con `post('/eventos/early-train')`, mostrando mensaje de éxito genérico.
- `playEventCardTrade` (~6429) y `finalizeCardTradeResponse` (~6527): manejan tanto la propuesta (WS + Not So Fast + overlay) como la respuesta final (`post('/eventos/card-trade')`).
- `playEventCardTrade` también conecta con `Not So Fast` antes de notificar al objetivo, y `finalizeCardTradeResponse` limpia `pendingCardTrade` al terminar.

Estos helpers muestran el mismo patrón: preparar el contexto (targets, descartes, sets), llamar al endpoint REST adecuado y dejar que la sincronización global continúe por WebSocket (`messages` listener maneja la actualización del estado en todos los clientes).

## `src/components/ChooseSecretModal/ChooseSecretModal.jsx`

- `ChooseSecretModal`
  - **Qué hace:** modal multifunción que cubre los flujos de revelar/ocultar secretos según el modo (p. ej. Dead Card Folly + Blackmailed, Parker Pyne, Social Faux Pas). Gestiona selección de jugador, secreto, obtiene secretos remotos y muestra mensajes contextualizados.
  - **Por qué es así:** la misma UI sirve para todos los eventos que involucran secretos, por eso se parametriza con `mode`, `players`, `secrets`, `allSecretsRaw`, etc.
  - **WebSocket/HTTP:** no llama directamente; cuando necesita secretos ajenos usa `fetchPlayerSecrets` (HTTP) entregado por el contenedor.
  - **Mejoras:** separar la lógica en hooks (`useSecretOptions`) para reducir el número de `console.log` y evitar recalcular listas cuando no cambian.
- `handleSelectPlayer`
  - **Qué hace:** actualiza el jugador seleccionado, resetea el secreto y, si existe `fetchPlayerSecrets`, realiza la llamada para poblar `remoteSecrets`.
  - **Por qué es así:** los secretos disponibles dependen del jugador elegido y pueden requerir datos del backend.
  - **Mejoras:** guardar en caché por jugador para no repetir descargas al cambiar entre ellos.
- `getModalText` / `getButtonText` / `getErrorText`
  - **Qué hacen:** devuelven textos adaptados al modo actual para título, CTA y mensajes de error.
  - **Por qué es así:** cada evento necesita copy distinto; tener funciones centralizadas evita múltiples `switch` en JSX.
  - **Mejoras:** mover los mensajes a una tabla de configuración para soportar traducciones.

## `src/components/DeadCardFollyModal/DeadCardFollyModal.jsx`

- `DeadCardFollyModal`
  - **Qué hace:** modal memorizado (`memo`) que guía a los jugadores durante el evento Dead Card Folly, permitiendo seleccionar carta, mostrando pendientes, y confirmando recepción.
  - **Por qué es así:** separa la UI compleja del flujo del contenedor y evita renders innecesarios con `memo` y props controladas.
  - **WebSocket/HTTP:** no realiza llamadas; usa callbacks (`onSelect`, `onConfirm`, etc.) que el contenedor conecta a WebSocket/HTTP.
  - **Mejoras:** extraer componentes para la tarjeta y el banner de estado para simplificar.
- `renderWaitingMessage`
  - **Qué hace:** retorna el mensaje contextual según `status`, `locked` y jugadores pendientes.
  - **Por qué es así:** encapsula reglas de copy para no saturar el JSX principal.
  - **Mejoras:** permitir personalizar mensajes desde props.

## `src/components/EventModal/EventModal.jsx`

- `EventModal`
  - **Qué hace:** modal genérico para todas las cartas de evento. Determina si se requiere objetivo, secreto, carta del descarte, set o intercambio; maneja estado local (jugador seleccionado, secreto, dirección de Dead Card Folly, cartas ofrecidas para Card Trade) y coordina confirmaciones/cancelaciones.
  - **Por qué es así:** concentra el UX de eventos en un solo componente reutilizable, reduciendo duplicación frente a la gran variedad de cartas.
  - **WebSocket/HTTP:** no llama directamente; comunica la selección mediante `onConfirm` y deja que el contenedor dispare HTTP/WS.
  - **Mejoras:** dividir en subcomponentes (sección de selección de jugador, descarte, sets) para que el archivo deje de tener casi 1 000 líneas y sea testeable.
- `renderCardTypeBadge`
  - **Qué hace:** devuelve clases para pintar la etiqueta de tipo (event/detective/etc.).
  - **Mejoras:** compartir lógica con el componente `<Tablero />` para evitar duplicidad.
- `getIncomingMessage`
  - **Qué hace:** arma el mensaje que se ve cuando se recibe un evento iniciado por otro jugador (modo viewer).
  - **Mejoras:** consolidar mensajes en un diccionario o archivo de traducciones.
- `getSetOwnerName`, `publicSecretsByPlayer`, `mySecretOptions`
  - **Qué hacen:** helpers memorizados (`useMemo`) para mapear owner ↔ nombre y filtrar secretos disponibles según contexto (publicados, míos, obtenidos vía fetch).
  - **Mejoras:** mover a hooks personalizados para reusar en otros componentes que necesitan la misma info (p. ej. `ChooseSecretModal`).

## `src/components/NotSoFastReactionModal/NotSoFastReactionModal.jsx`

- `formatCountdown`
  - **Qué hace:** convierte milisegundos en segundos enteros para mostrar cuánto falta antes de que expire la reacción.
  - **Por qué es así:** el modal solo necesita un número pequeño, evitando cálculos en JSX.
  - **Mejoras:** mostrar décimas y manejar formatos locales.
- `NotSoFastReactionModal`
  - **Qué hace:** muestra quién está intentando una acción bloqueable, cuánto tiempo queda y ofrece botones para jugar o saltar “Not So Fast”.
  - **Por qué es así:** al separar este flujo del contenedor se simplifica la lógica de timers con un `useEffect` que actualiza el contador cada 200 ms.
  - **WebSocket/HTTP:** no interactúa directamente; recibe callbacks `onPlay/onSkip` que conectan con `TableroContainer`.
  - **Mejoras:** añadir accesibilidad (focus trap) y mostrar historial de reacciones previas.

## `src/components/PlayDetectiveModal/PlayDetectiveModal.jsx`

- `getCardTitle`, `getSetKey`
  - **Qué hacen:** funciones auxiliares para mostrar el nombre amigable de una carta y normalizar ids de sets.
  - **Por qué es así:** evitan repetir conversiones y llamadas a `Number`.
  - **Mejoras:** mover a un archivo de utilidades compartido.
- `PlayDetectiveModal`
  - **Qué hace:** permite al jugador elegir un detective de su mano y un set válido (propio o ajeno si es Ariadne) para jugarlo, validando reglas (Harley, combinaciones imbatibles) con ayuda de `detectiveRules`.
  - **Por qué es así:** agrega una capa de UX antes de invocar al backend, evitando enviar jugadas ilegales.
  - **WebSocket/HTTP:** no llama directamente; usa `onConfirm` para delegar en el contenedor.
  - **Mejoras:** mostrar feedback inmediato cuando una selección viola una regla específica (por ejemplo, resaltar en rojo el set inválido en vez de sólo mostrar un texto).

## `src/components/PointSuspicionsModal/PointSuspicionsModal.jsx`

- `PointSuspiciousModal`
  - **Qué hace:** muestra el flujo de votación del evento Point Your Suspicious, indicando participantes, votos recibidos, pendientes y resultados (incluyendo revotes o revelaciones obligatorias).
  - **Por qué es así:** desacopla el UI complejo del estado manejado en `TableroContainer`, reutilizando `useMemo` para mapear ids a jugadores.
  - **WebSocket/HTTP:** no invoca directamente; emite acciones vía `onSelect`, `onConfirmVote`, `onClose`.
  - **Mejoras:** convertir secciones (`renderVotingSection`, `renderResults`) en componentes hijos para reducir lógica condicional.
- `renderVotingSection`
  - **Qué hace:** UI que lista candidatos, permite seleccionar uno y mostrar cuántos votos se registraron.
  - **Mejoras:** permitir búsqueda o filtros cuando hay muchos jugadores.
- `renderResults`
  - **Qué hace:** muestra resumen de conteo y resalta empates o ganador.
  - **Mejoras:** añadir animaciones para comunicar mejor el cambio de estado.

## `src/components/Tablero/Tablero.jsx`

- `renderCardTypeBadge`
  - **Qué hace:** devuelve clases para colorear badges según el tipo de carta (detective, evento, etc.).
  - **Por qué es así:** mantiene el JSX limpio aplicando la misma convención visual que otros componentes.
  - **Mejoras:** exportar a un módulo compartido con `EventModal`.
- `formatEventTimestamp`
  - **Qué hace:** formatea timestamps a `HH:MM` para el registro de eventos.
  - **Mejoras:** respetar configuración regional del usuario.
- `getSecretImage`
  - **Qué hace:** decide si mostrar el reverso genérico o la carta “Soy el asesino” según la descripción.
  - **Mejoras:** mapear más descripciones (otros idiomas) y delegar a `CardImageMapper`.
- `getPlayerTotalSecrets`
  - **Qué hace:** determina el número total de secretos de un jugador, priorizando `allSecretsRaw` y cayendo a `gameState` o defaults.
  - **Mejoras:** evitar `console.log` y procesar todo en el contenedor para que el componente sólo reciba valores finales.
- `handleDiscardAreaClick` / `handleDiscardAreaKeyDown`
  - **Qué hacen:** abren el modal de descarte al click o al presionar Enter/Espacio sobre el área correspondiente.
  - **Mejoras:** mover al contenedor si se desea que el tablero sea puramente presentacional.
- `Tablero`
  - **Qué hace:** renderiza toda la UI del tablero: mano del jugador, sets, secretos, eventos pendientes, modales condicionados (Dead Card Folly, Point Suspicious, Not So Fast, etc.) y el log de acciones.
  - **Por qué es así:** concentra la presentación mientras delega en callbacks (`handleDrawCard`, `playSelectedSet`, etc.) provistos por `TableroContainer`.
  - **WebSocket/HTTP:** no invoca directamente; se limita a eventos de UI.
  - **Mejoras:** descomponer en subcomponentes (mano, barra lateral, modales) para reducir las más de 1 100 líneas.

## `src/setupTests.js`

- No define funciones; simplemente registra `@testing-library/jest-dom` para añadir matchers personalizados a Jest/Vitest.

## Archivos `*.test.jsx`

Los archivos de prueba bajo `src/components` y `src/containers` (p. ej. `Lobby.test.jsx`, `CreateGameForm.test.jsx`, etc.) sólo definen suites `describe/it` proporcionadas por Vitest y helpers locales como `renderLobby`. Estas funciones no consumen WebSocket ni `HttpService`; se limitan a renderizar componentes con Testing Library, disparar eventos (`userEvent`) y hacer `expect`. Las oportunidades de mejora pasan por ampliar la cobertura para eventos complejos (Dead Card Folly, Point Suspicious) y usar `msw` para simular HTTP cuando corresponda.


## Resumen del flujo “Not So Fast…”

1. **Disparo desde acciones bloqueables**  
   Antes de ejecutar un set, evento o Card Trade, `TableroContainer` llama a `sendRevealRequestForAction` en lugar de usar el endpoint al instante. Se genera un `reactionId`, se prepara el payload con la descripción de la jugada y se registra un `executor` (la función que realmente hará el `POST`/`PUT` si nadie bloquea).

2. **Propagación por WebSocket y estado local**  
   `sendRevealRequestForAction` emite `sendMessage({ event: "pedir_revelar_secreto", data: requestPayload })`, de modo que todos los clientes reciben el aviso y actualizan su propio `reactionPrompt`. Localmente también se hace `setReactionPrompt` y se muestra un overlay (`isWaitingForResponse`) mientras corre el countdown.

3. **Render del modal**  
   `Tablero` recibe `reactionPrompt`, `onPlayNotSoFast`, `onSkipNotSoFast` e `isSubmittingNotSoFast` como props. Con eso monta `<NotSoFastReactionModal>`, que muestra quién intenta la acción, cuánto tiempo queda y qué botones están disponibles (dependiendo de si el jugador tiene la carta).

4. **Respuesta del jugador**  
   - `onPlayNotSoFast` verifica mediante `get('/cartas/estado')` que la carta “Not So Fast…” siga en la mano y luego llama `post('/eventos/not-so-fast', {..., reactionId})`.  
   - `onSkipNotSoFast` cierra el modal; si quien lo pulsa es el mismo actor que inició la acción, se invoca `executePendingAction()` para correr el `executor` en ese instante.

5. **Resolución automática o cancelación**  
   Si el countdown termina sin bloqueos, `executePendingAction` ejecuta el `executor` y recién ahí se golpea el endpoint del evento/set. Si algún jugador bloquea, el backend reenvía `not_so_fast` / `not_so_fast_jugado`, todos hacen `clearPendingReaction()` y, si el flujo era especial (ej. Dead Card Folly), se limpian sus modales asociados.

En síntesis, el flujo separa por completo la lógica de reacción instantánea de la UI: el contenedor coordina WebSocket + HTTP y usa `reactionPrompt` como contrato con el componente `Tablero`, que se limita a renderizar el modal y disparar los callbacks proporcionados.
