import { useEffect, useRef, useState } from "react";

export function useWebSocket(url) {
  const socketRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState([]);
  const [playerCards, setPlayerCards] = useState([]);

  useEffect(() => {
    function connect() {
      const socket = new WebSocket(url);

      socket.onopen = () => {
        console.log("WS conectado");
        setIsConnected(true);
      };

      socket.onclose = () => {
        console.log("WS desconectado, reintentando...");
        setIsConnected(false);
        setTimeout(connect, 3000); // reconectar en 3s
      };

      socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log("Mensaje recibido:", data);
        setMessages((prev) => [...prev, data]);
      };

      socket.onerror = (err) => {
        console.error("WS error:", err);
        socket.close();
      };

      socketRef.current = socket;
    }

    connect();

    return () => socketRef.current?.close();
  }, [url]);

  const sendMessage = (msg) => {
    console.log("Intentando enviar mensaje:", msg);
    console.log("Socket state:", socketRef.current?.readyState);
    
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      console.log("Enviando mensaje...");
      socketRef.current.send(JSON.stringify(msg));
    } else {
      console.error("WebSocket no está abierto. ReadyState:", socketRef.current?.readyState);
    }
  };

  return { isConnected, messages, sendMessage, playerCards, setPlayerCards };
}
