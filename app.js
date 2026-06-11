(function () {
  "use strict";

  const STORAGE_KEY = "todo.items.v1";
  const APP_VERSION = "v4"; // 이 HTML/JS 묶음의 버전 (sw.js CACHE와 함께 올림)

  const listEl = document.getElementById("list");
  const emptyEl = document.getElementById("empty");
  const countEl = document.getElementById("count");
  const formEl = document.getElementById("form");
  const inputEl = document.getElementById("input");

  /** @type {{id:string, text:string, done:boolean, created:number}[]} */
  let todos = load();

  /* ---------- Persistence ---------- */
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
    } catch (e) {
      /* storage full or unavailable — ignore */
    }
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* ---------- Sorting: 미완료 먼저, 그 안에서 최신순 ---------- */
  function sorted() {
    return todos.slice().sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      return b.created - a.created;
    });
  }

  /* ---------- Rendering ---------- */
  function render() {
    listEl.innerHTML = "";

    const items = sorted();
    for (const todo of items) {
      listEl.appendChild(buildItem(todo));
    }

    const remaining = todos.filter((t) => !t.done).length;
    countEl.textContent = "남은 할일 " + remaining + "개";

    const isEmpty = todos.length === 0;
    emptyEl.hidden = !isEmpty;
    listEl.hidden = isEmpty;
  }

  function buildItem(todo) {
    const li = document.createElement("li");
    li.className = "todo-item" + (todo.done ? " done" : "");
    li.dataset.id = todo.id;

    // red layer revealed on swipe
    const trash = document.createElement("div");
    trash.className = "todo-trash";
    trash.innerHTML =
      '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>';

    const row = document.createElement("div");
    row.className = "todo-row";

    const check = document.createElement("span");
    check.className = "todo-check";
    check.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l5 5L20 6"/></svg>';

    const text = document.createElement("span");
    text.className = "todo-text";
    text.textContent = todo.text;

    const del = document.createElement("button");
    del.className = "todo-delete";
    del.type = "button";
    del.setAttribute("aria-label", "삭제");
    del.innerHTML =
      '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg>';

    row.append(check, text, del);
    li.append(trash, row);

    // toggle done on tap (ignore taps that come from swipe or delete)
    row.addEventListener("click", function (e) {
      if (e.target.closest(".todo-delete")) return;
      if (row.dataset.swiped === "1") {
        row.dataset.swiped = "";
        return;
      }
      toggle(todo.id);
    });

    del.addEventListener("click", function (e) {
      e.stopPropagation();
      remove(todo.id, li);
    });

    enableSwipe(row, li, todo.id);
    return li;
  }

  /* ---------- Actions ---------- */
  function add(textRaw) {
    const text = textRaw.trim();
    if (!text) return;
    todos.push({ id: uid(), text: text, done: false, created: Date.now() });
    save();
    render();
  }

  function toggle(id) {
    const t = todos.find((x) => x.id === id);
    if (!t) return;
    t.done = !t.done;
    save();
    render();
  }

  function remove(id, li) {
    li.classList.add("removing");
    const finish = function () {
      todos = todos.filter((x) => x.id !== id);
      save();
      render();
    };
    li.addEventListener("animationend", finish, { once: true });
    // fallback in case animationend doesn't fire
    setTimeout(finish, 350);
  }

  /* ---------- Swipe-to-delete ---------- */
  function enableSwipe(row, li, id) {
    let startX = 0;
    let startY = 0;
    let dx = 0;
    let dragging = false;
    let decided = false;
    const THRESHOLD = 90; // px to trigger delete

    row.addEventListener(
      "touchstart",
      function (e) {
        const t = e.touches[0];
        startX = t.clientX;
        startY = t.clientY;
        dx = 0;
        dragging = true;
        decided = false;
        row.style.transition = "none";
      },
      { passive: true }
    );

    row.addEventListener(
      "touchmove",
      function (e) {
        if (!dragging) return;
        const t = e.touches[0];
        const moveX = t.clientX - startX;
        const moveY = t.clientY - startY;

        if (!decided) {
          if (Math.abs(moveX) < 8 && Math.abs(moveY) < 8) return;
          // vertical intent -> let the page scroll, cancel swipe
          if (Math.abs(moveY) > Math.abs(moveX)) {
            dragging = false;
            row.style.transition = "";
            return;
          }
          decided = true;
        }

        dx = Math.min(0, moveX); // only allow swiping left
        row.style.transform = "translateX(" + dx + "px)";
      },
      { passive: true }
    );

    function end() {
      if (!dragging) return;
      dragging = false;
      row.style.transition = "";

      if (dx <= -THRESHOLD) {
        row.dataset.swiped = "1";
        remove(id, li);
      } else {
        row.style.transform = "";
        if (Math.abs(dx) > 8) row.dataset.swiped = "1"; // suppress the click
      }
    }

    row.addEventListener("touchend", end, { passive: true });
    row.addEventListener("touchcancel", end, { passive: true });
  }

  /* ---------- Form ---------- */
  formEl.addEventListener("submit", function (e) {
    e.preventDefault();
    add(inputEl.value);
    inputEl.value = "";
    inputEl.focus();
  });

  /* ---------- Backup: export / import ---------- */
  const sheetEl = document.getElementById("sheet");
  const sheetTitleEl = document.getElementById("sheetTitle");
  const sheetHintEl = document.getElementById("sheetHint");
  const sheetTextEl = document.getElementById("sheetText");
  const sheetStatusEl = document.getElementById("sheetStatus");
  const sheetActionsEl = document.getElementById("sheetActions");
  const fileInputEl = document.getElementById("fileInput");

  function makeBtn(label, cls, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "sheet-btn" + (cls ? " " + cls : "");
    b.textContent = label;
    b.addEventListener("click", onClick);
    return b;
  }

  function setStatus(msg, isError) {
    sheetStatusEl.textContent = msg || "";
    sheetStatusEl.classList.toggle("error", !!isError);
  }

  function openSheet(title, hint) {
    sheetTitleEl.textContent = title;
    sheetHintEl.textContent = hint;
    sheetActionsEl.innerHTML = "";
    setStatus("");
    sheetEl.hidden = false;
  }

  function closeSheet() {
    sheetEl.hidden = true;
  }

  // backup payload: { app, version, exported, items }
  function buildBackup() {
    return JSON.stringify(
      {
        app: "todo-pwa",
        version: 1,
        exported: new Date().toISOString(),
        items: todos
      },
      null,
      2
    );
  }

  function pad(n) {
    return n < 10 ? "0" + n : "" + n;
  }

  function backupFilename() {
    const d = new Date();
    return (
      "todo-backup-" +
      d.getFullYear() +
      pad(d.getMonth() + 1) +
      pad(d.getDate()) +
      ".json"
    );
  }

  function downloadText(filename, text) {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    // fallback for older browsers
    return new Promise(function (resolve, reject) {
      try {
        sheetTextEl.removeAttribute("readonly");
        sheetTextEl.focus();
        sheetTextEl.select();
        const ok = document.execCommand("copy");
        ok ? resolve() : reject();
      } catch (e) {
        reject(e);
      }
    });
  }

  // returns {ok, added, total} or {ok:false, msg}
  function importFromText(text, replace) {
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return { ok: false, msg: "형식이 올바르지 않아요. 백업 코드 전체를 붙여넣었는지 확인해 주세요." };
    }
    const arr = Array.isArray(data)
      ? data
      : data && Array.isArray(data.items)
      ? data.items
      : null;
    if (!arr) {
      return { ok: false, msg: "백업 데이터를 찾을 수 없어요." };
    }

    const clean = [];
    for (const raw of arr) {
      if (!raw || typeof raw.text !== "string" || !raw.text.trim()) continue;
      clean.push({
        id: typeof raw.id === "string" && raw.id ? raw.id : uid(),
        text: raw.text.trim().slice(0, 200),
        done: !!raw.done,
        created: typeof raw.created === "number" ? raw.created : Date.now()
      });
    }
    if (!clean.length) {
      return { ok: false, msg: "가져올 할일이 없어요." };
    }

    if (replace) {
      todos = clean;
      save();
      render();
      return { ok: true, added: clean.length, total: todos.length };
    }

    // merge: add items whose id isn't already present
    const seen = new Set(todos.map((t) => t.id));
    let added = 0;
    for (const it of clean) {
      if (!seen.has(it.id)) {
        todos.push(it);
        seen.add(it.id);
        added++;
      }
    }
    save();
    render();
    return { ok: true, added: added, total: todos.length };
  }

  function showExport() {
    openSheet(
      "백업 내보내기",
      "아래 코드를 복사해 두거나 파일로 저장하세요. 다른 기기/주소의 '가져오기'에 붙여넣으면 그대로 복원됩니다."
    );
    sheetTextEl.value = buildBackup();
    sheetTextEl.setAttribute("readonly", "readonly");

    sheetActionsEl.append(
      makeBtn("복사", "primary", function () {
        copyText(sheetTextEl.value).then(
          function () {
            setStatus("백업 코드를 복사했어요 ✅", false);
          },
          function () {
            setStatus("복사 실패 — 코드를 길게 눌러 직접 복사해 주세요.", true);
          }
        );
      }),
      makeBtn("파일로 저장", "", function () {
        downloadText(backupFilename(), sheetTextEl.value);
        setStatus("파일을 저장했어요 ✅", false);
      }),
      makeBtn("닫기", "", closeSheet)
    );
  }

  function showImport() {
    openSheet(
      "백업 가져오기",
      "백업 코드를 붙여넣거나 파일을 불러온 뒤, '합치기'(기존 유지 + 추가) 또는 '전체 교체'를 누르세요."
    );
    sheetTextEl.value = "";
    sheetTextEl.removeAttribute("readonly");

    sheetActionsEl.append(
      makeBtn("파일 불러오기", "", function () {
        fileInputEl.click();
      }),
      makeBtn("합치기", "primary", function () {
        const r = importFromText(sheetTextEl.value, false);
        if (!r.ok) return setStatus(r.msg, true);
        setStatus(r.added + "개 추가됨 · 현재 " + r.total + "개 ✅", false);
      }),
      makeBtn("전체 교체", "danger", function () {
        if (!window.confirm("현재 할일을 모두 지우고 백업 내용으로 교체할까요?")) return;
        const r = importFromText(sheetTextEl.value, true);
        if (!r.ok) return setStatus(r.msg, true);
        setStatus("교체 완료 · 현재 " + r.total + "개 ✅", false);
      }),
      makeBtn("닫기", "", closeSheet)
    );
  }

  document.getElementById("exportBtn").addEventListener("click", showExport);
  document.getElementById("importBtn").addEventListener("click", showImport);

  // file picker -> fill textarea
  fileInputEl.addEventListener("change", function () {
    const file = fileInputEl.files && fileInputEl.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      sheetTextEl.value = String(reader.result || "");
      setStatus("파일을 불러왔어요. '합치기' 또는 '전체 교체'를 누르세요.", false);
    };
    reader.onerror = function () {
      setStatus("파일을 읽지 못했어요.", true);
    };
    reader.readAsText(file);
    fileInputEl.value = ""; // allow re-selecting the same file
  });

  // tap backdrop to dismiss
  sheetEl.addEventListener("click", function (e) {
    if (e.target === sheetEl) closeSheet();
  });

  /* ---------- Version label ---------- */
  const versionEl = document.getElementById("version");

  function showVersion(swVersion) {
    // swVersion === null -> 서비스워커가 아직 페이지를 제어하지 않음
    if (!swVersion) {
      versionEl.textContent = "버전 " + APP_VERSION;
      versionEl.classList.remove("stale");
      return;
    }
    if (swVersion === APP_VERSION) {
      versionEl.textContent = "버전 " + swVersion;
      versionEl.classList.remove("stale");
    } else {
      // 화면(APP_VERSION)과 실제 동작 중인 서비스워커 버전이 다름 -> 재실행 필요
      versionEl.textContent =
        "버전 " + swVersion + " · 앱을 다시 열면 " + APP_VERSION + "로 갱신";
      versionEl.classList.add("stale");
    }
  }

  showVersion(null); // 우선 화면 버전 표시

  /* ---------- Service worker ---------- */
  if ("serviceWorker" in navigator) {
    // 제어 중인 워커에게 실제 버전을 물어본다
    function askVersion() {
      const ctrl = navigator.serviceWorker.controller;
      if (ctrl) ctrl.postMessage("version");
    }
    navigator.serviceWorker.addEventListener("message", function (e) {
      if (e.data && e.data.type === "version") showVersion(e.data.version);
    });

    window.addEventListener("load", function () {
      navigator.serviceWorker
        .register("sw.js")
        .then(askVersion)
        .catch(function () {});
    });
    // 새 워커가 제어권을 넘겨받으면 다시 물어본다
    navigator.serviceWorker.addEventListener("controllerchange", askVersion);
    askVersion();
  }
})();
