// 상식 퀴즈 앱 — 구현 2단계(연습, 스피드, 힌트 모드와 틀린 문제 다시 풀기)
"use strict";

const CATEGORIES = ["한국사", "세계지리", "과학", "예술과 문화"];
const MODES = {
  practice: { name: "연습", timeLimit: 0, hint: false },
  speed: { name: "스피드", timeLimit: 15, hint: false },
  hint: { name: "힌트", timeLimit: 0, hint: true },
};

// ── 순수 로직(자체 점검 대상) ─────────────────────────────

function validateQuestions(list) {
  const errors = [];
  const counts = {};
  const ids = new Set();
  list.forEach((q) => {
    if (ids.has(q.id)) errors.push(`${q.id}: id 중복`);
    ids.add(q.id);
    if (!CATEGORIES.includes(q.category)) errors.push(`${q.id}: 알 수 없는 카테고리`);
    counts[q.category] = (counts[q.category] || 0) + 1;
    if (!Array.isArray(q.choices) || q.choices.length !== 4) errors.push(`${q.id}: 보기는 4개여야 함`);
    else if (new Set(q.choices).size !== 4) errors.push(`${q.id}: 보기 중복`);
    if (!(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4)) errors.push(`${q.id}: 정답 번호 오류`);
    if (!q.explanation || !q.source || !q.source.url) errors.push(`${q.id}: 해설 또는 출처 없음`);
  });
  const sizes = CATEGORIES.map((c) => counts[c] || 0);
  if (sizes.some((n) => n !== sizes[0]) || sizes[0] === 0) errors.push("카테고리마다 문항 수가 같아야 함");
  return errors;
}

