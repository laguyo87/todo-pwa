(function () {
  "use strict";

  const STORAGE_KEY = "todo.items.v1";
  const APP_VERSION = "v1.3"; // app.js + sw.js(CACHE) 함께 올림. 이후 0.1씩 증가

  const listEl = document.getElementById("list");
  const emptyEl = document.getElementById("empty");
  const countEl = document.getElementById("count");
  const filtersEl = document.getElementById("filters");
  const bulkBarEl = document.getElementById("bulkBar");
  const formEl = document.getElementById("form");
  const inputEl = document.getElementById("input");

  /**
   * @type {{id:string,text:string,done:boolean,created:number,completedAt:number|null,
   *         due:number|null,category:string|null,order:number,notified:boolean}[]}
   */
  let todos = load();
  let activeFilter = "all"; // "all" | "today" | "overdue" | "cat:<name>"
  let isDragging = false;

  /* ===================== Persistence ===================== */
  function load() {
    let raw;
    try {
      raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch (e) {
      raw = [];
    }
    if (!Array.isArray(raw)) raw = [];
    // 기존 데이터 마이그레이션 (없는 필드 채우기)
    return raw.map(function (t, i) {
      return {
        id: t && t.id ? String(t.id) : uid(),
        text: t && typeof t.text === "string" ? t.text : "",
        done: !!(t && t.done),
        created: t && typeof t.created === "number" ? t.created : Date.now() - i,
        completedAt: t && typeof t.completedAt === "number" ? t.completedAt : null,
        due: t && typeof t.due === "number" ? t.due : null,
        category:
          t && typeof t.category === "string" && t.category.trim()
            ? t.category.trim()
            : null,
        order: t && typeof t.order === "number" ? t.order : i,
        notified: !!(t && t.notified)
      };
    });
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
    } catch (e) {
      /* ignore */
    }
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* ===================== Helpers ===================== */
  function categories() {
    const set = [];
    todos.forEach(function (t) {
      if (t.category && set.indexOf(t.category) === -1) set.push(t.category);
    });
    return set.sort();
  }

  function topOrder() {
    if (!todos.length) return 0;
    return Math.min.apply(null, todos.map(function (t) { return t.order; })) - 1;
  }

  function dayBounds(ts) {
    const d = new Date(ts);
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    return { start: start, end: start + 86400000 };
  }

  function isOverdue(t) {
    return !t.done && t.due != null && t.due < Date.now();
  }

  function isDueToday(t) {
    if (t.due == null) return false;
    const b = dayBounds(Date.now());
    return t.due >= b.start && t.due < b.end;
  }

  function pad(n) {
    return n < 10 ? "0" + n : "" + n;
  }

  function fmtDue(ts) {
    const d = new Date(ts);
    const today = dayBounds(Date.now());
    const time = pad(d.getHours()) + ":" + pad(d.getMinutes());
    if (ts >= today.start && ts < today.end) return "오늘 " + time;
    if (ts >= today.end && ts < today.end + 86400000) return "내일 " + time;
    if (ts >= today.start - 86400000 && ts < today.start) return "어제 " + time;
    return d.getMonth() + 1 + "/" + d.getDate() + " " + time;
  }

  // ms -> "YYYY-MM-DDTHH:MM" (datetime-local 입력용, 로컬 시간)
  function toLocalInput(ts) {
    const d = new Date(ts);
    return (
      d.getFullYear() +
      "-" + pad(d.getMonth() + 1) +
      "-" + pad(d.getDate()) +
      "T" + pad(d.getHours()) +
      ":" + pad(d.getMinutes())
    );
  }

  /* ===================== Sorting & filtering ===================== */
  function sorted() {
    return todos.slice().sort(function (a, b) {
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (a.done) return (b.completedAt || 0) - (a.completedAt || 0);
      return a.order - b.order; // 미완료: 수동 정렬 순서
    });
  }

  function matchesFilter(t) {
    if (activeFilter === "all") return true;
    if (activeFilter === "today") return !t.done && isDueToday(t);
    if (activeFilter === "overdue") return isOverdue(t);
    if (activeFilter.indexOf("cat:") === 0) {
      return t.category === activeFilter.slice(4);
    }
    return true;
  }

  /* ===================== Rendering ===================== */
  function render() {
    if (isDragging) return; // 드래그 중에는 DOM을 직접 다루므로 재구성 생략
    renderFilters();
    renderList();
    renderCounts();
    renderBulk();
  }

  function renderCounts() {
    const remaining = todos.filter(function (t) { return !t.done; }).length;
    const overdue = todos.filter(isOverdue).length;
    let txt = "남은 할일 " + remaining + "개";
    if (overdue) txt += " · 지연 " + overdue;
    countEl.textContent = txt;
  }

  function renderFilters() {
    const cats = categories();
    const todayN = todos.filter(function (t) { return !t.done && isDueToday(t); }).length;
    const overdueN = todos.filter(isOverdue).length;

    const chips = [{ key: "all", label: "전체" }];
    if (overdueN) chips.push({ key: "overdue", label: "지연 " + overdueN });
    if (todayN) chips.push({ key: "today", label: "오늘 " + todayN });
    cats.forEach(function (c) { chips.push({ key: "cat:" + c, label: "#" + c }); });

    // 현재 필터가 사라졌으면 전체로
    if (!chips.some(function (c) { return c.key === activeFilter; })) activeFilter = "all";

    filtersEl.innerHTML = "";
    chips.forEach(function (c) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip" + (c.key === activeFilter ? " active" : "");
      if (c.key === "overdue") b.classList.add("danger");
      b.textContent = c.label;
      b.addEventListener("click", function () {
        activeFilter = c.key;
        render();
      });
      filtersEl.appendChild(b);
    });
    filtersEl.hidden = chips.length <= 1;
  }

  function renderList() {
    listEl.innerHTML = "";
    const items = sorted().filter(matchesFilter);
    items.forEach(function (t) { listEl.appendChild(buildItem(t)); });

    const isEmpty = items.length === 0;
    emptyEl.hidden = !isEmpty;
    listEl.hidden = isEmpty;
  }

  function renderBulk() {
    const doneItems = todos.filter(function (t) { return t.done; });
    if (!doneItems.length) {
      bulkBarEl.hidden = true;
      bulkBarEl.innerHTML = "";
      return;
    }
    bulkBarEl.hidden = false;
    bulkBarEl.innerHTML = "";
    const b = document.createElement("button");
    b.type = "button";
    b.className = "bulk-btn";
    b.textContent = "완료한 항목 " + doneItems.length + "개 지우기";
    b.addEventListener("click", function () {
      if (!window.confirm("완료한 할일 " + doneItems.length + "개를 모두 지울까요?")) return;
      todos = todos.filter(function (t) { return !t.done; });
      save();
      render();
    });
    bulkBarEl.appendChild(b);
  }

  function buildItem(todo) {
    const li = document.createElement("li");
    li.className = "todo-item" + (todo.done ? " done" : "");
    li.dataset.id = todo.id;

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

    const main = document.createElement("div");
    main.className = "todo-main";

    const text = document.createElement("span");
    text.className = "todo-text";
    text.textContent = todo.text;
    main.appendChild(text);

    // 메타 칩 (마감일 / 카테고리)
    if (todo.due != null || todo.category) {
      const meta = document.createElement("div");
      meta.className = "todo-meta";
      if (todo.due != null) {
        const due = document.createElement("span");
        due.className =
          "due-chip" +
          (isOverdue(todo) ? " overdue" : isDueToday(todo) && !todo.done ? " today" : "");
        due.textContent = "📅 " + fmtDue(todo.due);
        meta.appendChild(due);
      }
      if (todo.category) {
        const cat = document.createElement("span");
        cat.className = "cat-chip";
        cat.textContent = "#" + todo.category;
        meta.appendChild(cat);
      }
      main.appendChild(meta);
    }

    const edit = document.createElement("button");
    edit.className = "todo-icon todo-edit";
    edit.type = "button";
    edit.setAttribute("aria-label", "편집");
    edit.innerHTML =
      '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>';

    const handle = document.createElement("button");
    handle.className = "todo-icon todo-handle";
    handle.type = "button";
    handle.setAttribute("aria-label", "순서 변경");
    handle.innerHTML =
      '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>';

    row.append(check, main, edit, handle);
    li.append(trash, row);

    // 체크박스/본문 탭 → 완료 토글 (스와이프/편집 제외)
    function onTap(e) {
      if (e.target.closest(".todo-icon")) return;
      if (row.dataset.swiped === "1") { row.dataset.swiped = ""; return; }
      toggle(todo.id);
    }
    check.addEventListener("click", onTap);
    main.addEventListener("click", onTap);

    edit.addEventListener("click", function (e) {
      e.stopPropagation();
      openEdit(todo.id);
    });

    enableSwipe(row, li, todo.id);
    if (!todo.done) enableDrag(handle, li);
    else handle.classList.add("hidden");

    return li;
  }

  /* ===================== Actions ===================== */
  function add(textRaw) {
    const text = textRaw.trim();
    if (!text) return;
    todos.push({
      id: uid(),
      text: text,
      done: false,
      created: Date.now(),
      completedAt: null,
      due: null,
      category: activeFilter.indexOf("cat:") === 0 ? activeFilter.slice(4) : null,
      order: topOrder(),
      notified: false
    });
    save();
    render();
  }

  function toggle(id) {
    const t = find(id);
    if (!t) return;
    t.done = !t.done;
    t.completedAt = t.done ? Date.now() : null;
    save();
    render();
  }

  function remove(id, li) {
    li.classList.add("removing");
    const finish = function () {
      todos = todos.filter(function (x) { return x.id !== id; });
      save();
      render();
    };
    li.addEventListener("animationend", finish, { once: true });
    setTimeout(finish, 350);
  }

  function find(id) {
    return todos.find(function (x) { return x.id === id; });
  }

  /* ===================== Swipe to delete ===================== */
  function enableSwipe(row, li, id) {
    let startX = 0, startY = 0, dx = 0, dragging = false, decided = false;
    const THRESHOLD = 90;

    row.addEventListener("touchstart", function (e) {
      const t = e.touches[0];
      startX = t.clientX; startY = t.clientY; dx = 0;
      dragging = true; decided = false;
      row.style.transition = "none";
    }, { passive: true });

    row.addEventListener("touchmove", function (e) {
      if (!dragging) return;
      const t = e.touches[0];
      const mx = t.clientX - startX, my = t.clientY - startY;
      if (!decided) {
        if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
        if (Math.abs(my) > Math.abs(mx)) { dragging = false; row.style.transition = ""; return; }
        decided = true;
      }
      dx = Math.min(0, mx);
      row.style.transform = "translateX(" + dx + "px)";
    }, { passive: true });

    function end() {
      if (!dragging) return;
      dragging = false;
      row.style.transition = "";
      if (dx <= -THRESHOLD) {
        row.dataset.swiped = "1";
        remove(id, li);
      } else {
        row.style.transform = "";
        if (Math.abs(dx) > 8) row.dataset.swiped = "1";
      }
    }
    row.addEventListener("touchend", end, { passive: true });
    row.addEventListener("touchcancel", end, { passive: true });
  }

  /* ===================== Drag reorder (pointer) ===================== */
  function enableDrag(handle, li) {
    // 핸들 터치가 카드 스와이프(삭제)로 번지지 않게 차단
    handle.addEventListener("touchstart", function (e) { e.stopPropagation(); }, { passive: true });

    handle.addEventListener("pointerdown", function (e) {
      if (e.button != null && e.button > 0) return;
      e.preventDefault();
      try { handle.setPointerCapture(e.pointerId); } catch (err) {}
      isDragging = true;
      document.body.classList.add("dragging-active");
      li.classList.add("dragging");

      let startY = e.clientY; // 손가락-카드 기준점 (재배치 때 보정)
      li.style.transition = "none";
      li.style.willChange = "transform";
      // 손가락과 카드 중심의 고정 간격 → 매 프레임 DOM을 읽지 않고 중심 계산
      const r0 = li.getBoundingClientRect();
      const pointerOffset = e.clientY - (r0.top + r0.height / 2);

      let latestY = e.clientY;
      let rafId = null;

      function siblings() {
        return Array.prototype.slice
          .call(listEl.querySelectorAll(".todo-item:not(.done)"))
          .filter(function (x) { return x !== li; });
      }

      // 드래그 카드는 손가락을 그대로 따라온다 (GPU 합성 유도)
      function follow(y) {
        li.style.transform = "translate3d(0," + (y - startY) + "px,0)";
      }

      // DOM 순서를 바꾸되: 드래그 카드는 화면상 그대로 두고(startY 보정),
      // 밀려나는 카드는 FLIP으로 부드럽게 이동시킨다
      function reinsert(reference) {
        const sibs = siblings();
        const before = sibs.map(function (s) { return s.getBoundingClientRect().top; });
        const dBefore = li.getBoundingClientRect().top;
        listEl.insertBefore(li, reference);
        const dAfter = li.getBoundingClientRect().top;
        startY += dAfter - dBefore; // 드래그 카드의 시각적 위치 유지
        sibs.forEach(function (s, i) {
          const delta = before[i] - s.getBoundingClientRect().top;
          if (!delta) return;
          s.style.transition = "none";
          s.style.transform = "translate3d(0," + delta + "px,0)";
          s.getBoundingClientRect(); // 강제 reflow
          s.style.transition = "transform 0.2s cubic-bezier(0.2,0.7,0.3,1)";
          s.style.transform = "";
        });
      }

      // 프레임당 한 번만 처리 (레이아웃 thrash 방지 → 부드러움)
      function frame() {
        rafId = null;
        follow(latestY);
        const center = latestY - pointerOffset; // DOM 측정 없이 중심 추정
        const sibs = siblings();
        for (let i = 0; i < sibs.length; i++) {
          const s = sibs[i];
          const r = s.getBoundingClientRect();
          const mid = r.top + r.height / 2;
          const after = !!(li.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING);
          if (after && center > mid) { reinsert(s.nextSibling); break; }
          if (!after && center < mid) { reinsert(s); break; }
        }
      }

      function move(ev) {
        latestY = ev.clientY;
        if (rafId === null) rafId = requestAnimationFrame(frame);
      }

      function up(ev) {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", up);
        handle.removeEventListener("pointercancel", up);
        if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
        try { handle.releasePointerCapture(ev.pointerId); } catch (err) {}

        // 데이터(order)는 지금 확정해 저장
        const ids = Array.prototype.slice
          .call(listEl.querySelectorAll(".todo-item:not(.done)"))
          .map(function (x) { return x.dataset.id; });
        ids.forEach(function (id, idx) { const t = find(id); if (t) t.order = idx; });
        save();
        document.body.classList.remove("dragging-active");

        // 제자리로 부드럽게 안착시킨 뒤 정리 (render는 애니메이션 후로 미룸)
        li.style.transition = "transform 0.2s cubic-bezier(0.2,0.7,0.3,1)";
        li.style.transform = "";

        let done = false;
        function settle() {
          if (done) return;
          done = true;
          li.removeEventListener("transitionend", settle);
          li.style.transition = "";
          li.style.willChange = "";
          li.classList.remove("dragging");
          siblings().forEach(function (s) { s.style.transition = ""; s.style.transform = ""; });
          isDragging = false;
          render();
        }
        li.addEventListener("transitionend", settle, { once: true });
        setTimeout(settle, 260); // 변화가 없어 transitionend가 안 와도 안전하게 마무리
      }

      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", up);
      handle.addEventListener("pointercancel", up);
    });
  }

  /* ===================== Bottom sheet ===================== */
  const sheetEl = document.getElementById("sheet");
  const sheetTitleEl = document.getElementById("sheetTitle");
  const sheetBodyEl = document.getElementById("sheetBody");
  const sheetStatusEl = document.getElementById("sheetStatus");
  const sheetActionsEl = document.getElementById("sheetActions");
  const fileInputEl = document.getElementById("fileInput");

  function openSheet(title) {
    sheetTitleEl.textContent = title;
    sheetBodyEl.innerHTML = "";
    sheetActionsEl.innerHTML = "";
    setStatus("");
    sheetEl.hidden = false;
  }
  function closeSheet() { sheetEl.hidden = true; }
  function setStatus(msg, isError) {
    sheetStatusEl.textContent = msg || "";
    sheetStatusEl.classList.toggle("error", !!isError);
  }
  function makeBtn(label, cls, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "sheet-btn" + (cls ? " " + cls : "");
    b.textContent = label;
    b.addEventListener("click", onClick);
    return b;
  }
  function field(labelText, control) {
    const wrap = document.createElement("label");
    wrap.className = "field";
    const span = document.createElement("span");
    span.className = "field-label";
    span.textContent = labelText;
    wrap.append(span, control);
    return wrap;
  }

  sheetEl.addEventListener("click", function (e) {
    if (e.target === sheetEl) closeSheet();
  });

  /* ---------- Edit sheet ---------- */
  function openEdit(id) {
    const t = find(id);
    if (!t) return;
    openSheet("할일 편집");

    const textInput = document.createElement("input");
    textInput.type = "text";
    textInput.className = "field-input";
    textInput.maxLength = 200;
    textInput.value = t.text;

    const dueInput = document.createElement("input");
    dueInput.type = "datetime-local";
    dueInput.className = "field-input";
    if (t.due != null) dueInput.value = toLocalInput(t.due);

    const clearDue = makeBtn("마감일 지우기", "small", function () {
      dueInput.value = "";
    });

    const catInput = document.createElement("input");
    catInput.type = "text";
    catInput.className = "field-input";
    catInput.maxLength = 20;
    catInput.placeholder = "예: 업무, 집안일";
    catInput.setAttribute("list", "catList");
    if (t.category) catInput.value = t.category;
    const dl = document.createElement("datalist");
    dl.id = "catList";
    categories().forEach(function (c) {
      const o = document.createElement("option");
      o.value = c;
      dl.appendChild(o);
    });

    const dueRow = document.createElement("div");
    dueRow.className = "field-inline";
    dueRow.append(dueInput, clearDue);

    sheetBodyEl.append(
      field("내용", textInput),
      field("마감일", dueRow),
      field("카테고리", catInput),
      dl
    );

    sheetActionsEl.append(
      makeBtn("저장", "primary", function () {
        const newText = textInput.value.trim();
        if (!newText) { setStatus("내용을 입력해 주세요.", true); return; }
        t.text = newText.slice(0, 200);
        const newDue = dueInput.value ? new Date(dueInput.value).getTime() : null;
        if (newDue !== t.due) t.notified = false; // 마감 변경 시 알림 재무장
        t.due = isNaN(newDue) ? null : newDue;
        t.category = catInput.value.trim().slice(0, 20) || null;
        save();
        render();
        closeSheet();
        if (t.due != null && t.due > Date.now()) ensureNotifyPermission();
      }),
      makeBtn("삭제", "danger", function () {
        if (!window.confirm("이 할일을 삭제할까요?")) return;
        todos = todos.filter(function (x) { return x.id !== id; });
        save();
        render();
        closeSheet();
      }),
      makeBtn("닫기", "", closeSheet)
    );
  }

  /* ---------- Stats sheet ---------- */
  function openStats() {
    openSheet("통계");
    const total = todos.length;
    const done = todos.filter(function (t) { return t.done; }).length;
    const remaining = total - done;
    const overdue = todos.filter(isOverdue).length;
    const today = todos.filter(function (t) { return !t.done && isDueToday(t); }).length;
    const rate = total ? Math.round((done / total) * 100) : 0;

    const grid = document.createElement("div");
    grid.className = "stat-grid";
    [
      ["전체", total],
      ["완료", done],
      ["남음", remaining],
      ["오늘 마감", today],
      ["지연", overdue],
      ["완료율", rate + "%"]
    ].forEach(function (s) {
      const cell = document.createElement("div");
      cell.className = "stat-cell";
      cell.innerHTML =
        '<div class="stat-num">' + s[1] + "</div><div class=\"stat-label\">" + s[0] + "</div>";
      grid.appendChild(cell);
    });

    const bar = document.createElement("div");
    bar.className = "stat-bar";
    bar.innerHTML = '<div class="stat-bar-fill" style="width:' + rate + '%"></div>';

    sheetBodyEl.append(grid, bar);

    // 카테고리별
    const cats = categories();
    if (cats.length) {
      const catWrap = document.createElement("div");
      catWrap.className = "stat-cats";
      cats.forEach(function (c) {
        const items = todos.filter(function (t) { return t.category === c; });
        const left = items.filter(function (t) { return !t.done; }).length;
        const line = document.createElement("div");
        line.className = "stat-cat-line";
        line.innerHTML =
          "<span>#" + c + "</span><span>남음 " + left + " / " + items.length + "</span>";
        catWrap.appendChild(line);
      });
      sheetBodyEl.appendChild(catWrap);
    }

    const actions = [];
    if ("Notification" in window && Notification.permission !== "granted") {
      actions.push(
        makeBtn("알림 켜기", "primary", function () {
          ensureNotifyPermission(function (ok) {
            setStatus(ok ? "알림이 켜졌어요 ✅" : "알림이 거부되었어요.", !ok);
          });
        })
      );
    }
    actions.push(makeBtn("닫기", "", closeSheet));
    sheetActionsEl.append.apply(sheetActionsEl, actions);
  }

  /* ---------- Backup sheets ---------- */
  function buildBackup() {
    return JSON.stringify(
      { app: "todo-pwa", version: 2, exported: new Date().toISOString(), items: todos },
      null,
      2
    );
  }
  function backupFilename() {
    const d = new Date();
    return "todo-backup-" + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + ".json";
  }
  function downloadText(filename, text) {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function makeBackupTextarea(value, readonly) {
    const ta = document.createElement("textarea");
    ta.className = "sheet-text";
    ta.spellcheck = false;
    ta.value = value;
    if (readonly) ta.setAttribute("readonly", "readonly");
    return ta;
  }
  function copyText(text, ta) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      try {
        ta.removeAttribute("readonly"); ta.focus(); ta.select();
        document.execCommand("copy") ? resolve() : reject();
      } catch (e) { reject(e); }
    });
  }

  function showExport() {
    openSheet("백업 내보내기");
    const hint = document.createElement("p");
    hint.className = "sheet-hint";
    hint.textContent =
      "아래 코드를 복사하거나 파일로 저장하세요. 다른 기기/주소의 '가져오기'에 넣으면 그대로 복원됩니다.";
    const ta = makeBackupTextarea(buildBackup(), true);
    sheetBodyEl.append(hint, ta);
    sheetActionsEl.append(
      makeBtn("복사", "primary", function () {
        copyText(ta.value, ta).then(
          function () { setStatus("백업 코드를 복사했어요 ✅", false); },
          function () { setStatus("복사 실패 — 코드를 길게 눌러 복사해 주세요.", true); }
        );
      }),
      makeBtn("파일로 저장", "", function () {
        downloadText(backupFilename(), ta.value);
        setStatus("파일을 저장했어요 ✅", false);
      }),
      makeBtn("닫기", "", closeSheet)
    );
  }

  function showImport() {
    openSheet("백업 가져오기");
    const hint = document.createElement("p");
    hint.className = "sheet-hint";
    hint.textContent =
      "백업 코드를 붙여넣거나 파일을 불러온 뒤, '합치기'(기존 유지+추가) 또는 '전체 교체'를 누르세요.";
    const ta = makeBackupTextarea("", false);
    sheetBodyEl.append(hint, ta);

    fileInputEl.onchange = function () {
      const file = fileInputEl.files && fileInputEl.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function () {
        ta.value = String(reader.result || "");
        setStatus("파일을 불러왔어요. '합치기' 또는 '전체 교체'를 누르세요.", false);
      };
      reader.onerror = function () { setStatus("파일을 읽지 못했어요.", true); };
      reader.readAsText(file);
      fileInputEl.value = "";
    };

    sheetActionsEl.append(
      makeBtn("파일 불러오기", "", function () { fileInputEl.click(); }),
      makeBtn("합치기", "primary", function () {
        const r = importFromText(ta.value, false);
        if (!r.ok) return setStatus(r.msg, true);
        setStatus(r.added + "개 추가됨 · 현재 " + r.total + "개 ✅", false);
      }),
      makeBtn("전체 교체", "danger", function () {
        if (!window.confirm("현재 할일을 모두 지우고 백업 내용으로 교체할까요?")) return;
        const r = importFromText(ta.value, true);
        if (!r.ok) return setStatus(r.msg, true);
        setStatus("교체 완료 · 현재 " + r.total + "개 ✅", false);
      }),
      makeBtn("닫기", "", closeSheet)
    );
  }

  function importFromText(text, replace) {
    let data;
    try { data = JSON.parse(text); }
    catch (e) { return { ok: false, msg: "형식이 올바르지 않아요. 백업 코드 전체를 넣었는지 확인해 주세요." }; }
    const arr = Array.isArray(data) ? data : data && Array.isArray(data.items) ? data.items : null;
    if (!arr) return { ok: false, msg: "백업 데이터를 찾을 수 없어요." };

    let ord = topOrder();
    const clean = [];
    arr.forEach(function (raw) {
      if (!raw || typeof raw.text !== "string" || !raw.text.trim()) return;
      clean.push({
        id: typeof raw.id === "string" && raw.id ? raw.id : uid(),
        text: raw.text.trim().slice(0, 200),
        done: !!raw.done,
        created: typeof raw.created === "number" ? raw.created : Date.now(),
        completedAt: typeof raw.completedAt === "number" ? raw.completedAt : null,
        due: typeof raw.due === "number" ? raw.due : null,
        category:
          typeof raw.category === "string" && raw.category.trim()
            ? raw.category.trim().slice(0, 20)
            : null,
        order: typeof raw.order === "number" ? raw.order : ord++,
        notified: !!raw.notified
      });
    });
    if (!clean.length) return { ok: false, msg: "가져올 할일이 없어요." };

    if (replace) {
      todos = clean;
      save(); render();
      return { ok: true, added: clean.length, total: todos.length };
    }
    const seen = {};
    todos.forEach(function (t) { seen[t.id] = true; });
    let added = 0;
    clean.forEach(function (it) {
      if (!seen[it.id]) { todos.push(it); seen[it.id] = true; added++; }
    });
    save(); render();
    return { ok: true, added: added, total: todos.length };
  }

  /* ===================== Reminders / notifications ===================== */
  function ensureNotifyPermission(cb) {
    if (!("Notification" in window)) { if (cb) cb(false); return; }
    if (Notification.permission === "granted") { if (cb) cb(true); return; }
    if (Notification.permission === "denied") { if (cb) cb(false); return; }
    Notification.requestPermission().then(function (p) {
      if (cb) cb(p === "granted");
    });
  }

  function checkReminders() {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const now = Date.now();
    let changed = false;
    todos.forEach(function (t) {
      if (!t.done && t.due != null && t.due <= now && !t.notified) {
        try {
          new Notification("⏰ 마감된 할일", { body: t.text, tag: "todo-" + t.id });
        } catch (e) {}
        t.notified = true;
        changed = true;
      }
    });
    if (changed) { save(); if (!isDragging) renderCounts(); }
  }

  /* ===================== Header buttons & composer ===================== */
  document.getElementById("statsBtn").addEventListener("click", openStats);
  document.getElementById("exportBtn").addEventListener("click", showExport);
  document.getElementById("importBtn").addEventListener("click", showImport);

  formEl.addEventListener("submit", function (e) {
    e.preventDefault();
    add(inputEl.value);
    inputEl.value = "";
    inputEl.focus();
  });

  /* ===================== Version label ===================== */
  const versionEl = document.getElementById("version");
  function showVersion(swVersion) {
    if (!swVersion) {
      versionEl.textContent = "버전 " + APP_VERSION;
      versionEl.classList.remove("stale");
      return;
    }
    if (swVersion === APP_VERSION) {
      versionEl.textContent = "버전 " + swVersion;
      versionEl.classList.remove("stale");
    } else {
      versionEl.textContent = "버전 " + swVersion + " · 앱을 다시 열면 " + APP_VERSION + "로 갱신";
      versionEl.classList.add("stale");
    }
  }

  /* ===================== Boot ===================== */
  render();
  showVersion(null);
  checkReminders();
  setInterval(checkReminders, 30000);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") { checkReminders(); render(); }
  });

  /* ===================== Service worker + 업데이트 알림 ===================== */
  const updateBtn = document.getElementById("updateBtn");
  const updateLabel = updateBtn ? updateBtn.querySelector(".update-label") : null;
  let waitingWorker = null;

  function askVersion() {
    const ctrl = navigator.serviceWorker.controller;
    if (ctrl) ctrl.postMessage("version");
  }
  function offerUpdate(worker) {
    if (!worker) return;
    waitingWorker = worker;
    if (updateBtn) updateBtn.hidden = false;
  }

  if (updateBtn) {
    updateBtn.addEventListener("click", function () {
      if (!waitingWorker) return;
      updateBtn.disabled = true;
      updateBtn.classList.add("loading");
      if (updateLabel) updateLabel.textContent = "업데이트 중…";
      navigator.serviceWorker.addEventListener(
        "controllerchange",
        function () { window.location.reload(); },
        { once: true }
      );
      waitingWorker.postMessage("skipWaiting");
    });
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", function (e) {
      if (e.data && e.data.type === "version") showVersion(e.data.version);
    });
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").then(function (reg) {
        askVersion();
        if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
        reg.addEventListener("updatefound", function () {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener("statechange", function () {
            if (nw.state === "installed" && navigator.serviceWorker.controller) offerUpdate(nw);
          });
        });
        document.addEventListener("visibilitychange", function () {
          if (document.visibilityState === "visible") reg.update().catch(function () {});
        });
      }).catch(function () {});
    });
  }
})();
