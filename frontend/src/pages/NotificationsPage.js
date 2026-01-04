import React from 'react';
import axios from 'axios';
import { useData } from '../contexts/DataContext';
import { Switch } from '@/components/ui/switch';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const NotificationsPage = () => {
  const { settings, updateSettings } = useData();

  const toggleEnabled = (checked) => updateSettings({ notifications: { ...settings.notifications, enabled: checked } });
  const toggleSound = (checked) => updateSettings({ notifications: { ...settings.notifications, sound: checked } });

  const playBeep = async () => {
    if (!settings.notifications.enabled || !settings.notifications.sound) return;
    // Try backend-hosted audio first, then public file, then inlined base64, then oscillator fallback
    const backendAudio = `${BACKEND_URL}/notification.wav`;
    const publicAudio = `${process.env.PUBLIC_URL || ''}/notification.mp3`;

    const tryPlay = async (url) => {
      try {
        // Quick HEAD to check availability (avoid long network errors)
        await axios.head(url, { timeout: 2000 });
        const audio = new Audio(url);
        await audio.play();
        return true;
      } catch (e) {
        return false;
      }
    };

    if (BACKEND_URL && await tryPlay(backendAudio)) return;
    if (await tryPlay(publicAudio)) return;

    // Fallback to inlined short wav (data URI)
    try {
      const fallbackData = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OSfTQ8OUKjk8LZjHAY4kdfyzHksBSR3x/DdkEAKFF606euoVRQKRp/g8r5sIQUrgc7y2Yk2CBtpvfDkn00PDlCo5PC2YxwGOJHX8sx5LAUkd8fw3ZBAC';
      const f = new Audio(fallbackData);
      await f.play();
    } catch (err) {
      // Final fallback to oscillator if everything else fails
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = 880;
        g.gain.value = 0.05;
        o.connect(g);
        g.connect(ctx.destination);
        o.start();
        setTimeout(() => { o.stop(); ctx.close(); }, 250);
      } catch (e) {
        // If even this fails, silently continue
      }
    }
  };

  return (
    <div className="p-6 max-w-2xl">
      <h2 className="text-2xl font-semibold">Notifications</h2>
      <p className="text-sm text-slate-400 mt-2 mb-6">Configure notification settings</p>

      <div className="flex items-center gap-4 mb-4">
        <Switch checked={!!settings.notifications.enabled} onCheckedChange={toggleEnabled} />
        <div>
          <div className="font-medium">Enable Notifications</div>
          <div className="text-sm text-slate-500">When enabled, you will receive system alerts</div>
        </div>
      </div>

      <div className="flex items-center gap-4 mb-4">
        <Switch checked={!!settings.notifications.sound} onCheckedChange={toggleSound} disabled={!settings.notifications.enabled} />
        <div>
          <div className="font-medium">Sound</div>
          <div className="text-sm text-slate-500">Play sound for new notifications</div>
        </div>
      </div>

      <div className="mt-4">
        <button className="px-4 py-2 bg-blue-600 text-white rounded" onClick={playBeep} disabled={!settings.notifications.enabled || !settings.notifications.sound}>
          Play Test Sound
        </button>
      </div>
    </div>
  );
};

export default NotificationsPage;
