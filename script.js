"use strict";

const MIN_LEVEL = 1;
const MAX_LEVEL = 5;
const MIN_TEAMS = 2;
const MAX_TEAMS = 4;
const MIN_PLAYERS_PER_TEAM = 2;
const MAX_NAME_LENGTH = 30;

/** Remove espaços sobrando: "  Ana   Maria " -> "Ana Maria". */
function normalizeName(name) {
  return name.trim().replace(/\s+/g, " ");
}

/** Chave de comparação: "ANA" e "ana" contam como o mesmo nome. */
function nameKey(name) {
  return normalizeName(name).toLocaleLowerCase("pt-BR");
}

/**
 * Valida um jogador antes de adicionar/editar.
 * Retorna a mensagem de erro ou null se estiver tudo certo.
 * editingId: na edição, o próprio jogador não conta como "nome repetido".
 */
function validatePlayer(name, level, players, editingId = null) {
  const cleanName = normalizeName(name);

  if (cleanName === "") {
    return "Digite o nome do jogador.";
  }
  if (cleanName.length > MAX_NAME_LENGTH) {
    return `O nome pode ter no máximo ${MAX_NAME_LENGTH} caracteres.`;
  }
  if (!Number.isInteger(level) || level < MIN_LEVEL || level > MAX_LEVEL) {
    return `Escolha um nível entre ${MIN_LEVEL} e ${MAX_LEVEL}.`;
  }

  const isDuplicate = players.some(
    (player) => player.id !== editingId && nameKey(player.name) === nameKey(cleanName)
  );
  if (isDuplicate) {
    return `Já existe um jogador chamado "${cleanName}".`;
  }

  return null;
}

/** Confere se dá para sortear: de 2 a 4 times e pelo menos 2 jogadores por time. */
function validateDraw(players, teamCount) {
  if (!Number.isInteger(teamCount) || teamCount < MIN_TEAMS || teamCount > MAX_TEAMS) {
    return `Escolha de ${MIN_TEAMS} a ${MAX_TEAMS} times.`;
  }

  const minPlayers = teamCount * MIN_PLAYERS_PER_TEAM;
  if (players.length < minPlayers) {
    const missing = minPlayers - players.length;
    return `Para ${teamCount} times são necessários pelo menos ${minPlayers} jogadores. ` +
      `Falta${missing > 1 ? "m" : ""} ${missing}.`;
  }

  return null;
}

/**
 * Embaralha com o algoritmo Fisher–Yates (todas as ordens têm a mesma chance).
 * Devolve uma CÓPIA: o array original não é alterado.
 * `random` pode ser trocado nos testes por uma função previsível.
 */
