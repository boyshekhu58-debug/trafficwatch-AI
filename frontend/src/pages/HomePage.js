import React, { useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { useData } from '../contexts/DataContext';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { MoreVertical, AlertTriangle, Video, Image as ImageIcon } from 'lucide-react';

const HomePage = () => {
  const { violations, stats, loadViolations, loadStats } = useData();

  useEffect(() => {
    // Load data if cache is stale
    loadViolations(false);
    loadStats(false);
    
    // Auto-refresh every 10 seconds (reduced from 5s for better performance)
    const interval = setInterval(() => {
      loadViolations(true);
      loadStats(true);
    }, 10000);
    return () => clearInterval(interval);
  }, [loadViolations, loadStats]);

  // Process violations for violation count analytics
  const getViolationCountData = () => {
    const counts = {
      'no_helmet': 0,
      'cell_phone': 0,
      'phone': 0,
      'mobile': 0,
      'using_phone': 0,
      'overspeeding': 0,
      'over_speed': 0,
      'triple_ride': 0,
      'triple_riding': 0,
      'over_capacity': 0,
      'more_than_two': 0
    };

    violations.forEach(v => {
      const type = (v.violation_type || 'other').toLowerCase();
      if (type === 'cell_phone' || type === 'phone' || type === 'mobile' || type === 'using_phone') {
        counts.cell_phone++;
      } else if (type === 'overspeeding' || type === 'over_speed') {
        counts.overspeeding++;
      } else if (type === 'triple_ride' || type === 'triple_riding' || type === 'over_capacity' || type === 'more_than_two') {
        counts.triple_ride++;
      } else if (counts.hasOwnProperty(type)) {
        counts[type]++;
      } else {
        // Unknown types are ignored for these top-level stats
      }
    });

    const formatType = (type) => {
      const labels = {
        'no_helmet': 'No Helmet',
        'cell_phone': 'Using Cell Phone',
        'overspeeding': 'Overspeeding',
        'triple_ride': 'Triple Ride'
      };
      return labels[type] || type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
    };

    return [
      { name: formatType('no_helmet'), value: counts.no_helmet, count: counts.no_helmet },
      { name: formatType('cell_phone'), value: counts.cell_phone, count: counts.cell_phone },
      { name: formatType('overspeeding'), value: counts.overspeeding, count: counts.overspeeding },
      { name: formatType('triple_ride'), value: counts.triple_ride, count: counts.triple_ride }
    ].filter(item => item.count > 0);
  };

  // Process violations for time-based analysis
  const getTimeBasedData = () => {
    const hourlyCounts = Array(24).fill(0).map((_, i) => ({
      hour: i,
      hourLabel: `${i.toString().padStart(2, '0')}:00`,
      count: 0
    }));

    violations.forEach(v => {
      let date;
      if (v.created_at) {
        if (typeof v.created_at === 'string') {
          date = new Date(v.created_at);
        } else {
          date = v.created_at;
        }
        const hour = date.getHours();
        if (hour >= 0 && hour < 24) {
          hourlyCounts[hour].count++;
        }
      }
    });

    return hourlyCounts;
  };



  // Process violations by source (video vs photo) and type
  const getViolationsBySourceData = () => {
    const sourceData = {
      video: {
        total: 0,
        no_helmet: 0,
        overspeeding: 0,
        triple_ride: 0,
        cell_phone: 0
      },
      photo: {
        total: 0,
        no_helmet: 0,
        overspeeding: 0,
        triple_ride: 0,
        cell_phone: 0
      }
    };

    violations.forEach(v => {
      const source = v.video_id ? 'video' : (v.photo_id ? 'photo' : 'other');
      if (source === 'video' || source === 'photo') {
        sourceData[source].total++;
        const type = (v.violation_type || 'other').toLowerCase();
        if (type === 'no_helmet') {
          sourceData[source].no_helmet++;
        } else if (type === 'overspeeding' || type === 'over_speed') {
          sourceData[source].overspeeding++;
        } else if (type === 'triple_ride' || type === 'triple_riding' || type === 'over_capacity' || type === 'more_than_two') {
          sourceData[source].triple_ride++;
        } else if (type === 'cell_phone' || type === 'phone' || type === 'mobile' || type === 'using_phone') {
          sourceData[source].cell_phone++;
        } else {
          // Ignore other types for per-source breakdown
        }
      }
    });

    return [
      {
        name: 'From Videos',
        total: sourceData.video.total,
        no_helmet: sourceData.video.no_helmet,
        overspeeding: sourceData.video.overspeeding,
        triple_ride: sourceData.video.triple_ride,
        cell_phone: sourceData.video.cell_phone
      },
      {
        name: 'From Photos',
        total: sourceData.photo.total,
        no_helmet: sourceData.photo.no_helmet,
        overspeeding: sourceData.photo.overspeeding,
        triple_ride: sourceData.photo.triple_ride,
        cell_phone: sourceData.photo.cell_phone
      }
    ];
  };

  // Get comparison data: violations vs uploaded media
  const getComparisonData = () => {
    const totalViolations = violations.length;
    const videoViolations = violations.filter(v => v.video_id).length;
    const photoViolations = violations.filter(v => v.photo_id).length;
    const totalMedia = (stats?.total_videos || 0) + (stats?.total_photos || 0);
    const totalViolationsFromMedia = videoViolations + photoViolations;
    
    return {
      totalViolations,
      totalMedia,
      videoViolations,
      photoViolations,
      violationsPerMedia: totalMedia > 0 ? (totalViolationsFromMedia / totalMedia).toFixed(2) : 0,
      noHelmetFromVideos: violations.filter(v => v.video_id && v.violation_type === 'no_helmet').length,
      noHelmetFromPhotos: violations.filter(v => v.photo_id && v.violation_type === 'no_helmet').length
    };
  };

  const getCurrentTimeRange = () => {
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - 7); // Last 7 days
    return {
      start: start.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric'
      }),
      end: now.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric'
      })
    };
  };

  const violationCountData = getViolationCountData();
  const timeBasedData = getTimeBasedData();
  const violationsBySourceData = getViolationsBySourceData();
  const comparisonData = getComparisonData();
  const timeRange = getCurrentTimeRange();
  const totalViolations = violations.length;

  // Find peak hours
  const peakHours = timeBasedData
    .map((d, idx) => ({ ...d, index: idx }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .map(d => d.hourLabel);

  // No loading state - data is always available from cache

  return (
    <div className="p-6 bg-slate-100 dark:bg-slate-950 min-h-screen">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Live Violation Analytics</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Real-time analysis of traffic violations • Last updated: {new Date().toLocaleTimeString()}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        {/* Total Violations Card */}
        <Card className="bg-gradient-to-br from-blue-600 to-blue-700 border-0 p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm mb-1">Total Violations</p>
              <p className="text-4xl font-bold">{totalViolations}</p>
              <p className="text-blue-100 text-xs mt-2">
                {peakHours.length > 0 && `Peak: ${peakHours.join(', ')}`}
              </p>
            </div>
            <div className="bg-white/20 rounded-full p-4">
              <AlertTriangle className="w-8 h-8" />
            </div>
          </div>
        </Card>

        {/* Total Videos Card */}
        <Card className="bg-gradient-to-br from-purple-600 to-purple-700 border-0 p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-purple-100 text-sm mb-1">Total Videos</p>
              <p className="text-4xl font-bold">{stats?.total_videos || 0}</p>
              <p className="text-purple-100 text-xs mt-2">
                Uploaded & Processed
              </p>
            </div>
            <div className="bg-white/20 rounded-full p-4">
              <Video className="w-8 h-8" />
            </div>
          </div>
        </Card>

        {/* Total Images Card */}
        <Card className="bg-gradient-to-br from-emerald-600 to-emerald-700 border-0 p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-emerald-100 text-sm mb-1">Total Images</p>
              <p className="text-4xl font-bold">{stats?.total_photos || 0}</p>
              <p className="text-emerald-100 text-xs mt-2">
                Uploaded & Processed
              </p>
            </div>
            <div className="bg-white/20 rounded-full p-4">
              <ImageIcon className="w-8 h-8" />
            </div>
          </div>
        </Card>

        {/* Time Range Card */}
        <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-500 dark:text-slate-400 text-sm mb-1">Analysis Period</p>
              <p className="text-lg font-semibold text-slate-900 dark:text-white">
                {timeRange.start} - {timeRange.end}
              </p>
              <p className="text-slate-500 dark:text-slate-400 text-xs mt-2">
                Auto-refreshing every 5s
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Violation Count Analytics */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">
          📊 Violation Count Analytics
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Bar Chart - Violation type vs count */}
          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Violation Type vs Count
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Distribution of violations by type
                </p>
              </div>
              <MoreVertical className="w-4 h-4 text-slate-400 cursor-pointer" />
            </div>
            {violationCountData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={violationCountData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis 
                    dataKey="name" 
                    stroke="#64748b"
                    tick={{ fill: '#64748b', fontSize: 12 }}
                  />
                  <YAxis 
                    stroke="#64748b"
                    tick={{ fill: '#64748b' }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#ffffff', 
                      border: '2px solid #e2e8f0',
                      borderRadius: '8px',
                      color: '#ef4444'
                    }}
                    labelStyle={{ color: '#ef4444', fontWeight: 'bold' }}
                    itemStyle={{ color: '#ef4444' }}
                  />
                  <Bar dataKey="count" fill="#3b82f6" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-slate-400">
                No violation data available
              </div>
            )}
          </Card>

          {/* Pie Chart - Helmet vs No Helmet (by violation type) */}
          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Violations vs No Violations Ratio
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Percentage distribution of violations and no violations
                </p>
              </div>
              <MoreVertical className="w-4 h-4 text-slate-400 cursor-pointer" />
            </div>
            {(() => {
              // Show breakdown: No Helmet violations vs Other violations
              const noHelmetCount = violations.filter(v => (v.violation_type || '').toLowerCase() === 'no_helmet').length;
              const otherCount = Math.max(0, totalViolations - noHelmetCount);

              const ratioData = [
                { name: 'No Helmet', value: noHelmetCount, color: '#ef4444' },
                { name: 'Other Violations', value: otherCount, color: '#3b82f6' }
              ].filter(item => item.value > 0);

              const CustomTooltip = ({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload;
                  const total = noHelmetCount + otherCount || 1;
                  return (
                    <div className="bg-white border-2 border-slate-200 rounded-lg p-3 shadow-lg">
                      <p className="font-semibold mb-1" style={{color: data.color || '#000'}}>{data.name}</p>
                      <p className="text-sm">
                        Count: <span className="font-bold">{data.value}</span>
                      </p>
                      <p className="text-sm">
                        Percentage: <span className="font-bold">{((data.value / total) * 100).toFixed(1)}%</span>
                      </p>
                    </div>
                  );
                }
                return null;
              };

              return ratioData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={ratioData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent, value }) => `${name}: ${value} (${(percent * 100).toFixed(1)}%)`}
                      outerRadius={100}
                      dataKey="value"
                    >
                      {ratioData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[300px] text-slate-400">
                  No data available
                </div>
              );
            })()}
          </Card>
        </div>
      </div>

      {/* Violations by Source Analysis */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">
          📊 Violations by Source (Videos vs Photos)
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Stacked Bar Chart - Violations by Source and Type */}
          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Violations Breakdown by Source
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Showing violations from videos vs photos, with helmet violations highlighted
                </p>
              </div>
              <MoreVertical className="w-4 h-4 text-slate-400 cursor-pointer" />
            </div>
            {violationsBySourceData.some(d => d.total > 0) ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={violationsBySourceData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis 
                    dataKey="name" 
                    stroke="#64748b"
                    tick={{ fill: '#64748b', fontSize: 12 }}
                  />
                  <YAxis 
                    stroke="#64748b"
                    tick={{ fill: '#64748b' }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#ffffff', 
                      border: '2px solid #e2e8f0',
                      borderRadius: '8px',
                      color: '#ef4444'
                    }}
                    labelStyle={{ color: '#ef4444', fontWeight: 'bold' }}
                    itemStyle={{ color: '#ef4444' }}
                  />
                  <Legend />
                  <Bar dataKey="no_helmet" stackId="a" fill="#ef4444" name="No Helmet" />
                  <Bar dataKey="overspeeding" stackId="a" fill="#f97316" name="Overspeeding" />
                  <Bar dataKey="triple_ride" stackId="a" fill="#eab308" name="Triple Ride" />
                  <Bar dataKey="cell_phone" stackId="a" fill="#94a3b8" name="Using Cell Phone" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-slate-400">
                No violation data by source available
              </div>
            )}
          </Card>

          {/* Comparison and Helmet Focus */}
          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Source Comparison & Helmet Violations
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Total violations vs media uploaded, with helmet violation breakdown
                </p>
              </div>
              <MoreVertical className="w-4 h-4 text-slate-400 cursor-pointer" />
            </div>
            <div className="space-y-4">
              {/* Comparison Stats */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                  <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">Total Violations</p>
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {comparisonData.totalViolations}
                  </p>
                </div>
                <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4">
                  <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">Total Media</p>
                  <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                    {comparisonData.totalMedia}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {stats?.total_videos || 0} videos + {stats?.total_photos || 0} photos
                  </p>
                </div>
              </div>

              {/* Helmet Violations Breakdown */}
              <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 border-2 border-red-200 dark:border-red-800">
                <p className="text-sm font-semibold text-red-700 dark:text-red-300 mb-3">
                  🪖 No Helmet Violations by Source
                </p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-700 dark:text-slate-300">From Videos:</span>
                    <span className="text-lg font-bold text-red-600 dark:text-red-400">
                      {comparisonData.noHelmetFromVideos}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-700 dark:text-slate-300">From Photos:</span>
                    <span className="text-lg font-bold text-red-600 dark:text-red-400">
                      {comparisonData.noHelmetFromPhotos}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-red-200 dark:border-red-800">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-red-700 dark:text-red-300">Total No Helmet:</span>
                      <span className="text-xl font-bold text-red-600 dark:text-red-400">
                        {comparisonData.noHelmetFromVideos + comparisonData.noHelmetFromPhotos}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Violations per Media */}
              <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4">
                <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">Average Violations per Media</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">
                  {comparisonData.violationsPerMedia}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {comparisonData.videoViolations} from videos, {comparisonData.photoViolations} from photos
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Time-Based Analysis */}
      <div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">
          ⏱ Time-Based Analysis
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Line Graph - Violations vs Time */}
          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 p-6 lg:col-span-1">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Violations vs Time (Hourly)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Violation count by hour of day
                </p>
              </div>
              <MoreVertical className="w-4 h-4 text-slate-400 cursor-pointer" />
            </div>
            {timeBasedData.some(d => d.count > 0) ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={timeBasedData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis 
                    dataKey="hourLabel" 
                    stroke="#64748b"
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    angle={-45}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis 
                    stroke="#64748b"
                    tick={{ fill: '#64748b' }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#1e293b', 
                      border: '1px solid #334155',
                      borderRadius: '8px'
                    }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="count" 
                    stroke="#3b82f6" 
                    strokeWidth={3}
                    dot={{ fill: '#3b82f6', r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-slate-400">
                No time-based data available
              </div>
            )}
          </Card>

          {/* Hour-wise Heatmap */}
          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 p-6 lg:col-span-1">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Hour-wise Heatmap
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Violation intensity by hour
                </p>
              </div>
              <MoreVertical className="w-4 h-4 text-slate-400 cursor-pointer" />
            </div>
            {timeBasedData.some(d => d.count > 0) ? (
              <div className="space-y-3">
                <div className="grid grid-cols-6 gap-2">
                  {timeBasedData.map((item, index) => {
                    const maxCount = Math.max(...timeBasedData.map(d => d.count), 1);
                    const intensity = item.count / maxCount;
                    return (
                      <div
                        key={index}
                        className="flex flex-col items-center"
                      >
                        <div
                          className="w-full h-12 rounded transition-all hover:scale-110 cursor-pointer border"
                          style={{
                            backgroundColor: intensity > 0 
                              ? `rgba(59, 130, 246, ${Math.max(0.2, intensity)})` 
                              : '#f1f5f9',
                            borderColor: intensity > 0 
                              ? 'rgba(59, 130, 246, 0.3)' 
                              : '#e2e8f0'
                          }}
                          title={`${item.hourLabel}: ${item.count} violation${item.count !== 1 ? 's' : ''}`}
                        />
                        <span className="text-[10px] text-slate-600 dark:text-slate-400 mt-1">
                          {item.hour}
                        </span>
                        {item.count > 0 && (
                          <span className="text-[9px] font-semibold text-slate-700 dark:text-slate-300">
                            {item.count}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between mt-4 text-xs text-slate-500 dark:text-slate-400">
                  <span>Less</span>
                  <div className="flex gap-1">
                    {[0, 0.25, 0.5, 0.75, 1].map((val, i) => (
                      <div
                        key={i}
                        className="w-4 h-4 rounded-sm border border-slate-300 dark:border-slate-600"
                        style={{ backgroundColor: `rgba(59, 130, 246, ${val})` }}
                      />
                    ))}
                  </div>
                  <span>More</span>
                </div>
                <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    <strong className="text-slate-900 dark:text-white">Peak Hours:</strong>{' '}
                    {peakHours.length > 0 ? peakHours.join(', ') : 'No data available'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-slate-400">
                No heatmap data available
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};

export default HomePage;
