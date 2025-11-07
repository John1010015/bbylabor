import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";

const BB_BLUE = "#0046BE";
const BB_YELLOW = "#FFD100";
const LIGHT_BORDER = "#ddd";
const BASE_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// how many past weeks to avoid repeating the same position
const LOOKBACK_WEEKS = 2;

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
];

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

const norm = (s) =>
  String(s || "")
    .trim()
    .toLowerCase();
const did = (pos, day) => `${pos}__${day}`;
const parseDid = (id) => {
  const i = id.lastIndexOf("__");
  return { pos: id.slice(0, i), day: id.slice(i + 2) };
};
const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);

// base employees
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

// was emp in this position in the last N weeks?
function wasInPositionRecently(empName, pos, history, lookback) {
  if (!history || history.length === 0) return false;
  const recent = history.slice(-lookback); // last N schedules
  for (const week of recent) {
    const posBlock = week[pos];
    if (!posBlock) continue;
    for (const dayKey of Object.keys(posBlock)) {
      const list = posBlock[dayKey] || [];
      if (list.some((e) => e.name === empName)) return true;
    }
  }
  return false;
}

// build a table: employee -> position -> how many weeks they did it
function buildPositionCounts(employees, schedule, history) {
  const counts = {};
  // init all to 0
  employees.forEach((e) => {
    counts[e.name] = {};
    positionsList.forEach((p) => (counts[e.name][p] = 0));
  });

  const addWeek = (weekSchedule) => {
    if (!weekSchedule) return;
    positionsList.forEach((pos) => {
      const daysObj = weekSchedule[pos] || {};
      const namesThisWeek = new Set();
      Object.values(daysObj).forEach((arr) => {
        (arr || []).forEach((emp) => namesThisWeek.add(emp.name));
      });
      namesThisWeek.forEach((name) => {
        if (!counts[name]) {
          counts[name] = {};
          positionsList.forEach((p) => (counts[name][p] = 0));
        }
        counts[name][pos] = (counts[name][pos] || 0) + 1; // +1 per week
      });
    });
  };

  (history || []).forEach(addWeek);
  if (schedule && Object.keys(schedule).length) addWeek(schedule);

  return counts;
}

