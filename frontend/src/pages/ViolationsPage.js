import React, { useEffect } from 'react';
import ViolationsList from '../components/ViolationsList';
import { useData } from '../contexts/DataContext';
import { format } from 'date-fns';

const ViolationsPage = () => {
  const { violations, videos, photos, loadViolations, selectedDate, setSelectedDate } = useData();

  // Load violations from backend when date changes (supports server-side date filtering)
  useEffect(() => {
    const dateStr = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null;
    loadViolations(false, dateStr);
  }, [selectedDate, loadViolations]);

  return (
    <div className="p-6">
      <ViolationsList 
        violations={violations} 
        videos={videos}
        photos={photos}
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
      />
    </div>
  );
};

export default ViolationsPage;

