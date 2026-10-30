import React, { useEffect, useMemo, useState } from "react";
import { useScrollTopOnScreenChange } from "../utils/pageScroll";
import { useGameStore } from "../store/gameStore";
import { collegeActionCost } from "../sim/coachPoints";
import { Player, Team } from "../types/game";
import { PlayerRow } from "./ui/PlayerRow";
import { playerRowProps } from "./ui/playerRowProps";
import { CollegeDirectory } from "./CollegeDirectory";
import { collegeWithConference } from "../data/colleges";
import {
  CAMP_WEEKS,
  COLLEGE_ACTION_COSTS,
  CollegeAction,
  TIER_LABELS,
  baselineVisibility,
  collegeActionBlocker,
  homeStateOf,
  isDivisionOne,
  recruitScore,
  recruitingStatus,
  sortedOffers,
} from "../sim/collegeRecruitingEngine";
import { rulesForState } from "../sim/stateRules";

const ACTIONS: {
  action: CollegeAction;
  label: string;
  color: string;
  help: string;
}[] = [
  {
    action: "FILM",
    label: "Send Film",
    color: "#2563EB",
    help: "Send a highlight film to college staffs: +15 exposure, once a year.",
  },
  {
    action: "CALL",
    label: "Call Coaches",
    color: "#7C3AED",
    help: "Call college coaches on his behalf: more exposure (less each call) and an immediate look.",
  },
  {
    action: "CAMP",
    label: "Take to Camp",
    color: "#B45309",
    help: `Take him to a summer camp (weeks 1-${CAMP_WEEKS}): +20 exposure, a chance to impress evaluators, and an immediate look.`,
  },
];

/** Star rating first (specialists are capped), then evaluation. */
const byStock = (a: Player, b: Player) =>
  b.recruiting.starRating - a.recruiting.starRating ||
  recruitScore(b) - recruitScore(a);


type Stage = "NO_OFFERS" | "UNCOMMITTED" | "COMMITTED";
/** Where a recruit stands: committed (or signed), offers but still choosing, or no offer yet. */
const stageOf = (p: Player): Stage =>
  p.recruiting.committedCollege
    ? "COMMITTED"
    : p.recruiting.offers.length > 0
      ? "UNCOMMITTED"
      : "NO_OFFERS";
const STAGES: [Stage | "ALL" | "MY_LIST", string][] = [
  ["ALL", "All"],
  ["NO_OFFERS", "No offers"],
  ["UNCOMMITTED", "Uncommitted"],
  ["COMMITTED", "Committed"],
  ["MY_LIST", "My List"],
];
const STAGE_EMPTY: Record<Stage, string> = {
  NO_OFFERS: "Every junior and senior has at least one offer.",
  UNCOMMITTED: "Every player with an offer has committed.",
  COMMITTED: "Nobody has committed yet.",
};
/** Before any offers come in, Uncommitted is empty because nobody has an offer yet: say that instead. */
const NO_OFFERS_YET =
  "None of your juniors or seniors has a college offer yet.";

