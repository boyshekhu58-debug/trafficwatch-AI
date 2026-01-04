import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Download, Image as ImageIcon, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const ChallanDetail = ({ challanId, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [challan, setChallan] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);

  useEffect(() => {
    if (!challanId) return;
    setLoading(true);
    (async () => {
      try {
        const res = await axios.get(`${API}/challans/${challanId}`, { withCredentials: true });
        setChallan(res.data);
        if (res.data.detected_image_path) {
          // fetch image as blob
          const imgRes = await axios.get(`${API}/challans/${challanId}/image`, { withCredentials: true, responseType: 'blob' });
          const blob = new Blob([imgRes.data], { type: imgRes.headers['content-type'] || 'image/jpeg' });
          const url = window.URL.createObjectURL(blob);
          setImageUrl(url);
        }
      } catch (err) {
        console.error('Failed to load challan detail', err);
        toast.error('Failed to load challan');
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      if (imageUrl) {
        window.URL.revokeObjectURL(imageUrl);
      }
    };
    // eslint-disable-next-line
  }, [challanId]);

  const handleDownloadPDF = async () => {
    try {
      const res = await axios.get(`${API}/challans/${challanId}/download`, { withCredentials: true, responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `challan_${challan?.challan_number || challanId}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Downloaded challan PDF');
    } catch (err) {
      console.error('Download failed', err);
      toast.error('Failed to download PDF');
    }
  };

  if (!challanId) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center p-6 overflow-auto" onClick={onClose}>
      <div className="bg-slate-900 rounded-lg shadow-lg w-full max-w-3xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={onClose} className="bg-slate-700 text-white">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back
            </Button>
            <h3 className="text-lg font-semibold text-white">Challan Details</h3>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleDownloadPDF} className="bg-blue-600 hover:bg-blue-700 text-white">
              <Download className="w-4 h-4 mr-2" /> Download PDF
            </Button>
            <Button size="sm" onClick={async () => {
                if (!challan || !challan.violation_id) {
                  toast.error('No linked violation for styled challan');
                  return;
                }
                setLoading(true);
                try {
                  const res = await axios.get(`${API}/challans/${challan.violation_id}/generate_styled`, { withCredentials: true, responseType: 'blob' });
                  const blob = new Blob([res.data], { type: 'application/pdf' });
                  const url = window.URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  link.href = url;
                  link.download = `challan_${challan.challan_number || challan.id}.pdf`;
                  document.body.appendChild(link);
                  link.click();
                  link.remove();
                  window.URL.revokeObjectURL(url);
                  toast.success('Downloaded styled e-challan');
                } catch (err) {
                  console.error('Styled download failed', err);
                  toast.error('Failed to download styled e-challan');
                } finally {
                  setLoading(false);
                }
            }} className="bg-green-600 hover:bg-green-700 text-white">
              <Download className="w-4 h-4 mr-2" /> Download Styled E-Challan
            </Button>
          </div>
        </div>

        {loading ? (
          <p className="text-slate-400">Loading...</p>
        ) : !challan ? (
          <p className="text-red-400">Failed to load challan</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <div className="bg-slate-800 p-4 rounded">
                <div className="mb-3">
                  <div className="text-slate-400 text-xs">Challan Number</div>
                  <div className="text-white font-medium">{challan.challan_number}</div>
                </div>
                <div className="mb-3">
                  <div className="text-slate-400 text-xs">Violation</div>
                  <div className="text-white">{(challan.violation_type || '').replace('_',' ')}</div>
                </div>
                <div className="mb-3">
                  <div className="text-slate-400 text-xs">Plate Number</div>
                  <div className="text-white">{challan.plate_number || (challan.preset_challan ? 'PRESET' : 'UNKNOWN')}</div>
                </div>
                <div className="mb-3">
                  <div className="text-slate-400 text-xs">Fine Amount</div>
                  <div className="text-white">₹{challan.fine_amount?.toFixed(2)}</div>
                </div>
                <div className="mb-3">
                  <div className="text-slate-400 text-xs">Generated</div>
                  <div className="text-white">{new Date(challan.generated_at).toLocaleString()}</div>
                </div>
                {challan.notes && (
                  <div className="mt-4 p-3 bg-yellow-900/10 text-yellow-300 rounded">{challan.notes}</div>
                )}
              </div>
            </div>
            <div className="md:col-span-1">
              <div className="bg-slate-800 p-4 rounded flex flex-col items-center gap-3">
                {imageUrl ? (
                  <img src={imageUrl} alt="Detected" className="max-w-full rounded" />
                ) : (
                  <div className="text-slate-500 text-sm">No detected image</div>
                )}
                {imageUrl && (
                  <Button size="sm" onClick={() => window.open(imageUrl, '_blank')} className="bg-slate-700 text-white">
                    <ImageIcon className="w-4 h-4 mr-2" /> Open Image
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChallanDetail;