function shuffle(items, random = Math.random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Ordena do nível 5 ao 1, embaralhando quem tem o mesmo nível.
 * É esse embaralhamento que faz o "Sortear de novo" gerar times diferentes.
 */
function sortByLevelShufflingTies(players, random = Math.random) {
  const sorted = [];
  for (let level = MAX_LEVEL; level >= MIN_LEVEL; level--) {
    const sameLevel = players.filter((player) => player.level === level);
    sorted.push(...shuffle(sameLevel, random));
  }
  return sorted;
}

/**
 * Tamanho dos times. Ex.: 7 jogadores em 3 times -> base 2 e 1 vaga extra
 * (tamanhos 3, 2, 2). Assim a diferença de tamanho é no máximo 1.
 */
function teamSizes(playerCount, teamCount) {
  return {
    base: Math.floor(playerCount / teamCount),
    extraSlots: playerCount % teamCount,
  };
}

/**
 * Um time tem vaga se ainda não chegou no tamanho base, ou se chegou mas ainda
 * sobra vaga extra. A vaga extra não é de nenhum time fixo: vai para quem precisar.
 */
function hasRoom(team, teams, { base, extraSlots }) {
  const size = team.players.length;
  if (size < base) return true;
  const bigTeams = teams.filter((t) => t.players.length > base).length;
  return size === base && bigTeams < extraSlots;
}

/** Entre os times com vaga, escolhe o de menor soma (empate: o com menos jogadores). */
function pickWeakestTeamWithRoom(teams, sizes) {
  let chosen = null;
  teams.forEach((team) => {
    if (!hasRoom(team, teams, sizes)) return;

    const isWeaker =
      chosen === null ||
      team.total < chosen.total ||
      (team.total === chosen.total && team.players.length < chosen.players.length);

    if (isWeaker) chosen = team;
  });
  return chosen;
}

/**
 * O SORTEIO (algoritmo guloso):
 * 1. ordena do mais forte ao mais fraco (embaralhando empates);
 * 2. cada jogador vai para o time mais fraco que ainda tem vaga.
 * Os fortes se espalham primeiro e os mais fracos "completam" as somas.
 */
function drawTeams(players, teamCount, random = Math.random) {
  const sizes = teamSizes(players.length, teamCount);
  // Os times são criados aqui dentro, então alterá-los não afeta nada lá fora.
  const teams = Array.from({ length: teamCount }, (_, index) => ({
    name: `Time ${index + 1}`,
    players: [],
    total: 0,
  }));

  for (const player of sortByLevelShufflingTies(players, random)) {
    const team = pickWeakestTeamWithRoom(teams, sizes);
    team.players.push(player);
    team.total += player.level;
  }

  return teams;
}

function teamAverage(team) {
  return team.players.length === 0 ? 0 : team.total / team.players.length;
}

/** Diferença de soma entre o time mais forte e o mais fraco. */
function balanceGap(teams) {
  const totals = teams.map((team) => team.total);
  return Math.max(...totals) - Math.min(...totals);
}

/** Dois resultados são iguais se têm os mesmos grupos de jogadores (ignora a ordem). */
function sameTeams(teamsA, teamsB) {
  const signature = (teams) =>
    teams
      .map((team) => team.players.map((player) => player.id).sort().join(","))
      .sort()
      .join("|");
  return signature(teamsA) === signature(teamsB);
}

function formatAverage(value) {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** Texto pronto para colar no WhatsApp/Discord (*texto* vira negrito nos dois). */
function formatResultText(teams) {
  const teamBlocks = teams.map((team) => {
    const header = `*${team.name}* (soma ${team.total} · média ${formatAverage(teamAverage(team))})`;
    const lines = team.players.map((player) => `- ${player.name} (${player.level})`);
    return [header, ...lines].join("\n");
  });

  return [
    "🎮 *Times sorteados*",
    ...teamBlocks,
    `Diferença entre o time mais forte e o mais fraco: ${balanceGap(teams)}`,
  ].join("\n\n");
}

const STORAGE_KEYS = {
  players: "sorteador-times:players",
  teamCount: "sorteador-times:teamCount",
};

/** Id único simples: horário + parte aleatória. Editar/remover usam o id, não o nome. */
function createId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** Dados do localStorage podem estar corrompidos ou editados à mão: conferimos tudo. */
function isValidStoredPlayer(item) {
  return (
    item !== null &&
    typeof item === "object" &&
    typeof item.id === "string" &&
    typeof item.name === "string" &&
    normalizeName(item.name) !== "" &&
    Number.isInteger(item.level) &&
    item.level >= MIN_LEVEL &&
    item.level <= MAX_LEVEL
  );
}

function loadPlayers() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.players);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data.filter(isValidStoredPlayer) : [];
  } catch {
    // JSON inválido ou storage bloqueado: começa com a lista vazia em vez de quebrar.
    return [];
  }
}

function loadTeamCount() {
  try {
    const value = Number(localStorage.getItem(STORAGE_KEYS.teamCount));
    return Number.isInteger(value) && value >= MIN_TEAMS && value <= MAX_TEAMS ? value : MIN_TEAMS;
  } catch {
    return MIN_TEAMS;
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEYS.players, JSON.stringify(state.players));
    localStorage.setItem(STORAGE_KEYS.teamCount, String(state.teamCount));
  } catch {
    // Sem storage (ex.: modo privado restrito): o app segue funcionando só na memória.
  }
}

const state = {
  players: loadPlayers(),
  teamCount: loadTeamCount(),
  editingId: null,   // id do jogador sendo editado (null = modo "adicionar")
  lastResult: null,  // último sorteio exibido
};

/* Toda mudança na lista passa por aqui: salva e descarta o resultado antigo,
   para nunca mostrar times com jogadores que já mudaram. */
function setPlayers(players) {
  state.players = players;
  state.lastResult = null;
  save();
}

function addPlayer(name, level) {
  setPlayers([...state.players, { id: createId(), name: normalizeName(name), level }]);
}

function updatePlayer(id, name, level) {
  setPlayers(
    state.players.map((player) =>
      player.id === id ? { ...player, name: normalizeName(name), level } : player
    )
  );
}

function removePlayer(id) {
  setPlayers(state.players.filter((player) => player.id !== id));
}

