(function () {
  "use strict";

  const LABELS = ["a", "b", "c", "d"];
  const MANIFEST_URL = new URL("../db/manifest.json", window.location.href).href;

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

  function showList() {
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
      const btn = document.createElement("button");
      btn.type = "button";
      const t = document.createElement("span");
      t.className = "quiz-item-title";
      t.textContent = item.title || item.id || "Без названия";
      btn.appendChild(t);
      if (item.description) {
        const d = document.createElement("span");
        d.className = "quiz-item-desc";
        d.textContent = item.description;
        btn.appendChild(d);
      }
      btn.addEventListener("click", () => startQuiz(item));
      li.appendChild(btn);
      els.list.appendChild(li);
    });
  }

  async function startQuiz(item) {
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

    const wrap = document.createElement("div");
    const p = document.createElement("p");
    p.className = "play-q-text";
    p.textContent = q.text;
    wrap.appendChild(p);

    const opts = document.createElement("div");
    opts.className = "play-options";

    q.options.forEach((text, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "play-opt";
      btn.textContent = LABELS[i] + ") " + text;
      btn.addEventListener("click", () => {
        if (playAnswered) return;
        playAnswered = true;
        const correct = i === q.correctIndex;
        if (correct) playScore++;
        opts.querySelectorAll(".play-opt").forEach((b, j) => {
          b.disabled = true;
          if (j === q.correctIndex) b.classList.add("correct");
          else if (j === i && !correct) b.classList.add("wrong");
        });
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
        next.textContent =
          playIndex + 1 < qs.length ? "Дальше" : "Результат";
        next.addEventListener("click", () => {
          playIndex++;
          renderQuestion();
        });
        actions.appendChild(next);
        wrap.appendChild(actions);
      });
      opts.appendChild(btn);
    });
    wrap.appendChild(opts);
    els.playArea.innerHTML = "";
    els.playArea.appendChild(wrap);
  }

  els.btnBack.addEventListener("click", showList);

  loadManifest();
})();
