import React from 'react';
import CalibrationPanel from '../components/CalibrationPanel';
import SpeedLimitSettings from '../components/SpeedLimitSettings';
import { Card } from '@/components/ui/card';
import { useData } from '../contexts/DataContext';

const CalibrationPage = () => {
  const { refreshData } = useData();

  const handleCalibrate = () => {
    // Refresh global data so other pages reflect the new calibration immediately
    try {
      refreshData(true);
    } catch (e) {
      console.error('Failed to refresh global data after calibration:', e);
    }
  };

  return (
    <div className="p-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
            Speed Limit for Video Processing
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
            Set the speed threshold for detecting overspeeding violations in videos. 
            Any vehicle exceeding this speed will be flagged as a violation.
          </p>
          <SpeedLimitSettings />
        </Card>
      </div>
      
      <div className="mt-6">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">
          Calibration Settings
        </h2>
        <CalibrationPanel onCalibrate={handleCalibrate} />
      </div>
    </div>
  );
};

export default CalibrationPage;

