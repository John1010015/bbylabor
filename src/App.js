import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";

/* ---------- Styling + Constants ---------- */
const BB_BLUE = "#0046BE";
const BB_YELLOW = "#FFD100";
const LIGHT_BORDER = "#ddd";
const BASE_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Special drag-only bucket */
const OFF_POS = "off/other";

/** Positions shown in the schedule (OFF/OTHER last) */
const positionsList = [
  "belt",
  "bulk",
  "direct sorting",
  "flow",
  "line loading",
  "receiving",
  "repack",
  "research",
  "trade in",
  "VAL",
  "wrap",
  OFF_POS,
];

/** People who should NOT be auto-placed in bulk / line loading */
const restrictedNames = [
  "Johanna",
  "Imelda",
  "Natalie",
  "Elizabeth",
  "Paty",
  "Leonor",
  "Pamela",
  "Lisabeth",
  "Hannia",
  "Rocha",
];

const norm = (s) => String(s || "").trim().toLowerCase();
const did = (pos, day) => `${pos}__${day}`;
const parseDid = (id) => {
  const i = id.lastIndexOf("__");
  return { pos: id.slice(0, i), day: id.slice(i + 2) };
};
const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);

/* ---------- Seed Employees ---------- */
const initialEmployees = [
  { name: "Denise", positions: ["Receiving", "Direct Sorting", "Re-pack"] },
  { name: "Imelda", positions: ["Belt", "Flow", "Direct Sorting"] },
  { name: "Natalie", positions: ["Receiving", "Flow", "Direct Sorting"] },
  { name: "Joseph", positions: ["Wrap", "Bulk", "Re-pack"] },
  { name: "Steven", positions: ["Re-pack", "Direct Sorting", "Line Loading"] },
  { name: "Elizabeth", positions: ["Receiving", "Belt", "Direct Sorting"] },
  { name: "Paty", positions: ["Receiving", "Trade-In", "Flow"] },
  { name: "Johanna", positions: ["Direct Sorting", "Receiving", "Flow"] },
  { name: "Leonor", positions: ["Belt", "Direct Sorting", "Flow"] },
  { name: "Pamela", positions: ["Receiving", "Direct Sorting", "Belt"] },
  { name: "Blue", positions: ["Anything", "Anything", "Anything"] },
  { name: "Lisabeth", positions: ["Receiving", "Direct Sorting", "Flow"] },
  { name: "Adrian", positions: ["Line Loading", "Re-Pack", "Belt"] },
  { name: "Alexis", positions: ["Research", "Line Loading", "Wrap"] },
  { name: "Jacob", positions: ["Wrap", "Belt", "Direct Sorting"] },
  { name: "Jesus", positions: ["Research", "Wrap", "Receiving"] },
  { name: "Alex", positions: ["Wrap", "Re-Pack", "Bulk"] },
  { name: "Hannia", positions: ["Research", "Receiving", "Direct Sorting"] },
  { name: "Sid", positions: ["VAL", "Re-Pack", "Wrap"], lockToVAL: true },
  { name: "Rocha", positions: ["VAL", "Flow", "Trade-in"], lockToVAL: true },
  { name: "Andrew", positions: ["Wrap", "Re-Pack", "Research"] },
].map((e, i) => ({
  id: i + 1,
  exclusions: [],
  lockToVAL: Boolean(e.lockToVAL),
  ...e,
}));

/* ---------- Position counts helpers ---------- */
function blankCountsFor(employees) {
  const obj = {};
  employees.forEach((e) => {
    obj[e.name] = {};
    positionsList.forEach((p) => {
      if (p === OFF_POS) return;
      obj[e.name][p] = 0;
    });
  });
  return obj;
}
function ensureCountsShape(prev, employees) {
  if (!prev) return blankCountsFor(employees);
  const next = { ...prev };
  employees.forEach((e) => {
    if (!next[e.name]) next[e.name] = {};
    positionsList.forEach((p) => {
      if (p === OFF_POS) return;
      if (typeof next[e.name][p] !== "number") next[e.name][p] = 0;
    });
  });
  return next;
}

