import React, { useState, useEffect, useCallback } from 'react';
import EChallanList from '../components/EChallanList';
import { useData } from '../contexts/DataContext';
import { format } from 'date-fns';

const EChallanPage = () => {
  const { violations, videos, loadViolations, loadVideos, refreshData } = useData();
  const [selectedDate, setSelectedDate] = useState(null);

  // Load data only if cache is stale or date filter changes
  useEffect(() => {
    const dateStr = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null;
    loadViolations(false, dateStr);
    loadVideos(false, null); // Always load videos without date filter
  }, [selectedDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDateChange = useCallback((date) => {
    setSelectedDate(date);
  }, []);

  return (
    <div className="p-6">
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="lg:col-span-2">
          <EChallanList 
            violations={violations} 
            videos={videos} 
            onChallanGenerated={() => {
              const dateStr = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null;
              loadViolations(true, dateStr);
              refreshData();
            }}
            onDateChange={handleDateChange}
          />
        </div>
      </div>
    </div>
  );
};

export default EChallanPage;

