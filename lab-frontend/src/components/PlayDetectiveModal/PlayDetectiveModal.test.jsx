import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";

import PlayDetectiveModal from "./PlayDetectiveModal";
import { isTooLongSet } from "../../utils/detectiveRules";
const {
  mockCanCardJoinSet,
  mockHarleyViolatesRule,
  mockIsAriadneCard,
  mockIsHarleyCard,
  mockIsUnblockableCombination,
  mockIsTooLong,
} = vi.hoisted(() => {
  return {
    mockCanCardJoinSet: vi.fn(() => true),
    mockHarleyViolatesRule: vi.fn(() => false),
    mockIsAriadneCard: vi.fn((card) => card?.nombre === "Ariadne Oliver"),
    mockIsHarleyCard: vi.fn(() => false),
    mockIsUnblockableCombination: vi.fn(() => false),
    mockIsTooLong: vi.fn(() => false),
  };
});

vi.mock("../../utils/CardImageMapper", () => ({
  getCardImage: vi.fn(() => "mock-card.png"),
  getCardInfo: vi.fn(() => ({ type: "detective" })),
}));

vi.mock("../../utils/detectiveRules", () => ({
  canCardJoinSet: mockCanCardJoinSet,
  harleyViolatesRule: mockHarleyViolatesRule,
  isAriadneCard: mockIsAriadneCard,
  isHarleyCard: mockIsHarleyCard,
  isUnblockableCombination: mockIsUnblockableCombination,
  isTooLongSet: mockIsTooLong,
}));

const baseProps = () => ({
  isOpen: true,
  cards: [{ carta_id: 1, nombre: "Hercule Poirot" }],
  mySets: [
    {
      id: 77,
      nombre: "Set Poirot",
      owner_id: 111,
      cartas: [{ carta_id: 1 }],
    },
  ],
  allSets: [],
  currentUserId: 111,
  onClose: vi.fn(),
  onConfirm: vi.fn(),
});