export default function App() {
  const [tab, setTab] = useState("roster");
  const [employees, setEmployees] = useState([]);
  const [positionNeeds, setPositionNeeds] = useState({});
  const [schedule, setSchedule] = useState({});
  const [scheduleHistory, setScheduleHistory] = useState([]);
  const [includeSaturday, setIncludeSaturday] = useState(false);
  const [generatedOnce, setGeneratedOnce] = useState(false);

  const activeDays = useMemo(
    () => (includeSaturday ? BASE_DAYS : BASE_DAYS.slice(0, 5)),
    [includeSaturday]
  );

  // load from localStorage
  useEffect(() => {
    setEmployees(JSON.parse(localStorage.getItem("employees")) || initialEmployees);
    setPositionNeeds(JSON.parse(localStorage.getItem("positionNeeds")) || {});
    setSchedule(JSON.parse(localStorage.getItem("schedule")) || {});
    setScheduleHistory(JSON.parse(localStorage.getItem("scheduleHistory")) || []);
    setIncludeSaturday(JSON.parse(localStorage.getItem("includeSaturday")) || false);
  }, []);

  // save to localStorage
  useEffect(() => {
    localStorage.setItem("employees", JSON.stringify(employees));
  }, [employees]);
  useEffect(() => {
    localStorage.setItem("positionNeeds", JSON.stringify(positionNeeds));
  }, [positionNeeds]);
  useEffect(() => {
    localStorage.setItem("schedule", JSON.stringify(schedule));
  }, [schedule]);
  useEffect(() => {
    localStorage.setItem("scheduleHistory", JSON.stringify(scheduleHistory));
  }, [scheduleHistory]);
  useEffect(() => {
    localStorage.setItem("includeSaturday", JSON.stringify(includeSaturday));
  }, [includeSaturday]);

  const resetSchedule = () => {
    setSchedule({});
    localStorage.removeItem("schedule");
    setGeneratedOnce(false);
  };

  const generateSchedule = () => {
    const daysActive = activeDays;
    const next = {};

    // track who is already assigned on each day so we don't double-book
    const dayTaken = {};
    daysActive.forEach((d) => {
      dayTaken[d] = new Set();
    });

    // initialize schedule shape
    for (const pos of positionsList) {
      next[pos] = {};
      for (const d of daysActive) next[pos][d] = [];
    }

    // VAL locked first
    const lockedVAL = employees.filter((e) => e.lockToVAL);
    let pool = shuffle(employees.filter((e) => !e.lockToVAL));

    for (const e of lockedVAL) {
      for (const d of daysActive) {
        next["VAL"][d].push(e);
        dayTaken[d].add(e.name);
      }
    }

    const maxNeed = (pos) =>
      Math.max(...daysActive.map((d) => positionNeeds[pos]?.[d] || 0), 0);

    // assign every other position
    for (const pos of shuffle([...positionsList])) {
      if (pos === "VAL") continue;
      const needed = maxNeed(pos);
      if (!needed) continue;

      const isAllowedBase = (e) => {
        const name = e.name?.trim();
        // keep girls out of bulk/line loading
        if (
          ["bulk", "line loading"].includes(norm(pos)) &&
          restrictedNames.includes(name)
        )
          return false;
        if ((e.exclusions || []).map(norm).includes(norm(pos))) return false;
        return true;
      };

      const isFreeAllDays = (e) =>
        daysActive.every((d) => !dayTaken[d].has(e.name));

      // best candidates: allowed + free + not recently in this position
      let candidates = pool.filter(
        (e) =>
          isAllowedBase(e) &&
          isFreeAllDays(e) &&
          !wasInPositionRecently(e.name, pos, scheduleHistory, LOOKBACK_WEEKS)
      );

      // if not enough, allow ones who were in it recently (but still free)
      if (candidates.length < needed) {
        const more = pool.filter((e) => isAllowedBase(e) && isFreeAllDays(e));
        more.forEach((m) => {
          if (!candidates.includes(m)) candidates.push(m);
        });
      }

      // score by employee preference order
      const scored = candidates.map((e) => {
        const idx = e.positions.map(norm).indexOf(norm(pos));
        return { emp: e, score: idx === -1 ? 99 : idx };
      });
      scored.sort((a, b) => a.score - b.score);

      const picked = scored.slice(0, needed).map((x) => x.emp);

      // assign for all days and mark as taken
      for (const d of daysActive) {
        next[pos][d] = [...picked];
        picked.forEach((p) => dayTaken[d].add(p.name));
      }

      // remove from pool so we don't try to use them again in another position
      pool = pool.filter((e) => !picked.some((p) => p.id === e.id));
    }

    // fill leftover slots with leftovers, still no double-book
    const openSlots = [];
    for (const pos of positionsList) {
      for (const d of daysActive) {
        const need = positionNeeds[pos]?.[d] || 0;
        const current = next[pos][d].length;
        if (current < need) openSlots.push({ pos, day: d, remaining: need - current });
      }
    }

    const leftovers = shuffle(pool);
    for (const emp of leftovers) {
      for (const slot of openSlots) {
        if (slot.remaining <= 0) continue;
        if (dayTaken[slot.day].has(emp.name)) continue;
        if (
          ["bulk", "line loading"].includes(norm(slot.pos)) &&
          restrictedNames.includes(emp.name?.trim())
        )
          continue;
        if ((emp.exclusions || []).map(norm).includes(norm(slot.pos))) continue;
        next[slot.pos][slot.day].push(emp);
        dayTaken[slot.day].add(emp.name);
        slot.remaining -= 1;
        break;
      }
    }

    setSchedule(next);
    setGeneratedOnce(true);

    // save history as array of whole schedules (keep last 6)
    const newHistory = [...scheduleHistory, next].slice(-6);
    setScheduleHistory(newHistory);

    localStorage.setItem("schedule", JSON.stringify(next));
    localStorage.setItem("scheduleHistory", JSON.stringify(newHistory));
    setTab("schedule");
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

  const counts = buildPositionCounts(employees, schedule, scheduleHistory);

  return (
    <div
      style={{ fontFamily: "Arial", background: "#f7f9fc", minHeight: "100vh" }}
    >
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
          generatedOnce={generatedOnce}
          schedule={schedule}
          setSchedule={setSchedule}
          exportToExcel={exportToExcel}
          counts={counts}
        />
      )}
    </div>
  );
}

