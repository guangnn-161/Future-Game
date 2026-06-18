const roleRules = {
  T: { name: "Trader", minTrades: 0, maxTrades: 2, maxQty: 2, lossLimit: -3000, rescuePayback: 2200 },
  S: { name: "Speculator", minTrades: 2, maxTrades: 4, maxQty: 3, lossLimit: -2000, rescuePayback: 2400 },
  M: { name: "Market Maker", minTrades: 2, maxTrades: 3, maxQty: 3, lossLimit: -5000, rescuePayback: 0 }
};

const phases = [
  {
    key: "blind",
    name: "Blind Trade",
    rules: "Only market makers can initiate. You can trade here only as a Market Maker or with a Market Maker."
  },
  {
    key: "news",
    name: "News Revealed",
    rules: "The headline is public, but the exact type and coefficient are hidden. Everyone can trade."
  },
  {
    key: "professional",
    name: "Professional Trading",
    rules: "The news type is known. Only Speculators and Market Makers can trade."
  },
  {
    key: "verified",
    name: "News Verified",
    rules: "The market knows whether the news is true or fake. Everyone can trade."
  },
  {
    key: "flash",
    name: "Flash Trade",
    rules: "Very short phase. Each player gets at most one trade and the market allows only two trades."
  },
  {
    key: "final",
    name: "Finalize Day",
    rules: "The closing price is calculated and all trades are marked to market."
  }
];

const headlines = [
  { text: "A2Z signs a national school platform contract.", type: "Very Good", base: 5 },
  { text: "A2Z releases a high-margin AI tutoring product.", type: "Good", base: 3 },
  { text: "A2Z reports stable enrollment and steady renewals.", type: "Mild Good", base: 1 },
  { text: "A2Z delays a product launch but keeps guidance.", type: "Mild Bad", base: -1 },
  { text: "A2Z loses a key provincial distribution partner.", type: "Bad", base: -3 },
  { text: "A2Z faces an audit over reported subscription numbers.", type: "Very Bad", base: -5 }
];

const els = {};
let state;
let quoteBoard = [];

function money(value) {
  return Math.round(value).toLocaleString("en-US");
}

