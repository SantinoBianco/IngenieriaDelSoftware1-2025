import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";

import ChooseSecretModal from "./ChooseSecretModal";

describe("ChooseSecretModal", () => {
  const mockPlayers = [
    { id: 1, nombre: "Alice" },
    { id: 2, nombre: "Bob" },
    { id: 3, nombre: "Charlie" }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("permite elegir jugador y secreto (choose_player_and_secret) y llama onConfirm con payload", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    const otherPlayer = { id: 2, nombre: "Bob" };
    const currentUser = { id: 1, nombre: "Alice" };

    const secretsList = [
      { jugador_id: 2, secreto_id: 77, descripcion: "Secreto Bob", revelado: false },
    ];

    const allSecretsRaw = {
      partidaId: "test-game",
      secretos: {
        "2": secretsList
      }
    };

    const fetchPlayerSecrets = vi.fn(async (_playerId) => {
      // simulate async fetch
      return Promise.resolve(secretsList);
    });

    render(
      <ChooseSecretModal
        mode="choose_player_and_secret"
        setName="TestSet"
        players={[currentUser, otherPlayer]}
        secrets={[]}
        fetchPlayerSecrets={fetchPlayerSecrets}
        allSecretsRaw={allSecretsRaw}
        onConfirm={onConfirm}
        onCancel={onCancel}
        currentUserId={1}
      />
    );

    // header
    expect(screen.getByText(/TestSet: Revelar Secreto/)).toBeInTheDocument();

    // select player
    const selects = screen.getAllByRole("combobox");
    expect(selects.length).toBeGreaterThanOrEqual(1);
    const playerSelect = selects[0];

    const user = userEvent.setup();
    await user.selectOptions(playerSelect, String(otherPlayer.id));

    // fetchPlayerSecrets debe haberse llamado
    await waitFor(() => expect(fetchPlayerSecrets).toHaveBeenCalledWith(Number(otherPlayer.id)));

    // ahora debe aparecer el select de secretos (esperamos que haya al menos 2 selects)
    await waitFor(() => {
      const all = screen.getAllByRole("combobox");
      expect(all.length).toBeGreaterThanOrEqual(2);
    });

    // seleccionar el secreto (usar el segundo select que aparece)
    const allSelectsAfter = screen.getAllByRole("combobox");
    const secretSelect = allSelectsAfter[1];
    await user.selectOptions(secretSelect, String(secretsList[0].secreto_id));

    // click Revelar
    await user.click(screen.getByRole("button", { name: /Revelar/i }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith({ jugadorId: Number(otherPlayer.id), secretoId: Number(secretsList[0].secreto_id) });
  });

  it("permite elegir jugador para que revele (choose_player_then_they_choose_secret) y llama onConfirm con jugadorId", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    const players = [
      { id: 1, nombre: "Alice" },
      { id: 3, nombre: "Charlie" },
    ];

    render(
      <ChooseSecretModal
        mode="choose_player_then_they_choose_secret"
        setName="Beresford"
        players={players}
        secrets={[]}
        fetchPlayerSecrets={null}
        allSecretsRaw={null}
        onConfirm={onConfirm}
        onCancel={onCancel}
        currentUserId={1}
      />
    );

    const user = userEvent.setup();
    const selects = screen.getAllByRole("combobox");
    const playerSelect = selects[0];
    await user.selectOptions(playerSelect, String(3));

    await user.click(screen.getByRole("button", { name: /Pedir que revele/i }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith({ jugadorId: 3 });
  });

  it("permite elegir uno de tus secretos (choose_secret_to_reveal) y llama onConfirm con secretoId y jugadorId", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    const currentUserId = 42;
    const mySecrets = [
      { jugador_id: 42, secreto_id: 501, descripcion: "Mi secreto", revelado: false },
      { jugador_id: 42, secreto_id: 502, descripcion: "Otro secreto", revelado: false },
    ];

    render(
      <ChooseSecretModal
        mode="choose_secret_to_reveal"
        setName="Poirot"
        players={[]}
        secrets={mySecrets}
        fetchPlayerSecrets={null}
        allSecretsRaw={null}
        onConfirm={onConfirm}
        onCancel={onCancel}
        currentUserId={currentUserId}
      />
    );

    const user = userEvent.setup();
    const secretSelect = screen.getByRole("combobox");
    await user.selectOptions(secretSelect, String(mySecrets[1].secreto_id));

    await user.click(screen.getByRole("button", { name: /Revelar/i }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith({ jugadorId: currentUserId, secretoId: mySecrets[1].secreto_id });
  });

  it("al cancelar llama onCancel", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <ChooseSecretModal
        mode="choose_player_then_they_choose_secret" // Este modo muestra Cancelar
        setName="Test"
        players={[
          { id: 1, nombre: "Alice" },
          { id: 2, nombre: "Bob" }
        ]}
        secrets={[]}
        fetchPlayerSecrets={null}
        allSecretsRaw={null}
        onConfirm={onConfirm}
        onCancel={onCancel}
        currentUserId={1}
      />
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Cancelar/i }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  describe("Filtrado de Secretos", () => {
    const mockAllSecretsRaw = {
      partidaId: "test-game",
      secretos: {
        "2": [
          { secreto_id: 10, descripcion: "Secreto Bob No Revelado", revelado: false, jugador_id: 2 },
          { secreto_id: 11, descripcion: "Secreto Bob Revelado", revelado: true, jugador_id: 2 },
          { secreto_id: 12, descripcion: "Otro Secreto Bob No Revelado", revealed: false, jugador_id: 2 },
          { secreto_id: 13, descripcion: "Otro Secreto Bob Revelado", revealed: true, jugador_id: 2 },
        ],
        "3": [
          { secreto_id: 20, descripcion: "Secreto Charlie 1", revelado: false, jugador_id: 3 },
          { secreto_id: 21, descripcion: "Secreto Charlie 2", revelado: false, jugador_id: 3 },
          { secreto_id: 22, descripcion: "Secreto Charlie 3", revelado: false, jugador_id: 3 },
        ]
      }
    };

    it("filtra correctamente secretos revelados en modo choose_player_and_secret usando allSecretsRaw", async () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();

      render(
        <ChooseSecretModal
          mode="choose_player_and_secret"
          setName="Set de Beresford"
          players={mockPlayers}
          secrets={[]}
          fetchPlayerSecrets={null}
          allSecretsRaw={mockAllSecretsRaw}
          onConfirm={onConfirm}
          onCancel={onCancel}
          currentUserId={1}
        />
      );
    
      // Seleccionar a Bob como jugador objetivo
      const playerSelect = screen.getAllByRole("combobox")[0];
      await userEvent.selectOptions(playerSelect, "2");
    
      await waitFor(() => {
        const secretSelect = screen.getAllByRole("combobox")[1];
        const options = Array.from(secretSelect.querySelectorAll('option')).map(opt => opt.textContent);

        // Solo deberían aparecer los secretos NO revelados
        expect(options).toContain("Secreto #1"); // secreto_id: 10 (no revelado)
        expect(options).toContain("Secreto #2"); // secreto_id: 12 (no revelado)

        // NO deberían aparecer los secretos revelados
        expect(options).not.toContain("Secreto #3"); // secreto_id: 11 (revelado)
        expect(options).not.toContain("Secreto #4"); // secreto_id: 13 (revelado)

        // Debe incluir el placeholder más los 2 secretos no revelados
        expect(options.filter(opt => opt !== "Secreto...")).toHaveLength(2);
      });
    });

    it("filtra correctamente secretos revelados en modo choose_secret_to_reveal", async () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();
      
      const secretsWithRevealed = [
        { secreto_id: 1, descripcion: "Mi Primer Secreto", revelado: false, jugador_id: 1 },
        { secreto_id: 2, descripcion: "Mi Segundo Secreto", revelado: true, jugador_id: 1 },
        { secreto_id: 3, descripcion: "Mi Tercer Secreto", revealed: false, jugador_id: 1 },
        { secreto_id: 4, descripcion: "Mi Cuarto Secreto", revealed: true, jugador_id: 1 },
      ];

      render(
        <ChooseSecretModal
          mode="choose_secret_to_reveal"
          setName="Elegir Secreto Propio"
          players={mockPlayers}
          secrets={secretsWithRevealed}
          fetchPlayerSecrets={null}
          allSecretsRaw={null}
          onConfirm={onConfirm}
          onCancel={onCancel}
          currentUserId={1}
        />
      );

      // Verificar que solo aparecen los secretos no revelados del usuario actual
      await waitFor(() => {
        expect(screen.getByText("Mi Primer Secreto")).toBeInTheDocument();
        expect(screen.getByText("Mi Tercer Secreto")).toBeInTheDocument();
        
        // Verificar que NO aparecen los secretos revelados
        expect(screen.queryByText("Mi Segundo Secreto")).not.toBeInTheDocument();
        expect(screen.queryByText("Mi Cuarto Secreto")).not.toBeInTheDocument();
      });
    });

    it("maneja correctamente jugadores sin secretos no revelados", async () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();

      const allSecretsRawWithAllRevealed = {
        partidaId: "test-game",
        secretos: {
          "2": [
            { secreto_id: 10, descripcion: "Secreto Bob Revelado 1", revelado: true, jugador_id: 2 },
            { secreto_id: 11, descripcion: "Secreto Bob Revelado 2", revelado: true, jugador_id: 2 },
            { secreto_id: 12, descripcion: "Secreto Bob Revelado 3", revelado: true, jugador_id: 2 },
          ]
        }
      };
    
      render(
        <ChooseSecretModal
          mode="choose_player_and_secret"
          setName="Set de Beresford"
          players={mockPlayers}
          secrets={[]}
          fetchPlayerSecrets={null}
          allSecretsRaw={allSecretsRawWithAllRevealed}
          onConfirm={onConfirm}
          onCancel={onCancel}
          currentUserId={1}
        />
      );
    
      // Seleccionar a Bob como jugador objetivo
      const playerSelect = screen.getAllByRole("combobox")[0];
      await userEvent.selectOptions(playerSelect, "2");
    
      // Verificar que muestra el mensaje de error apropiado
      await waitFor(() => {
        expect(screen.getByText("Este jugador no tiene secretos disponibles para revelar.")).toBeInTheDocument();
      });
    
      // Verificar que NO hay un segundo combobox para seleccionar secretos
      const allComboboxes = screen.getAllByRole("combobox");
      expect(allComboboxes).toHaveLength(1); // Solo el combobox de jugadores
    
      // Verificar que el botón de Revelar está deshabilitado
      const revealButton = screen.getByRole("button", { name: /Revelar/i });
      expect(revealButton).toBeDisabled();
    });

    it("usa fetchPlayerSecrets cuando está disponible y filtra correctamente", async () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();
        
      const fetchPlayerSecrets = vi.fn(async (playerId) => {
        if (playerId === 2) {
          return [
            { secreto_id: 100, descripcion: "Secreto Remote No Revelado", revelado: false, jugador_id: 2 },
            { secreto_id: 101, descripcion: "Secreto Remote Revelado", revelado: true, jugador_id: 2 },
          ];
        }
        return [];
      });
    
      const mockAllSecretsRaw = {
        partidaId: "test-game",
        secretos: {
          "2": [
            { secreto_id: 100, descripcion: "Secreto Remote No Revelado", revelado: false, jugador_id: 2 },
            { secreto_id: 101, descripcion: "Secreto Remote Revelado", revelado: true, jugador_id: 2 },
          ]
        }
      };
    
      render(
        <ChooseSecretModal
          mode="choose_player_and_secret"
          setName="Set de Beresford"
          players={mockPlayers}
          secrets={[]}
          fetchPlayerSecrets={fetchPlayerSecrets}
          allSecretsRaw={mockAllSecretsRaw}
          onConfirm={onConfirm}
          onCancel={onCancel}
          currentUserId={1}
        />
      );
    
      // Seleccionar a Bob como jugador objetivo
      const playerSelect = screen.getAllByRole("combobox")[0];
      await userEvent.selectOptions(playerSelect, "2");
    
      // Verificar que se llama fetchPlayerSecrets
      await waitFor(() => {
        expect(fetchPlayerSecrets).toHaveBeenCalledWith(2);
      });
    
      // Verificar que solo aparecen los secretos NO revelados
      await waitFor(() => {
        const secretSelect = screen.getAllByRole("combobox")[1];
        const options = Array.from(secretSelect.querySelectorAll('option')).map(opt => opt.textContent);
        
        // Solo debe mostrar el secreto NO revelado
        expect(options).toContain("Secreto #1"); // secreto_id: 100 (no revelado)
        expect(options).not.toContain("Secreto #2"); // secreto_id: 101 (revelado) - NO debería aparecer
        
        // Debe haber exactamente 1 secreto + placeholder
        expect(options.filter(opt => opt !== "Secreto...")).toHaveLength(1);
      });
    });

    it("maneja propiedades tanto revelado como revealed", async () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();
        
      const mixedSecretsFormat = {
        partidaId: "test-game",
        secretos: {
          "2": [
            { secreto_id: 50, descripcion: "Secreto con revelado false", revelado: false, jugador_id: 2 },
            { secreto_id: 51, descripcion: "Secreto con revealed false", revealed: false, jugador_id: 2 },
            { secreto_id: 52, descripcion: "Secreto con revelado true", revelado: true, jugador_id: 2 },
            { secreto_id: 53, descripcion: "Secreto con revealed true", revealed: true, jugador_id: 2 },
            { secreto_id: 54, descripcion: "Secreto con ambos false", revelado: false, revealed: false, jugador_id: 2 },
            { secreto_id: 55, descripcion: "Secreto con revelado true y revealed false", revelado: true, revealed: false, jugador_id: 2 }, // Se filtra por revelado: true
          ]
        }
      };
    
      render(
        <ChooseSecretModal
          mode="choose_player_and_secret"
          setName="Set de Beresford"
          players={mockPlayers}
          secrets={[]}
          fetchPlayerSecrets={null}
          allSecretsRaw={mixedSecretsFormat}
          onConfirm={onConfirm}
          onCancel={onCancel}
          currentUserId={1}
        />
      );
    
      // Seleccionar a Bob como jugador objetivo
      const playerSelect = screen.getAllByRole("combobox")[0];
      await userEvent.selectOptions(playerSelect, "2");
    
      await waitFor(() => {
        const secretSelect = screen.getAllByRole("combobox")[1];
        const options = Array.from(secretSelect.querySelectorAll('option')).map(opt => opt.textContent);
        
        // Solo deben aparecer los secretos NO revelados
        const nonPlaceholderOptions = options.filter(opt => opt !== "Secreto...");
        expect(nonPlaceholderOptions).toHaveLength(3); // Solo 3 secretos no revelados
        
        // Verificar que aparecen los secretos correctos
        expect(nonPlaceholderOptions).toContain("Secreto #1"); // secreto_id: 50
        expect(nonPlaceholderOptions).toContain("Secreto #2"); // secreto_id: 51  
        expect(nonPlaceholderOptions).toContain("Secreto #3"); // secreto_id: 54
        
        // Verificar que NO aparecen los secretos revelados
        expect(nonPlaceholderOptions).not.toContain("Secreto #4"); // secreto_id: 52 (revelado)
        expect(nonPlaceholderOptions).not.toContain("Secreto #5"); // secreto_id: 53 (revelado)
        expect(nonPlaceholderOptions).not.toContain("Secreto #6"); // secreto_id: 55 (revelado: true)
      });
    });
  });

  describe("Modos que detectan cartas devious", () => {
    it("card_trade_blackmailed solo ofrece secretos propios ocultos y confirma con 'Mostrar en privado'", async () => {
      const onConfirm = vi.fn();
      const secrets = [
        { secreto_id: 10, descripcion: "Secreto oculto", revelado: false, jugador_id: 1 },
        { secreto_id: 11, descripcion: "Secreto revelado", revelado: true, jugador_id: 1 },
      ];

      render(
        <ChooseSecretModal
          mode="card_trade_blackmailed"
          setName="Blackmailed"
          players={[{ id: 1, nombre: "Alice" }]}
          secrets={secrets}
          fetchPlayerSecrets={null}
          allSecretsRaw={null}
          onConfirm={onConfirm}
          onCancel={vi.fn()}
          currentUserId={1}
        />,
      );

      const secretSelect = screen.getByRole("combobox");
      // Solo listar secretos ocultos propios
      const optionLabels = Array.from(secretSelect.querySelectorAll("option")).map((opt) => opt.textContent);
      expect(optionLabels).toContain("Secreto oculto");
      expect(optionLabels).not.toContain("Secreto revelado");

      await userEvent.selectOptions(secretSelect, "10");
      await userEvent.click(screen.getByRole("button", { name: /Mostrar en privado/i }));

      expect(onConfirm).toHaveBeenCalledWith({ jugadorId: 1, secretoId: 10 });
      expect(screen.queryByText(/Cancelar/i)).not.toBeInTheDocument();
    });

    it("dead_card_folly_social_faux_effect muestra el mensaje predeterminado y confirma con Revelar", async () => {
      const onConfirm = vi.fn();
      const secrets = [
        { secreto_id: 20, descripcion: "Oculto 1", revelado: false, jugador_id: 7 },
        { secreto_id: 21, descripcion: "Oculto 2", revelado: false, jugador_id: 7 },
      ];

      render(
        <ChooseSecretModal
          mode="dead_card_folly_social_faux_effect"
          setName="Social Faux Pas"
          players={[{ id: 7, nombre: "Player" }]}
          secrets={secrets}
          fetchPlayerSecrets={null}
          allSecretsRaw={null}
          onConfirm={onConfirm}
          onCancel={vi.fn()}
          currentUserId={7}
        />,
      );

      expect(
        screen.getByText(/Dead Card Folly te obliga a revelar un secreto públicamente/i),
      ).toBeInTheDocument();

      const secretSelect = screen.getByRole("combobox");
      await userEvent.selectOptions(secretSelect, "20");
      await userEvent.click(screen.getByRole("button", { name: /Revelar/i }));

      expect(onConfirm).toHaveBeenCalledWith({ jugadorId: 7, secretoId: 20 });
      expect(screen.queryByText(/Cancelar/i)).not.toBeInTheDocument();
    });
  });
});
