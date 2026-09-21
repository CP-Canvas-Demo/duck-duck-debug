import { COLOR_OPTIONS, GRID_SIZE, SLOT_IDS } from "./state.mjs";

export function renderHtml() {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Duck, Duck, Debug</title>
  <style>
    :root { color-scheme: light; --page:#f6f8fa; --surface:#fff; --border:#d0d7de; --text:#1f2328; --muted:#656d76; --blue:#0969da; --red:#cf222e; --green:#1a7f37; }
    * { box-sizing:border-box; }
    body { margin:0; background:var(--page); color:var(--text); font:14px/20px var(--font-sans,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif); }
    button, select, input { font:inherit; }
    button:focus-visible, select:focus-visible, input:focus-visible { outline:2px solid var(--blue); outline-offset:2px; }
    main { max-width:1080px; margin:auto; padding:12px; }
    header, section { padding:10px 12px; border:1px solid var(--border); border-radius:12px; background:var(--surface); box-shadow:0 6px 20px rgba(31,35,40,.06); }
    header { margin-bottom:8px; background:linear-gradient(135deg,rgba(255,213,0,.22),transparent 45%),var(--surface); }
    section + section { margin-top:8px; }
    h1 { margin:0 0 2px; font-size:17px; line-height:22px; }
    h2 { margin:0 0 4px; font-size:13px; }
    h3 { margin:0; font-size:12px; }
    p { margin:0; } .muted { color:var(--muted); }
    .toolbar { display:flex; justify-content:space-between; gap:12px; align-items:center; margin-bottom:8px; }
    .palette { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:8px; }
    .swatch { width:26px; height:26px; border:2px solid #fff; border-radius:50%; background:var(--swatch); box-shadow:0 0 0 1px var(--border); cursor:pointer; }
    .swatch.active { box-shadow:0 0 0 2px #fff,0 0 0 4px var(--blue); }
    .grid-wrap { max-width:380px; margin:0 auto; padding:8px; border:1px solid var(--border); border-radius:10px; background:#f6f8fa; }
    .grid { display:grid; grid-template-columns:repeat(${GRID_SIZE},minmax(10px,1fr)); gap:3px; }
    .grid.mini { gap:2px; grid-template-columns:repeat(${GRID_SIZE},minmax(0,1fr)); }
    .stud { position:relative; aspect-ratio:1; padding:0; border:1px solid color-mix(in srgb,var(--stud-color,#fff) 70%,var(--text)); border-radius:5px; background:var(--stud-color,transparent); box-shadow:inset -2px -3px 4px rgba(0,0,0,.18),inset 2px 2px 3px rgba(255,255,255,.25); cursor:pointer; }
    .grid.mini .stud { border-radius:4px; cursor:default; }
    .stud::before { position:absolute; inset:22%; border:1px solid rgba(0,0,0,.2); border-radius:50%; background:color-mix(in srgb,var(--stud-color,#fff) 88%,#fff); content:""; }
    .stud.empty { border-style:dashed; border-color:var(--border); background:transparent; box-shadow:none; }
    .stud.empty::before { background:transparent; border-color:var(--border); }
    .stud.human-stud { outline:2px solid var(--text); outline-offset:-2px; }
    .stud:disabled, .swatch:disabled, .handoff:disabled, .reset:disabled { cursor:not-allowed; opacity:.6; }
    .grid.mini .stud:disabled { opacity:1; }
    .models-heading { margin-top:10px; }
    .models-hint { margin-bottom:6px; }
    .actions { display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-top:8px; }
    .handoff, .reset { padding:7px 12px; border-radius:8px; font-weight:600; cursor:pointer; }
    .handoff { border:1px solid var(--blue); background:var(--blue); color:#fff; }
    .reset { border:1px solid var(--border); background:#fff; color:var(--text); }
    .status { min-height:16px; margin-top:6px; color:var(--muted); font-size:11px; }
    .slots { display:grid; gap:5px; grid-template-columns:1fr; }
    .slot { display:flex; flex-wrap:wrap; align-items:center; gap:6px 8px; padding:5px 8px; border:1px solid var(--border); border-radius:8px; background:#f6f8fa; min-width:0; }
    .slot.off { opacity:.55; }
    .slot-head { display:flex; align-items:center; gap:8px; flex:none; }
    .slot-head input { flex:none; margin:0; }
    .slot-head h3 { white-space:nowrap; }
    .slot select { flex:1; min-width:120px; }
    .slot select, .slot input[type=text] { min-width:0; padding:6px 8px; border:1px solid var(--border); border-radius:6px; background:#fff; color:var(--text); }
    .slot input[type=text] { flex-basis:100%; }
    .boards { display:grid; gap:8px; align-items:start; }
    .board { display:flex; flex-direction:column; gap:5px; padding:8px; border:1px solid var(--border); border-radius:10px; background:var(--surface); min-width:0; }
    .board-head { display:flex; justify-content:space-between; align-items:flex-start; gap:6px; min-width:0; }
    .board-head h3 { min-width:0; overflow-wrap:anywhere; font-size:12px; line-height:16px; }
    .pill { flex:none; padding:2px 7px; border-radius:999px; border:1px solid var(--border); font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:.03em; color:var(--muted); background:#f6f8fa; white-space:nowrap; }
    .pill.running { border-color:var(--blue); color:var(--blue); }
    .pill.done { border-color:var(--green); color:var(--green); }
    .pill.failed { border-color:var(--red); color:var(--red); }
    .board .note { font-size:11px; line-height:16px; color:var(--muted); }
    .board .note.error { color:var(--red); }
    .meta { font-size:11px; color:var(--muted); }
    @media (max-width:420px) { .boards { grid-template-columns:1fr !important; } }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>Duck, Duck, Debug</h1>
      <p class="muted">Paint tiles, then compare up to three models finishing your duck.</p>
    </header>
    <section>
      <div class="toolbar"><div><h2>Start the duck</h2><p class="muted">Choose a color and paint the first tiles.</p></div><button class="reset" id="mode" type="button">Remove bricks</button></div>
      <div class="palette" id="palette" aria-label="Brick colors"></div>
      <div class="grid-wrap"><div class="grid" id="grid" role="grid" aria-label="12 by 12 brick board"></div></div>
      <h2 class="models-heading">Models</h2>
      <p class="muted models-hint">Each board runs its own model in parallel. Turn a board off to include fewer models.</p>
      <div class="slots" id="slots"></div>
      <p class="status" id="slot-status" role="status"></p>
      <div class="actions">
        <button class="handoff" id="race" type="button" disabled>Compare models</button>
        <button class="reset" id="reset" type="button">Reset</button>
        <label class="toggle muted"><input type="checkbox" id="diff"> Outline my tiles on every board</label>
      </div>
      <p class="status" id="status" role="status">Loading board...</p>
    </section>
    <section id="results-section">
      <h2>Results</h2>
      <p class="muted" style="margin-bottom:8px" id="results-summary">Raw results per board: studs used and time taken.</p>
      <div class="boards" id="boards"></div>
    </section>
  </main>
  <script>
    const colors = ${JSON.stringify(COLOR_OPTIONS)};
    const slotIds = ${JSON.stringify(SLOT_IDS)};
    const palette = document.getElementById("palette");
    const grid = document.getElementById("grid");
    const race = document.getElementById("race");
    const reset = document.getElementById("reset");
    const mode = document.getElementById("mode");
    const status = document.getElementById("status");
    const slotStatus = document.getElementById("slot-status");
    const slotsHost = document.getElementById("slots");
    const boardsHost = document.getElementById("boards");
    const resultsSummary = document.getElementById("results-summary");
    const resultsSection = document.getElementById("results-section");
    const diffToggle = document.getElementById("diff");
    const CUSTOM = "__custom__";
    let selectedColor = "yellow";
    let removing = false;
    let models = [];
    let customSlots = new Set();
    let slotSignature = null;
    let snapshot;

    function message(text, error = false) { status.textContent = text; status.style.color = error ? "var(--red)" : ""; }
    function slotMessage(text, error = false) { slotStatus.textContent = text; slotStatus.style.color = error ? "var(--red)" : ""; }
    function colorOf(id) { return colors.find((candidate) => candidate.id === id); }
    function seconds(ms) { return typeof ms === "number" ? (ms / 1000).toFixed(1) + "s" : ""; }

    async function post(path, body) {
      const response = await fetch(path, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Canvas action failed.");
      if (result.snapshot) render(result.snapshot);
      return result;
    }

    function renderPalette() {
      palette.replaceChildren();
      for (const color of colors) {
        const button = document.createElement("button");
        button.className = "swatch";
        button.type = "button";
        button.title = color.label;
        button.setAttribute("aria-label", color.label);
        button.style.setProperty("--swatch", color.fallback);
        button.classList.toggle("active", !removing && color.id === selectedColor);
        button.disabled = !snapshot?.handoff.editable;
        button.onclick = () => { selectedColor = color.id; renderPalette(); };
        palette.append(button);
      }
    }

    function studButton(colorId, row, column, human) {
      const color = colorOf(colorId);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "stud";
      button.classList.toggle("empty", !color);
      button.classList.toggle("human-stud", Boolean(human) && diffToggle.checked);
      button.style.setProperty("--stud-color", color ? color.fallback : "transparent");
      button.setAttribute("role", "gridcell");
      button.setAttribute("aria-label", "Row " + row + ", column " + column + ", " + (color ? color.label : "empty"));
      return button;
    }

    function renderGrid() {
      const editable = snapshot.handoff.editable;
      grid.replaceChildren();
      for (let row = 0; row < snapshot.build.grid.length; row += 1) {
        for (let column = 0; column < snapshot.build.grid[row].length; column += 1) {
          const button = studButton(snapshot.build.grid[row][column], row + 1, column + 1, snapshot.build.locked[row][column]);
          button.disabled = !editable;
          button.onclick = async () => {
            if (!editable) return;
            try {
              await post(
                removing ? "/api/erase" : "/api/paint",
                removing
                  ? { row:row + 1, column:column + 1 }
                  : { row:row + 1, column:column + 1, color:selectedColor },
              );
              message("Saved.");
            } catch (error) { message(error.message, true); }
          };
          grid.append(button);
        }
      }
    }

    async function saveSlots() {
      const next = slotIds.map((id) => {
        const select = document.getElementById("model-" + id);
        const custom = document.getElementById("custom-" + id);
        const enabled = document.getElementById("enabled-" + id).checked;
        const model = select.value === CUSTOM ? custom.value.trim() : select.value;
        return { id, model, enabled };
      });
      try {
        await post("/api/slots", { slots: next });
        slotMessage("Models saved.");
      } catch (error) { slotMessage(error.message, true); }
    }

    function renderSlots() {
      const locked = snapshot.handoff.racing;
      // Rebuilding this every poll would close an open dropdown mid-selection.
      const signature = JSON.stringify([snapshot.slots, locked, models.length, [...customSlots]]);
      if (signature === slotSignature) return;
      slotSignature = signature;

      slotsHost.replaceChildren();
      for (const slot of snapshot.slots) {
        const known = models.some((model) => model.id === slot.model);
        const useCustom = customSlots.has(slot.id) || (models.length > 0 && !known);

        const wrapper = document.createElement("div");
        wrapper.className = "slot" + (slot.enabled ? "" : " off");

        const head = document.createElement("div");
        head.className = "slot-head";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.id = "enabled-" + slot.id;
        checkbox.checked = slot.enabled;
        checkbox.disabled = locked;
        checkbox.title = "Compare board " + slot.id.toUpperCase();
        checkbox.setAttribute("aria-label", "Compare board " + slot.id.toUpperCase());
        checkbox.onchange = saveSlots;
        const title = document.createElement("h3");
        title.textContent = "Board " + slot.id.toUpperCase();
        head.append(checkbox, title);

        const select = document.createElement("select");
        select.id = "model-" + slot.id;
        select.disabled = locked;
        select.setAttribute("aria-label", "Model for board " + slot.id.toUpperCase());
        const families = [...new Set(models.map((model) => model.family))];
        for (const family of families) {
          const group = document.createElement("optgroup");
          group.label = family;
          for (const model of models.filter((candidate) => candidate.family === family)) {
            const option = document.createElement("option");
            option.value = model.id;
            option.textContent = model.label;
            group.append(option);
          }
          select.append(group);
        }
        const customOption = document.createElement("option");
        customOption.value = CUSTOM;
        customOption.textContent = "Custom model id...";
        select.append(customOption);
        select.value = useCustom ? CUSTOM : slot.model;
        select.onchange = () => {
          if (select.value === CUSTOM) { customSlots.add(slot.id); slotSignature = null; renderSlots(); return; }
          customSlots.delete(slot.id);
          saveSlots();
        };

        wrapper.append(head, select);
        if (useCustom) {
          const custom = document.createElement("input");
          custom.id = "custom-" + slot.id;
          custom.type = "text";
          custom.placeholder = "model id";
          custom.value = slot.model;
          custom.disabled = locked;
          custom.onchange = saveSlots;
          wrapper.append(custom);
        }
        slotsHost.append(wrapper);
      }
    }

    function renderBoards() {
      const variants = snapshot.variants.filter((variant) => variant.status !== "idle" && variant.status !== "skipped");
      boardsHost.replaceChildren();
      resultsSection.style.display = variants.length === 0 ? "none" : "";
      if (variants.length === 0) {
        resultsSummary.textContent = "Raw results per board: studs used and time taken.";
        return;
      }
      const done = variants.filter((variant) => variant.status === "done").length;
      resultsSummary.textContent = done + " of " + variants.length + " boards finished.";
      boardsHost.style.gridTemplateColumns = "repeat(" + variants.length + ",minmax(0,1fr))";

      for (const variant of variants) {
        const card = document.createElement("div");
        card.className = "board";

        const head = document.createElement("div");
        head.className = "board-head";
        const title = document.createElement("h3");
        const known = models.find((model) => model.id === variant.model);
        title.textContent = known ? known.label : variant.model || ("Board " + variant.id.toUpperCase());
        title.title = variant.model || "";
        const pill = document.createElement("span");
        pill.className = "pill " + variant.status;
        pill.textContent = variant.status;
        head.append(title, pill);

        const board = document.createElement("div");
        board.className = "grid mini";
        board.setAttribute("role", "grid");
        board.setAttribute("aria-label", "Board " + variant.id.toUpperCase() + " by " + (variant.model || "a model"));
        for (let row = 0; row < variant.grid.length; row += 1) {
          for (let column = 0; column < variant.grid[row].length; column += 1) {
            const button = studButton(variant.grid[row][column], row + 1, column + 1, snapshot.build.locked[row][column]);
            button.disabled = true;
            board.append(button);
          }
        }

        const meta = document.createElement("p");
        meta.className = "meta";
        const parts = [];
        parts.push("Studs used: " + (variant.addedStuds || 0));
        if (variant.elapsedMs !== null) parts.push("Time taken: " + seconds(variant.elapsedMs));
        meta.textContent = parts.join(" - ");

        card.append(head, board, meta);
        if (variant.error) {
          const error = document.createElement("p");
          error.className = "note error";
          error.textContent = variant.error;
          card.append(error);
        } else if (variant.note) {
          const note = document.createElement("p");
          note.className = "note";
          note.textContent = variant.note;
          card.append(note);
        }
        boardsHost.append(card);
      }
    }

    function render(next) {
      snapshot = next;
      const editable = snapshot.handoff.editable;
      race.disabled = !snapshot.handoff.ready;
      race.textContent = snapshot.handoff.racing ? "Racing..." : snapshot.handoff.label;
      reset.disabled = false;
      mode.disabled = !editable;
      mode.textContent = removing ? "Paint bricks" : "Remove bricks";
      renderPalette();
      renderGrid();
      renderSlots();
      renderBoards();
    }

    race.onclick = async () => {
      try {
        const result = await post("/api/race", { confirm:true });
        message("Comparing " + result.boards + " model(s) in parallel.");
      } catch (error) { message(error.message, true); }
    };
    mode.onclick = () => { removing = !removing; render(snapshot); };
    diffToggle.onchange = () => render(snapshot);
    reset.onclick = async () => {
      if (!window.confirm("Clear every board and start again?")) return;
      try {
        await post("/api/reset", { confirm:true });
        message("Board reset.");
      } catch (error) { message(error.message, true); }
    };

    fetch("/api/models")
      .then((response) => response.json())
      .then((result) => { models = result.models || []; slotSignature = null; if (snapshot) renderSlots(); })
      .catch(() => { models = []; });
    fetch("/api/state").then((response) => response.json()).then((state) => { render(state); message(state.handoff.instruction); }).catch((error) => message(error.message, true));
    setInterval(() => {
      if (document.activeElement && document.activeElement.tagName === "INPUT" && document.activeElement.type === "text") return;
      fetch("/api/state")
        .then((response) => response.json())
        .then(render)
        .catch(() => message("Reconnecting...", true));
    }, 1000);
  </script>
</body>
</html>`;
}
