import React from 'react';
import { Card } from '@/components/ui/card';
import { Video, AlertTriangle, Gauge, Navigation, Image as ImageIcon } from 'lucide-react';

const StatsPanel = ({ stats }) => {
  const statCards = [
    {
      title: 'Total Videos',
      value: stats.total_videos,
      icon: Video,
      color: 'blue',
      testId: 'stat-total-videos'
    },
    {
      title: 'Total Photos',
      value: stats.total_photos || 0,
      icon: ImageIcon,
      color: 'green',
      testId: 'stat-total-photos'
    },
    {
      title: 'Total Violations',
      value: stats.total_violations,
      icon: AlertTriangle,
      color: 'red',
      testId: 'stat-total-violations'
    },
    {
      title: 'No Helmet',
      value: stats.violations_by_type?.no_helmet || 0,
      icon: AlertTriangle,
      color: 'orange',
      testId: 'stat-no-helmet'
    },
    {
      title: 'Overspeeding',
      value: stats.violations_by_type?.overspeeding || 0,
      icon: Gauge,
      color: 'yellow',
      testId: 'stat-overspeeding'
    }
  ];

  const getColorClasses = (color) => {
    const colors = {
      blue: 'bg-blue-50 text-blue-500',
      green: 'bg-emerald-50 text-emerald-500',
      red: 'bg-rose-50 text-rose-500',
      orange: 'bg-amber-50 text-amber-500',
      yellow: 'bg-yellow-50 text-yellow-500'
    };
    return colors[color] || colors.blue;
  };

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-6">
      {statCards.map((stat) => {
        const Icon = stat.icon;
        const isViolationsCard = stat.title === 'Total Violations';
        return (
          <Card
            key={stat.title}
            data-testid={stat.testId}
            className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wide">
                  {stat.title}
                </p>
                <p className="text-3xl font-semibold text-slate-900 dark:text-white mt-2">
                  {stat.value}
                </p>
                {isViolationsCard && (stats.total_challans || 0) > 0 && (
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    {stats.total_challans || 0} e-challan{(stats.total_challans || 0) !== 1 ? 's' : ''} generated
                  </p>
                )}
              </div>
              <div className={`rounded-xl p-3 ${getColorClasses(stat.color)}`}>
                <Icon className="w-6 h-6" />
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
};

export default StatsPanel;
