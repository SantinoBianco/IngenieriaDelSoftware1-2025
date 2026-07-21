import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";

import PointSuspiciousModal from "./PointSuspicionsModal";

const basePlayers = [
  { id: 1, nombre: "Alice" },
  { id: 2, nombre: "Bob" },
  { id: 3, nombre: "Charlie" },
];

const baseState = {
  status: "voting",
  initiatorId: 1,
  votes: {},
  participantIds: [1, 2, 3],
};

describe("PointSuspiciousModal", () => {
  it("muestra panel de voto y emite confirmación", async () => {
    const onSelect = vi.fn();
    const onConfirmVote = vi.fn();

    const { rerender } = render(
      <PointSuspiciousModal
        isOpen
        state={baseState}
        players={basePlayers}
        currentUserId={2}
        selection={null}
        onSelect={onSelect}
        onConfirmVote={onConfirmVote}
        hasVoted={false}
        pendingVoters={[1, 3]}
      />,
    );

    expect(screen.getByText("Point Your Suspicious")).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Bob" })).not.toBeInTheDocument();
    expect(
      screen.getByText((content) =>
        content.startsWith(
          "Todos los jugadores deben votar públicamente quién les parece más sospechoso",
        ),
      ),
    ).toBeInTheDocument();

    const radioCharlie = screen.getByRole("radio", { name: "Charlie" });
    await userEvent.click(radioCharlie);
    expect(onSelect).toHaveBeenCalledWith(3);

    rerender(
      <PointSuspiciousModal
        isOpen
        state={baseState}
        players={basePlayers}
        currentUserId={2}
        selection={3}
        onSelect={onSelect}
        onConfirmVote={onConfirmVote}
        hasVoted={false}
        pendingVoters={[1, 3]}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /confirmar voto/i }));
    expect(onConfirmVote).toHaveBeenCalledWith(3);

    expect(screen.getByText("Esperando a: Alice, Charlie")).toBeInTheDocument();
  });

  it("muestra aviso de re-votación cuando hubo empate previo", () => {
    render(
      <PointSuspiciousModal
        isOpen
        state={{
          ...baseState,
          revoteCount: 1,
          votes: {},
        }}
        players={basePlayers}
        currentUserId={3}
        selection={null}
        hasVoted={false}
        pendingVoters={[1, 2]}
      />,
    );

    expect(
      screen.getByText(/hubo un empate en la votación anterior/i),
    ).toBeInTheDocument();
  });

  it("no muestra el modal si el target debe revelar secreto", () => {
    const { container } = render(
      <PointSuspiciousModal
        isOpen
        state={{
          status: "awaiting_secret",
          initiatorId: 1,
          result: { targetId: 2 },
          participantIds: [1, 2],
          votes: { 1: 2 },
        }}
        players={basePlayers}
        currentUserId={2}
        selection={null}
        pendingVoters={[]}
      />,
    );

    expect(container.firstChild).toBeNull();
  });

  it("muestra resumen al finalizar con resultado", () => {
    render(
      <PointSuspiciousModal
        isOpen
        state={{
          status: "finished",
          initiatorId: 1,
          participantIds: [1, 2, 3],
          result: {
            counts: { 1: 1, 2: 2 },
            totalVotes: 3,
            topPlayers: [2],
            targetId: 2,
            tie: false,
          },
        }}
        players={basePlayers}
        currentUserId={1}
        selection={null}
        pendingVoters={[]}
      />,
    );

    expect(
      screen.getByText((content) => content.includes("fue la persona más votada")),
    ).toBeInTheDocument();
    expect(screen.getByText(/resumen de la votación/i)).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("1 voto")).toBeInTheDocument();
    expect(screen.getByText("2 votos")).toBeInTheDocument();
    expect(screen.getByText(/votos totales: 3 \/ 3/i)).toBeInTheDocument();
  });
});
