// src/contexts/GameContext.jsx
import { createContext, useContext, useState } from "react";

const GameContext = createContext();

export const GameProvider = ({ children }) => {
  // Estado temporal (mock)
  const [game, setGame] = useState({
    id: null,
    players: [],
    status: "waiting", // waiting | playing | finished
  });

  // Estado para las cartas del jugador actual
  const [playerCards, setPlayerCards] = useState([]);

  // Funcion para actualizar cartas
  const updatePlayerCards = (cards) => {
    console.log("Actualizando cartas del jugador:", cards);
    setPlayerCards(cards);
  };

  return (
    <GameContext.Provider value={{ game, startGame, resetGame, playerCards, updatePlayerCards}}>
      {children}
    </GameContext.Provider>
  );
};

export const useGame = () => useContext(GameContext);