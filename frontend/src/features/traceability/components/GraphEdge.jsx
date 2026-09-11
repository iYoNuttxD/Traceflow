import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath } from '@xyflow/react';
export function GraphEdge(props) {
  const {
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    label,
    markerEnd,
    id
  } = props;
  const long = Math.abs(targetY - sourceY) > 420 || targetY < sourceY;
  const [normal, normalX, normalY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition
  });
  const lane = data?.laneX || Math.max(sourceX, targetX) + 220;
  const path = long
    ? `M ${sourceX} ${sourceY} L ${sourceX} ${sourceY + 24} L ${lane} ${sourceY + 24} L ${lane} ${targetY - 24} L ${targetX} ${targetY - 24} L ${targetX} ${targetY}`
    : normal;
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} />
      {label && (
        <EdgeLabelRenderer>
          <span
            className="trace-edge-label nodrag nopan"
            style={{
              transform: `translate(-50%, -50%) translate(${long ? lane : normalX}px,${long ? (sourceY + targetY) / 2 : normalY}px)`
            }}
          >
            {label}
          </span>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
