import React, { useState, useRef, useEffect } from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { getColorHexValue, getThemePalette, mapColorIndex } from '@/utils/colorMapping'

interface ColorPickerProps {
  currentColorIndex: number
  onColorChange: (colorIndex: number) => void
  isOpen: boolean
  onClose: () => void
  triggerRef: React.RefObject<HTMLElement>
}

export default function ColorPicker({ 
  currentColorIndex, 
  onColorChange, 
  isOpen, 
  onClose, 
  triggerRef 
}: ColorPickerProps) {
  const theme = useTheme()
  const { isDark, isMono } = theme as any
  const pickerRef = useRef<HTMLDivElement>(null)

  // Get the appropriate color palette based on theme
  const themeColors = getThemePalette(isMono ? 'mono' : isDark ? 'dark' : 'light')

  // Map the current color index to the new 0-4 range
  const currentThemeColorIndex = mapColorIndex(currentColorIndex)

  // Close picker when clicking outside
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      if (
        pickerRef.current && 
        !pickerRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen, onClose, triggerRef])

  if (!isOpen) return null

  return (
    <div
      ref={pickerRef}
      className={`absolute top-full left-0 mt-2 p-3 rounded-lg shadow-lg border z-50 ${
        isDark 
          ? 'bg-gray-800 border-gray-600' 
          : 'bg-white border-gray-200'
      }`}
      style={{ minWidth: '200px' }}
    >
      <div className="text-xs font-medium mb-2 text-gray-500">
        Select Color
      </div>
      <div className="grid grid-cols-5 gap-2">
        {themeColors.map((colorOption, index) => {
          // Color indices are now always 0-4 for both themes
          const actualColorIndex = index
          const isSelected = currentThemeColorIndex === actualColorIndex
          
          return (
            <button
              key={index}
              type="button"
              onClick={() => {
                onColorChange(actualColorIndex)
                onClose()
              }}
              className={`relative w-8 h-8 rounded-full border-2 transition-all hover:scale-110 ${
                isSelected
                  ? 'border-white ring-2 ring-offset-2 ring-blue-500' 
                  : 'border-gray-300 hover:border-gray-400'
              }`}
              style={{ 
                backgroundColor: colorOption.hexValue
              }}
              title={colorOption.name}
            >
              {isSelected && (
                <span className="absolute inset-0 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="white" className="w-4 h-4">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
