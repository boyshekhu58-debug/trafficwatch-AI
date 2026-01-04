import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useData } from '../contexts/DataContext';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const SettingsPage = () => {
  const { settings, updateSettings } = useData();
  const [models, setModels] = useState([]);

  const toggleDetection = (key, value) => {
    updateSettings({ detectionTypes: { ...settings.detectionTypes, [key]: value } });
  };

  const onConfidenceChange = (vals) => {
    // Slider returns array of values (0-100)
    const val = (vals && vals[0]) || Math.round(settings.confidenceThreshold * 100);
    updateSettings({ confidenceThreshold: val / 100 });
  };

  const onModelChange = (e) => updateSettings({ model: e.target.value });
  const onRefreshRateChange = (e) => updateSettings({ refreshRate: Number(e.target.value) });

  useEffect(() => {
    // Try to fetch available models from backend, fallback to bundled 'best.pt'
    let mounted = true;
    const fetchModels = async () => {
      try {
        if (!process.env.REACT_APP_BACKEND_URL) throw new Error('No backend configured');
        const res = await axios.get(`${API}/models`, { withCredentials: true, timeout: 5000 });
        if (mounted && Array.isArray(res.data)) {
          const list = res.data.map((name, idx) => ({ id: idx, name }));
          setModels(list);
          if (!list.find(m => m.name === settings.model)) {
            updateSettings({ model: list[0]?.name || 'best.pt' });
          }
          return;
        }
      } catch (err) {
        // ignore and fall back
      }
      const only = [{ id: 0, name: 'best.pt' }];
      if (mounted) {
        setModels(only);
        if (settings.model !== 'best.pt') updateSettings({ model: 'best.pt' });
      }
    };
    fetchModels();
    return () => { mounted = false; };
  }, [settings.model, updateSettings]);


  return (
    <div className="p-6 max-w-4xl">
      <h2 className="text-2xl font-semibold">Settings</h2>
      <p className="text-sm text-slate-400 mt-2 mb-6">System configuration</p>

      <section className="mb-6">
        <h3 className="font-medium">Detection Types</h3>
        <p className="text-sm text-slate-500 mb-3">Enable or disable detection types</p>
        <div className="flex flex-col gap-3">
          {['triple_ride','overspeed','no_helmet','helmet'].map((key) => (
            <label key={key} className="flex items-center gap-3">
              <Checkbox checked={!!settings.detectionTypes?.[key]} onCheckedChange={(c) => toggleDetection(key, c)} />
              <span className="capitalize">{key.replace('_', ' ')}</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="ml-2 text-xs text-slate-400">ℹ️</button>
                </TooltipTrigger>
                <TooltipContent>
                  {key === 'overspeed' && <span>Detect vehicles exceeding speed limit. Recommended confidence: 0.6 - 0.85.</span>}
                  {key === 'triple_ride' && <span>Detect triple riders (more than two people on a vehicle). Recommended confidence: 0.5 - 0.85.</span>}
                  {key === 'helmet' && <span>Detect helmet usage for riders.</span>}
                  {key === 'no_helmet' && <span>Detect missing helmets on riders.</span>}
                </TooltipContent>
              </Tooltip>
            </label>
          ))}
        </div>
      </section>

      <section className="mb-6">
        <h3 className="font-medium">Confidence Threshold</h3>
        <p className="text-sm text-slate-500 mb-3">Adjust model confidence threshold (lower = more permissive)
          <Tooltip>
            <TooltipTrigger asChild>
              <button className="ml-2 text-xs text-slate-400">ℹ️</button>
            </TooltipTrigger>
            <TooltipContent>
              <span>Lower values increase detections but may add false positives. Suggested: 50-80%.</span>
            </TooltipContent>
          </Tooltip>
        </p>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <Slider value={[Math.round(settings.confidenceThreshold * 100)]} onValueChange={onConfidenceChange} min={10} max={100} step={1} />
          </div>
          <div className="w-24 text-sm text-slate-700">{Math.round(settings.confidenceThreshold * 100)}%</div>
        </div>
      </section>

      <section className="mb-6">
        <h3 className="font-medium">Model</h3>
        <p className="text-sm text-slate-500 mb-3">Select model to use</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">


          <div>
            <label className="block text-sm text-slate-600 mb-2">Model</label>
            <select className="w-full p-2 border rounded bg-white" value={settings.model} onChange={onModelChange}>
              {models.length === 0 ? (
                <>
                  <option>best.pt</option>
                </>
              ) : (
                models.map((m) => (
                  <option key={m.id} value={m.name}>{m.name}</option>
                ))
              )}
            </select>
          </div>
        </div>
      </section>

      <section className="mb-6">
        <h3 className="font-medium">Refresh Rate</h3>
        <p className="text-sm text-slate-500 mb-3">How frequently data should refresh (ms)</p>
        <select className="w-48 p-2 border rounded bg-white" value={settings.refreshRate} onChange={onRefreshRateChange}>
          <option value={1000}>1,000 ms</option>
          <option value={2000}>2,000 ms</option>
          <option value={5000}>5,000 ms</option>
          <option value={10000}>10,000 ms</option>
        </select>
      </section>



      <p className="text-xs text-slate-400">Settings are saved locally and applied immediately.</p>
    </div>
  );
};

export default SettingsPage;
