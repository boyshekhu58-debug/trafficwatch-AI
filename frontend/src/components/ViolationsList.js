import React, { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { AlertTriangle, Gauge, Smartphone, Users } from 'lucide-react';
import DateFilter from './DateFilter';
import { format } from 'date-fns';

const ViolationsList = ({ violations, videos, photos, selectedDate, onDateChange }) => {
  const getViolationIcon = (type) => {
    const normalizedType = (type || '').toLowerCase();
    switch (normalizedType) {
      case 'no_helmet':
        return <AlertTriangle className="w-5 h-5 text-red-500" />;
      case 'cell_phone':
      case 'phone':
      case 'mobile':
      case 'using_phone':
        return <Smartphone className="w-5 h-5 text-purple-500" />;
      case 'overspeeding':
      case 'over_speed':
        return <Gauge className="w-5 h-5 text-yellow-500" />;
      case 'wrong_way':
      case 'triple_ride':
      case 'triple_riding':
      case 'over_capacity':
      case 'more_than_two':
        return <Users className="w-5 h-5 text-pink-500" />;
      default:
        return <AlertTriangle className="w-5 h-5 text-gray-500" />;
    }
  };

  const getViolationLabel = (type) => {
    const normalizedType = (type || '').toLowerCase();
    const labels = {
      'no_helmet': 'No Helmet',
      'cell_phone': 'Using Cell Phone',
      'phone': 'Using Phone',
      'mobile': 'Using Mobile',
      'using_phone': 'Using Phone',
      'overspeeding': 'Overspeeding',
      'over_speed': 'Overspeeding',
      'wrong_way': 'Triple Ride',
      'triple_ride': 'Triple Ride',
      'triple_riding': 'Triple Riding',
      'over_capacity': 'Over Capacity',
      'more_than_two': 'More Than 2 Persons'
    };
    return labels[normalizedType] || (type || 'Unknown').replace('_', ' ');
  };

  const getVideoName = (videoId) => {
    const video = videos.find(v => v.id === videoId);
    return video ? video.filename : 'Unknown';
  };

  // Soft-sort violations by selected date (selected-date items first, then others)
  const sortedViolations = useMemo(() => {
    if (!selectedDate) return violations;
    const dateKey = format(selectedDate, 'yyyy-MM-dd');
    return [...violations].slice().sort((a, b) => {
      const aMatch = (a.created_at && new Date(a.created_at).toISOString().split('T')[0] === dateKey) ? 0 : 1;
      const bMatch = (b.created_at && new Date(b.created_at).toISOString().split('T')[0] === dateKey) ? 0 : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
  }, [violations, selectedDate]);

  // Split into separate lists for video and photo violations
  const videoViolations = useMemo(() => sortedViolations.filter(v => !!v.video_id), [sortedViolations]);
  const photoViolations = useMemo(() => sortedViolations.filter(v => !!v.photo_id), [sortedViolations]);

  // Helpers to lookup names
  const getPhotoName = (photoId) => {
    // Photos are not always passed (guard) — return a friendly label
    if (!photoId) return 'Photo';
    if (!Array.isArray(photos)) return 'Photo';
    const photo = photos.find(p => p.id === photoId);
    return photo ? photo.filename || 'Photo' : 'Photo';
  };

  return (
    <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 p-6 rounded-2xl shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Violations Database</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Review and filter all detected violations from uploaded and live videos.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-64">
            <DateFilter 
              selectedDate={selectedDate} 
              onDateChange={onDateChange}
              // Highlight dates that have ANY violations (video or photo)
              items={violations}
              dateKey="created_at"
            />
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="text-sm text-slate-500 dark:text-slate-400">Showing</h4>
          <p className="text-sm text-slate-700 dark:text-slate-200">
            {selectedDate ? `${format(selectedDate, 'dd MMMM yyyy')}` : 'All dates'} • {videoViolations.length} video violation{videoViolations.length !== 1 ? 's' : ''}, {photoViolations.length} photo violation{photoViolations.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Video Violations Column */}
        <div>
          <h5 className="text-sm font-semibold text-slate-800 dark:text-white mb-2">Video Violations</h5>
          {videoViolations.length === 0 ? (
            <p className="text-slate-500 dark:text-slate-400 text-center py-8">
              {selectedDate ? 'No video violations found for selected date' : 'No video violations found'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className="text-left text-slate-500 dark:text-slate-400 text-xs font-medium pb-3 uppercase">Type</th>
                    <th className="text-left text-slate-500 dark:text-slate-400 text-xs font-medium pb-3 uppercase">Video</th>
                    <th className="text-left text-slate-500 dark:text-slate-400 text-xs font-medium pb-3 uppercase">Plate</th>
                    <th className="text-left text-slate-500 dark:text-slate-400 text-xs font-medium pb-3 uppercase">Track ID</th>
                    <th className="text-left text-slate-500 dark:text-slate-400 text-xs font-medium pb-3 uppercase">Time</th>
                    <th className="text-left text-slate-500 dark:text-slate-400 text-xs font-medium pb-3 uppercase">Speed</th>
                    <th className="text-left text-slate-500 dark:text-slate-400 text-xs font-medium pb-3 uppercase">Conf.</th>
                  </tr>
                </thead>
                <tbody>
                  {videoViolations.map((violation) => (
                    <tr key={violation.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          {getViolationIcon(violation.violation_type)}
                          <span className="text-slate-800 dark:text-slate-100 text-sm capitalize">{getViolationLabel(violation.violation_type)}</span>
                        </div>
                      </td>
                      <td className="py-3 text-slate-700 dark:text-slate-200 text-sm">{getVideoName(violation.video_id)}</td>
                      <td className="py-3 text-slate-700 dark:text-slate-200 text-sm">{violation.plate_number ? <span className="text-green-500 font-semibold">{violation.plate_number}</span> : <span className="text-slate-400">-</span>}</td>
                      <td className="py-3 text-slate-700 dark:text-slate-200 text-sm">#{violation.track_id}</td>
                      <td className="py-3 text-slate-700 dark:text-slate-200 text-sm">{violation.timestamp ? violation.timestamp.toFixed(2) + 's' : '-'}</td>
                      <td className="py-3 text-slate-700 dark:text-slate-200 text-sm">{violation.speed ? `${violation.speed.toFixed(1)} km/h` : '-'}</td>
                      <td className="py-3 text-slate-700 dark:text-slate-200 text-sm">{(violation.confidence * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Photo Violations Column */}
        <div>
          <h5 className="text-sm font-semibold text-slate-800 dark:text-white mb-2">Photo Violations</h5>
          {photoViolations.length === 0 ? (
            <p className="text-slate-500 dark:text-slate-400 text-center py-8">
              {selectedDate ? 'No photo violations found for selected date' : 'No photo violations found'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className="text-left text-slate-500 dark:text-slate-400 text-xs font-medium pb-3 uppercase">Type</th>
                    <th className="text-left text-slate-500 dark:text-slate-400 text-xs font-medium pb-3 uppercase">Photo</th>
                    <th className="text-left text-slate-500 dark:text-slate-400 text-xs font-medium pb-3 uppercase">Plate</th>
                    <th className="text-left text-slate-500 dark:text-slate-400 text-xs font-medium pb-3 uppercase">Track ID</th>
                    <th className="text-left text-slate-500 dark:text-slate-400 text-xs font-medium pb-3 uppercase">Time</th>
                    <th className="text-left text-slate-500 dark:text-slate-400 text-xs font-medium pb-3 uppercase">Speed</th>
                    <th className="text-left text-slate-500 dark:text-slate-400 text-xs font-medium pb-3 uppercase">Conf.</th>
                  </tr>
                </thead>
                <tbody>
                  {photoViolations.map((violation) => (
                    <tr key={violation.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          {getViolationIcon(violation.violation_type)}
                          <span className="text-slate-800 dark:text-slate-100 text-sm capitalize">{getViolationLabel(violation.violation_type)}</span>
                        </div>
                      </td>
                      <td className="py-3 text-slate-700 dark:text-slate-200 text-sm">{getPhotoName(violation.photo_id)}</td>
                      <td className="py-3 text-slate-700 dark:text-slate-200 text-sm">{violation.plate_number ? <span className="text-green-500 font-semibold">{violation.plate_number}</span> : <span className="text-slate-400">-</span>}</td>
                      <td className="py-3 text-slate-700 dark:text-slate-200 text-sm">#{violation.track_id}</td>
                      <td className="py-3 text-slate-700 dark:text-slate-200 text-sm">{violation.timestamp ? violation.timestamp.toFixed(2) + 's' : '-'}</td>
                      <td className="py-3 text-slate-700 dark:text-slate-200 text-sm">{violation.speed ? `${violation.speed.toFixed(1)} km/h` : '-'}</td>
                      <td className="py-3 text-slate-700 dark:text-slate-200 text-sm">{(violation.confidence * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
};

export default ViolationsList;
