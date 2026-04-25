'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

interface ContextMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  onClose: () => void;
  children: React.ReactNode;
}

export function ContextMenu({ isOpen, position, onClose, children }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    // Close on scroll
    const handleScroll = () => {
      onClose();
    };

    window.addEventListener('click', handleClick);
    window.addEventListener('contextmenu', handleClick); // Close if right-clicking elsewhere
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      window.removeEventListener('click', handleClick);
      window.removeEventListener('contextmenu', handleClick);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [isOpen, onClose]);

  // Adjust position to keep within viewport
  const [adjustedPosition, setAdjustedPosition] = useState(position);

  useEffect(() => {
    if (isOpen && menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      let { x, y } = position;

      if (x + rect.width > window.innerWidth) {
        x = window.innerWidth - rect.width - 10;
      }
      if (y + rect.height > window.innerHeight) {
        y = window.innerHeight - rect.height - 10;
      }

      setAdjustedPosition({ x, y });
    } else {
      setAdjustedPosition(position);
    }
  }, [isOpen, position]);

  if (!isOpen) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        ref={menuRef}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.1 }}
        style={{
          position: 'fixed',
          top: adjustedPosition.y,
          left: adjustedPosition.x,
          zIndex: 9999, // High z-index to be on top of everything
        }}
        className="min-w-[180px] py-1.5 rounded-xl shadow-xl bg-surface border border-default backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()} // Prevent click from bubbling
        onContextMenu={(e) => e.preventDefault()} // Prevent native context menu on the menu itself
      >
        {children}
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}

// Helper hook for elements that trigger the menu
export function useContextMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const handleContextMenu = (e: React.MouseEvent | React.TouchEvent | Event, x?: number, y?: number) => {
    e.preventDefault();
    e.stopPropagation();
    const targetX = x ?? (e as React.MouseEvent).clientX;
    const targetY = y ?? (e as React.MouseEvent).clientY;
    setPosition({ x: targetX, y: targetY });
    setIsOpen(true);
  };

  const close = () => setIsOpen(false);

  return {
    isOpen,
    position,
    handleContextMenu,
    close,
    setIsOpen, // Expose setter if manual control is needed
  };
}