function shuffle(arr, rand = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 보기 순서를 섞고, 섞인 뒤의 정답 위치를 함께 돌려준다.
function prepareQuestion(q, rand = Math.random) {
  const order = shuffle([0, 1, 2, 3], rand);
  return {
    ...q,
    choices: order.map((i) => q.choices[i]),
    answer: order.indexOf(q.answer),
  };
}

function buildRound(all, category, rand = Math.random) {
  return shuffle(all.filter((q) => q.category === category), rand).map((q) => prepareQuestion(q, rand));
}

// 맞힌 문항의 점수. 틀리면 0, 힌트를 쓰고 맞히면 0.5, 그 밖에는 1.
function scoreFor(correct, usedHint) {
  if (!correct) return 0;
  return usedHint ? 0.5 : 1;
}

// 힌트: 오답 보기 가운데 무작위로 두 개의 인덱스를 고른다.
function pickHintRemovals(answer, rand = Math.random) {
  const wrong = [0, 1, 2, 3].filter((i) => i !== answer);
  return shuffle(wrong, rand).slice(0, 2);
}

function formatScore(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

// ── 화면 상태 ──────────────────────────────────────────

const state = {
  category: null,
  mode: null,
  round: [],        // 이번 판의 문항
  index: 0,
  score: 0,
  results: [],      // { q, chosen, correct, timeout, usedHint }
  answered: false,
  usedHint: false,
  retry: false,     // 틀린 문제 다시 풀기 중인지
  retryWrong: [],   // 다시 풀기에서 또 틀린 문항
  firstResults: null,
  timerId: null,
  timeLeft: 0,
};

const $ = (id) => document.getElementById(id);

function show(screen) {
  ["start", "mode", "quiz", "result"].forEach((s) => {
    $(`screen-${s}`).hidden = s !== screen;
  });
}

function stopTimer() {
  if (state.timerId !== null) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
}

function renderStart() {
  stopTimer();
  const list = $("category-list");
  list.textContent = "";
  CATEGORIES.forEach((c) => {
    const b = document.createElement("button");
    b.textContent = c;
    b.addEventListener("click", () => {
      state.category = c;
      $("mode-title").textContent = `${c} · 모드를 고르세요`;
      show("mode");
    });
    list.appendChild(b);
  });
  show("start");
}

function startRound(mode) {
  state.mode = mode;
  state.round = buildRound(QUESTIONS, state.category);
  state.index = 0;
  state.score = 0;
  state.results = [];
  state.retry = false;
  state.firstResults = null;
  show("quiz");
  renderQuestion();
}

function startRetry(wrongQuestions) {
  state.retry = true;
  state.round = shuffle(wrongQuestions).map((q) => prepareQuestion(q));
  state.index = 0;
  state.retryWrong = [];
  show("quiz");
  renderQuestion();
}

function renderQuestion() {
  stopTimer();
  const q = state.round[state.index];
  const mode = MODES[state.mode];
  state.answered = false;
  state.usedHint = false;

  $("quiz-label").textContent = `${state.category} · ${mode.name}${state.retry ? " (다시 풀기)" : ""}`;
  $("quiz-progress").textContent = `${state.index + 1} / ${state.round.length}`;
  $("quiz-score").textContent = state.retry ? "채점 안 함" : `점수 ${formatScore(state.score)}`;
  $("question-text").textContent = q.question;

  const list = $("choice-list");
  list.textContent = "";
  q.choices.forEach((text, i) => {
    const b = document.createElement("button");
    b.className = "choice";
    b.textContent = `${i + 1}. ${text}`;
    b.dataset.index = i;
    b.addEventListener("click", () => answer(i));
    list.appendChild(b);
  });

  $("feedback").hidden = true;
  $("btn-next").hidden = true;

  const hintBtn = $("btn-hint");
  hintBtn.hidden = !mode.hint;
  hintBtn.disabled = false;
  hintBtn.textContent = "힌트 (오답 2개 지우기)";

  const timer = $("timer");
  if (mode.timeLimit > 0) {
    state.timeLeft = mode.timeLimit;
    timer.hidden = false;
    renderTimer();
    state.timerId = setInterval(tick, 1000);
  } else {
    timer.hidden = true;
  }
}

function renderTimer() {
  const timer = $("timer");
  timer.textContent = `남은 시간 ${state.timeLeft}초`;
  timer.classList.toggle("danger", state.timeLeft <= 5);
}

function tick() {
  state.timeLeft -= 1;
  renderTimer();
  if (state.timeLeft <= 0) {
    stopTimer();
    answer(null);
  }
}

function useHint() {
  if (state.answered || state.usedHint) return;
  const q = state.round[state.index];
  state.usedHint = true;
  const buttons = $("choice-list").children;
  pickHintRemovals(q.answer).forEach((i) => {
    buttons[i].classList.add("removed");
    buttons[i].disabled = true;
  });
  $("btn-hint").disabled = true;
  $("btn-hint").textContent = "힌트 사용함";
}

// chosen이 null이면 시간 초과
function answer(chosen) {
  if (state.answered) return;
  state.answered = true;
  stopTimer();
  const q = state.round[state.index];
  const timeout = chosen === null;
  const correct = !timeout && chosen === q.answer;

  const buttons = $("choice-list").children;
  Array.from(buttons).forEach((b, i) => {
    b.disabled = true;
    if (i === q.answer) b.classList.add("correct");
    else if (i === chosen) b.classList.add("wrong");
  });
  $("btn-hint").disabled = true;

  if (state.retry) {
    if (!correct) state.retryWrong.push(state.round[state.index]);
  } else {
    state.score += scoreFor(correct, state.usedHint);
    state.results.push({ q, chosen, correct, timeout, usedHint: state.usedHint });
    $("quiz-score").textContent = `점수 ${formatScore(state.score)}`;
  }

  let msg;
  if (timeout) msg = "시간 초과";
  else if (correct) msg = state.usedHint ? "정답 (힌트 0.5점)" : "정답";
  else msg = "오답";
  $("feedback-result").textContent = `${msg} — 정답: ${q.choices[q.answer]}`;
  $("feedback-explanation").textContent = q.explanation;
  const src = $("feedback-source");
  src.textContent = `출처: ${q.source.name}`;
  src.href = q.source.url;
  $("feedback").hidden = false;

  const next = $("btn-next");
  next.textContent = state.index === state.round.length - 1 ? "결과 보기" : "다음";
  next.hidden = false;
}

function next() {
  if (state.index < state.round.length - 1) {
    state.index += 1;
    renderQuestion();
  } else {
    renderResult();
  }
}

function renderResult() {
  stopTimer();
  const mode = MODES[state.mode];
  const results = state.firstResults || state.results;
  state.firstResults = results;
  const total = results.length;

  $("result-title").textContent = `${state.category} · ${mode.name} 결과`;
  $("result-score").textContent = `${formatScore(state.score)} / ${total}`;

  if (state.mode === "practice") {
    $("result-note").textContent = state.retry
      ? (state.retryWrong.length ? `다시 풀기에서 ${state.retryWrong.length}문항을 또 틀렸습니다. 점수는 처음 판의 결과입니다. · 순위표에 기록되지 않음` : "다시 풀기에서 모두 맞혔습니다. 점수는 처음 판의 결과입니다. · 순위표에 기록되지 않음")
      : "연습 모드 · 순위표에 기록되지 않음";
  } else {
    $("result-note").textContent = "";
  }

  const list = $("result-list");
  list.textContent = "";
  results.forEach((r) => {
    const li = document.createElement("li");
    const mark = document.createElement("span");
    let label;
    if (r.timeout) label = "시간 초과";
    else if (r.correct) label = r.usedHint ? "정답 (힌트 0.5점)" : "정답";
    else label = "오답";
    mark.className = r.correct ? "ok" : "ng";
    mark.textContent = label;
    li.appendChild(mark);
    li.appendChild(document.createTextNode(` ${r.q.question} → ${r.q.choices[r.q.answer]}`));
    list.appendChild(li);
  });

  // 틀린 문제 다시 풀기는 연습 모드에서만. 다시 풀기 중이면 또 틀린 문항만 남긴다.
  let wrongs = [];
  if (state.mode === "practice") {
    wrongs = state.retry ? state.retryWrong.slice() : results.filter((r) => !r.correct).map((r) => r.q);
  }
  const retryBtn = $("btn-retry-wrong");
  retryBtn.hidden = wrongs.length === 0;
  retryBtn.onclick = () => startRetry(wrongs);

  show("result");
}

function init() {
  const errors = validateQuestions(QUESTIONS);
  if (errors.length) {
    console.error("문항 데이터 오류:", errors);
    document.querySelector(".app").insertAdjacentHTML("beforeend", "<p>문항 데이터에 오류가 있어 시작할 수 없습니다.</p>");
    return;
  }
  document.querySelectorAll(".mode-btn").forEach((b) => {
    b.addEventListener("click", () => startRound(b.dataset.mode));
  });
  $("btn-back").addEventListener("click", renderStart);
  $("btn-hint").addEventListener("click", useHint);
  $("btn-next").addEventListener("click", next);
  $("btn-again").addEventListener("click", () => startRound(state.mode));
  $("btn-home").addEventListener("click", renderStart);
  renderStart();
  if (new URLSearchParams(location.search).has("test")) runSelfTest();
}

// ── 자체 점검: 주소 끝에 ?test를 붙이면 콘솔에 결과가 나온다 ──

function runSelfTest() {
  let pass = 0, fail = 0;
  const check = (name, ok) => {
    if (ok) { pass++; console.log(`통과: ${name}`); }
    else { fail++; console.error(`실패: ${name}`); }
  };
  const seeded = (seed) => () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);

  check("문항 데이터 검사 통과", validateQuestions(QUESTIONS).length === 0);
  check("카테고리 4개", CATEGORIES.length === 4);
  CATEGORIES.forEach((c) => check(`${c} 문항 10개`, QUESTIONS.filter((q) => q.category === c).length === 10));
  const round = buildRound(QUESTIONS, "과학", seeded(1));
  check("한 판은 한 카테고리의 10문항", round.length === 10 && round.every((q) => q.category === "과학"));
  const orig = QUESTIONS[0];
  const prepared = prepareQuestion(orig, seeded(7));
  check("보기를 섞어도 정답 보기가 같음", prepared.choices[prepared.answer] === orig.choices[orig.answer]);
  check("정답 1점", scoreFor(true, false) === 1);
  check("오답 0점", scoreFor(false, false) === 0 && scoreFor(false, true) === 0);
  check("힌트 쓰고 정답 0.5점", scoreFor(true, true) === 0.5);
  const removed = pickHintRemovals(2, seeded(3));
  check("힌트는 오답 2개를 지움", removed.length === 2 && !removed.includes(2) && new Set(removed).size === 2);
  check("스피드 모드 15초", MODES.speed.timeLimit === 15);
  check("연습·힌트 모드는 시간 제한 없음", MODES.practice.timeLimit === 0 && MODES.hint.timeLimit === 0);
  check("힌트는 힌트 모드에만", MODES.hint.hint && !MODES.speed.hint && !MODES.practice.hint);
  check("점수 표시 7.5", formatScore(7.5) === "7.5" && formatScore(8) === "8");

  console.log(`자체 점검 결과: 통과 ${pass}, 실패 ${fail}`);
  return { pass, fail };
}

if (typeof document !== "undefined") {
  init();
} else if (typeof module !== "undefined") {
  module.exports = { validateQuestions, shuffle, prepareQuestion, buildRound, scoreFor, pickHintRemovals, formatScore, MODES, CATEGORIES };
}
