(function () {
  "use strict";

  const LABELS = ["a", "b", "c", "d"];
  const MANIFEST_URL = new URL("../db/manifest.json", window.location.href).href;
  const TIMER_R = 20;
  const TIMER_C = 2 * Math.PI * TIMER_R;

  const els = {
    list: document.getElementById("quiz-list"),
    listError: document.getElementById("list-error"),
    screenList: document.getElementById("screen-list"),
    screenPlay: document.getElementById("screen-play"),
    playArea: document.getElementById("play-area"),
    playTitle: document.getElementById("play-title"),
    playProgress: document.getElementById("play-progress"),
    btnBack: document.getElementById("btn-back"),
  };

  let currentQuiz = null;
  let playIndex = 0;
  let playScore = 0;
  let playAnswered = false;
  /** Секунды на один вопрос; 0 — без таймера */
  let sessionTimerSeconds = 0;
  let questionTimerRaf = null;
  let questionTimerEndsAt = 0;
  let questionTimerTotalMs = 0;

  function clearQuestionTimer() {
    if (questionTimerRaf !== null) {
      cancelAnimationFrame(questionTimerRaf);
      questionTimerRaf = null;
    }
    questionTimerEndsAt = 0;
    questionTimerTotalMs = 0;
  }

  function showList() {
    clearQuestionTimer();
    sessionTimerSeconds = 0;
    els.screenList.classList.add("active");
    els.screenList.hidden = false;
    els.screenPlay.classList.remove("active");
    els.screenPlay.hidden = true;
    currentQuiz = null;
  }

  function showPlay() {
    els.screenList.classList.remove("active");
    els.screenList.hidden = true;
    els.screenPlay.classList.add("active");
    els.screenPlay.hidden = false;
  }

  function validQuestions(q) {
    const raw = q.questions || [];
    return raw.filter(
      (x) =>
        String(x.text || "").trim() &&
        Array.isArray(x.options) &&
        x.options.length === 4 &&
        x.options.every((o) => String(o).trim()) &&
        x.correctIndex >= 0 &&
        x.correctIndex <= 3
    );
  }

  function updateTimerVisual(timerCircle, timerText, timerWrap, leftMs, totalMs) {
    const ratio = totalMs > 0 ? Math.max(0, Math.min(1, leftMs / totalMs)) : 0;
    const off = TIMER_C * (1 - ratio);
    timerCircle.setAttribute("stroke-dashoffset", String(off));
    timerText.textContent = String(Math.max(0, Math.ceil(leftMs / 1000)));
    if (leftMs > 0 && leftMs < 10000) timerWrap.classList.add("play-timer--warn");
    else timerWrap.classList.remove("play-timer--warn");
  }

  function revealAnswer(q, qs, userIndex, wrap, opts, timedOut) {
    playAnswered = true;
    clearQuestionTimer();
    const correct = userIndex !== null && userIndex === q.correctIndex;
    if (correct) playScore++;
    opts.querySelectorAll(".play-opt").forEach((b, j) => {
      b.disabled = true;
      if (j === q.correctIndex) b.classList.add("correct");
      else if (userIndex !== null && j === userIndex && !correct) b.classList.add("wrong");
    });
    if (timedOut) {
      const to = document.createElement("p");
      to.className = "play-timeout-msg";
      to.textContent = "Время вышло — ответ не засчитан.";
      wrap.appendChild(to);
    }
    const expl = String(q.comment || "").trim();
    if (expl) {
      const box = document.createElement("div");
      box.className = "play-comment";
      const h = document.createElement("strong");
      h.textContent = "Комментарий: ";
      box.appendChild(h);
      const span = document.createElement("span");
      span.textContent = expl;
      box.appendChild(span);
      wrap.appendChild(box);
    }
    const actions = document.createElement("div");
    actions.className = "play-actions";
    const next = document.createElement("button");
    next.type = "button";
    next.className = "btn";
    next.textContent = playIndex + 1 < qs.length ? "Дальше" : "Результат";
    next.addEventListener("click", () => {
      playIndex++;
      renderQuestion();
    });
    actions.appendChild(next);
    wrap.appendChild(actions);
  }

  async function loadManifest() {
    els.listError.hidden = true;
    els.list.innerHTML = "";
    let res;
    try {
      res = await fetch(MANIFEST_URL);
    } catch (e) {
      els.listError.textContent =
        "Не удалось загрузить manifest.json. Запустите сервер из корня репозитория (см. подвал страницы).";
      els.listError.hidden = false;
      return;
    }
    if (!res.ok) {
      els.listError.textContent =
        "Файл quiz/db/manifest.json не найден (код " + res.status + ").";
      els.listError.hidden = false;
      return;
    }
    const data = await res.json();
    const items = data.quizzes || [];
    if (!items.length) {
      els.listError.textContent = "В manifest.json пустой список квизов.";
      els.listError.hidden = false;
      return;
    }

    items.forEach((item) => {
      const li = document.createElement("li");
      li.className = "quiz-list-item";

      const info = document.createElement("div");
      info.className = "quiz-item-info";
      info.setAttribute("role", "button");
      info.tabIndex = 0;
      const t = document.createElement("span");
      t.className = "quiz-item-title";
      t.textContent = item.title || item.id || "Без названия";
      info.appendChild(t);
      if (item.description) {
        const d = document.createElement("span");
        d.className = "quiz-item-desc";
        d.textContent = item.description;
        info.appendChild(d);
      }
      const openNoTimer = () => startQuiz(item, 0);
      info.addEventListener("click", openNoTimer);
      info.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openNoTimer();
        }
      });

      const controls = document.createElement("div");
      controls.className = "quiz-item-controls";
      const timerLabel = document.createElement("label");
      timerLabel.className = "quiz-timer-label";
      timerLabel.htmlFor = "timer-" + (item.id || item.file || Math.random().toString(36).slice(2));
      timerLabel.textContent = "Таймер, с";
      const timerInput = document.createElement("input");
      timerInput.id = timerLabel.htmlFor;
      timerInput.type = "number";
      timerInput.min = "0";
      timerInput.max = "3600";
      timerInput.step = "1";
      timerInput.placeholder = "0";
      timerInput.className = "quiz-timer-input";
      timerInput.title = "Секунды на каждый вопрос; 0 или пусто — без таймера";
      const startBtn = document.createElement("button");
      startBtn.type = "button";
      startBtn.className = "btn quiz-start-btn";
      startBtn.textContent = "Начать";
      startBtn.addEventListener("click", () => {
        const raw = String(timerInput.value || "").trim();
        const sec = raw === "" ? 0 : Math.max(0, parseInt(raw, 10) || 0);
        startQuiz(item, sec);
      });

      controls.appendChild(timerLabel);
      controls.appendChild(timerInput);
      controls.appendChild(startBtn);

      li.appendChild(info);
      li.appendChild(controls);
      els.list.appendChild(li);
    });
  }

  async function startQuiz(item, timerSecondsPerQuestion) {
    const base = new URL("../db/", window.location.href);
    const quizUrl = new URL(item.file, base).href;
    let res;
    try {
      res = await fetch(quizUrl);
    } catch (e) {
      alert("Не удалось загрузить квиз: " + item.file);
      return;
    }
    if (!res.ok) {
      alert("Файл не найден: " + item.file);
      return;
    }
    const data = await res.json();
    currentQuiz = {
      title: data.title || item.title || "Квиз",
      questions: validQuestions(data),
    };
    if (!currentQuiz.questions.length) {
      alert("В файле нет ни одного полного вопроса (нужны текст, 4 варианта, correctIndex).");
      return;
    }
    sessionTimerSeconds =
      typeof timerSecondsPerQuestion === "number" && timerSecondsPerQuestion > 0
        ? Math.floor(timerSecondsPerQuestion)
        : 0;
    playIndex = 0;
    playScore = 0;
    els.playTitle.textContent = currentQuiz.title;
    showPlay();
    renderQuestion();
  }

  function renderQuestion() {
    const qs = currentQuiz.questions;
    if (playIndex >= qs.length) {
      els.playProgress.textContent = "";
      clearQuestionTimer();
      els.playArea.innerHTML =
        "<p><strong>Готово.</strong> Правильных ответов: " +
        playScore +
        " из " +
        qs.length +
        ".</p><p class=\"play-actions\"><button type=\"button\" class=\"btn\" id=\"btn-again\">Пройти этот квиз снова</button></p>";
      document.getElementById("btn-again").addEventListener("click", () => {
        playIndex = 0;
        playScore = 0;
        renderQuestion();
      });
      return;
    }

    const q = qs[playIndex];
    playAnswered = false;
    els.playProgress.textContent =
      "Вопрос " + (playIndex + 1) + " из " + qs.length;

    const layout = document.createElement("div");
    layout.className = "play-question-layout";

    let timerWrap = null;
    let timerCircle = null;
    let timerText = null;

    if (sessionTimerSeconds > 0) {
      timerWrap = document.createElement("div");
      timerWrap.className = "play-timer";
      const NS = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(NS, "svg");
      svg.setAttribute("viewBox", "0 0 48 48");
      svg.setAttribute("width", "48");
      svg.setAttribute("height", "48");
      svg.classList.add("play-timer-svg");
      const cTrack = document.createElementNS(NS, "circle");
      cTrack.setAttribute("cx", "24");
      cTrack.setAttribute("cy", "24");
      cTrack.setAttribute("r", String(TIMER_R));
      cTrack.classList.add("play-timer-track");
      timerCircle = document.createElementNS(NS, "circle");
      timerCircle.setAttribute("cx", "24");
      timerCircle.setAttribute("cy", "24");
      timerCircle.setAttribute("r", String(TIMER_R));
      timerCircle.setAttribute("stroke-dasharray", String(TIMER_C));
      timerCircle.setAttribute("stroke-dashoffset", "0");
      timerCircle.setAttribute("transform", "rotate(-90 24 24)");
      timerCircle.classList.add("play-timer-progress");
      svg.appendChild(cTrack);
      svg.appendChild(timerCircle);
      timerText = document.createElement("span");
      timerText.className = "play-timer-sec";
      timerWrap.appendChild(svg);
      timerWrap.appendChild(timerText);
      layout.appendChild(timerWrap);
    }

    const body = document.createElement("div");
    body.className = "play-question-body";

    const p = document.createElement("p");
    p.className = "play-q-text";
    p.textContent = q.text;
    body.appendChild(p);

    const opts = document.createElement("div");
    opts.className = "play-options";

    q.options.forEach((text, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "play-opt";
      btn.textContent = LABELS[i] + ") " + text;
      btn.addEventListener("click", () => {
        if (playAnswered) return;
        revealAnswer(q, qs, i, body, opts, false);
      });
      opts.appendChild(btn);
    });
    body.appendChild(opts);
    layout.appendChild(body);

    els.playArea.innerHTML = "";
    els.playArea.appendChild(layout);

    if (sessionTimerSeconds > 0 && timerWrap && timerCircle && timerText) {
      clearQuestionTimer();
      questionTimerTotalMs = sessionTimerSeconds * 1000;
      questionTimerEndsAt = Date.now() + questionTimerTotalMs;
      updateTimerVisual(
        timerCircle,
        timerText,
        timerWrap,
        questionTimerTotalMs,
        questionTimerTotalMs
      );

      function tick() {
        if (playAnswered) return;
        const now = Date.now();
        const left = Math.max(0, questionTimerEndsAt - now);
        updateTimerVisual(timerCircle, timerText, timerWrap, left, questionTimerTotalMs);
        if (left <= 0) {
          clearQuestionTimer();
          if (!playAnswered) revealAnswer(q, qs, null, body, opts, true);
          return;
        }
        questionTimerRaf = requestAnimationFrame(tick);
      }
      questionTimerRaf = requestAnimationFrame(tick);
    }
  }

  els.btnBack.addEventListener("click", showList);

  loadManifest();
})();
