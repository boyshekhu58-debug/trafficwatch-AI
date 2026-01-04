import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Home,
  Settings,
  Bell,
  Video,
  Image as ImageIcon,
  AlertTriangle,
  FileText,
  Camera,
  BarChart3,
  Gauge
} from 'lucide-react';
import { cn } from '@/lib/utils';

const Sidebar = () => {
  const location = useLocation();

  const menuItems = [
    { icon: Home, label: 'Home', path: '/dashboard' },
    { icon: Video, label: 'Videos', path: '/dashboard/videos' },
    { icon: ImageIcon, label: 'Photos', path: '/dashboard/photos' },
    { icon: AlertTriangle, label: 'Violations', path: '/dashboard/violations' },
    { icon: FileText, label: 'E-Challan', path: '/dashboard/echallan' },
    { icon: Camera, label: 'Live Detection', path: '/dashboard/live' },
    { icon: BarChart3, label: 'Analytics', path: '/dashboard/analytics' },
    { icon: Gauge, label: 'Calibration', path: '/dashboard/calibration' }
  ];

  const bottomItems = [
    { icon: Settings, label: 'Settings', path: '/dashboard/settings' },
    { icon: Bell, label: 'Notifications', path: '/dashboard/notifications' }
  ];

  return (
    <>
      {/* Desktop/Tablet Sidebar */}
      <div className="hidden sm:flex w-16 bg-slate-800 dark:bg-slate-900 border-r border-slate-700 dark:border-slate-800 flex-col items-center py-4 h-screen fixed left-0 top-0 z-40">
        <div className="flex flex-col items-center space-y-6 flex-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "w-12 h-12 flex items-center justify-center rounded-lg transition-colors group relative",
                  isActive
                    ? "bg-blue-600 text-white"
                    : "text-slate-400 hover:bg-slate-700 hover:text-white"
                )}
                title={item.label}
              >
                <Icon className="w-5 h-5" />
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-blue-600 rounded-r-full" />
                )}
              </Link>
            );
          })}
        </div>
        
        <div className="flex flex-col items-center space-y-4 pt-4 border-t border-slate-700">
          {bottomItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "w-12 h-12 flex items-center justify-center rounded-lg transition-colors group relative",
                  isActive
                    ? "bg-blue-600 text-white"
                    : "text-slate-400 hover:bg-slate-700 hover:text-white"
                )}
                title={item.label}
              >
                <Icon className="w-5 h-5" />
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-blue-600 rounded-r-full" />
                )}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Mobile Bottom Nav */}
      <div className="sm:hidden fixed bottom-4 left-1/2 -translate-x-1/2 bg-slate-800/95 rounded-full p-2 z-50 flex gap-2 border border-slate-700">
        {bottomItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "w-12 h-12 flex items-center justify-center rounded-lg transition-colors",
                isActive ? "bg-blue-600 text-white" : "text-slate-400 hover:bg-slate-700 hover:text-white"
              )}
              title={item.label}
            >
              <Icon className="w-5 h-5" />
            </Link>
          );
        })}
      </div>
    </>
  );
};

export default Sidebar;

