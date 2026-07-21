import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import TimeoutModal from './TimeoutModal';

describe('TimeoutModal', () => {
  it('should not render when isVisible is false', () => {
    const { container } = render(
      <TimeoutModal
        isVisible={false}
        timeRemaining={120}
        isMyTurn={true}
        onTimeUp={vi.fn()}
        showTimeUpMessage={false}
      />
    );
    
    expect(container.firstChild).toBeNull();
  });

  it('should render timer when it is my turn and not showing time up message', () => {
    render(
      <TimeoutModal
        isVisible={true}
        timeRemaining={90}
        isMyTurn={true}
        onTimeUp={vi.fn()}
        showTimeUpMessage={false}
      />
    );
    
    expect(screen.getByText('Tu turno')).toBeInTheDocument();
    expect(screen.getByText('1:30')).toBeInTheDocument();
  });

  it('should display green color when time remaining is more than 60 seconds', () => {
    const { container } = render(
      <TimeoutModal
        isVisible={true}
        timeRemaining={90}
        isMyTurn={true}
        onTimeUp={vi.fn()}
        showTimeUpMessage={false}
      />
    );
    
    const timerElement = container.querySelector('.text-green-500');
    expect(timerElement).toBeInTheDocument();
  });

  it('should display yellow color when time remaining is between 30 and 60 seconds', () => {
    const { container } = render(
      <TimeoutModal
        isVisible={true}
        timeRemaining={45}
        isMyTurn={true}
        onTimeUp={vi.fn()}
        showTimeUpMessage={false}
      />
    );
    
    const timerElement = container.querySelector('.text-yellow-500');
    expect(timerElement).toBeInTheDocument();
  });

  it('should display red color and animate when time remaining is less than 30 seconds', () => {
    const { container } = render(
      <TimeoutModal
        isVisible={true}
        timeRemaining={15}
        isMyTurn={true}
        onTimeUp={vi.fn()}
        showTimeUpMessage={false}
      />
    );
    
    const timerElement = container.querySelector('.text-red-500');
    expect(timerElement).toBeInTheDocument();
    expect(timerElement).toHaveClass('animate-pulse');
  });

  it('should render time up message modal when showTimeUpMessage is true', () => {
    render(
      <TimeoutModal
        isVisible={true}
        timeRemaining={0}
        isMyTurn={true}
        onTimeUp={vi.fn()}
        showTimeUpMessage={true}
      />
    );
    
    expect(screen.getByText('¡Se acabó el tiempo!')).toBeInTheDocument();
    expect(screen.getByText('Tu turno ha finalizado automáticamente.')).toBeInTheDocument();
    expect(screen.getByText(/Se descartó automáticamente/i)).toBeInTheDocument();
  });

  it('should hide the turn timer while showing the time up modal', () => {
    render(
      <TimeoutModal
        isVisible={true}
        timeRemaining={0}
        isMyTurn={true}
        onTimeUp={vi.fn()}
        showTimeUpMessage={true}
      />
    );

    expect(screen.getByText('¡Se acabó el tiempo!')).toBeInTheDocument();
    expect(screen.queryByText('Tu turno')).not.toBeInTheDocument();
  });

  it('should call onTimeUp when clicking the "Entendido" button', async () => {
    const user = userEvent.setup();
    const mockOnTimeUp = vi.fn();
    
    render(
      <TimeoutModal
        isVisible={true}
        timeRemaining={0}
        isMyTurn={true}
        onTimeUp={mockOnTimeUp}
        showTimeUpMessage={true}
      />
    );
    
    const button = screen.getByText('Entendido');
    await user.click(button);
    
    expect(mockOnTimeUp).toHaveBeenCalledTimes(1);
  });

  it('should format time correctly (minutes:seconds)', () => {
    render(
      <TimeoutModal
        isVisible={true}
        timeRemaining={125}
        isMyTurn={true}
        onTimeUp={vi.fn()}
        showTimeUpMessage={false}
      />
    );
    
    expect(screen.getByText('2:05')).toBeInTheDocument();
  });

  it('should not render timer when not my turn', () => {
    const { container } = render(
      <TimeoutModal
        isVisible={true}
        timeRemaining={90}
        isMyTurn={false}
        onTimeUp={vi.fn()}
        showTimeUpMessage={false}
      />
    );
    
    expect(screen.queryByText('Tu turno')).not.toBeInTheDocument();
  });

  it('should update progress bar based on time remaining', () => {
    const { container } = render(
      <TimeoutModal
        isVisible={true}
        timeRemaining={60}
        isMyTurn={true}
        onTimeUp={vi.fn()}
        showTimeUpMessage={false}
      />
    );
    
    const progressBar = container.querySelector('.bg-yellow-500');
    expect(progressBar).toBeInTheDocument();
    expect(progressBar).toHaveStyle({ width: '50%' });
  });

  it('should show time up message modal even when not my turn', () => {
    render(
      <TimeoutModal
        isVisible={true}
        timeRemaining={0}
        isMyTurn={false}
        onTimeUp={vi.fn()}
        showTimeUpMessage={true}
      />
    );
    
    expect(screen.getByText('¡Se acabó el tiempo!')).toBeInTheDocument();
    expect(screen.getByText('Entendido')).toBeInTheDocument();
  });
});
