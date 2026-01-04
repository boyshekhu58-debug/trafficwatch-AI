import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Card } from '@/components/ui/card';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { TrendingUp, Calendar, Upload, Video, Image as ImageIcon } from 'lucide-react';
import { useData } from '../contexts/DataContext';
import { format } from 'date-fns';
import { useCallback } from 'react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const AnalyticsPanel = () => {
  const { violations, videos, photos } = useData();
  const [analyticsData, setAnalyticsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [error, setError] = useState(null);

  // Generate analytics from DataContext if backend endpoint fails
  const generateAnalyticsFromData = useCallback(() => {
    if (!violations || violations.length === 0) {
      return { monthly_violations: [], timeline: [], cumulative_violations: [] };
    }

    // Group violations by month
    const monthlyMap = {};
    violations.forEach(v => {
      const date = new Date(v.detected_at || v.created_at);
      const monthKey = format(date, 'yyyy-MM');
      const monthName = format(date, 'MMM yyyy');
      
      if (!monthlyMap[monthKey]) {
        monthlyMap[monthKey] = {
          month: monthName,
          total: 0,
          no_helmet: 0,
          overspeeding: 0,
          triple_ride: 0
        };
      }
      
      monthlyMap[monthKey].total++;
      const type = (v.violation_type || '').toLowerCase();
      if (type.includes('helmet')) monthlyMap[monthKey].no_helmet++;
      else if (type.includes('speed')) monthlyMap[monthKey].overspeeding++;
      else if (type.includes('triple') || type.includes('wrong')) monthlyMap[monthKey].triple_ride++;
    });

    const monthly_violations = Object.values(monthlyMap).sort((a, b) => {
      return new Date(a.month) - new Date(b.month);
    });

    // Create timeline from videos and photos
    const timeline = [];
    let cumulative = 0;
    
    [...videos, ...photos].forEach(item => {
      const itemDate = new Date(item.uploaded_at || item.created_at);
      const violationsForItem = violations.filter(v => {
        const vDate = new Date(v.detected_at || v.created_at);
        return format(vDate, 'yyyy-MM-dd') === format(itemDate, 'yyyy-MM-dd');
      });
      
      cumulative += violationsForItem.length;
      timeline.push({
        date: format(itemDate, 'yyyy-MM-dd'),
        type: item.video_path ? 'video_upload' : 'photo_upload',
        violations: violationsForItem.length,
        cumulative: cumulative,
        label: `${item.video_path ? 'Video' : 'Photo'} uploaded`
      });
    });

    timeline.sort((a, b) => new Date(a.date) - new Date(b.date));

    return {
      monthly_violations,
      timeline,
      cumulative_violations: timeline
    };
  }, [violations, videos, photos]);

  useEffect(() => {
    let intervalId;
    const loadAnalytics = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await axios.get(`${API}/analytics`, { 
          withCredentials: true,
          timeout: 15000
        });
        if (response.data) {
          setAnalyticsData(response.data);
        }
      } catch (error) {
        console.error('Error loading analytics from API:', error);
        // Fallback: generate analytics from DataContext
        const generatedData = generateAnalyticsFromData();
        if (generatedData.monthly_violations.length > 0 || generatedData.timeline.length > 0) {
          setAnalyticsData(generatedData);
          setError('Using local data (API endpoint unavailable)');
        } else {
          setAnalyticsData({ monthly_violations: [], timeline: [], cumulative_violations: [] });
          setError(error.response?.status === 404 
            ? 'Analytics endpoint not available. Upload videos or photos to see analytics.' 
            : `Error: ${error.message}`);
        }
      } finally {
        setLoading(false);
      }
    };

    // initial load
    loadAnalytics();

    // lightweight "live" refresh tied to backend stats (increased interval for performance)
    if (autoRefresh) {
      intervalId = setInterval(loadAnalytics, 10000); // Increased from 5s to 10s
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [autoRefresh, generateAnalyticsFromData]);

  if (loading && !analyticsData) {
    return (
      <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 p-6 rounded-2xl">
        <div className="space-y-4">
          <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded animate-pulse"></div>
          <div className="h-64 bg-slate-200 dark:bg-slate-700 rounded animate-pulse"></div>
          <div className="h-64 bg-slate-200 dark:bg-slate-700 rounded animate-pulse"></div>
        </div>
      </Card>
    );
  }

  if (!analyticsData || (analyticsData.monthly_violations && analyticsData.monthly_violations.length === 0 && analyticsData.timeline && analyticsData.timeline.length === 0)) {
    return (
      <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 p-6 rounded-2xl">
        <div className="text-center py-8">
          <p className="text-slate-500 dark:text-slate-400 mb-2">
            No analytics data available yet. Upload videos or photos to see analytics.
          </p>
          {error && (
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
              {error}
            </p>
          )}
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-4">
            Current data: {violations?.length || 0} violations, {videos?.length || 0} videos, {photos?.length || 0} photos
          </p>
        </div>
      </Card>
    );
  }

  // Format timeline data for the chart
  const timelineChartData = analyticsData.cumulative_violations.map((item, index) => {
    const date = new Date(item.date);
    return {
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      fullDate: date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      cumulative: item.cumulative,
      violations: item.violations,
      type: item.type,
      label: item.label,
      index: index + 1
    };
  });

  // Custom tooltip for timeline
  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 shadow-lg">
          <p className="text-white font-semibold mb-2">{data.fullDate}</p>
          <p className="text-blue-400 text-sm">
            {data.type === 'video_upload' ? (
              <><Video className="w-4 h-4 inline mr-1" />Video Upload</>
            ) : (
              <><ImageIcon className="w-4 h-4 inline mr-1" />Photo Upload</>
            )}
          </p>
          <p className="text-slate-300 text-sm mt-1">{data.label}</p>
          <p className="text-yellow-400 text-sm mt-1">
            Violations: <span className="font-bold">{data.violations}</span>
          </p>
          <p className="text-green-400 text-sm mt-1">
            Cumulative Total: <span className="font-bold">{data.cumulative}</span>
          </p>
        </div>
      );
    }
    return null;
  };

  // Custom tooltip for monthly chart
  const MonthlyTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 shadow-lg">
          <p className="text-white font-semibold mb-2">{data.month}</p>
          <p className="text-red-400 text-sm">
            Total Violations: <span className="font-bold">{data.total}</span>
          </p>
          <p className="text-orange-400 text-sm">
            No Helmet: <span className="font-bold">{data.no_helmet}</span>
          </p>
          <p className="text-yellow-400 text-sm">
            Overspeeding: <span className="font-bold">{data.overspeeding}</span>
          </p>
          <p className="text-purple-400 text-sm">
            Triple Ride: <span className="font-bold">{data.triple_ride}</span>
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Header with refresh controls */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Analytics Overview</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Live charts based on your latest uploads and detected violations.
          </p>
          {error && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
              ⚠️ {error}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-slate-300 dark:border-slate-600"
            />
            Auto refresh (5s)
          </label>
          <button
            onClick={() => {
              // one-off refresh without waiting for interval
              setLoading(true);
              // toggle autoRefresh to trigger effect re-run; it will immediately reload
              setAutoRefresh((prev) => prev);
            }}
            className="text-xs font-medium px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700"
          >
            Refresh now
          </button>
        </div>
      </div>
      {/* Monthly Violations Chart */}
      <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 p-6 rounded-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-blue-50 dark:bg-blue-500/10 rounded-lg p-2">
            <Calendar className="w-6 h-6 text-blue-500 dark:text-blue-300" />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-slate-900 dark:text-white">Violations Per Month</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">Monthly breakdown of detected violations</p>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart
            data={analyticsData.monthly_violations}
            margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="month"
              angle={-45}
              textAnchor="end"
              height={80}
              stroke="#64748b"
              tick={{ fill: '#64748b', fontSize: 12 }}
            />
            <YAxis stroke="#64748b" tick={{ fill: '#64748b' }} />
            <Tooltip content={<MonthlyTooltip />} />
            <Legend
              wrapperStyle={{ paddingTop: '20px' }}
              iconType="circle"
            />
            <Bar
              dataKey="total"
              name="Total Violations"
              fill="#ef4444"
              radius={[8, 8, 0, 0]}
            />
            <Bar
              dataKey="no_helmet"
              name="No Helmet"
              fill="#f97316"
              radius={[8, 8, 0, 0]}
            />
            <Bar
              dataKey="overspeeding"
              name="Overspeeding"
              fill="#eab308"
              radius={[8, 8, 0, 0]}
            />
            <Bar
              dataKey="triple_ride"
              name="Triple Ride"
              fill="#a855f7"
              radius={[8, 8, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Timeline Chart - Cumulative Violations */}
      <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 p-6 rounded-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-emerald-50 dark:bg-emerald-500/10 rounded-lg p-2">
            <TrendingUp className="w-6 h-6 text-emerald-500 dark:text-emerald-300" />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-slate-900 dark:text-white">Violations Timeline</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Cumulative violations over time based on video and photo uploads
            </p>
          </div>
        </div>
        {timelineChartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={400}>
            <LineChart
              data={timelineChartData}
              margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="date"
                angle={-45}
                textAnchor="end"
                height={80}
                stroke="#94a3b8"
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                interval="preserveStartEnd"
              />
              <YAxis
                stroke="#64748b"
                tick={{ fill: '#64748b' }}
                label={{
                  value: 'Cumulative Violations',
                  angle: -90,
                  position: 'insideLeft',
                  fill: '#64748b',
                }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ paddingTop: '20px' }}
                iconType="circle"
              />
              <Line
                type="monotone"
                dataKey="cumulative"
                name="Cumulative Violations"
                stroke="#10b981"
                strokeWidth={3}
                dot={{ fill: '#10b981', r: 5 }}
                activeDot={{ r: 8, fill: '#10b981' }}
              />
              <Line
                type="monotone"
                dataKey="violations"
                name="Violations per Upload"
                stroke="#3b82f6"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={{ fill: '#3b82f6', r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-slate-500 dark:text-slate-400 text-center py-8">No timeline data available</p>
        )}
      </Card>

      {/* Upload Summary */}
      <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 p-6 rounded-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-purple-50 dark:bg-purple-500/10 rounded-lg p-2">
            <Upload className="w-6 h-6 text-purple-500 dark:text-purple-300" />
          </div>
          <h3 className="text-xl font-semibold text-slate-900 dark:text-white">Upload Summary</h3>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-slate-50 dark:bg-slate-800/60 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Video className="w-5 h-5 text-blue-500 dark:text-blue-300" />
              <span className="text-slate-900 dark:text-white font-semibold">Total Videos</span>
            </div>
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-300">
              {analyticsData.timeline.filter(item => item.type === 'video_upload').length}
            </p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/60 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <ImageIcon className="w-5 h-5 text-emerald-500 dark:text-emerald-300" />
              <span className="text-slate-900 dark:text-white font-semibold">Total Photos</span>
            </div>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-300">
              {analyticsData.timeline.filter(item => item.type === 'photo_upload').length}
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default AnalyticsPanel;

