import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Save, Info } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const CalibrationPanel = ({ onCalibrate }) => {
  const [calibration, setCalibration] = useState(null);
  const [formData, setFormData] = useState({
    name: 'Default Zone',
    reference_distance: '',
    pixel_points: [[100, 100], [500, 100]],
    speed_limit: ''
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadCalibration();
  }, []);

  const loadCalibration = async () => {
    try {
      const response = await axios.get(`${API}/calibration`, { withCredentials: true });
      if (response.data) {
        console.debug('Loaded calibration from server:', response.data);
        setCalibration(response.data);
        setFormData({
          name: response.data.name,
          reference_distance: response.data.reference_distance,
          pixel_points: response.data.pixel_points,
          speed_limit: response.data.speed_limit
        });
      }
    } catch (error) {
      console.error('Error loading calibration:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Client-side validation: ensure user entered positive numeric values
    if (!formData.reference_distance || Number(formData.reference_distance) <= 0) {
      toast.error('Please enter a positive reference distance (meters).');
      return;
    }
    if (!formData.speed_limit || Number(formData.speed_limit) <= 0) {
      toast.error('Please enter a positive speed limit (km/h).');
      return;
    }

    setLoading(true);
    
    try {
      console.debug('Submitting calibration to server:', formData);
      const response = await axios.post(
        `${API}/calibration`,
        formData,
        {
          withCredentials: true
        }
      );
      
      // Use server-returned record (guaranteed canonical persisted values)
      const saved = response && response.data ? response.data : null;
      console.debug('Calibration POST response:', saved);
      if (saved) {
        setCalibration(saved);
        setFormData({
          name: saved.name || formData.name,
          reference_distance: saved.reference_distance,
          pixel_points: saved.pixel_points || formData.pixel_points,
          speed_limit: saved.speed_limit
        });
      }

      toast.success('Calibration saved successfully!');
      // Show an explicit applied toast so user sees values applied
      if (saved) {
        toast.success(`Calibration applied: ${saved.reference_distance}m, ${saved.speed_limit}km/h`);
      }
      // Keep compatibility: refresh server-side value and await it to avoid race conditions
      try { await loadCalibration(); } catch (e) { console.debug('loadCalibration failed:', e); }

      if (onCalibrate) {
        try { onCalibrate(); } catch (e) { console.error('onCalibrate callback failed:', e); }
      }
    } catch (error) {
      toast.error('Failed to save calibration');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="bg-slate-900 border-slate-800 p-6 max-w-2xl">
      <h3 className="text-lg font-bold text-white mb-4">Speed Calibration</h3>
      
      <div className="bg-blue-600/10 border border-blue-500/30 rounded-lg p-4 mb-6">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-slate-300">
            <p className="font-medium text-white mb-1">Calibration Setup</p>
            <p>Enter calibration values explicitly — reference distance (meters), pixel points, and the speed limit. These values will be applied exactly as entered by the user.</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label className="text-slate-300">Zone Name</Label>
          <Input
            data-testid="calibration-name-input"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="bg-slate-800 border-slate-700 text-white mt-1"
            required
          />
        </div>

        <div>
          <Label className="text-slate-300">Reference Distance (meters)</Label>
          <Input
            data-testid="reference-distance-input"
            type="number"
            step="0.1"
            value={formData.reference_distance}
            onChange={(e) => setFormData({ ...formData, reference_distance: e.target.value === '' ? '' : parseFloat(e.target.value) })}
            className="bg-slate-800 border-slate-700 text-white mt-1"
            required
          />
          <p className="text-xs text-slate-400 mt-1">Known distance in real world (e.g., 5 meters between two points)</p>
        </div>

        <div>
          <Label className="text-slate-300">Speed Limit (km/h)</Label>
          <Input
            data-testid="speed-limit-input"
            type="number"
            value={formData.speed_limit}
            onChange={(e) => setFormData({ ...formData, speed_limit: e.target.value === '' ? '' : parseInt(e.target.value) })}
            className="bg-slate-800 border-slate-700 text-white mt-1"
            required
          />
        </div>

        <Button
          data-testid="save-calibration-button"
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700"
        >
          <Save className="w-4 h-4 mr-2" />
          {loading ? 'Saving...' : 'Save Calibration'}
        </Button>
      </form>

      {calibration && (
        <div className="mt-6 pt-6 border-t border-slate-800">
          <p className="text-sm text-slate-400">
            Current: <span className="text-white font-medium">{calibration.name}</span> | 
            Distance: <span className="text-white font-medium">{calibration.reference_distance}m</span> | 
            Speed Limit: <span className="text-white font-medium">{calibration.speed_limit} km/h</span>
          </p>
        </div>
      )}
    </Card>
  );
};

export default CalibrationPanel;
