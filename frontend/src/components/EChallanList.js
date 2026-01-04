import React, { useState, useMemo, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Gauge, FileText, Calendar as CalendarIcon, X, Smartphone, Users } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import axios from 'axios';
import { toast } from 'sonner';
import { format } from 'date-fns';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const EChallanList = ({ violations, videos, onChallanGenerated, onDateChange }) => {
  const [generating, setGenerating] = useState({});
  const [selectedDate, setSelectedDate] = useState(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20; // Pagination for performance

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

  const getVideoName = (videoId) => {
    const video = videos.find(v => v.id === videoId);
    return video ? video.filename : 'Unknown';
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

  const getFineAmount = (violationType) => {
    const normalizedType = (violationType || '').toLowerCase();
    switch (normalizedType) {
      case 'no_helmet':
        return '₹500';
      case 'cell_phone':
      case 'phone':
      case 'mobile':
      case 'using_phone':
        return '₹1000';
      case 'overspeeding':
      case 'over_speed':
        return '₹1500';
      case 'wrong_way':
      case 'triple_ride':
      case 'triple_riding':
      case 'over_capacity':
      case 'more_than_two':
        return '₹1000';
      default:
        return '₹500';
    }
  };

  const formatDateOnly = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return format(date, 'dd MMMM yyyy');
  };

  const getDateKey = (dateString) => {
    if (!dateString) return 'unknown';
    const date = new Date(dateString);
    return date.toISOString().split('T')[0]; // Returns YYYY-MM-DD format
  };

  // Get dates that have violations for calendar highlighting
  const datesWithViolations = useMemo(() => {
    const dates = new Set();
    violations.forEach(violation => {
      const dateKey = getDateKey(violation.created_at);
      if (dateKey !== 'unknown') {
        dates.add(dateKey);
      }
    });
    return Array.from(dates);
  }, [violations]);

  // Soft-sort violations based on selected date (selected-date items first)
  const filteredViolations = useMemo(() => {
    if (!selectedDate) return violations;
    const dateKey = format(selectedDate, 'yyyy-MM-dd');
    return [...violations].slice().sort((a, b) => {
      const aMatch = getDateKey(a.created_at) === dateKey ? 0 : 1;
      const bMatch = getDateKey(b.created_at) === dateKey ? 0 : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;
      return new Date(b.created_at) - new Date(a.created_at);
    });
  }, [violations, selectedDate]);

  // Group filtered violations by date for display
  const filteredViolationsByDate = useMemo(() => {
    const grouped = {};
    filteredViolations.forEach(violation => {
      const dateKey = getDateKey(violation.created_at);
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(violation);
    });
    return grouped;
  }, [filteredViolations]);

  // Pagination: Get violations for current page
  const paginatedViolations = useMemo(() => {
    const allViolations = Object.values(filteredViolationsByDate)
      .flat()
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return allViolations.slice(startIndex, endIndex);
  }, [filteredViolationsByDate, currentPage]);

  // Group paginated violations by date
  const paginatedViolationsByDate = useMemo(() => {
    const grouped = {};
    paginatedViolations.forEach(violation => {
      const dateKey = getDateKey(violation.created_at);
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(violation);
    });
    return grouped;
  }, [paginatedViolations]);

  const totalPages = Math.ceil(filteredViolations.length / itemsPerPage);

  const handleDateSelect = useCallback((date) => {
    setSelectedDate(date);
    setCalendarOpen(false);
    setCurrentPage(1); // Reset to first page when date changes
    if (onDateChange && date) {
      onDateChange(format(date, 'yyyy-MM-dd'));
    }
  }, [onDateChange]);

  const handleClearDate = useCallback(() => {
    setSelectedDate(null);
    setCurrentPage(1);
    if (onDateChange) {
      onDateChange(null);
    }
  }, [onDateChange]);

  // Map of existing challans by violation id for quick lookup
  const [challansMap, setChallansMap] = React.useState({});
  const [detailsOpen, setDetailsOpen] = React.useState({});

  const toggleDetails = (challanId) => {
    setDetailsOpen(prev => ({ ...prev, [challanId]: !prev[challanId] }));
  };

  const loadChallans = React.useCallback(async () => {
    try {
      const res = await axios.get(`${API}/challans`, { withCredentials: true });
      const map = {};
      (res.data || []).forEach(c => { if (c.violation_id) map[c.violation_id] = c; });
      setChallansMap(map);
    } catch (err) {
      console.error('Failed to load challans', err);
    }
  }, []);

  React.useEffect(() => {
    loadChallans();
  }, [loadChallans, onChallanGenerated]);

  const handleDownloadChallan = async (challan) => {
    if (!challan || !challan.id) return;
    try {
      const res = await axios.get(`${API}/challans/${challan.id}/download`, { withCredentials: true, responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${challan.challan_number || challan.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed', err);
      toast.error('Failed to download challan');
    }
  };

  const handleGenerateChallan = async (violationId) => {
    // Prevent multiple simultaneous requests for the same violation
    if (generating[violationId]) {
      return;
    }
    
    setGenerating(prev => ({ ...prev, [violationId]: true }));
    
    // Set a timeout to reset the generating state if it gets stuck
    const timeoutId = setTimeout(() => {
      setGenerating(prev => ({ ...prev, [violationId]: false }));
      toast.error('Challan generation timed out. Please try again.');
    }, 35000); // 35 second timeout
    
    try {
      // Try the generate endpoint first (it may create and return PDF in one go)
      try {
        const response = await axios.get(
          `${API}/challans/${violationId}/generate`,
          {
            withCredentials: true,
            responseType: 'blob',
            timeout: 30000
          }
        );

        // Verify we got a valid PDF blob
        if (response.data && response.data.size > 0) {
          // Create a blob URL and trigger download
          const blob = new Blob([response.data], { type: 'application/pdf' });
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `challan_${violationId}.pdf`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);

          toast.success('E-Challan generated and downloaded successfully!');
          
          // Refresh stats and challans list
          if (onChallanGenerated) {
            onChallanGenerated();
          }
          clearTimeout(timeoutId);
          return;
        }
      } catch (generateError) {
        console.log('Generate endpoint failed, trying POST to create challan first...', generateError);
        
        // If generate fails, try creating the challan first, then generate
        try {
          await axios.post(
            `${API}/challans`,
            { violation_id: violationId },
            {
              withCredentials: true,
              timeout: 30000
            }
          );
          
          // Retry generate after creating
          const retryResponse = await axios.get(
            `${API}/challans/${violationId}/generate`,
            {
              withCredentials: true,
              responseType: 'blob',
              timeout: 30000
            }
          );

          if (retryResponse.data && retryResponse.data.size > 0) {
            const blob = new Blob([retryResponse.data], { type: 'application/pdf' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `challan_${violationId}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);

            toast.success('E-Challan generated and downloaded successfully!');
            
            if (onChallanGenerated) {
              onChallanGenerated();
            }
            clearTimeout(timeoutId);
            return;
          }
        } catch (createError) {
          // If challan already exists (409), that's okay, just try generate again
          if (createError.response?.status === 409) {
            console.log('Challan already exists, this is fine');
          } else {
            throw createError;
          }
        }
      }
      
      throw new Error('Failed to generate challan PDF');
    } catch (error) {
      console.error('Error generating challan:', error);
      clearTimeout(timeoutId);
      
      const errorMessage = error.response?.data?.detail || 
                          error.response?.data?.message || 
                          error.message || 
                          'Unknown error occurred';
      
      // Show user-friendly error message
      if (error.response?.status === 404) {
        toast.error('Violation not found. Please refresh the page.');
      } else if (error.response?.status >= 500) {
        toast.error('Server error. Please try again later.');
      } else {
        toast.error(`Failed to generate e-challan: ${errorMessage}`);
      }
      
      // Log detailed error for debugging
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
    } finally {
      clearTimeout(timeoutId);
      setGenerating(prev => ({ ...prev, [violationId]: false }));
    }
  };

  // Custom day modifier for calendar - highlight dates with violations
  const modifiers = {
    hasViolations: (date) => {
      const dateKey = format(date, 'yyyy-MM-dd');
      return datesWithViolations.includes(dateKey);
    }
  };

  const modifiersClassNames = {
    hasViolations: 'bg-blue-500/20 text-blue-500 font-semibold'
  };

  return (
    <Card className="bg-slate-900 border-slate-800 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-white">E-Challan Management</h3>
        <div className="text-sm text-slate-400">
          {selectedDate ? (
            <>
              Showing: {format(selectedDate, 'dd MMM yyyy')} ({filteredViolations.length} violations)
            </>
          ) : (
            <>
              Total Violations: {violations.length}
            </>
          )}
        </div>
      </div>
      
      {/* Calendar Date Picker */}
      <div className="mb-4 flex items-center gap-2">
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="w-full justify-start text-left font-normal bg-slate-800 border-slate-700 text-white hover:bg-slate-700"
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {selectedDate ? format(selectedDate, 'dd MMMM yyyy') : 'Select date to filter'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0 bg-slate-800 border-slate-700" align="start">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={handleDateSelect}
              modifiers={modifiers}
              modifiersClassNames={modifiersClassNames}
              className="rounded-md border-0 bg-slate-800 text-white"
              classNames={{
                months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
                month: "space-y-4",
                caption: "flex justify-center pt-1 relative items-center text-white",
                caption_label: "text-sm font-medium text-white",
                nav: "space-x-1 flex items-center",
                nav_button: "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 text-white",
                table: "w-full border-collapse space-y-1",
                head_row: "flex",
                head_cell: "text-slate-400 rounded-md w-8 font-normal text-[0.8rem]",
                row: "flex w-full mt-2",
                cell: "text-center text-sm p-0 relative [&:has([aria-selected])]:bg-slate-700 first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
                day: "h-8 w-8 p-0 font-normal aria-selected:opacity-100 text-white hover:bg-slate-700",
                day_selected: "bg-blue-600 text-white hover:bg-blue-600 hover:text-white focus:bg-blue-600 focus:text-white",
                day_today: "bg-slate-700 text-white",
                day_outside: "text-slate-500 opacity-50",
                day_disabled: "text-slate-500 opacity-50",
                day_range_middle: "aria-selected:bg-slate-700 aria-selected:text-white",
                day_hidden: "invisible",
              }}
            />
          </PopoverContent>
        </Popover>
        {selectedDate && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleClearDate}
            className="bg-slate-800 border-slate-700 text-white hover:bg-slate-700"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="space-y-4">
        {filteredViolations.length === 0 ? (
          <p className="text-slate-400 text-center py-8">
            {selectedDate ? 'No violations found for selected date' : 'No violations detected yet'}
          </p>
        ) : (
          <>
            <div className="space-y-6 max-h-[600px] overflow-y-auto">
              {Object.keys(paginatedViolationsByDate).sort((a, b) => new Date(b) - new Date(a)).map(dateKey => (
                <div key={dateKey} className="space-y-3">
                  <h4 className="text-md font-semibold text-slate-300 border-b border-slate-700 pb-2 sticky top-0 bg-slate-900 z-10">
                    {formatDateOnly(dateKey)}
                    <span className="ml-2 text-sm text-slate-400">
                      ({filteredViolationsByDate[dateKey].length} violation{filteredViolationsByDate[dateKey].length !== 1 ? 's' : ''})
                    </span>
                  </h4>
                  <div className="grid grid-cols-1 gap-2">
                    {paginatedViolationsByDate[dateKey].map((violation) => (
                      <div
                        key={violation.id}
                        data-testid={`challan-item-${violation.id}`}
                        className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 hover:bg-slate-800 transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              {getViolationIcon(violation.violation_type)}
                              <span className="text-white text-sm font-medium capitalize">
                                {getViolationLabel(violation.violation_type)}
                              </span>
                              <span className="text-slate-400 text-xs ml-2">
                                #{violation.track_id}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs text-slate-400 mb-2">
                              <div>
                                <span className="text-slate-500">Source: </span>
                                {violation.video_id ? getVideoName(violation.video_id) : 
                                 violation.photo_id ? 'Photo' : 'N/A'}
                              </div>
                              <div>
                                <span className="text-slate-500">Time: </span>
                                {new Date(violation.created_at).toLocaleTimeString('en-IN', {
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </div>
                              {violation.plate_number && (
                                <div className="col-span-2">
                                  <span className="text-slate-500">Plate Number: </span>
                                  <span className="text-green-400 font-semibold">
                                    {violation.plate_number}
                                  </span>
                                </div>
                              )}
                              {violation.speed && (
                                <div>
                                  <span className="text-slate-500">Speed: </span>
                                  {violation.speed.toFixed(1)} km/h
                                </div>
                              )}
                              <div>
                                <span className="text-slate-500">Fine: </span>
                                <span className="text-yellow-400 font-semibold">
                                  {challansMap[violation.id] ? `₹${parseFloat(challansMap[violation.id].fine_amount || 0).toFixed(2)}` : getFineAmount(violation.violation_type)}
                                </span>
                              </div>
                            </div>
                          </div>
                          {/* Show Download if challan already exists for this violation */}
                          {challansMap[violation.id] ? (
                            <>
                              <Button size="sm" onClick={() => handleDownloadChallan(challansMap[violation.id])} className="bg-green-600 hover:bg-green-700 text-white ml-4" data-testid={`download-challan-${violation.id}`}>
                                <FileText className="w-4 h-4 mr-2" />
                                Download
                              </Button>
                              { (challansMap[violation.id].violation_ids && challansMap[violation.id].violation_ids.length > 1) && (
                                <Button size="sm" variant="ghost" onClick={() => toggleDetails(challansMap[violation.id].id)} className="ml-2 text-sm text-slate-300">
                                  Details
                                </Button>
                              )}

                              {/* Inline breakdown */}
                              { (challansMap[violation.id].id && detailsOpen[challansMap[violation.id].id]) && (
                                <div className="mt-2 bg-slate-900 p-3 rounded text-sm">
                                  <div className="font-semibold mb-1">Breakdown</div>
                                  { (challansMap[violation.id].breakdown || []).map((b) => (
                                    <div key={b.violation_id} className="flex justify-between">
                                      <div>{getViolationLabel(b.violation_type)}</div>
                                      <div>₹{parseFloat(b.amount || 0).toFixed(2)}</div>
                                    </div>
                                  ))}
                                  <div className="mt-2 flex justify-between font-bold">
                                    <div>Total</div>
                                    <div>₹{parseFloat(challansMap[violation.id].fine_amount || 0).toFixed(2)}</div>
                                  </div>
                                </div>
                              )}
                            </>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => handleGenerateChallan(violation.id)}
                              disabled={generating[violation.id]}
                              className="bg-blue-600 hover:bg-blue-700 text-white ml-4"
                              data-testid={`generate-challan-${violation.id}`}
                            >
                              {generating[violation.id] ? (
                                <>
                                  <FileText className="w-4 h-4 mr-2 animate-pulse" />
                                  Generating...
                                </>
                              ) : (
                                <>
                                  <FileText className="w-4 h-4 mr-2" />
                                  Generate
                                </>
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            
            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4 border-t border-slate-700">
                <div className="text-sm text-slate-400">
                  Page {currentPage} of {totalPages} ({filteredViolations.length} total violations)
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="bg-slate-800 hover:bg-slate-700 text-white"
                  >
                    Previous
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className="bg-slate-800 hover:bg-slate-700 text-white"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
};

export default EChallanList;
