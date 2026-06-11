(function () {
  "use strict";

  const STORAGE_KEY = "todo.items.v1";

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

  /* ---------- Boot ---------- */
  render();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    });
  }
})();
