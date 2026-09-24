import { useCallback, useEffect, useRef } from 'react';

const dialogLayers = [];

export function escapeBelongsToExpandedControl(event) {
  return event.target?.matches?.('[role="combobox"][aria-expanded="true"]') || false;
}

export function useDialogLayer(open = true) {
  const tokenRef = useRef(null);
  if (!tokenRef.current) tokenRef.current = Symbol('dialog-layer');

  useEffect(() => {
    if (!open) return undefined;
    const token = tokenRef.current;
    dialogLayers.push(token);
    return () => {
      const index = dialogLayers.lastIndexOf(token);
      if (index !== -1) dialogLayers.splice(index, 1);
    };
  }, [open]);

  return useCallback(() => dialogLayers.at(-1) === tokenRef.current, []);
}
