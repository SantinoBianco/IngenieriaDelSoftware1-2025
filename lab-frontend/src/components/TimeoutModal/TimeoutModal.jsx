import React, { useEffect, useState } from 'react';

const TimeoutModal = ({ 
  isVisible, 
  timeRemaining, 
  isMyTurn, 
  onTimeUp,
  showTimeUpMessage = false 
}) => {
  const [progress, setProgress] = useState(100);
  
  useEffect(() => {
    if (timeRemaining > 0) {
      const percentage = (timeRemaining / 120) * 100;
      setProgress(percentage);
    } else {
      setProgress(0);
    }
  }, [timeRemaining]);

  const getTimerColor = () => {
    if (timeRemaining > 60) {
      return 'text-green-500 border-green-500';
    } else if (timeRemaining > 30) {
      return 'text-yellow-500 border-yellow-500';
    } else {
      return 'text-red-500 border-red-500 animate-pulse';
    }
  };

  const getProgressColor = () => {
    if (timeRemaining > 60) {
      return 'bg-green-500';
    } else if (timeRemaining > 30) {
      return 'bg-yellow-500';
    } else {
      return 'bg-red-500';
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isVisible) return null;

  return (
    <>
      {isMyTurn && !showTimeUpMessage && (
        <div className="fixed top-4 right-4 z-50">
          <div className={`bg-gray-800 border-2 rounded-lg p-4 shadow-2xl ${getTimerColor()}`}>
            <div className="flex flex-col items-center">
              <div className="text-sm font-semibold mb-2">Tu turno</div>
              <div className="text-3xl font-bold mb-2">
                {formatTime(timeRemaining)}
              </div>
              <div className="w-32 h-2 bg-gray-700 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-1000 ${getProgressColor()}`}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {showTimeUpMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75">
          <div className="bg-gray-800 border-2 border-red-500 rounded-lg p-6 max-w-md mx-4 shadow-2xl">
            <div className="flex flex-col items-center text-center">
              <div className="text-6xl mb-4">⏰</div>
              <h2 className="text-2xl font-bold text-red-500 mb-4">
                ¡Se acabó el tiempo!
              </h2>
              <p className="text-gray-300 mb-4">
                Tu turno ha finalizado automáticamente.
              </p>
              <p className="text-gray-400 text-sm mb-6">
                Se descartó automáticamente la primera carta de tu mano y se pasó el turno al siguiente jugador.
              </p>
              <button
                onClick={onTimeUp}
                className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-colors"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default TimeoutModal;
