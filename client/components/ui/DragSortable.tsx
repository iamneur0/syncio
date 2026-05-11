'use client';

import { ReactNode, useState, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { motion } from 'framer-motion';

export {
  useSortable,
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';

export { closestCenter, DndContext, DragOverlay } from '@dnd-kit/core';
export { CSS } from '@dnd-kit/utilities';

export function useSortableSensors() {
  return useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 0, distance: 0 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
}

export function useSortableDragState(id: string) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? 'none' : transition,
    zIndex: isDragging ? 100 : undefined,
    isolation: 'isolate',
  };

  const dragHandleProps = {
    ...attributes,
    ...listeners,
    style: { touchAction: 'none' } as React.CSSProperties,
    className: 'cursor-grab active:cursor-grabbing p-1 rounded hover:bg-surface-hover',
  };

  return {
    dragHandleProps,
    itemProps: {
      ref: setNodeRef,
      style,
      className: isDragging ? 'shadow-lg ring-2 ring-primary' : '',
    },
    isDragging,
  };
}

interface SortableItemRenderProps {
  id: string;
  dragHandleProps: Record<string, unknown>;
  itemProps: {
    ref: React.RefCallback<HTMLElement>;
    style: React.CSSProperties;
    className: string;
  };
  isDragging: boolean;
}

interface DraggableListProps {
  items: string[];
  renderItem: (props: SortableItemRenderProps) => ReactNode;
  onDragEnd?: (event: DragEndEvent) => void;
}

function SortableItem({
  id,
  renderItem,
}: {
  id: string;
  renderItem: (props: SortableItemRenderProps) => ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? 'none' : transition,
    zIndex: isDragging ? 100 : undefined,
    opacity: isDragging ? 0 : 1,
  };

  const dragHandleProps = {
    ...attributes,
    ...listeners,
    style: { touchAction: 'none' } as React.CSSProperties,
    className: 'cursor-grab active:cursor-grabbing p-1 rounded hover:bg-surface-hover',
  };

  const itemProps = {
    ref: setNodeRef,
    style,
    className: isDragging ? 'shadow-lg ring-2 ring-primary' : '',
  };

  return renderItem({ id, dragHandleProps, itemProps, isDragging });
}

export function DraggableList({
  items,
  renderItem,
  onDragEnd,
}: DraggableListProps) {
  const sensors = useSortableSensors();
  const [activeId, setActiveId] = useState<string | null>(null);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveId(null);
    onDragEnd?.(event);
  }, [onDragEnd]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        <div className="space-y-3" style={{ touchAction: 'none', userSelect: 'none' }}>
          {items.map((id) => (
            <SortableItem key={id} id={id} renderItem={renderItem} />
          ))}
        </div>
      </SortableContext>
      <DragOverlay>
        {activeId ? renderItem({
          id: activeId,
          dragHandleProps: { style: { touchAction: 'none' } } as any,
          itemProps: { ref: () => { }, style: { transform: 'none', transition: 'none' }, className: '' },
          isDragging: true,
        }) : null}
      </DragOverlay>
    </DndContext>
  );
}