const els = {
  form: document.getElementById("player-form"),
  formTitle: document.getElementById("form-title"),
  nameInput: document.getElementById("player-name"),
  formError: document.getElementById("form-error"),
  submitBtn: document.getElementById("submit-btn"),
  cancelEditBtn: document.getElementById("cancel-edit-btn"),
  playerList: document.getElementById("player-list"),
  playerCount: document.getElementById("player-count"),
  emptyState: document.getElementById("empty-state"),
  clearBtn: document.getElementById("clear-btn"),
  teamCount: document.getElementById("team-count"),
  drawBtn: document.getElementById("draw-btn"),
  drawError: document.getElementById("draw-error"),
  result: document.getElementById("result"),
  resultTitle: document.getElementById("result-title"),
  balanceSummary: document.getElementById("balance-summary"),
  teams: document.getElementById("teams"),
  redrawBtn: document.getElementById("redraw-btn"),
  copyBtn: document.getElementById("copy-btn"),
  copyStatus: document.getElementById("copy-status"),
  dialog: document.getElementById("confirm-dialog"),
};

/**
 * Atalho para criar elementos. Usa textContent (nunca innerHTML):
 * se alguém cadastrar "<script>" como nome, aparece como texto, não vira código.
 */
function el(tag, { className, text, attrs = {} } = {}, children = []) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  node.append(...children);
  return node;
}

function levelBadge(level) {
  return el("span", {
    className: "level-badge",
    text: `Nível ${level}`,
    attrs: { "data-level": level },
  });
}

function renderPlayers() {
  const { players, editingId } = state;

  els.playerCount.textContent = players.length;
  els.emptyState.hidden = players.length > 0;
  els.clearBtn.disabled = players.length === 0;

  const items = players.map((player) =>
    el(
      "li",
      {
        className: `player-item${player.id === editingId ? " is-editing" : ""}`,
        attrs: { "data-level": player.level },
      },
      [
        el("span", { className: "player-name", text: player.name }),
        levelBadge(player.level),
        el("div", { className: "player-actions" }, [
          el("button", {
            className: "btn btn-ghost",
            text: "Editar",
            attrs: { type: "button", "data-action": "edit", "data-id": player.id, "aria-label": `Editar ${player.name}` },
          }),
          el("button", {
            className: "btn btn-danger",
            text: "Remover",
            attrs: { type: "button", "data-action": "remove", "data-id": player.id, "aria-label": `Remover ${player.name}` },
          }),
        ]),
      ]
    )
  );

  els.playerList.replaceChildren(...items);
}

function renderForm() {
  const isEditing = state.editingId !== null;
  els.formTitle.textContent = isEditing ? "Editar jogador" : "Adicionar jogador";
  els.submitBtn.textContent = isEditing ? "Salvar" : "Adicionar";
  els.cancelEditBtn.hidden = !isEditing;
}

function renderResult() {
  const teams = state.lastResult;
  els.result.hidden = teams === null;
  if (teams === null) return;

  const gap = balanceGap(teams);
  if (gap === 0) {
    els.balanceSummary.textContent = "Equilíbrio perfeito: todos os times têm a mesma soma de níveis.";
  } else {
    els.balanceSummary.replaceChildren(
      "Diferença entre o time mais forte e o mais fraco: ",
      el("strong", { text: `${gap} ${gap === 1 ? "ponto" : "pontos"}` })
    );
  }

  const cards = teams.map((team, index) => {
    const titleId = `team-${index + 1}-title`;
    return el("article", { className: "team-card", attrs: { "aria-labelledby": titleId } }, [
      el("h3", { text: team.name, attrs: { id: titleId } }),
      // <dl> = lista de "termo: valor", o elemento semântico certo para estatísticas
      el("dl", { className: "team-stats" }, [
        el("div", {}, [el("dt", { text: "Soma" }), el("dd", { text: team.total })]),
        el("div", {}, [el("dt", { text: "Média" }), el("dd", { text: formatAverage(teamAverage(team)) })]),
        el("div", {}, [el("dt", { text: "Jogadores" }), el("dd", { text: team.players.length })]),
      ]),
      el(
        "ul",
        { className: "team-players" },
        team.players.map((player) =>
          el("li", {}, [el("span", { text: player.name }), levelBadge(player.level)])
        )
      ),
    ]);
  });

  els.teams.replaceChildren(...cards);
}

function render() {
  renderPlayers();
  renderForm();
  renderResult();
}

function showFormError(message) {
  els.formError.textContent = message;
  els.nameInput.setAttribute("aria-invalid", "true");
  els.nameInput.focus();
}

function clearFormError() {
  els.formError.textContent = "";
  els.nameInput.removeAttribute("aria-invalid");
}

let statusTimer;
/** Mensagem curta que some sozinha; a região aria-live faz o leitor de tela anunciá-la. */
function announce(message) {
  els.copyStatus.textContent = message;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    els.copyStatus.textContent = "";
  }, 4000);
}

