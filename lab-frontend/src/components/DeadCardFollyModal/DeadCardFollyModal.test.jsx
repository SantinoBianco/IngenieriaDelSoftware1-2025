import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";

import DeadCardFollyModal from "./DeadCardFollyModal";

vi.mock("../../utils/CardImageMapper", () => ({
  getCardImage: vi.fn((name) => `${name}-img`),
}));

const defaultPlayers = [
  { id: 1, nombre: "Alice" },
  { id: 2, nombre: "Bob" },
  { id: 3, nombre: "Eve" },
];

const defaultCards = [
  { carta_id: 11, nombre: "Card Trade" },
  { carta_id: 22, nombre: "Dead Card Folly" },
];

const baseProps = () => ({
  isOpen: true,
  state: {
    status: "selecting",
    direction: "derecha",
    pendingPlayerIds: [2, 3],
  },
  cards: defaultCards,
  players: defaultPlayers,
  currentUserId: 1,
  selectedCardId: null,
  locked: false,
  onSelect: vi.fn(),
  onConfirm: vi.fn(),
  onClear: vi.fn(),
  onClose: vi.fn(),
});

describe("DeadCardFollyModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("no renderiza contenido cuando no está abierto", () => {
    const { container } = render(<DeadCardFollyModal isOpen={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("muestra la dirección y los jugadores pendientes", () => {
    render(<DeadCardFollyModal {...baseProps()} />);
    expect(screen.getByText(/Dirección: derecha/i)).toBeInTheDocument();
    expect(screen.getByText(/Aún faltan:/i)).toHaveTextContent("Aún faltan: Bob, Eve");
  });

  it("permite seleccionar una carta cuando no está bloqueado", () => {
    const props = baseProps();
    render(<DeadCardFollyModal {...props} />);

    fireEvent.click(screen.getAllByText("Card Trade")[0]);
    expect(props.onSelect).toHaveBeenCalledWith(11);
  });

  it("no permite selección cuando está bloqueado", () => {
    const props = {
      ...baseProps(),
      locked: true,
    };
    render(<DeadCardFollyModal {...props} />);

    fireEvent.click(screen.getAllByText("Card Trade")[0]);
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it("limpia la selección y cierra al presionar los botones", () => {
    const props = baseProps();
    render(<DeadCardFollyModal {...props} selectedCardId={11} />);

    fireEvent.click(screen.getByText("Limpiar selección"));
    expect(props.onClear).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("Listo"));
    expect(props.onConfirm).toHaveBeenCalledTimes(1);
  });

  it("muestra la carta recibida cuando el estado es completed", () => {
    const props = {
      ...baseProps(),
      state: {
        status: "completed",
        direction: "izquierda",
        receivedCard: { nombre: "Lady Brent" },
      },
    };
    render(<DeadCardFollyModal {...props} />);
    expect(screen.getByText(/Recibiste Lady Brent/i)).toBeInTheDocument();
    expect(screen.getByText("Entendido")).toBeInTheDocument();
  });

  it("muestra mensaje de error cuando el estado es error", () => {
    const props = {
      ...baseProps(),
      state: {
        status: "error",
        direction: "derecha",
        errorMessage: "Fallo",
      },
    };
    render(<DeadCardFollyModal {...props} />);
    expect(screen.getByText("Fallo")).toBeInTheDocument();
  });
});
