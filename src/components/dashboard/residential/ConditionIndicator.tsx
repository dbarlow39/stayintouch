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

const segments = [
  { label: "Fair", color: "#EF4444", lightColor: "#FCA5A5" },
  { label: "Below\nAverage", color: "#F97316", lightColor: "#FDBA74" },
  { label: "Average", color: "#EAB308", lightColor: "#FDE047" },
  { label: "Above\nAverage", color: "#16A34A", lightColor: "#86EFAC" },
  { label: "Excellent", color: "#22C55E", lightColor: "#BBF7D0" },
];

const labelMap: Record<string, number> = {
  "Fair": 0,
  "Below Average": 1,
  "Average": 2,
  "Above Average": 3,
  "Excellent": 4,
};

const ConditionIndicator = ({ conditionLabel }: ConditionIndicatorProps) => {
  const activeIndex = useMemo(() => {
    return labelMap[conditionLabel] ?? -1;
  }, [conditionLabel]);

  // Gauge geometry
  const cx = 200;
  const cy = 180;
  const outerR = 140;
  const innerR = 80;
  const startAngle = Math.PI; // left (180°)
  const totalSweep = Math.PI; // semicircle
  const segCount = segments.length;
  const gap = 0.03; // small gap between segments in radians

  // Build arc paths
  const arcPaths = useMemo(() => {
    return segments.map((seg, i) => {
      const segSweep = totalSweep / segCount;
      const a1 = startAngle + i * segSweep + gap / 2;
      const a2 = startAngle + (i + 1) * segSweep - gap / 2;

      const outerStart = { x: cx + outerR * Math.cos(a1), y: cy + outerR * Math.sin(a1) };
      const outerEnd = { x: cx + outerR * Math.cos(a2), y: cy + outerR * Math.sin(a2) };
      const innerStart = { x: cx + innerR * Math.cos(a2), y: cy + innerR * Math.sin(a2) };
      const innerEnd = { x: cx + innerR * Math.cos(a1), y: cy + innerR * Math.sin(a1) };

      const path = [
        `M ${outerStart.x} ${outerStart.y}`,
        `A ${outerR} ${outerR} 0 0 1 ${outerEnd.x} ${outerEnd.y}`,
        `L ${innerStart.x} ${innerStart.y}`,
        `A ${innerR} ${innerR} 0 0 0 ${innerEnd.x} ${innerEnd.y}`,
        `Z`,
      ].join(" ");

      // Label position at midpoint of segment
      const midAngle = (a1 + a2) / 2;
      const labelR = (outerR + innerR) / 2;
      const labelX = cx + labelR * Math.cos(midAngle);
      const labelY = cy + labelR * Math.sin(midAngle);

      return { path, seg, labelX, labelY, midAngle };
    });
  }, []);

  // Needle angle: maps activeIndex to angle within the semicircle
  const needleAngle = useMemo(() => {
    if (activeIndex < 0) return startAngle + totalSweep / 2; // center default
    const segSweep = totalSweep / segCount;
    return startAngle + (activeIndex + 0.5) * segSweep;
  }, [activeIndex]);

  const needleLength = innerR - 12;
  const needleTipX = cx + needleLength * Math.cos(needleAngle);
  const needleTipY = cy + needleLength * Math.sin(needleAngle);

  // Needle base width
  const baseOffset = 8;
  const perpAngle = needleAngle + Math.PI / 2;
  const baseLeft = {
    x: cx + baseOffset * Math.cos(perpAngle),
    y: cy + baseOffset * Math.sin(perpAngle),
  };
  const baseRight = {
    x: cx - baseOffset * Math.cos(perpAngle),
    y: cy - baseOffset * Math.sin(perpAngle),
  };

  return (
    <div className="w-full flex justify-center my-2">
      <svg
        viewBox="0 0 400 220"
        className="w-full max-w-xs"
        role="img"
        aria-label={`Condition gauge: ${conditionLabel}`}
      >
        {/* Segments */}
        {arcPaths.map(({ path, seg, labelX, labelY }, i) => {
          const isActive = i === activeIndex;
          return (
            <g key={i}>
              <path
                d={path}
                fill={isActive ? seg.color : seg.lightColor}
                stroke="white"
                strokeWidth={1}
                opacity={activeIndex === -1 ? 0.6 : isActive ? 1 : 0.5}
                style={{ transition: "all 0.4s ease" }}
              />
              {/* Label inside segment */}
              <text
                x={labelX}
                y={labelY}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="10"
                fontWeight={isActive ? "700" : "500"}
                fill={isActive ? "white" : "#555"}
                style={{ transition: "all 0.3s ease" }}
              >
                {seg.label.split("\n").map((line, li) => (
                  <tspan key={li} x={labelX} dy={li === 0 ? "-5" : "12"}>
                    {line}
                  </tspan>
                ))}
              </text>
            </g>
          );
        })}

        {/* Needle */}
        {activeIndex >= 0 && (
          <g style={{ transition: "all 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)" }}>
            <polygon
              points={`${needleTipX},${needleTipY} ${baseLeft.x},${baseLeft.y} ${baseRight.x},${baseRight.y}`}
              fill="#374151"
              stroke="#1F2937"
              strokeWidth={1}
              style={{
                filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.3))",
              }}
            />
            {/* Center circle */}
            <circle cx={cx} cy={cy} r={12} fill="#374151" stroke="#1F2937" strokeWidth={2} />
            <circle cx={cx} cy={cy} r={6} fill="#6B7280" />
          </g>
        )}

        {/* Bottom label */}
        {activeIndex >= 0 && (
          <text
            x={cx}
            y={cy + 30}
            textAnchor="middle"
            fontSize="14"
            fontWeight="700"
            fill={segments[activeIndex]?.color || "#6B7280"}
            style={{ transition: "all 0.3s ease" }}
          >
            {conditionLabel}
          </text>
        )}
        {activeIndex < 0 && (
          <text
            x={cx}
            y={cy + 30}
            textAnchor="middle"
            fontSize="13"
            fill="#9CA3AF"
          >
            Not Rated
          </text>
        )}
      </svg>
    </div>
  );
};

export default ConditionIndicator;
