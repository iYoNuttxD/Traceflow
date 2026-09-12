import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath } from '@xyflow/react';
export function GraphEdge(props) {
  const { id, sourceX, sourceY, targetX, targetY, data, label, markerEnd, style } = props;
  const section = data?.sections?.[0];
  const routed = section && !data.manual;
  const points = routed
    ? [section.startPoint, ...(section.bendPoints || []), section.endPoint]
    : null;
  const fallback = getSmoothStepPath({ ...props, borderRadius: 10 });
  const path = points
    ? points.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ')
    : fallback[0];
  // Put context on the middle of a segment, never on a bend next to a card.
  const segment = points
    ?.slice(1)
    .map((p, i) => ({
      a: points[i],
      b: p,
      length: Math.abs(p.x - points[i].x) + Math.abs(p.y - points[i].y)
    }))
    .sort((a, b) => b.length - a.length)[0];
  const midpoint = segment && {
    x: (segment.a.x + segment.b.x) / 2,
    y: (segment.a.y + segment.b.y) / 2
  };
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
      {label && (
        <EdgeLabelRenderer>
          <span
            className="trace-edge-label nodrag nopan"
            style={{
              transform: `translate(-50%, -50%) translate(${midpoint?.x ?? (sourceX + targetX) / 2}px,${midpoint?.y ?? (sourceY + targetY) / 2}px)`
            }}
          >
            {label}
          </span>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
