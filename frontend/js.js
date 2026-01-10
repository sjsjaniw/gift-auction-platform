/* ===== FILE: ./frontend/js.js ===== */
const socket = io();

// Состояние приложения
const state = {
  userId: localStorage.getItem("userId") || "",
  auctionId: localStorage.getItem("auctionId") || "",
  hasWon: false, // Выиграл ли я в этом аукционе
  isFinished: false, // 🔥 Глобальный флаг: Аукцион завершен
  timerInterval: null,
  userDataInterval: null,
};

// Ссылки на элементы DOM
const ui = {
  screens: {
    login: document.getElementById("screen-login"),
    app: document.getElementById("screen-app"),
  },
  inputs: {
    user: document.getElementById("inp-user"),
    auction: document.getElementById("inp-auction"),
    amount: document.getElementById("inp-amount"),
  },
  buttons: {
    login: document.getElementById("btn-login"),
    bid: document.getElementById("btn-bid"),
  },
  display: {
    username: document.getElementById("display-username"),
    balance: document.getElementById("display-balance"),
    frozen: document.getElementById("display-frozen"),
    title: document.getElementById("auction-title"),
    round: document.getElementById("round-number"),
    gifts: document.getElementById("gifts-count"),
    timer: document.getElementById("timer"),
    leaderboard: document.getElementById("leaderboard-list"),
    status: document.getElementById("status-log"),
    inventory: document.getElementById("inventory-grid"),
  },
};

// --- ИНИЦИАЛИЗАЦИЯ ---
document.addEventListener("DOMContentLoaded", () => {
  if (!ui.inputs.auction) return;
  loadAuctionList();
  if (state.userId && ui.inputs.user) ui.inputs.user.value = state.userId;
  if (ui.buttons.login) ui.buttons.login.addEventListener("click", handleLogin);
  if (ui.buttons.bid) ui.buttons.bid.addEventListener("click", placeBid);
});

// --- ЛОГИКА ВХОДА ---
async function loadAuctionList() {
  const select = ui.inputs.auction;
  try {
    const res = await fetch("/api/auctions");
    const auctions = await res.json();
    select.innerHTML =
      '<option value="" disabled selected>Select an Auction...</option>';

    if (!Array.isArray(auctions) || auctions.length === 0) {
      select.innerHTML = "<option>No active auctions</option>";
      return;
    }

    auctions.forEach((auc) => {
      const opt = document.createElement("option");
      opt.value = auc._id;
      opt.innerText = `${auc.title} (Round ${auc.currentRoundNumber})`;
      select.appendChild(opt);
    });

    if (state.auctionId && auctions.find((a) => a._id === state.auctionId)) {
      select.value = state.auctionId;
    }
  } catch (e) {
    console.error(e);
  }
}

function handleLogin() {
  const userId = ui.inputs.user.value.trim();
  const auctionId = ui.inputs.auction.value;
  if (!userId || !auctionId) {
    alert("Select auction and enter ID");
    return;
  }
  state.userId = userId;
  state.auctionId = auctionId;
  localStorage.setItem("userId", userId);
  localStorage.setItem("auctionId", auctionId);
  ui.screens.login.classList.add("hidden");
  ui.screens.app.classList.remove("hidden");
  startApp();
}

// --- ОСНОВНАЯ ЛОГИКА ---
function startApp() {
  console.log("⚡ Starting logic:", state.auctionId);

  // 1. Сокеты
  socket.emit("joinAuction", state.auctionId);
  socket.on("auctionUpdate", (data) => renderUI(data));

  // 2. Загрузка данных
  fetchUserInfo();
  fetchUserInventory();
  fetchAuctionState();

  // 3. Фоновое обновление (раз в 5 сек)
  if (state.userDataInterval) clearInterval(state.userDataInterval);
  state.userDataInterval = setInterval(() => {
    fetchUserInfo();
    fetchUserInventory();
  }, 5000);
}