function signed(value) {
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${money(rounded)}`;
}

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function pick(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function makeActor(id, role, isHuman = false) {
  return {
    id,
    role,
    isHuman,
    active: true,
    totalPL: 0,
    rescueUsed: false,
    hedgeUsed: false,
    loanDue: 0,
    dayTrades: [],
    flashTrades: 0
  };
}

function createState(role) {
  const actors = [
    makeActor("You", role, true),
    makeActor("T1", "T"),
    makeActor("T2", "T"),
    makeActor("S1", "S"),
    makeActor("S2", "S"),
    makeActor("M1", "M"),
    makeActor("M2", "M")
  ];

  return {
    day: 1,
    phaseIndex: 0,
    openPrice: 10000,
    indicativePrice: 10000,
    flashMarketTrades: 0,
    gameOver: false,
    actors,
    dayEvent: newEvent(10000),
    log: ["Game opened at 10,000 VND per contract."]
  };
}

function newEvent(openPrice) {
  const headline = pick(headlines);
  const fake = Math.random() < 0.1;
  const coefficient = fake ? headline.base * -0.5 : headline.base;
  const reaction = Number(rand(0.2, 5).toFixed(2));
  return {
    ...headline,
    fake,
    coefficient,
    reaction,
    closePrice: Math.max(10, openPrice + coefficient * reaction * 100)
  };
}

function currentPhase() {
  return phases[state.phaseIndex];
}

function player() {
  return state.actors[0];
}

function activeBots() {
  return state.actors.filter((actor) => !actor.isHuman && actor.active);
}

function canActorTrade(actor, phase = currentPhase()) {
  if (!actor.active || state.gameOver || phase.key === "final") return false;
  if (phase.key === "professional" && !["S", "M"].includes(actor.role)) return false;
  if (phase.key === "flash" && actor.flashTrades >= 1) return false;
  if (phase.key === "flash" && state.flashMarketTrades >= 2) return false;
  return actor.dayTrades.length < roleRules[actor.role].maxTrades;
}

function canPairTrade(a, b, phase = currentPhase()) {
  if (!canActorTrade(a, phase) || !canActorTrade(b, phase)) return false;
  if (phase.key === "blind" && a.role !== "M" && b.role !== "M") return false;
  return true;
}

function fairValueForPhase() {
  const event = state.dayEvent;
  const phase = currentPhase().key;
  let knownCoefficient = 0;

  if (phase === "news") knownCoefficient = event.base * 0.35;
  if (phase === "professional") knownCoefficient = event.base * 0.65;
  if (phase === "verified" || phase === "flash" || phase === "final") knownCoefficient = event.coefficient;

  return state.openPrice + knownCoefficient * event.reaction * 100;
}

function botQuote(bot) {
  const roleBias = { T: 35, S: 55, M: 25 }[bot.role];
  const center = fairValueForPhase() + rand(-90, 90);
  const spread = roleBias + rand(0, 45);
  return {
    bot,
    bid: Math.max(10, Math.round((center - spread) / 10) * 10),
    ask: Math.max(10, Math.round((center + spread) / 10) * 10)
  };
}

function buildQuotes() {
  quoteBoard = activeBots()
    .filter((bot) => canPairTrade(player(), bot))
    .map(botQuote);
  return quoteBoard;
}

function getQuotes() {
  return quoteBoard.filter((quote) => canPairTrade(player(), quote.bot));
}

function validateTrade(human, bot, side, qty, price) {
  const rules = roleRules[human.role];
  if (!human.active) return "You have been eliminated.";
  if (!bot || !bot.active) return "Choose an active counterparty.";
  if (!canPairTrade(human, bot)) return "This pair cannot trade in the current phase.";
  if (!Number.isFinite(qty) || qty < 1) return "Contracts must be at least 1.";
  if (qty > rules.maxQty || qty > roleRules[bot.role].maxQty) return `Max trade size for this deal is ${Math.min(rules.maxQty, roleRules[bot.role].maxQty)}.`;
  if (!Number.isFinite(price) || price < 0) return "Price cannot be negative.";
  if (price % 10 !== 0) return "Price must use 10 VND ticks.";
  const quote = quoteBoard.find((item) => item.bot.id === bot.id) || botQuote(bot);
  if (side === "buy" && price < quote.ask - 80) return "Your buy price is too far below this bot's ask.";
  if (side === "sell" && price > quote.bid + 80) return "Your sell price is too far above this bot's bid.";
  return "";
}

function recordTrade(buyer, seller, qty, price, source) {
  const trade = { buyer: buyer.id, seller: seller.id, qty, price, source };
  buyer.dayTrades.push({ side: "buy", qty, price, cp: seller.id, source });
  seller.dayTrades.push({ side: "sell", qty, price, cp: buyer.id, source });
  if (currentPhase().key === "flash") {
    buyer.flashTrades += 1;
    seller.flashTrades += 1;
    state.flashMarketTrades += 1;
  }
  state.log.unshift(`${source}: ${buyer.id} bought ${qty} from ${seller.id} at ${money(price)}.`);
}

function submitTrade() {
  const human = player();
  const bot = state.actors.find((actor) => actor.id === els.botInput.value);
  const side = els.sideInput.value;
  const qty = Number(els.qtyInput.value);
  const price = Number(els.priceInput.value);
  const error = validateTrade(human, bot, side, qty, price);

  if (error) {
    state.log.unshift(`Order rejected: ${error}`);
    render();
    return;
  }

  if (side === "buy") recordTrade(human, bot, qty, price, "Your order");
  else recordTrade(bot, human, qty, price, "Your order");

  simulateBots(1);
  render();
}

function simulateBots(maxTrades = 3) {
  const candidates = activeBots();
  let attempts = 0;
  let trades = 0;
  while (attempts < 24 && trades < maxTrades) {
    attempts += 1;
    const a = pick(candidates);
    const b = pick(candidates.filter((bot) => bot !== a));
    if (!a || !b || !canPairTrade(a, b)) continue;
    const quote = botQuote(b);
    const side = Math.random() > 0.5 ? "buy" : "sell";
    const qty = Math.floor(rand(1, Math.min(roleRules[a.role].maxQty, roleRules[b.role].maxQty) + 1));
    const price = side === "buy" ? quote.ask : quote.bid;
    if (side === "buy") recordTrade(a, b, qty, price, "Bot trade");
    else recordTrade(b, a, qty, price, "Bot trade");
    trades += 1;
  }
}

function tradePL(trade, closePrice) {
  const gross = trade.side === "buy" ? (closePrice - trade.price) * trade.qty : (trade.price - closePrice) * trade.qty;
  return gross - 50 * trade.qty;
}

function settleDay() {
  const event = state.dayEvent;
  let closePrice = event.closePrice;
  if (state.day === 5) closePrice = clamp(closePrice, state.openPrice - 1000, state.openPrice + 1000);
  closePrice = Math.round(closePrice / 10) * 10;
  state.indicativePrice = closePrice;

  for (const actor of state.actors) {
    if (!actor.active) continue;

    if (actor.loanDue > 0) {
      actor.totalPL -= actor.loanDue;
      state.log.unshift(`${actor.id} repaid rescue loan: ${money(actor.loanDue)}.`);
      actor.loanDue = 0;
    }

    const dayPL = actor.dayTrades.reduce((sum, trade) => sum + tradePL(trade, closePrice), 0);
    actor.totalPL += dayPL;

    const rules = roleRules[actor.role];
    if (actor.dayTrades.length < rules.minTrades) {
      actor.active = false;
      state.log.unshift(`${actor.id} eliminated for missing the minimum trade count.`);
      continue;
    }

    if (state.day < 5 && actor.totalPL < rules.lossLimit) {
      if (actor.role === "M" && !actor.hedgeUsed) {
        const worst = actor.dayTrades
          .map((trade) => ({ trade, pl: tradePL(trade, closePrice) }))
          .sort((a, b) => a.pl - b.pl)[0];
        if (worst && worst.pl < 0) {
          const hedgeQty = Math.min(2, worst.trade.qty);
          const relief = Math.min(-worst.pl, Math.abs(actor.totalPL - rules.lossLimit) + 300 * hedgeQty);
          actor.totalPL += relief - 300 * hedgeQty;
          actor.hedgeUsed = true;
          state.log.unshift(`${actor.id} hedged ${hedgeQty} losing contract(s).`);
        }
      } else if (!actor.rescueUsed && actor.role !== "M") {
        actor.totalPL += 2000;
        actor.loanDue = rules.rescuePayback;
        actor.rescueUsed = true;
        state.log.unshift(`${actor.id} used rescue loan. Payback next day: ${money(rules.rescuePayback)}.`);
      }
    }

    if (actor.totalPL < rules.lossLimit) {
      actor.active = false;
      state.log.unshift(`${actor.id} eliminated for crossing the loss limit.`);
    }
  }

  state.log.unshift(`Day ${state.day} closed at ${money(closePrice)}. Coefficient ${event.coefficient}, reaction ${event.reaction}.`);

  if (state.day >= 5 || !player().active) {
    state.gameOver = true;
    announceWinner();
    return;
  }

  state.day += 1;
  state.phaseIndex = 0;
  state.openPrice = closePrice;
  state.indicativePrice = closePrice;
  state.flashMarketTrades = 0;
  state.dayEvent = newEvent(closePrice);
  for (const actor of state.actors) {
    actor.dayTrades = [];
    actor.flashTrades = 0;
  }
}

function announceWinner() {
  const ranked = state.actors.filter((actor) => actor.active).sort((a, b) => b.totalPL - a.totalPL);
  const winner = ranked[0];
  if (winner) state.log.unshift(`Game over. Winner: ${winner.id} with ${signed(winner.totalPL)}.`);
  else state.log.unshift("Game over. No active players remain.");
}

function advancePhase() {
  if (state.gameOver) {
    newGame();
    return;
  }

  const phase = currentPhase();
  if (phase.key !== "final") simulateBots(phase.key === "flash" ? 2 : 4);

  if (phase.key === "final") {
    settleDay();
  } else {
    state.phaseIndex += 1;
    if (currentPhase().key === "final") settleDay();
  }

  render();
}

function newsText() {
  const event = state.dayEvent;
  const phase = currentPhase().key;
  if (phase === "blind") return "No headline yet. Market makers may probe the pit before the news tape opens.";
  if (phase === "news") return `Headline: ${event.text}`;
  if (phase === "professional") return `Headline: ${event.text} Type: ${event.type}.`;
  if (phase === "verified" || phase === "flash" || phase === "final") {
    return `Verified: ${event.fake ? "fake" : "true"} news. Coefficient: ${event.coefficient}. Reaction: ${event.reaction}.`;
  }
  return "";
}

function renderQuotes() {
  const quotes = quoteBoard;
  els.quotes.innerHTML = quotes.map((quote) => `
    <article class="quote-card">
      <strong>${quote.bot.id} - ${roleRules[quote.bot.role].name}</strong>
      <div class="quote-line"><span>Bid</span><b>${money(quote.bid)}</b></div>
      <div class="quote-line"><span>Ask</span><b>${money(quote.ask)}</b></div>
      <div class="quote-line"><span>Trades</span><b>${quote.bot.dayTrades.length} / ${roleRules[quote.bot.role].maxTrades}</b></div>
    </article>
  `).join("") || `<article class="quote-card"><strong>No valid bot quotes</strong><div class="quote-line"><span>Advance the phase or start a new day.</span></div></article>`;

  const currentBot = els.botInput.value;
  els.botInput.innerHTML = quotes.map((quote) => `<option value="${quote.bot.id}">${quote.bot.id} - ${roleRules[quote.bot.role].name}</option>`).join("");
  if (quotes.some((quote) => quote.bot.id === currentBot)) els.botInput.value = currentBot;
}

function renderLeaderboard() {
  const rows = [...state.actors].sort((a, b) => b.totalPL - a.totalPL);
  els.leaderboard.innerHTML = rows.map((actor) => `
    <tr>
      <td>${actor.id}</td>
      <td>${roleRules[actor.role].name}</td>
      <td>${actor.active ? "Active" : "Out"}</td>
      <td>${actor.dayTrades.length} / ${roleRules[actor.role].maxTrades}</td>
      <td class="${actor.totalPL >= 0 ? "positive" : "negative"}">${signed(actor.totalPL)}</td>
    </tr>
  `).join("");
}

function renderPlayerTrades() {
  const trades = player().dayTrades;
  els.playerTrades.innerHTML = trades.map((trade) => `
    <div class="trade-item">
      <strong>${trade.side.toUpperCase()} ${trade.qty}</strong> at ${money(trade.price)} with ${trade.cp}
    </div>
  `).join("") || `<div class="trade-item">No trades today.</div>`;
}

function render() {
  const human = player();
  const rules = roleRules[human.role];
  const phase = currentPhase();

  els.dayText.textContent = `${state.day} / 5`;
  els.phaseText.textContent = phase.name;
  els.openText.textContent = money(state.openPrice);
  els.indicativeText.textContent = money(Math.round(fairValueForPhase() / 10) * 10);
  els.plText.textContent = signed(human.totalPL);
  els.plText.className = human.totalPL >= 0 ? "positive" : "negative";
  els.tradeTitle.textContent = state.gameOver ? "Game Complete" : "Quote Board";
  els.newsBox.textContent = newsText();
  els.phaseRules.textContent = phase.rules;
  els.playerRoleText.textContent = rules.name;
  els.playerStatus.textContent = human.active ? "Active" : "Out";
  els.playerStatus.className = `status-pill${human.active ? "" : " out"}`;
  els.tradeCountText.textContent = `${human.dayTrades.length} / ${rules.maxTrades}`;
  els.maxSizeText.textContent = rules.maxQty;
  els.lossLimitText.textContent = money(rules.lossLimit);
  els.rescueText.textContent = human.role === "M" ? (human.hedgeUsed ? "Hedge used" : "Hedge ready") : (human.rescueUsed ? "Used" : "Available");
  els.loanText.textContent = money(human.loanDue);
  els.advanceButton.textContent = state.gameOver ? "New Game" : "Next Phase";
  buildQuotes();
  els.tradeButton.disabled = !canActorTrade(human) || quoteBoard.length === 0;
  els.qtyInput.max = rules.maxQty;

  renderQuotes();
  renderLeaderboard();
  renderPlayerTrades();

  const winner = state.gameOver ? state.actors.filter((actor) => actor.active).sort((a, b) => b.totalPL - a.totalPL)[0] : null;
  els.winnerText.textContent = winner ? `Winner: ${winner.id}` : "";
  els.logList.innerHTML = state.log.slice(0, 18).map((item) => `<li>${item}</li>`).join("");
}

function newGame() {
  state = createState(els.roleSelect.value);
  render();
}

function bindElements() {
  for (const id of [
    "roleSelect", "newGameButton", "dayText", "phaseText", "openText", "indicativeText", "plText",
    "advanceButton", "newsBox", "sideInput", "qtyInput", "priceInput", "botInput", "tradeButton",
    "phaseRules", "quotes", "playerRoleText", "playerStatus", "tradeCountText", "maxSizeText",
    "lossLimitText", "rescueText", "loanText", "playerTrades", "leaderboard", "winnerText",
    "logList", "tradeTitle"
  ]) {
    els[id] = document.getElementById(id);
  }

  els.newGameButton.addEventListener("click", newGame);
  els.advanceButton.addEventListener("click", advancePhase);
  els.tradeButton.addEventListener("click", submitTrade);
  els.sideInput.addEventListener("change", render);
  els.botInput.addEventListener("change", () => {
    const quote = getQuotes().find((item) => item.bot.id === els.botInput.value);
    if (!quote) return;
    els.priceInput.value = els.sideInput.value === "buy" ? quote.ask : quote.bid;
  });
}

bindElements();
newGame();
