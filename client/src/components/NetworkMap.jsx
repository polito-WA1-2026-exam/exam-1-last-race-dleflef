import { useMemo } from 'react';

// Fixed pixel coordinates are assigned to each of the twelve stations in the network.
// All segments are drawn strictly horizontally or vertically.
//
//   y=110  Piazza, Crocevia, PortaVelaria, Centrale              Giardino, Punta
//                                              |                      |
//   y=270                             FontanaOscura, Torre, Campo, Cala
//                                              |            |
//   y=420                             BorgoSereno, VialeDeiMosaici
//
// Red    (y=110, left to right)  Piazza, Crocevia, Porta Velaria, Centrale
// Blue   (x=520, top to bottom, then right)  Centrale, Fontana Oscura, Borgo Sereno, Viale
// Green  (y=270, left to right)  Fontana Oscura, Torre, Campo, Cala
// Yellow (x=660, bottom to top, then right)  Viale, Torre, Giardino, Punta
//
// Interchange stations:
//   Centrale (Red + Blue), Fontana Oscura (Blue + Green),
//   Torre Cinerea (Green + Yellow), Viale dei Mosaici (Blue + Yellow)

const POSITIONS = {
  'Piazza delle Lanterne':  { x: 100, y: 110, labelAbove: true  },
  'Crocevia del Falco':     { x: 240, y: 110, labelAbove: true  },
  'Porta Velaria':          { x: 380, y: 110, labelAbove: true  },
  'Centrale':               { x: 520, y: 110, labelAbove: true  },
  'Fontana Oscura':         { x: 520, y: 270, labelAbove: true  },
  'Borgo Sereno':           { x: 520, y: 420, labelAbove: false },
  'Viale dei Mosaici':      { x: 660, y: 420, labelAbove: false },
  'Giardino dei Cipressi':  { x: 660, y: 110, labelAbove: false },
  'Torre Cinerea':          { x: 660, y: 270, labelAbove: false },
  'Punta di Sale':          { x: 820, y: 110, labelAbove: false },
  "Campo dell'Eco":         { x: 800, y: 270, labelAbove: true  },
  'Cala Serena':            { x: 920, y: 270, labelAbove: false },
};

export default function NetworkMap({
  lines = [],
  stations = [],
  segments = [],
  showLines = true,
  startStationId = null,
  endStationId = null,
  tailStationId = null,
  routeStationIds = [],
}) {
  const interchangeIds = useMemo(() => {
    const lineCount = {};
    for (const line of lines) {
      for (const s of line.stations) {
        lineCount[s.id] = (lineCount[s.id] ?? 0) + 1;
      }
    }
    return new Set(
      Object.entries(lineCount)
        .filter(([, c]) => c > 1)
        .map(([id]) => Number(id))
    );
  }, [lines]);

  function stationFill(station) {
    if (station.id === startStationId) return '#28a745';
    if (station.id === endStationId)   return '#dc3545';
    if (station.id === tailStationId)  return '#0dcaf0';
    if (routeStationIds.includes(station.id)) return '#ffc107';
    return '#c8d8e8';
  }

  return (
    <svg
      viewBox="0 0 1010 520"
      style={{ width: '100%', background: '#0a1628', borderRadius: '8px', display: 'block' }}
      aria-label="Metro network map"
    >
      {/* Coloured line segments, shown during the setup phase only */}
      {showLines && segments.map(seg => {
        const p1 = POSITIONS[seg.station1_name];
        const p2 = POSITIONS[seg.station2_name];
        if (!p1 || !p2) return null;
        return (
          <line
            key={`line-${seg.station1_id}-${seg.station2_id}-${seg.line_id}`}
            x1={p1.x} y1={p1.y}
            x2={p2.x} y2={p2.y}
            stroke={seg.line_color}
            strokeWidth="7"
            strokeLinecap="round"
            opacity="0.9"
          />
        );
      })}

      {/* Station nodes */}
      {stations.map(station => {
        const pos = POSITIONS[station.name];
        if (!pos) return null;
        const isInterchange = showLines && interchangeIds.has(station.id);
        const r = isInterchange ? 10 : 7;
        const fill = stationFill(station);
        const labelY = pos.labelAbove ? pos.y - 14 : pos.y + 20;

        return (
          <g key={station.id}>
            {isInterchange && (
              <circle
                cx={pos.x} cy={pos.y}
                r={r + 5}
                fill="none"
                stroke="#ffffff"
                strokeWidth="1.5"
                opacity="0.35"
              />
            )}
            {station.id === tailStationId && (
              <circle
                cx={pos.x} cy={pos.y}
                r={r + 9}
                fill="none"
                stroke="#0dcaf0"
                strokeWidth="2"
                opacity="0.7"
                strokeDasharray="4 3"
              />
            )}
            <circle
              cx={pos.x} cy={pos.y}
              r={r}
              fill={fill}
              stroke="#ffffff"
              strokeWidth="2"
            />
            <text
              x={pos.x}
              y={labelY}
              textAnchor="middle"
              fill="#dce8f4"
              fontSize="10"
              fontFamily="system-ui, sans-serif"
            >
              {station.name}
            </text>
          </g>
        );
      })}

      {/* Line colour legend, shown during the setup phase only */}
      {showLines && lines.map((line, i) => (
        <g key={line.id}>
          <rect x={12} y={12 + i * 22} width={18} height={7} rx="3" fill={line.color} />
          <text
            x={36} y={12 + i * 22 + 6}
            fill="#c8d8e8"
            fontSize="11"
            fontFamily="system-ui, sans-serif"
            dominantBaseline="middle"
          >
            {line.name}
          </text>
        </g>
      ))}

      {/* Station colour legend shown during the planning phase */}
      {!showLines && (
        <g>
          {[
            { fill: '#28a745', label: 'Start' },
            { fill: '#dc3545', label: 'Destination' },
            { fill: '#0dcaf0', label: 'Route tail' },
            { fill: '#ffc107', label: 'In route' },
            { fill: '#c8d8e8', label: 'Station' },
          ].map(({ fill, label }, i) => (
            <g key={label}>
              <circle cx={22} cy={16 + i * 22} r={6} fill={fill} stroke="#fff" strokeWidth="1.5" />
              <text x={34} y={16 + i * 22} fill="#c8d8e8" fontSize="11" fontFamily="system-ui, sans-serif" dominantBaseline="middle">
                {label}
              </text>
            </g>
          ))}
        </g>
      )}
    </svg>
  );
}