async function fetchUserInfo() {
  try {
    const res = await fetch(`/api/user/${state.userId}`);
    const data = await res.json();
    if (data.error) return;
    if (ui.display.username) ui.display.username.innerText = data.username;
    if (ui.display.balance)
      ui.display.balance.innerText = data.balance.toLocaleString();
    if (ui.display.frozen)
      ui.display.frozen.innerText = data.frozen.toLocaleString();
  } catch (e) {}
}

async function fetchUserInventory() {
  try {
    const res = await fetch(`/api/user/${state.userId}/inventory`);
    const gifts = await res.json();
    if (Array.isArray(gifts)) {
      const alreadyWon = gifts.some((g) => g.auctionId === state.auctionId);
      if (alreadyWon && !state.hasWon) {
        state.hasWon = true;
        lockInterfaceAsWinner();
      }
      renderInventory(gifts);
    }
  } catch (e) {}
}

async function fetchAuctionState() {
  try {
    const res = await fetch(`/api/auction/${state.auctionId}`);
    const data = await res.json();
    if (!data.error) renderUI(data);
  } catch (e) {}
}

async function placeBid() {
  if (state.hasWon || state.isFinished) return;

  const amount = Number(ui.inputs.amount.value);
  if (!amount || amount <= 0) return;

  const btn = ui.buttons.bid;
  const oldText = btn.innerText;
  btn.innerText = "⏳";
  btn.disabled = true;

  try {
    const res = await fetch("/api/bid", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": state.userId,
      },
      body: JSON.stringify({ auctionId: state.auctionId, amount }),
    });
    const data = await res.json();

    if (data.error) {
      showStatus(data.error, true);
    } else {
      showStatus(`Rank #${data.rank} confirmed!`, false);
      ui.inputs.amount.value = "";
      fetchUserInfo();
    }
  } catch (e) {
    showStatus("Network Error", true);
  } finally {
    if (!state.hasWon && !state.isFinished) {
      btn.innerText = oldText;
      btn.disabled = false;
    }
  }
}

// --- ВИЗУАЛ ---

function lockInterfaceAsWinner() {
  if (ui.buttons.bid) {
    ui.buttons.bid.disabled = true;
    ui.buttons.bid.innerText = "🎉 Gift Received!";
    ui.buttons.bid.style.backgroundColor = "var(--green)";
    ui.buttons.bid.style.cursor = "default";
  }
  if (ui.inputs.amount) {
    ui.inputs.amount.disabled = true;
    ui.inputs.amount.placeholder = "You won!";
  }
}

function setFinishedState(leaderboard) {
  // 🔥 Железобетонная установка статуса "Конец"
  state.isFinished = true;
  if (state.timerInterval) clearInterval(state.timerInterval);

  if (ui.display.timer) {
    ui.display.timer.innerText = "Finished";
    ui.display.timer.style.color = "var(--text-muted)";
  }

  if (ui.buttons.bid) {
    ui.buttons.bid.disabled = true;
    ui.buttons.bid.innerText = "Auction Closed";
    ui.buttons.bid.style.backgroundColor = "#333";
    ui.buttons.bid.style.cursor = "not-allowed";
  }

  if (ui.inputs.amount) {
    ui.inputs.amount.disabled = true;
    ui.inputs.amount.placeholder = "---";
  }

  // Рисуем финальный лидерборд
  renderLeaderboard(leaderboard, 0);
}