/** College recruiting for the coach's juniors and seniors. `focusPlayerId` (from a player card) opens on that player. */
export const CollegeRecruitingView: React.FC<{
  focusPlayerId?: string | null;
}> = ({ focusPlayerId }) => {
  const {
    leagueTeams,
    userTeamId,
    coachPoints,
    currentWeek,
    currentYear,
    collegeRecruitAction,
  } = useGameStore();
  const [message, setMessage] = useState<{
    text: string;
    good: boolean;
  } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(
    focusPlayerId ?? null,
  );
  // Recruiting (your players and the state's top seniors) or the college directory
  const [mode, setMode] = useState<"RECRUITING" | "COLLEGES">("RECRUITING");
  // Your players by where they stand: no offer yet, offers but still choosing, or committed (signed included)
  const [stage, setStage] = useState<Stage | "ALL" | "MY_LIST">("ALL");
  // The coach's list (shared with Prospects): players he wants to follow
  const shortlist = useGameStore((s) => s.shortlist);
  const toggleShortlist = useGameStore((s) => s.toggleShortlist);
  const listed = new Set(shortlist);
  const inStage = (p: Player, id: Stage | "ALL" | "MY_LIST") =>
    id === "ALL"
      ? true
      : id === "MY_LIST"
        ? listed.has(p.id)
        : stageOf(p) === id;
  useScrollTopOnScreenChange(mode);
  // Arriving from a player card: show his row, open
  useEffect(() => {
    if (!focusPlayerId) return;
    setExpanded(focusPlayerId);
    document
      .getElementById(`recruit-${focusPlayerId}`)
      ?.scrollIntoView({ block: "start" });
  }, [focusPlayerId]);
  const userTeam = leagueTeams.find((t) => t.id === userTeamId);

  const recruits = useMemo(
    () =>
      // leagueTeams is replaced after every action, so the list refreshes with it
      (leagueTeams.find((t) => t.id === userTeamId)?.roster ?? [])
        .filter((p) => p.classYear === "Senior" || p.classYear === "Junior")
        .sort(byStock),
    [leagueTeams, userTeamId],
  );

  const statewide = useMemo(
    () =>
      leagueTeams
        .flatMap((team) =>
          team.roster
            .filter((p) => p.classYear === "Senior")
            .map((player) => ({ player, team })),
        )
        .sort((a, b) => byStock(a.player, b.player))
        .slice(0, 25),
    [leagueTeams],
  );

  if (!userTeam) return null;

  const committed = recruits.filter(
    (p) => p.recruiting.committedCollege,
  ).length;
  const d1Offers = recruits.filter((p) =>
    p.recruiting.offers.some((o) => isDivisionOne(o.tier)),
  ).length;

  // The recruiting sections scroll into view (switching back from the college directory first)
  const goTo = (id: string) => {
    setMode("RECRUITING");
    setTimeout(() => document.getElementById(id)?.scrollIntoView(), 0);
  };

  const act = (player: Player, action: CollegeAction) => {
    const result = collegeRecruitAction(player.id, action);
    setMessage({ text: result.message, good: result.ok });
  };

  return (
    <div className="ui-screen">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: "12px",
          marginBottom: "12px",
        }}
      >
        <div>
          <p
            style={{
              margin: "4px 0 0 0",
              fontSize: "13px",
              color: "#64748B",
              maxWidth: "640px",
            }}
          >
            Colleges evaluate juniors and seniors all season: rating, potential,
            production and position all matter. Your job is to get your players
            seen. Seniors commit during the year (better offers can flip them)
            and sign at the banquet.
          </p>
        </div>
        <div
          style={{
            display: "flex",
            gap: "8px",
            fontSize: "13px",
            fontWeight: "bold",
            flexWrap: "wrap",
          }}
        >
          <span style={pill("#EEF2FF", "#3730A3")}>₡{coachPoints}</span>
          <span style={pill("#ECFDF5", "#065F46")}>Committed: {committed}</span>
          <span style={pill("#EFF6FF", "#1E40AF")}>
            With D-I offers: {d1Offers}
          </span>
          <span
            style={pill(
              currentWeek <= CAMP_WEEKS ? "#FEF3C7" : "#F1F5F9",
              currentWeek <= CAMP_WEEKS ? "#92400E" : "#475569",
            )}
          >
            {currentWeek <= CAMP_WEEKS
              ? `Camp season (through week ${CAMP_WEEKS})`
              : "Camps closed"}
          </span>
        </div>
      </div>

      {message && (
        <div
          style={{
            background: message.good ? "#ECFDF5" : "#FEF2F2",
            border: `1px solid ${message.good ? "#A7F3D0" : "#FECACA"}`,
            color: message.good ? "#065F46" : "#991B1B",
            padding: "8px 12px",
            borderRadius: "6px",
            fontSize: "13px",
            marginBottom: "12px",
          }}
        >
          {message.text}
        </div>
      )}

      <div
        className="ui-sticky-nav"
        style={{ margin: "0 -16px 10px", padding: "8px 16px" }}
      >
        <div
          className="ui-chip-row ui-chip-row-3"
          role="navigation"
          aria-label="College sections"
        >
          <button
            className="ui-chip"
            aria-pressed={mode === "RECRUITING"}
            onClick={() => goTo("college-mine")}
          >
            Your players ({recruits.length})
          </button>
          <button className="ui-chip" onClick={() => goTo("college-state")}>
            State seniors
          </button>
          <button
            className="ui-chip"
            aria-pressed={mode === "COLLEGES"}
            onClick={() => setMode("COLLEGES")}
          >
            Colleges
          </button>
        </div>
      </div>
      {mode === "COLLEGES" ? (
        <CollegeDirectory />
      ) : (
        <>
          <div
            id="college-mine"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              scrollMarginTop: "calc(var(--topbar-h) + 64px)",
            }}
          >
            <div
              className="ui-chip-row"
              role="group"
              aria-label="Show players"
              style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}
            >
              {STAGES.map(([id, label]) => (
                <button
                  key={id}
                  className="ui-chip"
                  aria-pressed={stage === id}
                  onClick={() => setStage(id)}
                  style={
                    id === "MY_LIST" ? { gridColumn: "1 / -1" } : undefined
                  }
                >
                  {label} ({recruits.filter((p) => inStage(p, id)).length})
                </button>
              ))}
            </div>
            {recruits
              .filter((p) => inStage(p, stage))
              .map((p) => (
                <RecruitRow
                  key={p.id}
                  player={p}
                  team={userTeam}
                  week={currentWeek}
                  year={currentYear}
                  coachPoints={coachPoints}
                  expanded={expanded === p.id}
                  onToggle={() => setExpanded(expanded === p.id ? null : p.id)}
                  onAction={(a) => act(p, a)}
                  onList={listed.has(p.id)}
                  onToggleList={() => toggleShortlist(p.id)}
                />
              ))}
            {recruits.length === 0 && (
              <div style={{ color: "#64748B", fontSize: "13px" }}>
                No juniors or seniors on the roster.
              </div>
            )}
            {recruits.length > 0 &&
              stage !== "ALL" &&
              !recruits.some((p) => inStage(p, stage)) && (
                <div style={{ color: "#64748B", fontSize: "13px" }}>
                  {stage === "MY_LIST"
                    ? 'Your list is empty. Tap "+ Add to List" on a player to follow him here.'
                    : stage === "UNCOMMITTED" &&
                        recruits.every((p) => stageOf(p) === "NO_OFFERS")
                      ? NO_OFFERS_YET
                      : STAGE_EMPTY[stage]}
                </div>
              )}
          </div>

          <h3
            id="college-state"
            style={{
              margin: "24px 0 6px 0",
              scrollMarginTop: "calc(var(--topbar-h) + 64px)",
            }}
          >
            Top Senior Recruits in the State
          </h3>
          <div className="pl-list">
            {statewide.map((r, i) => {
              const status = recruitingStatus(r.player);
              const mine = r.team.id === userTeamId;
              return (
                <PlayerRow
                  key={r.player.id}
                  {...playerRowProps(r.player, { own: mine, noString: true, noPotential: true, extra: [r.team.name] })}
                  trouble={null}
                  rank={i + 1}
                  tone={mine ? "mine" : undefined}
                  right={
                    <span style={{ color: status.color, fontWeight: "bold", fontSize: "12.5px", maxWidth: "120px" }}>
                      {status.label}
                    </span>
                  }
                />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

const RecruitRow: React.FC<{
  player: Player;
  team: Team;
  week: number;
  year: number;
  coachPoints: number;
  expanded: boolean;
  onToggle: () => void;
  onAction: (action: CollegeAction) => void;
  onList: boolean; // on the coach's list
  onToggleList: () => void;
}> = ({
  player: p,
  team,
  week,
  year,
  coachPoints,
  expanded,
  onToggle,
  onAction,
  onList,
  onToggleList,
}) => {
  const coachTalents = useGameStore((s) => s.coachTalents);
  const r = p.recruiting;
  const status = recruitingStatus(p);
  const exposure = Math.round(r.visibility ?? baselineVisibility(team));
  const offers = sortedOffers(p, year, homeStateOf(team));
  const top = offers[0];
  return (
    <div
      id={`recruit-${p.id}`}
      style={{
        background: "#fff",
        border: "1px solid #E2E8F0",
        borderRadius: "8px",
        padding: "10px 12px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "8px",
        }}
      >
        <div style={{ minWidth: "220px", flex: "1 1 220px" }}>
          {/* The button stays on the name's line; the name and its details wrap instead */}
          <div
            style={{
              display: "flex",
              flexWrap: "nowrap",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: "8px",
            }}
          >
            <PlayerRow
              {...playerRowProps(p, {
                atRiskGpa: rulesForState(team.state).academics.atRiskGpa,
                noString: true,
                extra: [`GPA ${p.academics.gpa.toFixed(2)}`],
              })}
              className="pl-row-bare"
            />
            <button
              onClick={onToggleList}
              aria-pressed={onList}
              style={{
                flex: "0 0 auto",
                minHeight: "32px",
                padding: "4px 9px",
                borderRadius: "8px",
                border: "2px solid #2563EB",
                background: onList ? "#2563EB" : "#fff",
                color: onList ? "#fff" : "#1D4ED8",
                fontWeight: 800,
                fontSize: "12px",
                whiteSpace: "nowrap",
                cursor: "pointer",
              }}
            >
              {onList ? "✓ On List" : "+ Add to List"}
            </button>
          </div>
          <div style={{ fontSize: "12px" }}>
            <span
              style={{
                color: status.color,
                fontWeight: "bold",
              }}
            >
              {status.label}
            </span>
          </div>
        </div>
        <div style={{ fontSize: "12px", color: "#475569", minWidth: "140px" }}>
          Exposure {exposure}
          <div
            style={{
              height: "6px",
              background: "#E2E8F0",
              borderRadius: "3px",
              marginTop: "3px",
            }}
          >
            <div
              style={{
                width: `${exposure}%`,
                height: "100%",
                background: "#2563EB",
                borderRadius: "3px",
              }}
            />
          </div>
          {top && !r.committedCollege && (
            <div style={{ marginTop: "3px" }}>Top offer: {top.collegeName}</div>
          )}
        </div>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {ACTIONS.map(({ action, label, color, help }) => {
            const cost = collegeActionCost(
              COLLEGE_ACTION_COSTS[action],
              coachTalents,
            );
            const blocker =
              collegeActionBlocker(p, action, week, year) ??
              (coachPoints < cost ? "Not enough Coach Points" : null);
            return (
              <button
                key={action}
                onClick={() => onAction(action)}
                disabled={!!blocker}
                title={blocker ?? help}
                style={btn(color, !!blocker)}
              >
                {label} (₡{cost})
              </button>
            );
          })}
          {offers.length > 0 && (
            <button onClick={onToggle} style={btn("#475569", false)}>
              {expanded ? "Hide" : "Offers"}
            </button>
          )}
        </div>
      </div>
      {expanded && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "6px",
            marginTop: "8px",
          }}
        >
          {offers.map((o) => {
            const isCommit = o.collegeName === r.committedCollege;
            return (
              <span
                key={o.collegeName}
                style={{
                  fontSize: "12px",
                  padding: "3px 8px",
                  borderRadius: "4px",
                  background: isCommit ? "#DCFCE7" : "#EFF6FF",
                  color: isCommit ? "#166534" : "#1E40AF",
                  border: `1px solid ${isCommit ? "#86EFAC" : "#BFDBFE"}`,
                }}
              >
                {isCommit ? "✅ " : ""}
                {collegeWithConference(o.collegeName, o.collegeId)} ·{" "}
                {TIER_LABELS[o.tier]} · wk {o.offerDateWeek}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
};

const pill = (background: string, color: string): React.CSSProperties => ({
  background,
  color,
  padding: "5px 12px",
  borderRadius: "6px",
});
const btn = (color: string, disabled: boolean): React.CSSProperties => ({
  minHeight: "40px", // comfortable tap target
  padding: "8px 12px",
  background: disabled ? "#E2E8F0" : color,
  color: disabled ? "#475569" : "#fff",
  border: "none",
  borderRadius: "4px",
  cursor: disabled ? "default" : "pointer",
  fontSize: "12px",
  fontWeight: "bold",
});
