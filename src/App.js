import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";


const BB_BLUE = "#0046BE";
const BB_YELLOW = "#FFD100";
const LIGHT_BORDER = "#ddd";
const BASE_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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

export default function App() {
  const [tab, setTab] = useState("roster");
  const [employees, setEmployees] = useState([]);
  const [positionNeeds, setPositionNeeds] = useState({});
  const [schedule, setSchedule] = useState({});
  const [includeSaturday, setIncludeSaturday] = useState(false);
  const [generatedOnce, setGeneratedOnce] = useState(false);

  const activeDays = useMemo(
    () => (includeSaturday ? BASE_DAYS : BASE_DAYS.slice(0, 5)),
    [includeSaturday]
  );

  useEffect(() => {
    setEmployees(
      JSON.parse(localStorage.getItem("employees")) || initialEmployees
    );
    setPositionNeeds(JSON.parse(localStorage.getItem("positionNeeds")) || {});
    setSchedule(JSON.parse(localStorage.getItem("schedule")) || {});
    setIncludeSaturday(
      JSON.parse(localStorage.getItem("includeSaturday")) || false
    );
  }, []);

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

  const resetSchedule = () => {
    setSchedule({});
    localStorage.removeItem("schedule");
    setGeneratedOnce(false);
  };

  const generateSchedule = () => {
    const daysActive = activeDays;
    const next = {};
    for (const pos of positionsList) {
      next[pos] = {};
      for (const d of daysActive) next[pos][d] = [];
    }

    const lockedVAL = employees.filter((e) => e.lockToVAL);
    let pool = shuffle(employees.filter((e) => !e.lockToVAL));

    for (const e of lockedVAL) {
      for (const d of daysActive) next["VAL"][d].push(e);
    }

    const maxNeed = (pos) =>
      Math.max(...daysActive.map((d) => positionNeeds[pos]?.[d] || 0), 0);

    for (const pos of shuffle([...positionsList])) {
      if (pos === "VAL") continue;
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

    const openSlots = [];
    for (const pos of positionsList) {
      for (const d of daysActive) {
        const need = positionNeeds[pos]?.[d] || 0;
        const current = next[pos][d].length;
        if (current < need)
          openSlots.push({ pos, day: d, remaining: need - current });
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

    setSchedule(next);
    setGeneratedOnce(true);
    localStorage.setItem("schedule", JSON.stringify(next));
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
        <button
          onClick={() => setTab("roster")}
          style={tabBtn(tab === "roster")}
        >
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
    </div>
  );
}