function renderUI(data) {
  const { auction, leaderboard, cutoffPrice } = data;
  if (!auction) return;

  // 1. Проверяем статус аукциона
  if (auction.status === "FINISHED") {
    setFinishedState(leaderboard);
    return; // ⛔️ Выходим, чтобы таймер не запустился
  }

  // Если вдруг статус ACTIVE, но у нас локально флаг стоял (странная ситуация, но сбросим)
  state.isFinished = false;

  // 2. Если мы победитель
  if (state.hasWon) {
    lockInterfaceAsWinner();
    // Но таймер и лидерборд продолжаем обновлять, чтобы видеть прогресс
  } else {
    // Обычное состояние
    if (
      ui.buttons.bid &&
      ui.buttons.bid.disabled &&
      ui.buttons.bid.innerText !== "⏳"
    ) {
      ui.buttons.bid.disabled = false;
      ui.buttons.bid.innerText = "PLACE BID";
      ui.buttons.bid.style.backgroundColor = "var(--accent)";
    }
  }

  if (ui.display.title) ui.display.title.innerText = auction.title;
  if (ui.display.round) ui.display.round.innerText = auction.currentRoundNumber;
  if (ui.inputs.amount && cutoffPrice && !state.hasWon) {
    ui.inputs.amount.placeholder = `Min: ${cutoffPrice}`;
  }

  const roundConfig = auction.rounds.find(
    (r) => r.roundNumber === auction.currentRoundNumber,
  );
  if (roundConfig) {
    if (ui.display.gifts) ui.display.gifts.innerText = roundConfig.giftCount;
    // Запускаем таймер
    runTimer(new Date(roundConfig.endTime).getTime());
    renderLeaderboard(leaderboard, roundConfig.giftCount);
  }
}

function renderLeaderboard(leaderboard, winnersCount) {
  if (!ui.display.leaderboard) return;
  ui.display.leaderboard.innerHTML = "";
  if (!leaderboard || leaderboard.length === 0) {
    ui.display.leaderboard.innerHTML =
      '<div class="empty-state">No bids yet.</div>';
    return;
  }
  leaderboard.forEach((user, idx) => {
    const isWinner = winnersCount > 0 && idx < winnersCount;
    const isMe = user.userId === state.userId;
    const row = document.createElement("div");
    row.className = `row ${isWinner ? "winner" : "loser"}`;
    if (isMe) row.style.borderRight = "4px solid #fff";
    row.innerHTML = `
        <div class="player-name">${idx + 1}. ${user.username} ${isMe ? "(You)" : ""}</div>
        <div class="player-bid">${user.amount.toLocaleString()} ⭐️</div>
    `;
    ui.display.leaderboard.appendChild(row);
  });
}

function renderInventory(gifts) {
  const container = ui.display.inventory;
  if (!container) return;
  container.innerHTML = "";
  if (gifts.length === 0) {
    container.innerHTML = '<div class="empty-state">No gifts won yet.</div>';
    return;
  }
  gifts.forEach((gift) => {
    const card = document.createElement("div");
    card.className = "gift-card";
    card.style.backgroundColor = gift.assetColor || "#007aff";
    card.innerHTML = `
        <div class="gift-icon">${gift.assetSymbol || "🎁"}</div>
        <div class="gift-name">${gift.assetName} #${gift.serialNumber}</div>
        <div class="gift-price">Paid: ${gift.purchasePrice} ⭐️</div>
    `;
    container.appendChild(card);
  });
}

// 🔥 СТАБИЛЬНЫЙ ТАЙМЕР
function runTimer(endTime) {
  // Очищаем старый интервал
  if (state.timerInterval) clearInterval(state.timerInterval);

  const tick = () => {
    // ⛔️ Если аукцион уже завершен, не даем таймеру ничего писать
    if (state.isFinished) {
      clearInterval(state.timerInterval);
      return;
    }

    const diff = endTime - Date.now();

    if (!ui.display.timer) return;

    // Переходный момент
    if (diff <= 0) {
      ui.display.timer.innerText = "Calculations...";
      ui.display.timer.style.color = "#8e8e93";

      // Долбим сервер, пока он не скажет статус
      fetchAuctionState();
      return;
    }

    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    ui.display.timer.innerText = `${m}:${s.toString().padStart(2, "0")}`;
    ui.display.timer.style.color = diff < 30000 ? "var(--red)" : "var(--text)";
  };

  tick();
  state.timerInterval = setInterval(tick, 1000);
}

function showStatus(msg, isError) {
  if (!ui.display.status) return;
  ui.display.status.innerText = msg;
  ui.display.status.style.color = isError ? "var(--red)" : "var(--green)";
  setTimeout(() => {
    if (ui.display.status) ui.display.status.innerText = "";
  }, 3000);
}
