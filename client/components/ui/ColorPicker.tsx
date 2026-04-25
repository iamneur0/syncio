'use client';

import { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';

interface ColorPickerProps {
  currentColorIndex: number;
  onColorChange: (colorIndex: number) => void;
  isOpen: boolean;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLElement | HTMLDivElement | null>;
}

// Theme-based color variations for primary and secondary colors
const colorOptions = [
  // Primary variations
  {
    css: 'color-mix(in srgb, var(--color-primary) 100%, white)',
    gradient: 'linear-gradient(135deg, color-mix(in srgb, var(--color-primary) 80%, white) 0%, var(--color-primary) 100%)',
  },
  {
    css: 'color-mix(in srgb, var(--color-primary) 75%, white)',
    gradient: 'linear-gradient(135deg, color-mix(in srgb, var(--color-primary) 55%, white) 0%, color-mix(in srgb, var(--color-primary) 85%, white) 100%)',
  },
  {
    css: 'color-mix(in srgb, var(--color-primary) 50%, white)',
    gradient: 'linear-gradient(135deg, color-mix(in srgb, var(--color-primary) 30%, white) 0%, color-mix(in srgb, var(--color-primary) 70%, white) 100%)',
  },
  {
    css: 'color-mix(in srgb, var(--color-primary) 25%, white)',
    gradient: 'linear-gradient(135deg, color-mix(in srgb, var(--color-primary) 10%, white) 0%, color-mix(in srgb, var(--color-primary) 40%, white) 100%)',
  },
  // Secondary variations
  {
    css: 'color-mix(in srgb, var(--color-secondary) 100%, white)',
    gradient: 'linear-gradient(135deg, color-mix(in srgb, var(--color-secondary) 80%, white) 0%, var(--color-secondary) 100%)',
  },
  {
    css: 'color-mix(in srgb, var(--color-secondary) 75%, white)',
    gradient: 'linear-gradient(135deg, color-mix(in srgb, var(--color-secondary) 55%, white) 0%, color-mix(in srgb, var(--color-secondary) 85%, white) 100%)',
  },
  {
    css: 'color-mix(in srgb, var(--color-secondary) 50%, white)',
    gradient: 'linear-gradient(135deg, color-mix(in srgb, var(--color-secondary) 30%, white) 0%, color-mix(in srgb, var(--color-secondary) 70%, white) 100%)',
  },
  {
    css: 'color-mix(in srgb, var(--color-secondary) 25%, white)',
    gradient: 'linear-gradient(135deg, color-mix(in srgb, var(--color-secondary) 10%, white) 0%, color-mix(in srgb, var(--color-secondary) 40%, white) 100%)',
  },
];

export function ColorPicker({ 
  currentColorIndex, 
  onColorChange, 
  isOpen, 
  onClose, 
  triggerRef 
}: ColorPickerProps) {
  const pickerRef = useRef<HTMLDivElement>(null);

  // Close picker when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        pickerRef.current && 
        !pickerRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose, triggerRef]);

  if (!isOpen) return null;

  const colorIndex = currentColorIndex % colorOptions.length;

  return (
    <motion.div
      ref={pickerRef}
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="absolute top-full left-0 mt-2 p-3 rounded-xl shadow-xl border border-default z-50"
      style={{
        background: 'var(--color-surface)',
        minWidth: '180px'
      }}
    >
      <div className="text-xs font-medium mb-3 text-muted px-1">
        Select Color
      </div>
      <div className="grid grid-cols-4 gap-2">
        {colorOptions.map((option, index) => {
          const isSelected = colorIndex === index;

          return (
            <button
              key={index}
              type="button"
              onClick={() => {
                onColorChange(index);
                onClose();
              }}
              className="relative w-8 h-8 rounded-full transition-all hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              style={{
                background: option.gradient,
                boxShadow: isSelected ? `0 0 0 2px var(--color-bg), 0 0 0 4px var(--color-primary)` : 'none'
              }}
            >
              {isSelected && (
                <span className="absolute inset-0 flex items-center justify-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="white"
                    className="w-4 h-4 drop-shadow-md"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </span>
              )}
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}