/* ==================== APP ==================== */
export default function App() {
  const [tab, setTab] = useState("roster");
  const [employees, setEmployees] = useState([]);
  const [positionNeeds, setPositionNeeds] = useState({});
  const [schedule, setSchedule] = useState({});
  const [includeSaturday, setIncludeSaturday] = useState(false);
  const [generatedOnce, setGeneratedOnce] = useState(false);
  const [positionCounts, setPositionCounts] = useState({});

  const activeDays = useMemo(
    () => (includeSaturday ? BASE_DAYS : BASE_DAYS.slice(0, 5)),
    [includeSaturday]
  );

  /* ---------- Load ---------- */
  useEffect(() => {
    setEmployees(
      JSON.parse(localStorage.getItem("employees")) || initialEmployees
    );
    setPositionNeeds(JSON.parse(localStorage.getItem("positionNeeds")) || {});
    setSchedule(JSON.parse(localStorage.getItem("schedule")) || {});
    setIncludeSaturday(
      JSON.parse(localStorage.getItem("includeSaturday")) || false
    );
    setPositionCounts(JSON.parse(localStorage.getItem("positionCounts")) || {});
  }, []);

  /* ---------- Persist ---------- */
  useEffect(
    () => localStorage.setItem("employees", JSON.stringify(employees)),
    [employees]
  );
  useEffect(
    () => localStorage.setItem("positionNeeds", JSON.stringify(positionNeeds)),
    [positionNeeds]
  );
  useEffect(
    () => localStorage.setItem("schedule", JSON.stringify(schedule)),
    [schedule]
  );
  useEffect(
    () =>
      localStorage.setItem("includeSaturday", JSON.stringify(includeSaturday)),
    [includeSaturday]
  );
  useEffect(
    () =>
      localStorage.setItem("positionCounts", JSON.stringify(positionCounts)),
    [positionCounts]
  );

  /* ---------- Actions ---------- */
  const resetSchedule = () => {
    setSchedule({});
    localStorage.removeItem("schedule");
    setGeneratedOnce(false);
  };

  const resetChart = () => {
    setPositionCounts(blankCountsFor(employees));
  };

  const exportToExcel = () => {
    const wsData = [["Position", ...activeDays]];
    positionsList.forEach((pos) => {
      wsData.push([
        pos,
        ...activeDays.map((d) =>
          (schedule[pos]?.[d] || []).map((e) => e.name).join(", ")
        ),
      ]);
    });
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Weekly Schedule");
    XLSX.writeFile(
      wb,
      `Weekly_Schedule_${new Date().toISOString().split("T")[0]}.xlsx`
    );
  };

  const generateSchedule = () => {
    const daysActive = activeDays;
    const next = {};
    for (const pos of positionsList) {
      next[pos] = {};
      for (const d of daysActive) next[pos][d] = [];
    }

    // lock VAL first
    const lockedVAL = employees.filter((e) => e.lockToVAL);
    let pool = shuffle(employees.filter((e) => !e.lockToVAL));
    for (const e of lockedVAL) {
      for (const d of daysActive) next["VAL"][d].push(e);
    }

    const maxNeed = (pos) =>
      Math.max(...daysActive.map((d) => positionNeeds[pos]?.[d] || 0), 0);

    // fill positions (skip VAL and OFF_POS)
    for (const pos of shuffle([...positionsList])) {
      if (pos === "VAL" || pos === OFF_POS) continue;
      const needed = maxNeed(pos);
      if (!needed) continue;

      const isAllowed = (e) => {
        const name = e.name?.trim();
        if (
          ["bulk", "line loading"].includes(norm(pos)) &&
          restrictedNames.includes(name)
        )
          return false;
        if ((e.exclusions || []).map(norm).includes(norm(pos))) return false;
        return true;
      };

      let candidates = shuffle(
        pool.filter(
          (e) =>
            isAllowed(e) &&
            (norm(e.positions[0]) === norm(pos) ||
              norm(e.positions[1]) === norm(pos) ||
              norm(e.positions[2]) === norm(pos) ||
              e.positions.some((p) => norm(p) === "anything"))
        )
      );

      if (candidates.length < needed) {
        const extras = shuffle(pool.filter((e) => isAllowed(e)));
        candidates = [...candidates, ...extras];
      }

      const pick = candidates.slice(0, needed);
      pool = pool.filter((e) => !pick.includes(e));
      for (const d of daysActive) next[pos][d] = [...pick];
    }

    // fill open slots with leftovers (skip OFF_POS)
    const openSlots = [];
    for (const pos of positionsList) {
      if (pos === OFF_POS) continue;
      for (const d of daysActive) {
        const need = positionNeeds[pos]?.[d] || 0;
        const cur = next[pos][d].length;
        if (cur < need) openSlots.push({ pos, day: d, remaining: need - cur });
      }
    }
    const leftovers = shuffle(pool);
    for (const emp of leftovers) {
      for (const slot of openSlots) {
        if (slot.remaining <= 0) continue;
        if (
          ["bulk", "line loading"].includes(norm(slot.pos)) &&
          restrictedNames.includes(emp.name?.trim())
        )
          continue;
        if ((emp.exclusions || []).map(norm).includes(norm(slot.pos))) continue;
        next[slot.pos][slot.day].push(emp);
        slot.remaining -= 1;
        break;
      }
    }

    // weekly positionCounts (+1 per position that week; OFF ignored)
    setPositionCounts((prev) => {
      const base = ensureCountsShape(prev, employees);
      positionsList.forEach((pos) => {
        if (pos === OFF_POS) return;
        const namesThisWeek = new Set();
        Object.values(next[pos] || {}).forEach((arr) =>
          (arr || []).forEach((emp) => namesThisWeek.add(emp.name))
        );
        namesThisWeek.forEach((name) => {
          base[name][pos] = (base[name][pos] || 0) + 1;
        });
      });
      return { ...base };
    });

    setSchedule(next);
    setGeneratedOnce(true);
    setTab("schedule");
  };

  /* Drag & drop: move, then adjust counts if position changed
     (OFF/OTHER doesn’t count; leaving a real pos decrements if >0) */
  const handleDragEnd = (result) => {
    const { source, destination } = result;
    if (!destination) return;

    const s = parseDid(source.droppableId);
    const d = parseDid(destination.droppableId);
    if (!schedule[s.pos] || !schedule[d.pos]) return;

    const next = JSON.parse(JSON.stringify(schedule));
    const [moved] = next[s.pos][s.day].splice(source.index, 1);
    if (!moved) return;

    // unique id per cell placement
    const uid = `${moved.id}-${d.pos}-${d.day}-${Date.now()}`;
    next[d.pos][d.day].splice(destination.index, 0, { ...moved, _uid: uid });

    setSchedule(next);

    if (s.pos !== d.pos) {
      setPositionCounts((prev) => {
        const base = ensureCountsShape(prev, employees);
        const name = moved.name;

        if (s.pos !== OFF_POS && base[name][s.pos] > 0) {
          base[name][s.pos] = base[name][s.pos] - 1;
        }
        if (d.pos !== OFF_POS) {
          base[name][d.pos] = (base[name][d.pos] || 0) + 1;
        }
        return { ...base };
      });
    }
  };

  return (
    <div style={{ fontFamily: "Arial", background: "#f7f9fc", minHeight: "100vh" }}>
      <Header tab={tab} setTab={setTab} />
      {tab === "roster" ? (
        <RosterTab employees={employees} setEmployees={setEmployees} />
      ) : (
        <ScheduleTab
          includeSaturday={includeSaturday}
          setIncludeSaturday={setIncludeSaturday}
          activeDays={activeDays}
          positionNeeds={positionNeeds}
          handleNeedChange={(pos, day, val) =>
            setPositionNeeds((p) => ({
              ...p,
              [pos]: { ...p[pos], [day]: Number(val) },
            }))
          }
          generateSchedule={generateSchedule}
          resetSchedule={resetSchedule}
          resetChart={resetChart}
          generatedOnce={generatedOnce}
          schedule={schedule}
          setSchedule={setSchedule}
          exportToExcel={exportToExcel}
          onDragEnd={handleDragEnd}
          positionCounts={ensureCountsShape(positionCounts, employees)}
        />
      )}
    </div>
  );
}