describe("PlayDetectiveModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanCardJoinSet.mockReturnValue(true);
    mockHarleyViolatesRule.mockReturnValue(false);
    mockIsHarleyCard.mockReturnValue(false);
    mockIsUnblockableCombination.mockReturnValue(false);
    mockIsAriadneCard.mockImplementation((card) => card?.nombre === "Ariadne Oliver");
  });

  it("no renderiza contenido cuando el modal está cerrado", () => {
    const { container } = render(<PlayDetectiveModal isOpen={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("permite seleccionar un detective y un set y confirma la jugada", () => {
    const props = baseProps();
    mockIsUnblockableCombination.mockReturnValueOnce(true);

    render(<PlayDetectiveModal {...props} />);

    fireEvent.click(screen.getByText("Hercule Poirot"));
    expect(screen.getByText("Seleccioná uno de tus sets.")).toBeInTheDocument();

    const setButton = screen.getByRole("button", { name: /Set Poirot/i });
    fireEvent.click(setButton);

    const confirmButton = screen.getByRole("button", { name: "Confirmar" });
    expect(confirmButton).toBeEnabled();
    fireEvent.click(confirmButton);

    expect(props.onConfirm).toHaveBeenCalledWith({
      cardId: 1,
      setId: 77,
      isUnblockable: true,
    });
  });

  it("cuando Ariadne está preseleccionada solo muestra sets de otros jugadores", async () => {
    const rivalSet = { id: 90, nombre: "Set Rival", owner_id: 222, cartas: [] };
    const mySet = { id: 91, nombre: "Set Propio", owner_id: 111, cartas: [] };

    render(
      <PlayDetectiveModal
        isOpen
        cards={[{ carta_id: 2, nombre: "Ariadne Oliver" }]}
        mySets={[mySet]}
        allSets={[mySet, rivalSet]}
        currentUserId={111}
        initialCardId={2}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(
      await screen.findByText("Seleccioná un set de otro jugador."),
    ).toBeInTheDocument();
    expect(screen.getByText("Sets de otros jugadores")).toBeInTheDocument();
    expect(screen.getByText("Set Rival")).toBeInTheDocument();
    expect(screen.queryByText("Set Propio")).not.toBeInTheDocument();
  });

  it("muestra mensajes de validación y mantiene el botón deshabilitado sin selección", () => {
    const props = baseProps();
    render(<PlayDetectiveModal {...props} />);

    expect(screen.getByText("Seleccioná un detective de tu mano.")).toBeInTheDocument();
    const confirmButton = screen.getByRole("button", { name: "Confirmar" });
    expect(confirmButton).toBeDisabled();
  });

  it("bloquea sets incompatibles y muestra el mensaje de error", () => {
    const props = baseProps();
    mockCanCardJoinSet.mockReturnValue(false);

    render(<PlayDetectiveModal {...props} />);

    fireEvent.click(screen.getByText("Hercule Poirot"));
    const setButton = screen.getByRole("button", { name: /Set Poirot/i });
    expect(setButton).toBeDisabled();
    expect(screen.getByText("El detective seleccionado no puede unirse a este set.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeDisabled();
  });

  it("muestra la advertencia de Harley y evita confirmar la jugada", () => {
    const props = {
      ...baseProps(),
      cards: [{ carta_id: 3, nombre: "Harley Quin" }],
    };
    mockIsHarleyCard.mockReturnValue(true);
    mockHarleyViolatesRule.mockReturnValue(true);

    render(<PlayDetectiveModal {...props} />);

    fireEvent.click(screen.getByText("Harley Quin"));
    fireEvent.click(screen.getByRole("button", { name: /Set Poirot/i }));

    expect(
      screen.getByText("No podés usar Harley Quin sin tener ya un detective de ese grupo."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeDisabled();
  });

  it("restablece la selección cuando se cierra y vuelve a abrir", () => {
    const props = baseProps();
    const { rerender } = render(<PlayDetectiveModal {...props} />);

    fireEvent.click(screen.getByText("Hercule Poirot"));
    fireEvent.click(screen.getByRole("button", { name: /Set Poirot/i }));
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeEnabled();

    rerender(<PlayDetectiveModal {...props} isOpen={false} />);
    rerender(<PlayDetectiveModal {...props} isOpen />);

    expect(screen.getByText("Seleccioná un detective de tu mano.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeDisabled();
  });

  it("ejecuta el callback onClose cuando se presiona Cancelar", () => {
    const props = baseProps();
    render(<PlayDetectiveModal {...props} />);

    fireEvent.click(screen.getByText("Cancelar"));
    expect(props.onClose).toHaveBeenCalled();
  });

  it("Muestra la advertencia de isTooLong y evita confirmar la jugada", () => {
    const props = () => ({
      isOpen: true,
      cards: [{ carta_id: 33, nombre: "Hercule Poirot" }/*, { carta_id: 34, nombre: "Hercule Poirot" },
        { carta_id: 35, nombre: "Hercule Poirot" }, { carta_id: 36, nombre: "Hercule Poirot" },
        { carta_id: 37, nombre: "Hercule Poirot" }*/
      ],
      mySets: [
        {
          id: 44,
          nombre: "Set Poirot",
          owner_id: 115,
          cartas: [{ carta_id: 33 }, { carta_id: 34 }, { carta_id: 35 }, { carta_id: 36 }, { carta_id: 37 }],
        },
      ],
      allSets: [],
      currentUserId: 115,
      onClose: vi.fn(),
      onConfirm: vi.fn(),
    });

    mockIsTooLong.mockReturnValue(true);
    render(<PlayDetectiveModal {...props()} />);

    fireEvent.click(screen.getByText("Hercule Poirot"));
    fireEvent.click(screen.getByRole("button", { name: /Set Poirot/i }));

    expect(
      screen.getByText("Ya hay 5 cartas en el set, no puede agregar más."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeDisabled();

  })
});
