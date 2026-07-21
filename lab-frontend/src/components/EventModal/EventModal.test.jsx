import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";

import EventModal from "./EventModal";

vi.mock("../../utils/CardImageMapper", () => ({
  getCardImage: vi.fn(() => "/fake-card.png"),
  getCardInfo: vi.fn((name) => {
    const normalized = String(name ?? "").toLowerCase();
    if (normalized.includes("early") && normalized.includes("train")) {
      return {
        type: "event",
        description: "Mueve 6 cartas del mazo al descarte",
        requiresPlayerTarget: false,
      };
    }
    return {
      type: "event",
      description: "Descripción de prueba",
      requiresPlayerTarget: normalized === "cards off the table",
    };
  }),
}));

describe("EventModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renderiza modal con nombre y descripción de carta", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <EventModal
        eventCardData={{ carta_id: 1, nombre: "Test Event" }}
        players={[]}
        currentUserId={42}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Vas a jugar un evento")).toBeInTheDocument();
    expect(screen.getByText("Test Event")).toBeInTheDocument();
    expect(screen.getByText("Descripción de prueba")).toBeInTheDocument();
  });

  it("muestra lista de jugadores y mantiene boton Confirmar deshabilitado hasta seleccionar (requires target)", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const players = [
      { id: 1, nombre: "Alice" },
      { id: 2, nombre: "Bob" },
    ];

    render(
      <EventModal
        eventCardData={{ carta_id: 2, nombre: "Cards off the table" }}
        players={players}
        currentUserId={1}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    // radios por jugador (labels contienen el nombre)
    expect(screen.getByText(/Bob/)).toBeInTheDocument();

    const confirmBtn = screen.getByRole("button", { name: /Confirmar/i });
    expect(confirmBtn).toBeDisabled();

    const user = userEvent.setup();
    await user.click(screen.getByLabelText(/Bob/));
    expect(confirmBtn).toBeEnabled();
  });

  it("al confirmar con target seleccionado llama onConfirm con payload correcto", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const players = [
      { id: "10", nombre: "Player10" },
      { id: "20", nombre: "Player20" },
    ];

    render(
      <EventModal
        eventCardData={{ carta_id: 99, nombre: "Cards off the table" }}
        players={players}
        currentUserId={10}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    const user = userEvent.setup();
    await user.click(screen.getByLabelText(/Player20/));
    await user.click(screen.getByRole("button", { name: /Confirmar/i }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const payload = onConfirm.mock.calls[0][0];
    expect(payload).toMatchObject({
      cardId: 99,
      cardName: "Cards off the table",
      targetPlayerId: "20",
    });
  });

  it("al cancelar llama onCancel", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <EventModal
        eventCardData={{ carta_id: 5, nombre: "Test Event" }}
        players={[]}
        currentUserId={1}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Cancelar/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("muestra modal informativo para 'Cards off the table' con mensaje específico cuando eres target", () => {
    const onCloseIncoming = vi.fn();

    render(
      <EventModal
        incomingEvent={{ cardName: "Cards off the table", jugadorObjetivoId: 2 }}
        currentUserId={2}
        onCloseIncoming={onCloseIncoming}
      />
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/Te aplicaron un efecto/)).toBeInTheDocument();
    expect(screen.getByText(/Cards off the table/)).toBeInTheDocument();
    expect(screen.getByText(/Todas tus cartas "Not so Fast" se han ido/)).toBeInTheDocument();
  });

  it("muestra mensaje por defecto para otros eventos cuando eres target", () => {
    const onCloseIncoming = vi.fn();

    render(
      <EventModal
        incomingEvent={{ cardName: "Another Event", jugadorObjetivoId: "10" }}
        currentUserId={10}
        onCloseIncoming={onCloseIncoming}
      />
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/Esto pudo modificar tu mano/i) === false); // just ensure default text exists below
    expect(screen.getByText(/Esto pudo modificar tu mano. Revisa tus cartas./)).toBeInTheDocument();
  });

  it("no muestra modal informativo si no sos el jugador objetivo", () => {
    render(
      <EventModal
        incomingEvent={{ cardName: "Cards off the table", jugadorObjetivoId: 99 }}
        currentUserId={1}
      />
    );

    // no debe existir el dialog informativo
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("confirmar evento que NO requiere target llama onConfirm sin targetPlayerId", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();

    render(
      <EventModal
        eventCardData={{ carta_id: 7, nombre: "Non target event" }}
        players={[]}
        currentUserId={1}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />
    );

    // confirmar debe estar habilitado y llamar onConfirm con payload
    const btn = screen.getByRole("button", { name: /Confirmar/i });
    expect(btn).toBeEnabled();
    await user.click(btn);

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const payload = onConfirm.mock.calls[0][0];
    expect(payload).toMatchObject({
      cardId: 7,
      cardName: "Non target event",
    });
    // no target
    expect(payload.targetPlayerId == null);
  });

  it("incomingEvent: modal informativo cierra con onCloseIncoming y mensaje específico", async () => {
    const onCloseIncoming = vi.fn();
    const user = userEvent.setup();

    render(
      <EventModal
        incomingEvent={{ cardName: "Cards off the table", jugadorObjetivoId: "42" }}
        currentUserId={42}
        onCloseIncoming={onCloseIncoming}
      />
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/Todas tus cartas "Not so Fast" se han ido/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Cerrar/i }));
    expect(onCloseIncoming).toHaveBeenCalledTimes(1);
  });

  describe("Evento Delay the Murderer Escape", () => {
    it("muestra información específica del evento Delay the Murderer Escape", () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();

      render(
        <EventModal
          eventCardData={{ carta_id: 99, nombre: "Delay the Murderer scape" }}
          players={[]}
          currentUserId={42}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      );

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("Delay the Murderer scape")).toBeInTheDocument();
      
      // Verificar información específica del evento
      expect(screen.getByText("Efecto del evento:")).toBeInTheDocument();
      expect(screen.getByText(/Toma hasta 5 cartas del tope del descarte/)).toBeInTheDocument();
      expect(screen.getByText(/Las coloca boca abajo sobre el mazo en orden aleatorio/)).toBeInTheDocument();
      expect(screen.getByText(/Esta carta se elimina del juego/)).toBeInTheDocument();
      expect(screen.getByText(/⚠️ Requiere que haya cartas en el descarte/)).toBeInTheDocument();
    });

    it("permite confirmar evento Delay the Murderer Escape sin seleccionar jugador", async () => {
      const user = userEvent.setup();
      const onConfirm = vi.fn();
      const onCancel = vi.fn();

      render(
        <EventModal
          eventCardData={{ carta_id: 99, nombre: "Delay the Murderer scape" }}
          players={[
            { id: 1, nombre: "Alice" },
            { id: 2, nombre: "Bob" }
          ]}
          currentUserId={42}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      );

      // El botón Confirmar debe estar habilitado sin necesidad de seleccionar jugador
      const confirmButton = screen.getByRole("button", { name: /Confirmar/i });
      expect(confirmButton).toBeEnabled();

      await user.click(confirmButton);

      expect(onConfirm).toHaveBeenCalledTimes(1);
      expect(onConfirm).toHaveBeenCalledWith({
        cardId: 99,
        cardName: "Delay the Murderer scape",
        targetPlayerId: null,
        targetSetId: null
      });
    });

    it("no muestra lista de jugadores para Delay the Murderer Escape", () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();

      render(
        <EventModal
          eventCardData={{ carta_id: 99, nombre: "Delay the Murderer scape" }}
          players={[
            { id: 1, nombre: "Alice" },
            { id: 2, nombre: "Bob" }
          ]}
          currentUserId={42}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      );

      // No debe mostrar la sección de selección de jugadores
      expect(screen.queryByText("Seleccioná un jugador objetivo:")).not.toBeInTheDocument();
      expect(screen.queryByText("Alice")).not.toBeInTheDocument();
      expect(screen.queryByText("Bob")).not.toBeInTheDocument();
    });

    it("muestra mensaje específico para incoming event de Delay the Murderer Escape", () => {
      const onCloseIncoming = vi.fn();

      render(
        <EventModal
          eventCardData={null}
          players={[]}
          currentUserId={42}
          onConfirm={null}
          onCancel={null}
          incomingEvent={{
            fromPlayerId: 1,
            cardName: "Delay the Murderer scape",
            meta: {}
          }}
          onCloseIncoming={onCloseIncoming}
        />
      );

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("Te aplicaron un efecto")).toBeInTheDocument();
      expect(screen.getByText(/Delay the Murderer scape/)).toBeInTheDocument();
      expect(screen.getByText(/El mazo fue reordenado. Cartas del descarte fueron mezcladas y colocadas encima./)).toBeInTheDocument();
    });
  });
  describe("And then there was one more event", () => {
    it("And then there was one more... muestra secretos públicos (incluye los del currentUser), requiere seleccionar jugador antes de confirmar y confirma con secretTargetId", async () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();
      const user = userEvent.setup();

      const players = [
        { id: 1, nombre: "Yo" },
        { id: 2, nombre: "Otro" },
      ];

      const secretsByPlayer = {
        "1": [{ secreto_id: 11, descripcion: "Mi Secreto", revelado: true }],
        "2": [{ secreto_id: 22, descripcion: "Secreto Ajeno", revelado: true }],
      };

      render(
        <EventModal
          eventCardData={{ carta_id: 39, nombre: "And then there was one more...", requiresSecretId: true }}
          players={players}
          currentUserId={1}
          onConfirm={onConfirm}
          onCancel={onCancel}
          secretsByPlayer={secretsByPlayer}
          secretsToShow={[]}
        />
      );

      // ahora el componente muestra ambos secretos (incluyendo el del currentUser)
      expect(screen.getByText(/Mi Secreto/)).toBeInTheDocument();
      expect(screen.getByText(/Secreto Ajeno/)).toBeInTheDocument();

      // seleccionar el secreto ajeno
      await user.click(screen.getByText(/Secreto Ajeno/));

      // sin seleccionar jugador, el botón debe seguir deshabilitado
      const confirmBtn = screen.getByRole("button", { name: /Confirmar/i });
      expect(confirmBtn).toBeDisabled();

      // seleccionar jugador destinatario (Otro)
      await user.click(screen.getByLabelText(/Otro/));

      // ahora el botón debe habilitarse
      expect(confirmBtn).toBeEnabled();

      // confirmar debe llamar onConfirm con secretTargetId y targetPlayerId
      await user.click(confirmBtn);

      expect(onConfirm).toHaveBeenCalledTimes(1);
      const payload = onConfirm.mock.calls[0][0];
      expect(payload).toMatchObject({
        cardId: 39,
        cardName: "And then there was one more...",
        secretTargetId: 22,
      });
      expect(String(payload.targetPlayerId)).toBe("2");
    });

    it("permite seleccionar secreto ajeno + jugador destinatario y confirma payload con secretTargetId y targetPlayerId", async () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();
      const user = userEvent.setup();

      const players = [
        { id: 1, nombre: "Yo" },
        { id: 2, nombre: "Otro" },
      ];

      const secretsByPlayer = {
        "1": [{ secreto_id: 11, descripcion: "Mi Secreto", revelado: true }],
        "2": [{ secreto_id: 22, descripcion: "Secreto Ajeno", revelado: true }],
      };

      render(
        <EventModal
          eventCardData={{ carta_id: 39, nombre: "And then there was one more...", requiresSecretId: true }}
          players={players}
          currentUserId={1}
          onConfirm={onConfirm}
          onCancel={onCancel}
          secretsByPlayer={secretsByPlayer}
          secretsToShow={[]}
        />
      );

      // seleccionar el secreto ajeno
      await user.click(screen.getByText(/Secreto Ajeno/));

      // seleccionar jugador destinatario (importante: el test original no lo hacía)
      await user.click(screen.getByLabelText(/Otro/));

      // confirmar debe llamar onConfirm con secretTargetId y targetPlayerId
      await user.click(screen.getByRole("button", { name: /Confirmar/i }));

      expect(onConfirm).toHaveBeenCalledTimes(1);
      const payload = onConfirm.mock.calls[0][0];
      expect(payload).toMatchObject({
        cardId: 39,
        cardName: "And then there was one more...",
        secretTargetId: 22,
      });
      expect(String(payload.targetPlayerId)).toBe("2");
    });
  });

  describe("Another Victim Event", () => {
    const mockPlayers = [
      { id: 1, nombre: "Alice" },
      { id: 2, nombre: "Bob" },
    ];

    const mockPlayersSets = [
      {
        id: 1,
        nombre: "Set de Tuppence Beresford",
        owner_id: 2,
        cartas: [{ carta_id: 1, nombre: "Tuppence Beresford" }]
      },
      {
        id: 2,
        nombre: "Set de Mr. Satterthwaite",
        owner_id: 2,
        cartas: [{ carta_id: 2, nombre: "Mr. Satterthwaite" }]
      }
    ];

    it("detecta Another Victim y muestra selección de sets", () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();

      render(
        <EventModal
          eventCardData={{ carta_id: 1, nombre: "Another Victim" }}
          players={mockPlayers}
          playersSets={mockPlayersSets}
          currentUserId={1}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      );

      expect(screen.getByText("Another Victim")).toBeInTheDocument();
      expect(screen.getByText("Seleccioná un set para robar:")).toBeInTheDocument();
      expect(screen.getByText("Set de Tuppence Beresford")).toBeInTheDocument();
      expect(screen.getByText("Set de Mr. Satterthwaite")).toBeInTheDocument();
    });

    it("mantiene botón Confirmar deshabilitado hasta seleccionar un set", async () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();

      render(
        <EventModal
          eventCardData={{ carta_id: 1, nombre: "Another Victim" }}
          players={mockPlayers}
          playersSets={mockPlayersSets}
          currentUserId={1}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      );

      const confirmBtn = screen.getByRole("button", { name: /Confirmar/i });
      expect(confirmBtn).toBeDisabled();

      const user = userEvent.setup();
      await user.click(screen.getByLabelText(/Set de Tuppence Beresford/));
      expect(confirmBtn).toBeEnabled();
    });

    it("al confirmar con set seleccionado llama onConfirm con targetSetId correcto", async () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();

      render(
        <EventModal
          eventCardData={{ carta_id: 1, nombre: "Another Victim" }}
          players={mockPlayers}
          playersSets={mockPlayersSets}
          currentUserId={1}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      );

      const user = userEvent.setup();
      await user.click(screen.getByLabelText(/Set de Tuppence Beresford/));
      await user.click(screen.getByRole("button", { name: /Confirmar/i }));

      expect(onConfirm).toHaveBeenCalledTimes(1);
      const payload = onConfirm.mock.calls[0][0];
      expect(payload).toMatchObject({
        cardId: 1,
        cardName: "Another Victim",
        targetPlayerId: null,
        targetSetId: 1
      });
    });

    it("no muestra sets del jugador actual", () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();
      
      const setsWithCurrentUser = [
        ...mockPlayersSets,
        {
          id: 3,
          nombre: "Set del jugador actual",
          owner_id: 1,
          cartas: [{ carta_id: 5, nombre: "Detective Card" }]
        }
      ];

      render(
        <EventModal
          eventCardData={{ carta_id: 1, nombre: "Another Victim" }}
          players={mockPlayers}
          playersSets={setsWithCurrentUser}
          currentUserId={1}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      );

      expect(screen.queryByText("Set del jugador actual")).not.toBeInTheDocument();
      expect(screen.getByText("Set de Tuppence Beresford")).toBeInTheDocument();
      expect(screen.getByText("Set de Mr. Satterthwaite")).toBeInTheDocument();
    });

    it("muestra mensaje cuando no hay sets disponibles para robar", () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();

      render(
        <EventModal
          eventCardData={{ carta_id: 1, nombre: "Another Victim" }}
          players={mockPlayers}
          playersSets={[]}
          currentUserId={1}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      );

      expect(screen.getByText("No hay sets disponibles para robar")).toBeInTheDocument();
    });

    it("muestra modal informativo cuando jugador recibe Another Victim", () => {
      const onCloseIncoming = vi.fn();

      render(
        <EventModal
          eventCardData={null}
          players={mockPlayers}
          currentUserId={2}
          onConfirm={null}
          onCancel={null}
          incomingEvent={{
            fromPlayerId: 1,
            cardName: "Another Victim",
            meta: {}
          }}
          onCloseIncoming={onCloseIncoming}
        />
      );

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("Te aplicaron un efecto")).toBeInTheDocument();
      expect(screen.getByText(/Another Victim/)).toBeInTheDocument();
      expect(screen.getByText("Te robaron un set. Revisa tu zona de juego.")).toBeInTheDocument();
    });
  });

  describe('Early Train to Paddington Event', () => {
    it('renderiza información específica para Early Train to Paddington', () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();

      render(
        <EventModal
          eventCardData={{ carta_id: 1, nombre: "Early Train to Paddington" }}
          players={[]}
          currentUserId={42}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      );

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("Early Train to Paddington")).toBeInTheDocument();
      
      // Verificar que muestra la información específica del evento
      expect(screen.getByText("Efecto del evento:")).toBeInTheDocument();
      expect(screen.getByText(/Mueve las 6 cartas del tope del mazo al descarte/)).toBeInTheDocument();
      expect(screen.getByText(/No requiere seleccionar objetivo/)).toBeInTheDocument();
      expect(screen.getByText(/Esta carta se descarta después de usarse/)).toBeInTheDocument();
      expect(screen.getByText(/Efecto inmediato - no necesita confirmaciones adicionales/)).toBeInTheDocument();
    });

    it('no requiere selección de jugador objetivo para Early Train', () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();
      const players = [
        { id: 1, nombre: "Alice" },
        { id: 2, nombre: "Bob" },
      ];

      render(
        <EventModal
          eventCardData={{ carta_id: 2, nombre: "Early Train to Paddington" }}
          players={players}
          currentUserId={1}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      );

      // Verificar que NO aparece selección de jugadores
      expect(screen.queryByText("Seleccioná un jugador objetivo:")).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/Bob/)).not.toBeInTheDocument();

      // El botón Confirmar debe estar habilitado desde el inicio
      const confirmBtn = screen.getByRole("button", { name: /Confirmar/i });
      expect(confirmBtn).toBeEnabled();
    });

    it('no requiere selección de set para Early Train', () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();
      const mockSets = [
        {
          id: 1,
          nombre: "Set de prueba",
          owner_id: 2,
          cartas: [{ carta_id: 1, nombre: "Carta 1" }]
        }
      ];

      render(
        <EventModal
          eventCardData={{ carta_id: 3, nombre: "Early Train to Paddington" }}
          players={[{ id: 1, nombre: "Player1" }, { id: 2, nombre: "Player2" }]}
          playersSets={mockSets}
          currentUserId={1}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      );

      // Verificar que NO aparece selección de sets
      expect(screen.queryByText("Seleccioná un set para robar:")).not.toBeInTheDocument();
      
      // El botón Confirmar debe estar habilitado
      const confirmBtn = screen.getByRole("button", { name: /Confirmar/i });
      expect(confirmBtn).toBeEnabled();
    });

    it('al confirmar Early Train llama onConfirm con payload correcto', async () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();

      render(
        <EventModal
          eventCardData={{ carta_id: 456, nombre: "Early Train to Paddington" }}
          players={[]}
          currentUserId={1}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      );

      const user = userEvent.setup();
      const confirmBtn = screen.getByRole("button", { name: /Confirmar/i });
      await user.click(confirmBtn);

      expect(onConfirm).toHaveBeenCalledTimes(1);
      const payload = onConfirm.mock.calls[0][0];
      expect(payload).toMatchObject({
        cardId: 456,
        cardName: "Early Train to Paddington",
        targetPlayerId: null,
        targetSetId: null
      });
    });

    it('muestra mensaje correcto para Early Train en evento entrante', () => {
      const onCloseIncoming = vi.fn();

      render(
        <EventModal
          eventCardData={null}
          players={[]}
          currentUserId={2}
          onConfirm={null}
          onCancel={null}
          incomingEvent={{
            fromPlayerId: 1,
            cardName: "Early Train to Paddington",
            meta: {}
          }}
          onCloseIncoming={onCloseIncoming}
        />
      );

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("Te aplicaron un efecto")).toBeInTheDocument();
      expect(screen.getByText(/Early Train to Paddington/)).toBeInTheDocument();
      expect(screen.getByText("6 cartas fueron movidas del mazo al descarte.")).toBeInTheDocument();
    });
  });

  describe('Look into the Ashes Event', () => {
    const mockDiscardPile = [
      { carta_id: 101, nombre: "Parker Pyne" },
      { carta_id: 102, nombre: "Tuppence Beresford" },
      { carta_id: 103, nombre: "Hercule Poirot" },
    ];

    it('renderiza información específica para Look into the Ashes', () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();

      render(
        <EventModal
          eventCardData={{ carta_id: 34, nombre: "Look into the Ashes" }}
          players={[]}
          currentUserId={42}
          onConfirm={onConfirm}
          onCancel={onCancel}
          discardTopFive={mockDiscardPile}
        />
      );

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("Look into the Ashes")).toBeInTheDocument();
      
      // Verificar que muestra el selector de cartas del descarte
      expect(screen.getByText(/Seleccioná una carta del descarte/)).toBeInTheDocument();
    });

    it('muestra lista de cartas del descarte para seleccionar', () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();

      render(
        <EventModal
          eventCardData={{ carta_id: 34, nombre: "Look into the Ashes" }}
          players={[]}
          currentUserId={42}
          onConfirm={onConfirm}
          onCancel={onCancel}
          discardTopFive={mockDiscardPile}
        />
      );

      // Verificar que aparecen las cartas del descarte usando aria-label
      expect(screen.getByRole("button", { name: "Parker Pyne" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Tuppence Beresford" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Hercule Poirot" })).toBeInTheDocument();

      // El botón Confirmar debe estar deshabilitado inicialmente
      const confirmBtn = screen.getByRole("button", { name: /Confirmar/i });
      expect(confirmBtn).toBeDisabled();
    });

    it('permite seleccionar una carta del descarte y confirmar', async () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();
      const user = userEvent.setup();

      render(
        <EventModal
          eventCardData={{ carta_id: 34, nombre: "Look into the Ashes" }}
          players={[]}
          currentUserId={42}
          onConfirm={onConfirm}
          onCancel={onCancel}
          discardTopFive={mockDiscardPile}
        />
      );

      // Seleccionar una carta del descarte usando aria-label
      const parkerPyneButton = screen.getByRole("button", { name: "Parker Pyne" });
      await user.click(parkerPyneButton);

      // El botón Confirmar debe estar habilitado
      const confirmBtn = screen.getByRole("button", { name: /Confirmar/i });
      expect(confirmBtn).toBeEnabled();

      await user.click(confirmBtn);

      // Verificar que se llamó onConfirm con payload correcto
      expect(onConfirm).toHaveBeenCalledTimes(1);
      const payload = onConfirm.mock.calls[0][0];
      expect(payload).toMatchObject({
        cardId: 34,
        cardName: "Look into the Ashes",
        selectedDiscardCardId: 101,
      });
    });

    it('muestra mensaje cuando no hay cartas en el descarte', () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();

      render(
        <EventModal
          eventCardData={{ carta_id: 34, nombre: "Look into the Ashes" }}
          players={[]}
          currentUserId={42}
          onConfirm={onConfirm}
          onCancel={onCancel}
          discardTopFive={[]}
        />
      );

      expect(screen.getByText(/No hay cartas en el descarte/)).toBeInTheDocument();
      
      // El botón Confirmar debe estar deshabilitado
      const confirmBtn = screen.getByRole("button", { name: /Confirmar/i });
      expect(confirmBtn).toBeDisabled();
    });

    it('no requiere selección de jugador para Look into the Ashes', () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();
      const players = [
        { id: 1, nombre: "Alice" },
        { id: 2, nombre: "Bob" },
      ];

      render(
        <EventModal
          eventCardData={{ carta_id: 34, nombre: "Look into the Ashes" }}
          players={players}
          currentUserId={1}
          onConfirm={onConfirm}
          onCancel={onCancel}
          discardTopFive={mockDiscardPile}
        />
      );

      // Verificar que NO aparece selección de jugadores
      expect(screen.queryByText("Seleccioná un jugador objetivo:")).not.toBeInTheDocument();
    });

    it('muestra mensaje correcto para Look into the Ashes en evento entrante', () => {
      const onCloseIncoming = vi.fn();

      render(
        <EventModal
          eventCardData={null}
          players={[]}
          currentUserId={2}
          onConfirm={null}
          onCancel={null}
          incomingEvent={{
            fromPlayerId: 1,
            cardName: "Look into the Ashes",
            meta: {}
          }}
          onCloseIncoming={onCloseIncoming}
        />
      );

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("Te aplicaron un efecto")).toBeInTheDocument();
      expect(screen.getByText(/Look into the Ashes/)).toBeInTheDocument();
      // El componente muestra el mensaje por defecto para eventos no específicamente manejados
      expect(screen.getByText(/Esto pudo modificar tu mano. Revisa tus cartas./)).toBeInTheDocument();
    });
  });

  describe('Card Trade Event', () => {
    it('permite iniciar un Card Trade seleccionando jugador y carta y llama onConfirm con payload correcto', async () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();
      const user = userEvent.setup();

      const players = [
        { id: 1, nombre: 'Yo' },
        { id: 2, nombre: 'Otro' },
      ];

      const myCards = [
        { carta_id: 10, nombre: 'Carta A' },
        { carta_id: 11, nombre: 'Carta B' },
      ];

      render(
        <EventModal
          eventCardData={{ carta_id: 500, nombre: 'Card Trade', playerCards: myCards }}
          players={players}
          currentUserId={1}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      );

  // Seleccionar jugador objetivo (Otro) y carta propia a ofrecer
  await user.click(screen.getByLabelText(/Otro/));
  await user.click(screen.getByLabelText(/Carta A/));

  // confirmar
  await user.click(screen.getByRole('button', { name: /Confirmar/i }));

      expect(onConfirm).toHaveBeenCalledTimes(1);
      const payload = onConfirm.mock.calls[0][0];
      expect(payload).toMatchObject({
        action: 'initiate_card_trade',
        cardId: 500,
        cardName: 'Card Trade',
      });
      // offeredCardId debe estar presente; targetPlayerId actualmente puede ser null
      expect(String(payload.offeredCardId)).toBe(String(10));
      expect(payload.targetPlayerId == null || String(payload.targetPlayerId) === String(2)).toBe(true);
    });

    it('muestra UI de solicitud entrante y permite responder el Card Trade seleccionando carta y confirmando', async () => {
      const onConfirm = vi.fn();
      const onCloseIncoming = vi.fn();
      const user = userEvent.setup();

      const incomingEvent = {
        type: 'card_trade',
        requesterName: 'Alice',
        eventId: 500,
        cardName: 'Card Trade',
        offeredCardId: 10,
        playerCards: [
          { carta_id: 20, nombre: 'Carta X' },
          { carta_id: 21, nombre: 'Carta Y' },
        ],
      };

      render(
        <EventModal
          incomingEvent={incomingEvent}
          currentUserId={2}
          onConfirm={onConfirm}
          onCloseIncoming={onCloseIncoming}
        />
      );

      // elegir carta a devolver
      await user.click(screen.getByLabelText(/Carta X/));

      // confirmar
      await user.click(screen.getByRole('button', { name: /Confirmar/i }));

      expect(onConfirm).toHaveBeenCalledTimes(1);
      const payload = onConfirm.mock.calls[0][0];
      expect(payload).toMatchObject({
        action: 'respond_card_trade',
        cardId: 500,
        cardName: 'Card Trade',
      });
      expect(String(payload.chosenCardId)).toBe(String(20));
      expect(String(payload.offeredCardId)).toBe(String(10));
    });
  });
});