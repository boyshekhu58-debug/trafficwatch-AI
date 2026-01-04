import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Car, MapPin, Satellite, Loader2, AlertCircle, Radio, Clock, Navigation } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const VehicleTracker = () => {
  const [plate, setPlate] = useState('');
  const [location, setLocation] = useState(null);
  const [locationHistory, setLocationHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isTracking, setIsTracking] = useState(false);
  const [updateCount, setUpdateCount] = useState(0);
  const [lastUpdateTime, setLastUpdateTime] = useState(null);
  const pollRef = useRef(null);
  const mapKeyRef = useRef(0);

  const fetchLocation = async (initial = false) => {
    if (!plate.trim()) {
      setError('Enter a vehicle number to track.');
      return;
    }
    if (initial) {
      setLoading(true);
      setError('');
    }
    try {
      const res = await axios.get(`${API}/vehicles/location`, {
        params: { plate: plate.trim() },
        withCredentials: true,
      });
      if (!res.data || res.data.lat == null || res.data.lng == null) {
        setError('No live location found for this vehicle.');
        if (initial) {
          setLocation(null);
          setLocationHistory([]);
        }
        return;
      }
      
      const newLocation = {
        ...res.data,
        timestamp: res.data.timestamp || new Date().toISOString(),
        fetchedAt: Date.now()
      };
      
      setLocation(newLocation);
      setLastUpdateTime(Date.now());
      setUpdateCount(prev => prev + 1);
      
      // Add to history (keep last 50 points for path visualization)
      setLocationHistory(prev => {
        const updated = [...prev, newLocation];
        return updated.slice(-50);
      });
      
      // Force map refresh by updating key
      mapKeyRef.current += 1;
      setError('');
    } catch (err) {
      console.error('Error fetching vehicle location', err);
      setError(
        err.response?.data?.detail ||
          'Unable to fetch live location for this vehicle right now.'
      );
      if (initial) {
        setLocation(null);
        setLocationHistory([]);
      }
    } finally {
      if (initial) setLoading(false);
    }
  };

  const startTracking = async () => {
    setLocationHistory([]);
    setUpdateCount(0);
    await fetchLocation(true);
    setIsTracking(true);
    if (pollRef.current) clearInterval(pollRef.current);
    // Poll every 2 seconds for real-time tracking
    pollRef.current = setInterval(() => {
      fetchLocation(false);
    }, 2000);
  };

  const stopTracking = () => {
    setIsTracking(false);
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const hasLocation = !!location && location.lat != null && location.lng != null;

  // Create map URL with marker and path visualization
  const getMapUrl = () => {
    if (!hasLocation) return null;
    
    // Base map URL with current location
    let url = `https://www.google.com/maps?q=${location.lat},${location.lng}&z=17`;
    
    // If we have history, we could add waypoints, but Google Maps embed doesn't support complex paths
    // For now, we'll use the current location with a marker
    url += '&output=embed';
    
    return url;
  };

  const mapSrc = getMapUrl();
  
  // Calculate time since last update
  const getTimeSinceUpdate = () => {
    if (!lastUpdateTime) return null;
    const seconds = Math.floor((Date.now() - lastUpdateTime) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  return (
    <div className="space-y-6">
      <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 p-6 rounded-2xl shadow-lg">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="bg-blue-50 dark:bg-blue-500/10 rounded-xl p-2">
              <Car className="w-6 h-6 text-blue-600 dark:text-blue-300" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-slate-900 dark:text-white">
                Real-Time Vehicle Tracking
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Enter a vehicle number to track its live location with real-time updates.
              </p>
            </div>
          </div>
          {isTracking && (
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 dark:bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300 animate-pulse">
                <Radio className="w-3 h-3 animate-pulse" />
                LIVE
              </span>
              {updateCount > 0 && (
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {updateCount} updates
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col md:flex-row gap-3 mb-4">
          <Input
            placeholder="Enter vehicle number (e.g., DL01AB1234)"
            value={plate}
            onChange={(e) => setPlate(e.target.value.toUpperCase())}
            className="bg-white dark:bg-slate-900"
          />
          <div className="flex gap-2">
            <Button
              onClick={startTracking}
              disabled={loading || !plate.trim()}
              className="min-w-[120px]"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Tracking...
                </>
              ) : (
                <>
                  <MapPin className="w-4 h-4 mr-2" />
                  Start Tracking
                </>
              )}
            </Button>
            {isTracking && (
              <Button
                type="button"
                variant="outline"
                onClick={stopTracking}
                className="border-slate-300 dark:border-slate-700"
              >
                Stop
              </Button>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-rose-200 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-500/10 px-4 py-3 flex items-start gap-2 text-sm text-rose-700 dark:text-rose-200">
            <AlertCircle className="w-4 h-4 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {hasLocation && (
          <div className="space-y-4">
            {/* Location Info Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <div className="bg-blue-100 dark:bg-blue-500/20 rounded-lg p-2">
                  <Navigation className="w-4 h-4 text-blue-600 dark:text-blue-300" />
                </div>
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                    <span>{plate}</span>
                    {isTracking && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-300">
                        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                        Active
                      </span>
                    )}
                  </div>
                  {location.address && (
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                      {location.address}
                    </p>
                  )}
                  <div className="flex items-center gap-4 mt-1 text-xs text-slate-500 dark:text-slate-400">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
                    </span>
                    {locationHistory.length > 1 && (
                      <span className="flex items-center gap-1">
                        <Navigation className="w-3 h-3" />
                        {locationHistory.length} points tracked
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                {location.timestamp && (
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <Clock className="w-3 h-3" />
                    <span>
                      {new Date(location.timestamp).toLocaleTimeString(undefined, {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </span>
                  </div>
                )}
                {getTimeSinceUpdate() && (
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    Updated {getTimeSinceUpdate()}
                  </span>
                )}
              </div>
            </div>

            {/* Live Map */}
            <div className="rounded-2xl overflow-hidden border-2 border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 shadow-inner relative">
              {isTracking && (
                <div className="absolute top-3 right-3 z-10">
                  <div className="bg-emerald-500/90 backdrop-blur-sm text-white px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 shadow-lg">
                    <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                    Live Tracking
                  </div>
                </div>
              )}
              <div className="relative w-full" style={{ aspectRatio: '16/9', minHeight: 400 }}>
                <iframe
                  key={mapKeyRef.current}
                  title="Vehicle live location"
                  src={mapSrc}
                  width="100%"
                  height="100%"
                  style={{ border: 0 }}
                  loading="lazy"
                  allowFullScreen
                  referrerPolicy="no-referrer-when-downgrade"
                  className="transition-opacity duration-300"
                />
              </div>
            </div>

            {/* Tracking Stats */}
            {isTracking && locationHistory.length > 1 && (
              <div className="grid grid-cols-3 gap-3 p-4 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-500/10 dark:to-cyan-500/10 rounded-xl border border-blue-200 dark:border-blue-500/30">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-300">
                    {locationHistory.length}
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                    Location Points
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-300">
                    {updateCount}
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                    Total Updates
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600 dark:text-purple-300">
                    ~2s
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                    Update Interval
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {!hasLocation && !loading && !error && (
          <div className="mt-6 p-6 bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-800/50 dark:to-blue-500/10 rounded-xl border border-slate-200 dark:border-slate-700 text-center">
            <Satellite className="w-12 h-12 text-slate-400 dark:text-slate-500 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Ready to Track
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Enter a vehicle number and click &quot;Start Tracking&quot; to begin real-time location monitoring.
              The map will update every 2 seconds with the vehicle&apos;s current position.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
};

export default VehicleTracker;


