import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';

import NotSoFastReactionModal from './NotSoFastReactionModal';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('NotSoFastReactionModal', () => {
  it('no renderiza nada cuando no hay reacción', () => {
    const { container } = render(<NotSoFastReactionModal reaction={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('muestra la información de la reacción y actualiza la cuenta regresiva', () => {
    vi.useFakeTimers();
    let now = 1_000_000;
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now);

    const reaction = {
      id: 'rx-123',
      actorName: 'Alice',
      actionSummary: 'usar un evento',
      blockable: true,
      expiresAt: now + 4000,
    };

    render(
      <NotSoFastReactionModal
        reaction={reaction}
        hasNotSoFastCard
        onPlay={vi.fn()}
        onSkip={vi.fn()}
      />,
    );

    expect(
      screen.getByText('Alice está intentando usar un evento.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('¿Querés jugar “Not So Fast”?'),
    ).toBeInTheDocument();
    expect(screen.getByText('4 s')).toBeInTheDocument();

    now += 2400;
    act(() => {
      vi.advanceTimersByTime(2400);
    });

    expect(screen.getByText('2 s')).toBeInTheDocument();

    nowSpy.mockRestore();
  });

  it('muestra mensaje informativo cuando no tiene la carta Not So Fast disponible', () => {
    const reaction = {
      id: 'rx-999',
      actorName: 'Bob',
      actionSummary: 'realizar una acción',
      blockable: true,
      expiresAt: Date.now() + 5000,
    };

    render(
      <NotSoFastReactionModal
        reaction={reaction}
        hasNotSoFastCard={false}
        onPlay={vi.fn()}
        onSkip={vi.fn()}
      />,
    );

    expect(
      screen.getByText('No tenés “Not So Fast” en tu mano.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Jugar Not So Fast')).not.toBeInTheDocument();
  });

  it('llama a onPlay y onSkip cuando se interactúa con los botones', () => {
    const onPlay = vi.fn();
    const onSkip = vi.fn();
    const reaction = {
      id: 'rx-456',
      actorName: 'Carol',
      actionSummary: 'descartar cartas',
      blockable: true,
      expiresAt: Date.now() + 5000,
    };

    render(
      <NotSoFastReactionModal
        reaction={reaction}
        hasNotSoFastCard
        onPlay={onPlay}
        onSkip={onSkip}
      />,
    );

    fireEvent.click(screen.getByText('Jugar Not So Fast'));
    expect(onPlay).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('No intervenir'));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('deshabilita las acciones mientras se está enviando la reacción', () => {
    const reaction = {
      id: 'rx-777',
      actorName: 'Dana',
      actionSummary: 'jugar un evento',
      blockable: true,
      expiresAt: Date.now() + 5000,
    };

    render(
      <NotSoFastReactionModal
        reaction={reaction}
        hasNotSoFastCard
        isSubmitting
        onPlay={vi.fn()}
        onSkip={vi.fn()}
      />,
    );

    const playButton = screen.getByText('Jugando…');
    expect(playButton).toBeDisabled();

    const skipButton = screen.getByText('No intervenir');
    expect(skipButton).toBeDisabled();
  });

  it('muestra mensaje especial cuando la acción no es bloqueable', () => {
    const reaction = {
      id: 'rx-888',
      actorName: 'Eve',
      actionSummary: 'usar una carta',
      blockable: false,
      expiresAt: Date.now() + 5000,
    };

    render(
      <NotSoFastReactionModal
        reaction={reaction}
        hasNotSoFastCard
        onPlay={vi.fn()}
        onSkip={vi.fn()}
      />,
    );

    expect(
      screen.getByText('Esta jugada no puede ser bloqueada con Not So Fast.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Jugar Not So Fast')).not.toBeInTheDocument();
  });
});