/* --- HEADER --- */
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
        <button
          onClick={() => setTab("schedule")}
          style={tabBtn(tab === "schedule")}
        >
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

/* --- ROSTER TAB --- */
function RosterTab({ employees, setEmployees }) {
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");

  const handlePasteRoster = () => {
    const lines = pasteText.split("\n").map((l) => l.trim()).filter(Boolean);
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

      <table
        style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}
      >
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
                <td key={i}>
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
              width: 400,
            }}
          >
            <h3>Paste Roster (comma/tab separated)</h3>
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

/* --- SCHEDULE TAB --- */
function ScheduleTab({
  includeSaturday,
  setIncludeSaturday,
  activeDays,
  positionNeeds,
  handleNeedChange,
  generateSchedule,
  resetSchedule,
  generatedOnce,
  schedule,
  setSchedule,
  exportToExcel,
  counts,
}) {
  const onDragEnd = (result) => {
    const { source, destination } = result;
    if (!destination) return;
    const s = parseDid(source.droppableId);
    const d = parseDid(destination.droppableId);
    const next = JSON.parse(JSON.stringify(schedule));
    const [moved] = next[s.pos][s.day].splice(source.index, 1);
    if (!moved) return;
    next[d.pos][d.day].splice(destination.index, 0, moved);
    setSchedule(next);
  };

  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={includeSaturday}
            onChange={(e) => setIncludeSaturday(e.target.checked)}
          />
          <span style={{ fontWeight: 700, color: BB_BLUE }}>
            Include Saturday
          </span>
        </label>
        <div style={{ display: "flex", gap: 10 }}>
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
            Reset
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

      <h3 style={{ color: BB_BLUE }}>
        Set Position Needs ({includeSaturday ? "Mon–Sat" : "Mon–Fri"})
      </h3>
      {positionsList.map((pos) => (
        <div
          key={pos}
          style={{ display: "flex", alignItems: "center", marginBottom: 5 }}
        >
          <strong style={{ width: 150 }}>{pos}</strong>
          {activeDays.map((d) => (
            <input
              key={d}
              type="number"
              value={positionNeeds[pos]?.[d] || ""}
              onChange={(e) => handleNeedChange(pos, d, e.target.value)}
              style={{ width: 60, marginRight: 6 }}
            />
          ))}
        </div>
      ))}

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
              Weekly Schedule — Drag names to adjust
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
                    <th key={d}>{d}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {positionsList.map((pos) => (
                  <tr key={pos}>
                    <td>
                      <strong style={{ textTransform: "capitalize" }}>
                        {pos}
                      </strong>
                    </td>
                    {activeDays.map((day) => (
                      <td key={day}>
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
                                background: "#fff",
                              }}
                            >
                              {(schedule[pos]?.[day] || []).map((emp, idx) => (
                                <Draggable
                                  key={emp.id}
                                  draggableId={`${emp.id}-${pos}-${day}`}
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
                              ))}
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
        </div>
      )}

      {/* history / chart section */}
      <div style={{ marginTop: 30 }}>
        <h3 style={{ color: BB_BLUE }}>
          Position History (per week, per position)
        </h3>
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              borderCollapse: "collapse",
              minWidth: 600,
              background: "#fff",
            }}
          >
            <thead>
              <tr>
                <th style={{ border: `1px solid ${LIGHT_BORDER}`, padding: 6 }}>
                  Employee
                </th>
                {positionsList.map((pos) => (
                  <th
                    key={pos}
                    style={{ border: `1px solid ${LIGHT_BORDER}`, padding: 6 }}
                  >
                    {pos}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.keys(counts)
                .sort()
                .map((name) => (
                  <tr key={name}>
                    <td
                      style={{
                        border: `1px solid ${LIGHT_BORDER}`,
                        padding: 6,
                        fontWeight: 600,
                      }}
                    >
                      {name}
                    </td>
                    {positionsList.map((pos) => (
                      <td
                        key={pos}
                        style={{
                          border: `1px solid ${LIGHT_BORDER}`,
                          padding: 6,
                          textAlign: "center",
                        }}
                      >
                        {counts[name][pos] || 0}
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