function resetForm() {
  state.editingId = null;
  els.form.reset(); // volta o nível para o padrão (3) definido no HTML
  clearFormError();
}

function handleSubmit(event) {
  event.preventDefault(); // impede o recarregamento da página

  const name = els.nameInput.value;
  const level = Number(els.form.elements.level.value);
  const error = validatePlayer(name, level, state.players, state.editingId);

  if (error) {
    showFormError(error);
    return;
  }

  if (state.editingId) {
    updatePlayer(state.editingId, name, level);
  } else {
    addPlayer(name, level);
  }

  resetForm();
  render();
  els.nameInput.focus(); // já deixa pronto para cadastrar o próximo
}

function startEdit(id) {
  const player = state.players.find((p) => p.id === id);
  if (!player) return;

  state.editingId = id;
  clearFormError();
  els.nameInput.value = player.name;
  els.form.elements.level.value = String(player.level);
  render();
  els.nameInput.focus();
}

function cancelEdit() {
  resetForm();
  render();
  els.nameInput.focus();
}

/* Um único listener na <ul> atende todos os botões (delegação de eventos):
   funciona até para itens criados depois. */
function handleListClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const { action, id } = button.dataset;
  if (action === "edit") {
    startEdit(id);
  } else if (action === "remove") {
    if (state.editingId === id) resetForm();
    removePlayer(id);
    render();
    els.nameInput.focus(); // o botão clicado sumiu; o foco não pode se perder
  }
}

function handleDraw({ avoidRepeat = false } = {}) {
  const error = validateDraw(state.players, state.teamCount);
  els.drawError.textContent = error ?? "";
  if (error) {
    state.lastResult = null;
    renderResult();
    return;
  }

  const previous = state.lastResult;
  let next = drawTeams(state.players, state.teamCount);

  // No "Sortear de novo", tenta algumas vezes achar uma combinação diferente da atual.
  if (avoidRepeat && previous) {
    for (let tries = 0; tries < 20 && sameTeams(previous, next); tries++) {
      next = drawTeams(state.players, state.teamCount);
    }
  }

  state.lastResult = next;
  renderResult();

  if (avoidRepeat) {
    announce(
      previous && sameTeams(previous, next)
        ? "Com esses níveis, o sorteio chegou na mesma divisão. Tente de novo ou ajuste os níveis."
        : "Nova combinação sorteada!"
    );
  } else {
    // Leva o foco (e a tela) até o resultado, avisando quem usa leitor de tela.
    els.resultTitle.focus();
  }
}

function handleTeamCountChange() {
  state.teamCount = Number(els.teamCount.value);
  state.lastResult = null; // o resultado antigo não vale mais
  els.drawError.textContent = "";
  save();
  renderResult();
}

/** Plano B para navegadores sem a API de clipboard (ou ao abrir via file://). */
function legacyCopy(text) {
  const textarea = el("textarea", { className: "sr-only", attrs: { readonly: "" } });
  textarea.value = text;
  document.body.append(textarea);
  textarea.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  textarea.remove();
  return ok;
}

async function handleCopy() {
  if (!state.lastResult) return;
  const text = formatResultText(state.lastResult);

  try {
    await navigator.clipboard.writeText(text);
    announce("Resultado copiado! É só colar no WhatsApp ou Discord.");
  } catch {
    announce(
      legacyCopy(text)
        ? "Resultado copiado! É só colar no WhatsApp ou Discord."
        : "Não foi possível copiar automaticamente. Selecione os times e copie manualmente."
    );
  }
}

function handleClearClick() {
  els.dialog.returnValue = ""; // senão, um "confirm" antigo valeria ao fechar com Esc
  els.dialog.showModal();
}

function handleDialogClose() {
  if (els.dialog.returnValue === "confirm") {
    resetForm();
    setPlayers([]);
    render();
    els.drawError.textContent = "";
  }
  els.nameInput.focus();
}

function init() {
  els.teamCount.value = String(state.teamCount);

  els.form.addEventListener("submit", handleSubmit);
  els.nameInput.addEventListener("input", clearFormError); // erro some quando o usuário corrige
  els.cancelEditBtn.addEventListener("click", cancelEdit);
  els.playerList.addEventListener("click", handleListClick);
  els.teamCount.addEventListener("change", handleTeamCountChange);
  els.drawBtn.addEventListener("click", () => handleDraw());
  els.redrawBtn.addEventListener("click", () => handleDraw({ avoidRepeat: true }));
  els.copyBtn.addEventListener("click", handleCopy);
  els.clearBtn.addEventListener("click", handleClearClick);
  els.dialog.addEventListener("close", handleDialogClose);

  render();
}

init();