import React from 'react';
import LiveDetection from '../components/LiveDetection';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

const LiveDetectionPage = () => {
  const navigate = useNavigate();

  return (
    <div className="p-6">
      <LiveDetection
        onRecordingComplete={(videoId) => {
          // Handle recording complete
        }}
        onViolationsDetected={() => {
          navigate('/dashboard/violations');
          toast.info('Violations detected! Review them in the Violations tab.');
        }}
      />
    </div>
  );
};

export default LiveDetectionPage;

