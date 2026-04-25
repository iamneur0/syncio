'use client';

import { useState, useRef, useEffect } from 'react';
import { format, parse } from 'date-fns';
import { CalendarIcon, ClockIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { motion, AnimatePresence } from 'framer-motion';

interface DateTimePickerProps {
  value: string; // ISO datetime string (YYYY-MM-DDTHH:mm format)
  onChange: (value: string) => void;
  min?: Date;
  className?: string;
  placeholder?: string;
}

export function DateTimePicker({
  value,
  onChange,
  min,
  className = '',
  placeholder = 'Select date and time'
}: DateTimePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [dateValue, setDateValue] = useState('');
  const [timeValue, setTimeValue] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse value into date and time
  useEffect(() => {
    if (value) {
      try {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          setDateValue(format(date, 'yyyy-MM-dd'));
          setTimeValue(format(date, 'HH:mm'));
        }
      } catch {
        setDateValue('');
        setTimeValue('');
      }
    } else {
      setDateValue('');
      setTimeValue('');
    }
  }, [value]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = e.target.value;
    setDateValue(newDate);
    if (newDate && timeValue) {
      const combined = `${newDate}T${timeValue}`;
      onChange(combined);
    }
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = e.target.value;
    setTimeValue(newTime);
    if (dateValue && newTime) {
      const combined = `${dateValue}T${newTime}`;
      onChange(combined);
    }
  };

  const handleClear = () => {
    setDateValue('');
    setTimeValue('');
    onChange('');
    setIsOpen(false);
  };

  const displayValue = value
    ? format(new Date(value), "MMM dd, yyyy 'at' HH:mm")
    : placeholder;

  const minDate = min ? format(min, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd');
  const minTime = min ? format(min, 'HH:mm') : '00:00';

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 rounded-xl transition-all duration-300 focus:outline-none border border-theme-surface-border focus:border-theme-secondary flex items-center gap-2 justify-between"
        style={{
          background: 'var(--color-bgSubtle)',
          color: value ? 'var(--color-text)' : 'var(--color-textSubtle)',
        }}
      >
        <div className="flex items-center gap-2">
          <CalendarIcon className="w-5 h-5" />
          <span>{displayValue}</span>
        </div>
        {value && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleClear();
            }}
            className="p-1 rounded hover:bg-surface-hover"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-full left-0 mt-2 p-4 rounded-xl shadow-xl border border-default z-50"
            style={{ 
              background: 'var(--color-surface)',
              minWidth: '300px'
            }}
          >
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-muted">Date</label>
                <input
                  type="date"
                  value={dateValue}
                  onChange={handleDateChange}
                  min={minDate}
                  className="w-full px-4 py-2 rounded-lg transition-all focus:outline-none border border-theme-surface-border focus:border-theme-secondary"
                  style={{
                    background: 'var(--color-bgSubtle)',
                    color: 'var(--color-text)',
                  }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-muted">Time</label>
                <input
                  type="time"
                  value={timeValue}
                  onChange={handleTimeChange}
                  min={dateValue === minDate ? minTime : undefined}
                  className="w-full px-4 py-2 rounded-lg transition-all focus:outline-none border border-theme-surface-border focus:border-theme-secondary"
                  style={{
                    background: 'var(--color-bgSubtle)',
                    color: 'var(--color-text)',
                  }}
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="flex-1 px-4 py-2 rounded-lg transition-colors text-sm font-medium"
                  style={{
                    background: 'var(--color-surface-hover)',
                    color: 'var(--color-text)',
                  }}
                >
                  Done
                </button>
                {value && (
                  <button
                    type="button"
                    onClick={handleClear}
                    className="px-4 py-2 rounded-lg transition-colors text-sm font-medium"
                    style={{
                      background: 'var(--color-error-muted)',
                      color: 'var(--color-error)',
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