/* ==================== UI: Header ==================== */
function Header({ tab, setTab }) {
  return (
    <div
      style={{
        background: BB_BLUE,
        color: "white",
        padding: "12px 20px",
        display: "flex",
        justifyContent: "space-between",
      }}
    >
      <h2>Best Buy Labor Planner</h2>
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={() => setTab("roster")} style={tabBtn(tab === "roster")}>
          Employee Roster
        </button>
        <button onClick={() => setTab("schedule")} style={tabBtn(tab === "schedule")}>
          Schedule
        </button>
      </div>
    </div>
  );
}
const tabBtn = (active) => ({
  background: active ? BB_YELLOW : "white",
  color: active ? "black" : BB_BLUE,
  border: "none",
  padding: "6px 12px",
  borderRadius: 6,
  cursor: "pointer",
});

/* ==================== UI: Roster ==================== */
function RosterTab({ employees, setEmployees }) {
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");

  const handlePasteRoster = () => {
    const lines = pasteText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const parsed = lines.map((line, idx) => {
      const parts = line.split(/[\t,]+/).map((p) => p.trim());
      const name = parts[0] || `Emp${idx + 1}`;
      return {
        id: Date.now() + idx,
        name,
        positions: [
          parts[1] || "Anything",
          parts[2] || "Anything",
          parts[3] || "Anything",
        ],
        exclusions: [],
        lockToVAL: ["sid", "rocha"].includes(norm(name)),
      };
    });
    setEmployees(parsed);
    setShowPaste(false);
    setPasteText("");
  };

  return (
    <div style={{ padding: 20, maxWidth: 1000, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <h3 style={{ color: BB_BLUE }}>Employee Roster</h3>
        <button
          onClick={() => setShowPaste(true)}
          style={{
            background: BB_YELLOW,
            border: "none",
            padding: "6px 12px",
            borderRadius: 6,
            fontWeight: "bold",
            color: BB_BLUE,
          }}
        >
          📋 Paste Full Roster
        </button>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
        <thead style={{ background: BB_BLUE, color: "white" }}>
          <tr>
            <th>Name</th>
            <th>1st</th>
            <th>2nd</th>
            <th>3rd</th>
          </tr>
        </thead>
        <tbody>
          {employees.map((e) => (
            <tr key={e.id}>
              <td>{e.name}</td>
              {e.positions.map((p, i) => (
                <td key={`${e.id}-pos-${i}`}>
                  <input
                    value={p}
                    onChange={(ev) => {
                      const updated = employees.map((emp) =>
                        emp.id === e.id
                          ? {
                              ...emp,
                              positions: emp.positions.map((x, j) =>
                                j === i ? ev.target.value : x
                              ),
                            }
                          : emp
                      );
                      setEmployees(updated);
                    }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {showPaste && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <div
            style={{
              background: "white",
              padding: 20,
              borderRadius: 8,
              width: 420,
            }}
          >
            <h3>Paste Roster (comma/tab separated)</h3>
            <p style={{ marginTop: 0, color: "#666" }}>
              Format: <em>Name, 1st, 2nd, 3rd</em>
            </p>
            <textarea
              rows={8}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              style={{ width: "100%", padding: 8 }}
            />
            <div style={{ marginTop: 10, textAlign: "right" }}>
              <button
                onClick={handlePasteRoster}
                style={{
                  background: BB_BLUE,
                  color: "white",
                  border: "none",
                  padding: "6px 12px",
                  borderRadius: 6,
                }}
              >
                Import
              </button>
              <button
                onClick={() => setShowPaste(false)}
                style={{
                  background: "white",
                  color: BB_BLUE,
                  border: `1px solid ${LIGHT_BORDER}`,
                  padding: "6px 12px",
                  borderRadius: 6,
                  marginLeft: 6,
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ==================== UI: Schedule ==================== */
function ScheduleTab({
  includeSaturday,
  setIncludeSaturday,
  activeDays,
  positionNeeds,
  handleNeedChange,
  generateSchedule,
  resetSchedule,
  resetChart,
  generatedOnce,
  schedule,
  exportToExcel,
  onDragEnd,
  positionCounts,
}) {
  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 12,
          alignItems: "center",
        }}
      >
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={includeSaturday}
            onChange={(e) => setIncludeSaturday(e.target.checked)}
          />
          <span style={{ fontWeight: 700, color: BB_BLUE }}>Include Saturday</span>
        </label>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={resetChart}
            style={{
              background: "white",
              border: `1px solid ${LIGHT_BORDER}`,
              color: BB_BLUE,
              padding: "6px 10px",
              borderRadius: 6,
              fontWeight: "bold",
            }}
          >
            Reset Chart
          </button>
          <button
            onClick={resetSchedule}
            style={{
              background: "white",
              border: `1px solid ${LIGHT_BORDER}`,
              color: BB_BLUE,
              padding: "6px 10px",
              borderRadius: 6,
              fontWeight: "bold",
            }}
          >
            Reset Schedule
          </button>
          <button
            onClick={generateSchedule}
            style={{
              background: BB_BLUE,
              color: "white",
              padding: "6px 10px",
              borderRadius: 6,
              fontWeight: "bold",
            }}
          >
            {generatedOnce ? "Regenerate" : "Generate"} Schedule
          </button>
        </div>
      </div>

      {/* Needs (skip OFF/OTHER) */}
      <h3 style={{ color: BB_BLUE }}>
        Set Position Needs ({includeSaturday ? "Mon–Sat" : "Mon–Fri"})
      </h3>
      {positionsList
        .filter((p) => p !== OFF_POS)
        .map((pos) => (
          <div
            key={`need-${pos}`}
            style={{ display: "flex", alignItems: "center", marginBottom: 5 }}
          >
            <strong style={{ width: 150, textTransform: "capitalize" }}>{pos}</strong>
            {activeDays.map((d) => (
              <input
                key={`need-${pos}-${d}`}
                type="number"
                value={positionNeeds[pos]?.[d] || ""}
                onChange={(e) => handleNeedChange(pos, d, e.target.value)}
                style={{ width: 60, marginRight: 6 }}
              />
            ))}
          </div>
        ))}

      {/* Schedule table */}
      {Object.keys(schedule).length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <h3 style={{ color: BB_BLUE }}>
              Weekly Schedule — Drag names to adjust (OFF/OTHER available)
            </h3>
            <button
              onClick={exportToExcel}
              style={{
                background: BB_YELLOW,
                color: BB_BLUE,
                border: "none",
                padding: "6px 10px",
                borderRadius: 6,
                fontWeight: "bold",
              }}
            >
              Export to Excel
            </button>
          </div>

          <DragDropContext onDragEnd={onDragEnd}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                marginTop: 10,
              }}
            >
              <thead style={{ background: BB_BLUE, color: "white" }}>
                <tr>
                  <th style={{ width: 150 }}>Position</th>
                  {activeDays.map((d) => (
                    <th key={`day-${d}`}>{d}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {positionsList.map((pos) => (
                  <tr key={`row-${pos}`}>
                    <td>
                      <strong style={{ textTransform: "capitalize" }}>{pos}</strong>
                    </td>
                    {activeDays.map((day) => (
                      <td key={`cell-${pos}-${day}`}>
                        <Droppable droppableId={did(pos, day)}>
                          {(provided) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.droppableProps}
                              style={{
                                minHeight: 50,
                                border: `1px solid ${LIGHT_BORDER}`,
                                borderRadius: 4,
                                padding: 4,
                                background: pos === OFF_POS ? "#fff9f0" : "#fff",
                              }}
                            >
                              {(schedule[pos]?.[day] || []).map((emp, idx) => {
                                const dragId =
                                  emp._uid ?? `${emp.id}-${pos}-${day}-${idx}`;
                                return (
                                  <Draggable
                                    key={`drag-${dragId}`}
                                    draggableId={dragId}
                                    index={idx}
                                  >
                                    {(prov) => (
                                      <div
                                        ref={prov.innerRef}
                                        {...prov.draggableProps}
                                        {...prov.dragHandleProps}
                                        style={{
                                          ...prov.draggableProps.style,
                                          padding: "4px 6px",
                                          marginBottom: 4,
                                          background: "#f5f7ff",
                                          border: `1px solid ${LIGHT_BORDER}`,
                                          borderRadius: 4,
                                          cursor: "grab",
                                          fontSize: 13,
                                        }}
                                      >
                                        {emp.name}
                                      </div>
                                    )}
                                  </Draggable>
                                );
                              })}
                              {provided.placeholder}
                            </div>
                          )}
                        </Droppable>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </DragDropContext>

          {/* Counts table */}
          <h3 style={{ marginTop: 24, color: BB_BLUE }}>Position Counts (per week)</h3>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th
                    style={{
                      textAlign: "left",
                      padding: 6,
                      borderBottom: `1px solid ${LIGHT_BORDER}`,
                    }}
                  >
                    Employee
                  </th>
                  {positionsList
                    .filter((p) => p !== OFF_POS)
                    .map((p) => (
                      <th
                        key={`hdr-count-${p}`}
                        style={{
                          textAlign: "center",
                          padding: 6,
                          borderBottom: `1px solid ${LIGHT_BORDER}`,
                          textTransform: "capitalize",
                        }}
                      >
                        {p}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {Object.keys(positionCounts).map((name) => (
                  <tr key={`row-count-${name}`}>
                    <td style={{ padding: 6, borderBottom: `1px solid ${LIGHT_BORDER}` }}>
                      {name}
                    </td>
                    {positionsList
                      .filter((p) => p !== OFF_POS)
                      .map((p) => (
                        <td
                          key={`cell-count-${name}-${p}`}
                          style={{
                            textAlign: "center",
                            padding: 6,
                            borderBottom: `1px solid ${LIGHT_BORDER}`,
                          }}
                        >
                          {positionCounts[name][p] ?? 0}
                        </td>
                      ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
