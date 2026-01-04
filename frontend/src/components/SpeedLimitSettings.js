import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Gauge, Save } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const SpeedLimitSettings = () => {
  const [speedLimit, setSpeedLimit] = useState(20);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    loadSpeedLimit();
  }, []);

  const loadSpeedLimit = async () => {
    try {
      const response = await axios.get(`${API}/speed-limit`, { withCredentials: true });
      setSpeedLimit(response.data.speed_limit || 20);
    } catch (error) {
      console.error('Error loading speed limit:', error);
    }
  };

  const handleSave = async () => {
    if (speedLimit <= 0) {
      toast.error('Speed limit must be greater than 0');
      return;
    }

    setLoading(true);
    try {
      await axios.post(
        `${API}/speed-limit`,
        { speed_limit: speedLimit },
        {
          withCredentials: true,
          headers: { 'Content-Type': 'application/json' }
        }
      );
      toast.success(`Speed limit set to ${speedLimit} km/h`);
      setOpen(false);
    } catch (error) {
      toast.error('Failed to save speed limit: ' + (error.response?.data?.detail || error.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full">
          <Gauge className="w-4 h-4 mr-2" />
          Set Speed Limit
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Speed Limit Configuration</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="speed-limit">Speed Limit (km/h)</Label>
            <Input
              id="speed-limit"
              type="number"
              min="1"
              step="1"
              value={speedLimit}
              onChange={(e) => setSpeedLimit(parseFloat(e.target.value) || 0)}
              placeholder="Enter speed limit"
              className="w-full"
            />
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Vehicles exceeding this speed will be flagged as overspeeding violations in videos.
            </p>
          </div>
          
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              <strong>Current Setting:</strong> {speedLimit} km/h
            </p>
            <p className="text-xs text-blue-600 dark:text-blue-300 mt-1">
              Any bike/vehicle detected traveling faster than {speedLimit} km/h will be marked as an overspeeding violation.
            </p>
          </div>

          <Button
            onClick={handleSave}
            disabled={loading || speedLimit <= 0}
            className="w-full"
          >
            <Save className="w-4 h-4 mr-2" />
            {loading ? 'Saving...' : 'Save Speed Limit'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SpeedLimitSettings;

