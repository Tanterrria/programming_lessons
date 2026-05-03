(function () {
  "use strict";

  const STORAGE_KEY = "quiz-builder-draft-v1";
  const LABELS = ["a", "b", "c", "d"];

  let questions = [];
  let nextId = 1;
  let playIndex = 0;
  let playScore = 0;
  let playAnswered = false;

  const els = {
    list: document.getElementById("questions-list"),
    tpl: document.getElementById("tpl-question"),
    btnAdd: document.getElementById("btn-add-question"),
    btnClear: document.getElementById("btn-clear-all"),
    btnSaveLocal: document.getElementById("btn-save-local"),
    importJson: document.getElementById("import-json"),
    tabs: document.querySelectorAll(".tab"),
    panels: {
      edit: document.getElementById("panel-edit"),
      play: document.getElementById("panel-play"),
      export: document.getElementById("panel-export"),
    },
    playArea: document.getElementById("play-area"),
    playProgress: document.getElementById("play-progress"),
    btnPlayStart: document.getElementById("btn-play-start"),
    btnExportMd: document.getElementById("btn-export-md"),
    btnExportJson: document.getElementById("btn-export-json"),
    exportId: document.getElementById("export-id"),
    exportTitle: document.getElementById("export-title"),
    exportDesc: document.getElementById("export-desc"),
    exportPreview: document.getElementById("export-preview"),
  };

  function emptyQuestion() {
    return {
      id: nextId++,
      text: "",
      options: ["", "", "", ""],
      correctIndex: 0,
      comment: "",
    };
  }

  function slugify(s) {
    const t = String(s || "quiz")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9\-а-яёії]/gi, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    return t || "quiz";
  }

  function loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!Array.isArray(data.questions)) return false;
      questions = data.questions.map((q) => ({
        id: q.id ?? nextId++,
        text: String(q.text ?? ""),
        options: (q.options || ["", "", "", ""]).slice(0, 4).map(String),
        correctIndex: Math.min(3, Math.max(0, Number(q.correctIndex) || 0)),
        comment: String(q.comment ?? ""),
      }));
      questions.forEach((q) => {
        while (q.options.length < 4) q.options.push("");
      });
      nextId = questions.reduce((m, q) => Math.max(m, q.id), 0) + 1;
      if (data.exportMeta) {
        if (data.exportMeta.id) els.exportId.value = data.exportMeta.id;
        if (data.exportMeta.title) els.exportTitle.value = data.exportMeta.title;
        if (data.exportMeta.description != null) els.exportDesc.value = data.exportMeta.description;
      }
      return true;
    } catch {
      return false;
    }
  }

  function saveToStorage() {
    const payload = {
      version: 1,
      questions,
      exportMeta: {
        id: els.exportId.value,
        title: els.exportTitle.value,
        description: els.exportDesc.value,
      },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }

  function renderEditors() {
    els.list.innerHTML = "";
    questions.forEach((q, idx) => {
      const node = els.tpl.content.cloneNode(true);
      const card = node.querySelector(".q-card");
      card.dataset.qid = String(q.id);
      card.querySelector(".q-num").textContent = "Вопрос " + (idx + 1);

      const ta = card.querySelector(".q-text");
      ta.value = q.text;

      const radios = card.querySelectorAll(".q-correct");
      const name = "correct-" + q.id;
      radios.forEach((r) => {
        r.name = name;
        r.checked = Number(r.value) === q.correctIndex;
      });

      const inputs = card.querySelectorAll(".q-opt");
      inputs.forEach((inp, i) => {
        inp.value = q.options[i] ?? "";
      });

      const qComment = card.querySelector(".q-comment");
      qComment.value = q.comment ?? "";

      ta.addEventListener("input", () => {
        q.text = ta.value;
        debouncedSave();
        refreshExportPreview();
      });
      inputs.forEach((inp, i) => {
        inp.addEventListener("input", () => {
          q.options[i] = inp.value;
          debouncedSave();
          refreshExportPreview();
        });
      });
      radios.forEach((r) => {
        r.addEventListener("change", () => {
          q.correctIndex = Number(r.value);
          debouncedSave();
          refreshExportPreview();
        });
      });

      qComment.addEventListener("input", () => {
        q.comment = qComment.value;
        debouncedSave();
        refreshExportPreview();
      });

      card.querySelector(".remove-q").addEventListener("click", () => {
        questions = questions.filter((x) => x.id !== q.id);
        renderEditors();
        saveToStorage();
        refreshExportPreview();
      });

      els.list.appendChild(node);
    });
  }

  let saveTimer;
  function debouncedSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveToStorage, 400);
  }

  function switchTab(name) {
    els.tabs.forEach((t) => {
      const on = t.dataset.tab === name;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
    });
    Object.entries(els.panels).forEach(([key, el]) => {
      const on = key === name;
      el.classList.toggle("active", on);
      el.hidden = !on;
    });
    if (name === "export") refreshExportPreview();
    if (name === "play") startPlay();
  }

  els.tabs.forEach((t) =>
    t.addEventListener("click", () => switchTab(t.dataset.tab))
  );

  els.btnAdd.addEventListener("click", () => {
    questions.push(emptyQuestion());
    renderEditors();
    saveToStorage();
    refreshExportPreview();
  });

  els.btnClear.addEventListener("click", () => {
    if (!questions.length) return;
    if (!confirm("Удалить все вопросы?")) return;
    questions = [];
    renderEditors();
    saveToStorage();
    refreshExportPreview();
  });

  els.btnSaveLocal.addEventListener("click", () => {
    saveToStorage();
    alert("Сохранено в localStorage этого браузера.");
  });

  els.importJson.addEventListener("change", (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const arr = Array.isArray(data.questions)
          ? data.questions
          : Array.isArray(data)
            ? data
            : null;
        if (!arr) throw new Error("Нужен объект с полем questions или массив вопросов");
        if (data.id) els.exportId.value = String(data.id);
        if (data.title) els.exportTitle.value = String(data.title);
        if (data.description != null) els.exportDesc.value = String(data.description);
        questions = arr.map((q, i) => ({
          id: q.id ?? i + 1,
          text: String(q.text ?? ""),
          options: (q.options || ["", "", "", ""]).slice(0, 4).map(String),
          correctIndex: Math.min(3, Math.max(0, Number(q.correctIndex) || 0)),
          comment: String(q.comment ?? ""),
        }));
        questions.forEach((q) => {
          while (q.options.length < 4) q.options.push("");
        });
        nextId = questions.reduce((m, q) => Math.max(m, Number(q.id) || 0), 0) + 1;
        renderEditors();
        saveToStorage();
        refreshExportPreview();
      } catch (err) {
        alert("Не удалось прочитать JSON: " + err.message);
      }
    };
    reader.readAsText(f, "UTF-8");
    e.target.value = "";
  });

  function validQuestions() {
    return questions.filter(
      (q) =>
        q.text.trim() &&
        q.options.every((o) => String(o).trim()) &&
        q.correctIndex >= 0 &&
        q.correctIndex <= 3
    );
  }

  function renderPlay() {
    const valid = validQuestions();
    if (!valid.length) {
      els.playArea.innerHTML =
        "<p class=\"muted\">Добавьте хотя бы один вопрос с четырьмя заполненными вариантами и отметьте верный ответ.</p>";
      els.playProgress.textContent = "";
      return;
    }

    if (playIndex >= valid.length) {
      els.playArea.innerHTML =
        "<p><strong>Готово.</strong> Правильных ответов: " +
        playScore +
        " из " +
        valid.length +
        ".</p><div class=\"play-actions\"><button type=\"button\" class=\"btn primary\" id=\"play-again\">Пройти снова</button></div>";
      document.getElementById("play-again").addEventListener("click", startPlay);
      els.playProgress.textContent = "";
      return;
    }

    const q = valid[playIndex];
    playAnswered = false;
    els.playProgress.textContent =
      "Вопрос " + (playIndex + 1) + " из " + valid.length;

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
        next.className = "btn primary";
        next.textContent =
          playIndex + 1 < valid.length ? "Дальше" : "Результат";
        next.addEventListener("click", () => {
          playIndex++;
          renderPlay();
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

  function startPlay() {
    playIndex = 0;
    playScore = 0;
    renderPlay();
  }

  els.btnPlayStart.addEventListener("click", startPlay);

  function exportPayload() {
    const title = els.exportTitle.value.trim() || "Квиз";
    const idRaw = els.exportId.value.trim();
    const id = idRaw || slugify(title);
    const description = els.exportDesc.value.trim();
    const vq = validQuestions();
    return {
      id,
      title,
      description: description || undefined,
      questions: vq.map((q) => {
        const item = {
          text: q.text,
          options: q.options.map(String),
          correctIndex: q.correctIndex,
        };
        const c = String(q.comment || "").trim();
        if (c) item.comment = c;
        return item;
      }),
    };
  }

  function toMarkdown() {
    const { id, title, description, questions: qs } = exportPayload();
    const lines = [
      "# " + title,
      "",
      "**id (для manifest):** `" + id + "`",
    ];
    if (description) lines.push("", description);
    lines.push("", "**Формат:** один верный вариант (a–d). Ответы — в конец.", "");
    qs.forEach((q, idx) => {
      lines.push("---", "", "### Вопрос " + (idx + 1) + ". " + q.text, "");
      q.options.forEach((o, i) => {
        lines.push(LABELS[i] + ") " + o);
      });
      const c = String(q.comment || "").trim();
      if (c) lines.push("", "*Комментарий:* " + c);
      lines.push("");
    });
    lines.push("---", "", "## Ответы", "", "| № | Ответ |", "|---|--------|");
    qs.forEach((q, idx) => {
      lines.push("| " + (idx + 1) + " | " + LABELS[q.correctIndex] + " |");
    });
    lines.push("");
    return lines.join("\n");
  }

  function refreshExportPreview() {
    try {
      els.exportPreview.value = toMarkdown();
    } catch {
      els.exportPreview.value = "";
    }
  }

  els.exportTitle.addEventListener("input", () => {
    debouncedSave();
    refreshExportPreview();
  });
  els.exportId.addEventListener("input", debouncedSave);
  els.exportDesc.addEventListener("input", () => {
    debouncedSave();
    refreshExportPreview();
  });

  function download(filename, text, mime) {
    const blob = new Blob([text], { type: mime });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  els.btnExportMd.addEventListener("click", () => {
    refreshExportPreview();
    const { id } = exportPayload();
    download(id + ".md", toMarkdown(), "text/markdown;charset=utf-8");
  });

  els.btnExportJson.addEventListener("click", () => {
    const p = exportPayload();
    const fname = p.id + ".json";
    download(fname, JSON.stringify(p, null, 2), "application/json");
  });

  if (!loadFromStorage()) {
    questions.push(emptyQuestion());
  }
  renderEditors();
  refreshExportPreview();
})();
