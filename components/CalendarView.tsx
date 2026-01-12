
import React, { useState, useMemo } from 'react';
import { Note } from '../types';
import { getLocalDateKey } from '../utils/audioUtils';

interface CalendarViewProps {
  notes: Note[];
  onSelectDate: (dateStr: string) => void;
}

const CalendarView: React.FC<CalendarViewProps> = ({ notes, onSelectDate }) => {
  const [currentDate, setCurrentDate] = useState(new Date());

  const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const goToToday = () => setCurrentDate(new Date());

  // Map notes to dates for indicators
  const notesByDate = useMemo(() => {
    const map: { [key: string]: number } = {};
    notes.forEach(note => {
      const key = getLocalDateKey(note.reminderDate || note.timestamp);
      map[key] = (map[key] || 0) + 1;
    });
    return map;
  }, [notes]);

  const renderDays = () => {
    const totalDays = daysInMonth(year, month);
    const startDay = firstDayOfMonth(year, month);
    const days = [];

    // Empty cells for offset
    for (let i = 0; i < startDay; i++) {
      days.push(<div key={`empty-${i}`} className="h-24 bg-slate-50/50 border border-slate-100/50"></div>);
    }

    // Days
    for (let d = 1; d <= totalDays; d++) {
      const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const count = notesByDate[dateKey] || 0;
      const isToday = new Date().toDateString() === new Date(year, month, d).toDateString();

      days.push(
        <button
          key={d}
          onClick={() => onSelectDate(dateKey)}
          className={`h-24 border border-slate-100 relative p-2 flex flex-col items-start justify-between transition-all hover:bg-indigo-50 group
            ${isToday ? 'bg-indigo-50/30' : 'bg-white'}
          `}
        >
          <span className={`text-sm font-semibold rounded-full w-7 h-7 flex items-center justify-center
            ${isToday ? 'bg-indigo-600 text-white' : 'text-slate-700 group-hover:text-indigo-600'}
          `}>
            {d}
          </span>
          
          {count > 0 && (
             <div className="flex gap-1 flex-wrap content-end w-full">
                {Array.from({ length: Math.min(count, 4) }).map((_, i) => (
                    <div key={i} className={`w-1.5 h-1.5 rounded-full ${isToday ? 'bg-indigo-400' : 'bg-indigo-300'}`}></div>
                ))}
                {count > 4 && <span className="text-[10px] text-slate-400 leading-none">+</span>}
             </div>
          )}
        </button>
      );
    }

    return days;
  };

  return (
    <div className="w-full h-full flex flex-col bg-white">
      {/* Calendar Header */}
      <div className="px-6 py-6 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10">
        <div>
           <h2 className="text-2xl font-black text-slate-800 tracking-tight">
             {currentDate.toLocaleString('default', { month: 'long' })}
           </h2>
           <p className="text-slate-400 font-medium">{year}</p>
        </div>
        
        <div className="flex items-center gap-2">
           <button onClick={prevMonth} className="p-2 hover:bg-slate-100 rounded-full text-slate-500">
             <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
           </button>
           <button onClick={goToToday} className="px-3 py-1 text-xs font-bold bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 uppercase tracking-wider">
             Today
           </button>
           <button onClick={nextMonth} className="p-2 hover:bg-slate-100 rounded-full text-slate-500">
             <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
           </button>
        </div>
      </div>

      {/* Weekday Header */}
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div key={day} className="py-2 text-center text-xs font-bold text-slate-400 uppercase tracking-widest">
            {day}
          </div>
        ))}
      </div>

      {/* Days Grid */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-7">
          {renderDays()}
        </div>
        <div className="h-24"></div> 
      </div>
    </div>
  );
};

export default CalendarView;
