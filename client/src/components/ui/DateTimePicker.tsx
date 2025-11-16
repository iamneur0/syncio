'use client'

import React, { useState, useRef, useEffect } from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, setHours, setMinutes, getHours, getMinutes, isPast, set, isAfter } from 'date-fns'
import { ChevronLeft, ChevronRight, Calendar, Clock, X } from 'lucide-react'

interface DateTimePickerProps {
  value: string // ISO datetime string (YYYY-MM-DDTHH:mm format)
  onChange: (value: string) => void
  min?: Date // Minimum selectable date/time
  className?: string
  placeholder?: string
}

export default function DateTimePicker({
  value,
  onChange,
  min,
  className = '',
  placeholder = 'Select date and time'
}: DateTimePickerProps) {
  const { theme } = useTheme()
  const [isOpen, setIsOpen] = useState(false)
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedTime, setSelectedTime] = useState<{ hour: number; minute: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const hourScrollRef = useRef<HTMLDivElement>(null)
  const minuteScrollRef = useRef<HTMLDivElement>(null)

  // Parse initial value
  useEffect(() => {
    if (value) {
      try {
        const date = new Date(value)
        if (!isNaN(date.getTime())) {
          setSelectedDate(date)
          setSelectedTime({ hour: getHours(date), minute: getMinutes(date) })
          setCurrentMonth(date)
        }
      } catch {
        // Invalid date, ignore
      }
    } else {
      setSelectedDate(null)
      setSelectedTime(null)
    }
  }, [value])

  // Set current time when opening picker if no value is set
  useEffect(() => {
    if (isOpen && !value && !selectedDate) {
      const now = new Date()
      const minDateValue = min || new Date()
      const currentHour = getHours(now)
      const currentMinute = getMinutes(now)
      setSelectedTime({ hour: currentHour, minute: currentMinute })
      setSelectedDate(now)
      const finalDate = now < minDateValue ? minDateValue : now
      onChange(format(finalDate, "yyyy-MM-dd'T'HH:mm"))
    }
  }, [isOpen, value, selectedDate, min, onChange])

  // Close on outside click and Escape key
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleEscape)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
        document.removeEventListener('keydown', handleEscape)
      }
    }
  }, [isOpen])

  // Scroll to selected time when time changes or popup opens
  useEffect(() => {
    if (selectedTime && isOpen) {
      // Scroll hour
      if (hourScrollRef.current) {
        const hourElement = hourScrollRef.current.querySelector(`[data-hour="${selectedTime.hour}"]`)
        if (hourElement) {
          hourElement.scrollIntoView({ block: 'center', behavior: 'smooth' })
        }
      }
      // Scroll minute
      if (minuteScrollRef.current) {
        const minuteElement = minuteScrollRef.current.querySelector(`[data-minute="${selectedTime.minute}"]`)
        if (minuteElement) {
          minuteElement.scrollIntoView({ block: 'center', behavior: 'smooth' })
        }
      }
    }
  }, [selectedTime, isOpen])

  const minDate = min || new Date()
  const maxDate = (() => {
    const date = new Date()
    date.setMonth(date.getMonth() + 1)
    return date
  })()
  const minMonth = startOfMonth(minDate)
  const maxMonth = startOfMonth(maxDate)
  
  // Check if a month has any selectable days
  const monthHasSelectableDays = (month: Date) => {
    const monthStart = startOfMonth(month)
    const monthEnd = endOfMonth(month)
    // Check if any day in this month is within the selectable range
    return (monthStart <= maxDate && monthEnd >= minDate)
  }

  const handleDateSelect = (date: Date) => {
    // Don't allow selecting past dates or dates beyond 1 month
    if (isPast(date) && !isSameDay(date, new Date())) {
      return
    }
    if (isAfter(date, maxDate)) {
      return
    }
    
    setSelectedDate(date)
    
    // If time is already selected, update the full datetime
    if (selectedTime) {
      const newDateTime = set(date, { hours: selectedTime.hour, minutes: selectedTime.minute })
      if (newDateTime < minDate) {
        // If the selected date+time is in the past, set to minDate
        onChange(format(minDate, "yyyy-MM-dd'T'HH:mm"))
      } else {
        onChange(format(newDateTime, "yyyy-MM-dd'T'HH:mm"))
      }
    } else {
      // If no time selected yet, set to start of day or minDate if later
      const startOfDay = set(date, { hours: 0, minutes: 0 })
      const finalDate = startOfDay < minDate ? minDate : startOfDay
      onChange(format(finalDate, "yyyy-MM-dd'T'HH:mm"))
      setSelectedTime({ hour: getHours(finalDate), minute: getMinutes(finalDate) })
    }
  }

  const handleTimeChange = (hour: number, minute: number) => {
    setSelectedTime({ hour, minute })
    
    if (selectedDate) {
      const newDateTime = set(selectedDate, { hours: hour, minutes: minute })
      if (newDateTime < minDate) {
        // If the selected date+time is in the past, set to minDate
        onChange(format(minDate, "yyyy-MM-dd'T'HH:mm"))
        setSelectedTime({ hour: getHours(minDate), minute: getMinutes(minDate) })
      } else {
        onChange(format(newDateTime, "yyyy-MM-dd'T'HH:mm"))
      }
    } else {
      // If no date selected, use today
      const today = new Date()
      const newDateTime = set(today, { hours: hour, minutes: minute })
      if (newDateTime < minDate) {
        onChange(format(minDate, "yyyy-MM-dd'T'HH:mm"))
        setSelectedTime({ hour: getHours(minDate), minute: getMinutes(minDate) })
      } else {
        onChange(format(newDateTime, "yyyy-MM-dd'T'HH:mm"))
        setSelectedDate(today)
      }
    }
  }

  const handleClear = () => {
    setSelectedDate(null)
    setSelectedTime(null)
    onChange('')
    setIsOpen(false)
  }

  const displayValue = value
    ? format(new Date(value), "MMM dd, yyyy 'at' HH:mm")
    : placeholder

  // Calendar grid
  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const calendarStart = startOfWeek(monthStart)
  const calendarEnd = endOfWeek(monthEnd)
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd })

  const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  const isDateDisabled = (date: Date) => {
    const startOfDay = set(date, { hours: 0, minutes: 0, seconds: 0, milliseconds: 0 })
    const minStartOfDay = set(minDate, { hours: 0, minutes: 0, seconds: 0, milliseconds: 0 })
    const maxStartOfDay = set(maxDate, { hours: 0, minutes: 0, seconds: 0, milliseconds: 0 })
    return startOfDay < minStartOfDay || isAfter(startOfDay, maxStartOfDay)
  }

  const isDateSelected = (date: Date) => {
    return selectedDate && isSameDay(date, selectedDate)
  }

  const isToday = (date: Date) => {
    return isSameDay(date, new Date())
  }

  const navigateMonth = (direction: 'prev' | 'next') => {
    if (direction === 'prev') {
      const prevMonth = subMonths(currentMonth, 1)
      // Allow navigating if the previous month has at least one selectable day
      if (monthHasSelectableDays(prevMonth)) {
        setCurrentMonth(prevMonth)
      }
    } else {
      const nextMonth = addMonths(currentMonth, 1)
      // Allow navigating if the next month has at least one selectable day
      if (monthHasSelectableDays(nextMonth)) {
        setCurrentMonth(nextMonth)
      }
    }
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Input field */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="px-3 py-2 rounded-lg input cursor-pointer relative"
        style={{
          color: value ? 'var(--color-text)' : 'var(--color-text-secondary)'
        }}
      >
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--color-text-secondary)' }} />
          <p className="text-sm color-text-secondary" style={{ color: 'inherit', margin: 0 }}>{displayValue}</p>
        </div>
        {value && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              handleClear()
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:opacity-70 transition-opacity"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Calendar popup */}
      {isOpen && (
        <div
          className="absolute z-50 mt-2 rounded-lg shadow-lg border flex"
          style={{
            background: 'var(--color-surface)',
            borderColor: 'var(--color-border)'
          }}
        >
          {/* Calendar section - keep exactly as is */}
          <div className="p-4 border-r" style={{ borderColor: 'var(--color-border)' }}>
            <div className="flex items-center justify-between mb-4">
              <button
                type="button"
                onClick={() => navigateMonth('prev')}
                disabled={!monthHasSelectableDays(subMonths(currentMonth, 1))}
                className="p-1 rounded hover:opacity-70 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ color: 'var(--color-text)' }}
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="flex items-center">
                <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                  {format(currentMonth, 'MMMM yyyy')}
                </span>
              </div>
              <button
                type="button"
                onClick={() => navigateMonth('next')}
                disabled={!monthHasSelectableDays(addMonths(currentMonth, 1))}
                className="p-1 rounded hover:opacity-70 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ color: 'var(--color-text)' }}
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            {/* Week days */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {weekDays.map((day) => (
                <div
                  key={day}
                  className="text-xs font-medium text-center py-1"
                  style={{
                    color: day === 'Sat' || day === 'Sun' ? 'var(--color-negative)' : 'var(--color-text-secondary)'
                  }}
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1">
              {days.map((day) => {
                const isDisabled = isDateDisabled(day)
                const isSelected = isDateSelected(day)
                const isCurrentDay = isToday(day)
                const isOtherMonth = !isSameMonth(day, currentMonth)

                return (
                  <button
                    type="button"
                    key={day.toISOString()}
                    onClick={() => !isDisabled && !isOtherMonth && handleDateSelect(day)}
                    disabled={isDisabled || isOtherMonth}
                    className={`
                      aspect-square text-sm rounded transition-colors
                      ${isSelected ? 'font-semibold' : ''}
                      ${isDisabled || isOtherMonth ? 'opacity-30 cursor-not-allowed' : 'hover:opacity-80 cursor-pointer'}
                    `}
                    style={{
                      background: isSelected
                        ? 'var(--color-text)'
                        : isCurrentDay
                        ? 'var(--color-hover)'
                        : 'transparent',
                      color: isSelected
                        ? 'var(--color-surface)'
                        : isOtherMonth
                        ? 'var(--color-text-secondary)'
                        : day.getDay() === 0 || day.getDay() === 6
                        ? 'var(--color-negative)'
                        : 'var(--color-text)'
                    }}
                  >
                    {format(day, 'd')}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Scrollable time picker */}
          <div className="p-4 flex flex-col" style={{ borderColor: 'var(--color-border)', width: '120px', maxHeight: '280px' }}>
            <div className="flex items-center justify-center gap-2 mb-4 flex-shrink-0">
              <Clock className="w-4 h-4" style={{ color: 'var(--color-text-secondary)' }} />
              <span className="text-xs font-medium" style={{ color: 'var(--color-text)' }}>
                Time
              </span>
            </div>
            <div className="flex gap-1 flex-1 min-h-0">
              {/* Hours column */}
              <div
                ref={hourScrollRef}
                className="flex-1 overflow-y-auto scrollbar-hide min-h-0"
                style={{
                  scrollbarWidth: 'none',
                  msOverflowStyle: 'none',
                  padding: 0
                }}
              >
                <div className="flex flex-col items-center gap-1" style={{ padding: 0, margin: 0 }}>
                  {Array.from({ length: 24 }, (_, i) => {
                    const hour = i
                    const isSelected = selectedTime?.hour === hour
                    return (
                      <button
                        type="button"
                        key={hour}
                        data-hour={hour}
                        onClick={() => handleTimeChange(hour, selectedTime?.minute ?? getMinutes(minDate))}
                        className={`
                          aspect-square text-sm rounded transition-colors
                          ${isSelected ? 'font-semibold' : ''}
                          hover:opacity-80 cursor-pointer
                        `}
                        style={{
                          background: isSelected ? 'var(--color-text)' : 'transparent',
                          color: isSelected ? 'var(--color-surface)' : 'var(--color-text)'
                        }}
                      >
                        {String(hour).padStart(2, '0')}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Minutes column */}
              <div
                ref={minuteScrollRef}
                className="flex-1 overflow-y-auto scrollbar-hide min-h-0"
                style={{
                  scrollbarWidth: 'none',
                  msOverflowStyle: 'none',
                  padding: 0
                }}
              >
                <div className="flex flex-col items-center gap-1" style={{ padding: 0, margin: 0 }}>
                  {Array.from({ length: 60 }, (_, i) => {
                    const minute = i
                    const isSelected = selectedTime?.minute === minute
                    return (
                      <button
                        type="button"
                        key={minute}
                        data-minute={minute}
                        onClick={() => handleTimeChange(selectedTime?.hour ?? getHours(minDate), minute)}
                        className={`
                          aspect-square text-sm rounded transition-colors
                          ${isSelected ? 'font-semibold' : ''}
                          hover:opacity-80 cursor-pointer
                        `}
                        style={{
                          background: isSelected ? 'var(--color-text)' : 'transparent',
                          color: isSelected ? 'var(--color-surface)' : 'var(--color-text)'
                        }}
                      >
                        {String(minute).padStart(2, '0')}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

