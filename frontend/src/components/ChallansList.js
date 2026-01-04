import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, Image as ImageIcon, RefreshCw, Loader2 } from 'lucide-react';
import ChallanDetail from './ChallanDetail';
import { toast } from 'sonner';
import { useData } from '../contexts/DataContext';
import { format } from 'date-fns';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const ChallansList = ({ selectedDate }) => {
  const { challans, loadChallans, loading: contextLoading } = useData();
  const [refreshing, setRefreshing] = useState(false);
  const [imageUrls, setImageUrls] = useState({}); // challanId -> objectURL
  const [previewUrl, setPreviewUrl] = useState(null);
  const [selectedChallanId, setSelectedChallanId] = useState(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const dateStr = selectedDate ? (typeof selectedDate === 'string' ? selectedDate : format(selectedDate, 'yyyy-MM-dd')) : null;
        await loadChallans(false, dateStr);
      } catch (error) {
        console.error('Error loading challans:', error);
      }
    };
    
    loadData();
    
    return () => {
      // revoke object URLs
      Object.values(imageUrls).forEach(url => URL.revokeObjectURL(url));
    };
    // eslint-disable-next-line
  }, [selectedDate, loadChallans]);

  const [downloading, setDownloading] = useState({});

  const handleDownloadPDF = async (challanId, filename) => {
    // Prevent multiple simultaneous downloads
    if (downloading[challanId]) {
      return;
    }

    setDownloading(prev => ({ ...prev, [challanId]: true }));
    
    try {
      const res = await axios.get(`${API}/challans/${challanId}/download`, { 
        withCredentials: true, 
        responseType: 'blob',
        timeout: 30000 // 30 second timeout
      });
      
      // Verify we got a valid PDF blob
      if (!res.data || res.data.size === 0) {
        throw new Error('Empty response from server');
      }
      
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename || `challan_${challanId}.pdf`;
      document.body.appendChild(link);
      link.click();
      
      // Clean up after a short delay
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }, 100);
      
      toast.success('Challan PDF downloaded successfully');
    } catch (err) {
      console.error('Download failed', err);
      const errorMsg = err.response?.data?.detail || err.message || 'Failed to download PDF';
      toast.error(`Download failed: ${errorMsg}`);
    } finally {
      setDownloading(prev => {
        const updated = { ...prev };
        delete updated[challanId];
        return updated;
      });
    }
  };

  const loadImage = async (challanId) => {
    if (imageUrls[challanId]) {
      setPreviewUrl(imageUrls[challanId]);
      return;
    }
    try {
      const res = await axios.get(`${API}/challans/${challanId}/image`, { withCredentials: true, responseType: 'blob' });
      const blob = new Blob([res.data], { type: res.headers['content-type'] || 'image/jpeg' });
      const url = window.URL.createObjectURL(blob);
      setImageUrls(prev => ({ ...prev, [challanId]: url }));
      setPreviewUrl(url);
    } catch (err) {
      console.error('Failed to load image', err);
      toast.error('No detected image for this challan');
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const dateStr = selectedDate ? (typeof selectedDate === 'string' ? selectedDate : format(selectedDate, 'yyyy-MM-dd')) : null;
      await loadChallans(true, dateStr);
      toast.success('Challans refreshed');
    } catch (err) {
      console.error('Failed to refresh challans', err);
      toast.error('Failed to refresh challans');
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 p-6 rounded-2xl shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Traffic Challans</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Manage and download all generated e-challans.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleRefresh}
            className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700"
          >
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
        </div>
      </div>

      {(contextLoading || refreshing) && challans.length === 0 ? (
        <p className="text-slate-500 dark:text-slate-400">Loading...</p>
      ) : challans.length === 0 ? (
        <p className="text-slate-500 dark:text-slate-400">No challans generated yet</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800">
                <th className="text-left text-slate-500 dark:text-slate-400 text-xs font-medium pb-3 uppercase">
                  Challan#
                </th>
                <th className="text-left text-slate-500 dark:text-slate-400 text-xs font-medium pb-3 uppercase">
                  Type
                </th>
                <th className="text-left text-slate-500 dark:text-slate-400 text-xs font-medium pb-3 uppercase">
                  Plate
                </th>
                <th className="text-left text-slate-500 dark:text-slate-400 text-xs font-medium pb-3 uppercase">
                  Amount
                </th>
                <th className="text-left text-slate-500 dark:text-slate-400 text-xs font-medium pb-3 uppercase">
                  Generated
                </th>
                <th className="text-left text-slate-500 dark:text-slate-400 text-xs font-medium pb-3 uppercase">
                  Detected Image
                </th>
                <th className="text-left text-slate-500 dark:text-slate-400 text-xs font-medium pb-3 uppercase">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {challans.map(c => (
                <tr
                  key={c.id}
                  className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <td className="py-3 text-slate-800 dark:text-slate-100 text-sm">{c.challan_number}</td>
                  <td className="py-3 text-slate-800 dark:text-slate-100 text-sm">
                    {(c.violation_type || '').replace('_', ' ')}
                  </td>
                  <td className="py-3 text-slate-800 dark:text-slate-100 text-sm">
                    {c.plate_number || (c.preset_challan ? 'PRESET' : 'UNKNOWN')}
                  </td>
                  <td className="py-3 text-slate-800 dark:text-slate-100 text-sm">
                    ₹{c.fine_amount?.toFixed(2)}
                  </td>
                  <td className="py-3 text-slate-800 dark:text-slate-100 text-sm">
                    {new Date(c.generated_at).toLocaleString()}
                  </td>
                  <td className="py-3 text-slate-800 dark:text-slate-100 text-sm">
                    {c.detected_image_path ? (
                      <div className="flex gap-2">
                        <Button
                          size="xs"
                          onClick={() => loadImage(c.id)}
                          className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700"
                        >
                          <ImageIcon className="w-4 h-4 mr-2" /> Preview
                        </Button>
                        <Button
                          size="xs"
                          onClick={() => setSelectedChallanId(c.id)}
                          className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700"
                        >
                          View
                        </Button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Button
                          size="xs"
                          onClick={() => setSelectedChallanId(c.id)}
                          className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700"
                        >
                          View
                        </Button>
                        <span className="text-slate-400 dark:text-slate-500 text-xs">No image</span>
                      </div>
                    )}
                  </td>
                  <td className="py-3">
                    <Button
                      size="sm"
                      onClick={() => handleDownloadPDF(c.id, `challan_${c.challan_number}.pdf`)}
                      disabled={downloading[c.id]}
                      className="bg-blue-600 hover:bg-blue-700 text-white mr-2 rounded-full px-4 disabled:opacity-50"
                    >
                      {downloading[c.id] ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          Downloading...
                        </>
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Simple image preview modal */}
      {previewUrl && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6" onClick={() => setPreviewUrl(null)}>
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl shadow-2xl max-w-[80%] max-h-[80%] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <img src={previewUrl} alt="Detected" className="max-w-full max-h-[70vh]" />
            <div className="mt-3 text-right">
              <Button
                size="sm"
                onClick={() => setPreviewUrl(null)}
                className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Challan Detail modal */}
      {selectedChallanId && (
        <ChallanDetail challanId={selectedChallanId} onClose={() => setSelectedChallanId(null)} />
      )}
    </Card>
  );
};

export default ChallansList;
