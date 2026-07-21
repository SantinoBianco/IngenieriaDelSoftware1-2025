import { useState, useEffect } from "react";

import PartidaItem from "../../components/PartidaItem/PartidaItem";
import CreateGameForm from "../../components/CreateGameForm/CreateGameForm";
import JoinGameForm from "../../components/JoinGameForm/JoinGameForm";
import LobbyContainer from "../LobbyContainer/LobbyContainer";
import TableroContainer from "../TableroContainer/TableroContainer";

import { useWebSocket } from "../../hooks/useWebSocket";
import { get, post } from "../../services/HttpService";

export default function InicioContainer() {
  const [partidas, setPartidas] = useState([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showJoinForm, setShowJoinForm] = useState(false);
  const [selectedPartida, setSelectedPartida] = useState(null);
  const [currentView, setCurrentView] = useState("menu"); // "menu" | "lobby"
  const [gameConfig, setGameConfig] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

  // WebSocket 
  const { isConnected, sendMessage, messages } = useWebSocket("ws://localhost:8000/ws/lobby");

  // Cargar partidas del backend
  useEffect(() => {
    get("/partidas")
      .then(partidas => {
        setPartidas(partidas);
      })
      .catch(error => {
        setPartidas([]); // Lista vacía en caso de error
      });
  }, []);

  // Escuchar mensajes del WebSocket 
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage) {
      switch (lastMessage.event) {
        case "partida_creada":
          setPartidas(prev => {
            // Verificar si la partida ya existe antes de agregarla
            const partidaExiste = prev.some(p => p.id === lastMessage.data.id);
            if (partidaExiste) {
              return prev; 
            }
            return [...prev, lastMessage.data];
          });
          break;
          
        case "jugador_unido": {
          const payload = lastMessage.data || {};
          
          // Recargar la lista 
          get("/partidas")
            .then(partidasActualizadas => {
              console.log("Lista actualizada después de jugador_unido:", partidasActualizadas);
              setPartidas(partidasActualizadas);
            })
            .catch(error => {
              console.error('Error al recargar después de jugador_unido:', error);
            });
          break;
        }

        case "jugador_manual_salida": {
          // Cuando un jugador sale manualmente de una partida, recargamos la lista
          // para que nuevos usuarios vean el cambio inmediatamente.
          get('/partidas')
            .then(partidasActualizadas => {
              console.log('Actualizando lista tras jugador_manual_salida');
              setPartidas(partidasActualizadas);
            })
            .catch(e => console.error('Error recargando partidas tras salida manual:', e));
          break;
        }

        case "jugador_desconectado": {
          // Cuando el backend notifica que un jugador se desconectó (o fue eliminado),
          // recargamos la lista de partidas para mantenerla consistente en la vista "Inicio".
          get('/partidas')
            .then(partidasActualizadas => {
              console.log('Actualizando lista tras jugador_desconectado');
              setPartidas(partidasActualizadas);
            })
            .catch(e => console.error('Error recargando partidas tras jugador_desconectado:', e));
          break;
        }

        case "estado_lobby": {
          // El backend puede enviar el estado completo del lobby para una partida.
          // Actualizamos la partida concreta en la lista (sin recargar toda la lista).
          const payload = lastMessage.data || {};
          if (payload.id) {
            setPartidas(prev =>
              prev.map(p =>
                p.id === payload.id
                  ? {
                      ...p,
                      nombre: payload.nombre ?? p.nombre,
                      maxJugadores: payload.maxJugadores ?? p.maxJugadores,
                      cantidad_jugadores: Array.isArray(payload.players)
                        ? payload.players.length
                        : payload.cantidad_jugadores ?? p.cantidad_jugadores
                    }
                  : p
              )
            );
          }
          break;
        }

        case "partida_eliminada": {
          // Manejo: el backend eliminó la partida, eliminarla de la lista
          // o recargar la lista como fallback si no viene el id.
          const payload = lastMessage.data || {};
          if (payload.partidaId) {
            setPartidas(prev => prev.filter(p => p.id !== payload.partidaId));
          } else {
            get('/partidas')
              .then(partidasActualizadas => {
                setPartidas(partidasActualizadas);
              })
              .catch(e => console.error('Error recargando partidas tras partida_eliminada:', e));
          }
          break;
        }
          
        case "partida_actualizada":
          // Actualizar información de la partida
          setPartidas(prev =>
            prev.map(partida =>
              partida.id === lastMessage.data.id
                ? lastMessage.data
                : partida
            )
          );
          break;
          
        case "juego_iniciado": {
          const payload = lastMessage.data || {};
          console.log("Juego iniciado:", payload);
          
          if (payload.partidaId) {
            // Remover la partida de la lista de todas formas
            console.log("Removiendo partida de la lista:", payload.partidaId);
            setPartidas(prev => 
              prev.filter(partida => partida.id !== payload.partidaId)
            );
          }
          break;
        }
        
        case "error":
          alert(`Error del servidor: ${lastMessage.data.message}`);
          break;
      }
    }
  }, [messages]);

  const handleClick = (partida) => {
    setSelectedPartida(partida);
    setShowJoinForm(true);
  };

  const handleCreateGame = async (formData) => {
    try {
      // Crear la partida en el backend
      const nuevaPartida = await post("/partidas", {
        ...formData,
        privada: Boolean(formData.privada),
        password: formData.privada ? formData.password : null,
      });
      
      console.log("Respuesta del backend:", nuevaPartida); 
      
      // Enviar mensaje WebSocket para notificar creación de partida
      if (isConnected) {
        sendMessage({
          event: "crear_partida",
          data: {
            partidaId: nuevaPartida.id,
            nombre: nuevaPartida.nombre,
            maxJugadores: nuevaPartida.maxJugadores,
            createdBy: formData.nombreUsuario,
            privada: nuevaPartida.privada,
          }
        });
      }
      
      // Crear el usuario con el formulario
      const usuario = {
        id: nuevaPartida.host,  // El backend guarda el host ID
        nombre: formData.nombreUsuario,
        fechaNacimiento: formData.fechaNacimiento
      };
      
      // Guardar el usuario actual
      setCurrentUser(usuario);
      
      // Cerrar modal y navegar al lobby
      setShowCreateForm(false);
      // Pequeño delay para asegurar que el estado se actualice
      setTimeout(() => {
        setGameConfig({
          ...nuevaPartida, // Datos del backend
          partidaId: nuevaPartida.id, 
          isJoining: false // Flag para indicar que está creando
        }); 
        setCurrentView("lobby");
      }, 100);
      
    } catch (error) {
      console.error("Error completo:", error);
      alert(`Error al crear la partida: ${error.message}`);
    }
  };

  const crearPartida = () => {
    setShowCreateForm(true);
  };

  const handleJoinGame = async (formData) => {
    try {
      const requestBody = {
        nombreUsuario: formData.nombreUsuario,
        fechaNacimiento: formData.fechaNacimiento,
      };

      if (typeof formData.contraseña === "string") {
        requestBody.contraseña = formData.contraseña;
      } else if (typeof formData.password === "string") {
        requestBody.contraseña = formData.password;
      }

      const response = await post(`/partidas/${formData.partidaId}/join`, requestBody);

      const usuario = {
        id: response.jugador_id,
        nombre: response.username,
        fechaNacimiento: response["cumpleaños"],
      };
      setCurrentUser(usuario);

      const partidaSeleccionada = partidas.find(p => p.id === formData.partidaId) || selectedPartida || {};
      const gameConfiguration = {
        ...partidaSeleccionada,
        partidaId: partidaSeleccionada.id || formData.partidaId,
        maxJugadores: partidaSeleccionada.maxJugadores || partidaSeleccionada.jugadoresMax,
        isJoining: true,
      };

      setShowJoinForm(false);

      setTimeout(() => {
        setGameConfig(gameConfiguration);
        setCurrentView("lobby");
      }, 100);

      return { usuario, gameConfiguration };
    } catch (error) {
      if (error?.status === 401 || error?.status === 403) {
        throw error;
      }

      console.error("Error al unirse a la partida:", error);
      throw error;
    }
  };

  const closeJoinForm = () => {
    setShowJoinForm(false);
    setSelectedPartida(null);
  };

  const handleBackToMenu = () => {
    setCurrentView("menu");
    setGameConfig(null);
    setCurrentUser(null); // Limpiar usuario al volver al menú
    setShowJoinForm(false); // Cerrar formulario de unirse si está abierto
    setSelectedPartida(null); // Limpiar partida seleccionada
    // Recargar la lista de partidas cuando regresamos al menú
    get('/partidas')
      .then(partidas => {
        setPartidas(partidas.filter(partida => partida.estado === 'lobby' || !partida.estado));
      })
      .catch(error => {
        console.error('Error al recargar partidas:', error);
      });
  };

  const handleGoToTablero = (gameData) => {
    setGameConfig(gameData);
    setCurrentView("tablero");
  }

  // Si estamos en el tablero, mostrar el tablero
  if(currentView === "tablero" && gameConfig) {
    return (
      <TableroContainer
        gameData={gameConfig}
        currentUser={currentUser}
        isConnected={isConnected}
        sendMessage={sendMessage}
        message={messages}
      />
    );
  }
  // Si estamos en el lobby, mostrar el lobby
  if (currentView === "lobby" && gameConfig) {
    return (
      <LobbyContainer
        gameConfig={gameConfig}
        currentUser={currentUser}
        onBackToMenu={handleBackToMenu}
        onGoToTablero={handleGoToTablero}
        isConnected={isConnected}
        sendMessage={sendMessage}
        messages={messages}
      />
    );
  }

  return (
    <div
    
    className=" min-h-screen flex justify-center items-start pt-55 w-150 bg-opacity-50 "
    >
      <div className="bg-black/60 p-8 rounded-2xl shadow-xl w-full max-w-3xl h-[90vh] flex flex-col">
       
        {/* Botón */}
        <button
          onClick={crearPartida}
          className="px-8 py-3 bg-red-600 rounded-full hover:bg-red-700 transition text-white font-bold shadow-lg mb-6 mx-auto"
        >
          Crear Partida
        </button>

        {/* Lista de partidas */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-2">
          {partidas.length === 0 ? (
            <p className="text-center text-gray-300">No hay partidas disponibles</p>
          ) : (
            partidas
              .filter(partida => partida.estado === 'lobby' || !partida.estado)
              .map((item) => (
              <PartidaItem
                key={item.id}
                partida={item}
                onClick={() => handleClick(item)}
                sendMessage={sendMessage}
                isConnected={isConnected}
              />
            ))
          )}
        </div>

        {/* Modal del formulario */}
          <CreateGameForm
            isOpen={showCreateForm}
            onClose={() => setShowCreateForm(false)}
            onCreateGame={handleCreateGame}
          />

          <JoinGameForm
            isOpen={showJoinForm}
            onClose={closeJoinForm}
            onJoinGame={handleJoinGame}
            partida={selectedPartida}
          />
      </div>
    </div>
  );
}
