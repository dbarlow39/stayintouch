import { useMemo } from "react";

export const getConditionLevel = (avg: number) => {
  if (avg >= 4.5) return { label: "Excellent", adjustment: "+10%", color: "text-green-600 dark:text-green-400" };
  if (avg >= 3.5) return { label: "Above Average", adjustment: "+5%", color: "text-emerald-600 dark:text-emerald-400" };
  if (avg >= 2.5) return { label: "Average", adjustment: "0%", color: "text-yellow-600 dark:text-yellow-400" };
  if (avg >= 1.5) return { label: "Below Average", adjustment: "-5%", color: "text-orange-600 dark:text-orange-400" };
  if (avg > 0) return { label: "Fair", adjustment: "-10% to -15%", color: "text-destructive" };
  return { label: "Not Rated", adjustment: "N/A", color: "text-muted-foreground" };
};

interface ConditionIndicatorProps {
  conditionLabel: string;
}

const levels = [
  { label: "Fair", color: "#EF4444", starFill: "#EF4444", starStroke: "#B91C1C" },
  { label: "Below Average", color: "#F97316", starFill: "#F97316", starStroke: "#C2410C" },
  { label: "Average", color: "#EAB308", starFill: "#EAB308", starStroke: "#A16207" },
  { label: "Above Average", color: "#16A34A", starFill: "#16A34A", starStroke: "#15803D" },
  { label: "Excellent", color: "#84CC16", starFill: "#84CC16", starStroke: "#65A30D" },
];

const starPath = (cx: number, cy: number, outerR: number, innerR: number) => {
  const points: string[] = [];
  for (let i = 0; i < 10; i++) {
    const angle = (Math.PI / 2) * -1 + (Math.PI / 5) * i;
    const r = i % 2 === 0 ? outerR : innerR;
    points.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
  }
  return `M${points.join("L")}Z`;
};

const ConditionIndicator = ({ conditionLabel }: ConditionIndicatorProps) => {
  const activeIndex = useMemo(() => {
    const idx = levels.findIndex((l) => l.label === conditionLabel);
    return idx >= 0 ? idx : -1;
  }, [conditionLabel]);

  const starSize = 36;
  const spacing = 90;
  const startX = 60;
  const starY = 55;
  const svgWidth = startX * 2 + spacing * 4;
  const svgHeight = 150;

  return (
    <div className="w-full flex justify-center">
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="w-full max-w-md"
        role="img"
        aria-label={`Condition rating: ${conditionLabel}`}
      >
        {/* Stars */}
        {levels.map((level, i) => {
          const cx = startX + i * spacing;
          const isActive = i === activeIndex;
          const scale = isActive ? 1.2 : 0.85;
          const opacity = activeIndex === -1 ? 0.5 : isActive ? 1 : 0.4;

          return (
            <g key={level.label}>
              {/* Glow behind active star */}
              {isActive && (
                <circle
                  cx={cx}
                  cy={starY}
                  r={starSize + 4}
                  fill={level.color}
                  opacity={0.2}
                  className="animate-pulse"
                />
              )}
              <path
                d={starPath(cx, starY, starSize * scale, starSize * scale * 0.4)}
                fill={level.starFill}
                stroke={level.starStroke}
                strokeWidth={isActive ? 2 : 1.5}
                opacity={opacity}
                style={{
                  transition: "all 0.4s ease-in-out",
                  filter: isActive ? `drop-shadow(0 2px 6px ${level.color}66)` : "none",
                }}
              />
              {/* Label */}
              <text
                x={cx}
                y={starY + starSize + 18}
                textAnchor="middle"
                fontSize="9"
                fontWeight={isActive ? "700" : "500"}
                fill={isActive ? level.color : "#9CA3AF"}
                style={{ transition: "all 0.3s ease" }}
              >
                {level.label.includes(" ") ? (
                  <>
                    <tspan x={cx} dy="0">{level.label.split(" ")[0]}</tspan>
                    <tspan x={cx} dy="11">{level.label.split(" ").slice(1).join(" ")}</tspan>
                  </>
                ) : (
                  level.label
                )}
              </text>
            </g>
          );
        })}

        {/* Arrow indicator */}
        {activeIndex >= 0 && (
          <g
            style={{
              transform: `translateX(${startX + activeIndex * spacing}px)`,
              transition: "transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
            }}
          >
            <polygon
              points="0,30 -10,46 -4,46 -4,58 4,58 4,46 10,46"
              fill="white"
              stroke="#374151"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </g>
        )}
      </svg>
    </div>
  );
};

export default ConditionIndicator;
