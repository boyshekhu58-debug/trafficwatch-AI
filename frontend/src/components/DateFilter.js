import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Calendar as CalendarIcon, X } from 'lucide-react';
import { format } from 'date-fns';

const DateFilter = ({ selectedDate, onDateChange, items = [], dateKey = 'created_at' }) => {
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Get dates that have items for calendar highlighting
  const datesWithItems = useMemo(() => {
    const dates = new Set();
    items.forEach(item => {
      if (item[dateKey]) {
        const date = new Date(item[dateKey]);
        const dateKeyStr = date.toISOString().split('T')[0];
        if (dateKeyStr !== 'unknown') {
          dates.add(dateKeyStr);
        }
      }
    });
    return Array.from(dates);
  }, [items, dateKey]);

  const handleDateSelect = (date) => {
    onDateChange(date);
    setCalendarOpen(false);
  };

  const handleClearDate = () => {
    onDateChange(null);
  };

  // Custom day modifier for calendar - highlight dates with items
  const modifiers = {
    hasItems: (date) => {
      const dateKeyStr = format(date, 'yyyy-MM-dd');
      return datesWithItems.includes(dateKeyStr);
    }
  };

  const modifiersClassNames = {
    hasItems: 'bg-blue-500/20 text-blue-500 font-semibold'
  };

  return (
    <div className="flex items-center gap-2">
      <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="w-full justify-start text-left font-normal bg-slate-800 border-slate-700 text-white hover:bg-slate-700"
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {selectedDate ? format(selectedDate, 'dd MMMM yyyy') : 'Select date to filter'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 bg-slate-800 border-slate-700" align="start">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={handleDateSelect}
            modifiers={modifiers}
            modifiersClassNames={modifiersClassNames}
            className="rounded-md border-0 bg-slate-800 text-white"
            classNames={{
              months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
              month: "space-y-4",
              caption: "flex justify-center pt-1 relative items-center text-white",
              caption_label: "text-sm font-medium text-white",
              nav: "space-x-1 flex items-center",
              nav_button: "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 text-white",
              table: "w-full border-collapse space-y-1",
              head_row: "flex",
              head_cell: "text-slate-400 rounded-md w-8 font-normal text-[0.8rem]",
              row: "flex w-full mt-2",
              cell: "text-center text-sm p-0 relative [&:has([aria-selected])]:bg-slate-700 first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
              day: "h-8 w-8 p-0 font-normal aria-selected:opacity-100 text-white hover:bg-slate-700",
              day_selected: "bg-blue-600 text-white hover:bg-blue-600 hover:text-white focus:bg-blue-600 focus:text-white",
              day_today: "bg-slate-700 text-white",
              day_outside: "text-slate-500 opacity-50",
              day_disabled: "text-slate-500 opacity-50",
              day_range_middle: "aria-selected:bg-slate-700 aria-selected:text-white",
              day_hidden: "invisible",
            }}
          />
        </PopoverContent>
      </Popover>
      {selectedDate && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleClearDate}
          className="bg-slate-800 border-slate-700 text-white hover:bg-slate-700"
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
};

export default DateFilter;

